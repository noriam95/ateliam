import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Network } from "lucide-react";
import { listProcessRegistrationData } from "@/lib/config.functions";

type ValueChain = {
  id: string;
  name: string;
  category: "primary" | "support" | "management";
  description: string | null;
  status: string;
};

const DEMO_CHAINS: ValueChain[] = [
  {
    id: "dp1",
    name: "Captação de clientes",
    category: "primary",
    description: null,
    status: "Ativa",
  },
  {
    id: "dp2",
    name: "Entrega de serviços",
    category: "primary",
    description: null,
    status: "Ativa",
  },
  {
    id: "dp3",
    name: "Relacionamento pós-venda",
    category: "primary",
    description: null,
    status: "Ativa",
  },
  {
    id: "dp4",
    name: "Logística e operações",
    category: "primary",
    description: null,
    status: "Ativa",
  },
  {
    id: "ds1",
    name: "Gestão financeira",
    category: "support",
    description: null,
    status: "Ativa",
  },
  {
    id: "ds2",
    name: "Tecnologia da informação",
    category: "support",
    description: null,
    status: "Ativa",
  },
  {
    id: "ds3",
    name: "Recursos humanos",
    category: "support",
    description: null,
    status: "Ativa",
  },
  {
    id: "ds4",
    name: "Infraestrutura",
    category: "support",
    description: null,
    status: "Ativa",
  },
  {
    id: "dm1",
    name: "Planejamento estratégico",
    category: "management",
    description: null,
    status: "Ativa",
  },
  {
    id: "dm2",
    name: "Governança e controle",
    category: "management",
    description: null,
    status: "Ativa",
  },
];

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
    if (isDemo) return DEMO_CHAINS;
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

      <div className="flex min-w-[640px] items-stretch gap-0">
        <div className="flex flex-1 flex-col">
          <div className="flex-1 border-b border-border bg-[color-mix(in_oklab,var(--blue)_6%,var(--card))] px-5 py-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-[color-mix(in_oklab,var(--blue)_80%,var(--foreground))]">
              Processos Primários
            </div>
            <div className="flex flex-wrap gap-2">
              {primary.map((item) => (
                <ChainCard key={item.id} item={item} variant="primary" />
              ))}
              {primary.length === 0 && (
                <span className="text-xs italic text-muted-foreground">
                  Nenhum processo primário cadastrado
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 px-5 py-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Processos de Apoio
            </div>
            <div className="flex flex-wrap gap-2">
              {support.map((item) => (
                <ChainCard key={item.id} item={item} variant="support" />
              ))}
              {support.length === 0 && (
                <span className="text-xs italic text-muted-foreground">
                  Nenhum processo de apoio cadastrado
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-2 border-l border-border bg-primary px-2 py-6">
          <ArrowRight className="h-5 w-5 text-primary-foreground" />
          <span
            className="text-xs font-bold tracking-[0.25em] text-primary-foreground"
            style={{ writingMode: "vertical-lr", transform: "rotate(180deg)" }}
          >
            VALOR
          </span>
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
