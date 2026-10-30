import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { statusColor } from "@/lib/status-color";
import {
  ArrowRight,
  Building2,
  FileText,
  Info,
  Lightbulb,
  MapPinned,
  Network,
  Workflow,
  X,
} from "lucide-react";
import "./operational-dashboard.css";

type Process = {
  id: string;
  name: string;
  department: string | null;
  mappings: { name: string }[];
};
type Mapping = { id: string; name: string; code: string; area: string; status: string };
type Document = {
  id: string;
  title: string;
  code: string;
  area: string;
  status: string;
  documentType: string;
};
type Improvement = {
  id: string;
  cause: string;
  area?: string;
  source: string;
  mapping: string;
  status: string;
  priority: string;
};
type Entry = {
  id: string;
  title: string;
  area: string;
  code: string;
  status: string;
  kind: string;
  type?: string;
  priority?: string;
  source?: string;
};
const colors = [
  "var(--chart-blue)",
  "var(--chart-teal)",
  "var(--chart-amber)",
  "var(--chart-purple)",
  "var(--chart-red)",
  "var(--chart-neutral)",
];
const areaName = (s?: string | null) => (!s?.trim() || s.trim() === "-" ? "Sem área" : s.trim());
const normalized = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
function statusName(value: string) {
  const s = normalized(value);
  if (s.includes("rascunho")) return "Rascunho";
  if (s.includes("nao inici")) return "Não iniciada";
  if (s.includes("andamento")) return "Em andamento";
  if (s.includes("revis")) return "Em revisão";
  if (s.includes("aprov")) return "Aprovado";
  if (s.includes("conclu")) return "Concluído";
  if (s.includes("encerr")) return "Encerrada";
  if (s.includes("cancel")) return "Cancelada";
  return value && value !== "-" ? value : "Não informada";
}
function groups(rows: Entry[], key: "status" | "type" | "priority" | "source" | "area") {
  const result = new Map<string, Entry[]>();
  rows.forEach((row) => {
    const name = row[key] || "Não informada";
    const group = result.get(name);
    if (group) group.push(row);
    else result.set(name, [row]);
  });
  return [...result].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));
}
const colorFor = (label: string, index: number) => {
  const normalizedLabel = normalized(label);
  if (
    [
      "rascunho",
      "nao iniciada",
      "em andamento",
      "em revisao",
      "aprovado",
      "concluido",
      "encerrada",
      "cancelada",
      "alta",
      "media",
      "baixa",
    ].includes(normalizedLabel)
  ) {
    if (normalizedLabel === "alta") return "var(--status-cancelled)";
    if (normalizedLabel === "media") return "var(--status-review)";
    if (normalizedLabel === "baixa") return "var(--status-neutral)";
    return statusColor(label);
  }
  return colors[index % colors.length];
};

