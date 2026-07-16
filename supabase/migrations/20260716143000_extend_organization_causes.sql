ALTER TABLE public.organization_causes
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Não iniciada',
  ADD COLUMN IF NOT EXISTS responsible text,
  ADD COLUMN IF NOT EXISTS due_date text,
  ADD COLUMN IF NOT EXISTS comments jsonb NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.organization_causes
SET status = CASE
  WHEN lower(status) LIKE '%andamento%' THEN 'Em andamento'
  WHEN lower(status) LIKE '%conclu%' OR lower(status) LIKE '%encerr%' THEN 'Encerrado'
  WHEN lower(status) LIKE '%cancel%' THEN 'Cancelada'
  ELSE 'Não iniciada'
END;

ALTER TABLE public.organization_causes
  DROP CONSTRAINT IF EXISTS organization_causes_status_check;

ALTER TABLE public.organization_causes
  ADD CONSTRAINT organization_causes_status_check
  CHECK (status IN ('Não iniciada', 'Em andamento', 'Encerrado', 'Cancelada'));

NOTIFY pgrst, 'reload schema';
