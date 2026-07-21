-- Normaliza os nomes da cadeia de valor copiados para mapeamentos e versões.
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
    if jsonb_typeof(payload #> '{ddp,legacy,processValueChainName}') = 'string' then
      payload := jsonb_set(
        payload,
        '{ddp,legacy,processValueChainName}',
        to_jsonb(upper(trim(payload #>> '{ddp,legacy,processValueChainName}')))
      );
    end if;
    if jsonb_typeof(payload #> '{ddp,meta,valueChainName}') = 'string' then
      payload := jsonb_set(
        payload,
        '{ddp,meta,valueChainName}',
        to_jsonb(upper(trim(payload #>> '{ddp,meta,valueChainName}')))
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

update public.documents
set content_inline = public.uppercase_document_process_references(content_inline, module)
where module = 'ddp';

update public.document_versions as version
set content_snapshot = public.uppercase_document_process_references(
  version.content_snapshot,
  document.module
)
from public.documents as document
where document.id = version.document_id
  and document.module = 'ddp';

notify pgrst, 'reload schema';
