-- Governed mapping intake. Existing documents remain legacy and are not reclassified.
begin;
create table public.mapping_coordinators (
 organization_id uuid not null references public.organizations(id), user_id uuid not null references public.profiles(id),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), primary key(organization_id,user_id)
);
create table public.mapping_demands (
 id uuid primary key default gen_random_uuid(), number bigint generated always as identity unique,
 organization_id uuid not null references public.organizations(id), title text not null check(length(trim(title)) between 2 and 200),
 purpose text not null check(length(trim(purpose)) between 2 and 10000), modality text not null check(modality in ('Sistemas','Operacional','Automação & IA','Dados / BI')),
 status text not null default 'awaiting_registration' check(status in ('awaiting_registration','registered','discovery','documentation','validation','adjustments','completed','cancelled')),
 analyst_id uuid not null references public.profiles(id), coordinator_id uuid not null references public.profiles(id), process_owner_id uuid references public.profiles(id),
 process_id uuid references public.organization_processes(id), area text not null default '', priority text not null default 'Média' check(priority in ('Baixa','Média','Alta')),
 registration_due date not null, due_date date, document_id uuid unique references public.documents(id),
 checklist jsonb not null default '[]', details jsonb not null default '{}', revision integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status in ('awaiting_registration','cancelled') or (process_owner_id is not null and process_id is not null and due_date is not null))
);
create table public.mapping_tasks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), demand_id uuid not null references public.mapping_demands(id),
 title text not null, kind text not null check(kind in ('registration','stage','manual')), assigned_to uuid not null references public.profiles(id),
 status text not null default 'pending' check(status in ('pending','in_progress','waiting','completed','cancelled')),
 due_date date, comment text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index mapping_tasks_one_active_stage on public.mapping_tasks(demand_id) where kind in ('registration','stage') and status not in ('completed','cancelled');
create table public.mapping_events (
 id uuid primary key default gen_random_uuid(), demand_id uuid not null references public.mapping_demands(id), organization_id uuid not null references public.organizations(id),
 actor_id uuid not null references public.profiles(id), action text not null, comment text not null default '', snapshot jsonb, created_at timestamptz not null default now()
);
create index mapping_demands_org on public.mapping_demands(organization_id,status,updated_at desc);
create index mapping_tasks_assignee on public.mapping_tasks(organization_id,assigned_to,status);
create index mapping_events_demand on public.mapping_events(demand_id,created_at desc);
alter table public.documents add column mapping_demand_id uuid references public.mapping_demands(id);
create index documents_mapping_demand on public.documents(mapping_demand_id);

