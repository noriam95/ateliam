-- Mantém os nomes do cadastro de Sistemas/Documentos em maiúsculas.
create or replace function public.normalize_system_document_name_uppercase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := upper(trim(new.name));
  return new;
end;
$$;

drop trigger if exists organization_systems_normalize_name on public.organization_systems;
create trigger organization_systems_normalize_name
before insert or update of name on public.organization_systems
for each row execute function public.normalize_system_document_name_uppercase();

update public.organization_systems
set name = upper(trim(name))
where name is distinct from upper(trim(name));

notify pgrst, 'reload schema';
