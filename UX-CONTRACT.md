# Contrato de interação — Home e Minhas tarefas

Fonte de negócio: requisitos explícitos do usuário nesta tarefa em 09/09/2026. Fonte de autorização: autenticação Supabase existente e user_tasks_command na migração 20260909190000_user_tasks.sql.

| Capacidade     | Responsável canônico           | Regra                                                           |
| -------------- | ------------------------------ | --------------------------------------------------------------- |
| Navegação      | WorkspaceHome / WorkspaceLauncher  | Seletor de módulos no cabeçalho, sem barra lateral fixa                   |
| Select/Listbox | native                         | Popup da plataforma, rótulo associado                           |
| Date           | native                         | Datas de formulário nativas; calendário de atividades em pt-BR  |
| Form           | UserTasks / TaskRoutingActions | noValidate, erro visível, salvamento com bloqueio de duplicação |
| Toast          | sonner                         | Sucesso apenas depois da persistência                           |
| Modal          | TaskDialog                     | Foco, Escape, fundo inerte e confirmação de descarte            |
| CRUD           | user_tasks_command             | Autorização no banco, revisão concorrente, criação idempotente  |

## Fluxo

- Criar tarefa sem exigir documento. Responsável e solicitante são selecionados entre usuários da organização; o responsável precisa de edição. Comentário inicial opcional entra no histórico com autoria real. O criador continua participante e é distinto do solicitante. O vínculo e o código do documento são incorporados na execução do checklist.
- Salvar rascunho deixa o item em andamento e não oferece conclusão. Salvamento definitivo persiste antes de perguntar se o item deve ser concluído.
- Documentação permite selecionar o responsável técnico. Enviar atribui a tarefa a esse usuário.
- Revisão técnica permite aprovar ou pedir ajustes com descrição obrigatória. Aprovar retorna ao documentador para coletar aprovação do dono do processo.
- Ajustes técnicos retornam à documentação e depois à revisão técnica. Ajustes do dono retornam à documentação e depois à coleta da aprovação do dono.
- Aprovação do dono exige registro de nome e evidência. Conclusão do item de validação é decorrente dessa ação.
- Encaminhar com itens incompletos exige confirmação; a lista de pendências e o histórico são preservados.
- Administrador visualiza todas as etapas e pode mudar etapa e responsável com motivo. Isso não falsifica a conclusão dos itens pendentes.
- Comentários são permitidos aos participantes da tarefa, com autoria e data. Não há exclusão de tarefas ou histórico nesta entrega.
- Módulos existentes preservam telas, codificação e salvamento; apenas documentos abertos a partir de uma tarefa recebem o contexto do checklist.

## Canonical UI Map

| Capability     | Canonical owner                | Source of truth       | Allowed variants                         | Verification                            |
| -------------- | ------------------------------ | --------------------- | ---------------------------------------- | --------------------------------------- |
| Select/Listbox | native select                  | Este contrato         | native                                   | Browser: seleção de responsável técnico |
| Date           | native date input              | Este contrato         | native                                   | Calendário mensal e datas SQL           |
| Form           | UserTasks / TaskRoutingActions | Requisitos do usuário | create, edit, routing                    | Testes SQL e browser                    |
| Toast          | sonner                         | App existente         | success, error                           | Browser                                 |
| CRUD           | user_tasks_command             | Migração de tarefas   | create, item, encaminhamento, comentário | tests/user-tasks.test.mjs               |
| Modal          | TaskDialog                     | Este contrato         | padrão, detalhe em duas colunas          | Browser desktop, celular e Escape       |

- Calendário oferece Mensal e Gantt no mesmo período de seis semanas, com filtros e mês compartilhados. Gantt mostra uma linha por tarefa, início/prazo, responsável e situação; barra e título abrem o detalhe. Rolagem horizontal e cabeçalho fixo preservam leitura em telas pequenas.

## Entregas por modalidade — revisão de 09/09/2026

Fonte: tabela e instruções explícitas do usuário. Operacional: Mapeamento (módulo ddp), Fluxograma (arquivo), POP (módulo pop), Comunicado opcional (arquivo). Sistemas, Automação & IA e Dados / BI: Mapeamento (ddp), Fluxograma (arquivo), Premissas (arquivo).

TaskChecklist é o componente canônico para grupos de entregas. Cada grupo aceita novos preenchimentos/anexos independentes; novos itens permitem escolher formulário, arquivo ou texto. Cada formulário cria um documento separado no módulo existente. Rascunhos não concluem entregas. Arquivos privados de até 20 MB ficam vinculados à tarefa e respeitam participantes e organização. Não se sobrescrevem arquivos: adicionar outro anexo preserva o anterior. O download usa link temporário. Itens opcionais não entram nas pendências de encaminhamento. Tarefas concluídas mantêm o histórico; nas demais, entregas antigas preenchidas são preservadas como itens adicionais durante a migração.