create function public.mapping_member(p_user uuid,p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from public.profiles where id=p_user and organization_id=p_org) or exists(select 1 from public.user_organization_access where user_id=p_user and organization_id=p_org)
$$;
create function public.mapping_access(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and (public.has_role(auth.uid(),'admin') or public.mapping_member(auth.uid(),p_org))
$$;
create function public.mapping_coordinator(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
 select public.mapping_access(p_org) and (public.has_role(auth.uid(),'admin') or exists(select 1 from public.mapping_coordinators where user_id=auth.uid() and organization_id=p_org))
$$;
alter table public.mapping_coordinators enable row level security;
alter table public.mapping_demands enable row level security;
alter table public.mapping_tasks enable row level security;
alter table public.mapping_events enable row level security;
create policy mapping_coordinators_read on public.mapping_coordinators for select to authenticated using(public.mapping_access(organization_id));
create policy mapping_demands_read on public.mapping_demands for select to authenticated using(public.mapping_access(organization_id));
create policy mapping_tasks_read on public.mapping_tasks for select to authenticated using(public.mapping_access(organization_id));
create policy mapping_events_read on public.mapping_events for select to authenticated using(public.mapping_access(organization_id));
create policy mapping_linked_documents_read on public.documents for select to authenticated using(mapping_demand_id is not null and public.mapping_access(organization_id));
create policy mapping_linked_documents_update on public.documents for update to authenticated using(mapping_demand_id is not null and public.mapping_access(organization_id)) with check(mapping_demand_id is not null and public.mapping_access(organization_id));
grant select on public.mapping_coordinators,public.mapping_demands,public.mapping_tasks,public.mapping_events to authenticated;
grant all on public.mapping_coordinators,public.mapping_demands,public.mapping_tasks,public.mapping_events to service_role;
-- All writes are transactional RPCs. No direct authenticated write grants or write policies.

create function public.mapping_checklist(p_modality text) returns jsonb language plpgsql immutable set search_path=public as $$
declare spec jsonb; result jsonb;
begin
 spec := case p_modality
 when 'Sistemas' then '[["requirements","Requisitos do sistema"],["alignment","Alinhamento com Sistemas"]]'::jsonb
 when 'Operacional' then '[["procedure","POP ou Instrução de Trabalho"],["communication","Comunicado"]]'::jsonb
 when 'Automação & IA' then '[["condition","Condição das atividades"],["effort","Tempos e volumes"],["opportunities","Oportunidades de automação / IA"],["conditions","Requisitos e condições"]]'::jsonb
 when 'Dados / BI' then '[["information","Necessidades de informação"],["kpis","Indicadores e KPIs"]]'::jsonb
 else null end;
 if spec is null then raise exception 'Modalidade inválida.'; end if;
 select jsonb_agg(jsonb_build_object('key',x->>0,'label',x->>1,'optional',(x->>0='communication'),'state','pending','evidence','') order by ord) into result
 from jsonb_array_elements('[["report","Relatório do processo"],["bpmn","Fluxograma BPMN"],["improvements","Pontos de melhoria"]]'::jsonb || spec || '[["validation","Validação com o dono"]]'::jsonb) with ordinality as e(x,ord);
 return result;
end $$;

create function public.mapping_context(p_org uuid) returns jsonb language plpgsql stable security definer set search_path=public as $$
begin
 if not public.mapping_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 return jsonb_build_object('userId',auth.uid(),'organizationId',p_org,'isAdmin',public.has_role(auth.uid(),'admin'),'isCoordinator',public.mapping_coordinator(p_org),
 'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),p.username,p.email,'Usuário'),'can_edit',public.has_role(p.id,'admin') or public.has_role(p.id,'editor')) order by p.display_name) from public.profiles p where public.mapping_member(p.id,p_org) or (p.id=auth.uid() and public.has_role(auth.uid(),'admin'))),'[]'),
 'coordinators',coalesce((select jsonb_agg(user_id) from public.mapping_coordinators where organization_id=p_org),'[]'));
end $$;

create function public.mapping_command(p_org uuid,p_action text,p_payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare d public.mapping_demands; t public.mapping_tasks; target uuid; item jsonb; ck jsonb; rowkey text; newstate text; note text; nextstatus text; doct uuid; content jsonb; processname text; version_snapshot jsonb;
begin
 if not public.mapping_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 if p_action='coordinator' then
   if not public.has_role(auth.uid(),'admin') then raise exception 'Somente administradores podem definir coordenadores.'; end if;
   target:=(p_payload->>'userId')::uuid;
   if not (public.mapping_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) then raise exception 'Usuário fora da organização.'; end if;
   if (p_payload->>'enabled')::boolean then
     insert into public.mapping_coordinators(organization_id,user_id,created_by) values(p_org,target,auth.uid()) on conflict do nothing;
   else delete from public.mapping_coordinators where organization_id=p_org and user_id=target; end if;
   return jsonb_build_object('ok',true);
 end if;
 if p_action='direct' then
   if not public.mapping_coordinator(p_org) then raise exception 'Somente o Coordenador pode solicitar registros.'; end if;
   target:=(p_payload->>'analystId')::uuid;
   if not (public.mapping_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) or not (public.has_role(target,'editor') or public.has_role(target,'admin')) then raise exception 'Selecione um Analista com permissão de edição nesta organização.'; end if;
   -- Client generated UUID makes retries idempotent without duplicating a direction or task.
   select * into d from public.mapping_demands where id=(p_payload->>'id')::uuid;
   if found then
     if d.organization_id<>p_org or d.coordinator_id<>auth.uid() then raise exception 'Identificador já utilizado.'; end if;
     return to_jsonb(d);
   end if;
   insert into public.mapping_demands(id,organization_id,title,purpose,modality,analyst_id,coordinator_id,area,priority,registration_due)
   values((p_payload->>'id')::uuid,p_org,trim(p_payload->>'title'),trim(p_payload->>'purpose'),p_payload->>'modality',target,auth.uid(),coalesce(p_payload->>'area',''),coalesce(p_payload->>'priority','Média'),(p_payload->>'registrationDue')::date) returning * into d;
   insert into public.mapping_tasks(organization_id,demand_id,title,kind,assigned_to,due_date) values(p_org,d.id,'Registrar mapeamento','registration',target,d.registration_due);
   insert into public.mapping_events(organization_id,demand_id,actor_id,action,comment) values(p_org,d.id,auth.uid(),'Direcionamento criado',d.purpose);
   return to_jsonb(d);
 end if;
 select * into d from public.mapping_demands where id=(p_payload->>'id')::uuid and organization_id=p_org for update;
 if not found then raise exception 'Demanda não encontrada.'; end if;
 if p_action='register' and d.document_id is not null then
   if (d.analyst_id<>auth.uid() and not public.has_role(auth.uid(),'admin')) then raise exception 'Registro reservado ao Analista designado ou Administrador.'; end if;
   return to_jsonb(d);
 end if;
 if coalesce((p_payload->>'revision')::integer,-1)<>d.revision then raise exception 'Esta demanda foi alterada por outra pessoa. Atualize a tela e tente novamente.'; end if;
 if public.has_role(auth.uid(),'admin') and length(trim(coalesce(p_payload->>'comment',p_payload->>'evidence','')))<2 then raise exception 'Informe a justificativa da intervenção administrativa.'; end if;
 if p_action='register' then
   if d.status<>'awaiting_registration' or (d.analyst_id<>auth.uid() and not public.has_role(auth.uid(),'admin')) then raise exception 'Registro reservado ao Analista designado, após direcionamento.'; end if;
   if not (public.has_role(auth.uid(),'editor') or public.has_role(auth.uid(),'admin')) then raise exception 'Permissão de edição necessária.'; end if;
   target:=(p_payload->>'processOwnerId')::uuid;
   if not (public.mapping_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) then raise exception 'Dono do processo fora da organização.'; end if;
   select name into processname from public.organization_processes where id=(p_payload->>'processId')::uuid and organization_id=p_org;
   if not found then raise exception 'Selecione um processo desta organização.'; end if;
   update public.mapping_demands set title=trim(p_payload->>'title'),purpose=trim(p_payload->>'purpose'),modality=p_payload->>'modality',process_owner_id=target,process_id=(p_payload->>'processId')::uuid,due_date=(p_payload->>'dueDate')::date,
    status='registered',checklist=public.mapping_checklist(p_payload->>'modality') where id=d.id returning * into d;
   content:=jsonb_build_object('tipo','ddp','persistence',jsonb_build_object('saveMode','draft','draft',true),'ddp',jsonb_build_object(
    'meta',jsonb_build_object('codigo','','titulo',d.title,'subtitulo','AS IS','modalidade','AS IS','area',d.area,'versao','0','status','Em andamento','data',current_date::text),
    'overview',jsonb_build_object('objetivo',d.purpose,'escopo','','estadoAtual','','kpis','','donoProcesso',(select coalesce(display_name,username,'') from public.profiles where id=target),'volume','','frequencia','','dores','','oportunidades',''),
    'macroprocess',jsonb_build_object('processId',d.process_id,'processVersion',1,'titulo',processname,'legenda','','src',''),
    'systems','[]'::jsonb,'steps','[]'::jsonb,'sipoc',jsonb_build_object('fornecedores','','entradas','','processo','','saidas','','clientes',''),'sipocRows','[]'::jsonb,'gaps','[]'::jsonb,'nextSteps','[]'::jsonb,'glossary','[]'::jsonb));
   insert into public.documents(name,owner_id,organization_id,module,description,content_inline,primary_process_id,mapping_demand_id)
    values(d.title,auth.uid(),p_org,'ddp',d.purpose,content::text,d.process_id,d.id) returning id into doct;
   update public.mapping_demands set document_id=doct where id=d.id;
   update public.mapping_demands set checklist=(select jsonb_agg(case when x->>'key'='report' then x||jsonb_build_object('document_id',doct) else x end order by ord) from jsonb_array_elements(checklist) with ordinality e(x,ord)) where id=d.id;
   update public.mapping_tasks set status='completed',updated_at=now() where demand_id=d.id and kind='registration';
   insert into public.mapping_tasks(organization_id,demand_id,title,kind,assigned_to,due_date) values(p_org,d.id,'Iniciar levantamento','stage',d.analyst_id,d.due_date);
 elsif p_action='checklist' then
   if (d.analyst_id<>auth.uid() and not public.has_role(auth.uid(),'admin')) or d.status not in ('registered','discovery','documentation','adjustments') then raise exception 'Somente o Analista pode atualizar entregas antes da validação.'; end if;
   rowkey:=p_payload->>'key'; newstate:=p_payload->>'state'; note:=trim(coalesce(p_payload->>'evidence',''));
   select value into item from jsonb_array_elements(d.checklist) where value->>'key'=rowkey;
   if item is null or rowkey='validation' or newstate not in ('pending','done','not_applicable') then raise exception 'Item ou situação inválida.'; end if;
   if newstate='not_applicable' and not (item->>'optional')::boolean then raise exception 'Esta entrega é obrigatória.'; end if;
   if newstate in ('done','not_applicable') and length(note)<2 then raise exception 'Registre a evidência ou justificativa da entrega.'; end if;
   doct:=nullif(p_payload->>'documentId','')::uuid;
   if doct is not null and not exists(select 1 from public.documents where id=doct and organization_id=p_org and (mapping_demand_id is null or mapping_demand_id=d.id)) then raise exception 'Documento indisponível para esta demanda.'; end if;
   if doct is not null then
     perform 1 from public.documents where id=doct for update;
     if exists(select 1 from public.documents where id=doct and mapping_demand_id is not null and mapping_demand_id<>d.id) then raise exception 'Documento já vinculado a outra demanda.'; end if;
     update public.documents set mapping_demand_id=d.id where id=doct;
   end if;
   select jsonb_agg(case when x->>'key'=rowkey then x||jsonb_build_object('state',newstate,'evidence',note,'document_id',doct) else x end order by ord) into ck from jsonb_array_elements(d.checklist) with ordinality e(x,ord);
   update public.mapping_demands set checklist=ck where id=d.id;
 elsif p_action='details' then
   if (d.analyst_id<>auth.uid() and not public.has_role(auth.uid(),'admin')) or d.status not in ('registered','discovery','documentation','adjustments') then raise exception 'Documentação disponível somente ao Analista nesta etapa.'; end if;
   if jsonb_typeof(p_payload->'details')<>'object' or length((p_payload->'details')::text)>100000 then raise exception 'Conteúdo inválido.'; end if;
   update public.mapping_demands set details=p_payload->'details' where id=d.id;
 elsif p_action='transition' then
   nextstatus:=p_payload->>'status'; note:=trim(coalesce(p_payload->>'comment',''));
   if d.status='validation' then
     if (d.process_owner_id<>auth.uid() and not public.has_role(auth.uid(),'admin')) then raise exception 'Somente o dono do processo pode aprovar ou devolver.'; end if;
     if nextstatus not in ('adjustments','completed') or length(note)<2 then raise exception 'Informe o parecer de validação.'; end if;
   else
     if (d.analyst_id<>auth.uid() and not public.has_role(auth.uid(),'admin')) then raise exception 'Somente o Analista designado pode avançar a documentação.'; end if;
     if not ((d.status='registered' and nextstatus='discovery') or (d.status='discovery' and nextstatus='documentation') or (d.status in ('documentation','adjustments') and nextstatus='validation')) then raise exception 'Transição de etapa inválida.'; end if;
   end if;
   if nextstatus in ('validation','completed') and exists(select 1 from jsonb_array_elements(d.checklist) x where x->>'key'<>'validation' and not (x->>'state'='done' or ((x->>'optional')::boolean and x->>'state'='not_applicable' and length(trim(x->>'evidence'))>=2))) then raise exception 'Conclua as entregas obrigatórias antes de validar.'; end if;
   if nextstatus='completed' and exists(select 1 from public.mapping_tasks where demand_id=d.id and kind='manual' and status not in ('completed','cancelled')) then raise exception 'Existem tarefas complementares pendentes.'; end if;
   if nextstatus='completed' then
     -- Preserve the exact reviewed contents, not just a checkbox or a mutable URL.
     select jsonb_build_object('checklist',d.checklist,'details',d.details,'documents',coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'version',current_version,'content',content_inline)),'[]')) into version_snapshot from public.documents where mapping_demand_id=d.id;
     select jsonb_agg(case when x->>'key'='validation' then x||jsonb_build_object('state','done','evidence',note) else x end order by ord) into ck from jsonb_array_elements(d.checklist) with ordinality e(x,ord);
     update public.mapping_demands set checklist=ck where id=d.id;
   end if;
   update public.mapping_demands set status=nextstatus where id=d.id;
   update public.mapping_tasks set status='completed',comment=note,updated_at=now() where demand_id=d.id and kind='stage' and status not in ('completed','cancelled');
   if nextstatus<>'completed' then insert into public.mapping_tasks(organization_id,demand_id,title,kind,assigned_to,due_date) values(p_org,d.id,case nextstatus when 'discovery' then 'Realizar entrevistas' when 'documentation' then 'Estruturar entregáveis' when 'validation' then 'Validar documentação' else 'Responder aos ajustes' end,'stage',case when nextstatus='validation' then d.process_owner_id else d.analyst_id end,d.due_date); end if;
 elsif p_action='task_create' then
   if not (d.analyst_id=auth.uid() or public.mapping_coordinator(p_org)) or d.status in ('completed','cancelled') then raise exception 'Sem permissão para criar tarefas nesta demanda.'; end if;
   target:=(p_payload->>'assignedTo')::uuid;
   if not (public.mapping_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) or length(trim(p_payload->>'title'))<2 then raise exception 'Informe tarefa e responsável válidos.'; end if;
   insert into public.mapping_tasks(organization_id,demand_id,title,kind,assigned_to,due_date) values(p_org,d.id,trim(p_payload->>'title'),'manual',target,(p_payload->>'dueDate')::date);
 elsif p_action='task_update' then
   select * into t from public.mapping_tasks where id=(p_payload->>'taskId')::uuid and demand_id=d.id for update;
   if not found or (t.assigned_to<>auth.uid() and not public.has_role(auth.uid(),'admin')) or t.kind<>'manual' or d.status in ('completed','cancelled') then raise exception 'Esta tarefa é controlada pelo fluxo ou pertence a outro usuário.'; end if;
   if p_payload->>'status' not in ('pending','in_progress','waiting','completed') then raise exception 'Situação de tarefa inválida.'; end if;
   note:=trim(coalesce(p_payload->>'comment',''));
   if p_payload->>'status'='completed' and length(note)<2 then raise exception 'Descreva o resultado da tarefa.'; end if;
   update public.mapping_tasks set status=p_payload->>'status',comment=note,updated_at=now() where id=t.id;
 elsif p_action='take_task' then
   if not public.has_role(auth.uid(),'admin') or d.status in ('completed','cancelled') then raise exception 'Somente o Administrador pode assumir tarefas abertas.'; end if;
   select * into t from public.mapping_tasks where id=(p_payload->>'taskId')::uuid and demand_id=d.id for update;
   if not found or t.status in ('completed','cancelled') then raise exception 'Tarefa não está aberta.'; end if;
   update public.mapping_tasks set assigned_to=auth.uid(),updated_at=now() where id=t.id;
   if t.kind='registration' or (t.kind='stage' and d.status<>'validation') then
     update public.mapping_demands set analyst_id=auth.uid() where id=d.id;
   elsif t.kind='stage' and d.status='validation' then
     update public.mapping_demands set process_owner_id=auth.uid() where id=d.id;
   end if;
 elsif p_action='reassign' then
   if not public.mapping_coordinator(p_org) or d.status in ('completed','cancelled','validation') then raise exception 'Redistribuição disponível ao Coordenador antes da validação.'; end if;
   target:=(p_payload->>'analystId')::uuid;
   if not (public.mapping_member(target,p_org) or (target=auth.uid() and public.has_role(auth.uid(),'admin'))) or not (public.has_role(target,'admin') or public.has_role(target,'editor')) then raise exception 'Analista inválido.'; end if;
   if length(trim(coalesce(p_payload->>'comment','')))<2 then raise exception 'Informe a justificativa da redistribuição.'; end if;
   update public.mapping_demands set analyst_id=target where id=d.id;
   update public.mapping_tasks set assigned_to=target,updated_at=now() where demand_id=d.id and kind in ('registration','stage') and status not in ('completed','cancelled');
 elsif p_action='cancel' then
   if not public.mapping_coordinator(p_org) or d.status in ('completed','cancelled') then raise exception 'Cancelamento reservado ao Coordenador em demandas abertas.'; end if;
   if length(trim(coalesce(p_payload->>'comment','')))<2 then raise exception 'Informe o motivo do cancelamento.'; end if;
   update public.mapping_demands set status='cancelled' where id=d.id;
   update public.mapping_tasks set status='cancelled',updated_at=now() where demand_id=d.id and status not in ('completed','cancelled');
 else raise exception 'Ação desconhecida.';
 end if;
 update public.mapping_demands set revision=revision+1,updated_at=now() where id=d.id returning * into d;
 insert into public.mapping_events(organization_id,demand_id,actor_id,action,comment,snapshot) values(p_org,d.id,auth.uid(),p_action,coalesce(p_payload->>'comment',p_payload->>'evidence',''),coalesce(version_snapshot,jsonb_build_object('status',d.status,'revision',d.revision,'modality',d.modality,'analyst_id',d.analyst_id,'checklist',d.checklist)));
 return to_jsonb(d);
