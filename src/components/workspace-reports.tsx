import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  FileSpreadsheet,
  ImageDown,
  Maximize2,
  Network,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteProcessRegistration,
  listProcessRegistrationData,
  saveValueChainRegistration,
} from "@/lib/config.functions";
import { DEMO_REGISTRY } from "@/components/workspace-process-registrations";
import { downloadXlsx } from "@/lib/xlsx-export";

type ChainCategory = "primary" | "support" | "management";

// Opções completas para o formulário de cadastro (o mesmo texto do cadastro de
// processos). A tabela continua exibindo o rótulo curto de CATEGORY_LABELS.
const VALUE_CHAIN_CATEGORY_OPTIONS: Array<{ value: ChainCategory; label: string }> = [
  { value: "primary", label: "Processos Primários / Finalísticos" },
  { value: "support", label: "Processos de Apoio / Suporte" },
  { value: "management", label: "Processos de Gestão / Estratégicos" },
];

type ChainDraft = {
  id: string | null;
  name: string;
  category: ChainCategory;
  description: string;
  status: string;
};

type ValueChain = {
  id: string;
  name: string;
  category: "primary" | "support" | "management";
  description: string | null;
  status: string;
};

type ProcessRecord = {
  id: string;
  code: string | null;
  name: string;
  type: string;
  value_chain_id: string | null;
  parent_process_id: string | null;
  department: string | null;
  owner: string | null;
  description: string | null;
  status: string;
  current_version: number;
};

export function WorkspaceReports({
  view,
  organizationId,
  isDemo,
}: {
  view: string;
  organizationId: string | null;
  isDemo: boolean;
}) {
  if (view === "value-chain-report") {
    return <ValueChainReport organizationId={organizationId} isDemo={isDemo} />;
  }
  return null;
}

// Diagrama da cadeia de valor (modelo de Porter) reutilizável fora do relatório,
// como na página inicial. Mostra apenas as cadeias ativas, igual ao relatório.
export function ValueChainMacro({
  organizationId,
  isDemo,
}: {
  organizationId: string | null;
  isDemo: boolean;
}) {
  const fn = useServerFn(listProcessRegistrationData);
  const catalogsQ = useQuery({
    queryKey: ["process-registration-data", organizationId],
    queryFn: () => fn({ data: { organizationId: organizationId ?? null } }),
    enabled: !isDemo && !!organizationId,
  });
  const chains: ValueChain[] = useMemo(() => {
    if (isDemo) return DEMO_REGISTRY.valueChains as unknown as ValueChain[];
    return (catalogsQ.data?.valueChains ?? []) as unknown as ValueChain[];
  }, [isDemo, catalogsQ.data]);
  const primary = chains.filter((c) => c.category === "primary" && c.status === "Ativa");
  const support = chains.filter((c) => c.category === "support" && c.status === "Ativa");
  const management = chains.filter((c) => c.category === "management" && c.status === "Ativa");

  if (catalogsQ.isLoading && !isDemo) return <LoadingSkeleton />;
  if (chains.length === 0) return <EmptyState />;
  return <PorterDiagram primary={primary} support={support} management={management} />;
}

