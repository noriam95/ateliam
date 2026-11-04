import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Bookmark,
  Building2,
  Compass,
  FileText,
  Library,
  Search,
  Workflow,
  X,
  ContactRound,
  ArrowUpRight,
  LoaderCircle,
  ArrowRight,
  Layers3,
  Sparkles,
} from "lucide-react";
import {
  filterAndSortPortalDocuments,
  normalizePortalText,
  type PortalDocument,
  type PortalDocumentFilters,
  type PortalDocumentSort,
} from "@/lib/document-portal";
import { PortalOrganizationLogo } from "./portal-organization-logo";
import { PortalValueChain, type PortalChain } from "./portal-value-chain";
import "./portal-explorer.css";

export type PortalViewState = {
  query: string;
  filters: PortalDocumentFilters;
  sort: PortalDocumentSort;
  view: "explore" | "library" | "saved";
  explore: "chain" | "area" | "process" | "role";
  page: number;
};
export type PortalStructure = {
  areas: Array<{ id: string; name: string; sigla?: string | null }>;
  processes: Array<{
    id: string;
    name: string;
    type: string;
    parent_process_id: string | null;
    value_chain_id: string | null;
    description?: string | null;
  }>;
  positions: Array<{ id: string; title: string; description: string | null }>;
  valueChains: PortalChain[];
  valueChainRelations?: Array<{ output_id: string; chain_id: string }>;
};
type Props = {
  organization: { name: string; logo_data_url?: string | null };
  documents: PortalDocument[];
  structure: PortalStructure;
  state: PortalViewState;
  onChange: (state: PortalViewState) => void;
  favorites: string[];
  accessCounts: Record<string, number>;
  onFavorite: (id: string) => void;
  onOpen: (document: PortalDocument) => void;
  loading: boolean;
  error?: string;
  onRetry: () => void;
  header: ReactNode;
};
const filterLabels: Record<keyof PortalDocumentFilters, string> = {
  area: "Área",
  process: "Processo",
  processId: "Processo",
  role: "Cargo",
  chain: "Cadeia de valor",
  type: "Modalidade",
  macroprocess: "Macroprocesso",
  subprocess: "Subprocesso",
  responsible: "Responsável",
  module: "Módulo",
};
const pageSize = 12;

