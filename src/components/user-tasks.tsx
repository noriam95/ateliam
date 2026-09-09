import { TaskRoutingActions } from "./task-routing-actions";
import { TASK_STAGE_LABELS, type TaskAction } from "@/lib/user-tasks";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  List,
  Plus,
  Search,
  SquareKanban,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { loadUserTasks, updateUserTask } from "@/lib/user-tasks.functions";
import {
  TASK_KINDS,
  TASK_MODALITIES,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  documentTaskUrl,
  localDay,
  monthDays,
  taskDate,
  type TaskDocument,
  type TaskFeed,
  type TaskFilters,
  type TaskItem,
  type UserTask,
} from "@/lib/user-tasks";
import { TaskDialog } from "./task-dialog";
import "./user-tasks.css";
type ViewState = TaskFilters & {
  layout?: "list" | "kanban" | "calendar";
  group?: "status" | "modality";
  month?: string;
  calendarView?: "month" | "gantt";
};
function parseState(raw?: string): ViewState {
  try {
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const strings = ["q", "status", "kind", "modality", "from", "until", "id", "documentQuery"];
    const parsed: Record<string, unknown> = {};
    for (const key of strings) if (typeof value[key] === "string") parsed[key] = value[key];
    if (["list", "kanban", "calendar"].includes(value.layout)) parsed.layout = value.layout;
    if (["month", "gantt"].includes(value.calendarView)) parsed.calendarView = value.calendarView;
    if (["status", "modality"].includes(value.group)) parsed.group = value.group;
    if (typeof value.month === "string" && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value.month))
      parsed.month = value.month;
    if (Number.isInteger(value.offset) && value.offset >= 0) parsed.offset = value.offset;
    parsed.team = value.team === true;
    return parsed as ViewState;
  } catch {
    return {};
  }
}
const pending = (t: UserTask) => t.checklist.filter((i) => !i.completed);
const attention = (t: UserTask) =>
  pending(t).filter((i) => t.pending_at_transition.includes(i.label));
