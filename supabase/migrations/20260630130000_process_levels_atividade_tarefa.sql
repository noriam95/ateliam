-- Suporte completo aos 5 níveis da arquitetura de processos:
-- Macroprocesso › Processo › Subprocesso › Atividade › Tarefa.
--
-- Antes desta migração, tanto a tabela de categorias quanto a de processos
-- restringiam o código/tipo a apenas 3 níveis, de modo que "Atividade" e
-- "Tarefa" nunca apareciam em Cadastros › Categorias de Processo.

-- 1) Permitir os novos níveis na tabela de categorias de processo.
alter table public.organization_process_types
  drop constraint if exists organization_process_types_code_check;
alter table public.organization_process_types
  add constraint organization_process_types_code_check
  check (code in ('macroprocess', 'process', 'subprocess', 'atividade', 'tarefa'));

-- 2) Permitir os novos níveis nos processos cadastrados.
alter table public.organization_processes
  drop constraint if exists organization_processes_type_check;
alter table public.organization_processes
  add constraint organization_processes_type_check
  check (type in ('macroprocess', 'process', 'subprocess', 'atividade', 'tarefa'));

-- 3) Semear Atividade e Tarefa em todas as organizações já existentes.
insert into public.organization_process_types (organization_id, code, label)
select org.id, defaults.code, defaults.label
from public.organizations org
cross join (
  values
    ('atividade', 'Atividade'),
    ('tarefa', 'Tarefa')
) as defaults(code, label)
on conflict (organization_id, code) do nothing;
