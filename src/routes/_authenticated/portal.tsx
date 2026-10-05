import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { useMemo } from "react";
import { DocumentPortal } from "@/components/document-portal";
import type { PortalDocumentSort } from "@/lib/document-portal";

const PORTAL_SORTS = new Set<PortalDocumentSort>([
  "relevance",
  "recent",
  "popular",
  "alphabetical",
  "effective",
  "updated",
]);

export const Route = createFileRoute("/_authenticated/portal")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    q: typeof search.q === "string" ? search.q.slice(0, 160) : undefined,
    area: typeof search.area === "string" ? search.area.slice(0, 120) : undefined,
    macroprocess:
      typeof search.macroprocess === "string" ? search.macroprocess.slice(0, 120) : undefined,
    process: typeof search.process === "string" ? search.process.slice(0, 120) : undefined,
    subprocess: typeof search.subprocess === "string" ? search.subprocess.slice(0, 120) : undefined,
    type: typeof search.type === "string" ? search.type.slice(0, 80) : undefined,
    responsible:
      typeof search.responsible === "string" ? search.responsible.slice(0, 120) : undefined,
    module:
      search.module === "ddp" || search.module === "pop" || search.module === "bpmn"
        ? search.module
        : undefined,
    sort:
      typeof search.sort === "string" && PORTAL_SORTS.has(search.sort as PortalDocumentSort)
        ? (search.sort as PortalDocumentSort)
        : undefined,
  }),
  component: PortalRoute,
  head: () => ({ meta: [{ title: "Portal de Documentos — BF Flow" }] }),
});

function PortalRoute() {
  const search = Route.useSearch();
  const initialFilters = useMemo(
    () => ({
      area: search.area,
      macroprocess: search.macroprocess,
      process: search.process,
      subprocess: search.subprocess,
      type: search.type,
      responsible: search.responsible,
      module: search.module,
    }),
    [
      search.area,
      search.macroprocess,
      search.module,
      search.process,
      search.responsible,
      search.subprocess,
      search.type,
    ],
  );
  return (
    <DocumentPortal
      initialQuery={search.q}
      initialFilters={initialFilters}
      initialSort={search.sort}
    />
  );
}
