begin;
-- Modelos anteriores de melhoria/documento permanecem como estão.
alter function public.user_tasks_checklist(text,text,uuid) rename to user_tasks_checklist_legacy;
create function public.user_tasks_checklist(p_kind text,p_modality text,p_document uuid) returns jsonb
language plpgsql immutable set search_path=public as $$
declare items jsonb;
begin
 if p_kind<>'mapping' then return public.user_tasks_checklist_legacy(p_kind,p_modality,p_document); end if;
 items:='[{"key":"mapping","label":"Mapeamento","entry_type":"mapping"},{"key":"flowchart","label":"Fluxograma","entry_type":"file"}]';
 if p_modality='Operacional' then
  items:=items||'[{"key":"pop","label":"POP","entry_type":"pop"},{"key":"communication","label":"Comunicado","entry_type":"file","optional":true}]'::jsonb;
 else items:=items||'[{"key":"premises","label":"Premissas","entry_type":"file"}]'::jsonb; end if;
 return (select jsonb_agg(x||jsonb_build_object('group_key',x->>'key','optional',coalesce((x->>'optional')::boolean,false),'completed',false,'content','','saved_version',null,'document_id',case when x->>'key'='mapping' then p_document else null end) order by ord) from jsonb_array_elements(items) with ordinality e(x,ord));
end $$;
revoke all on function public.user_tasks_checklist(text,text,uuid),public.user_tasks_checklist_legacy(text,text,uuid) from public,anon,authenticated;

-- Aplica os padrões e preserva qualquer entrega anterior já preenchida.
update public.user_tasks t set checklist=(
 select jsonb_agg(value order by ordering) from (
  select x || case when x->>'key'='mapping' then coalesce((select old - 'label' from jsonb_array_elements(t.checklist) old where old->>'key'='mapping'),'{}') else '{}'::jsonb end value,ord ordering
  from jsonb_array_elements(public.user_tasks_checklist(t.kind,t.modality,t.document_id)) with ordinality e(x,ord)
  union all
  select old||jsonb_build_object('key','legacy-'||(old->>'key'),'group_key','legacy-'||(old->>'key'),'entry_type','note'),100+ord
  from jsonb_array_elements(t.checklist) with ordinality e(old,ord)
  where old->>'key'<>'mapping' and (coalesce((old->>'completed')::boolean,false) or coalesce(old->>'content','')<>'' or old->>'document_id' is not null)
 ) entries
),revision=revision+1 where t.kind='mapping' and t.status<>'completed';

insert into storage.buckets(id,name,public,file_size_limit) values('user-task-files','user-task-files',false,20971520) on conflict(id) do nothing;
create function public.user_tasks_file_access(p_name text,p_write boolean) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.user_tasks t where t.organization_id::text=split_part(p_name,'/',1) and t.id::text=split_part(p_name,'/',2) and public.user_tasks_access(t.organization_id)
 and exists(select 1 from jsonb_array_elements(t.checklist) x where x->>'key'=split_part(p_name,'/',3) and x->>'entry_type'='file')
 and case when p_write then (t.assigned_to=auth.uid() or public.has_role(auth.uid(),'admin')) and (public.has_role(auth.uid(),'editor') or public.has_role(auth.uid(),'admin')) and t.status<>'completed' and (t.kind<>'mapping' or t.stage='documentation' or public.has_role(auth.uid(),'admin'))
 else (auth.uid() in (t.assigned_to,t.requested_by,t.created_by,t.documenter_id,t.reviewer_id) or public.has_role(auth.uid(),'admin')) end);
