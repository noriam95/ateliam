import { createFileRoute, Link, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createDocument, deleteDocument, listDocuments } from "@/lib/documents.functions";
import { Plus, FileText, ExternalLink, Trash2, History } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

function Dashboard() {
  const router = useRouter();
  const navigate = useNavigate();
  const list = useServerFn(listDocuments);
  const create = useServerFn(createDocument);
  const del = useServerFn(deleteDocument);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const q = useQuery({ queryKey: ["documents"], queryFn: () => list() });

  const createMut = useMutation({
    mutationFn: () => create({ data: { name, description } }),
    onSuccess: async (doc) => {
      toast.success("Documento criado");
      setShowNew(false); setName(""); setDescription("");
      navigate({ to: "/editor/$id", params: { id: doc.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); router.invalidate(); q.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-display text-2xl font-bold uppercase tracking-wide">Documentos BPMN</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie, edite e versione seus processos.</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm font-medium hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Novo documento
        </button>
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando...</div>}
      {q.data && q.data.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum documento ainda. Clique em "Novo documento".</p>
        </div>
      )}
      <div className="grid gap-3">
        {q.data?.map((doc) => (
          <div key={doc.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:shadow-sm transition">
            <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link to="/editor/$id" params={{ id: doc.id }} className="font-medium hover:underline truncate">
                  {doc.name}
                </Link>
                <span className="text-[10px] font-display uppercase tracking-wider bg-secondary px-1.5 py-0.5 rounded">
                  v{doc.current_version}
                </span>
              </div>
              {doc.description && <p className="text-xs text-muted-foreground truncate">{doc.description}</p>}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Atualizado em {new Date(doc.updated_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Link
                to="/editor/$id/versions" params={{ id: doc.id }}
                className="p-2 hover:bg-accent rounded-md" title="Histórico"
              >
                <History className="h-4 w-4" />
              </Link>
              {doc.sharepoint_web_url && (
                <a href={doc.sharepoint_web_url} target="_blank" rel="noreferrer" className="p-2 hover:bg-accent rounded-md" title="Abrir no SharePoint">
                  <ExternalLink className="h-4 w-4" />
                </a>
              )}
              <button
                onClick={() => confirm(`Remover "${doc.name}"?`) && delMut.mutate(doc.id)}
                className="p-2 hover:bg-accent rounded-md text-destructive" title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {showNew && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowNew(false)}>
          <div className="bg-card rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold uppercase mb-4">Novo documento</h2>
            <div className="space-y-3">
              <input
                placeholder="Nome do processo" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md text-sm"
              />
              <textarea
                placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)}
                rows={3} className="w-full px-3 py-2 border border-input rounded-md text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setShowNew(false)} className="px-3 py-2 text-sm hover:bg-accent rounded-md">Cancelar</button>
                <button
                  onClick={() => name && createMut.mutate()}
                  disabled={!name || createMut.isPending}
                  className="px-3 py-2 bg-primary text-primary-foreground text-sm rounded-md disabled:opacity-50"
                >
                  {createMut.isPending ? "Criando..." : "Criar"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
