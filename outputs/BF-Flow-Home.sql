begin;
alter table public.user_tasks add column if not exists completed_at timestamptz;
create or replace function public.user_task_completion_stamp() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status='completed' and old.status is distinct from 'completed' then new.completed_at:=now();
 elsif new.status<>'completed' then new.completed_at:=null;
 else new.completed_at:=old.completed_at;
 end if;
 return new;
end $$;
drop trigger if exists user_task_completion_stamp on public.user_tasks;
create trigger user_task_completion_stamp before update on public.user_tasks for each row execute function public.user_task_completion_stamp();
-- Historical dates use explicit completion events; unknown dates stay unknown.
alter table public.user_tasks disable trigger user_task_completion_stamp;
update public.user_tasks t set completed_at=(select max(e.created_at) from public.user_task_events e where e.task_id=t.id and (e.action='Aprovação do dono registrada' or (e.action='Etapa alterada' and e.note like 'Situação: completed%'))) where t.status='completed' and t.completed_at is null;
alter table public.user_tasks enable trigger user_task_completion_stamp;
create or replace function public.user_home_dashboard(p_org uuid,p_from date,p_until date,p_chart_from date,p_chart_until date) returns jsonb
language plpgsql stable security definer set search_path=public as $$
begin
 if not public.user_tasks_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 if p_until<p_from or p_chart_until<p_chart_from or p_until-p_from>62 or p_chart_until-p_chart_from>366 then raise exception 'Período inválido.'; end if;
 return jsonb_build_object(
 'tasks',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('code',t.task_code,'assignee_name',coalesce(p.display_name,p.username,'Usuário'))) from public.user_tasks t join public.profiles p on p.id=t.assigned_to where t.organization_id=p_org and t.assigned_to=auth.uid() and t.status<>'completed' and t.starts_on<=p_until and t.due_on>=p_from),'[]'),
 'attention',(select jsonb_build_object('overdue',count(*) filter(where due_on<(now() at time zone 'America/Cuiaba')::date),'dueSoon',count(*) filter(where due_on between (now() at time zone 'America/Cuiaba')::date and (now() at time zone 'America/Cuiaba')::date+3),'review',count(*) filter(where stage='technical_review')) from public.user_tasks where organization_id=p_org and assigned_to=auth.uid() and status<>'completed'),
 'completions',coalesce((select jsonb_agg(jsonb_build_object('day',completed_day,'count',n) order by completed_day) from (select (completed_at at time zone 'America/Cuiaba')::date as completed_day,count(*) n from public.user_tasks where organization_id=p_org and assigned_to=auth.uid() and status='completed' and (completed_at at time zone 'America/Cuiaba')::date between p_chart_from and p_chart_until group by 1) c),'[]'),
 'unknownCompletions',(select count(*) from public.user_tasks where organization_id=p_org and assigned_to=auth.uid() and status='completed' and completed_at is null));
