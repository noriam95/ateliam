create table if not exists public.task_flow_settings (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  task_kind text not null check (task_kind in ('mapping', 'improvement', 'document')),
  default_assignee_id uuid references auth.users(id) on delete set null,
  system_notifications jsonb not null default '{"task_created":true,"stage_changed":true,"assignment":true,"checklist":true,"comment":true}'::jsonb,
  email_notifications jsonb not null default '{"task_created":false,"stage_changed":false,"assignment":false,"checklist":false,"comment":false}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (organization_id, task_kind),
  constraint task_flow_system_notifications_object check (jsonb_typeof(system_notifications) = 'object'),
  constraint task_flow_email_notifications_object check (jsonb_typeof(email_notifications) = 'object')
);

alter table public.task_flow_settings enable row level security;
drop policy if exists "System admins manage task flow settings" on public.task_flow_settings;
create policy "System admins manage task flow settings"
  on public.task_flow_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
revoke all on public.task_flow_settings from anon, public;
grant select, insert, update, delete on public.task_flow_settings to authenticated;
grant all on public.task_flow_settings to service_role;

-- Assignment defaults are applied in the database so all task creation paths agree.
create or replace function public.apply_task_flow_assignee()
returns trigger language plpgsql security definer set search_path = public as $$
declare configured_user uuid;
begin
  select default_assignee_id into configured_user
  from public.task_flow_settings
  where organization_id = new.organization_id and task_kind = new.kind;

  if configured_user is not null then
    if not public.user_tasks_member(configured_user, new.organization_id)
       or not (public.has_role(configured_user, 'editor') or public.has_role(configured_user, 'admin')) then
      raise exception 'O responsável padrão configurado não possui acesso de edição à organização.';
    end if;
    new.assigned_to := configured_user;
    new.documenter_id := configured_user;
  end if;
  return new;
end $$;

drop trigger if exists task_flow_default_assignee on public.user_tasks;
create trigger task_flow_default_assignee
before insert on public.user_tasks
for each row execute function public.apply_task_flow_assignee();

-- Defense in depth: checklist content cannot be edited outside Atender solicitação.
-- Workflow automation may update only the validation item while changing stage.
create or replace function public.guard_task_checklist_stage()
returns trigger language plpgsql set search_path = public as $$
declare old_non_validation jsonb; new_non_validation jsonb;
begin
  if new.checklist is distinct from old.checklist
     and old.stage <> 'documentation'
     and new.stage <> 'documentation' then
    select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) into old_non_validation
    from jsonb_array_elements(coalesce(old.checklist, '[]'::jsonb)) with ordinality as entries(value, ord)
    where value->>'key' <> 'validation';
    select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) into new_non_validation
    from jsonb_array_elements(coalesce(new.checklist, '[]'::jsonb)) with ordinality as entries(value, ord)
    where value->>'key' <> 'validation';
    if old_non_validation is distinct from new_non_validation then
      raise exception 'O checklist só pode ser preenchido na atividade Atender solicitação.';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists task_checklist_stage_guard on public.user_tasks;
create trigger task_checklist_stage_guard
before update of checklist on public.user_tasks
for each row execute function public.guard_task_checklist_stage();
