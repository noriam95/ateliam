create table if not exists public.organization_positions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_positions_title_check check (length(trim(title)) >= 2),
  constraint organization_positions_unique_title unique (organization_id, title)
);

create index if not exists organization_positions_organization_id_idx
on public.organization_positions(organization_id);

grant select, insert, update, delete on public.organization_positions to authenticated;
grant all on public.organization_positions to service_role;

alter table public.organization_positions enable row level security;

drop policy if exists "Organization read positions" on public.organization_positions;
create policy "Organization read positions" on public.organization_positions
for select to authenticated
using (public.user_has_org_access(organization_id));

drop policy if exists "Organization editors maintain positions" on public.organization_positions;
create policy "Organization editors maintain positions" on public.organization_positions
for all to authenticated
using (public.user_has_org_role(organization_id, array['admin', 'editor']))
with check (public.user_has_org_role(organization_id, array['admin', 'editor']));

drop trigger if exists organization_positions_updated_at on public.organization_positions;
create trigger organization_positions_updated_at
before update on public.organization_positions
for each row execute function public.update_updated_at_column();
