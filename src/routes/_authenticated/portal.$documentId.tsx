import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { DocumentPortalReader } from "@/components/document-portal-reader";

export const Route = createFileRoute("/_authenticated/portal/$documentId")({
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    returnTo:
      typeof search.returnTo === "string" && /^\/portal\?[^#]*$/.test(search.returnTo)
        ? search.returnTo.slice(0, 4000)
        : undefined,
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
    <DocumentPortalReader
      documentId={documentId}
      requestedOrganization={search.organization}
      returnTo={search.returnTo}
    />
  );
}
