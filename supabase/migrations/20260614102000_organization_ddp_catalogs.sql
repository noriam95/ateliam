-- Organization-scoped DDP catalogs.

CREATE TABLE IF NOT EXISTS public.organization_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_departments_name_check CHECK (length(trim(name)) >= 2),
  CONSTRAINT organization_departments_unique_name UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.organization_process_owners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_process_owners_name_check CHECK (length(trim(name)) >= 2),
  CONSTRAINT organization_process_owners_unique_name UNIQUE (organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.organization_causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  impact text,
  action text,
  priority text NOT NULL DEFAULT 'Média',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_causes_title_check CHECK (length(trim(title)) >= 2),
  CONSTRAINT organization_causes_unique_title UNIQUE (organization_id, title)
);

CREATE INDEX IF NOT EXISTS organization_departments_organization_id_idx
ON public.organization_departments(organization_id);

CREATE INDEX IF NOT EXISTS organization_process_owners_organization_id_idx
ON public.organization_process_owners(organization_id);

CREATE INDEX IF NOT EXISTS organization_causes_organization_id_idx
ON public.organization_causes(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_departments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_process_owners TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_causes TO authenticated;
GRANT ALL ON public.organization_departments TO service_role;
GRANT ALL ON public.organization_process_owners TO service_role;
GRANT ALL ON public.organization_causes TO service_role;

ALTER TABLE public.organization_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_process_owners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_causes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization read departments" ON public.organization_departments;
CREATE POLICY "Organization read departments" ON public.organization_departments
FOR SELECT TO authenticated
USING (public.is_maestro(auth.uid()) OR organization_id = public.current_user_organization_id());

DROP POLICY IF EXISTS "Organization editors maintain departments" ON public.organization_departments;
CREATE POLICY "Organization editors maintain departments" ON public.organization_departments
FOR ALL TO authenticated
USING (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
)
WITH CHECK (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
);

DROP POLICY IF EXISTS "Organization read process owners" ON public.organization_process_owners;
CREATE POLICY "Organization read process owners" ON public.organization_process_owners
FOR SELECT TO authenticated
USING (public.is_maestro(auth.uid()) OR organization_id = public.current_user_organization_id());

DROP POLICY IF EXISTS "Organization editors maintain process owners" ON public.organization_process_owners;
CREATE POLICY "Organization editors maintain process owners" ON public.organization_process_owners
FOR ALL TO authenticated
USING (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
)
WITH CHECK (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
);

DROP POLICY IF EXISTS "Organization read causes" ON public.organization_causes;
CREATE POLICY "Organization read causes" ON public.organization_causes
FOR SELECT TO authenticated
USING (public.is_maestro(auth.uid()) OR organization_id = public.current_user_organization_id());

DROP POLICY IF EXISTS "Organization editors maintain causes" ON public.organization_causes;
CREATE POLICY "Organization editors maintain causes" ON public.organization_causes
FOR ALL TO authenticated
USING (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
)
WITH CHECK (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
);

DROP TRIGGER IF EXISTS organization_departments_updated_at ON public.organization_departments;
CREATE TRIGGER organization_departments_updated_at
BEFORE UPDATE ON public.organization_departments
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS organization_process_owners_updated_at ON public.organization_process_owners;
CREATE TRIGGER organization_process_owners_updated_at
BEFORE UPDATE ON public.organization_process_owners
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS organization_causes_updated_at ON public.organization_causes;
CREATE TRIGGER organization_causes_updated_at
BEFORE UPDATE ON public.organization_causes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.organization_departments (organization_id, name)
SELECT id, 'Processos' FROM public.organizations WHERE slug = 'ateliam-demo'
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_departments (organization_id, name)
SELECT id, 'Tecnologia da Informação' FROM public.organizations WHERE slug = 'ateliam-demo'
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_process_owners (organization_id, name)
SELECT id, 'Dono do processo' FROM public.organizations WHERE slug = 'ateliam-demo'
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_process_owners (organization_id, name)
SELECT id, 'Gestor da área' FROM public.organizations WHERE slug = 'ateliam-demo'
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_causes (organization_id, title, description, impact, action, priority)
SELECT
  id,
  'Informação descentralizada',
  'Dados e evidências ficam espalhados em canais diferentes.',
  'Retrabalho e baixa rastreabilidade',
  'Padronizar registro e responsáveis',
  'Alta'
FROM public.organizations
WHERE slug = 'ateliam-demo'
ON CONFLICT DO NOTHING;
