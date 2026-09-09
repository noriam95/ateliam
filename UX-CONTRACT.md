# Contrato de interação — Home e Minhas tarefas

Fonte de negócio: requisitos explícitos do usuário nesta tarefa em 09/09/2026. Fonte de autorização: autenticação Supabase existente e user_tasks_command na migração 20260909190000_user_tasks.sql.

| Capacidade     | Responsável canônico           | Regra                                                           |
| -------------- | ------------------------------ | --------------------------------------------------------------- |
| Navegação      | WorkspaceHome / WorkspaceRail  | Home e Minhas tarefas preservam o shell atual                   |
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