end $$;

create function public.mapping_document_guard() returns trigger language plpgsql security definer set search_path=public as $$
declare d public.mapping_demands;
begin
 if tg_op='DELETE' then
   if old.mapping_demand_id is not null then raise exception 'Documento vinculado a uma demanda. Preserve o histórico e cancele a demanda quando necessário.'; end if;
   return old;
 end if;
 if tg_op='INSERT' and new.module='ddp' and new.mapping_demand_id is null then raise exception 'Crie o mapeamento pela tarefa de registro direcionada pelo Coordenador.'; end if;
 if tg_op='UPDATE' then
   if old.mapping_demand_id is not null and (new.mapping_demand_id is distinct from old.mapping_demand_id or new.organization_id is distinct from old.organization_id or new.module is distinct from old.module) then raise exception 'O vínculo da demanda não pode ser removido ou transferido.'; end if;
   if old.module<>'ddp' and new.module='ddp' and new.mapping_demand_id is null then raise exception 'Mapeamento exige direcionamento.'; end if;
 end if;
 if new.mapping_demand_id is not null then
   select * into d from public.mapping_demands where id=new.mapping_demand_id for update;
   if not found or d.organization_id<>new.organization_id or (d.analyst_id is distinct from auth.uid() and not public.has_role(auth.uid(),'admin')) then raise exception 'Documento reservado ao Analista da demanda e à organização correta.'; end if;
   if d.status not in ('registered','discovery','documentation','adjustments') then raise exception 'Documento bloqueado durante validação, conclusão ou cancelamento.'; end if;
   -- A changed document invalidates the matching completion check, preserving version accuracy.
   if tg_op='UPDATE' and new.content_inline is distinct from old.content_inline then
     update public.mapping_demands set checklist=(select jsonb_agg(case when (x->>'document_id')=new.id::text or (new.id=d.document_id and x->>'key'='report') then x||jsonb_build_object('state','pending') else x end order by ord) from jsonb_array_elements(checklist) with ordinality e(x,ord)),revision=revision+1,updated_at=now() where id=d.id;
     insert into public.mapping_events(organization_id,demand_id,actor_id,action,comment) values(d.organization_id,d.id,auth.uid(),'Documento atualizado',new.name);
   end if;
 end if;
 return new;
end $$;
create trigger mapping_documents_governance before insert or update or delete on public.documents for each row execute function public.mapping_document_guard();
revoke all on function public.mapping_member(uuid,uuid),public.mapping_access(uuid),public.mapping_coordinator(uuid),public.mapping_checklist(text),public.mapping_context(uuid),public.mapping_command(uuid,text,jsonb),public.mapping_document_guard() from public,anon;
grant execute on function public.mapping_access(uuid),public.mapping_coordinator(uuid),public.mapping_context(uuid),public.mapping_command(uuid,text,jsonb) to authenticated;
commit;
