begin;

-- Avoid the documents -> document_view_group_access -> documents RLS cycle.
-- Reads of access exceptions are scoped through group membership only.
drop policy if exists "Organization members can read document view groups"
  on public.document_view_group_access;
drop policy if exists "Organization admins manage document view groups"
  on public.document_view_group_access;

create policy "Organization members can read document view groups"
  on public.document_view_group_access
  for select to authenticated
  using (
    exists (
      select 1
      from public.organization_view_groups g
      where g.id = document_view_group_access.group_id
        and g.organization_id = public.current_user_organization_id()
        and (
          public.has_role(auth.uid(), 'admin')
          or exists (
            select 1
            from public.organization_view_group_users gu
            where gu.group_id = g.id
              and gu.user_id = auth.uid()
          )
        )
    )
  );

-- Only admins may change exceptions. This SECURITY DEFINER helper verifies
-- both the document and group belong to the admin's organization without
-- recursively evaluating documents RLS.
create or replace function public.can_manage_document_view_group_access(
  _document_id uuid,
  _group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
set row_security = off
as $$
  select public.has_role(auth.uid(), 'admin')
    and exists (
      select 1
      from public.documents d
      join public.organization_view_groups g
        on g.id = _group_id
       and g.organization_id = d.organization_id
      where d.id = _document_id
        and d.organization_id = public.current_user_organization_id()
    );
$$;

revoke all on function public.can_manage_document_view_group_access(uuid, uuid) from public;
grant execute on function public.can_manage_document_view_group_access(uuid, uuid) to authenticated;

drop policy if exists "Organization admins insert document view groups"
  on public.document_view_group_access;
create policy "Organization admins insert document view groups"
  on public.document_view_group_access
  for insert to authenticated
  with check (
    public.can_manage_document_view_group_access(document_id, group_id)
  );

drop policy if exists "Organization admins update document view groups"
  on public.document_view_group_access;
create policy "Organization admins update document view groups"
  on public.document_view_group_access
  for update to authenticated
  using (
    public.can_manage_document_view_group_access(document_id, group_id)
  )
  with check (
    public.can_manage_document_view_group_access(document_id, group_id)
  );

drop policy if exists "Organization admins delete document view groups"
  on public.document_view_group_access;
create policy "Organization admins delete document view groups"
  on public.document_view_group_access
  for delete to authenticated
  using (
    public.can_manage_document_view_group_access(document_id, group_id)
  );

commit;
