create table if not exists public.system_release_notes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 3 and 160),
  description text not null check (char_length(trim(description)) between 3 and 500),
  category text not null default 'Melhoria' check (char_length(trim(category)) between 2 and 40),
  published boolean not null default true,
  published_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists system_release_notes_published_at_idx
  on public.system_release_notes (published, published_at desc);

alter table public.system_release_notes enable row level security;

drop policy if exists "Authenticated users read published release notes" on public.system_release_notes;
create policy "Authenticated users read published release notes"
  on public.system_release_notes
  for select
  to authenticated
  using (published = true);

drop policy if exists "Admins manage release notes" on public.system_release_notes;
create policy "Admins manage release notes"
  on public.system_release_notes
  for all
  to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

grant select on public.system_release_notes to authenticated;
grant all on public.system_release_notes to service_role;

insert into public.system_release_notes (title, description, category, published_at)
values
  (
    'Editor de fluxogramas aprimorado',
    'Conectores, seleção múltipla e movimentação de elementos receberam melhorias de interação.',
    'Fluxogramas',
    '2026-07-15T16:00:00-04:00'
  ),
  (
    'Visualização de mapeamentos atualizada',
    'A apresentação passou a oferecer melhor navegação das etapas e ampliação das imagens.',
    'Mapeamentos',
    '2026-07-15T15:30:00-04:00'
  ),
  (
    'Central de atualizações adicionada',
    'As melhorias publicadas no BF Flow agora ficam disponíveis pelo sino do cabeçalho.',
    'Sistema',
    '2026-07-15T16:15:00-04:00'
  );
