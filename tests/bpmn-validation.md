# BPMN validation — 2026-09-25

## Automated checks

- `node --test tests/*.test.mjs`: 41 passed, zero failures.
- Browser harness (`node tests/preview-bpmn.mjs`, after build): 15 engine assertions passed, including exact DI round trips for the supplied Bizagi reference in both Modeler and NavigatedViewer.
- Engine checks cover moving, undo/redo, labels, task resizing, lanes, duplication, connection waypoints and read-only presentation.
- Persistence tests execute repository mutations against PGlite: concurrent writes, stale timestamps, idempotent retries, tenant scoping, deleted documents and stable code reservation.
- Production build passed. ESLint has no errors; three existing warnings remain outside the new BPMN components.
- The project-wide TypeScript check is not clean: existing diagnostics remain outside the new BPMN implementation. See the baseline comparison in the task logs.
- Strict UX audit: no findings in the new BPMN components; existing findings elsewhere remain.

## Manual browser checks

- Imported `MERCADO_INTERNO_ASIS_Bizagi_REV02_premissas_visuais.bpmn` through all wizard steps; confirmed process selection and explicit area/position bindings, leaving one lane unbound.
- Verified rendering, edit/presentation switching, retained undo history, text editing, viewport navigation and narrow-screen properties.
- Simulated network failure retained changes and disabled automatic retries; manual retry saved successfully.
- Central-catalog creation and saves in the browser harness use simulated services. Authenticated production Supabase writes were not exercised in this session. Persistence SQL semantics were tested separately.

## Operational limits

- Import accepts files up to 1.5 MB; save payloads are limited to 4 MB, including retained originals.
- The source XML is retained separately and downloadable. Unsupported extensions generate warnings.
- Version numbers increment atomically with the document. This change does not introduce a historical snapshot/restore UI.
- Legacy diagrams retain their original JSON for download; unattached legacy lines cannot be translated into semantic BPMN connections.

## Reproduction

1. `npm ci`
2. `node --test tests/*.test.mjs`
3. `npm run build`
4. `node tests/preview-bpmn.mjs`
5. Open the local address printed by the harness and click “Testar motor BPMN”.