export function OperationalDashboard({
  error,
  onRetry,
  organizationName,
  departments,
  processes,
  mappings,
  documents,
  improvements,
  loading,
}: {
  error?: string;
  onRetry?: () => void;
  organizationName: string;
  departments: { id: string; name: string }[];
  processes: Process[];
  mappings: Mapping[];
  documents: Document[];
  improvements: Improvement[];
  loading: boolean;
}) {
  const navigate = useNavigate();
  const [area, setArea] = useState("");
  const [group, setGroup] = useState<"status" | "priority" | "source">("status");
  const [coverageOnlyPending, setCoverageOnlyPending] = useState(false);
  const [coverageSort, setCoverageSort] = useState<{
    key: "name" | "pending" | "coverage";
    descending: boolean;
  }>({ key: "pending", descending: true });
  const [detail, setDetail] = useState<{ title: string; rows: Entry[]; criteria?: boolean } | null>(
    null,
  );
  const [page, setPage] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (detail) dialog.current?.showModal();
  }, [detail]);
  const mappingEntries: Entry[] = mappings.map((m) => ({
    ...m,
    title: m.name,
    area: areaName(m.area),
    status: statusName(m.status),
    kind: "ddp",
  }));
  const docEntries: Entry[] = documents
    .filter((d) => d.documentType !== "Mapeamento")
    .map((d) => ({
      ...d,
      area: areaName(d.area),
      status: statusName(d.status),
      type: d.documentType,
      kind: d.documentType === "Fluxograma" ? "bpmn" : "pop",
    }));
  const improvementEntries: Entry[] = improvements.map((m) => ({
    ...m,
    title: m.cause,
    area: areaName(m.area),
    code: m.source === "Mapeamento" ? m.mapping : "",
    status: statusName(m.status),
    kind: "improvement",
  }));
  const processEntries: Entry[] = processes.map((p) => ({
    ...p,
    title: p.name,
    area: areaName(p.department),
    code: "",
    status: p.mappings.length ? "Mapeado" : "Sem mapeamento",
    kind: "process",
  }));
  const all = [...mappingEntries, ...docEntries, ...improvementEntries];
  const areas = [
    ...new Set([
      ...departments.map((d) => d.name),
      ...all.map((r) => r.area),
      ...processEntries.map((r) => r.area),
    ]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filter = (rows: Entry[]) => rows.filter((r) => !area || r.area === area);
  const maps = filter(mappingEntries),
    docs = filter(docEntries),
    imps = filter(improvementEntries),
    ps = filter(processEntries);
  const show = (title: string, rows: Entry[]) => {
    setPage(0);
    setDetail({ title, rows });
  };
  const covered = ps.filter((p) => p.status === "Mapeado").length;
  const coverageRows = (area ? [area] : areas)
    .map((name) => {
      const rows = ps.filter((p) => p.area === name);
      const mapped = rows.filter((p) => p.status === "Mapeado").length;
      return {
        name,
        rows,
        total: rows.length,
        mapped,
        pending: rows.length - mapped,
        coverage: rows.length ? Math.round((mapped / rows.length) * 100) : 0,
      };
    })
    .filter((row) => row.total > 0 && (!coverageOnlyPending || row.pending > 0))
    .sort((a, b) => {
      const difference =
        coverageSort.key === "name"
          ? a.name.localeCompare(b.name, "pt-BR")
          : a[coverageSort.key] - b[coverageSort.key];
      return (
        (coverageSort.descending ? -1 : 1) * difference || a.name.localeCompare(b.name, "pt-BR")
      );
    });
  const distribution = groups([...maps, ...imps], "area");
  const distributionRows =
    distribution.length <= 4
      ? distribution
      : [
          ...distribution.slice(0, 3),
          ["Demais áreas", distribution.slice(3).flatMap(([, rows]) => rows)] as [string, Entry[]],
        ];
  const maxAreaRecords = Math.max(1, ...distributionRows.map(([, rows]) => rows.length));
  const stats = groups(maps, "status"),
    docTypes = groups(docs, "type"),
    impGroups = groups(imps, group);
  const openImprovements = imps.filter(
    (row) => !["Encerrada", "Cancelada", "Concluído"].includes(row.status),
  );
  const closedImprovements = imps.filter((row) => ["Encerrada", "Concluído"].includes(row.status));
  const unclassifiedMappings = maps.filter((row) => row.area === "Sem área");
  const unclassifiedImprovements = imps.filter((row) => row.area === "Sem área");
  const registeredAreas = departments.filter((d) => !area || d.name === area);
  const areaRecords: Entry[] = registeredAreas.map((d) => ({
    id: d.id,
    title: d.name,
    area: d.name,
    code: "",
    kind: "area",
    status: `${processEntries.filter((p) => p.area === d.name).length} processos`,
  }));
  const open = (row: Entry) => {
    if (row.kind === "process" || row.kind === "area")
      navigate({
        to: "/",
        search: { area: "modules", view: row.kind === "area" ? "areas" : "processes" },
      });
    else
      navigate({
        to: "/m/$module",
        params: { module: row.kind === "improvement" ? "ddp" : row.kind },
        search: {
          view: row.kind === "improvement" ? "cause-consult" : "consult",
          filter:
            row.kind === "improvement"
              ? row.title
              : row.code && row.code !== "-"
                ? row.code
                : row.title,
        },
      });
  };
  const link = (label: string, action: () => void) => (
    <button type="button" className="op-link" onClick={action}>
      {label}
      <ArrowRight size={12} />
    </button>
  );
  const blank = <p className="op-empty">Nenhum registro neste recorte.</p>;
  function panel(
    title: string,
    subtitle: string,
    content: ReactNode,
    footer: ReactNode,
    extra?: ReactNode,
    className = "",
  ) {
    return (
      <section className={`op-panel ${className}`}>
        <div className="op-panel-head">
          <h2>{title}</h2>
          {extra}
        </div>
        <p>{subtitle}</p>
        {content}
        <div className="op-panel-foot">{footer}</div>
      </section>
    );
  }
  const coveragePercent = ps.length ? Math.round((covered / ps.length) * 100) : 0;
  const metricCards = [
    {
      title: "Processos",
      value: ps.length.toString(),
      entries: ps,
      subtitle: `${areaRecords.length} áreas cadastradas`,
      icon: Network,
    },
    {
      title: "Cobertura de mapeamento",
      value: `${coveragePercent}%`,
      entries: ps.filter((row) => row.status === "Mapeado"),
      subtitle: `${covered} de ${ps.length} processos`,
      icon: MapPinned,
      tone: "gold",
    },
    {
      title: "Sem mapeamento",
      value: (ps.length - covered).toString(),
      entries: ps.filter((row) => row.status !== "Mapeado"),
      subtitle: "Processos pendentes",
      icon: Network,
      tone: "attention",
    },
    {
      title: "Mapeamentos",
      value: maps.length.toString(),
      entries: maps,
      subtitle: "Inclui rascunhos",
      icon: Workflow,
    },
    {
      title: "Melhorias abertas",
      value: openImprovements.length.toString(),
      entries: openImprovements,
      subtitle: `De ${imps.length} registradas`,
      icon: Lightbulb,
      tone: "attention",
    },
    {
      title: "Documentos",
      value: docs.length.toString(),
      entries: docs,
      subtitle: "POP e fluxogramas",
      icon: FileText,
    },
  ];
  const changeCoverageSort = (key: "name" | "pending" | "coverage") => {
    setCoverageSort((current) => ({
      key,
      descending: current.key === key ? !current.descending : key === "pending",
    }));
  };
  return (
    <div className="operational-dashboard" aria-busy={loading}>
      <div className="op-heading">
        <div>
          <span className="op-eyebrow">Painel de processos</span>
          <h1>Visão operacional</h1>
          <p>Processos, mapeamentos, documentos e oportunidades de melhoria da organização.</p>
        </div>
        <span className="op-scope">
          <Building2 size={14} />
          {organizationName}
        </span>
      </div>
      <div className="op-filters">
        <details>
          <summary>
            Área analisada <span>{area || "Todas as áreas"}</span>
          </summary>
          <div>
            <label>
              Área
              <select aria-label="Área" value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="">Todas as áreas</option>
                {areas.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </select>
            </label>
            <button type="button" onClick={() => setArea("")}>
              Limpar seleção
            </button>
          </div>
        </details>
        <button
          type="button"
          className="op-link"
          onClick={() =>
            setDetail({ title: "Critérios dos indicadores", rows: [], criteria: true })
          }
        >
          Como os indicadores são calculados <Info size={13} />
        </button>
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={onRetry}>
            Tentar novamente
          </button>
        </div>
      ) : loading ? (
        <p role="status">Carregando indicadores da organização…</p>
      ) : (
        <>
          <div className="op-metrics op-metrics--data">
            {metricCards.map(({ title, value, entries, subtitle, icon: Icon, tone }) => (
              <button
                type="button"
                className={`op-metric--${tone || "default"}`}
                key={title}
                onClick={() => show(title, entries)}
                aria-label={`${title}: ${value}. ${subtitle}. Ver registros`}
              >
                <span className="op-metric-icon">
                  <Icon size={17} />
                </span>
                <span className="op-metric-copy">
                  <span>{title}</span>
                  <small>{subtitle}</small>
                </span>
                <strong>{value}</strong>
                <ArrowRight className="op-metric-arrow" size={15} />
              </button>
            ))}
          </div>
          <div className="op-dashboard-grid op-dashboard-grid--data">
            {panel(
              "Cobertura por área",
              "Compare volume pendente e percentual mapeado.",
              <div className="op-data-content">
                <div className="op-coverage-toolbar">
                  <span>
                    <b>
                      {covered} / {ps.length}
                    </b>{" "}
                    mapeados no total
                  </span>
                  <div
                    className="op-segmented"
                    role="group"
                    aria-label="Filtrar áreas por pendência"
                  >
                    <button
                      type="button"
                      aria-pressed={!coverageOnlyPending}
                      onClick={() => setCoverageOnlyPending(false)}
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      aria-pressed={coverageOnlyPending}
                      onClick={() => setCoverageOnlyPending(true)}
                    >
                      Com pendência
                    </button>
                  </div>
                </div>
                <div className="op-coverage-table-wrap">
                  <table className="op-coverage-table">
                    <thead>
                      <tr>
                        <th
                          scope="col"
                          aria-sort={
                            coverageSort.key === "name"
                              ? coverageSort.descending
                                ? "descending"
                                : "ascending"
                              : "none"
                          }
                        >
                          <button type="button" onClick={() => changeCoverageSort("name")}>
                            Área
                          </button>
                        </th>
                        <th scope="col">Total</th>
                        <th scope="col">Mapeados</th>
                        <th
                          scope="col"
                          aria-sort={
                            coverageSort.key === "pending"
                              ? coverageSort.descending
                                ? "descending"
                                : "ascending"
                              : "none"
                          }
                        >
                          <button type="button" onClick={() => changeCoverageSort("pending")}>
                            Pendentes
                          </button>
                        </th>
                        <th
                          scope="col"
                          aria-sort={
                            coverageSort.key === "coverage"
                              ? coverageSort.descending
                                ? "descending"
                                : "ascending"
                              : "none"
                          }
                        >
                          <button type="button" onClick={() => changeCoverageSort("coverage")}>
                            Cobertura
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {coverageRows.map((row) => (
                        <tr key={row.name}>
                          <td>
                            <button
                              type="button"
                              className="op-table-link"
                              onClick={() => show(`Processos · ${row.name}`, row.rows)}
                            >
                              {row.name}
                            </button>
                          </td>
                          <td>{row.total}</td>
                          <td>{row.mapped}</td>
                          <td>
                            <button
                              type="button"
                              className="op-table-link"
                              onClick={() =>
                                show(
                                  `Sem mapeamento · ${row.name}`,
                                  row.rows.filter((entry) => entry.status !== "Mapeado"),
                                )
                              }
                            >
                              {row.pending}
                            </button>
                          </td>
                          <td>
                            <span className="op-mini-track" aria-hidden="true">
                              <i style={{ width: `${row.coverage}%` }} />
                            </span>
                            {row.coverage}%
                          </td>
                        </tr>
                      ))}
                      {!coverageRows.length && (
                        <tr>
                          <td colSpan={5} className="op-table-empty">
                            {coverageOnlyPending
                              ? "Nenhuma área com pendência neste recorte."
                              : "Nenhuma área com processos neste recorte."}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>,
              <>
                <span className="op-caption">Rascunhos fora da cobertura</span>
                {link("Ver processos sem mapa", () =>
                  show(
                    "Processos sem mapeamento",
                    ps.filter((entry) => entry.status !== "Mapeado"),
                  ),
                )}
              </>,
              undefined,
              "op-panel--coverage op-panel--data",
            )}
            {panel(
              "Situação das melhorias",
              `Distribuição das ${imps.length} oportunidades registradas.`,
              imps.length ? (
                <div className="op-data-content">
                  <div
                    className="op-status-track"
                    role="group"
                    aria-label={`Melhorias por ${group === "status" ? "situação" : group === "priority" ? "prioridade" : "origem"}`}
                  >
                    {impGroups.map(([label, rows], index) => (
                      <button
                        key={label}
                        type="button"
                        style={{
                          width: `${(rows.length / imps.length) * 100}%`,
                          background: colorFor(label, index),
                        }}
                        aria-label={`${label}: ${rows.length}. Ver registros`}
                        onClick={() => show(`Melhorias · ${label}`, rows)}
                      />
                    ))}
                  </div>
                  <div className="op-data-status-list">
                    {impGroups.map(([label, rows], index) => (
                      <button
                        type="button"
                        key={label}
                        onClick={() => show(`Melhorias · ${label}`, rows)}
                      >
                        <span>
                          <i style={{ background: colorFor(label, index) }} />
                          {label}
                        </span>
                        <b>
                          {rows.length}
                          <small>{Math.round((rows.length / imps.length) * 100)}%</small>
                        </b>
                      </button>
                    ))}
                  </div>
                  <div className="op-data-ratio">
                    <span>
                      <b>Índice de encerramento</b>
                      <small>
                        {closedImprovements.length} de {imps.length} oportunidades
                      </small>
                    </span>
                    <strong>{Math.round((closedImprovements.length / imps.length) * 100)}%</strong>
                  </div>
                </div>
              ) : (
                blank
              ),
              <>
                <span className="op-caption">
                  {openImprovements.length} oportunidades em aberto
                </span>
                {link("Consultar melhorias", () => show("Melhorias", imps))}
              </>,
              <select
                aria-label="Agrupar melhorias por"
                value={group}
                onChange={(event) => setGroup(event.target.value as typeof group)}
              >
                <option value="status">Situação</option>
                <option value="priority">Prioridade</option>
                <option value="source">Origem</option>
              </select>,
              "op-panel--improvements op-panel--data",
            )}
            {panel(
              "Situação dos mapeamentos",
              `Estágio dos ${maps.length} registros existentes.`,
              maps.length ? (
                <div className="op-data-content">
                  <div
                    className="op-status-track"
                    role="group"
                    aria-label="Mapeamentos por situação"
                  >
                    {stats.map(([label, rows], index) => (
                      <button
                        key={label}
                        type="button"
                        style={{
                          width: `${(rows.length / maps.length) * 100}%`,
                          background: colorFor(label, index),
                        }}
                        aria-label={`${label}: ${rows.length}. Ver registros`}
                        onClick={() => show(`Mapeamentos · ${label}`, rows)}
                      />
                    ))}
                  </div>
                  <div className="op-data-status-list">
                    {stats.map(([label, rows], index) => (
                      <button
                        type="button"
                        key={label}
                        onClick={() => show(`Mapeamentos · ${label}`, rows)}
                      >
                        <span>
                          <i style={{ background: colorFor(label, index) }} />
                          {label}
                        </span>
                        <b>
                          {rows.length}
                          <small>{Math.round((rows.length / maps.length) * 100)}%</small>
                        </b>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                blank
              ),
              <>
                <span className="op-caption">Inclui rascunhos</span>
                {link("Consultar mapeamentos", () => show("Mapeamentos", maps))}
              </>,
              undefined,
              "op-panel--mappings op-panel--data",
            )}
            {panel(
              "Registros por área",
              "Mapeamentos e melhorias, agrupados pelo volume.",
              distributionRows.length ? (
                <div className="op-data-content op-data-distribution">
                  {distributionRows.map(([name, rows]) => {
                    const mapRows = rows.filter((row) => row.kind === "ddp");
                    const improvementRows = rows.filter((row) => row.kind === "improvement");
                    return (
                      <div className="op-distribution-row" key={name}>
                        <div>
                          <button
                            type="button"
                            className="op-table-link"
                            onClick={() => show(`Registros · ${name}`, rows)}
                          >
                            {name}
                          </button>
                          <strong>{rows.length}</strong>
                        </div>
                        <div className="op-distribution-track">
                          <div style={{ width: `${(rows.length / maxAreaRecords) * 100}%` }}>
                            {!!mapRows.length && (
                              <button
                                type="button"
                                style={{
                                  width: `${(mapRows.length / rows.length) * 100}%`,
                                  background: "var(--chart-blue)",
                                }}
                                aria-label={`${name}, mapeamentos: ${mapRows.length}`}
                                onClick={() => show(`Mapeamentos · ${name}`, mapRows)}
                              />
                            )}
                            {!!improvementRows.length && (
                              <button
                                type="button"
                                style={{
                                  width: `${(improvementRows.length / rows.length) * 100}%`,
                                  background: "var(--chart-amber)",
                                }}
                                aria-label={`${name}, melhorias: ${improvementRows.length}`}
                                onClick={() => show(`Melhorias · ${name}`, improvementRows)}
                              />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                blank
              ),
              <>
                <div className="op-legend">
                  <span>
                    <i style={{ background: "var(--chart-blue)" }} />
                    Mapeamentos
                  </span>
                  <span>
                    <i style={{ background: "var(--chart-amber)" }} />
                    Melhorias
                  </span>
                </div>
                {link("Ver todos os registros", () =>
                  show("Mapeamentos e melhorias", [...maps, ...imps]),
                )}
              </>,
              undefined,
              "op-panel--areas op-panel--data",
            )}
            {panel(
              "Classificação de área",
              "Registros sem área informada.",
              <div className="op-data-content">
                <div className="op-data-pair">
                  <button
                    type="button"
                    onClick={() => show("Mapeamentos sem área", unclassifiedMappings)}
                  >
                    <small>Mapeamentos sem área</small>
                    <strong>
                      {unclassifiedMappings.length}
                      <span> de {maps.length}</span>
                    </strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => show("Melhorias sem área", unclassifiedImprovements)}
                  >
                    <small>Melhorias sem área</small>
                    <strong>
                      {unclassifiedImprovements.length}
                      <span> de {imps.length}</span>
                    </strong>
                  </button>
                </div>
                <div className="op-data-ratio">
                  <span>
                    <b>Registros sem área</b>
                    <small>
                      {unclassifiedMappings.length + unclassifiedImprovements.length} de{" "}
                      {maps.length + imps.length}
                    </small>
                  </span>
                  <strong>
                    {maps.length + imps.length
                      ? Math.round(
                          ((unclassifiedMappings.length + unclassifiedImprovements.length) /
                            (maps.length + imps.length)) *
                            100,
                        )
                      : 0}
                    %
                  </strong>
                </div>
              </div>,
              <span className="op-caption">
                Área não informada não comprova ausência de responsável.
              </span>,
              undefined,
              "op-panel--classification op-panel--data",
            )}
            {panel(
              "Acervo documental",
              "Documentos cadastrados por tipo.",
              docTypes.length ? (
                <div className="op-data-content op-data-pair">
                  {docTypes.map(([type, rows]) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => show(`Documentos · ${type}`, rows)}
                    >
                      <strong>{rows.length}</strong>
                      <small>{type}</small>
                    </button>
                  ))}
                </div>
              ) : (
                blank
              ),
              <>
                <span className="op-caption">Mapeamentos contabilizados à parte</span>
                {link("Consultar documentos", () => show("Documentos", docs))}
              </>,
              undefined,
              "op-panel--documents op-panel--data",
            )}
          </div>
        </>
      )}
      <span className="op-caption">
        Situação atual dos cadastros · selecione os gráficos para consultar os registros.
      </span>
      <dialog
        ref={dialog}
        className="op-dialog"
        aria-labelledby="op-detail-title"
        onClose={() => setDetail(null)}
      >
        <div className="op-panel-head">
          <h2 id="op-detail-title">{detail?.title}</h2>
          <button
            type="button"
            aria-label="Fechar detalhes"
            onClick={() => dialog.current?.close()}
          >
            <X size={18} />
          </button>
        </div>
        {detail?.criteria ? (
          <div className="op-criteria">
            <p>
              Cobertura: registros da estrutura de processos relacionados a pelo menos um mapeamento
              salvo. Cada processo conta uma vez, mesmo que tenha vários mapeamentos. Rascunhos não
              entram na cobertura.
            </p>
            <p>
              Mapeamentos: registros do módulo, incluindo rascunhos, agrupados pela situação
              informada.
            </p>
            <p>
              Documentos: documentação e fluxogramas. Mapeamentos ficam em seu próprio indicador,
              sem dupla contagem entre esses blocos.
            </p>
            <p>
              Melhorias: oportunidades avulsas e originadas de mapeamentos. Registros compartilhados
              são contados uma única vez.
            </p>
            <p>
              O filtro de área utiliza o vínculo do registro ou de seu processo. Registros sem
              vínculo aparecem em “Sem área”. Áreas inclui os cadastros mesmo sem processos.
            </p>
          </div>
        ) : (
          <>
            <p>
              {detail?.rows.length ?? 0} registros · {area || "Todas as áreas"}
            </p>
            <div className="op-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Registro</th>
                    <th>Área</th>
                    <th>Situação</th>
                    <th>
                      <span className="sr-only">Abrir registro</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {detail?.rows.slice(page * 8, page * 8 + 8).map((r, i) => (
                    <tr key={`${r.kind}:${r.id}:${i}`}>
                      <td>{r.code && r.code !== "-" ? r.code : "—"}</td>
                      <td>{r.title}</td>
                      <td>{r.area}</td>
                      <td>{r.status}</td>
                      <td>
                        <button
                          type="button"
                          aria-label={`Consultar ${r.title}`}
                          onClick={() => open(r)}
                        >
                          <ArrowRight size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!detail?.rows.length && blank}
            </div>
            <div className="op-pagination">
              <span>
                {detail?.rows.length
                  ? `${page * 8 + 1}–${Math.min((page + 1) * 8, detail.rows.length)} de ${detail.rows.length}`
                  : "0 registros"}
              </span>
              <div>
                <button type="button" disabled={!page} onClick={() => setPage((p) => p - 1)}>
                  Anterior
                </button>
                <button
                  type="button"
                  disabled={(page + 1) * 8 >= (detail?.rows.length ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </button>
              </div>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
