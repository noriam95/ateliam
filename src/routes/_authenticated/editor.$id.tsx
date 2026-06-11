import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { getDocument, saveDocument } from "@/lib/documents.functions";
import { MODULES, isModuleKey } from "@/lib/modules";
import { RichEditor, type RichEditorHandle } from "@/components/RichEditor";
import { ArrowLeft, Save, History, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/editor/$id")({
  component: Editor,
});

const BPMN_TEMPLATE_URL = "/noriam-bpmn.html";

function Editor() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const get = useServerFn(getDocument);
  const save = useServerFn(saveDocument);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const richRef = useRef<RichEditorHandle>(null);
  const [comment, setComment] = useState("");
  const [showSave, setShowSave] = useState(false);

  const q = useQuery({ queryKey: ["doc", id], queryFn: () => get({ data: { id } }) });

  const doc = q.data?.document;
  const moduleKey = doc?.module && isModuleKey(doc.module) ? doc.module : "bpmn";
  const spec = MODULES[moduleKey];

  const [initialContent, setInitialContent] = useState<string | null>(null);
  useEffect(() => {
    if (!q.data) return;
    if (q.data.content) {
      setInitialContent(q.data.content);
    } else if (spec.kind === "iframe") {
      fetch(BPMN_TEMPLATE_URL).then((r) => r.text()).then(setInitialContent).catch(() => setInitialContent("<p>Modelo indisponível</p>"));
    } else {
      setInitialContent(spec.template);
    }
  }, [q.data, spec]);

  const saveMut = useMutation({
    mutationFn: () => {
      const html = spec.kind === "iframe"
        ? iframeRef.current?.contentDocument?.documentElement?.outerHTML
        : richRef.current?.getHTML();
      if (!html) throw new Error("Conteúdo indisponível");
      return save({ data: { id, content: html, comment: comment || undefined } });
    },
    onSuccess: (r) => {
      toast.success(`Versão v${r.version} salva${r.sharepointWebUrl ? " no SharePoint" : ""}`);
      setShowSave(false); setComment(""); q.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading || initialContent === null) {
    return <div className="p-10 text-sm text-muted-foreground">Carregando editor…</div>;
  }

  const Icon = spec.icon;
  const accentVar = `var(${spec.accent})`;

  return (
    <div className="flex flex-col h-full bg-background">
      <header className="border-b border-border bg-surface px-6 py-3 flex items-center gap-4">
        <button onClick={() => navigate({ to: "/m/$module", params: { module: moduleKey } })} className="p-1.5 hover:bg-accent rounded-md" title="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div
          className="h-9 w-9 rounded-md grid place-items-center"
          style={{ color: accentVar, background: `color-mix(in oklab, ${accentVar} 10%, transparent)` }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-display uppercase tracking-[0.2em] text-muted-foreground">
            {spec.short} · v{doc?.current_version}
          </div>
          <div className="font-medium truncate -mt-0.5">{doc?.name}</div>
        </div>
        {doc?.sharepoint_web_url && (
          <a href={doc.sharepoint_web_url} target="_blank" rel="noreferrer" className="text-xs flex items-center gap-1.5 px-3 py-1.5 border border-input rounded-md hover:bg-accent">
            <ExternalLink className="h-3.5 w-3.5" /> SharePoint
          </a>
        )}
        <Link to="/editor/$id/versions" params={{ id }} className="text-xs flex items-center gap-1.5 px-3 py-1.5 border border-input rounded-md hover:bg-accent">
          <History className="h-3.5 w-3.5" /> Versões
        </Link>
        <button
          onClick={() => setShowSave(true)}
          className="text-xs flex items-center gap-1.5 px-3.5 py-1.5 bg-primary text-primary-foreground rounded-md hover:opacity-90 font-medium"
        >
          <Save className="h-3.5 w-3.5" /> Salvar versão
        </button>
      </header>

      <div className="flex-1 overflow-hidden">
        {spec.kind === "iframe" ? (
          <iframe ref={iframeRef} srcDoc={initialContent} className="w-full h-full border-0 bg-white" title="Editor BPMN" />
        ) : (
          <RichEditor ref={richRef} initialHTML={initialContent} />
        )}
      </div>

      {showSave && (
        <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowSave(false)}>
          <div className="bg-card rounded-xl p-6 max-w-md w-full shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-display text-xl font-bold mb-1">Salvar nova versão</h2>
            <p className="text-[12px] text-muted-foreground mb-4">
              Esta versão ficará disponível no histórico para consulta ou restauração.
            </p>
            <textarea
              autoFocus rows={4} placeholder="O que mudou? (opcional)"
              value={comment} onChange={(e) => setComment(e.target.value)}
              className="w-full px-3 py-2.5 border border-input rounded-md text-sm mb-4 bg-background"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowSave(false)} className="px-4 py-2 text-sm hover:bg-accent rounded-md">Cancelar</button>
              <button
                onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
                className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md disabled:opacity-50 font-medium"
              >
                {saveMut.isPending ? "Salvando…" : "Salvar versão"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
