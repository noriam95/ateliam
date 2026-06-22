create table if not exists public.organization_units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  code text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.user_organization_access (
  user_id uuid not null references auth.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  unit_id uuid references public.organization_units(id) on delete set null,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, organization_id)
);

create table if not exists public.organization_value_chains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  description text,
  status text not null default 'Ativa' check (status in ('Ativa', 'Inativa')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create table if not exists public.organization_process_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null check (code in ('macroprocess', 'process', 'subprocess')),
  label text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

alter table public.organization_process_owners
  add column if not exists department_id uuid references public.organization_departments(id) on delete set null,
  add column if not exists role_title text;

alter table public.organization_processes
  add column if not exists value_chain_id uuid references public.organization_value_chains(id) on delete set null;

insert into public.organization_units (organization_id, name, code)
select id, 'Matriz', 'MATRIZ'
from public.organizations
on conflict (organization_id, name) do nothing;

insert into public.user_organization_access (user_id, organization_id, unit_id, is_default)
select p.id, p.organization_id, u.id, true
from public.profiles p
left join public.organization_units u
  on u.organization_id = p.organization_id and u.name = 'Matriz'
where p.organization_id is not null
on conflict (user_id, organization_id) do nothing;

insert into public.organization_process_types (organization_id, code, label)
select organization_id, code, label
from (
  select id as organization_id from public.organizations
) organizations
cross join (
  values
    ('macroprocess', 'Macroprocesso'),
    ('process', 'Processo'),
    ('subprocess', 'Subprocesso')
) defaults(code, label)
on conflict (organization_id, code) do nothing;

alter table public.organization_units enable row level security;
alter table public.user_organization_access enable row level security;
alter table public.organization_value_chains enable row level security;
alter table public.organization_process_types enable row level security;

create index if not exists organization_units_organization_idx
  on public.organization_units (organization_id);
create index if not exists user_organization_access_user_idx
  on public.user_organization_access (user_id, is_default desc);
create index if not exists organization_value_chains_organization_idx
  on public.organization_value_chains (organization_id);
create index if not exists organization_processes_value_chain_idx
  on public.organization_processes (value_chain_id);
