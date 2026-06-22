-- Configuração de codificação por organização.
-- Define, por tipo de cadastro (Processo, Mapeamento, POP/IT, Fluxograma),
-- se o código é gerado automaticamente (máscara + sequência) ou manual.
alter table public.organizations
  add column if not exists code_settings jsonb not null default '{}'::jsonb;

comment on column public.organizations.code_settings is
  'Regras de codificação por tipo de cadastro: { kind: { mode, mask, next } }.';
