create table if not exists public.organization_systems (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

alter table public.organization_systems enable row level security;

create index if not exists organization_systems_organization_idx
  on public.organization_systems (organization_id);

grant select, insert, update, delete on public.organization_systems to authenticated;

drop policy if exists "Organization read systems" on public.organization_systems;
create policy "Organization read systems" on public.organization_systems
for select to authenticated
using (
  public.is_maestro(auth.uid())
  or organization_id = public.current_user_organization_id()
  or exists (
    select 1
    from public.user_organization_access access
    where access.user_id = auth.uid()
      and access.organization_id = organization_systems.organization_id
  )
);

drop policy if exists "Organization editors maintain systems" on public.organization_systems;
create policy "Organization editors maintain systems" on public.organization_systems
for all to authenticated
using (
  public.is_maestro(auth.uid())
  or (
    organization_id = public.current_user_organization_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'))
  )
)
with check (
  public.is_maestro(auth.uid())
  or (
    organization_id = public.current_user_organization_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'))
  )
);
