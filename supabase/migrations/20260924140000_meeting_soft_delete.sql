begin;
alter table public.task_meetings add column if not exists deleted_at timestamptz;
alter table public.task_meetings add column if not exists deleted_by uuid references public.profiles(id);

create table public.task_meeting_events (
 id uuid primary key default gen_random_uuid(),
 meeting_id uuid not null references public.task_meetings(id),
 actor_id uuid not null references public.profiles(id),
 action text not null check (action in ('delete','restore')),
 created_at timestamptz not null default now()
);
alter table public.task_meeting_events enable row level security;
create policy task_meeting_events_read on public.task_meeting_events for select to authenticated
 using (exists (select 1 from public.task_meetings m where m.id=meeting_id));
revoke all on public.task_meeting_events from public,anon,authenticated;
grant select on public.task_meeting_events to authenticated;

create function public.task_meeting_visibility(p_org uuid,p_id uuid,p_revision integer,p_action text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m public.task_meetings;
begin
 if auth.uid() is null or not public.user_tasks_access(p_org) then raise exception 'Acesso negado.'; end if;
 if p_action is null or p_action not in ('delete','restore') then raise exception 'Ação inválida.'; end if;
 select * into m from public.task_meetings where id=p_id and organization_id=p_org for update;
 if not found then raise exception 'Reunião indisponível.'; end if;
 if m.organizer_id<>auth.uid() and not public.has_role(auth.uid(),'admin') then
  raise exception 'Somente o organizador ou administrador pode excluir ou restaurar esta reunião.';
 end if;
 if (p_action='delete' and m.deleted_at is not null) or (p_action='restore' and m.deleted_at is null) then return to_jsonb(m); end if;
 if p_revision is null or m.revision<>p_revision then raise exception 'Reunião alterada. Atualize antes de continuar.'; end if;
 update public.task_meetings set
  deleted_at=case when p_action='delete' then now() else null end,
  deleted_by=case when p_action='delete' then auth.uid() else null end,
  revision=revision+1,updated_at=now()
 where id=m.id returning * into m;
 insert into public.task_meeting_events(meeting_id,actor_id,action) values(m.id,auth.uid(),p_action);
 if m.task_id is not null then
  insert into public.user_task_events(task_id,organization_id,actor_id,action,note)
  values(m.task_id,p_org,auth.uid(),case when p_action='delete' then 'Reunião excluída' else 'Reunião restaurada' end,m.title);
 end if;
 return to_jsonb(m);
end $$;
revoke all on function public.task_meeting_visibility(uuid,uuid,integer,text) from public,anon;
grant execute on function public.task_meeting_visibility(uuid,uuid,integer,text) to authenticated;

create function public.prevent_deleted_meeting_edit() returns trigger language plpgsql set search_path=public as $$
begin
 if old.deleted_at is not null and new.deleted_at is not null then
  raise exception 'Esta reunião foi excluída. Restaure antes de editar.';
 end if;
 return new;
end $$;
create trigger prevent_deleted_meeting_edit before update on public.task_meetings
 for each row execute function public.prevent_deleted_meeting_edit();
commit;
