begin;
create or replace function public.user_task_export_documents(p_org uuid,p_task uuid) returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare t public.user_tasks;
begin
 if not public.user_tasks_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 select * into t from public.user_tasks where id=p_task and organization_id=p_org;
 if t.id is null or not (public.has_role(auth.uid(),'admin') or auth.uid() in (t.assigned_to,t.requested_by,t.created_by,t.documenter_id,t.reviewer_id)) then raise exception 'Acesso reservado aos participantes da tarefa.'; end if;
 return jsonb_build_object('documents',coalesce((select jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'module',d.module,'code',public.user_tasks_doc_code(d.content_inline,d.module),'content_inline',d.content_inline)) from public.documents d where d.organization_id=p_org and exists(select 1 from jsonb_array_elements(t.checklist) x where nullif(x->>'document_id','')::uuid=d.id)),'[]'::jsonb),
 'brand',(select jsonb_build_object('name',o.name,'logo_data_url',to_jsonb(o)->>'logo_data_url','word_header_color',to_jsonb(o)->>'word_header_color') from public.organizations o where o.id=p_org));
end $$;
revoke all on function public.user_task_export_documents(uuid,uuid) from public,anon;
grant execute on function public.user_task_export_documents(uuid,uuid) to authenticated;
commit;
