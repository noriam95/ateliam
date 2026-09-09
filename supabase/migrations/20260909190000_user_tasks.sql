begin;
-- Remove somente o bloqueio da proposta anterior; preserva seus dados.
drop trigger if exists mapping_documents_governance on public.documents;

create table public.user_tasks (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 document_id uuid not null references public.documents(id),
 title text not null check(length(trim(title)) between 2 and 200),
 kind text not null check(kind in ('mapping','improvement','document')),
 modality text check(modality in ('Sistemas','Operacional','Automação & IA','Dados / BI')),
 assigned_to uuid not null references public.profiles(id),
 requested_by uuid not null references public.profiles(id),
 documenter_id uuid not null references public.profiles(id), reviewer_id uuid references public.profiles(id),
 stage text not null default 'documentation' check(stage in ('documentation','technical_review','owner_approval','completed')),
 return_stage text check(return_stage in ('technical_review','owner_approval')), adjustment_request text not null default '',
 starts_on date not null, due_on date not null check(due_on>=starts_on),
 status text not null default 'pending' check(status in ('pending','in_progress','review','completed')),
 checklist jsonb not null default '[]',
 pending_at_transition jsonb not null default '[]',
 revision integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(kind<>'mapping' or modality is not null)
);
create table public.user_task_events (
 id uuid primary key default gen_random_uuid(), task_id uuid not null references public.user_tasks(id),
 organization_id uuid not null references public.organizations(id), actor_id uuid not null references public.profiles(id),
 action text not null, note text not null default '', created_at timestamptz not null default now()
);
create index user_tasks_assigned on public.user_tasks(organization_id,assigned_to,status,due_on);
create index user_task_events_task on public.user_task_events(task_id,created_at desc);

create function public.user_tasks_member(p_user uuid,p_org uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=p_user and organization_id=p_org)
 or exists(select 1 from public.user_organization_access where user_id=p_user and organization_id=p_org)
$$;
create function public.user_tasks_access(p_org uuid) returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.has_role(auth.uid(),'admin') or public.user_tasks_member(auth.uid(),p_org))
$$;
alter table public.user_tasks enable row level security;
alter table public.user_task_events enable row level security;
create policy user_tasks_read on public.user_tasks for select to authenticated using(public.user_tasks_access(organization_id) and (assigned_to=auth.uid() or requested_by=auth.uid() or documenter_id=auth.uid() or reviewer_id=auth.uid() or public.has_role(auth.uid(),'admin')));
create policy user_task_events_read on public.user_task_events for select to authenticated using(exists(select 1 from public.user_tasks t where t.id=task_id));
-- Não acrescenta permissões ou gatilhos aos módulos de documentos.
revoke all on public.user_tasks,public.user_task_events from anon,authenticated;
grant select on public.user_tasks,public.user_task_events to authenticated;
grant all on public.user_tasks,public.user_task_events to service_role;