## Períodos do calendário e Gantt

Dia, Semana (domingo a sábado), Mês e Ano compartilham data de referência e filtros, persistidos na URL. Hoje e setas respeitam a escala ativa. Calendário anual possui 12 meses com acesso ao dia; Gantt anual agrupa por mês. Datas sem horário são mostradas como atividades do dia, sem criar horários fictícios. A paginação e os avisos de página atual continuam visíveis em todas as escalas.

Cada grupo do checklist começa recolhido ao abrir o detalhe da tarefa. O summary nativo mostra nome, status agregado e concluídos/total (ex.: 1/2). Rascunhos permanecem em andamento e não contam como concluídos. Expandir mantém visíveis as ações e entregas do grupo; atualizações preservam a expansão na sessão do detalhe.

Kanban: TaskKanbanCard apresenta referência TAR derivada do UUID da tarefa (não do documento), modalidade, etapa, checklist agrupado com concluídos/total, responsável, prazo e última atividade. A atividade vem de user_task_events, um registro por tarefa, respeitando RLS. O card abre o detalhe; os marcadores de checklist são informativos.

## Seletor global de módulos

WorkspaceLauncher é o proprietário canônico, usado na Home e nos módulos. Popover nativo não modal: aberto pelo botão de grade, fecha com Escape, clique fora ou seleção de destino; foco retorna ao acionador ao dispensar pelo teclado. Botões de expansão mantêm o seletor aberto, enquanto itens recolhidos ficam inertes. Configurações mantêm as regras de acesso existentes. O seletor tem rolagem própria dentro do viewport, sem alterar a largura ou rolagem dos formulários. Fonte: vídeo e pedido explícito do usuário em 10/09/2026.

Revisão de 10/09/2026: Página inicial precede Minhas tarefas no seletor. Configurações tem um único acesso global no UserProfileMenu, antes de Sair do sistema; a rota /settings mantém a autorização existente. A página administrativa oferece navegação entre Organizações e Usuários.

Visibilidade por usuário: Configurações aparece apenas para o perfil admin vigente. profiles.visible_modules armazena os módulos selecionados pelo administrador; usuários sem configuração recebem todos habilitados. Administradores mantêm todos visíveis. A configuração controla a navegação; as autorizações de dados existentes continuam sendo aplicadas pelo servidor.


## Tarefas e reuniões — setembro de 2026

- Código imutável por organização e ano de criação: TAR.0001.2026, gerado no banco com contador atômico.
- Abas de dados, fluxo por raias e reuniões vinculadas. As decisões permanecem nos formulários de encaminhamento.
- Complementos voltam ao registro; ajustes da área passam novamente pela revisão técnica. Parada preserva a etapa para retomada.
- Alteração da modalidade no primeiro preenchimento exige confirmação e preserva entregas existentes.
- Calendário distingue tarefas em dourado e reuniões em azul, com filtros independentes. Horários no fuso do navegador.
- Após salvar reunião, abrir composição no Outlook para revisão e confirmação manual. Não indica envio automático.
- Formulário de mapeamento usa visão por ícone e menu de salvamento com Rascunho/Salvar. POP mantém seus controles.

Limpar filtros preserva data, período e formato da agenda. Filtros de tarefas são distintos das opções de visibilidade de tarefas/reuniões.


Card de tarefa: encaminhamento único por etapa, com descrição obrigatória preservada para o destinatário e no histórico. Administrador usa o mesmo formulário; demais usuários continuam restritos à responsabilidade. Dados editáveis no cabeçalho conforme as permissões e etapas existentes. Abas seguem navegação por sublinhado de Home/Minhas tarefas. Comentários aceitam até cinco anexos privados de 20 MB; upload com repetição sem reenviar arquivos já carregados. Troca de abas mantém o formulário de dados montado.

Card: encaminhamento e histórico ficam na aba Movimentações. Nova tarefa organiza título, tipo/modalidade, responsável/solicitante, início/término e comentário inicial com anexos. Minhas tarefas abre em Calendário por padrão; links explícitos para Lista/Kanban continuam válidos. Compromissos novos são Agendados; Situação é editável após salvar.

Calendário mensal ajusta a altura ao espaço restante da janela e resume atividades excedentes por dia com abertura da lista completa, sem cortar o acesso aos registros.

