import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  BookOpen,
  Building2,
  ChevronRight,
  Clock3,
  FileText,
  GitBranch,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  Workflow,
  X,
} from "lucide-react";
import { BFFlowMark } from "@/components/bf-flow-mark";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { WorkspaceLauncher } from "@/components/workspace-navigation";
import { supabase } from "@/integrations/supabase/client";
import {
  getMe,
  listAccessibleOrganizations,
  listPortalDocuments,
  listPortalStructure,
} from "@/lib/config.functions";
import {
  filterAndSortPortalDocuments,
  portalDocumentsForArea,
  portalDocumentsForProcess,
  type PortalDocument,
  type PortalDocumentFilters,
  type PortalDocumentSort,
} from "@/lib/document-portal";
import { visibleModulesFor } from "@/lib/module-visibility";
import "./document-portal.css";

type PortalActivity = {
  favorites: string[];
  recents: Array<{ id: string; accessedAt: string; count: number }>;
};

const EMPTY_ACTIVITY: PortalActivity = { favorites: [], recents: [] };
const VALUE_CHAIN_CATEGORIES = [
  { id: "primary", label: "Macroprocessos finalísticos" },
  { id: "management", label: "Macroprocessos de gestão" },
  { id: "support", label: "Macroprocessos de suporte" },
  { id: "output", label: "Saídas" },
] as const;

const PROCESS_TYPE_LABELS: Record<string, string> = {
  macroprocess: "Macroprocesso",
  process: "Processo",
  subprocess: "Subprocesso",
};

function activityKey(userId: string, organizationId: string) {
  return `bf-flow:document-portal:${userId}:${organizationId}`;
}

function readActivity(userId: string, organizationId: string): PortalActivity {
  if (!userId || !organizationId || typeof window === "undefined") return EMPTY_ACTIVITY;
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(activityKey(userId, organizationId)) || "{}",
    ) as Partial<PortalActivity>;
    return {
      favorites: Array.isArray(parsed.favorites) ? parsed.favorites.filter(Boolean) : [],
      recents: Array.isArray(parsed.recents)
        ? parsed.recents.filter((item) => item?.id && item?.accessedAt).slice(0, 40)
        : [],
    };
  } catch {
    return EMPTY_ACTIVITY;
  }
}

function formatPortalDate(value: string) {
  if (!value) return "Não informada";
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR");
}

function documentIcon(document: PortalDocument) {
  if (document.module === "bpmn") return Workflow;
  if (document.module === "ddp") return GitBranch;
  return FileText;
}

function PortalCatalogItem({
  icon,
  title,
  subtitle,
  documents,
  onSelect,
  onOpenDocument,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  documents: PortalDocument[];
  onSelect: () => void;
  onOpenDocument: (document: PortalDocument) => void;
}) {
  return (
    <article className="document-portal-catalog-item">
      <button type="button" className="document-portal-catalog-trigger" onClick={onSelect}>
        <span className="document-portal-catalog-icon" aria-hidden="true">
          {icon}
        </span>
        <span className="document-portal-catalog-copy">
          <strong>{title}</strong>
          <small>{subtitle}</small>
        </span>
        <ChevronRight size={15} aria-hidden="true" />
      </button>
      {documents.length ? (
        <div className="document-portal-associated-documents" aria-label="Documentos vigentes">
          {documents.slice(0, 4).map((document) => (
            <button
              type="button"
              key={document.id}
              onClick={() => onOpenDocument(document)}
              title={document.title}
            >
              <FileText size={13} aria-hidden="true" />
              <span>{document.title}</span>
            </button>
          ))}
          {documents.length > 4 ? (
            <span className="document-portal-associated-more">
              +{documents.length - 4} documentos
            </span>
          ) : null}
        </div>
      ) : (
        <p className="document-portal-no-associated-documents">
          Nenhum documento vigente associado.
        </p>
      )}
    </article>
  );
}

