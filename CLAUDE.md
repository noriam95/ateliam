# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (Vite)
npm run build     # Production build
npm run lint      # ESLint check
npm run format    # Prettier auto-format
```

There are no automated tests. TypeScript is checked implicitly by the build (`noEmit: true` in tsconfig).

## Architecture Overview

**Ateliam** is a process management workspace (BPM/BPMN) built with TanStack Start (SSR) + React 19 + Tailwind v4, backed by Supabase. Hosted via Lovable Cloud.

### Routing

TanStack Router with file-based routes under `src/routes/`:
- `/auth` — login page
- `/_authenticated/` — main workspace (the entire app lives here, `index.tsx`)
- `/_authenticated/settings` — system settings
- `/_authenticated/m.$module` — individual module views (BPMN, etc.)

The `/_authenticated` layout (`route.tsx`) handles auth: it checks for an active demo session first, then validates Supabase session. If neither, redirects to `/auth`.

### Main Workspace (`src/routes/_authenticated/index.tsx`)

Single large component (`WorkspaceHome`) that renders a sidebar + content area. Navigation state is managed via URL search params (`?area=...&view=...`). The `WorkspaceArea` union (`"home" | "modules" | "registrations" | "reports" | "settings"`) controls which sidebar section is active.

### Server Functions

All backend calls use `createServerFn` from `@tanstack/react-start` with the `requireSupabaseAuth` middleware (in `src/integrations/supabase/auth-middleware.ts`). The middleware validates the Bearer token and injects `{ supabase, userId, claims }` into context. Server functions live in `src/lib/*.functions.ts` and `src/lib/*.server.ts` files.

Key server function files:
- `src/lib/config.functions.ts` — organization config, dashboards, catalogs (value chains, process types, areas, etc.)
- `src/lib/workspace.functions.ts` — workspace document CRUD + versioning + optional SharePoint upload
- `src/lib/documents.functions.ts` — generic document operations

### Demo Mode

`src/lib/demo-session.ts` provides a client-side demo mode that bypasses Supabase auth, storing state in `localStorage`. Active only in `DEV` or when `VITE_ENABLE_DEMO_MODE=true`. The `/_authenticated/route.tsx` `beforeLoad` checks `isDemoSessionActive()` before attempting Supabase auth.

When `isDemo` is true, components render static data from `DEMO_REGISTRY` (exported from `src/components/workspace-process-registrations.tsx`) instead of fetching from Supabase.

### Feature Components

- `src/components/workspace-process-registrations.tsx` — Cadastros section (value chains, process types, owners, areas, etc.). Exports `DEMO_REGISTRY` for use in other components.
- `src/components/workspace-reports.tsx` — Relatórios section. Cadeia de Valor diagram (3-band Porter layout). Imports `DEMO_REGISTRY` to stay in sync with Cadastros in demo mode.
- `src/components/workspace-system-settings.tsx` — Configurações section.

### Code Generation (`src/lib/code-generation.ts`)

Configurable auto/manual code numbering per type (`process`, `mapping`, `pop_it`, `flowchart`). Rules stored per-organization in `organizations.code_settings` (JSONB). Key functions: `formatCode`, `previewCode`, `applyNextCode`, `isAutoCode`.

### Styling

Tailwind v4 with CSS custom properties: `--gold`, `--blue`, `--primary`, `--card`. Color mixing via `color-mix(in oklab, var(--gold) 22%, var(--card))`. Complex shapes use CSS `clip-path: polygon(...)`.

### Path Alias

`@/*` maps to `src/*`.

### Vite / Build

Config via `@lovable.dev/vite-tanstack-config` — do **not** add TanStack Start, React, Tailwind, or tsconfig-paths plugins manually; they are already included by the preset and duplicating them breaks the build.

### Supabase Types

Generated types live in `src/integrations/supabase/types.ts`. When a migration adds columns not yet in the generated types, use `as unknown as TargetType[]` to cast until types are regenerated.