function ValueChainReport({
  organizationId,
  isDemo,
}: {
  organizationId: string | null;
  isDemo: boolean;
}) {
  const fn = useServerFn(listProcessRegistrationData);
  const saveChainFn = useServerFn(saveValueChainRegistration);
  const deleteChainFn = useServerFn(deleteProcessRegistration);
  const catalogsQ = useQuery({
    queryKey: ["process-registration-data", organizationId],
    queryFn: () => fn({ data: { organizationId: organizationId ?? null } }),
    enabled: !isDemo && !!organizationId,
  });

  // Em demonstração a cadeia de valor é editável localmente; em nuvem os dados
  // vêm do servidor e são recarregados após cada mutação.
  const [demoChains, setDemoChains] = useState<ValueChain[]>(() =>
    (DEMO_REGISTRY.valueChains as unknown as ValueChain[]).map((c) => ({ ...c })),
  );
  const chains: ValueChain[] = useMemo(() => {
    if (isDemo) return demoChains;
    return (catalogsQ.data?.valueChains ?? []) as unknown as ValueChain[];
  }, [isDemo, demoChains, catalogsQ.data]);

  // Filtro compartilhado entre a tabela e o diagrama. Por padrão exibe os ativos.
  const processes: ProcessRecord[] = useMemo(() => {
    if (isDemo) return DEMO_REGISTRY.processes as unknown as ProcessRecord[];
    return (catalogsQ.data?.processes ?? []) as unknown as ProcessRecord[];
  }, [isDemo, catalogsQ.data]);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("active");
  const [activeTab, setActiveTab] = useState<"value-chain" | "processes">("value-chain");
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [editingChain, setEditingChain] = useState<ChainDraft | null>(null);
  // Ações que exigem confirmação (mesma lógica do cadastro de processos).
  const [pendingAction, setPendingAction] = useState<{
    type: "toggle" | "delete";
    chain: ValueChain;
  } | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (draft: ChainDraft) => {
      if (isDemo) {
        setDemoChains((current) =>
          draft.id
            ? current.map((c) =>
                c.id === draft.id
                  ? {
                      ...c,
                      name: draft.name,
                      category: draft.category,
                      description: draft.description || null,
                      status: draft.status,
                    }
                  : c,
              )
            : [
                ...current,
                {
                  id: `demo-chain-${Date.now()}`,
                  name: draft.name,
                  category: draft.category,
                  description: draft.description || null,
                  status: draft.status,
                },
              ],
        );
        return;
      }
      await saveChainFn({
        data: {
          id: draft.id || undefined,
          organizationId,
          name: draft.name,
          category: draft.category,
          description: draft.description || null,
          status: (draft.status.toLowerCase().startsWith("ativ") ? "Ativa" : "Inativa") as
            | "Ativa"
            | "Inativa",
        },
      });
    },
    onSuccess: async () => {
      toast.success("Cadeia de valor salva.");
      setEditingChain(null);
      if (!isDemo) await catalogsQ.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isDemo) {
        setDemoChains((current) => current.filter((c) => c.id !== id));
        return;
      }
      await deleteChainFn({ data: { organizationId, kind: "value-chain", id } });
    },
    onSuccess: async () => {
      toast.success("Cadeia de valor excluída.");
      if (!isDemo) await catalogsQ.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (chain: ValueChain) => {
      const status = isActiveChain(chain) ? "Inativa" : "Ativa";
      if (isDemo) {
        setDemoChains((current) =>
          current.map((c) => (c.id === chain.id ? { ...c, status } : c)),
        );
        return;
      }
      await saveChainFn({
        data: {
          id: chain.id,
          organizationId,
          name: chain.name,
          category: chain.category,
          description: chain.description,
          status,
        },
      });
    },
    onSuccess: async () => {
      if (!isDemo) await catalogsQ.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const chainBusy = saveMutation.isPending || deleteMutation.isPending || toggleMutation.isPending;

  const filteredChains = useMemo(() => {
    const q = query.trim().toLowerCase();
    return chains.filter((c) => {
      if (statusFilter === "active" && !isActiveChain(c)) return false;
      if (statusFilter === "inactive" && isActiveChain(c)) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (CATEGORY_LABELS[c.category] ?? c.category).toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
      );
    });
  }, [chains, query, statusFilter]);

  // Diagrama reflete o que está filtrado na tabela.
  const primary = filteredChains.filter((c) => c.category === "primary");
  const support = filteredChains.filter((c) => c.category === "support");
  const management = filteredChains.filter((c) => c.category === "management");
  const isEmpty = chains.length === 0 && !catalogsQ.isLoading;

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          relatórios
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold">Cadeia de Valor</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Representação visual da cadeia de valor da organização no modelo de Porter.
        </p>
      </div>

      {catalogsQ.isLoading && !isDemo ? (
        <LoadingSkeleton />
      ) : isEmpty ? (
        <EmptyState
          onNewChain={() =>
            setEditingChain({
              id: null,
              name: "",
              category: "primary",
              description: "",
              status: "Ativa",
            })
          }
        />
      ) : (
        <>
          <PorterDiagram
            primary={primary}
            support={support}
            management={management}
            selectedChainId={selectedChainId}
            onSelectChain={(chain) => {
              setSelectedChainId(chain.id);
              setActiveTab("processes");
            }}
            onExportPng={() => exportPNG(primary, support, management)}
          />
          <ConsultationTable
            chains={chains}
            processes={processes}
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            selectedChainId={selectedChainId}
            setSelectedChainId={setSelectedChainId}
            onExportExcel={() =>
              exportCSV(
                chains.filter((c) => c.category === "primary"),
                chains.filter((c) => c.category === "support"),
                chains.filter((c) => c.category === "management"),
              )
            }
            busy={chainBusy}
            onNewChain={() =>
              setEditingChain({
                id: null,
                name: "",
                category: "primary",
                description: "",
                status: "Ativa",
              })
            }
            onEditChain={(chain) =>
              setEditingChain({
                id: chain.id,
                name: chain.name,
                category: chain.category,
                description: chain.description ?? "",
                status: chain.status,
              })
            }
            onDeleteChain={(chain) => setPendingAction({ type: "delete", chain })}
            onToggleChain={(chain) => setPendingAction({ type: "toggle", chain })}
          />
        </>
      )}
      {editingChain ? (
        <ValueChainForm
          draft={editingChain}
          saving={saveMutation.isPending}
          onChange={setEditingChain}
          onCancel={() => setEditingChain(null)}
          onSubmit={() => saveMutation.mutate(editingChain)}
        />
      ) : null}
      {pendingAction ? (
        <ChainActionConfirm
          action={pendingAction}
          busy={chainBusy}
          onCancel={() => setPendingAction(null)}
          onConfirm={() => {
            if (pendingAction.type === "delete") deleteMutation.mutate(pendingAction.chain.id);
            else toggleMutation.mutate(pendingAction.chain);
            setPendingAction(null);
          }}
        />
      ) : null}
    </section>
  );
}

