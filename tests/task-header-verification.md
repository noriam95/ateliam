# Verificação — códigos e edição da tarefa

24/09/2026. Componentes reais em `tests/task-header-preview.tsx`, dados locais e salvamento simulado, sem gravações no banco de produção.

- `node --test tests/*.test.mjs`: 28 testes passaram, incluindo seis casos de identidade, transição rascunho/final, nomes legados e reserva simultânea.
- `npm run build`: passou.
- `npm run lint`: nenhum erro; duas advertências anteriores de Fast Refresh.
- Prettier dos arquivos alterados: passou. Verificação global mantém 15 arquivos anteriores fora do padrão.
- TypeScript: 61 diagnósticos tanto em HEAD anterior quanto nesta alteração; nenhum diagnóstico novo na comparação normalizada por arquivo/mensagem.
- Auditoria estática Premium: 52 achados anteriores, nenhum novo. DESIGN.md: nenhum erro de validação.

Navegador, larguras de 390px e 1280px:

- Código exibido uma vez; pessoas, período e classificação legíveis.
- Editar dados abre diálogo com foco no responsável; selects nativos operáveis.
- Prazo anterior ao início impede salvar, anuncia erro e foca o campo.
- Salvamento desabilita os controles; sucesso fecha somente a edição e atualiza o resumo.
- Falha mantém o prazo digitado e mostra erro junto ao formulário.
- Cancelar e Escape com alterações pedem confirmação; continuar preserva valores, descartar retorna à tarefa.
- Alterar modalidade solicita confirmação separada e preserva a edição ao voltar.
- Escape no select fecha apenas o popup; Escape no diálogo não fecha o diálogo ancestral.
- Em 390px, campos se empilham e os botões permanecem acessíveis pela rolagem do diálogo.

Limite de implantação: esta versão corrige a identidade ao salvar. Registros antigos não são regravados em massa; recebem `.TEMP` no próximo salvamento como rascunho. A reserva inicial exige área identificável pela sigla cadastrada ou pelo processo vinculado. O sufixo é removido na finalização, mantendo a sequência. A numeração da tarefa TAR permanece separada da numeração MAP do documento.

Reproduzir a conferência visual após compilar: `node tests/preview-task-header.mjs`. O endereço local é `http://127.0.0.1:4182`; `/?error` simula falha e `/narrow.html` oferece viewport interno de 390px.
