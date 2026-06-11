ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'bpmn';
ALTER TABLE public.documents ADD CONSTRAINT documents_module_check CHECK (module IN ('bpmn','policy','diagnostic'));
CREATE INDEX IF NOT EXISTS documents_module_idx ON public.documents(module);