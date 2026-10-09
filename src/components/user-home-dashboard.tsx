import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { loadHomeDashboard } from "@/lib/user-tasks.functions";
import { localDay, monthDays, taskCode, TASK_STAGE_LABELS, type UserTask } from "@/lib/user-tasks";
import { TaskMeetings } from "./task-meetings";
import "./user-home-dashboard.css";
const date = (day: string) => new Date(day + "T12:00:00");
const label = (day: string, options: Intl.DateTimeFormatOptions) =>
  date(day).toLocaleDateString("pt-BR", options);
const taskUrl = (filters: object) =>
  `/?view=tasks&taskState=${encodeURIComponent(JSON.stringify(filters))}`;
type Scale = "week" | "month" | "year";
function chartRange(anchor: string, scale: Scale) {
  const selected = date(anchor);
  const start =
    scale === "year"
      ? new Date(selected.getFullYear(), 0, 1)
      : scale === "month"
        ? new Date(selected.getFullYear(), selected.getMonth(), 1)
        : new Date(
            selected.getFullYear(),
            selected.getMonth(),
            selected.getDate() - ((selected.getDay() + 6) % 7),
          );
  const end =
    scale === "year"
      ? new Date(selected.getFullYear(), 11, 31)
      : scale === "month"
        ? new Date(selected.getFullYear(), selected.getMonth() + 1, 0)
        : new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { start, end };
}
export function UserHomeDashboard({
  organizationId,
  openTask,
  isAdmin,
}: {
  organizationId: string;
  openTask: (id: string) => void;
  isAdmin: boolean;
}) {
  const today = localDay();
  const [selected, setSelected] = useState(today),
    [month, setMonth] = useState(today.slice(0, 7));
  const [scale, setScale] = useState<Scale>("week"),
    [chartAnchor, setChartAnchor] = useState(today);
  const requestedDays = monthDays(month);
  const requestedChartRange = chartRange(chartAnchor, scale);
  const load = useServerFn(loadHomeDashboard);
  const query = useQuery({
    queryKey: ["home-dashboard", organizationId, month, scale, chartAnchor],
    queryFn: async () => ({
      payload: await load({
        data: {
          organizationId,
          from: requestedDays[0],
          until: requestedDays[41],
          chartFrom: localDay(requestedChartRange.start),
          chartUntil: localDay(requestedChartRange.end),
        },
      }),
      organizationId,
      month,
      scale,
      chartAnchor,
    }),
    placeholderData: (previous) =>
      previous?.organizationId === organizationId ? previous : undefined,
  });
  const data = query.data?.payload;
  const displayMonth = query.data?.month ?? month;
  const displayScale = query.data?.scale ?? scale;
  const displayChartAnchor = query.data?.chartAnchor ?? chartAnchor;
  useEffect(() => {
    if (!query.isPlaceholderData && query.data?.month === month && !selected.startsWith(month)) {
      setSelected(month + "-01");
    }
  }, [month, query.data?.month, query.isPlaceholderData, selected]);
  const days = monthDays(displayMonth);
  const d = date(displayChartAnchor);
  const { start: chartStart, end: chartEnd } = chartRange(displayChartAnchor, displayScale);
  const moveMonth = (delta: number) => {
    const m = date(displayMonth + "-01");
    m.setMonth(m.getMonth() + delta);
    setMonth(localDay(m).slice(0, 7));
  };
  const moveChart = (delta: number) => {
    const v = date(displayChartAnchor);
    if (displayScale === "week") v.setDate(v.getDate() + delta * 7);
    else if (displayScale === "month") {
      v.setDate(1);
      v.setMonth(v.getMonth() + delta);
    } else {
      v.setMonth(0, 1);
      v.setFullYear(v.getFullYear() + delta);
    }
    setChartAnchor(localDay(v));
  };
  if (!data && query.isLoading)
    return (
      <p className="ut-empty" role="status">
        Carregando sua agenda…
      </p>
    );
  if (!data && query.error)
    return (
      <div className="ut-error" role="alert">
        {query.error?.message}
        <button onClick={() => void query.refetch()}>Tentar novamente</button>
      </div>
    );
  if (!data)
    return (
      <p className="ut-empty" role="status">
        Carregando sua agenda…
      </p>
    );
  const buckets =
    displayScale === "year"
      ? Array.from({ length: 12 }, (_, i) => ({
          key: `${d.getFullYear()}-${String(i + 1).padStart(2, "0")}`,
          text: new Date(d.getFullYear(), i, 1).toLocaleDateString("pt-BR", { month: "short" }),
        }))
      : Array.from(
          { length: Math.round((chartEnd.getTime() - chartStart.getTime()) / 86400000) + 1 },
          (_, i) => {
            const dt = new Date(
              chartStart.getFullYear(),
              chartStart.getMonth(),
              chartStart.getDate() + i,
            );
            return {
              key: localDay(dt),
              text:
                displayScale === "week"
                  ? dt.toLocaleDateString("pt-BR", { weekday: "short" })
                  : String(dt.getDate()),
            };
          },
        );
  const values = buckets.map((b) =>
    data.completions
      .filter((c) => (displayScale === "year" ? c.day.startsWith(b.key) : c.day === b.key))
      .reduce((s, c) => s + c.count, 0),
  );
  const observed = buckets.filter(
    (b) => b.key <= (displayScale === "year" ? today.slice(0, 7) : today),
  ).length;
  const sum = values.reduce((a, b) => a + b, 0),
    mean = observed ? sum / observed : 0,
    mx = (observed - 1) / 2;
  const denom = values.slice(0, observed).reduce((s, _, i) => s + (i - mx) ** 2, 0);
  const slope = denom
    ? values.slice(0, observed).reduce((s, v, i) => s + (i - mx) * (v - mean), 0) / denom
    : 0;
  const trend = values.slice(0, observed).map((_, i) => Math.max(0, mean + slope * (i - mx)));
  const max = Math.ceil(Math.max(1, ...values, ...trend) / 4) * 4,
    chartWidth = displayScale === "week" ? 700 : 1100,
    plotWidth = chartWidth - 60,
    plotEnd = chartWidth - 20,
    step = plotWidth / buckets.length;
  return (
    <div className="uh-dashboard">
      {query.isFetching && (
        <p className="ut-empty" role="status">
          Atualizando agenda e gráfico…
        </p>
      )}
      {query.error && data && (
        <div className="ut-error" role="alert">
          Não foi possível atualizar este período. Os dados anteriores continuam disponíveis.
          <button onClick={() => void query.refetch()}>Tentar novamente</button>
        </div>
      )}
      <section className="uh-agenda">
        <div className="uh-heading">
          <div>
            <h2>Minha agenda</h2>
            <p>Tarefas do período e reuniões em um só lugar.</p>
          </div>
          <a href={taskUrl({ layout: "calendar", anchor: selected })}>
            Abrir calendário completo →
          </a>
        </div>
        <TaskMeetings
          home
          organizationId={organizationId}
          tasks={data.tasks}
          anchor={displayMonth + "-01"}
          isAdmin={isAdmin}
          render={(rows, openMeeting) => {
            const entries = rows
              .filter((r) => r.starts_on <= selected && r.due_on >= selected)
              .sort((a, b) =>
                a.meeting && b.meeting
                  ? a.meeting.starts_at.localeCompare(b.meeting.starts_at)
                  : Number(!!b.meeting) - Number(!!a.meeting),
              );
            return (
              <div className="uh-agenda-body">
                <div className="uh-month">
                  <div className="uh-month-top">
                    <strong>
                      {label(displayMonth + "-01", { month: "long", year: "numeric" })}
                    </strong>
                    <button
                      aria-label="Mês anterior"
                      disabled={query.isPlaceholderData}
                      onClick={() => moveMonth(-1)}
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      aria-label="Próximo mês"
                      disabled={query.isPlaceholderData}
                      onClick={() => moveMonth(1)}
                    >
                      <ChevronRight size={16} />
                    </button>
                    <button
                      disabled={query.isPlaceholderData}
                      onClick={() => {
                        setMonth(today.slice(0, 7));
                        setSelected(today);
                      }}
                    >
                      Hoje
                    </button>
                  </div>
                  <div className="uh-calendar">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((w) => (
                      <span className="uh-week" key={w}>
                        {w}
                      </span>
                    ))}
                    {days.map((day) => {
                      const items = rows.filter((r) => r.starts_on <= day && r.due_on >= day),
                        tasks = items.filter((r) => !r.meeting).length,
                        meetings = items.length - tasks;
                      return (
                        <button
                          key={day}
                          disabled={query.isPlaceholderData}
                          className={`uh-day ${day === today ? "uh-today" : ""} ${!day.startsWith(displayMonth) ? "uh-out" : ""}`}
                          aria-pressed={day === selected}
                          aria-label={`${label(day, { dateStyle: "short" })}: ${tasks} tarefas e ${meetings} reuniões`}
                          title={`${tasks} tarefas · ${meetings} reuniões`}
                          onClick={() => {
                            setSelected(day);
                            if (!day.startsWith(displayMonth)) setMonth(day.slice(0, 7));
                          }}
                        >
                          <span>{Number(day.slice(8))}</span>
                          <i>
                            {tasks > 0 && <b />}
                            {meetings > 0 && <b className="uh-meeting-dot" />}
                          </i>
                        </button>
                      );
                    })}
                  </div>
                  <div className="uh-legend">
                    <span>
                      <i />
                      Tarefa no período
                    </span>
                    <span>
                      <i className="uh-meeting-dot" />
                      Reunião
                    </span>
                  </div>
                </div>
                <div className="uh-selected">
                  <div className="uh-selected-heading">
                    <strong>
                      {selected === today ? "Hoje · " : ""}
                      {label(selected, { day: "2-digit", month: "long" })}
                    </strong>
                    <small>{entries.length} atividades</small>
                  </div>
                  <div className="uh-day-list">
                    {entries.map((r) => (
                      <button
                        key={r.id}
                        className={`uh-activity ${r.meeting ? "uh-meeting" : ""}`}
                        onClick={() => (r.meeting ? openMeeting(r.id) : openTask(r.id))}
                      >
                        <span>
                          <small>{r.meeting ? `REUNIÃO · ${r.assignee_name}` : taskCode(r)}</small>
                          <strong>{r.title.replace(/^Reunião · /, "")}</strong>
                          <small>
                            {r.meeting
                              ? r.meeting.task_id
                                ? "Reunião vinculada a uma tarefa"
                                : "Compromisso pessoal"
                              : `${TASK_STAGE_LABELS[(r as UserTask).stage]} · Prazo ${label(r.due_on, { dateStyle: "short" })}`}
                          </small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                    {!entries.length && (
                      <p className="ut-empty">Nenhuma tarefa ou reunião neste dia.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          }}
        />
        <div className="uh-attention">
          <a
            className={data.attention.overdue ? "ut-late" : ""}
            href={taskUrl({ layout: "list", status: "open", dueBefore: today })}
          >
            <b>{data.attention.overdue}</b> tarefas vencidas
          </a>
          <a
            href={taskUrl({
              layout: "list",
              status: "open",
              dueFrom: today,
              dueThrough: localDay(new Date(date(today).getTime() + 3 * 86400000)),
            })}
          >
            <b>{data.attention.dueSoon}</b> vencem nos próximos 3 dias
          </a>
          <a href={taskUrl({ layout: "list", stage: "technical_review", status: "open" })}>
            <b>{data.attention.review}</b> aguardam sua análise
          </a>
        </div>
      </section>
      <section className="uh-chart">
        <div className="uh-heading">
          <div>
            <h2>Tarefas concluídas</h2>
            <p>
              {label(localDay(chartStart), { dateStyle: "short" })} a{" "}
              {label(localDay(chartEnd), { dateStyle: "short" })}
            </p>
          </div>
          <div className="uh-chart-controls">
            <button
              aria-label="Período anterior do gráfico"
              disabled={query.isPlaceholderData}
              onClick={() => moveChart(-1)}
            >
              <ChevronLeft size={16} />
            </button>
            <button
              aria-label="Próximo período do gráfico"
              disabled={query.isPlaceholderData}
              onClick={() => moveChart(1)}
            >
              <ChevronRight size={16} />
            </button>
            <button disabled={query.isPlaceholderData} onClick={() => setChartAnchor(today)}>
              Atual
            </button>
            <div className="ut-density-switch" role="group" aria-label="Escala do gráfico">
              {(["week", "month", "year"] as const).map((s, i) => (
                <button
                  key={s}
                  disabled={query.isPlaceholderData}
                  aria-pressed={displayScale === s}
                  onClick={() => setScale(s)}
                >
                  {["Semana", "Mês", "Ano"][i]}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="uh-chart-total">
          <strong>{sum}</strong>
          <span>tarefas concluídas no período</span>
        </div>
        <svg
          viewBox={`0 0 ${chartWidth} 210`}
          role="img"
          aria-label={`Tarefas concluídas: ${sum}. ${buckets.map((b, i) => `${b.text}: ${values[i]}`).join("; ")}`}
        >
          {[0, 1, 2, 3, 4].map((i) => (
            <g key={i}>
              <line
                x1="40"
                x2={plotEnd}
                y1={175 - i * 37.5}
                y2={175 - i * 37.5}
                stroke="var(--border)"
              />
              <text x="28" y={179 - i * 37.5} textAnchor="end">
                {(max * i) / 4}
              </text>
            </g>
          ))}
          {buckets.map((b, i) => (
            <g key={b.key}>
              <rect
                x={40 + step * (i + 0.5) - Math.min(44, step * 0.58) / 2}
                y={175 - (values[i] / max) * 150}
                width={Math.min(44, step * 0.58)}
                height={(values[i] / max) * 150}
                rx="3"
                fill="var(--gold)"
              >
                <title>
                  {b.text}: {values[i]} tarefas
                </title>
              </rect>
              {(displayScale !== "month" || i % 2 === 0) && (
                <text x={40 + step * (i + 0.5)} y="199" textAnchor="middle">
                  {b.text}
                </text>
              )}
            </g>
          ))}
          {observed > 1 && sum > 0 && (
            <polyline
              points={trend
                .map((v, i) => `${40 + step * (i + 0.5)},${175 - (v / max) * 150}`)
                .join(" ")}
              fill="none"
              stroke="var(--muted-foreground)"
              strokeWidth="2.5"
            />
          )}
        </svg>
        <div className="uh-legend">
          <span>
            <i />
            Concluídas
          </span>
          <span>— Tendência</span>
        </div>
        <p className="uh-chart-note">
          {sum
            ? "Tendência por regressão linear, considerando apenas datas até hoje."
            : "Nenhuma conclusão registrada neste período."}
          {data.unknownCompletions > 0
            ? ` ${data.unknownCompletions} tarefas antigas sem data de conclusão não entram no gráfico.`
            : ""}
        </p>
      </section>
    </div>
  );
}
