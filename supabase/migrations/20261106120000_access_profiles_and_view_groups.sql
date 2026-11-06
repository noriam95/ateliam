begin;

-- New accounts receive the least-privileged profile. Existing roles are untouched.
alter table public.profiles alter column visible_modules set default '{}'::text[];

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  default_org uuid;
begin
  select id into default_org from public.organizations order by created_at asc limit 1;

  insert into public.profiles (id, email, display_name, organization_id, visible_modules)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    default_org,
    '{}'::text[]
  );

  insert into public.user_roles (user_id, role) values (new.id, 'viewer');

  return new;
end;
$$;

create table if not exists public.organization_view_groups (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  description text,
  external_group_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, external_group_id)
);

create table if not exists public.organization_view_group_users (
  group_id uuid not null references public.organization_view_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.organization_view_group_areas (
  group_id uuid not null references public.organization_view_groups(id) on delete cascade,
  area_id uuid not null references public.organization_departments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (group_id, area_id)
);

create table if not exists public.document_view_group_access (
  document_id uuid not null references public.documents(id) on delete cascade,
  group_id uuid not null references public.organization_view_groups(id) on delete cascade,
  effect text not null default 'allow' check (effect in ('allow', 'deny')),
  created_at timestamptz not null default now(),
  primary key (document_id, group_id)
);

-- Process area references are UUID-backed in the application. Keep the legacy
-- text label for compatibility and backfill the normalized references.
alter table public.organization_processes
  add column if not exists department_id uuid
    references public.organization_departments(id) on delete set null,
  add column if not exists department_ids uuid[] not null default '{}';

update public.organization_processes p
set department_id = coalesce(p.department_id, a.id),
    department_ids = case
      when cardinality(p.department_ids) = 0 then array[a.id]
      else p.department_ids
    end
from public.organization_departments a
where p.organization_id = a.organization_id
  and lower(btrim(p.department)) in (lower(btrim(a.name)), lower(btrim(a.sigla)))
  and (p.department_id is null or cardinality(p.department_ids) = 0);

create index if not exists organization_view_groups_organization_idx
  on public.organization_view_groups (organization_id, name);
create index if not exists organization_view_group_users_user_idx
  on public.organization_view_group_users (user_id, group_id);
create index if not exists organization_view_group_areas_area_idx
  on public.organization_view_group_areas (area_id, group_id);
create index if not exists document_view_group_access_group_idx
  on public.document_view_group_access (group_id, document_id);

alter table public.organization_view_groups enable row level security;
alter table public.organization_view_group_users enable row level security;
alter table public.organization_view_group_areas enable row level security;
alter table public.document_view_group_access enable row level security;

drop policy if exists "Organization members can read view groups" on public.organization_view_groups;
create policy "Organization members can read view groups"
  on public.organization_view_groups for select to authenticated
  using (organization_id = public.current_user_organization_id());
drop policy if exists "Organization admins manage view groups" on public.organization_view_groups;
create policy "Organization admins manage view groups"
  on public.organization_view_groups for all to authenticated
  using (organization_id = public.current_user_organization_id() and public.has_role(auth.uid(), 'admin'))
  with check (organization_id = public.current_user_organization_id() and public.has_role(auth.uid(), 'admin'));

drop policy if exists "Users can read own view group memberships" on public.organization_view_group_users;
create policy "Users can read own view group memberships"
  on public.organization_view_group_users for select to authenticated
  using (user_id = auth.uid());
drop policy if exists "Organization admins manage view group memberships" on public.organization_view_group_users;
create policy "Organization admins manage view group memberships"
  on public.organization_view_group_users for all to authenticated
  using (exists (
    select 1 from public.organization_view_groups g
    where g.id = group_id and g.organization_id = public.current_user_organization_id()
      and public.has_role(auth.uid(), 'admin')
  ))
  with check (exists (
    select 1 from public.organization_view_groups g
    join public.profiles p on p.id = user_id
    where g.id = group_id and g.organization_id = public.current_user_organization_id()
      and public.has_role(auth.uid(), 'admin')
      and (p.organization_id = g.organization_id or exists (
        select 1 from public.user_organization_access oa
        where oa.user_id = p.id and oa.organization_id = g.organization_id
      ))
  ));

drop policy if exists "Organization members can read view group areas" on public.organization_view_group_areas;
create policy "Organization members can read view group areas"
  on public.organization_view_group_areas for select to authenticated
  using (exists (
    select 1 from public.organization_view_groups g
    where g.id = group_id and g.organization_id = public.current_user_organization_id()
  ));
drop policy if exists "Organization admins manage view group areas" on public.organization_view_group_areas;
create policy "Organization admins manage view group areas"
  on public.organization_view_group_areas for all to authenticated
  using (exists (
    select 1 from public.organization_view_groups g
    where g.id = group_id and g.organization_id = public.current_user_organization_id()
      and public.has_role(auth.uid(), 'admin')
  ))
  with check (exists (
    select 1 from public.organization_view_groups g
    join public.organization_departments a on a.id = area_id and a.organization_id = g.organization_id
    where g.id = group_id and g.organization_id = public.current_user_organization_id()
      and public.has_role(auth.uid(), 'admin')
  ));

drop policy if exists "Organization members can read document view groups" on public.document_view_group_access;
create policy "Organization members can read document view groups"
  on public.document_view_group_access for select to authenticated
  using (exists (
    select 1 from public.organization_view_groups g
    where g.id = group_id and g.organization_id = public.current_user_organization_id()
  ));
drop policy if exists "Organization admins manage document view groups" on public.document_view_group_access;
create policy "Organization admins manage document view groups"
  on public.document_view_group_access for all to authenticated
  using (exists (
    select 1 from public.documents d
    join public.organization_view_groups g on g.id = group_id and g.organization_id = d.organization_id
    where d.id = document_id and d.organization_id = public.current_user_organization_id()
      and public.has_role(auth.uid(), 'admin')
  ))
  with check (exists (
    select 1 from public.documents d
    join public.organization_view_groups g on g.id = group_id and g.organization_id = d.organization_id
    where d.id = document_id and d.organization_id = public.current_user_organization_id()
      and public.has_role(auth.uid(), 'admin')
  ));

-- Apply group visibility at the database boundary too, including direct API reads.
drop policy if exists "Organization can read documents" on public.documents;
create policy "Organization can read documents"
  on public.documents for select to authenticated
  using (
    public.is_maestro(auth.uid())
    or (
      organization_id = public.current_user_organization_id()
      and (
        public.has_role(auth.uid(), 'admin')
        or exists (
          select 1
          from public.organization_view_group_users gu
          join public.organization_view_groups g on g.id = gu.group_id
          where gu.user_id = auth.uid()
            and g.organization_id = documents.organization_id
            and (
              exists (
                select 1 from public.document_view_group_access da
                where da.group_id = g.id and da.document_id = documents.id and da.effect = 'allow'
              )
              or (
                exists (
                  select 1
                  from public.organization_view_group_areas ga
                  join public.organization_processes p
                    on p.id = documents.primary_process_id
                    and p.organization_id = documents.organization_id
                    and (p.department_id = ga.area_id or ga.area_id = any(p.department_ids))
                  where ga.group_id = g.id
                )
                and not exists (
                  select 1 from public.document_view_group_access dd
                  where dd.group_id = g.id and dd.document_id = documents.id and dd.effect = 'deny'
                )
              )
            )
        )
      )
    )
  );

grant select on public.organization_view_groups, public.organization_view_group_users,
  public.organization_view_group_areas, public.document_view_group_access to authenticated;
grant all on public.organization_view_groups, public.organization_view_group_users,
  public.organization_view_group_areas, public.document_view_group_access to service_role;

commit;
