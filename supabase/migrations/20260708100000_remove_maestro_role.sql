-- Remove the "maestro" role concept: admin now holds every cross-organization
-- privilege that maestro used to have. Rather than rewriting every RLS policy
-- that calls public.is_maestro(...) (there are dozens, across several
-- migrations), redefine the function itself to check for the "admin" role.
-- This keeps all existing policies correct with no other schema changes.
CREATE OR REPLACE FUNCTION public.is_maestro(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin')
$$;

-- Defensive: reassign any leftover 'maestro' rows to 'admin' (no-op if none
-- exist). Some users hold both 'maestro' and 'admin' already (the old
-- trigger granted both to the first user), so drop the now-redundant
-- 'maestro' row for those first to avoid colliding with the existing
-- 'admin' row on the (user_id, role) unique constraint.
DELETE FROM public.user_roles ur
WHERE ur.role = 'maestro'
  AND EXISTS (
    SELECT 1 FROM public.user_roles ur2
    WHERE ur2.user_id = ur.user_id AND ur2.role = 'admin'
  );

UPDATE public.user_roles SET role = 'admin' WHERE role = 'maestro';

-- Never grant 'maestro' to new users again; the trigger already stopped doing
-- this in production, but keep the migration file consistent with reality.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_org uuid;
BEGIN
  SELECT id INTO default_org FROM public.organizations ORDER BY created_at ASC LIMIT 1;

  INSERT INTO public.profiles (id, email, display_name, organization_id)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    default_org
  );

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'editor');
  END IF;

  RETURN NEW;
END;
$$;

-- Note: the 'maestro' value stays in the public.app_role enum (Postgres does
-- not support dropping enum values without recreating the type and every
-- dependent policy/column). It is simply never assigned or checked for
-- anymore. Safe to leave as-is.
