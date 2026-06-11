import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getDocument, saveDocument } from "@/lib/documents.functions";
import { ArrowLeft, Save, History, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/editor/$id")({
  component: Editor,
});

const TEMPLATE_URL = "/noriam-bpmn.html";

function Editor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getDocument);
  const save = useServerFn(saveDocument);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [comment, setComment] = useState("");
  const [showSave, setShowSave] = useState(false);

  const q = useQuery({ queryKey: ["doc", id], queryFn: () => get({ data: { id } }) });

  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return;
    if (q.data.content) {
      setSrcDoc(q.data.content);
    } else {
      fetch(TEMPLATE_URL).then((r) => r.text()).then(setSrcDoc).catch(() => setSrcDoc("<p>Modelo não disponível</p>"));
    }
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () => {
      const html = iframeRef.current?.contentDocument?.documentElement?.outerHTML;
      if (!html) throw new Error("Conteúdo do editor indisponível");
      return save({ data: { id, content: html, comment: comment || undefined } });
    },
    onSuccess: (r) => {
      toast.success(`Versão v${r.version} salva${r.sharepointWebUrl ? " no SharePoint" : " (local)"}`);
      setShowSave(false); setComment(""); q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || !srcDoc) {
    return <div className="p-8 text-sm text-muted-foreground">Carregando editor...</div>;
  }

  const doc = q.data?.document;
  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border bg-card px-6 py-3 flex items-center gap-3">
        <button onClick={() => navigate({ to: "/" })} className="p-1.5 hover:bg-accent rounded-md">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{doc?.name}</div>
          <div className="text-[11px] text-muted-foreground">
            Versão atual: v{doc?.current_version}
          </div>
        </div>
        {doc?.sharepoint_web_url && (
          <a href={doc.sharepoint_web_url} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1 px-3 py-1.5 border border-input rounded-md hover:bg-accent">
            <ExternalLink className="h-3.5 w-3.5" /> SharePoint
          </a>
        )}
        <Link to="/editor/$id/versions" params={{ id }} className="text-xs flex items-center gap-1 px-3 py-1.5 border border-input rounded-md hover:bg-accent">
          <History className="h-3.5 w-3.5" /> Versões
        </Link>
        <button
          onClick={() => setShowSave(true)}
          className="text-xs flex items-center gap-1 px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90"
        >
          <Save className="h-3.5 w-3.5" /> Salvar nova versão
        </button>
      </div>
      <iframe ref={iframeRef} srcDoc={srcDoc} className="flex-1 w-full border-0 bg-white" title="Editor BPMN" />

      {showSave && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setShowSave(false)}>
          <div className="bg-card rounded-lg p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-lg font-bold uppercase mb-4">Salvar nova versão</h2>
            <textarea
              autoFocus rows={4} placeholder="Comentário (o que mudou?)"
              value={comment} onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md text-sm mb-3"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSave(false)} className="px-3 py-2 text-sm hover:bg-accent rounded-md">Cancelar</button>
              <button
                onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className="px-3 py-2 bg-primary text-primary-foreground text-sm rounded-md disabled:opacity-50"
              >
                {saveMut.isPending ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
