export type TaskPeriod = "day" | "week" | "month" | "year";
export const TASK_PERIOD_LABELS = { day: "Dia", week: "Semana", month: "Mês", year: "Ano" };
const date = (value: string) => new Date(`${value}T12:00:00`);
export const dayKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function validDay(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(date(value).getTime()) &&
    dayKey(date(value)) === value
  );
}
export function shiftPeriod(anchor: string, period: TaskPeriod, amount: number) {
  const d = date(anchor);
  if (period === "day" || period === "week")
    d.setDate(d.getDate() + amount * (period === "week" ? 7 : 1));
  else {
    const day = d.getDate();
    d.setDate(1);
    if (period === "month") d.setMonth(d.getMonth() + amount);
    else d.setFullYear(d.getFullYear() + amount);
    d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
  }
  return dayKey(d);
}
export function periodRange(anchor: string, period: TaskPeriod) {
  const first = date(anchor),
    last = date(anchor);
  if (period === "week") {
    first.setDate(first.getDate() - first.getDay());
    last.setTime(first.getTime());
    last.setDate(last.getDate() + 6);
  }
  if (period === "month") {
    first.setDate(1);
    first.setDate(first.getDate() - first.getDay());
    last.setTime(first.getTime());
    last.setDate(last.getDate() + 41);
  }
  if (period === "year") {
    first.setMonth(0, 1);
    last.setMonth(11, 31);
  }
  const days: string[] = [];
  for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) days.push(dayKey(d));
  const label =
    period === "day"
      ? date(anchor).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })
      : period === "week"
        ? `${first.toLocaleDateString("pt-BR")} — ${last.toLocaleDateString("pt-BR")}`
        : date(anchor).toLocaleDateString(
            "pt-BR",
            period === "year" ? { year: "numeric" } : { month: "long", year: "numeric" },
          );
  return { days, from: dayKey(first), until: dayKey(last), label };
}
export function periodColumns(anchor: string, period: TaskPeriod) {
  if (period !== "year")
    return periodRange(anchor, period).days.map((day) => ({
      from: day,
      until: day,
      label: date(day).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    }));
  return Array.from({ length: 12 }, (_, i) => {
    const first = new Date(date(anchor).getFullYear(), i, 1, 12),
      last = new Date(first.getFullYear(), i + 1, 0, 12);
    return {
      from: dayKey(first),
      until: dayKey(last),
      label: first.toLocaleDateString("pt-BR", { month: "short" }),
    };
  });
}
