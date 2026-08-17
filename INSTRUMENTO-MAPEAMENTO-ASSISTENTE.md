# Instrumento para Gerar Mapeamentos Compatíveis com o Assistente do BF Flow

Use este instrumento em outras IAs para transformar entrevistas, relatórios, atas, transcrições, documentos ou textos livres em um mapeamento compatível com o assistente de preenchimento do BF Flow.

O resultado esperado é um texto estruturado que possa ser copiado diretamente para o assistente do BF Flow, sem tabela Markdown, sem comentário explicativo e sem informações inventadas.

Este arquivo foi escrito para ser usado fora do BF Flow. A IA que receber este prompt não deve depender de contexto anterior, nomes de telas, histórico de conversa ou conhecimento interno do sistema. Todas as regras necessárias estão descritas aqui.

## 1. Prompt Principal para Outras IAs

Copie e use o texto abaixo em uma conversa ou ferramenta de apoio antes de enviar o resultado para o assistente de preenchimento.

```text
Você deve interpretar o conteúdo recebido e transformá-lo em um mapeamento estruturado para preenchimento no BF Flow.

O objetivo não é resumir o material. O objetivo é reorganizar as informações reais nos campos corretos do formulário, sem alterar termos próprios do processo e sem criar dados que não estejam sustentados pelo conteúdo.

O texto gerado será usado por outro sistema, chamado assistente de preenchimento do BF Flow. Por isso, siga exatamente a estrutura, os nomes das seções e os rótulos dos campos. Não altere a nomenclatura dos campos.

Regras obrigatórias:

1. Retorne somente o mapeamento estruturado.
2. Não use tabela Markdown.
3. Não crie campos fora da estrutura indicada.
4. Não repita a mesma informação em Objetivo, Escopo e Contexto.
5. Não invente sistemas, documentos, áreas, responsáveis, subprocessos, atividades, causas ou indicadores.
6. Quando uma informação não estiver clara, use "A definir" apenas em campos de responsável, área/ator, revisor, prazo ou dono.
7. Não use "A definir" como sistema/documento.
8. Não crie registro de sistema/documento se ele não estiver explicitamente mencionado no conteúdo.
9. Não transforme toda atividade em subprocesso.
10. Só crie subprocesso quando o conteúdo indicar claramente um agrupamento abaixo de um processo.
11. Cada atividade deve ter descrição própria. Não deixe atividade sem descrição.
12. Os sistemas/documentos usados nas atividades devem existir na seção "02 SISTEMAS/DOCUMENTOS ENVOLVIDOS".
13. Os nomes cadastráveis devem vir em CAIXA ALTA:
    - título do mapeamento;
    - processos;
    - subprocessos;
    - atividades;
    - sistemas/documentos;
    - termos do glossário;
    - oportunidades de melhoria.
14. Textos descritivos devem manter escrita normal, sem caixa alta forçada.
15. Datas devem usar o padrão DD/MM/AAAA.
16. A seção "05 VISÃO QUANTITATIVA" não deve ser preenchida manualmente. Ela será calculada pelo sistema.

Estruture o conteúdo exatamente nas seções:

00 DADOS DO MAPEAMENTO
01 VISÃO GERAL
02 SISTEMAS/DOCUMENTOS ENVOLVIDOS
03 ANÁLISE SIPOC
04 ETAPAS DO PROCESSO
05 VISÃO QUANTITATIVA
06 OPORTUNIDADES DE MELHORIA
07 PRÓXIMOS PASSOS
08 GLOSSÁRIO

Antes de finalizar, valide:

- Se existe apenas um processo principal do mapeamento em "00 DADOS DO MAPEAMENTO".
- Se os processos operacionais estão em "04 ETAPAS DO PROCESSO".
- Se subprocessos aparecem somente dentro do processo ao qual pertencem.
- Se atividades aparecem abaixo do processo ou subprocesso correto.
- Se cada atividade possui:
  - classificação de execução;
  - área/ator;
  - descrição;
  - sistemas/documentos utilizados, quando houver.
- Se não existem sistemas/documentos inferidos sem base no texto.
- Se o glossário está no padrão "Termo" e "Definição", sem gerar registros chamados "termo" ou "definição".
- Se oportunidades de melhoria foram extraídas quando o texto indicar problema, risco, lacuna, controle manual, retrabalho, ausência de integração, ausência de responsável, ausência de histórico, falta de critério, divergência ou dependência de controle paralelo.

Retorne o conteúdo no modelo abaixo.
```

