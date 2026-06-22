import { useMemo } from "react";
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
          Representação visual da cadeia de valor da organização, com os processos primários, de
          apoio e estratégicos cadastrados.
        </p>

        {!isEmpty && (
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => exportSVG(primary, support, management)}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ImageDown className="h-4 w-4" />
              Exportar imagem
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
        <ValueChainDiagram primary={primary} support={support} management={management} />
      )}
    </section>
  );
}

// ─── Display diagram ────────────────────────────────────────────────────────

const TIP_PX = 80;

function ValueChainDiagram({
  primary,
  support,
  management,
}: {
  primary: ValueChain[];
  support: ValueChain[];
  management: ValueChain[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      {management.length > 0 && (
        <div className="border-b border-border bg-[color-mix(in_oklab,var(--gold)_8%,var(--card))] px-5 py-4">
          <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_oklab,var(--gold)_80%,var(--foreground))]">
            Gestão Estratégica
          </div>
          <div className="flex flex-wrap gap-2">
            {management.map((item) => (
              <ChainCard key={item.id} item={item} variant="management" />
            ))}
          </div>
        </div>
      )}

      <div className="min-w-[640px]">
        <div
          className="flex items-stretch"
          style={{
            clipPath: `polygon(0 0, calc(100% - ${TIP_PX}px) 0, 100% 50%, calc(100% - ${TIP_PX}px) 100%, 0 100%)`,
          }}
        >
          <div className="flex-1">
            <div
              className="border-b border-[color-mix(in_oklab,var(--blue)_20%,var(--border))] bg-[color-mix(in_oklab,var(--blue)_6%,var(--card))] px-5 py-4"
              style={{ paddingRight: `${TIP_PX + 28}px` }}
            >
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_oklab,var(--blue)_80%,var(--foreground))]">
                Processos Primários
              </div>
              <div className="flex flex-wrap gap-2">
                {primary.length > 0 ? (
                  primary.map((item) => <ChainCard key={item.id} item={item} variant="primary" />)
                ) : (
                  <span className="text-xs italic text-muted-foreground">
                    Nenhum processo primário cadastrado
                  </span>
                )}
              </div>
            </div>

            <div className="px-5 py-4" style={{ paddingRight: `${TIP_PX + 28}px` }}>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Processos de Apoio
              </div>
              <div className="flex flex-wrap gap-2">
                {support.length > 0 ? (
                  support.map((item) => <ChainCard key={item.id} item={item} variant="support" />)
                ) : (
                  <span className="text-xs italic text-muted-foreground">
                    Nenhum processo de apoio cadastrado
                  </span>
                )}
              </div>
            </div>
          </div>

          <div
            className="flex shrink-0 flex-col items-center justify-center gap-1 bg-primary"
            style={{ width: `${TIP_PX}px` }}
          >
            <span
              className="text-[11px] font-bold tracking-[0.25em] text-primary-foreground"
              style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}
            >
              VALOR
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChainCard({
  item,
  variant,
}: {
  item: ValueChain;
  variant: "primary" | "support" | "management";
}) {
  const cls =
    variant === "primary"
      ? "border-[color-mix(in_oklab,var(--blue)_30%,transparent)] bg-[color-mix(in_oklab,var(--blue)_10%,var(--card))] text-[color-mix(in_oklab,var(--blue)_85%,var(--foreground))]"
      : variant === "management"
        ? "border-[color-mix(in_oklab,var(--gold)_30%,transparent)] bg-[color-mix(in_oklab,var(--gold)_10%,var(--card))] text-[color-mix(in_oklab,var(--gold)_85%,var(--foreground))]"
        : "border-border bg-muted/50 text-foreground";

  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm font-medium ${cls}`}
      title={item.description ?? undefined}
    >
      {item.name}
    </div>
  );
}

// ─── SVG export ─────────────────────────────────────────────────────────────

function buildSVG(primary: ValueChain[], support: ValueChain[], management: ValueChain[]): string {
  const W = 1100;
  const TIP = 90;
  const CARD_W = 168;
  const CARD_H = 44;
  const CARD_GAP = 8;
  const PAD_X = 28;
  const PAD_Y = 16;
  const LABEL_H = 20;
  const INNER_W = W - TIP - PAD_X * 2;
  const CARDS_PER_ROW = Math.max(1, Math.floor(INNER_W / (CARD_W + CARD_GAP)));

  function rowCount(items: ValueChain[]) {
    return items.length === 0 ? 1 : Math.ceil(items.length / CARDS_PER_ROW);
  }
  function bandH(items: ValueChain[]) {
    return PAD_Y + LABEL_H + 10 + rowCount(items) * (CARD_H + CARD_GAP) - CARD_GAP + PAD_Y;
  }

  const GAP = 12;
  const mgmtH = management.length > 0 ? bandH(management) : 0;
  const primH = bandH(primary);
  const suppH = bandH(support);
  const arrowH = primH + suppH;
  const arrowY = mgmtH > 0 ? mgmtH + GAP : 0;
  const totalH = arrowY + arrowH + 8;

  const C = {
    white: "#FFFFFF",
    mgmtBg: "#FFFBEB",
    mgmtBorder: "#D97706",
    mgmtCard: "#FEF3C7",
    mgmtText: "#92400E",
    primBg: "#EFF6FF",
    primBorder: "#3B82F6",
    primCard: "#DBEAFE",
    primText: "#1D4ED8",
    suppBg: "#F8FAFC",
    suppBorder: "#CBD5E1",
    suppCard: "#F1F5F9",
    suppText: "#475569",
    valor: "#3B82F6",
    valorText: "#FFFFFF",
    divider: "#E2E8F0",
    outline: "#CBD5E1",
  };

  function trunc(s: string, max = 22) {
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function cards(
    items: ValueChain[],
    xStart: number,
    yStart: number,
    bg: string,
    border: string,
    textColor: string,
    emptyLabel: string,
  ): string {
    if (items.length === 0) {
      return `<text x="${xStart}" y="${yStart + CARD_H / 2}" dominant-baseline="middle" font-style="italic" font-size="12" fill="${C.suppText}">${emptyLabel}</text>`;
    }
    return items
      .map((item, i) => {
        const row = Math.floor(i / CARDS_PER_ROW);
        const col = i % CARDS_PER_ROW;
        const x = xStart + col * (CARD_W + CARD_GAP);
        const y = yStart + row * (CARD_H + CARD_GAP);
        return [
          `<rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="6" fill="${bg}" stroke="${border}" stroke-width="1"/>`,
          `<text x="${x + CARD_W / 2}" y="${y + CARD_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" fill="${textColor}">${trunc(item.name)}</text>`,
        ].join("");
      })
      .join("");
  }

  const arrowPts = `0,${arrowY} ${W - TIP},${arrowY} ${W},${arrowY + arrowH / 2} ${W - TIP},${arrowY + arrowH} 0,${arrowY + arrowH}`;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}">`,
    `<rect width="${W}" height="${totalH}" fill="${C.white}"/>`,
  ];

  // Management band
  if (management.length > 0) {
    parts.push(
      `<rect x="0" y="0" width="${W}" height="${mgmtH}" rx="8" fill="${C.mgmtBg}" stroke="${C.mgmtBorder}" stroke-width="1"/>`,
      `<text x="${PAD_X}" y="${PAD_Y + LABEL_H / 2}" dominant-baseline="middle" font-size="11" font-weight="700" fill="${C.mgmtText}" letter-spacing="2">GESTÃO ESTRATÉGICA</text>`,
      cards(management, PAD_X, PAD_Y + LABEL_H + 10, C.mgmtCard, C.mgmtBorder, C.mgmtText, ""),
    );
  }

  // Arrow: clipPath
  parts.push(
    `<defs><clipPath id="ac"><polygon points="${arrowPts}"/></clipPath></defs>`,
    // primary bg
    `<rect x="0" y="${arrowY}" width="${W}" height="${primH}" fill="${C.primBg}" clip-path="url(#ac)"/>`,
    // support bg
    `<rect x="0" y="${arrowY + primH}" width="${W}" height="${suppH}" fill="${C.suppBg}" clip-path="url(#ac)"/>`,
    // divider line
    `<line x1="${PAD_X}" y1="${arrowY + primH}" x2="${W - TIP - PAD_X}" y2="${arrowY + primH}" stroke="${C.divider}" stroke-width="1"/>`,
    // VALOR column
    `<rect x="${W - TIP}" y="${arrowY}" width="${TIP}" height="${arrowH}" fill="${C.valor}" clip-path="url(#ac)"/>`,
    // arrow outline
    `<polygon points="${arrowPts}" fill="none" stroke="${C.outline}" stroke-width="1.5"/>`,
    // VALOR text
    `<text x="${W - TIP / 2}" y="${arrowY + arrowH / 2}" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="${C.valorText}" letter-spacing="3" transform="rotate(-90 ${W - TIP / 2} ${arrowY + arrowH / 2})">VALOR</text>`,
    // primary label
    `<text x="${PAD_X}" y="${arrowY + PAD_Y + LABEL_H / 2}" dominant-baseline="middle" font-size="11" font-weight="700" fill="${C.primText}" letter-spacing="2">PROCESSOS PRIMÁRIOS</text>`,
    cards(
      primary,
      PAD_X,
      arrowY + PAD_Y + LABEL_H + 10,
      C.primCard,
      C.primBorder,
      C.primText,
      "Nenhum processo primário",
    ),
    // support label
    `<text x="${PAD_X}" y="${arrowY + primH + PAD_Y + LABEL_H / 2}" dominant-baseline="middle" font-size="11" font-weight="700" fill="${C.suppText}" letter-spacing="2">PROCESSOS DE APOIO</text>`,
    cards(
      support,
      PAD_X,
      arrowY + primH + PAD_Y + LABEL_H + 10,
      C.suppCard,
      C.suppBorder,
      C.suppText,
      "Nenhum processo de apoio",
    ),
  );

  parts.push("</svg>");
  return parts.join("\n");
}

