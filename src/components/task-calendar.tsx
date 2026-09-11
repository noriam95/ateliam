import type { ScheduleEntry } from "./task-meetings";
import { localDay, monthDays, taskDate } from "@/lib/user-tasks";
import { periodRange, type TaskPeriod } from "@/lib/task-period";
export function TaskCalendar({
  tasks,
  anchor,
  period,
  open,
  selectDay,
}: {
  tasks: ScheduleEntry[];
  anchor: string;
  period: TaskPeriod;
  open: (id: string) => void;
  selectDay: (day: string) => void;
}) {
  const days = periodRange(anchor, period).days;
  const onDay = (day: string) => tasks.filter((t) => t.starts_on <= day && t.due_on >= day);
  if (period === "year")
    return (
      <div className="ut-year">
        {Array.from({ length: 12 }, (_, i) => {
          const month = `${anchor.slice(0, 4)}-${String(i + 1).padStart(2, "0")}`;
          return (
            <section key={month} className="ut-mini-month">
              <h3>
                {new Date(`${month}-15T12:00:00`).toLocaleDateString("pt-BR", { month: "long" })}
              </h3>
              <div className="ut-mini-grid">
                {["D", "S", "T", "Q", "Q", "S", "S"].map((s, i) => (
                  <span key={i} aria-hidden="true">
                    {s}
                  </span>
                ))}
                {monthDays(month).map((day) => {
                  const count = onDay(day).length;
                  const meetings = onDay(day).filter((t) => t.meeting).length;
                  return day.startsWith(month) ? (
                    <button
                      key={day}
                      className={`${count ? "ut-has-tasks" : ""} ${meetings ? "ut-has-meetings" : ""} ${day === localDay() ? "ut-current-day" : ""}`}
                      onClick={() => selectDay(day)}
                      aria-label={`${taskDate(day)}, ${count} atividade(s)`}
                      title={`${count} atividade(s)`}
                    >
                      {Number(day.slice(-2))}
                      {count > 0 && (
                        <small>
                          {count - meetings > 0 ? `T:${count - meetings} ` : ""}
                          {meetings > 0 ? `R:${meetings}` : ""}
                        </small>
                      )}
                    </button>
                  ) : (
                    <span key={day} />
                  );
                })}
              </div>
            </section>
          );
        })}
        <p className="ut-muted">
          Selecione um dia para consultar suas tarefas. Os números menores indicam a quantidade de
          atividades da página atual.
        </p>
      </div>
    );
  return (
    <div className="ut-calendar-wrap">
      <div
        className={`ut-calendar ${period === "day" ? "ut-calendar-day" : period === "week" ? "ut-calendar-week" : ""}`}
      >
        {period === "month" &&
          ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((s) => (
            <strong className="ut-weekday" key={s}>
              {s}
            </strong>
          ))}
        {days.map((day) => (
          <section
            key={day}
            className={`ut-day ${period === "month" && !day.startsWith(anchor.slice(0, 7)) ? "ut-other-month" : ""}`}
            aria-label={taskDate(day)}
          >
            <time dateTime={day} className={day === localDay() ? "ut-today" : ""}>
              {Number(day.slice(-2))}
            </time>
            {period !== "month" && (
              <strong className="ut-day-label">
                {new Date(`${day}T12:00:00`).toLocaleDateString("pt-BR", { weekday: "long" })}
              </strong>
            )}
            {period !== "month" && (
              <small className="ut-muted">Tarefas do dia e reuniões com horário</small>
            )}
            {onDay(day).map((t) => (
              <button
                className={t.meeting ? "ut-meeting-event" : "ut-task-event"}
                key={t.id}
                title={t.title}
                onClick={() => open(t.id)}
              >
                <span>
                  {t.code && `${t.code} · `}
                  {t.title}
                </span>
                {period !== "month" && <small>{t.assignee_name}</small>}
                {!t.meeting && t.due_on === day && <b>Prazo</b>}
                {t.meeting && <b>{t.assignee_name}</b>}
              </button>
            ))}
            {period !== "month" && !onDay(day).length && <p className="ut-muted">Sem atividades</p>}
          </section>
        ))}
      </div>
    </div>
  );
}
