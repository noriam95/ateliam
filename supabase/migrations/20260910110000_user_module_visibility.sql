begin;
alter table public.profiles add column if not exists visible_modules text[] not null
  default array['tasks','ddp','improvements','pop','bpmn','registrations','value-chain']::text[];
create or replace function public.protect_module_visibility() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.visible_modules is distinct from old.visible_modules
    and current_user not in ('postgres','service_role')
    and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Somente administradores podem alterar os módulos visíveis.';
  end if;
  if not (new.visible_modules <@ array['tasks','ddp','improvements','pop','bpmn','registrations','value-chain']::text[]) then
    raise exception 'Módulo inválido.';
  end if;
  return new;
end;
$$;
drop trigger if exists protect_module_visibility on public.profiles;
create trigger protect_module_visibility before update on public.profiles
for each row execute function public.protect_module_visibility();
commit;
