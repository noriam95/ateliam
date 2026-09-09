export const MAPPING_MODALITIES = [
  "Sistemas",
  "Operacional",
  "Automação & IA",
  "Dados / BI",
] as const;
export type MappingModality = (typeof MAPPING_MODALITIES)[number];
export const MAPPING_STATUSES = [
  "registered",
  "discovery",
  "documentation",
  "validation",
  "adjustments",
  "completed",
] as const;
export type MappingStatus =
  | "awaiting_registration"
  | (typeof MAPPING_STATUSES)[number]
  | "cancelled";
export const STATUS_LABELS: Record<MappingStatus, string> = {
  awaiting_registration: "Aguardando registro",
  registered: "Registrado",
  discovery: "Em levantamento",
  documentation: "Em documentação",
  validation: "Em validação",
  adjustments: "Em ajustes",
  completed: "Concluído",
  cancelled: "Cancelado",
};
export const NEXT_ACTION: Record<MappingStatus, string> = {
  awaiting_registration: "Registrar mapeamento",
  registered: "Iniciar levantamento",
  discovery: "Realizar entrevistas",
  documentation: "Estruturar entregáveis",
  validation: "Validar documentação",
  adjustments: "Responder aos ajustes",
  completed: "Documentação concluída",
  cancelled: "Demanda cancelada",
};
export const MODALITY_FIELDS: Record<
  MappingModality,
  { key: string; label: string; hint: string }[]
> = {
  Sistemas: [
    {
      key: "requirements",
      label: "Requisitos do sistema",
      hint: "Necessidades operacionais, regras de negócio e critérios de aceite.",
    },
    {
      key: "alignment",
      label: "Alinhamento com Sistemas",
      hint: "Participantes, decisões e condições para desenvolvimento.",
    },
  ],
  Operacional: [
    {
      key: "variations",
      label: "Variações e problemas da execução",
      hint: "Diferenças entre a prática atual e o padrão esperado.",
    },
    {
      key: "future",
      label: "Padrão de execução proposto",
      hint: "Processo futuro, responsabilidades e POP ou IT aplicável.",
    },
  ],
  "Automação & IA": [
    {
      key: "condition",
      label: "Condição das atividades",
      hint: "Identifique atividades manuais, sistêmicas e automatizadas.",
    },
    {
      key: "effort",
      label: "Tempos, volumes e recorrência",
      hint: "Informe unidades, frequência e origem das medições.",
    },
    {
      key: "opportunities",
      label: "Oportunidades de automação / IA",
      hint: "Atividades candidatas, exceções e valor esperado.",
    },
    {
      key: "conditions",
      label: "Requisitos e condições",
      hint: "Regras, dados disponíveis, restrições e avaliação técnica.",
    },
  ],
  "Dados / BI": [
    {
      key: "information",
      label: "Decisões e necessidades de informação",
      hint: "Quem decide, qual decisão precisa tomar e quais informações utiliza.",
    },
    {
      key: "kpis",
      label: "Indicadores e KPIs",
      hint: "Nome, objetivo, fórmula, fonte, periodicidade e responsável por cada indicador.",
    },
  ],
};
export type ChecklistItem = {
  key: string;
  label: string;
  optional: boolean;
  state: "pending" | "done" | "not_applicable";
  evidence: string;
  document_id?: string | null;
};
export function modalityChecklist(modality: MappingModality): ChecklistItem[] {
  const common = [
    ["report", "Relatório do processo"],
    ["bpmn", "Fluxograma BPMN"],
    ["improvements", "Pontos de melhoria"],
  ];
  const specific: Record<MappingModality, string[][]> = {
    Sistemas: [
      ["requirements", "Requisitos do sistema"],
      ["alignment", "Alinhamento com Sistemas"],
    ],
    Operacional: [
      ["procedure", "POP ou Instrução de Trabalho"],
      ["communication", "Comunicado"],
    ],
    "Automação & IA": [
      ["condition", "Condição das atividades"],
      ["effort", "Tempos e volumes"],
      ["opportunities", "Oportunidades de automação / IA"],
      ["conditions", "Requisitos e condições"],
    ],
    "Dados / BI": [
      ["information", "Necessidades de informação"],
      ["kpis", "Indicadores e KPIs"],
    ],
  };
  return [...common, ...specific[modality], ["validation", "Validação com o dono"]].map(
    ([key, label]) => ({
      key,
      label,
      optional: key === "communication",
      state: "pending",
      evidence: "",
    }),
  );
}
export interface MappingDemand {
  id: string;
  number: number;
  organization_id: string;
  title: string;
  purpose: string;
  modality: MappingModality;
  status: MappingStatus;
  analyst_id: string;
  coordinator_id: string;
  process_owner_id: string | null;
  process_id: string | null;
  area: string;
  priority: string;
  registration_due: string;
  due_date: string | null;
  document_id: string | null;
  checklist: ChecklistItem[];
  details: Record<string, string>;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface MappingTask {
  id: string;
  demand_id: string;
  organization_id: string;
  title: string;
  kind: string;
  assigned_to: string;
  status: "pending" | "in_progress" | "waiting" | "completed" | "cancelled";
  due_date: string | null;
  comment: string;
  created_at: string;
}
export interface MappingEvent {
  id: string;
  demand_id: string;
  actor_id: string;
  action: string;
  comment: string;
  created_at: string;
}
export interface WorkflowPerson {
  id: string;
  name: string;
  can_edit: boolean;
}
export interface WorkflowData {
  demands: MappingDemand[];
  tasks: MappingTask[];
  events: MappingEvent[];
  people: WorkflowPerson[];
  coordinators: string[];
  processes: { id: string; name: string; department: string | null }[];
  documents: { id: string; name: string; module: string }[];
  userId: string;
  organizationId: string;
  isAdmin: boolean;
  isCoordinator: boolean;
}
export function demandCode(n: number) {
  return `DEM-${String(n).padStart(5, "0")}`;
}
export function canSubmitChecklist(items: ChecklistItem[]) {
  return items
    .filter((x) => x.key !== "validation")
    .every(
      (x) =>
        x.state === "done" || (x.optional && x.state === "not_applicable" && !!x.evidence.trim()),
    );
}
export function isOverdue(
  date: string | null,
  status: string,
  today = new Date().toLocaleDateString("en-CA"),
) {
  return !!date && date < today && !["completed", "cancelled"].includes(status);
}
export function nextStatuses(status: MappingStatus): MappingStatus[] {
  return (
    {
      awaiting_registration: [],
      registered: ["discovery"],
      discovery: ["documentation"],
      documentation: ["validation"],
      validation: ["adjustments", "completed"],
      adjustments: ["validation"],
      completed: [],
      cancelled: [],
    } as Record<MappingStatus, MappingStatus[]>
  )[status];
}