Pesquisa na agenda filtra também reuniões por título, pauta, nomes e e-mails de organizador/participantes, respeitando acesso. Clique no dia abre agendamento com data preenchida; clique em atividade abre detalhes. Lista e Kanban mantêm seu conjunto de tarefas.

Próximas melhorias: Área na criação de tarefas reutiliza cadastro organizacional e exige seleção, com cadastro rápido por nome e sigla. Consulta de mapeamentos mantém coluna Área e inclui filtro. Notificações têm abas Usuário e Atualizações do sistema, com leitura por usuário/organização. Entregas mostram código e título; os códigos de rascunhos e documentos salvos são lidos diretamente dos módulos de origem, sem gerar códigos no card. Movimentações apresenta orientação e tarefa, sem duplicar histórico dos comentários. Anexos usam botão com clipe e indicadores do Kanban são circulares.

Card de tarefa: TaskProcessFlow usa eventos de início/fim e gateways exclusivos; TaskChecklist permite editar e remover o vínculo do documento via TaskDialog, preservando o original. TaskComment reúne clipe e envio na mesma barra. Kanban utiliza foto do responsável com fallback para iniciais. Movimentações mostra formulário seguido de atividade e descrição original do usuário em ordem decrescente, sem misturar eventos de checklist/comentários.

Checklist: seções padrão são protegidas no servidor; remover entrega não remove a seção. Seções adicionais podem ser excluídas com confirmação. Outros inicia vazio e permite composição livre. Anexos usam clipe, substituição e remoção. Reuniões compartilha o painel lateral com Comentários e atividade. Histórico de movimentações permanece abaixo das ações, com autor e data.

Kanban: seletor Detalhado/Compacto junto ao agrupamento, com preferência preservada no estado da URL. TaskKanbanCard compacto mostra somente código, título em até duas linhas com tooltip, tipo singular, avatar do responsável e vencimento. Mantém abertura dos detalhes e destaque de atraso na data. Detalhado continua padrão.

Etapas do mapeamento: Preencher solicitação, Analisar demanda, Atender solicitação e Analisar informações; aprovação e conclusão mantidas. Histórico de movimentos usa título da atividade executada quando identificável pela ação registrada, preservando a descrição, autoria e data.

Entregas: tarefa concluída oferece ZIP único com anexos originais e POP/Mapeamento em DOCX pelo renderizador existente do módulo. Falha de qualquer arquivo bloqueia ZIP parcial. Revisores consultam documentos via visualização somente leitura autorizada por vínculo à tarefa. Filtros iniciam recolhidos em cada visualização. Avisos de ajustes e pendências ficam no histórico, sem duplicação em Dados.

Home: resumo por tipo, agenda mensal com seleção do dia e reuniões pessoais, indicadores com filtros exatos e gráfico de conclusões por semana/mês/ano. Próximas entregas removida. Datas de conclusão são persistidas na transição final; reabertura limpa a data; registros históricos sem data comprovável são informados e não entram no gráfico. Tendência usa regressão linear até hoje.

Tarefas: botão direito (ou Shift+F10) abre ações permitidas com motivo obrigatório. Cancelamento preserva entregas e histórico, encerra alterações e não conta como tarefa aberta. Revisão técnica não permite pausa/cancelamento. Checklist reutiliza DocumentPicker filtrado pelo módulo e mantém códigos de origem.

Contexto contínuo da tarefa: descrição inicial é persistida na criação antes dos uploads; anexos são comentários adicionais. Primeiro comentário permanece destacado em todas as abas. Histórico de detalhes carrega todas as páginas, sem corte em 100 eventos; arquivos mantêm autor e data de origem.

Revisão de tarefas aprovada: Kanban inicial e cards Compactos por padrão; ordem Kanban, Lista, Calendário. Filtros e checklist iniciam recolhidos. Cabeçalho unifica busca, filtros e seletores; detalhe traz metadados no cabeçalho, edição por lápis, solicitação e anexos na coluna principal, comentários/reuniões à direita. Exclusão lógica apenas para administrador, com confirmação e Desfazer; tarefas excluídas consultáveis no filtro Excluídas; dados, documentos e histórico preservados. Ações e restauração validadas no servidor por organização e revisão.

Reuniões: exclusão lógica permitida ao organizador e administrador, com lixeira na lista vinculada e nos detalhes, confirmação e Desfazer dentro da superfície ativa (inclusive diálogos). Exclusão/recuperação preservam conteúdo e geram auditoria. Convites do Outlook não são cancelados automaticamente; a confirmação informa esse limite.

