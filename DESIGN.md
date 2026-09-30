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

Card de tarefa: TaskProcessFlow usa eventos de início/fim e gateways exclusivos; TaskChecklist permite editar e remover o vínculo do documento via TaskDialog, preservando o original. TaskComment reúne clipe e envio na mesma barra. Kanban utiliza foto do responsável com fallback para iniciais. Movimentações mostra formulário seguido de atividade e descrição original do usuário em ordem decrescente, sem misturar eventos de checklist/comentários.

Checklist: seções padrão são protegidas no servidor; remover entrega não remove a seção. Seções adicionais podem ser excluídas com confirmação. Outros inicia vazio e permite composição livre. Anexos usam clipe, substituição e remoção. Reuniões compartilha o painel lateral com Comentários e atividade. Histórico de movimentações permanece abaixo das ações, com autor e data.

Kanban: seletor Detalhado/Compacto junto ao agrupamento, com preferência preservada no estado da URL. TaskKanbanCard compacto mostra somente código, título em até duas linhas com tooltip, tipo singular, avatar do responsável e vencimento. Mantém abertura dos detalhes e destaque de atraso na data. Detalhado continua padrão.

Etapas do mapeamento: Preencher solicitação, Analisar demanda, Atender solicitação e Analisar informações; aprovação e conclusão mantidas. Histórico de movimentos usa título da atividade executada quando identificável pela ação registrada, preservando a descrição, autoria e data.

Entregas: tarefa concluída oferece ZIP único com anexos originais e POP/Mapeamento em DOCX pelo renderizador existente do módulo. Falha de qualquer arquivo bloqueia ZIP parcial. Revisores consultam documentos via visualização somente leitura autorizada por vínculo à tarefa. Filtros iniciam recolhidos em cada visualização. Avisos de ajustes e pendências ficam no histórico, sem duplicação em Dados.

Home: resumo por tipo, agenda mensal com seleção do dia e reuniões pessoais, indicadores com filtros exatos e gráfico de conclusões por semana/mês/ano. Próximas entregas removida. Datas de conclusão são persistidas na transição final; reabertura limpa a data; registros históricos sem data comprovável são informados e não entram no gráfico. Tendência usa regressão linear até hoje.

## Consistência de navegação e formulários
- Tema persistido exclusivamente por lib/theme; menu de perfil e controles compartilham a preferência.
- Cabeçalhos de módulos expandem/recolhem; Novo e Consultar navegam.
- Cadeia de valor reorganiza blocos em linhas, mantendo largura legível.
- Mapeamento e documentos usam visualização por ícone e menu único de salvamento.

## Visão operacional
- Painel organizacional de cadastros: cobertura, registros por área, situação de mapeamentos, tipos de documentos e melhorias por situação/prioridade/origem. Sem indicadores de tarefas.
- Gráficos com detalhamento paginado, filtros recolhidos e cores dos tokens existentes. Áreas extensas têm rolagem interna; no celular os painéis empilham.
- Fonte: getOrganizationDashboard; coleções paginadas integralmente, rascunhos fora da cobertura e registros sem área preservados.

- Revisão visual operacional: tipografia de sistema Apple/Segoe, cores suaves azul/teal, resumos sem rolagem. Cobertura mostra até quatro áreas com menor percentual; distribuição mostra as três maiores; demais categorias excedentes agrupadas em Outros, com detalhamento integral. Saídas da cadeia sempre à direita e centralizadas verticalmente.

Tarefas: botão direito (ou Shift+F10) abre ações permitidas com motivo obrigatório. Cancelamento preserva entregas e histórico, encerra alterações e não conta como tarefa aberta. Revisão técnica não permite pausa/cancelamento. Checklist reutiliza DocumentPicker filtrado pelo módulo e mantém códigos de origem.

