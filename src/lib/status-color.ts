export type StatusTone =
  "neutral" | "pending" | "progress" | "review" | "approved" | "completed" | "cancelled";

const COLOR_VARIABLES: Record<StatusTone, string> = {
  neutral: "var(--status-neutral)",
  pending: "var(--status-pending)",
  progress: "var(--status-progress)",
  review: "var(--status-review)",
  approved: "var(--status-approved)",
  completed: "var(--status-completed)",
  cancelled: "var(--status-cancelled)",
};

export function statusTone(status: string): StatusTone {
  const normalized = status
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

  if (normalized.includes("cancel") || normalized.includes("atras")) return "cancelled";
  if (normalized.includes("conclu") || normalized.includes("encerr")) return "completed";
  if (normalized.includes("aprov")) return "approved";
  if (normalized.includes("revis")) return "review";
  if (normalized.includes("pend") || normalized.includes("nao iniciad")) return "pending";
  if (
    normalized.includes("andamento") ||
    normalized.includes("ativo") ||
    normalized.includes("salvo")
  ) {
    return "progress";
  }
  return "neutral";
}

export function statusColor(status: string): string {
  return COLOR_VARIABLES[statusTone(status)];
}
