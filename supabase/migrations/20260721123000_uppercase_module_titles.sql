-- Normaliza os titulos de mapeamentos, documentos e fluxogramas.
create or replace function public.uppercase_module_title_content(
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
  current_title text;
begin
  if content is null or content = '' then
    return content;
  end if;

  payload := content::jsonb;

  if payload ? 'titulo' and jsonb_typeof(payload -> 'titulo') = 'string' then
    payload := jsonb_set(payload, '{titulo}', to_jsonb(upper(trim(payload ->> 'titulo'))));
  end if;

  if module_name = 'ddp'
     and jsonb_typeof(payload #> '{ddp,meta,titulo}') = 'string' then
    current_title := payload #>> '{ddp,meta,titulo}';
    payload := jsonb_set(
      payload,
      '{ddp,meta,titulo}',
      to_jsonb(upper(trim(current_title)))
    );
  elsif module_name = 'pop'
     and jsonb_typeof(payload #> '{pop,meta,titulo}') = 'string' then
    current_title := payload #>> '{pop,meta,titulo}';
    payload := jsonb_set(
      payload,
      '{pop,meta,titulo}',
      to_jsonb(upper(trim(current_title)))
    );
  elsif module_name = 'bpmn'
     and jsonb_typeof(payload #> '{bpmn,poolName}') = 'string' then
    current_title := payload #>> '{bpmn,poolName}';
    payload := jsonb_set(
      payload,
      '{bpmn,poolName}',
      to_jsonb(upper(trim(current_title)))
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
  new.name := upper(trim(new.name));
  new.content_inline := public.uppercase_module_title_content(
    new.content_inline,
    new.module
  );
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

  new.content_snapshot := public.uppercase_module_title_content(
    new.content_snapshot,
    module_name
  );
  return new;
end;
$$;

drop trigger if exists documents_normalize_module_title on public.documents;
create trigger documents_normalize_module_title
before insert or update of name, content_inline, module
on public.documents
for each row execute function public.normalize_module_document_title();

drop trigger if exists document_versions_normalize_module_title
on public.document_versions;
create trigger document_versions_normalize_module_title
before insert or update of content_snapshot
on public.document_versions
for each row execute function public.normalize_module_version_title();

update public.documents
set
  name = upper(trim(name)),
  content_inline = public.uppercase_module_title_content(content_inline, module)
where module in ('ddp', 'pop', 'bpmn');

update public.document_versions as version
set content_snapshot = public.uppercase_module_title_content(
  version.content_snapshot,
  document.module
)
from public.documents as document
where document.id = version.document_id
  and document.module in ('ddp', 'pop', 'bpmn');

notify pgrst, 'reload schema';