export function UserTasks({
  organizationId,
  overview,
  state: raw,
  onState,
}: {
  organizationId: string;
  overview: boolean;
  state?: string;
  onState: (value: string) => void;
}) {
  const state = parseState(raw);
  const [search, setSearch] = useState(state.q || "");
  const [modal, setModal] = useState<"create" | null>(null);
  const load = useServerFn(loadUserTasks);
  const month = state.month || localDay().slice(0, 7);
  const days = monthDays(month);
  const filters: TaskFilters = overview
    ? { status: "open" }
    : state.layout === "calendar"
      ? { ...state, id: undefined, from: days[0], until: days[41] }
      : { ...state, id: undefined };
  const query = useQuery({
    queryKey: ["user-tasks", organizationId, overview, filters],
    queryFn: () => load({ data: { organizationId, filters } }),
    enabled: !!organizationId,
  });
  const change = (values: Partial<ViewState>) =>
    onState(JSON.stringify({ ...state, offset: 0, ...values }));
  useEffect(() => setSearch(state.q || ""), [state.q]);
  const data = query.data;
  const refresh = async () => {
    await query.refetch();
  };
  const open = (id: string) => change({ id, offset: state.offset });
  const selected = state.id;
  function changeMonth(offset: number) {
    const [y, m] = month.split("-").map(Number);
    change({ month: localDay(new Date(y, m - 1 + offset, 1)).slice(0, 7) });
  }
  return (
    <section className="ut-root">
      <nav className="ut-tabs" aria-label="Área pessoal">
        <a href="/" aria-current={overview ? "page" : undefined}>
          Home
        </a>
        <a href="/?view=tasks" aria-current={!overview ? "page" : undefined}>
          Minhas tarefas
        </a>
      </nav>
      <div className="ut-heading">
        <div>
          <h1>{overview ? "Minha página inicial" : "Minhas tarefas"}</h1>
          <p>
            {overview
              ? "O que está sob sua responsabilidade."
              : "Organize suas atividades, acompanhe prazos e execute as entregas."}
          </p>
        </div>
        {!overview && data?.canCreate && (
          <button className="ut-primary" onClick={() => setModal("create")}>
            <Plus size={16} />
            Nova tarefa
          </button>
        )}
      </div>
      {!organizationId ? (
        <p className="ut-empty">Selecione uma organização.</p>
      ) : query.isLoading ? (
        <div className="ut-empty" role="status">
          Carregando tarefas…
        </div>
      ) : query.error ? (
        <div className="ut-error" role="alert">
          {query.error.message}
          <button onClick={() => void refresh()}>Tentar novamente</button>
        </div>
      ) : (
        data && (
          <>
            {overview ? (
              <>
                <div className="ut-summary">
                  {Object.entries(TASK_KINDS).map(([key, label], i) => {
                    const Icon = [GitBranch, TrendingUp, FileText][i];
                    return (
                      <a
                        key={key}
                        href={`/?view=tasks&taskState=${encodeURIComponent(JSON.stringify({ kind: key }))}`}
                      >
                        <Icon size={20} />
                        <span>{label}</span>
                        <strong>{data.summary[key as keyof typeof TASK_KINDS]}</strong>
                        <small>Tarefas em aberto</small>
                      </a>
                    );
                  })}
                </div>
                <div className="ut-heading">
                  <div>
                    <h2>Próximas entregas</h2>
                    <p>
                      {data.summary.overdue
                        ? `${data.summary.overdue} tarefa(s) com prazo vencido.`
                        : "Acompanhe os prazos e continue de onde parou."}
                    </p>
                  </div>
                  <a className="ut-button" href="/?view=tasks">
                    Ver todas as tarefas
                  </a>
                </div>
                {renderTable(data.tasks.filter((t) => t.status !== "completed").slice(0, 8), (id) =>
                  window.location.assign(
                    `/?view=tasks&taskState=${encodeURIComponent(JSON.stringify({ id }))}`,
                  ),
                )}
              </>
            ) : (
              <>
                <div className="ut-toolbar">
                  <form
                    noValidate
                    className="ut-search"
                    onSubmit={(e) => {
                      e.preventDefault();
                      change({ q: search });
                    }}
                  >
                    <Search size={16} />
                    <input
                      aria-label="Buscar tarefas"
                      placeholder="Código, título ou pessoa"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search && (
                      <button
                        type="button"
                        aria-label="Limpar busca"
                        onClick={() => {
                          setSearch("");
                          change({ q: "" });
                        }}
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button type="submit">Buscar</button>
                  </form>
                  <div className="ut-view-switch" aria-label="Visualização">
                    {(["list", "kanban", "calendar"] as const).map((v, i) => {
                      const Icon = [List, SquareKanban, CalendarDays][i];
                      return (
                        <button
                          key={v}
                          aria-pressed={(state.layout || "list") === v}
                          onClick={() => change({ layout: v })}
                        >
                          <Icon size={16} />
                          {["Lista", "Kanban", "Calendário"][i]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="ut-filters">
                  <label>
                    Tipo
                    <select
                      value={state.kind || ""}
                      onChange={(e) => change({ kind: e.target.value })}
                    >
                      <option value="">Todos</option>
                      {Object.entries(TASK_KINDS).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Situação
                    <select
                      value={state.status || ""}
                      onChange={(e) => change({ status: e.target.value })}
                    >
                      <option value="">Todas</option>
                      {TASK_STATUSES.map((s) => (
                        <option value={s} key={s}>
                          {TASK_STATUS_LABELS[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Modalidade
                    <select
                      value={state.modality || ""}
                      onChange={(e) => change({ modality: e.target.value })}
                    >
                      <option value="">Todas</option>
                      {TASK_MODALITIES.map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </select>
                  </label>
                  {state.layout !== "calendar" && (
                    <>
                      <label>
                        Período de
                        <input
                          type="date"
                          value={state.from || ""}
                          onChange={(e) => change({ from: e.target.value })}
                        />
                      </label>
                      <label>
                        Até
                        <input
                          type="date"
                          value={state.until || ""}
                          onChange={(e) => change({ until: e.target.value })}
                        />
                      </label>
                    </>
                  )}
                  {data.isAdmin && (
                    <label className="ut-checkbox">
                      <input
                        type="checkbox"
                        checked={!!state.team}
                        onChange={(e) => change({ team: e.target.checked })}
                      />
                      Ver tarefas da equipe
                    </label>
                  )}
                  <button
                    onClick={() => {
                      setSearch("");
                      onState(JSON.stringify({ layout: state.layout }));
                    }}
                  >
                    Limpar filtros
                  </button>
                </div>
                {state.layout === "kanban" ? (
                  <>
                    <div className="ut-heading">
                      <p>{data.total} tarefa(s)</p>
                      <label className="ut-inline">
                        Agrupar por
                        <select
                          value={state.group || "status"}
                          onChange={(e) =>
                            change({ group: e.target.value as "status" | "modality" })
                          }
                        >
                          <option value="status">Situação da tarefa</option>
                          <option value="modality">Modalidade de mapeamento</option>
                        </select>
                      </label>
                    </div>
                    <div className="ut-kanban">
                      {(state.group === "modality"
                        ? [...TASK_MODALITIES, "Sem modalidade"]
                        : TASK_STATUSES
                      ).map((group) => {
                        const tasks = data.tasks.filter(
                          (t) =>
                            (state.group === "modality"
                              ? t.modality || "Sem modalidade"
                              : t.status) === group,
                        );
                        return (
                          <section className="ut-column" key={group}>
                            <h3>
                              {TASK_STATUS_LABELS[group as keyof typeof TASK_STATUS_LABELS] ||
                                group}
                              <span>{tasks.length}</span>
                            </h3>
                            {tasks.length ? (
                              tasks.map((t) => (
                                <button className="ut-card" key={t.id} onClick={() => open(t.id)}>
                                  <small>{t.code}</small>
                                  <strong>{t.title}</strong>
                                  <span>{t.modality || TASK_KINDS[t.kind]}</span>
                                  <span>{t.assignee_name}</span>
                                  <span
                                    className={
                                      t.due_on < localDay() && t.status !== "completed"
                                        ? "ut-late"
                                        : ""
                                    }
                                  >
                                    Prazo: {taskDate(t.due_on)}
                                  </span>
                                  <footer>
                                    {t.checklist.length - pending(t).length}/{t.checklist.length}{" "}
                                    itens concluídos
                                    {pending(t).length > 0 &&
                                      t.pending_at_transition.length > 0 && <b>Pendências</b>}
                                  </footer>
                                </button>
                              ))
                            ) : (
                              <p className="ut-muted">Nenhuma tarefa nesta coluna.</p>
                            )}
                          </section>
                        );
                      })}
                    </div>
                  </>
                ) : state.layout === "calendar" ? (
                  <>
                    <div className="ut-heading">
                      <div className="ut-inline">
                        <button aria-label="Mês anterior" onClick={() => changeMonth(-1)}>
                          <ChevronLeft size={16} />
                        </button>
                        <h2>
                          {new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", {
                            month: "long",
                            year: "numeric",
                          })}
                        </h2>
                        <button aria-label="Próximo mês" onClick={() => changeMonth(1)}>
                          <ChevronRight size={16} />
                        </button>
                        <button onClick={() => change({ month: localDay().slice(0, 7) })}>
                          Hoje
                        </button>
                      </div>
                      <div className="ut-view-switch" aria-label="Formato do calendário">
                        <button
                          aria-pressed={state.calendarView !== "gantt"}
                          onClick={() => change({ calendarView: "month" })}
                        >
                          Mensal
                        </button>
                        <button
                          aria-pressed={state.calendarView === "gantt"}
                          onClick={() => change({ calendarView: "gantt" })}
                        >
                          Gantt
                        </button>
                      </div>
                    </div>
                    <p className="ut-muted">
                      Distribuição pelo período da atividade. Selecione a tarefa para abrir os
                      detalhes.
                    </p>
                    {state.calendarView === "gantt" ? (
                      <TaskGantt tasks={data.tasks} days={days} open={open} />
                    ) : (
                      <div className="ut-calendar-wrap">
                        <div className="ut-calendar">
                          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
                            <strong className="ut-weekday" key={day}>
                              {day}
                            </strong>
                          ))}
                          {days.map((day) => (
                            <section
                              className={`ut-day ${day.startsWith(month) ? "" : "ut-other-month"}`}
                              key={day}
                              aria-label={taskDate(day)}
                            >
                              <time dateTime={day} className={day === localDay() ? "ut-today" : ""}>
                                {Number(day.slice(-2))}
                              </time>
                              {data.tasks
                                .filter((t) => t.starts_on <= day && t.due_on >= day)
                                .map((t) => (
                                  <button
                                    key={t.id}
                                    title={`${t.code ? `${t.code} · ` : ""}${t.title}`}
                                    onClick={() => open(t.id)}
                                  >
                                    <span>
                                      {t.code && `${t.code} · `}
                                      {t.title}
                                    </span>
                                    {t.due_on === day && <b>Prazo</b>}
                                  </button>
                                ))}
                            </section>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  renderTable(data.tasks, open)
                )}
                {!data.tasks.length && state.layout !== "list" && (
                  <p className="ut-empty">
                    Nenhuma tarefa encontrada para os filtros selecionados.
                  </p>
                )}
                <div className="ut-pagination">
                  <span>
                    {data.total
                      ? `${(state.offset || 0) + 1}–${Math.min((state.offset || 0) + 60, data.total)} de ${data.total} tarefas`
                      : "0 tarefas"}
                    {data.total > 60 && state.layout !== "list"
                      ? " · Esta visualização mostra a página atual. Use os filtros ou navegue pelas páginas."
                      : ""}
                  </span>
                  <button
                    disabled={!state.offset}
                    onClick={() => change({ offset: Math.max(0, (state.offset || 0) - 60) })}
                  >
                    Anterior
                  </button>
                  <button
                    disabled={(state.offset || 0) + 60 >= data.total}
                    onClick={() => change({ offset: (state.offset || 0) + 60 })}
                  >
                    Próxima
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}
      {modal === "create" && data && (
        <CreateTask
          organizationId={organizationId}
          data={data}
          close={() => setModal(null)}
          saved={async (id) => {
            setModal(null);
            change({ id });
            await refresh();
          }}
        />
      )}
      {selected && !overview && (
        <TaskDetails
          organizationId={organizationId}
          id={selected}
          close={() => change({ id: undefined, offset: state.offset })}
          changed={refresh}
        />
      )}
    </section>
  );
}
function TaskGantt({
  tasks,
  days,
  open,
}: {
  tasks: UserTask[];
  days: string[];
  open: (id: string) => void;
}) {
  return (
    <div
      className="ut-gantt-wrap"
      tabIndex={0}
      role="region"
      aria-label="Gráfico de Gantt — role horizontalmente para consultar o período"
    >
      <table className="ut-gantt">
        <thead>
          <tr>
            <th scope="col">Tarefa / responsável</th>
            {days.map((day) => (
              <th scope="col" key={day} className={day === localDay() ? "ut-gantt-today" : ""}>
                <time dateTime={day}>
                  {day.slice(8)}/{day.slice(5, 7)}
                </time>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const start = days.findIndex((day) => day >= task.starts_on);
            const end = days.reduce((last, day, i) => (day <= task.due_on ? i : last), -1);
            const first = Math.max(0, start);
            const last = Math.min(days.length - 1, end);
            return (
              <tr key={task.id}>
                <th scope="row">
                  <button onClick={() => open(task.id)}>{task.title}</button>
                  <small>
                    {task.assignee_name} · {TASK_STATUS_LABELS[task.status]}
                  </small>
                  <small>
                    {taskDate(task.starts_on)} — {taskDate(task.due_on)}
                  </small>
                </th>
                <td colSpan={days.length} className="ut-gantt-track">
                  <div style={{ gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
                    {days.map((day, i) => (
                      <span
                        key={day}
                        aria-hidden="true"
                        className={day === localDay() ? "ut-gantt-today" : ""}
                        style={{ gridColumn: i + 1, gridRow: 1 }}
                      />
                    ))}
                    {start !== -1 && last >= first && (
                      <button
                        className={`ut-gantt-bar ut-gantt-${task.status}`}
                        style={{ gridColumn: `${first + 1} / ${last + 2}`, gridRow: 1 }}
                        onClick={() => open(task.id)}
                        title={`${task.title}: ${taskDate(task.starts_on)} a ${taskDate(task.due_on)} · ${TASK_STATUS_LABELS[task.status]}`}
                        aria-label={`Abrir ${task.title}, ${TASK_STATUS_LABELS[task.status]}, ${taskDate(task.starts_on)} a ${taskDate(task.due_on)}`}
                      >
                        <span>{task.title}</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
function renderTable(tasks: UserTask[], open: (id: string) => void) {
  return (
    <div className="ut-table-wrap">
      <table>
        <thead>
          <tr>
            {["Código / título", "Responsável", "Solicitante", "Prazo", "Situação", ""].map(
              (label, i) => (
                <th key={i} scope="col">
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id}>
              <td>
                <small>
                  {t.code && `${t.code} · `}
                  {t.modality || TASK_KINDS[t.kind]}
                </small>
                <strong>{t.title}</strong>
                {attention(t).length > 0 && (
                  <span className="ut-late">{attention(t).length} item(ns) pendente(s)</span>
                )}
              </td>
              <td>{t.assignee_name}</td>
              <td>{t.requester_name}</td>
              <td className={t.due_on < localDay() && t.status !== "completed" ? "ut-late" : ""}>
                {taskDate(t.due_on)}
              </td>
              <td>
                <span className={`ut-status ut-status-${t.status}`}>
                  {TASK_STATUS_LABELS[t.status]}
                </span>
              </td>
              <td>
                <button onClick={() => open(t.id)}>Ver detalhes</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!tasks.length && <p className="ut-empty">Nenhuma tarefa encontrada.</p>}
    </div>
  );
}

function DocumentPicker({
  organizationId,
  value,
  onChange,
}: {
  organizationId: string;
  value: string;
  onChange: (doc: TaskDocument) => void;
}) {
  const load = useServerFn(loadUserTasks);
  const [q, setQ] = useState("");
  const [committed, setCommitted] = useState("");
  const query = useQuery({
    queryKey: ["task-documents", organizationId, committed],
    queryFn: () => load({ data: { organizationId, filters: { documentQuery: committed } } }),
  });
  return (
    <div className="ut-document-picker">
      <label>
        Buscar documento por código ou título
        <div className="ut-inline">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ex.: MAP.ADM.001" />
          {q && (
            <button
              type="button"
              aria-label="Limpar busca de documento"
              onClick={() => {
                setQ("");
                setCommitted("");
              }}
            >
              <X size={14} />
            </button>
          )}
          <button type="button" onClick={() => setCommitted(q)}>
            Buscar
          </button>
        </div>
      </label>
      {query.isLoading ? (
        <p role="status">Carregando documentos…</p>
      ) : query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : (
        <label>
          Documento vinculado
          <select
            value={value}
            onChange={(e) => {
              const doc = query.data?.documents.find((d) => d.id === e.target.value);
              if (doc) onChange(doc);
            }}
          >
            <option value="">Selecione entre os documentos encontrados</option>
            {value && !query.data?.documents.some((d) => d.id === value) && (
              <option value={value}>Documento vinculado</option>
            )}
            {query.data?.documents.map((d) => (
              <option value={d.id} key={d.id}>
                {d.code || "Sem código"} · {d.name}
              </option>
            ))}
          </select>
          <small>Até 40 resultados por busca. O código é o mesmo do documento.</small>
        </label>
      )}
    </div>
  );
}

function CreateTask({
  organizationId,
  data,
  close,
  saved,
}: {
  organizationId: string;
  data: TaskFeed;
  close: () => void;
  saved: (id: string) => Promise<void>;
}) {
  const command = useServerFn(updateUserTask);
  const [id] = useState(() => crypto.randomUUID());
  const [comment, setComment] = useState("");
  const [dirty, setDirty] = useState(false);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"mapping" | "improvement" | "document">("mapping");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <TaskDialog title="Nova tarefa" onClose={close} busy={busy} dirty={dirty}>
      <form
        noValidate
        onChange={() => setDirty(true)}
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          if (
            title.trim().length < 2 ||
            !f.get("dueOn") ||
            !f.get("assignedTo") ||
            !f.get("requestedBy") ||
            !f.get("startsOn") ||
            String(f.get("dueOn")) < String(f.get("startsOn"))
          ) {
            setError(
              "Preencha título, responsável, solicitante e período. O prazo deve ser igual ou posterior ao início.",
            );
            return;
          }
          setBusy(true);
          setError("");
          try {
            await command({
              data: {
                organizationId,
                action: "create",
                payload: {
                  id,
                  requestedBy: f.get("requestedBy"),
                  note: comment,
                  title,
                  kind,
                  modality: kind === "mapping" ? f.get("modality") : null,
                  assignedTo: f.get("assignedTo"),
                  startsOn: f.get("startsOn"),
                  dueOn: f.get("dueOn"),
                },
              },
            });
            await saved(id);
            toast.success("Tarefa criada.");
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="ut-form">
          <label>
            Tipo
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
              {Object.entries(TASK_KINDS).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Título
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          {kind === "mapping" && (
            <label>
              Modalidade
              <select name="modality">
                {TASK_MODALITIES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          )}
          <label>
            Responsável
            <select name="assignedTo" defaultValue={data.userId}>
              {data.people
                .filter((p) => p.can_edit)
                .map((p) => (
                  <option value={p.id} key={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Solicitante
            <select name="requestedBy" defaultValue={data.userId}>
              {data.people.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comentário inicial (opcional)
            <textarea
              className="resize-none"
              rows={4}
              maxLength={10000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Descreva a solicitação ou as orientações para esta tarefa."
            />
          </label>
          <div className="ut-form-row">
            <label>
              Início
              <input type="date" name="startsOn" defaultValue={localDay()} />
            </label>
            <label>
              Prazo
              <input type="date" name="dueOn" />
            </label>
          </div>
          {error && (
            <p role="alert" className="ut-error">
              {error}
            </p>
          )}
        </div>
        <footer>
          <button type="button" disabled={busy} onClick={close}>
            Cancelar
          </button>
          <button className="ut-primary" disabled={busy}>
            {busy ? "Salvando…" : "Criar tarefa"}
          </button>
        </footer>
      </form>
    </TaskDialog>
  );
}

function TaskDetails({
  organizationId,
  id,
  close,
  changed,
}: {
  organizationId: string;
  id: string;
  close: () => void;
  changed: () => Promise<void>;
}) {
  const load = useServerFn(loadUserTasks);
  const command = useServerFn(updateUserTask);
  const query = useQuery({
    queryKey: ["task-detail", organizationId, id],
    queryFn: () => load({ data: { organizationId, filters: { id } } }),
  });
  const [hideDone, setHideDone] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [comment, setComment] = useState("");
  const data = query.data;
  const t = data?.tasks[0];
  const canAct = !!t && data?.canCreate && (data?.isAdmin || data?.userId === t.assigned_to);
  const canEdit =
    canAct &&
    t?.status !== "completed" &&
    (t?.kind !== "mapping" || t?.stage === "documentation" || data?.isAdmin);
  const remainder = t ? pending(t) : [];
  async function write(action: TaskAction, payload: Record<string, unknown>) {
    if (!t) return false;
    setBusy(true);
    setError("");
    try {
      await command({
        data: { organizationId, action, payload: { id, revision: t.revision, ...payload } },
      });
      await query.refetch();
      await changed();
      toast.success(action === "comment" ? "Comentário registrado." : "Tarefa atualizada.");
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <TaskDialog
      wide
      dirty={!!comment.trim()}
      title={t ? `${t.code ? `${t.code} · ` : ""}${t.title}` : "Detalhes da tarefa"}
      onClose={close}
      busy={busy}
    >
      {query.isLoading ? (
        <p className="ut-empty" role="status">
          Carregando detalhes…
        </p>
      ) : query.error ? (
        <p className="ut-error" role="alert">
          {query.error.message}
        </p>
      ) : !t ? (
        <p className="ut-empty">Tarefa não encontrada ou sem acesso.</p>
      ) : (
        <div className="ut-detail-grid">
          <section className="ut-detail-main">
            <div className="ut-detail">
              <div className="ut-inline">
                <span className={`ut-status ut-status-${t.status}`}>
                  {TASK_STATUS_LABELS[t.status]}
                </span>
                {t.kind === "mapping" && <strong>{TASK_STAGE_LABELS[t.stage]}</strong>}
              </div>
              <div className="ut-detail-meta">
                <span>
                  <small>Responsável atual</small>
                  {t.assignee_name}
                </span>
                <span>
                  <small>Solicitante</small>
                  {t.requester_name}
                </span>
                <span>
                  <small>Tipo / modalidade</small>
                  {TASK_KINDS[t.kind]}
                  {t.modality ? ` · ${t.modality}` : ""}
                </span>
                <span>
                  <small>Período / prazo</small>
                  {taskDate(t.starts_on)} a {taskDate(t.due_on)}
                </span>
              </div>
              {t.adjustment_request && t.stage === "documentation" && (
                <div className="ut-warning">
                  <strong>Ajustes solicitados</strong>
                  <p style={{ whiteSpace: "pre-wrap" }}>{t.adjustment_request}</p>
                </div>
              )}
              {attention(t).length > 0 && (
                <div className="ut-warning">
                  <strong>A tarefa foi movimentada com pendências.</strong>
                  <ul>
                    {attention(t).map((i) => (
                      <li key={i.key}>{i.label}</li>
                    ))}
                  </ul>
                </div>
              )}
              <section>
                <div className="ut-heading">
                  <h3>Checklist{t.modality ? ` · ${t.modality}` : ""}</h3>
                  <button onClick={() => setHideDone((v) => !v)}>
                    {hideDone ? "Mostrar todos" : "Ocultar concluídos"}
                  </button>
                </div>
                <div className="ut-progress">
                  <small>
                    {t.checklist.length - remainder.length}/{t.checklist.length}
                  </small>
                  <progress
                    aria-label="Itens concluídos"
                    max={t.checklist.length}
                    value={t.checklist.length - remainder.length}
                  />
                </div>
                <p className="ut-muted">Rascunhos permanecem em andamento.</p>
                {t.checklist
                  .filter((i) => !hideDone || !i.completed)
                  .map((item) => {
                    const doc = item.document_id
                      ? {
                          id: item.document_id,
                          module: item.document_module || t.document_module,
                          name: item.label,
                          code: "",
                          current_version: 0,
                        }
                      : null;
                    return (
                      <div className="ut-checklist-row" key={item.key}>
                        <span className={`ut-check ${item.completed ? "ut-checked" : ""}`}>
                          {item.completed && <Check size={14} />}
                        </span>
                        <div>
                          <strong>{item.label}</strong>
                          <small>
                            {item.completed
                              ? "Concluído"
                              : item.stale
                                ? "Em andamento · documento alterado"
                                : item.saved_version !== null || item.content
                                  ? "Em andamento"
                                  : "A fazer"}
                          </small>
                        </div>
                        {doc ? (
                          <a className="ut-button" href={documentTaskUrl(t, item, doc)}>
                            {canEdit
                              ? item.completed
                                ? "Editar"
                                : "Preencher"
                              : "Abrir documento"}
                          </a>
                        ) : (
                          <button disabled={busy} onClick={() => setEditing(item)}>
                            {canEdit && !(t.kind === "mapping" && item.key === "validation")
                              ? item.completed
                                ? "Editar"
                                : "Preencher"
                              : "Visualizar"}
                          </button>
                        )}
                      </div>
                    );
                  })}
              </section>
              {canAct && data && (
                <TaskRoutingActions
                  key={`${t.id}:${t.stage}:${t.assigned_to}`}
                  task={t}
                  data={data}
                  busy={busy}
                  write={write}
                />
              )}
              {error && (
                <p role="alert" className="ut-error">
                  {error}
                </p>
              )}
            </div>
          </section>
          <aside className="ut-detail-history">
            <h3>Comentários e atividade</h3>
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                if (!comment.trim()) {
                  setError("Escreva um comentário.");
                  return;
                }
                if (await write("comment", { note: comment, commentId: crypto.randomUUID() }))
                  setComment("");
              }}
            >
              <label>
                <span className="sr-only">Adicionar comentário</span>
                <textarea
                  className="resize-none"
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={10000}
                  placeholder="Escrever um comentário…"
                />
              </label>
              <button className="ut-primary" disabled={busy || !comment.trim()}>
                Registrar comentário
              </button>
            </form>
            {data?.events.map((ev) => (
              <article className="ut-activity" key={ev.id}>
                <span className="ut-avatar" aria-hidden="true">
                  {ev.actor_name
                    .split(" ")
                    .map((n) => n[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <strong>{ev.actor_name}</strong>
                  <small>{new Date(ev.created_at).toLocaleString("pt-BR")}</small>
                  <p
                    className={ev.action === "Comentário" ? "ut-comment" : ""}
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {ev.action === "Comentário" ? (
                      ev.note
                    ) : (
                      <>
                        <b>{ev.action}</b>
                        {ev.note && (
                          <>
                            <br />
                            {ev.note}
                          </>
                        )}
                      </>
                    )}
                  </p>
                </div>
              </article>
            ))}
            <small>Últimos 100 registros.</small>
          </aside>
        </div>
      )}
      <footer>
        <button onClick={close} disabled={busy}>
          Fechar
        </button>
      </footer>
      {editing && t && (
        <ItemEditor
          item={editing}
          task={t}
          organizationId={organizationId}
          readOnly={!canEdit || (t.kind === "mapping" && editing.key === "validation")}
          close={() => setEditing(null)}
          save={async (payload) => !!(await write("item", payload))}
        />
      )}
    </TaskDialog>
  );
}

function ItemEditor({
  item,
  task,
  organizationId,
  readOnly,
  close,
  save,
}: {
  item: TaskItem;
  task: UserTask;
  organizationId: string;
  readOnly: boolean;
  close: () => void;
  save: (payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [content, setContent] = useState(item.content);
  const [doc, setDoc] = useState<TaskDocument | null>(null);
  const [ask, setAsk] = useState(false);
  const [baseline, setBaseline] = useState({ content: item.content, documentId: item.document_id });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const persist = async (completed: boolean, finish = true) => {
    setBusy(true);
    setError("");
    try {
      const ok = await save({
        key: item.key,
        content,
        documentId: doc?.id || item.document_id,
        completed,
      });
      if (!ok) setError("Não foi possível salvar. Confira o aviso nos detalhes da tarefa.");
      else {
        setBaseline({ content, documentId: doc?.id || item.document_id });
        if (finish) close();
        else setAsk(true);
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <TaskDialog
      title={item.label}
      onClose={close}
      busy={busy}
      dirty={content !== baseline.content || (doc?.id || item.document_id) !== baseline.documentId}
    >
      <div className="ut-form">
        <label>
          Conteúdo / registro da entrega
          <textarea
            className="resize-none"
            rows={7}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            readOnly={readOnly}
          />
        </label>
        {!readOnly && (
          <DocumentPicker
            organizationId={organizationId}
            value={doc?.id || item.document_id || ""}
            onChange={setDoc}
          />
        )}
        <p className="ut-muted">
          {task.code && `${task.code} · `}
          {task.title}
        </p>
        {error && (
          <p role="alert" className="ut-error">
            {error}
          </p>
        )}
        {ask && (
          <div className="ut-warning">
            <strong>Deseja concluir este item do checklist?</strong>
            <p>O conteúdo foi salvo. Se escolher não, o item continuará em andamento.</p>
          </div>
        )}
      </div>
      <footer>
        <button disabled={busy} onClick={close}>
          Fechar
        </button>
        {!readOnly &&
          (ask ? (
            <>
              <button disabled={busy} onClick={close}>
                Não, manter em andamento
              </button>
              <button className="ut-primary" disabled={busy} onClick={() => void persist(true)}>
                Sim, concluir item
              </button>
            </>
          ) : (
            <button
              className="ut-primary"
              disabled={busy}
              onClick={() => void persist(false, false)}
            >
              Salvar
            </button>
          ))}
      </footer>
    </TaskDialog>
  );
}
