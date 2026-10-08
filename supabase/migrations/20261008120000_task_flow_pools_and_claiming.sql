begin;

alter table public.task_flow_settings
  add column if not exists attendant_ids uuid[] not null default '{}';

-- Preserve existing single-attendant settings as one-person pools.
update public.task_flow_settings
set attendant_ids = array[default_assignee_id]
where default_assignee_id is not null and cardinality(attendant_ids) = 0;
update public.task_flow_settings set default_assignee_id = null where default_assignee_id is not null;

alter table public.user_tasks
  add column if not exists claimed_by uuid references auth.users(id) on delete set null,
  add column if not exists claimed_at timestamptz;

-- Existing work stays with its current owner. New requests remain unclaimed.
update public.user_tasks
set claimed_by = assigned_to,
    claimed_at = coalesce(claimed_at, created_at, now())
where claimed_by is null
  and created_at < timestamptz '2026-10-09 00:00:00+00';
-- The fixed cutoff keeps a manual retry from marking newly opened pool requests as claimed.

-- The old trigger forced every new task onto one configured person.
drop trigger if exists task_flow_default_assignee on public.user_tasks;

create or replace function public.require_task_flow_pool()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.task_flow_settings fs
    where fs.organization_id = new.organization_id and fs.task_kind = new.kind
      and cardinality(fs.attendant_ids) > 0
  ) then
    raise exception 'Configure pelo menos um atendente na pool deste fluxo antes de abrir novas solicitações.';
  end if;
  new.claimed_by := null;
  new.claimed_at := null;
  return new;
end;
$$;

drop trigger if exists user_tasks_require_flow_pool on public.user_tasks;
create trigger user_tasks_require_flow_pool
before insert on public.user_tasks
for each row execute function public.require_task_flow_pool();

create or replace function public.guard_unclaimed_task_updates()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.claimed_by is null then
    if new.claimed_by is null then
      raise exception 'Assuma o atendimento pela pool antes de movimentar esta demanda.';
    end if;
    if new.claimed_by <> auth.uid() or not exists (
      select 1 from public.task_flow_settings fs
      where fs.organization_id = old.organization_id and fs.task_kind = old.kind
        and auth.uid() = any(fs.attendant_ids)
    ) then
      raise exception 'Somente um atendente da pool pode assumir esta demanda.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists user_tasks_require_claim on public.user_tasks;
create trigger user_tasks_require_claim
before update on public.user_tasks
for each row execute function public.guard_unclaimed_task_updates();

