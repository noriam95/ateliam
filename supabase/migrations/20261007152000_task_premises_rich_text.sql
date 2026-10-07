begin;

create or replace function public.user_tasks_checklist(p_kind text, p_modality text, p_document uuid)
returns jsonb language plpgsql immutable set search_path = public as $$
declare items jsonb;
begin
  if p_kind <> 'mapping' then
    return public.user_tasks_checklist_legacy(p_kind, p_modality, p_document);
  end if;
  if p_modality = 'Outros' then return '[]'::jsonb; end if;

  items := '[{"key":"mapping","label":"Relatório","entry_type":"mapping"},{"key":"flowchart","label":"Fluxograma","entry_type":"flowchart"}]';
  if p_modality = 'Operacional' then
    items := items || '[{"key":"pop","label":"POP","entry_type":"pop"},{"key":"communication","label":"Comunicado","entry_type":"file","optional":true}]'::jsonb;
  else
    items := items || '[{"key":"premises","label":"Premissas","entry_type":"note"}]'::jsonb;
  end if;

  return (
    select jsonb_agg(
      x || jsonb_build_object(
        'group_key', x->>'key',
        'optional', coalesce((x->>'optional')::boolean, false),
        'completed', false,
        'content', '',
        'saved_version', null,
        'document_id', case when x->>'key' = 'mapping' then p_document else null end
      ) order by ord
    )
    from jsonb_array_elements(items) with ordinality as entries(x, ord)
  );
end $$;

-- Pause the guard while updating existing checklist templates and labels.
drop trigger if exists task_checklist_stage_guard on public.user_tasks;

update public.user_tasks t
set checklist = (
      select jsonb_agg(
        case
          when x->>'key' = 'mapping' then x || jsonb_build_object('label', 'Relatório')
          when x->>'key' = 'premises' then
            (x - 'attachment') || jsonb_strip_nulls(jsonb_build_object(
              'label', 'Premissas',
              'entry_type', 'note',
              'legacy_attachment', coalesce(x->'legacy_attachment', x->'attachment')
            ))
          else x
        end order by ord
      )
      from jsonb_array_elements(t.checklist) with ordinality as entries(x, ord)
    ),
    revision = revision + 1,
    updated_at = now()
where t.kind = 'mapping'
  and exists (
    select 1 from jsonb_array_elements(t.checklist) x
    where (x->>'key' = 'mapping' and x->>'label' is distinct from 'Relatório')
       or (x->>'key' = 'premises' and (x->>'entry_type' is distinct from 'note' or x ? 'attachment'))
  );

-- Keep previously uploaded files readable as historical evidence; the new item has no upload action.
create or replace function public.user_tasks_file_access(p_name text, p_write boolean)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from public.user_tasks t
    where t.organization_id::text = split_part(p_name, '/', 1)
      and t.id::text = split_part(p_name, '/', 2)
      and public.user_tasks_access(t.organization_id)
      and exists (
        select 1 from jsonb_array_elements(t.checklist) x
        where x->>'key' = split_part(p_name, '/', 3)
          and (x->>'entry_type' = 'file' or (not p_write and x#>>'{legacy_attachment,path}' = p_name))
      )
      and case when p_write
        then (t.assigned_to = auth.uid() or public.has_role(auth.uid(), 'admin'))
          and (public.has_role(auth.uid(), 'editor') or public.has_role(auth.uid(), 'admin'))
          and t.status <> 'completed'
          and (t.kind <> 'mapping' or t.stage = 'documentation' or public.has_role(auth.uid(), 'admin'))
        else (auth.uid() in (t.assigned_to, t.requested_by, t.created_by, t.documenter_id, t.reviewer_id)
          or public.has_role(auth.uid(), 'admin'))
      end
  );
$$;

revoke all on function public.user_tasks_file_access(text, boolean) from public, anon;
grant execute on function public.user_tasks_file_access(text, boolean) to authenticated;

create or replace function public.guard_task_checklist_stage()
returns trigger language plpgsql set search_path = public as $$
declare old_non_validation jsonb; new_non_validation jsonb;
begin
  if new.checklist is distinct from old.checklist
     and old.stage <> 'documentation'
     and new.stage <> 'documentation' then
    select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) into old_non_validation
    from jsonb_array_elements(coalesce(old.checklist, '[]'::jsonb)) with ordinality as entries(value, ord)
    where value->>'key' <> 'validation';
    select coalesce(jsonb_agg(value order by ord), '[]'::jsonb) into new_non_validation
    from jsonb_array_elements(coalesce(new.checklist, '[]'::jsonb)) with ordinality as entries(value, ord)
    where value->>'key' <> 'validation';
    if old_non_validation is distinct from new_non_validation then
      raise exception 'O checklist só pode ser preenchido na atividade Atender solicitação.';
    end if;
  end if;
  return new;
end $$;

create trigger task_checklist_stage_guard
before update of checklist on public.user_tasks
for each row execute function public.guard_task_checklist_stage();

commit;
