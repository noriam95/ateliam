import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listDocuments } from "@/lib/documents.functions";
import { MODULE_LIST } from "@/lib/modules";
import { ArrowUpRight, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: Overview,
});

function Overview() {
  const list = useServerFn(listDocuments);
  const q = useQuery({ queryKey: ["documents", "all"], queryFn: () => list({ data: {} }) });
  const docs = q.data ?? [];

  return (
    <div className="px-10 py-12 max-w-6xl mx-auto">
      <div className="mb-12">
        <div className="text-[11px] font-display uppercase tracking-[0.22em] text-muted-foreground mb-3">
          Workspace · Atelier
        </div>
        <h1 className="font-display text-4xl font-bold text-foreground leading-tight">
          Bem-vindo ao seu ateliê de processos.
        </h1>
        <p className="text-muted-foreground mt-3 text-[15px] max-w-2xl">
          Escolha um módulo para criar, editar e versionar documentos. Cada módulo é um ambiente
          independente, com seu próprio fluxo de trabalho.
        </p>
      </div>

      {/* Modules grid */}
      <div className="grid md:grid-cols-3 gap-4 mb-12">
        {MODULE_LIST.map((m) => {
          const count = docs.filter((d) => d.module === m.key).length;
          const Icon = m.icon;
          return (
            <Link
              key={m.key}
              to="/m/$module"
              params={{ module: m.key }}
              className="group relative bg-card border border-border rounded-xl p-6 hover:border-foreground/30 transition overflow-hidden"
            >
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ background: `var(${m.accent})` }}
              />
              <div className="flex items-start justify-between mb-6">
                <div
                  className="h-11 w-11 rounded-lg grid place-items-center border border-border"
                  style={{ color: `var(${m.accent})` }}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition" />
              </div>
              <div className="font-display text-lg font-semibold mb-1">{m.name}</div>
              <p className="text-[13px] text-muted-foreground leading-relaxed mb-5">{m.description}</p>
              <div className="flex items-center justify-between pt-4 border-t border-border">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-display">
                  Documentos
                </span>
                <span className="font-display text-xl font-bold tabular-nums">{count}</span>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-display text-sm uppercase tracking-[0.18em] text-muted-foreground">
            Atividade recente
          </h2>
        </div>
        {q.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {!q.isLoading && docs.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum documento ainda. Entre em um módulo para começar.
            </p>
          </div>
        )}
        <div className="divide-y divide-border border border-border rounded-xl overflow-hidden bg-card">
          {docs.slice(0, 6).map((d) => {
            const mod = MODULE_LIST.find((m) => m.key === d.module) ?? MODULE_LIST[0];
            return (
              <Link
                key={d.id}
                to="/editor/$id"
                params={{ id: d.id }}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-accent/40 transition"
              >
                <span
                  className="text-[10px] font-display uppercase tracking-wider px-2 py-0.5 rounded"
                  style={{ background: `color-mix(in oklab, var(${mod.accent}) 15%, transparent)`, color: `var(${mod.accent})` }}
                >
                  {mod.short}
                </span>
                <span className="font-medium flex-1 truncate">{d.name}</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">v{d.current_version}</span>
                <span className="text-[11px] text-muted-foreground">
                  {new Date(d.updated_at).toLocaleDateString("pt-BR")}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
