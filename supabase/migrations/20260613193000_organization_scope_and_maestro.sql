-- Multi-organization scope and the system-level Maestro Ateliam role.

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  logo_data_url text,
  word_header_color text NOT NULL DEFAULT '1D1D1F',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organizations_header_color_check CHECK (word_header_color ~ '^[0-9A-Fa-f]{6}$')
);

GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

INSERT INTO public.organizations (name, slug, word_header_color)
VALUES ('Ateliam Demo', 'ateliam-demo', '1D1D1F')
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.organizations(id);

UPDATE public.profiles
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'ateliam-demo' LIMIT 1)
WHERE organization_id IS NULL;

UPDATE public.documents d
SET organization_id = COALESCE(
  (SELECT p.organization_id FROM public.profiles p WHERE p.id = d.owner_id),
  (SELECT id FROM public.organizations WHERE slug = 'ateliam-demo' LIMIT 1)
)
WHERE d.organization_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE public.documents ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_organization_id_idx ON public.profiles(organization_id);
CREATE INDEX IF NOT EXISTS documents_organization_id_idx ON public.documents(organization_id);

CREATE OR REPLACE FUNCTION public.current_user_organization_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM public.profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_maestro(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'maestro')
$$;

DROP POLICY IF EXISTS "Organizations readable by scoped users" ON public.organizations;
CREATE POLICY "Organizations readable by scoped users" ON public.organizations
FOR SELECT TO authenticated
USING (public.is_maestro(auth.uid()) OR id = public.current_user_organization_id());

DROP POLICY IF EXISTS "Maestros insert organizations" ON public.organizations;
CREATE POLICY "Maestros insert organizations" ON public.organizations
FOR INSERT TO authenticated
WITH CHECK (public.is_maestro(auth.uid()));

DROP POLICY IF EXISTS "Maestros or org admins update organizations" ON public.organizations;
CREATE POLICY "Maestros or org admins update organizations" ON public.organizations
FOR UPDATE TO authenticated
USING (
  public.is_maestro(auth.uid())
  OR (id = public.current_user_organization_id() AND public.has_role(auth.uid(), 'admin'))
)
WITH CHECK (
  public.is_maestro(auth.uid())
  OR (id = public.current_user_organization_id() AND public.has_role(auth.uid(), 'admin'))
);

DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;
DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Profiles readable by organization" ON public.profiles
FOR SELECT TO authenticated
USING (public.is_maestro(auth.uid()) OR organization_id = public.current_user_organization_id());
CREATE POLICY "Users update own profile" ON public.profiles
FOR UPDATE TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id AND organization_id = public.current_user_organization_id());
CREATE POLICY "Users insert own profile" ON public.profiles
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = id AND organization_id = public.current_user_organization_id());

DROP POLICY IF EXISTS "Auth can read documents" ON public.documents;
DROP POLICY IF EXISTS "Auth can insert documents" ON public.documents;
DROP POLICY IF EXISTS "Owners or admins update" ON public.documents;
DROP POLICY IF EXISTS "Owners or admins delete" ON public.documents;
CREATE POLICY "Organization can read documents" ON public.documents
FOR SELECT TO authenticated
USING (public.is_maestro(auth.uid()) OR organization_id = public.current_user_organization_id());
CREATE POLICY "Organization can insert documents" ON public.documents
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = owner_id
  AND (public.is_maestro(auth.uid()) OR organization_id = public.current_user_organization_id())
);
CREATE POLICY "Organization editors update documents" ON public.documents
FOR UPDATE TO authenticated
USING (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
)
WITH CHECK (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
);
CREATE POLICY "Organization admins delete documents" ON public.documents
FOR DELETE TO authenticated
USING (
  public.is_maestro(auth.uid())
  OR (organization_id = public.current_user_organization_id() AND (auth.uid() = owner_id OR public.has_role(auth.uid(), 'admin')))
);

DROP POLICY IF EXISTS "Auth read versions" ON public.document_versions;
DROP POLICY IF EXISTS "Auth insert versions" ON public.document_versions;
CREATE POLICY "Organization read versions" ON public.document_versions
FOR SELECT TO authenticated
USING (
  public.is_maestro(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND d.organization_id = public.current_user_organization_id()
  )
);
CREATE POLICY "Organization insert versions" ON public.document_versions
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = author_id
  AND EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_id AND d.organization_id = public.current_user_organization_id()
  )
);

DROP POLICY IF EXISTS "Auth reads config" ON public.app_config;
DROP POLICY IF EXISTS "Admins update config" ON public.app_config;
CREATE POLICY "Auth reads config" ON public.app_config FOR SELECT TO authenticated USING (true);
CREATE POLICY "Maestros update global config" ON public.app_config
FOR ALL TO authenticated
USING (public.is_maestro(auth.uid()))
WITH CHECK (public.is_maestro(auth.uid()));

DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
BEFORE UPDATE ON public.organizations
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  default_org uuid;
BEGIN
  SELECT id INTO default_org FROM public.organizations WHERE slug = 'ateliam-demo' LIMIT 1;

  INSERT INTO public.profiles (id, email, display_name, organization_id)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), default_org);

  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'maestro') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'maestro');
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSIF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'editor');
  END IF;
  RETURN NEW;
END $$;
