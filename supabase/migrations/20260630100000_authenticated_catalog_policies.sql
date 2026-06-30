grant select, insert, update, delete on public.organization_units to authenticated;
grant select, insert, update, delete on public.user_organization_access to authenticated;
grant select, insert, update, delete on public.organization_value_chains to authenticated;
grant select, insert, update, delete on public.organization_process_types to authenticated;

drop policy if exists "Organization read units" on public.organization_units;
create policy "Organization read units" on public.organization_units
for select to authenticated
using (
  public.is_maestro(auth.uid())
  or organization_id = public.current_user_organization_id()
  or exists (
    select 1
    from public.user_organization_access access
    where access.user_id = auth.uid()
      and access.organization_id = organization_units.organization_id
  )
);

drop policy if exists "Organization admins maintain units" on public.organization_units;
create policy "Organization admins maintain units" on public.organization_units
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

drop policy if exists "Users read own organization access" on public.user_organization_access;
create policy "Users read own organization access" on public.user_organization_access
for select to authenticated
using (
  public.is_maestro(auth.uid())
  or user_id = auth.uid()
  or (
    organization_id = public.current_user_organization_id()
    and public.has_role(auth.uid(), 'admin')
  )
);

drop policy if exists "Organization admins maintain access" on public.user_organization_access;
create policy "Organization admins maintain access" on public.user_organization_access
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

drop policy if exists "Organization read value chains" on public.organization_value_chains;
create policy "Organization read value chains" on public.organization_value_chains
for select to authenticated
using (
  public.is_maestro(auth.uid())
  or organization_id = public.current_user_organization_id()
  or exists (
    select 1
    from public.user_organization_access access
    where access.user_id = auth.uid()
      and access.organization_id = organization_value_chains.organization_id
  )
);

drop policy if exists "Organization editors maintain value chains" on public.organization_value_chains;
create policy "Organization editors maintain value chains" on public.organization_value_chains
for all to authenticated
using (
  public.is_maestro(auth.uid())
  or (
    organization_id = public.current_user_organization_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'))
  )
)
with check (
  public.is_maestro(auth.uid())
  or (
    organization_id = public.current_user_organization_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'))
  )
);

drop policy if exists "Organization read process types" on public.organization_process_types;
create policy "Organization read process types" on public.organization_process_types
for select to authenticated
using (
  public.is_maestro(auth.uid())
  or organization_id = public.current_user_organization_id()
  or exists (
    select 1
    from public.user_organization_access access
    where access.user_id = auth.uid()
      and access.organization_id = organization_process_types.organization_id
  )
);

drop policy if exists "Organization editors maintain process types" on public.organization_process_types;
create policy "Organization editors maintain process types" on public.organization_process_types
for all to authenticated
using (
  public.is_maestro(auth.uid())
  or (
    organization_id = public.current_user_organization_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'))
  )
)
with check (
  public.is_maestro(auth.uid())
  or (
    organization_id = public.current_user_organization_id()
    and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'))
  )
);
