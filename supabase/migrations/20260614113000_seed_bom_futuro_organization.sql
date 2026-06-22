-- Seed the reference organization used by the first workspace.

INSERT INTO public.organizations (name, slug, word_header_color, logo_data_url)
VALUES (
  'Bom Futuro',
  'bom-futuro',
  '1B5E3C',
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 96"><rect width="360" height="96" rx="14" fill="%231B5E3C"/><circle cx="52" cy="48" r="23" fill="%23C9CCCB"/><path d="M52 25a23 23 0 0 1 23 23H52z" fill="%23FFFFFF"/><text x="92" y="58" font-family="Arial, sans-serif" font-size="30" font-weight="700" fill="%23FFFFFF">Bom Futuro</text></svg>'
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  word_header_color = EXCLUDED.word_header_color,
  logo_data_url = EXCLUDED.logo_data_url,
  updated_at = now();

UPDATE public.profiles
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'bom-futuro')
WHERE organization_id = (SELECT id FROM public.organizations WHERE slug = 'ateliam-demo')
   OR organization_id IS NULL;

UPDATE public.documents
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'bom-futuro')
WHERE organization_id = (SELECT id FROM public.organizations WHERE slug = 'ateliam-demo')
   OR organization_id IS NULL;

INSERT INTO public.organization_departments (organization_id, name)
SELECT org.id, dept.name
FROM public.organizations org
CROSS JOIN (
  VALUES ('Tecnologia da Informação'), ('Processos'), ('Administrativo')
) AS dept(name)
WHERE org.slug = 'bom-futuro'
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_process_owners (organization_id, name)
SELECT org.id, owner.name
FROM public.organizations org
CROSS JOIN (
  VALUES ('Dono do processo'), ('Gestor da área'), ('PMO')
) AS owner(name)
WHERE org.slug = 'bom-futuro'
ON CONFLICT DO NOTHING;

INSERT INTO public.organization_processes (
  organization_id,
  code,
  name,
  type,
  department,
  owner,
  description,
  status
)
SELECT
  org.id,
  'PROC-001',
  'Gestão de Demandas de BI Analytics',
  'macroprocess',
  'Tecnologia da Informação',
  'Dono do processo',
  'Processo corporativo de gestão, priorização e atendimento de demandas de BI e Analytics.',
  'Ativo'
FROM public.organizations org
WHERE org.slug = 'bom-futuro'
ON CONFLICT (organization_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  type = EXCLUDED.type,
  department = EXCLUDED.department,
  owner = EXCLUDED.owner,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO public.organization_process_versions (
  process_id,
  organization_id,
  version_number,
  snapshot
)
SELECT
  process.id,
  process.organization_id,
  process.current_version,
  jsonb_build_object(
    'code', process.code,
    'name', process.name,
    'type', process.type,
    'parent_process_id', process.parent_process_id,
    'department', process.department,
    'owner', process.owner,
    'description', process.description,
    'status', process.status
  )
FROM public.organization_processes process
JOIN public.organizations org ON org.id = process.organization_id
WHERE org.slug = 'bom-futuro'
  AND process.code = 'PROC-001'
  AND NOT EXISTS (
    SELECT 1
    FROM public.organization_process_versions version
    WHERE version.process_id = process.id
      AND version.version_number = process.current_version
  );
