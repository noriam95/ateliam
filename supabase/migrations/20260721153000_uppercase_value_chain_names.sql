create or replace function public.normalize_value_chain_name_uppercase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := upper(trim(new.name));
  return new;
end;
$$;

drop trigger if exists organization_value_chains_normalize_name
  on public.organization_value_chains;

create trigger organization_value_chains_normalize_name
before insert or update of name on public.organization_value_chains
for each row
execute function public.normalize_value_chain_name_uppercase();

update public.organization_value_chains
set name = upper(trim(name))
where name is distinct from upper(trim(name));

notify pgrst, 'reload schema';