create function public.user_tasks_doc_code(p_content text,p_module text) returns text
language plpgsql immutable set search_path=public as $$
declare source jsonb;
begin
 source:=coalesce(p_content,'{}')::jsonb;
 source:=coalesce(source->'modules',source);
 if p_module='bpmn' then return coalesce(source#>>'{bpmn,codigo}',''); end if;
 return coalesce(source#>>array[p_module,'meta','codigo'],'');
exception when others then return '';
end $$;

create function public.user_tasks_checklist(p_kind text,p_modality text,p_document uuid) returns jsonb
language plpgsql immutable set search_path=public as $$
declare items jsonb;
begin
 if p_kind='mapping' then
  items:='[["mapping","Preencher mapeamento"],["bpmn","Fluxograma BPMN"],["improvements","Pontos de melhoria"]]'::jsonb;
  items:=items || case p_modality
   when 'Sistemas' then '[["requirements","Requisitos do sistema"],["alignment","Alinhamento com Sistemas"]]'::jsonb
   when 'Operacional' then '[["procedure","POP ou Instrução de Trabalho"],["communication","Comunicado, quando necessário"]]'::jsonb
   when 'Automação & IA' then '[["condition","Condição das atividades"],["effort","Tempos e volumes"],["opportunities","Oportunidades de automação / IA"],["conditions","Requisitos e condições"]]'::jsonb
   when 'Dados / BI' then '[["information","Necessidades de informação"],["kpis","Indicadores e KPIs"]]'::jsonb
   else '[]'::jsonb end || '[["validation","Validação com o dono do processo"]]'::jsonb;
 elsif p_kind='improvement' then
  items:='[["document","Consultar e atualizar documento de referência"],["analysis","Análise da melhoria"],["plan","Plano de ação"],["result","Resultado e validação"]]'::jsonb;
 else items:='[["document","Preencher documento"],["review","Revisar conteúdo"],["validation","Validar documento"]]'::jsonb;
 end if;
 return (select jsonb_agg(jsonb_build_object('key',x->>0,'label',x->>1,'completed',false,'content','','document_id',case when ord=1 then p_document else null end,'saved_version',null) order by ord) from jsonb_array_elements(items) with ordinality e(x,ord));
end $$;

-- Conclusões de versões antigas são exibidas como pendentes, sem alterar o documento.
create function public.user_tasks_effective(p_items jsonb) returns jsonb
language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(x || jsonb_build_object(
  'document_module',d.module,
  'completed',coalesce((x->>'completed')::boolean,false) and not (x->>'document_id' is not null and nullif(x->>'saved_at','')::timestamptz is distinct from d.updated_at),
  'stale',coalesce((x->>'completed')::boolean,false) and x->>'document_id' is not null and nullif(x->>'saved_at','')::timestamptz is distinct from d.updated_at
 ) order by ord),'[]')
 from jsonb_array_elements(p_items) with ordinality e(x,ord)
 left join public.documents d on d.id=nullif(x->>'document_id','')::uuid
$$;

create function public.user_tasks_feed(p_org uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; isadmin boolean:=public.has_role(auth.uid(),'admin');
begin
 if not public.user_tasks_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 with filtered as (
  select t.*,public.user_tasks_doc_code(d.content_inline,d.module) code,d.module document_module,
   coalesce(nullif(a.display_name,''),a.username,'Usuário') assignee_name,
   coalesce(nullif(r.display_name,''),r.username,'Usuário') requester_name
  from public.user_tasks t join public.documents d on d.id=t.document_id
  join public.profiles a on a.id=t.assigned_to join public.profiles r on r.id=t.requested_by
  where t.organization_id=p_org
   and (t.assigned_to=auth.uid() or (isadmin and coalesce((p_filters->>'team')::boolean,false)) or (p_filters->>'id' is not null and (t.requested_by=auth.uid() or t.documenter_id=auth.uid() or t.reviewer_id=auth.uid() or isadmin)))
   and (nullif(p_filters->>'id','') is null or t.id=(p_filters->>'id')::uuid)
   and (nullif(p_filters->>'status','') is null or t.status=p_filters->>'status' or (p_filters->>'status'='open' and t.status<>'completed'))
   and (nullif(p_filters->>'kind','') is null or t.kind=p_filters->>'kind')
   and (nullif(p_filters->>'modality','') is null or t.modality=p_filters->>'modality')
   and (nullif(p_filters->>'from','') is null or t.due_on>=(p_filters->>'from')::date)
   and (nullif(p_filters->>'until','') is null or t.starts_on<=(p_filters->>'until')::date)
   and (nullif(p_filters->>'q','') is null or concat_ws(' ',t.title,public.user_tasks_doc_code(d.content_inline,d.module),a.display_name,r.display_name) ilike '%'||(p_filters->>'q')||'%')
 ), page as (select * from filtered order by due_on,id limit 60 offset greatest(0,coalesce((p_filters->>'offset')::integer,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'tasks',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('checklist',public.user_tasks_effective(p.checklist)) order by due_on,id) from page p),'[]')) into result;
 return result || jsonb_build_object(
  'userId',auth.uid(),'isAdmin',isadmin,'canCreate',isadmin or public.has_role(auth.uid(),'editor'),
  'summary',(select jsonb_build_object('mapping',count(*) filter(where kind='mapping'),'improvement',count(*) filter(where kind='improvement'),'document',count(*) filter(where kind='document'),'overdue',count(*) filter(where due_on<current_date)) from public.user_tasks where organization_id=p_org and assigned_to=auth.uid() and status<>'completed'),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),p.username,'Usuário'),'can_edit',public.has_role(p.id,'editor') or public.has_role(p.id,'admin')) order by p.display_name) from public.profiles p where public.user_tasks_member(p.id,p_org) or (p.id=auth.uid() and isadmin)),'[]'),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)) from (select id,name,module,current_version,public.user_tasks_doc_code(content_inline,module) code from public.documents where organization_id=p_org and (p_filters ? 'documentQuery') and concat_ws(' ',name,public.user_tasks_doc_code(content_inline,module)) ilike '%'||coalesce(p_filters->>'documentQuery','')||'%' order by updated_at desc limit 40) d),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select ev.id,ev.action,ev.note,ev.created_at,coalesce(nullif(p.display_name,''),p.username,'Usuário') actor_name from public.user_task_events ev join public.profiles p on p.id=ev.actor_id where ev.task_id=nullif(p_filters->>'id','')::uuid and ev.organization_id=p_org and exists(select 1 from public.user_tasks t where t.id=ev.task_id and (isadmin or t.assigned_to=auth.uid() or t.requested_by=auth.uid() or t.documenter_id=auth.uid() or t.reviewer_id=auth.uid())) order by ev.created_at desc limit 100) e),'[]')
 );