Revisão de tarefas aprovada: Kanban inicial e cards Compactos por padrão; ordem Kanban, Lista, Calendário. Filtros e checklist iniciam recolhidos. Cabeçalho unifica busca, filtros e seletores; detalhe traz metadados no cabeçalho, edição por lápis, solicitação e anexos na coluna principal, comentários/reuniões à direita. Exclusão lógica apenas para administrador, com confirmação e Desfazer; tarefas excluídas consultáveis no filtro Excluídas; dados, documentos e histórico preservados. Ações e restauração validadas no servidor por organização e revisão.


## Identificação e edição da tarefa — 24/09/2026

Códigos aparecem uma única vez nas entregas, seleção de documentos e nomes exportados, inclusive quando o nome legado já contém o código. Mapeamentos salvos como rascunho usam MAP.ÁREA.NNN.TEMP; a finalização remove .TEMP e preserva a sequência reservada. A área é necessária para a primeira reserva. Documentos antigos recebem a identificação temporária no próximo salvamento como rascunho. A reserva usa comparação atômica do contador organizacional e considera códigos já existentes.

TaskHeaderSummary apresenta responsável, solicitante, início, prazo, tipo e modalidade separadamente. Editar dados abre TaskManagement no TaskDialog compartilhado, com grupos Pessoas, Período e Classificação, salvar/cancelar explícitos e confirmação de descarte. Falhas preservam os campos; sucesso fecha a edição e atualiza o resumo. As permissões e restrições de modalidade permanecem no servidor. Tokens de src/styles.css continuam canônicos.


## Desenho BPMN — reformulação de 25/09/2026

- Público: equipes brasileiras de processos; uso principal em desktop, com consulta e apresentação em telas menores. Idioma pt-BR.
- O editor BPMN anterior foi removido. A rota `/m/bpmn` abre um workspace independente com canvas bpmn-js, paleta curta, ações contextuais e propriedades recolhíveis. O motor só é carregado ao entrar nesse módulo.
- Tokens de cor, fonte, borda e espaçamento seguem `src/styles.css`; a folha `src/components/bpmn/bpmn.css` restringe as mudanças ao módulo. O canvas de notação permanece claro para conservar cores importadas. O crédito obrigatório bpmn.io permanece visível.
- Processo identificado no rodapé; identificações adicionais nas bordas aparecem somente quando os nomes originais saem da área visível, sem reservar faixa permanente ou modificar coordenadas BPMN DI.
- Processos, Áreas e Cargos reutilizam `DropdownTextField`, `TaskDialog` e os serviços centrais de cadastro. `CatalogPicker` é a variante compartilhada do BPMN para criação e seleção imediata, inclusive no assistente.
- Importação em quatro etapas: arquivo, conferência visual, associação explícita e confirmação. As correspondências por nome são sugestões. O original permanece separado do XML editável. Nenhum auto-layout é executado na importação.
- O modo de apresentação usa NavigatedViewer. O modelador fica oculto para conservar desfazer/refazer ao retornar. Leitores não instanciam um modelador editável.
- Salvamento manual e automático (30 s quando houver mudanças), cópia local com recuperação explícita e bloqueio de saída com alterações. Desenhos convertidos do editor anterior começam com salvamento automático desligado e preservam os dados antigos para download.
- Arquivo de referência: `tests/fixtures/MERCADO_INTERNO_ASIS_Bizagi_REV02_premissas_visuais.bpmn`. Conferência de geometria por identificador, pois a ordem XML de elementos não determina sua posição.

BPMN visual finish: retain control positions and geometry; reuse BF Flow font and gold accent with quiet neutral surfaces. Appearance has only color (default, Bizagi-like defaults) and monochrome. Explicit element colors take precedence in color mode; monochrome is a reversible viewing preference. Keep bpmn.io watermark fully visible as required by the installed license.

## BPMN navigation — 2026-09-28

