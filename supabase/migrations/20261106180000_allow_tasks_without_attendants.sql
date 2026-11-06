begin;

-- New requests stay unclaimed so they can enter the configured attendant pool
-- later, even when no pool exists at creation time.
create or replace function public.require_task_flow_pool()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.claimed_by := null;
  new.claimed_at := null;
  return new;
end;
$$;

notify pgrst, 'reload schema';

commit;
