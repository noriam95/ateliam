import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSearch, ImageDown, Maximize2, Network, Pencil, Plus, Rows3, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  deleteProcessRegistration,
  listProcessRegistrationData,
  saveValueChainRegistration,
} from "@/lib/config.functions";
import { DEMO_REGISTRY } from "@/components/workspace-process-registrations";

type ChainCategory = "primary" | "support" | "management" | "output";

const VALUE_CHAIN_VIEW_STATE_KEY = "bf-flow-value-chain-view";
const VALUE_CHAIN_TABLE_STATE_KEY = "bf-flow-value-chain-table";

function readValueChainViewState() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(VALUE_CHAIN_VIEW_STATE_KEY) ?? "null") as {
      query?: string;
      statusFilter?: "all" | "active" | "inactive";
      activeTab?: "value-chain" | "processes";
    } | null;
  } catch {
    return null;
  }
}

function readValueChainTableState() {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(VALUE_CHAIN_TABLE_STATE_KEY) ?? "null") as {
      sortField?: SortField;
      sortDir?: SortDir;
      processQuery?: string;
      processStatusFilter?: "all" | "active" | "inactive";
      processSortField?: ProcessSortField;
      processSortDir?: SortDir;
      density?: "comfortable" | "compact";
    } | null;
  } catch {
    return null;
  }
}

// Opções completas para o formulário de cadastro (o mesmo texto do cadastro de
// processos). A tabela continua exibindo o rótulo curto de CATEGORY_LABELS.
const VALUE_CHAIN_CATEGORY_OPTIONS: Array<{ value: ChainCategory; label: string }> = [
  { value: "primary", label: "Macroprocessos Finalísticos" },
  { value: "support", label: "Macroprocessos de Suporte" },
  { value: "management", label: "Macroprocessos de Gestão" },
  { value: "output", label: "Saídas" },
];

type ChainDraft = {
  id: string | null;
  name: string;
  category: ChainCategory;
  description: string;
  status: string;
  relatedChainIds: string[];
};

type ValueChain = {
  id: string;
  name: string;
  category: ChainCategory;
  description: string | null;
  status: string;
};

type ValueChainRelation = {
  output_id: string;
  chain_id: string;
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
  organizationName,
  isDemo,
}: {
  view: string;
  organizationId: string | null;
  organizationName: string;
  isDemo: boolean;
}) {
  if (view === "value-chain-report") {
    return (
      <ValueChainReport
        organizationId={organizationId}
        organizationName={organizationName}
        isDemo={isDemo}
      />
    );
  }
  return null;
}

