import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  saveWorkspace,
  listWorkspaceVersions,
  getWorkspaceVersionContent,
  getOrCreateWorkspace,
} from "@/lib/workspace.functions";
import { wrapTemplate, MODULES, type AtelierModule } from "@/lib/workspace-bridge";
import { ArrowLeft, Cloud, History, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/m/$module")({
  component: ModuleWorkspacePage,
  beforeLoad: ({ params }) => {
    if (!MODULES.some((m) => m.id === params.module)) throw notFound();
  },
});

const TEMPLATE_URL = "/noriam-bpmn.html";

function ModuleWorkspacePage() {
  const { module } = Route.useParams();
  const moduleId = module as AtelierModule;
  const moduleInfo = MODULES.find((m) => m.id === moduleId)!;
  const navigate = useNavigate();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [srcDoc, setSrcDoc] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState("");

  const ensure = useServerFn(getOrCreateWorkspace);
  const save = useServerFn(saveWorkspace);
  const listVersions = useServerFn(listWorkspaceVersions);
  const getVersion = useServerFn(getWorkspaceVersionContent);

  const wsQ = useQuery({ queryKey: ["workspace"], queryFn: () => ensure() });
  const versionsQ = useQuery({
    queryKey: ["workspace-versions"],
    queryFn: () => listVersions(),
    enabled: showHistory,
  });

  useEffect(() => {
    if (!wsQ.data) return;
    let cancelled = false;
    (async () => {
      const html = await fetch(TEMPLATE_URL).then((r) => r.text());
      let state: Record<string, string> | null = null;
      if (wsQ.data?.content_inline) {
        try { state = JSON.parse(wsQ.data.content_inline); } catch { state = null; }
      }
      if (!cancelled) setSrcDoc(wrapTemplate(html, state, moduleId));
    })();
    return () => { cancelled = true; };
  }, [wsQ.data, moduleId]);

  const requestState = useCallback((): Promise<Record<string, string>> => {
    return new Promise((resolve, reject) => {
      const reqId = Math.random().toString(36).slice(2);
      const timeout = setTimeout(() => reject(new Error("Sem resposta do workspace")), 4000);
      function handler(ev: MessageEvent) {
        const m = ev.data;
        if (m?.type === "ATELIER_STATE" && m.requestId === reqId) {
          clearTimeout(timeout);
          window.removeEventListener("message", handler);
          resolve(m.state || {});
        }
      }
      window.addEventListener("message", handler);
      iframeRef.current?.contentWindow?.postMessage(
        { type: "ATELIER_GET_STATE", requestId: reqId }, "*",
      );
    });
  }, []);

  const saveMut = useMutation({
    mutationFn: async () => {
      const state = await requestState();
      const payload = JSON.stringify(state);
      const fullComment = `[${moduleInfo.title}] ${comment}`.trim();
      return save({ data: { content: payload, comment: fullComment } });
    },
    onSuccess: (r) => {
      toast.success(`Versão v${r.version} salva${r.sharepointWebUrl ? " no SharePoint" : ""}`);
      setShowSave(false); setComment("");
      wsQ.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const restoreMut = useMutation({
    mutationFn: async (versionId: string) => {
      const { content } = await getVersion({ data: { versionId } });
      if (!content) throw new Error("Versão sem conteúdo");
      const state = JSON.parse(content);
      iframeRef.current?.contentWindow?.postMessage({ type: "ATELIER_RESTORE_STATE", state }, "*");
      return state;
    },
    onSuccess: () => { toast.success("Versão restaurada — recarregando…"); setShowHistory(false); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="h-12 bg-primary text-primary-foreground flex items-center gap-3 px-4 flex-shrink-0 border-b border-primary/20">
        <button
          onClick={() => navigate({ to: "/" })}
          className="flex items-center gap-1.5 text-[12px] px-2.5 py-1.5 rounded-md hover:bg-background/10"
          title="Voltar aos módulos"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Módulos
        </button>
        <div className="h-5 w-px bg-primary-foreground/15" />
        <div className="flex items-center gap-2">
          <span className="text-base leading-none" style={{ color: "var(--brand)" }}>{moduleInfo.glyph}</span>
          <div className="font-display text-[14px] font-bold tracking-tight">{moduleInfo.title}</div>
          <span className="text-[10px] font-display uppercase tracking-[0.22em] text-primary-foreground/55 ml-1 hidden md:inline">
            {moduleInfo.tagline}
          </span>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1.5">
          <span className="hidden md:inline text-[11px] text-primary-foreground/65 mr-2">
            {wsQ.data ? `v${wsQ.data.current_version}` : "—"}
          </span>
          <button
            onClick={() => setShowSave(true)}
            className="text-[12px] flex items-center gap-1.5 px-3 py-1.5 bg-brand text-brand-foreground rounded-md font-medium hover:opacity-90"
          >
            <Cloud className="h-3.5 w-3.5" /> Salvar versão
          </button>
          <button
            onClick={() => setShowHistory(true)}
            className="text-[12px] flex items-center gap-1.5 px-3 py-1.5 border border-primary-foreground/20 rounded-md hover:bg-background/10"
          >
            <History className="h-3.5 w-3.5" /> Histórico
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden bg-background">
        {srcDoc ? (
          <iframe
            ref={iframeRef} srcDoc={srcDoc}
            className="w-full h-full border-0"
            title={`Atelier · ${moduleInfo.title}`}
          />
        ) : (
          <div className="h-full grid place-items-center text-sm text-muted-foreground">
            Carregando módulo {moduleInfo.title}…
          </div>
        )}
      </div>

      {showSave && (
        <Modal onClose={() => setShowSave(false)} title="Salvar nova versão" subtitle={`Snapshot do módulo ${moduleInfo.title}.`}>
          <textarea
            autoFocus rows={4} placeholder="O que mudou nesta versão? (opcional)"
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
        </Modal>
      )}

      {showHistory && (
        <Modal onClose={() => setShowHistory(false)} title="Histórico de versões" subtitle="Restaurar substitui o estado atual deste módulo.">
          {versionsQ.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
          {versionsQ.data?.length === 0 && (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma versão salva ainda.
            </div>
          )}
          <div className="space-y-1.5 max-h-[55vh] overflow-y-auto -mx-2 px-2">
            {versionsQ.data?.map((v) => (
              <div key={v.id} className="flex items-center gap-3 p-3 rounded-md border border-border hover:bg-accent/40">
                <div className="font-display text-base font-bold text-brand w-12 tabular-nums">v{v.version_number}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] truncate">
                    {v.comment || <span className="text-muted-foreground italic">Sem comentário</span>}
                  </div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {new Date(v.created_at).toLocaleString("pt-BR")}
                  </div>
                </div>
                <button
                  onClick={() => confirm(`Restaurar v${v.version_number}?`) && restoreMut.mutate(v.id)}
                  disabled={restoreMut.isPending}
                  className="text-[11px] flex items-center gap-1 px-2.5 py-1.5 border border-input rounded-md hover:bg-accent disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" /> Restaurar
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({ children, onClose, title, subtitle }: {
  children: React.ReactNode; onClose: () => void; title: string; subtitle?: string;
}) {
  return (
    <div className="fixed inset-0 bg-foreground/30 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-card rounded-xl p-6 max-w-lg w-full shadow-xl border border-border" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="font-display text-xl font-bold">{title}</h2>
            {subtitle && <p className="text-[12px] text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-accent rounded-md text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
