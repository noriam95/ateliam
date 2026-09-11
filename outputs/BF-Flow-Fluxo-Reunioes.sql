-- Aplicar uma vez no SQL Editor do Supabase. Requer as migrações anteriores de tarefas/checklists.
begin;
alter table public.user_tasks add column task_number integer, add column task_year integer, add column task_code text, add column paused_status text, add column review_started boolean not null default false;
alter table public.user_tasks drop constraint user_tasks_status_check;
alter table public.user_tasks add constraint user_tasks_status_check check(status in ('pending','in_progress','review','paused','completed'));
alter table public.user_tasks drop constraint user_tasks_stage_check;
alter table public.user_tasks add constraint user_tasks_stage_check check(stage in ('registration','intake','documentation','technical_review','owner_approval','completed'));
update public.user_tasks set review_started=true where stage in ('technical_review','owner_approval','completed') or exists(select 1 from public.user_task_events e where e.task_id=user_tasks.id and e.action in ('Revisão técnica aprovada','Ajustes solicitados'));
create table public.task_number_counters(organization_id uuid references public.organizations(id), year integer, last_number integer not null, primary key(organization_id,year));
revoke all on public.task_number_counters from public,anon,authenticated;
with numbered as (select id,extract(year from created_at at time zone 'America/Cuiaba')::integer yr,row_number() over(partition by organization_id,extract(year from created_at at time zone 'America/Cuiaba') order by created_at,id)::integer num from public.user_tasks)
update public.user_tasks t set task_number=n.num,task_year=n.yr,task_code='TAR.'||lpad(n.num::text,greatest(4,length(n.num::text)),'0')||'.'||n.yr from numbered n where t.id=n.id;
insert into public.task_number_counters select organization_id,task_year,max(task_number) from public.user_tasks group by organization_id,task_year;
create function public.assign_task_code() returns trigger language plpgsql security definer set search_path=public as $$
begin
 new.task_year:=extract(year from new.created_at at time zone 'America/Cuiaba');
 insert into public.task_number_counters values(new.organization_id,new.task_year,1) on conflict(organization_id,year) do update set last_number=task_number_counters.last_number+1 returning last_number into new.task_number;
 new.task_code:='TAR.'||lpad(new.task_number::text,greatest(4,length(new.task_number::text)),'0')||'.'||new.task_year;
 return new;
