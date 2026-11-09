export const TASK_MODALITIES = [
  "Sistemas",
  "Operacional",
  "Automação & IA",
  "Dados / BI",
  "Outros",
] as const;
export const MAPPING_SCENARIOS = ["AS IS", "TO BE"] as const;
export const TASK_STATUSES = [
  "pending",
  "in_progress",
  "review",
  "paused",
  "completed",
  "cancelled",
] as const;
export const TASK_STATUS_LABELS = {
  pending: "A fazer",
  in_progress: "Em andamento",
  review: "Em revisão",
  paused: "Parada",
  completed: "Concluída",
  cancelled: "Cancelada",
};
export const TASK_KINDS = {
  mapping: "Mapeamentos",
  improvement: "Melhorias",
  document: "Documentos",
};
export type TaskItem = {
  group_key?: string;
  entry_type?: "mapping" | "pop" | "flowchart" | "file" | "note";
  optional?: boolean;
  attachment?: { path: string; name: string; size: number };
  legacy_attachment?: { path: string; name: string; size: number };
  key: string;
  label: string;
  completed: boolean;
  content: string;
  document_id: string | null;
  saved_version: number | null;
  saved_at?: string | null;
  stale?: boolean;
  document_name?: string;
  document_code?: string;
  document_module?: string;
};
export type TaskDocument = {
  id: string;
  name: string;
  module: string;
  code: string;
  current_version: number;
};
export const taskCode = (task: { task_code?: string; code?: string }) =>
  task.task_code || (task.code?.startsWith("TAR.") ? task.code : "Código pendente");
export type UserTask = {
  deleted_at?: string | null;
  deleted_by?: string | null;
  task_code?: string;
  area_id?: string;
  area_name?: string;
  routing_description?: string;
  review_started?: boolean;
  latest_activity?: { action: string; note: string; created_at: string } | null;
  id: string;
  organization_id: string;
  document_id: string | null;
  title: string;
  kind: keyof typeof TASK_KINDS;
  modality: string | null;
  mapping_scenario?: (typeof MAPPING_SCENARIOS)[number] | null;
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
  assignee_photo?: string | null;
  requester_name: string;
  pending_at_transition: string[];
  claimed_by?: string | null;
  claimed_at?: string | null;
  claimable?: boolean;
};
export type TaskFeed = {
  tasks: UserTask[];
  total: number;
  userId: string;
  isAdmin: boolean;
  canCreate: boolean;
  summary: { mapping: number; improvement: number; document: number; overdue: number };
  people: { id: string; name: string; can_edit: boolean }[];
  claimableKinds?: (keyof typeof TASK_KINDS)[];
  configuredKinds?: (keyof typeof TASK_KINDS)[];
  documents: TaskDocument[];
  events: {
    id: string;
    action: string;
    note: string;
    created_at: string;
    attachments?: { path: string; name: string; size: number }[];
    movement_action?: string | null;
    movement_note?: string | null;
    actor_photo?: string | null;
    actor_name: string;
  }[];
};
export type TaskFilters = {
  stage?: string;
  dueBefore?: string;
  dueFrom?: string;
  dueThrough?: string;
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
  documentModule?: "ddp" | "pop" | "bpmn";
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
export function documentTaskPreviewUrl(task: UserTask, item: TaskItem, document: TaskDocument) {
  return `${documentTaskUrl(task, item, document)}&view=task-preview`;
}

export const TASK_STAGE_LABELS = {
  registration: "Preencher solicitação",
  intake: "Analisar demanda",
  documentation: "Atender solicitação",
  technical_review: "Analisar informações",
  owner_approval: "Aprovação do dono do processo",
  completed: "Concluído",
};

export type TaskAction =
  | "delete"
  | "restore"
  | "cancel"
  | "pause"
  | "resume"
  | "edit_details"
  | "edit_title"
  | "start_documentation"
  | "claim"
  | "request_complement"
  | "resubmit"
  | "add_item"
  | "add_entry"
  | "remove_entry"
  | "remove_section"
  | "begin_document"
  | "attach_file"
  | "item"
  | "transition"
  | "assign"
  | "send_review"
  | "approve_review"
  | "request_adjustments"
  | "record_owner_approval"
  | "admin_move"
  | "comment";

export const DEFAULT_MAPPING_SECTIONS = [
  "mapping",
  "flowchart",
  "pop",
  "communication",
  "premises",
];

export function movementActivityTitle(action: string, kind: UserTask["kind"]) {
  if (kind !== "mapping") return action;
  const activities: Record<string, string> = {
    "Seguir para preenchimento": "Analisar demanda",
    "Solicitar complemento da demanda": "Analisar demanda",
    "Reenviar demanda para análise": "Preencher solicitação",
    "Enviar para revisão técnica": "Atender solicitação",
    "Aprovar revisão técnica": "Analisar informações",
    "Revisão técnica aprovada": "Analisar informações",
    "Registrar aprovação da área": "Coletar aprovação da área",
    "Aprovação do dono registrada": "Coletar aprovação da área",
  };
  return activities[action] || action;
}

/** Only the current participant (or administrator) may act in these workflow stages. */
export function taskQuickActions(
  task: UserTask,
  data: Pick<TaskFeed, "userId" | "isAdmin" | "canCreate" | "claimableKinds">,
): ("pause" | "cancel")[] {
  if (
    task.deleted_at ||
    !data.canCreate ||
    ["completed", "cancelled"].includes(task.status) ||
    (!data.isAdmin &&
      (data.claimableKinds === undefined
        ? task.assigned_to !== data.userId
        : !task.claimed_by || task.assigned_to !== data.userId))
  )
    return [];
  const responsibleStage = ["intake", "documentation", "owner_approval"].includes(task.stage);
  const responsible = data.isAdmin || task.documenter_id === data.userId;
  const actions: ("pause" | "cancel")[] = [];
  if (responsibleStage && responsible && task.status !== "paused") actions.push("pause");
  if (task.stage === "registration" || (responsibleStage && responsible)) actions.push("cancel");
  return actions;
}