## 2. Modelo Obrigatório de Saída para Copiar no BF Flow

```text
00 DADOS DO MAPEAMENTO

Título do mapeamento: [TÍTULO EM CAIXA ALTA]
Modalidade: [AS IS ou TO BE]
Data: [DD/MM/AAAA]
Status: Rascunho
Processo mapeado: [NOME DO PROCESSO PRINCIPAL EM CAIXA ALTA]
Código do processo: [se existir no material; caso contrário, deixar em branco]
Cadeia de valor: [se informado; caso contrário, A definir]
Área: [área principal se informada; caso contrário, A definir]
Dono do processo: [dono se informado; caso contrário, A definir]
Elaborador: [se informado; caso contrário, A definir]
Revisor: [se informado; caso contrário, A definir]

01 VISÃO GERAL

Objetivo:
[Texto único e objetivo. Não repetir Escopo nem Contexto.]

Escopo:
[Limites do mapeamento: onde começa, onde termina, o que inclui e, se houver, o que não inclui.]

Contexto:
[Situação operacional, particularidades do processo, condições, exceções, controles paralelos, dependências e observações relevantes.]

02 SISTEMAS/DOCUMENTOS ENVOLVIDOS

Sistema/Documento: [NOME EM CAIXA ALTA]
Classificação: [Sistemas corporativos | Ferramentas auxiliares | Documentos e comunicações | Fontes externas]
Descrição:
[Como é usado no processo. Não repetir o nome como descrição.]

Sistema/Documento: [NOME EM CAIXA ALTA]
Classificação: [Sistemas corporativos | Ferramentas auxiliares | Documentos e comunicações | Fontes externas]
Descrição:
[Descrição do uso.]

03 ANÁLISE SIPOC

Linha 1
Processo: [PROCESSO OU SUBPROCESSO ANALISADO]
Fornecedores: [itens separados por ponto e vírgula]
Entradas: [itens separados por ponto e vírgula]
Saídas: [itens separados por ponto e vírgula]
Clientes: [itens separados por ponto e vírgula]

Linha 2
Processo: [PROCESSO OU SUBPROCESSO ANALISADO]
Fornecedores: [itens separados por ponto e vírgula]
Entradas: [itens separados por ponto e vírgula]
Saídas: [itens separados por ponto e vírgula]
Clientes: [itens separados por ponto e vírgula]

04 ETAPAS DO PROCESSO

Processo 1: [NOME DO PROCESSO EM CAIXA ALTA]
Área/ator do processo: [área ou ator explícito; caso contrário, A definir]
Descrição do processo:
[Descrição do processo. Não incluir atividades aqui.]
Sistemas/documentos do processo: [nomes exatamente iguais aos da seção 02, separados por ponto e vírgula; se não houver, deixar em branco]

Subprocesso 1.1: [NOME DO SUBPROCESSO EM CAIXA ALTA]
Área/ator do subprocesso: [área ou ator explícito; caso contrário, A definir]
Descrição do subprocesso:
[Descrição do agrupamento de atividades.]
Sistemas/documentos do subprocesso: [nomes exatamente iguais aos da seção 02; se não houver, deixar em branco]

Atividade 1.1.1: [NOME DA ATIVIDADE EM CAIXA ALTA]
Classificação: [Automática | Manual no sistema | Manual fora do sistema | Híbrida (manual/automática)]
Área/ator da atividade: [área, cargo ou ator explícito; caso contrário, A definir]
Descrição da atividade:
[Descrição completa da atividade, com entrada, ação executada e resultado esperado.]
Sistemas/documentos utilizados: [nomes exatamente iguais aos da seção 02, separados por ponto e vírgula; se não houver, deixar em branco]

Atividade 1.1.2: [NOME DA ATIVIDADE EM CAIXA ALTA]
Classificação: [Automática | Manual no sistema | Manual fora do sistema | Híbrida (manual/automática)]
Área/ator da atividade: [área, cargo ou ator explícito; caso contrário, A definir]
Descrição da atividade:
[Descrição completa.]
Sistemas/documentos utilizados: [nomes exatamente iguais aos da seção 02; se não houver, deixar em branco]

Subprocesso 1.2: [NOME DO SUBPROCESSO EM CAIXA ALTA]
Área/ator do subprocesso: [área ou ator explícito; caso contrário, A definir]
Descrição do subprocesso:
[Descrição do agrupamento.]
Sistemas/documentos do subprocesso: [nomes exatamente iguais aos da seção 02; se não houver, deixar em branco]

Atividade 1.2.1: [NOME DA ATIVIDADE EM CAIXA ALTA]
Classificação: [Automática | Manual no sistema | Manual fora do sistema | Híbrida (manual/automática)]
Área/ator da atividade: [área, cargo ou ator explícito; caso contrário, A definir]
Descrição da atividade:
[Descrição completa.]
Sistemas/documentos utilizados: [nomes exatamente iguais aos da seção 02; se não houver, deixar em branco]

Processo 2: [NOME DO PROCESSO EM CAIXA ALTA]
Área/ator do processo: [área ou ator explícito; caso contrário, A definir]
Descrição do processo:
[Descrição do processo.]
Sistemas/documentos do processo: [nomes exatamente iguais aos da seção 02; se não houver, deixar em branco]

Atividade 2.1: [NOME DA ATIVIDADE EM CAIXA ALTA]
Classificação: [Automática | Manual no sistema | Manual fora do sistema | Híbrida (manual/automática)]
Área/ator da atividade: [área, cargo ou ator explícito; caso contrário, A definir]
Descrição da atividade:
[Descrição completa.]
Sistemas/documentos utilizados: [nomes exatamente iguais aos da seção 02; se não houver, deixar em branco]

05 VISÃO QUANTITATIVA

Esta seção é calculada automaticamente pelo BF Flow a partir dos processos, subprocessos, atividades, áreas/atores, classificações de execução e sistemas/documentos informados.
Não preencher manualmente.

06 OPORTUNIDADES DE MELHORIA

Oportunidade 1
Causa: [NOME DA OPORTUNIDADE EM CAIXA ALTA]
Descrição:
[Descrição da situação observada.]
Impacto:
[Impacto operacional, risco, retrabalho, perda de rastreabilidade, atraso ou outro efeito.]
Ação proposta:
[Ação objetiva sugerida.]
Responsável: [se explícito; caso contrário, A definir]
Prazo: [DD/MM/AAAA, período ou A definir]
Prioridade: [Alta | Média | Baixa]
Status: Não iniciada

Oportunidade 2
Causa: [NOME DA OPORTUNIDADE EM CAIXA ALTA]
Descrição:
[Descrição.]
Impacto:
[Impacto.]
Ação proposta:
[Ação.]
Responsável: [se explícito; caso contrário, A definir]
Prazo: [DD/MM/AAAA, período ou A definir]
Prioridade: [Alta | Média | Baixa]
Status: Não iniciada

07 PRÓXIMOS PASSOS

Próximo passo 1
Ação:
[Ação a executar.]
Responsável: [se explícito; caso contrário, A definir]
Prazo: [DD/MM/AAAA, período ou A definir]

Próximo passo 2
Ação:
[Ação a executar.]
Responsável: [se explícito; caso contrário, A definir]
Prazo: [DD/MM/AAAA, período ou A definir]

08 GLOSSÁRIO

Termo: [TERMO EM CAIXA ALTA]
Definição:
[Definição objetiva.]

Termo: [TERMO EM CAIXA ALTA]
Definição:
[Definição objetiva.]
```