The editor has a single modeling toolbar: import beside Pool, icon-only save beside Properties, and icon-only presentation beside zoom. The former process header is removed; document/version/status remain in the footer. Plain left-drag on canvas/pool/lane background selects intersecting elements; containers require full enclosure to avoid moving an entire pool accidentally. Pan uses the hand tool or middle mouse. Edge identifications appear only when the original rendered name is clipped and its owning region still intersects the viewport; no permanent reserved lane strip or DI mutation. Explicit lane associations name the editable lane from the selected central record, including confirmed imports; original source XML remains retained.

## BPMN — cores, raias e salvamento — 28/09/2026

Com cores e Preto e branco são as únicas aparências. Preenchimentos explícitos prevalecem sobre a paleta padrão. Piscinas e raias são arrastadas da barra; a raia só aceita destino dentro de uma piscina. Seu cabeçalho permite reordenar a faixa inteira com atividades e conexões, com indicação do destino e desfazer/refazer.
O ícone Salvar oferece Salvar rascunho e Salvar versão. Rascunho usa o mesmo documento com código TEMP e não incrementa a versão; autosave sempre usa essa modalidade. A versão explícita preserva cópia no histórico. Verificar desenho apresenta diagnósticos identificados por nome e ID do elemento, sem bloquear o salvamento.

BPMN — 29/09/2026: exportação principal em arquivo BPMN editável e imagem PNG do diagrama inteiro, independente de zoom/pan, com fundo branco e cores renderizadas (incluindo preto e branco). XML original importado continua identificado separadamente para recuperação. Durante edição, ocultar o cabeçalho global da biblioteca: manter somente a barra de modelagem, Importar junto de Pool, Salvar por ícone junto de Propriedades e Apresentar nos controles de zoom. Voltar aos desenhos mantém acesso à biblioteca e ao menu geral.

Ajuste confirmado em 29/09: no grupo de comandos indicado pelo usuário, manter somente Navegar e Importar. Seleção por arraste e conexões contextuais continuam; copiar/recortar/colar/excluir ficam no botão direito. Raia e Pool passam para a paleta. Dados usa ícone nativo de documento BPMN e Armazenamento usa cilindro, iguais às formas do motor. Colar funciona também no fundo do canvas e conserva propriedades.

## Revisão de UX do desenho — 29/09/2026

A área de modelagem mantém a identidade do BF Flow e os tokens de src/styles.css. Paleta compacta com ícones e nomes; painel de propriedades dividido em Elemento e Desenho; identificação do processo/código e estado do salvamento no rodapé. Controles de zoom, centralização e apresentação têm faixa própria fora do canvas. Em telas estreitas, propriedades ficam abaixo do desenho, com rolagem interna, sem cobrir o canvas.

Pesquisas do módulo reutilizam DropdownTextField com a variante inlineOptions: resultados ocupam espaço no formulário, sem sobrepor campos. Menus contextuais e menus nativos de tipo usam uma camada fora do canvas recortado e respeitam os limites da janela. Exportação usa TaskDialog, com BPMN, PNG e original importado identificados. Avisos de importação recolhíveis, com contagem visível. Mensagens de sucesso de salvamento ficam no rodapé, sem deslocar o desenho.

## Menu de módulos — 30/09/2026

Pedido explícito do usuário: Novo e Consultar na mesma linha do nome e menu até a base da tela. WorkspaceModulesTree usa ModuleActionsRow para Mapeamento, Documentação, Fluxograma e Oportunidades de melhoria: nome legível e ações por ícones de mais/lupa, sempre visíveis, com rótulos acessíveis e dicas no hover/foco. Cadastros mantém expansão. WorkspaceLauncher continua não modal e cobre a lateral desde 60px até a base do viewport, com rolagem própria e área segura inferior. Tokens permanecem em src/styles.css; geometria em workspace-launcher.css.

Consulta de desenhos — 30/09/2026: seis colunas conforme pedido do usuário, código em fonte de dados, título clicável e datas em pt-BR. BpmnDocumentsTable reutiliza os tokens de src/styles.css e a superfície de tabela de bpmn.css, com rolagem horizontal interna em telas estreitas.