end $$;
create trigger assign_task_code before insert on public.user_tasks for each row execute function public.assign_task_code();
alter table public.user_tasks alter column task_code set not null;
create unique index user_tasks_code_unique on public.user_tasks(organization_id,task_code);
create or replace function public.user_tasks_feed(p_org uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; isadmin boolean:=public.has_role(auth.uid(),'admin');
begin
 if not public.user_tasks_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 with filtered as (
  select t.*,t.task_code code,d.module document_module,
   coalesce(nullif(a.display_name,''),a.username,'Usuário') assignee_name,
   coalesce(nullif(r.display_name,''),r.username,'Usuário') requester_name
  from public.user_tasks t left join public.documents d on d.id=t.document_id
  join public.profiles a on a.id=t.assigned_to join public.profiles r on r.id=t.requested_by
  where t.organization_id=p_org
   and (t.assigned_to=auth.uid() or (isadmin and coalesce((p_filters->>'team')::boolean,false)) or (p_filters->>'id' is not null and ((t.requested_by=auth.uid() or t.created_by=auth.uid()) or t.documenter_id=auth.uid() or t.reviewer_id=auth.uid() or isadmin)))
   and (nullif(p_filters->>'id','') is null or t.id=(p_filters->>'id')::uuid)
   and (nullif(p_filters->>'status','') is null or t.status=p_filters->>'status' or (p_filters->>'status'='open' and t.status<>'completed'))
   and (nullif(p_filters->>'kind','') is null or t.kind=p_filters->>'kind')
   and (nullif(p_filters->>'modality','') is null or t.modality=p_filters->>'modality')
   and (nullif(p_filters->>'from','') is null or t.due_on>=(p_filters->>'from')::date)
   and (nullif(p_filters->>'until','') is null or t.starts_on<=(p_filters->>'until')::date)
   and (nullif(p_filters->>'q','') is null or concat_ws(' ',t.title,t.task_code,a.display_name,r.display_name) ilike '%'||(p_filters->>'q')||'%')
 ), page as (select * from filtered order by due_on,id limit 60 offset greatest(0,coalesce((p_filters->>'offset')::integer,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'tasks',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('checklist',public.user_tasks_effective(p.checklist)) order by due_on,id) from page p),'[]')) into result;
 return result || jsonb_build_object(
  'userId',auth.uid(),'isAdmin',isadmin,'canCreate',isadmin or public.has_role(auth.uid(),'editor'),
  'summary',(select jsonb_build_object('mapping',count(*) filter(where kind='mapping'),'improvement',count(*) filter(where kind='improvement'),'document',count(*) filter(where kind='document'),'overdue',count(*) filter(where due_on<current_date)) from public.user_tasks where organization_id=p_org and assigned_to=auth.uid() and status<>'completed'),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),p.username,'Usuário'),'can_edit',public.has_role(p.id,'editor') or public.has_role(p.id,'admin')) order by p.display_name) from public.profiles p where public.user_tasks_member(p.id,p_org) or (p.id=auth.uid() and isadmin)),'[]'),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)) from (select id,name,module,current_version,public.user_tasks_doc_code(content_inline,module) code from public.documents where organization_id=p_org and (p_filters ? 'documentQuery') and concat_ws(' ',name,public.user_tasks_doc_code(content_inline,module)) ilike '%'||coalesce(p_filters->>'documentQuery','')||'%' order by updated_at desc limit 40) d),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select ev.id,ev.action,ev.note,ev.created_at,p.avatar_data_url actor_photo,coalesce(nullif(p.display_name,''),p.username,'Usuário') actor_name from public.user_task_events ev join public.profiles p on p.id=ev.actor_id where ev.task_id=nullif(p_filters->>'id','')::uuid and ev.organization_id=p_org and exists(select 1 from public.user_tasks t where t.id=ev.task_id and (isadmin or t.assigned_to=auth.uid() or (t.requested_by=auth.uid() or t.created_by=auth.uid()) or t.documenter_id=auth.uid() or t.reviewer_id=auth.uid())) order by ev.created_at desc limit 100) e),'[]')
 );