function PortalDocumentCard({
  document,
  favorite,
  compact = false,
  onFavorite,
  onOpen,
}: {
  document: PortalDocument;
  favorite: boolean;
  compact?: boolean;
  onFavorite: () => void;
  onOpen: () => void;
}) {
  const Icon = documentIcon(document);
  return (
    <article className={`document-portal-card ${compact ? "is-compact" : ""}`}>
      <div className="document-portal-card-icon" aria-hidden="true">
        <Icon size={19} />
      </div>
      <div className="document-portal-card-body">
        <div className="document-portal-card-meta">
          <span>{document.type}</span>
          <span>{document.code || "Sem código"}</span>
          <span className="document-portal-status">{document.status}</span>
        </div>
        <button type="button" className="document-portal-card-title" onClick={onOpen}>
          {document.title}
        </button>
        {!compact && document.description ? <p>{document.description}</p> : null}
        <div className="document-portal-card-context">
          {document.area ? <span>{document.area}</span> : null}
          {document.process ? <span>{document.process}</span> : null}
          <span>Rev. {document.revision}</span>
          <span>Vigência {formatPortalDate(document.effectiveAt)}</span>
        </div>
      </div>
      <div className="document-portal-card-actions">
        <button
          type="button"
          className="document-portal-favorite"
          aria-label={
            favorite ? `Remover ${document.title} dos favoritos` : `Favoritar ${document.title}`
          }
          title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          aria-pressed={favorite}
          onClick={onFavorite}
        >
          <Star size={16} fill={favorite ? "currentColor" : "none"} />
        </button>
        <button type="button" className="document-portal-open" onClick={onOpen}>
          Visualizar <ChevronRight size={15} aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function PortalSection({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="document-portal-section">
      <header>
        <span className="document-portal-section-icon">{icon}</span>
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </header>
      {children}
    </section>
  );
}

export function DocumentPortal({
  initialQuery = "",
  initialFilters = {},
  initialSort = "relevance",
}: {
  initialQuery?: string;
  initialFilters?: PortalDocumentFilters;
  initialSort?: PortalDocumentSort;
}) {
  const navigate = useNavigate();
  const getUser = useServerFn(getMe);
  const getOrganizations = useServerFn(listAccessibleOrganizations);
  const getDocuments = useServerFn(listPortalDocuments);
  const getStructure = useServerFn(listPortalStructure);
  const me = useQuery({ queryKey: ["document-portal-me"], queryFn: () => getUser() });
  const organizations = useQuery({
    queryKey: ["document-portal-organizations"],
    queryFn: () => getOrganizations(),
  });
  const [organizationId, setOrganizationId] = useState("");
  const [query, setQuery] = useState(initialQuery);
  const searchRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState<PortalDocumentFilters>(initialFilters);
  const [sort, setSort] = useState<PortalDocumentSort>(initialSort);
  const [activity, setActivity] = useState<PortalActivity>(EMPTY_ACTIVITY);

  useEffect(() => {
    if (!organizations.data?.length || organizationId) return;
    let preferred = "";
    try {
      preferred = window.localStorage.getItem("ateliam-active-organization") || "";
    } catch {
      // Use the default membership.
    }
    const organization =
      organizations.data.find((item) => item.id === preferred) ||
      organizations.data.find((item) => item.isDefault) ||
      organizations.data[0];
    setOrganizationId(organization.id);
  }, [organizationId, organizations.data]);

  const documentsQuery = useQuery({
    queryKey: ["document-portal-documents", organizationId],
    enabled: !!organizationId,
    queryFn: () => getDocuments({ data: { organizationId } }),
  });
  const structureQuery = useQuery({
    queryKey: ["document-portal-structure", organizationId],
    enabled: !!organizationId,
    queryFn: () => getStructure({ data: { organizationId } }),
  });
  const userId = me.data?.userId || "";
  useEffect(() => {
    setActivity(readActivity(userId, organizationId));
  }, [organizationId, userId]);

  useEffect(() => {
    setQuery(initialQuery);
    setFilters(initialFilters);
    setSort(initialSort);
  }, [initialFilters, initialQuery, initialSort]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void navigate({
        to: "/portal",
        search: {
          q: query || undefined,
          area: filters.area,
          macroprocess: filters.macroprocess,
          process: filters.process,
          subprocess: filters.subprocess,
          type: filters.type,
          responsible: filters.responsible,
          module: filters.module,
          sort: sort === "relevance" ? undefined : sort,
        },
        replace: true,
      });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [filters, navigate, query, sort]);

  function saveActivity(next: PortalActivity) {
    setActivity(next);
    if (!userId || !organizationId) return;
    try {
      window.localStorage.setItem(activityKey(userId, organizationId), JSON.stringify(next));
    } catch {
      // Personal shortcuts remain available for the current session.
    }
  }

  const documents = useMemo(
    () => (documentsQuery.data ?? []) as PortalDocument[],
    [documentsQuery.data],
  );
  const accessCounts = Object.fromEntries(activity.recents.map((item) => [item.id, item.count]));
  const favoriteIds = new Set(activity.favorites);
  const results = useMemo(
    () => filterAndSortPortalDocuments(documents, query, filters, sort, accessCounts),
    [accessCounts, documents, filters, query, sort],
  );
  const activeDiscovery = Boolean(
    query.trim() || Object.values(filters).some(Boolean) || sort !== "relevance",
  );
  const unique = (key: keyof Pick<PortalDocument, "type" | "responsible" | "module">) =>
    Array.from(new Set(documents.map((document) => document[key]).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  const registry = structureQuery.data;
  const areas = registry?.areas ?? [];
  const processes = registry?.processes ?? [];
  const valueChains = registry?.valueChains ?? [];
  const valueChainRelations = registry?.valueChainRelations ?? [];
  const macroprocesses = Array.from(
    new Set(
      processes.filter((process) => process.type === "macroprocess").map((process) => process.name),
    ),
  );
  const subprocesses = Array.from(
    new Set(
      processes.filter((process) => process.type === "subprocess").map((process) => process.name),
    ),
  );
  const types = unique("type");
  const responsibles = unique("responsible");
  const latest = filterAndSortPortalDocuments(documents, "", {}, "effective").slice(0, 6);
  const updated = [...documents]
    .filter((document) => document.revision !== "1")
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5);
  const favoriteDocuments = activity.favorites
    .map((id) => documents.find((document) => document.id === id))
    .filter((document): document is PortalDocument => Boolean(document))
    .slice(0, 5);
  const recentDocuments = activity.recents
    .map((item) => documents.find((document) => document.id === item.id))
    .filter((document): document is PortalDocument => Boolean(document))
    .slice(0, 5);
  const popular = filterAndSortPortalDocuments(documents, "", {}, "popular", accessCounts)
    .filter((document) => (accessCounts[document.id] || 0) > 0)
    .slice(0, 5);
  const documentsForArea = (areaName: string) => portalDocumentsForArea(documents, areaName);
  const documentsForProcess = (processId: string) =>
    portalDocumentsForProcess(documents, processId);

  function toggleFavorite(documentId: string) {
    const favorites = favoriteIds.has(documentId)
      ? activity.favorites.filter((id) => id !== documentId)
      : [documentId, ...activity.favorites];
    saveActivity({ ...activity, favorites });
  }

  function openDocument(document: PortalDocument) {
    void navigate({
      to: "/portal/$documentId",
      params: { documentId: document.id },
      search: { organization: organizationId },
    });
  }

  function applyDiscoveryFilter(next: PortalDocumentFilters) {
    setFilters(next);
    setSort("relevance");
    requestAnimationFrame(() => searchRef.current?.focus());
  }

  const loading =
    me.isPending || organizations.isPending || documentsQuery.isLoading || structureQuery.isLoading;
  const failure = me.error || organizations.error || documentsQuery.error || structureQuery.error;
  const organizationName =
    organizations.data?.find((organization) => organization.id === organizationId)?.name ||
    "BF Flow";
  const updatedInThirtyDays = documents.filter(
    (document) => Date.now() - new Date(document.updatedAt).getTime() <= 30 * 86400000,
  ).length;

  return (
    <div className="document-portal min-h-screen bg-background text-foreground">
      <header className="document-portal-global-header">
        <WorkspaceLauncher
          activeArea="portal"
          visibleModules={visibleModulesFor(me.data?.profile, !!me.data?.roles.includes("admin"))}
          onSelect={(area) => {
            if (area === "portal") return;
            if (area === "modules") {
              void navigate({
                to: "/m/$module",
                params: { module: "ddp" },
                search: { view: "consult" },
              });
            } else if (area === "value-chain") {
              void navigate({
                to: "/",
                search: { area: "value-chain", view: "value-chain-report" },
              });
            } else {
              void navigate({ to: "/" });
            }
          }}
        />
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          className="document-portal-home"
          aria-label="Ir para a página inicial"
          title="Ir para a página inicial"
        >
          <BFFlowMark className="h-8" />
        </button>
        <div className="flex-1" />
        {!!organizations.data?.length && (
          <label className="document-portal-organization">
            <Building2 size={15} aria-hidden="true" />
            <span className="sr-only">Organização ativa</span>
            <select
              aria-label="Organização ativa"
              value={organizationId}
              onChange={(event) => {
                setOrganizationId(event.target.value);
                setQuery("");
                setFilters({});
                try {
                  window.localStorage.setItem("ateliam-active-organization", event.target.value);
                } catch {
                  // The current selection still applies to this session.
                }
              }}
            >
              {organizations.data.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <UserProfileMenu
          canConfigure={!!me.data?.roles.includes("admin")}
          email={me.data?.profile?.email ?? ""}
          organizationName={organizationName}
          profilePhoto={me.data?.profile?.avatar_data_url ?? ""}
          onProfileUpdated={async () => {
            await me.refetch();
          }}
          onSignOut={async () => {
            await supabase.auth.signOut();
            await navigate({ to: "/auth", replace: true });
          }}
        />
      </header>

      <main className="document-portal-content">
        <section className="document-portal-intro">
          <div>
            <div className="document-portal-eyebrow">
              <BookOpen size={14} aria-hidden="true" /> Biblioteca de processos
            </div>
            <h1>Portal de documentos</h1>
            <p>Encontre procedimentos, fluxos e orientações em um só lugar.</p>
          </div>
          <p className="document-portal-document-count" aria-live="polite">
            <strong>{loading ? "…" : documents.length}</strong> documentos vigentes
          </p>
        </section>

        {loading ? (
          <div className="document-portal-state" role="status">
            Carregando documentos vigentes…
          </div>
        ) : failure ? (
          <div className="document-portal-state is-error" role="alert">
            <strong>Não foi possível carregar o Portal.</strong>
            <span>{failure instanceof Error ? failure.message : "Tente novamente."}</span>
            <button
              type="button"
              onClick={() => {
                void me.refetch();
                void organizations.refetch();
                void documentsQuery.refetch();
                void structureQuery.refetch();
              }}
            >
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
            <section className="document-portal-search-panel" aria-label="Pesquisar documentos">
              <div className="document-portal-search-shell">
                <Search size={21} aria-hidden="true" />
                <input
                  id="document-portal-search"
                  ref={searchRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Título, código, processo, área ou palavra-chave"
                  aria-label="Pesquisar no Portal de Documentos"
                />
                {query ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      searchRef.current?.focus();
                    }}
                    aria-label="Limpar pesquisa"
                  >
                    <X size={17} />
                  </button>
                ) : null}
              </div>
              <div className="document-portal-quick-filters" aria-label="Filtrar por tipo">
                <span>Acesso rápido</span>
                <button
                  type="button"
                  className={!filters.type ? "is-active" : ""}
                  aria-pressed={!filters.type}
                  onClick={() => setFilters((current) => ({ ...current, type: undefined }))}
                >
                  Todos
                </button>
                {types.slice(0, 5).map((type) => (
                  <button
                    type="button"
                    key={type}
                    className={filters.type === type ? "is-active" : ""}
                    aria-pressed={filters.type === type}
                    onClick={() => setFilters((current) => ({ ...current, type }))}
                  >
                    {type === "POP" ? "Procedimentos (POP)" : type}
                  </button>
                ))}
              </div>
            </section>

            <div className="document-portal-library-summary" aria-label="Resumo do acervo">
              <span>
                <strong>{loading ? "…" : areas.length}</strong> áreas cadastradas
              </span>
              <span>
                <strong>{loading ? "…" : processes.length}</strong> processos ativos
              </span>
              <span>
                <strong>{loading ? "…" : valueChains.length}</strong> cadeias ativas
              </span>
              <span>
                <strong>{loading ? "…" : updatedInThirtyDays}</strong> atualizados nos últimos 30
                dias
              </span>
            </div>
            <section className="document-portal-discovery-bar" aria-label="Refinar pesquisa">
              <label className="document-portal-filter">
                <span>Área</span>
                <select
                  value={filters.area || ""}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      area: event.target.value || undefined,
                    }))
                  }
                >
                  <option value="">Todas as áreas</option>
                  {areas.map((area) => (
                    <option key={area.id}>{area.name}</option>
                  ))}
                </select>
              </label>
              <label className="document-portal-filter">
                <span>Processo</span>
                <select
                  value={filters.process || ""}
                  onChange={(event) =>
                    setFilters((current) => ({
                      ...current,
                      process: event.target.value || undefined,
                    }))
                  }
                >
                  <option value="">Todos os processos</option>
                  {processes.map((process) => (
                    <option key={process.id}>{process.name}</option>
                  ))}
                </select>
              </label>
              <label className="document-portal-filter">
                <span>Tipo</span>
                <select
                  value={filters.type || ""}
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, type: event.target.value || undefined }))
                  }
                >
                  <option value="">Todos os tipos</option>
                  {types.map((type) => (
                    <option key={type}>{type}</option>
                  ))}
                </select>
              </label>
              <label className="document-portal-filter document-portal-sort">
                <span>Ordenar por</span>
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as PortalDocumentSort)}
                >
                  <option value="relevance">Relevância</option>
                  <option value="recent">Mais recentes</option>
                  <option value="popular">Mais acessados</option>
                  <option value="alphabetical">Ordem alfabética</option>
                  <option value="effective">Data de vigência</option>
                  <option value="updated">Última atualização</option>
                </select>
              </label>
              <details className="document-portal-more-filters">
                <summary>Mais filtros</summary>
                <div>
                  <label className="document-portal-filter">
                    <span>Macroprocesso</span>
                    <select
                      value={filters.macroprocess || ""}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          macroprocess: event.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">Todos os macroprocessos</option>
                      {macroprocesses.map((macroprocess) => (
                        <option key={macroprocess}>{macroprocess}</option>
                      ))}
                    </select>
                  </label>
                  <label className="document-portal-filter">
                    <span>Subprocesso</span>
                    <select
                      value={filters.subprocess || ""}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          subprocess: event.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">Todos os subprocessos</option>
                      {subprocesses.map((subprocess) => (
                        <option key={subprocess}>{subprocess}</option>
                      ))}
                    </select>
                  </label>
                  <label className="document-portal-filter">
                    <span>Responsável</span>
                    <select
                      value={filters.responsible || ""}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          responsible: event.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">Todos os responsáveis</option>
                      {responsibles.map((responsible) => (
                        <option key={responsible}>{responsible}</option>
                      ))}
                    </select>
                  </label>
                  <label className="document-portal-filter">
                    <span>Origem</span>
                    <select
                      value={filters.module || ""}
                      onChange={(event) =>
                        setFilters((current) => ({
                          ...current,
                          module: event.target.value || undefined,
                        }))
                      }
                    >
                      <option value="">Todos os módulos</option>
                      <option value="ddp">Mapeamento</option>
                      <option value="pop">Documentação</option>
                      <option value="bpmn">Fluxograma</option>
                    </select>
                  </label>
                </div>
              </details>
              {activeDiscovery ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setFilters({});
                    setSort("relevance");
                  }}
                >
                  Limpar
                </button>
              ) : null}
            </section>

            {activeDiscovery ? (
              <PortalSection
                title="Resultados da pesquisa"
                description={`${results.length} ${results.length === 1 ? "documento encontrado" : "documentos encontrados"}`}
                icon={<Search size={18} />}
              >
                {results.length ? (
                  <div className="document-portal-results">
                    {results.map((document) => (
                      <PortalDocumentCard
                        key={document.id}
                        document={document}
                        favorite={favoriteIds.has(document.id)}
                        onFavorite={() => toggleFavorite(document.id)}
                        onOpen={() => openDocument(document)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="document-portal-empty">
                    <Search size={24} />
                    <strong>Nenhum documento vigente encontrado</strong>
                    <span>Revise os termos ou remova um dos filtros aplicados.</span>
                  </div>
                )}
              </PortalSection>
            ) : (
              <>
                <div className="document-portal-dashboard-grid">
                  <div className="document-portal-dashboard-main">
                    <PortalSection
                      title="Documentos recentes"
                      description="Publicados recentemente como vigentes."
                      icon={<Sparkles size={18} />}
                    >
                      {latest.length ? (
                        <div className="document-portal-card-list">
                          {latest.map((document) => (
                            <PortalDocumentCard
                              key={document.id}
                              compact
                              document={document}
                              favorite={favoriteIds.has(document.id)}
                              onFavorite={() => toggleFavorite(document.id)}
                              onOpen={() => openDocument(document)}
                            />
                          ))}
                        </div>
                      ) : (
                        <p className="document-portal-section-empty">
                          Nenhum documento vigente foi publicado nesta organização.
                        </p>
                      )}
                    </PortalSection>
                    <PortalSection
                      title="Atualizados recentemente"
                      description="Novas revisões vigentes do acervo."
                      icon={<Sparkles size={18} />}
                    >
                      {updated.length ? (
                        <div className="document-portal-mini-list">
                          {updated.map((document) => (
                            <button
                              type="button"
                              key={document.id}
                              onClick={() => openDocument(document)}
                            >
                              <span>
                                <strong>{document.title}</strong>
                                <small>
                                  Rev. {document.revision} · {formatPortalDate(document.updatedAt)}
                                </small>
                              </span>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="document-portal-section-empty">
                          Nenhuma nova revisão vigente no momento.
                        </p>
                      )}
                    </PortalSection>
                  </div>
                  <aside className="document-portal-dashboard-side" aria-label="Atalhos pessoais">
                    <PortalSection
                      title="Meus favoritos"
                      description="Seus atalhos para consulta recorrente."
                      icon={<Star size={18} />}
                    >
                      {favoriteDocuments.length ? (
                        <div className="document-portal-mini-list">
                          {favoriteDocuments.map((document) => (
                            <button
                              type="button"
                              key={document.id}
                              onClick={() => openDocument(document)}
                            >
                              <span>
                                <strong>{document.title}</strong>
                                <small>{document.code || document.type}</small>
                              </span>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="document-portal-section-empty">
                          Use a estrela nos documentos para criar seus atalhos.
                        </p>
                      )}
                    </PortalSection>
                    <PortalSection
                      title="Acessados recentemente"
                      description="Retome suas últimas consultas."
                      icon={<Clock3 size={18} />}
                    >
                      {recentDocuments.length ? (
                        <div className="document-portal-mini-list">
                          {recentDocuments.map((document) => (
                            <button
                              type="button"
                              key={document.id}
                              onClick={() => openDocument(document)}
                            >
                              <span>
                                <strong>{document.title}</strong>
                                <small>{document.area || document.type}</small>
                              </span>
                              <ChevronRight size={14} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="document-portal-section-empty">
                          Os documentos visualizados aparecerão aqui.
                        </p>
                      )}
                    </PortalSection>
                    <PortalSection
                      title="Mais acessados"
                      description="Conteúdos consultados com frequência."
                      icon={<TrendingUp size={18} />}
                    >
                      {popular.length ? (
                        <div className="document-portal-ranked-list">
                          {popular.map((document, index) => (
                            <button
                              type="button"
                              key={document.id}
                              onClick={() => openDocument(document)}
                            >
                              <span>{String(index + 1).padStart(2, "0")}</span>
                              <span>
                                <strong>{document.title}</strong>
                                <small>
                                  {document.type} · {document.area || "Área não informada"}
                                </small>
                              </span>
                              <ChevronRight size={15} />
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="document-portal-section-empty">
                          Os documentos mais consultados aparecerão aqui.
                        </p>
                      )}
                    </PortalSection>
                  </aside>
                </div>

                <div className="document-portal-browse-grid">
                  <PortalSection
                    title="Navegar por área"
                    description="Áreas cadastradas na organização e seus documentos vigentes."
                    icon={<Building2 size={18} />}
                  >
                    {areas.length ? (
                      <div className="document-portal-catalog-list">
                        {areas.map((area) => {
                          const linkedDocuments = documentsForArea(area.name);
                          return (
                            <PortalCatalogItem
                              key={area.id}
                              icon={<Building2 size={16} />}
                              title={area.name}
                              subtitle={`${area.sigla || "Área cadastrada"} · ${linkedDocuments.length} ${linkedDocuments.length === 1 ? "documento vigente" : "documentos vigentes"}`}
                              documents={linkedDocuments}
                              onSelect={() => applyDiscoveryFilter({ area: area.name })}
                              onOpenDocument={openDocument}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className="document-portal-section-empty">
                        Nenhuma área foi cadastrada nesta organização.
                      </p>
                    )}
                  </PortalSection>
                  <PortalSection
                    title="Processos ativos"
                    description="Processos ativos do cadastro, com seus documentos vigentes."
                    icon={<GitBranch size={18} />}
                  >
                    {processes.length ? (
                      <div className="document-portal-catalog-list">
                        {processes.map((process) => {
                          const linkedDocuments = documentsForProcess(process.id);
                          return (
                            <PortalCatalogItem
                              key={process.id}
                              icon={<GitBranch size={16} />}
                              title={process.name}
                              subtitle={`${PROCESS_TYPE_LABELS[process.type] || "Processo"}${process.department ? ` · ${process.department}` : ""} · ${linkedDocuments.length} ${linkedDocuments.length === 1 ? "documento vigente" : "documentos vigentes"}`}
                              documents={linkedDocuments}
                              onSelect={() => applyDiscoveryFilter({ process: process.name })}
                              onOpenDocument={openDocument}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className="document-portal-section-empty">
                        Nenhum processo ativo foi cadastrado nesta organização.
                      </p>
                    )}
                  </PortalSection>
                  <PortalSection
                    title="Tipos de documento"
                    description="Consulte por modalidade documental."
                    icon={<FileText size={18} />}
                  >
                    <div className="document-portal-taxonomy">
                      {types.map((type) => {
                        const count = documents.filter((document) => document.type === type).length;
                        return (
                          <button
                            type="button"
                            key={type}
                            onClick={() => applyDiscoveryFilter({ type })}
                          >
                            <FileText size={16} />
                            <span>
                              <strong>{type}</strong>
                              <small>
                                {count} {count === 1 ? "documento" : "documentos"}
                              </small>
                            </span>
                            <ChevronRight size={14} />
                          </button>
                        );
                      })}
                    </div>
                  </PortalSection>
                </div>

                <PortalSection
                  title="Cadeia de valor"
                  description="Macroprocessos ativos organizados por sua contribuição à organização."
                  icon={<Workflow size={18} />}
                >
                  {valueChains.length ? (
                    <div className="document-portal-value-chain-grid">
                      {VALUE_CHAIN_CATEGORIES.map((category) => {
                        const chains = valueChains.filter(
                          (chain) => chain.category === category.id,
                        );
                        return (
                          <section
                            className="document-portal-value-chain-category"
                            key={category.id}
                          >
                            <h3>{category.label}</h3>
                            {chains.length ? (
                              <div className="document-portal-value-chain-list">
                                {chains.map((chain) => {
                                  const chainProcesses = processes.filter(
                                    (process) => process.value_chain_id === chain.id,
                                  );
                                  const relatedChains = valueChainRelations
                                    .filter((relation) => relation.output_id === chain.id)
                                    .map((relation) =>
                                      valueChains.find(
                                        (candidate) => candidate.id === relation.chain_id,
                                      ),
                                    )
                                    .filter(
                                      (
                                        relatedChain,
                                      ): relatedChain is NonNullable<typeof relatedChain> =>
                                        Boolean(relatedChain),
                                    );
                                  return (
                                    <article
                                      className="document-portal-value-chain-card"
                                      key={chain.id}
                                    >
                                      <header>
                                        <strong>{chain.name}</strong>
                                        {chain.description ? <p>{chain.description}</p> : null}
                                      </header>
                                      {chain.category === "output" ? (
                                        relatedChains.length ? (
                                          <div className="document-portal-output-relations">
                                            <span>Relacionada às cadeias</span>
                                            <div>
                                              {relatedChains.map((relatedChain) => (
                                                <span key={relatedChain.id}>
                                                  {relatedChain.name}
                                                </span>
                                              ))}
                                            </div>
                                          </div>
                                        ) : (
                                          <p className="document-portal-no-associated-documents">
                                            Nenhuma cadeia de valor relacionada a esta saída.
                                          </p>
                                        )
                                      ) : chainProcesses.length ? (
                                        <div className="document-portal-value-chain-processes">
                                          {chainProcesses.map((process) => {
                                            const linkedDocuments = documentsForProcess(process.id);
                                            return (
                                              <div
                                                className="document-portal-value-chain-process"
                                                key={process.id}
                                              >
                                                <div>
                                                  <GitBranch size={14} aria-hidden="true" />
                                                  <span>
                                                    <strong>{process.name}</strong>
                                                    <small>
                                                      {PROCESS_TYPE_LABELS[process.type] ||
                                                        "Processo"}
                                                    </small>
                                                  </span>
                                                </div>
                                                {linkedDocuments.length ? (
                                                  <div className="document-portal-associated-documents">
                                                    {linkedDocuments.map((document) => (
                                                      <button
                                                        type="button"
                                                        key={document.id}
                                                        onClick={() => openDocument(document)}
                                                        title={document.title}
                                                      >
                                                        <FileText size={13} aria-hidden="true" />
                                                        <span>{document.title}</span>
                                                      </button>
                                                    ))}
                                                  </div>
                                                ) : (
                                                  <p className="document-portal-no-associated-documents">
                                                    Nenhum documento vigente associado.
                                                  </p>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      ) : (
                                        <p className="document-portal-no-associated-documents">
                                          Nenhum processo ativo associado a esta cadeia.
                                        </p>
                                      )}
                                    </article>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="document-portal-section-empty">
                                Nenhuma cadeia ativa nesta categoria.
                              </p>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="document-portal-section-empty">
                      Nenhuma cadeia de valor ativa foi cadastrada nesta organização.
                    </p>
                  )}
                </PortalSection>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
