-- Mantem o cadastro mestre e todas as referencias exatas a processos em maiusculas.
create or replace function public.normalize_process_name_uppercase()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name := upper(trim(new.name));
  return new;
end;
$$;

create or replace function public.replace_process_name_in_json(
  payload jsonb,
  old_name text,
  new_name text,
  process_code text default null
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  scalar_value text;
begin
  if payload is null then
    return null;
  end if;

  case jsonb_typeof(payload)
    when 'object' then
      return coalesce(
        (
          select jsonb_object_agg(
            entry.key,
            public.replace_process_name_in_json(entry.value, old_name, new_name, process_code)
          )
          from jsonb_each(payload) as entry
        ),
        '{}'::jsonb
      );
    when 'array' then
      return coalesce(
        (
          select jsonb_agg(
            public.replace_process_name_in_json(item.value, old_name, new_name, process_code)
            order by item.ordinality
          )
          from jsonb_array_elements(payload) with ordinality as item(value, ordinality)
        ),
        '[]'::jsonb
      );
    when 'string' then
      scalar_value := payload #>> '{}';
      if trim(scalar_value) = trim(old_name) then
        return to_jsonb(new_name);
      end if;
      if process_code is not null and trim(process_code) <> '' then
        if trim(scalar_value) = trim(process_code) || ' - ' || trim(old_name) then
          return to_jsonb(trim(process_code) || ' - ' || new_name);
        end if;
        if trim(scalar_value) = trim(process_code) || ' · ' || trim(old_name) then
          return to_jsonb(trim(process_code) || ' · ' || new_name);
        end if;
      end if;
      return payload;
    else
      return payload;
  end case;
end;
$$;

create or replace function public.replace_process_name_in_content(
  content text,
  old_name text,
  new_name text,
  process_code text default null
)
returns text
language plpgsql
immutable
set search_path = public
as $$
begin
  if content is null or content = '' then
    return content;
  end if;
  return public.replace_process_name_in_json(
    content::jsonb,
    old_name,
    new_name,
    process_code
  )::text;
exception
  when others then
    return content;
end;
$$;

create or replace function public.sync_process_name_references()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.name is not distinct from new.name then
    return new;
  end if;

  update public.documents
  set content_inline = public.replace_process_name_in_content(
    content_inline,
    old.name,
    new.name,
    new.code
  )
  where organization_id = new.organization_id
    and content_inline is not null
    and position(old.name in content_inline) > 0;

  update public.document_versions as version
  set content_snapshot = public.replace_process_name_in_content(
    version.content_snapshot,
    old.name,
    new.name,
    new.code
  )
  from public.documents as document
  where document.id = version.document_id
    and document.organization_id = new.organization_id
    and version.content_snapshot is not null
    and position(old.name in version.content_snapshot) > 0;

  return new;
end;
$$;

drop trigger if exists organization_processes_normalize_name on public.organization_processes;
create trigger organization_processes_normalize_name
before insert or update of name on public.organization_processes
for each row execute function public.normalize_process_name_uppercase();

drop trigger if exists organization_processes_sync_name_references on public.organization_processes;
create trigger organization_processes_sync_name_references
after update of name on public.organization_processes
for each row execute function public.sync_process_name_references();

-- O update aciona os dois gatilhos: normaliza o mestre e corrige documentos e versoes.
update public.organization_processes
set name = upper(trim(name))
where name is distinct from upper(trim(name));

notify pgrst, 'reload schema';
