-- Organization-scoped process registry and module document links.

CREATE TABLE IF NOT EXISTS public.organization_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_process_id uuid REFERENCES public.organization_processes(id) ON DELETE SET NULL,
  code text,
  name text NOT NULL,
  type text NOT NULL DEFAULT 'process',
  department text,
  owner text,
  description text,
  status text NOT NULL DEFAULT 'Ativo',
  current_version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_processes_name_check CHECK (length(trim(name)) >= 2),
  CONSTRAINT organization_processes_type_check CHECK (type IN ('macroprocess','process','subprocess')),
  CONSTRAINT organization_processes_status_check CHECK (status IN ('Ativo','Em revisão','Arquivado')),
  CONSTRAINT organization_processes_unique_code UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.organization_process_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  process_id uuid NOT NULL REFERENCES public.organization_processes(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_process_versions_unique UNIQUE (process_id, version_number)
);

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS primary_process_id uuid REFERENCES public.organization_processes(id);
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS primary_process_version integer;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_module_check;
ALTER TABLE public.documents ADD CONSTRAINT documents_module_check
CHECK (module IN ('bpmn','policy','diagnostic','workspace','ddp','pop'));

CREATE INDEX IF NOT EXISTS organization_processes_organization_id_idx
ON public.organization_processes(organization_id);

CREATE INDEX IF NOT EXISTS organization_processes_parent_process_id_idx
ON public.organization_processes(parent_process_id);

CREATE INDEX IF NOT EXISTS organization_process_versions_process_id_idx
ON public.organization_process_versions(process_id);

CREATE INDEX IF NOT EXISTS documents_primary_process_id_idx
ON public.documents(primary_process_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_processes TO authenticated;
GRANT SELECT, INSERT ON public.organization_process_versions TO authenticated;
GRANT ALL ON public.organization_processes TO service_role;
GRANT ALL ON public.organization_process_versions TO service_role;

ALTER TABLE public.organization_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_process_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization read processes" ON public.organization_processes;
CREATE POLICY "Organization read processes" ON public.organization_processes
FOR SELECT TO authenticated
USING (public.is_maestro(auth.uid()) OR organization_id = public.current_user_organization_id());

DROP POLICY IF EXISTS "Organization editors maintain processes" ON public.organization_processes;
CREATE POLICY "Organization editors maintain processes" ON public.organization_processes
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

DROP POLICY IF EXISTS "Organization read process versions" ON public.organization_process_versions;
CREATE POLICY "Organization read process versions" ON public.organization_process_versions
FOR SELECT TO authenticated
USING (public.is_maestro(auth.uid()) OR organization_id = public.current_user_organization_id());

DROP POLICY IF EXISTS "Organization editors insert process versions" ON public.organization_process_versions;
CREATE POLICY "Organization editors insert process versions" ON public.organization_process_versions
FOR INSERT TO authenticated
WITH CHECK (
  public.is_maestro(auth.uid())
  OR (
    organization_id = public.current_user_organization_id()
    AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'editor'))
  )
);

DROP TRIGGER IF EXISTS organization_processes_updated_at ON public.organization_processes;
CREATE TRIGGER organization_processes_updated_at
BEFORE UPDATE ON public.organization_processes
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.organization_processes (organization_id, code, name, type, department, owner, description)
SELECT id, 'PROC-001', 'Gestão de Demandas de BI Analytics', 'macroprocess', 'Tecnologia da Informação', 'Dono do processo', 'Processo corporativo de gestão de demandas.'
FROM public.organizations
WHERE slug = 'ateliam-demo'
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_process_versions (process_id, organization_id, version_number, snapshot)
SELECT
  p.id,
  p.organization_id,
  1,
  jsonb_build_object(
    'code', p.code,
    'name', p.name,
    'type', p.type,
    'department', p.department,
    'owner', p.owner,
    'description', p.description,
    'status', p.status
  )
FROM public.organization_processes p
WHERE p.code = 'PROC-001'
ON CONFLICT DO NOTHING;
