-- Corrige nomes de processo armazenados nos documentos e snapshots legados.
create or replace function public.uppercase_document_process_references(
  content text,
  module_name text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  payload jsonb;
begin
  if content is null or content = '' then
    return content;
  end if;

  payload := content::jsonb;

  if module_name = 'ddp' then
    if jsonb_typeof(payload #> '{ddp,macroprocess,titulo}') = 'string' then
      payload := jsonb_set(
        payload,
        '{ddp,macroprocess,titulo}',
        to_jsonb(upper(trim(payload #>> '{ddp,macroprocess,titulo}')))
      );
    end if;
    if jsonb_typeof(payload #> '{ddp,legacy,processName}') = 'string' then
      payload := jsonb_set(
        payload,
        '{ddp,legacy,processName}',
        to_jsonb(upper(trim(payload #>> '{ddp,legacy,processName}')))
      );
    end if;
  elsif module_name = 'pop'
    and jsonb_typeof(payload #> '{pop,meta,processo}') = 'string' then
    payload := jsonb_set(
      payload,
      '{pop,meta,processo}',
      to_jsonb(upper(trim(payload #>> '{pop,meta,processo}')))
    );
  elsif module_name = 'bpmn'
    and jsonb_typeof(payload #> '{bpmn,poolName}') = 'string' then
    payload := jsonb_set(
      payload,
      '{bpmn,poolName}',
      to_jsonb(upper(trim(payload #>> '{bpmn,poolName}')))
    );
  end if;

  return payload::text;
exception
  when others then
    return content;
end;
$$;

create or replace function public.normalize_module_document_title()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.module in ('ddp', 'pop', 'bpmn') then
    new.name := upper(trim(new.name));
    new.content_inline := public.uppercase_module_title_content(
      new.content_inline,
      new.module
    );
    new.content_inline := public.uppercase_document_process_references(
      new.content_inline,
      new.module
    );
  end if;
  return new;
end;
$$;

create or replace function public.normalize_module_version_title()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  module_name text;
begin
  select document.module
  into module_name
  from public.documents as document
  where document.id = new.document_id;

  if module_name in ('ddp', 'pop', 'bpmn') then
    new.content_snapshot := public.uppercase_module_title_content(
      new.content_snapshot,
      module_name
    );
    new.content_snapshot := public.uppercase_document_process_references(
      new.content_snapshot,
      module_name
    );
  end if;
  return new;
end;
$$;

update public.documents
set content_inline = public.uppercase_document_process_references(content_inline, module)
where module in ('ddp', 'pop', 'bpmn');

update public.document_versions as version
set content_snapshot = public.uppercase_document_process_references(
  version.content_snapshot,
  document.module
)
from public.documents as document
where document.id = version.document_id
  and document.module in ('ddp', 'pop', 'bpmn');

notify pgrst, 'reload schema';
