import { useEffect, useId, useRef, useState } from "react";
import { CalendarDays, FileText } from "lucide-react";
import { readBpmnDocument } from "@/lib/bpmn-document";
import { ArrowDown, ArrowDownUp, ArrowUp, Ellipsis, Eye, Pencil, Trash2 } from "lucide-react";
import { TaskDialog } from "@/components/task-dialog";
import type {
  BpmnLibraryRow,
  BpmnLibrarySortDirection,
  BpmnLibrarySortField,
} from "@/lib/bpmn-library";

type DrawingRow = BpmnLibraryRow;

const drawingColumns: Array<{ field: BpmnLibrarySortField; label: string }> = [
  { field: "code", label: "Código" },
  { field: "title", label: "Título" },
  { field: "current_version", label: "Versão" },
  { field: "updated_at", label: "Atualizado em" },
  { field: "area", label: "Área" },
  { field: "created_at", label: "Data criação" },
];

function DrawingSortGlyph({
  active,
  direction,
}: {
  active: boolean;
  direction: BpmnLibrarySortDirection;
}) {
  if (!active) return <ArrowDownUp size={13} aria-hidden="true" />;
  return direction === "asc" ? (
    <ArrowUp size={13} aria-hidden="true" />
  ) : (
    <ArrowDown size={13} aria-hidden="true" />
  );
}

function DrawingActions({
  row,
  onView,
  onEdit,
  onDelete,
}: {
  row: DrawingRow;
  onView: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [open, setOpen] = useState(false);
  const run = (action: () => void) => {
    panel.current?.hidePopover();
    action();
  };
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        aria-label={`Ações do desenho: ${row.title}`}
        title="Ações do desenho"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const height = onDelete ? 144 : 56;
          setPosition({
            left: Math.max(8, Math.min(rect.right - 240, window.innerWidth - 248)),
            top:
              rect.bottom + height + 8 <= window.innerHeight
                ? rect.bottom + 6
                : Math.max(8, rect.top - height - 6),
          });
        }}
      >
        <Ellipsis size={17} aria-hidden="true" />
      </button>
      <div
        ref={panel}
        id={id}
        popover="auto"
        className="bf-bpmn-row-menu"
        style={position}
        aria-label={`Ações de ${row.title}`}
        onToggle={(event) => setOpen(event.newState === "open")}
      >
        <button type="button" onClick={() => run(onView)}>
          <Eye size={17} />
          Visualizar
        </button>
        {onEdit && (
          <button type="button" onClick={() => run(onEdit)}>
            <Pencil size={17} />
            Editar
          </button>
        )}
        {onDelete && (
          <button type="button" className="bf-bpmn-row-delete" onClick={() => run(onDelete)}>
            <Trash2 size={17} />
            Excluir
          </button>
        )}
      </div>
    </>
  );
}

