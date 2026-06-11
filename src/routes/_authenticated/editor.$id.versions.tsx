import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { listVersions, restoreVersion } from "@/lib/documents.functions";
import { ArrowLeft, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/editor/$id/versions")({
  component: Versions,
});

function Versions() {
  const { id } = Route.useParams();
  const list = useServerFn(listVersions);
  const restore = useServerFn(restoreVersion);
  const q = useQuery({ queryKey: ["versions", id], queryFn: () => list({ data: { id } }) });

  const restoreMut = useMutation({
    mutationFn: (versionId: string) => restore({ data: { documentId: id, versionId } }),
    onSuccess: (r) => { toast.success(`Restaurada como v${r.version}`); q.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link to="/editor/$id" params={{ id }} className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4">
        <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao editor
      </Link>
      <h1 className="font-display text-2xl font-bold uppercase tracking-wide mb-6">Histórico de versões</h1>
      <div className="space-y-2">
        {q.data?.map((v) => (
          <div key={v.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4">
            <div className="font-display text-lg font-bold text-brand w-16">v{v.version_number}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm">{v.comment || <span className="text-muted-foreground italic">Sem comentário</span>}</div>
              <div className="text-[11px] text-muted-foreground">
                {new Date(v.created_at).toLocaleString("pt-BR")}
                {v.sharepoint_version_label && ` • SharePoint ${v.sharepoint_version_label}`}
              </div>
            </div>
            <button
              onClick={() => confirm(`Restaurar v${v.version_number}?`) && restoreMut.mutate(v.id)}
              disabled={restoreMut.isPending}
              className="text-xs flex items-center gap-1 px-3 py-1.5 border border-input rounded-md hover:bg-accent disabled:opacity-50"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Restaurar
            </button>
          </div>
        ))}
        {q.data?.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma versão salva ainda.</p>}
      </div>
    </div>
  );
}