export function DocumentPortalView({
  organization,
  documents,
  structure,
  state,
  onChange,
  favorites,
  accessCounts,
  onFavorite,
  onOpen,
  loading,
  error,
  onRetry,
  header,
}: Props) {
  const [draft, setDraft] = useState(state.query);
  const composing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => setDraft(state.query), [state.query]);
  const change = (next: Partial<PortalViewState>) => onChange({ ...state, page: 1, ...next });
  const filter = (key: keyof PortalDocumentFilters, value: string) =>
    change({ view: "library", filters: { ...state.filters, [key]: value || undefined } });
  const choose = (key: keyof PortalDocumentFilters, value: string) =>
    change({ query: "", view: "library", filters: { [key]: value } });
  const clear = () => {
    setDraft("");
    change({ query: "", filters: {}, sort: "relevance" });
    input.current?.focus();
  };
  const rows = useMemo(
    () =>
      filterAndSortPortalDocuments(
        documents,
        state.query,
        state.filters,
        state.sort,
        accessCounts,
      ).filter((d) => state.view !== "saved" || favorites.includes(d.id)),
    [documents, state, accessCounts, favorites],
  );
  const page = Math.min(Math.max(1, state.page), Math.max(1, Math.ceil(rows.length / pageSize)));
  const active = !!state.query.trim() || Object.values(state.filters).some(Boolean);
  const exploring = state.view === "explore" && !active;
  const goHome = () => {
    setDraft("");
    change({ view: "explore", query: "", filters: {}, sort: "relevance" });
  };
  const unique = (values: string[]) =>
    [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const roles = unique([
    ...structure.positions.map((p) => p.title),
    ...documents.flatMap((d) => d.roles ?? []),
  ]);
  const areas = unique([...structure.areas.map((a) => a.name), ...documents.map((d) => d.area)]);
  const types = unique(documents.map((d) => d.type));
  const count = (filters: PortalDocumentFilters) =>
    filterAndSortPortalDocuments(documents, "", filters, "relevance").length;
  const label = (key: keyof PortalDocumentFilters, value: string) =>
    key === "chain"
      ? structure.valueChains.find((c) => c.id === value)?.name || value
      : key === "processId"
        ? structure.processes.find((p) => p.id === value)?.name || value
        : value;
  const entities =
    state.explore === "area"
      ? structure.areas.map((a) => ({
          id: a.id,
          title: a.name,
          filter: "area" as const,
          value: a.name,
          subtitle: a.sigla || "Área",
        }))
      : state.explore === "process"
        ? structure.processes.map((p) => ({
            id: p.id,
            title: p.name,
            filter: "processId" as const,
            value: p.id,
            subtitle:
              (
                {
                  macroprocess: "Macroprocesso",
                  process: "Processo",
                  subprocess: "Subprocesso",
                  atividade: "Atividade",
                  tarefa: "Tarefa",
                } as Record<string, string>
              )[p.type] || "Processo",
          }))
        : roles.map((r) => ({
            id: r,
            title: r,
            filter: "role" as const,
            value: r,
            subtitle: "Cargo",
          }));
  const [selectedExploreId, setSelectedExploreId] = useState("");
  useEffect(() => setSelectedExploreId(""), [state.explore, organization.name]);
  const selectedEntity =
    state.explore === "chain"
      ? structure.valueChains.find((chain) => chain.id === selectedExploreId) ||
        structure.valueChains.find((chain) => chain.category === "primary") ||
        structure.valueChains[0]
      : entities.find((entity) => entity.id === selectedExploreId) || entities[0];
  const selectedFilterKey: keyof PortalDocumentFilters =
    state.explore === "chain"
      ? "chain"
      : state.explore === "area"
        ? "area"
        : state.explore === "process"
          ? "processId"
          : "role";
  const selectedValue = selectedEntity
    ? "value" in selectedEntity
      ? selectedEntity.value
      : selectedEntity.id
    : "";
  const selectedFilter: PortalDocumentFilters | undefined = selectedEntity
    ? { [selectedFilterKey]: selectedValue }
    : undefined;
  const selectedDocuments = selectedFilter
    ? filterAndSortPortalDocuments(documents, "", selectedFilter, "relevance", accessCounts)
    : [];
  const selectedRelations =
    state.explore === "chain" && selectedEntity
      ? (structure.valueChainRelations || [])
          .filter((relation) =>
            (selectedEntity as PortalChain).category === "output"
              ? relation.output_id === selectedEntity.id
              : relation.chain_id === selectedEntity.id,
          )
          .map((relation) =>
            structure.valueChains.find((chain) =>
              (selectedEntity as PortalChain).category === "output"
                ? chain.id === relation.chain_id
                : chain.id === relation.output_id,
            ),
          )
          .filter((chain): chain is PortalChain => !!chain)
      : [];
  const selectedRelationsLabel =
    state.explore === "chain" && (selectedEntity as PortalChain | undefined)?.category === "output"
      ? "Macroprocessos conectados"
      : "Saídas relacionadas";
  const contextDescription =
    state.explore === "chain"
      ? (selectedEntity as PortalChain | undefined)?.description
      : state.explore === "area"
        ? "Consulte os documentos vigentes associados a esta área."
        : state.explore === "process"
          ? (structure.processes.find((process) => process.id === selectedEntity?.id)
              ?.description ?? "Etapa cadastrada na estrutura de processos da organização.")
          : (structure.positions.find(
              (position) =>
                position.title ===
                (selectedEntity && "title" in selectedEntity ? selectedEntity.title : ""),
            )?.description ?? "Documentos associados a esta responsabilidade.");
  const connections = useMemo(() => {
    if (!state.query.trim()) return [];
    const terms = normalizePortalText(state.query).split(" ").filter(Boolean);
    const all = [
      ...areas.map((a) => ({ key: "area" as const, value: a, title: a })),
      ...structure.processes.map((p) => ({
        key: "processId" as const,
        value: p.id,
        title: p.name,
      })),
      ...roles.map((r) => ({ key: "role" as const, value: r, title: r })),
      ...structure.valueChains.map((c) => ({ key: "chain" as const, value: c.id, title: c.name })),
    ];
    return all
      .filter((e) => terms.every((t) => normalizePortalText(e.title).includes(t)))
      .slice(0, 8);
  }, [state.query, areas, roles, structure]);
  function matchLabels(d: PortalDocument) {
    const terms = normalizePortalText(state.query).split(" ").filter(Boolean);
    return [
      ["Título", d.title],
      ["Código", d.code],
      ["Área", d.area],
      ["Processo", [d.macroprocess, d.process, d.subprocess].join(" ")],
      ["Cargo", (d.roles ?? []).join(" ")],
      ["Cadeia de valor", (d.chainNames ?? []).join(" ")],
      ["Responsável", d.responsible],
      ["Conteúdo", d.searchText],
    ]
      .filter(([, value]) => terms.some((t) => normalizePortalText(value).includes(t)))
      .map(([name]) => name)
      .join(", ");
  }
  function select(
    key: keyof PortalDocumentFilters,
    title: string,
    options: Array<{ value: string; label: string }>,
  ) {
    const selected = state.filters[key] || "";
    return (
      <label>
        {title}
        <select value={selected} onChange={(e) => filter(key, e.target.value)}>
          <option value="">Todos</option>
          {selected && !options.some((o) => o.value === selected) ? (
            <option value={selected}>{label(key, selected)}</option>
          ) : null}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    );
  }
  return (
    <div className="portal-explorer">
      <div className="px-main">
        {header}
        <div className="px-masthead">
          <button
            type="button"
            className="px-brand"
            onClick={goHome}
            aria-label="Ir para o início do portal"
          >
            <PortalOrganizationLogo name={organization.name} logo={organization.logo_data_url} />
            <span>Portal de documentos</span>
          </button>
          <nav className="px-primary-nav" aria-label="Navegação do portal">
            <button type="button" aria-current={exploring ? "page" : undefined} onClick={goHome}>
              <Compass size={17} /> Explorar
            </button>
            <button
              type="button"
              aria-current={state.view === "library" ? "page" : undefined}
              onClick={() => change({ view: "library" })}
            >
              <Library size={17} /> Todos os documentos <span>{documents.length}</span>
            </button>
            <button
              type="button"
              aria-current={state.view === "saved" ? "page" : undefined}
              onClick={() => change({ view: "saved" })}
            >
              <Bookmark size={17} /> Favoritos <span>{favorites.length}</span>
            </button>
          </nav>
        </div>
        <main className="px-body">
          {exploring ? (
            <section className="px-hero" aria-label="Pesquisa no portal">
              <div className="px-hero-copy">
                <span className="px-hero-eyebrow">
                  <Sparkles size={14} /> CONHECIMENTO EM MOVIMENTO
                </span>
                <h1>
                  Encontre o caminho.
                  <br />
                  <em>Faça acontecer.</em>
                </h1>
                <p>
                  Documentos, processos e orientações da sua organização — conectados em um só
                  lugar.
                </p>
              </div>
              <div className="px-hero-brand">
                <div className="px-hero-logo-plaque">
                  <PortalOrganizationLogo
                    name={organization.name}
                    logo={organization.logo_data_url}
                  />
                </div>
                <span>ORGANIZAÇÃO</span>
              </div>
            </section>
          ) : (
            <div className="px-page-heading">
              <div>
                <p className="px-kicker">
                  {state.view === "saved" ? "SUA COLEÇÃO" : "ACERVO ORGANIZACIONAL"}
                </p>
                <h1>
                  {state.view === "saved"
                    ? "Seus favoritos"
                    : state.query
                      ? "Resultados da pesquisa"
                      : "Todos os documentos"}
                </h1>
              </div>
              <span className="px-total-pill">
                <FileText size={15} /> {rows.length}{" "}
                {rows.length === 1 ? "documento" : "documentos"}
              </span>
            </div>
          )}
          <form
            noValidate
            className={`px-search${exploring ? " px-search-hero" : ""}`}
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              if (!composing.current) change({ query: draft, view: "library" });
            }}
          >
            <Search size={20} aria-hidden="true" />
            <input
              ref={input}
              value={draft}
              aria-label="Pesquisar em todo o portal"
              placeholder="Pesquise por assunto, código, área, processo, cargo…"
              maxLength={160}
              onCompositionStart={() => (composing.current = true)}
              onCompositionEnd={(e) => {
                composing.current = false;
                change({ query: e.currentTarget.value });
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                if (!composing.current) change({ query: e.target.value });
              }}
            />
            {draft ? (
              <button
                type="button"
                className="px-clear-search"
                aria-label="Limpar pesquisa"
                onClick={() => {
                  setDraft("");
                  change({ query: "" });
                  input.current?.focus();
                }}
              >
                <X size={18} />
              </button>
            ) : null}
            <button type="submit">
              <Search size={16} /> Buscar
            </button>
          </form>
          <p className="px-search-hint">
            Pesquise em tudo: títulos, códigos, conteúdo, áreas, processos, cargos e cadeia de
            valor.
          </p>
          {loading ? (
            <div className="px-state" role="status">
              <LoaderCircle className="animate-spin" size={20} />
              Carregando documentos e cadastros…
            </div>
          ) : error ? (
            <div className="px-state" role="alert">
              <strong>Não foi possível carregar o portal.</strong>
              <p>{error}</p>
              <button type="button" onClick={onRetry}>
                Tentar novamente
              </button>
            </div>
          ) : (
            <>
              {exploring ? (
                <section aria-label="Explorar documentos">
                  <div className="px-explore-heading">
                    <div>
                      <p className="px-kicker">COMECE PELO QUE VOCÊ CONHECE</p>
                      <h2>Como você quer encontrar?</h2>
                      <p>Escolha um ponto de partida. O portal conecta o restante.</p>
                    </div>
                  </div>
                  <div className="px-route-grid" role="group" aria-label="Explorar documentos por">
                    {(
                      [
                        {
                          id: "chain",
                          title: "Cadeia de valor",
                          subtitle: "Siga as conexões do negócio",
                          Icon: Workflow,
                          count: structure.valueChains.filter((c) => c.category !== "output")
                            .length,
                          tone: "green",
                        },
                        {
                          id: "area",
                          title: "Área",
                          subtitle: "Encontre pelo seu time",
                          Icon: Building2,
                          count: areas.length,
                          tone: "blue",
                        },
                        {
                          id: "process",
                          title: "Processo",
                          subtitle: "Vá direto à atividade",
                          Icon: Layers3,
                          count: structure.processes.length,
                          tone: "gold",
                        },
                        {
                          id: "role",
                          title: "Cargo",
                          subtitle: "Consulte por responsabilidade",
                          Icon: ContactRound,
                          count: roles.length,
                          tone: "purple",
                        },
                      ] as const
                    ).map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        className={`px-route px-route-${m.tone}${state.explore === m.id ? " is-selected" : ""}`}
                        aria-pressed={state.explore === m.id}
                        onClick={() => change({ explore: m.id })}
                      >
                        <span className="px-route-icon">
                          <m.Icon size={21} />
                        </span>
                        <span className="px-route-copy">
                          <strong>{m.title}</strong>
                          <small>{m.subtitle}</small>
                        </span>
                        <span className="px-route-meta">
                          <b>{m.count}</b>
                          <small>{m.count === 1 ? "opção" : "opções"}</small>
                        </span>
                        <ArrowRight className="px-route-arrow" size={17} />
                      </button>
                    ))}
                  </div>
                  <div className="px-explorer-board">
                    <div className="px-explorer-visual">
                      {state.explore === "chain" ? (
                        <PortalValueChain
                          chains={structure.valueChains}
                          organizationName={organization.name}
                          count={(id) => count({ chain: id })}
                          selectedId={selectedEntity?.id || ""}
                          relations={structure.valueChainRelations || []}
                          onSelect={setSelectedExploreId}
                        />
                      ) : state.explore === "process" ? (
                        <div className="px-process-map" aria-label="Processos por etapa">
                          {["Macroprocesso", "Processo", "Subprocesso", "Atividade", "Tarefa"]
                            .map((group) => ({
                              group,
                              nodes: entities.filter((entity) => entity.subtitle === group),
                            }))
                            .filter((group) => group.nodes.length)
                            .map((group) => (
                              <section className="px-process-lane" key={group.group}>
                                <h3>{group.group}</h3>
                                <div>
                                  {group.nodes.map((entity) => (
                                    <button
                                      type="button"
                                      key={entity.id}
                                      aria-pressed={entity.id === selectedEntity?.id}
                                      className={
                                        entity.id === selectedEntity?.id ? "is-selected" : undefined
                                      }
                                      onClick={() => setSelectedExploreId(entity.id)}
                                    >
                                      <span>{group.group}</span>
                                      <strong>{entity.title}</strong>
                                      <small>
                                        {count({ [entity.filter]: entity.value })} documentos
                                      </small>
                                    </button>
                                  ))}
                                </div>
                              </section>
                            ))}
                        </div>
                      ) : (
                        <div
                          className={`px-visual-field px-visual-field-${state.explore}`}
                          aria-label={
                            state.explore === "area"
                              ? "Áreas da organização"
                              : "Cargos da organização"
                          }
                        >
                          {entities.map((entity, index) => (
                            <button
                              type="button"
                              key={entity.id}
                              aria-pressed={entity.id === selectedEntity?.id}
                              className={`${entity.id === selectedEntity?.id ? "is-selected" : ""} px-visual-node-${index % 5}`}
                              onClick={() => setSelectedExploreId(entity.id)}
                            >
                              <span className="px-visual-node-icon">
                                {state.explore === "area" ? (
                                  <Building2 size={17} />
                                ) : (
                                  <ContactRound size={17} />
                                )}
                              </span>
                              <strong>{entity.title}</strong>
                              <small>{entity.subtitle}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <aside className="px-context-panel" aria-live="polite">
                      {selectedEntity ? (
                        <>
                          <p className="px-kicker">
                            {state.explore === "chain"
                              ? "MACROPROCESSO SELECIONADO"
                              : state.explore === "process"
                                ? "PROCESSO SELECIONADO"
                                : state.explore === "area"
                                  ? "ÁREA SELECIONADA"
                                  : "CARGO SELECIONADO"}
                          </p>
                          <h3>
                            {"title" in selectedEntity ? selectedEntity.title : selectedEntity.name}
                          </h3>
                          <p className="px-context-description">
                            {contextDescription ||
                              "Explore os vínculos e documentos vigentes relacionados."}
                          </p>
                          {selectedRelations.length ? (
                            <div className="px-context-outputs">
                              <div>
                                <strong>{selectedRelationsLabel}</strong>
                                <small>{selectedRelations.length}</small>
                              </div>
                              {selectedRelations.map((output) => (
                                <button
                                  type="button"
                                  key={output.id}
                                  onClick={() => setSelectedExploreId(output.id)}
                                >
                                  {output.name}
                                  <ArrowRight size={13} />
                                </button>
                              ))}
                            </div>
                          ) : null}
                          <div className="px-context-docs-head">
                            <strong>Documentos neste contexto</strong>
                            <small>{selectedDocuments.length} relacionados</small>
                          </div>
                          <div className="px-context-docs">
                            {selectedDocuments.slice(0, 3).map((document) => (
                              <article key={document.id}>
                                <span>
                                  <FileText size={15} />
                                </span>
                                <div>
                                  <button type="button" onClick={() => onOpen(document)}>
                                    {document.title}
                                  </button>
                                  <small>
                                    {document.code || document.type} ·{" "}
                                    {document.area || document.moduleLabel}
                                  </small>
                                </div>
                                <button
                                  type="button"
                                  className="px-save"
                                  aria-label={`${favorites.includes(document.id) ? "Remover dos favoritos" : "Salvar nos favoritos"}: ${document.title}`}
                                  aria-pressed={favorites.includes(document.id)}
                                  onClick={() => onFavorite(document.id)}
                                >
                                  <Bookmark
                                    size={15}
                                    fill={favorites.includes(document.id) ? "currentColor" : "none"}
                                  />
                                </button>
                              </article>
                            ))}
                            {!selectedDocuments.length ? (
                              <p className="px-context-empty">
                                Ainda não há documentos vigentes vinculados a esta seleção.
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="px-context-open"
                            onClick={() => choose(selectedFilterKey, selectedValue)}
                          >
                            Ver {selectedDocuments.length === 1 ? "documento" : "documentos"}{" "}
                            relacionados <ArrowRight size={14} />
                          </button>
                        </>
                      ) : (
                        <p className="px-context-empty">
                          Nenhum cadastro disponível nesta organização.
                        </p>
                      )}
                    </aside>
                  </div>
                </section>
              ) : null}
              {!exploring ? (
                <section className="px-results" aria-label="Resultados da consulta">
                  <div className="px-section-head px-results-heading">
                    <div>
                      <h2>
                        {state.view === "saved"
                          ? "Documentos salvos"
                          : state.query.trim()
                            ? "Resultados da pesquisa"
                            : active
                              ? "Documentos relacionados"
                              : "Biblioteca completa"}
                      </h2>
                      <p role="status">
                        {rows.length}{" "}
                        {rows.length === 1 ? "documento vigente" : "documentos vigentes"}
                      </p>
                    </div>
                    {active ? (
                      <button type="button" className="px-link" onClick={clear}>
                        Limpar filtros
                      </button>
                    ) : null}
                  </div>
                  {active ? (
                    <div className="px-chips">
                      {state.query ? (
                        <button type="button" onClick={() => change({ query: "" })}>
                          Pesquisa: {state.query}
                          <X size={13} />
                        </button>
                      ) : null}
                      {Object.entries(state.filters)
                        .filter(([, v]) => v)
                        .map(([key, value]) => (
                          <button
                            type="button"
                            key={key}
                            aria-label={`Remover filtro ${filterLabels[key as keyof PortalDocumentFilters]}`}
                            onClick={() => filter(key as keyof PortalDocumentFilters, "")}
                          >
                            {filterLabels[key as keyof PortalDocumentFilters]}:{" "}
                            {label(key as keyof PortalDocumentFilters, value!)}
                            <X size={13} />
                          </button>
                        ))}
                    </div>
                  ) : null}
                  {
                    <div className="px-filters">
                      {select(
                        "area",
                        "Área",
                        areas.map((value) => ({ value, label: value })),
                      )}
                      {select(
                        "processId",
                        "Processo",
                        structure.processes.map((p) => ({ value: p.id, label: p.name })),
                      )}
                      {select(
                        "role",
                        "Cargo",
                        roles.map((value) => ({ value, label: value })),
                      )}
                      {select(
                        "type",
                        "Modalidade",
                        types.map((value) => ({ value, label: value })),
                      )}
                      <label>
                        Ordenar por
                        <select
                          value={state.sort}
                          onChange={(e) => change({ sort: e.target.value as PortalDocumentSort })}
                        >
                          <option value="relevance">Relevância</option>
                          <option value="alphabetical">Título: A–Z</option>
                          <option value="updated">Última atualização</option>
                          <option value="effective">Vigência</option>
                          <option value="recent">Mais recentes</option>
                          <option value="popular">Mais acessados por mim</option>
                        </select>
                      </label>
                    </div>
                  }
                  {connections.length ? (
                    <div className="px-connections" aria-label="Cadastros encontrados">
                      {connections.map((e) => (
                        <button
                          type="button"
                          key={e.key + e.value}
                          onClick={() => choose(e.key, e.value)}
                        >
                          <small>{filterLabels[e.key]}</small>
                          {e.title} →
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="px-documents">
                    {rows.slice((page - 1) * pageSize, page * pageSize).map((d) => (
                      <article className="px-document" key={d.id} data-module={d.module}>
                        <span className="px-document-icon">
                          <FileText size={21} aria-hidden="true" />
                        </span>
                        <div>
                          <button
                            type="button"
                            className="px-document-title"
                            onClick={() => onOpen(d)}
                          >
                            {d.title}
                            <ArrowUpRight size={14} aria-hidden="true" />
                          </button>
                          <p>
                            {d.code || d.type} · {d.area || "Área não informada"} · Rev.{" "}
                            {d.revision}
                          </p>
                          <p>{d.process || d.macroprocess || d.description}</p>
                          {state.query.trim() ? (
                            <small>Encontrado em: {matchLabels(d) || "Palavras-chave"}</small>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className="px-save"
                          aria-pressed={favorites.includes(d.id)}
                          aria-label={`${favorites.includes(d.id) ? "Remover dos salvos" : "Salvar"}: ${d.title}`}
                          onClick={() => onFavorite(d.id)}
                        >
                          <Bookmark
                            size={18}
                            fill={favorites.includes(d.id) ? "currentColor" : "none"}
                          />
                        </button>
                      </article>
                    ))}
                  </div>
                  {!rows.length ? (
                    <div className="px-state">
                      <h3>
                        {state.view === "saved" && !active
                          ? "Você ainda não salvou documentos"
                          : active
                            ? "Nenhum documento encontrado"
                            : "Nenhum documento vigente disponível"}
                      </h3>
                      <p>
                        {active
                          ? "Tente outro termo ou remova os filtros."
                          : state.view === "saved"
                            ? "Use o marcador ao lado de um documento para encontrá-lo aqui."
                            : "Documentos publicados e vigentes desta organização aparecerão aqui."}
                      </p>
                      {active ? (
                        <button type="button" onClick={clear}>
                          Limpar pesquisa e filtros
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {rows.length > pageSize ? (
                    <nav className="px-pagination" aria-label="Páginas de documentos">
                      <button
                        type="button"
                        disabled={page === 1}
                        onClick={() => change({ page: page - 1 })}
                      >
                        Anterior
                      </button>
                      <span>
                        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, rows.length)} de{" "}
                        {rows.length}
                      </span>
                      <button
                        type="button"
                        disabled={page * pageSize >= rows.length}
                        onClick={() => change({ page: page + 1 })}
                      >
                        Próxima
                      </button>
                    </nav>
                  ) : null}
                </section>
              ) : null}
              {exploring ? (
                <div className="px-discovery-footer">
                  <div>
                    <span className="px-discovery-mark">
                      <Library size={19} />
                    </span>
                    <p>
                      <strong>Prefere ver tudo de uma vez?</strong>
                      <small>Navegue pelo acervo completo e use os filtros para refinar.</small>
                    </p>
                  </div>
                  <button type="button" onClick={() => change({ view: "library" })}>
                    Abrir todos os documentos <ArrowRight size={16} />
                  </button>
                </div>
              ) : null}
            </>
          )}
        </main>
        <footer className="px-footer">
          <span>Portal de documentos · {organization.name}</span>
          <span>Documentos vigentes da organização ativa</span>
        </footer>
      </div>
    </div>
  );
}
