alter table public.organization_process_owners
  add column if not exists department_ids uuid[] not null default '{}';

update public.organization_process_owners
set department_ids = array[department_id]
where department_id is not null
  and (department_ids is null or cardinality(department_ids) = 0);

