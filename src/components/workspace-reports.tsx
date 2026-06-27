import { useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileSpreadsheet, ImageDown, Network } from "lucide-react";
import { listProcessRegistrationData } from "@/lib/config.functions";
import { DEMO_REGISTRY } from "@/components/workspace-process-registrations";

type ValueChain = {
  id: string;
  name: string;
  category: "primary" | "support" | "management";
  description: string | null;
  status: string;
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
    queryKey: ["process-registrations", organizationId],
    queryFn: () => fn({ data: { organizationId: organizationId ?? "" } }),
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
  const catalogsQ = useQuery({
    queryKey: ["process-registrations", organizationId],
    queryFn: () => fn({ data: { organizationId: organizationId ?? "" } }),
    enabled: !isDemo && !!organizationId,
  });

  const chains: ValueChain[] = useMemo(() => {
    if (isDemo) return DEMO_REGISTRY.valueChains as unknown as ValueChain[];
    return (catalogsQ.data?.valueChains ?? []) as unknown as ValueChain[];
  }, [isDemo, catalogsQ.data]);

  const primary = chains.filter((c) => c.category === "primary" && c.status === "Ativa");
  const support = chains.filter((c) => c.category === "support" && c.status === "Ativa");
  const management = chains.filter((c) => c.category === "management" && c.status === "Ativa");
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

        {!isEmpty && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportPNG(primary, support, management)}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ImageDown className="h-4 w-4" />
              Exportar imagem (PNG)
            </button>
            <button
              type="button"
              onClick={() => exportCSV(primary, support, management)}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </button>
          </div>
        )}
      </div>

      {catalogsQ.isLoading && !isDemo ? (
        <LoadingSkeleton />
      ) : isEmpty ? (
        <EmptyState />
      ) : (
        <>
          <PorterDiagram primary={primary} support={support} management={management} />
          <ConsultationTable chains={chains} />
        </>
      )}
    </section>
  );
}

// ─── Porter Value Chain Diagram ───────────────────────────────────────────────

