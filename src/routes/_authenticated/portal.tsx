import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { useMemo } from "react";
import { DocumentPortal } from "@/components/document-portal";
import type { PortalDocumentSort } from "@/lib/document-portal";
import type { PortalViewState } from "@/components/document-portal-view";

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
    role: typeof search.role === "string" ? search.role.slice(0, 160) : undefined,
    chain: typeof search.chain === "string" ? search.chain.slice(0, 80) : undefined,
    processId: typeof search.processId === "string" ? search.processId.slice(0, 80) : undefined,
    organization:
      typeof search.organization === "string" && /^[0-9a-f-]{36}$/i.test(search.organization)
        ? search.organization
        : undefined,
    view: (search.view === "library" || search.view === "saved"
      ? search.view
      : "explore") as PortalViewState["view"],
    explore: (search.explore === "area" || search.explore === "process" || search.explore === "role"
      ? search.explore
      : "chain") as PortalViewState["explore"],
    page:
      Number.isSafeInteger(Number(search.page)) && Number(search.page) > 0
        ? Math.min(Number(search.page), 100000)
        : 1,
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
      role: search.role,
      chain: search.chain,
      processId: search.processId,
      macroprocess: search.macroprocess,
      process: search.process,
      subprocess: search.subprocess,
      type: search.type,
      responsible: search.responsible,
      module: search.module,
    }),
    [
      search.area,
      search.role,
      search.chain,
      search.processId,
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
      initialView={search.view}
      initialExplore={search.explore}
      initialPage={search.page}
      requestedOrganization={search.organization}
    />
  );
}