Seleção de área em tarefas reutiliza DropdownTextField do mapeamento: pesquisa e seleção em um único campo, cadastro disponível apenas sem resultados, com nome pesquisado preenchido e ID da área enviado no formulário.


## Identificação e edição da tarefa — 24/09/2026

Códigos aparecem uma única vez nas entregas, seleção de documentos e nomes exportados, inclusive quando o nome legado já contém o código. Mapeamentos salvos como rascunho usam MAP.ÁREA.NNN.TEMP; a finalização remove .TEMP e preserva a sequência reservada. A área é necessária para a primeira reserva. Documentos antigos recebem a identificação temporária no próximo salvamento como rascunho. A reserva usa comparação atômica do contador organizacional e considera códigos já existentes.

TaskHeaderSummary apresenta responsável, solicitante, início, prazo, tipo e modalidade separadamente. Editar dados abre TaskManagement no TaskDialog compartilhado, com grupos Pessoas, Período e Classificação, salvar/cancelar explícitos e confirmação de descarte. Falhas preservam os campos; sucesso fecha a edição e atualiza o resumo. As permissões e restrições de modalidade permanecem no servidor. Tokens de src/styles.css continuam canônicos.


## Contrato BPMN — 25/09/2026

| Capacidade | Dono canônico | Comportamento |
| --- | --- | --- |
| Navegação global | WorkspaceLauncher | Mesmos destinos e permissões de módulos |
| Pesquisa e cadastro | DropdownTextField + TaskDialog + CatalogPicker | Exige seleção de ID; cadastrar usa serviços centrais e seleciona o retorno |
| Modelagem | BpmnCanvas / bpmn-js | Paleta, contexto, seleção múltipla, conexões, redimensionamento e desfazer/refazer |
| Importação | BpmnImportWizard | Arquivo → prévia → vínculos → confirmação; erros não substituem o desenho aberto |
| Persistência | saveBpmnDocument / persistBpmnDocument | Valida organização, processo e responsáveis; grava versão e XML juntos, com comparação de versão e data |
| Recuperação | BpmnEditor | Cópia local por usuário/organização/documento; recuperação depende de escolha explícita |
| Tarefa vinculada | TaskEditorContext | Rascunhos mantêm a entrega em andamento; publicação usa confirmação existente do checklist |

- O estado do cliente não concede permissão: toda gravação exige autenticação e papel de editor no servidor; IDs de processos/áreas/cargos são conferidos na organização ativa.
- Cada tentativa de salvar mantém um identificador de mutação para tolerar respostas perdidas sem duplicar documentos. Conflitos preservam o desenho local e oferecem exportação.
- Campos obrigatórios: processo cadastrado e XML BPMN 2.0 com DI. Raia não vinculada é aviso A DEFINIR, não bloqueio. Fonte externa não cria registros silenciosamente.
- O XML original é imutável na experiência de edição e pode ser baixado separado. Avisos de elementos/extensões não suportados são apresentados antes de confirmar importação.
- Importações aceitam até 1,5 MB; salvar verifica o tamanho total de envio antes de iniciar a requisição. Falha não limpa o conteúdo nem indica sucesso.
- O congelamento de cabeçalho/raias e a navegação nunca alteram coordenadas, dimensões, cores ou waypoints. O importador de compatibilidade que reposiciona subprocessos foi desativado.
- A lista de desenhos usa paginação de 20 linhas, pesquisa no servidor, estados de carregamento, vazio e erro recuperável. Trocar organização recarrega os cadastros e a lista.

BPMN visual finish: retain control positions and geometry; reuse BF Flow font and gold accent with quiet neutral surfaces. Appearance has only color (default, Bizagi-like defaults) and monochrome. Explicit element colors take precedence in color mode; monochrome is a reversible viewing preference. Keep bpmn.io watermark fully visible as required by the installed license.

## BPMN navigation — 2026-09-28

The editor has a single modeling toolbar: import beside Pool, icon-only save beside Properties, and icon-only presentation beside zoom. The former process header is removed; document/version/status remain in the footer. Plain left-drag on canvas/pool/lane background selects intersecting elements; containers require full enclosure to avoid moving an entire pool accidentally. Pan uses the hand tool or middle mouse. Edge identifications appear only when the original rendered name is clipped and its owning region still intersects the viewport; no permanent reserved lane strip or DI mutation. Explicit lane associations name the editable lane from the selected central record, including confirmed imports; original source XML remains retained.