export function BpmnDocumentsTable({
  rows,
  onOpen,
  onView = onOpen,
  onDelete,
  sortField,
  sortDirection,
  onSort,
}: {
  rows: DrawingRow[];
  onOpen: (id: string) => void;
  onView?: (id: string) => void;
  onDelete?: (ids: string[]) => Promise<void>;
  sortField: BpmnLibrarySortField;
  sortDirection: BpmnLibrarySortDirection;
  onSort: (field: BpmnLibrarySortField) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<DrawingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const deleting = useRef(false);
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => {
    setSelected((current) => current.filter((id) => rows.some((row) => row.id === id)));
    setPending((current) => current.filter((item) => rows.some((row) => row.id === item.id)));
  }, [rows]);
  useEffect(() => {
    if (selectAll.current)
      selectAll.current.indeterminate = selected.length > 0 && selected.length < rows.length;
  }, [selected, rows.length]);
  const requestDelete = (targets: DrawingRow[]) => {
    setError("");
    setPending(targets);
  };
  async function confirmDelete() {
    if (!onDelete || deleting.current) return;
    deleting.current = true;
    setBusy(true);
    setError("");
    try {
      await onDelete(pending.map((row) => row.id));
      setSelected([]);
      setPending([]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir os desenhos. Tente novamente.",
      );
    } finally {
      deleting.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {onDelete && selected.length > 0 && (
        <div className="bf-bpmn-delete-toolbar">
          <span>{selected.length} selecionado(s) nesta página</span>
          <button
            type="button"
            className="bf-bpmn-delete"
            onClick={() => requestDelete(rows.filter((row) => selected.includes(row.id)))}
          >
            <Trash2 size={16} aria-hidden="true" /> Excluir selecionados ({selected.length})
          </button>
        </div>
      )}
      <div
        className="bf-bpmn-table-wrap process-library-table"
        role="region"
        aria-label="Desenhos BPMN"
        tabIndex={0}
      >
        <table className="bf-bpmn-documents-table">
          <thead>
            <tr>
              {onDelete && (
                <th scope="col">
                  <input
                    ref={selectAll}
                    type="checkbox"
                    aria-label="Selecionar desenhos desta página"
                    checked={rows.length > 0 && selected.length === rows.length}
                    onChange={(event) =>
                      setSelected(event.target.checked ? rows.map((row) => row.id) : [])
                    }
                  />
                </th>
              )}
              {drawingColumns.map(({ field, label }) => (
                <th
                  key={field}
                  scope="col"
                  aria-sort={
                    sortField === field
                      ? sortDirection === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    type="button"
                    className="process-library-sort"
                    onClick={() => onSort(field)}
                    aria-label={`Ordenar por ${label}`}
                  >
                    {label}
                    <DrawingSortGlyph active={sortField === field} direction={sortDirection} />
                  </button>
                </th>
              ))}
              <th scope="col">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {onDelete && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${row.title}`}
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected((current) =>
                          event.target.checked
                            ? [...current, row.id]
                            : current.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </td>
                )}
                <td className="bf-bpmn-document-code">{row.code || "—"}</td>
                <td className="bf-bpmn-title-cell">
                  <button
                    className="bf-bpmn-document-title"
                    onClick={() => onOpen(row.id)}
                    aria-label={`Abrir desenho: ${row.title}`}
                  >
                    {row.title}
                  </button>
                </td>
                <td className="bf-bpmn-nowrap">{row.current_version || "Rascunho"}</td>
                <td className="bf-bpmn-nowrap">
                  <time dateTime={row.updated_at}>
                    {new Date(row.updated_at).toLocaleString("pt-BR")}
                  </time>
                </td>
                <td className="bf-bpmn-area-cell">{row.area || "Não informada"}</td>
                <td className="bf-bpmn-nowrap">
                  <time dateTime={row.created_at}>
                    {new Date(row.created_at).toLocaleDateString("pt-BR")}
                  </time>
                </td>
                <td>
                  <DrawingActions
                    row={row}
                    onView={() => onView(row.id)}
                    onEdit={onDelete ? () => onOpen(row.id) : undefined}
                    onDelete={onDelete ? () => requestDelete([row]) : undefined}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pending.length > 0 && (
        <TaskDialog
          title={pending.length === 1 ? "Excluir desenho" : "Excluir desenhos selecionados"}
          busy={busy}
          onClose={() => {
            if (!busy) setPending([]);
          }}
        >
          <div className="bf-bpmn-form">
            <p>
              {pending.length === 1
                ? `Excluir “${pending[0].title}”?`
                : `Excluir os ${pending.length} desenhos selecionados?`}{" "}
              Esta ação não pode ser desfeita.
            </p>
            {pending.length > 1 && (
              <ul>
                {pending.map((row) => (
                  <li key={row.id}>
                    {row.code ? `${row.code} · ` : ""}
                    {row.title}
                  </li>
                ))}
              </ul>
            )}
            {error && <p role="alert">{error}</p>}
          </div>
          <footer>
            <button type="button" disabled={busy} onClick={() => setPending([])}>
              Cancelar
            </button>
            <button
              type="button"
              className="bf-bpmn-delete"
              disabled={busy}
              onClick={() => void confirmDelete()}
            >
              {busy ? "Excluindo…" : "Excluir"}
            </button>
          </footer>
        </TaskDialog>
      )}
    </>
  );
}

function BpmnMiniature({ xml, title, loading }: { xml: string | null; title: string; loading: boolean }) {
  const [diagram, setDiagram] = useState<{
    viewBox: string;
    shapes: Array<{ id: string; x: number; y: number; width: number; height: number; kind: string; label: string }>;
    edges: Array<{ id: string; points: Array<{ x: number; y: number }> }>;
  } | null>(null);

  useEffect(() => {
    if (!xml || typeof DOMParser === "undefined") { setDiagram(null); return; }
    try {
      const document = new DOMParser().parseFromString(readBpmnDocument(xml).xml, "application/xml");
      if (document.querySelector("parsererror")) { setDiagram(null); return; }
      const byId = new Map(Array.from(document.querySelectorAll("[id]")).map((node) => [node.getAttribute("id") || "", node]));
      const shapes = Array.from(document.getElementsByTagNameNS("*", "BPMNShape")).flatMap((shape, index) => {
        const bounds = shape.getElementsByTagNameNS("*", "Bounds")[0];
        const target = byId.get(shape.getAttribute("bpmnElement") || "");
        if (!bounds || !target) return [];
        const x = Number(bounds.getAttribute("x")); const y = Number(bounds.getAttribute("y"));
        const width = Number(bounds.getAttribute("width")); const height = Number(bounds.getAttribute("height"));
        if (![x, y, width, height].every(Number.isFinite)) return [];
        return [{ id: shape.getAttribute("id") || String(index), x, y, width, height, kind: target.localName, label: target.getAttribute("name") || "" }];
      });
      const edges = Array.from(document.getElementsByTagNameNS("*", "BPMNEdge")).flatMap((edge, index) => {
        const points = Array.from(edge.getElementsByTagNameNS("*", "waypoint")).map((point) => ({ x: Number(point.getAttribute("x")), y: Number(point.getAttribute("y")) })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
        return points.length > 1 ? [{ id: edge.getAttribute("id") || String(index), points }] : [];
      });
      const bounds = shapes.map((shape) => ({ x: shape.x, y: shape.y, right: shape.x + shape.width, bottom: shape.y + shape.height }));
      edges.forEach((edge) => edge.points.forEach((point) => bounds.push({ x: point.x, y: point.y, right: point.x, bottom: point.y })));
      if (!bounds.length) { setDiagram(null); return; }
      const minX = Math.min(...bounds.map((item) => item.x)); const minY = Math.min(...bounds.map((item) => item.y));
      const maxX = Math.max(...bounds.map((item) => item.right)); const maxY = Math.max(...bounds.map((item) => item.bottom));
      setDiagram({ viewBox: `${minX - 12} ${minY - 12} ${Math.max(1, maxX - minX + 24)} ${Math.max(1, maxY - minY + 24)}`, shapes, edges });
    } catch { setDiagram(null); }
  }, [xml]);

  return (
    <div className="bf-bpmn-miniature" aria-label={`Miniatura do fluxograma ${title}`}>
      {diagram ? (
        <svg viewBox={diagram.viewBox} role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
          {diagram.edges.map((edge) => <polyline key={edge.id} points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")} />)}
          {diagram.shapes.map((shape) => {
            const event = /Event$/.test(shape.kind);
            const gateway = /Gateway$/.test(shape.kind);
            const pool = /Participant|Lane/.test(shape.kind);
            return <g key={shape.id}>
              {event ? <ellipse cx={shape.x + shape.width / 2} cy={shape.y + shape.height / 2} rx={shape.width / 2} ry={shape.height / 2} /> : gateway ? <polygon points={`${shape.x + shape.width / 2},${shape.y} ${shape.x + shape.width},${shape.y + shape.height / 2} ${shape.x + shape.width / 2},${shape.y + shape.height} ${shape.x},${shape.y + shape.height / 2}`} /> : <rect x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={pool ? 1 : 5} className={pool ? "bf-bpmn-mini-pool" : ""} />}
              {!pool && shape.label && <text x={shape.x + shape.width / 2} y={shape.y + shape.height / 2} textAnchor="middle" dominantBaseline="middle">{shape.label.slice(0, 24)}</text>}
            </g>;
          })}
        </svg>
      ) : (
        <div className="bf-bpmn-miniature-empty"><FileText size={22} aria-hidden="true" /><span>{loading ? "Carregando desenho…" : "Miniatura indisponível"}</span></div>
      )}
    </div>
  );
}

export function BpmnDocumentsGallery({
  rows, loadPreview, onOpen, onView,
}: {
  rows: DrawingRow[];
  loadPreview: (id: string) => Promise<string | null>;
  onOpen: (id: string) => void;
  onView: (id: string) => void;
}) {
  return (
    <div className="bf-bpmn-gallery" role="region" aria-label="Desenhos BPMN em miniaturas">
      {rows.map((row) => <BpmnGalleryCard key={row.id} row={row} loadPreview={loadPreview} onOpen={onOpen} onView={onView} />)}
    </div>
  );
}

function BpmnGalleryCard({
  row, loadPreview, onOpen, onView,
}: {
  row: DrawingRow;
  loadPreview: (id: string) => Promise<string | null>;
  onOpen: (id: string) => void;
  onView: (id: string) => void;
}) {
  const [xml, setXml] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    void loadPreview(row.id).then((content) => { if (active) { setXml(content); setLoaded(true); } }).catch(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, [loadPreview, row.id]);
  return (
    <article className="bf-bpmn-gallery-card">
      <button type="button" className="bf-bpmn-gallery-preview" onClick={() => onView(row.id)} aria-label={`Visualizar ${row.title}`}>
        <BpmnMiniature xml={xml} title={row.title} loading={!loaded} />
        <span className="bf-bpmn-gallery-open"><Eye size={15} aria-hidden="true" /> Visualizar</span>
      </button>
      <div className="bf-bpmn-gallery-info">
        <span className="bf-bpmn-gallery-code">{row.code || "Sem código"}</span>
        <button type="button" className="bf-bpmn-gallery-title" onClick={() => onOpen(row.id)}>{row.title}</button>
        <dl>
          <div><dt>Área</dt><dd>{row.area || "Não informada"}</dd></div>
          <div><dt><CalendarDays size={13} aria-hidden="true" /> Criado em</dt><dd><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString("pt-BR")}</time></dd></div>
        </dl>
      </div>
    </article>
  );
}
