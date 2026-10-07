create table if not exists public.task_reminder_settings (
  id smallint primary key default 1 check (id = 1),
  enabled boolean not null default false,
  reminder_days integer[] not null default array[3, 1],
  send_time time without time zone not null default time '08:00',
  timezone text not null default 'America/Cuiaba',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint task_reminder_days_count check (cardinality(reminder_days) between 1 and 5)
);

insert into public.task_reminder_settings (id)
values (1)
on conflict (id) do nothing;

alter table public.task_reminder_settings enable row level security;

drop policy if exists "System admins read task reminder settings" on public.task_reminder_settings;
create policy "System admins read task reminder settings"
  on public.task_reminder_settings
  for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "System admins update task reminder settings" on public.task_reminder_settings;
create policy "System admins update task reminder settings"
  on public.task_reminder_settings
  for update
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

revoke all on public.task_reminder_settings from anon, public;
grant select, update on public.task_reminder_settings to authenticated;
grant all on public.task_reminder_settings to service_role;