end $$;
revoke all on function public.user_home_dashboard(uuid,date,date,date,date) from public,anon;
grant execute on function public.user_home_dashboard(uuid,date,date,date,date) to authenticated;
create or replace function public.user_tasks_feed(p_org uuid,p_filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path=public as $$
declare result jsonb; isadmin boolean:=public.has_role(auth.uid(),'admin');
begin
 if not public.user_tasks_access(p_org) then raise exception 'Acesso negado à organização.'; end if;
 with filtered as (
  select t.*,t.task_code code,(select name from public.organization_departments where id=t.area_id) area_name,d.module document_module,
   a.avatar_data_url assignee_photo,coalesce(nullif(a.display_name,''),a.username,'Usuário') assignee_name,
   coalesce(nullif(r.display_name,''),r.username,'Usuário') requester_name
  from public.user_tasks t left join public.documents d on d.id=t.document_id
  join public.profiles a on a.id=t.assigned_to join public.profiles r on r.id=t.requested_by
  where t.organization_id=p_org
   and (t.assigned_to=auth.uid() or (isadmin and coalesce((p_filters->>'team')::boolean,false)) or (p_filters->>'id' is not null and ((t.requested_by=auth.uid() or t.created_by=auth.uid()) or t.documenter_id=auth.uid() or t.reviewer_id=auth.uid() or isadmin)))
   and (nullif(p_filters->>'id','') is null or t.id=(p_filters->>'id')::uuid)
   and (nullif(p_filters->>'stage','') is null or t.stage=p_filters->>'stage')
   and (nullif(p_filters->>'dueBefore','') is null or t.due_on<(p_filters->>'dueBefore')::date)
   and (nullif(p_filters->>'dueFrom','') is null or t.due_on>=(p_filters->>'dueFrom')::date)
   and (nullif(p_filters->>'dueThrough','') is null or t.due_on<=(p_filters->>'dueThrough')::date)
   and (nullif(p_filters->>'status','') is null or t.status=p_filters->>'status' or (p_filters->>'status'='open' and t.status<>'completed'))
   and (nullif(p_filters->>'kind','') is null or t.kind=p_filters->>'kind')
   and (nullif(p_filters->>'modality','') is null or t.modality=p_filters->>'modality')
   and (nullif(p_filters->>'from','') is null or t.due_on>=(p_filters->>'from')::date)
   and (nullif(p_filters->>'until','') is null or t.starts_on<=(p_filters->>'until')::date)
   and (nullif(p_filters->>'q','') is null or concat_ws(' ',t.title,t.task_code,a.display_name,r.display_name) ilike '%'||(p_filters->>'q')||'%')
 ), page as (select * from filtered order by due_on,id limit 60 offset greatest(0,coalesce((p_filters->>'offset')::integer,0)))
 select jsonb_build_object('total',(select count(*) from filtered),'tasks',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('checklist',(select coalesce(jsonb_agg(x || case when d.id is null then '{}'::jsonb else jsonb_build_object('document_name',d.name,'document_code',public.user_tasks_doc_code(d.content_inline,d.module)) end),'[]') from jsonb_array_elements(public.user_tasks_effective(p.checklist)) x left join public.documents d on d.id=nullif(x->>'document_id','')::uuid)) order by due_on,id) from page p),'[]')) into result;
 return result || jsonb_build_object(
  'userId',auth.uid(),'isAdmin',isadmin,'canCreate',isadmin or public.has_role(auth.uid(),'editor'),
  'summary',(select jsonb_build_object('mapping',count(*) filter(where kind='mapping'),'improvement',count(*) filter(where kind='improvement'),'document',count(*) filter(where kind='document'),'overdue',count(*) filter(where due_on<current_date)) from public.user_tasks where organization_id=p_org and assigned_to=auth.uid() and status<>'completed'),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.display_name,''),p.username,'Usuário'),'can_edit',public.has_role(p.id,'editor') or public.has_role(p.id,'admin')) order by p.display_name) from public.profiles p where public.user_tasks_member(p.id,p_org) or (p.id=auth.uid() and isadmin)),'[]'),
  'documents',coalesce((select jsonb_agg(to_jsonb(d)) from (select id,name,module,current_version,public.user_tasks_doc_code(content_inline,module) code from public.documents where organization_id=p_org and (p_filters ? 'documentQuery') and concat_ws(' ',name,public.user_tasks_doc_code(content_inline,module)) ilike '%'||coalesce(p_filters->>'documentQuery','')||'%' order by updated_at desc limit 40) d),'[]'),
  'events',coalesce((select jsonb_agg(to_jsonb(e)) from (select ev.id,ev.action,ev.note,ev.movement_action,ev.movement_note,ev.attachments,ev.created_at,p.avatar_data_url actor_photo,coalesce(nullif(p.display_name,''),p.username,'Usuário') actor_name from public.user_task_events ev join public.profiles p on p.id=ev.actor_id where ev.task_id=nullif(p_filters->>'id','')::uuid and ev.organization_id=p_org and exists(select 1 from public.user_tasks t where t.id=ev.task_id and (isadmin or t.assigned_to=auth.uid() or (t.requested_by=auth.uid() or t.created_by=auth.uid()) or t.documenter_id=auth.uid() or t.reviewer_id=auth.uid())) order by ev.created_at desc limit 100) e),'[]')
 );
end $$;


commit;