function PorterDiagram({
  primary,
  support,
  management,
}: {
  primary: ValueChain[];
  support: ValueChain[];
  management: ValueChain[];
}) {
  const bands = [
    {
      key: "management",
      label: "Processos de Gestão",
      items: management,
      bg: "bg-[#FFF7E6]",
      labelColor: "text-[#92400E]",
      cardBg: "bg-[#FDE68A]",
      cardBorder: "border-[#F59E0B]/50",
      cardText: "text-[#78350F]",
    },
    {
      key: "primary",
      label: "Processos de Negócios",
      items: primary,
      bg: "bg-[#F5B324]",
      labelColor: "text-[#451a03]",
      cardBg: "bg-black/10",
      cardBorder: "border-black/20",
      cardText: "text-[#451a03]",
    },
    {
      key: "support",
      label: "Processos de Suporte",
      items: support,
      bg: "bg-[#FEF3C7]",
      labelColor: "text-[#B45309]",
      cardBg: "bg-[#FDE68A]",
      cardBorder: "border-[#F59E0B]/50",
      cardText: "text-[#92400E]",
    },
  ];

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[600px] overflow-hidden rounded-lg border border-border">
        {/* ORGANIZAÇÃO header */}
        <div className="bg-[color-mix(in_oklab,var(--foreground)_8%,var(--card))] px-6 py-3 text-center">
          <span className="text-[11px] font-bold uppercase tracking-[0.26em] text-foreground/70">
            Organização
          </span>
        </div>

        {/* Bands + MARGENS column */}
        <div className="flex">
          {/* Left: three horizontal bands */}
          <div className="flex-1 divide-y divide-border">
            {bands.map((band) => (
              <div key={band.key} className={`${band.bg} px-5 py-4`}>
                <div
                  className={`mb-3 text-[10px] font-bold uppercase tracking-[0.22em] ${band.labelColor}`}
                >
                  {band.label}
                </div>
                <div className="flex flex-wrap gap-2">
                  {band.items.length > 0 ? (
                    band.items.map((item) => (
                      <div
                        key={item.id}
                        title={item.description ?? undefined}
                        className={`rounded-md border px-3 py-1.5 text-xs font-medium ${band.cardBg} ${band.cardBorder} ${band.cardText}`}
                      >
                        {item.name}
                      </div>
                    ))
                  ) : (
                    <span className={`text-xs italic opacity-50 ${band.cardText}`}>
                      Nenhum processo cadastrado
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Right: MARGENS column */}
          <div className="flex w-14 shrink-0 items-center justify-center bg-[var(--gold)] border-l border-border">
            <span
              className="text-[11px] font-bold uppercase tracking-[0.22em] text-[oklch(0.205_0.01_78)]"
              style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}
            >
              Margens
            </span>
          </div>
        </div>
      </div>
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
type SortDir = "asc" | "desc";

function isActiveChain(chain: ValueChain) {
  return chain.status?.toLowerCase().startsWith("ativ");
}

function ConsultationTable({ chains }: { chains: ValueChain[] }) {
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

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [sortField, setSortField] = useState<SortField>("index");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

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

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
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

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h2 className="font-display text-base font-semibold">Cadeias de Valor</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {ordered.length} {ordered.length === 1 ? "registro" : "registros"} ·{" "}
            {activeCount} {activeCount === 1 ? "ativo" : "ativos"} ·{" "}
            {ordered.length - activeCount} inativo
            {ordered.length - activeCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
      </div>
      <div className="overflow-x-auto">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(({ chain, index }) => {
              const active = isActiveChain(chain);
              return (
                <tr
                  key={chain.id}
                  className={`hover:bg-muted/30 transition-colors ${active ? "" : "opacity-60"}`}
                >
                  <td className="px-5 py-3 tabular-nums text-muted-foreground">{index}</td>
                  <td className="px-5 py-3 font-medium text-foreground">{chain.name}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {CATEGORY_LABELS[chain.category] ?? chain.category}
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {chain.description ?? <span className="italic opacity-50">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        active
                          ? "bg-[color-mix(in_oklab,var(--gold)_14%,var(--card))] text-[color-mix(in_oklab,var(--gold)_80%,var(--foreground))]"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {chain.status}
                    </span>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">
                  Nenhuma cadeia de valor encontrada com os filtros atuais.
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
  const W = 1080;
  const MARGINS_W = 56;
  const CONTENT_W = W - MARGINS_W;
  const LABEL_W = 220;
  const HEADER_H = 40;
  const BAND_PAD_X = 16;
  const BAND_PAD_Y = 14;
  const LABEL_H = 18;
  const CARD_H = 32;
  const CARD_GAP = 6;
  const CARD_W = 160;

  const C = {
    header: "#e8e8ea",
    headerText: "#555",
    mgmtBg: "#FFF7E6",
    mgmtLabel: "#92400E",
    mgmtCard: "#FDE68A",
    mgmtCardBorder: "#F59E0B",
    mgmtText: "#78350F",
    primBg: "#F5B324",
    primLabel: "#451a03",
    primCard: "rgba(0,0,0,0.10)",
    primCardBorder: "rgba(0,0,0,0.20)",
    primText: "#451a03",
    suppBg: "#FEF3C7",
    suppLabel: "#B45309",
    suppCard: "#FDE68A",
    suppCardBorder: "#F59E0B",
    suppText: "#92400E",
    marginsBg: "#F5B324",
    marginsText: "#7c3800",
    divider: "#d0d0d5",
    white: "#ffffff",
  };

  function bandHeight(items: ValueChain[]) {
    if (items.length === 0) return BAND_PAD_Y + LABEL_H + 12 + CARD_H + BAND_PAD_Y;
    const availW = CONTENT_W - LABEL_W - BAND_PAD_X * 2;
    const cols = Math.max(1, Math.floor(availW / (CARD_W + CARD_GAP)));
    const rows = Math.ceil(items.length / cols);
    return BAND_PAD_Y + LABEL_H + 12 + rows * (CARD_H + CARD_GAP) - CARD_GAP + BAND_PAD_Y;
  }

  function renderBandCards(
    items: ValueChain[],
    xBase: number,
    yBase: number,
    cardFill: string,
    cardStroke: string,
    textColor: string,
  ): string {
    const availW = CONTENT_W - LABEL_W - BAND_PAD_X * 2;
    const cols = Math.max(1, Math.floor(availW / (CARD_W + CARD_GAP)));
    if (items.length === 0) {
      return `<text x="${xBase}" y="${yBase + CARD_H / 2}" dominant-baseline="middle" font-size="11" font-style="italic" fill="${textColor}" opacity="0.5">Nenhum processo cadastrado</text>`;
    }
    return items
      .map((item, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = xBase + col * (CARD_W + CARD_GAP);
        const y = yBase + row * (CARD_H + CARD_GAP);
        const label = item.name.length > 19 ? item.name.slice(0, 18) + "…" : item.name;
        return [
          `<rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="5" fill="${cardFill}" stroke="${cardStroke}" stroke-width="1"/>`,
          `<text x="${x + CARD_W / 2}" y="${y + CARD_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="500" fill="${textColor}">${label}</text>`,
        ].join("");
      })
      .join("\n");
  }

  const mgmtH = bandHeight(management);
  const primH = bandHeight(primary);
  const suppH = bandHeight(support);

  const mgmtY = HEADER_H;
  const primY = mgmtY + mgmtH + 1;
  const suppY = primY + primH + 1;
  const totalH = suppY + suppH;

  const bands = [
    {
      y: mgmtY,
      h: mgmtH,
      bg: C.mgmtBg,
      label: "PROCESSOS DE GESTÃO",
      labelColor: C.mgmtLabel,
      items: management,
      cardFill: C.mgmtCard,
      cardStroke: C.mgmtCardBorder,
      cardText: C.mgmtText,
    },
    {
      y: primY,
      h: primH,
      bg: C.primBg,
      label: "PROCESSOS DE NEGÓCIOS",
      labelColor: C.primLabel,
      items: primary,
      cardFill: C.primCard,
      cardStroke: C.primCardBorder,
      cardText: C.primText,
    },
    {
      y: suppY,
      h: suppH,
      bg: C.suppBg,
      label: "PROCESSOS DE SUPORTE",
      labelColor: C.suppLabel,
      items: support,
      cardFill: C.suppCard,
      cardStroke: C.suppCardBorder,
      cardText: C.suppText,
    },
  ];

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}" font-family="system-ui, sans-serif">`,
    `<rect width="${W}" height="${totalH}" fill="${C.white}"/>`,
    // Header
    `<rect x="0" y="0" width="${W}" height="${HEADER_H}" fill="${C.header}"/>`,
    `<text x="${W / 2}" y="${HEADER_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="${C.headerText}" letter-spacing="3">ORGANIZAÇÃO</text>`,
    // Bands
    ...bands.flatMap((b) => [
      `<rect x="0" y="${b.y}" width="${CONTENT_W}" height="${b.h}" fill="${b.bg}"/>`,
      // Band label (left column)
      `<text x="${BAND_PAD_X}" y="${b.y + BAND_PAD_Y + LABEL_H / 2}" dominant-baseline="middle" font-size="10" font-weight="700" fill="${b.labelColor}" letter-spacing="1.5">${b.label}</text>`,
      // Cards
      renderBandCards(
        b.items,
        LABEL_W + BAND_PAD_X,
        b.y + BAND_PAD_Y + LABEL_H + 10,
        b.cardFill,
        b.cardStroke,
        b.cardText,
      ),
    ]),
    // Band dividers
    `<line x1="0" y1="${primY}" x2="${CONTENT_W}" y2="${primY}" stroke="${C.divider}" stroke-width="1"/>`,
    `<line x1="0" y1="${suppY}" x2="${CONTENT_W}" y2="${suppY}" stroke="${C.divider}" stroke-width="1"/>`,
    // MARGENS column
    `<rect x="${CONTENT_W}" y="${HEADER_H}" width="${MARGINS_W}" height="${totalH - HEADER_H}" fill="${C.marginsBg}"/>`,
    `<text x="${CONTENT_W + MARGINS_W / 2}" y="${HEADER_H + (totalH - HEADER_H) / 2}" text-anchor="middle" dominant-baseline="middle" font-size="11" font-weight="700" fill="${C.marginsText}" letter-spacing="2" transform="rotate(-90 ${CONTENT_W + MARGINS_W / 2} ${HEADER_H + (totalH - HEADER_H) / 2})">MARGENS</text>`,
    `</svg>`,
  ];

  return parts.join("\n");
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
  const allBands = [
    { label: "Processos de Gestão", items: management },
    { label: "Processos de Negócios", items: primary },
    { label: "Processos de Suporte", items: support },
  ];

  const maxRows = Math.max(...allBands.map((b) => b.items.length), 1);

  // Header row: band names as column groups (2 cols each: Nome, Descrição)
  const headerRow1 = allBands.flatMap((b) => [b.label, ""]).concat(["Margens"]);
  const headerRow2 = allBands.flatMap(() => ["Nome", "Descrição"]).concat([""]);

  const dataRows: string[][] = Array.from({ length: maxRows }, (_, i) =>
    allBands
      .flatMap((b) => {
        const item = b.items[i];
        return item ? [item.name, item.description ?? ""] : ["", ""];
      })
      .concat([""]),
  );

  const rows = [headerRow1, headerRow2, ...dataRows];
  const csv = rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cadeia-de-valor.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-lg border border-border bg-card py-16">
      <div className="grid place-items-center gap-3 text-center">
        <Network className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-foreground">Nenhuma cadeia cadastrada</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Acesse Cadastros → Cadeia de Valor para adicionar processos de gestão, negócios e suporte.
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