function exportSVG(primary: ValueChain[], support: ValueChain[], management: ValueChain[]) {
  const svg = buildSVG(primary, support, management);
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cadeia-de-valor.svg";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── CSV / Excel export ──────────────────────────────────────────────────────

function exportCSV(primary: ValueChain[], support: ValueChain[], management: ValueChain[]) {
  const CATEGORY_LABEL: Record<string, string> = {
    management: "Gestão Estratégica",
    primary: "Processos Primários",
    support: "Processos de Apoio",
  };

  const header = ["Categoria", "Nome", "Descrição", "Status"];
  const rows = [
    ...management.map((c) => [CATEGORY_LABEL.management, c.name, c.description ?? "", c.status]),
    ...primary.map((c) => [CATEGORY_LABEL.primary, c.name, c.description ?? "", c.status]),
    ...support.map((c) => [CATEGORY_LABEL.support, c.name, c.description ?? "", c.status]),
  ];

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  // U+FEFF BOM ensures Excel opens UTF-8 correctly on Windows
  const bom = "﻿";
  const blob = new Blob([bom + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "cadeia-de-valor.csv";
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="grid place-items-center rounded-lg border border-border bg-card py-16">
      <div className="grid place-items-center gap-3 text-center">
        <Network className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-semibold text-foreground">Nenhuma cadeia cadastrada</p>
        <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
          Acesse Cadastros → Cadeia de Valor para adicionar processos primários, de apoio e
          estratégicos.
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
