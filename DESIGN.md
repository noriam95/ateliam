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


## Tarefas e reuniões — setembro de 2026

- Código imutável por organização e ano de criação: TAR.0001.2026, gerado no banco com contador atômico.
- Abas de dados, fluxo por raias e reuniões vinculadas. As decisões permanecem nos formulários de encaminhamento.
- Complementos voltam ao registro; ajustes da área passam novamente pela revisão técnica. Parada preserva a etapa para retomada.
- Alteração da modalidade no primeiro preenchimento exige confirmação e preserva entregas existentes.
- Calendário distingue tarefas em dourado e reuniões em azul, com filtros independentes. Horários no fuso do navegador.
- Após salvar reunião, abrir composição no Outlook para revisão e confirmação manual. Não indica envio automático.
- Formulário de mapeamento usa visão por ícone e menu de salvamento com Rascunho/Salvar. POP mantém seus controles.

Agenda: filtros de tarefas recolhíveis no calendário; barra com navegação de datas e formato; segunda linha para visibilidade de atividades e agendamento. Usa tokens existentes e controles nativos.


Card de tarefa: encaminhamento único por etapa, com descrição obrigatória preservada para o destinatário e no histórico. Administrador usa o mesmo formulário; demais usuários continuam restritos à responsabilidade. Dados editáveis no cabeçalho conforme as permissões e etapas existentes. Abas seguem navegação por sublinhado de Home/Minhas tarefas. Comentários aceitam até cinco anexos privados de 20 MB; upload com repetição sem reenviar arquivos já carregados. Troca de abas mantém o formulário de dados montado.

Próximas melhorias: Área na criação de tarefas reutiliza cadastro organizacional e exige seleção, com cadastro rápido por nome e sigla. Consulta de mapeamentos mantém coluna Área e inclui filtro. Notificações têm abas Usuário e Atualizações do sistema, com leitura por usuário/organização. Entregas mostram código e título; os códigos de rascunhos e documentos salvos são lidos diretamente dos módulos de origem, sem gerar códigos no card. Movimentações apresenta orientação e tarefa, sem duplicar histórico dos comentários. Anexos usam botão com clipe e indicadores do Kanban são circulares.
