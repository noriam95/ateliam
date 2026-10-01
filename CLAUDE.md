# CLAUDE.md

Consulte `README.md` para a visão técnica, os comandos, as variáveis de ambiente, a arquitetura e as práticas de segurança vigentes.

## Regras do repositório

- Stack: TypeScript, React 19, TanStack Start/Router/Query, Tailwind CSS 4, Supabase, Vite/Nitro e Vercel.
- Rotas são baseadas em arquivos em `src/routes/`. Nunca edite `src/routeTree.gen.ts` manualmente.
- Use o alias `@/` para imports internos.
- Funções protegidas usam `createServerFn` com `requireSupabaseAuth`.
- Nunca exponha `SUPABASE_SERVICE_ROLE_KEY` ao bundle cliente.
- Mudanças de banco devem ser migrations em `supabase/migrations/`, com RLS e testes pertinentes.
- Preserve o isolamento por `organization_id` em consultas e mutações.
- O modo de demonstração está desativado; não presuma que ele substitui autenticação ou persistência.
- Mantenha `DESIGN.md` atualizado ao alterar padrões de interface.

## Verificações

```bash
npm run lint
npm test
npm run build
```

O lint atualmente pode emitir avisos de Fast Refresh, mas não deve apresentar erros. A publicação ocorre no projeto Vercel `noriam95/bf-flow-2026` após push para `main`; confirme sucesso para o SHA exato antes de considerar a entrega concluída.
