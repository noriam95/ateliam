## Visão geral

Transformar o HTML único de ~8.900 linhas em uma aplicação web TanStack Start hospedada na Lovable, com login, gravação automática em uma biblioteca do SharePoint e histórico de versões próprio do app além do nativo do SharePoint.

A portabilidade completa para componentes React de todas as telas do HTML é um trabalho muito grande para uma única iteração. A proposta abaixo entrega tudo em fases, começando por uma base funcional que já salva no SharePoint, e evolui a UI gradualmente.

## Fase 1 — Fundação (esta iteração)

1. **Backend Lovable Cloud**: habilitar para auth, banco e server functions.
2. **Login**: como o login Microsoft nativo não é suportado pelo Lovable Cloud, usar **email/senha + Google** como acesso ao app, e tratar o SharePoint via conector workspace separado. (Microsoft login per‑user exigiria registrar um app no Azure AD — posso fazer depois se você quiser.)
3. **Conector SharePoint**: conectar Microsoft SharePoint via connector da Lovable. Você escolhe o site e a biblioteca de documentos uma vez nas configurações.
4. **Modelo de dados** (Postgres):
   - `documents` (id, nome, sharepoint_item_id, sharepoint_drive_id, owner_id, updated_at)
   - `document_versions` (id, document_id, version_number, author_id, comment, content_hash, sharepoint_version_label, created_at)
   - `profiles` + `user_roles` (admin/editor/viewer)
5. **Server functions**:
   - `saveDocument` → grava HTML/JSON no SharePoint via gateway (`PUT /sites/{id}/drive/items/{id}/content`), registra nova linha em `document_versions` com autor e comentário.
   - `listVersions`, `restoreVersion`, `loadDocument`, `listDocuments`.
6. **Shell da aplicação React** (TanStack Start) com a sidebar e topbar do design do Noriam (cores, Barlow, layout escuro), rotas:
   - `/auth` (login)
   - `/` (dashboard de documentos)
   - `/editor/$id` (editor BPMN)
   - `/editor/$id/versions` (histórico)
   - `/settings` (escolha do site/biblioteca SharePoint)
7. **Editor BPMN (Fase 1)**: o HTML original carregado dentro de um `<iframe srcDoc>` na rota `/editor/$id`, com uma barra superior React que faz Save → server function. Isso preserva 100% do comportamento atual e já entrega o ciclo salvar/versionar.

## Fase 2 — Portar a UI para React (iterações seguintes)

Quebrar o HTML em componentes React por seção do menu lateral, substituindo o iframe progressivamente. Cada seção vira uma rota/`tab` própria reutilizando o design system definido na Fase 1.

## Fase 3 — Melhorias

- Comentários por versão e diff visual.
- Compartilhar link de leitura via SharePoint.
- Migrar opcionalmente para login Microsoft per‑user (cada usuário salva com sua própria identidade no SharePoint) — requer Azure AD app.

## Detalhes técnicos

- Stack: TanStack Start + React 19, Tailwind v4 com tokens do Noriam (cores `--gdk`, `--y`, etc. portadas para `src/styles.css` em oklch).
- SharePoint via `https://connector-gateway.lovable.dev/microsoft_sharepoint/...` em server functions; chaves nunca expostas ao browser.
- Upload de conteúdo > 4 MB exige sessão de upload do Graph — implementado se necessário.
- RLS: usuários só veem documentos que possuem ou onde têm papel; admins veem tudo.
- Versionamento: nativo do SharePoint (lista `versions` do item) + tabela própria com autor/comentário do app, ligadas pelo `sharepoint_version_label`.

## O que entrego nesta iteração

Tudo da **Fase 1**: backend, login, conexão SharePoint, dashboard, editor com iframe + save/versionar, histórico de versões funcional. Você poderá já usar e salvar no SharePoint ao final.

Confirma esse caminho?
