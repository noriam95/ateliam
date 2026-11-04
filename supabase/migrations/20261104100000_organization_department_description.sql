alter table public.organization_departments
  add column if not exists description text;

comment on column public.organization_departments.description is
  'Descrição do escopo e das responsabilidades da área.';