## 3. Regras de Interpretação

### 3.1 Processo, subprocesso e atividade

Use esta regra para evitar a criação errada de estrutura.

| Nível | Quando usar | Exemplo |
|---|---|---|
| Processo | Fluxo principal, modalidade operacional ou etapa macro que agrupa atividades | EXPORTAÇÃO INDIRETA |
| Subprocesso | Bloco subordinado ao processo, com objetivo próprio e conjunto de atividades | FORMALIZAR E CADASTRAR O CONTRATO |
| Atividade | Ação executável, com verbo, responsável ou resultado claro | RECEBER E CONFERIR A VENDA E O CONTRATO |

Regras:

- Não use subprocesso se o texto apenas listar uma atividade.
- Não crie subprocesso chamado "Subprocesso".
- Não crie atividade sem descrição.
- Se houver um processo com dois subprocessos, registre exatamente um processo e dois subprocessos.
- As atividades devem ficar dentro do subprocesso ao qual pertencem.
- Se uma atividade não pertencer claramente a um subprocesso, registre-a diretamente abaixo do processo.

### 3.2 Classificação da execução

| Classificação | Usar quando |
|---|---|
| Automática | A ação ocorre pelo sistema sem intervenção humana relevante. |
| Manual no sistema | O usuário executa a ação dentro de sistema corporativo ou ferramenta. |
| Manual fora do sistema | A ação ocorre por e-mail, telefone, reunião, planilha avulsa, documento ou controle externo. |
| Híbrida (manual/automática) | Há intervenção humana e algum processamento automático relevante. |

