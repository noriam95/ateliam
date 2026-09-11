import { useState, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { loadTaskMeetings, saveTaskMeeting, type TaskMeeting } from "@/lib/task-meetings.functions";
import { localDay, type UserTask } from "@/lib/user-tasks";
import { periodRange, type TaskPeriod } from "@/lib/task-period";
import { TaskDialog } from "./task-dialog";
export type ScheduleEntry = Pick<
  UserTask,
  "id" | "code" | "title" | "starts_on" | "due_on" | "status" | "assignee_name"
> & { meeting?: TaskMeeting };
const clock = (date: string) =>
  new Date(date).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const datetime = (value: string) => {
  const d = new Date(value);
  return (
    localDay(d) +
    "T" +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0")
  );
};
export function outlookMeetingUrl(m: TaskMeeting) {
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: m.title,
    startdt: new Date(m.starts_at).toISOString(),
    enddt: new Date(m.ends_at).toISOString(),
    body: m.agenda + "\nParticipantes: " + m.attendees.join("; "),
    to: m.attendees.join(";"),
  });
  return "https://outlook.office.com/calendar/0/deeplink/compose?" + q;
}
export function TaskMeetings({
  organizationId,
  tasks,
  anchor = localDay(),
  period = "month",
  taskId,
  isAdmin = false,
  render,
}: {
  organizationId: string;
  tasks: UserTask[];
  anchor?: string;
  period?: TaskPeriod;
  taskId?: string;
  isAdmin?: boolean;
  render?: (items: ScheduleEntry[], open: (id: string) => void) => ReactNode;
}) {
  const cache = useQueryClient();
  const meetingId = useRef(crypto.randomUUID());
  const load = useServerFn(loadTaskMeetings);
  const save = useServerFn(saveTaskMeeting);
  const range = periodRange(anchor, period);
  const [showTasks, setShowTasks] = useState(true);
  const [showMeetings, setShowMeetings] = useState(true);
  const [editor, setEditor] = useState<TaskMeeting | "new" | null>(null);
  const [saved, setSaved] = useState<TaskMeeting | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const query = useQuery({
    queryKey: ["task-meetings", organizationId, range.from, range.until, taskId],
    queryFn: () =>
      load({
        data: {
          organizationId,
          from: new Date(range.from + "T00:00:00").toISOString(),
          until: new Date(range.until + "T23:59:59").toISOString(),
          taskId,
        },
      }),
  });
  const meetings = query.data?.meetings || [];
  const rows: ScheduleEntry[] = [
    ...(showTasks && !taskId ? tasks : []),
    ...(showMeetings
      ? meetings
          .filter((m) => m.status !== "cancelled")
          .map((m) => ({
            id: m.id,
            code: "",
            title: "Reunião · " + m.title,
            starts_on: localDay(new Date(m.starts_at)),
            due_on: localDay(new Date(m.ends_at)),
            assignee_name: clock(m.starts_at) + "–" + clock(m.ends_at),
            status: "pending" as const,
            meeting: m,
          }))
      : []),
  ];
  const openMeeting = (id: string) => {
    const m = meetings.find((m) => m.id === id);
    if (m) {
      setEditor(m);
      setDirty(false);
      setSaved(null);
      setError("");
    }
  };
  const current = editor && editor !== "new" ? editor : null;
  const canEdit = !current || current.organizer_id === query.data?.userId || isAdmin;
  return (
    <div className="ut-meetings">
      <div className="ut-inline">
        {!taskId && (
          <>
            <label>
              <input
                type="checkbox"
                checked={showTasks}
                onChange={(e) => setShowTasks(e.target.checked)}
              />{" "}
              Tarefas
            </label>
            <label>
              <input
                type="checkbox"
                checked={showMeetings}
                onChange={(e) => setShowMeetings(e.target.checked)}
              />{" "}
              Reuniões
            </label>
            <span className="ut-meeting-legend">Azul: reuniões · Dourado: tarefas</span>
          </>
        )}
        <button
          className="ut-primary"
          onClick={() => {
            meetingId.current = crypto.randomUUID();
            setEditor("new");
            setSaved(null);
            setDirty(false);
            setError("");
          }}
        >
          Agendar compromisso
        </button>
      </div>
      {query.isLoading && <p role="status">Carregando reuniões…</p>}
      {query.error && (
        <p role="alert" className="ut-error">
          {query.error.message}
        </p>
      )}
      {render ? (
        render(rows, openMeeting)
      ) : (
        <div className="ut-meeting-list">
          {meetings.map((m) => (
            <button key={m.id} onClick={() => openMeeting(m.id)}>
              <strong>{m.title}</strong>
              <span>
                {new Date(m.starts_at).toLocaleString("pt-BR")} – {clock(m.ends_at)} ·{" "}
                {m.status === "cancelled"
                  ? "Cancelada"
                  : m.status === "completed"
                    ? "Realizada"
                    : "Agendada"}
              </span>
            </button>
          ))}
          {!meetings.length && !query.isLoading && <p>Nenhuma reunião vinculada.</p>}
        </div>
      )}
      {(query.data?.total || 0) > 500 && (
        <p>Mostrando as primeiras 500 reuniões. Selecione um período menor.</p>
      )}
      {editor && (
        <TaskDialog
          title={
            saved ? "Compromisso salvo" : current ? "Detalhes da reunião" : "Agendar compromisso"
          }
          dirty={dirty && !saved}
          busy={busy}
          onClose={() => setEditor(null)}
        >
          {saved ? (
            <>
              <p>
                Reunião salva no BF Flow. Revise o compromisso e confirme os participantes no
                Outlook.
              </p>
              <a
                className="ut-primary"
                href={outlookMeetingUrl(saved)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir no Outlook
              </a>
              <button onClick={() => setEditor(null)}>Concluir</button>
            </>
          ) : (
            <form
              className="ut-form"
              noValidate
              onChange={() => setDirty(true)}
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                const f = Object.fromEntries(new FormData(e.currentTarget));
                const attendees = String(f.attendees || "")
                  .split(/[;,\n]+/)
                  .map((x) => x.trim().toLowerCase())
                  .filter(Boolean);
                if (
                  String(f.title).trim().length < 2 ||
                  !f.startsAt ||
                  !f.endsAt ||
                  String(f.endsAt) <= String(f.startsAt) ||
                  attendees.some((x) => !/^\S+@\S+\.\S+$/.test(x))
                ) {
                  setError(
                    "Informe título, período válido e e-mails separados por ponto e vírgula.",
                  );
                  return;
                }
                setBusy(true);
                try {
                  const m = await save({
                    data: {
                      organizationId,
                      payload: {
                        id: current?.id || meetingId.current,
                        revision: current?.revision,
                        taskId: String(f.taskId || "") || null,
                        title: String(f.title),
                        startsAt: new Date(String(f.startsAt)).toISOString(),
                        endsAt: new Date(String(f.endsAt)).toISOString(),
                        attendees,
                        agenda: String(f.agenda || ""),
                        status: String(f.status) as TaskMeeting["status"],
                      },
                    },
                  });
                  setSaved(m);
                  setDirty(false);
                  await query.refetch();
                  await cache.invalidateQueries({ queryKey: ["task-detail", organizationId] });
                  await cache.invalidateQueries({ queryKey: ["user-tasks", organizationId] });
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {!canEdit && <p>Somente o organizador ou administrador pode editar esta reunião.</p>}
              <fieldset disabled={!canEdit || busy} className="ut-form">
                <label>
                  Título
                  <input name="title" maxLength={200} defaultValue={current?.title || ""} />
                </label>
                <label>
                  Tarefa vinculada (opcional)
                  <select name="taskId" defaultValue={current?.task_id || taskId || ""}>
                    <option value="">Sem vínculo</option>
                    {tasks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.code} · {t.title}
                      </option>
                    ))}
                    {current?.task_id && !tasks.some((t) => t.id === current.task_id) && (
                      <option value={current.task_id}>Tarefa vinculada atual</option>
                    )}
                  </select>
                </label>
                <label>
                  Início
                  <input
                    name="startsAt"
                    type="datetime-local"
                    defaultValue={current ? datetime(current.starts_at) : anchor + "T09:00"}
                  />
                </label>
                <label>
                  Fim
                  <input
                    name="endsAt"
                    type="datetime-local"
                    defaultValue={current ? datetime(current.ends_at) : anchor + "T10:00"}
                  />
                </label>
                <label>
                  Participantes (e-mails)
                  <textarea
                    className="resize-none"
                    name="attendees"
                    rows={2}
                    defaultValue={current?.attendees.join("; ") || ""}
                    placeholder="pessoa@empresa.com; convidado@empresa.com"
                  />
                </label>
                <label>
                  Pauta (opcional)
                  <textarea
                    className="resize-none"
                    name="agenda"
                    rows={3}
                    maxLength={2000}
                    defaultValue={current?.agenda || ""}
                  />
                </label>
                <label>
                  Situação
                  <select name="status" defaultValue={current?.status || "scheduled"}>
                    <option value="scheduled">Agendada</option>
                    <option value="completed">Realizada</option>
                    <option value="cancelled">Cancelada</option>
                  </select>
                </label>
                <p className="ut-muted">
                  Horários no fuso {Intl.DateTimeFormat().resolvedOptions().timeZone}. O envio de
                  convites será confirmado no Outlook.
                </p>
                <button className="ut-primary" disabled={busy}>
                  Salvar compromisso
                </button>
              </fieldset>
              {error && (
                <p role="alert" className="ut-error">
                  {error}
                </p>
              )}
            </form>
          )}
        </TaskDialog>
      )}
    </div>
  );
}