BPMN 28/09: autosave is always a draft, never a version. Drafts use one CAS-protected row, stable reserved base code plus TEMP, and version zero before the first explicit save. Final saves strip TEMP, increment the version and retain an immutable document_versions snapshot. A same-row journal allows interrupted history writes to finish idempotently on retry. Lane reordering preserves semantic membership and relative content positions, reroutes cross-lane edges and supports grouped undo/redo. Lane insertion outside a pool is rejected with drag feedback. Validation derives sequence connectivity from actual source/target references (including Bizagi files without incoming/outgoing lists).

BPMN — 29/09/2026: exportação principal em arquivo BPMN editável e imagem PNG do diagrama inteiro, independente de zoom/pan, com fundo branco e cores renderizadas (incluindo preto e branco). XML original importado continua identificado separadamente para recuperação. Durante edição, ocultar o cabeçalho global da biblioteca: manter somente a barra de modelagem, Importar junto de Pool, Salvar por ícone junto de Propriedades e Apresentar nos controles de zoom. Voltar aos desenhos mantém acesso à biblioteca e ao menu geral.

Ajuste confirmado em 29/09: no grupo de comandos indicado pelo usuário, manter somente Navegar e Importar. Seleção por arraste e conexões contextuais continuam; copiar/recortar/colar/excluir ficam no botão direito. Raia e Pool passam para a paleta. Dados usa ícone nativo de documento BPMN e Armazenamento usa cilindro, iguais às formas do motor. Colar funciona também no fundo do canvas e conserva propriedades.

Menu de contexto BPMN: Editar texto; grupo Recortar, Copiar, Colar, Duplicar; grupo Alterar tipo e Propriedades; Excluir isolado ao final. No fundo do canvas, somente Colar. A ordem visual também orienta a navegação por teclado.

## Revisão de UX do desenho — 29/09/2026

A área de modelagem mantém a identidade do BF Flow e os tokens de src/styles.css. Paleta compacta com ícones e nomes; painel de propriedades dividido em Elemento e Desenho; identificação do processo/código e estado do salvamento no rodapé. Controles de zoom, centralização e apresentação têm faixa própria fora do canvas. Em telas estreitas, propriedades ficam abaixo do desenho, com rolagem interna, sem cobrir o canvas.

Pesquisas do módulo reutilizam DropdownTextField com a variante inlineOptions: resultados ocupam espaço no formulário, sem sobrepor campos. Menus contextuais e menus nativos de tipo usam uma camada fora do canvas recortado e respeitam os limites da janela. Exportação usa TaskDialog, com BPMN, PNG e original importado identificados. Avisos de importação recolhíveis, com contagem visível. Mensagens de sucesso de salvamento ficam no rodapé, sem deslocar o desenho.

Exportar fica imediatamente após Importar na barra de edição. Em apresentação/somente leitura, mantém acesso no rodapé, pois a barra de edição fica oculta.
Verificar desenho acompanha o mesmo grupo: Importar → Exportar → Verificar desenho.

## Menu de módulos — 30/09/2026

Fonte: pedido explícito do usuário nesta data. WorkspaceModulesTree/ModuleActionsRow são os donos das ações Novo e Consultar: botões na mesma linha do nome, destinos e visibilidade preservados, indicação da ação atual, nomes acessíveis incluindo módulo e dicas no hover/foco. Esses módulos não exigem expansão; Cadastros conserva sua árvore recolhível. WorkspaceLauncher mantém popover não modal, Escape/clique fora/fechamento ao navegar, altura até a base da janela e rolagem interna sem modificar a página. Nomes longos podem quebrar dentro da coluna do nome, sem mover as ações para outra linha.

Consulta de desenhos — 30/09/2026: BpmnDocumentsTable apresenta Código, Título, Versão, Atualizado em, Área e Data criação, nessa ordem. Título clicável abre o desenho. Área vem do processo vinculado na mesma organização; criação usa documents.created_at. Sem código: travessão; sem área: Não informada. Paginação de 20 registros e busca preservadas. A tabela tem rolagem horizontal própria em telas estreitas.

Bibliotecas de Processos — 30/09/2026: pedido explícito do usuário substitui os atalhos Novo/Consultar na navegação. O nome do módulo abre sua consulta. Mapeamento e Documentação usam o fluxo existente de novo documento pela ação no cabeçalho (também no estado vazio); Oportunidades mantém Nova oportunidade na consulta. ProcessLibraryHeader e ProcessLibrarySearch são canônicos, com busca identificada, limpar e retorno do foco. Preservar campos de negócio e controles existentes. Links diretos de criação e documentos vinculados continuam suportados; entrada sem documento abre a consulta. Cabeçalho BPMN não repete título/organização, conservando navegação global e seleção entre organizações autorizadas.