Quando houver dúvida entre "Manual no sistema" e "Híbrida", use "Manual no sistema" se a automação não estiver explicitamente descrita.

### 3.3 Sistemas/documentos

Classifique apenas itens explicitamente mencionados.

| Classificação | Exemplos |
|---|---|
| Sistemas corporativos | ERP TOTVS PROTHEUS, Fluig, SAP, sistema interno |
| Ferramentas auxiliares | Microsoft Excel, consulta SQL, Microsoft Word, planilha, painel auxiliar |
| Documentos e comunicações | E-mail, contrato, nota fiscal, ordem de serviço, formulário, ata, relatório |
| Fontes externas | Extrato bancário, cliente, fornecedor, órgão externo, certificadora, portal externo |

Regras:

- Não criar "A definir" como sistema/documento.
- Não criar ferramenta genérica se o texto não mencionar.
- Não duplicar o mesmo sistema com grafias diferentes.
- Use sempre o mesmo nome em todas as seções.

### 3.4 Área/ator

Use somente quando houver indicação clara no conteúdo.

Exemplos válidos:

- Comercial;
- Financeiro;
- Logística;
- Manutenção;
- Borracharia;
- Portaria;
- PCM;
- Solicitante;
- Gestor;
- Fornecedor.

Se o responsável não estiver claro, usar:

```text
Área/ator da atividade: A definir
```

Não conte "A definir" como área identificada.

### 3.5 Oportunidades de melhoria

Criar oportunidade quando o texto indicar:

- controle paralelo;
- ausência de integração;
- retrabalho;
- transcrição manual;
- ausência de histórico;
- ausência de responsável;
- falta de critério;
- baixa rastreabilidade;
- divergência entre sistemas;
- dependência de e-mail, telefone ou planilha sem controle;
- risco operacional;
- dificuldade de consulta;
- ausência de padronização.

Não criar oportunidade se o texto apenas descrever uma atividade normal sem problema associado.

### 3.6 Glossário

Formato obrigatório:

```text
Termo: OS
Definição:
Ordem de Serviço utilizada para formalizar uma demanda de manutenção.
```

Nunca usar:

```text
Termo: termo
Definição: OS

Termo: definição
Definição: Ordem de Serviço...
```

## 4. Checklist de Validação Antes de Enviar ao Assistente do BF Flow

Use esta lista antes de colar o conteúdo no assistente de preenchimento.

- [ ] O texto começa em "00 DADOS DO MAPEAMENTO".
- [ ] Todas as seções existem e estão numeradas de 00 a 08.
- [ ] A seção 05 informa que a visão quantitativa é automática.
- [ ] O título do mapeamento está em caixa alta.
- [ ] O processo mapeado foi identificado.
- [ ] Objetivo, Escopo e Contexto não estão duplicados.
- [ ] Todos os sistemas/documentos usados nas atividades estão cadastrados na seção 02.
- [ ] Não existe sistema/documento chamado "A definir".
- [ ] Não existe atividade sem descrição.
- [ ] Subprocessos foram criados somente quando há agrupamento real.
- [ ] Oportunidades de melhoria foram extraídas quando o texto indicou problema, risco ou lacuna.
- [ ] O glossário está no formato correto.
- [ ] Datas estão no padrão DD/MM/AAAA.
- [ ] Campos incertos foram marcados como "A definir", sem inventar informação.

## 5. Exemplo Mínimo Correto

