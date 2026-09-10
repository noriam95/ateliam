---
version: alpha
name: BF Flow
description: Área pessoal e tarefas integradas aos documentos existentes
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
spacing:
  section-gap: "20px"
components:
  dialog: {}
  navigation: {}
  button: {}
---

# BF Flow — área pessoal

## Referência e escopo

Solicitação do usuário em 09/09/2026: Home e Minhas tarefas. Preservar os demais módulos. A imagem de referência define a distribuição do detalhe, não uma nova identidade: conteúdo à esquerda, comentários e atividade à direita, em um único diálogo. Em tela estreita, as colunas se empilham.

## Tokens e componentes

Modelo B: fonte canônica em src/styles.css. Cores, fontes e bordas permanecem as existentes. A folha user-tasks.css é restrita a ut-root e ut-dialog. Não alterar o tema global ou a aparência dos módulos existentes. BFFlowMark, WorkspaceLauncher, cabeçalho do workspace e sonner são reutilizados.

## Comportamento

A criação não exige documento. O código da tarefa passa a ser lido do documento quando vinculado no checklist, sem numeração paralela. Lista, Kanban e calendário consultam o mesmo conjunto paginado. Filtros e visualização permanecem na URL. Calendário mensal representa o período da tarefa e destaca a data limite. A opção Gantt compartilha mês e filtros, com uma linha por tarefa e barras entre início e prazo. A Home resume somente tarefas atribuídas ao usuário atual.

## Detalhe

Dados essenciais, progresso, checklist e encaminhamento ficam na coluna esquerda. Comentários, movimentações, autores e datas ficam na direita, sempre disponíveis. Cada coluna tem rolagem própria no desktop; em celular o diálogo tem uma única rolagem vertical. Confirmações usam diálogo nativo acessível; select e data usam os controles da plataforma. Nenhum modal usa alert/confirm/prompt.

## Verificação

Testes SQL de integração cobrem organização, responsáveis, rascunhos, concorrência, revisão técnica, ajuste técnico, ajuste do dono, conclusão e intervenção administrativa. A conferência visual usa componentes reais e banco local isolado. Migração e publicação são etapas distintas; não apresentar validação local como implantação em produção.

Checklist agrupa entregas por item, com contagem concluída/total e ações explícitas de adicionar outro preenchimento ou anexo. TaskChecklist reutiliza TaskDialog e os controles existentes, sem alteração de tokens.

## Navegação global — revisão de 10/09/2026

Referência aprovada: seletor de aplicativos do vídeo fornecido pelo usuário. WorkspaceLauncher substitui a barra lateral fixa por um botão de grade no canto superior esquerdo e um popover com ícones, nomes e descrições dos módulos. As opções internas reutilizam WorkspaceModulesTree e os mesmos destinos existentes. O conteúdo ocupa a largura disponível. Paleta, tipografia e formulários permanecem sob os tokens existentes.
