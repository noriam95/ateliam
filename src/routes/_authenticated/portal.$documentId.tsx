import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { DocumentPortalReader } from "@/components/document-portal-reader";

export const Route = createFileRoute("/_authenticated/portal/$documentId")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    organization:
      typeof search.organization === "string" && /^[0-9a-f-]{36}$/i.test(search.organization)
        ? search.organization
        : undefined,
  }),
  component: PortalDocumentRoute,
  head: () => ({ meta: [{ title: "Documento vigente — BF Flow" }] }),
});

function PortalDocumentRoute() {
  const { documentId } = Route.useParams();
  const search = Route.useSearch();
  return (
    <DocumentPortalReader documentId={documentId} requestedOrganization={search.organization} />
  );
}