end $$;

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
  insert into public.user_tasks(id,organization_id,document_id,title,kind,modality,assigned_to,requested_by,created_by,documenter_id,starts_on,due_on,checklist,stage)
  values((p_payload->>'id')::uuid,p_org,doc.id,trim(p_payload->>'title'),p_payload->>'kind',nullif(p_payload->>'modality',''),target,coalesce(nullif(p_payload->>'requestedBy','')::uuid,auth.uid()),auth.uid(),target,(p_payload->>'startsOn')::date,(p_payload->>'dueOn')::date,public.user_tasks_checklist(p_payload->>'kind',p_payload->>'modality',doc.id),case when p_payload->>'kind'='mapping' then 'intake' else 'documentation' end) returning * into t;
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
 if t.status='paused' and p_action not in ('resume','edit_details','admin_move') then raise exception 'Retome a tarefa antes de continuar.'; end if;
 if p_action in ('pause','resume','edit_details','start_documentation','request_complement','resubmit') then
  if not public.has_role(auth.uid(),'admin') and (t.assigned_to<>auth.uid() or (p_action not in ('resubmit') and t.assigned_to<>t.documenter_id)) then raise exception 'Ação reservada ao responsável pelo mapeamento na sua etapa.'; end if;
  if t.status='completed' then raise exception 'Tarefa concluída.'; end if;
  if p_action='pause' then
   if length(trim(note))<3 then raise exception 'Informe o motivo da parada.'; end if;
   update public.user_tasks set paused_status=status,status='paused' where id=t.id;
   note:='Tarefa parada: '||note;
  elsif p_action='resume' then
   if t.status<>'paused' then raise exception 'A tarefa não está parada.'; end if;
   update public.user_tasks set status=coalesce(paused_status,'in_progress'),paused_status=null where id=t.id;
   note:='Tarefa retomada. '||note;
  elsif p_action='start_documentation' then
   if t.stage<>'intake' then raise exception 'Etapa inválida.'; end if;
   update public.user_tasks set stage='documentation',status='in_progress' where id=t.id;
   note:='Demanda analisada. Preenchimento do checklist liberado. '||note;
  elsif p_action='request_complement' then
   if t.stage<>'intake' or length(trim(note))<3 then raise exception 'Descreva o complemento solicitado na análise da demanda.'; end if;
   update public.user_tasks set stage='registration',status='pending',assigned_to=created_by,adjustment_request=note where id=t.id;
   note:='Complemento da demanda solicitado: '||note;
  elsif p_action='resubmit' then
   if t.stage<>'registration' or length(trim(note))<3 then raise exception 'Descreva o complemento realizado.'; end if;
   update public.user_tasks set stage='intake',status='pending',assigned_to=documenter_id where id=t.id;
   note:='Demanda complementada: '||note;
  else
   target:=(p_payload->>'assignedTo')::uuid;
   if not public.user_tasks_member(target,p_org) or not (public.has_role(target,'editor') or public.has_role(target,'admin')) then raise exception 'Responsável inválido.'; end if;
   if not public.user_tasks_member((p_payload->>'requestedBy')::uuid,p_org) then raise exception 'Solicitante inválido.'; end if;
   if nullif(p_payload->>'modality','') is distinct from t.modality and t.kind='mapping' then
    if t.stage<>'documentation' or t.review_started then raise exception 'Modalidade só pode mudar no primeiro preenchimento.'; end if;
    if not coalesce((p_payload->>'confirmModality')::boolean,false) then raise exception 'Confirme a alteração da modalidade.'; end if;
    updated:=public.user_tasks_checklist(t.kind,p_payload->>'modality',null);
    updated:=t.checklist||(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(updated) x where not exists(select 1 from jsonb_array_elements(t.checklist) old where coalesce(old->>'group_key',old->>'key')=coalesce(x->>'group_key',x->>'key')));
    update public.user_tasks set modality=p_payload->>'modality',checklist=updated where id=t.id;
   end if;
   update public.user_tasks set starts_on=(p_payload->>'startsOn')::date,due_on=(p_payload->>'dueOn')::date,requested_by=(p_payload->>'requestedBy')::uuid,assigned_to=target,documenter_id=target where id=t.id;
   note:='Dados da tarefa atualizados. Prazo: '||t.starts_on||' a '||t.due_on||' → '||(p_payload->>'startsOn')||' a '||(p_payload->>'dueOn')||'. Modalidade: '||coalesce(t.modality,'—')||' → '||coalesce(p_payload->>'modality','—')||'. Solicitante: '||t.requested_by||' → '||(p_payload->>'requestedBy')||'. '||note;
  end if;
  note:=note||' Responsável: '||coalesce((select display_name from public.profiles where id=t.assigned_to),t.assigned_to::text)||' → '||coalesce((select p.display_name from public.user_tasks u join public.profiles p on p.id=u.assigned_to where u.id=t.id),'Usuário')||'.';
  update public.user_tasks set revision=revision+1,updated_at=now() where id=t.id;
  insert into public.user_task_events(task_id,organization_id,actor_id,action,note) values(t.id,p_org,auth.uid(),'Tarefa atualizada',note);
  return jsonb_build_object('id',t.id);
 end if;
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
    target:=(p_payload->>'reviewerId')::uuid;
    if not (public.user_tasks_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) or not (public.has_role(target,'editor') or public.has_role(target,'admin')) then raise exception 'Selecione um responsável técnico com acesso de edição.'; end if;
    update public.user_tasks set stage='technical_review',review_started=true,status='review',assigned_to=target,reviewer_id=target,return_stage=null,pending_at_transition=remaining where id=t.id;
    note:='Mapeamento encaminhado para revisão técnica.';
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
   if newstatus is null or newstatus not in ('registration','intake','documentation','technical_review','owner_approval','completed') or length(trim(note))<3 then raise exception 'Informe etapa, responsável e motivo da movimentação.'; end if;
   if not (public.user_tasks_member(target,p_org) or target=auth.uid()) or not (public.has_role(target,'editor') or public.has_role(target,'admin')) then raise exception 'Responsável inválido.'; end if;
   update public.user_tasks set stage=newstatus,paused_status=null,status=case when newstatus in ('registration','intake') then 'pending' when newstatus='documentation' then 'in_progress' when newstatus='completed' then 'completed' else 'review' end,assigned_to=target,pending_at_transition=remaining,
    documenter_id=case when newstatus in ('intake','documentation') then target else documenter_id end,
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

