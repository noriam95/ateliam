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
