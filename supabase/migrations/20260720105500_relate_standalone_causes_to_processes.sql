ALTER TABLE public.organization_causes
  ADD COLUMN IF NOT EXISTS process_id uuid
  REFERENCES public.organization_processes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organization_causes_process_id_idx
  ON public.organization_causes(process_id);

NOTIFY pgrst, 'reload schema';