end $$;

create function public.user_tasks_command(p_org uuid,p_action text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=public as $$
declare t public.user_tasks; item jsonb; doc public.documents; target uuid; note text:=coalesce(p_payload->>'note',''); newstatus text; remaining jsonb; done boolean; updated jsonb;
begin
 if not public.user_tasks_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 if p_action='create' then
  if not (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'editor')) then raise exception 'Permissão de edição necessária.'; end if;
  select * into t from public.user_tasks where id=(p_payload->>'id')::uuid;
  if found then
   if t.organization_id<>p_org or t.requested_by<>auth.uid() then raise exception 'Identificador indisponível.'; end if;
   return jsonb_build_object('id',t.id);
  end if;
  select * into doc from public.documents where id=(p_payload->>'documentId')::uuid and organization_id=p_org;
  if not found then raise exception 'Selecione um documento desta organização.'; end if;
  if public.user_tasks_doc_code(doc.content_inline,doc.module)='' then raise exception 'O documento precisa ter seu código preenchido no módulo de origem.'; end if;
  if p_payload->>'kind'='mapping' and doc.module<>'ddp' then raise exception 'Selecione um documento de mapeamento.'; end if;
  target:=(p_payload->>'assignedTo')::uuid;
  if not (public.user_tasks_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) or not (public.has_role(target,'admin') or public.has_role(target,'editor')) then raise exception 'Selecione um responsável com permissão de edição na organização.'; end if;
  insert into public.user_tasks(id,organization_id,document_id,title,kind,modality,assigned_to,requested_by,documenter_id,starts_on,due_on,checklist)
  values((p_payload->>'id')::uuid,p_org,doc.id,trim(p_payload->>'title'),p_payload->>'kind',nullif(p_payload->>'modality',''),target,auth.uid(),target,(p_payload->>'startsOn')::date,(p_payload->>'dueOn')::date,public.user_tasks_checklist(p_payload->>'kind',p_payload->>'modality',doc.id)) returning * into t;
  insert into public.user_task_events(task_id,organization_id,actor_id,action) values(t.id,p_org,auth.uid(),'Tarefa criada');
  return jsonb_build_object('id',t.id);
 end if;
 select * into t from public.user_tasks where id=(p_payload->>'id')::uuid and organization_id=p_org for update;
 if p_action='comment' then
  if t.id is null or not (public.has_role(auth.uid(),'admin') or auth.uid() in (t.assigned_to,t.requested_by,t.documenter_id,t.reviewer_id)) then raise exception 'Comentário reservado aos participantes da tarefa.'; end if;
  if length(trim(note)) not between 1 and 10000 then raise exception 'Escreva um comentário com até 10000 caracteres.'; end if;
  insert into public.user_task_events(id,task_id,organization_id,actor_id,action,note) values((p_payload->>'commentId')::uuid,t.id,p_org,auth.uid(),'Comentário',trim(note)) on conflict(id) do nothing;
  return jsonb_build_object('id',t.id);
 end if;
 if not found or (t.assigned_to<>auth.uid() and not public.has_role(auth.uid(),'admin')) then raise exception 'Ação reservada ao responsável ou administrador.'; end if;
 if not (public.has_role(auth.uid(),'editor') or public.has_role(auth.uid(),'admin')) then raise exception 'Permissão de edição necessária.'; end if;
 if t.revision<>coalesce((p_payload->>'revision')::integer,-1) then raise exception 'A tarefa foi alterada. Feche os detalhes, atualize a lista e tente novamente.'; end if;
 if p_action='assign' then
  if not public.has_role(auth.uid(),'admin') then raise exception 'Reatribuição reservada ao administrador.'; end if;
  target:=(p_payload->>'assignedTo')::uuid;
  if not (public.user_tasks_member(target,p_org) or target=auth.uid()) or not (public.has_role(target,'editor') or public.has_role(target,'admin')) then raise exception 'Responsável inválido.'; end if;
  update public.user_tasks set assigned_to=target where id=t.id;
 elsif p_action='item' then
  if t.kind='mapping' and t.stage<>'documentation' and not public.has_role(auth.uid(),'admin') then raise exception 'Checklist disponível para edição na etapa de documentação.'; end if;
  if t.status='completed' then raise exception 'Reabra a tarefa antes de editar o checklist.'; end if;
  select x into item from jsonb_array_elements(public.user_tasks_effective(t.checklist)) x where x->>'key'=p_payload->>'key';
  if item is null then raise exception 'Item não encontrado.'; end if;
  done:=coalesce((p_payload->>'completed')::boolean,false);
  if t.kind='mapping' and item->>'key'='validation' and done then raise exception 'A conclusão deste item ocorre ao registrar a aprovação do dono do processo.'; end if;
  if nullif(p_payload->>'documentId','') is not null then
   select * into doc from public.documents where id=(p_payload->>'documentId')::uuid and organization_id=p_org;
   if not found then raise exception 'Documento fora da organização.'; end if;
   if p_payload ? 'savedAt' and doc.updated_at is distinct from (p_payload->>'savedAt')::timestamptz then raise exception 'O documento recebeu outra versão. Abra novamente antes de concluir.'; end if;
   if done and coalesce(doc.content_inline::jsonb#>>'{persistence,saveMode}','')='draft' then raise exception 'Rascunho permanece em andamento. Salve o documento definitivamente antes de concluir.'; end if;
  elsif item->>'key' in ('mapping','document') then raise exception 'O documento principal não pode ser desvinculado.';
  end if;
  if item->>'key' in ('mapping','document') and doc.id is distinct from t.document_id then raise exception 'O documento principal não pode ser substituído.'; end if;
  if done and doc.id is null and length(trim(coalesce(p_payload->>'content','')))<2 then raise exception 'Preencha o conteúdo antes de concluir o item.'; end if;
  updated:=item||jsonb_build_object('content',coalesce(p_payload->>'content',''),'document_id',doc.id,'saved_version',doc.current_version,'saved_at',doc.updated_at,'completed',done,'stale',false);
  update public.user_tasks set status=case when status='pending' then 'in_progress' else status end,checklist=(select jsonb_agg(case when x->>'key'=p_payload->>'key' then updated else x end order by ord) from jsonb_array_elements(checklist) with ordinality e(x,ord)) where id=t.id;
  note:=(item->>'label')||case when done then ': concluído' else ': salvo, pendente' end;
 elsif p_action in ('send_review','approve_review','request_adjustments','record_owner_approval','admin_move') then
  if t.kind<>'mapping' then raise exception 'Este encaminhamento se aplica a mapeamentos.'; end if;
  remaining:=(select coalesce(jsonb_agg(x->>'label'),'[]') from jsonb_array_elements(public.user_tasks_effective(t.checklist)) x where not (x->>'completed')::boolean and x->>'key'<>'validation');
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
  remaining:=(select coalesce(jsonb_agg(x->>'label'),'[]') from jsonb_array_elements(public.user_tasks_effective(t.checklist)) x where not (x->>'completed')::boolean);
  if newstatus in ('review','completed') and jsonb_array_length(remaining)>0 and not coalesce((p_payload->>'confirmPending')::boolean,false) then raise exception 'Confirme o avanço com itens pendentes.'; end if;
  update public.user_tasks set status=newstatus,pending_at_transition=case when newstatus in ('review','completed') then remaining else '[]'::jsonb end where id=t.id;
  note:='Situação: '||newstatus||case when jsonb_array_length(remaining)>0 then '. Itens pendentes: '||(select string_agg(value,', ') from jsonb_array_elements_text(remaining)) else '' end;
 else raise exception 'Ação inválida.';
 end if;
 if p_action<>'item' then
  note:=note||' Responsável: '||(select coalesce(nullif(display_name,''),username,'Usuário') from public.profiles where id=t.assigned_to)||' → '||(select coalesce(nullif(p.display_name,''),p.username,'Usuário') from public.user_tasks u join public.profiles p on p.id=u.assigned_to where u.id=t.id)||'.';
 end if;
 update public.user_tasks set revision=revision+1,updated_at=now() where id=t.id;
 insert into public.user_task_events(task_id,organization_id,actor_id,action,note) values(t.id,p_org,auth.uid(),case p_action when 'item' then 'Checklist atualizado' when 'assign' then 'Responsável alterado' when 'request_adjustments' then 'Ajustes solicitados' when 'approve_review' then 'Revisão técnica aprovada' when 'record_owner_approval' then 'Aprovação do dono registrada' else 'Etapa alterada' end,note);
 return jsonb_build_object('id',t.id);
end $$;
revoke all on function public.user_tasks_member(uuid,uuid),public.user_tasks_access(uuid),public.user_tasks_doc_code(text,text),public.user_tasks_checklist(text,text,uuid),public.user_tasks_effective(jsonb),public.user_tasks_feed(uuid,jsonb),public.user_tasks_command(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.user_tasks_access(uuid),public.user_tasks_feed(uuid,jsonb),public.user_tasks_command(uuid,text,jsonb) to authenticated;
commit;
