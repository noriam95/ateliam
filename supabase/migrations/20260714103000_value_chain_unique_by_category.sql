alter table public.organization_value_chains
  drop constraint if exists organization_value_chains_organization_id_name_key;

alter table public.organization_value_chains
  add constraint organization_value_chains_organization_id_category_name_key
  unique (organization_id, category, name);