begin;
create table public.task_meetings(
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
 organizer_id uuid not null references public.profiles(id),task_id uuid references public.user_tasks(id),
 title text not null check(length(trim(title)) between 2 and 200),starts_at timestamptz not null,ends_at timestamptz not null check(ends_at>starts_at),
 attendees text[] not null default '{}',agenda text not null default '',status text not null default 'scheduled' check(status in ('scheduled','completed','cancelled')),
 revision integer not null default 0,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
alter table public.task_meetings enable row level security;
create policy task_meetings_read on public.task_meetings for select to authenticated using(
 public.user_tasks_access(organization_id) and (organizer_id=auth.uid() or public.has_role(auth.uid(),'admin')
 or exists(select 1 from public.profiles p where p.id=auth.uid() and lower(p.email)=any(attendees))
 or exists(select 1 from public.user_tasks t where t.id=task_id)));
revoke all on public.task_meetings from public,anon,authenticated;
grant select on public.task_meetings to authenticated;
grant all on public.task_meetings to service_role;
create index task_meetings_period on public.task_meetings(organization_id,starts_at,ends_at);
create function public.task_meeting_save(p_org uuid,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.task_meetings; t public.user_tasks; target uuid:=nullif(p_payload->>'taskId','')::uuid; attendees_list text[];
begin
 if not public.user_tasks_access(p_org) then raise exception 'Acesso negado.'; end if;
 select * into m from public.task_meetings where id=(p_payload->>'id')::uuid for update;
 if found and (m.organization_id<>p_org or (m.organizer_id<>auth.uid() and not public.has_role(auth.uid(),'admin'))) then raise exception 'Somente o organizador ou administrador pode editar.'; end if;
 if m.id is not null and m.revision<>coalesce((p_payload->>'revision')::integer,-1) then raise exception 'Reunião alterada. Atualize antes de salvar.'; end if;
 if target is not null then
  select * into t from public.user_tasks where id=target and organization_id=p_org;
  if t.id is null or not (public.has_role(auth.uid(),'admin') or auth.uid() in(t.assigned_to,t.requested_by,t.created_by,t.documenter_id,t.reviewer_id)) then raise exception 'Tarefa indisponível para vínculo.'; end if;
 end if;
 select coalesce(array_agg(lower(trim(value))),'{}') into attendees_list from jsonb_array_elements_text(coalesce(p_payload->'attendees','[]'));
 if array_length(attendees_list,1)>50 or exists(select 1 from unnest(attendees_list) v where v !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') then raise exception 'Informe até 50 e-mails válidos.'; end if;
 if length(coalesce(p_payload->>'agenda',''))>2000 then raise exception 'Pauta muito extensa.'; end if;
 insert into public.task_meetings(id,organization_id,organizer_id,task_id,title,starts_at,ends_at,attendees,agenda,status)
 values((p_payload->>'id')::uuid,p_org,auth.uid(),target,trim(p_payload->>'title'),(p_payload->>'startsAt')::timestamptz,(p_payload->>'endsAt')::timestamptz,attendees_list,coalesce(p_payload->>'agenda',''),coalesce(p_payload->>'status','scheduled'))
 on conflict(id) do update set task_id=excluded.task_id,title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,attendees=excluded.attendees,agenda=excluded.agenda,status=excluded.status,revision=task_meetings.revision+1,updated_at=now() returning * into m;
 if target is not null then insert into public.user_task_events(task_id,organization_id,actor_id,action,note) values(target,p_org,auth.uid(),'Reunião atualizada',m.title||' · '||to_char(m.starts_at at time zone 'America/Cuiaba','DD/MM/YYYY HH24:MI')||' · '||m.status);end if;
 return to_jsonb(m);
end $$;
revoke all on function public.task_meeting_save(uuid,jsonb) from public,anon;
grant execute on function public.task_meeting_save(uuid,jsonb) to authenticated;
commit;
