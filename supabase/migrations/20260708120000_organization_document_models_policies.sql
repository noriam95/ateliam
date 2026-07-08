-- organization_document_models was created with row level security enabled
-- but no policies, so every query (including the server's own upsert as the
-- logged-in user) was silently denied by Postgres. Add the same
-- read/maintain policy pair used for the other per-organization catalogs.
grant select, insert, update, delete on public.organization_document_models to authenticated;

drop policy if exists "Organization read document models" on public.organization_document_models;
create policy "Organization read document models" on public.organization_document_models
for select to authenticated
using (
  public.is_maestro(auth.uid())
  or organization_id = public.current_user_organization_id()
  or exists (
    select 1
    from public.user_organization_access access
    where access.user_id = auth.uid()
      and access.organization_id = organization_document_models.organization_id
  )
);

drop policy if exists "Organization admins maintain document models" on public.organization_document_models;
create policy "Organization admins maintain document models" on public.organization_document_models
for all to authenticated
using (
  public.is_maestro(auth.uid())
  or (
    organization_id = public.current_user_organization_id()
    and public.has_role(auth.uid(), 'admin')
  )
)
with check (
  public.is_maestro(auth.uid())
  or (
    organization_id = public.current_user_organization_id()
    and public.has_role(auth.uid(), 'admin')
  )
);
