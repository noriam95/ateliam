alter table public.organization_value_chains
  add column if not exists category text not null default 'primary';

alter table public.organization_value_chains
  drop constraint if exists organization_value_chains_category_check;

alter table public.organization_value_chains
  add constraint organization_value_chains_category_check
  check (category in ('primary', 'support', 'management'));

update public.organization_value_chains
set category = 'management'
where lower(name) like '%gest%'
  and category = 'primary';
