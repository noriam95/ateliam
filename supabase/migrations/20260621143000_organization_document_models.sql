create table if not exists public.organization_document_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_key text not null check (model_key in ('ddp-word', 'ddp-html', 'pop-word')),
  name text not null,
  description text,
  logo_data_url text,
  primary_color text not null default '1D1F23',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, model_key),
  check (primary_color ~ '^[0-9A-Fa-f]{6}$'),
  check (logo_data_url is null or logo_data_url like 'data:image/%')
);

alter table public.organization_document_models enable row level security;

create index if not exists organization_document_models_organization_idx
  on public.organization_document_models (organization_id, model_key);