// Modal de confirmação para desativar/ativar ou excluir uma cadeia de valor,
// no mesmo padrão do cadastro de processos (a ação só ocorre após confirmar).
function ChainActionConfirm({
  action,
  busy,
  onCancel,
  onConfirm,
}: {
  action: { type: "toggle" | "delete"; chain: ValueChain };
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isDelete = action.type === "delete";
  const willActivate = action.type === "toggle" && !isActiveChain(action.chain);
  const title = isDelete
    ? "Excluir cadeia de valor"
    : willActivate
      ? "Ativar cadeia de valor"
      : "Desativar cadeia de valor";
  const message = isDelete
    ? `Confirma excluir a cadeia de valor "${action.chain.name}"? Esta ação não pode ser desfeita.`
    : `Confirma ${willActivate ? "ativar" : "desativar"} a cadeia de valor "${action.chain.name}"?`;
  const confirmLabel = isDelete ? "Excluir" : willActivate ? "Ativar" : "Desativar";
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/30 p-4 backdrop-blur-[2px]">
      <div className="w-full max-w-xl rounded-xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(15,23,42,.22)]">
        <div className="flex items-start gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-bold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
            title="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`rounded-md border px-4 py-2 text-sm font-semibold disabled:opacity-45 ${
              isDelete
                ? "border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20"
                : "border-border bg-card hover:bg-muted"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function PorterDiagram({
  primary,
  support,
  management,
  selectedChainId,
  onSelectChain,
  onExportPng,
}: {
  primary: ValueChain[];
  support: ValueChain[];
  management: ValueChain[];
  selectedChainId?: string | null;
  onSelectChain?: (chain: ValueChain) => void;
  onExportPng?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const bands = [
    {
      key: "management",
      label: "Processos de Gestão",
      items: management,
      tone: "from-[#15b889] to-[#007f5f]",
      border: "border-[#009b78]",
      header: "bg-[#009b78]",
      text: "text-[#00523f]",
    },
    {
      key: "primary",
      label: "Processos Finalísticos",
      items: primary,
      tone: "from-[#ffd45c] to-[#f5b51b]",
      border: "border-[#f5b51b]",
      header: "bg-[#f5b51b]",
      text: "text-[#5f3d00]",
    },
    {
      key: "support",
      label: "Processos de Suporte",
      items: support,
      tone: "from-[#00a8bc] to-[#007f94]",
      border: "border-[#008da3]",
      header: "bg-[#008da3]",
      text: "text-[#004c59]",
    },
  ];

  const renderDiagram = (large = false) => (
    <div className="overflow-x-auto">
      <div className={`flex ${large ? "min-w-[1180px]" : "min-w-[860px]"} items-stretch`}>
        <div className="grid flex-1 grid-cols-[148px_minmax(0,1fr)] gap-1">
          <div className="rounded-md bg-[#777] px-4 py-2 text-center text-[12px] font-black uppercase tracking-[0.22em] text-white">
            Categoria
          </div>
          <div className="rounded-md bg-[#777] px-4 py-2 text-center text-[12px] font-black uppercase tracking-[0.22em] text-white">
            Macroprocesso
          </div>
          {bands.map((band) => (
            <div key={band.key} className="contents">
              <div
                className={`grid ${large ? "min-h-36" : "min-h-28"} place-items-center rounded-xl bg-gradient-to-b ${band.tone} px-3 py-4 text-center text-base font-black uppercase leading-tight tracking-[0.08em] text-white shadow-sm`}
              >
                {band.label}
              </div>
              <div
                className={`${large ? "min-h-36" : "min-h-28"} rounded-xl border-2 ${band.border} bg-white p-2.5 shadow-sm`}
              >
                {band.items.length ? (
                  <div className="grid h-full auto-rows-fr grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2">
                    {band.items.map((item) => {
                      const selected = selectedChainId === item.id;
                      return (
                        <button
                          type="button"
                          key={item.id}
                          disabled={!onSelectChain}
                          onClick={() => onSelectChain?.(item)}
                          title={item.description ?? undefined}
                          aria-pressed={selected}
                          className={`grid ${large ? "min-h-24" : "min-h-20"} place-items-center rounded-lg border-2 px-3 py-2 text-center text-sm font-bold leading-tight shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]/50 ${
                            selected
                              ? "border-[var(--gold)] bg-[var(--gold)] text-slate-950 shadow-md ring-2 ring-[var(--gold)]/25"
                              : `${band.border} bg-white ${band.text}`
                          } ${
                            onSelectChain
                              ? selected
                                ? "cursor-pointer hover:-translate-y-0.5 hover:bg-[var(--gold)] hover:shadow-md active:translate-y-0"
                                : "cursor-pointer hover:-translate-y-0.5 hover:bg-muted/40 hover:shadow-md active:translate-y-0"
                              : "cursor-default"
                          }`}
                        >
                          <span>{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="grid h-full min-h-16 place-items-center rounded-lg border border-dashed border-border text-xs italic text-muted-foreground">
                    Nenhum processo cadastrado
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className={`${large ? "w-56" : "w-44"} relative ml-2 shrink-0`}>
          <div
            className="absolute inset-y-9 left-0 right-0 bg-gradient-to-r from-[#009b78] via-[#00a8bc] to-[#6fded2] shadow-sm"
            style={{ clipPath: "polygon(0 0, 62% 0, 100% 50%, 62% 100%, 0 100%)" }}
          />
          <div className="relative flex h-full items-center justify-center pr-7">
            <span className={`${large ? "text-4xl" : "text-3xl"} font-black text-[#005f54]`}>
              Missão
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setExpanded(true)}
          title="Expandir desenho"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
        >
          <Maximize2 className="h-4 w-4" />
          Expandir
        </button>
        {onExportPng ? (
          <button
            type="button"
            onClick={onExportPng}
            title="Exportar imagem (PNG)"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted"
          >
            <ImageDown className="h-4 w-4" />
            Exportar imagem (PNG)
          </button>
        ) : null}
      </div>
      {renderDiagram(false)}
      {expanded ? (
        <div className="fixed inset-0 z-[80] grid bg-slate-950/50 p-4 backdrop-blur-[2px]">
          <div className="grid max-h-[calc(100vh-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
            <div className="flex items-center gap-3 border-b border-border px-4 py-3">
              <div>
                <div className="font-display text-lg font-bold">Cadeia de Valor</div>
                <div className="text-xs text-muted-foreground">Visualização expandida do desenho</div>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="ml-auto grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar"
                aria-label="Fechar visualização expandida"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-auto p-4">
              {renderDiagram(true)}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Consultation table ───────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  management: "Processos de Gestão",
  primary: "Processos de Negócios",
  support: "Processos de Suporte",
};

type SortField = "index" | "name" | "category" | "status";
type ProcessSortField = "index" | "code" | "name" | "type" | "valueChain" | "status";
type SortDir = "asc" | "desc";

function isActiveChain(chain: ValueChain) {
  return chain.status?.toLowerCase().startsWith("ativ");
}

function isActiveProcess(process: ProcessRecord) {
  return process.status?.toLowerCase().startsWith("ativ");
}

const PROCESS_TYPE_LABELS: Record<string, string> = {
  macroprocess: "Macroprocesso",
  process: "Processo",
  subprocess: "Subprocesso",
};

function ConsultationTable({
  chains,
  processes,
  query,
  setQuery,
  statusFilter,
  setStatusFilter,
  activeTab,
  setActiveTab,
  selectedChainId,
  setSelectedChainId,
  onExportExcel,
  busy,
  onNewChain,
  onEditChain,
  onDeleteChain,
  onToggleChain,
}: {
  chains: ValueChain[];
  processes: ProcessRecord[];
  query: string;
  setQuery: (value: string) => void;
  statusFilter: "all" | "active" | "inactive";
  setStatusFilter: (value: "all" | "active" | "inactive") => void;
  activeTab: "value-chain" | "processes";
  setActiveTab: (value: "value-chain" | "processes") => void;
  selectedChainId: string | null;
  setSelectedChainId: (value: string | null) => void;
  onExportExcel: () => void;
  busy: boolean;
  onNewChain: () => void;
  onEditChain: (chain: ValueChain) => void;
  onDeleteChain: (chain: ValueChain) => void;
  onToggleChain: (chain: ValueChain) => void;
}) {
  // Ordem base: gestão → negócios → suporte (mesma do diagrama),
  // preservando uma numeração estável independente de filtros/ordenação.
  const ordered = useMemo(() => {
    const rank: Record<string, number> = { management: 0, primary: 1, support: 2 };
    return [...chains]
      .map((chain, i) => ({ chain, original: i }))
      .sort((a, b) => {
        const ra = rank[a.chain.category] ?? 9;
        const rb = rank[b.chain.category] ?? 9;
        if (ra !== rb) return ra - rb;
        return a.original - b.original;
      })
      .map(({ chain }, i) => ({ chain, index: i + 1 }));
  }, [chains]);

  const [sortField, setSortField] = useState<SortField>("index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [processQuery, setProcessQuery] = useState("");
  const [processStatusFilter, setProcessStatusFilter] =
    useState<"all" | "active" | "inactive">("active");
  const [processSortField, setProcessSortField] = useState<ProcessSortField>("index");
  const [processSortDir, setProcessSortDir] = useState<SortDir>("asc");

  const activeCount = ordered.filter((r) => isActiveChain(r.chain)).length;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = ordered.filter(({ chain }) => {
      if (statusFilter === "active" && !isActiveChain(chain)) return false;
      if (statusFilter === "inactive" && isActiveChain(chain)) return false;
      if (!q) return true;
      return (
        chain.name.toLowerCase().includes(q) ||
        (CATEGORY_LABELS[chain.category] ?? chain.category).toLowerCase().includes(q) ||
        (chain.description ?? "").toLowerCase().includes(q) ||
        chain.status.toLowerCase().includes(q)
      );
    });

    const dir = sortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      switch (sortField) {
        case "name":
          return a.chain.name.localeCompare(b.chain.name) * dir;
        case "category":
          return (
            (CATEGORY_LABELS[a.chain.category] ?? a.chain.category).localeCompare(
              CATEGORY_LABELS[b.chain.category] ?? b.chain.category,
            ) * dir
          );
        case "status":
          return a.chain.status.localeCompare(b.chain.status) * dir;
        default:
          return (a.index - b.index) * dir;
      }
    });
    return result;
  }, [ordered, query, statusFilter, sortField, sortDir]);

  const chainById = useMemo(
    () => new Map(chains.map((chain) => [chain.id, chain])),
    [chains],
  );

  const orderedProcesses = useMemo(
    () => processes.map((process, i) => ({ process, index: i + 1 })),
    [processes],
  );

  const activeProcessCount = orderedProcesses.filter((r) => isActiveProcess(r.process)).length;
  const selectedChain = selectedChainId ? chainById.get(selectedChainId) ?? null : null;

  const processRows = useMemo(() => {
    const q = processQuery.trim().toLowerCase();
    let result = orderedProcesses.filter(({ process }) => {
      const chain = process.value_chain_id ? chainById.get(process.value_chain_id) : null;
      if (selectedChainId && process.value_chain_id !== selectedChainId) return false;
      if (processStatusFilter === "active" && !isActiveProcess(process)) return false;
      if (processStatusFilter === "inactive" && isActiveProcess(process)) return false;
      if (!q) return true;
      return (
        (process.code ?? "").toLowerCase().includes(q) ||
        process.name.toLowerCase().includes(q) ||
        (PROCESS_TYPE_LABELS[process.type] ?? process.type).toLowerCase().includes(q) ||
        (chain?.name ?? "").toLowerCase().includes(q) ||
        (process.department ?? "").toLowerCase().includes(q) ||
        (process.owner ?? "").toLowerCase().includes(q) ||
        process.status.toLowerCase().includes(q)
      );
    });

    const dir = processSortDir === "asc" ? 1 : -1;
    result = [...result].sort((a, b) => {
      const aChain = a.process.value_chain_id ? chainById.get(a.process.value_chain_id) : null;
      const bChain = b.process.value_chain_id ? chainById.get(b.process.value_chain_id) : null;
      switch (processSortField) {
        case "code":
          return (a.process.code ?? "").localeCompare(b.process.code ?? "") * dir;
        case "name":
          return a.process.name.localeCompare(b.process.name) * dir;
        case "type":
          return (
            (PROCESS_TYPE_LABELS[a.process.type] ?? a.process.type).localeCompare(
              PROCESS_TYPE_LABELS[b.process.type] ?? b.process.type,
            ) * dir
          );
        case "valueChain":
          return (aChain?.name ?? "").localeCompare(bChain?.name ?? "") * dir;
        case "status":
          return a.process.status.localeCompare(b.process.status) * dir;
        default:
          return (a.index - b.index) * dir;
      }
    });
    return result;
  }, [
    orderedProcesses,
    processQuery,
    processStatusFilter,
    processSortField,
    processSortDir,
    selectedChainId,
    chainById,
  ]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function toggleProcessSort(field: ProcessSortField) {
    if (processSortField === field) {
      setProcessSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setProcessSortField(field);
      setProcessSortDir("asc");
    }
  }

  function SortHeader({
    field,
    children,
    className,
  }: {
    field: SortField;
    children: ReactNode;
    className?: string;
  }) {
    const active = sortField === field;
    return (
      <th
        className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ""}`}
      >
        <button
          type="button"
          onClick={() => toggleSort(field)}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {children}
          <span className={active ? "opacity-90" : "opacity-30"}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  }

  function ProcessSortHeader({
    field,
    children,
    className,
  }: {
    field: ProcessSortField;
    children: ReactNode;
    className?: string;
  }) {
    const active = processSortField === field;
    return (
      <th
        className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${className ?? ""}`}
      >
        <button
          type="button"
          onClick={() => toggleProcessSort(field)}
          className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {children}
          <span className={active ? "opacity-90" : "opacity-30"}>
            {active ? (processSortDir === "asc" ? "▲" : "▼") : "↕"}
          </span>
        </button>
      </th>
    );
  }

  function handleExportExcel() {
    if (activeTab === "value-chain") {
      onExportExcel();
      return;
    }
    exportProcessesCSV(
      processRows.map(({ process }) => process),
      chainById,
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="grid gap-2">
          <div className="inline-flex w-fit rounded-md border border-border bg-muted/40 p-1">
            <button
              type="button"
              onClick={() => setActiveTab("value-chain")}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                activeTab === "value-chain"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Cadeia de Valor
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("processes")}
              className={`rounded px-3 py-1.5 text-sm font-medium ${
                activeTab === "processes"
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Processos
            </button>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {activeTab === "value-chain" ? (
              <>
                {ordered.length} {ordered.length === 1 ? "registro" : "registros"} ·{" "}
                {activeCount} {activeCount === 1 ? "ativo" : "ativos"} ·{" "}
                {ordered.length - activeCount} inativo
                {ordered.length - activeCount === 1 ? "" : "s"}
              </>
            ) : (
              <>
                {processRows.length}{" "}
                {processRows.length === 1 ? "registro exibido" : "registros exibidos"} ·{" "}
                {activeProcessCount} {activeProcessCount === 1 ? "ativo" : "ativos"} ·{" "}
                {orderedProcesses.length - activeProcessCount} inativo
                {orderedProcesses.length - activeProcessCount === 1 ? "" : "s"}
                {selectedChain ? ` · Filtro: ${selectedChain.name}` : ""}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {activeTab === "value-chain" ? (
            <>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filtrar..."
                className="h-8 w-44 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | "active" | "inactive")}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
              >
                <option value="all">Todos os status</option>
                <option value="active">Apenas ativos</option>
                <option value="inactive">Apenas inativos</option>
              </select>
            </>
          ) : (
            <>
              <input
                type="text"
                value={processQuery}
                onChange={(e) => setProcessQuery(e.target.value)}
                placeholder="Filtrar processos..."
                className="h-8 w-48 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
              />
              <select
                value={selectedChainId ?? ""}
                onChange={(e) => setSelectedChainId(e.target.value || null)}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
              >
                <option value="">Todas as cadeias</option>
                {ordered.map(({ chain }) => (
                  <option key={chain.id} value={chain.id}>
                    {chain.name}
                  </option>
                ))}
              </select>
              <select
                value={processStatusFilter}
                onChange={(e) => setProcessStatusFilter(e.target.value as "all" | "active" | "inactive")}
                className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
              >
                <option value="all">Todos os status</option>
                <option value="active">Apenas ativos</option>
                <option value="inactive">Apenas inativos</option>
              </select>
            </>
          )}
          <button
            type="button"
            onClick={handleExportExcel}
            title="Exportar todos os registros para Excel"
            aria-label="Exportar para Excel"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
          >
            <FileSpreadsheet className="h-4 w-4" />
          </button>
          {activeTab === "value-chain" ? (
            <button
              type="button"
              onClick={onNewChain}
              disabled={busy}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-45"
            >
              <Plus className="h-4 w-4" /> Novo
            </button>
          ) : null}
        </div>
      </div>
      <div className="overflow-x-auto">
        {activeTab === "value-chain" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <SortHeader field="index" className="w-16">#</SortHeader>
                <SortHeader field="name">Nome</SortHeader>
                <SortHeader field="category">Categoria</SortHeader>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Descrição
                </th>
                <SortHeader field="status">Status</SortHeader>
                <th className="w-24 px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map(({ chain, index }) => {
                const active = isActiveChain(chain);
                return (
                  <tr
                    key={chain.id}
                    onClick={() => {
                      setSelectedChainId(chain.id);
                      setActiveTab("processes");
                    }}
                    className={`cursor-pointer hover:bg-muted/30 transition-colors ${active ? "" : "opacity-60"}`}
                  >
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{index}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{chain.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {CATEGORY_LABELS[chain.category] ?? chain.category}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {chain.description ?? <span className="italic opacity-50">-</span>}
                    </td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <ChainStatusSwitch
                        chain={chain}
                        disabled={busy}
                        onToggle={onToggleChain}
                      />
                    </td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          title="Editar"
                          aria-label="Editar cadeia de valor"
                          onClick={() => onEditChain(chain)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Excluir"
                          aria-label="Excluir cadeia de valor"
                          onClick={() => onDeleteChain(chain)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Nenhuma cadeia de valor encontrada com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <ProcessSortHeader field="index" className="w-16">#</ProcessSortHeader>
                <ProcessSortHeader field="code">Código</ProcessSortHeader>
                <ProcessSortHeader field="name">Processo</ProcessSortHeader>
                <ProcessSortHeader field="type">Tipo</ProcessSortHeader>
                <ProcessSortHeader field="valueChain">Cadeia de Valor</ProcessSortHeader>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Área
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Dono
                </th>
                <ProcessSortHeader field="status">Status</ProcessSortHeader>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {processRows.map(({ process, index }) => {
                const active = isActiveProcess(process);
                const chain = process.value_chain_id ? chainById.get(process.value_chain_id) : null;
                return (
                  <tr key={process.id} className={`hover:bg-muted/30 transition-colors ${active ? "" : "opacity-60"}`}>
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{index}</td>
                    <td className="px-5 py-3 font-medium text-muted-foreground">{process.code || "-"}</td>
                    <td className="px-5 py-3 font-medium text-foreground">{process.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {PROCESS_TYPE_LABELS[process.type] ?? process.type}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{chain?.name ?? "-"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{process.department || "-"}</td>
                    <td className="px-5 py-3 text-muted-foreground">{process.owner || "-"}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          active
                            ? "bg-[color-mix(in_oklab,var(--gold)_14%,var(--card))] text-[color-mix(in_oklab,var(--gold)_80%,var(--foreground))]"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {process.status}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {processRows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-sm text-muted-foreground">
                    Nenhum processo encontrado com os filtros atuais.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─── PNG export (SVG → Canvas → PNG) ─────────────────────────────────────────

function buildDiagramSVG(
  primary: ValueChain[],
  support: ValueChain[],
  management: ValueChain[],
): string {
  const W = 1180;
  const NUCLEO_W = 210;
  const MACRO_W = 710;
  const GAP = 8;
  const ARROW_W = 220;
  const HEADER_H = 44;
  const PAD = 12;
  const CARD_H = 58;
  const CARD_GAP = 8;
  const CARD_W = 210;

  const C = {
    header: "#777777",
    white: "#ffffff",
    grayText: "#404040",
    primaryA: "#FFD45C",
    primaryB: "#F5B51B",
    primaryBorder: "#F5B51B",
    primaryText: "#5F3D00",
    supportA: "#00A8BC",
    supportB: "#007F94",
    supportBorder: "#008DA3",
    supportText: "#004C59",
    managementA: "#15B889",
    managementB: "#007F5F",
    managementBorder: "#009B78",
    managementText: "#00523F",
    missionA: "#009B78",
    missionB: "#6FDED2",
    missionText: "#005F54",
  };

  function bandHeight(items: ValueChain[]) {
    const availW = MACRO_W - PAD * 2;
    const cols = Math.max(1, Math.floor(availW / (CARD_W + CARD_GAP)));
    const rows = Math.max(1, Math.ceil(items.length / cols));
    return Math.max(116, PAD * 2 + rows * CARD_H + (rows - 1) * CARD_GAP);
  }

  function wrapLabel(value: string, max = 24) {
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    words.forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (next.length > max && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines.slice(0, 3);
  }

  function textLines(lines: string[], x: number, y: number, color: string, size = 15) {
    const lineH = size + 4;
    const startY = y - ((lines.length - 1) * lineH) / 2;
    return lines
      .map(
        (line, index) =>
          `<text x="${x}" y="${startY + index * lineH}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" font-weight="700" fill="${color}">${escapeSvg(line)}</text>`,
      )
      .join("");
  }

  function renderCards(
    items: ValueChain[],
    xBase: number,
    yBase: number,
    cardStroke: string,
    textColor: string,
  ): string {
    const availW = MACRO_W - PAD * 2;
    const cols = Math.max(1, Math.floor(availW / (CARD_W + CARD_GAP)));
    if (items.length === 0) {
      return `<rect x="${xBase}" y="${yBase}" width="${availW}" height="${CARD_H}" rx="10" fill="#fff" stroke="#D1D5DB" stroke-dasharray="5 5"/><text x="${xBase + availW / 2}" y="${yBase + CARD_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-style="italic" fill="#6B7280">Nenhum processo cadastrado</text>`;
    }
    return items
      .map((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = xBase + col * (CARD_W + CARD_GAP);
        const y = yBase + row * (CARD_H + CARD_GAP);
        const lines = wrapLabel(item.name);
        return [
          `<rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="10" fill="#fff" stroke="${cardStroke}" stroke-width="3"/>`,
          textLines(lines, x + CARD_W / 2, y + CARD_H / 2, textColor, 13),
        ].join("");
      })
      .join("\n");
  }

  const bands = [
    {
      label: "Processos Finalísticos",
      items: primary,
      a: C.primaryA,
      b: C.primaryB,
      stroke: C.primaryBorder,
      text: C.primaryText,
    },
    {
      items: support,
      label: "Processos de Suporte",
      a: C.supportA,
      b: C.supportB,
      stroke: C.supportBorder,
      text: C.supportText,
    },
    {
      items: management,
      label: "Processos de Gestão",
      a: C.managementA,
      b: C.managementB,
      stroke: C.managementBorder,
      text: C.managementText,
    },
  ].map((band) => ({ ...band, h: bandHeight(band.items) }));

  const totalH = HEADER_H + GAP + bands.reduce((sum, band) => sum + band.h + GAP, 0);
  const macroX = NUCLEO_W + GAP;
  const missionX = macroX + MACRO_W + GAP;
  const diagramBottom = totalH - GAP;
  let y = HEADER_H + GAP;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}" font-family="system-ui, sans-serif">`,
    `<rect width="${W}" height="${totalH}" fill="${C.white}"/>`,
    `<defs>${bands
      .map(
        (band, index) =>
          `<linearGradient id="band${index}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${band.a}"/><stop offset="100%" stop-color="${band.b}"/></linearGradient>`,
      )
      .join("")}<linearGradient id="mission" x1="0" x2="1" y1="0" y2="0"><stop offset="0%" stop-color="${C.missionA}"/><stop offset="100%" stop-color="${C.missionB}"/></linearGradient></defs>`,
    `<rect x="0" y="0" width="${NUCLEO_W}" height="${HEADER_H}" rx="7" fill="${C.header}"/>`,
    `<rect x="${macroX}" y="0" width="${MACRO_W}" height="${HEADER_H}" rx="7" fill="${C.header}"/>`,
    `<text x="${NUCLEO_W / 2}" y="${HEADER_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="17" font-weight="900" fill="#fff" letter-spacing="3">CATEGORIA</text>`,
    `<text x="${macroX + MACRO_W / 2}" y="${HEADER_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="17" font-weight="900" fill="#fff" letter-spacing="3">MACROPROCESSO</text>`,
  ];

  bands.forEach((band, index) => {
    parts.push(
      `<rect x="0" y="${y}" width="${NUCLEO_W}" height="${band.h}" rx="18" fill="url(#band${index})"/>`,
      textLines(wrapLabel(band.label, 18), NUCLEO_W / 2, y + band.h / 2, "#fff", 19),
      `<rect x="${macroX}" y="${y}" width="${MACRO_W}" height="${band.h}" rx="18" fill="#fff" stroke="${band.stroke}" stroke-width="4"/>`,
      renderCards(band.items, macroX + PAD, y + PAD, band.stroke, band.text),
    );
    y += band.h + GAP;
  });

  parts.push(
    `<polygon points="${missionX},${HEADER_H + GAP} ${missionX + ARROW_W * 0.58},${HEADER_H + GAP} ${missionX + ARROW_W},${(HEADER_H + GAP + diagramBottom) / 2} ${missionX + ARROW_W * 0.58},${diagramBottom} ${missionX},${diagramBottom}" fill="url(#mission)"/>`,
    `<text x="${missionX + ARROW_W * 0.46}" y="${(HEADER_H + GAP + diagramBottom) / 2}" text-anchor="middle" dominant-baseline="middle" font-size="42" font-weight="900" fill="${C.missionText}">Missão</text>`,
    `</svg>`,
  );

  return parts.join("\n");
}

function escapeSvg(value: string) {
  return value.replace(/[<>&'"]/g, (char) => {
    const map: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return map[char] ?? char;
  });
}

function exportPNG(primary: ValueChain[], support: ValueChain[], management: ValueChain[]) {
  const svg = buildDiagramSVG(primary, support, management);
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    const scale = 2;
    canvas.width = img.naturalWidth * scale;
    canvas.height = img.naturalHeight * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const pngUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = pngUrl;
        a.download = "cadeia-de-valor.png";
        a.click();
        URL.revokeObjectURL(pngUrl);
      },
      "image/png",
    );
    URL.revokeObjectURL(url);
  };
  img.src = url;
}

// ─── CSV / Excel export ───────────────────────────────────────────────────────

function exportCSV(primary: ValueChain[], support: ValueChain[], management: ValueChain[]) {
  // Exporta no formato .xlsx (planilha comum do Excel), uma linha por cadeia.
  const all = [
    ...management.map((c) => ({ c, band: "Processos de Gestão" })),
    ...primary.map((c) => ({ c, band: "Processos de Negócios" })),
    ...support.map((c) => ({ c, band: "Processos de Suporte" })),
  ];
  const rows: (string | number)[][] = [
    ["#", "Categoria", "Nome", "Descrição", "Status"],
    ...all.map(({ c, band }, i) => [i + 1, band, c.name, c.description ?? "", c.status]),
  ];
  downloadXlsx("cadeia-de-valor", "Cadeia de Valor", rows);
}

function exportProcessesCSV(
  processes: ProcessRecord[],
  chainById: Map<string, ValueChain>,
) {
  const rows = [
    ["#", "Código", "Processo", "Tipo", "Cadeia de Valor", "Área", "Dono", "Status"],
    ...processes.map((process, i) => {
      const chain = process.value_chain_id ? chainById.get(process.value_chain_id) : null;
      return [
        i + 1,
        process.code ?? "",
        process.name,
        PROCESS_TYPE_LABELS[process.type] ?? process.type,
        chain?.name ?? "",
        process.department ?? "",
        process.owner ?? "",
        process.status,
      ];
    }),
  ];
  downloadXlsx("processos-cadeia-de-valor", "Processos", rows);
}

// Chave de ativar/desativar a cadeia de valor (mesmo padrão do cadastro de
// processos): o clique alterna entre "Ativa" e "Inativa".
function ChainStatusSwitch({
  chain,
  disabled,
  onToggle,
}: {
  chain: ValueChain;
  disabled?: boolean;
  onToggle: (chain: ValueChain) => void;
}) {
  const active = isActiveChain(chain);
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        title={active ? "Desativar cadeia de valor" : "Ativar cadeia de valor"}
        aria-label={active ? "Desativar cadeia de valor" : "Ativar cadeia de valor"}
        aria-pressed={active}
        disabled={disabled}
        onClick={() => onToggle(chain)}
        className={`relative h-8 w-14 shrink-0 rounded-full border px-1 transition disabled:opacity-45 ${
          active ? "border-emerald-500/40 bg-emerald-500/15" : "border-border bg-muted"
        }`}
      >
        <span
          className={`block h-5 w-5 rounded-full transition ${
            active ? "translate-x-6 bg-emerald-600" : "translate-x-0 bg-muted-foreground"
          }`}
        />
      </button>
      <span className="text-xs text-muted-foreground">{chain.status}</span>
    </div>
  );
}

// Formulário de cadastro/edição de cadeia de valor exibido em modal.
function ValueChainForm({
  draft,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: ChainDraft;
  saving: boolean;
  onChange: (draft: ChainDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const valid = draft.name.trim().length >= 2;
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="font-display text-lg font-bold">
            {draft.id ? "Editar cadeia de valor" : "Nova cadeia de valor"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Fechar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          className="grid gap-4 pt-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !saving) onSubmit();
          }}
        >
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Nome</span>
            <input
              autoFocus
              value={draft.name}
              onChange={(e) => onChange({ ...draft, name: e.target.value })}
              placeholder="Ex.: Operação Laboratorial"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Categoria</span>
            <select
              value={draft.category}
              onChange={(e) => onChange({ ...draft, category: e.target.value as ChainCategory })}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
            >
              {VALUE_CHAIN_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Descrição</span>
            <textarea
              value={draft.description}
              onChange={(e) => onChange({ ...draft, description: e.target.value })}
              rows={3}
              placeholder="Breve descrição do fluxo de valor."
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
            <span className="text-sm font-medium text-foreground">Ativa</span>
            <button
              type="button"
              role="switch"
              aria-checked={draft.status.toLowerCase().startsWith("ativ")}
              onClick={() =>
                onChange({
                  ...draft,
                  status: draft.status.toLowerCase().startsWith("ativ") ? "Inativa" : "Ativa",
                })
              }
              className={`relative h-8 w-14 shrink-0 rounded-full border px-1 transition ${
                draft.status.toLowerCase().startsWith("ativ")
                  ? "border-emerald-500/40 bg-emerald-500/15"
                  : "border-border bg-muted"
              }`}
            >
              <span
                className={`block h-5 w-5 rounded-full transition ${
                  draft.status.toLowerCase().startsWith("ativ")
                    ? "translate-x-6 bg-emerald-600"
                    : "translate-x-0 bg-muted-foreground"
                }`}
              />
            </button>
          </label>
          <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex h-10 items-center rounded-md border border-border bg-card px-4 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={!valid || saving}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-45"
            >
              <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function EmptyState({ onNewChain }: { onNewChain?: () => void }) {
  return (
    <div className="grid place-items-center rounded-lg border border-border bg-card py-16">
      <div className="grid place-items-center gap-3 text-center">
        <Network className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-foreground">Nenhuma cadeia cadastrada</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          {onNewChain
            ? "Cadastre processos de gestão, negócios e suporte para montar a cadeia de valor."
            : "Acesse Cadeia de Valor → Cadastro para adicionar processos de gestão, negócios e suporte."}
        </p>
        {onNewChain ? (
          <button
            type="button"
            onClick={onNewChain}
            className="mt-1 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Nova cadeia de valor
          </button>
        ) : null}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 h-4 w-32 animate-pulse rounded bg-muted" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-9 w-28 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    </div>
  );
}
