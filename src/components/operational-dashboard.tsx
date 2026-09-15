import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Info, X } from "lucide-react";
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
  "var(--op-green)",
  "var(--op-blue)",
  "var(--gold)",
  "var(--op-purple)",
  "var(--op-red)",
  "var(--muted-foreground)",
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
function groups(rows: Entry[], key: "status" | "type" | "priority" | "source") {
  const result = new Map<string, Entry[]>();
  rows.forEach((row) => {
    const name = row[key] || "Não informada";
    result.set(name, [...(result.get(name) || []), row]);
  });
  return [...result].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], "pt-BR"));
}
const colorFor = (s: string, i: number) =>
  ({
    Rascunho: "var(--muted-foreground)",
    "Em andamento": "var(--gold)",
    "Em revisão": "var(--op-blue)",
    Aprovado: "var(--op-green)",
    Concluído: "#428d98",
    "Não iniciada": "var(--gold)",
    Encerrada: "var(--op-green)",
    Cancelada: "var(--op-red)",
    Alta: "var(--op-red)",
    Média: "var(--gold)",
    Baixa: "var(--op-blue)",
  })[s] || colors[i % colors.length];

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
  const displayedAreas = area ? [area] : areas;
  const stats = groups(maps, "status"),
    docTypes = groups(docs, "type"),
    impGroups = groups(imps, group);
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
  ) {
    return (
      <section className="op-panel">
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
  let offset = 0;
  return (
    <div className="operational-dashboard" aria-busy={loading}>
      <div className="op-heading">
        <div>
          <h1>Visão operacional</h1>
          <p>Processos, mapeamentos, documentos e oportunidades de melhoria da organização.</p>
        </div>
        <span className="op-scope">{organizationName}</span>
      </div>
      <div className="op-filters">
        <details>
          <summary>
            Filtros <span>{area || "Todas as áreas"}</span>
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
              Limpar filtros
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
          <div className="op-metrics">
            {[
              ["Áreas", areaRecords, "Cadastros da organização"],
              ["Processos", ps, "Estrutura cadastrada"],
              ["Mapeamentos", maps, "Inclui rascunhos"],
              ["Documentos", docs, "Documentação e fluxogramas"],
              ["Melhorias", imps, "Oportunidades registradas"],
            ].map(([title, entries, sub]) => (
              <button
                type="button"
                key={title as string}
                onClick={() => show(title as string, entries as Entry[])}
              >
                <span>{title as string}</span>
                <strong>{(entries as Entry[]).length}</strong>
                <small>{sub as string}</small>
              </button>
            ))}
          </div>
          <div className="op-upper">
            {panel(
              "Cobertura de mapeamentos",
              "Processos com pelo menos um mapeamento salvo.",
              <div className="op-coverage">
                <div>
                  <strong>
                    {ps.length ? Math.round((covered / ps.length) * 100) : 0}
                    <small>%</small>
                  </strong>
                  <p>
                    <b>
                      {covered} de {ps.length}
                    </b>{" "}
                    processos mapeados
                    <br />
                    {ps.length - covered} sem mapeamento
                  </p>
                </div>
                <div className="op-area-scroll">
                  {displayedAreas.length
                    ? displayedAreas.map((a) => {
                        const subset = ps.filter((p) => p.area === a),
                          count = subset.filter((p) => p.status === "Mapeado").length;
                        return (
                          <button
                            type="button"
                            className="op-bar-row"
                            key={a}
                            onClick={() => show(`Cobertura · ${a}`, subset)}
                          >
                            <span title={a}>{a}</span>
                            <span className="op-track">
                              <i
                                style={{
                                  width: `${subset.length ? (count / subset.length) * 100 : 0}%`,
                                }}
                              />
                            </span>
                            <b>
                              {count}/{subset.length}
                            </b>
                          </button>
                        );
                      })
                    : blank}
                </div>
              </div>,
              <>
                <span className="op-caption">Processos distintos · rascunhos excluídos</span>
                {link("Ver lacunas", () =>
                  show(
                    "Processos sem mapeamento",
                    ps.filter((p) => p.status !== "Mapeado"),
                  ),
                )}
              </>,
            )}
            {panel(
              "Registros por área",
              "Distribuição dos registros nos três módulos.",
              <div className="op-compare">
                {displayedAreas.length
                  ? displayedAreas.map((a) => (
                      <div className="op-compare-row" key={a}>
                        <span title={a}>{a}</span>
                        <div>
                          {[maps, docs, imps].map((rows, i) => {
                            const subset = rows.filter((r) => r.area === a),
                              max = Math.max(
                                1,
                                ...displayedAreas.flatMap((name) =>
                                  [maps, docs, imps].map(
                                    (list) => list.filter((r) => r.area === name).length,
                                  ),
                                ),
                              );
                            return (
                              <button
                                type="button"
                                key={i}
                                aria-label={`${a}, ${["Mapeamentos", "Documentos", "Melhorias"][i]}: ${subset.length}`}
                                onClick={() =>
                                  show(
                                    `${["Mapeamentos", "Documentos", "Melhorias"][i]} · ${a}`,
                                    subset,
                                  )
                                }
                              >
                                <span>
                                  <i
                                    style={{
                                      width: `${(subset.length / max) * 100}%`,
                                      background: colors[i],
                                    }}
                                  />
                                </span>
                                <b>{subset.length}</b>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))
                  : blank}
              </div>,
              <>
                <div className="op-legend">
                  {["Mapeamentos", "Documentos", "Melhorias"].map((s, i) => (
                    <span key={s}>
                      <i style={{ background: colors[i] }} />
                      {s}
                    </span>
                  ))}
                </div>
                {link("Detalhar", () => show("Registros por área", filter(all)))}
              </>,
            )}
          </div>
          <div className="op-lower">
            {panel(
              "Mapeamentos",
              "Situação dos registros do módulo.",
              maps.length ? (
                <div className="op-donut-layout">
                  <svg viewBox="0 0 160 160" role="img" aria-label="Mapeamentos por situação">
                    <title>{stats.map(([s, r]) => `${s}: ${r.length}`).join("; ")}</title>
                    {stats.map(([s, rows], i) => {
                      const len = (rows.length / maps.length) * 364.425,
                        start = offset;
                      offset += len;
                      return (
                        <circle
                          key={s}
                          cx="80"
                          cy="80"
                          r="58"
                          fill="none"
                          stroke={colorFor(s, i)}
                          strokeWidth="18"
                          strokeDasharray={`${len} ${364.425 - len}`}
                          strokeDashoffset={-start}
                          transform="rotate(-90 80 80)"
                        />
                      );
                    })}
                    <text x="80" y="82" textAnchor="middle" className="op-donut-total">
                      {maps.length}
                    </text>
                    <text x="80" y="102" textAnchor="middle" className="op-donut-label">
                      registros
                    </text>
                  </svg>
                  <div className="op-status-list">
                    {stats.map(([s, rows], i) => (
                      <button
                        type="button"
                        key={s}
                        onClick={() => show(`Mapeamentos · ${s}`, rows)}
                      >
                        <i style={{ background: colorFor(s, i) }} />
                        <span>{s}</span>
                        <b>{rows.length}</b>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                blank
              ),
              <>
                <span className="op-caption">Inclui rascunhos</span>
                {link("Consultar", () => show("Mapeamentos", maps))}
              </>,
            )}
            {panel(
              "Documentos",
              "Registros por tipo de documento.",
              docs.length ? (
                <div className="op-columns">
                  {docTypes.map(([type, rows]) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => show(`Documentos · ${type}`, rows)}
                    >
                      <b>{rows.length}</b>
                      <i
                        style={{
                          height: `${(rows.length / Math.max(...docTypes.map(([, r]) => r.length))) * 65}%`,
                        }}
                      />
                      <span>{type}</span>
                    </button>
                  ))}
                </div>
              ) : (
                blank
              ),
              <>
                <span className="op-caption">Mapeamentos contabilizados à parte</span>
                {link("Consultar", () => show("Documentos", docs))}
              </>,
            )}
            {panel(
              "Melhorias",
              "Oportunidades registradas no módulo.",
              imps.length ? (
                <div className="op-improvements">
                  {impGroups.map(([s, rows], i) => (
                    <button
                      type="button"
                      className="op-bar-row"
                      key={s}
                      onClick={() => show(`Melhorias · ${s}`, rows)}
                    >
                      <span title={s}>{s}</span>
                      <span className="op-track">
                        <i
                          style={{
                            width: `${(rows.length / Math.max(...impGroups.map(([, r]) => r.length))) * 100}%`,
                            background: colorFor(s, i),
                          }}
                        />
                      </span>
                      <b>{rows.length}</b>
                    </button>
                  ))}
                </div>
              ) : (
                blank
              ),
              <>
                <span className="op-caption">
                  {
                    imps.filter((r) => !["Encerrada", "Cancelada", "Concluído"].includes(r.status))
                      .length
                  }{" "}
                  oportunidades em aberto
                </span>
                {link("Consultar", () => show("Melhorias", imps))}
              </>,
              <select
                aria-label="Agrupar melhorias por"
                value={group}
                onChange={(e) => setGroup(e.target.value as typeof group)}
              >
                <option value="status">Situação</option>
                <option value="priority">Prioridade</option>
                <option value="source">Origem</option>
              </select>,
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