create or replace function public.claim_user_task(p_org uuid, p_task uuid, p_revision integer)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare t public.user_tasks;
begin
  if not public.user_tasks_access(p_org) then
    raise exception 'Acesso negado à organização.';
  end if;
  if not (public.has_role(auth.uid(), 'editor') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Permissão de edição necessária para assumir esta demanda.';
  end if;

  select * into t
  from public.user_tasks
  where id = p_task and organization_id = p_org
  for update;

  if not found then raise exception 'Demanda não encontrada.'; end if;
  if t.deleted_at is not null then raise exception 'Esta demanda foi excluída.'; end if;
  if t.status in ('completed', 'cancelled', 'paused') then
    raise exception 'Esta demanda não está disponível para atendimento.';
  end if;
  if t.claimed_by is not null then raise exception 'Outro atendente já assumiu esta demanda.'; end if;
  if t.stage not in ('intake', 'documentation') then
    raise exception 'Esta etapa não está disponível na pool de atendimento.';
  end if;
  if t.revision is distinct from p_revision then
    raise exception 'A demanda foi alterada. Atualize a lista e tente novamente.';
  end if;
  if not exists (
    select 1 from public.task_flow_settings fs
    where fs.organization_id = p_org
      and fs.task_kind = t.kind
      and auth.uid() = any(fs.attendant_ids)
  ) then
    raise exception 'Seu usuário não está alocado na pool deste fluxo.';
  end if;

  update public.user_tasks
  set claimed_by = auth.uid(),
      claimed_at = now(),
      assigned_to = auth.uid(),
      documenter_id = auth.uid(),
      status = case when status = 'pending' then 'in_progress' else status end,
      revision = revision + 1,
      updated_at = now()
  where id = p_task;

  insert into public.user_task_events(
    task_id, organization_id, actor_id, action, note, movement_action, movement_note
  ) values (
    p_task, p_org, auth.uid(), 'Tarefa assumida',
    'Demanda retirada da pool de atendimento.', 'Assumir atendimento',
    'Demanda retirada da pool de atendimento.'
  );

  return jsonb_build_object('id', p_task, 'revision', p_revision + 1);
end;
$$;

revoke all on function public.claim_user_task(uuid, uuid, integer) from public, anon;
grant execute on function public.claim_user_task(uuid, uuid, integer) to authenticated;

create or replace function public.user_tasks_feed(p_org uuid, p_filters jsonb default '{}')
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb; isadmin boolean := public.has_role(auth.uid(), 'admin');
begin
  if not public.user_tasks_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
  with filtered as (
    select t.*, t.task_code code,
      (select name from public.organization_departments where id = t.area_id) area_name,
      d.module document_module,
      case when t.claimed_by is null then null else a.avatar_data_url end assignee_photo,
      case when t.claimed_by is null then 'Aguardando atendente'
        else coalesce(nullif(a.display_name, ''), a.username, 'Usuário') end assignee_name,
      coalesce(nullif(r.display_name, ''), r.username, 'Usuário') requester_name
    from public.user_tasks t
    left join public.documents d on d.id = t.document_id
    join public.profiles a on a.id = t.assigned_to
    join public.profiles r on r.id = t.requested_by
    where t.organization_id = p_org
      and (t.deleted_at is null and coalesce(p_filters->>'status', '') <> 'deleted'
        or isadmin and t.deleted_at is not null
          and (p_filters->>'status' = 'deleted' or nullif(p_filters->>'id', '') is not null))
      and (
        t.assigned_to = auth.uid()
        or (t.claimed_by is null and t.status not in ('paused', 'cancelled', 'completed')
          and t.stage in ('intake', 'documentation') and exists (
          select 1 from public.task_flow_settings fs
          where fs.organization_id = t.organization_id and fs.task_kind = t.kind
            and auth.uid() = any(fs.attendant_ids)
        ))
        or (isadmin and coalesce((p_filters->>'team')::boolean, false))
        or (p_filters->>'id' is not null and (
          t.requested_by = auth.uid() or t.created_by = auth.uid()
          or t.documenter_id = auth.uid() or t.reviewer_id = auth.uid() or isadmin
          or (t.claimed_by is null and exists (
            select 1 from public.task_flow_settings fs
            where fs.organization_id = t.organization_id and fs.task_kind = t.kind
              and auth.uid() = any(fs.attendant_ids)
          ))
        ))
      )
      and (nullif(p_filters->>'id', '') is null or t.id = (p_filters->>'id')::uuid)
      and (nullif(p_filters->>'stage', '') is null or t.stage = p_filters->>'stage')
      and (nullif(p_filters->>'dueBefore', '') is null or t.due_on < (p_filters->>'dueBefore')::date)
      and (nullif(p_filters->>'dueFrom', '') is null or t.due_on >= (p_filters->>'dueFrom')::date)
      and (nullif(p_filters->>'dueThrough', '') is null or t.due_on <= (p_filters->>'dueThrough')::date)
      and (p_filters->>'status' = 'deleted' or nullif(p_filters->>'status', '') is null
        or t.status = p_filters->>'status'
        or (p_filters->>'status' = 'open' and t.status not in ('completed', 'cancelled')))
      and (nullif(p_filters->>'kind', '') is null or t.kind = p_filters->>'kind')
      and (nullif(p_filters->>'modality', '') is null or t.modality = p_filters->>'modality')
      and (nullif(p_filters->>'from', '') is null or t.due_on >= (p_filters->>'from')::date)
      and (nullif(p_filters->>'until', '') is null or t.starts_on <= (p_filters->>'until')::date)
      and (nullif(p_filters->>'q', '') is null or concat_ws(' ', t.title, t.task_code, a.display_name, r.display_name) ilike '%' || (p_filters->>'q') || '%')
  ), page as (
    select * from filtered order by due_on, id limit 60 offset greatest(0, coalesce((p_filters->>'offset')::integer, 0))
  )
  select jsonb_build_object(
    'total', (select count(*) from filtered),
    'tasks', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object(
      'checklist', (select coalesce(jsonb_agg(x || case when d.id is null then '{}'::jsonb else
        jsonb_build_object('document_name', d.name, 'document_code', public.user_tasks_doc_code(d.content_inline, d.module)) end), '[]')
        from jsonb_array_elements(public.user_tasks_effective(p.checklist)) x
        left join public.documents d on d.id = nullif(x->>'document_id', '')::uuid)
    ) order by due_on, id) from page p), '[]')
  ) into result;

  return result || jsonb_build_object(
    'userId', auth.uid(), 'isAdmin', isadmin,
    'canCreate', isadmin or public.has_role(auth.uid(), 'editor'),
    'claimableKinds', coalesce((select jsonb_agg(fs.task_kind) from public.task_flow_settings fs
      where fs.organization_id = p_org and auth.uid() = any(fs.attendant_ids)), '[]'::jsonb),
    'configuredKinds', coalesce((select jsonb_agg(fs.task_kind) from public.task_flow_settings fs
      where fs.organization_id = p_org and cardinality(fs.attendant_ids) > 0), '[]'::jsonb),
    'summary', (select jsonb_build_object('mapping', count(*) filter(where kind = 'mapping'),
      'improvement', count(*) filter(where kind = 'improvement'), 'document', count(*) filter(where kind = 'document'),
      'overdue', count(*) filter(where due_on < current_date)) from public.user_tasks
      where deleted_at is null and organization_id = p_org and assigned_to = auth.uid()
        and status not in ('completed', 'cancelled') and claimed_by is not null),
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.id,
      'name', coalesce(nullif(p.display_name, ''), p.username, 'Usuário'),
      'can_edit', public.has_role(p.id, 'editor') or public.has_role(p.id, 'admin'),
      'is_member', public.user_tasks_member(p.id, p_org)) order by p.display_name)
      from public.profiles p where public.user_tasks_member(p.id, p_org) or (p.id = auth.uid() and isadmin)), '[]'),
    'documents', coalesce((select jsonb_agg(to_jsonb(d)) from (
      select id, name, module, current_version, public.user_tasks_doc_code(content_inline, module) code
      from public.documents where organization_id = p_org
        and (nullif(p_filters->>'documentModule', '') is null or module = p_filters->>'documentModule')
        and (p_filters ? 'documentQuery')
        and concat_ws(' ', name, public.user_tasks_doc_code(content_inline, module)) ilike '%' || coalesce(p_filters->>'documentQuery', '') || '%'
      order by updated_at desc limit 40
    ) d), '[]'),
    'events', coalesce((select jsonb_agg(to_jsonb(e)) from (
      select ev.id, ev.action, ev.note, ev.movement_action, ev.movement_note, ev.attachments,
        ev.created_at, p.avatar_data_url actor_photo,
        coalesce(nullif(p.display_name, ''), p.username, 'Usuário') actor_name
      from public.user_task_events ev join public.profiles p on p.id = ev.actor_id
      where ev.task_id = nullif(p_filters->>'id', '')::uuid and ev.organization_id = p_org
        and exists(select 1 from public.user_tasks t where t.id = ev.task_id and (
          isadmin or t.assigned_to = auth.uid() or t.requested_by = auth.uid() or t.created_by = auth.uid()
          or t.documenter_id = auth.uid() or t.reviewer_id = auth.uid()
          or (t.claimed_by is null and exists(select 1 from public.task_flow_settings fs
            where fs.organization_id = t.organization_id and fs.task_kind = t.kind
              and auth.uid() = any(fs.attendant_ids)))
        ))
      order by ev.created_at desc limit 100
    ) e), '[]')
  );
end;
$$;

commit;
