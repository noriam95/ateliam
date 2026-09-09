---
version: alpha
name: BF Flow
description: Gestão de processos e mapeamentos Bom Futuro
colors:
  primary: "oklch(0.69 0.13 78)"
  background: "oklch(0.975 0.002 265)"
  foreground: "oklch(0.235 0.006 265)"
  card: "oklch(0.995 0.001 265)"
typography:
  sans:
    fontFamily: "Geist, Aptos, Segoe UI Variable Text, system-ui, sans-serif"
  mono:
    fontFamily: "Geist Mono, IBM Plex Mono, ui-monospace, monospace"
rounded:
  DEFAULT: "0.625rem"
  sm: "6px"
spacing:
  section-gap: "20px"
components:
  button: {}
  card: {}
  dialog: {}
  input: {}
  navigation: {}
---

# BF Flow

## Direção visual

A interface existente é a referência: áreas claras, bordas discretas, densidade de ferramenta de trabalho e dourado nas ações principais. Preservar a marca Bom Futuro, WorkspaceRail e navegação dos módulos. Não substituir a identidade pelo desenho da apresentação.

## Fonte canônica e tokens

Modelo B: `src/styles.css` é a fonte de tokens em execução. Este documento registra decisões; não gera uma segunda paleta. `mapping-workflow.css` usa background, foreground, card, muted, border, gold e primary-foreground do sistema. As cores das quatro modalidades servem apenas à classificação e sempre acompanham texto.

## Fluxos e componentes

A rota `/mapping` reúne Minhas tarefas, Direcionamentos, Mapeamentos (Kanban/lista) e Coordenadores. Estado de navegação e filtros fica na URL. O cartão abre o mesmo detalhe em todas as visões. O editor existente permanece acessível pelo documento vinculado e permite voltar à demanda.

Diálogos nativos preservam foco e fechamento pelo teclado. Formulários exibem erro e estado de salvamento, sem fechamento antes da confirmação do servidor. Listas possuem vazio, carregamento e falha com nova tentativa. A navegação recolhe em telas menores; o Kanban mantém rolagem horizontal.

## Regras de conteúdo

Português brasileiro. Datas visuais em pt-BR. Modalidades: Sistemas, Operacional, Automação & IA e Dados / BI. AS IS/TO BE permanece um atributo distinto do documento. Documentos anteriores ao fluxo continuam na biblioteca, sem classificação fictícia.

## Verificação

Testes SQL reais com PGlite cobrem autorização, isolamento organizacional, checklist, revisão concorrente, bloqueios de edição e auditoria. A validação visual local usa os componentes reais com dados isolados e identificação explícita. A ativação em produção exige a migração Supabase; o ambiente local não demonstra autenticação de produção.