```text
00 DADOS DO MAPEAMENTO

Título do mapeamento: GESTÃO DA MANUTENÇÃO VEICULAR
Modalidade: AS IS
Data: 17/08/2026
Status: Rascunho
Processo mapeado: GESTÃO DA MANUTENÇÃO VEICULAR
Código do processo:
Cadeia de valor: A definir
Área: Manutenção
Dono do processo: A definir
Elaborador: A definir
Revisor: A definir

01 VISÃO GERAL

Objetivo:
Documentar o processo atual de gestão das demandas de manutenção veicular, desde a identificação da necessidade até o encerramento da Ordem de Serviço.

Escopo:
O mapeamento contempla solicitações de manutenção em condição regular e situações de veículo em trânsito ou com necessidade urgente de intervenção. Inclui comunicação da necessidade, abertura da Ordem de Serviço, diagnóstico, aquisição de peças quando aplicável, execução, validação, faturamento e encerramento.

Contexto:
A gestão da manutenção veicular utiliza comunicações por WhatsApp ou telefone, registros no ERP TOTVS Protheus e controles auxiliares. Parte das informações depende de interação entre unidade, equipe de Manutenção, fornecedores e áreas de apoio.

02 SISTEMAS/DOCUMENTOS ENVOLVIDOS

Sistema/Documento: ERP TOTVS PROTHEUS
Classificação: Sistemas corporativos
Descrição:
Sistema utilizado para registrar Ordens de Serviço, solicitações, pedidos de compra, aprovações e encerramentos relacionados à manutenção veicular.

Sistema/Documento: WHATSAPP
Classificação: Documentos e comunicações
Descrição:
Canal utilizado para comunicação inicial de necessidades de manutenção entre unidades e equipe responsável.

03 ANÁLISE SIPOC

Linha 1
Processo: GESTÃO DA MANUTENÇÃO VEICULAR
Fornecedores: Unidade; Motorista; Manutenção; Fornecedor
Entradas: Necessidade de manutenção; informações do veículo; diagnóstico; peças; orçamento
Saídas: Ordem de Serviço registrada; manutenção executada; serviço validado; OS encerrada
Clientes: Unidade; Manutenção; Financeiro; Gestão

04 ETAPAS DO PROCESSO

Processo 1: GESTÃO DA MANUTENÇÃO VEICULAR
Área/ator do processo: Manutenção
Descrição do processo:
Controlar as demandas de manutenção veicular em condições regulares e urgentes, organizando atendimento, registro, execução, validação e encerramento.
Sistemas/documentos do processo: ERP TOTVS PROTHEUS; WHATSAPP

Subprocesso 1.1: MANUTENÇÃO EM CONDIÇÃO REGULAR
Área/ator do subprocesso: Manutenção
Descrição do subprocesso:
Tratar demandas de manutenção em que há tempo operacional para organizar formalização, atendimento e eventual aquisição de peças.
Sistemas/documentos do subprocesso: ERP TOTVS PROTHEUS; WHATSAPP

Atividade 1.1.1: IDENTIFICAR NECESSIDADE DE MANUTENÇÃO
Classificação: Manual fora do sistema
Área/ator da atividade: Unidade
Descrição da atividade:
A unidade identifica a necessidade de manutenção do veículo e comunica a equipe de Manutenção com as informações disponíveis sobre a ocorrência.
Sistemas/documentos utilizados: WHATSAPP

Atividade 1.1.2: ABRIR ORDEM DE SERVIÇO
Classificação: Manual no sistema
Área/ator da atividade: Manutenção
Descrição da atividade:
A equipe de Manutenção registra a Ordem de Serviço no ERP TOTVS Protheus para formalizar a demanda e permitir o acompanhamento do atendimento.
Sistemas/documentos utilizados: ERP TOTVS PROTHEUS

05 VISÃO QUANTITATIVA

Esta seção é calculada automaticamente pelo BF Flow a partir dos processos, subprocessos, atividades, áreas/atores, classificações de execução e sistemas/documentos informados.
Não preencher manualmente.

06 OPORTUNIDADES DE MELHORIA

Oportunidade 1
Causa: COMUNICAÇÃO INICIAL FORA DO SISTEMA
Descrição:
A necessidade de manutenção pode ser comunicada por WhatsApp antes da formalização no ERP.
Impacto:
Pode haver perda de rastreabilidade, demora na formalização e dificuldade de acompanhamento.
Ação proposta:
Definir regra para registrar a solicitação no sistema antes do início do atendimento, exceto em situações emergenciais.
Responsável: A definir
Prazo: A definir
Prioridade: Média
Status: Não iniciada

07 PRÓXIMOS PASSOS

Próximo passo 1
Ação:
Validar o fluxo com a equipe de Manutenção.
Responsável: A definir
Prazo: A definir

08 GLOSSÁRIO

Termo: OS
Definição:
Ordem de Serviço utilizada para formalizar uma demanda de manutenção.

Termo: ERP
Definição:
Sistema corporativo utilizado para registrar e controlar processos operacionais e administrativos.
```
