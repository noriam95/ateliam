begin;

create or replace function public.update_claimed_task_title(
  p_org uuid,
  p_task uuid,
  p_revision integer,
  p_title text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.user_tasks;
  cleaned_title text := trim(coalesce(p_title, ''));
begin
  if not public.user_tasks_access(p_org) then
    raise exception 'Acesso negado à organização.';
  end if;
  if not (public.has_role(auth.uid(), 'editor') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Permissão de edição necessária.';
  end if;
  if length(cleaned_title) not between 2 and 200 then
    raise exception 'O título deve ter entre 2 e 200 caracteres.';
  end if;

  select * into task_row
  from public.user_tasks
  where id = p_task and organization_id = p_org
  for update;

  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if task_row.deleted_at is not null then raise exception 'Tarefa excluída.'; end if;
  if task_row.claimed_by is distinct from auth.uid()
     or task_row.assigned_to is distinct from auth.uid() then
    raise exception 'Assuma o atendimento antes de alterar o título.';
  end if;
  if task_row.status in ('completed', 'cancelled') then
    raise exception 'Tarefa concluída ou cancelada.';
  end if;
  if task_row.revision is distinct from p_revision then
    raise exception 'A tarefa foi alterada. Atualize os detalhes e tente novamente.';
  end if;

  if task_row.title = cleaned_title then
    return jsonb_build_object('id', task_row.id, 'revision', task_row.revision);
  end if;

  update public.user_tasks
  set title = cleaned_title, revision = revision + 1, updated_at = now()
  where id = task_row.id;

  insert into public.user_task_events(task_id, organization_id, actor_id, action, note)
  values (
    task_row.id,
    p_org,
    auth.uid(),
    'Título atualizado',
    'Título alterado: ' || task_row.title || ' → ' || cleaned_title
  );

  return jsonb_build_object('id', task_row.id, 'revision', task_row.revision + 1);
end;
$$;

revoke all on function public.update_claimed_task_title(uuid, uuid, integer, text) from public, anon;
grant execute on function public.update_claimed_task_title(uuid, uuid, integer, text) to authenticated;

create or replace function public.reset_task_claim_on_reassignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.claimed_by is not null
     and new.assigned_to is distinct from old.assigned_to
     and new.claimed_by is not distinct from old.claimed_by then
    new.claimed_by := null;
    new.claimed_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists user_tasks_reset_claim_on_assignment on public.user_tasks;
create trigger user_tasks_reset_claim_on_assignment
before update on public.user_tasks
for each row execute function public.reset_task_claim_on_reassignment();

update public.user_tasks
set claimed_by = null,
    claimed_at = null,
    revision = revision + 1,
    updated_at = now()
where claimed_by is not null
  and claimed_by is distinct from assigned_to
  and status not in ('completed', 'cancelled');

create or replace function public.claim_user_task(p_org uuid, p_task uuid, p_revision integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.user_tasks;
  is_pool_attendant boolean;
begin
  if not public.user_tasks_access(p_org) then
    raise exception 'Acesso negado à organização.';
  end if;
  if not (public.has_role(auth.uid(), 'editor') or public.has_role(auth.uid(), 'admin')) then
    raise exception 'Permissão de edição necessária para assumir esta demanda.';
  end if;

  select * into task_row
  from public.user_tasks
  where id = p_task and organization_id = p_org
  for update;

  if not found then raise exception 'Demanda não encontrada.'; end if;
  if task_row.deleted_at is not null then raise exception 'Esta demanda foi excluída.'; end if;
  if task_row.status in ('cancelled', 'completed') then
    raise exception 'Esta demanda não está disponível para atendimento.';
  end if;
  if task_row.claimed_by is not null then raise exception 'Outro atendente já assumiu esta demanda.'; end if;
  if task_row.stage not in ('intake', 'documentation', 'registration', 'technical_review', 'owner_approval') then
    raise exception 'Esta etapa não está disponível para aceite.';
  end if;
  if task_row.revision is distinct from p_revision then
    raise exception 'A demanda foi alterada. Atualize a lista e tente novamente.';
  end if;

  select exists (
    select 1 from public.task_flow_settings fs
    where fs.organization_id = p_org
      and fs.task_kind = task_row.kind
      and auth.uid() = any(fs.attendant_ids)
  ) into is_pool_attendant;

  if task_row.status = 'paused' and task_row.assigned_to is distinct from auth.uid() then
    raise exception 'Somente o responsável indicado pode retomar esta demanda.';
  end if;
  if task_row.stage in ('intake', 'documentation')
     and task_row.status <> 'paused'
     and not is_pool_attendant then
    raise exception 'Seu usuário não está alocado na pool deste fluxo.';
  end if;
  if (task_row.stage in ('registration', 'technical_review', 'owner_approval')
      or task_row.status = 'paused')
     and task_row.assigned_to is distinct from auth.uid() then
    raise exception 'Somente o responsável indicado pode assumir esta etapa.';
  end if;

  update public.user_tasks
  set claimed_by = auth.uid(),
      claimed_at = now(),
      assigned_to = auth.uid(),
      documenter_id = case when task_row.stage in ('intake', 'documentation') then auth.uid() else documenter_id end,
      status = case when task_row.stage in ('intake', 'documentation') and status = 'pending'
        then 'in_progress' else status end,
      revision = revision + 1,
      updated_at = now()
  where id = p_task;

  insert into public.user_task_events(
    task_id, organization_id, actor_id, action, note, movement_action, movement_note
  ) values (
    p_task, p_org, auth.uid(), 'Tarefa assumida',
    'Etapa assumida pelo responsável designado.', 'Assumir atendimento',
    'Etapa assumida pelo responsável designado.'
  );

  return jsonb_build_object('id', p_task, 'revision', p_revision + 1);
end;
$$;

revoke all on function public.claim_user_task(uuid, uuid, integer) from public, anon;
grant execute on function public.claim_user_task(uuid, uuid, integer) to authenticated;

create or replace function public.guard_unclaimed_task_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.claimed_by is null then
    if new.claimed_by is null then
      raise exception 'Assuma o atendimento pela pool antes de movimentar esta demanda.';
    end if;
    if new.claimed_by is distinct from auth.uid() then
      raise exception 'Somente o usuário autenticado pode assumir esta demanda.';
    end if;
    if new.stage in ('intake', 'documentation') and new.status <> 'paused' then
      if not exists (
        select 1 from public.task_flow_settings fs
        where fs.organization_id = old.organization_id
          and fs.task_kind = old.kind
          and auth.uid() = any(fs.attendant_ids)
      ) then
        raise exception 'Somente um atendente da pool pode assumir esta demanda.';
      end if;
    elsif new.stage in ('intake', 'documentation', 'registration', 'technical_review', 'owner_approval') then
      if new.assigned_to is distinct from auth.uid() then
        raise exception 'Somente o responsável indicado pode assumir esta etapa.';
      end if;
    else
      raise exception 'Esta etapa não pode ser assumida.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.guard_claimed_task_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.user_tasks;
begin
  if new.action <> 'Comentário' then return new; end if;
  if new.actor_id is distinct from auth.uid() then
    raise exception 'O autor do comentário deve corresponder ao usuário autenticado.';
  end if;

  select * into task_row
  from public.user_tasks
  where id = new.task_id and organization_id = new.organization_id;

  if not found then raise exception 'Tarefa não encontrada.'; end if;
  if task_row.claimed_by = auth.uid() and task_row.assigned_to = auth.uid() then return new; end if;
  -- The requester can still answer a request for more information.
  if task_row.stage = 'registration' and task_row.requested_by = auth.uid() then return new; end if;
  -- Preserve the initial note and the first attachment note entered at creation.
  if task_row.created_by = auth.uid()
     and task_row.claimed_by is null
     and (
       task_row.created_at >= now() - interval '15 minutes'
       or (new.note = 'Anexos da solicitação inicial.'
         and jsonb_array_length(coalesce(new.attachments, '[]'::jsonb)) > 0)
     ) then
    return new;
  end if;

  raise exception 'Assuma o atendimento antes de comentar nesta tarefa.';
end;
$$;

drop trigger if exists user_task_events_require_claimed_comment on public.user_task_events;
create trigger user_task_events_require_claimed_comment
before insert on public.user_task_events
for each row execute function public.guard_claimed_task_event();

create or replace function public.guard_claimed_task_meeting()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  task_row public.user_tasks;
begin
  if tg_op = 'UPDATE' and old.task_id is not null then
    select * into task_row from public.user_tasks where id = old.task_id;
    if not found or task_row.claimed_by is distinct from auth.uid() then
      raise exception 'Assuma o atendimento para alterar uma reunião vinculada à tarefa.';
    end if;
  end if;

  if new.task_id is not null then
    select * into task_row from public.user_tasks where id = new.task_id;
    if not found or task_row.claimed_by is distinct from auth.uid()
       or task_row.assigned_to is distinct from auth.uid() then
      raise exception 'Assuma o atendimento antes de criar ou vincular uma reunião.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists task_meetings_require_claimed_task on public.task_meetings;
create trigger task_meetings_require_claimed_task
before insert or update on public.task_meetings
for each row execute function public.guard_claimed_task_meeting();

notify pgrst, 'reload schema';
commit;
