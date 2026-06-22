import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, ChevronUp, FileSpreadsheet, ImageDown, Network } from "lucide-react";
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
          Representação visual da cadeia de valor da organização.
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

// ─── Display diagram ─────────────────────────────────────────────────────────

const TIP = 72;
const ARROW_N = 6;

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
    <div className="overflow-x-auto">
      <div className="min-w-[560px] overflow-hidden rounded-lg border border-border">
        {/* TOP — Gestão */}
        <div className="bg-[color-mix(in_oklab,var(--gold)_22%,var(--card))] px-6 py-5">
          <div className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-[color-mix(in_oklab,var(--gold)_85%,var(--foreground))]">
            Processos de Gestão
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {management.length > 0 ? (
              management.map((item) => <ChainCard key={item.id} item={item} variant="management" />)
            ) : (
              <span className="text-xs italic text-muted-foreground">
                Nenhum processo cadastrado
              </span>
            )}
          </div>
        </div>

        {/* DOWN ARROWS */}
        <div className="flex items-center justify-around bg-background px-8 py-1">
          {Array.from({ length: ARROW_N }).map((_, i) => (
            <ChevronDown
              key={i}
              className="h-6 w-6 text-[color-mix(in_oklab,var(--gold)_75%,var(--foreground))]"
            />
          ))}
        </div>

        {/* MIDDLE — Negócios (arrow shape) */}
        <div className="relative">
          <div
            className="bg-primary px-6 py-5"
            style={{
              clipPath: `polygon(0 0, calc(100% - ${TIP}px) 0, 100% 50%, calc(100% - ${TIP}px) 100%, 0 100%)`,
              paddingRight: `${TIP + 32}px`,
            }}
          >
            <div className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-primary-foreground">
              Processos de Negócios
            </div>
            <div className="flex flex-wrap gap-2">
              {primary.length > 0 ? (
                primary.map((item) => <ChainCard key={item.id} item={item} variant="primary-inv" />)
              ) : (
                <span className="text-xs italic text-primary-foreground/60">
                  Nenhum processo cadastrado
                </span>
              )}
            </div>
          </div>

          {/* MARGENS tip — sibling to avoid being clipped */}
          <div
            className="absolute right-0 top-0 bottom-0 flex items-center justify-center bg-primary"
            style={{
              width: `${TIP}px`,
              clipPath: "polygon(0 0, 100% 50%, 0 100%)",
            }}
          >
            <span
              className="text-[11px] font-bold tracking-[0.22em] text-primary-foreground"
              style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}
            >
              MARGENS
            </span>
          </div>
        </div>

        {/* UP ARROWS */}
        <div className="flex items-center justify-around bg-background px-8 py-1">
          {Array.from({ length: ARROW_N }).map((_, i) => (
            <ChevronUp
              key={i}
              className="h-6 w-6 text-[color-mix(in_oklab,var(--blue)_75%,var(--foreground))]"
            />
          ))}
        </div>

        {/* BOTTOM — Suporte */}
        <div className="bg-[color-mix(in_oklab,var(--blue)_18%,var(--card))] px-6 py-5">
          <div className="mb-4 text-center text-[11px] font-bold uppercase tracking-[0.22em] text-[color-mix(in_oklab,var(--blue)_85%,var(--foreground))]">
            Processos de Suporte
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {support.length > 0 ? (
              support.map((item) => <ChainCard key={item.id} item={item} variant="support" />)
            ) : (
              <span className="text-xs italic text-muted-foreground">
                Nenhum processo cadastrado
              </span>
            )}
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
  variant: "management" | "primary-inv" | "support";
}) {
  const cls =
    variant === "management"
      ? "border-[color-mix(in_oklab,var(--gold)_40%,transparent)] bg-[color-mix(in_oklab,var(--gold)_12%,var(--card))] text-[color-mix(in_oklab,var(--gold)_85%,var(--foreground))]"
      : variant === "primary-inv"
        ? "border-primary-foreground/30 bg-primary-foreground/10 text-primary-foreground"
        : "border-[color-mix(in_oklab,var(--blue)_40%,transparent)] bg-[color-mix(in_oklab,var(--blue)_12%,var(--card))] text-[color-mix(in_oklab,var(--blue)_85%,var(--foreground))]";

  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm font-medium ${cls}`}
      title={item.description ?? undefined}
    >
      {item.name}
    </div>
  );
}

// ─── SVG export ──────────────────────────────────────────────────────────────

function buildSVG(primary: ValueChain[], support: ValueChain[], management: ValueChain[]): string {
  const W = 1100;
  const SVG_TIP = 90;
  const CARD_W = 168;
  const CARD_H = 44;
  const CARD_GAP = 8;
  const PAD_X = 32;
  const PAD_Y = 18;
  const LABEL_H = 22;
  const ARROW_ROW_H = 48;
  const INNER_W = W - SVG_TIP - PAD_X * 2;
  const CPR = Math.max(1, Math.floor(INNER_W / (CARD_W + CARD_GAP)));

  function rowCount(items: ValueChain[]) {
    return items.length === 0 ? 1 : Math.ceil(items.length / CPR);
  }
  function bandH(items: ValueChain[]) {
    return PAD_Y + LABEL_H + 12 + rowCount(items) * (CARD_H + CARD_GAP) - CARD_GAP + PAD_Y;
  }

  const mgmtH = bandH(management);
  const primH = bandH(primary);
  const suppH = bandH(support);
  const totalH = mgmtH + ARROW_ROW_H + primH + ARROW_ROW_H + suppH;

  const mgmtY = 0;
  const downY = mgmtH;
  const primY = mgmtH + ARROW_ROW_H;
  const upY = primY + primH;
  const suppY = upY + ARROW_ROW_H;

  const C = {
    bg: "#FFFFFF",
    mgmtFill: "#FFFBEB",
    mgmtBorder: "#F59E0B",
    mgmtCard: "#FEF3C7",
    mgmtText: "#92400E",
    primFill: "#3B82F6",
    primCard: "rgba(255,255,255,0.18)",
    primCardBorder: "rgba(255,255,255,0.4)",
    primText: "#FFFFFF",
    suppFill: "#EFF6FF",
    suppBorder: "#3B82F6",
    suppCard: "#DBEAFE",
    suppText: "#1D4ED8",
    arrowDown: "#F59E0B",
    arrowUp: "#3B82F6",
  };

  function trunc(s: string, max = 20) {
    return s.length > max ? s.slice(0, max - 1) + "…" : s;
  }

  function renderCards(
    items: ValueChain[],
    xBase: number,
    yBase: number,
    fill: string,
    stroke: string,
    textColor: string,
    empty: string,
  ): string {
    if (items.length === 0) {
      return `<text x="${xBase}" y="${yBase + CARD_H / 2}" dominant-baseline="middle" font-style="italic" font-size="12" fill="${textColor}" opacity="0.6">${empty}</text>`;
    }
    return items
      .map((item, i) => {
        const col = i % CPR;
        const row = Math.floor(i / CPR);
        const x = xBase + col * (CARD_W + CARD_GAP);
        const y = yBase + row * (CARD_H + CARD_GAP);
        return `<rect x="${x}" y="${y}" width="${CARD_W}" height="${CARD_H}" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
<text x="${x + CARD_W / 2}" y="${y + CARD_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="500" fill="${textColor}">${trunc(item.name)}</text>`;
      })
      .join("\n");
  }

  function arrowRow(y: number, direction: "down" | "up", color: string): string {
    const N = 7;
    const spacing = W / (N + 1);
    const H = 14;
    return Array.from({ length: N })
      .map((_, i) => {
        const cx = spacing * (i + 1);
        const cy = y + ARROW_ROW_H / 2;
        const pts =
          direction === "down"
            ? `${cx - 8},${cy - H / 2} ${cx + 8},${cy - H / 2} ${cx},${cy + H / 2}`
            : `${cx - 8},${cy + H / 2} ${cx + 8},${cy + H / 2} ${cx},${cy - H / 2}`;
        return `<polygon points="${pts}" fill="${color}"/>`;
      })
      .join("\n");
  }

  const arrowPts = `0,${primY} ${W - SVG_TIP},${primY} ${W},${primY + primH / 2} ${W - SVG_TIP},${primY + primH} 0,${primY + primH}`;

  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${totalH}" width="${W}" height="${totalH}">`,
    `<rect width="${W}" height="${totalH}" fill="${C.bg}"/>`,

    // Management band
    `<rect x="0" y="${mgmtY}" width="${W}" height="${mgmtH}" fill="${C.mgmtFill}" stroke="${C.mgmtBorder}" stroke-width="1"/>`,
    `<text x="${W / 2}" y="${mgmtY + PAD_Y + LABEL_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="${C.mgmtText}" letter-spacing="2">PROCESSOS DE GESTÃO</text>`,
    renderCards(
      management,
      PAD_X,
      mgmtY + PAD_Y + LABEL_H + 12,
      C.mgmtCard,
      C.mgmtBorder,
      C.mgmtText,
      "Nenhum processo cadastrado",
    ),

    // Down arrows
    arrowRow(downY, "down", C.arrowDown),

    // Primary arrow band
    `<defs><clipPath id="ac"><polygon points="${arrowPts}"/></clipPath></defs>`,
    `<rect x="0" y="${primY}" width="${W}" height="${primH}" fill="${C.primFill}" clip-path="url(#ac)"/>`,
    `<polygon points="${arrowPts}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`,
    `<text x="${W / 2 - SVG_TIP / 2}" y="${primY + PAD_Y + LABEL_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="${C.primText}" letter-spacing="2">PROCESSOS DE NEGÓCIOS</text>`,
    renderCards(
      primary,
      PAD_X,
      primY + PAD_Y + LABEL_H + 12,
      C.primCard,
      C.primCardBorder,
      C.primText,
      "Nenhum processo cadastrado",
    ),
    // MARGENS vertical text
    `<text x="${W - SVG_TIP / 2}" y="${primY + primH / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="${C.primText}" letter-spacing="3" transform="rotate(-90 ${W - SVG_TIP / 2} ${primY + primH / 2})">MARGENS</text>`,

    // Up arrows
    arrowRow(upY, "up", C.arrowUp),

    // Support band
    `<rect x="0" y="${suppY}" width="${W}" height="${suppH}" fill="${C.suppFill}" stroke="${C.suppBorder}" stroke-width="1"/>`,
    `<text x="${W / 2}" y="${suppY + PAD_Y + LABEL_H / 2}" text-anchor="middle" dominant-baseline="middle" font-size="12" font-weight="700" fill="${C.suppText}" letter-spacing="2">PROCESSOS DE SUPORTE</text>`,
    renderCards(
      support,
      PAD_X,
      suppY + PAD_Y + LABEL_H + 12,
      C.suppCard,
      C.suppBorder,
      C.suppText,
      "Nenhum processo cadastrado",
    ),

    `</svg>`,
  ];

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

// ─── CSV / Excel export ───────────────────────────────────────────────────────

function exportCSV(primary: ValueChain[], support: ValueChain[], management: ValueChain[]) {
  const LABEL: Record<string, string> = {
    management: "Processos de Gestão",
    primary: "Processos de Negócios",
    support: "Processos de Suporte",
  };

  const header = ["Categoria", "Nome", "Descrição", "Status"];
  const rows = [
    ...management.map((c) => [LABEL.management, c.name, c.description ?? "", c.status]),
    ...primary.map((c) => [LABEL.primary, c.name, c.description ?? "", c.status]),
    ...support.map((c) => [LABEL.support, c.name, c.description ?? "", c.status]),
  ];

  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");

  // UTF-8 BOM so Excel on Windows reads accented characters correctly
  const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: "text/csv;charset=utf-8" });
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
