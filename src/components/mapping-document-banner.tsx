import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDocumentMapping } from "@/lib/mapping-workflow.functions";
import { STATUS_LABELS, demandCode } from "@/lib/mapping-workflow";
export function MappingDocumentBanner({
  documentId,
  savedNonce = 0,
}: {
  documentId: string;
  savedNonce?: number;
}) {
  const get = useServerFn(getDocumentMapping);
  const query = useQuery({
    queryKey: ["document-mapping", documentId, savedNonce],
    queryFn: () => get({ data: { documentId } }),
  });
  const d = query.data;
  if (query.error)
    return (
      <p className="mb-3 text-xs text-destructive" role="alert">
        Não foi possível consultar o vínculo do mapeamento. {query.error.message}
      </p>
    );
  if (!d) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-accent p-3 text-xs">
      <div>
        <strong>
          {demandCode(d.number)} · {d.modality}
        </strong>
        <p className="mt-1 text-muted-foreground">
          {STATUS_LABELS[d.status]}
          {["validation", "completed", "cancelled"].includes(d.status)
            ? " · Edição bloqueada nesta etapa."
            : ""}
        </p>
      </div>
      <a
        href={`/mapping?id=${d.id}`}
        className="rounded-md border border-border bg-card px-3 py-2 font-semibold hover:bg-muted"
      >
        Ver demanda, tarefas e checklist
      </a>
    </div>
  );
}