// Diagrama da cadeia de valor (modelo de Porter) reutilizável fora do relatório,
// como na página inicial. Mostra apenas as cadeias ativas, igual ao relatório.
export function ValueChainMacro({
  organizationId,
  organizationName = "Organização",
  isDemo,
}: {
  organizationId: string | null;
  organizationName?: string;
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
  const outputs = chains.filter((c) => c.category === "output" && c.status === "Ativa");

  if (catalogsQ.isLoading && !isDemo) return <LoadingSkeleton />;
  if (chains.length === 0) return <EmptyState />;
  return (
    <PorterDiagram
      primary={primary}
      support={support}
      management={management}
      outputs={outputs}
      organizationName={organizationName}
    />
  );
}

function ValueChainReport({
  organizationId,
  organizationName,
  isDemo,
}: {
  organizationId: string | null;
  organizationName: string;
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
  const valueChainRelations: ValueChainRelation[] = useMemo(
    () =>
      isDemo
        ? []
        : ((catalogsQ.data?.valueChainRelations ?? []) as unknown as ValueChainRelation[]),
    [isDemo, catalogsQ.data],
  );

  // Filtro compartilhado entre a tabela e o diagrama. Por padrão exibe os ativos.
  const processes: ProcessRecord[] = useMemo(() => {
    if (isDemo) return DEMO_REGISTRY.processes as unknown as ProcessRecord[];
    return (catalogsQ.data?.processes ?? []) as unknown as ProcessRecord[];
  }, [isDemo, catalogsQ.data]);

  const [query, setQuery] = useState(() => readValueChainViewState()?.query ?? "");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">(
    () => readValueChainViewState()?.statusFilter ?? "active",
  );
  const [activeTab, setActiveTab] = useState<"value-chain" | "processes">(
    () => readValueChainViewState()?.activeTab ?? "value-chain",
  );
  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);

  useEffect(() => {
    window.localStorage.setItem(
      VALUE_CHAIN_VIEW_STATE_KEY,
      JSON.stringify({ query, statusFilter, activeTab }),
    );
  }, [query, statusFilter, activeTab]);
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
                      name: draft.name.trim().toLocaleUpperCase("pt-BR"),
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
                  name: draft.name.trim().toLocaleUpperCase("pt-BR"),
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
          name: draft.name.trim().toLocaleUpperCase("pt-BR"),
          category: draft.category,
          description: draft.description || null,
          status: (draft.status.toLowerCase().startsWith("ativ") ? "Ativa" : "Inativa") as
            | "Ativa"
            | "Inativa",
          relatedChainIds: draft.category === "output" ? draft.relatedChainIds : [],
        },
      });
    },
    onSuccess: async () => {
      toast.success("Macroprocesso salvo.");
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
      toast.success("Macroprocesso excluído.");
      if (!isDemo) await catalogsQ.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (chain: ValueChain) => {
      const status = isActiveChain(chain) ? "Inativa" : "Ativa";
      if (isDemo) {
        setDemoChains((current) => current.map((c) => (c.id === chain.id ? { ...c, status } : c)));
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
          relatedChainIds:
            chain.category === "output"
              ? valueChainRelations
                  .filter((relation) => relation.output_id === chain.id)
                  .map((relation) => relation.chain_id)
              : [],
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
  const selectedChain = chains.find((chain) => chain.id === selectedChainId) ?? null;
  const relatedChainIds = useMemo(
    () =>
      new Set(
        selectedChain?.category === "output"
          ? valueChainRelations
              .filter((relation) => relation.output_id === selectedChain.id)
              .map((relation) => relation.chain_id)
          : [],
      ),
    [selectedChain, valueChainRelations],
  );
  const diagramChains = useMemo(() => {
    if (selectedChain?.category !== "output") return filteredChains;
    return filteredChains.filter(
      (chain) => chain.id === selectedChain.id || relatedChainIds.has(chain.id),
    );
  }, [filteredChains, relatedChainIds, selectedChain]);
  const primary = diagramChains.filter((c) => c.category === "primary");
  const support = diagramChains.filter((c) => c.category === "support");
  const management = diagramChains.filter((c) => c.category === "management");
  const outputs = diagramChains.filter((c) => c.category === "output");

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
          cadeia de valor · cadastro
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold">Cadeia de Valor</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Representação visual da cadeia de valor da organização no modelo de Porter.
        </p>
      </div>

      {catalogsQ.isLoading && !isDemo ? (
        <LoadingSkeleton />
      ) : (
        <>
          <PorterDiagram
            primary={primary}
            support={support}
            management={management}
            outputs={outputs}
            organizationName={organizationName}
            selectedChainId={selectedChainId}
            onSelectChain={(chain) => {
              const nextId = selectedChainId === chain.id ? null : chain.id;
              setSelectedChainId(nextId);
              setActiveTab(chain.category === "output" ? "value-chain" : "processes");
            }}
            onExportPng={() => exportPNG(primary, support, management, outputs, organizationName)}
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
            busy={chainBusy}
            onNewChain={() =>
              setEditingChain({
                id: null,
                name: "",
                category: "primary",
                description: "",
                status: "Ativa",
                relatedChainIds: [],
              })
            }
            onEditChain={(chain) =>
              setEditingChain({
                id: chain.id,
                name: chain.name,
                category: chain.category,
                description: chain.description ?? "",
                status: chain.status,
                relatedChainIds: valueChainRelations
                  .filter((relation) => relation.output_id === chain.id)
                  .map((relation) => relation.chain_id),
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
          chains={chains}
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
    ? "Excluir Macroprocesso"
    : willActivate
      ? "Ativar Macroprocesso"
      : "Desativar Macroprocesso";
  const message = isDelete
    ? `Confirma excluir o Macroprocesso "${action.chain.name}"? Esta ação não pode ser desfeita.`
    : `Confirma ${willActivate ? "ativar" : "desativar"} o Macroprocesso "${action.chain.name}"?`;
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
  outputs,
  organizationName,
  selectedChainId,
  onSelectChain,
  onExportPng,
}: {
  primary: ValueChain[];
  support: ValueChain[];
  management: ValueChain[];
  outputs: ValueChain[];
  organizationName: string;
  selectedChainId?: string | null;
  onSelectChain?: (chain: ValueChain) => void;
  onExportPng?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const outputItems = outputs;

  function openExpanded() {
    setExpanded(true);
  }

  function closeExpanded() {
    setExpanded(false);
  }

  useEffect(() => {
    if (!expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeExpanded();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [expanded]);

  const chainButton = (
    item: ValueChain,
    className: string,
    selectedClassName: string,
    children?: ReactNode,
  ) => {
    const selected = selectedChainId === item.id;
    return (
      <button
        type="button"
        key={item.id}
        disabled={!onSelectChain}
        onClick={() => onSelectChain?.(item)}
        title={item.description ?? undefined}
        aria-pressed={selected}
        className={`min-w-0 overflow-hidden break-words ${className} ${
          selected ? selectedClassName : ""
        } ${onSelectChain ? "cursor-pointer hover:-translate-y-0.5 active:translate-y-0" : "cursor-default"}`}
      >
        {children ?? item.name}
      </button>
    );
  };

  const renderDiagram = (large = false) => (
    <div
      className={`overflow-x-auto rounded-lg border border-border bg-[#f4fbf8] shadow-sm dark:bg-[#0d1714] ${
        large ? "p-3 sm:p-5" : "p-4"
      }`}
    >
      <div className={`${large ? "w-full" : "min-w-[1040px]"} space-y-1`}>
        <div className="rounded-md bg-[#005f4b] px-4 py-3 text-center font-display text-lg font-bold text-white shadow-sm">
          {organizationName}
        </div>
        <div className="rounded-md bg-[#009b72] px-4 py-1.5 text-center text-xs font-black text-white">
          Macroprocessos de Gestão
        </div>
        <div
          className={`grid ${large ? "min-h-16" : "min-h-14"} auto-rows-fr grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1`}
        >
          {management.length ? (
            management.map((item) =>
              chainButton(
                item,
                "grid place-items-center rounded-md border border-[#ded6ca] bg-[#f6f0e7] px-3 py-3 text-center text-sm font-semibold text-black shadow-sm transition hover:bg-[#fff8ee]",
                "border-[#007f61] bg-[#e7f5ef] ring-2 ring-[#007f61]/25",
              ),
            )
          ) : (
            <div className="col-span-full grid min-h-14 place-items-center rounded-md border border-dashed border-[#8dbdad] bg-white/70 text-xs italic text-[#41665b]">
              Nenhum macroprocesso de gestão cadastrado
            </div>
          )}
        </div>
        <div className="grid place-items-center">
          <div className="h-0 w-0 border-x-[13px] border-t-[16px] border-x-transparent border-t-[#005f4b]" />
        </div>
        <div className="rounded-md bg-[#009b72] px-4 py-1.5 text-center text-xs font-black text-white">
          Macroprocessos Finalísticos
        </div>
        <div
          className={`${large ? "min-h-32" : "min-h-28"} rounded-md bg-[#004c3e] p-5 text-white`}
        >
          <div
            className={`grid h-full items-center gap-3 ${
              large
                ? "grid-cols-1 lg:grid-cols-[minmax(0,1fr)_82px_minmax(240px,360px)]"
                : "grid-cols-[minmax(0,1fr)_82px_minmax(240px,360px)]"
            }`}
          >
            <div
              className={
                large
                  ? "grid min-w-0 grid-cols-[repeat(auto-fit,minmax(190px,1fr))] items-stretch gap-2"
                  : "flex min-w-[720px] items-stretch"
              }
            >
              {primary.length ? (
                primary.map((item, index) =>
                  chainButton(
                    item,
                    `relative grid min-h-16 place-items-center bg-[#f6f0e7] px-7 py-3 text-center text-sm font-semibold leading-tight text-black transition hover:bg-[#fff8ee] ${
                      large
                        ? "rounded-md border border-[#ded6ca]"
                        : index === 0
                        ? "[clip-path:polygon(0_0,calc(100%-24px)_0,100%_50%,calc(100%-24px)_100%,0_100%,24px_50%)]"
                        : "ml-[-18px] [clip-path:polygon(0_0,calc(100%-24px)_0,100%_50%,calc(100%-24px)_100%,0_100%,24px_50%)]"
                    }`,
                    "bg-[#e7f5ef] text-black ring-2 ring-white/40",
                  ),
                )
              ) : (
                <div className="grid min-h-16 flex-1 place-items-center rounded-md border border-dashed border-white/35 text-xs italic text-white/75">
                  Nenhum macroprocesso finalístico cadastrado
                </div>
              )}
            </div>
            <div className="text-center text-sm font-black">Saídas</div>
            <div
              className={`grid min-w-0 gap-1 text-[11px] font-semibold leading-snug text-white/90 ${
                large ? "sm:grid-cols-2 lg:grid-cols-1" : "grid-cols-1"
              }`}
            >
              {outputItems.length ? (
                outputItems.map((item) =>
                  chainButton(
                    item,
                    "flex w-full items-start gap-2 rounded px-1 py-0.5 text-left transition hover:bg-white/10",
                    "bg-white/15 ring-1 ring-white/40",
                    <>
                      <span className="shrink-0 text-[#8debc6]">›</span>
                      <span className="min-w-0 break-words">{item.name}</span>
                    </>,
                  ),
                )
              ) : (
                <div className="text-white/65">Nenhuma saída cadastrada.</div>
              )}
            </div>
          </div>
        </div>
        <div
          className={`grid ${large ? "min-h-16" : "min-h-14"} auto-rows-fr grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-1 pt-3`}
        >
          {support.length ? (
            support.map((item) =>
              chainButton(
                item,
                "grid place-items-center rounded-md border border-[#ded6ca] bg-[#f6f0e7] px-3 py-3 text-center text-sm font-semibold text-black shadow-sm transition hover:bg-[#fff8ee]",
                "border-[#007f61] bg-[#e7f5ef] ring-2 ring-[#007f61]/25",
              ),
            )
          ) : (
            <div className="col-span-full grid min-h-14 place-items-center rounded-md border border-dashed border-[#8dbdad] bg-white/70 text-xs italic text-[#41665b]">
              Nenhum macroprocesso de suporte cadastrado
            </div>
          )}
        </div>
        <div className="rounded-md bg-[#009b72] px-4 py-1.5 text-center text-xs font-black text-white">
          Macroprocessos de Suporte
        </div>
      </div>
    </div>
  );

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={openExpanded}
          title="Expandir desenho"
          aria-label="Expandir desenho"
          className="inline-grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
        {onExportPng ? (
          <button
            type="button"
            onClick={onExportPng}
            title="Exportar imagem (PNG)"
            aria-label="Exportar imagem em PNG"
            className="inline-grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ImageDown className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {renderDiagram(false)}
      {expanded ? (
        <div
          className="fixed inset-0 z-[90] bg-black/85 p-2 sm:p-5"
          role="dialog"
          aria-modal="true"
          aria-labelledby="value-chain-expanded-title"
          onClick={closeExpanded}
        >
          <div
            className="mx-auto flex h-full w-full max-w-[1920px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
              <div id="value-chain-expanded-title" className="font-display text-base font-bold">
                Cadeia de Valor
              </div>
              <button
                type="button"
                onClick={closeExpanded}
                title="Fechar"
                aria-label="Fechar visualização expandida"
                className="inline-grid h-9 w-9 place-items-center rounded-md border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-4">{renderDiagram(true)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Consultation table ───────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  management: "Macroprocessos de Gestão",
  primary: "Macroprocessos Finalísticos",
  support: "Macroprocessos de Suporte",
  output: "Saídas",
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
  busy: boolean;
  onNewChain: () => void;
  onEditChain: (chain: ValueChain) => void;
  onDeleteChain: (chain: ValueChain) => void;
  onToggleChain: (chain: ValueChain) => void;
}) {
  // Ordem base: gestão, finalísticos e suporte (mesma do diagrama),
  // preservando uma numeração estável independente de filtros/ordenação.
  const ordered = useMemo(() => {
    const rank: Record<string, number> = { management: 0, primary: 1, output: 2, support: 3 };
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

  const [sortField, setSortField] = useState<SortField>(
    () => readValueChainTableState()?.sortField ?? "index",
  );
  const [sortDir, setSortDir] = useState<SortDir>(
    () => readValueChainTableState()?.sortDir ?? "asc",
  );
  const [processQuery, setProcessQuery] = useState(
    () => readValueChainTableState()?.processQuery ?? "",
  );
  const [processStatusFilter, setProcessStatusFilter] = useState<"all" | "active" | "inactive">(
    () => readValueChainTableState()?.processStatusFilter ?? "active",
  );
  const [processSortField, setProcessSortField] = useState<ProcessSortField>(
    () => readValueChainTableState()?.processSortField ?? "index",
  );
  const [processSortDir, setProcessSortDir] = useState<SortDir>(
    () => readValueChainTableState()?.processSortDir ?? "asc",
  );
  const [density, setDensity] = useState<"comfortable" | "compact">(
    () => readValueChainTableState()?.density ?? "comfortable",
  );

  useEffect(() => {
    window.localStorage.setItem(
      VALUE_CHAIN_TABLE_STATE_KEY,
      JSON.stringify({
        sortField,
        sortDir,
        processQuery,
        processStatusFilter,
        processSortField,
        processSortDir,
        density,
      }),
    );
  }, [
    sortField,
    sortDir,
    processQuery,
    processStatusFilter,
    processSortField,
    processSortDir,
    density,
  ]);

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

  const chainById = useMemo(() => new Map(chains.map((chain) => [chain.id, chain])), [chains]);

  const orderedProcesses = useMemo(
    () => processes.map((process, i) => ({ process, index: i + 1 })),
    [processes],
  );

  const activeProcessCount = orderedProcesses.filter((r) => isActiveProcess(r.process)).length;
  const selectedChain = selectedChainId ? (chainById.get(selectedChainId) ?? null) : null;

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
                {ordered.length} {ordered.length === 1 ? "registro" : "registros"} · {activeCount}{" "}
                {activeCount === 1 ? "ativo" : "ativos"} · {ordered.length - activeCount} inativo
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
                onChange={(e) =>
                  setProcessStatusFilter(e.target.value as "all" | "active" | "inactive")
                }
                className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
              >
                <option value="all">Todos os status</option>
                <option value="active">Apenas ativos</option>
                <option value="inactive">Apenas inativos</option>
              </select>
            </>
          )}
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
          <button
            type="button"
            onClick={() => setDensity((value) => (value === "compact" ? "comfortable" : "compact"))}
            title={density === "compact" ? "Usar linhas confortÃ¡veis" : "Usar linhas compactas"}
            aria-label={density === "compact" ? "Usar linhas confortÃ¡veis" : "Usar linhas compactas"}
            aria-pressed={density === "compact"}
            className="inline-grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Rows3 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className={`overflow-x-auto ${density === "compact" ? "[&_td]:!py-2" : ""}`}>
        {activeTab === "value-chain" ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <SortHeader field="index" className="w-16">
                  #
                </SortHeader>
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
                      <ChainStatusSwitch chain={chain} disabled={busy} onToggle={onToggleChain} />
                    </td>
                    <td className="px-5 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          title="Editar"
                          aria-label="Editar Macroprocesso"
                          onClick={() => onEditChain(chain)}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Excluir"
                          aria-label="Excluir Macroprocesso"
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
                  <td colSpan={6} className="px-5 py-10 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <FileSearch className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Nenhum macroprocesso encontrado</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {query || statusFilter !== "all"
                            ? "Ajuste os filtros para ampliar os resultados."
                            : "Cadastre o primeiro macroprocesso da Cadeia de Valor."}
                        </p>
                      </div>
                      {query || statusFilter !== "all" ? (
                        <button
                          type="button"
                          onClick={() => {
                            setQuery("");
                            setStatusFilter("all");
                          }}
                          className="h-8 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          Limpar filtros
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={onNewChain}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[var(--gold)] px-3 text-xs font-semibold text-black hover:brightness-95"
                        >
                          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          Novo macroprocesso
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <ProcessSortHeader field="index" className="w-16">
                  #
                </ProcessSortHeader>
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
                  <tr
                    key={process.id}
                    className={`hover:bg-muted/30 transition-colors ${active ? "" : "opacity-60"}`}
                  >
                    <td className="px-5 py-3 tabular-nums text-muted-foreground">{index}</td>
                    <td className="px-5 py-3 font-medium text-muted-foreground">
                      {process.code || "-"}
                    </td>
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
                  <td colSpan={8} className="px-5 py-10 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <FileSearch className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-semibold text-foreground">Nenhum processo encontrado</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Ajuste os filtros ou cadastre processos no menu Processos.
                        </p>
                      </div>
                      {(processQuery || processStatusFilter !== "all" || selectedChainId) && (
                        <button
                          type="button"
                          onClick={() => {
                            setProcessQuery("");
                            setProcessStatusFilter("all");
                            setSelectedChainId(null);
                          }}
                          className="h-8 rounded-md border border-border bg-card px-3 text-xs font-semibold text-foreground hover:bg-muted"
                        >
                          Limpar filtros
                        </button>
                      )}
                    </div>
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
  outputs: ValueChain[],
  organizationName: string,
): string {
  const primaryItems = sanitizeValueChains(primary);
  const supportItems = sanitizeValueChains(support);
  const managementItems = sanitizeValueChains(management);
  const outputItems = sanitizeValueChains(outputs);
  const W = 1600;
  const PAD = 54;
  const CONTENT_W = W - PAD * 2;
  const TOP_H = 58;
  const BAND_H = 32;
  const CARD_H = 72;
  const ROW_GAP = 8;
  const FLOW_ROW_H = 92;
  const OUTPUT_W = 410;
  const OUTPUT_GAP = 12;
  const OUTPUT_LABEL_W = 76;
  const FLOW_W = CONTENT_W - OUTPUT_W - OUTPUT_GAP;
  const SUPPORT_TOP_GAP = 14;
  const managementGrid = gridMetrics(managementItems.length, CONTENT_W, 245);
  const supportGrid = gridMetrics(supportItems.length, CONTENT_W, 215);
  const flowGrid = gridMetrics(primaryItems.length, FLOW_W - 48, 235, 5);
  const managementH = managementGrid.rows * CARD_H + Math.max(0, managementGrid.rows - 1) * ROW_GAP;
  const supportH = supportGrid.rows * CARD_H + Math.max(0, supportGrid.rows - 1) * ROW_GAP;
  const outputRenderItems = outputItems.length
    ? outputItems
    : [
        {
          id: "empty-output",
          name: "Nenhuma saída cadastrada.",
          category: "output" as ChainCategory,
          description: null,
          status: "Ativa",
        },
      ];
  const OUTPUT_LINE_H = 19;
  const OUTPUT_TEXT_W = OUTPUT_W - OUTPUT_LABEL_W - 20;
  const outputColumnCount = Math.max(
    1,
    Math.min(2, outputRenderItems.length, Math.floor(OUTPUT_TEXT_W / 165)),
  );
  const outputRows = Math.ceil(outputRenderItems.length / outputColumnCount);
  const outputContentH = 42 + outputRows * OUTPUT_LINE_H;
  const FLOW_H = Math.max(132, flowGrid.rows * FLOW_ROW_H + 22, outputContentH);
  const H =
    PAD +
    TOP_H +
    ROW_GAP +
    BAND_H +
    ROW_GAP +
    managementH +
    ROW_GAP +
    16 +
    ROW_GAP +
    BAND_H +
    ROW_GAP +
    FLOW_H +
    SUPPORT_TOP_GAP +
    supportH +
    ROW_GAP +
    BAND_H +
    PAD;
  const C = {
    bg: "#F4FBF8",
    dark: "#005F4B",
    green: "#009B72",
    teal: "#004C3E",
    card: "#F6F0E7",
    arrow: "#F6F0E7",
    gold: "#009B72",
    text: "#000000",
    muted: "#41665B",
    white: "#FFFFFF",
    cyan: "#8DEBC6",
  };

  function wrapLabel(value: unknown, max = 24) {
    const words = String(value ?? "")
      .split(/\s+/)
      .filter(Boolean);
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

  function textLines(
    lines: string[],
    x: number,
    y: number,
    color: string,
    size = 15,
    weight = 700,
  ) {
    const lineH = size + 4;
    const startY = y - ((lines.length - 1) * lineH) / 2;
    return lines
      .map(
        (line, index) =>
          `<text x="${x}" y="${startY + index * lineH}" text-anchor="middle" dominant-baseline="middle" font-size="${size}" font-weight="${weight}" fill="${color}">${escapeSvg(line)}</text>`,
      )
      .join("");
  }

  function gridMetrics(count: number, width: number, minCardWidth: number, maxCols = 6) {
    if (count <= 0) return { cols: 1, rows: 1 };
    const byWidth = Math.max(1, Math.floor(width / minCardWidth));
    const cols = Math.max(1, Math.min(count, maxCols, byWidth));
    return { cols, rows: Math.ceil(count / cols) };
  }

  function renderRow(
    items: ValueChain[],
    x: number,
    y: number,
    width: number,
    emptyText: string,
    minCardWidth = 245,
  ) {
    if (items.length === 0) {
      return `<rect x="${x}" y="${y}" width="${width}" height="${CARD_H}" rx="8" fill="${C.white}" stroke="#8DBDAD" stroke-dasharray="5 5"/><text x="${x + width / 2}" y="${y + CARD_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-style="italic" fill="${C.muted}">${escapeSvg(emptyText)}</text>`;
    }
    const gap = 6;
    const { cols } = gridMetrics(items.length, width, minCardWidth);
    const cardW = (width - gap * (cols - 1)) / cols;
    return items
      .map((item, i) => {
        const row = Math.floor(i / cols);
        const col = i % cols;
        const cardX = x + col * (cardW + gap);
        const cardY = y + row * (CARD_H + ROW_GAP);
        return [
          `<rect x="${cardX}" y="${cardY}" width="${cardW}" height="${CARD_H}" rx="8" fill="${C.card}" stroke="#DED6CA"/>`,
          textLines(
            wrapLabel(item.name, Math.max(18, Math.floor(cardW / 9))),
            cardX + cardW / 2,
            cardY + CARD_H / 2,
            C.text,
            13,
            650,
          ),
        ].join("");
      })
      .join("\n");
  }

  function renderFlow(items: ValueChain[], x: number, y: number, width: number) {
    if (!items.length) {
      return `<rect x="${x}" y="${y + 22}" width="${width}" height="${FLOW_H - 44}" rx="8" fill="none" stroke="rgba(255,255,255,.45)" stroke-dasharray="5 5"/><text x="${x + width / 2}" y="${y + FLOW_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-style="italic" fill="rgba(255,255,255,.78)">Nenhum macroprocesso finalístico cadastrado</text>`;
    }
    const { cols } = gridMetrics(items.length, width, 235, 5);
    const gap = 4;
    const itemW = (width - gap * (cols - 1)) / cols;
    return items
      .map((item, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const rowY = y + 16 + row * FLOW_ROW_H;
        const left = x + col * (itemW + gap);
        const right = left + itemW;
        const points = [
          `${left + (col === 0 ? 0 : 24)},${rowY}`,
          `${right - 30},${rowY}`,
          `${right},${rowY + FLOW_ROW_H / 2 - 6}`,
          `${right - 30},${rowY + FLOW_ROW_H - 12}`,
          `${left + (col === 0 ? 0 : 24)},${rowY + FLOW_ROW_H - 12}`,
          `${left + 30},${rowY + FLOW_ROW_H / 2 - 6}`,
        ].join(" ");
        return [
          `<polygon points="${points}" fill="${C.arrow}" stroke="${C.teal}" stroke-width="4"/>`,
          textLines(
            wrapLabel(item.name, Math.max(17, Math.floor(itemW / 9))),
            left + itemW / 2 + 6,
            rowY + FLOW_ROW_H / 2 - 6,
            C.text,
            12,
            700,
          ),
        ].join("");
      })
      .join("\n");
  }

  let y = PAD;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">`,
    `<rect width="${W}" height="${H}" fill="${C.bg}"/>`,
    `<rect x="${PAD}" y="${y}" width="${CONTENT_W}" height="${TOP_H}" rx="8" fill="${C.dark}"/>`,
    `<text x="${W / 2}" y="${y + TOP_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="19" font-weight="800" fill="${C.white}">${escapeSvg(organizationName)}</text>`,
  ];
  y += TOP_H + ROW_GAP;
  parts.push(
    `<rect x="${PAD}" y="${y}" width="${CONTENT_W}" height="${BAND_H}" rx="8" fill="${C.green}"/>`,
    `<text x="${W / 2}" y="${y + BAND_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="900" fill="${C.white}">Macroprocessos de Gestão</text>`,
  );
  y += BAND_H + ROW_GAP;
  parts.push(
    renderRow(managementItems, PAD, y, CONTENT_W, "Nenhum macroprocesso de gestão cadastrado", 245),
  );
  y += managementH + ROW_GAP;
  parts.push(
    `<polygon points="${W / 2 - 14},${y} ${W / 2 + 14},${y} ${W / 2},${y + 16}" fill="${C.dark}"/>`,
  );
  y += 16 + ROW_GAP;
  parts.push(
    `<rect x="${PAD}" y="${y}" width="${CONTENT_W}" height="${BAND_H}" rx="8" fill="${C.green}"/>`,
    `<text x="${W / 2}" y="${y + BAND_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="900" fill="${C.white}">Macroprocessos Finalísticos</text>`,
  );
  y += BAND_H + ROW_GAP;
  parts.push(
    `<rect x="${PAD}" y="${y}" width="${CONTENT_W}" height="${FLOW_H}" rx="8" fill="${C.teal}"/>`,
  );
  parts.push(renderFlow(primaryItems, PAD + 48, y, FLOW_W - 48));
  const outputStartX = PAD + FLOW_W + OUTPUT_GAP;
  const outputLabelX = outputStartX + OUTPUT_LABEL_W / 2;
  const outputTextX = outputStartX + OUTPUT_LABEL_W + 10;
  parts.push(
    `<line x1="${outputStartX + OUTPUT_LABEL_W}" y1="${y + 16}" x2="${outputStartX + OUTPUT_LABEL_W}" y2="${y + FLOW_H - 16}" stroke="rgba(255,255,255,.2)"/>`,
    `<text x="${outputLabelX}" y="${y + FLOW_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="14" font-weight="900" fill="${C.white}">Saídas</text>`,
  );
  const outputTop = y + (FLOW_H - outputRows * OUTPUT_LINE_H) / 2 + 5;
  const outputColumnWidth = OUTPUT_TEXT_W / outputColumnCount;
  outputRenderItems.forEach((item, index) => {
    const row = index % outputRows;
    const col = Math.floor(index / outputRows);
    const lineX = outputTextX + col * outputColumnWidth;
    const lineY = outputTop + row * OUTPUT_LINE_H;
    const maxChars = Math.max(18, Math.floor((outputColumnWidth - 22) / 6.2));
    const outputLabel =
      item.name.length > maxChars
        ? `${item.name.slice(0, Math.max(12, maxChars - 3))}...`
        : item.name;
    parts.push(
      `<text x="${lineX}" y="${lineY}" font-size="12" font-weight="700" fill="${C.white}"><tspan fill="${C.cyan}">›</tspan> ${escapeSvg(outputLabel)}</text>`,
    );
  });
  y += FLOW_H + SUPPORT_TOP_GAP;
  parts.push(
    renderRow(supportItems, PAD, y, CONTENT_W, "Nenhum macroprocesso de suporte cadastrado", 215),
  );
  y += supportH + ROW_GAP;
  parts.push(
    `<rect x="${PAD}" y="${y}" width="${CONTENT_W}" height="${BAND_H}" rx="8" fill="${C.green}"/>`,
    `<text x="${W / 2}" y="${y + BAND_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="900" fill="${C.white}">Macroprocessos de Suporte</text>`,
    `</svg>`,
  );

  return parts.join("\n");
}

function escapeSvg(value: unknown) {
  return String(value ?? "").replace(/[<>&'"]/g, (char) => {
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

function sanitizeValueChains(items: ValueChain[] | null | undefined) {
  return Array.isArray(items)
    ? items
        .filter((item): item is ValueChain => Boolean(item))
        .map((item) => ({
          ...item,
          name: String(item.name ?? "").trim() || "-",
          description: item.description == null ? null : String(item.description),
          status: String(item.status ?? "Ativa"),
        }))
    : [];
}

function exportPNG(
  primary: ValueChain[],
  support: ValueChain[],
  management: ValueChain[],
  outputs: ValueChain[],
  organizationName: string,
) {
  const svg = buildDiagramSVG(primary, support, management, outputs, organizationName);
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
    canvas.toBlob((blob) => {
      if (!blob) return;
      const pngUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = pngUrl;
      a.download = "cadeia-de-valor.png";
      a.click();
      URL.revokeObjectURL(pngUrl);
    }, "image/png");
    URL.revokeObjectURL(url);
  };
  img.src = url;
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
  chains,
  saving,
  onChange,
  onCancel,
  onSubmit,
}: {
  draft: ChainDraft;
  chains: ValueChain[];
  saving: boolean;
  onChange: (draft: ChainDraft) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const valid = draft.name.trim().length >= 2;
  const relationGroups = VALUE_CHAIN_CATEGORY_OPTIONS.filter(
    (option) => option.value !== "output",
  ).map((option) => ({
    ...option,
    items: chains.filter((chain) => chain.category === option.value && chain.id !== draft.id),
  }));
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
          <h2 className="font-display text-lg font-bold">
            {draft.id ? "Editar Macroprocesso" : "Novo Macroprocesso"}
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
              onChange={(e) =>
                onChange({ ...draft, name: e.target.value.toLocaleUpperCase("pt-BR") })
              }
              placeholder="Ex.: Operação Laboratorial"
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">Categoria</span>
            <select
              value={draft.category}
              onChange={(e) => {
                const category = e.target.value as ChainCategory;
                onChange({
                  ...draft,
                  category,
                  relatedChainIds: category === "output" ? draft.relatedChainIds : [],
                });
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
            >
              {VALUE_CHAIN_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {draft.category === "output" ? (
            <fieldset className="grid gap-3 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <legend className="text-sm font-semibold text-foreground">
                    Macroprocessos relacionados
                  </legend>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Selecione os itens que contribuem para esta saída.
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                  {draft.relatedChainIds.length} selecionado(s)
                </span>
              </div>
              <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border border-border bg-background p-3">
                {relationGroups.map((group) => (
                  <div key={group.value} className="grid gap-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      {group.label}
                    </div>
                    {group.items.length ? (
                      group.items.map((chain) => {
                        const checked = draft.relatedChainIds.includes(chain.id);
                        return (
                          <label
                            key={chain.id}
                            className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() =>
                                onChange({
                                  ...draft,
                                  relatedChainIds: checked
                                    ? draft.relatedChainIds.filter((id) => id !== chain.id)
                                    : [...draft.relatedChainIds, chain.id],
                                })
                              }
                              className="h-4 w-4 accent-primary"
                            />
                            <span className="min-w-0 flex-1">{chain.name}</span>
                          </label>
                        );
                      })
                    ) : (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        Nenhum item cadastrado.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </fieldset>
          ) : null}
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

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-lg border border-border bg-card py-16">
      <div className="grid place-items-center gap-3 text-center">
        <Network className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-foreground">Nenhum Macroprocesso cadastrado</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Acesse Cadeia de Valor, Cadastro, para adicionar processos de gestão, finalísticos e
          suporte.
        </p>
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
