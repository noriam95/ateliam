import { createFileRoute, Link, useNavigate, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { createDocument, deleteDocument, listDocuments } from "@/lib/documents.functions";
import { MODULES, isModuleKey } from "@/lib/modules";
import { Plus, ExternalLink, Trash2, History, FileText, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/m/$module")({
  beforeLoad: ({ params }) => {
    if (!isModuleKey(params.module)) throw notFound();
  },
  component: ModulePage,
});

function ModulePage() {
  const { module } = Route.useParams();
  if (!isModuleKey(module)) return null;
  const spec = MODULES[module];
  const navigate = useNavigate();
  const list = useServerFn(listDocuments);
  const create = useServerFn(createDocument);
  const del = useServerFn(deleteDocument);
  const [showNew, setShowNew] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const q = useQuery({
    queryKey: ["documents", module],
    queryFn: () => list({ data: { module } }),
  });

  const createMut = useMutation({
    mutationFn: () =>
      create({
        data: { name, description, module, content: spec.kind === "richtext" ? spec.template : undefined },
      }),
    onSuccess: (doc) => {
      toast.success("Documento criado");
      setShowNew(false); setName(""); setDescription("");
      navigate({ to: "/editor/$id", params: { id: doc.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); q.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const Icon = spec.icon;
  const accentVar = `var(${spec.accent})`;

  return (
    <div className="px-10 py-10 max-w-5xl mx-auto">
      <Link to="/" className="text-[12px] text-muted-foreground hover:text-foreground flex items-center gap-1 mb-6">
        <ArrowLeft className="h-3.5 w-3.5" /> Visão geral
      </Link>

      <div className="flex items-start justify-between mb-10">
        <div className="flex gap-5">
          <div
            className="h-14 w-14 rounded-xl grid place-items-center border border-border"
            style={{ color: accentVar, background: `color-mix(in oklab, ${accentVar} 8%, transparent)` }}
          >
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <div className="text-[10px] font-display uppercase tracking-[0.22em] text-muted-foreground mb-1">
              Módulo
            </div>
            <h1 className="font-display text-3xl font-bold leading-tight">{spec.name}</h1>
            <p className="text-muted-foreground mt-1.5 text-[14px] max-w-2xl">{spec.description}</p>
          </div>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-medium hover:opacity-90 shrink-0"
        >
          <Plus className="h-4 w-4" /> Novo documento
        </button>
      </div>

      {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
      {!q.isLoading && q.data?.length === 0 && (
        <div className="bg-card border border-dashed border-border rounded-xl p-14 text-center">
          <FileText className="h-9 w-9 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">
            Nenhum documento aqui ainda.
          </p>
          <button
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Criar o primeiro
          </button>
        </div>
      )}

      <div className="grid gap-2.5">
        {q.data?.map((doc) => (
          <div key={doc.id} className="bg-card border border-border rounded-lg p-4 flex items-center gap-4 hover:border-foreground/20 transition">
            <div
              className="h-10 w-10 rounded-md grid place-items-center"
              style={{ color: accentVar, background: `color-mix(in oklab, ${accentVar} 10%, transparent)` }}
            >
              <FileText className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link to="/editor/$id" params={{ id: doc.id }} className="font-medium hover:underline truncate">
                  {doc.name}
                </Link>
                <span className="text-[10px] font-display uppercase tracking-wider bg-secondary px-1.5 py-0.5 rounded text-secondary-foreground">
                  v{doc.current_version}
                </span>
              </div>
              {doc.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{doc.description}</p>}
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Atualizado em {new Date(doc.updated_at).toLocaleString("pt-BR")}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <Link to="/editor/$id/versions" params={{ id: doc.id }} className="p-2 hover:bg-accent rounded-md" title="Histórico">
                <History className="h-4 w-4" />
              </Link>
              {doc.sharepoint_web_url && (
                <a href={doc.sharepoint_web_url} target="_blank" rel="noreferrer" className="p-2 hover:bg-accent rounded-md" title="SharePoint">
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
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowNew(false)}>
          <div className="bg-card rounded-xl p-6 max-w-md w-full shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <div className="text-[11px] font-display uppercase tracking-[0.2em] text-muted-foreground mb-1">
              {spec.short}
            </div>
            <h2 className="font-display text-xl font-bold mb-5">Novo documento</h2>
            <div className="space-y-3">
              <input
                autoFocus placeholder="Nome do documento" value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3 py-2.5 border border-input rounded-md text-sm bg-background"
              />
              <textarea
                placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)}
                rows={3} className="w-full px-3 py-2.5 border border-input rounded-md text-sm bg-background"
              />
              <div className="flex gap-2 justify-end pt-2">
                <button onClick={() => setShowNew(false)} className="px-4 py-2 text-sm hover:bg-accent rounded-md">Cancelar</button>
                <button
                  onClick={() => name && createMut.mutate()}
                  disabled={!name || createMut.isPending}
                  className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md disabled:opacity-50 font-medium"
                >
                  {createMut.isPending ? "Criando…" : "Criar e abrir"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
