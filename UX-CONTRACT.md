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
