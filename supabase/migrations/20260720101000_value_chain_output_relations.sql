create table if not exists public.organization_value_chain_output_relations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  output_id uuid not null references public.organization_value_chains(id) on delete cascade,
  chain_id uuid not null references public.organization_value_chains(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (output_id, chain_id),
  constraint organization_value_chain_output_relations_distinct check (output_id <> chain_id)
);

create index if not exists organization_value_chain_output_relations_organization_idx
  on public.organization_value_chain_output_relations (organization_id);

create index if not exists organization_value_chain_output_relations_chain_idx
  on public.organization_value_chain_output_relations (chain_id);

alter table public.organization_value_chain_output_relations enable row level security;

grant select, insert, update, delete
  on public.organization_value_chain_output_relations
  to authenticated;

drop policy if exists "Organization read value chain output relations"
  on public.organization_value_chain_output_relations;
create policy "Organization read value chain output relations"
  on public.organization_value_chain_output_relations
  for select to authenticated
  using (
    public.is_maestro(auth.uid())
    or organization_id = public.current_user_organization_id()
  );

drop policy if exists "Organization editors maintain value chain output relations"
  on public.organization_value_chain_output_relations;
create policy "Organization editors maintain value chain output relations"
  on public.organization_value_chain_output_relations
  for all to authenticated
  using (
    public.is_maestro(auth.uid())
    or (
      organization_id = public.current_user_organization_id()
      and (
        public.has_role(auth.uid(), 'admin')
        or public.has_role(auth.uid(), 'editor')
      )
    )
  )
  with check (
    public.is_maestro(auth.uid())
    or (
      organization_id = public.current_user_organization_id()
      and (
        public.has_role(auth.uid(), 'admin')
        or public.has_role(auth.uid(), 'editor')
      )
    )
  );

notify pgrst, 'reload schema';
