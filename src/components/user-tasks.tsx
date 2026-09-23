import { TaskRequestContext } from "./task-request-context";
import { TaskQuickActionDialog } from "./task-quick-action-dialog";
import { taskQuickActions } from "@/lib/user-tasks";
import { UserHomeDashboard } from "./user-home-dashboard";
import { TaskChecklistDownload } from "./task-delivery-export";
import { movementActivityTitle } from "@/lib/user-tasks";
import { TaskAreaField } from "./task-area-field";
import { supabase } from "@/integrations/supabase/client";
import { TaskComment, CommentAttachment } from "./task-comment";
import { TaskMeetings, type ScheduleEntry } from "./task-meetings";
import { TaskManagement, TaskProcessFlow } from "./task-management";
import { TaskKanbanCard } from "./task-kanban-card";
import { TaskCalendar } from "./task-calendar";
import {
  TASK_PERIOD_LABELS,
  periodRange,
  periodColumns,
  shiftPeriod,
  validDay,
  type TaskPeriod,
} from "@/lib/task-period";
import { TaskChecklist } from "./task-checklist";
import { TaskRoutingActions } from "./task-routing-actions";
import { TASK_STAGE_LABELS, type TaskAction } from "@/lib/user-tasks";
import { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  List,
  Plus,
  Paperclip,
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
  taskDate,
  taskCode,
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
  cardDensity?: "detailed" | "compact";
  month?: string;
  anchor?: string;
  period?: TaskPeriod;
  calendarView?: "month" | "gantt";
};
function parseState(raw?: string): ViewState {
  try {
    const value = raw ? JSON.parse(raw) : {};
    if (!value || typeof value !== "object" || Array.isArray(value)) return { layout: "calendar" };
    const strings = [
      "stage",
      "dueBefore",
      "dueFrom",
      "dueThrough",
      "q",
      "status",
      "kind",
      "modality",
      "from",
      "until",
      "id",
      "documentQuery",
    ];
    const parsed: Record<string, unknown> = { layout: "calendar" };
    for (const key of strings) if (typeof value[key] === "string") parsed[key] = value[key];
    if (["list", "kanban", "calendar"].includes(value.layout)) parsed.layout = value.layout;
    if (["detailed", "compact"].includes(value.cardDensity)) parsed.cardDensity = value.cardDensity;
    if (validDay(value.anchor)) parsed.anchor = value.anchor;
    if (["day", "week", "month", "year"].includes(value.period)) parsed.period = value.period;
    if (["month", "gantt"].includes(value.calendarView)) parsed.calendarView = value.calendarView;
    if (["status", "modality"].includes(value.group)) parsed.group = value.group;
    if (typeof value.month === "string" && /^(19|20|21)\d{2}-(0[1-9]|1[0-2])$/.test(value.month))
      parsed.month = value.month;
    if (Number.isInteger(value.offset) && value.offset >= 0) parsed.offset = value.offset;
    parsed.team = value.team === true;
    return parsed as ViewState;
  } catch {
    return { layout: "calendar" };
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
  const [contextTask, setContextTask] = useState<UserTask | null>(null);
  const state = parseState(raw);
  const [search, setSearch] = useState(state.q || "");
  const [modal, setModal] = useState<"create" | null>(null);
  const load = useServerFn(loadUserTasks);
  const anchor = state.anchor || (state.month ? `${state.month}-01` : localDay());
  const period = state.period || "month";
  const range = periodRange(anchor, period);
  const filters: TaskFilters = overview
    ? { status: "open" }
    : state.layout === "calendar"
      ? { ...state, id: undefined, from: range.from, until: range.until }
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
  const showTaskActions = (event: React.MouseEvent | React.KeyboardEvent) => {
    const id = (event.target as HTMLElement).closest<HTMLElement>("[data-task-id]")?.dataset.taskId;
    const task = data?.tasks.find((task) => task.id === id);
    if (task && data && taskQuickActions(task, data).length) {
      event.preventDefault();
      event.stopPropagation();
      setContextTask(task);
    }
  };
  return (
    <section
      onContextMenu={showTaskActions}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
          showTaskActions(event);
      }}
      className={`ut-root ${overview ? "ut-home" : ""} ${!overview && state.layout === "calendar" ? "ut-agenda-fit" : ""}`}
    >
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
                <UserHomeDashboard
                  organizationId={organizationId}
                  openTask={open}
                  isAdmin={data.isAdmin}
                />
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
                      aria-label="Buscar tarefas e reuniões"
                      placeholder="Código, título, pessoa ou reunião"
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
                    {(["calendar", "list", "kanban"] as const).map((v, i) => {
                      const Icon = [CalendarDays, List, SquareKanban][i];
                      return (
                        <button
                          key={v}
                          aria-pressed={(state.layout || "calendar") === v}
                          onClick={() => change({ layout: v })}
                        >
                          <Icon size={16} />
                          {["Calendário", "Lista", "Kanban"][i]}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <details className="ut-task-filters" key={state.layout}>
                  <summary>
                    Filtros de tarefas{" "}
                    <span>
                      {[
                        state.kind,
                        state.status,
                        state.modality,
                        state.team,
                        state.q,
                        state.stage,
                        state.dueBefore,
                        state.dueFrom,
                        state.dueThrough,
                      ].filter(Boolean).length || "Todos"}
                    </span>
                  </summary>
                  {(state.stage || state.dueBefore || state.dueFrom || state.dueThrough) && (
                    <p className="ut-muted">
                      Filtro da Home:{" "}
                      {state.stage
                        ? TASK_STAGE_LABELS[state.stage as keyof typeof TASK_STAGE_LABELS]
                        : ""}
                      {state.dueBefore ? ` vencimento antes de ${taskDate(state.dueBefore)}` : ""}
                      {state.dueFrom ? ` vencimento de ${taskDate(state.dueFrom)}` : ""}
                      {state.dueThrough ? ` até ${taskDate(state.dueThrough)}` : ""}
                    </p>
                  )}
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
                        onState(
                          JSON.stringify({
                            ...state,
                            stage: undefined,
                            dueBefore: undefined,
                            dueFrom: undefined,
                            dueThrough: undefined,
                            kind: undefined,
                            status: undefined,
                            modality: undefined,
                            team: undefined,
                            q: undefined,
                            from: undefined,
                            until: undefined,
                            page: undefined,
                          }),
                        );
                      }}
                    >
                      Limpar filtros
                    </button>
                  </div>
                </details>
                {state.layout === "kanban" ? (
                  <>
                    <div className="ut-heading">
                      <p>{data.total} tarefa(s)</p>
                      <div className="ut-kanban-controls">
                        <div
                          className="ut-density-switch"
                          role="group"
                          aria-label="Informações dos cards"
                        >
                          <button
                            aria-pressed={state.cardDensity !== "compact"}
                            onClick={() => change({ cardDensity: "detailed" })}
                          >
                            Detalhado
                          </button>
                          <button
                            aria-pressed={state.cardDensity === "compact"}
                            onClick={() => change({ cardDensity: "compact" })}
                          >
                            Compacto
                          </button>
                        </div>
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
                                <TaskKanbanCard
                                  key={t.id}
                                  task={t}
                                  compact={state.cardDensity === "compact"}
                                  open={() => open(t.id)}
                                />
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
                    <div className="ut-calendar-toolbar">
                      <div className="ut-calendar-navigation">
                        <button
                          aria-label="Período anterior"
                          onClick={() => change({ anchor: shiftPeriod(anchor, period, -1) })}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <h2>{range.label}</h2>
                        <button
                          aria-label="Próximo período"
                          onClick={() => change({ anchor: shiftPeriod(anchor, period, 1) })}
                        >
                          <ChevronRight size={16} />
                        </button>
                        <button onClick={() => change({ anchor: localDay() })}>Hoje</button>
                      </div>
                      <div className="ut-calendar-display">
                        <label className="ut-inline">
                          Visualizar
                          <select
                            value={period}
                            onChange={(e) => change({ period: e.target.value as TaskPeriod })}
                          >
                            {Object.entries(TASK_PERIOD_LABELS).map(([key, label]) => (
                              <option key={key} value={key}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="ut-inline">
                          Ir para
                          <input
                            type="date"
                            value={anchor}
                            onChange={(e) => {
                              if (validDay(e.target.value)) change({ anchor: e.target.value });
                            }}
                          />
                        </label>
                        <div className="ut-view-switch" aria-label="Formato do calendário">
                          <button
                            aria-pressed={state.calendarView !== "gantt"}
                            onClick={() => change({ calendarView: "month" })}
                          >
                            Calendário
                          </button>
                          <button
                            aria-pressed={state.calendarView === "gantt"}
                            onClick={() => change({ calendarView: "gantt" })}
                          >
                            Gantt
                          </button>
                        </div>
                      </div>
                    </div>
                    <TaskMeetings
                      isAdmin={data.isAdmin}
                      organizationId={organizationId}
                      tasks={data.tasks}
                      anchor={anchor}
                      period={period}
                      search={state.q || ""}
                      render={(items, openMeeting, schedule) => {
                        const openEntry = (id: string) =>
                          items.find((item) => item.id === id)?.meeting
                            ? openMeeting(id)
                            : open(id);
                        return state.calendarView === "gantt" ? (
                          <TaskGantt
                            tasks={items}
                            columns={periodColumns(anchor, period)}
                            open={openEntry}
                          />
                        ) : (
                          <TaskCalendar
                            tasks={items}
                            anchor={anchor}
                            period={period}
                            open={openEntry}
                            selectDay={schedule}
                          />
                        );
                      }}
                    />
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
      {contextTask && data && (
        <TaskQuickActionDialog
          task={contextTask}
          actions={taskQuickActions(contextTask, data)}
          close={() => setContextTask(null)}
          refresh={refresh}
        />
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
  columns,
  open,
}: {
  tasks: ScheduleEntry[];
  columns: ReturnType<typeof periodColumns>;
  open: (id: string) => void;
}) {
  return (
    <div
      className="ut-gantt-wrap"
      tabIndex={0}
      role="region"
      aria-label="Gráfico de Gantt — role horizontalmente para consultar o período"
    >
      <table className="ut-gantt" style={{ width: `max(100%, ${260 + columns.length * 60}px)` }}>
        <thead>
          <tr>
            <th scope="col">Tarefa / responsável</th>
            {columns.map((col) => (
              <th
                scope="col"
                key={col.from}
                className={
                  col.from <= localDay() && col.until >= localDay() ? "ut-gantt-today" : ""
                }
              >
                <time dateTime={col.from}>{col.label}</time>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const start = columns.findIndex((col) => col.until >= task.starts_on);
            const end = columns.reduce((last, col, i) => (col.from <= task.due_on ? i : last), -1);
            const first = Math.max(0, start);
            const last = Math.min(columns.length - 1, end);
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
                <td colSpan={columns.length} className="ut-gantt-track">
                  <div style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
                    {columns.map((col, i) => (
                      <span
                        key={col.from}
                        aria-hidden="true"
                        className={
                          col.from <= localDay() && col.until >= localDay() ? "ut-gantt-today" : ""
                        }
                        style={{ gridColumn: i + 1, gridRow: 1 }}
                      />
                    ))}
                    {start !== -1 && last >= first && (
                      <button
                        className={`ut-gantt-bar ${task.meeting ? "ut-meeting-bar" : ""} ut-gantt-${task.status}`}
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
            <tr key={t.id} data-task-id={t.id}>
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
              <td
                className={
                  t.due_on < localDay() && !["completed", "cancelled"].includes(t.status)
                    ? "ut-late"
                    : ""
                }
              >
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
  module,
}: {
  module?: "ddp" | "pop";
  organizationId: string;
  value: string;
  onChange: (doc: TaskDocument) => void;
}) {
  const load = useServerFn(loadUserTasks);
  const [q, setQ] = useState("");
  const [committed, setCommitted] = useState("");
  const query = useQuery({
    queryKey: ["task-documents", organizationId, committed, module],
    queryFn: () =>
      load({
        data: { organizationId, filters: { documentQuery: committed, documentModule: module } },
      }),
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
  const [files, setFiles] = useState<File[]>([]);
  const [commentId] = useState(() => crypto.randomUUID());
  const uploads = useRef(new Map<File, { path: string; name: string; size: number }>());
  const fileInput = useRef<HTMLInputElement>(null);
  const [created, setCreated] = useState(false);
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
            !f.get("areaId") ||
            !f.get("dueOn") ||
            !f.get("assignedTo") ||
            !f.get("requestedBy") ||
            !f.get("startsOn") ||
            String(f.get("dueOn")) < String(f.get("startsOn"))
          ) {
            setError(
              "Preencha título, responsável, solicitante, área e período. O prazo deve ser igual ou posterior ao início.",
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
                  areaId: f.get("areaId"),
                  requestedBy: f.get("requestedBy"),
                  note: comment.trim(),
                  title,
                  kind,
                  modality: kind === "mapping" ? f.get("modality") : null,
                  assignedTo: f.get("assignedTo"),
                  startsOn: f.get("startsOn"),
                  dueOn: f.get("dueOn"),
                },
              },
            });
            setCreated(true);
            if (files.length) {
              const attachments = [];
              for (const file of files) {
                let attachment = uploads.current.get(file);
                if (!attachment) {
                  const path = `${organizationId}/${id}/comments/${data.userId}/${commentId}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160)}`;
                  const result = await supabase.storage
                    .from("user-task-files")
                    .upload(path, file, { upsert: false });
                  if (result.error) throw result.error;
                  attachment = { path, name: file.name, size: file.size };
                  uploads.current.set(file, attachment);
                }
                attachments.push(attachment);
              }
              await command({
                data: {
                  organizationId,
                  action: "comment",
                  payload: {
                    id,
                    commentId,
                    note: "Anexos da solicitação inicial.",
                    attachments,
                  },
                },
              });
            }
            await saved(id);
            toast.success("Tarefa criada.");
          } catch (err) {
            const message = (err as Error).message;
            setError(
              /row-level security/i.test(message)
                ? "O Supabase bloqueou o anexo. Aplique a atualização de encaminhamento e anexos no banco e tente novamente nesta mesma janela; a tarefa já registrada não será duplicada."
                : message,
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="ut-form">
          <label>
            Título
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
          </label>
          <div className="ut-form-row">
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
          </div>
          <div className="ut-form-row ut-task-people-row">
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
            <TaskAreaField organizationId={organizationId} />
          </div>
          <div className="ut-form-row">
            <label>
              Prazo de início
              <input type="date" name="startsOn" defaultValue={localDay()} />
            </label>
            <label>
              Prazo de término
              <input type="date" name="dueOn" />
            </label>
          </div>
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
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const selected = Array.from(e.target.files || []);
              if (
                files.length + selected.length > 5 ||
                selected.some((f) => !f.size || f.size > 20 * 1024 * 1024)
              ) {
                setError("Selecione até 5 arquivos de até 20 MB.");
              } else {
                setFiles([...files, ...selected]);
                setDirty(true);
                setError("");
              }
              e.target.value = "";
            }}
          />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}>
            <Paperclip size={16} /> Anexar arquivos
          </button>
          {files.map((f, i) => (
            <div key={i}>
              {f.name}{" "}
              <button
                type="button"
                disabled={busy}
                onClick={() => setFiles(files.filter((_, j) => j !== i))}
              >
                Remover
              </button>
            </div>
          ))}
          {created && (
            <p role="status">
              Tarefa registrada. Se o comentário ou algum anexo falhar, tente novamente para
              concluir a inclusão sem criar outra tarefa.
            </p>
          )}
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
            {busy ? "Salvando…" : created ? "Concluir comentário e anexos" : "Criar tarefa"}
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
  const [detailTab, setDetailTab] = useState("data");
  const [activityTab, setActivityTab] = useState("comments");
  const [commentDirty, setCommentDirty] = useState(false);
  const [fieldsDirty, setFieldsDirty] = useState(false);
  const data = query.data;
  const t = data?.tasks[0];
  const canAct = !!t && data?.canCreate && (data?.isAdmin || data?.userId === t.assigned_to);
  const canEdit =
    canAct &&
    t?.status !== "completed" &&
    t?.status !== "cancelled" &&
    t?.status !== "paused" &&
    (t?.kind !== "mapping" || t?.stage === "documentation" || data?.isAdmin);
  const remainder = t ? pending(t) : [];
  async function write(action: TaskAction, payload: Record<string, unknown>) {
    if (!t) return false;
    setBusy(true);
    setError("");
    try {
      const result = await command({
        data: { organizationId, action, payload: { id, revision: t.revision, ...payload } },
      });
      if (action !== "comment") setFieldsDirty(false);
      await query.refetch();
      await changed();
      toast.success(action === "comment" ? "Comentário registrado." : "Tarefa atualizada.");
      if (action === "begin_document" && result.documentId) {
        const item = t.checklist.find((i) => i.key === payload.key)!;
        window.location.assign(
          documentTaskUrl(t, item, {
            id: result.documentId,
            module: item.entry_type === "pop" ? "pop" : "ddp",
            name: item.label,
            code: "",
            current_version: 0,
          }),
        );
      }
      return true;
    } catch (err) {
      setError((err as Error).message);
      await query.refetch();
      return false;
    } finally {
      setBusy(false);
    }
  }
  return (
    <TaskDialog
      wide
      dirty={commentDirty || fieldsDirty}
      title={t ? `${taskCode(t)} · ${t.title}` : "Detalhes da tarefa"}
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
        <div>
          <nav className="ut-inline ut-detail-tabs" aria-label="Abas da tarefa">
            <button aria-pressed={detailTab === "data"} onClick={() => setDetailTab("data")}>
              Dados da tarefa
            </button>
            <button
              aria-pressed={detailTab === "movements"}
              onClick={() => setDetailTab("movements")}
            >
              Movimentações
            </button>
            <button aria-pressed={detailTab === "flow"} onClick={() => setDetailTab("flow")}>
              Fluxo do processo
            </button>
          </nav>
          <TaskRequestContext events={data?.events || []} />
          <section
            hidden={detailTab !== "movements"}
            className="ut-movements"
            onChange={() => setFieldsDirty(true)}
          >
            {canAct && data && (
              <TaskRoutingActions
                key={`${t.id}:${t.stage}:${t.status}:${t.assigned_to}`}
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
            <div className="ut-movement-history" aria-label="Histórico de movimentações">
              {(data?.events || [])
                .filter((ev) => ev.movement_action)
                .sort((a, b) => b.created_at.localeCompare(a.created_at))
                .map((ev) => (
                  <article key={ev.id} className="ut-routing-description">
                    <div className="ut-movement-heading">
                      <strong>{movementActivityTitle(ev.movement_action!, t.kind)}</strong>
                      <time dateTime={ev.created_at}>
                        {new Date(ev.created_at).toLocaleString("pt-BR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                      </time>
                    </div>
                    <div className="ut-movement-author">
                      {ev.actor_photo && <img src={ev.actor_photo} alt="" />}
                      <span>{ev.actor_name}</span>
                    </div>
                    <p style={{ whiteSpace: "pre-wrap" }}>
                      {ev.movement_note || "Sem descrição registrada."}
                    </p>
                  </article>
                ))}
            </div>
          </section>
          {detailTab === "flow" && <TaskProcessFlow task={t} />}
          <div hidden={detailTab !== "data"}>
            <div className="ut-detail-grid">
              <section className="ut-detail-main">
                <div className="ut-detail" onChange={() => setFieldsDirty(true)}>
                  <div className="ut-inline">
                    <span className={`ut-status ut-status-${t.status}`}>
                      {TASK_STATUS_LABELS[t.status]}
                    </span>
                    {t.kind === "mapping" && <strong>{TASK_STAGE_LABELS[t.stage]}</strong>}
                  </div>
                  {data &&
                  (data.isAdmin ||
                    (t.assigned_to === data.userId && t.documenter_id === data.userId)) &&
                  !["completed", "cancelled"].includes(t.status) ? (
                    <TaskManagement task={t} data={data} busy={busy} write={write} />
                  ) : (
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
                        max={t.checklist.length || 1}
                        value={t.checklist.length - remainder.length}
                      />
                    </div>
                    <p className="ut-muted">Rascunhos permanecem em andamento.</p>
                    {t.status === "completed" && <TaskChecklistDownload task={t} />}
                    <TaskChecklist
                      task={t}
                      canEdit={!!canEdit}
                      busy={busy}
                      hideDone={hideDone}
                      edit={setEditing}
                      write={write}
                      setBusy={setBusy}
                    />
                  </section>

                  {error && (
                    <p role="alert" className="ut-error">
                      {error}
                    </p>
                  )}
                </div>
              </section>
              <aside className="ut-detail-history">
                <nav
                  className="ut-inline ut-detail-tabs ut-activity-tabs"
                  aria-label="Acompanhamento da tarefa"
                >
                  <button
                    aria-pressed={activityTab === "comments"}
                    onClick={() => setActivityTab("comments")}
                  >
                    Comentários e atividade
                  </button>
                  <button
                    aria-pressed={activityTab === "meetings"}
                    onClick={() => setActivityTab("meetings")}
                  >
                    Reuniões
                  </button>
                </nav>
                <div hidden={activityTab !== "comments"}>
                  {data && (
                    <TaskComment
                      task={t}
                      userId={data.userId}
                      busy={busy}
                      write={write}
                      onDirty={setCommentDirty}
                    />
                  )}
                  {data?.events.map((ev) => (
                    <article className="ut-activity" key={ev.id}>
                      <span className="ut-avatar" aria-hidden="true">
                        {ev.actor_photo ? (
                          <img src={ev.actor_photo} alt="" className="ut-comment-photo" />
                        ) : (
                          ev.actor_name
                            .split(" ")
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join("")
                        )}
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
                        {ev.attachments?.map((a) => (
                          <CommentAttachment key={a.path} attachment={a} />
                        ))}
                      </div>
                    </article>
                  ))}
                  <small>Histórico completo · {data?.events.length || 0} registros.</small>
                </div>
                {activityTab === "meetings" && (
                  <TaskMeetings
                    organizationId={organizationId}
                    tasks={[t]}
                    taskId={t.id}
                    isAdmin={data?.isAdmin}
                  />
                )}
              </aside>
            </div>
          </div>
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
  const systemRecord = item.entry_type === "mapping" || item.entry_type === "pop";
  const persist = async (completed: boolean, finish = true) => {
    if (systemRecord && !doc?.id && !item.document_id) {
      setError("Selecione um registro para vincular ao checklist.");
      return;
    }
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
        {!systemRecord && (
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
        )}
        {systemRecord && (
          <p className="ut-muted">
            Selecione um registro do módulo de origem. O vínculo preserva seu conteúdo e código.
          </p>
        )}
        {!readOnly && (
          <DocumentPicker
            organizationId={organizationId}
            value={doc?.id || item.document_id || ""}
            module={
              item.entry_type === "mapping" ? "ddp" : item.entry_type === "pop" ? "pop" : undefined
            }
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
              {systemRecord ? "Vincular registro" : "Salvar"}
            </button>
          ))}
      </footer>
    </TaskDialog>
  );
}