$$;
revoke all on function public.user_tasks_file_access(text,boolean) from public,anon;
grant execute on function public.user_tasks_file_access(text,boolean) to authenticated;
create policy user_task_files_insert on storage.objects for insert to authenticated with check(bucket_id='user-task-files' and public.user_tasks_file_access(name,true));
create policy user_task_files_read on storage.objects for select to authenticated using(bucket_id='user-task-files' and public.user_tasks_file_access(name,false));
create or replace function public.user_tasks_command(p_org uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t public.user_tasks; item jsonb; doc public.documents; target uuid; note text:=coalesce(p_payload->>'note',''); newstatus text; remaining jsonb; done boolean; updated jsonb; entry_key text; entry_type text; module_name text; attachment jsonb;
begin
 if not public.user_tasks_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 if p_action='create' then
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'editor')) then raise exception 'Permissão de edição necessária.'; end if;
  select * into t from public.user_tasks where id=(p_payload->>'id')::uuid;
  if found then
   if t.organization_id<>p_org or t.created_by<>auth.uid() then raise exception 'Identificador indisponível.'; end if;
   return jsonb_build_object('id',t.id);
  end if;
  if nullif(p_payload->>'documentId','') is not null then
   select * into doc from public.documents where id=(p_payload->>'documentId')::uuid and organization_id=p_org;
   if not found then raise exception 'Selecione um documento desta organização.'; end if;
   if p_payload->>'kind'='mapping' and doc.module<>'ddp' then raise exception 'Selecione um documento de mapeamento.'; end if;
  end if;
  target:=coalesce(nullif(p_payload->>'requestedBy','')::uuid,auth.uid());
  if not (public.user_tasks_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) then raise exception 'Selecione um solicitante cadastrado nesta organização.'; end if;
  if length(note)>10000 then raise exception 'Comentário deve ter até 10000 caracteres.'; end if;
  target:=(p_payload->>'assignedTo')::uuid;
  if not (public.user_tasks_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) or not (public.has_role(target,'admin') or public.has_role(target,'editor')) then raise exception 'Selecione um responsável com permissão de edição na organização.'; end if;
  insert into public.user_tasks(id,organization_id,document_id,title,kind,modality,assigned_to,requested_by,created_by,documenter_id,starts_on,due_on,checklist)
  values((p_payload->>'id')::uuid,p_org,doc.id,trim(p_payload->>'title'),p_payload->>'kind',nullif(p_payload->>'modality',''),target,coalesce(nullif(p_payload->>'requestedBy','')::uuid,auth.uid()),auth.uid(),target,(p_payload->>'startsOn')::date,(p_payload->>'dueOn')::date,public.user_tasks_checklist(p_payload->>'kind',p_payload->>'modality',doc.id)) returning * into t;
  insert into public.user_task_events(task_id,organization_id,actor_id,action) values(t.id,p_org,auth.uid(),'Tarefa criada');
  if length(trim(note))>0 then
   insert into public.user_task_events(task_id,organization_id,actor_id,action,note) values(t.id,p_org,auth.uid(),'Comentário',trim(note));
  end if;
  return jsonb_build_object('id',t.id);
 end if;
 select * into t from public.user_tasks where id=(p_payload->>'id')::uuid and organization_id=p_org for update;
 if p_action='comment' then
  if t.id is null or not (public.has_role(auth.uid(),'admin') or auth.uid() in (t.assigned_to,t.requested_by,t.created_by,t.documenter_id,t.reviewer_id)) then raise exception 'Comentário reservado aos participantes da tarefa.'; end if;
  if length(trim(note)) not between 1 and 10000 then raise exception 'Escreva um comentário com até 10000 caracteres.'; end if;
  insert into public.user_task_events(id,task_id,organization_id,actor_id,action,note) values((p_payload->>'commentId')::uuid,t.id,p_org,auth.uid(),'Comentário',trim(note)) on conflict(id) do nothing;
  return jsonb_build_object('id',t.id);
 end if;
 if not found or (t.assigned_to<>auth.uid() and not public.has_role(auth.uid(),'admin')) then raise exception 'Ação reservada ao responsável ou administrador.'; end if;
 if not (public.has_role(auth.uid(),'editor') or public.has_role(auth.uid(),'admin')) then raise exception 'Permissão de edição necessária.'; end if;
 if t.revision<>coalesce((p_payload->>'revision')::integer,-1) then raise exception 'A tarefa foi alterada. Feche os detalhes, atualize a lista e tente novamente.'; end if;
 if p_action in ('add_item','add_entry','begin_document','attach_file') then
  if t.status='completed' or (t.kind='mapping' and t.stage<>'documentation' and not public.has_role(auth.uid(),'admin')) then raise exception 'Reabra a documentação para alterar as entregas.'; end if;
  if p_action in ('add_item','add_entry') then
   entry_key:=(p_payload->>'entryId')::uuid::text;
   if exists(select 1 from jsonb_array_elements(t.checklist) x where x->>'key'=entry_key) then return jsonb_build_object('id',t.id); end if;
   if p_action='add_entry' then
    select x into item from jsonb_array_elements(t.checklist) x where x->>'key'=p_payload->>'key';
    if item is null then raise exception 'Item não encontrado.'; end if;
    updated:=jsonb_build_object('key',entry_key,'group_key',coalesce(item->>'group_key',item->>'key'),'label',item->>'label','entry_type',coalesce(item->>'entry_type','note'),'optional',coalesce((item->>'optional')::boolean,false));
   else
    entry_type:=p_payload->>'entryType';
    if entry_type is null or entry_type not in ('mapping','pop','file','note') or length(trim(coalesce(p_payload->>'label',''))) not between 2 and 120 then raise exception 'Informe o nome e o tipo do novo item.'; end if;
    updated:=jsonb_build_object('key',entry_key,'group_key',entry_key,'label',trim(p_payload->>'label'),'entry_type',entry_type,'optional',coalesce((p_payload->>'optional')::boolean,false));
   end if;
   updated:=updated||jsonb_build_object('completed',false,'content','','document_id',null,'saved_version',null);
   update public.user_tasks set checklist=checklist||jsonb_build_array(updated) where id=t.id;
   note:=(updated->>'label')||case when p_action='add_entry' then ': novo preenchimento/anexo' else ': item adicionado' end;
  else
   select x into item from jsonb_array_elements(t.checklist) x where x->>'key'=p_payload->>'key';
   if item is null then raise exception 'Item não encontrado.'; end if;
   if p_action='begin_document' then
    if item->>'entry_type' not in ('mapping','pop') or item->>'entry_type' is null then raise exception 'Este item não é um formulário.'; end if;
    if nullif(item->>'document_id','') is not null then return jsonb_build_object('id',t.id,'documentId',item->>'document_id'); end if;
    module_name:=case when item->>'entry_type'='mapping' then 'ddp' else 'pop' end;
    insert into public.documents(organization_id,owner_id,name,module,content_inline)
    values(p_org,auth.uid(),t.title||' — '||(item->>'label'),module_name,jsonb_build_object(module_name,jsonb_build_object('meta',jsonb_build_object('titulo',t.title,'codigo','')),'persistence',jsonb_build_object('saveMode','draft','draft',true))::text) returning * into doc;
    updated:=item||jsonb_build_object('document_id',doc.id,'completed',false);
    if item->>'entry_type'='mapping' and t.document_id is null then update public.user_tasks set document_id=doc.id where id=t.id; end if;
    note:=(item->>'label')||': preenchimento iniciado';
   else
    if item->>'entry_type' is distinct from 'file' then raise exception 'Este item não recebe anexo.'; end if;
    if item#>>'{attachment,path}'=p_payload#>>'{attachment,path}' then return jsonb_build_object('id',t.id); end if;
    if item->'attachment' is not null and item->'attachment'<>'null'::jsonb then raise exception 'Adicione outro anexo para preservar o arquivo existente.'; end if;
    attachment:=p_payload->'attachment';
    if length(coalesce(attachment->>'name','')) not between 1 and 255 or coalesce((attachment->>'size')::bigint,0) not between 1 and 20971520 then raise exception 'Arquivo inválido. Limite de 20 MB.'; end if;
    if not exists(select 1 from storage.objects o where o.bucket_id='user-task-files' and o.name=attachment->>'path' and split_part(o.name,'/',1)=p_org::text and split_part(o.name,'/',2)=t.id::text and split_part(o.name,'/',3)=item->>'key') then raise exception 'Envie o arquivo antes de registrar o anexo.'; end if;
    updated:=item||jsonb_build_object('attachment',attachment,'completed',true,'content',attachment->>'name');
    note:=(item->>'label')||': anexo '||(attachment->>'name');
   end if;
   update public.user_tasks set status=case when status='pending' then 'in_progress' else status end,checklist=(select jsonb_agg(case when x->>'key'=item->>'key' then updated else x end order by ord) from jsonb_array_elements(checklist) with ordinality e(x,ord)) where id=t.id;
  end if;
 elsif p_action='assign' then
  if not public.has_role(auth.uid(),'admin') then raise exception 'Reatribuição reservada ao administrador.'; end if;
  target:=(p_payload->>'assignedTo')::uuid;
  if not (public.user_tasks_member(target,p_org) or target=auth.uid()) or not (public.has_role(target,'editor') or public.has_role(target,'admin')) then raise exception 'Responsável inválido.'; end if;
  update public.user_tasks set assigned_to=target where id=t.id;
 elsif p_action='item' then
  if t.kind='mapping' and t.stage<>'documentation' and not public.has_role(auth.uid(),'admin') then raise exception 'Checklist disponível para edição na etapa de documentação.'; end if;
  if t.status='completed' then raise exception 'Reabra a tarefa antes de editar o checklist.'; end if;
  select x into item from jsonb_array_elements(public.user_tasks_effective(t.checklist)) x where x->>'key'=p_payload->>'key';
  if item is null then raise exception 'Item não encontrado.'; end if;
  if item->>'entry_type'='file' then raise exception 'Utilize o envio de anexo para este item.'; end if;
  done:=coalesce((p_payload->>'completed')::boolean,false);
  if t.kind='mapping' and item->>'key'='validation' and done then raise exception 'A conclusão deste item ocorre ao registrar a aprovação do dono do processo.'; end if;
  if nullif(p_payload->>'documentId','') is not null then
   select * into doc from public.documents where id=(p_payload->>'documentId')::uuid and organization_id=p_org;
   if not found then raise exception 'Documento fora da organização.'; end if;
   if p_payload ? 'savedAt' and doc.updated_at is distinct from (p_payload->>'savedAt')::timestamptz then raise exception 'O documento recebeu outra versão. Abra novamente antes de concluir.'; end if;
   if done and coalesce(doc.content_inline::jsonb#>>'{persistence,saveMode}','')='draft' then raise exception 'Rascunho permanece em andamento. Salve o documento definitivamente antes de concluir.'; end if;
  elsif item->>'key' in ('mapping','document') and (t.document_id is not null or done) then raise exception 'O documento principal não pode ser desvinculado.';
  end if;
  if item->>'key' in ('mapping','document') and t.document_id is not null and doc.id is distinct from t.document_id then raise exception 'O documento principal não pode ser substituído.'; end if;
  if item->>'entry_type' in ('mapping','pop') and doc.id is null then raise exception 'Abra o formulário para preencher este item.'; end if;
  if item->>'entry_type'='mapping' and doc.id is not null and doc.module<>'ddp' then raise exception 'Selecione um mapeamento.'; end if;
  if item->>'entry_type'='pop' and doc.id is not null and doc.module<>'pop' then raise exception 'Selecione um POP.'; end if;
  if item->>'key'='mapping' and doc.id is not null and doc.module<>'ddp' then raise exception 'Selecione um documento de mapeamento.'; end if;
  if item->>'key' in ('mapping','document') and t.document_id is null and doc.id is not null then
   update public.user_tasks set document_id=doc.id where id=t.id;
  end if;
  if done and doc.id is null and length(trim(coalesce(p_payload->>'content','')))<2 then raise exception 'Preencha o conteúdo antes de concluir o item.'; end if;
  updated:=item||jsonb_build_object('content',coalesce(p_payload->>'content',''),'document_id',doc.id,'saved_version',doc.current_version,'saved_at',doc.updated_at,'completed',done,'stale',false);
  update public.user_tasks set status=case when status='pending' then 'in_progress' else status end,checklist=(select jsonb_agg(case when x->>'key'=p_payload->>'key' then updated else x end order by ord) from jsonb_array_elements(checklist) with ordinality e(x,ord)) where id=t.id;
  note:=(item->>'label')||case when done then ': concluído' else ': salvo, pendente' end;
 elsif p_action in ('send_review','approve_review','request_adjustments','record_owner_approval','admin_move') then
  if t.kind<>'mapping' then raise exception 'Este encaminhamento se aplica a mapeamentos.'; end if;
  remaining:=(select coalesce(jsonb_agg(x->>'label'),'[]') from jsonb_array_elements(public.user_tasks_effective(t.checklist)) x where not coalesce((x->>'optional')::boolean,false) and not (x->>'completed')::boolean and x->>'key'<>'validation');
  if p_action in ('send_review','approve_review','record_owner_approval') and jsonb_array_length(remaining)>0 and not coalesce((p_payload->>'confirmPending')::boolean,false) then raise exception 'Confirme o avanço com itens pendentes.'; end if;
  if p_action='send_review' then
   if t.stage<>'documentation' then raise exception 'Encaminhamento disponível na documentação.'; end if;
   if t.return_stage='owner_approval' then
    update public.user_tasks set stage='owner_approval',status='review',assigned_to=documenter_id,return_stage=null,pending_at_transition=remaining where id=t.id;
    note:='Documentação ajustada e devolvida para coleta da aprovação do dono do processo.';
   else
    target:=(p_payload->>'reviewerId')::uuid;
    if not (public.user_tasks_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) or not (public.has_role(target,'editor') or public.has_role(target,'admin')) then raise exception 'Selecione um responsável técnico com acesso de edição.'; end if;
    update public.user_tasks set stage='technical_review',status='review',assigned_to=target,reviewer_id=target,return_stage=null,pending_at_transition=remaining where id=t.id;
    note:='Mapeamento encaminhado para revisão técnica.';
   end if;
  elsif p_action='approve_review' then
   if t.stage<>'technical_review' then raise exception 'A tarefa não está em revisão técnica.'; end if;
   update public.user_tasks set stage='owner_approval',status='review',assigned_to=documenter_id,pending_at_transition=remaining where id=t.id;
   note:='Revisão técnica aprovada. Retorno para coleta da aprovação do dono do processo. '||note;
  elsif p_action='request_adjustments' then
   if t.stage not in ('technical_review','owner_approval') then raise exception 'Solicitação de ajustes disponível na revisão ou aprovação.'; end if;
   if length(trim(note))<3 then raise exception 'Descreva os ajustes solicitados.'; end if;
   update public.user_tasks set stage='documentation',status='in_progress',assigned_to=documenter_id,return_stage=t.stage,adjustment_request=note,
    checklist=(select jsonb_agg(case when x->>'key'='validation' then x||jsonb_build_object('completed',false) else x end order by ord) from jsonb_array_elements(checklist) with ordinality e(x,ord)) where id=t.id;
  elsif p_action='record_owner_approval' then
   if t.stage<>'owner_approval' then raise exception 'Colete primeiro a aprovação do dono do processo.'; end if;
   if length(trim(note))<3 then raise exception 'Registre o dono do processo e a evidência da aprovação.'; end if;
   update public.user_tasks set stage='completed',status='completed',pending_at_transition=remaining,
    checklist=(select jsonb_agg(case when x->>'key'='validation' then x||jsonb_build_object('completed',true,'content',note) else x end order by ord) from jsonb_array_elements(checklist) with ordinality e(x,ord)) where id=t.id;
  else
   if not public.has_role(auth.uid(),'admin') then raise exception 'Movimentação livre reservada ao administrador.'; end if;
   newstatus:=p_payload->>'stage';target:=(p_payload->>'assignedTo')::uuid;
   if newstatus is null or newstatus not in ('documentation','technical_review','owner_approval','completed') or length(trim(note))<3 then raise exception 'Informe etapa, responsável e motivo da movimentação.'; end if;
   if not (public.user_tasks_member(target,p_org) or target=auth.uid()) or not (public.has_role(target,'editor') or public.has_role(target,'admin')) then raise exception 'Responsável inválido.'; end if;
   update public.user_tasks set stage=newstatus,status=case when newstatus='documentation' then 'in_progress' when newstatus='completed' then 'completed' else 'review' end,assigned_to=target,pending_at_transition=remaining,
    documenter_id=case when newstatus='documentation' then target else documenter_id end,
    reviewer_id=case when newstatus='technical_review' then target else reviewer_id end where id=t.id;
  end if;
  if jsonb_array_length(remaining)>0 then note:=note||' Itens pendentes: '||(select string_agg(value,', ') from jsonb_array_elements_text(remaining)); end if;
 elsif p_action='transition' then
  if t.kind='mapping' then raise exception 'Use os encaminhamentos de revisão e aprovação do mapeamento.'; end if;
  newstatus:=p_payload->>'status';
  if newstatus is null or newstatus not in ('pending','in_progress','review','completed') or newstatus=t.status then raise exception 'Situação inválida.'; end if;
  remaining:=(select coalesce(jsonb_agg(x->>'label'),'[]') from jsonb_array_elements(public.user_tasks_effective(t.checklist)) x where not coalesce((x->>'optional')::boolean,false) and not (x->>'completed')::boolean);
  if newstatus in ('review','completed') and jsonb_array_length(remaining)>0 and not coalesce((p_payload->>'confirmPending')::boolean,false) then raise exception 'Confirme o avanço com itens pendentes.'; end if;
  update public.user_tasks set status=newstatus,pending_at_transition=case when newstatus in ('review','completed') then remaining else '[]'::jsonb end where id=t.id;
  note:='Situação: '||newstatus||case when jsonb_array_length(remaining)>0 then '. Itens pendentes: '||(select string_agg(value,', ') from jsonb_array_elements_text(remaining)) else '' end;
 else raise exception 'Ação inválida.';
 end if;
 if p_action not in ('item','add_item','add_entry','begin_document','attach_file') then
  note:=note||' Responsável: '||(select coalesce(nullif(display_name,''),username,'Usuário') from public.profiles where id=t.assigned_to)||' → '||(select coalesce(nullif(p.display_name,''),p.username,'Usuário') from public.user_tasks u join public.profiles p on p.id=u.assigned_to where u.id=t.id)||'.';
 end if;
 update public.user_tasks set revision=revision+1,updated_at=now() where id=t.id;
 insert into public.user_task_events(task_id,organization_id,actor_id,action,note) values(t.id,p_org,auth.uid(),case p_action when 'add_item' then 'Item adicionado' when 'add_entry' then 'Entrega adicionada' when 'begin_document' then 'Preenchimento iniciado' when 'attach_file' then 'Arquivo anexado' when 'item' then 'Checklist atualizado' when 'assign' then 'Responsável alterado' when 'request_adjustments' then 'Ajustes solicitados' when 'approve_review' then 'Revisão técnica aprovada' when 'record_owner_approval' then 'Aprovação do dono registrada' else 'Etapa alterada' end,note);
 return jsonb_build_object('id',t.id,'documentId',case when p_action='begin_document' then doc.id else null end);
end $$;


commit;
