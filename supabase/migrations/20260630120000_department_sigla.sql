-- Sigla (3 letras) por área, usada na codificação de documentos:
--   SIGLA_DO_TIPO . SIGLA_DA_AREA . SEQUENCIA  (ex.: POP.ADM.001)
-- A coluna é opcional no banco (o cadastro completo de Área a torna obrigatória
-- na aplicação); a unicidade por organização é garantida na camada de aplicação.

alter table public.organization_departments
  add column if not exists sigla text;

-- Backfill best-effort das áreas existentes: primeiras 3 letras (sem acento)
-- do nome, em maiúsculas. Colisões dentro da mesma organização ficam nulas
-- para ajuste manual no cadastro de Área.
with derived as (
  select
    d.id,
    d.organization_id,
    upper(
      substring(
        regexp_replace(
          translate(
            d.name,
            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
            'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
          ),
          '[^A-Za-z]',
          '',
          'g'
        )
        from 1 for 3
      )
    ) as candidate
  from public.organization_departments d
  where d.sigla is null
),
ranked as (
  select
    id,
    candidate,
    row_number() over (
      partition by organization_id, candidate
      order by id
    ) as rn
  from derived
  where length(candidate) = 3
)
update public.organization_departments d
set sigla = r.candidate
from ranked r
where d.id = r.id
  and r.rn = 1;
