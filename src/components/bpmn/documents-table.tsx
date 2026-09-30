import { useEffect, useId, useRef, useState } from "react";
import { Ellipsis, Eye, Pencil, Trash2 } from "lucide-react";
import { TaskDialog } from "@/components/task-dialog";

type DrawingRow = {
  id: string;
  code: string;
  title: string;
  current_version: number;
  updated_at: string;
  area: string | null;
  created_at: string;
};

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
}: {
  rows: DrawingRow[];
  onOpen: (id: string) => void;
  onView?: (id: string) => void;
  onDelete?: (ids: string[]) => Promise<void>;
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
      <div className="bf-bpmn-table-wrap" role="region" aria-label="Desenhos BPMN" tabIndex={0}>
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
              {["Código", "Título", "Versão", "Atualizado em", "Área", "Data criação"].map(
                (label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ),
              )}
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
