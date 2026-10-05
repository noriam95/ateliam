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
import { getMe, listAccessibleOrganizations, listPortalDocuments } from "@/lib/config.functions";
import {
  filterAndSortPortalDocuments,
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
  const unique = (
    key: keyof Pick<
      PortalDocument,
      "area" | "macroprocess" | "process" | "subprocess" | "type" | "responsible" | "module"
    >,
  ) =>
    Array.from(new Set(documents.map((document) => document[key]).filter(Boolean))).sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  const areas = unique("area");
  const macroprocesses = unique("macroprocess");
  const processes = unique("process");
  const subprocesses = unique("subprocess");
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

  const loading = me.isPending || organizations.isPending || documentsQuery.isLoading;
  const failure = me.error || organizations.error || documentsQuery.error;
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
        <section className="document-portal-hero">
          <div className="document-portal-hero-copy">
            <div className="document-portal-eyebrow">
              <BookOpen size={15} /> Conhecimento oficial
            </div>
            <h1>Portal de Documentos</h1>
            <p>Encontre e consulte os documentos vigentes da organização em um único lugar.</p>
          </div>
          <div className="document-portal-hero-search">
            <label htmlFor="document-portal-search">O que você procura?</label>
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
            <div className="document-portal-stats" aria-label="Resumo do acervo vigente">
              <span>
                <strong>{documents.length}</strong> documentos
              </span>
              <span>
                <strong>{areas.length}</strong> áreas
              </span>
              <span>
                <strong>{updatedInThirtyDays}</strong> atualizados em 30 dias
              </span>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="document-portal-state" role="status">
            Carregando documentos vigentes…
          </div>
        ) : failure ? (
          <div className="document-portal-state is-error" role="alert">
            <strong>Não foi possível carregar o Portal.</strong>
            <span>{failure instanceof Error ? failure.message : "Tente novamente."}</span>
            <button type="button" onClick={() => void documentsQuery.refetch()}>
              Tentar novamente
            </button>
          </div>
        ) : (
          <>
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
                    <option key={area}>{area}</option>
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
                    <option key={process}>{process}</option>
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
                <div className="document-portal-feature-grid">
                  <PortalSection
                    title="Últimos documentos"
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
                    title="Mais acessados"
                    description="Conteúdos consultados com maior frequência por você."
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
                        Os documentos mais consultados por você aparecerão aqui.
                      </p>
                    )}
                  </PortalSection>
                </div>

                <div className="document-portal-personal-grid">
                  <PortalSection
                    title="Meus favoritos"
                    description="Atalhos pessoais para consulta recorrente."
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
                    description="Retome rapidamente suas últimas consultas."
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

                <div className="document-portal-browse-grid">
                  <PortalSection
                    title="Navegar por área"
                    description="Explore o acervo pelo contexto organizacional."
                    icon={<Building2 size={18} />}
                  >
                    <div className="document-portal-taxonomy">
                      {areas.slice(0, 10).map((area) => {
                        const count = documents.filter((document) => document.area === area).length;
                        return (
                          <button
                            type="button"
                            key={area}
                            onClick={() => applyDiscoveryFilter({ area })}
                          >
                            <Building2 size={16} />
                            <span>
                              <strong>{area}</strong>
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
                  <PortalSection
                    title="Navegar por processo"
                    description="Acesse documentos pelo processo relacionado."
                    icon={<GitBranch size={18} />}
                  >
                    <div className="document-portal-taxonomy">
                      {processes.slice(0, 10).map((process) => {
                        const count = documents.filter(
                          (document) => document.process === process,
                        ).length;
                        return (
                          <button
                            type="button"
                            key={process}
                            onClick={() => applyDiscoveryFilter({ process })}
                          >
                            <GitBranch size={16} />
                            <span>
                              <strong>{process}</strong>
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
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}
