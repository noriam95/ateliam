export const TASK_MODALITIES = ["Sistemas", "Operacional", "Automação & IA", "Dados / BI"] as const;
export const TASK_STATUSES = ["pending", "in_progress", "review", "completed"] as const;
export const TASK_STATUS_LABELS = {
  pending: "A fazer",
  in_progress: "Em andamento",
  review: "Em revisão",
  completed: "Concluída",
};
export const TASK_KINDS = {
  mapping: "Mapeamentos",
  improvement: "Melhorias",
  document: "Documentos",
};
export type TaskItem = {
  key: string;
  label: string;
  completed: boolean;
  content: string;
  document_id: string | null;
  saved_version: number | null;
  saved_at?: string | null;
  stale?: boolean;
  document_module?: string;
};
export type TaskDocument = {
  id: string;
  name: string;
  module: string;
  code: string;
  current_version: number;
};
export type UserTask = {
  id: string;
  organization_id: string;
  document_id: string | null;
  title: string;
  kind: keyof typeof TASK_KINDS;
  modality: string | null;
  assigned_to: string;
  requested_by: string;
  starts_on: string;
  due_on: string;
  status: keyof typeof TASK_STATUS_LABELS;
  stage: keyof typeof TASK_STAGE_LABELS;
  documenter_id: string;
  reviewer_id: string | null;
  return_stage: string | null;
  adjustment_request: string;
  checklist: TaskItem[];
  revision: number;
  code: string;
  document_module: string;
  assignee_name: string;
  requester_name: string;
  pending_at_transition: string[];
};
export type TaskFeed = {
  tasks: UserTask[];
  total: number;
  userId: string;
  isAdmin: boolean;
  canCreate: boolean;
  summary: { mapping: number; improvement: number; document: number; overdue: number };
  people: { id: string; name: string; can_edit: boolean }[];
  documents: TaskDocument[];
  events: { id: string; action: string; note: string; created_at: string; actor_name: string }[];
};
export type TaskFilters = {
  q?: string;
  status?: string;
  kind?: string;
  modality?: string;
  from?: string;
  until?: string;
  team?: boolean;
  offset?: number;
  id?: string;
  documentQuery?: string;
};
export function taskDate(value: string) {
  return value ? value.slice(0, 10).split("-").reverse().join("/") : "—";
}
export function localDay(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function monthDays(month: string) {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(year, m - 1, 1);
  const start = new Date(year, m - 1, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) =>
    localDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)),
  );
}
export function documentTaskUrl(task: UserTask, item: TaskItem, document: TaskDocument) {
  return `/m/${document.module}?document=${document.id}&task=${task.id}&item=${encodeURIComponent(item.key)}&taskOrg=${task.organization_id}`;
}

export const TASK_STAGE_LABELS = {
  documentation: "Documentação",
  technical_review: "Revisão técnica",
  owner_approval: "Aprovação do dono do processo",
  completed: "Concluído",
};

export type TaskAction =
  | "item"
  | "transition"
  | "assign"
  | "send_review"
  | "approve_review"
  | "request_adjustments"
  | "record_owner_approval"
  | "admin_move"
  | "comment";
