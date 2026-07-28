import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Diamond,
  Download,
  Ellipsis,
  Eye,
  Database,
  FileSearch,
  FileText,
  Presentation,
  FlaskConical,
  FolderOpen,
  GitBranch,
  Home,
  ImagePlus,
  Layers,
  Link2,
  ListChecks,
  Lock,
  LogOut,
  Network,
  Palette,
  Users,
  Menu,
  MessageSquare,
  Pencil,
  Plus,
  RotateCcw,
  Rows3,
  Save,
  Search,
  Settings,
  Square,
  TriangleAlert,
  Trash2,
  Upload,
  WandSparkles,
  Workflow,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
  type DragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type JSZip from "jszip";
import { BFFlowMark } from "@/components/bf-flow-mark";
import { ThemeControl } from "@/components/theme-control";
import { UserProfileMenu } from "@/components/user-profile-menu";
import {
  TreeButton as ModuleTreeButton,
  WorkspaceModulesTree,
  WorkspaceRail,
  type WorkspaceRailArea,
} from "@/components/workspace-navigation";
import { DEFAULT_DOCUMENT_MODELS, type DocumentModelRow } from "@/lib/document-models";
import { cn } from "@/lib/utils";
import type { DocxDocumentImport } from "@/lib/docx-document-import";
import type { MappingDocumentImport } from "@/lib/docx-mapping-import";
import { inferExplicitActivityArea } from "@/lib/mapping-actor-inference";
import {
  ProcessRegistrationDialog,
  SystemRegistrationDialog,
  WorkspaceProcessRegistrations,
  type CreatedProcess,
  type ProcessRegistrationView,
} from "@/components/workspace-process-registrations";
import { supabase } from "@/integrations/supabase/client";
import {
  getOrCreateWorkspace,
  getWorkspaceVersionContent,
  listWorkspaceVersions,
} from "@/lib/workspace.functions";
import {
  createOrganizationCause,
  deleteModuleDocument,
  deleteOrganizationCause,
  getModuleDocumentContent,
  getModuleDocumentVersionContent,
  getMe,
  listAccessibleOrganizations,
  listUserAccess,
  listModuleDocumentVersions,
  listModuleDocuments,
  listOrganizationCatalogs,
  listOrganizationDocumentModels,
  reserveCode,
  saveProcessArea,
  saveProcessRegistration,
  saveSystemRegistration,
  savePositionRegistration,
  saveModuleDocument,
  updateOrganizationCause,
} from "@/lib/config.functions";
import {
  type CodeSettings,
  type DocType,
  normalizeRule,
  normalizeSigla,
  previewDocumentCode,
  previewDemoDocumentCode,
  reserveDemoDocumentCode,
} from "@/lib/code-generation";
import {
  deleteDemoWorkspaceVersions,
  getDemoWorkspaceVersion,
  getDemoWorkspaceVersionContent,
  listDemoWorkspaceVersions,
  restoreDemoWorkspaceState,
  saveDemoWorkspaceVersion,
} from "@/lib/demo-session";
import { MODULES, type AteliamModule } from "@/lib/workspace-bridge";
import { toast } from "sonner";

type ModuleRouteView = "new" | "consult" | "cause-new" | "cause-consult" | "cause-edit";

// Tipo de documento (modalidade) associado a cada módulo. O módulo POP é
// resolvido por subtipo (POP/IT/Norma) em documentDocType().
const MODULE_BASE_DOC_TYPE: Record<AteliamModule, DocType> = {
  ddp: "mapeamento",
  pop: "pop",
  bpmn: "fluxograma",
};

// Resolve o tipo de documento considerando o subtipo do POP (POP/IT/Norma).
function documentDocType(moduleId: AteliamModule, tipo?: string | null): DocType {
  if (moduleId === "pop") {
    const normalized = (tipo ?? "").trim().toLowerCase();
    if (normalized.includes("norma")) return "norma";
    if (normalized === "it" || normalized.includes("instru")) return "it";
    return "pop";
  }
  return MODULE_BASE_DOC_TYPE[moduleId];
}

const DOCUMENTATION_TYPE_OPTIONS: PopState["meta"]["tipo"][] = ["Norma", "POP", "IT"];

function documentationTypeName(tipo: PopState["meta"]["tipo"]) {
  if (tipo === "Norma") return "Norma";
  if (tipo === "IT") return "Instrução de Trabalho";
  return "Procedimento Operacional Padrão";
}

function documentationTypeDescription(tipo: PopState["meta"]["tipo"]) {
  if (tipo === "Norma") return "Diretrizes, regras e critérios de aplicação obrigatória.";
  if (tipo === "IT") return "Instruções detalhadas para execução de uma atividade específica.";
  return "Procedimento operacional padronizado para execução do processo.";
}

function documentationContentTitle(tipo: PopState["meta"]["tipo"]) {
  if (tipo === "Norma") return "Diretrizes";
  if (tipo === "IT") return "Instrução de Trabalho";
  return "Procedimento Operacional";
}
// Lê a organização demo ativa (id, slug, code_settings) do localStorage.
function readActiveDemoOrganization(): {
  id: string | null;
  slug: string | null;
  code_settings: CodeSettings | null;
} {
  if (typeof window === "undefined") return { id: null, slug: null, code_settings: null };
  try {
    const activeId = window.localStorage.getItem("ateliam-active-organization");
    const stored = JSON.parse(
      window.localStorage.getItem("ateliam-demo-organizations") ?? "[]",
    ) as Array<{ id: string; slug: string; code_settings?: CodeSettings | null }>;
    const org =
      (Array.isArray(stored) && stored.find((item) => item.id === activeId)) ||
      (Array.isArray(stored) && stored[0]) ||
      null;
    return {
      id: org?.id ?? activeId ?? null,
      slug: org?.slug ?? null,
      code_settings: org?.code_settings ?? null,
    };
  } catch {
    return { id: null, slug: null, code_settings: null };
  }
}

const MODULE_ROUTE_VIEWS = new Set<ModuleRouteView>([
  "new",
  "consult",
  "cause-new",
  "cause-consult",
  "cause-edit",
]);

export const Route = createFileRoute("/_authenticated/m/$module")({
  component: ModuleWorkspacePage,
  validateSearch: (search: Record<string, unknown>) => ({
    view:
      typeof search.view === "string" && MODULE_ROUTE_VIEWS.has(search.view as ModuleRouteView)
        ? (search.view as ModuleRouteView)
        : undefined,
    filter: typeof search.filter === "string" ? search.filter.slice(0, 120) : undefined,
  }),
  beforeLoad: ({ params }) => {
    if (!MODULES.some((m) => m.id === params.module)) throw notFound();
  },
});

const DRAFT_KEY = "ateliam_modern_workspace_v2";
const NAVIGATION_STATE_KEY = "bf-flow-navigation-expanded";

function readModuleNavigationState(defaults: Record<string, boolean>) {
  if (typeof window === "undefined") return defaults;
  try {
    return {
      ...defaults,
      ...(JSON.parse(window.localStorage.getItem(NAVIGATION_STATE_KEY) ?? "{}") as Record<
        string,
        boolean
      >),
    };
  } catch {
    return defaults;
  }
}

const moduleGrayVars = {
  "--accent": "color-mix(in oklab, var(--gold) 12%, var(--background))",
  "--accent-foreground": "var(--foreground)",
  "--brand": "var(--gold)",
  "--brand-foreground": "var(--foreground)",
  "--blue": "var(--gold)",
  "--indigo": "var(--muted-foreground)",
} as CSSProperties;

type RailArea = WorkspaceRailArea;
type ModuleContentMode = "module" | "registrations" | "settings";
type ModuleSurface = "editor" | "consult";
type ModuleRegistrationView = Exclude<ProcessRegistrationView, "value-chains">;
type ModuleSettingsView = "theme";

type TextItem = { id: string; text: string };
type NextStepItem = TextItem & { responsavel?: string; prazo?: string };
type ModuleImage = { id: string; titulo: string; legenda: string; src: string };
type SystemModality =
  | "Sistemas corporativos"
  | "Ferramentas auxiliares"
  | "Documentos e comunicações"
  | "Fontes externas";
const SYSTEM_MODALITY_OPTIONS: SystemModality[] = [
  "Sistemas corporativos",
  "Ferramentas auxiliares",
  "Documentos e comunicações",
  "Fontes externas",
];
function normalizeSystemModality(value?: string | null): SystemModality {
  if (SYSTEM_MODALITY_OPTIONS.includes(value as SystemModality)) return value as SystemModality;
  const normalized = normalizeLabel(value ?? "");
  if (normalized.includes("document") || normalized.includes("comunic"))
    return "Documentos e comunicações";
  if (normalized.includes("ferrament")) return "Ferramentas auxiliares";
  if (normalized.includes("fonte") || normalized.includes("extern")) return "Fontes externas";
  return "Sistemas corporativos";
}
type DdpSystem = {
  id: string;
  systemId?: string;
  nome: string;
  tipo: string;
  dono: string;
  criticidade: string;
  descricao: string;
};
type DdpFlowStep = {
  id: string;
  processId?: string;
  processVersion?: number;
  etapa: string;
  responsavel: string;
  entrada: string;
  atividade: string;
  saida: string;
  sistema: string;
  risco: string;
  observacoes: string;
  images: ModuleImage[];
  substeps: DdpFlowSubstep[];
};
type FlowExecutionType =
  | "Automática"
  | "Manual no sistema"
  | "Manual fora do sistema"
  | "Híbrida (manual/automática)";
const FLOW_EXECUTION_TYPE_OPTIONS: FlowExecutionType[] = [
  "Automática",
  "Manual no sistema",
  "Manual fora do sistema",
  "Híbrida (manual/automática)",
];
type FlowActorType = "" | "area" | "position";
type DdpFlowActivity = {
  id: string;
  codigo: string;
  titulo: string;
  descricao: string;
  classificacao: FlowExecutionType;
  actorType: FlowActorType;
  actorName: string;
  systemIds: string[];
  images: ModuleImage[];
};
type DdpFlowSubstep = {
  id: string;
  processId?: string;
  processVersion?: number;
  codigo: string;
  titulo: string;
  descricao: string;
  tipo: "atividade" | "subprocesso";
  classificacao: FlowExecutionType;
  actorType: FlowActorType;
  actorName: string;
  systemIds: string[];
  images: ModuleImage[];
  activities: DdpFlowActivity[];
};
type SipocRow = {
  id: string;
  fornecedores: string;
  entradas: string;
  processo: string;
  saidas: string;
  clientes: string;
};
type GapItem = {
  id: string;
  sharedCauseId?: string;
  causa: string;
  descricao: string;
  impacto: string;
  acao: string;
  responsavel: string;
  prazo: string;
  prioridade: string;
  status: string;
  comentarios: CauseComment[];
};
type CauseComment = TextItem & { createdAt?: string };
type GlossaryItem = { id: string; termo: string; definicao: string };
type PopSection = {
  id: string;
  code?: string;
  title: string;
  description: string;
  body: string;
  records: string;
  risks: string;
  images: ModuleImage[];
  subitems?: PopProcedureSubitem[];
};
type PopProcedureSubitem = {
  id: string;
  code: string;
  title: string;
  clauses: PopProcedureClause[];
};
type PopProcedureClause = {
  id: string;
  letter: string;
  text: string;
  alert: string;
  images: ModuleImage[];
  blocks?: PopProcedureBlock[];
};
type PopProcedureBlock = {
  id: string;
  text: string;
  images: ModuleImage[];
};
type ResponsibilityItem = { id: string; area: string; cargo?: string; responsabilidade: string };
type ReferenceItem = { id: string; codigo: string; titulo: string; aplicabilidade: string };
type RevisionItem = {
  id: string;
  codigo: string;
  version: string;
  date: string;
  elaborador: string;
  revisor: string;
  aprovador: string;
};
type ChangeItem = { id: string; versao: string; local: string; descricao: string };
type BpmnNodeType = "start" | "task" | "gateway" | "end" | "annotation";
type BpmnTaskType =
  | "none"
  | "user"
  | "service"
  | "manual"
  | "script"
  | "business-rule"
  | "send"
  | "receive";
type BpmnGatewayType = "exclusive" | "parallel" | "inclusive" | "event-based" | "complex";
const BPMN_TASK_TYPES: Array<{ value: BpmnTaskType; label: string }> = [
  { value: "none", label: "Tarefa simples" },
  { value: "user", label: "Usuário" },
  { value: "service", label: "Serviço" },
  { value: "manual", label: "Manual" },
  { value: "script", label: "Script" },
  { value: "business-rule", label: "Regra de negócio" },
  { value: "send", label: "Envio" },
  { value: "receive", label: "Recebimento" },
];
const BPMN_GATEWAY_TYPES: Array<{ value: BpmnGatewayType; label: string }> = [
  { value: "exclusive", label: "Exclusivo" },
  { value: "parallel", label: "Paralelo" },
  { value: "inclusive", label: "Inclusivo" },
  { value: "event-based", label: "Baseado em eventos" },
  { value: "complex", label: "Complexo" },
];

function BpmnNotationIcon({
  kind,
  value,
  className = "h-7 w-7",
  framed = true,
}: {
  kind: "task" | "gateway";
  value: BpmnTaskType | BpmnGatewayType;
  className?: string;
  framed?: boolean;
}) {
  if (kind === "gateway") {
    return (
      <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
        <path d="M16 2 30 16 16 30 2 16Z" fill="none" stroke="currentColor" strokeWidth="1.8" />
        {value === "exclusive" ? (
          <path d="m11 11 10 10m0-10L11 21" stroke="currentColor" strokeWidth="2.4" />
        ) : null}
        {value === "parallel" ? (
          <path d="M16 9v14M9 16h14" stroke="currentColor" strokeWidth="2.4" />
        ) : null}
        {value === "inclusive" ? (
          <circle cx="16" cy="16" r="6" fill="none" stroke="currentColor" strokeWidth="2.2" />
        ) : null}
        {value === "event-based" ? (
          <>
            <circle cx="16" cy="16" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="m16 10 5 4-2 6h-6l-2-6Z" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </>
        ) : null}
        {value === "complex" ? (
          <path d="M16 9v14m-6-3.5 12-7m-12 0 12 7" stroke="currentColor" strokeWidth="2" />
        ) : null}
      </svg>
    );
  }

  return (
    <svg viewBox={framed ? "0 0 72 48" : "0 0 20 20"} className={className} aria-hidden="true">
      {framed ? (
        <rect
          x="2"
          y="3"
          width="68"
          height="42"
          rx="5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
      ) : null}
      <g transform={framed ? "translate(7 7)" : "translate(1 1)"}>
        {value === "user" ? (
          <>
            <circle cx="8" cy="4" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M3.5 15c.4-4 2.2-6.5 4.5-6.5s4.1 2.5 4.5 6.5M5 9l3 3 3-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </>
        ) : null}
        {value === "service" ? (
          <>
            <circle cx="7" cy="9" r="3.6" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="13" cy="4" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.4" />
            <path
              d="M7 3v2m0 8v2M1 9h2m8 0h2m0-9v1.5m0 5V8M9.5 4H11m4 0h1.5"
              stroke="currentColor"
              strokeWidth="1.3"
            />
          </>
        ) : null}
        {value === "manual" ? (
          <path
            d="M1.5 12.5h4L4 9.5c-.7-1.5 1.2-2.3 2-.9l1.3 2.2V4.7c0-1.5 2-1.5 2 0v4-5c0-1.4 2-1.4 2 0v5-4c0-1.4 2-1.3 2 .1v5.7c0 3-2 5.5-5.5 5.5H5.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
            strokeLinejoin="round"
          />
        ) : null}
        {value === "script" ? (
          <path
            d="M4 1.5h9v15H4c2-2 2-4 0-6 2-2 2-4 0-6 1-.8 1.4-1.8 0-3Zm3 4h4M7 9h4m-4 3.5h3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.35"
          />
        ) : null}
        {value === "business-rule" ? (
          <path
            d="M1.5 2.5h15v12h-15Zm0 4h15m-10-4v12m5-8v8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
          />
        ) : null}
        {value === "send" || value === "receive" ? (
          <>
            <path
              d="M1.5 4h15v10h-15Z"
              fill={value === "send" ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <path
              d="m2 4.5 7 5 7-5"
              fill="none"
              stroke={value === "send" ? "var(--card)" : "currentColor"}
              strokeWidth="1.4"
            />
          </>
        ) : null}
      </g>
    </svg>
  );
}
type BpmnNode = {
  id: string;
  type: BpmnNodeType;
  label: string;
  x: number;
  y: number;
  lane: number;
  width?: number;
  height?: number;
  description?: string;
  responsible?: string;
  color?: string;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  taskType?: BpmnTaskType;
  gatewayType?: BpmnGatewayType;
};

type BpmnEdgeSide = "top" | "right" | "bottom" | "left";
type BpmnEdgeAnchor = { side: BpmnEdgeSide; offset: number };
type BpmnResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type BpmnFlow = {
  id: string;
  from?: string;
  to?: string;
  label?: string;
  type?: "sequence" | "message" | "association";
  points?: Array<{ x: number; y: number }>;
  fromAnchor?: BpmnEdgeAnchor;
  toAnchor?: BpmnEdgeAnchor;
  freeFrom?: { x: number; y: number };
  freeTo?: { x: number; y: number };
  strokeColor?: string;
  strokeWidth?: number;
  lineStyle?: "solid" | "dashed";
};

type DdpState = {
  meta: {
    codigo: string;
    subtitulo: string;
    modalidade: "AS IS" | "TO BE";
    titulo: string;
    area: string;
    responsavel: string;
    valueChainId: string;
    valueChainName: string;
    versao: string;
    data: string;
    dataRelatorio: string;
    elaborador: string;
    revisor: string;
    status?: string;
  };
  overview: {
    objetivo: string;
    escopo: string;
    estadoAtual: string;
    kpis: string;
    donoProcesso: string;
    volume: string;
    frequencia: string;
    dores: string;
    oportunidades: string;
  };
  systems: DdpSystem[];
  macroprocess: {
    processId?: string;
    processVersion?: number;
    titulo: string;
    legenda: string;
    src: string;
  };
  steps: DdpFlowStep[];
  sipoc: {
    fornecedores: string;
    entradas: string;
    processo: string;
    saidas: string;
    clientes: string;
  };
  sipocRows: SipocRow[];
  gaps: GapItem[];
  nextSteps: NextStepItem[];
  glossary: GlossaryItem[];
  legacy?: JsonObject;
};

type PopState = {
  meta: {
    tipo: "Norma" | "POP" | "IT";
    codigo: string;
    titulo: string;
    publico: string;
    area: string;
    processo: string;
    versao: string;
    vigencia: string;
    elaboracao: string;
    revisor: string;
    aprovacao: string;
    publicacao: string;
    status: string;
  };
  purpose: {
    objetivo: string;
    abrangencia: string;
    premissas: string;
    importante: string;
  };
  sections: PopSection[];
  responsibilities: ResponsibilityItem[];
  references: ReferenceItem[];
  history: RevisionItem[];
  changes: ChangeItem[];
  legacy?: JsonObject;
};

type BpmnState = {
  poolName: string;
  processId?: string;
  codigo?: string;
  area?: string;
  status?: string;
  poolWidth?: number;
  laneHeights?: number[];
  lanes: string[];
  nodes: BpmnNode[];
  flows: BpmnFlow[];
};

type WorkspaceState = {
  ddp: DdpState;
  pop: PopState;
  bpmn: BpmnState;
};

type VersionRow = {
  id: string;
  version_number: number;
  comment: string | null;
  created_at: string;
};
type JsonObject = Record<string, unknown>;
type WritableFileLike = {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
};
type LocalFileHandle = {
  kind?: "file";
  name: string;
  getFile: () => Promise<File>;
  createWritable?: () => Promise<WritableFileLike>;
};
type WindowWithFileSystemAccess = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<LocalFileHandle[]>;
};
type OpenedLocalFile = {
  name: string;
  moduleId: AteliamModule;
  handle?: LocalFileHandle;
};
type CloudModuleDocument = {
  id: string;
  name: string;
  description: string | null;
  module: string;
  current_version: number;
  updated_at: string;
  primary_process_id: string | null;
  primary_process_version: number | null;
  content_inline: string | null;
};
type ActiveCloudDocument = {
  id: string;
  moduleId: AteliamModule;
  name: string;
};
type ImportResult = {
  workspace: WorkspaceState;
  moduleId: AteliamModule;
  label: string;
};
const CAUSE_STATUS_OPTIONS = ["Não iniciada", "Em andamento", "Encerrado", "Cancelada"] as const;
const CAUSE_PRIORITY_OPTIONS = ["Baixa", "Média", "Alta", "Crítica"] as const;
const DEMO_CATALOGS: OrganizationCatalogs = {
  departments: [
    { id: "demo-dept-processos", name: "Processos", sigla: "PRO" },
    { id: "demo-dept-ti", name: "Tecnologia da Informação", sigla: "TIN" },
  ],
  positions: [
    {
      id: "demo-position-analista",
      title: "Analista de Processos",
      description: "Executa e mantém documentação de processos.",
    },
    {
      id: "demo-position-gestor",
      title: "Gestor da Área",
      description: "Aprova e responde pela aplicação do documento.",
    },
  ],
  processOwners: [
    { id: "demo-owner-processo", name: "Dono do processo" },
    { id: "demo-owner-area", name: "Gestor da área" },
  ],
  causes: [
    {
      id: "demo-cause-info",
      title: "Informação descentralizada",
      description: "Dados e evidências ficam espalhados em canais diferentes.",
      impact: "Retrabalho e baixa rastreabilidade",
      action: "Padronizar registro e responsáveis",
      priority: "Alta",
    },
  ],
  valueChains: [
    {
      id: "demo-chain-operacao",
      name: "Operação e Gestão",
      category: "management",
      description: "Cadeia de valor principal da organização.",
      status: "Ativa",
    },
  ],
  processes: [
    {
      id: "demo-process-bi",
      code: "PROC-001",
      name: "Gestão de Demandas de BI Analytics",
      type: "process",
      value_chain_id: "demo-chain-operacao",
      parent_process_id: null,
      department: "Tecnologia da Informação",
      owner: "Dono do processo",
      description: "Processo corporativo de gestão de demandas.",
      status: "Ativo",
      current_version: 1,
    },
  ],
  systems: [
    {
      id: "sys-erp",
      name: "ERP TOTVS",
      description: "Sistema transacional de gestão (financeiro, fiscal, estoque).",
    },
    {
      id: "sys-powerbi",
      name: "Power BI",
      description: "Plataforma de dashboards e relatórios analíticos.",
    },
    {
      id: "sys-crm",
      name: "HubSpot CRM",
      description: "Gestão de leads, funil e atividades comerciais.",
    },
    {
      id: "sys-ats",
      name: "Gupy (ATS)",
      description: "Recrutamento e seleção: publicação de vagas e triagem.",
    },
    { id: "sys-jira", name: "Jira", description: "Gestão de demandas e projetos de TI." },
    {
      id: "sys-workspace",
      name: "Google Workspace",
      description: "E-mail, colaboração e agenda corporativa.",
    },
  ],
};

function moduleDocumentLabel(moduleId: AteliamModule) {
  if (moduleId === "ddp") return "Mapeamento";
  if (moduleId === "pop") return "Documentação";
  return "Fluxograma";
}

function processDisplayName(process: OrganizationProcess) {
  return `${process.code ? `${process.code} · ` : ""}${process.name}`;
}

function processTypeLabel(type: string) {
  if (type === "macroprocess") return "macroprocesso";
  if (type === "atividade") return "atividade";
  if (type === "task") return "atividade";
  if (type === "subprocess") return "subprocesso";
  return "processo";
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function formatDateBr(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const dateOnly = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toLocaleDateString("pt-BR");
  return raw;
}

function formatDateTimeBr(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return formatDateBr(raw);
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toLocaleString("pt-BR");
  return raw;
}

function parseDateBrInput(value: string) {
  const raw = value.trim();
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return raw;
}

function dateInputValue(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = parseDateBrInput(raw);
  if (/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return parsed;
  return "";
}

function defaultWorkspace(): WorkspaceState {
  return {
    ddp: {
      meta: {
        codigo: "",
        subtitulo: "AS IS",
        modalidade: "AS IS",
        titulo: "",
        area: "",
        responsavel: "",
        valueChainId: "",
        valueChainName: "",
        versao: "0",
        data: today(),
        dataRelatorio: "",
        elaborador: "",
        revisor: "",
        status: "Em andamento",
      },
      overview: {
        objetivo: "",
        escopo: "",
        estadoAtual: "",
        kpis: "",
        donoProcesso: "",
        volume: "",
        frequencia: "",
        dores: "",
        oportunidades: "",
      },
      systems: [],
      macroprocess: {
        processId: "",
        processVersion: 1,
        titulo: "",
        legenda: "",
        src: "",
      },
      steps: [],
      sipoc: {
        fornecedores: "",
        entradas: "",
        processo: "",
        saidas: "",
        clientes: "",
      },
      sipocRows: [
        {
          id: id("sipoc"),
          fornecedores: "",
          entradas: "",
          processo: "",
          saidas: "",
          clientes: "",
        },
      ],
      gaps: [],
      nextSteps: [],
      glossary: [],
    },
    pop: {
      meta: {
        tipo: "POP",
        codigo: "",
        titulo: "",
        publico: "Público Interno",
        area: "",
        processo: "",
        versao: "00",
        vigencia: "",
        elaboracao: "",
        revisor: "",
        aprovacao: "",
        publicacao: "",
        status: "Em andamento",
      },
      purpose: {
        objetivo: "",
        abrangencia: "",
        premissas: "",
        importante: "",
      },
      sections: [
        {
          id: id("sec"),
          code: "3.1",
          title: "3.1 Procedimento principal",
          description: "",
          body: "",
          records: "",
          risks: "",
          images: [],
          subitems: [
            {
              id: id("sub"),
              code: "3.1.1",
              title: "Primeiro subitem",
              clauses: [
                {
                  id: id("clause"),
                  letter: "a",
                  text: "",
                  alert: "",
                  images: [],
                },
              ],
            },
          ],
        },
        {
          id: id("sec"),
          code: "3.2",
          title: "3.2 Tratamento de exceções e registros",
          description: "",
          body: "",
          records: "",
          risks: "",
          images: [],
          subitems: [],
        },
      ],
      responsibilities: [
        {
          id: id("resp"),
          area: "",
          responsabilidade: "",
        },
      ],
      references: [
        {
          id: id("ref"),
          codigo: "",
          titulo: "",
          aplicabilidade: "",
        },
      ],
      history: [
        {
          id: id("rev"),
          codigo: "",
          version: "00",
          date: "",
          elaborador: "",
          revisor: "",
          aprovador: "",
        },
      ],
      changes: [
        {
          id: id("change"),
          versao: "00",
          local: "Documento completo",
          descricao: "Elaboração inicial do documento.",
        },
      ],
    },
    bpmn: {
      poolName: "",
      area: "",
      status: "Em andamento",
      lanes: [],
      laneHeights: [],
      nodes: [],
      flows: [],
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Documentos de demonstração REAIS e encadeados com o DEMO_REGISTRY
// (área → dono → cadeia de valor → processo → mapeamento/documento).
// Servem para visualizar o preenchimento completo dos formulários.
// ─────────────────────────────────────────────────────────────────────────────

type DemoDoc = { id: string; status: string; updatedAt: string; workspace: WorkspaceState };

type DemoDdpSpec = {
  id: string;
  codigo: string;
  titulo: string;
  area: string;
  donoProcesso: string;
  responsavel: string;
  elaborador: string;
  revisor: string;
  valueChainId: string;
  valueChainName: string;
  versao: string;
  status: string;
  modalidade?: "AS IS" | "TO BE";
  updatedAt: string;
  objetivo: string;
  escopo: string;
  estadoAtual: string;
  kpis: string;
  volume: string;
  frequencia: string;
  dores: string;
  oportunidades: string;
  systems: Array<[string, string, string, string]>; // nome, tipo, criticidade, descricao
  steps: Array<[string, string, string, string, string, string, string]>; // etapa, resp, entrada, atividade, saida, sistema, risco
  sipoc: Array<[string, string, string, string, string]>;
  gaps: Array<[string, string, string, string, string, string, string, string]>; // causa, desc, impacto, acao, resp, prazo, prioridade, status
  nextSteps: string[];
  glossary: Array<[string, string]>;
};

function makeDemoDdpWorkspace(spec: DemoDdpSpec): WorkspaceState {
  const base = defaultWorkspace();
  return {
    ...base,
    ddp: {
      ...base.ddp,
      meta: {
        ...base.ddp.meta,
        codigo: spec.codigo,
        modalidade: spec.modalidade ?? "AS IS",
        titulo: spec.titulo,
        area: spec.area,
        responsavel: spec.responsavel,
        valueChainId: spec.valueChainId,
        valueChainName: spec.valueChainName,
        versao: spec.versao,
        elaborador: spec.elaborador,
        revisor: spec.revisor,
      },
      overview: {
        ...base.ddp.overview,
        objetivo: spec.objetivo,
        escopo: spec.escopo,
        estadoAtual: spec.estadoAtual,
        kpis: spec.kpis,
        donoProcesso: spec.donoProcesso,
        volume: spec.volume,
        frequencia: spec.frequencia,
        dores: spec.dores,
        oportunidades: spec.oportunidades,
      },
      systems: spec.systems.map(([nome, tipo, criticidade, descricao]) => ({
        id: id("sys"),
        nome,
        tipo,
        dono: spec.donoProcesso,
        criticidade,
        descricao,
      })),
      macroprocess: { ...base.ddp.macroprocess, legenda: `Macroprocesso AS IS — ${spec.titulo}` },
      steps: spec.steps.map(([etapa, responsavel, entrada, atividade, saida, sistema, risco]) => ({
        id: id("step"),
        etapa,
        responsavel,
        entrada,
        atividade,
        saida,
        sistema,
        risco,
        observacoes: "",
        images: [],
        substeps: [],
      })),
      sipoc: { ...base.ddp.sipoc },
      sipocRows: spec.sipoc.map(([fornecedores, entradas, processo, saidas, clientes]) => ({
        id: id("sipoc"),
        fornecedores,
        entradas,
        processo,
        saidas,
        clientes,
      })),
      gaps: spec.gaps.map(
        ([causa, descricao, impacto, acao, responsavel, prazo, prioridade, status]) => ({
          id: id("gap"),
          causa,
          descricao,
          impacto,
          acao,
          responsavel,
          prazo,
          prioridade,
          status,
          comentarios: [],
        }),
      ),
      nextSteps: spec.nextSteps.map((text) => ({ id: id("next"), text })),
      glossary: spec.glossary.map(([termo, definicao]) => ({ id: id("gloss"), termo, definicao })),
    },
  };
}

const DEMO_MAPPING_SPECS: DemoDdpSpec[] = [
  {
    id: "demo-doc:ddp:MAP.TI.002",
    codigo: "MAP.TI.002",
    modalidade: "TO BE",
    titulo: "Gestão de Demandas de BI & Analytics",
    area: "Tecnologia da Informação",
    donoProcesso: "Carlos Menezes · TI",
    responsavel: "Carlos Menezes · TI",
    elaborador: "Aline Ferreira · Processos & Qualidade",
    revisor: "Carlos Menezes · TI",
    valueChainId: "chain-gestao-ti",
    valueChainName: "Gestão de TI & Inovação",
    versao: "03",
    status: "Aprovado",
    updatedAt: "2026-06-20",
    objetivo:
      "Mapear o ciclo de atendimento das demandas de BI e Analytics, do pedido do solicitante até a publicação do dashboard, identificando gargalos e retrabalho.",
    escopo:
      "Inclui solicitação, priorização, modelagem de dados, construção de dashboards e publicação. Não inclui a infraestrutura do data warehouse.",
    estadoAtual:
      "Demandas chegam por e-mail e canais diversos, sem padronização. A priorização é informal e depende da disponibilidade do time.",
    kpis: "Lead time médio da demanda; % de dashboards publicados no prazo; nº de retrabalhos por demanda.",
    volume: "~25 demandas/mês",
    frequencia: "Fluxo contínuo (diário)",
    dores:
      "Falta de critério claro de priorização; requisitos incompletos; retrabalho por validação tardia com o solicitante.",
    oportunidades:
      "Portal único de demandas, template de requisitos e checkpoint de validação intermediária.",
    systems: [
      [
        "Power BI",
        "Plataforma de BI",
        "Alta",
        "Construção e publicação de dashboards e relatórios.",
      ],
      [
        "Azure SQL / DW",
        "Banco de dados analítico",
        "Alta",
        "Camada de dados consolidada para análise.",
      ],
      [
        "Jira",
        "Gestão de demandas",
        "Média",
        "Registro e acompanhamento das demandas priorizadas.",
      ],
    ],
    steps: [
      [
        "Receber e registrar demanda",
        "Analista de BI",
        "Pedido do solicitante",
        "Registrar a demanda e capturar o objetivo de negócio.",
        "Demanda registrada",
        "Jira",
        "Requisito incompleto",
      ],
      [
        "Priorizar demanda",
        "Carlos Menezes · TI",
        "Backlog de demandas",
        "Classificar por valor e esforço no comitê semanal.",
        "Demanda priorizada",
        "Jira",
        "Priorização subjetiva",
      ],
      [
        "Modelar dados",
        "Engenheiro de Dados",
        "Fontes de dados",
        "Construir/ajustar o modelo de dados necessário.",
        "Modelo pronto",
        "Azure SQL / DW",
        "Qualidade de dados",
      ],
      [
        "Construir dashboard",
        "Analista de BI",
        "Modelo de dados",
        "Desenvolver visualizações conforme requisitos.",
        "Dashboard em homologação",
        "Power BI",
        "Divergência de requisito",
      ],
      [
        "Validar e publicar",
        "Solicitante",
        "Dashboard homologado",
        "Validar com o solicitante e publicar no workspace.",
        "Dashboard publicado",
        "Power BI",
        "Validação tardia",
      ],
    ],
    sipoc: [
      [
        "Áreas de negócio",
        "Pedido e regras de negócio",
        "Atendimento da demanda de BI",
        "Dashboard publicado",
        "Gestores e analistas",
      ],
      [
        "Sistemas transacionais",
        "Dados brutos",
        "Modelagem e consolidação",
        "Base analítica confiável",
        "Time de BI",
      ],
    ],
    gaps: [
      [
        "Priorização informal",
        "Não há critério objetivo para priorizar demandas.",
        "Atrasos e insatisfação das áreas",
        "Implantar matriz valor × esforço no comitê",
        "Carlos Menezes · TI",
        "2026-07-31",
        "Alta",
        "Pendente",
      ],
      [
        "Requisitos incompletos",
        "Demandas chegam sem detalhamento suficiente.",
        "Retrabalho e atraso",
        "Adotar template de requisitos no portal",
        "Aline Ferreira · Processos & Qualidade",
        "2026-07-15",
        "Alta",
        "Em andamento",
      ],
    ],
    nextSteps: [
      "Implantar portal único de demandas com template de requisitos",
      "Definir SLA por tipo de demanda",
      "Validar o mapeamento com o dono do processo",
    ],
    glossary: [
      ["BI", "Business Intelligence — análise de dados para apoio à decisão."],
      ["Lead time", "Tempo total entre a abertura e a entrega da demanda."],
      ["DW", "Data Warehouse — repositório central de dados analíticos."],
    ],
  },
  {
    id: "demo-doc:ddp:MAP.RH.001",
    codigo: "MAP.RH.001",
    titulo: "Recrutamento e Seleção",
    area: "Recursos Humanos",
    donoProcesso: "Juliana Castro · RH",
    responsavel: "Juliana Castro · RH",
    elaborador: "Juliana Castro · RH",
    revisor: "Aline Ferreira · Processos & Qualidade",
    valueChainId: "chain-gestao-pessoas",
    valueChainName: "Gestão de Pessoas",
    versao: "02",
    status: "Em revisão",
    updatedAt: "2026-06-18",
    objetivo:
      "Mapear o fluxo de recrutamento e seleção, da abertura da vaga à admissão, reduzindo o tempo de contratação.",
    escopo:
      "Da requisição de pessoal até a proposta aceita. Não inclui onboarding, tratado em processo próprio.",
    estadoAtual:
      "Triagem manual de currículos e agenda de entrevistas por e-mail, gerando demora e perda de candidatos.",
    kpis: "Tempo médio de contratação (time-to-hire); taxa de aceitação de propostas; nº de candidatos por vaga.",
    volume: "~12 vagas/mês",
    frequencia: "Conforme demanda das áreas",
    dores: "Triagem demorada; baixa padronização de entrevistas; comunicação lenta com candidatos.",
    oportunidades: "ATS para triagem; roteiro de entrevista padrão; comunicação automatizada.",
    systems: [
      [
        "Gupy (ATS)",
        "Recrutamento e seleção",
        "Alta",
        "Publicação de vagas e triagem de candidatos.",
      ],
      ["LinkedIn Recruiter", "Sourcing", "Média", "Busca ativa de candidatos."],
      ["Google Workspace", "Colaboração", "Média", "Agendamento e comunicação."],
    ],
    steps: [
      [
        "Abrir requisição de vaga",
        "Gestor da área",
        "Necessidade de contratação",
        "Registrar a vaga com perfil e justificativa.",
        "Vaga aprovada",
        "Gupy (ATS)",
        "Perfil mal definido",
      ],
      [
        "Divulgar e captar",
        "Analista de R&S",
        "Vaga aprovada",
        "Publicar a vaga e fazer sourcing ativo.",
        "Pipeline de candidatos",
        "Gupy / LinkedIn",
        "Poucos candidatos",
      ],
      [
        "Triar candidatos",
        "Analista de R&S",
        "Currículos recebidos",
        "Avaliar fit técnico e cultural.",
        "Shortlist",
        "Gupy (ATS)",
        "Triagem subjetiva",
      ],
      [
        "Entrevistar",
        "Gestor da área",
        "Shortlist",
        "Conduzir entrevistas conforme roteiro.",
        "Candidato avaliado",
        "Google Workspace",
        "Falta de padronização",
      ],
      [
        "Fazer proposta e admitir",
        "Juliana Castro · RH",
        "Candidato aprovado",
        "Negociar proposta e iniciar admissão.",
        "Colaborador admitido",
        "Gupy (ATS)",
        "Recusa de proposta",
      ],
    ],
    sipoc: [
      [
        "Áreas requisitantes",
        "Requisição de pessoal",
        "Recrutamento e seleção",
        "Profissional contratado",
        "Área requisitante",
      ],
      [
        "Fontes de candidatos",
        "Currículos",
        "Triagem e avaliação",
        "Shortlist qualificada",
        "Gestores",
      ],
    ],
    gaps: [
      [
        "Triagem manual",
        "Currículos avaliados manualmente um a um.",
        "Demora e perda de talentos",
        "Configurar filtros e ranking no ATS",
        "Juliana Castro · RH",
        "2026-07-20",
        "Alta",
        "Pendente",
      ],
      [
        "Entrevistas sem roteiro",
        "Cada gestor entrevista de forma diferente.",
        "Decisão inconsistente",
        "Criar roteiro e ficha de avaliação padrão",
        "Juliana Castro · RH",
        "2026-07-10",
        "Média",
        "Em andamento",
      ],
    ],
    nextSteps: [
      "Padronizar roteiro de entrevista por nível",
      "Automatizar comunicação com candidatos",
      "Validar o mapeamento com o dono do processo",
    ],
    glossary: [
      ["ATS", "Applicant Tracking System — sistema de gestão de candidaturas."],
      ["Time-to-hire", "Tempo entre abertura da vaga e aceite da proposta."],
      ["Sourcing", "Busca ativa de candidatos."],
    ],
  },
  {
    id: "demo-doc:ddp:MAP.FIN.001",
    codigo: "MAP.FIN.001",
    titulo: "Contas a Receber",
    area: "Financeiro & Controladoria",
    donoProcesso: "Bruno Cardoso · Financeiro",
    responsavel: "Bruno Cardoso · Financeiro",
    elaborador: "Bruno Cardoso · Financeiro",
    revisor: "Aline Ferreira · Processos & Qualidade",
    valueChainId: "chain-financeiro",
    valueChainName: "Gestão Financeira",
    versao: "04",
    status: "Aprovado",
    updatedAt: "2026-03-19",
    objetivo:
      "Mapear o ciclo de contas a receber, da emissão da fatura à baixa, melhorando o índice de inadimplência.",
    escopo: "Da emissão da fatura à conciliação bancária. Não inclui negociação de crédito.",
    estadoAtual:
      "Cobrança reativa, sem régua definida; conciliação parcialmente manual no fim do mês.",
    kpis: "DSO (prazo médio de recebimento); % de inadimplência; % de conciliação automática.",
    volume: "~800 títulos/mês",
    frequencia: "Diária",
    dores: "Cobrança tardia; conciliação manual demorada; falta de visão de aging.",
    oportunidades: "Régua de cobrança automatizada; conciliação via API bancária; painel de aging.",
    systems: [
      ["ERP TOTVS", "Sistema transacional", "Alta", "Emissão de faturas, baixa e razão contábil."],
      ["Portal Bancário / API", "Integração financeira", "Alta", "Recebíveis e retorno bancário."],
      [
        "Planilhas de aging",
        "Controle manual",
        "Média",
        "Acompanhamento de vencidos (a ser substituído).",
      ],
    ],
    steps: [
      [
        "Emitir fatura",
        "Analista Financeiro",
        "Pedido faturado",
        "Gerar a fatura e a nota fiscal.",
        "Fatura emitida",
        "ERP TOTVS",
        "Erro de dados cadastrais",
      ],
      [
        "Enviar cobrança",
        "Analista Financeiro",
        "Fatura emitida",
        "Enviar boleto e lembretes ao cliente.",
        "Cobrança enviada",
        "ERP TOTVS",
        "Cobrança tardia",
      ],
      [
        "Receber pagamento",
        "Cliente",
        "Boleto",
        "Cliente efetua o pagamento.",
        "Pagamento recebido",
        "Portal Bancário / API",
        "Pagamento divergente",
      ],
      [
        "Conciliar",
        "Analista Financeiro",
        "Retorno bancário",
        "Conciliar recebimentos e dar baixa.",
        "Título baixado",
        "ERP TOTVS",
        "Conciliação manual",
      ],
      [
        "Tratar inadimplência",
        "Bruno Cardoso · Financeiro",
        "Títulos vencidos",
        "Acionar régua de cobrança e negociação.",
        "Título regularizado",
        "ERP TOTVS",
        "Perda por inadimplência",
      ],
    ],
    sipoc: [
      [
        "Área Comercial",
        "Pedidos faturados",
        "Faturamento e cobrança",
        "Recebimento conciliado",
        "Tesouraria",
      ],
      ["Bancos", "Retorno bancário", "Conciliação e baixa", "Razão atualizado", "Controladoria"],
    ],
    gaps: [
      [
        "Cobrança reativa",
        "Não há régua de cobrança automatizada.",
        "Aumento da inadimplência",
        "Implantar régua automática por faixa de atraso",
        "Bruno Cardoso · Financeiro",
        "2026-04-30",
        "Alta",
        "Concluído",
      ],
      [
        "Conciliação manual",
        "Conciliação feita em planilhas no fim do mês.",
        "Erros e atraso no fechamento",
        "Integrar conciliação via API bancária",
        "Bruno Cardoso · Financeiro",
        "2026-05-31",
        "Média",
        "Em andamento",
      ],
    ],
    nextSteps: [
      "Publicar painel de aging em tempo real",
      "Automatizar a régua de cobrança",
      "Validar o mapeamento com o dono do processo",
    ],
    glossary: [
      ["DSO", "Days Sales Outstanding — prazo médio de recebimento."],
      ["Aging", "Relatório de títulos por faixa de vencimento."],
      ["Conciliação", "Confronto entre extrato bancário e títulos."],
    ],
  },
  {
    id: "demo-doc:ddp:MAP.COM.001",
    codigo: "MAP.COM.001",
    titulo: "Prospecção e Geração de Leads",
    area: "Comercial & Vendas",
    donoProcesso: "Rafael Souza · Comercial",
    responsavel: "Rafael Souza · Comercial",
    elaborador: "Rafael Souza · Comercial",
    revisor: "Aline Ferreira · Processos & Qualidade",
    valueChainId: "chain-comercial",
    valueChainName: "Comercialização & Vendas",
    versao: "01",
    status: "Ativo",
    updatedAt: "2026-06-09",
    objetivo:
      "Mapear a geração e qualificação de leads, do primeiro contato à passagem para vendas, aumentando a taxa de conversão.",
    escopo: "Da captação do lead à qualificação (MQL→SQL). Não inclui negociação e fechamento.",
    estadoAtual:
      "Leads dispersos entre planilhas e e-mails; qualificação sem critério único; baixa rastreabilidade.",
    kpis: "Taxa de conversão lead→SQL; custo por lead; tempo de resposta ao lead.",
    volume: "~400 leads/mês",
    frequencia: "Diária",
    dores: "Leads sem follow-up; qualificação subjetiva; falta de integração marketing-vendas.",
    oportunidades: "CRM único; critério BANT; automação de nutrição.",
    systems: [
      ["HubSpot CRM", "CRM", "Alta", "Gestão de leads, funil e atividades comerciais."],
      ["RD Station", "Automação de marketing", "Média", "Captação e nutrição de leads."],
      ["Planilhas de apoio", "Controle manual", "Baixa", "Controles paralelos (a eliminar)."],
    ],
    steps: [
      [
        "Captar lead",
        "Marketing",
        "Campanhas e formulários",
        "Capturar o lead e registrar a origem.",
        "Lead registrado",
        "RD Station",
        "Lead duplicado",
      ],
      [
        "Qualificar (MQL)",
        "SDR",
        "Lead registrado",
        "Avaliar fit com critério BANT.",
        "Lead qualificado (MQL)",
        "HubSpot CRM",
        "Qualificação subjetiva",
      ],
      [
        "Abordar e nutrir",
        "SDR",
        "MQL",
        "Realizar abordagem e nutrição até o interesse.",
        "Lead engajado",
        "HubSpot CRM",
        "Falta de follow-up",
      ],
      [
        "Converter em SQL",
        "SDR",
        "Lead engajado",
        "Confirmar oportunidade e agendar reunião.",
        "SQL gerado",
        "HubSpot CRM",
        "Passagem incompleta",
      ],
      [
        "Passar para vendas",
        "Rafael Souza · Comercial",
        "SQL gerado",
        "Repassar o SQL ao executivo de vendas.",
        "Oportunidade no funil",
        "HubSpot CRM",
        "Perda na passagem",
      ],
    ],
    sipoc: [
      ["Marketing", "Leads captados", "Qualificação de leads", "SQL qualificado", "Time de Vendas"],
      ["Canais digitais", "Dados de contato", "Nutrição e abordagem", "Lead engajado", "SDRs"],
    ],
    gaps: [
      [
        "Sem critério único",
        "Qualificação varia entre SDRs.",
        "Conversão baixa e inconsistente",
        "Adotar critério BANT padronizado",
        "Rafael Souza · Comercial",
        "2026-07-15",
        "Alta",
        "Pendente",
      ],
      [
        "Follow-up manual",
        "Acompanhamento depende de memória do SDR.",
        "Leads esfriam",
        "Automatizar cadência de follow-up no CRM",
        "Rafael Souza · Comercial",
        "2026-07-05",
        "Média",
        "Pendente",
      ],
    ],
    nextSteps: [
      "Unificar a base de leads no CRM",
      "Definir SLA de resposta ao lead",
      "Validar o mapeamento com o dono do processo",
    ],
    glossary: [
      ["MQL", "Marketing Qualified Lead — lead qualificado pelo marketing."],
      ["SQL", "Sales Qualified Lead — lead qualificado para vendas."],
      ["BANT", "Budget, Authority, Need, Timing — critério de qualificação."],
    ],
  },
];

type DemoPopSpec = {
  id: string;
  tipo: "POP" | "IT" | "Norma";
  codigo: string;
  titulo: string;
  area: string;
  processo: string;
  responsavel: string;
  elaboracao: string;
  aprovacao: string;
  versao: string;
  status: string;
  updatedAt: string;
  objetivo: string;
  abrangencia: string;
  sections: Array<[string, string, string]>; // title, description, body
  responsibilities: Array<[string, string]>; // area, responsabilidade
};

function makeDemoPopWorkspace(spec: DemoPopSpec): WorkspaceState {
  const base = defaultWorkspace();
  return {
    ...base,
    pop: {
      ...base.pop,
      meta: {
        ...base.pop.meta,
        tipo: spec.tipo,
        codigo: spec.codigo,
        titulo: spec.titulo,
        area: spec.area,
        processo: spec.processo,
        versao: spec.versao,
        elaboracao: spec.elaboracao,
        aprovacao: spec.aprovacao,
        status: spec.status,
      },
      purpose: {
        ...base.pop.purpose,
        objetivo: spec.objetivo,
        abrangencia: spec.abrangencia,
      },
      sections: spec.sections.map(([title, description, body]) => ({
        id: id("sec"),
        title,
        description,
        body,
        records: "",
        risks: "",
        images: [],
      })),
      responsibilities: spec.responsibilities.map(([area, responsabilidade]) => ({
        id: id("resp"),
        area,
        responsabilidade,
      })),
    },
  };
}

const DEMO_POP_SPECS: DemoPopSpec[] = [
  {
    id: "demo-doc:pop:POP.RH.001",
    tipo: "POP",
    codigo: "POP.RH.001",
    titulo: "Admissão de Colaborador",
    area: "Recursos Humanos",
    processo: "Recrutamento e Seleção",
    responsavel: "Juliana Castro · RH",
    elaboracao: "Juliana Castro · RH",
    aprovacao: "Aline Ferreira · Processos & Qualidade",
    versao: "02",
    status: "Aprovado",
    updatedAt: "2026-05-04",
    objetivo: "Padronizar a admissão de novos colaboradores, garantindo conformidade e prazo.",
    abrangencia: "Aplica-se a todas as admissões CLT da organização.",
    sections: [
      [
        "1. Pré-requisitos",
        "Documentos e aprovações necessárias",
        "Proposta aceita, documentos pessoais do candidato e exame admissional agendado.",
      ],
      [
        "2. Registro e contrato",
        "Cadastro e formalização",
        "Cadastrar o colaborador no sistema de folha, gerar e colher assinatura do contrato e anexos.",
      ],
      [
        "3. Integração inicial",
        "Acessos e boas-vindas",
        "Solicitar acessos a TI, preparar estação de trabalho e agendar o onboarding.",
      ],
    ],
    responsibilities: [
      ["RH", "Conduzir a admissão e validar a documentação."],
      ["TI", "Provisionar acessos e equipamentos."],
      ["Gestor", "Receber e integrar o novo colaborador."],
    ],
  },
  {
    id: "demo-doc:pop:IT.TI.001",
    tipo: "IT",
    codigo: "IT.TI.001",
    titulo: "Concessão de Acessos",
    area: "Tecnologia da Informação",
    processo: "Gestão de Segurança da Informação",
    responsavel: "Carlos Menezes · TI",
    elaboracao: "Carlos Menezes · TI",
    aprovacao: "Carlos Menezes · TI",
    versao: "01",
    status: "Aprovado",
    updatedAt: "2026-05-22",
    objetivo: "Definir as regras para concessão, revisão e revogação de acessos a sistemas.",
    abrangencia: "Aplica-se a todos os sistemas corporativos e usuários internos.",
    sections: [
      [
        "1. Solicitação",
        "Abertura do pedido",
        "Gestor solicita o acesso via chamado, informando sistema, perfil e justificativa.",
      ],
      [
        "2. Aprovação e provisionamento",
        "Análise e liberação",
        "TI valida o perfil mínimo necessário, aprova e provisiona o acesso registrando evidência.",
      ],
      [
        "3. Revisão periódica",
        "Recertificação",
        "Revisar trimestralmente os acessos ativos e revogar os desnecessários.",
      ],
    ],
    responsibilities: [
      ["Gestor solicitante", "Justificar a necessidade do acesso."],
      ["TI / Segurança", "Conceder o acesso mínimo necessário e registrar."],
    ],
  },
  {
    id: "demo-doc:pop:POP.FIN.001",
    tipo: "POP",
    codigo: "POP.FIN.001",
    titulo: "Conciliação Bancária",
    area: "Financeiro & Controladoria",
    processo: "Contas a Receber",
    responsavel: "Bruno Cardoso · Financeiro",
    elaboracao: "Bruno Cardoso · Financeiro",
    aprovacao: "Aline Ferreira · Processos & Qualidade",
    versao: "03",
    status: "Concluído",
    updatedAt: "2026-04-30",
    objetivo: "Padronizar a conciliação entre extratos bancários e títulos no ERP.",
    abrangencia: "Aplica-se a todas as contas correntes da organização.",
    sections: [
      [
        "1. Importar retorno bancário",
        "Coleta dos dados",
        "Baixar o arquivo de retorno e importar no ERP.",
      ],
      [
        "2. Conciliar movimentos",
        "Confronto",
        "Confrontar recebimentos com títulos em aberto e dar baixa nos correspondentes.",
      ],
      [
        "3. Tratar divergências",
        "Exceções",
        "Investigar divergências, registrar ajustes e escalar quando necessário.",
      ],
    ],
    responsibilities: [
      ["Analista Financeiro", "Executar a conciliação diária."],
      ["Controladoria", "Validar o fechamento mensal."],
    ],
  },
];

const DEMO_DOCUMENTS: Record<AteliamModule, DemoDoc[]> = {
  ddp: DEMO_MAPPING_SPECS.map((spec) => ({
    id: spec.id,
    status: spec.status,
    updatedAt: spec.updatedAt,
    workspace: makeDemoDdpWorkspace(spec),
  })),
  pop: DEMO_POP_SPECS.map((spec) => ({
    id: spec.id,
    status: spec.status,
    updatedAt: spec.updatedAt,
    workspace: makeDemoPopWorkspace(spec),
  })),
  bpmn: [],
};

function asNextStepItem(value: unknown): NextStepItem {
  if (value && typeof value === "object") {
    const row = value as Partial<NextStepItem> & { owner?: unknown; due?: unknown };
    return {
      id: row.id || id("next"),
      text: String(row.text ?? ""),
      responsavel: String(row.responsavel ?? row.owner ?? ""),
      prazo: String(row.prazo ?? row.due ?? ""),
    };
  }
  return { id: id("next"), text: String(value ?? ""), responsavel: "", prazo: "" };
}

function normalizeCauseStatus(value: unknown) {
  const normalized = normalizeLabel(String(value ?? ""));
  if (normalized.includes("andamento")) return "Em andamento";
  if (normalized.includes("conclu") || normalized.includes("encerr")) return "Encerrado";
  if (normalized.includes("cancel")) return "Cancelada";
  return "Não iniciada";
}

function normalizeCausePriority(value: unknown) {
  const normalized = normalizeLabel(String(value ?? ""));
  if (normalized.includes("critic")) return "Crítica";
  if (normalized.includes("alta")) return "Alta";
  if (normalized.includes("baixa")) return "Baixa";
  return "Média";
}

function asCauseComment(value: unknown, prefix: string): CauseComment {
  if (value && typeof value === "object") {
    const row = value as Partial<CauseComment> & { created_at?: string; data?: string };
    return {
      id: row.id || id(prefix),
      text: String(row.text ?? ""),
      createdAt: row.createdAt || row.created_at || row.data,
    };
  }
  return { id: id(prefix), text: String(value ?? "") };
}

function normalizeCauseComments(value: unknown, prefix = "comment") {
  if (Array.isArray(value)) {
    return value.map((item) => asCauseComment(item, prefix)).filter((item) => item.text.trim());
  }
  const text = String(value ?? "").trim();
  if (!text) return [];
  return text
    .split(/\n+/)
    .map((item) => asCauseComment(item, prefix))
    .filter((item) => item.text.trim());
}

function asModuleImage(value: unknown, prefix: string, index: number): ModuleImage {
  const row = asObject(value);
  return {
    id: textAt(row, "id") || id(prefix),
    titulo:
      textAt(row, "titulo") || textAt(row, "title") || textAt(row, "nome") || `Imagem ${index + 1}`,
    legenda: textAt(row, "legenda") || textAt(row, "caption") || textAt(row, "descricao"),
    src: textAt(row, "src") || textAt(row, "imagem") || textAt(row, "dataUrl"),
  };
}

function normalizeImages(values: unknown[] | undefined, prefix: string) {
  return (values ?? [])
    .map((value, index) => asModuleImage(value, prefix, index))
    .filter((image) => image.src);
}

function normalizeFlowExecutionType(value: unknown): FlowExecutionType {
  const normalized = normalizeLabel(String(value ?? ""));
  if (normalized.includes("hibrid")) return "Híbrida (manual/automática)";
  if (normalized.includes("fora")) return "Manual fora do sistema";
  if (normalized.includes("manual")) return "Manual no sistema";
  return "Automática";
}

function normalizeFlowActorType(value: unknown): FlowActorType {
  const normalized = normalizeLabel(String(value ?? ""));
  if (normalized.includes("area") || normalized.includes("departamento")) return "area";
  if (
    normalized.includes("cargo") ||
    normalized.includes("position") ||
    normalized.includes("posicao")
  ) {
    return "position";
  }
  return "";
}

function normalizeDdpActivities(values: unknown[] | undefined, parentCode: string) {
  return (values ?? []).map((value, index): DdpFlowActivity => {
    const row = asObject(value);
    const systemValues = arrayAt(row, "systemIds").length
      ? arrayAt(row, "systemIds")
      : arrayAt(row, "systems");
    return {
      id: textAt(row, "id") || id("activity"),
      codigo: textAt(row, "codigo") || `${parentCode}.${index + 1}`,
      titulo:
        textAt(row, "titulo") ||
        textAt(row, "title") ||
        textAt(row, "nome") ||
        `Atividade ${index + 1}`,
      descricao: textAt(row, "descricao") || textAt(row, "desc") || textAt(row, "text"),
      classificacao: normalizeFlowExecutionType(
        textAt(row, "classificacao") || textAt(row, "classification"),
      ),
      actorType: normalizeFlowActorType(
        textAt(row, "actorType") || textAt(row, "tipoAtor") || textAt(row, "actor_type"),
      ),
      actorName:
        textAt(row, "actorName") ||
        textAt(row, "areaAtor") ||
        textAt(row, "ator") ||
        textAt(row, "actor_name"),
      systemIds: systemValues
        .map((item) => (typeof item === "string" ? item : textAt(asObject(item), "id")))
        .filter(Boolean),
      images: normalizeImages(
        arrayAt(row, "images").length ? arrayAt(row, "images") : arrayAt(row, "imagens"),
        "activityimg",
      ),
    };
  });
}

function normalizeDdpSubsteps(values: unknown[] | undefined) {
  return (values ?? []).map((value, index) => {
    const row = asObject(value);
    const systemValues = arrayAt(row, "systemIds").length
      ? arrayAt(row, "systemIds")
      : arrayAt(row, "systems");
    const tipo =
      textAt(row, "tipo") === "subprocesso" || arrayAt(row, "activities").length
        ? ("subprocesso" as const)
        : ("atividade" as const);
    const activities = normalizeDdpActivities(
      arrayAt(row, "activities").length ? arrayAt(row, "activities") : arrayAt(row, "atividades"),
      textAt(row, "codigo") || String(index + 1),
    );
    const ownSystemIds = systemValues
      .map((item) => (typeof item === "string" ? item : textAt(asObject(item), "id")))
      .filter(Boolean);
    return {
      id: textAt(row, "id") || id("substep"),
      processId: textAt(row, "processId"),
      processVersion: Number(textAt(row, "processVersion") || 1),
      codigo: textAt(row, "codigo") || String(index + 1).padStart(2, "0"),
      titulo: textAt(row, "titulo") || textAt(row, "title") || `Atividade ${index + 1}`,
      descricao: textAt(row, "descricao") || textAt(row, "desc") || textAt(row, "text"),
      tipo,
      classificacao: normalizeFlowExecutionType(
        textAt(row, "classificacao") || textAt(row, "classification"),
      ),
      actorType: normalizeFlowActorType(
        textAt(row, "actorType") || textAt(row, "tipoAtor") || textAt(row, "actor_type"),
      ),
      actorName:
        textAt(row, "actorName") ||
        textAt(row, "areaAtor") ||
        textAt(row, "ator") ||
        textAt(row, "actor_name"),
      systemIds:
        tipo === "subprocesso" && activities.length
          ? Array.from(new Set(activities.flatMap((activity) => activity.systemIds)))
          : ownSystemIds,
      images: normalizeImages(
        arrayAt(row, "images").length ? arrayAt(row, "images") : arrayAt(row, "imagens"),
        "subimg",
      ),
      activities,
    };
  });
}

function normalizeDdp(input: Partial<DdpState> | undefined, fallback: DdpState): DdpState {
  const legacySipoc = input?.sipoc;
  const systems = Array.isArray(input?.systems) ? input.systems : fallback.systems;
  const steps = Array.isArray(input?.steps) ? input.steps : fallback.steps;
  const sipocRows = Array.isArray(input?.sipocRows) ? input.sipocRows : [];
  const gaps = Array.isArray(input?.gaps) ? input.gaps : fallback.gaps;
  const nextSteps = Array.isArray(input?.nextSteps) ? input.nextSteps : fallback.nextSteps;
  const glossary = Array.isArray(input?.glossary) ? input.glossary : fallback.glossary;
  return {
    ...fallback,
    ...input,
    meta: { ...fallback.meta, ...(input?.meta ?? {}) },
    overview: { ...fallback.overview, ...(input?.overview ?? {}) },
    systems: systems.map((system) => {
      const legacy = system as Partial<DdpSystem> &
        Partial<TextItem> & { system_id?: string; name?: string };
      return {
        id: legacy.id || id("sys"),
        systemId: legacy.systemId || legacy.system_id || "",
        nome: legacy.nome || legacy.name || legacy.text || "",
        tipo: normalizeSystemModality(legacy.tipo),
        dono: legacy.dono || "",
        criticidade: legacy.criticidade || "Média",
        descricao: legacy.descricao || "",
      };
    }),
    macroprocess: {
      ...fallback.macroprocess,
      ...(input?.macroprocess ?? {}),
      processId: textAt(asObject(input?.macroprocess ?? {}), "processId"),
      processVersion: Number(textAt(asObject(input?.macroprocess ?? {}), "processVersion") || 1),
    },
    steps: steps.map((step) => {
      const legacy = step as Partial<DdpFlowStep> &
        Partial<TextItem> & {
          imagens?: unknown[];
          detalheObs?: string;
          substeps?: unknown[];
        };
      return {
        id: legacy.id || id("step"),
        processId: legacy.processId || "",
        processVersion: Number(legacy.processVersion || 1),
        etapa: legacy.etapa || legacy.text || "",
        responsavel: legacy.responsavel || "",
        entrada: legacy.entrada || "",
        atividade: legacy.atividade || legacy.text || "",
        saida: legacy.saida || "",
        sistema: legacy.sistema || "",
        risco: legacy.risco || "",
        observacoes: legacy.observacoes || legacy.detalheObs || "",
        images: normalizeImages(legacy.images ?? legacy.imagens, "flowimg"),
        substeps: normalizeDdpSubsteps(legacy.substeps),
      };
    }),
    sipoc: { ...fallback.sipoc, ...(input?.sipoc ?? {}) },
    sipocRows:
      sipocRows.length
        ? sipocRows.map((row) => ({ ...row, id: row.id || id("sipoc") }))
        : [
            {
              id: id("sipoc"),
              fornecedores: legacySipoc?.fornecedores ?? "",
              entradas: legacySipoc?.entradas ?? "",
              processo: legacySipoc?.processo ?? "",
              saidas: legacySipoc?.saidas ?? "",
              clientes: legacySipoc?.clientes ?? "",
            },
          ],
    gaps: gaps.map((gap) => {
      const legacy = gap as Partial<GapItem> & {
        comments?: unknown;
        comentario?: unknown;
        observacoes?: unknown;
      };
      return {
        id: legacy.id || id("gap"),
        sharedCauseId:
          textAt(asObject(legacy), "sharedCauseId") || textAt(asObject(legacy), "causaCatalogoId"),
        causa: legacy.causa || "",
        descricao: legacy.descricao || "",
        impacto: legacy.impacto || "",
        acao: legacy.acao || "",
        responsavel: legacy.responsavel || "",
        prazo: legacy.prazo || "",
        prioridade: normalizeCausePriority(legacy.prioridade || "Média"),
        status: normalizeCauseStatus(legacy.status),
        comentarios: normalizeCauseComments(
          legacy.comentarios ?? legacy.comments ?? legacy.comentario ?? legacy.observacoes,
        ),
      };
    }),
    nextSteps: nextSteps.map(asNextStepItem),
    glossary: glossary.map((item) => {
      const legacy = item as Partial<GlossaryItem> & { def?: string; text?: string };
      return {
        id: legacy.id || id("gloss"),
        termo: legacy.termo || legacy.text || "",
        definicao: legacy.definicao || legacy.def || "",
      };
    }),
    legacy: input?.legacy ?? fallback.legacy,
  };
}

function procedureClauseBlocks(clause: PopProcedureClause): PopProcedureBlock[] {
  if (clause.blocks?.length) return clause.blocks;
  return [
    {
      id: `legacy-${clause.id}`,
      text: clause.text || "",
      images: clause.images || [],
    },
  ];
}

function procedureLetter(index: number) {
  let value = index + 1;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(97 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function renumberPopSections(sections: PopSection[]) {
  return sections.map((section, sectionIndex) => {
    const sectionCode = `3.${sectionIndex + 1}`;
    return {
      ...section,
      code: sectionCode,
      subitems: (section.subitems ?? []).map((subitem, subitemIndex) => ({
        ...subitem,
        code: `${sectionCode}.${subitemIndex + 1}`,
        clauses: subitem.clauses.map((clause, clauseIndex) => ({
          ...clause,
          letter: procedureLetter(clauseIndex),
        })),
      })),
    };
  });
}

function normalizePop(input: Partial<PopState> | undefined, fallback: PopState): PopState {
  const normalizeClauses = (
    items: unknown[] | undefined,
    fallbackText = "",
  ): PopProcedureClause[] => {
    const source = Array.isArray(items) ? items : [];
    if (!source.length && fallbackText.trim()) {
      return [{ id: id("clause"), letter: "a", text: fallbackText, alert: "", images: [] }];
    }
    return source.map((item, index) => {
      const row = (item && typeof item === "object" ? item : {}) as Partial<
        PopProcedureClause & { blocks: unknown[] }
      >;
      const legacyImages = normalizeImages(row.images, "popclauseimg");
      const blocks = Array.isArray(row.blocks)
        ? row.blocks.map((block) => {
            const current = (
              block && typeof block === "object" ? block : {}
            ) as Partial<PopProcedureBlock>;
            return {
              id: current.id || id("clauseblock"),
              text: current.text || "",
              images: normalizeImages(current.images, "popclauseimg"),
            };
          })
        : [
            {
              id: id("clauseblock"),
              text: row.text || "",
              images: legacyImages,
            },
          ];
      return {
        id: row.id || id("clause"),
        letter: procedureLetter(index),
        text: row.text || "",
        alert: row.alert || "",
        images: legacyImages,
        blocks: blocks.length ? blocks : [{ id: id("clauseblock"), text: "", images: [] }],
      };
    });
  };
  const normalizeSubitems = (
    items: unknown[] | undefined,
    sectionCode: string,
    fallbackText = "",
  ): PopProcedureSubitem[] => {
    const source = Array.isArray(items) ? items : [];
    if (!source.length && fallbackText.trim()) {
      return [
        {
          id: id("sub"),
          code: `${sectionCode}.1`,
          title: "Subitem",
          clauses: normalizeClauses(undefined, fallbackText),
        },
      ];
    }
    return source.map((item, index) => {
      const row = (item && typeof item === "object" ? item : {}) as Partial<PopProcedureSubitem>;
      return {
        id: row.id || id("sub"),
        code: row.code || `${sectionCode}.${index + 1}`,
        title: row.title || "Subitem",
        clauses: normalizeClauses(row.clauses, ""),
      };
    });
  };
  return {
    ...fallback,
    ...input,
    meta: { ...fallback.meta, ...(input?.meta ?? {}) },
    purpose: { ...fallback.purpose, ...(input?.purpose ?? {}) },
    sections: renumberPopSections(
      (input?.sections ?? fallback.sections).map((section, index) => {
        const code = `3.${index + 1}`;
        return {
          id: section.id || id("sec"),
          code,
          title: section.title || `${code} Novo item`,
          description: section.description || "",
          body: section.body || "",
          records: section.records || "",
          risks: section.risks || "",
          images: normalizeImages(section.images, "popimg"),
          subitems: normalizeSubitems(
            section.subitems,
            code,
            section.body || section.description || "",
          ),
        };
      }),
    ),
    responsibilities: (input?.responsibilities ?? fallback.responsibilities).map((item) => {
      const legacy = item as Partial<ResponsibilityItem> & Partial<TextItem>;
      return {
        id: legacy.id || id("resp"),
        area: legacy.area || "",
        cargo: legacy.cargo || "",
        responsabilidade: legacy.responsabilidade || legacy.text || "",
      };
    }),
    references: (input?.references ?? fallback.references).map((item) => {
      const legacy = item as Partial<ReferenceItem> & Partial<TextItem>;
      return {
        id: legacy.id || id("ref"),
        codigo: legacy.codigo || "",
        titulo: legacy.titulo || legacy.text || "",
        aplicabilidade: legacy.aplicabilidade || "",
      };
    }),
    history: (input?.history ?? fallback.history).map((item) => {
      const legacy = item as Partial<RevisionItem> & { description?: string };
      return {
        id: legacy.id || id("rev"),
        codigo: legacy.codigo || "",
        version: legacy.version || "",
        date: legacy.date || today(),
        elaborador: legacy.elaborador || legacy.description || "",
        revisor: legacy.revisor || "",
        aprovador: legacy.aprovador || "",
      };
    }),
    changes: (input?.changes ?? fallback.changes).map((item) => ({
      id: item.id || id("change"),
      versao: item.versao || "",
      local: item.local || "",
      descricao: item.descricao || "",
    })),
    legacy: input?.legacy ?? fallback.legacy,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asObject(value: unknown): JsonObject {
  return isJsonObject(value) ? value : {};
}

function objectAt(source: JsonObject, key: string): JsonObject {
  return asObject(source[key]);
}

function arrayAt(source: JsonObject, key: string): unknown[] {
  return Array.isArray(source[key]) ? source[key] : [];
}

function repairMojibake(value: string) {
  if (!/[\u00c3\u00c2\ufffd]/.test(value)) return value;
  const codes = Array.from(value, (char) => char.charCodeAt(0));
  if (codes.some((code) => code > 255)) return value;

  try {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(codes));
    return decoded && !decoded.includes("\uFFFD") ? decoded : value;
  } catch {
    return value;
  }
}

function repairJsonText(value: unknown): unknown {
  if (typeof value === "string") return repairMojibake(value);
  if (Array.isArray(value)) return value.map(repairJsonText);
  if (!isJsonObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, current]) => [key, repairJsonText(current)]),
  );
}

function textValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return repairMojibake(String(value)).trim();
}

function textAt(source: JsonObject, key: string) {
  return textValue(source[key]);
}

function joinClean(parts: string[], separator = "\n") {
  return parts.filter(Boolean).join(separator);
}

function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function fillMissingActivityActors(steps: DdpFlowStep[]) {
  let changed = false;
  const nextSteps = steps.map((step) => {
    let stepChanged = false;
    const substeps = step.substeps.map((substep) => {
      let substepChanged = false;
      let nextSubstep = substep;

      if (substep.tipo !== "subprocesso" && !substep.actorName.trim()) {
        nextSubstep = {
          ...nextSubstep,
          actorType: "area",
          actorName: inferExplicitActivityArea(substep.descricao),
        };
        substepChanged = true;
      }

      const activities = substep.activities.map((activity) => {
        if (activity.actorName.trim()) return activity;
        substepChanged = true;
        return {
          ...activity,
          actorType: "area" as const,
          actorName: inferExplicitActivityArea(activity.descricao),
        };
      });

      if (!substepChanged) return substep;
      stepChanged = true;
      return { ...nextSubstep, activities };
    });

    if (!stepChanged) return step;
    changed = true;
    return { ...step, substeps };
  });

  return changed ? nextSteps : steps;
}

function cardText(snapshot: JsonObject, label: string) {
  const normalized = normalizeLabel(label);
  const card = arrayAt(snapshot, "vgCards").find((item) => {
    const row = asObject(item);
    return normalizeLabel(textAt(row, "title")).includes(normalized);
  });
  return card ? textAt(asObject(card), "text") : "";
}

function normalizePriority(value: string) {
  const normalized = normalizeLabel(value);
  if (normalized.includes("alta")) return "Alta";
  if (normalized.includes("baixa")) return "Baixa";
  return "Média";
}

function normalizePopType(value: string): PopState["meta"]["tipo"] {
  const normalized = normalizeLabel(value);
  if (normalized.includes("norma")) return "Norma";
  if (normalized === "it" || normalized.includes("instrucao")) return "IT";
  return "POP";
}

function parseJsonDocument(raw: string): JsonObject {
  const parsed = repairJsonText(JSON.parse(raw));
  if (!isJsonObject(parsed)) throw new Error("Arquivo JSON sem estrutura reconhecida.");
  return parsed;
}

function buildLegacyDdp(input: JsonObject, fallback: DdpState): DdpState {
  const meta = objectAt(input, "meta");
  const snapshot = objectAt(input, "snapshot");
  const flowSteps = arrayAt(snapshot, "flowSteps");
  const stats = arrayAt(snapshot, "stats")
    .map((item) => {
      const row = asObject(item);
      return joinClean([textAt(row, "num"), textAt(row, "label")], " ");
    })
    .filter(Boolean)
    .join("; ");
  const systems = arrayAt(snapshot, "sistemas").map((item) => {
    const row = asObject(item);
    const details = arrayAt(row, "items").map(textValue).filter(Boolean).join("\n");

    return {
      id: id("sys"),
      nome: textAt(row, "nome"),
      tipo: textAt(row, "badge") || "Sistema",
      dono: "",
      criticidade: textAt(row, "badgeType") || "Média",
      descricao: joinClean([textAt(row, "desc"), details]),
    };
  });
  const steps =
    flowSteps.length > 0
      ? flowSteps.map((flow, flowIndex) => {
          const row = asObject(flow);
          const substeps = arrayAt(row, "substeps");
          const sharedSystem = textAt(row, "detalheSistemas");
          const sharedActors = textAt(row, "detalheAtores");
          const sharedRisk = textAt(row, "detalheRiscos");

          return {
            id: id("step"),
            etapa: textAt(row, "titulo") || `Etapa ${flowIndex + 1}`,
            responsavel: sharedActors,
            entrada: textAt(row, "titulo"),
            atividade: textAt(row, "descricao"),
            saida: "",
            sistema: sharedSystem,
            risco: sharedRisk,
            observacoes: textAt(row, "detalheObs"),
            images: normalizeImages(arrayAt(row, "imagens"), "flowimg"),
            substeps: normalizeDdpSubsteps(substeps),
          };
        })
      : fallback.steps;
  const gaps = arrayAt(snapshot, "gaps").map((item) => {
    const row = asObject(item);

    return {
      id: id("gap"),
      sharedCauseId: textAt(row, "sharedCauseId") || textAt(row, "causaCatalogoId"),
      causa: textAt(row, "titulo"),
      descricao: textAt(row, "descricao"),
      impacto: textAt(row, "impacto") || textAt(row, "descricao"),
      acao: textAt(row, "acaoProposta") || textAt(row, "comoImplementar"),
      responsavel: textAt(row, "responsavel"),
      prazo: textAt(row, "prazo"),
      prioridade: normalizePriority(textAt(row, "prioridade")),
      status: normalizeCauseStatus(textAt(row, "status")),
      comentarios: normalizeCauseComments(row.comentarios ?? row.comments),
    };
  });

  return normalizeDdp(
    {
      meta: {
        ...fallback.meta,
        codigo: textAt(meta, "codigo") || textAt(input, "codigo") || fallback.meta.codigo,
        subtitulo: textAt(meta, "subtitulo") || fallback.meta.subtitulo,
        titulo: textAt(meta, "titulo") || textAt(input, "titulo") || fallback.meta.titulo,
        area: textAt(meta, "area") || fallback.meta.area,
        responsavel: textAt(meta, "responsavel"),
        versao: textAt(meta, "versaoLocal") || textAt(input, "versao") || fallback.meta.versao,
        data: textAt(input, "updatedAt") || textAt(input, "createdAt") || fallback.meta.data,
        dataRelatorio: textAt(meta, "dataRelatorio") || fallback.meta.dataRelatorio,
        elaborador: textAt(meta, "elaborador"),
        revisor: textAt(meta, "revisor"),
      },
      overview: {
        ...fallback.overview,
        objetivo: cardText(snapshot, "objetivo") || textAt(meta, "descricao"),
        escopo: textAt(meta, "escopo") || cardText(snapshot, "escopo"),
        estadoAtual: textAt(meta, "vgDescricao") || cardText(snapshot, "situacao atual"),
        kpis: stats,
        donoProcesso: textAt(meta, "donoProcesso"),
        volume: textAt(meta, "volume"),
        frequencia: textAt(meta, "frequencia"),
        dores: gaps.map((gap) => gap.causa).join("; "),
        oportunidades: gaps
          .map((gap) => gap.acao)
          .filter(Boolean)
          .join("; "),
      },
      systems: systems.length ? systems : fallback.systems,
      macroprocess: {
        titulo:
          textAt(objectAt(snapshot, "macroprocesso"), "titulo") || "Diagrama do Macroprocesso",
        legenda: textAt(objectAt(snapshot, "macroprocesso"), "legenda"),
        src:
          textAt(objectAt(snapshot, "macroprocesso"), "src") ||
          textAt(objectAt(snapshot, "macroprocesso"), "imagem"),
      },
      steps,
      sipocRows: arrayAt(snapshot, "sipocRows").map((item) => {
        const row = asObject(item);
        return {
          id: id("sipoc"),
          fornecedores: textAt(row, "fornecedores"),
          entradas: textAt(row, "entradas"),
          processo: textAt(row, "processo"),
          saidas: textAt(row, "saidas"),
          clientes: textAt(row, "clientes"),
        };
      }),
      gaps: gaps.length ? gaps : fallback.gaps,
      nextSteps: arrayAt(snapshot, "proxPassos").map((item) => {
        const row = asObject(item);
        return {
          id: id("next"),
          text: joinClean(
            [
              textAt(row, "titulo"),
              textAt(row, "desc"),
              textAt(row, "responsavel"),
              textAt(row, "prazo"),
            ],
            " | ",
          ),
        };
      }),
      glossary: arrayAt(snapshot, "glossario").map((item) => {
        const row = asObject(item);
        return {
          id: id("gloss"),
          termo: textAt(row, "termo"),
          definicao: textAt(row, "def"),
        };
      }),
      legacy: snapshot,
    },
    fallback,
  );
}

function buildLegacyPop(input: JsonObject, fallback: PopState): PopState {
  const snapshot = objectAt(input, "snapshot");
  const meta = objectAt(snapshot, "meta");
  const sections = arrayAt(snapshot, "secoes").map((item, index) => {
    const row = asObject(item);
    const items = arrayAt(row, "itens");
    const body = items
      .map((sectionItem, itemIndex) => {
        const current = asObject(sectionItem);
        const text = textAt(current, "texto");
        const note = textAt(current, "observacao");
        return joinClean([`${itemIndex + 1}. ${text}`, note ? `Observacao: ${note}` : ""], "\n");
      })
      .filter(Boolean)
      .join("\n\n");
    const imageTitles = items
      .flatMap((sectionItem) => arrayAt(asObject(sectionItem), "imagens"))
      .map((image) => textAt(asObject(image), "titulo"))
      .filter(Boolean);
    const sectionImages = [
      ...arrayAt(row, "imagens"),
      ...items.flatMap((sectionItem) => arrayAt(asObject(sectionItem), "imagens")),
    ];

    return {
      id: id("sec"),
      title: textAt(row, "titulo") || `${index + 1}. Secao`,
      description: textAt(row, "descricao"),
      body,
      records: imageTitles.join("\n"),
      risks: textAt(row, "riscos") || textAt(row, "detalheRiscos"),
      images: normalizeImages(sectionImages, "popimg"),
    };
  });

  return normalizePop(
    {
      meta: {
        ...fallback.meta,
        tipo: normalizePopType(textAt(meta, "tipoDoc") || textAt(input, "tipoDoc")),
        codigo: textAt(meta, "codigo") || textAt(input, "codigo") || fallback.meta.codigo,
        titulo: textAt(meta, "titulo") || textAt(input, "titulo") || fallback.meta.titulo,
        publico: textAt(meta, "publico") || fallback.meta.publico,
        area: textAt(meta, "area") || fallback.meta.area,
        processo: textAt(meta, "processo"),
        versao: textAt(meta, "versao") || textAt(input, "versao") || fallback.meta.versao,
        vigencia: textAt(meta, "vigencia") || textAt(input, "vigencia") || fallback.meta.vigencia,
        elaboracao: textAt(meta, "elaboracao") || textAt(input, "elaborador"),
        revisor: textAt(meta, "revisor") || textAt(input, "revisor"),
        aprovacao: textAt(meta, "aprovacao") || textAt(input, "aprovador"),
        publicacao: textAt(meta, "publicacao"),
        status: textAt(meta, "status") || fallback.meta.status,
      },
      purpose: {
        objetivo: textAt(snapshot, "objetivo") || fallback.purpose.objetivo,
        abrangencia: textAt(snapshot, "abrangencia"),
        premissas: textAt(snapshot, "premissas"),
        importante: textAt(snapshot, "importante"),
      },
      sections: sections.length ? sections : fallback.sections,
      responsibilities: arrayAt(snapshot, "responsabilidades").map((item) => {
        const row = asObject(item);
        return {
          id: id("resp"),
          area: textAt(row, "area"),
          cargo: textAt(row, "cargo"),
          responsabilidade: textAt(row, "responsabilidade"),
        };
      }),
      references: arrayAt(snapshot, "referencias").map((item) => {
        const row = asObject(item);
        return {
          id: id("ref"),
          codigo: textAt(row, "codigo"),
          titulo: textAt(row, "titulo"),
          aplicabilidade: textAt(row, "aplicabilidade"),
        };
      }),
      history: arrayAt(snapshot, "historico").map((item) => {
        const row = asObject(item);
        return {
          id: id("rev"),
          codigo: textAt(row, "codigo"),
          version: textAt(row, "versao"),
          date: textAt(row, "data") || today(),
          elaborador: textAt(row, "elaborador"),
          revisor: textAt(row, "revisor"),
          aprovador: textAt(row, "aprovador"),
        };
      }),
      changes: arrayAt(snapshot, "alteracoes").map((item) => {
        const row = asObject(item);
        return {
          id: id("change"),
          versao: textAt(row, "versao"),
          local: textAt(row, "local"),
          descricao: textAt(row, "descricao"),
        };
      }),
      legacy: snapshot,
    },
    fallback,
  );
}

function detectLegacyModule(input: JsonObject): AteliamModule | null {
  const type = normalizeLabel(textAt(input, "tipo") || textAt(input, "tipoDoc"));
  const snapshot = objectAt(input, "snapshot");
  if (type.includes("ddp") || arrayAt(snapshot, "flowSteps").length) return "ddp";
  if (type.includes("pop") || arrayAt(snapshot, "secoes").length) return "pop";
  if (type.includes("bpmn") || type.includes("fluxograma") || arrayAt(input, "nodes").length) {
    return "bpmn";
  }
  return null;
}

function importWorkspaceFromJson(
  raw: string,
  current: WorkspaceState,
  preferredModule: AteliamModule,
): ImportResult {
  const parsed = parseJsonDocument(raw);
  if (arrayAt(parsed, "value").length || arrayAt(parsed, "items").length) {
    throw new Error("Este JSON parece ser um indice. Use Biblioteca e selecione a pasta.");
  }

  const source = objectAt(parsed, "modules");
  const workspaceSource = Object.keys(source).length ? source : parsed;
  const ddpSource = objectAt(workspaceSource, "ddp");
  const popSource = objectAt(workspaceSource, "pop");
  const bpmnSource = objectAt(workspaceSource, "bpmn");

  if (
    Object.keys(ddpSource).length ||
    Object.keys(popSource).length ||
    Object.keys(bpmnSource).length
  ) {
    const workspace = {
      ddp: Object.keys(ddpSource).length
        ? normalizeDdp(ddpSource as Partial<DdpState>, current.ddp)
        : current.ddp,
      pop: Object.keys(popSource).length
        ? normalizePop(popSource as Partial<PopState>, current.pop)
        : current.pop,
      bpmn: Object.keys(bpmnSource).length ? { ...current.bpmn, ...bpmnSource } : current.bpmn,
    };

    return {
      workspace,
      moduleId: Object.keys(ddpSource).length
        ? "ddp"
        : Object.keys(popSource).length
          ? "pop"
          : Object.keys(bpmnSource).length
            ? "bpmn"
            : preferredModule,
      label: "Workspace BF Flow",
    };
  }

  if (detectLegacyModule(parsed) === "bpmn") {
    const bpmnSource = Object.keys(objectAt(parsed, "bpmn")).length
      ? objectAt(parsed, "bpmn")
      : parsed;
    return {
      workspace: { ...current, bpmn: { ...current.bpmn, ...(bpmnSource as Partial<BpmnState>) } },
      moduleId: "bpmn",
      label: textAt(bpmnSource, "poolName") || "Fluxograma",
    };
  }

  const legacyModule = detectLegacyModule(parsed);
  if (legacyModule === "ddp") {
    const ddp = buildLegacyDdp(parsed, current.ddp);
    return {
      workspace: { ...current, ddp },
      moduleId: "ddp",
      label: `${ddp.meta.codigo} - ${ddp.meta.titulo}`,
    };
  }
  if (legacyModule === "pop") {
    const pop = buildLegacyPop(parsed, current.pop);
    return {
      workspace: { ...current, pop },
      moduleId: "pop",
      label: `${pop.meta.codigo} - ${pop.meta.titulo}`,
    };
  }

  throw new Error("Nao reconheci este JSON como Mapeamento, POP ou workspace BF Flow.");
}

function buildModuleJson(moduleId: AteliamModule, workspace: WorkspaceState) {
  const updatedAt = new Date().toISOString();
  if (moduleId === "ddp") {
    return JSON.stringify(
      {
        tipo: "ddp",
        codigo: workspace.ddp.meta.codigo,
        titulo: workspace.ddp.meta.titulo,
        versao: workspace.ddp.meta.versao,
        updatedAt,
        ddp: workspace.ddp,
      },
      null,
      2,
    );
  }
  if (moduleId === "pop") {
    return JSON.stringify(
      {
        tipo: "pop",
        tipoDoc: workspace.pop.meta.tipo,
        codigo: workspace.pop.meta.codigo,
        titulo: workspace.pop.meta.titulo,
        versao: workspace.pop.meta.versao,
        updatedAt,
        pop: workspace.pop,
      },
      null,
      2,
    );
  }

  return JSON.stringify(
    {
      tipo: "bpmn",
      titulo: workspace.bpmn.poolName,
      updatedAt,
      bpmn: workspace.bpmn,
    },
    null,
    2,
  );
}

function withUppercaseModuleTitle(
  moduleId: AteliamModule,
  workspace: WorkspaceState,
): WorkspaceState {
  if (moduleId === "ddp") {
    return {
      ...workspace,
      ddp: {
        ...workspace.ddp,
        meta: {
          ...workspace.ddp.meta,
          titulo: workspace.ddp.meta.titulo.trim().toLocaleUpperCase("pt-BR"),
        },
      },
    };
  }
  if (moduleId === "pop") {
    return {
      ...workspace,
      pop: {
        ...workspace.pop,
        meta: {
          ...workspace.pop.meta,
          titulo: workspace.pop.meta.titulo.trim().toLocaleUpperCase("pt-BR"),
        },
      },
    };
  }
  return {
    ...workspace,
    bpmn: {
      ...workspace.bpmn,
      poolName: workspace.bpmn.poolName.trim().toLocaleUpperCase("pt-BR"),
    },
  };
}

function parseWorkspace(raw?: string | null): WorkspaceState {
  const fallback = defaultWorkspace();
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as
      | Partial<WorkspaceState>
      | { modules?: Partial<WorkspaceState> };
    const source = "modules" in parsed && parsed.modules ? parsed.modules : parsed;
    return {
      ddp: normalizeDdp(source.ddp, fallback.ddp),
      pop: normalizePop(source.pop, fallback.pop),
      bpmn: { ...fallback.bpmn, ...(source.bpmn ?? {}) },
    };
  } catch {
    return fallback;
  }
}

function downloadText(filename: string, content: string, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function fileTitle(file: File) {
  return (
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[-_]+/g, " ")
      .trim() || "Imagem"
  );
}

function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(isFilled);
  if (value && typeof value === "object") return Object.values(value).some(isFilled);
  return String(value ?? "").trim().length > 0;
}

function completionPercent(values: unknown[]) {
  if (!values.length) return 0;
  return Math.round((values.filter(isFilled).length / values.length) * 100);
}

function html(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/\n/g, "<br/>");
}

type ExportImage = { title: string; caption: string; src: string };
type ExportCard = { title: string; text: string };
type ExportSystem = {
  id: string;
  name: string;
  type: string;
  description: string;
  items: string[];
};
type ExportSubstepSystem = { name: string; type: string };
type ExportFlowStep = {
  title: string;
  description: string;
  owner: string;
  system: string;
  risk: string;
  images: ExportImage[];
  substeps: Array<{
    code: string;
    title: string;
    description: string;
    kind: "atividade" | "subprocesso";
    classification: FlowExecutionType;
    actorType: FlowActorType;
    actorName: string;
    systems: ExportSubstepSystem[];
    images: ExportImage[];
    activities: Array<{
      code: string;
      title: string;
      description: string;
      classification: FlowExecutionType;
      actorType: FlowActorType;
      actorName: string;
      systems: ExportSubstepSystem[];
      images: ExportImage[];
    }>;
  }>;
};
type ExportGap = {
  title: string;
  description: string;
  impact: string;
  action: string;
  owner: string;
  due: string;
  priority: string;
  status: string;
  implementation: string;
  comments: CauseComment[];
};
type ExportNextStep = { title: string; description: string; owner: string; due: string };
type ExportPopSection = {
  title: string;
  description: string;
  body: string;
  images: ExportImage[];
  items: Array<{
    kind: "subitem" | "clause" | "paragraph";
    label: string;
    text: string;
    note: string;
    images: ExportImage[];
  }>;
};
type DocxParagraphOptions = {
  style?: string;
  align?: "left" | "right" | "center" | "both";
  before?: number;
  after?: number;
  line?: number;
  keep?: boolean;
  left?: number;
  fill?: string;
  bold?: boolean;
  caps?: boolean;
  color?: string;
  size?: number;
};
type DocxCell = {
  xml?: string;
  text?: string;
  fill?: string;
  gridSpan?: number;
  padY?: number;
  padX?: number;
  valign?: "top" | "center";
};
type DocxMedia = {
  rid: string;
  name: string;
  ext: string;
  bytes: Uint8Array;
  size: { w: number; h: number };
  scope: "document" | "header";
};
type DocxFileEntry = { name: string; data: Uint8Array };
type OrganizationBrand = {
  name?: string | null;
  logo_data_url?: string | null;
  word_header_color?: string | null;
};
type AccessibleOrganization = OrganizationBrand & {
  id: string;
  slug: string;
  code_settings?: CodeSettings | null;
  isDefault?: boolean;
};
type OrganizationCatalogItem = {
  id: string;
  name: string;
  sigla?: string | null;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
};
type OrganizationCause = {
  id: string;
  title: string;
  description: string | null;
  impact: string | null;
  action: string | null;
  priority: string;
  status?: string;
  responsible?: string | null;
  process_id?: string | null;
  due_date?: string | null;
  comments?: CauseComment[] | null;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
};
type MappingCauseRecord = GapItem & {
  recordId: string;
  gapId: string;
  documentId: string;
  mappingCode: string;
  mappingTitle: string;
  updatedAt: string;
};
type OrganizationProcess = {
  id: string;
  code: string | null;
  name: string;
  type: "macroprocess" | "process" | "subprocess" | string;
  value_chain_id?: string | null;
  parent_process_id: string | null;
  department: string | null;
  owner: string | null;
  description: string | null;
  status: string;
  current_version: number;
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
};
type OrganizationValueChain = {
  id: string;
  name: string;
  category: "primary" | "support" | "management" | "output";
  description: string | null;
  status: string;
  organization_id?: string;
};
type OrganizationSystem = {
  id: string;
  name: string;
  modality?: SystemModality;
  description: string;
};

type QuantitativeBreakdown = {
  label: string;
  value: number;
  percentage: number;
};

type MappingQuantitativeStats = {
  processes: number;
  subprocesses: number;
  activities: number;
  areas: number;
  systems: number;
  averageActivities: number;
  maxActivitiesInSubprocess: number;
  execution: QuantitativeBreakdown[];
  automationPercentage: number;
  fullyManualPercentage: number;
  areaDistribution: QuantitativeBreakdown[];
  resourceUsage: QuantitativeBreakdown[];
  alerts: {
    manualActivities: number;
    withoutOwner: number;
    withoutDescription: number;
    withoutSystem: number;
  };
};

function isDefinedQuantitativeValue(value: unknown) {
  const normalized = normalizeLabel(plain(value)).trim();
  return (
    !!normalized &&
    ![
      "-",
      "a definir",
      "indefinido",
      "indefinida",
      "nao definido",
      "nao definida",
      "nao informado",
      "nao informada",
      "area nao definida",
    ].includes(normalized)
  );
}

function calculateMappingQuantitativeStats(
  data: DdpState,
  processCatalog: OrganizationProcess[] = [],
): MappingQuantitativeStats {
  const sourceSteps = Array.isArray(data.steps) ? data.steps : [];
  const sourceSystems = Array.isArray(data.systems) ? data.systems : [];
  const processById = new Map(processCatalog.map((process) => [process.id, process]));
  const processKeys = new Set<string>();
  const areaActivityCounts = new Map<string, number>();
  const resourceCounts = new Map<string, number>();
  const executionCounts = new Map<FlowExecutionType, number>(
    FLOW_EXECUTION_TYPE_OPTIONS.map((label) => [label, 0]),
  );
  let subprocesses = 0;
  let activities = 0;
  let maxActivitiesInSubprocess = 0;
  let withoutOwner = 0;
  let withoutDescription = 0;
  let withoutSystem = 0;

  const addProcess = (processId?: string, fallbackName?: string) => {
    const key = processId?.trim() || normalizeLabel(fallbackName || "");
    if (key) processKeys.add(key);
  };
  // O processo principal identifica o mapeamento; a estrutura quantitativa
  // considera somente os processos efetivamente apresentados nas etapas.
  sourceSteps.forEach((step) => addProcess(step.processId, step.etapa));

  const countActivity = (
    activity: Pick<
      DdpFlowActivity,
      "classificacao" | "descricao" | "systemIds" | "actorType" | "actorName"
    >,
    processId?: string,
    fallbackArea?: string,
    fallbackOwner?: string,
  ) => {
    const systemIds = Array.isArray(activity.systemIds) ? activity.systemIds : [];
    activities += 1;
    executionCounts.set(
      activity.classificacao,
      (executionCounts.get(activity.classificacao) ?? 0) + 1,
    );

    const process = processId ? processById.get(processId) : undefined;
    const rawArea = plain(
      (activity.actorType === "area" ? activity.actorName : "") ||
        process?.department ||
        fallbackArea ||
        "A definir",
    );
    const area = isDefinedQuantitativeValue(rawArea) ? rawArea : "A definir";
    areaActivityCounts.set(area, (areaActivityCounts.get(area) ?? 0) + 1);
    const responsible = activity.actorName || process?.owner || fallbackOwner;
    if (
      !isDefinedQuantitativeValue(rawArea) ||
      !isDefinedQuantitativeValue(responsible)
    ) {
      withoutOwner += 1;
    }
    if (!plain(activity.descricao)) withoutDescription += 1;
    if (!systemIds.length) withoutSystem += 1;

    const resourceIds = new Set(systemIds);
    sourceSystems.forEach((system) => {
      if (!resourceIds.has(system.id) && (!system.systemId || !resourceIds.has(system.systemId))) {
        return;
      }
      const label = plain(system.nome) || "Recurso não identificado";
      resourceCounts.set(label, (resourceCounts.get(label) ?? 0) + 1);
    });
  };

  sourceSteps.forEach((step) => {
    const stepProcess = step.processId ? processById.get(step.processId) : undefined;
    const substeps = Array.isArray(step.substeps) ? step.substeps : [];
    substeps.forEach((substep) => {
      if (substep.tipo === "subprocesso") {
        const substepActivities = Array.isArray(substep.activities)
          ? substep.activities
          : [];
        subprocesses += 1;
        maxActivitiesInSubprocess = Math.max(
          maxActivitiesInSubprocess,
          substepActivities.length,
        );
        substepActivities.forEach((activity) =>
          countActivity(
            activity,
            substep.processId || step.processId,
            stepProcess?.department || data.meta.area,
            stepProcess?.owner || step.responsavel,
          ),
        );
        return;
      }
      countActivity(
        substep,
        step.processId,
        stepProcess?.department || data.meta.area,
        stepProcess?.owner || step.responsavel,
      );
    });
  });

  const toBreakdown = (entries: Array<[string, number]>, total: number) =>
    entries
      .map(([label, value]) => ({
        label,
        value,
        percentage: total ? Math.round((value / total) * 100) : 0,
      }))
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"));

  const automatic = executionCounts.get("Automática") ?? 0;
  const manualInSystem = executionCounts.get("Manual no sistema") ?? 0;
  const manualOutsideSystem = executionCounts.get("Manual fora do sistema") ?? 0;
  const hybrid = executionCounts.get("Híbrida (manual/automática)") ?? 0;
  const structureBase = processKeys.size + subprocesses;

  return {
    processes: processKeys.size,
    subprocesses,
    activities,
    areas: Array.from(areaActivityCounts.keys()).filter(isDefinedQuantitativeValue).length,
    systems: sourceSystems.filter((system) => plain(system.nome)).length,
    averageActivities: structureBase ? Math.round((activities / structureBase) * 10) / 10 : 0,
    maxActivitiesInSubprocess,
    execution: toBreakdown(
      [
        ["Automáticas", automatic],
        ["Manuais no sistema", manualInSystem],
        ["Manuais fora do sistema", manualOutsideSystem],
        ["Híbridas", hybrid],
      ],
      activities,
    ),
    automationPercentage: activities ? Math.round(((automatic + hybrid) / activities) * 100) : 0,
    fullyManualPercentage: activities
      ? Math.round(((manualInSystem + manualOutsideSystem) / activities) * 100)
      : 0,
    areaDistribution: toBreakdown(Array.from(areaActivityCounts.entries()), activities),
    resourceUsage: toBreakdown(Array.from(resourceCounts.entries()), activities).slice(0, 5),
    alerts: {
      manualActivities: manualInSystem + manualOutsideSystem,
      withoutOwner,
      withoutDescription,
      withoutSystem,
    },
  };
}

function reconcileDdpSystemsWithCatalog(
  systems: DdpSystem[],
  catalogSystems: OrganizationSystem[],
) {
  const safeSystems = Array.isArray(systems) ? systems : [];
  const safeCatalogSystems = Array.isArray(catalogSystems) ? catalogSystems : [];
  if (!safeSystems.length || !safeCatalogSystems.length) return safeSystems;

  const catalogById = new Map(safeCatalogSystems.map((system) => [system.id, system]));
  const catalogByName = new Map(
    safeCatalogSystems.map((system) => [normalizeLabel(system.name), system]),
  );
  let changed = false;

  const reconciled = safeSystems.map((system) => {
    const catalogSystem =
      (system.systemId ? catalogById.get(system.systemId) : undefined) ??
      catalogByName.get(normalizeLabel(system.nome));
    if (!catalogSystem) return system;

    const nextSystemId = catalogSystem.id;
    const nextName = catalogSystem.name;
    const nextType = normalizeSystemModality(catalogSystem.modality);
    if (
      system.systemId === nextSystemId &&
      system.nome === nextName &&
      normalizeSystemModality(system.tipo) === nextType
    ) {
      return system;
    }

    changed = true;
    return {
      ...system,
      systemId: nextSystemId,
      nome: nextName,
      tipo: nextType,
    };
  });

  return changed ? reconciled : safeSystems;
}

function reconcileDdpWithCatalog(data: DdpState, catalogSystems: OrganizationSystem[]) {
  const safeData = normalizeDdp(data, defaultWorkspace().ddp);
  const systems = reconcileDdpSystemsWithCatalog(safeData.systems, catalogSystems);
  return systems === safeData.systems ? safeData : { ...safeData, systems };
}

type OrganizationPosition = { id: string; title: string; description: string | null };
type OrganizationCatalogs = {
  departments: OrganizationCatalogItem[];
  positions: OrganizationPosition[];
  processOwners: OrganizationCatalogItem[];
  causes: OrganizationCause[];
  processes: OrganizationProcess[];
  valueChains: OrganizationValueChain[];
  systems: OrganizationSystem[];
};

function cleanFileName(name: string) {
  return String(name || "documento")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 160);
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function stamp() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(
    2,
    "0",
  )}`;
}

function plain(value: unknown) {
  return repairMojibake(String(value ?? ""))
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function docxColor(value: unknown, fallback = "1D1D1F") {
  const color = String(value ?? "")
    .replace("#", "")
    .trim()
    .toUpperCase();
  return /^[0-9A-F]{6}$/.test(color) ? color : fallback;
}

function splitText(value: unknown) {
  return repairMojibake(String(value ?? ""))
    .split(/\n|;/)
    .map((item) => plain(item))
    .filter(Boolean);
}

function exportImage(value: unknown, fallbackTitle = "Imagem"): ExportImage {
  const row = asObject(value);
  return {
    title: textAt(row, "titulo") || fallbackTitle,
    caption: textAt(row, "legenda"),
    src: textAt(row, "src") || textAt(row, "imagem"),
  };
}

function exportImages(items: unknown[], fallbackTitle = "Imagem") {
  return items.map((item, index) => exportImage(item, `${fallbackTitle} ${index + 1}`));
}

function getDdpExportModel(data: DdpState, processCatalog: OrganizationProcess[] = []) {
  const legacy = data.legacy ?? {};
  const sourceSystems = Array.isArray(data.systems) ? data.systems : [];
  const sourceSteps = Array.isArray(data.steps) ? data.steps : [];
  const sourceGaps = Array.isArray(data.gaps) ? data.gaps : [];
  const sourceNextSteps = Array.isArray(data.nextSteps) ? data.nextSteps : [];
  const sourceSipocRows = Array.isArray(data.sipocRows) ? data.sipocRows : [];
  const sourceGlossary = Array.isArray(data.glossary) ? data.glossary : [];
  const quantitativeStats = calculateMappingQuantitativeStats(data, processCatalog);
  const overviewCards: ExportCard[] = [
    { title: "Objetivo", text: data.overview.objetivo },
    { title: "Escopo", text: data.overview.escopo },
    { title: "Contexto", text: data.overview.kpis },
  ].filter((item) => item.text);

  const systems: ExportSystem[] = sourceSystems.map((system) => ({
    id: system.id,
    name: system.nome,
    type: normalizeSystemModality(system.tipo),
    description: system.descricao,
    items: [],
  }));

  const flowSteps: ExportFlowStep[] = sourceSteps.map((step) => ({
    title: step.etapa,
    description: "",
    owner: "",
    system: "",
    risk: "",
    images: (Array.isArray(step.images) ? step.images : []).map((image) => ({
      title: image.titulo,
      caption: image.legenda,
      src: image.src,
    })),
    substeps: Array.isArray(step.substeps) && step.substeps.length
      ? step.substeps.map((substep) => {
          const substepSystemIds = Array.isArray(substep.systemIds)
            ? substep.systemIds
            : [];
          const substepActivities = Array.isArray(substep.activities)
            ? substep.activities
            : [];
          return {
          code: substep.codigo,
          title: substep.titulo,
          description: substep.descricao,
          kind: substep.tipo,
          classification: substep.classificacao,
          actorType: substep.actorType,
          actorName: substep.actorName,
          systems: sourceSystems
            .filter(
              (system) =>
                substepSystemIds.includes(system.id) ||
                (!!system.systemId && substepSystemIds.includes(system.systemId)),
            )
            .map((system) => ({
              name: system.nome,
              type: normalizeSystemModality(system.tipo),
            })),
          images: (Array.isArray(substep.images) ? substep.images : []).map((image) => ({
            title: image.titulo,
            caption: image.legenda,
            src: image.src,
          })),
          activities: substepActivities.map((activity) => {
            const activitySystemIds = Array.isArray(activity.systemIds)
              ? activity.systemIds
              : [];
            return {
            code: activity.codigo,
            title: activity.titulo,
            description: activity.descricao,
            classification: activity.classificacao,
            actorType: activity.actorType,
            actorName: activity.actorName,
            systems: sourceSystems
              .filter(
                (system) =>
                  activitySystemIds.includes(system.id) ||
                  (!!system.systemId && activitySystemIds.includes(system.systemId)),
              )
              .map((system) => ({
                name: system.nome,
                type: normalizeSystemModality(system.tipo),
              })),
            images: (Array.isArray(activity.images) ? activity.images : []).map((image) => ({
              title: image.titulo,
              caption: image.legenda,
              src: image.src,
            })),
          };
          }),
        };
        })
      : [],
  }));

  const gaps: ExportGap[] = sourceGaps.map((gap) => ({
    title: gap.causa,
    description: gap.descricao || gap.causa,
    impact: gap.impacto,
    action: gap.acao,
    owner: gap.responsavel,
    due: gap.prazo,
    priority: gap.prioridade,
    status: gap.status,
    implementation: gap.acao,
    comments: gap.comentarios,
  }));

  const nextSteps: ExportNextStep[] = sourceNextSteps.map((item) => ({
    title: plain(item.text),
    description: "",
    owner: item.responsavel || "",
    due: item.prazo || "",
  }));

  const currentMacro = data.macroprocess;

  return {
    meta: data.meta,
    // Área e Dono do documento vêm do processo vinculado (preenchido no cadastro).
    processName: textAt(legacy, "processName") || currentMacro.titulo,
    processCode: textAt(legacy, "processCode"),
    valueChainName: plain(
      textAt(legacy, "processValueChainName") ||
      data.meta.valueChainName ||
      data.meta.valueChainId
    )
      .toLocaleUpperCase("pt-BR"),
    area: textAt(legacy, "processArea") || data.meta.area,
    owner: textAt(legacy, "processOwner") || data.meta.responsavel,
    description: data.overview.objetivo,
    scope: data.overview.escopo,
    overview: data.overview.estadoAtual,
    stats: quantitativeStats,
    cards: overviewCards,
    systems,
    macroprocess: {
      title: currentMacro.titulo,
      caption: currentMacro.legenda,
      src: currentMacro.src,
    },
    flowSteps,
    sipocRows: sourceSipocRows,
    gaps,
    nextSteps,
    images: [],
    glossary: sourceGlossary,
  };
}

function getPopExportModel(data: PopState) {
  const sections: ExportPopSection[] = data.sections.map((section) => {
    const nestedItems =
      section.subitems?.flatMap((subitem) => [
        {
          text: `${subitem.code} ${subitem.title}`.trim(),
          kind: "subitem" as const,
          label: "",
          note: "",
          images: [],
        },
        ...subitem.clauses.flatMap((clause) => {
          const blocks = procedureClauseBlocks(clause);
          return blocks.map((block, blockIndex) => ({
            text: block.text,
            kind: blockIndex === 0 ? ("clause" as const) : ("paragraph" as const),
            label: blockIndex === 0 ? `${clause.letter}) ` : "",
            note: blockIndex === blocks.length - 1 ? clause.alert : "",
            images: block.images.map((image) => ({
              title: "",
              caption: image.legenda,
              src: image.src,
            })),
          }));
        }),
      ]) ?? [];
    const legacyItems = splitText(section.records || section.risks).map((line) => ({
      text: line,
      kind: "paragraph" as const,
      label: "",
      note: "",
      images: [],
    }));
    return {
      title: section.title,
      description: section.description,
      body: section.body,
      images: section.images.map((image) => ({
        title: "",
        caption: image.legenda,
        src: image.src,
      })),
      items: nestedItems.length ? nestedItems : legacyItems,
    };
  });

  return {
    meta: data.meta,
    typeLabel:
      data.meta.tipo === "Norma"
        ? "Norma"
        : data.meta.tipo === "IT"
          ? "Instrução de Trabalho - IT"
          : "Procedimento Operacional Padrão - POP",
    contentTitle: documentationContentTitle(data.meta.tipo),
    purpose: data.purpose,
    sections,
    responsibilities: data.responsibilities,
    references: data.references,
    history: data.history,
    changes: data.changes,
  };
}

function utf8(str: string) {
  return new TextEncoder().encode(str);
}

function crc32(buf: Uint8Array) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function u16(n: number) {
  return new Uint8Array([n & 255, (n >>> 8) & 255]);
}

function u32(n: number) {
  return new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
}

function concatArrays(arrays: Uint8Array[]) {
  const total = arrays.reduce((sum, item) => sum + item.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  arrays.forEach((item) => {
    out.set(item, offset);
    offset += item.length;
  });
  return out;
}

function zipStore(files: DocxFileEntry[]) {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const date = new Date();
  const time =
    (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();

  files.forEach((file) => {
    const nameBytes = utf8(file.name);
    const data = file.data;
    const crc = crc32(data);
    const local = concatArrays([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(day),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
      data,
    ]);
    localParts.push(local);

    const central = concatArrays([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(time),
      u16(day),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBytes.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBytes,
    ]);
    centralParts.push(central);
    offset += local.length;
  });

  const centralStart = offset;
  const central = concatArrays(centralParts);
  const end = concatArrays([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(centralStart),
    u16(0),
  ]);
  return concatArrays([...localParts, central, end]);
}

type XlsxSheet = { name: string; rows: string[][] };

function columnName(index: number) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

function columnIndex(ref: string) {
  const letters = ref.replace(/[^A-Z]/gi, "").toUpperCase();
  return letters.split("").reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1;
}

function xlsxCell(value: unknown, rowIndex: number, colIndex: number, style = 2) {
  const ref = `${columnName(colIndex)}${rowIndex + 1}`;
  return `<c r="${ref}" t="inlineStr" s="${style}"><is><t>${escapeXml(String(value ?? ""))}</t></is></c>`;
}

function xlsxWorksheetXml(rows: string[][]) {
  const maxCols = Math.max(1, ...rows.map((row) => row.length));
  const cols = Array.from({ length: maxCols }, (_, index) => {
    const width = index === 0 ? 24 : index === 1 ? 58 : 32;
    return `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`;
  }).join("");
  const sheetRows = rows
    .map(
      (row, rowIndex) =>
        `<row r="${rowIndex + 1}" ht="${rowIndex === 0 ? 24 : 46}" customHeight="1">${row
          .map((cell, colIndex) => xlsxCell(cell, rowIndex, colIndex, rowIndex === 0 ? 1 : 2))
          .join("")}</row>`,
    )
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
  <cols>${cols}</cols>
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function buildXlsxWorkbook(sheets: XlsxSheet[]) {
  const files: DocxFileEntry[] = [
    {
      name: "[Content_Types].xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${sheets
    .map(
      (_, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join("")}
</Types>`),
    },
    {
      name: "_rels/.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`),
    },
    {
      name: "xl/workbook.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets
    .map(
      (sheet, index) =>
        `<sheet name="${escapeXml(sheet.name.slice(0, 31))}" sheetId="${index + 1}" r:id="rId${
          index + 1
        }"/>`,
    )
    .join("")}</sheets>
</workbook>`),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${sheets
    .map(
      (_, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    )
    .join("")}
  <Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`),
    },
    {
      name: "xl/styles.xml",
      data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2"><font><sz val="11"/><color rgb="FF1D1D1F"/><name val="Aptos"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts>
  <fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF007AFF"/><bgColor indexed="64"/></patternFill></fill></fills>
  <borders count="2"><border/><border><left style="thin"><color rgb="FFD2D2D7"/></left><right style="thin"><color rgb="FFD2D2D7"/></right><top style="thin"><color rgb="FFD2D2D7"/></top><bottom style="thin"><color rgb="FFD2D2D7"/></bottom></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`),
    },
  ];

  sheets.forEach((sheet, index) => {
    files.push({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: utf8(xlsxWorksheetXml(sheet.rows)),
    });
  });

  return new Blob([zipStore(files)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function rowsFromFields(fields: Array<[string, string]>) {
  return [["Campo", "Valor"], ...fields.map(([field, value]) => [field, value ?? ""])];
}

function buildDdpImportTemplate(data: DdpState) {
  const sheets: XlsxSheet[] = [
    {
      name: "Instrucoes",
      rows: [
        ["Uso", "Preencha apenas textos. Imagens devem ser adicionadas diretamente no BF Flow."],
        ["Importacao", "Mantenha os nomes das abas e cabecalhos para o sistema reconhecer."],
        ["Repeticoes", "Adicione novas linhas nas abas de tabelas quando precisar."],
      ],
    },
    {
      name: "Identificacao",
      rows: rowsFromFields([
        ["codigo", data.meta.codigo],
        ["subtitulo", data.meta.subtitulo],
        ["titulo", data.meta.titulo],
        ["area", data.meta.area],
        ["responsavel", data.meta.responsavel],
        ["versao", data.meta.versao],
        ["data", data.meta.data],
        ["dataRelatorio", data.meta.dataRelatorio],
        ["elaborador", data.meta.elaborador],
        ["revisor", data.meta.revisor],
      ]),
    },
    {
      name: "Visao geral",
      rows: rowsFromFields([
        ["objetivo", data.overview.objetivo],
        ["escopo", data.overview.escopo],
        ["estadoAtual", data.overview.estadoAtual],
        ["kpis", data.overview.kpis],
        ["donoProcesso", data.overview.donoProcesso],
        ["volume", data.overview.volume],
        ["frequencia", data.overview.frequencia],
        ["dores", data.overview.dores],
        ["oportunidades", data.overview.oportunidades],
      ]),
    },
    {
      name: "Sistemas",
      rows: [
        ["nome", "classificacao", "dono", "criticidade", "descricao"],
        ...data.systems.map((item) => [
          item.nome,
          item.tipo,
          item.dono,
          item.criticidade,
          item.descricao,
        ]),
      ],
    },
    {
      name: "Macroprocesso",
      rows: rowsFromFields([
        ["titulo", data.macroprocess.titulo],
        ["legenda", data.macroprocess.legenda],
      ]),
    },
    {
      name: "Fluxo AS IS",
      rows: [
        [
          "etapa",
          "responsavel",
          "entrada",
          "atividade",
          "saida",
          "sistema",
          "risco",
          "observacoes",
        ],
        ...data.steps.map((item) => [
          item.etapa,
          item.responsavel,
          item.entrada,
          item.atividade,
          item.saida,
          item.sistema,
          item.risco,
          item.observacoes,
        ]),
      ],
    },
    {
      name: "Atividades Fluxo",
      rows: [
        [
          "etapa",
          "codigo",
          "tipo",
          "classificacao",
          "tipo_ator",
          "area_ator",
          "titulo",
          "descricao",
          "sistemas_documentos",
        ],
        ...data.steps.flatMap((step, index) =>
          step.substeps.flatMap((substep) => [
            [
              String(index + 1),
              substep.codigo,
              substep.tipo,
              substep.classificacao,
              substep.actorType === "area"
                ? "Área"
                : substep.actorType === "position"
                  ? "Cargo"
                  : "",
              substep.actorName,
              substep.titulo,
              substep.descricao,
              data.systems
                .filter(
                  (system) =>
                    substep.systemIds.includes(system.id) ||
                    (!!system.systemId && substep.systemIds.includes(system.systemId)),
                )
                .map((system) => system.nome)
                .join("; "),
            ],
            ...substep.activities.map((activity) => [
              String(index + 1),
              activity.codigo,
              "atividade",
              activity.classificacao,
              activity.actorType === "area"
                ? "Área"
                : activity.actorType === "position"
                  ? "Cargo"
                  : "",
              activity.actorName,
              activity.titulo,
              activity.descricao,
              data.systems
                .filter(
                  (system) =>
                    activity.systemIds.includes(system.id) ||
                    (!!system.systemId && activity.systemIds.includes(system.systemId)),
                )
                .map((system) => system.nome)
                .join("; "),
            ]),
          ]),
        ),
      ],
    },
    {
      name: "SIPOC",
      rows: [
        ["fornecedores", "entradas", "processo", "saidas", "clientes"],
        ...data.sipocRows.map((item) => [
          item.fornecedores,
          item.entradas,
          item.processo,
          item.saidas,
          item.clientes,
        ]),
      ],
    },
    {
      name: "Gaps",
      rows: [
        [
          "causaCatalogoId",
          "causa",
          "descricao",
          "impacto",
          "acao",
          "responsavel",
          "prazo",
          "prioridade",
          "status",
          "comentarios",
        ],
        ...data.gaps.map((item) => [
          item.sharedCauseId ?? "",
          item.causa,
          item.descricao,
          item.impacto,
          item.acao,
          item.responsavel,
          item.prazo,
          item.prioridade,
          item.status,
          item.comentarios.map((comment) => comment.text).join("\n"),
        ]),
      ],
    },
    {
      name: "Proximos passos",
      rows: [
        ["texto", "responsavel", "prazo"],
        ...data.nextSteps.map((item) => [item.text, item.responsavel ?? "", item.prazo ?? ""]),
      ],
    },
    {
      name: "Glossario",
      rows: [["termo", "definicao"], ...data.glossary.map((item) => [item.termo, item.definicao])],
    },
  ];

  return buildXlsxWorkbook(sheets);
}

function buildPopImportTemplate(data: PopState) {
  return buildXlsxWorkbook([
    {
      name: "Instrucoes",
      rows: [
        ["Uso", "Preencha apenas textos. Imagens devem ser adicionadas diretamente no BF Flow."],
        ["Importacao", "Mantenha os nomes das abas e cabecalhos para o sistema reconhecer."],
        ["Repeticoes", "Adicione novas linhas nas abas de tabelas quando precisar."],
      ],
    },
    {
      name: "Identificacao",
      rows: rowsFromFields([
        ["tipo", data.meta.tipo],
        ["codigo", data.meta.codigo],
        ["titulo", data.meta.titulo],
        ["publico", data.meta.publico],
        ["area", data.meta.area],
        ["processo", data.meta.processo],
        ["versao", data.meta.versao],
        ["vigencia", data.meta.vigencia],
        ["elaboracao", data.meta.elaboracao],
        ["revisor", data.meta.revisor],
        ["aprovacao", data.meta.aprovacao],
        ["publicacao", data.meta.publicacao],
      ]),
    },
    {
      name: "Objetivo",
      rows: rowsFromFields([
        ["objetivo", data.purpose.objetivo],
        ["abrangencia", data.purpose.abrangencia],
        ["premissas", data.purpose.premissas],
        ["importante", data.purpose.importante],
      ]),
    },
    {
      name: "Conteudo",
      rows: [
        ["title", "description", "body", "records", "risks"],
        ...data.sections.map((item) => [
          item.title,
          item.description,
          item.body,
          item.records,
          item.risks,
        ]),
      ],
    },
    {
      name: "Responsabilidades",
      rows: [
        ["area", "cargo", "responsabilidade"],
        ...data.responsibilities.map((item) => [
          item.area,
          item.cargo ?? "",
          item.responsabilidade,
        ]),
      ],
    },
    {
      name: "Referencias",
      rows: [
        ["codigo", "titulo", "aplicabilidade"],
        ...data.references.map((item) => [item.codigo, item.titulo, item.aplicabilidade]),
      ],
    },
    {
      name: "Historico",
      rows: [
        ["codigo", "version", "date", "elaborador", "revisor", "aprovador"],
        ...data.history.map((item) => [
          item.codigo,
          item.version,
          item.date,
          item.elaborador,
          item.revisor,
          item.aprovador,
        ]),
      ],
    },
    {
      name: "Alteracoes",
      rows: [
        ["versao", "local", "descricao"],
        ...data.changes.map((item) => [item.versao, item.local, item.descricao]),
      ],
    },
  ]);
}

function readU16(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readU32(bytes: Uint8Array, offset: number) {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}

async function inflateRaw(bytes: Uint8Array) {
  if (!("DecompressionStream" in globalThis)) {
    throw new Error("Este navegador nao consegue ler XLSX compactado. Use o modelo baixado aqui.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzipEntries(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (readU32(bytes, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Arquivo XLSX invalido.");

  const entries = readU16(bytes, eocd + 10);
  let offset = readU32(bytes, eocd + 16);
  const decoder = new TextDecoder();
  const out = new Map<string, string>();

  for (let i = 0; i < entries; i += 1) {
    if (readU32(bytes, offset) !== 0x02014b50) break;
    const method = readU16(bytes, offset + 10);
    const compressedSize = readU32(bytes, offset + 20);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const localOffset = readU32(bytes, offset + 42);
    const name = decoder.decode(bytes.slice(offset + 46, offset + 46 + nameLength));
    const localNameLength = readU16(bytes, localOffset + 26);
    const localExtraLength = readU16(bytes, localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    const data =
      method === 0 ? compressed : method === 8 ? await inflateRaw(compressed) : new Uint8Array();
    if (name.endsWith(".xml")) out.set(name, decoder.decode(data));
    offset += 46 + nameLength + extraLength + commentLength;
  }

  return out;
}

function xmlDoc(xml: string) {
  return new DOMParser().parseFromString(xml, "application/xml");
}

function relTarget(entries: Map<string, string>, relId: string) {
  const rels = entries.get("xl/_rels/workbook.xml.rels");
  if (!rels) return "";
  const doc = xmlDoc(rels);
  const rel = Array.from(doc.getElementsByTagName("Relationship")).find(
    (item) => item.getAttribute("Id") === relId,
  );
  const target = rel?.getAttribute("Target") ?? "";
  return target.startsWith("xl/") ? target : `xl/${target}`;
}

function sharedStrings(entries: Map<string, string>) {
  const xml = entries.get("xl/sharedStrings.xml");
  if (!xml) return [] as string[];
  const doc = xmlDoc(xml);
  return Array.from(doc.getElementsByTagName("si")).map((item) =>
    Array.from(item.getElementsByTagName("t"))
      .map((node) => node.textContent ?? "")
      .join(""),
  );
}

function parseSheetRows(xml: string, shared: string[]) {
  const doc = xmlDoc(xml);
  return Array.from(doc.getElementsByTagName("row")).map((row) => {
    const values: string[] = [];
    Array.from(row.getElementsByTagName("c")).forEach((cell) => {
      const ref = cell.getAttribute("r") ?? "";
      const index = columnIndex(ref);
      const type = cell.getAttribute("t");
      const valueNode = cell.getElementsByTagName("v")[0];
      const inlineNode = cell.getElementsByTagName("t")[0];
      let value = "";
      if (type === "s") value = shared[Number(valueNode?.textContent ?? 0)] ?? "";
      else if (type === "inlineStr") value = inlineNode?.textContent ?? "";
      else value = valueNode?.textContent ?? inlineNode?.textContent ?? "";
      values[index] = value;
    });
    return values.map((value) => value ?? "");
  });
}

async function readXlsxSheets(file: File) {
  const entries = await unzipEntries(file);
  const workbook = entries.get("xl/workbook.xml");
  if (!workbook) throw new Error("Pasta de trabalho XLSX invalida.");
  const doc = xmlDoc(workbook);
  const shared = sharedStrings(entries);
  const result = new Map<string, string[][]>();

  Array.from(doc.getElementsByTagName("sheet")).forEach((sheet) => {
    const name = sheet.getAttribute("name") ?? "";
    const relId = sheet.getAttribute("r:id") ?? "";
    const target = relTarget(entries, relId);
    const xml = entries.get(target);
    if (name && xml) result.set(normalizeLabel(name), parseSheetRows(xml, shared));
  });

  return result;
}

function sheetRows(sheets: Map<string, string[][]>, name: string) {
  return sheets.get(normalizeLabel(name)) ?? [];
}

function fieldMap(rows: string[][]) {
  const map = new Map<string, string>();
  rows.slice(1).forEach((row) => {
    const key = normalizeLabel(row[0] ?? "");
    if (key) map.set(key, row[1] ?? "");
  });
  return map;
}

function rowObjects(rows: string[][]) {
  const headers = (rows[0] ?? []).map((header) => normalizeLabel(header));
  return rows
    .slice(1)
    .filter((row) => row.some((value) => String(value ?? "").trim()))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, String(row[index] ?? "")])),
    );
}

function mapValue(map: Map<string, string>, key: string, fallback = "") {
  return map.get(normalizeLabel(key)) ?? fallback;
}

function rowValue(row: Record<string, string>, key: string, fallback = "") {
  return row[normalizeLabel(key)] ?? fallback;
}

function importDdpTextWorkbook(sheets: Map<string, string[][]>, current: DdpState) {
  const meta = fieldMap(sheetRows(sheets, "Identificacao"));
  const overview = fieldMap(sheetRows(sheets, "Visao geral"));
  const macro = fieldMap(sheetRows(sheets, "Macroprocesso"));
  const systems = rowObjects(sheetRows(sheets, "Sistemas")).map((row, index) => ({
    id: current.systems[index]?.id || id("sys"),
    nome: rowValue(row, "nome"),
    tipo: normalizeSystemModality(rowValue(row, "classificacao") || rowValue(row, "tipo")),
    dono: rowValue(row, "dono"),
    criticidade: rowValue(row, "criticidade", "Média"),
    descricao: rowValue(row, "descricao"),
  }));
  const substepRows = rowObjects(
    sheetRows(sheets, "Atividades Fluxo").length
      ? sheetRows(sheets, "Atividades Fluxo")
      : sheetRows(sheets, "Subetapas Fluxo"),
  );
  const systemIdsForRow = (row: Record<string, string>) =>
    rowValue(row, "sistemas_documentos")
      .split(";")
      .map((name) => normalizeLabel(name))
      .filter(Boolean)
      .map((name) => systems.find((system) => normalizeLabel(system.nome) === name)?.id)
      .filter((systemId): systemId is string => Boolean(systemId));
  const steps = rowObjects(sheetRows(sheets, "Fluxo AS IS")).map((row, index) => {
    const rowsForStep = substepRows.filter((substep) => {
      const stepRef = rowValue(substep, "etapa");
      return (
        stepRef === String(index + 1) ||
        normalizeLabel(stepRef) === normalizeLabel(rowValue(row, "etapa"))
      );
    });
    const substeps: DdpFlowSubstep[] = [];

    rowsForStep.forEach((entry, entryIndex) => {
      const code = rowValue(entry, "codigo") || `${index + 1}.${entryIndex + 1}`;
      const codeParts = code.split(".");
      const isNestedActivity = codeParts.length >= 3;
      const activityData = {
        id: id("activity"),
        codigo: code,
        titulo: rowValue(entry, "titulo"),
        descricao: rowValue(entry, "descricao"),
        classificacao: normalizeFlowExecutionType(rowValue(entry, "classificacao")),
        actorType: normalizeFlowActorType(rowValue(entry, "tipo_ator")),
        actorName: rowValue(entry, "area_ator"),
        systemIds: systemIdsForRow(entry),
        images: [] as ModuleImage[],
      };

      if (isNestedActivity) {
        const parentCode = codeParts.slice(0, 2).join(".");
        let parent = substeps.find((item) => item.codigo === parentCode);
        if (!parent) {
          parent = {
            id: id("substep"),
            processId: "",
            processVersion: 1,
            codigo: parentCode,
            titulo: `Subprocesso ${parentCode}`,
            descricao: "",
            tipo: "subprocesso",
            classificacao: "Automática",
            actorType: "",
            actorName: "",
            systemIds: [],
            images: [],
            activities: [],
          };
          substeps.push(parent);
        }
        parent.tipo = "subprocesso";
        parent.activities.push(activityData);
        return;
      }

      const currentEntry = current.steps[index]?.substeps[substeps.length];
      substeps.push({
        id: currentEntry?.id || id("substep"),
        processId: currentEntry?.processId || "",
        processVersion: currentEntry?.processVersion || 1,
        codigo: code,
        titulo: activityData.titulo,
        descricao: activityData.descricao,
        tipo:
          normalizeLabel(rowValue(entry, "tipo")) === "subprocesso" ? "subprocesso" : "atividade",
        classificacao: activityData.classificacao,
        actorType: activityData.actorType,
        actorName: activityData.actorName,
        systemIds: activityData.systemIds,
        images: currentEntry?.images ?? [],
        activities: [],
      });
    });

    return {
      id: current.steps[index]?.id || id("step"),
      etapa: rowValue(row, "etapa"),
      responsavel: rowValue(row, "responsavel"),
      entrada: rowValue(row, "entrada"),
      atividade: rowValue(row, "atividade"),
      saida: rowValue(row, "saida"),
      sistema: rowValue(row, "sistema"),
      risco: rowValue(row, "risco"),
      observacoes: rowValue(row, "observacoes"),
      images: current.steps[index]?.images ?? [],
      substeps,
    };
  });

  return normalizeDdp(
    {
      ...current,
      meta: {
        ...current.meta,
        codigo: mapValue(meta, "codigo", current.meta.codigo),
        subtitulo: mapValue(meta, "subtitulo", current.meta.subtitulo),
        titulo: mapValue(meta, "titulo", current.meta.titulo),
        area: mapValue(meta, "area", current.meta.area),
        responsavel: mapValue(meta, "responsavel", current.meta.responsavel),
        versao: mapValue(meta, "versao", current.meta.versao),
        data: mapValue(meta, "data", current.meta.data),
        dataRelatorio: mapValue(meta, "dataRelatorio", current.meta.dataRelatorio),
        elaborador: mapValue(meta, "elaborador", current.meta.elaborador),
        revisor: mapValue(meta, "revisor", current.meta.revisor),
      },
      overview: {
        ...current.overview,
        objetivo: mapValue(overview, "objetivo", current.overview.objetivo),
        escopo: mapValue(overview, "escopo", current.overview.escopo),
        estadoAtual: mapValue(overview, "estadoAtual", current.overview.estadoAtual),
        kpis: mapValue(overview, "kpis", current.overview.kpis),
        donoProcesso: mapValue(overview, "donoProcesso", current.overview.donoProcesso),
        volume: mapValue(overview, "volume", current.overview.volume),
        frequencia: mapValue(overview, "frequencia", current.overview.frequencia),
        dores: mapValue(overview, "dores", current.overview.dores),
        oportunidades: mapValue(overview, "oportunidades", current.overview.oportunidades),
      },
      systems: systems.length ? systems : current.systems,
      macroprocess: {
        ...current.macroprocess,
        titulo: mapValue(macro, "titulo", current.macroprocess.titulo),
        legenda: mapValue(macro, "legenda", current.macroprocess.legenda),
      },
      steps: steps.length ? steps : current.steps,
      sipocRows: rowObjects(sheetRows(sheets, "SIPOC")).map((row, index) => ({
        id: current.sipocRows[index]?.id || id("sipoc"),
        fornecedores: rowValue(row, "fornecedores"),
        entradas: rowValue(row, "entradas"),
        processo: rowValue(row, "processo"),
        saidas: rowValue(row, "saidas"),
        clientes: rowValue(row, "clientes"),
      })),
      gaps: rowObjects(sheetRows(sheets, "Gaps")).map((row, index) => ({
        id: current.gaps[index]?.id || id("gap"),
        sharedCauseId: rowValue(row, "causaCatalogoId", current.gaps[index]?.sharedCauseId ?? ""),
        causa: rowValue(row, "causa"),
        descricao: rowValue(row, "descricao", current.gaps[index]?.descricao ?? ""),
        impacto: rowValue(row, "impacto"),
        acao: rowValue(row, "acao"),
        responsavel: rowValue(row, "responsavel"),
        prazo: rowValue(row, "prazo"),
        prioridade: normalizeCausePriority(rowValue(row, "prioridade", "Média")),
        status: normalizeCauseStatus(rowValue(row, "status", "Pendente")),
        comentarios: normalizeCauseComments(
          rowValue(row, "comentarios"),
          current.gaps[index]?.id || "comment",
        ),
      })),
      nextSteps: rowObjects(sheetRows(sheets, "Proximos passos")).map((row, index) => ({
        id: current.nextSteps[index]?.id || id("next"),
        text: rowValue(row, "texto"),
        responsavel: rowValue(row, "responsavel"),
        prazo: rowValue(row, "prazo"),
      })),
      glossary: rowObjects(sheetRows(sheets, "Glossario")).map((row, index) => ({
        id: current.glossary[index]?.id || id("gloss"),
        termo: rowValue(row, "termo"),
        definicao: rowValue(row, "definicao"),
      })),
    },
    current,
  );
}

function importPopTextWorkbook(sheets: Map<string, string[][]>, current: PopState) {
  const meta = fieldMap(sheetRows(sheets, "Identificacao"));
  const purpose = fieldMap(sheetRows(sheets, "Objetivo"));
  return normalizePop(
    {
      ...current,
      meta: {
        ...current.meta,
        tipo: normalizePopType(mapValue(meta, "tipo", current.meta.tipo)),
        codigo: mapValue(meta, "codigo", current.meta.codigo),
        titulo: mapValue(meta, "titulo", current.meta.titulo),
        publico: mapValue(meta, "publico", current.meta.publico),
        area: mapValue(meta, "area", current.meta.area),
        processo: mapValue(meta, "processo", current.meta.processo),
        versao: mapValue(meta, "versao", current.meta.versao),
        vigencia: mapValue(meta, "vigencia", current.meta.vigencia),
        elaboracao: mapValue(meta, "elaboracao", current.meta.elaboracao),
        revisor: mapValue(meta, "revisor", current.meta.revisor),
        aprovacao: mapValue(meta, "aprovacao", current.meta.aprovacao),
        publicacao: mapValue(meta, "publicacao", current.meta.publicacao),
      },
      purpose: {
        objetivo: mapValue(purpose, "objetivo", current.purpose.objetivo),
        abrangencia: mapValue(purpose, "abrangencia", current.purpose.abrangencia),
        premissas: mapValue(purpose, "premissas", current.purpose.premissas),
        importante: mapValue(purpose, "importante", current.purpose.importante),
      },
      sections: rowObjects(sheetRows(sheets, "Conteudo")).map((row, index) => ({
        id: current.sections[index]?.id || id("sec"),
        title: rowValue(row, "title", "Nova seção"),
        description: rowValue(row, "description"),
        body: rowValue(row, "body"),
        records: rowValue(row, "records"),
        risks: rowValue(row, "risks"),
        images: current.sections[index]?.images ?? [],
      })),
      responsibilities: rowObjects(sheetRows(sheets, "Responsabilidades")).map((row, index) => ({
        id: current.responsibilities[index]?.id || id("resp"),
        area: rowValue(row, "area"),
        cargo: rowValue(row, "cargo"),
        responsabilidade: rowValue(row, "responsabilidade"),
      })),
      references: rowObjects(sheetRows(sheets, "Referencias")).map((row, index) => ({
        id: current.references[index]?.id || id("ref"),
        codigo: rowValue(row, "codigo"),
        titulo: rowValue(row, "titulo"),
        aplicabilidade: rowValue(row, "aplicabilidade"),
      })),
      history: rowObjects(sheetRows(sheets, "Historico")).map((row, index) => ({
        id: current.history[index]?.id || id("rev"),
        codigo: rowValue(row, "codigo"),
        version: rowValue(row, "version"),
        date: rowValue(row, "date", today()),
        elaborador: rowValue(row, "elaborador"),
        revisor: rowValue(row, "revisor"),
        aprovador: rowValue(row, "aprovador"),
      })),
      changes: rowObjects(sheetRows(sheets, "Alteracoes")).map((row, index) => ({
        id: current.changes[index]?.id || id("change"),
        versao: rowValue(row, "versao"),
        local: rowValue(row, "local"),
        descricao: rowValue(row, "descricao"),
      })),
    },
    current,
  );
}

function createDocxContext(params: {
  code: string;
  title: string;
  footerLeft: string;
  brand?: OrganizationBrand;
}) {
  const media: DocxMedia[] = [];
  let relCounter = 1;
  let mediaCounter = 1;
  const organizationName = params.brand?.name || "BF Flow";
  const headerColor = docxColor(params.brand?.word_header_color, "1D1D1F");
  const C = {
    green: headerColor,
    headerLine: "C9CCCB",
    text: "4B5563",
    gray900: "25302D",
    gray700: "374151",
    gray600: "4B5563",
    gray500: "6B7280",
    gray300: "D1D5DB",
    gray100: "F3F4F6",
    gray50: "F9FAFB",
    warning: "D49A21",
    warningFill: "FFF7E1",
    white: "FFFFFF",
  };
  const PAGE_W = 11906;
  const PAGE_H = 16838;
  const MARGIN_X = 800;
  const CONTENT_W = PAGE_W - MARGIN_X * 2;
  const FONT = "Segoe UI";

  function x(value: unknown) {
    return plain(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function twip(pt: number) {
    return Math.round(pt * 20);
  }

  function emu(inches: number) {
    return Math.round(inches * 914400);
  }

  function fontXml() {
    return `<w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}" w:cs="${FONT}" w:eastAsia="${FONT}"/>`;
  }

  function run(text: unknown, opts: DocxParagraphOptions = {}) {
    const bold = opts.bold ? "<w:b/><w:bCs/>" : "";
    const caps = opts.caps ? "<w:caps/>" : "";
    const color = `<w:color w:val="${opts.color || C.text}"/>`;
    const size = `<w:sz w:val="${Math.round((opts.size || 10.5) * 2)}"/><w:szCs w:val="${Math.round(
      (opts.size || 10.5) * 2,
    )}"/>`;
    return `<w:r><w:rPr>${fontXml()}${bold}${caps}${color}${size}</w:rPr><w:t xml:space="preserve">${x(
      text,
    )}</w:t></w:r>`;
  }

  function field(code: string, fallback: string) {
    return `<w:r><w:fldChar w:fldCharType="begin" w:dirty="true"/></w:r><w:r><w:instrText xml:space="preserve"> ${x(
      code,
    )} </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>${x(
      fallback,
    )}</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>`;
  }

  function p(text: unknown, opts: DocxParagraphOptions = {}) {
    const style = opts.style ? `<w:pStyle w:val="${opts.style}"/>` : "";
    const jc = opts.align ? `<w:jc w:val="${opts.align}"/>` : "";
    const keep = opts.keep ? "<w:keepNext/>" : "";
    const ind = opts.left ? `<w:ind w:left="${opts.left}"/>` : "";
    const shd = opts.fill ? `<w:shd w:fill="${opts.fill}"/>` : "";
    const spacing = `<w:spacing w:before="${twip(opts.before || 0)}" w:after="${twip(
      opts.after ?? 4,
    )}"${opts.line ? ` w:line="${Math.round(opts.line * 240)}" w:lineRule="auto"` : ""}/>`;
    return `<w:p><w:pPr>${style}${jc}${keep}${ind}${spacing}${shd}</w:pPr>${run(text, opts)}</w:p>`;
  }

  function mixedP(label: string, text: unknown, opts: DocxParagraphOptions = {}) {
    return `<w:p><w:pPr><w:jc w:val="${opts.align || "both"}"/><w:spacing w:before="${twip(
      opts.before || 0,
    )}" w:after="${twip(opts.after ?? 4)}" w:line="${Math.round(
      (opts.line || 1.05) * 240,
    )}" w:lineRule="auto"/></w:pPr>${run(label, {
      bold: true,
      size: opts.size || 10.5,
      color: C.gray700,
    })}${run(text, { size: opts.size || 10.5, color: opts.color || C.text })}</w:p>`;
  }

  function pageBreak() {
    return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
  }

  function dataUriInfo(dataUri: string) {
    const match = String(dataUri || "").match(/^data:([^;]+);base64,(.*)$/);
    if (!match) return null;
    const mime = match[1].toLowerCase();
    const b64 = match[2];
    let ext = "png";
    if (mime.includes("jpeg") || mime.includes("jpg")) ext = "jpg";
    else if (mime.includes("gif")) ext = "gif";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return { mime, ext, bytes };
  }

  function imageSizeFromBytes(bytes: Uint8Array, ext: string) {
    try {
      if (ext === "png" && bytes.length > 24) {
        const w = ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0;
        const h = ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0;
        if (w && h) return { w, h };
      }
      if (ext === "jpg" && bytes.length > 4) {
        let i = 2;
        while (i < bytes.length) {
          if (bytes[i] !== 0xff) {
            i += 1;
            continue;
          }
          const marker = bytes[i + 1];
          const len = (bytes[i + 2] << 8) + bytes[i + 3];
          if (marker >= 0xc0 && marker <= 0xc3) {
            const h = (bytes[i + 5] << 8) + bytes[i + 6];
            const w = (bytes[i + 7] << 8) + bytes[i + 8];
            if (w && h) return { w, h };
          }
          i += 2 + len;
        }
      }
    } catch {
      return { w: 1200, h: 700 };
    }
    return { w: 1200, h: 700 };
  }

  function addImage(dataUri: string, scope: DocxMedia["scope"] = "document") {
    const info = dataUriInfo(dataUri);
    if (!info) return null;
    const rid = `rIdImg${relCounter}`;
    relCounter += 1;
    const name = `image${mediaCounter}.${info.ext}`;
    mediaCounter += 1;
    const size = imageSizeFromBytes(info.bytes, info.ext);
    media.push({ rid, name, ext: info.ext, bytes: info.bytes, size, scope });
    return { rid, name, size };
  }

  function imageParagraph(
    dataUri: string,
    title: string,
    widthIn = 7.0,
    maxH = 4.6,
    scope: DocxMedia["scope"] = "document",
  ) {
    const img = addImage(dataUri, scope);
    if (!img) return "";
    const ratio = img.size.h / img.size.w;
    let wIn = widthIn;
    let hIn = wIn * ratio;
    if (hIn > maxH) {
      hIn = maxH;
      wIn = hIn / ratio;
    }
    const shapeId = 1000 + mediaCounter + Math.floor(Math.random() * 10000);
    return `<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="${twip(4)}" w:after="${twip(
      8,
    )}"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><wp:extent cx="${emu(
      wIn,
    )}" cy="${emu(hIn)}"/><wp:docPr id="${shapeId}" name="${x(
      title,
    )}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${shapeId}" name="${x(
      title,
    )}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${
      img.rid
    }"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu(
      wIn,
    )}" cy="${emu(
      hIn,
    )}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
  }

  function cell(cellData: DocxCell, width: number) {
    const fill = cellData.fill ? `<w:shd w:fill="${cellData.fill}" w:val="clear"/>` : "";
    const gridSpan = cellData.gridSpan ? `<w:gridSpan w:val="${cellData.gridSpan}"/>` : "";
    return `<w:tc><w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>${gridSpan}${fill}<w:tcMar><w:top w:w="${
      cellData.padY || 90
    }" w:type="dxa"/><w:left w:w="${cellData.padX || 140}" w:type="dxa"/><w:bottom w:w="${
      cellData.padY || 90
    }" w:type="dxa"/><w:right w:w="${
      cellData.padX || 140
    }" w:type="dxa"/></w:tcMar><w:vAlign w:val="${
      cellData.valign || "top"
    }"/></w:tcPr>${cellData.xml || p(cellData.text || "", { after: 0 })}</w:tc>`;
  }

  function table(
    rows: DocxCell[][],
    widths: number[],
    opts: { full?: boolean; border?: string } = {},
  ) {
    const total = widths.reduce((sum, item) => sum + item, 0) || CONTENT_W;
    const target = opts.full ? CONTENT_W : total;
    const scale = target / total;
    const ws = widths.map((width) => Math.round(width * scale));
    const diff = target - ws.reduce((sum, item) => sum + item, 0);
    if (ws.length) ws[ws.length - 1] += diff;
    const border = opts.border || C.gray300;
    return `<w:tbl><w:tblPr><w:tblW w:w="${target}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:color="${border}" w:sz="4"/><w:left w:val="single" w:color="${border}" w:sz="4"/><w:bottom w:val="single" w:color="${border}" w:sz="4"/><w:right w:val="single" w:color="${border}" w:sz="4"/><w:insideH w:val="single" w:color="${border}" w:sz="4"/><w:insideV w:val="single" w:color="${border}" w:sz="4"/></w:tblBorders></w:tblPr><w:tblGrid>${ws
      .map((width) => `<w:gridCol w:w="${width}"/>`)
      .join("")}</w:tblGrid>${rows
      .map(
        (row) =>
          `<w:tr>${row.map((item, index) => cell(item, ws[index] || ws[0])).join("")}</w:tr>`,
      )
      .join("")}</w:tbl>`;
  }

  function headerCell(text: string): DocxCell {
    return {
      xml: p(text, { size: 8, bold: true, caps: true, color: C.white, after: 0 }),
      fill: C.gray700,
    };
  }

  function bodyCell(text: unknown, opts: DocxParagraphOptions = {}): DocxCell {
    return {
      xml: p(text || "-", {
        size: opts.size || 9.2,
        color: opts.color || C.text,
        align: opts.align || "left",
        after: 0,
        line: 1.0,
      }),
      fill: opts.fill || C.white,
    };
  }

  function labelValue(label: string, value: unknown) {
    return `<w:p><w:pPr><w:spacing w:after="40"/></w:pPr>${run(label, {
      size: 7,
      bold: true,
      caps: true,
      color: C.gray900,
    })}</w:p><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${run(value || "-", {
      size: 10,
      color: C.text,
    })}</w:p>`;
  }

  function notice(text: string) {
    return table(
      [
        [
          {
            xml: p("!", { size: 15, bold: true, color: C.white, align: "center", after: 0 }),
            fill: C.warning,
            valign: "center",
          },
          {
            xml: labelValue("Observação", text),
            fill: C.warningFill,
            valign: "center",
          },
        ],
      ],
      [650, CONTENT_W - 650],
      { full: true, border: C.warning },
    );
  }

  function sectionTitle(title: string) {
    return `<w:p><w:pPr><w:spacing w:before="0" w:after="${twip(
      12,
    )}"/></w:pPr></w:p><w:tbl><w:tblPr><w:tblW w:w="${CONTENT_W}" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="${CONTENT_W}"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="${CONTENT_W}" w:type="dxa"/><w:shd w:fill="${C.gray100}"/><w:tcBorders><w:left w:val="single" w:color="${C.gray600}" w:sz="28"/><w:top w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders><w:tcMar><w:top w:w="130" w:type="dxa"/><w:left w:w="210" w:type="dxa"/><w:bottom w:w="130" w:type="dxa"/><w:right w:w="120" w:type="dxa"/></w:tcMar></w:tcPr>${p(
      title,
      {
        style: "Heading1",
        size: 13,
        bold: true,
        caps: true,
        color: C.gray900,
        after: 0,
        keep: true,
      },
    )}</w:tc></w:tr></w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="${twip(
      4,
    )}"/></w:pPr></w:p>`;
  }

  function subTitle(title: string) {
    return p(title, {
      style: "Heading2",
      size: 11.5,
      bold: true,
      caps: true,
      color: C.gray700,
      before: 8,
      after: 4,
      keep: true,
    });
  }

  function tocLine(num: string, title: string) {
    return `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:leader="dot" w:pos="9300"/></w:tabs><w:spacing w:after="80"/></w:pPr>${run(
      `${num}  ${title}`,
      { size: 10.5, bold: true, color: C.gray700 },
    )}${run("\t", { size: 10.5, color: C.gray700 })}</w:p>`;
  }

  function sectionBreak() {
    return `<w:p><w:pPr><w:sectPr><w:type w:val="nextPage"/><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="1800" w:right="${MARGIN_X}" w:bottom="720" w:left="${MARGIN_X}" w:header="0" w:footer="360" w:gutter="0"/></w:sectPr></w:pPr></w:p>`;
  }

  function finish(parts: string[]) {
    const sectPr = `<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader1"/><w:footerReference w:type="default" r:id="rIdFooter1"/><w:pgSz w:w="${PAGE_W}" w:h="${PAGE_H}"/><w:pgMar w:top="1800" w:right="${MARGIN_X}" w:bottom="720" w:left="${MARGIN_X}" w:header="0" w:footer="360" w:gutter="0"/></w:sectPr>`;
    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup" xmlns:wpi="http://schemas.microsoft.com/office/word/2010/wordprocessingInk" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 wp14"><w:body>${parts.join(
      "",
    )}${sectPr}</w:body></w:document>`;
    const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr>${fontXml()}<w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="${C.text}"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="80"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr>${fontXml()}<w:sz w:val="21"/><w:szCs w:val="21"/><w:color w:val="${C.text}"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="Heading 1"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="0" w:after="0"/></w:pPr><w:rPr>${fontXml()}<w:b/><w:bCs/><w:caps/><w:color w:val="${C.gray900}"/><w:sz w:val="26"/><w:szCs w:val="26"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="Heading 2"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr><w:rPr>${fontXml()}<w:b/><w:bCs/><w:caps/><w:color w:val="${C.gray700}"/><w:sz w:val="23"/><w:szCs w:val="23"/></w:rPr></w:style></w:styles>`;
    const settingsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:updateFields w:val="true"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`;
    const headerBrandXml = params.brand?.logo_data_url
      ? imageParagraph(params.brand.logo_data_url, organizationName, 1.25, 0.55, "header")
      : p(organizationName, { size: 11, bold: true, color: C.white, align: "center", after: 0 });
    const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:tbl><w:tblPr><w:tblW w:w="${PAGE_W}" w:type="dxa"/><w:tblInd w:w="-${MARGIN_X}" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="8334"/><w:gridCol w:w="3572"/></w:tblGrid><w:tr><w:trPr><w:trHeight w:val="1590" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="8334" w:type="dxa"/><w:shd w:fill="${C.green}"/><w:vAlign w:val="center"/><w:tcMar><w:top w:w="240" w:type="dxa"/><w:left w:w="680" w:type="dxa"/><w:bottom w:w="220" w:type="dxa"/><w:right w:w="220" w:type="dxa"/></w:tcMar></w:tcPr>${p(
      params.code,
      { size: 10, bold: true, color: C.white, after: 6 },
    )}${p(params.title, { size: 20, bold: true, color: C.white, after: 0, line: 1 })}</w:tc><w:tc><w:tcPr><w:tcW w:w="3572" w:type="dxa"/><w:tcBorders><w:left w:val="single" w:sz="16" w:space="0" w:color="${C.white}"/></w:tcBorders><w:shd w:fill="${C.green}"/><w:vAlign w:val="center"/></w:tcPr>${headerBrandXml}</w:tc></w:tr><w:tr><w:trPr><w:trHeight w:val="70" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:tcW w:w="${PAGE_W}" w:type="dxa"/><w:shd w:fill="${C.headerLine}"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t> </w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:hdr>`;
    const footerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:tbl><w:tblPr><w:tblW w:w="${CONTENT_W}" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:color="${C.gray300}" w:sz="6"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="7000"/><w:gridCol w:w="3306"/></w:tblGrid><w:tr><w:tc><w:tcPr><w:tcW w:w="7000" w:type="dxa"/></w:tcPr>${p(
      params.footerLeft,
      { size: 8, color: C.gray600, after: 0 },
    )}</w:tc><w:tc><w:tcPr><w:tcW w:w="3306" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:jc w:val="right"/><w:spacing w:after="0"/></w:pPr>${run(
      "Pág ",
      { size: 8, color: C.gray600 },
    )}${field("PAGE", "1")}${run(" de ", { size: 8, color: C.gray600 })}${field(
      "NUMPAGES",
      "1",
    )}</w:p></w:tc></w:tr></w:tbl></w:ftr>`;
    const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/><Relationship Id="rIdHeader1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>${media
      .filter((item) => item.scope === "document")
      .map(
        (item) =>
          `<Relationship Id="${item.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.name}"/>`,
      )
      .join("")}</Relationships>`;
    const headerMedia = media.filter((item) => item.scope === "header");
    const headerRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${headerMedia
      .map(
        (item) =>
          `<Relationship Id="${item.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${item.name}"/>`,
      )
      .join("")}</Relationships>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="jpg" ContentType="image/jpeg"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="gif" ContentType="image/gif"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/></Types>`;
    const files: DocxFileEntry[] = [
      { name: "[Content_Types].xml", data: utf8(contentTypes) },
      { name: "_rels/.rels", data: utf8(rootRels) },
      { name: "word/document.xml", data: utf8(documentXml) },
      { name: "word/styles.xml", data: utf8(stylesXml) },
      { name: "word/settings.xml", data: utf8(settingsXml) },
      { name: "word/header1.xml", data: utf8(headerXml) },
      { name: "word/footer1.xml", data: utf8(footerXml) },
      { name: "word/_rels/document.xml.rels", data: utf8(documentRels) },
    ];
    if (headerMedia.length) {
      files.push({ name: "word/_rels/header1.xml.rels", data: utf8(headerRels) });
    }
    media.forEach((item) => files.push({ name: `word/media/${item.name}`, data: item.bytes }));
    return new Blob([zipStore(files)], {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
  }

  return {
    C,
    CONTENT_W,
    p,
    mixedP,
    pageBreak,
    table,
    headerCell,
    bodyCell,
    labelValue,
    notice,
    sectionTitle,
    subTitle,
    tocLine,
    sectionBreak,
    imageParagraph,
    finish,
  };
}

function buildDdpDocx(
  data: DdpState,
  brand?: OrganizationBrand,
  processCatalog: OrganizationProcess[] = [],
) {
  const model = getDdpExportModel(data, processCatalog);
  const title = plain(model.meta.titulo).replace(/^Processo\s+de\s+/i, "") || "Mapeamento";
  const doc = createDocxContext({
    code: model.meta.codigo,
    title,
    footerLeft: `${formatDateBr(model.meta.dataRelatorio || model.meta.data)} - por ${model.meta.elaborador || "BF Flow"}`,
    brand,
  });
  const parts: string[] = [];

  parts.push(doc.sectionTitle("00 Dados do Mapeamento"));
  parts.push(
    doc.table(
      [
        [
          { xml: doc.labelValue("Código do mapeamento", model.meta.codigo) },
          { xml: doc.labelValue("Título do mapeamento", model.meta.titulo), gridSpan: 2 },
          { xml: doc.labelValue("Modalidade", model.meta.modalidade) },
        ],
        [
          {
            xml: doc.labelValue("Status", model.meta.status || "Em andamento"),
            fill: doc.C.gray50,
          },
          {
            xml: doc.labelValue("Data", formatDateBr(model.meta.dataRelatorio || model.meta.data)),
            fill: doc.C.gray50,
          },
          { xml: doc.labelValue("Área", model.area || "-"), gridSpan: 2, fill: doc.C.gray50 },
        ],
        [
          { xml: doc.labelValue("Dono", model.owner || "-") },
          { xml: doc.labelValue("Elaborador", model.meta.elaborador || "-") },
          { xml: doc.labelValue("Revisor", model.meta.revisor || "-"), gridSpan: 2 },
        ],
      ],
      [2576, 2576, 2576, 2578],
      { full: true },
    ),
  );
  parts.push(doc.sectionTitle("Índice"));
  [
    ["00", "Dados do Mapeamento"],
    ["01", "Visão Geral"],
    ["02", "Sistemas/Documentos Envolvidos"],
    ["03", "Análise SIPOC"],
    ["04", "Etapas do Processo"],
    ["05", "Visão Quantitativa"],
    ["06", "Oportunidades de Melhoria"],
    ["07", "Próximos Passos"],
    ["08", "Glossário"],
  ].forEach(([num, label]) => parts.push(doc.tocLine(num, label)));
  parts.push(doc.sectionBreak());

  parts.push(doc.sectionTitle("01 Visão Geral"));
  if (model.overview) parts.push(doc.p(model.overview, { align: "both", line: 1.05 }));
  model.cards.forEach((card) => {
    parts.push(doc.subTitle(card.title || "Item"));
    parts.push(doc.p(card.text, { align: "both", line: 1.05 }));
  });

  parts.push(doc.sectionTitle("02 Sistemas/Documentos Envolvidos"));
  parts.push(
    model.systems.length
      ? doc.table(
          [
            [
              doc.headerCell("Classificação"),
              doc.headerCell("Sistema/Documento"),
              doc.headerCell("Descrição / uso no processo"),
            ],
            ...model.systems.map((system) => [
              doc.bodyCell(system.type),
              doc.bodyCell(system.name),
              doc.bodyCell(system.items.join("; ") || system.description),
            ]),
          ],
          [1700, 2700, 5906],
          { full: true },
        )
      : doc.p("Nenhum sistema ou documento cadastrado."),
  );

  parts.push(doc.sectionTitle("03 Análise SIPOC do Processo"));
  parts.push(
    model.sipocRows.length
      ? doc.table(
          [
            [
              doc.headerCell("Processo"),
              doc.headerCell("Fornecedores"),
              doc.headerCell("Entradas"),
              doc.headerCell("Saídas"),
              doc.headerCell("Clientes"),
            ],
            ...model.sipocRows.map((row) => [
              doc.bodyCell(row.processo),
              doc.bodyCell(row.fornecedores),
              doc.bodyCell(row.entradas),
              doc.bodyCell(row.saidas),
              doc.bodyCell(row.clientes),
            ]),
          ],
          [2000, 2000, 2100, 2000, 2206],
          { full: true },
        )
      : doc.p("Nenhuma linha SIPOC cadastrada."),
  );

  parts.push(doc.sectionTitle("04 Etapas do Processo"));
  if (model.macroprocess.src) {
    parts.push(doc.subTitle(model.macroprocess.title || "Diagrama do Macroprocesso"));
    parts.push(
      doc.imageParagraph(model.macroprocess.src, model.macroprocess.title || "Macroprocesso"),
    );
    if (model.macroprocess.caption) {
      parts.push(
        doc.p(model.macroprocess.caption, { size: 8.5, color: doc.C.gray500, align: "center" }),
      );
    }
  }
  model.flowSteps.forEach((step, index) => {
    parts.push(doc.subTitle(`${String(index + 1).padStart(2, "0")} — ${step.title || "Etapa"}`));
    parts.push(doc.p(step.description, { align: "both", line: 1.05 }));
    if (step.owner || step.system || step.risk) {
      parts.push(
        doc.table(
          [
            [
              doc.headerCell("Responsável"),
              doc.headerCell("Sistema"),
              doc.headerCell("Risco / Observação"),
            ],
            [
              doc.bodyCell(step.owner || "-"),
              doc.bodyCell(step.system || "-"),
              doc.bodyCell(step.risk || "-"),
            ],
          ],
          [2600, 2600, 5106],
          { full: true },
        ),
      );
    }
    step.images.forEach((image) => {
      if (!image.src) return;
      parts.push(doc.imageParagraph(image.src, image.title));
      if (image.caption)
        parts.push(doc.p(image.caption, { size: 8.5, color: doc.C.gray500, align: "center" }));
    });
    if (step.substeps.length) {
      parts.push(
        doc.table(
          [
            [
              doc.headerCell("ID"),
              doc.headerCell("Etapa / atividade"),
              doc.headerCell("Classificação"),
              doc.headerCell("Área / ator"),
              doc.headerCell("Descrição"),
              doc.headerCell("Sistemas/Documentos"),
            ],
            ...step.substeps.flatMap((substep) => [
              [
                doc.bodyCell(substep.code),
                doc.bodyCell(substep.title),
                doc.bodyCell(substep.classification),
                doc.bodyCell(
                  substep.actorName
                    ? `${substep.actorType === "position" ? "Cargo" : "Área"}: ${substep.actorName}`
                    : "-",
                ),
                doc.bodyCell(substep.description),
                doc.bodyCell(
                  substep.systems.map((system) => `${system.name} (${system.type})`).join("; ") ||
                    "-",
                ),
              ],
              ...substep.activities.map((activity) => [
                doc.bodyCell(activity.code),
                doc.bodyCell(activity.title),
                doc.bodyCell(activity.classification),
                doc.bodyCell(
                  activity.actorName
                    ? `${activity.actorType === "position" ? "Cargo" : "Área"}: ${activity.actorName}`
                    : "-",
                ),
                doc.bodyCell(activity.description),
                doc.bodyCell(
                  activity.systems.map((system) => `${system.name} (${system.type})`).join("; ") ||
                    "-",
                ),
              ]),
            ]),
          ],
          [650, 1800, 1400, 1500, 2600, 2356],
          { full: true },
        ),
      );
      step.substeps.forEach((substep) => {
        substep.images.forEach((image) => {
          if (!image.src) return;
          parts.push(doc.imageParagraph(image.src, image.title));
          if (image.caption)
            parts.push(doc.p(image.caption, { size: 8.5, color: doc.C.gray500, align: "center" }));
        });
        substep.activities.forEach((activity) =>
          activity.images.forEach((image) => {
            if (!image.src) return;
            parts.push(doc.imageParagraph(image.src, image.title));
            if (image.caption)
              parts.push(
                doc.p(image.caption, { size: 8.5, color: doc.C.gray500, align: "center" }),
              );
          }),
        );
      });
    }
  });

  parts.push(doc.sectionTitle("05 Visão Quantitativa"));
  parts.push(
    doc.table(
      [
        [
          doc.headerCell("Processos"),
          doc.headerCell("Subprocessos"),
          doc.headerCell("Atividades"),
          doc.headerCell("Áreas"),
          doc.headerCell("Sistemas/Documentos"),
        ],
        [
          doc.bodyCell(String(model.stats.processes)),
          doc.bodyCell(String(model.stats.subprocesses)),
          doc.bodyCell(String(model.stats.activities)),
          doc.bodyCell(String(model.stats.areas)),
          doc.bodyCell(String(model.stats.systems)),
        ],
      ],
      [1800, 1900, 1900, 1700, 3006],
      { full: true },
    ),
  );
  parts.push(
    doc.table(
      [
        [
          doc.headerCell("Média de atividades"),
          doc.headerCell("Maior subprocesso"),
          doc.headerCell("Com automação"),
          doc.headerCell("Totalmente manuais"),
        ],
        [
          doc.bodyCell(
            `${model.stats.averageActivities.toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })} por processo ou subprocesso`,
          ),
          doc.bodyCell(`${model.stats.maxActivitiesInSubprocess} atividades`),
          doc.bodyCell(`${model.stats.automationPercentage}%`),
          doc.bodyCell(`${model.stats.fullyManualPercentage}%`),
        ],
      ],
      [2800, 2700, 2400, 2406],
      { full: true },
    ),
  );
  parts.push(doc.subTitle("Distribuição por forma de execução"));
  parts.push(
    doc.table(
      [
        [doc.headerCell("Forma de execução"), doc.headerCell("Quantidade"), doc.headerCell("%")],
        ...model.stats.execution.map((item) => [
          doc.bodyCell(item.label),
          doc.bodyCell(String(item.value)),
          doc.bodyCell(`${item.percentage}%`),
        ]),
      ],
      [6500, 1900, 1906],
      { full: true },
    ),
  );
  if (model.stats.areaDistribution.length) {
    parts.push(doc.subTitle("Participação das áreas"));
    parts.push(
      doc.table(
        [
          [doc.headerCell("Área"), doc.headerCell("Atividades"), doc.headerCell("%")],
          ...model.stats.areaDistribution.map((item) => [
            doc.bodyCell(item.label),
            doc.bodyCell(String(item.value)),
            doc.bodyCell(`${item.percentage}%`),
          ]),
        ],
        [6500, 1900, 1906],
        { full: true },
      ),
    );
  }
  if (model.stats.resourceUsage.length) {
    parts.push(doc.subTitle("Recursos mais utilizados"));
    parts.push(
      doc.table(
        [
          [
            doc.headerCell("Sistema/Documento"),
            doc.headerCell("Vínculos"),
            doc.headerCell("% das atividades"),
          ],
          ...model.stats.resourceUsage.map((item) => [
            doc.bodyCell(item.label),
            doc.bodyCell(String(item.value)),
            doc.bodyCell(`${item.percentage}%`),
          ]),
        ],
        [6500, 1900, 1906],
        { full: true },
      ),
    );
  }
  parts.push(doc.subTitle("Alertas analíticos"));
  parts.push(
    doc.table(
      [
        [
          doc.headerCell("Atividades integralmente manuais"),
          doc.headerCell("Sem área ou responsável"),
          doc.headerCell("Sem descrição"),
          doc.headerCell("Sem sistema relacionado"),
        ],
        [
          doc.bodyCell(String(model.stats.alerts.manualActivities)),
          doc.bodyCell(String(model.stats.alerts.withoutOwner)),
          doc.bodyCell(String(model.stats.alerts.withoutDescription)),
          doc.bodyCell(String(model.stats.alerts.withoutSystem)),
        ],
      ],
      [2576, 2576, 2576, 2578],
      { full: true },
    ),
  );

  parts.push(doc.sectionTitle("06 Oportunidades de Melhoria"));
  model.gaps.forEach((gap, index) => {
    parts.push(
      doc.table(
        [
          [
            {
              xml: doc.p(
                `${String(index + 1).padStart(2, "0")} — ${gap.title || "Oportunidade de melhoria"}`,
                {
                  size: 11.5,
                  bold: true,
                  caps: true,
                  color: doc.C.white,
                  after: 0,
                },
              ),
              fill: doc.C.gray700,
              gridSpan: 3,
            },
          ],
          [
            doc.bodyCell(`Prioridade: ${gap.priority || "-"}`),
            doc.bodyCell(`Responsável: ${gap.owner || "-"}`),
            doc.bodyCell(`Prazo: ${formatGapDateRangeBr(gap.due) || "-"}`),
          ],
          [{ xml: doc.mixedP("Status: ", gap.status || "-", { size: 9 }), gridSpan: 3 }],
          [{ xml: doc.mixedP("Descrição: ", gap.description || "-", { size: 9 }), gridSpan: 3 }],
          [{ xml: doc.mixedP("Impacto esperado: ", gap.impact || "-", { size: 9 }), gridSpan: 3 }],
          [{ xml: doc.mixedP("Ação proposta: ", gap.action || "-", { size: 9 }), gridSpan: 3 }],
          ...(gap.comments.length
            ? [
                [
                  {
                    xml: doc.mixedP(
                      "Comentários: ",
                      gap.comments
                        .map((comment) =>
                          joinClean([
                            comment.text,
                            comment.createdAt ? formatDateTimeBr(comment.createdAt) : "",
                          ]),
                        )
                        .join("\n"),
                      { size: 9 },
                    ),
                    gridSpan: 3,
                  },
                ],
              ]
            : []),
        ],
        [3100, 3100, 4106],
        { full: true },
      ),
    );
  });
  if (!model.gaps.length) parts.push(doc.p("Nenhuma oportunidade de melhoria cadastrada."));

  parts.push(doc.sectionTitle("07 Próximos Passos"));
  parts.push(
    model.nextSteps.length
      ? doc.table(
          [
            [doc.headerCell("Ação"), doc.headerCell("Responsável"), doc.headerCell("Prazo")],
            ...model.nextSteps.map((step) => [
              doc.bodyCell(step.title),
              doc.bodyCell(step.owner || "-"),
              doc.bodyCell(formatDateBr(step.due) || "-"),
            ]),
          ],
          [6800, 1900, 1606],
          { full: true },
        )
      : doc.p("Nenhum próximo passo cadastrado."),
  );

  parts.push(doc.pageBreak());
  parts.push(doc.sectionTitle("08 Glossário"));
  parts.push(
    model.glossary.length
      ? doc.table(
          [
            [doc.headerCell("Termo"), doc.headerCell("Definição")],
            ...model.glossary.map((item) => [
              doc.bodyCell(item.termo),
              doc.bodyCell(item.definicao),
            ]),
          ],
          [2600, 7706],
          { full: true },
        )
      : doc.p("Nenhum termo cadastrado."),
  );

  return doc.finish(parts);
}

function buildPopDocxModern(data: PopState, brand?: OrganizationBrand) {
  const model = getPopExportModel(data);
  const doc = createDocxContext({
    code: model.meta.codigo,
    title: model.meta.titulo,
    footerLeft: `${formatDateBr(model.meta.publicacao || model.meta.vigencia || today())} - por ${
      model.meta.elaboracao || "BF Flow"
    }`,
    brand,
  });
  const parts: string[] = [];

  parts.push(
    doc.table(
      [
        [
          { xml: doc.labelValue("Tipo", model.typeLabel) },
          { xml: doc.labelValue("Código", model.meta.codigo) },
          { xml: doc.labelValue("Vigência", formatDateBr(model.meta.vigencia)) },
          { xml: doc.labelValue("Versão", model.meta.versao) },
        ],
        [
          {
            xml: doc.labelValue("Público / Classificação", model.meta.publico),
            fill: doc.C.gray50,
          },
          { xml: doc.labelValue("Área responsável", model.meta.area), fill: doc.C.gray50 },
          { xml: doc.labelValue("Processo relacionado", model.meta.processo), fill: doc.C.gray50 },
          {
            xml: doc.labelValue("Publicação", formatDateBr(model.meta.publicacao)),
            fill: doc.C.gray50,
          },
        ],
        [
          { xml: doc.labelValue("Elaborador", model.meta.elaboracao), fill: doc.C.gray50 },
          { xml: doc.labelValue("Revisor", model.meta.revisor), fill: doc.C.gray50 },
          { xml: doc.labelValue("Aprovador", model.meta.aprovacao), fill: doc.C.gray50 },
          { xml: doc.labelValue("Sistema", "BF Flow"), fill: doc.C.gray50 },
        ],
      ],
      [2576, 2576, 2576, 2578],
      { full: true },
    ),
  );
  parts.push(doc.sectionTitle("Índice"));
  [
    ["01", "Objetivo"],
    ["02", "Abrangência"],
    ["03", model.contentTitle],
    ["04", "Responsabilidades"],
    ["05", "Referências Normativas"],
    ["06", "Histórico e Controle de Alterações"],
  ].forEach(([num, label]) => parts.push(doc.tocLine(num, label)));
  parts.push(doc.sectionBreak());

  parts.push(doc.sectionTitle("01 Objetivo"));
  parts.push(
    doc.p(model.purpose.objetivo || "Objetivo não informado.", { align: "both", line: 1.05 }),
  );
  parts.push(doc.sectionTitle("02 Abrangência"));
  parts.push(
    doc.p(model.purpose.abrangencia || "Abrangência não informada.", {
      align: "both",
      line: 1.05,
    }),
  );
  if (model.purpose.premissas) {
    parts.push(doc.subTitle("Premissas e Regras Gerais"));
    splitText(model.purpose.premissas).forEach((line) =>
      parts.push(doc.p(`• ${line}`, { left: 360 })),
    );
  }

  parts.push(doc.sectionTitle(`03 ${model.contentTitle}`));
  let procedureFigureNumber = 0;
  model.sections.forEach((section, sectionIndex) => {
    parts.push(doc.subTitle(`3.${sectionIndex + 1} - ${section.title || "Seção"}`));
    if (section.description) parts.push(doc.p(section.description, { align: "both", line: 1.05 }));
    if (section.body) parts.push(doc.p(section.body, { align: "both", line: 1.05 }));
    section.images.forEach((image) => {
      if (!image.src) return;
      procedureFigureNumber += 1;
      parts.push(
        doc.imageParagraph(image.src, image.caption || `Figura ${procedureFigureNumber}`, 6.5, 4.2),
      );
      parts.push(
        doc.p(`Figura ${procedureFigureNumber} - ${image.caption || "Imagem do documento"}`, {
          size: 8.5,
          align: "center",
          color: doc.C.gray500,
        }),
      );
    });
    section.items.forEach((item) => {
      if (item.kind === "subitem") parts.push(doc.subTitle(item.text));
      else if (item.kind === "clause") parts.push(doc.mixedP(item.label, item.text));
      else parts.push(doc.p(item.text, { align: "both", line: 1.05 }));
      item.images.forEach((image) => {
        if (!image.src) return;
        procedureFigureNumber += 1;
        parts.push(
          doc.imageParagraph(
            image.src,
            image.caption || `Figura ${procedureFigureNumber}`,
            6.5,
            4.2,
          ),
        );
        parts.push(
          doc.p(`Figura ${procedureFigureNumber} - ${image.caption || "Imagem do documento"}`, {
            size: 8.5,
            align: "center",
            color: doc.C.gray500,
          }),
        );
      });
      if (item.note) parts.push(doc.notice(item.note));
    });
  });
  if (!model.sections.length) parts.push(doc.p("Nenhuma seção preenchida."));
  if (model.purpose.importante) {
    parts.push(doc.subTitle("Importante"));
    splitText(model.purpose.importante).forEach((line) =>
      parts.push(doc.p(`• ${line}`, { left: 360 })),
    );
  }

  parts.push(doc.sectionTitle("04 Responsabilidades"));
  parts.push(
    model.responsibilities.length
      ? doc.table(
          [
            [doc.headerCell("Área"), doc.headerCell("Cargo"), doc.headerCell("Responsabilidades")],
            ...model.responsibilities.map((item) => [
              doc.bodyCell(item.area),
              doc.bodyCell(item.cargo || "-"),
              doc.bodyCell(item.responsabilidade),
            ]),
          ],
          [2500, 2500, 5306],
          { full: true },
        )
      : doc.p("Nenhuma responsabilidade cadastrada."),
  );

  parts.push(doc.sectionTitle("05 Referências Normativas"));
  parts.push(
    model.references.length
      ? doc.table(
          [
            [doc.headerCell("Código"), doc.headerCell("Título"), doc.headerCell("Aplicabilidade")],
            ...model.references.map((item) => [
              doc.bodyCell(item.codigo),
              doc.bodyCell(item.titulo),
              doc.bodyCell(item.aplicabilidade),
            ]),
          ],
          [1800, 3300, 5206],
          { full: true },
        )
      : doc.p("A definir."),
  );

  parts.push(doc.sectionTitle("06 Histórico e Controle de Alterações"));
  parts.push(doc.subTitle("Histórico"));
  parts.push(
    doc.table(
      [
        [
          doc.headerCell("Código"),
          doc.headerCell("Versão"),
          doc.headerCell("Data"),
          doc.headerCell("Elaborador"),
          doc.headerCell("Revisor"),
          doc.headerCell("Aprovador"),
        ],
        ...model.history.map((item) => [
          doc.bodyCell(item.codigo),
          doc.bodyCell(item.version, { align: "center" }),
          doc.bodyCell(item.date),
          doc.bodyCell(item.elaborador),
          doc.bodyCell(item.revisor),
          doc.bodyCell(item.aprovador),
        ]),
      ],
      [1600, 900, 1300, 2200, 2100, 2206],
      { full: true },
    ),
  );
  parts.push(doc.subTitle("Controle de Alterações"));
  parts.push(
    doc.table(
      [
        [doc.headerCell("Versão"), doc.headerCell("Local da Revisão"), doc.headerCell("Descrição")],
        ...model.changes.map((item) => [
          doc.bodyCell(item.versao, { align: "center" }),
          doc.bodyCell(item.local),
          doc.bodyCell(item.descricao),
        ]),
      ],
      [1000, 3300, 6006],
      { full: true },
    ),
  );

  return doc.finish(parts);
}

function bfFlowLogoHtml(brand?: OrganizationBrand, assetBase = "") {
  if (brand?.logo_data_url) {
    return `<img class="brand-logo custom-logo" src="${html(brand.logo_data_url)}" alt="" aria-hidden="true"/>`;
  }
  const prefix = assetBase ? assetBase.replace(/\/$/, "") : "";
  return `<span class="system-logo-pair"><img class="brand-logo logo-light" src="${html(`${prefix}/brand/bom-futuro-light.png`)}" alt="" aria-hidden="true"/><img class="brand-logo logo-dark" src="${html(`${prefix}/brand/bom-futuro-dark.png`)}" alt="" aria-hidden="true"/></span>`;
}
// Visualização somente-leitura genérica de um registro da consulta, a partir
// dos metadados da linha. Usada para registros de demonstração e para a
// pré-visualização amigável de Documentação/Fluxograma.
function buildReadonlyPreviewHtml(
  moduleId: AteliamModule,
  row: ModuleGridRow,
  brand?: OrganizationBrand,
) {
  const accent = docxColor(brand?.word_header_color, "1D1F23");
  const label = moduleDocumentLabel(moduleId);
  const processLabel =
    moduleId === "pop" ? "Tipo" : moduleId === "bpmn" ? "Processo vinculado" : "Processo";
  const fields: Array<[string, string]> = [
    ["Código", row.code],
    [moduleId === "ddp" ? "Título do mapeamento" : "Nome", row.name],
    [processLabel, moduleId === "pop" ? row.type : row.process],
    ["Área", row.area],
    ...(moduleId === "ddp" ? ([["Dono do processo", row.owner]] as Array<[string, string]>) : []),
    [moduleId === "ddp" ? "Elaborador" : "Responsável", row.responsible],
    ["Status", row.status],
    ["Última atualização", formatDateTimeBr(row.updatedAt)],
  ];
  const rows = fields
    .filter(([, value]) => value && value !== "-")
    .map(
      ([k, v]) =>
        `<div class="field"><div class="k">${html(k)}</div><div class="v">${html(v)}</div></div>`,
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${html(row.code)} - ${html(label)}</title>
<style>
:root{--accent:#${accent};--line:#d9d6cd;--muted:#5f6368;--paper:#f6f5f0}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:#202124;font-family:"Segoe UI",Arial,sans-serif}
.wrap{max-width:880px;margin:0 auto;padding:40px 24px}
.head{background:var(--accent);color:#fff;border-radius:14px;padding:28px 32px;margin-bottom:24px}
.kicker{font-size:11px;letter-spacing:.32em;text-transform:uppercase;opacity:.78;font-weight:800}
.head h1{margin:10px 0 0;font-size:30px;line-height:1.1}
.badge{display:inline-block;margin-top:14px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.3);border-radius:999px;padding:4px 12px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:8px 28px}
.field{display:grid;grid-template-columns:230px 1fr;gap:18px;padding:16px 0;border-bottom:1px solid #ece9e0}
.field:last-child{border-bottom:0}
.k{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);font-weight:700}
.v{font-size:15px;color:#1f2937}
.note{margin-top:22px;color:var(--muted);font-size:12.5px;line-height:1.5}
</style></head><body><div class="wrap">
<div class="head"><div class="kicker">${html(label)} · Visualização</div><h1>${html(row.name)}</h1><span class="badge">${html(row.status)}</span></div>
<div class="card">${rows}</div>
<p class="note">Visualização somente-leitura — as informações não podem ser editadas nesta tela. Para alterar, use a opção "Editar" na consulta de registros.</p>
</div></body></html>`;
}

// Visualização somente-leitura de Documentação (POP/IT) com o conteúdo do
// formulário, seguindo a identidade visual do sistema.
function buildPopPreviewHtml(pop: PopState, brand?: OrganizationBrand) {
  const accent = docxColor(brand?.word_header_color, "1D1F23");
  const meta: Array<[string, string]> = [
    ["Código", pop.meta.codigo],
    ["Tipo", pop.meta.tipo],
    ["Área", pop.meta.area],
    ["Processo", pop.meta.processo],
    ["Versão", pop.meta.versao],
    ["Elaboração", pop.meta.elaboracao],
    ["Aprovação", pop.meta.aprovacao],
  ]
    .filter(([, v]) => v && v !== "-")
    .map(([k, v]) => `<div class="m"><span>${html(k)}</span><b>${html(v)}</b></div>`)
    .join("");
  const sections = pop.sections
    .map(
      (s) =>
        `<article><h3>${html(s.title)}</h3>${s.description ? `<p class="d">${html(s.description)}</p>` : ""}<p>${html(
          s.body,
        )}</p></article>`,
    )
    .join("");
  const resp = pop.responsibilities
    .map(
      (r) =>
        `<tr><td>${html(r.area)}</td><td>${html(r.cargo || "-")}</td><td>${html(r.responsabilidade)}</td></tr>`,
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${html(pop.meta.codigo)} - ${html(pop.meta.titulo)}</title>
<style>
:root{--accent:#${accent};--line:#d9d6cd;--muted:#5f6368;--paper:#f6f5f0}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:#202124;font-family:"Segoe UI",Arial,sans-serif}
.wrap{max-width:920px;margin:0 auto;padding:40px 24px}
.head{background:var(--accent);color:#fff;border-radius:14px;padding:30px 34px;margin-bottom:22px}
.kicker{font-size:11px;letter-spacing:.32em;text-transform:uppercase;opacity:.78;font-weight:800}
.head h1{margin:10px 0 0;font-size:30px;line-height:1.1}
.meta{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:18px}
.m{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:10px;padding:8px 12px;font-size:13px}
.m span{display:block;font-size:10px;letter-spacing:.12em;text-transform:uppercase;opacity:.78}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:22px 26px;margin-bottom:18px}
.card h2{margin:0 0 14px;font-size:14px;text-transform:uppercase;letter-spacing:.14em;color:var(--accent)}
article{border-left:6px solid var(--accent);background:#fbfaf6;border:1px solid #ece9e0;border-left:6px solid var(--accent);border-radius:8px;padding:14px 18px;margin-bottom:12px}
article h3{margin:0 0 6px;font-size:16px;color:#1f2937}
article p{margin:4px 0;line-height:1.5;color:#374151}
article .d{color:var(--muted);font-size:13px}
table{width:100%;border-collapse:collapse}
th,td{border:1px solid var(--line);padding:10px 12px;text-align:left;vertical-align:top;font-size:14px}
th{background:var(--accent);color:#fff;text-transform:uppercase;font-size:11px;letter-spacing:.1em}
.note{color:var(--muted);font-size:12.5px;line-height:1.5}
</style></head><body><div class="wrap">
<div class="head"><div class="kicker">Documentação · Visualização</div><h1>${html(pop.meta.titulo)}</h1><div class="meta">${meta}</div></div>
${pop.purpose.objetivo || pop.purpose.abrangencia ? `<div class="card"><h2>Objetivo e abrangência</h2>${pop.purpose.objetivo ? `<p>${html(pop.purpose.objetivo)}</p>` : ""}${pop.purpose.abrangencia ? `<p class="note">${html(pop.purpose.abrangencia)}</p>` : ""}</div>` : ""}
<div class="card"><h2>Procedimento</h2>${sections}</div>
${resp ? `<div class="card"><h2>Responsabilidades</h2><table><thead><tr><th>Área</th><th>Cargo</th><th>Responsabilidade</th></tr></thead><tbody>${resp}</tbody></table></div>` : ""}
<p class="note">Visualização somente-leitura — para alterar, use "Editar" na consulta de registros.</p>
</div></body></html>`;
}

function buildPopPresentationHtml(pop: PopState, brand?: OrganizationBrand) {
  const accent = docxColor(brand?.word_header_color, "1D1F23");
  const assetBase =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  const title = pop.meta.titulo || documentationTypeName(pop.meta.tipo);
  const code = pop.meta.codigo || pop.meta.tipo;
  const contentTitle = documentationContentTitle(pop.meta.tipo);
  const nav = [
    ["capa", "00 Capa"],
    ["objetivo", "01 Objetivo"],
    ["abrangencia", "02 Abrangência"],
    ["procedimento", `03 ${contentTitle}`],
    ["responsabilidades", "04 Responsabilidades"],
    ["referencias", "05 Referências normativas"],
    ["historico", "06 Histórico e alterações"],
  ];
  const block = (label: string, value: string) =>
    '<div class="cover-field"><span>' +
    html(label) +
    "</span><strong>" +
    html(value || "-") +
    "</strong></div>";
  const imageCards = (images: ModuleImage[], showTitle = true) =>
    images
      .filter((item) => item.src)
      .map((item) => {
        const accessibleTitle = item.legenda || item.titulo || "Imagem";
        const caption = showTitle
          ? "<figcaption><strong>" +
            html(item.titulo || "Imagem") +
            "</strong>" +
            (item.legenda ? "<span>" + html(item.legenda) + "</span>" : "") +
            "</figcaption>"
          : item.legenda
            ? "<figcaption><span>" + html(item.legenda) + "</span></figcaption>"
            : "";
        return (
          '<figure class="image-card">' +
          caption +
          '<img src="' +
          html(item.src) +
          '" alt="' +
          html(accessibleTitle) +
          '" data-title="' +
          html(accessibleTitle) +
          '" onclick="openImageZoom(this,event)"/></figure>'
        );
      })
      .join("");
  const procedure = pop.sections.length
    ? pop.sections
        .map((section, index) => {
          const subitems = (section.subitems ?? [])
            .map((subitem) => {
              const clauses = subitem.clauses
                .map((clause) => {
                  const content = procedureClauseBlocks(clause)
                    .map(
                      (block) =>
                        (block.text ? "<p>" + html(block.text) + "</p>" : "") +
                        imageCards(block.images, false),
                    )
                    .join("");
                  return (
                    '<article class="clause"><span>' +
                    html((clause.letter || "a") + ")") +
                    "</span><div>" +
                    content +
                    (clause.alert
                      ? '<aside style="display:grid;grid-template-columns:32px minmax(0,1fr);gap:10px;align-items:start;border:1px solid var(--gold);border-radius:12px"><span class="alert-icon" style="display:grid;width:28px;height:28px;place-items:center;border-radius:999px;background:var(--gold);color:#fff;font-weight:950">!</span><div><strong style="display:block;color:var(--gold);font-size:11px;letter-spacing:.12em;text-transform:uppercase">Observação</strong><p>' +
                        html(clause.alert) +
                        "</p></div></aside>"
                      : "") +
                    "</div></article>"
                  );
                })
                .join("");
              return (
                '<details class="subitem"><summary><b>' +
                html(subitem.code || String(index + 1)) +
                "</b><strong>" +
                html(subitem.title || "Subitem") +
                '</strong></summary><div class="subitem-content">' +
                (clauses || '<p class="empty-inline">Sem instruções detalhadas.</p>') +
                "</div></details>"
              );
            })
            .join("");
          return (
            '<details class="procedure-card"><summary><span>' +
            html(section.code || String(index + 1).padStart(2, "0")) +
            "</span><div><h3>" +
            html(section.title || "Procedimento") +
            "</h3>" +
            (section.description ? "<p>" + html(section.description) + "</p>" : "") +
            '</div></summary><div class="procedure-card-content">' +
            (section.body ? '<div class="procedure-body">' + html(section.body) + "</div>" : "") +
            (section.records || section.risks
              ? '<dl class="procedure-info">' +
                (section.records
                  ? "<div><dt>Registros</dt><dd>" + html(section.records) + "</dd></div>"
                  : "") +
                (section.risks
                  ? "<div><dt>Riscos e controles</dt><dd>" + html(section.risks) + "</dd></div>"
                  : "") +
                "</dl>"
              : "") +
            imageCards(section.images, false) +
            subitems +
            "</div></details>"
          );
        })
        .join("")
    : '<div class="empty">Nenhum procedimento informado.</div>';
  const responsibilities = pop.responsibilities.length
    ? '<div class="table-wrap"><table><thead><tr><th>Área</th><th>Cargo</th><th>Responsabilidades</th></tr></thead><tbody>' +
      pop.responsibilities
        .map(
          (item) =>
            "<tr><td>" +
            html(item.area || "-") +
            "</td><td>" +
            html(item.cargo || "-") +
            "</td><td>" +
            html(item.responsabilidade || "-") +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div>"
    : '<div class="empty">Nenhuma responsabilidade informada.</div>';
  const references = pop.references.length
    ? '<div class="reference-grid">' +
      pop.references
        .map(
          (item) =>
            "<article><span>" +
            html(item.codigo || "Referência") +
            "</span><h3>" +
            html(item.titulo || "Sem título") +
            "</h3><p>" +
            html(item.aplicabilidade || "") +
            "</p></article>",
        )
        .join("") +
      "</div>"
    : '<div class="empty">Nenhuma referência normativa informada.</div>';
  const history = pop.history.length
    ? '<div class="table-wrap"><table><thead><tr><th>Versão</th><th>Data</th><th>Elaborador</th><th>Revisor</th><th>Aprovador</th></tr></thead><tbody>' +
      pop.history
        .map(
          (item) =>
            "<tr><td>" +
            html(item.version || "-") +
            "</td><td>" +
            html(formatDateBr(item.date) || "-") +
            "</td><td>" +
            html(item.elaborador || "-") +
            "</td><td>" +
            html(item.revisor || "-") +
            "</td><td>" +
            html(item.aprovador || "-") +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div>"
    : '<div class="empty">Nenhum histórico informado.</div>';
  const changes = pop.changes.length
    ? '<div class="changes">' +
      pop.changes
        .map(
          (item) =>
            "<article><span>" +
            html(item.versao || "-") +
            "</span><div><strong>" +
            html(item.local || "Alteração") +
            "</strong><p>" +
            html(item.descricao || "") +
            "</p></div></article>",
        )
        .join("") +
      "</div>"
    : "";
  const sectionHead = (num: string, heading: string, subtitle: string) =>
    '<header class="section-head"><span>' +
    num +
    "</span><div><p>Documento controlado</p><h2>" +
    heading +
    "</h2><small>" +
    subtitle +
    "</small></div></header>";
  const purposeIcon = (kind: "objective" | "scope") =>
    kind === "objective"
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/><rect x="7" y="7" width="10" height="10" rx="2"/></svg>';
  const presentationOverrides = `<style>
    .text-panel .icon svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .text-panel>div{align-self:center}
    .procedure-stack>.procedure-card{overflow:hidden;padding:0}
    .procedure-card>summary{display:grid;grid-template-columns:42px minmax(0,1fr) 18px;gap:14px;align-items:start;padding:22px;cursor:pointer;list-style:none}
    .procedure-card>summary::-webkit-details-marker{display:none}
    .procedure-card>summary:after{content:'';width:9px;height:9px;margin-top:8px;border-right:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(45deg);transition:transform .18s ease}
    .procedure-card:not([open])>summary:after{transform:rotate(-45deg)}
    .procedure-card[open]>summary{border-bottom:1px solid var(--line)}
    .procedure-card>summary>span{display:grid;place-items:center;width:38px;height:30px;border-radius:999px;background:color-mix(in srgb,var(--gold) 18%,transparent);color:var(--gold);font-weight:950}
    .procedure-card-content{padding:0 22px 22px}
    .procedure-card-content .procedure-body{margin:0;padding:18px 0 16px;border-top:0}
    html[data-theme=light] .text-panel,
    html[data-theme=light] .procedure-card,
    html[data-theme=light] .reference-grid article,
    html[data-theme=light] .changes article{border-color:#d8d3c6;background:#fff;color:#17191f}
    html[data-theme=light] .procedure-card h3,
    html[data-theme=light] .reference-grid h3,
    html[data-theme=light] .changes strong{color:#17191f}
    html[data-theme=light] .text-panel p,
    html[data-theme=light] .procedure-card p,
    html[data-theme=light] .reference-grid p,
    html[data-theme=light] .changes p,
    html[data-theme=light] .procedure-body,
    html[data-theme=light] .procedure-info dd{color:#4f5863}
    html[data-theme=light] .procedure-info div,
    html[data-theme=light] .image-card{background:#faf8f1}
    html[data-theme=light] .table-wrap{border-color:#d8d3c6;background:#fff}
    html[data-theme=light] th{border-color:#d8d3c6;background:#ece9df;color:#242a31}
    html[data-theme=light] td{border-color:#ded9cd;color:#242a31}
  </style>`;
  return (
    '<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>' +
    html(code) +
    " - " +
    html(title) +
    "</title>" +
    presentationOverrides +
    "<style>:root{--accent:#" +
    accent +
    ";--accent-strong:color-mix(in srgb,var(--accent) 78%,#000);--gold:#d49a21;--bg:#f4f2ea;--surface:#fff;--surface-2:#faf8f1;--text:#17191f;--muted:#626a73;--line:#ddd8ca;--nav:282px;--shadow:0 18px 60px rgba(28,28,28,.12)}[data-theme=dark]{--bg:#101418;--surface:#171c22;--surface-2:#1d232a;--text:#f7f9fb;--muted:#c8d0da;--line:#3f4853;--shadow:0 20px 80px rgba(0,0,0,.58);--accent-strong:color-mix(in srgb,var(--accent) 28%,#f4f8fb)}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:Segoe UI,Arial,sans-serif}.shell{display:grid;grid-template-columns:var(--nav) minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;display:flex;flex-direction:column;gap:26px;height:100vh;padding:26px 20px;background:linear-gradient(180deg,var(--accent-strong),color-mix(in srgb,var(--accent) 52%,#111));color:#fff}.brand-logo{max-width:170px;max-height:54px;object-fit:contain}.system-logo-pair{display:inline-flex;align-items:center}.logo-dark{display:none}[data-theme=dark] .logo-light{display:none}[data-theme=dark] .logo-dark{display:block}.doc-code{border:1px solid rgba(255,255,255,.22);border-radius:14px;padding:14px;background:rgba(255,255,255,.08)}.doc-code span{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.75}.doc-code strong{display:block;margin-top:8px;font-size:16px;line-height:1.28}.nav{display:grid;gap:4px}.nav a{border-radius:9px;padding:10px 12px;color:rgba(255,255,255,.84);font-size:12px;font-weight:750;letter-spacing:.1em;text-decoration:none;text-transform:uppercase}.nav a:hover{background:rgba(255,255,255,.12);color:#fff}.presentation-controls{display:grid;grid-template-columns:1fr 40px;gap:8px;margin-top:auto}.theme-toggle{display:grid;grid-template-columns:1fr 1fr;gap:6px;border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:5px;background:rgba(0,0,0,.12)}.theme-toggle button,.fullscreen-button{display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.76);cursor:pointer}.theme-toggle button{padding:9px}.theme-toggle button svg,.fullscreen-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.theme-toggle button.active{background:#fff;color:#111}.fullscreen-button{height:40px;width:40px;border:1px solid rgba(255,255,255,.28);border-radius:12px;background:rgba(255,255,255,.08)}.slide{min-height:100vh;padding:56px 72px;border-bottom:1px solid var(--line);background:var(--surface)}.slide.alt{background:var(--surface-2)}.cover{display:flex;flex-direction:column;justify-content:center;background:radial-gradient(circle at 84% 12%,color-mix(in srgb,var(--gold) 30%,transparent),transparent 30%),linear-gradient(135deg,var(--accent-strong),color-mix(in srgb,var(--accent) 48%,#111));color:#fff}.kicker{color:#ffd47a;font-size:12px;font-weight:900;letter-spacing:.34em;text-transform:uppercase}.cover h1{max-width:980px;margin:18px 0 22px;font-size:clamp(44px,6vw,82px);line-height:.95;letter-spacing:-.02em}.cover-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:44px;align-items:end;max-width:1180px}.cover-code{min-width:190px;border-left:4px solid #ffd47a;padding:0 0 3px 18px}.cover-code span{display:block;color:rgba(255,255,255,.62);font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.cover-code strong{display:block;margin-top:10px;font-size:28px;letter-spacing:.08em}.cover-context{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:1px;max-width:1180px;margin:52px 0 0;border-top:1px solid rgba(255,255,255,.24);border-bottom:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.18)}.cover-line{display:grid;gap:10px;margin:0;padding:22px 24px;background:rgba(0,0,0,.16)}.cover-line dt{color:#ffd47a;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.cover-line dd{margin:0;color:#fff;font-size:18px;font-weight:800;line-height:1.25}.cover-meta{display:flex;flex-wrap:wrap;gap:10px;max-width:1180px;margin-top:28px}.cover-field{border:1px solid rgba(255,255,255,.18);border-radius:999px;padding:9px 13px;background:rgba(255,255,255,.08)}.cover-field span{margin-right:7px;color:rgba(255,255,255,.62);font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.cover-field strong{color:#fff;font-size:13px}.section-head{display:flex;align-items:flex-start;gap:22px;margin-bottom:30px}.section-head>span{display:grid;width:64px;height:64px;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent-strong);font-size:28px;font-weight:950}.section-head p{margin:0 0 7px;color:var(--gold);font-size:11px;font-weight:900;letter-spacing:.26em;text-transform:uppercase}.section-head h2{margin:0;font-size:clamp(30px,4vw,48px);line-height:1.02}.section-head small{display:block;margin-top:8px;color:var(--muted);font-size:15px}.text-panel,.procedure-card,.reference-grid article,.changes article{border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:var(--shadow)}.text-panel{display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px;padding:24px}.text-panel .icon{display:grid;width:44px;height:44px;place-items:center;border-radius:14px;background:color-mix(in srgb,var(--gold) 18%,transparent);color:var(--gold);font-weight:950}.text-panel h3,.procedure-card h3,.reference-grid h3{margin:0 0 9px;color:var(--accent-strong);font-size:18px}.text-panel p,.procedure-card p,.reference-grid p,.changes p{margin:0;color:var(--muted);line-height:1.6}.procedure-stack{display:grid;gap:16px}.procedure-card{padding:22px}.procedure-card>header{display:grid;grid-template-columns:42px minmax(0,1fr);gap:14px;align-items:start}.procedure-card>header>span{display:grid;place-items:center;width:38px;height:30px;border-radius:999px;background:color-mix(in srgb,var(--gold) 18%,transparent);color:var(--gold);font-weight:950}.procedure-body{margin:17px 0 0;padding:16px 0;border-top:1px solid var(--line);white-space:pre-line;line-height:1.65}.procedure-info{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin:16px 0 0}.procedure-info div{padding:12px;border-radius:10px;background:var(--surface-2)}.procedure-info dt{color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.procedure-info dd{margin:5px 0 0;font-size:14px;line-height:1.45}.subitem{margin-top:16px;border-top:1px solid var(--line);padding-top:14px}.subitem summary{display:flex;gap:10px;align-items:center;cursor:pointer;list-style:none}.subitem summary::-webkit-details-marker{display:none}.subitem summary:before{content:'';width:8px;height:8px;border-right:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(45deg)}.subitem summary b{color:var(--gold)}.subitem-content{display:grid;gap:12px;margin-top:14px;padding-left:18px}.clause{display:grid;grid-template-columns:28px minmax(0,1fr);gap:10px;border-left:2px solid color-mix(in srgb,var(--gold) 45%,var(--line));padding:12px 0 12px 13px}.clause>span{color:var(--gold);font-weight:950}.clause aside{margin-top:10px;border-left:3px solid var(--gold);padding:10px 12px;background:color-mix(in srgb,var(--gold) 10%,transparent);color:var(--text);font-size:14px;line-height:1.45}.image-card{display:grid;gap:10px;margin:16px 0 0;border:1px solid var(--line);border-radius:14px;padding:12px;background:var(--surface-2)}.image-card figcaption{display:grid;gap:3px}.image-card figcaption strong{font-size:14px;color:var(--accent-strong)}.image-card figcaption span{color:var(--muted);font-size:13px}.image-card img{width:100%;max-height:62vh;object-fit:contain;border:1px solid var(--line);border-radius:10px;background:#fff;cursor:zoom-in}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:var(--shadow)}table{width:100%;border-collapse:collapse}th,td{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:14px 16px;text-align:left;vertical-align:top;font-size:14px;line-height:1.45}th{background:color-mix(in srgb,var(--accent) 16%,var(--surface));color:var(--accent-strong);font-size:11px;letter-spacing:.14em;text-transform:uppercase}.reference-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.reference-grid article{padding:22px}.reference-grid article>span{color:var(--gold);font-size:11px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.changes{display:grid;gap:10px;margin-top:18px}.changes article{display:grid;grid-template-columns:56px minmax(0,1fr);gap:14px;padding:16px 18px;box-shadow:none}.changes article>span{display:grid;place-items:center;height:30px;border-radius:999px;background:color-mix(in srgb,var(--gold) 18%,transparent);color:var(--gold);font-weight:900}.changes strong{display:block;margin-bottom:5px}.empty{border:1px dashed var(--line);border-radius:16px;padding:34px;background:var(--surface-2);color:var(--muted);font-style:italic;text-align:center}.empty-inline{color:var(--muted);font-style:italic}.zoom-modal{position:fixed;inset:0;z-index:20;display:none;align-items:center;justify-content:center;overflow:hidden;padding:28px;background:rgba(5,7,10,.92)}.zoom-modal.open{display:flex}.zoom-modal>img{max-width:94vw;max-height:86vh;background:#fff;box-shadow:0 20px 70px rgba(0,0,0,.55);cursor:zoom-out;transition:transform .16s ease;transform:scale(var(--zoom-scale,1));transform-origin:center center}.zoom-title{position:fixed;top:22px;left:28px;color:#fff;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.zoom-close{position:fixed;top:20px;right:28px;border:1px solid rgba(255,255,255,.35);border-radius:8px;padding:9px 14px;background:transparent;color:#fff;cursor:pointer}.zoom-help{position:fixed;bottom:24px;left:28px;color:rgba(255,255,255,.74);font-size:12px}.zoom-map{position:fixed;right:28px;bottom:24px;display:none;overflow:hidden;width:190px;height:126px;border:1px solid rgba(255,255,255,.32);border-radius:12px;padding:8px;background:rgba(255,255,255,.08)}.zoom-modal.open .zoom-map{display:block}.zoom-map img{width:100%;height:100%;border-radius:8px;background:#fff;object-fit:contain}.zoom-map span{position:absolute;border:2px solid #d49a21;border-radius:8px;background:rgba(212,154,33,.14);box-shadow:0 0 0 999px rgba(0,0,0,.18)}[data-theme=dark] .sidebar{background:linear-gradient(180deg,#111820,#0b0f13);border-right:1px solid #303943}[data-theme=dark] .doc-code{border-color:#66717d;background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.07))}[data-theme=dark] .slide{background:#151a20}[data-theme=dark] .slide.alt{background:#11161b}[data-theme=dark] .section-head>span{border:1px solid rgba(242,188,75,.3);background:rgba(212,154,33,.16);color:#f2bc4b}[data-theme=dark] .text-panel,.procedure-card,.reference-grid article,.changes article{background:#1b2128;border-color:#46505b}[data-theme=dark] .text-panel h3,[data-theme=dark] .procedure-card h3,[data-theme=dark] .reference-grid h3,[data-theme=dark] .image-card figcaption strong{color:#f2bc4b}[data-theme=dark] .text-panel p,[data-theme=dark] .procedure-card p,[data-theme=dark] .reference-grid p,[data-theme=dark] .changes p{color:#d5dce4}[data-theme=dark] .table-wrap{background:#171d24;border-color:#505a66}[data-theme=dark] th{background:#232b34;color:#dfe6ee;border-color:#505a66}[data-theme=dark] td{border-color:#404a55;color:#eef2f6}[data-theme=dark] .image-card{background:#1b2128;border-color:#46505b}@media(max-width:980px){.shell{display:block}.sidebar{position:static;height:auto}.slide{padding:36px 22px}.cover-hero,.cover-context{grid-template-columns:1fr;gap:24px}.cover-context{margin-top:32px}.cover-meta{margin-top:20px}.zoom-map{display:none!important}}@media print{.sidebar{display:none}.shell{display:block}.slide{break-after:page;min-height:100vh}}</style></head><body><div class='shell'><aside class='sidebar'><div class='brand'>" +
    bfFlowLogoHtml(brand, assetBase) +
    '</div><div class="doc-code"><span>' +
    html(code) +
    "</span><strong>" +
    html(title) +
    '</strong></div><nav class="nav">' +
    nav.map((item) => '<a href="#' + item[0] + '">' + html(item[1]) + "</a>").join("") +
    '</nav><div class="presentation-controls"><div class="theme-toggle"><button type="button" data-theme-choice="light" class="active" title="Tema claro" aria-label="Tema claro">☀</button><button type="button" data-theme-choice="dark" title="Tema escuro" aria-label="Tema escuro">◐</button></div><button type="button" class="fullscreen-button" id="fullscreen-toggle" title="Tela cheia" aria-label="Tela cheia">⛶</button></div></aside><main class="content"><section class="slide cover" id="capa"><div class="cover-hero"><div><div class="kicker">00 · Documento controlado</div><h1>' +
    html(title) +
    '</h1></div><div class="cover-code"><span>Código</span><strong>' +
    html(code) +
    '</strong></div></div><dl class="cover-context"><div class="cover-line"><dt>Tipo de documento</dt><dd>' +
    html(documentationTypeName(pop.meta.tipo)) +
    '</dd></div><div class="cover-line"><dt>Processo relacionado</dt><dd>' +
    html(pop.meta.processo || "Não informado") +
    '</dd></div><div class="cover-line"><dt>Área responsável</dt><dd>' +
    html(pop.meta.area || "Não informada") +
    '</dd></div></dl><div class="cover-meta">' +
    [
      ["Versão", pop.meta.versao],
      ["Status", pop.meta.status],
      ["Vigência", formatDateBr(pop.meta.vigencia)],
      ["Elaborador", pop.meta.elaboracao],
      ["Revisor", pop.meta.revisor],
    ]
      .filter((item) => plain(item[1]).trim())
      .map((item) => block(item[0], item[1]))
      .join("") +
    '</div></section><section class="slide" id="objetivo">' +
    sectionHead("01", "Objetivo", "Finalidade definida para este documento.") +
    '<article class="text-panel"><span class="icon" title="Objetivo">' +
    purposeIcon("objective") +
    "</span><div><p>" +
    html(pop.purpose.objetivo || "Não informado.") +
    '</p></div></article></section><section class="slide alt" id="abrangencia">' +
    sectionHead("02", "Abrangência", "Limites e aplicação do procedimento.") +
    '<article class="text-panel"><span class="icon" title="Abrangência">' +
    purposeIcon("scope") +
    "</span><div><p>" +
    html(pop.purpose.abrangencia || "Não informada.") +
    '</p></div></article></section><section class="slide" id="procedimento">' +
    sectionHead("03", contentTitle, "Sequência de atividades, subitens e orientações.") +
    '<div class="procedure-stack">' +
    procedure +
    '</div></section><section class="slide alt" id="responsabilidades">' +
    sectionHead("04", "Responsabilidades", "Áreas, cargos e atribuições relacionadas.") +
    responsibilities +
    '</section><section class="slide" id="referencias">' +
    sectionHead("05", "Referências normativas", "Materiais utilizados como referência.") +
    references +
    '</section><section class="slide alt" id="historico">' +
    sectionHead("06", "Histórico e alterações", "Rastreabilidade das revisões do documento.") +
    history +
    changes +
    '</section></main></div><div class="zoom-modal" id="zoom-modal" onclick="closeImageZoom()"><div class="zoom-title" id="zoom-title"></div><button class="zoom-close" onclick="closeImageZoom();event.stopPropagation()">Fechar</button><img id="zoom-img" alt="Imagem ampliada" onclick="changeImageZoom(.25,event);event.stopPropagation()" oncontextmenu="changeImageZoom(-.25,event);event.preventDefault();event.stopPropagation()"/><div class="zoom-help">Clique para ampliar. Botão direito para reduzir.</div><div class="zoom-map" id="zoom-map"><img id="zoom-map-img" alt="Miniatura"/><span id="zoom-map-window"></span></div></div><script>(function(){var r=document.documentElement,b=[].slice.call(document.querySelectorAll("[data-theme-choice]"));function a(t){r.setAttribute("data-theme",t);try{localStorage.setItem("bf-flow-document-preview-theme",t)}catch(e){}b.forEach(function(x){x.classList.toggle("active",x.getAttribute("data-theme-choice")===t)})}var s="light";try{s=localStorage.getItem("bf-flow-document-preview-theme")||"light"}catch(e){}a(s);b.forEach(function(x){x.addEventListener("click",function(){a(x.getAttribute("data-theme-choice")||"light")})});var f=document.getElementById("fullscreen-toggle");if(f)f.addEventListener("click",function(){if(!document.fullscreenElement){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen()}else{document.exitFullscreen&&document.exitFullscreen()}})})();var imageZoomScale=1,imageZoomOrigin={x:50,y:50};function setZoomOrigin(e,t){if(!e||!t)return;var r=t.getBoundingClientRect();imageZoomOrigin={x:Math.max(0,Math.min(100,(e.clientX-r.left)*100/r.width)),y:Math.max(0,Math.min(100,(e.clientY-r.top)*100/r.height))}}function updateZoomMap(){var w=document.getElementById("zoom-map-window"),m=document.getElementById("zoom-map");if(!w||!m)return;var p=8,x=m.clientWidth-p*2,y=m.clientHeight-p*2,v=1/imageZoomScale,l=p+imageZoomOrigin.x*x/100-x*v/2,t=p+imageZoomOrigin.y*y/100-y*v/2;l=Math.max(p,Math.min(p+x-x*v,l));t=Math.max(p,Math.min(p+y-y*v,t));w.style.left=l+"px";w.style.top=t+"px";w.style.width=x*v+"px";w.style.height=y*v+"px"}function setImageZoom(s){imageZoomScale=Math.max(1,Math.min(3,s));var t=document.getElementById("zoom-img");if(t){t.style.setProperty("--zoom-scale",String(imageZoomScale));t.style.transformOrigin=imageZoomOrigin.x+"% "+imageZoomOrigin.y+"%"}updateZoomMap()}function changeImageZoom(d,e){var t=document.getElementById("zoom-img");setZoomOrigin(e,t);setImageZoom(imageZoomScale+d)}function openImageZoom(i,e){var m=document.getElementById("zoom-modal"),t=document.getElementById("zoom-img"),n=document.getElementById("zoom-map-img"),h=document.getElementById("zoom-title");setZoomOrigin(e,i);t.src=i.src;if(n)n.src=i.src;h.textContent=i.dataset.title||i.alt||"Imagem";setImageZoom(1);m.classList.add("open");setTimeout(updateZoomMap,0)}function closeImageZoom(){document.getElementById("zoom-modal").classList.remove("open")}</script></body></html>'
  );
}

function buildDdpPresentationHtml(
  data: DdpState,
  brand?: OrganizationBrand,
  processCatalog: OrganizationProcess[] = [],
) {
  const safeData = normalizeDdp(data, defaultWorkspace().ddp);
  const safeProcessCatalog = Array.isArray(processCatalog) ? processCatalog : [];
  const model = getDdpExportModel(safeData, safeProcessCatalog);
  const presentationColor = docxColor(brand?.word_header_color, "1D1F23");
  const assetBase =
    typeof window !== "undefined" && window.location?.origin ? window.location.origin : "";
  const processCode = model.processCode;
  const processName = model.processName || model.meta.titulo;
  const processValueChain = model.valueChainName;
  const processArea = model.area;
  const processOwner = model.owner;
  const code = model.meta.codigo || "MAP";
  const title = plain(model.meta.titulo).replace(/^Processo\s+de\s+/i, "") || processName;
  const description = model.description || safeData.overview.objetivo;
  const nav = [
    ["capa", "00 Capa"],
    ["visao", "01 Visão geral"],
    ["sistemas", "02 Sistemas/Documentos envolvidos"],
    ["sipoc", "03 SIPOC"],
    ["fluxo", "04 Etapas do processo"],
    ["quantitativa", "05 Visão Quantitativa"],
    ["gaps", "06 Oportunidades de melhoria"],
    ["proximos", "07 Próximos passos"],
    ["glossario", "08 Glossário"],
  ];

  const coverLine = (
    label: string,
    primary: string | undefined | null,
    secondary?: string | undefined | null,
  ) => {
    if (!plain(primary).trim() && !plain(secondary).trim()) return "";
    return `<div class="cover-line"><dt>${html(label)}</dt><dd>${html(primary || "-")}${
      plain(secondary).trim() ? `<small>${html(secondary)}</small>` : ""
    }</dd></div>`;
  };

  const overviewIcon = (type: "target" | "scope" | "context") => {
    const icons = {
      target:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
      scope:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M6 3v4M18 3v4"/></svg>',
      context:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v16H5z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/><path d="M17 3v4M7 3v4"/></svg>',
    };
    return icons[type];
  };

  const emptyBlock = (text = "Sem informação preenchida.") =>
    `<div class="empty">${html(text)}</div>`;

  const fieldGrid = (items: Array<[string, string | undefined | null]>) => {
    const rows = items
      .filter(([, value]) => plain(value).trim())
      .map(
        ([label, value]) =>
          `<div class="field"><span>${html(label)}</span><strong>${html(value)}</strong></div>`,
      )
      .join("");
    return rows ? `<div class="field-grid">${rows}</div>` : emptyBlock();
  };

  const textPanel = (titleText: string, body: string, icon = "") =>
    plain(body).trim()
      ? `<article class="text-panel">${icon ? `<span class="overview-icon">${icon}</span>` : ""}<div><h3>${html(titleText)}</h3><p>${html(body)}</p></div></article>`
      : "";

  const sectionHead = (num: string, titleText: string, subtitle: string) =>
    `<header class="section-head"><span>${html(num)}</span><div><p>Mapeamento de processo</p><h2>${html(
      titleText,
    )}</h2>${subtitle ? `<small>${html(subtitle)}</small>` : ""}</div></header>`;

  const zoomImage = (image: ExportImage) =>
    image.src
      ? `<figure class="diagram"><div><h3>${html(image.title || "Imagem")}</h3>${
          image.caption ? `<p>${html(image.caption)}</p>` : ""
        }</div><img class="zoomable" src="${html(image.src)}" alt="${html(
          image.title || "Imagem",
        )}" data-title="${html(image.title || "Imagem")}" onclick="openImageZoom(this,event)"/></figure>`
      : "";

  const systemCards = model.systems.length
    ? model.systems
        .map(
          (system, index) =>
            `<details class="list-card system-card"><summary><span class="index">${String(
              index + 1,
            ).padStart(2, "0")}</span><span class="system-card-heading"><strong>${html(
              system.name || "Sistema",
            )}</strong>${
              system.type ? `<span class="type-tag">${html(system.type)}</span>` : ""
            }</span></summary><div class="system-card-body">${
              system.description ? `<p>${html(system.description)}</p>` : ""
            }${
              system.items?.length
                ? `<ul>${system.items.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`
                : ""
            }${
              !system.description && !system.items?.length
                ? `<p class="system-card-empty">Nenhum detalhamento informado.</p>`
                : ""
            }</div></details>`,
        )
        .join("")
    : emptyBlock("Nenhum sistema ou documento informado.");

  const executionSummaryTags = (
    activities?: ExportFlowStep["substeps"][number]["activities"],
  ) => {
    const counts = new Map<FlowExecutionType, number>();
    (Array.isArray(activities) ? activities : []).forEach((activity) => {
      const classification = activity.classification;
      if (!classification) return;
      counts.set(classification, (counts.get(classification) ?? 0) + 1);
    });
    return FLOW_EXECUTION_TYPE_OPTIONS.filter((classification) => counts.has(classification))
      .map(
        (classification) =>
          `<span class="type-tag">${html(classification)} · ${counts.get(classification)}</span>`,
      )
      .join("");
  };

  const flowSteps = model.flowSteps.length
    ? model.flowSteps
        .map(
          (step, index) =>
            `<article class="flow-card"><div class="index">${String(index + 1).padStart(
              2,
              "0",
            )}</div><details class="flow-details"><summary><h3>${html(step.title || "Etapa")}</h3></summary><div class="flow-content">${
              step.owner || step.system || step.risk
                ? `<div class="mini-grid">${fieldGrid([
                    ["Responsável", step.owner],
                    ["Sistema", step.system],
                    ["Risco", step.risk],
                  ])}</div>`
                : ""
            }${step.description ? `<p>${html(step.description)}</p>` : ""}${step.images
              .map(zoomImage)
              .join("")}${step.substeps
              .map(
                (substep) => {
                  const activities = Array.isArray(substep.activities)
                    ? substep.activities
                    : [];
                  const modalityTags = executionSummaryTags(activities);
                  return `<details class="substep"><summary><h4>${html(
                    joinClean([substep.code, substep.title], " - ") ||
                      (substep.kind === "subprocesso" ? "Subprocesso" : "Atividade"),
                  )}</h4>${
                    modalityTags
                      ? `<div class="tag-list substep-tags">${modalityTags}</div>`
                      : ""
                  }</summary><div class="substep-body">${
                    substep.description ? `<p>${html(substep.description)}</p>` : ""
                  }${substep.images.map(zoomImage).join("")}${
                    activities.length
                      ? `<div class="nested-activities">${activities
                          .map(
                            (activity) =>
                              `<article class="list-card"><div class="index">${html(
                                activity.code,
                              )}</div><div class="tag-list"><span class="type-tag">${html(
                                activity.classification,
                              )}</span>${
                                activity.actorName
                                  ? `<span class="type-tag">${html(
                                      activity.actorType === "position" ? "Cargo" : "Área",
                                    )}: ${html(activity.actorName)}</span>`
                                  : ""
                              }${activity.systems
                                .map(
                                  (system) =>
                                    `<span class="type-tag">${html(system.name)} · ${html(
                                      system.type,
                                    )}</span>`,
                                )
                                .join("")}</div><h3>${html(activity.title)}</h3>${
                                activity.description ? `<p>${html(activity.description)}</p>` : ""
                              }${activity.images.map(zoomImage).join("")}</article>`,
                          )
                          .join("")}</div>`
                      : ""
                  }</div></details>`;
                },
              )
              .join("")}</div></details></article>`,
        )
        .join("")
    : emptyBlock("Nenhuma etapa informada.");

  const sipocRows = model.sipocRows.length
    ? `<div class="table-wrap"><table class="sipoc-table"><thead><tr><th>Processo</th><th>Fornecedores</th><th>Entradas</th><th>Saídas</th><th>Clientes</th></tr></thead><tbody>${model.sipocRows
        .map(
          (row) =>
            `<tr><td>${html(row.processo)}</td><td>${html(
              row.fornecedores,
            )}</td><td>${html(row.entradas)}</td><td>${html(row.saidas)}</td><td>${html(
              row.clientes,
            )}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : emptyBlock("Nenhuma linha SIPOC informada.");

  const gapTable = model.gaps.length
    ? `<div class="table-wrap gap-table"><table><thead><tr><th>Oportunidade de melhoria</th><th>Descrição</th><th>Impacto</th><th>Ação proposta</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Status</th></tr></thead><tbody>${model.gaps
        .map(
          (gap) =>
            `<tr><td><strong>${html(gap.title || "Gap")}</strong></td><td>${html(
              gap.description,
            )}</td><td>${html(gap.impact)}</td><td>${html(gap.action)}</td><td>${html(
              gap.owner || "-",
            )}</td><td>${html(formatGapDateRangeBr(gap.due) || "-")}</td><td>${html(
              gap.priority,
            )}</td><td>${html(gap.status)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : emptyBlock("Nenhum gap informado.");
  const nextCards = model.nextSteps.length
    ? model.nextSteps
        .map(
          (step, index) =>
            `<article class="list-card"><div class="index">${String(index + 1).padStart(
              2,
              "0",
            )}</div><h3>${html(step.title || "Próximo passo")}</h3>${
              step.description ? `<p>${html(step.description)}</p>` : ""
            }${fieldGrid([
              ["Responsável", step.owner],
              ["Prazo", formatDateBr(step.due)],
            ])}</article>`,
        )
        .join("")
    : emptyBlock("Nenhum próximo passo informado.");

  const glossaryCards = model.glossary.length
    ? model.glossary
        .map(
          (item, index) =>
            `<details class="list-card system-card glossary-disclosure-card"><summary><span class="index">${String(
              index + 1,
            ).padStart(2, "0")}</span><span class="system-card-heading"><strong>${html(
              item.termo || "Termo",
            )}</strong></span></summary><div class="system-card-body">${
              item.definicao
                ? `<p>${html(item.definicao)}</p>`
                : `<p class="system-card-empty">Nenhuma definição informada.</p>`
            }</div></details>`,
        )
        .join("")
    : emptyBlock("Nenhum termo informado.");

  const quantitativeMetricCards = [
    ["Processos", model.stats.processes],
    ["Subprocessos", model.stats.subprocesses],
    ["Atividades", model.stats.activities],
    ["Áreas", model.stats.areas],
    ["Sistemas/Documentos", model.stats.systems],
  ]
    .map(
      ([label, value], index) =>
        `<article class="quant-metric quant-metric-${index + 1}"><strong>${html(
          String(value),
        )}</strong><span>${html(label)}</span></article>`,
    )
    .join("");

  const quantitativeBars = (items: QuantitativeBreakdown[]) =>
    items.length
      ? items
          .map(
            (item) =>
              `<div class="quant-bar"><div><span>${html(item.label)}</span><strong>${item.value} · ${
                item.percentage
              }%</strong></div><i><b style="width:${item.percentage}%"></b></i></div>`,
          )
          .join("")
      : emptyBlock("Não há dados suficientes para esta análise.");

  const quantitativeResources = model.stats.resourceUsage.length
    ? model.stats.resourceUsage
        .map(
          (item, index) =>
            `<div class="quant-resource"><span>${String(index + 1).padStart(2, "0")}</span><strong>${html(
              item.label,
            )}</strong><b>${item.value}</b></div>`,
        )
        .join("")
    : emptyBlock("Nenhum sistema ou documento foi vinculado às atividades.");

  const quantitativeAlerts = [
    ["Atividades integralmente manuais", model.stats.alerts.manualActivities],
    ["Sem área ou responsável", model.stats.alerts.withoutOwner],
    ["Sem descrição", model.stats.alerts.withoutDescription],
    ["Sem sistema relacionado", model.stats.alerts.withoutSystem],
  ]
    .map(
      ([label, value]) =>
        `<div class="quant-alert"><strong>${html(String(value))}</strong><span>${html(
          label,
        )}</span></div>`,
    )
    .join("");

  const executionTone = (label: string) => {
    const normalized = normalizeLabel(label);
    if (normalized.includes("fora")) return "manual-outside";
    if (normalized.includes("hibr")) return "hybrid";
    if (normalized.includes("autom")) return "automatic";
    return "manual-system";
  };

  const quantitativeWaffle = model.stats.execution
    .flatMap((item) =>
      Array.from(
        { length: Math.max(0, item.value) },
        () =>
          `<i class="${executionTone(item.label)}" title="${html(
            `${item.label}: ${item.value}`,
          )}"></i>`,
      ),
    )
    .join("");

  const quantitativeLegend = model.stats.execution.length
    ? model.stats.execution
        .map(
          (item) =>
            `<div class="quant-legend-row"><span><i class="${executionTone(
              item.label,
            )}"></i>${html(item.label)}</span><strong>${item.value} · ${
              item.percentage
            }%</strong></div>`,
        )
        .join("")
    : emptyBlock("Nenhuma atividade classificada por forma de execução.");

  const manualActivities = model.stats.alerts.manualActivities;
  const hybridActivities =
    model.stats.execution.find((item) => normalizeLabel(item.label).startsWith("hibrid"))
      ?.value ?? 0;
  const hybridPercentage = model.stats.activities
    ? Math.round((hybridActivities / model.stats.activities) * 100)
    : 0;
  const manualRatio = model.stats.activities
    ? Math.round((manualActivities / model.stats.activities) * 10)
    : 0;
  const quantitativeInsightTitle = model.stats.activities
    ? manualActivities
      ? `<em>${manualRatio} em cada 10 atividades</em> são integralmente manuais${
          hybridPercentage
            ? `, enquanto ${hybridPercentage}% combinam execução manual e processamento automático.`
            : "."
        }`
      : "O processo não registra atividades totalmente manuais."
    : "A composição será exibida após o cadastro das atividades.";
  const quantitativeInsightBody = model.stats.activities
    ? `Das ${model.stats.activities} atividades identificadas, ${manualActivities} são integralmente manuais e ${hybridActivities} são híbridas.`
    : "Ainda não há atividades suficientes para calcular a distribuição operacional.";

  const macroDiagram = model.macroprocess.src
    ? zoomImage({
        title: model.macroprocess.title || "Macroprocesso",
        caption: model.macroprocess.caption,
        src: model.macroprocess.src,
      })
    : "";

  return `<!doctype html>
<html lang="pt-BR" data-theme="light">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${html(code)} - Apresentação de Mapeamento</title>
<style>
:root{--accent:#${presentationColor};--accent-strong:color-mix(in srgb,var(--accent) 78%,#000);--gold:#d49a21;--bg:#f4f2ea;--surface:#fff;--surface-2:#faf8f1;--text:#17191f;--muted:#626a73;--line:#ddd8ca;--shadow:0 18px 60px rgba(28,28,28,.12);--nav:282px}
[data-theme="dark"]{--bg:#0f1114;--surface:#171a1f;--surface-2:#1e2329;--text:#f4f6f8;--muted:#aab2bc;--line:#343a42;--shadow:0 18px 70px rgba(0,0,0,.45);--accent-strong:color-mix(in srgb,var(--accent) 66%,#fff)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",Arial,sans-serif}.shell{display:grid;grid-template-columns:var(--nav) minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;height:100vh;background:linear-gradient(180deg,var(--accent-strong),color-mix(in srgb,var(--accent) 52%,#111));color:#fff;padding:26px 20px;display:flex;flex-direction:column;gap:26px}.brand{display:flex;align-items:center;gap:12px;min-height:54px}.brand-logo{max-width:170px;max-height:54px;object-fit:contain}.system-logo-pair{display:inline-flex;align-items:center}.logo-dark{display:none}[data-theme="dark"] .logo-light{display:none}[data-theme="dark"] .logo-dark{display:block}.brand strong{font-size:15px;letter-spacing:.08em;text-transform:uppercase}.brand-mark{display:grid;width:36px;height:36px;place-items:center;border-radius:10px;background:rgba(255,255,255,.14);color:var(--gold)}.brand-mark span{width:17px;height:17px;border:2px solid currentColor;border-radius:50%;position:relative}.brand-mark span:after{content:"";position:absolute;inset:4px;border-radius:50%;background:currentColor}.doc-code{border:1px solid rgba(255,255,255,.22);border-radius:14px;padding:14px;background:rgba(255,255,255,.08)}.doc-code span{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.75}.doc-code strong{display:block;margin-top:8px;font-size:16px;line-height:1.25;letter-spacing:0}.nav{display:grid;gap:4px}.nav a{color:rgba(255,255,255,.82);text-decoration:none;border-radius:9px;padding:10px 12px;font-size:12px;font-weight:750;text-transform:uppercase;letter-spacing:.1em}.nav a:hover{background:rgba(255,255,255,.12);color:#fff}.theme-toggle{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:6px;border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:5px;background:rgba(0,0,0,.12)}.theme-toggle button{display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.72);font-weight:800;padding:9px;cursor:pointer}.theme-toggle button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.theme-toggle button.active{background:#fff;color:#111}.content{min-width:0}.slide{min-height:100vh;padding:56px 72px;border-bottom:1px solid var(--line);background:var(--surface);position:relative}.slide.alt{background:var(--surface-2)}.cover{display:flex;min-height:100vh;flex-direction:column;justify-content:center;background:radial-gradient(circle at 84% 12%,color-mix(in srgb,var(--gold) 30%,transparent),transparent 30%),linear-gradient(135deg,var(--accent-strong),color-mix(in srgb,var(--accent) 48%,#111));color:#fff}.kicker{font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:#ffd47a;font-weight:900}.cover h1{max-width:980px;margin:18px 0 22px;font-size:clamp(44px,6vw,82px);line-height:.95;letter-spacing:-.02em}.cover p{max-width:900px;margin:0;color:rgba(255,255,255,.84);font-size:22px;line-height:1.45}.cover-board{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:24px;max-width:1180px;margin-top:42px;align-items:stretch}.cover-summary{border-left:6px solid #ffd47a;padding:6px 0 6px 24px}.cover-summary span{display:block;color:rgba(255,255,255,.66);font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase}.cover-summary strong{display:block;margin-top:10px;font-size:34px;line-height:1.05;letter-spacing:.08em}.cover-summary small{display:block;margin-top:12px;max-width:620px;color:rgba(255,255,255,.78);font-size:15px;line-height:1.45}.cover-facts{display:grid;gap:14px;border:1px solid rgba(255,255,255,.22);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.08));padding:22px;backdrop-filter:blur(8px)}.cover-group{display:grid;gap:10px}.cover-group h2{margin:0;color:#ffd47a;font-size:12px;letter-spacing:.2em;text-transform:uppercase}.cover-list{display:grid;gap:8px;margin:0}.cover-row{display:grid;grid-template-columns:118px minmax(0,1fr);gap:12px;align-items:baseline}.cover-row dt{color:rgba(255,255,255,.62);font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.cover-row dd{margin:0;color:#fff;font-size:14px;font-weight:750;line-height:1.35}.cover-meta{margin-top:38px;display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;max-width:1020px}.cover-meta div{border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);border-radius:12px;padding:12px}.cover-meta span,.field span{display:block;color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.cover-meta span{color:rgba(255,255,255,.68)}.cover-meta strong,.field strong{display:block;margin-top:5px;font-size:14px;line-height:1.35}.section-head{display:flex;gap:22px;align-items:flex-start;margin-bottom:30px}.section-head>span{display:grid;width:64px;height:64px;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent-strong);font-size:28px;font-weight:950}.section-head p{margin:0 0 7px;color:var(--gold);font-size:11px;font-weight:900;letter-spacing:.26em;text-transform:uppercase}.section-head h2{margin:0;font-size:clamp(30px,4vw,48px);line-height:1.02}.section-head small{display:block;margin-top:8px;color:var(--muted);font-size:15px;line-height:1.45}.field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.field{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:13px 14px;box-shadow:0 1px 0 rgba(0,0,0,.03)}.field strong{color:var(--text);font-size:15px}.text-stack{display:grid;gap:14px}.text-panel,.list-card,.flow-card,.glossary-card{border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:var(--shadow);padding:22px}.text-panel{box-shadow:none;background:var(--surface-2);display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px}.overview-icon{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent-strong);font-size:20px;font-weight:900}.text-panel h3,.list-card h3,.flow-card h3,.glossary-card h3{margin:0 0 10px;color:var(--accent-strong);font-size:18px}.text-panel p,.list-card p,.flow-card p,.glossary-card p{margin:0;color:var(--muted);line-height:1.55}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}.index{display:inline-grid;place-items:center;min-width:38px;height:30px;border-radius:999px;background:color-mix(in srgb,var(--gold) 18%,transparent);color:var(--gold);font-weight:950;margin-bottom:12px}.muted-line{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.list-card ul{margin:12px 0 0;padding-left:18px;color:var(--muted)}.flow-stack{display:grid;gap:18px}.flow-card{display:grid;grid-template-columns:58px minmax(0,1fr);gap:18px}.flow-card .index{margin:0}.mini-grid .field-grid{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:12px}.mini-grid .field{box-shadow:none;padding:9px 10px}.substep{margin-top:16px;border-top:1px solid var(--line);padding-top:14px}.substep h4{margin:0 0 6px;color:var(--text)}.diagram{display:grid;gap:12px;border:1px solid var(--line);border-radius:16px;background:var(--surface-2);padding:14px;margin:16px 0}.diagram h3{margin:0;color:var(--accent-strong)}.diagram p{margin:4px 0 0;color:var(--muted)}.diagram img{width:100%;max-height:62vh;object-fit:contain;border:1px solid var(--line);border-radius:12px;background:#fff;cursor:zoom-in}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:var(--shadow)}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:14px 16px;text-align:left;vertical-align:top;font-size:14px;line-height:1.45}th{background:color-mix(in srgb,var(--accent) 16%,var(--surface));color:var(--accent-strong);font-size:11px;letter-spacing:.14em;text-transform:uppercase}.gap-table td:first-child{min-width:190px;color:var(--accent-strong)}.gap-table td:nth-child(2),.gap-table td:nth-child(3),.gap-table td:nth-child(4){min-width:220px}.empty{border:1px dashed var(--line);border-radius:16px;background:var(--surface-2);color:var(--muted);padding:34px;text-align:center;font-style:italic}.zoom-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,7,10,.92);z-index:20;padding:28px}.zoom-modal.open{display:flex}.zoom-modal img{max-width:94vw;max-height:86vh;background:#fff;box-shadow:0 20px 70px rgba(0,0,0,.55);cursor:zoom-out}.zoom-title{position:fixed;left:28px;top:22px;color:white;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.zoom-close{position:fixed;right:28px;top:20px;border:1px solid rgba(255,255,255,.35);background:transparent;color:white;padding:9px 14px;border-radius:8px;cursor:pointer}@media(max-width:980px){.shell{display:block}.sidebar{position:static;height:auto}.slide{padding:36px 22px}.cover-board{grid-template-columns:1fr}.cover-row{grid-template-columns:1fr;gap:3px}.cover-meta{grid-template-columns:1fr 1fr}.flow-card{grid-template-columns:1fr}.mini-grid .field-grid{grid-template-columns:1fr}.text-panel{grid-template-columns:1fr}}@media print{.sidebar{display:none}.shell{display:block}.slide{break-after:page;min-height:100vh;box-shadow:none}.content{margin:0}}
.cover-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:44px;align-items:end;max-width:1180px}.cover h1{margin-top:18px}.cover-code{min-width:190px;border-left:4px solid #ffd47a;padding:0 0 3px 18px}.cover-code span{display:block;color:rgba(255,255,255,.62);font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.cover-code strong{display:block;margin-top:10px;color:#fff;font-size:28px;letter-spacing:.08em}.cover-context{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:1px;max-width:1180px;margin-top:52px;border-top:1px solid rgba(255,255,255,.24);border-bottom:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.18)}.cover-line{display:grid;gap:10px;margin:0;padding:22px 24px;background:rgba(0,0,0,.16)}.cover-line dt{color:#ffd47a;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.cover-line dd{margin:0;color:#fff;font-size:18px;font-weight:800;line-height:1.25}.cover-line small{display:block;margin-top:7px;color:rgba(255,255,255,.7);font-size:13px;font-weight:650;line-height:1.35}.cover-meta{margin-top:28px;display:flex;flex-wrap:wrap;gap:10px;max-width:1180px}.cover-meta .field{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:999px;padding:9px 13px;box-shadow:none}.cover-meta .field span{display:inline;color:rgba(255,255,255,.62);margin-right:7px}.cover-meta .field strong{display:inline;color:#fff;font-size:13px}.overview-icon{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,transparent),color-mix(in srgb,var(--gold) 15%,transparent));border:1px solid color-mix(in srgb,var(--accent) 28%,transparent)}.overview-icon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.presentation-controls{margin-top:auto;display:grid;grid-template-columns:1fr 40px;gap:8px;align-items:center}.presentation-controls .theme-toggle{margin-top:0}.fullscreen-button{display:grid;height:40px;width:40px;place-items:center;border:1px solid rgba(255,255,255,.28);border-radius:12px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.9);cursor:pointer}.fullscreen-button:hover{border-color:rgba(255,255,255,.48);background:rgba(255,255,255,.14);color:#fff}.fullscreen-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}[data-theme="dark"]{--bg:#101418;--surface:#171c22;--surface-2:#1d232a;--text:#f7f9fb;--muted:#c8d0da;--line:#3f4853;--shadow:0 20px 80px rgba(0,0,0,.58);--accent-strong:color-mix(in srgb,var(--accent) 28%,#f4f8fb)}[data-theme="dark"] body{background:linear-gradient(180deg,#101418,#14191f);color:var(--text)}[data-theme="dark"] .sidebar{background:linear-gradient(180deg,#111820,#0b0f13);border-right:1px solid #303943;box-shadow:inset -1px 0 rgba(255,255,255,.04)}[data-theme="dark"] .brand-logo{filter:drop-shadow(0 2px 10px rgba(0,0,0,.35))}[data-theme="dark"] .doc-code{border-color:#66717d;background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.07));box-shadow:inset 0 1px rgba(255,255,255,.08)}[data-theme="dark"] .doc-code span,[data-theme="dark"] .cover-meta span{color:#d3dbe4;opacity:1}[data-theme="dark"] .doc-code strong,[data-theme="dark"] .nav a{color:#fff}[data-theme="dark"] .nav a{opacity:.95}[data-theme="dark"] .nav a:hover{background:rgba(255,255,255,.14)}[data-theme="dark"] .theme-toggle{border-color:#55606b;background:#06090c}[data-theme="dark"] .theme-toggle button{color:#dce3eb}[data-theme="dark"] .theme-toggle button.active{background:#f5f7fa;color:#111820}[data-theme="dark"] .slide{background:#151a20}[data-theme="dark"] .slide.alt{background:#11161b}[data-theme="dark"] .section-head>span{background:rgba(212,154,33,.16);color:#f2bc4b;border:1px solid rgba(242,188,75,.3)}[data-theme="dark"] .section-head p,[data-theme="dark"] .kicker{color:#f2bc4b}[data-theme="dark"] .section-head small{color:#cfd7df}[data-theme="dark"] .text-panel,[data-theme="dark"] .list-card,[data-theme="dark"] .flow-card,[data-theme="dark"] .glossary-card{background:#1b2128;border-color:#46505b}[data-theme="dark"] .field{background:#1a2027;border-color:#46505b}[data-theme="dark"] .text-panel h3,[data-theme="dark"] .list-card h3,[data-theme="dark"] .flow-card h3,[data-theme="dark"] .glossary-card h3,[data-theme="dark"] .diagram h3,[data-theme="dark"] .gap-table td:first-child{color:#f2bc4b}[data-theme="dark"] .text-panel p,[data-theme="dark"] .list-card p,[data-theme="dark"] .flow-card p,[data-theme="dark"] .glossary-card p,[data-theme="dark"] .diagram p,[data-theme="dark"] .list-card ul{color:#d5dce4}[data-theme="dark"] .table-wrap{background:#171d24;border-color:#505a66;box-shadow:0 16px 50px rgba(0,0,0,.35)}[data-theme="dark"] th{background:#232b34;color:#dfe6ee;border-color:#505a66}[data-theme="dark"] td{border-color:#404a55;color:#eef2f6}[data-theme="dark"] tr:hover td{background:rgba(242,188,75,.06)}[data-theme="dark"] .empty{background:#1b2128;border-color:#505a66;color:#d4dbe3}@media(max-width:980px){.cover-hero{grid-template-columns:1fr;gap:24px}.cover-context{grid-template-columns:1fr}.presentation-controls{grid-template-columns:1fr 40px}}
</style>
<style>
.type-tag{display:inline-flex;width:max-content;align-items:center;border:1px solid color-mix(in srgb,var(--accent) 28%,var(--line));border-radius:999px;background:color-mix(in srgb,var(--accent) 10%,var(--surface));color:var(--accent-strong);padding:4px 9px;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.tag-list{display:flex;flex-wrap:wrap;gap:7px;margin:2px 0 10px}.substep-tags{margin:0 0 0 auto;justify-content:flex-end}.system-card{align-self:start;padding:0;overflow:hidden}.system-card>summary{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:13px;align-items:center;list-style:none;cursor:pointer;padding:18px 20px}.system-card>summary::-webkit-details-marker{display:none}.system-card>summary:after{content:"";width:8px;height:8px;border-right:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(45deg);transition:transform .18s ease}.system-card[open]>summary:after{transform:rotate(225deg)}.system-card .index{margin:0}.system-card-heading{display:flex;min-width:0;align-items:center;justify-content:space-between;gap:12px}.system-card-heading strong{overflow:hidden;color:var(--accent-strong);font-size:17px;text-overflow:ellipsis;white-space:nowrap}.system-card-body{border-top:1px solid var(--line);padding:16px 20px 20px}.system-card-empty{font-style:italic}
.nested-activities{display:grid;gap:12px;margin-top:14px;padding-left:18px;border-left:2px solid color-mix(in srgb,var(--gold) 42%,var(--line))}.nested-activities .list-card{padding:16px;box-shadow:none}.nested-activities .list-card h3{margin-bottom:7px}
.flow-details{display:block;min-width:0}.flow-details>summary,.substep>summary{display:flex;align-items:center;gap:10px;list-style:none;cursor:pointer;border-radius:12px}.flow-details>summary::-webkit-details-marker,.substep>summary::-webkit-details-marker{display:none}.flow-details>summary:before,.substep>summary:before{content:"";width:9px;height:9px;border-right:2px solid var(--gold);border-bottom:2px solid var(--gold);transform:rotate(45deg);transition:.18s ease}.flow-details:not([open])>summary:before,.substep:not([open])>summary:before{transform:rotate(-45deg)}.flow-details>summary{margin-bottom:10px;padding:4px 2px}.flow-details>summary h3{margin:0}.substep>summary{padding:2px 0}.substep>summary h4{margin:0;color:var(--text)}.substep-body{padding-top:8px}.zoom-modal{overflow:hidden}.zoom-modal img{transition:transform .16s ease;transform:scale(var(--zoom-scale,1));transform-origin:center center}.zoom-help{position:fixed;left:28px;bottom:24px;color:rgba(255,255,255,.74);font-size:12px}.zoom-map{position:fixed;right:28px;bottom:24px;width:190px;height:126px;border:1px solid rgba(255,255,255,.32);border-radius:12px;background:rgba(255,255,255,.08);padding:8px;display:none;overflow:hidden}.zoom-modal.open .zoom-map{display:block}.zoom-map img{width:100%;height:100%;object-fit:contain;background:#fff;border-radius:8px;transform:none;box-shadow:none;cursor:default}.zoom-map span{position:absolute;border:2px solid #d49a21;border-radius:8px;background:rgba(212,154,33,.14);box-shadow:0 0 0 999px rgba(0,0,0,.18);pointer-events:none;transition:inset .16s ease,left .16s ease,top .16s ease,width .16s ease,height .16s ease}
.quant-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));overflow:hidden;border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:0 12px 38px rgba(18,30,27,.07)}.quant-metric{min-height:112px;padding:20px 22px;display:flex;flex-direction:column;justify-content:space-between;border-right:1px solid var(--line)}.quant-metric:last-child{border-right:0}.quant-metric span{color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.13em;text-transform:uppercase}.quant-metric strong{font-size:34px;line-height:1;color:var(--text);font-variant-numeric:tabular-nums}.quant-overview{display:grid;grid-template-columns:minmax(0,1.04fr) minmax(360px,.96fr);gap:24px;align-items:stretch;margin-top:24px}.quant-insight,.quant-waffle-card,.quant-panel,.quant-alert{border:1px solid var(--line);background:var(--surface);border-radius:16px}.quant-insight{display:flex;min-height:330px;flex-direction:column;justify-content:center;padding:36px}.quant-eyebrow{display:block;margin-bottom:13px;color:var(--gold);font-size:10px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.quant-insight h3{max-width:680px;margin:0;color:var(--text);font-size:clamp(24px,2.5vw,35px);line-height:1.16}.quant-insight h3 em{color:var(--gold);font-style:normal}.quant-insight p{max-width:650px;margin:16px 0 24px;color:var(--muted);font-size:14px;line-height:1.55}.quant-chips{display:flex;flex-wrap:wrap;gap:8px}.quant-chip{display:inline-flex;align-items:baseline;gap:7px;border:1px solid var(--line);border-radius:999px;padding:8px 12px;background:var(--surface-2);color:var(--muted);font-size:11px}.quant-chip strong{color:var(--text);font-size:14px}.quant-waffle-card{padding:24px;background:var(--surface-2)}.quant-waffle-head{display:flex;justify-content:space-between;gap:20px;margin-bottom:16px}.quant-waffle-head span{color:var(--muted);font-size:11px;font-weight:850;text-transform:uppercase;letter-spacing:.11em}.quant-waffle-head strong{font-size:13px}.quant-waffle{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:5px;margin-bottom:20px}.quant-waffle>i{display:block;min-width:7px;aspect-ratio:1;border-radius:3px}.manual-system{background:var(--gold)}.manual-outside{background:#d66b52}.hybrid{background:#53a987}.automatic{background:#15996f}.quant-legend{display:grid;gap:9px}.quant-legend-row{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:12px}.quant-legend-row>span{display:flex;align-items:center;gap:8px;color:var(--muted)}.quant-legend-row>span i{display:block;width:9px;height:9px;border-radius:2px}.quant-legend-row strong{color:var(--text);font-size:12px}.quant-summary{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px}.quant-panel{padding:24px}.quant-panel h3{margin:0;color:var(--text);font-size:17px}.quant-panel>p{margin:6px 0 18px;color:var(--muted);font-size:12px}.quant-bar{display:grid;gap:7px;margin-top:14px}.quant-bar>div{display:flex;justify-content:space-between;gap:16px;font-size:12px}.quant-bar>div span{color:var(--text);font-weight:700}.quant-bar>div strong{color:var(--muted)}.quant-bar>i{display:block;height:7px;overflow:hidden;border-radius:999px;background:var(--line)}.quant-bar>i b{display:block;height:100%;border-radius:inherit;background:var(--gold)}.quant-resource{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:10px;align-items:center;border-bottom:1px solid var(--line);padding:11px 0}.quant-resource:last-child{border-bottom:0}.quant-resource span{display:grid;height:27px;place-items:center;border-radius:7px;background:color-mix(in srgb,var(--gold) 16%,transparent);color:var(--gold);font-size:10px;font-weight:900}.quant-resource strong{font-size:13px;color:var(--text)}.quant-resource b{font-size:15px}.quant-alert-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:30px 0 12px}.quant-alert-heading h3{margin:0;color:var(--text);font-size:18px}.quant-alert-heading p{margin:0;color:var(--muted);font-size:12px}.quant-alerts{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.quant-alert{min-height:108px;padding:17px}.quant-alert strong{display:block;font-size:28px;color:var(--text)}.quant-alert span{display:block;margin-top:7px;color:var(--muted);font-size:11px;line-height:1.35}
.system-card-heading{align-items:flex-start}.system-card-heading strong{overflow:visible;white-space:normal;text-overflow:clip;overflow-wrap:anywhere;line-height:1.3}.quant-metrics{grid-template-columns:minmax(132px,.82fr) minmax(166px,1fr) minmax(146px,.9fr) minmax(112px,.68fr) minmax(224px,1.35fr);gap:10px;overflow:visible;border:0;border-radius:0;background:transparent;box-shadow:none}.quant-metric{position:relative;min-height:88px;padding:15px 17px;border:1px solid var(--line);border-top:3px solid color-mix(in srgb,var(--gold) 78%,var(--accent));border-radius:8px;background:var(--surface);box-shadow:0 6px 20px rgba(18,30,27,.06)}.quant-metric:last-child{border-right:1px solid var(--line)}.quant-metric strong{font-size:30px}.quant-insight,.quant-waffle-card,.quant-panel,.quant-alert{border-radius:8px}.quant-resource{align-items:start;padding:8px 0}.quant-resource strong{min-width:0;overflow-wrap:anywhere;line-height:1.3}.quant-resource b{padding-top:3px}.quant-alert{border-left:3px solid color-mix(in srgb,var(--gold) 70%,var(--line));background:var(--surface-2)}
.sipoc-table th:first-child{width:22%;border-left:3px solid var(--gold);background:color-mix(in srgb,var(--gold) 18%,var(--surface));color:var(--text)}.sipoc-table td:first-child{border-left:3px solid color-mix(in srgb,var(--gold) 72%,var(--line));background:color-mix(in srgb,var(--gold) 7%,var(--surface));color:var(--text);font-weight:800}.sipoc-table th:not(:first-child),.sipoc-table td:not(:first-child){width:19.5%}
#sistemas .card-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
#sistemas .system-card{width:100%;min-height:112px}
#sistemas .system-card>summary{min-height:110px;padding:16px 18px}
#sistemas .system-card-heading{display:grid;align-content:center;justify-content:stretch;gap:9px}
#sistemas .system-card-heading strong{font-size:15px;line-height:1.25;overflow-wrap:break-word;word-break:normal}
#sistemas .system-card-heading .type-tag{max-width:100%;white-space:normal;line-height:1.2}
#glossario .card-grid{grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
#glossario .glossary-disclosure-card{width:100%;min-height:96px}
#glossario .glossary-disclosure-card>summary{min-height:94px;padding:16px 18px}
#glossario .glossary-disclosure-card .system-card-heading{display:grid;align-content:center}
#glossario .glossary-disclosure-card .system-card-heading strong{font-size:15px;line-height:1.3;overflow-wrap:break-word;word-break:normal}
@media(min-width:1101px) and (min-height:760px){
  #quantitativa{height:100vh;min-height:0;overflow:hidden;display:grid;grid-template-rows:auto clamp(78px,9vh,104px) minmax(220px,1.35fr) minmax(168px,1fr) auto clamp(68px,8vh,92px);align-content:stretch;gap:clamp(8px,1.15vh,14px);padding:clamp(18px,2.5vh,30px) clamp(32px,3vw,52px)}
  #quantitativa .section-head{align-items:center;gap:18px;margin:0}
  #quantitativa .section-head>span{width:clamp(48px,5.4vh,58px);height:clamp(48px,5.4vh,58px)}
  #quantitativa .section-head h2{font-size:clamp(32px,3.6vh,40px)}
  #quantitativa .section-head small{margin-top:4px;font-size:clamp(12px,1.35vh,14px)}
  #quantitativa .quant-metrics{height:100%}
  #quantitativa .quant-metric{min-height:0;height:100%;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:14px;padding:clamp(12px,1.6vh,18px) clamp(16px,1.5vw,22px)}
  #quantitativa .quant-metric span{line-height:1.25}
  #quantitativa .quant-metric strong{font-size:clamp(28px,3.4vh,36px)}
  #quantitativa .quant-overview{height:auto;min-height:0;grid-template-columns:minmax(0,1.08fr) minmax(380px,.92fr);gap:clamp(12px,1vw,18px);margin:0}
  #quantitativa .quant-insight{height:100%;min-height:0;padding:clamp(24px,3vh,38px);justify-content:center}
  #quantitativa .quant-insight h3{max-width:850px;font-size:clamp(24px,2.6vh,32px);line-height:1.18}
  #quantitativa .quant-insight p{margin:clamp(9px,1.2vh,14px) 0 clamp(13px,1.7vh,20px);font-size:clamp(12px,1.35vh,14px);line-height:1.45}
  #quantitativa .quant-chip{padding:clamp(6px,.8vh,9px) 11px;font-size:clamp(10px,1.1vh,12px)}
  #quantitativa .quant-chip strong{font-size:clamp(12px,1.35vh,15px)}
  #quantitativa .quant-waffle-card{height:100%;min-height:0;display:flex;flex-direction:column;padding:clamp(18px,2.2vh,26px)}
  #quantitativa .quant-waffle-head{margin-bottom:clamp(10px,1.3vh,16px)}
  #quantitativa .quant-waffle{flex:1;min-height:0;grid-template-rows:repeat(5,minmax(0,1fr));gap:clamp(4px,.55vh,7px);margin-bottom:clamp(10px,1.3vh,16px)}
  #quantitativa .quant-waffle>i{height:auto;min-width:0;aspect-ratio:auto}
  #quantitativa .quant-legend{grid-template-columns:1fr 1fr;column-gap:18px;row-gap:clamp(5px,.65vh,8px)}
  #quantitativa .quant-legend-row{gap:9px;font-size:clamp(10px,1.15vh,12px)}
  #quantitativa .quant-legend-row strong{font-size:inherit}
  #quantitativa .quant-summary{height:auto;min-height:0;gap:clamp(12px,1vw,18px);margin:0}
  #quantitativa .quant-panel{height:100%;min-height:0;overflow:hidden;padding:clamp(17px,2vh,24px)}
  #quantitativa .quant-panel h3{font-size:clamp(16px,1.8vh,20px)}
  #quantitativa .quant-panel>p{margin:4px 0 clamp(10px,1.2vh,14px);font-size:clamp(10px,1.15vh,12px)}
  #quantitativa .quant-bar{gap:clamp(4px,.55vh,7px);margin-top:clamp(6px,.7vh,9px)}
  #quantitativa .quant-bar>div{font-size:clamp(10px,1.15vh,12px)}
  #quantitativa .quant-bar>i{height:clamp(4px,.55vh,7px)}
  #quantitativa .quant-resource{grid-template-columns:clamp(25px,2.6vh,31px) minmax(0,1fr) auto;gap:10px;padding:clamp(5px,.75vh,9px) 0}
  #quantitativa .quant-resource span{height:clamp(22px,2.6vh,28px)}
  #quantitativa .quant-resource strong{font-size:clamp(10px,1.2vh,13px);line-height:1.2}
  #quantitativa .quant-resource b{font-size:clamp(11px,1.35vh,14px)}
  #quantitativa .quant-alert-heading{height:auto;min-height:32px;margin:0;align-items:center}
  #quantitativa .quant-alert-heading h3{font-size:clamp(15px,1.7vh,18px)}
  #quantitativa .quant-alert-heading p{font-size:clamp(10px,1.1vh,12px)}
  #quantitativa .quant-alerts{height:100%}
  #quantitativa .quant-alert{min-height:0;height:100%;display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:12px;padding:clamp(10px,1.25vh,15px)}
  #quantitativa .quant-alert strong{font-size:clamp(21px,2.7vh,28px)}
  #quantitativa .quant-alert span{margin-top:0;font-size:clamp(10px,1.1vh,12px)}
}
@media(min-width:721px) and (max-width:1350px){#sistemas .card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(min-width:721px) and (max-width:1350px){#glossario .card-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:720px){.substep>summary{align-items:flex-start;flex-wrap:wrap}.substep-tags{width:100%;margin:2px 0 0 19px;justify-content:flex-start}}
@media(max-width:720px){#glossario .card-grid{grid-template-columns:1fr}}
@media(max-width:1100px){.quant-metrics{grid-template-columns:repeat(3,minmax(0,1fr))}.quant-metric{border-bottom:1px solid var(--line)}.quant-overview,.quant-summary{grid-template-columns:1fr}.quant-alerts{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:720px){.quant-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.quant-metric{min-height:96px}.quant-overview{grid-template-columns:minmax(0,1fr)}.quant-insight{min-height:0;padding:24px}.quant-waffle-card{padding:18px}.quant-alerts{grid-template-columns:1fr}.quant-alert-heading{align-items:flex-start;flex-direction:column}}
</style>
</head>
<body>
<div class="shell">
<aside class="sidebar">
  <div class="brand">${bfFlowLogoHtml(brand, assetBase)}</div>
  <div class="doc-code"><span>${html(code)}</span><strong>${html(model.meta.titulo || title)}</strong></div>
  <nav class="nav">${nav.map(([href, label]) => `<a href="#${href}">${html(label)}</a>`).join("")}</nav>
  <div class="presentation-controls"><div class="theme-toggle" aria-label="Tema da apresentação"><button type="button" data-theme-choice="light" class="active" title="Tema claro" aria-label="Tema claro"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></button><button type="button" data-theme-choice="dark" title="Tema escuro" aria-label="Tema escuro"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A7.5 7.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg></button></div><button type="button" class="fullscreen-button" id="fullscreen-toggle" title="Tela cheia" aria-label="Tela cheia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/></svg></button></div>
</aside>
<main class="content">
<section class="slide cover" id="capa"><div class="cover-hero"><div><div class="kicker">00 · Apresentação de Mapeamento</div><h1>${html(title)}</h1></div><div class="cover-code"><span>Código</span><strong>${html(code)}</strong></div></div><dl class="cover-context">${[
    coverLine("Processo mapeado", processName, processCode),
    coverLine("Cadeia de valor e área", processValueChain, processArea),
    coverLine("Dono do processo", processOwner),
  ].join("")}</dl>${fieldGrid([
    ["Modalidade", model.meta.modalidade],
    ["Status", model.meta.status || "Em andamento"],
    ["Data", formatDateBr(model.meta.dataRelatorio || model.meta.data)],
    ["Elaborador", model.meta.elaborador],
    ["Revisor", model.meta.revisor],
  ]).replace('class="field-grid"', 'class="cover-meta"')}</section>
<section class="slide" id="visao">${sectionHead("01", "Visão geral", "Objetivo, escopo e contexto operacional do mapeamento.")}<div class="text-stack">${
    [
      textPanel("Objetivo", model.description, overviewIcon("target")),
      textPanel("Escopo", safeData.overview.escopo, overviewIcon("scope")),
      textPanel("Estado atual", safeData.overview.estadoAtual),
      textPanel("Contexto", safeData.overview.kpis, overviewIcon("context")),
      textPanel("Volume", safeData.overview.volume),
      textPanel("Frequência", safeData.overview.frequencia),
      textPanel("Dores", safeData.overview.dores),
      textPanel("Oportunidades", safeData.overview.oportunidades),
    ].join("") || emptyBlock()
  }</div></section>
<section class="slide alt" id="sistemas">${sectionHead("02", "Sistemas/Documentos envolvidos", "Sistemas, documentos e uso no processo.")}<div class="card-grid">${systemCards}</div></section>
<section class="slide" id="sipoc">${sectionHead("03", "Análise SIPOC", "Fornecedores, entradas, processo, saídas e clientes.")}${sipocRows}</section>
<section class="slide alt" id="fluxo">${sectionHead("04", "Etapas do processo", "Representação do processo.")}${macroDiagram}<div class="flow-stack">${flowSteps}</div></section>
<section class="slide" id="quantitativa">${sectionHead("05", "Visão Quantitativa", "Leitura objetiva da estrutura, execução e concentração operacional do processo.")}<div class="quant-metrics">${quantitativeMetricCards}</div><div class="quant-overview"><article class="quant-insight"><span class="quant-eyebrow">A oportunidade</span><h3>${quantitativeInsightTitle}</h3><p>${html(quantitativeInsightBody)}</p><div class="quant-chips"><span class="quant-chip"><strong>${model.stats.averageActivities.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</strong> atividades por processo ou subprocesso</span><span class="quant-chip"><strong>${model.stats.maxActivitiesInSubprocess}</strong> maior concentração em um subprocesso</span><span class="quant-chip"><strong>${model.stats.automationPercentage}%</strong> com algum grau de automação</span></div></article><article class="quant-waffle-card"><div class="quant-waffle-head"><span>Composição das atividades</span><strong>${model.stats.activities} atividades</strong></div>${quantitativeWaffle ? `<div class="quant-waffle">${quantitativeWaffle}</div>` : emptyBlock("Nenhuma atividade classificada.")}<div class="quant-legend">${quantitativeLegend}</div></article></div><div class="quant-summary"><article class="quant-panel"><h3>Onde o esforço se concentra</h3><p>Participação das áreas nas atividades identificadas.</p>${quantitativeBars(model.stats.areaDistribution)}</article><article class="quant-panel"><h3>Com o que se trabalha</h3><p>Sistemas e documentos com maior número de vínculos.</p>${quantitativeResources}</article></div><div class="quant-alert-heading"><div><span class="quant-eyebrow">Pontos de atenção</span><h3>Alertas analíticos</h3></div><p>Registros que exigem revisão ou complementação.</p></div><div class="quant-alerts">${quantitativeAlerts}</div></section>
<section class="slide alt" id="gaps">${sectionHead("06", "Oportunidades de melhoria", "Oportunidades, impactos e planos de ação relacionados.")}${gapTable}</section>
<section class="slide" id="proximos">${sectionHead("07", "Próximos passos", "Encaminhamentos definidos para continuidade.")}<div class="card-grid">${nextCards}</div></section>
<section class="slide alt" id="glossario">${sectionHead("08", "Glossário", "Termos utilizados no relatório.")}<div class="card-grid">${glossaryCards}</div></section>
</main>
</div>
<div class="zoom-modal" id="zoom-modal" onclick="closeImageZoom()"><div class="zoom-title" id="zoom-title"></div><button class="zoom-close" onclick="closeImageZoom();event.stopPropagation()">Fechar</button><img id="zoom-img" alt="Imagem ampliada" onclick="changeImageZoom(0.25);event.stopPropagation()" oncontextmenu="changeImageZoom(-0.25);event.preventDefault();event.stopPropagation()"/><div class="zoom-help">Clique para ampliar. Botão direito para reduzir.</div><div class="zoom-map" id="zoom-map"><img id="zoom-map-img" alt="Miniatura"/><span id="zoom-map-window" aria-hidden="true"></span></div></div>
<script>
(function(){
  var root=document.documentElement;
  var buttons=Array.prototype.slice.call(document.querySelectorAll('[data-theme-choice]'));
  function apply(theme){root.setAttribute('data-theme',theme);try{localStorage.setItem('bf-flow-mapping-preview-theme',theme)}catch(e){}buttons.forEach(function(button){button.classList.toggle('active',button.getAttribute('data-theme-choice')===theme);});}
  var saved='light';try{saved=localStorage.getItem('bf-flow-mapping-preview-theme')||'light'}catch(e){}
  apply(saved);
  buttons.forEach(function(button){button.addEventListener('click',function(){apply(button.getAttribute('data-theme-choice')||'light');});});
  var fullscreenButton=document.getElementById('fullscreen-toggle');
  if(fullscreenButton){fullscreenButton.addEventListener('click',function(){if(!document.fullscreenElement){document.documentElement.requestFullscreen&&document.documentElement.requestFullscreen();}else{document.exitFullscreen&&document.exitFullscreen();}});}
})();
var imageZoomScale=1;
var imageZoomOrigin={x:50,y:50};
function setZoomOrigin(event,target){if(!event||!target)return;var rect=target.getBoundingClientRect();if(!rect.width||!rect.height)return;imageZoomOrigin={x:Math.max(0,Math.min(100,(event.clientX-rect.left)*100/rect.width)),y:Math.max(0,Math.min(100,(event.clientY-rect.top)*100/rect.height))};}
function updateZoomMap(){var win=document.getElementById('zoom-map-window');if(!win)return;var map=document.getElementById('zoom-map');var padding=8;var w=map?map.clientWidth-padding*2:174;var h=map?map.clientHeight-padding*2:110;var visible=1/imageZoomScale;var left=padding+imageZoomOrigin.x*w/100-w*visible/2;var top=padding+imageZoomOrigin.y*h/100-h*visible/2;left=Math.max(padding,Math.min(padding+w-w*visible,left));top=Math.max(padding,Math.min(padding+h-h*visible,top));win.style.left=left+'px';win.style.top=top+'px';win.style.width=(w*visible)+'px';win.style.height=(h*visible)+'px';}
function setImageZoom(scale){imageZoomScale=Math.max(1,Math.min(3,scale));var target=document.getElementById('zoom-img');if(target){target.style.setProperty('--zoom-scale',String(imageZoomScale));target.style.transformOrigin=imageZoomOrigin.x+'% '+imageZoomOrigin.y+'%';}updateZoomMap();}
function changeImageZoom(delta){var target=document.getElementById('zoom-img');setZoomOrigin(window.event,target);setImageZoom(imageZoomScale+delta);}
function openImageZoom(img){var modal=document.getElementById('zoom-modal');var target=document.getElementById('zoom-img');var map=document.getElementById('zoom-map-img');var title=document.getElementById('zoom-title');imageZoomOrigin={x:50,y:50};target.src=img.src;if(map)map.src=img.src;title.textContent=img.dataset.title||img.alt||'Imagem';setImageZoom(1);modal.classList.add('open');setTimeout(updateZoomMap,0);}
function closeImageZoom(){var modal=document.getElementById('zoom-modal');var target=document.getElementById('zoom-img');var map=document.getElementById('zoom-map-img');modal.classList.remove('open');target.src='';if(map)map.src='';imageZoomOrigin={x:50,y:50};setImageZoom(1);}
document.addEventListener('keydown',function(event){if(event.key==='Escape')closeImageZoom();});
</script>
</body>
</html>`;
}
function ModuleWorkspacePage() {
  const { module } = Route.useParams();
  const search = Route.useSearch();
  const moduleId = module as AteliamModule;
  const navigate = useNavigate();
  const moduleInfo = MODULES.find((item) => item.id === moduleId)!;
  const isDemo = false;
  const [workspace, setWorkspace] = useState<WorkspaceState>(() => defaultWorkspace());
  const [loaded, setLoaded] = useState(false);
  const [railArea, setRailArea] = useState<RailArea>("modules");
  const [treeOpen, setTreeOpen] = useState(true);

  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setTreeOpen(false);
  }, []);
  const [contentMode, setContentMode] = useState<ModuleContentMode>("module");
  const [moduleSurface, setModuleSurface] = useState<ModuleSurface>(() =>
    search.view === "consult" ? "consult" : "editor",
  );
  const [registrationView, setRegistrationView] = useState<ModuleRegistrationView>("processes");
  const [settingsView, setSettingsView] = useState<ModuleSettingsView>("theme");
  const [expandedTree, setExpandedTree] = useState<Record<string, boolean>>(() =>
    readModuleNavigationState({
      home: true,
      modules: true,
      registrations: false,
      ddp: moduleId === "ddp",
      pop: moduleId === "pop",
      bpmn: moduleId === "bpmn",
      causes: search.view?.startsWith("cause-") ?? false,
      settings: true,
      processRegistrations: true,
      systemRegistrations: true,
    }),
  );

  useEffect(() => {
    window.localStorage.setItem(NAVIGATION_STATE_KEY, JSON.stringify(expandedTree));
  }, [expandedTree]);

  const [showSave, setShowSave] = useState(false);
  const [pendingMappingProcesses, setPendingMappingProcesses] = useState<CreatedProcess[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState("");
  // Incrementa a cada salvamento concluído — informa ao formulário de mapeamento
  // que o estado "não salvo" pode ser limpo.
  const [savedNonce, setSavedNonce] = useState(0);
  const [demoVersion, setDemoVersion] = useState(() => getDemoWorkspaceVersion());
  const [demoOrganizationLogo, setDemoOrganizationLogo] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("ateliam-demo-organization-logo"),
  );
  const [demoDocumentModels, setDemoDocumentModels] =
    useState<DocumentModelRow[]>(DEFAULT_DOCUMENT_MODELS);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const spreadsheetInputRef = useRef<HTMLInputElement>(null);
  const [openedLocalFile, setOpenedLocalFile] = useState<OpenedLocalFile | null>(null);
  const [activeCloudDocument, setActiveCloudDocument] = useState<ActiveCloudDocument | null>(null);
  const [moduleEditStarted, setModuleEditStarted] = useState(moduleId === "bpmn");
  const [showLibrary, setShowLibrary] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [ddpView, setDdpView] = useState<"editor" | "causes">("editor");
  const [activeOrganizationId, setActiveOrganizationId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("ateliam-active-organization") || "",
  );
  const moduleDocLabel = moduleDocumentLabel(moduleId);

  const ensure = useServerFn(getOrCreateWorkspace);
  const listVersions = useServerFn(listWorkspaceVersions);
  const getVersion = useServerFn(getWorkspaceVersionContent);
  const me = useServerFn(getMe);
  const listOrganizations = useServerFn(listAccessibleOrganizations);
  const listUsers = useServerFn(listUserAccess);
  const listCatalogs = useServerFn(listOrganizationCatalogs);
  const listDocumentModels = useServerFn(listOrganizationDocumentModels);
  const createSharedCause = useServerFn(createOrganizationCause);
  const listCloudDocuments = useServerFn(listModuleDocuments);
  const getCloudDocument = useServerFn(getModuleDocumentContent);
  const listCloudDocumentVersions = useServerFn(listModuleDocumentVersions);
  const getCloudDocumentVersion = useServerFn(getModuleDocumentVersionContent);
  const saveCloudDocument = useServerFn(saveModuleDocument);
  const removeCloudDocument = useServerFn(deleteModuleDocument);
  const updateSharedCause = useServerFn(updateOrganizationCause);
  const removeSharedCause = useServerFn(deleteOrganizationCause);
  const saveSuggestedProcess = useServerFn(saveProcessRegistration);
  const saveSuggestedSystem = useServerFn(saveSystemRegistration);
  const [demoCatalogs, setDemoCatalogs] = useState<OrganizationCatalogs>(DEMO_CATALOGS);
  // Alteração de status do documento na tela de consulta (Em andamento, etc.).
  const [statusOverrides, setStatusOverrides] = useState<Record<string, string>>({});

  const wsQ = useQuery({
    queryKey: ["workspace-modern"],
    queryFn: () => ensure(),
    enabled: !isDemo,
    retry: 1,
  });

  const meQ = useQuery({
    queryKey: ["module-me"],
    queryFn: () => me(),
    enabled: !isDemo,
  });
  const accessibleOrganizationsQ = useQuery({
    queryKey: ["module-accessible-organizations", isDemo ? "demo" : "cloud"],
    queryFn: () => listOrganizations(),
    enabled: !isDemo,
  });
  const accessibleOrganizations = useMemo(
    () => (accessibleOrganizationsQ.data ?? []) as AccessibleOrganization[],
    [accessibleOrganizationsQ.data],
  );
  const selectedOrganizationId = isDemo
    ? null
    : accessibleOrganizations.some((organization) => organization.id === activeOrganizationId)
      ? activeOrganizationId
      : (accessibleOrganizations.find((organization) => organization.isDefault)?.id ??
        accessibleOrganizations[0]?.id ??
        meQ.data?.organization?.id ??
        null);
  const selectedOrganization =
    accessibleOrganizations.find((organization) => organization.id === selectedOrganizationId) ??
    null;

  const canListUsers = !isDemo && !!meQ.data?.roles?.some((role) => role === "admin");
  const usersQ = useQuery({
    queryKey: ["module-users", isDemo ? "demo" : (selectedOrganizationId ?? "cloud")],
    queryFn: () => listUsers({ data: { organizationId: selectedOrganizationId } }),
    enabled: canListUsers,
    retry: false,
  });

  const documentModelsQ = useQuery({
    queryKey: ["module-document-models", isDemo ? "demo" : (selectedOrganizationId ?? "cloud")],
    queryFn: () => listDocumentModels({ data: { organizationId: selectedOrganizationId } }),
    enabled: !isDemo,
  });

  const versionsQ = useQuery({
    queryKey: [
      "module-versions-modern",
      isDemo ? "demo" : "cloud",
      moduleId,
      activeCloudDocument?.id ?? "workspace",
    ],
    queryFn: () =>
      isDemo
        ? listDemoWorkspaceVersions()
        : activeCloudDocument?.id
          ? listCloudDocumentVersions({ data: { documentId: activeCloudDocument.id } })
          : listVersions(),
    enabled: showHistory && moduleId !== "ddp",
  });
  const catalogsQ = useQuery({
    queryKey: ["organization-catalogs", isDemo ? "demo" : (selectedOrganizationId ?? "cloud")],
    queryFn: () => listCatalogs({ data: { organizationId: selectedOrganizationId } }),
    enabled: !isDemo && loaded,
  });
  const cloudDocsQ = useQuery({
    queryKey: ["module-documents", moduleId, isDemo ? "demo" : (selectedOrganizationId ?? "cloud")],
    queryFn: () =>
      listCloudDocuments({
        data: {
          organizationId: selectedOrganizationId,
          moduleId: moduleId as "ddp" | "pop" | "bpmn",
        },
      }),
    enabled:
      (showLibrary ||
        moduleSurface === "consult" ||
        (moduleId === "ddp" && ddpView === "causes")) &&
      !isDemo,
  });
  const draftKey = isDemo ? DRAFT_KEY : `${DRAFT_KEY}_${wsQ.data?.id ?? "cloud"}`;
  const organizationCatalogs: OrganizationCatalogs = isDemo
    ? demoCatalogs
    : {
        departments: catalogsQ.data?.departments ?? [],
        processOwners: catalogsQ.data?.processOwners ?? [],
        positions:
          (catalogsQ.data as { positions?: OrganizationPosition[] } | undefined)?.positions ?? [],
        causes: (catalogsQ.data?.causes ?? []) as unknown as OrganizationCause[],
        processes: catalogsQ.data?.processes ?? [],
        valueChains: catalogsQ.data?.valueChains ?? [],
        systems: (catalogsQ.data as { systems?: OrganizationSystem[] } | undefined)?.systems ?? [],
      };
  const organizationBrand: OrganizationBrand = isDemo
    ? {
        name: "Bom Futuro",
        word_header_color: "1D1D1F",
        logo_data_url: demoOrganizationLogo,
      }
    : (selectedOrganization ??
      meQ.data?.organization ?? { name: "BF Flow", word_header_color: "1D1D1F" });
  const elaboratorOptions = useMemo(() => {
    const fromUsers =
      (usersQ.data as Array<{ email?: string | null; display_name?: string | null }> | undefined)
        ?.map((user) => user.display_name || user.email || "")
        .filter(Boolean) ?? [];
    const currentUser = !isDemo
      ? [meQ.data?.profile?.display_name || meQ.data?.profile?.email || ""].filter(Boolean)
      : [];
    const demoUsers = isDemo
      ? ["Administrador local", "Analista de processos", "Usuário consulta"]
      : [];
    return Array.from(new Set([...fromUsers, ...currentUser, ...demoUsers]));
  }, [isDemo, meQ.data?.profile?.display_name, meQ.data?.profile?.email, usersQ.data]);
  const currentElaborator = !isDemo
    ? meQ.data?.profile?.display_name || meQ.data?.profile?.email || ""
    : "Administrador local";

  // Contexto de codificação da organização ativa (modo demo via localStorage).
  const demoOrgForCode = isDemo ? readActiveDemoOrganization() : null;
  const codeOrganizationId = isDemo ? demoOrgForCode!.id : (selectedOrganizationId ?? null);
  const codeSettings: CodeSettings | null = isDemo
    ? demoOrgForCode!.code_settings
    : ((selectedOrganization?.code_settings as CodeSettings | null | undefined) ??
      (meQ.data?.organization?.code_settings as CodeSettings | null | undefined) ??
      null);

  // Resolve a sigla (3 letras) a partir do nome da área: usa a sigla cadastrada
  // quando há correspondência; caso contrário, deriva do próprio nome.
  function resolveAreaSigla(name: string | null | undefined): string {
    const match = organizationCatalogs.departments.find((dept) => dept.name === name);
    return normalizeSigla(match?.sigla ?? name ?? "");
  }

  // Tipo e área do documento ativo (o código depende de ambos).
  const currentDocType: DocType = documentDocType(moduleId, workspace.pop.meta.tipo);
  const selectedMappingProcessForCode =
    moduleId === "ddp"
      ? organizationCatalogs.processes.find(
          (process) => process.id === workspace.ddp.macroprocess.processId,
        )
      : null;
  const currentAreaName =
    moduleId === "ddp"
      ? workspace.ddp.meta.area || selectedMappingProcessForCode?.department || ""
      : moduleId === "pop"
        ? workspace.pop.meta.area
        : (workspace.bpmn.area ?? "");
  const currentAreaSigla = resolveAreaSigla(currentAreaName);
  const codeRule = normalizeRule(codeSettings?.[currentDocType]);
  const isAutoCodeModule = codeRule.mode === "auto";
  const autoCodePreview =
    isAutoCodeModule && currentAreaSigla.length === 3
      ? isDemo
        ? previewDemoDocumentCode(
            codeOrganizationId,
            currentDocType,
            currentAreaSigla,
            codeSettings,
          )
        : previewDocumentCode(currentDocType, currentAreaSigla, codeRule)
      : "";

  const reserveCodeFn = useServerFn(reserveCode);
  // Reserva o próximo código (consome a sequência) no momento de salvar.
  async function reserveModuleCode(): Promise<string> {
    if (currentAreaSigla.length !== 3) {
      throw new Error("Defina a área responsável (sigla de 3 letras) antes de gerar o código.");
    }
    if (isDemo) {
      return reserveDemoDocumentCode(
        codeOrganizationId,
        currentDocType,
        currentAreaSigla,
        codeSettings,
      );
    }
    const result = await reserveCodeFn({
      data: {
        organizationId: codeOrganizationId,
        type: currentDocType,
        areaSigla: currentAreaSigla,
      },
    });
    return result.code;
  }

  useEffect(() => {
    function updateDemoBrand() {
      setDemoOrganizationLogo(window.localStorage.getItem("ateliam-demo-organization-logo"));
    }
    function updateDemoModels() {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem("ateliam-demo-document-models") ?? "[]",
        ) as DocumentModelRow[];
        setDemoDocumentModels(
          DEFAULT_DOCUMENT_MODELS.map((fallback) => ({
            ...fallback,
            ...(stored.find((row) => row.model_key === fallback.model_key) ?? {}),
          })),
        );
      } catch {
        setDemoDocumentModels(DEFAULT_DOCUMENT_MODELS);
      }
    }
    updateDemoBrand();
    updateDemoModels();
    window.addEventListener("ateliam-organization-brand-changed", updateDemoBrand);
    window.addEventListener("ateliam-document-models-changed", updateDemoModels);
    return () => {
      window.removeEventListener("ateliam-organization-brand-changed", updateDemoBrand);
      window.removeEventListener("ateliam-document-models-changed", updateDemoModels);
    };
  }, []);

  useEffect(() => {
    if (search.view === "new") {
      const fresh = defaultWorkspace();
      setWorkspace((current) =>
        moduleId === "ddp"
          ? { ...current, ddp: fresh.ddp }
          : moduleId === "pop"
            ? { ...current, pop: fresh.pop }
            : { ...current, bpmn: fresh.bpmn },
      );
      setOpenedLocalFile(null);
      setActiveCloudDocument(null);
      setLoaded(true);
      return;
    }
    if (isDemo) {
      const draft = window.localStorage.getItem(draftKey);
      const latest = listDemoWorkspaceVersions()[0];
      setWorkspace(parseWorkspace(draft ?? latest?.content_snapshot ?? null));
      setLoaded(true);
      return;
    }

    if (wsQ.data) {
      const draft = window.localStorage.getItem(draftKey);
      setWorkspace(parseWorkspace(draft ?? wsQ.data.content_inline));
      setLoaded(true);
    }
  }, [draftKey, isDemo, moduleId, search.view, wsQ.data]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(draftKey, JSON.stringify(workspace));
  }, [draftKey, loaded, workspace]);

  useEffect(() => {
    setDdpView("editor");
    setModuleEditStarted(moduleId === "bpmn");
    setRailArea("modules");
    setContentMode("module");
    setModuleSurface("editor");
    // Mantém os demais grupos como o usuário deixou e abre apenas o contexto atual.
    setExpandedTree((current) => ({
      ...current,
      modules: true,
      [moduleId]: true,
      causes: current.causes || search.view?.startsWith("cause-") === true,
    }));
  }, [moduleId, search.view]);

  useEffect(() => {
    if (search.view === "consult") {
      setRailArea("modules");
      setContentMode("module");
      setModuleSurface("consult");
      setTreeOpen(window.matchMedia("(min-width: 1024px)").matches);
      return;
    }
    if (search.view?.startsWith("cause-") && moduleId === "ddp") {
      setRailArea("modules");
      setContentMode("module");
      setModuleSurface("editor");
      setDdpView("causes");
      setTreeOpen(window.matchMedia("(min-width: 1024px)").matches);
      return;
    }
    if (search.view === "new") {
      setRailArea("modules");
      setContentMode("module");
      setModuleSurface("editor");
      setDdpView("editor");
      setModuleEditStarted(true);
      setTreeOpen(window.matchMedia("(min-width: 1024px)").matches);
      return;
    }
    // No view param — always reset to editor to avoid stale surface from previous navigation
    setModuleSurface("editor");
  }, [moduleId, search.view]);

  function updateWorkspace(updater: (current: WorkspaceState) => WorkspaceState) {
    setWorkspace((current) => updater(current));
  }

  function newModuleDocument() {
    const fresh = defaultWorkspace();
    setDdpView("editor");
    setWorkspace((current) => {
      const next =
        moduleId === "ddp"
          ? { ...current, ddp: fresh.ddp }
          : moduleId === "pop"
            ? { ...current, pop: fresh.pop }
            : { ...current, bpmn: fresh.bpmn };
      window.localStorage.setItem(draftKey, JSON.stringify(next));
      return next;
    });
    if (openedLocalFile?.moduleId === moduleId) setOpenedLocalFile(null);
    if (activeCloudDocument?.moduleId === moduleId) setActiveCloudDocument(null);
    setModuleEditStarted(true);
    toast.success(`Novo ${moduleDocLabel} iniciado.`);
  }

  function applyImportedDocument(raw: string, fileName: string, handle?: LocalFileHandle) {
    const result = importWorkspaceFromJson(raw, workspace, moduleId);
    setWorkspace(result.workspace);
    setOpenedLocalFile({ name: fileName, moduleId: result.moduleId, handle });
    setActiveCloudDocument(null);
    setModuleEditStarted(true);
    if (result.moduleId === "ddp") setDdpView("editor");
    window.localStorage.setItem(draftKey, JSON.stringify(result.workspace));
    toast.success(`${result.label} aberto para edicao.`);

    if (result.moduleId !== moduleId) {
      navigate({ to: "/m/$module", params: { module: result.moduleId } });
    }
  }

  async function openLocalFile() {
    const picker = (window as WindowWithFileSystemAccess).showOpenFilePicker;

    if (!picker) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const [handle] = await picker({
        multiple: false,
        types: [
          {
            description: "JSON BF Flow",
            accept: { "application/json": [".json"] },
          },
        ],
      });
      if (!handle) return;
      const file = await handle.getFile();
      applyImportedDocument(await file.text(), file.name, handle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error(error instanceof Error ? error.message : "Nao foi possivel abrir o arquivo.");
    }
  }

  async function handleFileInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      applyImportedDocument(await file.text(), file.name);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel importar o JSON.");
    }
  }

  function openSystemLibrary() {
    if (isDemo) {
      setShowLibrary(true);
      return;
    }
    setShowLibrary(true);
    cloudDocsQ.refetch();
  }

  async function openCloudModuleDocument(document: CloudModuleDocument) {
    try {
      const row = await getCloudDocument({ data: { id: document.id } });
      if (!row.content_inline) throw new Error("Documento sem conteúdo salvo.");
      const result = importWorkspaceFromJson(row.content_inline, workspace, moduleId);
      setWorkspace(result.workspace);
      setOpenedLocalFile(null);
      setActiveCloudDocument({
        id: row.id,
        moduleId: result.moduleId,
        name: row.name,
      });
      setModuleSurface("editor");
      setModuleEditStarted(true);
      if (result.moduleId === "ddp") setDdpView("editor");
      window.localStorage.setItem(draftKey, JSON.stringify(result.workspace));
      setShowLibrary(false);
      toast.success(`${row.name} aberto do sistema.`);

      if (result.moduleId !== moduleId) {
        navigate({ to: "/m/$module", params: { module: result.moduleId } });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível abrir o documento.");
    }
  }

  async function saveOpenedDocument() {
    if (!openedLocalFile || openedLocalFile.moduleId !== moduleId) return;
    const content = buildModuleJson(moduleId, workspace);
    const filename = openedLocalFile.name.endsWith(".json")
      ? openedLocalFile.name
      : `bf-flow-${moduleId}-${today()}.json`;

    if (!openedLocalFile.handle?.createWritable) {
      downloadText(filename, content, "application/json;charset=utf-8");
      toast.success("JSON baixado.");
      return;
    }

    try {
      const writable = await openedLocalFile.handle.createWritable();
      await writable.write(content);
      await writable.close();
      toast.success("Arquivo local atualizado.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel salvar o arquivo.");
    }
  }

  function currentModuleSavePayload(ws: WorkspaceState = workspace) {
    if (moduleId === "ddp") {
      return {
        code: ws.ddp.meta.codigo,
        title: ws.ddp.meta.titulo,
        description: ws.ddp.overview.objetivo || ws.ddp.overview.escopo,
        primaryProcessId: ws.ddp.macroprocess.processId || null,
        primaryProcessVersion: null,
      };
    }
    if (moduleId === "pop") {
      return {
        code: ws.pop.meta.codigo,
        title: ws.pop.meta.titulo,
        description: ws.pop.purpose.objetivo || ws.pop.meta.processo,
        primaryProcessId: null,
        primaryProcessVersion: null,
      };
    }
    return {
      code: ws.bpmn.codigo || "FLX",
      title: ws.bpmn.poolName || "Fluxograma",
      description: "",
      primaryProcessId: null,
      primaryProcessVersion: null,
    };
  }

  // Devolve o código atual do documento para o tipo do módulo (vazio = sem código).
  function currentModuleCode(ws: WorkspaceState = workspace): string {
    if (moduleId === "ddp") return ws.ddp.meta.codigo;
    if (moduleId === "pop") return ws.pop.meta.codigo;
    return ws.bpmn.codigo ?? "";
  }

  // Injeta um código no workspace conforme o tipo do módulo.
  function withModuleCode(ws: WorkspaceState, code: string): WorkspaceState {
    if (moduleId === "ddp")
      return { ...ws, ddp: { ...ws.ddp, meta: { ...ws.ddp.meta, codigo: code } } };
    if (moduleId === "pop")
      return { ...ws, pop: { ...ws.pop, meta: { ...ws.pop.meta, codigo: code } } };
    return { ...ws, bpmn: { ...ws.bpmn, codigo: code } };
  }

  function downloadImportTemplate() {
    if (moduleId === "bpmn") {
      toast.info("Modelo Excel textual está disponível para Mapeamento e POP por enquanto.");
      return;
    }
    const blob =
      moduleId === "ddp"
        ? buildDdpImportTemplate(workspace.ddp)
        : buildPopImportTemplate(workspace.pop);
    downloadBlob(`modelo-importacao-${moduleId}-${today()}.xlsx`, blob);
  }

  async function importSpreadsheet(file: File) {
    if (moduleId === "bpmn") {
      toast.info(
        "Importação textual por Excel está disponível para Mapeamento e POP por enquanto.",
      );
      return;
    }
    const sheets = await readXlsxSheets(file);
    setWorkspace((current) => {
      const next =
        moduleId === "ddp"
          ? { ...current, ddp: importDdpTextWorkbook(sheets, current.ddp) }
          : { ...current, pop: importPopTextWorkbook(sheets, current.pop) };
      window.localStorage.setItem(draftKey, JSON.stringify(next));
      return next;
    });
    setShowImport(false);
    toast.success(`${moduleDocLabel} importado do Excel.`);
  }

  async function handleSpreadsheetInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      await importSpreadsheet(file);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel importar o Excel.");
    }
  }

  async function persistSuggestedMappingProcesses(ws: WorkspaceState) {
    if (moduleId !== "ddp" || !pendingMappingProcesses.length) {
      return ws;
    }
    const referencedIds = new Set(
      ws.ddp.steps
        .flatMap((step) => [step.processId, ...step.substeps.map((substep) => substep.processId)])
        .filter(Boolean),
    );
    const pending = pendingMappingProcesses.filter((process) => referencedIds.has(process.id));
    if (!pending.length) return ws;

    const replacements = new Map<string, CreatedProcess>();
    for (const process of pending) {
      let code = process.code;
      const processRule = normalizeRule(codeSettings?.processo);
      const department = organizationCatalogs.departments.find(
        (item) => normalizeLabel(item.name) === normalizeLabel(process.department ?? ""),
      );
      const areaSigla = normalizeSigla(department?.sigla ?? process.department ?? "");
      if (processRule.mode === "auto" && !code && areaSigla) {
        code = (
          await reserveCodeFn({
            data: { organizationId: codeOrganizationId, type: "processo", areaSigla },
          })
        ).code;
      }
      const saved = isDemo
        ? { ...process, id: `demo-process-${crypto.randomUUID()}`, code }
        : ((await saveSuggestedProcess({
            data: {
              organizationId: codeOrganizationId,
              code,
              name: process.name,
              type: process.type,
              valueChainId: process.value_chain_id,
              parentProcessId:
                replacements.get(process.parent_process_id ?? "")?.id ?? process.parent_process_id,
              department: process.department,
              owner: process.owner,
              description: process.description,
              status: "Ativo",
            },
          })) as unknown as CreatedProcess);
      replacements.set(process.id, saved);
    }

    return {
      ...ws,
      ddp: {
        ...ws.ddp,
        steps: ws.ddp.steps.map((step) => ({
          ...step,
          processId: replacements.get(step.processId)?.id ?? step.processId,
          substeps: step.substeps.map((substep) => ({
            ...substep,
            processId: replacements.get(substep.processId)?.id ?? substep.processId,
          })),
        })),
      },
    };
  }

  async function persistMappingSystems(ws: WorkspaceState) {
    if (moduleId !== "ddp") return ws;

    const rows = ws.ddp.systems.filter((system) => system.nome.trim());
    if (!rows.length) return ws;

    const resolvedByName = new Map(
      organizationCatalogs.systems.map((system) => [normalizeLabel(system.name), system]),
    );
    const replacements = new Map<string, OrganizationSystem>();

    for (const system of rows) {
      const normalizedName = normalizeLabel(system.nome);
      const catalogSystem =
        organizationCatalogs.systems.find((item) => item.id === system.systemId) ??
        resolvedByName.get(normalizedName);

      if (catalogSystem) {
        replacements.set(system.id, catalogSystem);
        continue;
      }

      const saved: OrganizationSystem = isDemo
        ? {
            id: `demo-system-${crypto.randomUUID()}`,
            name: system.nome.trim(),
            modality: normalizeSystemModality(system.tipo),
            description: system.descricao.trim(),
          }
        : ((await saveSuggestedSystem({
            data: {
              organizationId: codeOrganizationId,
              name: system.nome.trim(),
              modality: normalizeSystemModality(system.tipo),
              description: system.descricao.trim() || null,
            },
          })) as unknown as OrganizationSystem);

      resolvedByName.set(normalizedName, saved);
      replacements.set(system.id, saved);
    }

    return {
      ...ws,
      ddp: {
        ...ws.ddp,
        systems: ws.ddp.systems.map((system) => {
          const resolved = replacements.get(system.id);
          return resolved
            ? {
                ...system,
                systemId: resolved.id,
                nome: resolved.name,
                tipo: normalizeSystemModality(resolved.modality),
                descricao: system.descricao || resolved.description || "",
              }
            : system;
        }),
      },
    };
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (moduleId === "ddp" && !workspace.ddp.macroprocess.processId) {
        throw new Error(
          "Selecione um processo previamente cadastrado antes de salvar o Mapeamento.",
        );
      }
      // Geração automática de código: reserva a sequência quando configurado e
      // o documento ainda não tem código.
      let workspaceToSave = withUppercaseModuleTitle(moduleId, workspace);
      if (moduleId === "ddp") {
        workspaceToSave = await persistSuggestedMappingProcesses(workspaceToSave);
        workspaceToSave = await persistMappingSystems(workspaceToSave);
        workspaceToSave = await syncDdpGapsToCatalog(workspaceToSave);
      }
      if (isAutoCodeModule && !currentModuleCode(workspaceToSave)) {
        const reserved = await reserveModuleCode();
        workspaceToSave = withModuleCode(workspaceToSave, reserved);
      }
      if (workspaceToSave !== workspace) {
        setWorkspace(workspaceToSave);
        window.localStorage.setItem(draftKey, JSON.stringify(workspaceToSave));
      }
      const fullComment = `[${moduleInfo.title}] ${
        comment || (moduleId === "ddp" ? "Mapeamento salvo" : "Documento salvo")
      }`;
      if (isDemo) return saveDemoWorkspaceVersion(JSON.stringify(workspaceToSave), fullComment);
      const payload = currentModuleSavePayload(workspaceToSave);
      const row = await saveCloudDocument({
        data: {
          organizationId: selectedOrganizationId,
          id: activeCloudDocument?.moduleId === moduleId ? activeCloudDocument.id : null,
          moduleId: moduleId as "ddp" | "pop" | "bpmn",
          code: payload.code,
          title: payload.title,
          description: payload.description,
          content: buildModuleJson(moduleId, workspaceToSave),
          comment: fullComment,
          primaryProcessId: payload.primaryProcessId,
          primaryProcessVersion: payload.primaryProcessVersion,
        },
      });
      return { version: row.current_version, document: row };
    },
    onSuccess: (result) => {
      const revisionVersion = Math.max(0, (result.version ?? 1) - 1);
      toast.success(
        moduleId === "ddp" ? "Mapeamento salvo." : `Documento salvo. Revisão v${revisionVersion}.`,
      );
      setShowSave(false);
      setComment("");
      setSavedNonce((n) => n + 1);
      if (moduleId === "ddp") {
        setPendingMappingProcesses([]);
        if (!isDemo) catalogsQ.refetch();
        if (!isDemo && "document" in result) {
          setActiveCloudDocument({
            id: result.document.id,
            moduleId,
            name: result.document.name,
          });
        }
        cloudDocsQ.refetch();
        if (!isDemo) wsQ.refetch();
        return;
      }
      if (isDemo) setDemoVersion(result.version);
      if (!isDemo && "document" in result) {
        setActiveCloudDocument({
          id: result.document.id,
          moduleId,
          name: result.document.name,
        });
        cloudDocsQ.refetch();
      }
      if (showHistory) versionsQ.refetch();
      if (!isDemo) wsQ.refetch();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const restoreMut = useMutation({
    mutationFn: async (versionId: string) => {
      const content = isDemo
        ? getDemoWorkspaceVersionContent(versionId)
        : activeCloudDocument?.id
          ? (await getCloudDocumentVersion({ data: { versionId } })).content
          : (await getVersion({ data: { versionId } })).content;
      if (!content) throw new Error("Versão sem conteúdo.");
      return content;
    },
    onSuccess: (content) => {
      const result = importWorkspaceFromJson(content, workspace, moduleId);
      setWorkspace(result.workspace);
      if (isDemo) restoreDemoWorkspaceState(content);
      window.localStorage.setItem(draftKey, JSON.stringify(result.workspace));
      setShowHistory(false);
      toast.success("Versão restaurada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function brandForDocumentModel(modelKey: DocumentModelRow["model_key"]): OrganizationBrand {
    const models = isDemo
      ? demoDocumentModels
      : ((documentModelsQ.data as DocumentModelRow[] | undefined) ?? DEFAULT_DOCUMENT_MODELS);
    const model = models.find((item) => item.model_key === modelKey);
    // A logo do documento usa o que foi configurado no modelo; se o modelo não
    // tiver logo, cai para a logo da organização; por fim, o nome como texto.
    const logo = model?.logo_data_url ?? organizationBrand.logo_data_url ?? null;
    return {
      name: organizationBrand.name || "BF Flow",
      logo_data_url: logo,
      word_header_color: model?.primary_color ?? organizationBrand.word_header_color ?? "1D1F23",
    };
  }

  function brandForDocumentPresentation(): OrganizationBrand {
    const documentBrand = brandForDocumentModel("pop-word");
    const mappingPresentationBrand = brandForDocumentModel("ddp-html");
    return {
      ...documentBrand,
      word_header_color: mappingPresentationBrand.word_header_color,
    };
  }

  async function addCauseToCatalog(gap: GapItem) {
    const title = plain(gap.causa);
    if (!title)
      throw new Error(
        "Informe o nome da oportunidade de melhoria antes de cadastrar na biblioteca.",
      );
    const existing = organizationCatalogs.causes.find(
      (item) => normalizeLabel(item.title) === normalizeLabel(title),
    );
    if (existing) return existing;
    const payload = {
      title,
      description: plain(gap.descricao) || null,
      impact: plain(gap.impacto) || null,
      action: plain(gap.acao) || null,
      priority: gap.prioridade || "Média",
    };
    if (isDemo) {
      const row = { id: id("cause"), ...payload };
      setDemoCatalogs((current) => ({ ...current, causes: [...current.causes, row] }));
      return row;
    }
    const row = await createSharedCause({
      data: { ...payload, organizationId: selectedOrganizationId },
    });
    await catalogsQ.refetch();
    return row;
  }

  async function syncDdpGapsToCatalog(source: WorkspaceState) {
    // Oportunidades registradas no mapeamento pertencem ao próprio mapeamento. Elas só
    // entram no catálogo quando o usuário as cadastra explicitamente como oportunidade avulsa.
    return source;
  }

  async function updateCauseCatalog(cause: OrganizationCause) {
    if (isDemo) {
      setDemoCatalogs((current) => ({
        ...current,
        causes: current.causes.map((item) => (item.id === cause.id ? cause : item)),
      }));
      return cause;
    }
    const row = await updateSharedCause({
      data: {
        id: cause.id,
        organizationId: selectedOrganizationId,
        title: cause.title,
        description: cause.description,
        impact: cause.impact,
        action: cause.action,
        priority: cause.priority,
        status: normalizeCauseStatus(cause.status),
        responsible: cause.responsible ?? null,
        process_id: cause.process_id ?? null,
        due_date: cause.due_date ?? null,
        comments: cause.comments ?? [],
      },
    });
    await catalogsQ.refetch();
    return row;
  }

  async function deleteCauseCatalog(causeId: string) {
    if (isDemo) {
      setDemoCatalogs((current) => ({
        ...current,
        causes: current.causes.filter((item) => item.id !== causeId),
      }));
      return;
    }
    await removeSharedCause({ data: { id: causeId, organizationId: selectedOrganizationId } });
    await catalogsQ.refetch();
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  function toggleTree(section: string) {
    setExpandedTree((current) => ({ ...current, [section]: !current[section] }));
  }

  function selectRailArea(area: RailArea) {
    if (area === "home") {
      navigate({ to: "/" });
      return;
    }
    if (area === "reports") {
      navigate({ to: "/", search: { area: "reports", view: "value-chain-report" } });
      return;
    }
    if (area === "value-chain") {
      navigate({ to: "/", search: { area: "value-chain", view: "value-chain-report" } });
      return;
    }
    setRailArea(area);
    setTreeOpen(true);
    if (area === "modules") {
      setContentMode("module");
      setExpandedTree((current) => ({ ...current, modules: true }));
    }
    if (area === "settings") {
      setContentMode("settings");
      setExpandedTree((current) => ({ ...current, settings: true }));
    }
  }

  function selectRegistration(view: ModuleRegistrationView) {
    navigate({ to: "/", search: { area: "modules", view } });
  }

  function selectSettings(view: ModuleSettingsView) {
    setRailArea("settings");
    setContentMode("settings");
    setSettingsView(view);
  }

  function openModuleBranch(targetModule: AteliamModule) {
    setRailArea("modules");
    setContentMode("module");
    setTreeOpen(true);
    setExpandedTree((current) => ({ ...current, modules: true, [targetModule]: true }));
    if (targetModule !== moduleId) {
      navigate({ to: "/m/$module", params: { module: targetModule }, search: {} });
    }
  }

  function openNewForModule(targetModule: AteliamModule) {
    if (targetModule !== moduleId) {
      navigate({ to: "/m/$module", params: { module: targetModule }, search: { view: "new" } });
      return;
    }
    openModuleBranch(targetModule);
    setModuleSurface("editor");
    newModuleDocument();
  }

  function openSearchForModule(targetModule: AteliamModule) {
    if (targetModule !== moduleId) {
      navigate({
        to: "/m/$module",
        params: { module: targetModule },
        search: { view: "consult" },
      });
      return;
    }
    openModuleBranch(targetModule);
    setModuleSurface("consult");
  }

  function openCauses(view: "new" | "consult" | "edit") {
    if (moduleId !== "ddp") {
      navigate({
        to: "/m/$module",
        params: { module: "ddp" },
        search: { view: `cause-${view}` as ModuleRouteView },
      });
      return;
    }
    openModuleBranch("ddp");
    setModuleSurface("editor");
    setDdpView("causes");
  }

  const savedDemoDocument = (() => {
    if (!isDemo) return null;
    const version = listDemoWorkspaceVersions().find((item) =>
      item.comment?.startsWith(`[${moduleInfo.title}]`),
    );
    if (!version) return null;
    return {
      id: `demo-saved:${version.id}`,
      workspace: parseWorkspace(version.content_snapshot),
      updatedAt: version.created_at,
    };
  })();

  const documentRows = buildModuleGridRows(
    moduleId,
    (cloudDocsQ.data as CloudModuleDocument[] | undefined) ?? [],
    organizationCatalogs.processes,
    savedDemoDocument,
    isDemo,
  ).map((row) => (statusOverrides[row.id] ? { ...row, status: statusOverrides[row.id] } : row));

  const mappingCauseRecords = useMemo<MappingCauseRecord[]>(() => {
    const documents = (cloudDocsQ.data as CloudModuleDocument[] | undefined) ?? [];
    return documents.flatMap((document) => {
      if (!document.content_inline) return [];
      try {
        const snapshot = parseWorkspace(document.content_inline);
        return snapshot.ddp.gaps.map((gap) => ({
          ...gap,
          status: normalizeCauseStatus(gap.status),
          recordId: `mapping:${document.id}:${gap.id}`,
          gapId: gap.id,
          documentId: document.id,
          mappingCode: snapshot.ddp.meta.codigo || "-",
          mappingTitle: snapshot.ddp.meta.titulo || document.name,
          updatedAt: document.updated_at,
        }));
      } catch {
        return [];
      }
    });
  }, [cloudDocsQ.data]);

  async function updateMappingCause(
    record: MappingCauseRecord,
    patch: { status?: string; prazo?: string; comentarios?: CauseComment[] },
  ) {
    const document = (cloudDocsQ.data as CloudModuleDocument[] | undefined)?.find(
      (item) => item.id === record.documentId,
    );
    if (!document?.content_inline) throw new Error("Mapeamento de origem não encontrado.");

    const snapshot = parseWorkspace(document.content_inline);
    const gapExists = snapshot.ddp.gaps.some((gap) => gap.id === record.gapId);
    if (!gapExists)
      throw new Error("A oportunidade de melhoria não existe mais no mapeamento de origem.");

    const nextStatus = normalizeCauseStatus(patch.status ?? record.status);
    const updatedWorkspace: WorkspaceState = {
      ...snapshot,
      ddp: {
        ...snapshot.ddp,
        gaps: snapshot.ddp.gaps.map((gap) =>
          gap.id === record.gapId
            ? {
                ...gap,
                status: nextStatus,
                prazo: patch.prazo ?? gap.prazo,
                comentarios: patch.comentarios ?? gap.comentarios,
              }
            : gap,
        ),
      },
    };
    const payload = currentModuleSavePayload(updatedWorkspace);
    await saveCloudDocument({
      data: {
        organizationId: selectedOrganizationId,
        id: document.id,
        moduleId: "ddp",
        code: payload.code,
        title: payload.title,
        description: payload.description,
        content: buildModuleJson("ddp", updatedWorkspace),
        comment: patch.comentarios
          ? "[Mapeamento] Acompanhamento da oportunidade de melhoria atualizado"
          : `[Mapeamento] Status da oportunidade alterado para ${nextStatus}`,
        primaryProcessId: payload.primaryProcessId,
        primaryProcessVersion: payload.primaryProcessVersion,
      },
    });

    if (activeCloudDocument?.id === document.id) {
      setWorkspace(updatedWorkspace);
      window.localStorage.setItem(draftKey, JSON.stringify(updatedWorkspace));
    }
    await cloudDocsQ.refetch();
  }

  async function createStandaloneCause(gap: GapItem, processId?: string | null) {
    if (isDemo) {
      const row: OrganizationCause = {
        id: id("cause"),
        title: gap.causa,
        description: gap.descricao || null,
        impact: gap.impacto || null,
        action: gap.acao || null,
        priority: gap.prioridade,
        status: normalizeCauseStatus(gap.status),
        responsible: gap.responsavel || null,
        process_id: processId || null,
        due_date: gap.prazo || null,
        comments: gap.comentarios,
      };
      setDemoCatalogs((current) => ({ ...current, causes: [...current.causes, row] }));
      return row;
    }
    const row = await createSharedCause({
      data: {
        organizationId: selectedOrganizationId,
        title: gap.causa,
        description: gap.descricao || null,
        impact: gap.impacto || null,
        action: gap.acao || null,
        priority: gap.prioridade,
        status: normalizeCauseStatus(gap.status),
        responsible: gap.responsavel || null,
        process_id: processId || null,
        due_date: gap.prazo || null,
        comments: gap.comentarios,
      },
    });
    await catalogsQ.refetch();
    return row as OrganizationCause;
  }

  async function openMappingFromCause(record: MappingCauseRecord) {
    const document = (cloudDocsQ.data as CloudModuleDocument[] | undefined)?.find(
      (item) => item.id === record.documentId,
    );
    if (!document) throw new Error("Mapeamento de origem não encontrado.");
    await openCloudModuleDocument(document);
  }

  async function changeRowStatus(row: ModuleGridRow, status: string) {
    if (row.status === status) return;

    if (isDemo || row.id.startsWith("demo-")) {
      setStatusOverrides((current) => ({ ...current, [row.id]: status }));
      toast.success(`Status atualizado para "${status}".`);
      return;
    }

    if (!selectedOrganizationId) {
      toast.error("Selecione uma organização antes de alterar o status.");
      return;
    }

    const cloudDocument = (cloudDocsQ.data as CloudModuleDocument[] | undefined)?.find(
      (document) => document.id === row.id,
    );
    if (!cloudDocument) {
      toast.error("Registro não encontrado para atualização.");
      return;
    }

    const document = await getCloudDocument({ data: { id: row.id } });
    if (!document.content_inline) {
      toast.error("Registro sem conteúdo salvo.");
      return;
    }

    const snapshot = parseWorkspace(document.content_inline);
    const updatedWorkspace: WorkspaceState =
      moduleId === "ddp"
        ? { ...snapshot, ddp: { ...snapshot.ddp, meta: { ...snapshot.ddp.meta, status } } }
        : moduleId === "pop"
          ? { ...snapshot, pop: { ...snapshot.pop, meta: { ...snapshot.pop.meta, status } } }
          : { ...snapshot, bpmn: { ...snapshot.bpmn, status } };
    const payload = currentModuleSavePayload(updatedWorkspace);

    await saveCloudDocument({
      data: {
        organizationId: selectedOrganizationId,
        id: row.id,
        moduleId,
        code: payload.code,
        title: payload.title,
        description: payload.description,
        content: buildModuleJson(moduleId, updatedWorkspace),
        comment: `[${moduleInfo.title}] Status alterado para ${status}`,
        primaryProcessId: payload.primaryProcessId,
        primaryProcessVersion: payload.primaryProcessVersion,
      },
    });

    if (activeCloudDocument?.id === row.id) {
      setWorkspace(updatedWorkspace);
      window.localStorage.setItem(draftKey, JSON.stringify(updatedWorkspace));
    }
    await cloudDocsQ.refetch();
    toast.success(`Status atualizado para "${status}".`);
  }

  async function editDocumentRow(row: ModuleGridRow) {
    if (row.id.startsWith("demo-doc:")) {
      const snapshot = resolveRowSnapshot(row);
      if (snapshot) {
        setWorkspace(snapshot);
        window.localStorage.setItem(draftKey, JSON.stringify(snapshot));
        setModuleSurface("editor");
        setModuleEditStarted(true);
      }
      return;
    }
    if (row.id.startsWith("demo-row:")) {
      toast.info('Registro de demonstração. Use "Novo" para criar um caso editável.');
      return;
    }
    if (row.id.startsWith("demo-saved:") && savedDemoDocument) {
      setWorkspace(savedDemoDocument.workspace);
      window.localStorage.setItem(draftKey, JSON.stringify(savedDemoDocument.workspace));
      setModuleSurface("editor");
      setModuleEditStarted(true);
      return;
    }
    const document = (cloudDocsQ.data as CloudModuleDocument[] | undefined)?.find(
      (item) => item.id === row.id,
    );
    if (document) await openCloudModuleDocument(document);
  }

  async function duplicateDocumentRow(row: ModuleGridRow) {
    if (moduleId !== "ddp") return;
    if (row.id.startsWith("demo-row:")) {
      toast.info("Registro de demonstracao. Use um registro salvo para duplicar.");
      return;
    }

    try {
      let snapshot = resolveRowSnapshot(row);
      if (!snapshot && !isDemo) {
        const document = await getCloudDocument({ data: { id: row.id } });
        if (!document.content_inline) throw new Error("Registro sem conteudo salvo.");
        snapshot = parseWorkspace(document.content_inline);
      }
      if (!snapshot) throw new Error("Registro salvo nao encontrado.");

      const duplicated: WorkspaceState = {
        ...snapshot,
        ddp: {
          ...snapshot.ddp,
          meta: {
            ...snapshot.ddp.meta,
            codigo: "",
            titulo: snapshot.ddp.meta.titulo
              ? `${snapshot.ddp.meta.titulo} - copia`
              : "Copia do mapeamento",
            data: today(),
            dataRelatorio: today(),
            status: "Em andamento",
          },
        },
      };
      setWorkspace(duplicated);
      setOpenedLocalFile(null);
      setActiveCloudDocument(null);
      setModuleSurface("editor");
      setModuleEditStarted(true);
      setDdpView("editor");
      window.localStorage.setItem(draftKey, JSON.stringify(duplicated));
      toast.success("Copia criada. Revise e salve para gerar um novo registro.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Nao foi possivel duplicar o mapeamento.",
      );
    }
  }

  async function deleteDocumentRows(ids: string[]) {
    try {
      if (ids.some((id) => id.startsWith("demo-saved:"))) {
        deleteDemoWorkspaceVersions(`[${moduleInfo.title}]`);
        const fresh = defaultWorkspace();
        setWorkspace((current) =>
          moduleId === "ddp"
            ? { ...current, ddp: fresh.ddp }
            : moduleId === "pop"
              ? { ...current, pop: fresh.pop }
              : { ...current, bpmn: fresh.bpmn },
        );
        setModuleEditStarted(moduleId === "bpmn");
        setDemoVersion(getDemoWorkspaceVersion());
      }
      if (!isDemo) {
        await Promise.all(
          ids.map((item) =>
            removeCloudDocument({ data: { organizationId: selectedOrganizationId, id: item } }),
          ),
        );
        await cloudDocsQ.refetch();
      }
      toast.success(ids.length > 1 ? "Registros excluídos." : "Registro excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o registro.");
    }
  }

  function resolveRowSnapshot(row: ModuleGridRow): WorkspaceState | null {
    if (row.id.startsWith("demo-doc:")) {
      return DEMO_DOCUMENTS[moduleId]?.find((doc) => doc.id === row.id)?.workspace ?? null;
    }
    if (row.id.startsWith("demo-saved:")) {
      return savedDemoDocument?.workspace ?? null;
    }
    const cloudDocument = (cloudDocsQ.data as CloudModuleDocument[] | undefined)?.find(
      (document) => document.id === row.id,
    );
    return cloudDocument?.content_inline ? parseWorkspace(cloudDocument.content_inline) : null;
  }

  // Abre uma visualização somente-leitura amigável do registro em nova aba, com todas
  // as informações preenchidas no formulário e seguindo a identidade visual.
  const responsivePresentationStyles = `
    @media (max-width: 980px) {
      html { scroll-padding-top: 168px; }
      body { overflow-x: hidden; }
      .shell {
        display: block !important;
        min-width: 0 !important;
      }
      .sidebar {
        position: sticky !important;
        top: 0 !important;
        z-index: 100 !important;
        display: grid !important;
        grid-template-columns: auto minmax(180px, 1fr) auto !important;
        grid-template-rows: auto auto !important;
        gap: 10px 14px !important;
        width: 100% !important;
        height: auto !important;
        min-height: 0 !important;
        padding: 12px 16px !important;
        border-right: 0 !important;
        border-bottom: 1px solid rgba(255, 255, 255, .2) !important;
      }
      .brand {
        grid-column: 1 !important;
        min-height: 42px !important;
      }
      .brand-logo {
        width: auto !important;
        max-width: 126px !important;
        max-height: 42px !important;
      }
      .doc-code {
        grid-column: 2 !important;
        align-self: center !important;
        min-width: 0 !important;
        padding: 8px 11px !important;
      }
      .doc-code span { font-size: 9px !important; }
      .doc-code strong {
        overflow: hidden !important;
        margin-top: 4px !important;
        font-size: 13px !important;
        text-overflow: ellipsis !important;
        white-space: nowrap !important;
      }
      .presentation-controls {
        grid-column: 3 !important;
        align-self: center !important;
        margin: 0 !important;
      }
      .nav {
        grid-column: 1 / -1 !important;
        grid-row: 2 !important;
        display: flex !important;
        gap: 6px !important;
        overflow-x: auto !important;
        padding: 2px 0 4px !important;
        scrollbar-width: thin;
        scroll-snap-type: x proximity;
      }
      .nav a {
        flex: 0 0 auto !important;
        min-height: 40px !important;
        padding: 10px 12px !important;
        font-size: 10px !important;
        white-space: nowrap !important;
        scroll-snap-align: start;
      }
      .content, .slide { min-width: 0 !important; }
      .slide {
        min-height: auto !important;
        padding: 38px 24px !important;
      }
      .cover {
        min-height: calc(100svh - 168px) !important;
        justify-content: flex-start !important;
        padding-top: 54px !important;
      }
      .cover h1 {
        max-width: 100% !important;
        font-size: clamp(38px, 8vw, 62px) !important;
        line-height: 1 !important;
      }
      .cover p { font-size: 18px !important; }
      .cover-hero,
      .cover-board,
      .cover-context,
      .cover-row,
      .flow-card,
      .text-panel,
      .mini-grid .field-grid {
        grid-template-columns: 1fr !important;
      }
      .cover-context { margin-top: 30px !important; }
      .cover-meta {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        width: 100% !important;
      }
      .section-head {
        gap: 14px !important;
        margin-bottom: 22px !important;
      }
      .section-head > span {
        width: 50px !important;
        height: 50px !important;
        border-radius: 12px !important;
        font-size: 21px !important;
      }
      .section-head h2 { font-size: clamp(28px, 6vw, 42px) !important; }
      .card-grid,
      .reference-grid {
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 250px), 1fr)) !important;
      }
      .table-wrap {
        max-width: 100% !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch;
      }
      th, td {
        min-width: 130px;
        padding: 12px !important;
      }
      .zoom-modal { padding: 12px !important; }
      .zoom-modal > img,
      .zoom-modal img {
        max-width: 96vw !important;
        max-height: 82svh !important;
      }
      .zoom-map { display: none !important; }
    }
    @media (max-width: 640px) {
      html { scroll-padding-top: 206px; }
      .sidebar {
        grid-template-columns: minmax(0, 1fr) auto !important;
        grid-template-rows: auto auto auto !important;
        padding: 10px 12px !important;
      }
      .brand { grid-column: 1 !important; }
      .presentation-controls { grid-column: 2 !important; }
      .doc-code {
        grid-column: 1 / -1 !important;
        grid-row: 2 !important;
      }
      .nav {
        grid-row: 3 !important;
        margin: 0 -2px !important;
      }
      .slide { padding: 30px 16px !important; }
      .cover {
        min-height: calc(100svh - 206px) !important;
        padding-top: 38px !important;
      }
      .cover h1 { font-size: clamp(34px, 11vw, 48px) !important; }
      .cover p { font-size: 16px !important; }
      .cover-code { min-width: 0 !important; }
      .cover-context,
      .cover-meta {
        grid-template-columns: 1fr !important;
      }
      .cover-line { padding: 17px 16px !important; }
      .section-head > span {
        width: 44px !important;
        height: 44px !important;
        font-size: 18px !important;
      }
      .section-head h2 { font-size: 29px !important; }
      .text-panel,
      .procedure-card,
      .list-card,
      .flow-card,
      .glossary-card {
        padding: 17px !important;
      }
      .procedure-card > header,
      .changes article {
        grid-template-columns: 1fr !important;
      }
      .image-card { margin-inline: 0 !important; }
    }
  `;

  function preparePresentationHtml(docHtml: string) {
    if (docHtml.includes("data-responsive-preview")) return docHtml;
    return docHtml.replace(
      /<\/head>/i,
      `<style data-responsive-preview>${responsivePresentationStyles}</style></head>`,
    );
  }

  function openPresentationHtml(buildHtml: () => string, blockedMessage: string) {
    // Reserve a aba durante o clique. Relatórios extensos gerados antes do
    // window.open podem perder a ativação e ser bloqueados pelo navegador.
    const opened = window.open("about:blank", "_blank");
    if (!opened) {
      toast.error(blockedMessage);
      return;
    }

    try {
      const docHtml = preparePresentationHtml(buildHtml());
      opened.document.open();
      opened.document.write(docHtml);
      opened.document.close();
      opened.opener = null;
    } catch (error) {
      console.error("Falha ao preparar a visualização do documento.", error);
      opened.close();
      const detail = error instanceof Error ? error.message : String(error);
      toast.error(
        detail
          ? `Não foi possível preparar a visualização: ${detail}`
          : "Não foi possível preparar a visualização deste registro.",
      );
    }
  }

  function viewDocumentRow(row: ModuleGridRow) {
    openPresentationHtml(() => {
      const snapshot = resolveRowSnapshot(row);
      if (snapshot && moduleId === "ddp") {
        const ddp = reconcileDdpWithCatalog(
          normalizeDdp(snapshot.ddp, defaultWorkspace().ddp),
          organizationCatalogs.systems,
        );
        return buildDdpPresentationHtml(
          ddp,
          brandForDocumentModel("ddp-html"),
          organizationCatalogs.processes,
        );
      }
      if (snapshot && moduleId === "pop") {
        return buildPopPresentationHtml(snapshot.pop, brandForDocumentPresentation());
      }
      return buildReadonlyPreviewHtml(moduleId, row, organizationBrand);
    }, "Habilite pop-ups para visualizar o registro.");
  }

  // Visualiza, em nova aba, o que está sendo preenchido agora no formulário,
  // na mesma modalidade somente-leitura disponível na consulta.
  function previewCurrentDdp() {
    openPresentationHtml(() => {
      const ddp = reconcileDdpWithCatalog(workspace.ddp, organizationCatalogs.systems);
      return buildDdpPresentationHtml(
        ddp,
        brandForDocumentModel("ddp-html"),
        organizationCatalogs.processes,
      );
    }, "Habilite pop-ups para visualizar o preenchimento.");
  }

  function previewCurrentPop() {
    openPresentationHtml(
      () => buildPopPresentationHtml(workspace.pop, brandForDocumentPresentation()),
      "Habilite pop-ups para visualizar o preenchimento.",
    );
  }

  async function exportDocumentRow(
    row: ModuleGridRow,
    format: "ddp-html" | "ddp-docx" | "ddp-presentation-doc" | "pop-docx" | "pop-presentation-doc",
  ) {
    if (row.id.startsWith("demo-row:")) {
      toast.info('Registro de demonstração. Crie um caso real em "Novo" para exportar.');
      return;
    }
    const snapshot = resolveRowSnapshot(row);
    if (!snapshot) throw new Error("Documento salvo não encontrado.");
    const ddp =
      moduleId === "ddp"
        ? reconcileDdpWithCatalog(snapshot.ddp, organizationCatalogs.systems)
        : snapshot.ddp;

    if (format === "ddp-html") {
      const filename = cleanFileName(
        `${ddp.meta.codigo}-${ddp.meta.titulo}-apresentacao-${stamp()}`,
      );
      downloadText(
        `${filename}.html`,
        buildDdpPresentationHtml(
          ddp,
          brandForDocumentModel("ddp-html"),
          organizationCatalogs.processes,
        ),
        "text/html;charset=utf-8",
      );
    } else if (format === "ddp-presentation-doc") {
      const filename = cleanFileName(`${ddp.meta.codigo}-${ddp.meta.titulo}-apresentacao`);
      downloadText(
        `${filename}.doc`,
        buildDdpPresentationHtml(
          ddp,
          brandForDocumentModel("ddp-html"),
          organizationCatalogs.processes,
        ),
        "application/msword;charset=utf-8",
      );
    } else if (format === "ddp-docx") {
      const filename = cleanFileName(`${ddp.meta.codigo}-${ddp.meta.titulo}`);
      downloadBlob(
        `${filename}.docx`,
        buildDdpDocx(ddp, brandForDocumentModel("ddp-word"), organizationCatalogs.processes),
      );
    } else if (format === "pop-presentation-doc") {
      const filename = cleanFileName(
        `${snapshot.pop.meta.codigo}-${snapshot.pop.meta.titulo}-apresentacao`,
      );
      downloadText(
        `${filename}.doc`,
        buildReadonlyPreviewHtml(moduleId, row, organizationBrand),
        "application/msword;charset=utf-8",
      );
    } else {
      const filename = cleanFileName(
        `${snapshot.pop.meta.codigo}-${snapshot.pop.meta.titulo}-v${snapshot.pop.meta.versao}`,
      );
      downloadBlob(
        `${filename}.docx`,
        buildPopDocxModern(snapshot.pop, brandForDocumentModel("pop-word")),
      );
    }
    toast.success(
      moduleId === "ddp"
        ? "Mapeamento exportado."
        : "Documento exportado a partir da versão salva.",
    );
  }

  const moduleMainContent =
    contentMode === "registrations" ? (
      <WorkspaceProcessRegistrations
        view={registrationView}
        organizationId={selectedOrganizationId}
        organizationName={organizationBrand.name}
        codeSettings={codeSettings}
        isDemo={isDemo}
      />
    ) : contentMode === "settings" ? (
      <ModuleSettingsPanel view={settingsView} organizationName={organizationBrand.name} />
    ) : moduleSurface === "consult" ? (
      <ModuleDocumentGrid
        moduleId={moduleId}
        rows={documentRows}
        loading={cloudDocsQ.isLoading && !isDemo}
        onEdit={editDocumentRow}
        onDelete={deleteDocumentRows}
        onExport={exportDocumentRow}
        onView={viewDocumentRow}
        onDuplicate={moduleId === "ddp" ? duplicateDocumentRow : undefined}
        onChangeStatus={changeRowStatus}
        initialQuery={search.filter}
      />
    ) : (
      <>
        {!loaded && !isDemo ? (
          <Panel>
            <div className="grid gap-4 p-2" role="status" aria-label="Carregando módulo">
              <div className="h-16 animate-pulse rounded-lg bg-muted" />
              <div className="grid gap-3 md:grid-cols-[220px_1fr]">
                <div className="hidden h-72 animate-pulse rounded-lg bg-muted/70 md:block" />
                <div className="grid gap-3">
                  <div className="h-32 animate-pulse rounded-lg bg-muted/70" />
                  <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
                  <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
                </div>
              </div>
              <span className="sr-only">Carregando conteúdo do módulo.</span>
            </div>
          </Panel>
        ) : null}
        {loaded && moduleId === "ddp" ? (
          ddpView === "causes" ? (
            <DdpCausesModuleV2
              mappingCauses={mappingCauseRecords}
              standaloneCauses={organizationCatalogs.causes}
              processes={organizationCatalogs.processes}
              loading={cloudDocsQ.isLoading || catalogsQ.isLoading}
              onCreateStandaloneCause={createStandaloneCause}
              onUpdateStandaloneCause={updateCauseCatalog}
              onDeleteStandaloneCause={deleteCauseCatalog}
              onUpdateMappingCause={updateMappingCause}
              onOpenMapping={openMappingFromCause}
              mode={
                search.view?.startsWith("cause-")
                  ? (search.view.slice(6) as "new" | "consult" | "edit")
                  : "consult"
              }
            />
          ) : !moduleEditStarted ? (
            <ModuleDocumentGrid
              moduleId={moduleId}
              rows={documentRows}
              loading={cloudDocsQ.isLoading && !isDemo}
              onEdit={editDocumentRow}
              onDelete={deleteDocumentRows}
              onExport={exportDocumentRow}
              onView={viewDocumentRow}
              onDuplicate={moduleId === "ddp" ? duplicateDocumentRow : undefined}
              onChangeStatus={changeRowStatus}
              initialQuery={search.filter}
            />
          ) : (
            <DdpModule
              data={workspace.ddp}
              catalogs={organizationCatalogs}
              userOptions={elaboratorOptions}
              currentElaborator={currentElaborator}
              update={(ddp) => updateWorkspace((current) => ({ ...current, ddp }))}
              onSave={() => setShowSave(true)}
              onPreview={previewCurrentDdp}
              saving={saveMut.isPending}
              savedNonce={savedNonce}
              organizationId={codeOrganizationId}
              isDemo={isDemo}
              codeSettings={codeSettings}
              onCatalogCreated={async () => {
                if (!isDemo) await catalogsQ.refetch();
              }}
              onProcessCreated={async (process) => {
                if (isDemo) {
                  setDemoCatalogs((current) => ({
                    ...current,
                    processes: [...current.processes, process as unknown as OrganizationProcess],
                  }));
                } else {
                  await catalogsQ.refetch();
                }
              }}
              onSuggestedProcessPrepared={(process) => {
                setPendingMappingProcesses((current) => [
                  ...current.filter((item) => item.id !== process.id),
                  process,
                ]);
              }}
            />
          )
        ) : null}
        {loaded && moduleId === "pop" ? (
          !moduleEditStarted ? (
            <ModuleDocumentGrid
              moduleId={moduleId}
              rows={documentRows}
              loading={cloudDocsQ.isLoading && !isDemo}
              onEdit={editDocumentRow}
              onDelete={deleteDocumentRows}
              onExport={exportDocumentRow}
              onView={viewDocumentRow}
              onDuplicate={moduleId === "ddp" ? duplicateDocumentRow : undefined}
              onChangeStatus={changeRowStatus}
              initialQuery={search.filter}
            />
          ) : (
            <PopModule
              data={workspace.pop}
              catalogs={organizationCatalogs}
              organizationId={codeOrganizationId}
              isDemo={isDemo}
              codeSettings={codeSettings}
              update={(pop) => updateWorkspace((current) => ({ ...current, pop }))}
              onCatalogCreated={async () => {
                if (!isDemo) await catalogsQ.refetch();
              }}
              onProcessCreated={async (process) => {
                if (isDemo) {
                  setDemoCatalogs((current) => ({
                    ...current,
                    processes: [...current.processes, process as unknown as OrganizationProcess],
                  }));
                } else {
                  await catalogsQ.refetch();
                }
              }}
              autoCode={isAutoCodeModule}
              codePreview={autoCodePreview}
              onSave={() => setShowSave(true)}
              onPreview={previewCurrentPop}
              saving={saveMut.isPending}
              savedNonce={savedNonce}
              isEditing={Boolean(
                activeCloudDocument || openedLocalFile || workspace.pop.meta.codigo,
              )}
            />
          )
        ) : null}
        {loaded && moduleId === "bpmn" ? (
          <BpmnModuleV2
            data={workspace.bpmn}
            catalogs={organizationCatalogs}
            organizationId={codeOrganizationId}
            isDemo={isDemo}
            codeSettings={codeSettings}
            update={(bpmn) => updateWorkspace((current) => ({ ...current, bpmn }))}
            onProcessCreated={async (process) => {
              if (isDemo) {
                setDemoCatalogs((current) => ({
                  ...current,
                  processes: [...current.processes, process as unknown as OrganizationProcess],
                }));
              } else {
                await catalogsQ.refetch();
              }
            }}
            autoCode={isAutoCodeModule}
            codePreview={autoCodePreview}
          />
        ) : null}
      </>
    );

  return (
    <div className="min-h-screen bg-background text-foreground" style={moduleGrayVars}>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/92 px-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => setTreeOpen((current) => !current)}
          className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title={treeOpen ? "Ocultar navegação" : "Mostrar navegação"}
        >
          <Menu className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="flex h-full items-center rounded-md transition-opacity hover:opacity-80"
          title="Ir para a página inicial"
          aria-label="Ir para a página inicial"
        >
          <BFFlowMark className="h-9" />
        </button>
        <div className="flex-1" />
        {isDemo && (
          <span className="hidden items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground sm:inline-flex">
            <FlaskConical className="h-3.5 w-3.5" />
            Teste local v{demoVersion}
          </span>
        )}
        {!isDemo && accessibleOrganizations.length ? (
          <select
            value={selectedOrganizationId ?? ""}
            onChange={(event) => {
              const nextId = event.target.value;
              setActiveOrganizationId(nextId);
              window.localStorage.setItem("ateliam-active-organization", nextId);
              setActiveCloudDocument(null);
            }}
            className="hidden h-9 max-w-[220px] rounded-md border border-border bg-background px-3 text-sm font-semibold text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/20 md:block"
            title="Organização ativa"
            aria-label="Organização ativa"
          >
            {accessibleOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        ) : null}
        <UserProfileMenu
          email={isDemo ? "analista.local@bfflow.local" : (meQ.data?.profile?.email ?? "")}
          organizationName={organizationBrand.name ?? "BF Flow"}
          profilePhoto={meQ.data?.profile?.avatar_data_url ?? ""}
          isDemo={isDemo}
          onProfileUpdated={() => meQ.refetch()}
          onSignOut={signOut}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={handleFileInput}
        />
        <input
          ref={spreadsheetInputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={handleSpreadsheetInput}
        />
      </header>

      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[52px_minmax(0,1fr)]">
        <WorkspaceRail activeArea={railArea} onSelect={selectRailArea} />

        <div
          className={`relative min-w-0 transition-[grid-template-columns] duration-200 lg:grid ${
            treeOpen ? "lg:grid-cols-[320px_minmax(0,1fr)]" : "lg:grid-cols-[0_minmax(0,1fr)]"
          }`}
        >
          {treeOpen ? (
            <button
              type="button"
              aria-label="Fechar navegação"
              onClick={() => setTreeOpen(false)}
              className="fixed bottom-0 left-[372px] right-0 top-14 z-20 bg-foreground/10 backdrop-blur-[1px] lg:hidden"
            />
          ) : null}
          <aside
            className={`fixed bottom-0 left-[52px] top-14 z-30 min-h-0 w-[min(320px,calc(100vw-52px))] overflow-hidden border-r border-border bg-card shadow-xl lg:sticky lg:top-14 lg:h-[calc(100vh-3.5rem)] lg:self-start lg:w-auto lg:bg-card/58 lg:shadow-none ${
              treeOpen ? "block" : "hidden lg:block"
            }`}
          >
            <div className="flex h-full flex-col">
              <div className="border-b border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    navegação
                  </div>
                  <button
                    type="button"
                    onClick={() => setTreeOpen(false)}
                    className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                    title="Recolher painel"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  {railArea === "home" ? (
                    <Home className="h-4 w-4 text-foreground" />
                  ) : railArea === "modules" ? (
                    <GitBranch className="h-4 w-4 text-foreground" />
                  ) : (
                    <Settings className="h-4 w-4 text-foreground" />
                  )}
                  <div className="truncate font-display text-base font-bold">
                    {railArea === "home"
                      ? "Home"
                      : railArea === "modules"
                        ? "Processos"
                        : "Configurações"}
                  </div>
                  <div className="mt-2 flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{organizationBrand.name ?? "BF Flow"}</span>
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {railArea === "modules" ? (
                  <WorkspaceModulesTree
                    expanded={expandedTree}
                    onToggle={toggleTree}
                    isActive={(target) =>
                      target.kind === "module-root"
                        ? moduleId === target.moduleId && contentMode === "module"
                        : target.kind === "module-task"
                          ? moduleId === target.moduleId &&
                            contentMode === "module" &&
                            (target.task === "consult"
                              ? moduleSurface === "consult"
                              : target.task === "new"
                                ? moduleSurface === "editor" && ddpView === "editor"
                                : target.task === "cause-new"
                                  ? ddpView === "causes" && search.view === "cause-new"
                                  : ddpView === "causes")
                          : target.kind === "registrations-root"
                            ? contentMode === "registrations"
                            : target.kind === "registration"
                              ? contentMode === "registrations" && registrationView === target.view
                              : false
                    }
                    onNavigate={(target) => {
                      if (target.kind === "module-root") {
                        openModuleBranch(target.moduleId);
                      } else if (target.kind === "module-task") {
                        if (target.task === "new") openNewForModule(target.moduleId);
                        else if (target.task === "consult") openSearchForModule(target.moduleId);
                        else if (target.task === "cause-new") openCauses("new");
                        else openCauses("consult");
                      } else if (target.kind === "registrations-root") {
                        toggleTree("registrations");
                      } else {
                        selectRegistration(target.view as ModuleRegistrationView);
                      }
                    }}
                  />
                ) : null}

                {railArea === "settings" ? (
                  <div className="grid gap-1 animate-[slideDown_0.18s_ease-out]">
                    {/* Mesmos itens/ícones da página inicial (componentes compartilhados). */}
                    <ModuleTreeButton
                      onClick={() =>
                        navigate({ to: "/", search: { area: "settings", view: "users" } })
                      }
                    >
                      <Users className="h-4 w-4" /> Usuários
                    </ModuleTreeButton>
                    <ModuleTreeButton
                      onClick={() =>
                        navigate({ to: "/", search: { area: "settings", view: "organizations" } })
                      }
                    >
                      <Building2 className="h-4 w-4" /> Organizações
                    </ModuleTreeButton>
                    <ModuleTreeButton
                      active={settingsView === "theme"}
                      onClick={() => selectSettings("theme")}
                    >
                      <Palette className="h-4 w-4" /> Tema
                    </ModuleTreeButton>
                    <ModuleTreeButton onClick={signOut}>
                      <LogOut className="h-4 w-4" /> Sair
                    </ModuleTreeButton>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>

          <main className="min-w-0 p-3 sm:p-5">
            <section className="min-w-0">
              {saveMut.isError ? (
                <div
                  role="alert"
                  className="mb-3 flex flex-wrap items-start justify-between gap-3 rounded-lg border border-destructive/35 bg-destructive/5 px-4 py-3 text-sm text-foreground"
                >
                  <div className="flex min-w-0 gap-2.5">
                    <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                    <div>
                      <div className="font-bold">Não foi possível salvar</div>
                      <p className="mt-0.5 text-muted-foreground">
                        {saveMut.error instanceof Error
                          ? saveMut.error.message
                          : "Revise os campos e tente novamente. O preenchimento foi preservado."}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => saveMut.reset()}
                    className="rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:bg-muted"
                  >
                    Fechar aviso
                  </button>
                </div>
              ) : null}
              {moduleMainContent}
            </section>
          </main>
        </div>
      </div>

      {showImport && (
        <Modal
          title={`Importar texto do ${moduleDocLabel}`}
          subtitle="Use a planilha modelo para trazer preenchimentos textuais. Imagens entram direto no editor."
          onClose={() => setShowImport(false)}
        >
          <div className="grid gap-3">
            <button
              onClick={downloadImportTemplate}
              className="flex items-center justify-between rounded-lg border border-[#d2d2d7] bg-white p-4 text-left hover:bg-[#f5f5f7]"
            >
              <span>
                <strong className="block text-sm text-[#1d1d1f]">
                  Arquivo modelo de importação textual
                </strong>
                <span className="text-xs text-[#6e6e73]">
                  Baixa um Excel com as abas e colunas corretas para {moduleDocLabel}.
                </span>
              </span>
              <Download className="h-4 w-4 text-[#3f3f46]" />
            </button>
            <button
              onClick={() => spreadsheetInputRef.current?.click()}
              className="flex items-center justify-between rounded-lg border border-[#d2d2d7] bg-white p-4 text-left hover:bg-[#f5f5f7]"
            >
              <span>
                <strong className="block text-sm text-[#1d1d1f]">Buscar arquivo preenchido</strong>
                <span className="text-xs text-[#6e6e73]">
                  Importa o Excel preenchido e atualiza os campos do módulo.
                </span>
              </span>
              <Upload className="h-4 w-4 text-[#3f3f46]" />
            </button>
          </div>
        </Modal>
      )}

      {showSave && (
        <Modal
          title={moduleId === "ddp" ? "Salvar mapeamento" : "Salvar documento"}
          subtitle={
            moduleId === "ddp"
              ? "Grava o preenchimento como registro de mapeamento."
              : "Grava o preenchimento da documentação e mantém o histórico."
          }
          onClose={() => setShowSave(false)}
        >
          <textarea
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={
              moduleId === "ddp"
                ? "Observação opcional sobre o registro"
                : "Observação opcional sobre o documento"
            }
            className="mb-4 w-full rounded-lg border border-[#d2d2d7] bg-white px-3 py-2 text-sm outline-none focus:border-[#3f3f46]"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowSave(false)}
              className="rounded-lg px-4 py-2 text-sm hover:bg-[#f5f5f7]"
            >
              Cancelar
            </button>
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="rounded-lg bg-[#3f3f46] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {saveMut.isPending ? "Salvando..." : "Salvar agora"}
            </button>
          </div>
        </Modal>
      )}

      {showHistory && moduleId !== "ddp" && (
        <Modal
          title="Histórico"
          subtitle="Restaure uma versão salva quando precisar."
          onClose={() => setShowHistory(false)}
        >
          {versionsQ.isLoading ? (
            <div className="py-8 text-center text-sm text-[#6e6e73]">Carregando...</div>
          ) : null}
          {!versionsQ.isLoading && !versionsQ.data?.length ? (
            <div className="py-8 text-center text-sm text-[#6e6e73]">
              Nenhuma versão salva ainda.
            </div>
          ) : null}
          <div className="grid max-h-[55vh] gap-2 overflow-auto">
            {(versionsQ.data as VersionRow[] | undefined)?.map((version) => (
              <div
                key={version.id}
                className="flex items-center gap-3 rounded-lg border border-[#d2d2d7] bg-white p-3"
              >
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#f3f4f6] font-bold text-[#3f3f46]">
                  v{version.version_number}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">
                    {version.comment || "Sem comentário"}
                  </div>
                  <div className="text-xs text-[#6e6e73]">
                    {formatDateTimeBr(version.created_at)}
                  </div>
                </div>
                <button
                  onClick={() => restoreMut.mutate(version.id)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#d2d2d7] px-3 py-2 text-xs font-semibold hover:bg-[#f5f5f7]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {showLibrary && (
        <Modal
          title={`Buscar ${moduleDocLabel}`}
          subtitle={`Documentos de ${moduleDocLabel} salvos no sistema para esta organização.`}
          onClose={() => setShowLibrary(false)}
        >
          {isDemo ? (
            <div className="py-8 text-center text-sm text-[#6e6e73]">
              No modo de teste local, salve versões locais ou abra um JSON. No ambiente conectado, a
              busca consulta o Supabase da organização.
            </div>
          ) : null}
          {!isDemo && cloudDocsQ.isLoading ? (
            <div className="py-8 text-center text-sm text-[#6e6e73]">Carregando documentos...</div>
          ) : null}
          {!isDemo && !cloudDocsQ.isLoading && !cloudDocsQ.data?.length ? (
            <div className="py-8 text-center text-sm text-[#6e6e73]">
              Nenhum {moduleDocLabel} salvo no sistema ainda.
            </div>
          ) : null}
          <div className="grid max-h-[55vh] gap-2 overflow-auto">
            {(cloudDocsQ.data as CloudModuleDocument[] | undefined)?.map((document) => (
              <div
                key={document.id}
                className="grid gap-3 rounded-lg border border-[#d2d2d7] bg-white p-3 md:grid-cols-[82px_minmax(0,1fr)_auto]"
              >
                <div className="grid h-12 place-items-center rounded-lg bg-[#f3f4f6] text-xs font-black uppercase tracking-[0.16em] text-[#3f3f46]">
                  {moduleId === "ddp" ? "MAP" : `v${document.current_version}`}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-[#1d1d1f]">{document.name}</div>
                  <div className="mt-1 truncate text-xs text-[#6e6e73]">
                    Atualizado em {formatDateTimeBr(document.updated_at)}
                  </div>
                </div>
                <button
                  onClick={() => openCloudModuleDocument(document)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#d2d2d7] px-3 py-2 text-sm font-semibold text-[#3f3f46] hover:bg-[#f5f5f7]"
                >
                  <FolderOpen className="h-4 w-4" />
                  Abrir
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
function ModuleSettingsPanel({
  view,
  organizationName,
}: {
  view: ModuleSettingsView;
  organizationName: string;
}) {
  const copy: Record<string, { eyebrow: string; title: string; text: string }> = {
    appearance: {
      eyebrow: "configurações · aparência",
      title: "Aparência",
      text: `Ajuste a experiência visual do workspace para a organização ${organizationName}.`,
    },
    theme: {
      eyebrow: "configurações · aparência",
      title: "Tema",
      text: "Controle tema claro, escuro e preferência automática do navegador.",
    },
    preferences: {
      eyebrow: "configurações · aparência",
      title: "Preferências",
      text: "Defina comportamento padrão, densidade visual e preferências gerais do workspace.",
    },
    "visual-identity": {
      eyebrow: "configurações · identidade visual",
      title: "Identidade visual",
      text: "Configure logo, cores institucionais e personalização dos cabeçalhos dos documentos exportados.",
    },
    integrations: {
      eyebrow: "configurações · integrações",
      title: "Integrações",
      text: "Gerencie conexões do sistema, serviços externos e integrações técnicas.",
    },
    "local-environment": {
      eyebrow: "configurações · ambiente local",
      title: "Ambiente de teste/local",
      text: "Controle recursos locais de teste sem expor ações técnicas na navegação dos módulos.",
    },
    profile: {
      eyebrow: "configurações · perfil",
      title: "Perfil",
      text: "Use o avatar no canto superior direito para adicionar sua foto, trocar a senha ou sair do sistema.",
    },
  };
  const item = copy[view];
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
        {item.eyebrow}
      </div>
      <h1 className="mt-3 font-display text-3xl font-bold text-foreground">{item.title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{item.text}</p>
      {view === "theme" ? (
        <div className="mt-6 max-w-xl">
          <ThemeControl />
        </div>
      ) : null}
    </section>
  );
}

type ModuleGridRow = {
  id: string;
  code: string;
  name: string;
  type: string;
  modalidade: string;
  process: string;
  area: string;
  owner: string;
  responsible: string;
  status: string;
  updatedAt: string;
};

function uppercaseProcessName(value: string) {
  return value === "-" ? value : value.trim().toLocaleUpperCase("pt-BR");
}

function moduleGridRowFromWorkspace(
  moduleId: AteliamModule,
  workspace: WorkspaceState,
  base: Pick<ModuleGridRow, "id" | "status" | "updatedAt">,
): ModuleGridRow {
  if (moduleId === "ddp") {
    return {
      ...base,
      status: workspace.ddp.meta.status || base.status,
      code: workspace.ddp.meta.codigo || "-",
      name: workspace.ddp.meta.titulo || "Mapeamento sem título",
      type: "Mapeamento",
      modalidade: workspace.ddp.meta.modalidade || "AS IS",
      process: uppercaseProcessName(
        workspace.ddp.macroprocess.titulo || workspace.ddp.legacy?.processName?.toString() || "-",
      ),
      area: workspace.ddp.legacy?.processArea?.toString() || workspace.ddp.meta.area || "-",
      owner:
        workspace.ddp.legacy?.processOwner?.toString() ||
        workspace.ddp.overview.donoProcesso ||
        "-",
      responsible: workspace.ddp.meta.elaborador || "-",
    };
  }
  if (moduleId === "pop") {
    return {
      ...base,
      status: workspace.pop.meta.status || base.status,
      code: workspace.pop.meta.codigo || "-",
      name: workspace.pop.meta.titulo || "Documento sem título",
      type: workspace.pop.meta.tipo || "Documento",
      modalidade: "-",
      process: uppercaseProcessName(workspace.pop.meta.processo || "-"),
      area: workspace.pop.meta.area || "-",
      owner: "-",
      responsible: workspace.pop.meta.elaboracao || workspace.pop.meta.aprovacao || "-",
    };
  }
  return {
    ...base,
    status: workspace.bpmn.status || base.status,
    code: "FLX",
    name: workspace.bpmn.poolName || "Fluxograma sem título",
    type: "Fluxo de atividades",
    modalidade: "-",
    process: uppercaseProcessName(workspace.bpmn.poolName || "-"),
    area: "-",
    owner: "-",
    responsible: workspace.bpmn.lanes.filter(Boolean).join(" / ") || "-",
  };
}

// Casos fictícios pré-preenchidos para o modo demo, para que as telas de
// "Consultar registros" tenham volume suficiente para testes robustos.
// Tupla: [code, name, process, area, owner, responsible, status, updatedAt]
type DemoRowTuple = [string, string, string, string, string, string, string, string];
const DEMO_MODULE_ROW_DATA: Record<AteliamModule, DemoRowTuple[]> = {
  ddp: [
    [
      "MAP.PMO.001",
      "Mapeamento — Planejamento Estratégico",
      "Planejamento Estratégico",
      "Processos & Qualidade",
      "Aline Ferreira",
      "Aline Ferreira",
      "Aprovado",
      "2026-05-12",
    ],
    [
      "MAP.PMO.002",
      "Mapeamento — Gestão de Indicadores",
      "Gestão de Indicadores e Desempenho",
      "Processos & Qualidade",
      "Aline Ferreira",
      "Bruno Cardoso",
      "Ativo",
      "2026-06-02",
    ],
    [
      "MAP.RH.001",
      "Mapeamento — Recrutamento e Seleção",
      "Recrutamento e Seleção",
      "Recursos Humanos",
      "Juliana Castro",
      "Juliana Castro",
      "Em revisão",
      "2026-06-18",
    ],
    [
      "MAP.RH.002",
      "Mapeamento — Integração e Onboarding",
      "Integração e Onboarding",
      "Recursos Humanos",
      "Juliana Castro",
      "Patrícia Lima",
      "Ativo",
      "2026-04-27",
    ],
    [
      "MAP.TI.001",
      "Mapeamento — Gestão de Demandas de TI",
      "Gestão de Demandas de TI",
      "Tecnologia da Informação",
      "Carlos Menezes",
      "Carlos Menezes",
      "Aprovado",
      "2026-05-30",
    ],
    [
      "MAP.TI.002",
      "Mapeamento — Segurança da Informação",
      "Gestão de Segurança da Informação",
      "Tecnologia da Informação",
      "Carlos Menezes",
      "Carlos Menezes",
      "Rascunho",
      "2026-06-21",
    ],
    [
      "MAP.COM.001",
      "Mapeamento — Prospecção e Leads",
      "Prospecção e Geração de Leads",
      "Comercial & Vendas",
      "Rafael Souza",
      "Rafael Souza",
      "Ativo",
      "2026-06-09",
    ],
    [
      "MAP.OPE.001",
      "Mapeamento — Planejamento da Produção",
      "Planejamento da Produção",
      "Operações",
      "Patrícia Lima",
      "Patrícia Lima",
      "Em revisão",
      "2026-06-15",
    ],
    [
      "MAP.FIN.001",
      "Mapeamento — Contas a Receber",
      "Contas a Receber",
      "Financeiro & Controladoria",
      "Bruno Cardoso",
      "Bruno Cardoso",
      "Aprovado",
      "2026-03-19",
    ],
  ],
  pop: [
    [
      "POP.RH.001",
      "POP — Admissão de Colaborador",
      "Recrutamento e Seleção",
      "Recursos Humanos",
      "-",
      "Juliana Castro",
      "Aprovado",
      "2026-05-04",
    ],
    [
      "POP.RH.002",
      "POP — Desligamento de Colaborador",
      "Avaliação de Desempenho",
      "Recursos Humanos",
      "-",
      "Juliana Castro",
      "Ativo",
      "2026-06-01",
    ],
    [
      "IT.TI.001",
      "IT — Concessão de Acessos",
      "Gestão de Segurança da Informação",
      "Tecnologia da Informação",
      "-",
      "Carlos Menezes",
      "Aprovado",
      "2026-05-22",
    ],
    [
      "IT.TI.002",
      "IT — Rotina de Backup",
      "Gestão de Demandas de TI",
      "Tecnologia da Informação",
      "-",
      "Carlos Menezes",
      "Em revisão",
      "2026-06-17",
    ],
    [
      "POP.FIN.001",
      "POP — Conciliação Bancária",
      "Contas a Receber",
      "Financeiro & Controladoria",
      "-",
      "Bruno Cardoso",
      "Ativo",
      "2026-04-30",
    ],
    [
      "POP.FIN.002",
      "POP — Aprovação de Pagamentos",
      "Contas a Pagar",
      "Financeiro & Controladoria",
      "-",
      "Bruno Cardoso",
      "Rascunho",
      "2026-06-20",
    ],
    [
      "POP.OPE.001",
      "POP — Inspeção de Qualidade",
      "Controle de Qualidade na Produção",
      "Operações",
      "-",
      "Patrícia Lima",
      "Aprovado",
      "2026-05-15",
    ],
    [
      "POP.LOG.001",
      "POP — Recebimento de Mercadorias",
      "Logística & Supply Chain",
      "Logística & Supply Chain",
      "-",
      "Marcos Oliveira",
      "Ativo",
      "2026-06-07",
    ],
  ],
  bpmn: [
    [
      "FLX.COM.001",
      "Fluxograma — Ciclo de Vendas",
      "Comercialização & Vendas",
      "Comercial & Vendas",
      "-",
      "Rafael Souza",
      "Aprovado",
      "2026-05-18",
    ],
    [
      "FLX.OPE.001",
      "Fluxograma — Ordem de Produção",
      "Produção & Entrega",
      "Operações",
      "-",
      "Patrícia Lima",
      "Ativo",
      "2026-06-03",
    ],
    [
      "FLX.FIN.001",
      "Fluxograma — Contas a Pagar",
      "Gestão Financeira",
      "Financeiro & Controladoria",
      "-",
      "Bruno Cardoso",
      "Em revisão",
      "2026-06-19",
    ],
    [
      "FLX.RH.001",
      "Fluxograma — Onboarding",
      "Gestão de Pessoas",
      "Recursos Humanos",
      "-",
      "Juliana Castro",
      "Aprovado",
      "2026-04-25",
    ],
    [
      "FLX.LOG.001",
      "Fluxograma — Expedição",
      "Logística & Supply Chain",
      "Logística & Supply Chain",
      "-",
      "Marcos Oliveira",
      "Rascunho",
      "2026-06-22",
    ],
  ],
};

function buildDemoModuleRows(moduleId: AteliamModule): ModuleGridRow[] {
  const tuples = DEMO_MODULE_ROW_DATA[moduleId] ?? [];
  const typeLabel =
    moduleId === "ddp" ? "Mapeamento" : moduleId === "pop" ? "Documento" : "Fluxo de atividades";
  return tuples.map(([code, name, process, area, owner, responsible, status, updatedAt]) => ({
    id: `demo-row:${moduleId}:${code}`,
    code,
    name,
    type: typeLabel,
    modalidade: moduleId === "ddp" ? "AS IS" : "-",
    process,
    area,
    owner,
    responsible,
    status,
    updatedAt,
  }));
}

function buildModuleGridRows(
  moduleId: AteliamModule,
  documents: CloudModuleDocument[],
  processes: OrganizationProcess[],
  savedDemoDocument: {
    id: string;
    workspace: WorkspaceState;
    updatedAt: string;
  } | null,
  isDemo: boolean,
) {
  const cloudRows = documents.map((document) => {
    const snapshot = parseWorkspace(document.content_inline);
    const row = moduleGridRowFromWorkspace(moduleId, snapshot, {
      id: document.id,
      status: "Ativo",
      updatedAt: document.updated_at,
    });
    const registeredProcess = document.primary_process_id
      ? processes.find((process) => process.id === document.primary_process_id)
      : null;
    return {
      ...row,
      process: uppercaseProcessName(registeredProcess?.name || row.process),
    };
  });
  if (cloudRows.length) return cloudRows;
  if (isDemo) {
    // Documentos de demonstração reais (preenchidos e encadeados ao registry).
    const realDocs = DEMO_DOCUMENTS[moduleId] ?? [];
    const realRows = realDocs.map((doc) =>
      moduleGridRowFromWorkspace(moduleId, doc.workspace, {
        id: doc.id,
        status: doc.status,
        updatedAt: doc.updatedAt,
      }),
    );
    // Para módulos sem snapshots reais (ex.: fluxograma), mantém os cards de metadados.
    const fallbackRows = realRows.length ? [] : buildDemoModuleRows(moduleId);
    const savedRows = savedDemoDocument
      ? [
          moduleGridRowFromWorkspace(moduleId, savedDemoDocument.workspace, {
            id: savedDemoDocument.id,
            status: "Salvo",
            updatedAt: savedDemoDocument.updatedAt,
          }),
        ]
      : [];
    return [...savedRows, ...realRows, ...fallbackRows];
  }
  if (!savedDemoDocument) return [];
  return [
    moduleGridRowFromWorkspace(moduleId, savedDemoDocument.workspace, {
      id: savedDemoDocument.id,
      status: "Salvo",
      updatedAt: savedDemoDocument.updatedAt,
    }),
  ];
}

type ExportFormat =
  | "ddp-html"
  | "ddp-docx"
  | "ddp-presentation-doc"
  | "pop-docx"
  | "pop-presentation-doc";

const MODULE_STATUS_OPTIONS = ["Em andamento", "Em revisão", "Aprovado", "Concluído"];
type ModuleGridSortDir = "asc" | "desc";
type ModuleGridColumn = keyof Pick<
  ModuleGridRow,
  | "code"
  | "name"
  | "type"
  | "modalidade"
  | "process"
  | "area"
  | "owner"
  | "responsible"
  | "status"
  | "updatedAt"
>;

function ModuleSortGlyph({ active, dir }: { active: boolean; dir: ModuleGridSortDir }) {
  if (!active) return <ArrowDownUp className="h-3 w-3 opacity-35" aria-hidden="true" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-[var(--gold)]" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3 text-[var(--gold)]" aria-hidden="true" />
  );
}

function compareModuleGridRows(
  a: ModuleGridRow,
  b: ModuleGridRow,
  field: ModuleGridColumn,
  dir: ModuleGridSortDir,
) {
  const sign = dir === "asc" ? 1 : -1;
  if (field === "updatedAt") {
    return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * sign;
  }
  return (
    String(a[field] ?? "").localeCompare(String(b[field] ?? ""), "pt-BR", {
      numeric: true,
      sensitivity: "base",
    }) * sign
  );
}

function moduleStatusStyle(status: string): CSSProperties {
  const normalized = normalizeLabel(status);
  if (normalized.includes("concluido")) {
    return { backgroundColor: "#DFF5E6", color: "#147A3A", borderColor: "#A8E5BA" };
  }
  if (normalized.includes("aprovado")) {
    return { backgroundColor: "#E6F4FF", color: "#145DA0", borderColor: "#B9DEFF" };
  }
  if (normalized.includes("revisao")) {
    return { backgroundColor: "#FFF3D8", color: "#9A5A00", borderColor: "#F3D18A" };
  }
  if (
    normalized.includes("andamento") ||
    normalized.includes("ativo") ||
    normalized.includes("salvo")
  ) {
    return {
      backgroundColor: "color-mix(in oklab, var(--gold) 14%, var(--card))",
      color: "var(--gold)",
      borderColor: "color-mix(in oklab, var(--gold) 35%, var(--border))",
    };
  }
  return {
    backgroundColor: "var(--muted)",
    color: "var(--muted-foreground)",
    borderColor: "var(--border)",
  };
}

function ModuleStatusSummary({ rows }: { rows: ModuleGridRow[] }) {
  const counts = MODULE_STATUS_OPTIONS.map((status) => ({
    status,
    count: rows.filter((row) => normalizeLabel(row.status) === normalizeLabel(status)).length,
  }));
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {counts.map((item) => (
        <div
          key={item.status}
          className="flex items-center justify-between rounded-lg border px-3 py-2"
          style={moduleStatusStyle(item.status)}
        >
          <span className="text-xs font-semibold">{item.status}</span>
          <span className="font-data text-lg font-bold">{item.count}</span>
        </div>
      ))}
    </div>
  );
}

function ModuleDocumentGrid({
  moduleId,
  rows,
  loading,
  onEdit,
  onDelete,
  onExport,
  onView,
  onDuplicate,
  onChangeStatus,
  initialQuery = "",
}: {
  moduleId: AteliamModule;
  rows: ModuleGridRow[];
  loading: boolean;
  onEdit: (row: ModuleGridRow) => void | Promise<void>;
  onDelete: (ids: string[]) => void | Promise<void>;
  onExport: (row: ModuleGridRow, format: ExportFormat) => void | Promise<void>;
  onView: (row: ModuleGridRow) => void;
  onDuplicate?: (row: ModuleGridRow) => void | Promise<void>;
  onChangeStatus: (row: ModuleGridRow, status: string) => void | Promise<void>;
  initialQuery?: string;
}) {
  const tablePreferenceKey = `bf-flow-table-${moduleId}`;
  const [query, setQuery] = useState(() => {
    if (initialQuery) return initialQuery;
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(`${tablePreferenceKey}-query`) ?? "";
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [sortField, setSortField] = useState<ModuleGridColumn>(() => {
    if (typeof window === "undefined") return "updatedAt";
    return (
      (window.localStorage.getItem(`${tablePreferenceKey}-sort-field`) as ModuleGridColumn) ||
      "updatedAt"
    );
  });
  const [sortDir, setSortDir] = useState<ModuleGridSortDir>(() => {
    if (typeof window === "undefined") return "desc";
    return window.localStorage.getItem(`${tablePreferenceKey}-sort-dir`) === "asc" ? "asc" : "desc";
  });
  const [compact, setCompact] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem(`${tablePreferenceKey}-density`) === "compact",
  );
  const [pendingStatus, setPendingStatus] = useState<{
    row: ModuleGridRow;
    status: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    ids: string[];
    title: string;
    message: string;
  } | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (initialQuery) setQuery(initialQuery);
  }, [initialQuery]);

  useEffect(() => {
    window.localStorage.setItem(`${tablePreferenceKey}-query`, query);
    window.localStorage.setItem(`${tablePreferenceKey}-sort-field`, sortField);
    window.localStorage.setItem(`${tablePreferenceKey}-sort-dir`, sortDir);
    window.localStorage.setItem(
      `${tablePreferenceKey}-density`,
      compact ? "compact" : "comfortable",
    );
  }, [compact, query, sortDir, sortField, tablePreferenceKey]);
  const filtered = useMemo(() => {
    const normalized = normalizeLabel(query);
    return rows.filter((row) =>
      !normalized ? true : normalizeLabel(Object.values(row).join(" ")).includes(normalized),
    );
  }, [query, rows]);
  const columns =
    moduleId === "ddp"
      ? [
          ["code", "Código"],
          ["name", "Título do mapeamento"],
          ["process", "Nome do processo"],
          ["modalidade", "Modalidade"],
          ["area", "Área"],
          ["owner", "Dono do processo"],
          ["responsible", "Elaborador"],
          ["status", "Status"],
          ["updatedAt", "Última atualização"],
        ]
      : moduleId === "pop"
        ? [
            ["code", "Código"],
            ["name", "Nome do documento"],
            ["type", "Tipo"],
            ["area", "Área"],
            ["responsible", "Responsável"],
            ["status", "Status"],
            ["updatedAt", "Última atualização"],
          ]
        : [
            ["code", "Código"],
            ["name", "Nome do fluxo"],
            ["process", "Processo vinculado"],
            ["area", "Área"],
            ["responsible", "Responsável"],
            ["status", "Status"],
            ["updatedAt", "Última atualização"],
          ];
  const sortedRows = useMemo(
    () => [...filtered].sort((a, b) => compareModuleGridRows(a, b, sortField, sortDir)),
    [filtered, sortDir, sortField],
  );

  function toggleSort(field: ModuleGridColumn) {
    if (field === sortField) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir(field === "updatedAt" ? "desc" : "asc");
  }

  function toggleRow(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function removeSelected() {
    if (!selected.length) return;
    setPendingDelete({
      ids: selected,
      title: "Excluir registros selecionados",
      message: `Confirma excluir ${selected.length} registro(s) selecionado(s)?`,
    });
  }

  async function removeRow(row: ModuleGridRow) {
    setPendingDelete({
      ids: [row.id],
      title: "Excluir registro",
      message: `Confirma excluir o registro "${row.code || row.name}"?`,
    });
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteSaving(true);
    try {
      await onDelete(pendingDelete.ids);
      setSelected((current) => current.filter((id) => !pendingDelete.ids.includes(id)));
      setPendingDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o registro.");
    } finally {
      setDeleteSaving(false);
    }
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    setStatusSaving(true);
    try {
      await onChangeStatus(pendingStatus.row, pendingStatus.status);
      setPendingStatus(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o status.");
    } finally {
      setStatusSaving(false);
    }
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="border-b border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
              processos · {moduleDocumentLabel(moduleId)}
            </div>
            <h1 className="mt-1 text-xl font-semibold text-foreground">Consultar registros</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selected.length > 1 ? (
              <button
                type="button"
                onClick={removeSelected}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-destructive hover:bg-destructive/5"
              >
                <Trash2 className="h-4 w-4" />
                Excluir selecionados ({selected.length})
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-4 flex max-w-xl items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar na tabela"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
          <button
            type="button"
            onClick={() => setCompact((current) => !current)}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
            title={compact ? "Usar linhas confortáveis" : "Usar linhas compactas"}
            aria-label={compact ? "Usar linhas confortáveis" : "Usar linhas compactas"}
            aria-pressed={compact}
          >
            <Rows3 className="h-4 w-4" />
          </button>
        </div>
        {moduleId === "ddp" ? (
          <div className="mt-4">
            <ModuleStatusSummary rows={rows} />
          </div>
        ) : null}
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] border-collapse text-left text-sm">
          <thead className="bg-muted/80 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Selecionar registros exibidos"
                  checked={
                    !!sortedRows.length && sortedRows.every((row) => selected.includes(row.id))
                  }
                  onChange={(event) =>
                    setSelected(event.target.checked ? sortedRows.map((row) => row.id) : [])
                  }
                />
              </th>
              {columns.map(([key, label]) => (
                <th key={label} className="px-3 py-3 font-semibold">
                  <button
                    type="button"
                    onClick={() => toggleSort(key as ModuleGridColumn)}
                    className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                  >
                    {label}
                    <ModuleSortGlyph active={sortField === key} dir={sortDir} />
                  </button>
                </th>
              ))}
              <th className="w-[160px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                Ações
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  Carregando registros...
                </td>
              </tr>
            ) : null}
            {!loading && !sortedRows.length ? (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  <div className="grid justify-items-center gap-3">
                    <FileSearch className="h-7 w-7 text-muted-foreground/70" />
                    <div>
                      <div className="font-semibold text-foreground">
                        {query ? "Nenhum resultado para este filtro" : "Nenhum registro cadastrado"}
                      </div>
                      <div className="mt-1 text-xs">
                        {query
                          ? "Ajuste os termos da busca."
                          : "Crie o primeiro registro para iniciar."}
                      </div>
                    </div>
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery("")}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Limpar filtro
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          navigate({
                            to: "/m/$module",
                            params: { module: moduleId },
                            search: { view: "new" },
                          })
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground"
                      >
                        <Plus className="h-4 w-4" /> Criar registro
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : null}
            {!loading
              ? sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    onDoubleClick={() => onEdit(row)}
                    className={`border-t border-border transition-colors ${
                      selected.includes(row.id) ? "bg-accent/70" : "bg-card hover:bg-muted/45"
                    }`}
                  >
                    <td className={compact ? "px-4 py-2" : "px-4 py-3"}>
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${row.name}`}
                        checked={selected.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                      />
                    </td>
                    {columns.map(([key]) => {
                      const value = row[key as keyof ModuleGridRow];
                      if (key === "status") {
                        const options = MODULE_STATUS_OPTIONS.includes(value)
                          ? MODULE_STATUS_OPTIONS
                          : [value, ...MODULE_STATUS_OPTIONS];
                        return (
                          <td key={key} className={compact ? "px-3 py-2" : "px-3 py-3"}>
                            <select
                              value={value}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                const nextStatus = event.target.value;
                                if (nextStatus === row.status) return;
                                setPendingStatus({ row, status: nextStatus });
                              }}
                              className="h-8 rounded-md border px-2 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/20"
                              style={moduleStatusStyle(value)}
                            >
                              {options.map((opt) => (
                                <option key={opt} value={opt}>
                                  {opt}
                                </option>
                              ))}
                            </select>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={key}
                          className={`break-words px-3 text-foreground ${compact ? "py-2" : "py-3"}`}
                        >
                          {key === "updatedAt" ? formatDateTimeBr(value) : value}
                        </td>
                      );
                    })}
                    <td className={compact ? "px-4 py-2" : "px-4 py-3"}>
                      <RowActions
                        moduleId={moduleId}
                        onView={() => onView(row)}
                        onEdit={() => onEdit(row)}
                        onDuplicate={onDuplicate ? () => onDuplicate(row) : undefined}
                        onDelete={() => removeRow(row)}
                        onExport={(format) => onExport(row, format)}
                      />
                    </td>
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-border bg-muted/35 px-5 py-3 text-xs text-muted-foreground">
        {sortedRows.length} registro(s) exibido(s) · {selected.length} selecionado(s)
      </footer>
      {pendingStatus ? (
        <Modal
          title={`Alterar status do ${moduleDocumentLabel(moduleId).toLowerCase()}`}
          subtitle={`Confirma alterar o status de "${pendingStatus.row.status}" para "${pendingStatus.status}"?`}
          onClose={() => setPendingStatus(null)}
        >
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingStatus(null)}
              disabled={statusSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmStatusChange}
              disabled={statusSaving}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Alterar
            </button>
          </div>
        </Modal>
      ) : null}
      {pendingDelete ? (
        <Modal
          title={pendingDelete.title}
          subtitle={pendingDelete.message}
          onClose={() => setPendingDelete(null)}
        >
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              disabled={deleteSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={deleteSaving}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Excluir
            </button>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function RowActions({
  moduleId,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
  onExport,
}: {
  moduleId: AteliamModule;
  onView: () => void;
  onEdit: () => void;
  onDuplicate?: () => void;
  onDelete: () => void;
  onExport: (format: ExportFormat) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPosition, setMenuPosition] = useState<CSSProperties>({});

  useEffect(() => {
    if (!menuOpen) return;
    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;
      const rect = button.getBoundingClientRect();
      const width = 240;
      const viewportPadding = 12;
      const topSpace = rect.top - viewportPadding;
      const bottomSpace = window.innerHeight - rect.bottom - viewportPadding;
      const estimatedHeight = moduleId === "ddp" ? 264 : 224;
      const openUp = bottomSpace < estimatedHeight && topSpace > bottomSpace;
      setMenuPosition({
        position: "fixed",
        width,
        top: openUp ? Math.max(viewportPadding, rect.top - estimatedHeight - 6) : rect.bottom + 6,
        left: Math.min(
          Math.max(viewportPadding, rect.right - width),
          window.innerWidth - width - viewportPadding,
        ),
        zIndex: 80,
      });
    }
    function onDocClick(event: MouseEvent) {
      const target = event.target as Node;
      if (
        wrapRef.current &&
        !wrapRef.current.contains(target) &&
        menuRef.current &&
        !menuRef.current.contains(target)
      ) {
        setMenuOpen(false);
      }
    }
    updatePosition();
    document.addEventListener("mousedown", onDocClick);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [menuOpen, moduleId]);

  const reportFormat: ExportFormat = moduleId === "ddp" ? "ddp-docx" : "pop-docx";
  // Apresentação no formato padrão (HTML) — disponível apenas para Mapeamento.
  const hasPresentation = moduleId === "ddp";
  const menuItem =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-foreground hover:bg-muted";

  function run(action: () => void) {
    setMenuOpen(false);
    action();
  }

  return (
    <div className="flex items-center justify-end">
      <div ref={wrapRef} className="relative">
        <button
          ref={buttonRef}
          type="button"
          title="Mais opcoes"
          aria-label="Mais opcoes"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
          onClick={() => setMenuOpen((open) => !open)}
        >
          <Ellipsis className="h-4 w-4" />
        </button>
        {menuOpen && typeof document !== "undefined"
          ? createPortal(
              <div
                ref={menuRef}
                role="menu"
                style={menuPosition}
                className="max-h-[min(420px,calc(100vh-24px))] overflow-y-auto rounded-md border border-border bg-popover shadow-xl"
              >
                <button
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  onClick={() => run(onView)}
                >
                  <Eye className="h-4 w-4 shrink-0" /> Visualizar
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  onClick={() => run(onEdit)}
                >
                  <Pencil className="h-4 w-4 shrink-0" /> Editar
                </button>
                {onDuplicate ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItem}
                    onClick={() => run(onDuplicate)}
                  >
                    <Copy className="h-4 w-4 shrink-0" /> Duplicar
                  </button>
                ) : null}
                <div className="border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  className={menuItem}
                  onClick={() => {
                    setMenuOpen(false);
                    onExport(reportFormat);
                  }}
                >
                  <FileText className="h-4 w-4 shrink-0" /> Relatório
                </button>
                {hasPresentation ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={menuItem}
                    onClick={() => {
                      setMenuOpen(false);
                      onExport("ddp-html");
                    }}
                  >
                    <Presentation className="h-4 w-4 shrink-0" /> Apresentação
                  </button>
                ) : null}
                <div className="border-t border-border" />
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/5"
                  onClick={() => run(onDelete)}
                >
                  <Trash2 className="h-4 w-4 shrink-0" /> Excluir
                </button>
              </div>,
              document.body,
            )
          : null}
      </div>
    </div>
  );
}

function DdpCausesModuleLegacy({
  data,
  catalogs,
  update,
  onDeleteSharedCause,
  mode = "consult",
  onOpenEditor,
}: {
  data: DdpState;
  catalogs: OrganizationCatalogs;
  update: (value: DdpState) => void;
  onDeleteSharedCause: (causeId: string) => Promise<void>;
  mode?: "new" | "consult" | "edit";
  onOpenEditor: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<GapItem | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const [deleteSaving, setDeleteSaving] = useState(false);
  const initializedNew = useRef(false);
  const filtered = useMemo(() => {
    const normalized = normalizeLabel(query);
    return data.gaps.filter((gap) =>
      !normalized
        ? true
        : normalizeLabel(
            [
              gap.causa,
              gap.descricao,
              gap.impacto,
              gap.acao,
              gap.responsavel,
              gap.prioridade,
              gap.status,
              gap.prazo,
            ].join(" "),
          ).includes(normalized),
    );
  }, [data.gaps, query]);

  const selectedForEdit =
    data.gaps.find((gap) => selectedIds.includes(gap.id)) ?? data.gaps[0] ?? null;

  useEffect(() => {
    setSelectedIds((current) => current.filter((item) => data.gaps.some((gap) => gap.id === item)));
  }, [data.gaps]);

  useEffect(() => {
    if (mode === "new" && !initializedNew.current) {
      initializedNew.current = true;
      openNewCause();
    }
    // Inicializa o formulário de oportunidade uma única vez ao entrar no modo "new"
    // (guardado por initializedNew.current); depende apenas de `mode`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode === "edit" && selectedForEdit && !draft) {
      openEditCause(selectedForEdit);
    }
    // Reage à mudança de modo/seleção; usa selectedForEdit?.id de propósito
    // (identidade estável) e a guarda !draft evita reabrir sobre a edição em curso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedForEdit?.id]);

  function causeCode(index: number) {
    return `CAU-${String(index + 1).padStart(3, "0")}`;
  }

  function lastUpdated(gap: GapItem) {
    const dates = gap.comentarios
      .map((comment) => comment.createdAt)
      .filter(Boolean)
      .sort();
    const last = dates.at(-1);
    return last ? formatDateTimeBr(last) : "-";
  }

  function toggleRow(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function updateGap(gapId: string, patch: Partial<GapItem>) {
    update({
      ...data,
      gaps: data.gaps.map((gap) => (gap.id === gapId ? { ...gap, ...patch } : gap)),
    });
  }

  function createDraft(): GapItem {
    return {
      id: "",
      sharedCauseId: "",
      causa: "",
      descricao: "",
      impacto: "",
      acao: "",
      responsavel: "",
      prazo: "",
      prioridade: "Média",
      status: "Pendente",
      comentarios: [],
    };
  }

  function openNewCause() {
    setDraft(createDraft());
    setCommentDraft("");
  }

  function openEditCause(gap: GapItem | null) {
    if (!gap) return;
    setSelectedIds([gap.id]);
    setDraft({ ...gap, comentarios: [...gap.comentarios] });
    setCommentDraft("");
  }

  function updateDraft(patch: Partial<GapItem>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  function applySharedCauseToDraft(causeId: string) {
    const cause = catalogs.causes.find((item) => item.id === causeId);
    if (!cause) {
      updateDraft({ sharedCauseId: "" });
      return;
    }
    updateDraft(gapPatchFromOrganizationCause(cause));
  }

  function saveDraft() {
    if (!draft) return;
    const normalized: GapItem = {
      ...draft,
      id: draft.id || id("gap"),
      causa: draft.causa.trim() || "Oportunidade sem nome",
      comentarios: draft.comentarios ?? [],
    };

    if (draft.id) {
      update({
        ...data,
        gaps: data.gaps.map((gap) => (gap.id === draft.id ? normalized : gap)),
      });
      toast.success("Oportunidade de melhoria atualizada.");
    } else {
      update({ ...data, gaps: [...data.gaps, normalized] });
      toast.success("Oportunidade de melhoria cadastrada.");
    }

    setSelectedIds([normalized.id]);
    setDraft(null);
    setCommentDraft("");
  }

  async function removeRows(ids: string[]) {
    if (!ids.length) return;
    setPendingDeleteIds(ids);
  }

  async function confirmRemoveRows() {
    const ids = pendingDeleteIds;
    if (!ids.length) return;
    setDeleteSaving(true);
    const targets = data.gaps.filter((gap) => ids.includes(gap.id));
    try {
      for (const gap of targets) {
        if (gap.sharedCauseId) await onDeleteSharedCause(gap.sharedCauseId);
      }
      update({ ...data, gaps: data.gaps.filter((gap) => !ids.includes(gap.id)) });
      setSelectedIds([]);
      if (draft?.id && ids.includes(draft.id)) setDraft(null);
      toast.success(
        ids.length > 1
          ? "Oportunidades de melhoria excluídas."
          : "Oportunidade de melhoria excluída.",
      );
      setPendingDeleteIds([]);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a oportunidade de melhoria.",
      );
    } finally {
      setDeleteSaving(false);
    }
  }

  function addComment() {
    if (!draft || !commentDraft.trim()) return;
    setDraft({
      ...draft,
      comentarios: [
        ...draft.comentarios,
        {
          id: id("comment"),
          text: commentDraft.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setCommentDraft("");
  }

  function removeComment(commentId: string) {
    if (!draft) return;
    setDraft({
      ...draft,
      comentarios: draft.comentarios.filter((comment) => comment.id !== commentId),
    });
  }

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <header className="border-b border-border bg-card px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
                processos · mapeamento · oportunidades de melhoria
              </div>
              <h1 className="mt-1 text-xl font-semibold text-foreground">Consultar registros</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedIds.length > 1 ? (
                <button
                  type="button"
                  onClick={() => removeRows(selectedIds)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir selecionados ({selectedIds.length})
                </button>
              ) : null}
            </div>
          </div>
          <div className="relative mt-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar na tabela"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] border-collapse text-left text-sm">
            <thead className="bg-muted/80 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Selecionar oportunidades de melhoria exibidas"
                    checked={
                      !!filtered.length && filtered.every((gap) => selectedIds.includes(gap.id))
                    }
                    onChange={(event) =>
                      setSelectedIds(event.target.checked ? filtered.map((gap) => gap.id) : [])
                    }
                  />
                </th>
                <th className="px-3 py-3 font-semibold">Origem</th>
                <th className="px-3 py-3 font-semibold">Oportunidade reutilizável</th>
                <th className="px-3 py-3 font-semibold">Oportunidade de melhoria</th>
                <th className="px-3 py-3 font-semibold">Descrição</th>
                <th className="px-3 py-3 font-semibold">Impacto</th>
                <th className="px-3 py-3 font-semibold">Ação proposta</th>
                <th className="px-3 py-3 font-semibold">Responsável</th>
                <th className="px-3 py-3 font-semibold">Prazo</th>
                <th className="px-3 py-3 font-semibold">Prioridade</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="w-[160px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {!filtered.length ? (
                <tr>
                  <td colSpan={12} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : null}
              {filtered.map((gap, index) => (
                <tr
                  key={gap.id}
                  onDoubleClick={() => openEditCause(gap)}
                  className={`border-t border-border ${
                    selectedIds.includes(gap.id) ? "bg-accent/70" : "bg-card hover:bg-muted/45"
                  }`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label={`Selecionar ${gap.causa}`}
                      checked={selectedIds.includes(gap.id)}
                      onChange={() => toggleRow(gap.id)}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex whitespace-nowrap rounded-full border border-border bg-muted/60 px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {gap.sharedCauseId ? "Biblioteca" : "Mapeamento"}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-foreground">{gap.sharedCauseId ? "Sim" : "Não"}</td>
                  <td className="break-words px-3 py-3 font-medium text-foreground">
                    {gap.causa || "Oportunidade sem nome"}
                  </td>
                  <td className="break-words px-3 py-3 text-xs leading-5 text-muted-foreground">
                    <div className="max-w-[280px]">{gap.descricao || "-"}</div>
                  </td>
                  <td className="break-words px-3 py-3 text-xs leading-5 text-muted-foreground">
                    <div className="max-w-[240px]">{gap.impacto || "-"}</div>
                  </td>
                  <td className="break-words px-3 py-3 text-xs leading-5 text-muted-foreground">
                    <div className="max-w-[240px]">{gap.acao || "-"}</div>
                  </td>
                  <td className="break-words px-3 py-3 text-foreground">
                    {gap.responsavel || "-"}
                  </td>
                  <td className="break-words px-3 py-3 text-foreground">
                    {formatGapDateRangeBr(gap.prazo) || "-"}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={gap.prioridade}
                      onChange={(event) => updateGap(gap.id, { prioridade: event.target.value })}
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {CAUSE_PRIORITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={gap.status}
                      onChange={(event) => updateGap(gap.id, { status: event.target.value })}
                      className="h-8 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {CAUSE_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title="Visualizar"
                        onClick={() => openEditCause(gap)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Editar"
                        onClick={() => openEditCause(gap)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Excluir"
                        onClick={() => removeRows([gap.id])}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-destructive hover:bg-destructive/5"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="border-t border-border bg-muted/35 px-5 py-3 text-xs text-muted-foreground">
          {filtered.length} registro(s) exibido(s) · {selectedIds.length} selecionado(s)
        </footer>
      </section>

      {draft ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center overflow-auto bg-slate-950/30 p-4 backdrop-blur-[2px]"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setDraft(null);
              setCommentDraft("");
            }
          }}
        >
          <div className="my-auto max-h-[92vh] w-full max-w-4xl overflow-auto rounded-xl border border-border bg-card p-5 shadow-[0_24px_80px_rgba(15,23,42,.22)]">
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-foreground">
                {draft.id ? "Editar oportunidade" : "Nova oportunidade"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setCommentDraft("");
                }}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar"
                aria-label="Fechar formulário"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-3 md:col-span-2">
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Oportunidade reutilizável da organização
                    </span>
                    <select
                      value={draft.sharedCauseId ?? ""}
                      onChange={(event) => applySharedCauseToDraft(event.target.value)}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                    >
                      <option value="">Oportunidade local / nova</option>
                      {catalogs.causes.map((cause) => (
                        <option key={cause.id} value={cause.id}>
                          {cause.title}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <Field
                  label="Oportunidade de melhoria"
                  value={draft.causa}
                  onChange={(causa) => updateDraft({ causa })}
                />
                <Field
                  label="Responsável"
                  value={draft.responsavel}
                  onChange={(responsavel) => updateDraft({ responsavel })}
                />
                <SelectField
                  label="Status"
                  value={draft.status}
                  options={[...CAUSE_STATUS_OPTIONS]}
                  onChange={(status) => updateDraft({ status })}
                />
                <SelectField
                  label="Prioridade"
                  value={draft.prioridade}
                  options={[...CAUSE_PRIORITY_OPTIONS]}
                  onChange={(prioridade) => updateDraft({ prioridade })}
                />
                <DateRangeField
                  label="Prazo"
                  value={draft.prazo}
                  onChange={(prazo) => updateDraft({ prazo })}
                />
                <TextArea
                  label="Descrição"
                  value={draft.descricao}
                  onChange={(descricao) => updateDraft({ descricao })}
                />
                <TextArea
                  label="Impacto"
                  value={draft.impacto}
                  onChange={(impacto) => updateDraft({ impacto })}
                />
                <TextArea
                  label="Ação proposta"
                  value={draft.acao}
                  onChange={(acao) => updateDraft({ acao })}
                />
              </div>

              <div className="rounded-lg border border-border bg-muted/35 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-foreground" />
                  <h3 className="text-sm font-semibold text-foreground">Comentários</h3>
                </div>
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  rows={4}
                  placeholder="Registre uma atualização, decisão ou pendência da oportunidade."
                  className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addComment}
                  disabled={!commentDraft.trim()}
                  className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-sm font-bold text-background hover:opacity-90 disabled:opacity-45"
                >
                  Inserir comentário
                </button>
                <div className="mt-4 grid gap-2">
                  {draft.comentarios.map((comment) => (
                    <div
                      key={comment.id}
                      className="rounded-lg border border-border bg-muted/20 p-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm leading-5 text-foreground">{comment.text}</p>
                        <button
                          type="button"
                          onClick={() => removeComment(comment.id)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      {comment.createdAt ? (
                        <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                          {formatDateTimeBr(comment.createdAt)}
                        </div>
                      ) : null}
                    </div>
                  ))}
                  {!draft.comentarios.length ? (
                    <div className="rounded-lg border border-dashed border-border bg-background/60 p-4 text-center text-sm text-muted-foreground">
                      Nenhum comentário registrado.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setCommentDraft("");
                }}
                className="rounded-lg px-4 py-2 text-sm hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveDraft}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
              >
                Salvar oportunidade
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {pendingDeleteIds.length ? (
        <Modal
          title="Excluir oportunidades de melhoria selecionadas"
          subtitle={`Confirma excluir ${pendingDeleteIds.length} oportunidade(s) selecionada(s)?`}
          onClose={() => setPendingDeleteIds([])}
        >
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingDeleteIds([])}
              disabled={deleteSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmRemoveRows}
              disabled={deleteSaving}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Excluir
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function DdpCausesModuleV2({
  mappingCauses,
  standaloneCauses,
  processes,
  loading,
  onCreateStandaloneCause,
  onUpdateStandaloneCause,
  onDeleteStandaloneCause,
  onUpdateMappingCause,
  onOpenMapping,
  mode = "consult",
}: {
  mappingCauses: MappingCauseRecord[];
  standaloneCauses: OrganizationCause[];
  processes: OrganizationProcess[];
  loading: boolean;
  onCreateStandaloneCause: (gap: GapItem, processId?: string | null) => Promise<OrganizationCause>;
  onUpdateStandaloneCause: (cause: OrganizationCause) => Promise<OrganizationCause>;
  onDeleteStandaloneCause: (causeId: string) => Promise<void>;
  onUpdateMappingCause: (
    record: MappingCauseRecord,
    patch: { status?: string; prazo?: string; comentarios?: CauseComment[] },
  ) => Promise<void>;
  onOpenMapping: (record: MappingCauseRecord) => Promise<void>;
  mode?: "new" | "consult" | "edit";
}) {
  void DdpCausesModuleLegacy;
  type CauseRow = {
    id: string;
    source: "mapping" | "standalone";
    gap: GapItem;
    mapping?: MappingCauseRecord;
    standalone?: OrganizationCause;
    updatedAt?: string;
  };
  type CauseDraft = {
    source: "mapping" | "standalone";
    gap: GapItem;
    processId: string;
    row?: CauseRow;
  };

  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draft, setDraft] = useState<CauseDraft | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [statusSavingId, setStatusSavingId] = useState("");
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[]>([]);
  const initializedNew = useRef(false);
  const processesById = useMemo(
    () => new Map(processes.map((process) => [process.id, process])),
    [processes],
  );

  const rows = useMemo<CauseRow[]>(() => {
    const mappingRows = mappingCauses.map((cause) => ({
      id: cause.recordId,
      source: "mapping" as const,
      gap: cause,
      mapping: cause,
      updatedAt: cause.updatedAt,
    }));
    const standaloneRows = standaloneCauses.map((cause) => ({
      id: `standalone:${cause.id}`,
      source: "standalone" as const,
      gap: gapFromStandaloneCause(cause),
      standalone: cause,
      updatedAt: cause.updated_at,
    }));
    return [...mappingRows, ...standaloneRows].sort((a, b) =>
      String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? "")),
    );
  }, [mappingCauses, standaloneCauses]);

  const filtered = useMemo(() => {
    const normalized = normalizeLabel(query);
    if (!normalized) return rows;
    return rows.filter((row) =>
      normalizeLabel(
        [
          row.gap.causa,
          row.gap.descricao,
          row.gap.impacto,
          row.gap.acao,
          row.gap.responsavel,
          row.gap.status,
          row.mapping?.mappingCode,
          row.mapping?.mappingTitle,
          row.standalone?.process_id ? processesById.get(row.standalone.process_id)?.name : "",
          row.source === "mapping" ? "Mapeamento" : "Avulsa",
        ].join(" "),
      ).includes(normalized),
    );
  }, [processesById, query, rows]);

  function emptyCause(): GapItem {
    return {
      id: "",
      sharedCauseId: "",
      causa: "",
      descricao: "",
      impacto: "",
      acao: "",
      responsavel: "",
      prazo: "",
      prioridade: "Média",
      status: "Não iniciada",
      comentarios: [],
    };
  }

  function openNewCause() {
    setDraft({ source: "standalone", gap: emptyCause(), processId: "" });
    setCommentDraft("");
  }

  function openRow(row: CauseRow) {
    setDraft({
      source: row.source,
      gap: { ...row.gap, comentarios: [...row.gap.comentarios] },
      processId: row.standalone?.process_id ?? "",
      row,
    });
    setCommentDraft("");
  }

  useEffect(() => {
    if (mode === "new" && !initializedNew.current) {
      initializedNew.current = true;
      openNewCause();
    }
    // A abertura é intencionalmente executada uma única vez ao entrar no modo novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    setSelectedIds((current) =>
      current.filter((recordId) =>
        rows.some((row) => row.id === recordId && row.source === "standalone"),
      ),
    );
  }, [rows]);

  function updateDraft(patch: Partial<GapItem>) {
    setDraft((current) => (current ? { ...current, gap: { ...current.gap, ...patch } } : current));
  }

  async function saveDraft() {
    if (!draft || draft.source !== "standalone") return;
    const title = draft.gap.causa.trim();
    if (!title) {
      toast.error("Informe a oportunidade de melhoria.");
      return;
    }
    setSaving(true);
    try {
      const normalized = {
        ...draft.gap,
        causa: title,
        status: normalizeCauseStatus(draft.gap.status),
        comentarios: commentsForSave(),
      };
      if (draft.row?.standalone) {
        await onUpdateStandaloneCause({
          ...organizationCauseFromGap(normalized, draft.row.standalone),
          process_id: draft.processId || null,
        });
        toast.success("Oportunidade avulsa atualizada.");
      } else {
        await onCreateStandaloneCause(normalized, draft.processId || null);
        toast.success("Oportunidade avulsa cadastrada.");
      }
      setDraft(null);
      setCommentDraft("");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a oportunidade de melhoria.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(row: CauseRow, status: string) {
    setStatusSavingId(row.id);
    try {
      const normalizedStatus = normalizeCauseStatus(status);
      if (row.mapping) {
        await onUpdateMappingCause(row.mapping, { status: normalizedStatus });
      } else if (row.standalone) {
        await onUpdateStandaloneCause(
          organizationCauseFromGap({ ...row.gap, status: normalizedStatus }, row.standalone),
        );
      }
      toast.success(`Status atualizado para "${normalizedStatus}".`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar o status.");
    } finally {
      setStatusSavingId("");
    }
  }

  async function confirmDelete() {
    setSaving(true);
    try {
      for (const recordId of pendingDeleteIds) {
        const row = rows.find((item) => item.id === recordId);
        if (row?.standalone) await onDeleteStandaloneCause(row.standalone.id);
      }
      setSelectedIds([]);
      setPendingDeleteIds([]);
      toast.success("Oportunidade(s) avulsa(s) excluída(s).");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível excluir a oportunidade de melhoria.",
      );
    } finally {
      setSaving(false);
    }
  }

  function addComment() {
    if (!draft || !commentDraft.trim()) return;
    updateDraft({
      comentarios: [
        ...draft.gap.comentarios,
        { id: id("comment"), text: commentDraft.trim(), createdAt: new Date().toISOString() },
      ],
    });
    setCommentDraft("");
  }

  function commentsForSave() {
    if (!draft) return [];
    const text = commentDraft.trim();
    return text
      ? [...draft.gap.comentarios, { id: id("comment"), text, createdAt: new Date().toISOString() }]
      : draft.gap.comentarios;
  }

  return (
    <div className="grid gap-5">
      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <header className="border-b border-border px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
                Processos · Mapeamento · Oportunidades de melhoria
              </div>
              <h1 className="mt-1 text-xl font-semibold text-foreground">
                Consultar oportunidades de melhoria
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Oportunidades identificadas nos mapeamentos e registros avulsos da organização.
              </p>
            </div>
            <div className="flex gap-2">
              {selectedIds.length ? (
                <button
                  type="button"
                  onClick={() => setPendingDeleteIds(selectedIds)}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-destructive hover:bg-destructive/5"
                >
                  <Trash2 className="h-4 w-4" /> Excluir ({selectedIds.length})
                </button>
              ) : null}
              <button
                type="button"
                onClick={openNewCause}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <Plus className="h-4 w-4" /> Nova oportunidade
              </button>
            </div>
          </div>
          <div className="relative mt-4 max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar oportunidade, mapeamento ou responsável"
              className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
            />
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead className="bg-muted/80 text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="w-12 px-4 py-3" />
                <th className="px-3 py-3">Origem</th>
                <th className="px-3 py-3">Oportunidade de melhoria</th>
                <th className="px-3 py-3">Vínculo</th>
                <th className="px-3 py-3">Impacto</th>
                <th className="px-3 py-3">Ação proposta</th>
                <th className="px-3 py-3">Responsável</th>
                <th className="px-3 py-3">Prazo</th>
                <th className="px-3 py-3">Prioridade</th>
                <th className="px-3 py-3">Status</th>
                <th className="w-[220px] px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    Carregando oportunidades de melhoria...
                  </td>
                </tr>
              ) : !filtered.length ? (
                <tr>
                  <td colSpan={11} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhuma oportunidade de melhoria encontrada.
                  </td>
                </tr>
              ) : null}
              {filtered.map((row) => (
                <tr key={row.id} className="border-t border-border bg-card hover:bg-muted/45">
                  <td className="px-4 py-3">
                    {row.source === "standalone" ? (
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${row.gap.causa}`}
                        checked={selectedIds.includes(row.id)}
                        onChange={() =>
                          setSelectedIds((current) =>
                            current.includes(row.id)
                              ? current.filter((id) => id !== row.id)
                              : [...current, row.id],
                          )
                        }
                      />
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${row.source === "mapping" ? "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200" : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"}`}
                    >
                      {row.source === "mapping" ? "Mapeamento" : "Avulsa"}
                    </span>
                  </td>
                  <td className="max-w-[250px] px-3 py-3">
                    <div className="font-semibold text-foreground">
                      {row.gap.causa || "Oportunidade sem nome"}
                    </div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                      {row.gap.descricao || "-"}
                    </div>
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-xs leading-5">
                    {row.mapping ? (
                      <>
                        <div className="font-semibold text-foreground">
                          {row.mapping.mappingCode}
                        </div>
                        <div className="text-muted-foreground">{row.mapping.mappingTitle}</div>
                      </>
                    ) : row.standalone?.process_id &&
                      processesById.get(row.standalone.process_id) ? (
                      <>
                        <div className="font-semibold text-foreground">
                          {processesById.get(row.standalone.process_id)?.code || "Processo"}
                        </div>
                        <div className="text-muted-foreground">
                          {processesById.get(row.standalone.process_id)?.name}
                        </div>
                      </>
                    ) : (
                      <span className="text-muted-foreground">Sem processo relacionado</span>
                    )}
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-xs leading-5 text-muted-foreground">
                    {row.gap.impacto || "-"}
                  </td>
                  <td className="max-w-[220px] px-3 py-3 text-xs leading-5 text-muted-foreground">
                    {row.gap.acao || "-"}
                  </td>
                  <td className="px-3 py-3">{row.gap.responsavel || "-"}</td>
                  <td className="px-3 py-3">{formatGapDateRangeBr(row.gap.prazo) || "-"}</td>
                  <td className="px-3 py-3">{row.gap.prioridade || "Média"}</td>
                  <td className="px-3 py-3">
                    <select
                      value={normalizeCauseStatus(row.gap.status)}
                      disabled={statusSavingId === row.id}
                      onChange={(event) => changeStatus(row, event.target.value)}
                      className="h-9 rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                    >
                      {CAUSE_STATUS_OPTIONS.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        title={
                          row.mapping
                            ? "Acompanhar oportunidade sem abrir o mapeamento"
                            : "Abrir oportunidade"
                        }
                        onClick={() => openRow(row)}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-2.5 text-xs font-semibold hover:bg-muted"
                      >
                        {row.mapping ? (
                          <MessageSquare className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                        {row.mapping ? "Acompanhar" : "Abrir"}
                      </button>
                      <button
                        type="button"
                        title={row.mapping ? "Editar no mapeamento" : "Editar oportunidade"}
                        onClick={() =>
                          row.mapping
                            ? onOpenMapping(row.mapping).catch((error) =>
                                toast.error(error.message),
                              )
                            : openRow(row)
                        }
                        className="grid h-8 w-8 place-items-center rounded-md border border-border hover:bg-muted"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {row.standalone ? (
                        <button
                          type="button"
                          title="Excluir"
                          onClick={() => setPendingDeleteIds([row.id])}
                          className="grid h-8 w-8 place-items-center rounded-md border border-border text-destructive hover:bg-destructive/5"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="border-t border-border bg-muted/35 px-5 py-3 text-xs text-muted-foreground">
          {filtered.length} registro(s) · {mappingCauses.length} de mapeamentos ·{" "}
          {standaloneCauses.length} avulsa(s)
        </footer>
      </section>

      {draft ? (
        <div
          className="fixed inset-0 z-[70] grid place-items-center overflow-auto bg-slate-950/35 p-4 backdrop-blur-[2px]"
          onClick={(event) => event.target === event.currentTarget && setDraft(null)}
        >
          <div className="my-auto max-h-[92vh] w-full max-w-5xl overflow-auto rounded-xl border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,.22)]">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-card px-6 py-5">
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                  <TriangleAlert className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-foreground">
                      {draft.source === "mapping"
                        ? "Acompanhar oportunidade do mapeamento"
                        : draft.row
                          ? "Editar oportunidade avulsa"
                          : "Nova oportunidade avulsa"}
                    </h2>
                    <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      {draft.source === "mapping" ? "Mapeamento" : "Avulsa"}
                    </span>
                  </div>
                  {draft.row?.mapping ? (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {draft.row.mapping.mappingCode} · {draft.row.mapping.mappingTitle}
                    </p>
                  ) : (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Registre a oportunidade, seus efeitos e o tratamento proposto.
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="grid h-8 w-8 place-items-center rounded-md hover:bg-muted"
                aria-label="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid gap-5 p-6">
              {draft.source === "mapping" ? (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 dark:border-sky-900 dark:bg-sky-950/35 dark:text-sky-100">
                  Esta janela não altera os dados técnicos do mapeamento. Atualize somente o período
                  de acompanhamento, o status e os comentários.
                </div>
              ) : null}

              <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,.85fr)] lg:items-start">
                <section className="grid gap-4 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 border-b border-border pb-3">
                    <ListChecks className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Contexto da oportunidade
                    </h3>
                  </div>
                  <Field
                    label="Oportunidade de melhoria"
                    value={draft.gap.causa}
                    onChange={(causa) => updateDraft({ causa })}
                    disabled={draft.source === "mapping"}
                  />
                  {draft.source === "standalone" ? (
                    <RegisteredProcessSelect
                      label="Processo relacionado (opcional)"
                      value={draft.processId}
                      processes={processes}
                      placeholder="Pesquisar por código ou nome do processo"
                      displayName={(process) =>
                        `${process.code ? `${process.code} · ` : ""}${process.name}`
                      }
                      onSelect={(process) =>
                        setDraft((current) =>
                          current ? { ...current, processId: process?.id ?? "" } : current,
                        )
                      }
                    />
                  ) : null}
                  <TextArea
                    label="Descrição"
                    value={draft.gap.descricao}
                    onChange={(descricao) => updateDraft({ descricao })}
                    rows={3}
                    disabled={draft.source === "mapping"}
                  />
                  <TextArea
                    label="Impacto"
                    value={draft.gap.impacto}
                    onChange={(impacto) => updateDraft({ impacto })}
                    rows={4}
                    disabled={draft.source === "mapping"}
                  />
                </section>

                <section className="grid gap-4 rounded-lg border border-border p-4">
                  <div className="flex items-center gap-2 border-b border-border pb-3">
                    <GitBranch className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">Tratamento</h3>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <SelectField
                      label="Status"
                      value={normalizeCauseStatus(draft.gap.status)}
                      options={[...CAUSE_STATUS_OPTIONS]}
                      onChange={(status) => updateDraft({ status })}
                    />
                    <SelectField
                      label="Prioridade"
                      value={draft.gap.prioridade}
                      options={[...CAUSE_PRIORITY_OPTIONS]}
                      onChange={(prioridade) => updateDraft({ prioridade })}
                      disabled={draft.source === "mapping"}
                    />
                  </div>
                  <Field
                    label="Responsável"
                    value={draft.gap.responsavel}
                    onChange={(responsavel) => updateDraft({ responsavel })}
                    disabled={draft.source === "mapping"}
                  />
                  <DateRangeField
                    label={draft.source === "mapping" ? "Período de acompanhamento" : "Prazo"}
                    value={draft.gap.prazo}
                    onChange={(prazo) => updateDraft({ prazo })}
                  />
                  <TextArea
                    label="Ação proposta"
                    value={draft.gap.acao}
                    onChange={(acao) => updateDraft({ acao })}
                    rows={5}
                    disabled={draft.source === "mapping"}
                  />
                </section>
              </div>

              <section className="grid gap-4 rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 border-b border-border pb-3">
                  <MessageSquare className="h-4 w-4 text-primary" />
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">Acompanhamento</h3>
                    <p className="text-xs text-muted-foreground">
                      Registre decisões, avanços e impedimentos.
                    </p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && commentDraft.trim()) {
                        event.preventDefault();
                        addComment();
                      }
                    }}
                    placeholder="Adicionar comentário"
                    className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                  />
                  <button
                    type="button"
                    onClick={addComment}
                    disabled={!commentDraft.trim()}
                    className="rounded-md bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-40"
                  >
                    Adicionar
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {draft.gap.comentarios.length ? (
                    draft.gap.comentarios.map((comment) => (
                      <div
                        key={comment.id}
                        className="rounded-md border border-border bg-muted/25 p-3 text-sm"
                      >
                        <div>{comment.text}</div>
                        {comment.createdAt ? (
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDateTimeBr(comment.createdAt)}
                          </div>
                        ) : null}
                      </div>
                    ))
                  ) : (
                    <div className="col-span-full py-2 text-sm text-muted-foreground">
                      Nenhum comentário registrado.
                    </div>
                  )}
                </div>
              </section>
            </div>
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-border bg-card px-6 py-4">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                Cancelar
              </button>
              {draft.source === "mapping" && draft.row?.mapping ? (
                <>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={async () => {
                      setSaving(true);
                      try {
                        await onUpdateMappingCause(draft.row!.mapping!, {
                          status: draft.gap.status,
                          prazo: draft.gap.prazo,
                          comentarios: commentsForSave(),
                        });
                        setDraft(null);
                        toast.success("Acompanhamento da oportunidade atualizado.");
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Não foi possível atualizar a oportunidade.",
                        );
                      } finally {
                        setSaving(false);
                      }
                    }}
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
                  >
                    Salvar acompanhamento
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onOpenMapping(draft.row!.mapping!).catch((error) =>
                        toast.error(error.message),
                      )
                    }
                    className="rounded-lg border border-border px-4 py-2 text-sm font-semibold"
                  >
                    Editar dados no mapeamento
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={saving}
                  onClick={saveDraft}
                  className="rounded-lg border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  Salvar oportunidade
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {pendingDeleteIds.length ? (
        <Modal
          title="Excluir oportunidades de melhoria avulsas"
          subtitle={`Confirma excluir ${pendingDeleteIds.length} oportunidade(s) avulsa(s)?`}
          onClose={() => setPendingDeleteIds([])}
        >
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingDeleteIds([])}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={confirmDelete}
              className="rounded-lg border border-border px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-50"
            >
              Excluir
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function gapFromStandaloneCause(cause: OrganizationCause): GapItem {
  return {
    id: cause.id,
    sharedCauseId: cause.id,
    causa: cause.title,
    descricao: cause.description ?? "",
    impacto: cause.impact ?? "",
    acao: cause.action ?? "",
    responsavel: cause.responsible ?? "",
    prazo: cause.due_date ?? "",
    prioridade: normalizeCausePriority(cause.priority),
    status: normalizeCauseStatus(cause.status),
    comentarios: Array.isArray(cause.comments) ? cause.comments : [],
  };
}

function organizationCauseFromGap(gap: GapItem, cause: OrganizationCause): OrganizationCause {
  return {
    ...cause,
    title: gap.causa.trim(),
    description: gap.descricao || null,
    impact: gap.impacto || null,
    action: gap.acao || null,
    priority: normalizeCausePriority(gap.prioridade),
    status: normalizeCauseStatus(gap.status),
    responsible: gap.responsavel || null,
    due_date: gap.prazo || null,
    comments: gap.comentarios,
  };
}

function gapPatchFromOrganizationCause(cause: OrganizationCause): Partial<GapItem> {
  return {
    sharedCauseId: cause.id,
    causa: cause.title,
    descricao: cause.description ?? "",
    impacto: cause.impact ?? "",
    acao: cause.action ?? "",
    prioridade: normalizeCausePriority(cause.priority),
  };
}

function parseGapDateRange(value: string) {
  const parts = value
    .split(/\s+(?:até|a)\s+|\|/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const isIsoDate = (part: string) => /^\d{4}-\d{2}-\d{2}$/.test(part);
  return {
    start: isIsoDate(parts[0] ?? "") ? parts[0] : "",
    end: isIsoDate(parts[1] ?? "") ? parts[1] : isIsoDate(parts[0] ?? "") ? parts[0] : "",
  };
}

function formatGapDateRange(start: string, end: string) {
  if (start && end && start !== end) return `${start} até ${end}`;
  return start || end;
}

function formatGapDateRangeBr(value: string) {
  const range = parseGapDateRange(value);
  if (range.start && range.end && range.start !== range.end) {
    return `${formatDateBr(range.start)} a ${formatDateBr(range.end)}`;
  }
  return formatDateBr(range.start || range.end || value);
}

function DateRangeField({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <TableDateRange value={value} onChange={onChange} disabled={disabled} />
    </label>
  );
}

function TableDateRange({
  value,
  onChange,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const range = parseGapDateRange(value);
  return (
    <div className="grid min-w-[220px] gap-2 sm:grid-cols-2">
      <input
        type="date"
        value={range.start}
        disabled={disabled}
        aria-label="Início do prazo"
        onChange={(event) => onChange(formatGapDateRange(event.target.value, range.end))}
        className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground"
      />
      <input
        type="date"
        value={range.end}
        disabled={disabled}
        aria-label="Fim do prazo"
        min={range.start || undefined}
        onChange={(event) => onChange(formatGapDateRange(range.start, event.target.value))}
        className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground"
      />
    </div>
  );
}

function TableInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-[140px] rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
    />
  );
}

function TableTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <textarea
      value={value}
      placeholder={placeholder}
      rows={2}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-[190px] resize-y rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
    />
  );
}

function TableSelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full min-w-[130px] rounded-md border border-input bg-background px-2.5 py-2 text-xs font-semibold text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function TableReadonly({ value, multiline = false }: { value: string; multiline?: boolean }) {
  return (
    <div
      className={`min-w-[140px] rounded-md border border-border bg-muted/35 px-2.5 py-2 text-xs text-muted-foreground ${
        multiline ? "min-h-[62px] whitespace-pre-wrap leading-relaxed" : "min-h-[34px]"
      }`}
    >
      {value?.trim() ? value : "-"}
    </div>
  );
}

function DdpModule({
  data,
  catalogs,
  userOptions = [],
  currentElaborator = "",
  update,
  onSave,
  onPreview,
  saving = false,
  savedNonce = 0,
  organizationId,
  isDemo,
  codeSettings,
  onCatalogCreated,
  onProcessCreated,
  onSuggestedProcessPrepared,
}: {
  data: DdpState;
  catalogs: OrganizationCatalogs;
  userOptions?: string[];
  currentElaborator?: string;
  update: (value: DdpState) => void;
  onSave?: () => void;
  onPreview?: () => void;
  // Salvamento em andamento (do mutation do pai).
  saving?: boolean;
  // Contador que incrementa a cada salvamento concluído com sucesso.
  savedNonce?: number;
  organizationId: string | null;
  isDemo: boolean;
  codeSettings: CodeSettings | null;
  onCatalogCreated?: () => Promise<void> | void;
  // Persiste (nuvem: refetch; demo: adiciona ao catálogo) o processo recém-criado.
  onProcessCreated: (process: CreatedProcess) => Promise<void> | void;
  onSuggestedProcessPrepared: (process: CreatedProcess) => Promise<void> | void;
}) {
  const saveArea = useServerFn(saveProcessArea);
  const savePosition = useServerFn(savePositionRegistration);
  const [createProcessName, setCreateProcessName] = useState<string | null>(null);
  const [actorCatalogRequest, setActorCatalogRequest] = useState<{
    kind: "area" | "position";
    initial: string;
    target:
      | { kind: "substep"; stepId: string; substepId: string }
      | { kind: "activity"; stepId: string; substepId: string; activityId: string };
  } | null>(null);
  const [actorAreaSigla, setActorAreaSigla] = useState("");
  const [actorPositionDescription, setActorPositionDescription] = useState("");
  const [processCreationTarget, setProcessCreationTarget] = useState<
    | { kind: "step"; stepId: string }
    | { kind: "subprocess"; stepId: string; substepId: string }
    | null
  >(null);
  const [createSystemRequest, setCreateSystemRequest] = useState<{
    stepId: string;
    query: string;
  } | null>(null);
  const [mappingAssistantOpen, setMappingAssistantOpen] = useState(false);
  const [mappingAssistantSource, setMappingAssistantSource] = useState<"docx" | "text">("docx");
  const [mappingAssistantText, setMappingAssistantText] = useState("");
  const [mappingAssistantBusy, setMappingAssistantBusy] = useState(false);
  const [mappingImport, setMappingImport] = useState<MappingDocumentImport | null>(null);
  const showMappingImportReview = false;
  const [assistantProcessStepTitle, setAssistantProcessStepTitle] = useState<string | null>(null);
  const [assistantCreatedProcesses, setAssistantCreatedProcesses] = useState<
    Record<string, CreatedProcess>
  >({});
  const mappingDocxInputRef = useRef<HTMLInputElement>(null);
  const [libraryCauseRows, setLibraryCauseRows] = useState<Record<string, boolean>>({});
  const [causeSearch, setCauseSearch] = useState<Record<string, string>>({});
  const selectedProcess = useMemo(
    () => catalogs.processes.find((process) => process.id === data.macroprocess.processId) ?? null,
    [catalogs.processes, data.macroprocess.processId],
  );
  const primaryProcessOptions = useMemo(
    () => catalogs.processes.filter((process) => process.status !== "Arquivado"),
    [catalogs.processes],
  );
  const flowProcessOptions = useMemo(() => {
    const allowedTypes = new Set(["process", "subprocess", "atividade", "tarefa"]);
    const base = catalogs.processes.filter(
      (process) => process.status !== "Arquivado" && allowedTypes.has(process.type),
    );
    const prepared = Object.values(assistantCreatedProcesses) as unknown as OrganizationProcess[];
    if (!selectedProcess) return [...base, ...prepared];
    const branchIds = new Set([selectedProcess.id]);
    let added = true;
    while (added) {
      added = false;
      catalogs.processes.forEach((process) => {
        if (process.parent_process_id && branchIds.has(process.parent_process_id)) {
          if (!branchIds.has(process.id)) added = true;
          branchIds.add(process.id);
        }
      });
    }
    return [
      ...base.filter((process) => branchIds.has(process.id)),
      ...prepared.filter((process) => !base.some((item) => item.id === process.id)),
    ];
  }, [assistantCreatedProcesses, catalogs.processes, selectedProcess]);
  const unmatchedImportedSteps = useMemo(
    () =>
      mappingImport?.steps.filter(
        (step) =>
          !assistantCreatedProcesses[normalizeLabel(step.title)] &&
          !flowProcessOptions.some(
            (process) => normalizeLabel(process.name) === normalizeLabel(step.title),
          ),
      ) ?? [],
    [assistantCreatedProcesses, flowProcessOptions, mappingImport],
  );
  const quantitativeStats = useMemo(
    () =>
      calculateMappingQuantitativeStats(data, [
        ...catalogs.processes,
        ...Object.values(assistantCreatedProcesses).filter(
          (process) => !catalogs.processes.some((item) => item.id === process.id),
        ),
      ]),
    [assistantCreatedProcesses, catalogs.processes, data],
  );

  // Cada etapa do fluxo AS IS começa recolhida; o usuário expande quando precisa.
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const [draggedStepId, setDraggedStepId] = useState<string | null>(null);
  const [draggedSubstep, setDraggedSubstep] = useState<{
    stepId: string;
    substepId: string;
  } | null>(null);
  const [draggedActivity, setDraggedActivity] = useState<{
    stepId: string;
    subprocessId: string;
    activityId: string;
  } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const toggleStep = (stepId: string) =>
    setOpenSteps((current) => ({ ...current, [stepId]: !current[stepId] }));

  useEffect(() => {
    if (!currentElaborator || data.meta.elaborador.trim()) return;
    update({ ...data, meta: { ...data.meta, elaborador: currentElaborator } });
  }, [currentElaborator, data, update]);

  useEffect(() => {
    const systems = reconcileDdpSystemsWithCatalog(data.systems, catalogs.systems);
    if (systems === data.systems) return;
    update({ ...data, systems });
  }, [catalogs.systems, data, update]);

  useEffect(() => {
    const steps = fillMissingActivityActors(data.steps);
    if (steps === data.steps) return;
    update({ ...data, steps });
  }, [data, update]);

  function findProcessValueChain(process: OrganizationProcess | null) {
    let current = process;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.value_chain_id) {
        return catalogs.valueChains.find((chain) => chain.id === current?.value_chain_id) ?? null;
      }
      current = current.parent_process_id
        ? (catalogs.processes.find((item) => item.id === current?.parent_process_id) ?? null)
        : null;
    }
    return null;
  }

  function selectPrimaryProcess(process: OrganizationProcess | null) {
    const valueChain = findProcessValueChain(process);
    update({
      ...data,
      meta: {
        ...data.meta,
        codigo: "",
        area: "",
        responsavel: "",
        valueChainId: "",
        valueChainName: "",
      },
      overview: {
        ...data.overview,
        donoProcesso: "",
        escopo: "",
      },
      macroprocess: {
        ...data.macroprocess,
        processId: process?.id ?? "",
        processVersion: 1,
        titulo: "",
        legenda: "",
      },
      legacy: {
        ...(data.legacy ?? {}),
        processName: process?.name ?? "",
        processCode: process?.code ?? "",
        processValueChainName: valueChain?.name ?? "",
        processArea: process?.department ?? "",
        processOwner: process?.owner ?? "",
      },
    });
  }

  const sectionProgress = {
    // Não contabilizamos campos preenchidos automaticamente (código, data de
    // hoje, modalidade e status já vêm com valor padrão) — só os campos que
    // dependem do usuário entram no cálculo de preenchimento.
    identification: completionPercent([data.meta.titulo, data.meta.elaborador, data.meta.revisor]),
    overview: completionPercent([data.overview.objetivo, data.overview.escopo, data.overview.kpis]),
    systems: completionPercent(data.systems.flatMap((system) => [system.nome, system.descricao])),
    flowStage: completionPercent([
      data.macroprocess.processId,
      data.macroprocess.src,
      data.macroprocess.titulo,
      data.macroprocess.legenda,
      ...data.steps.flatMap((step) => [
        step.processId,
        ...step.images.flatMap((image) => [image.src, image.titulo, image.legenda]),
        ...step.substeps.flatMap((substep) => [
          substep.processId,
          substep.codigo,
          substep.titulo,
          substep.descricao,
          substep.classificacao,
          ...substep.images.flatMap((image) => [image.src, image.titulo, image.legenda]),
          ...substep.activities.flatMap((activity) => [
            activity.codigo,
            activity.titulo,
            activity.descricao,
            activity.classificacao,
            ...activity.images.flatMap((image) => [image.src, image.titulo, image.legenda]),
          ]),
        ]),
      ]),
    ]),
    sipoc: completionPercent(
      data.sipocRows.flatMap((row) => [
        row.fornecedores,
        row.entradas,
        row.processo,
        row.saidas,
        row.clientes,
      ]),
    ),
    gaps: completionPercent(
      data.gaps.flatMap((gap) => [
        gap.causa,
        gap.descricao,
        gap.impacto,
        gap.acao,
        gap.responsavel,
        gap.prazo,
        gap.prioridade,
        gap.status,
      ]),
    ),
    nextSteps: completionPercent(
      data.nextSteps.flatMap((item) => [item.text, item.responsavel, item.prazo]),
    ),
    glossary: completionPercent(data.glossary.flatMap((item) => [item.termo, item.definicao])),
  };

  // Seções na ordem exata do relatório em Word — fonte única para o índice
  // lateral e para o medidor segmentado da barra de comando.
  const sections: MappingSectionInfo[] = [
    {
      key: "identification",
      num: "00",
      title: "Dados do Mapeamento",
      pct: sectionProgress.identification,
    },
    { key: "overview", num: "01", title: "Visão geral", pct: sectionProgress.overview },
    {
      key: "systems",
      num: "02",
      title: "Sistemas/Documentos envolvidos",
      pct: sectionProgress.systems,
    },
    { key: "sipoc", num: "03", title: "Análise SIPOC", pct: sectionProgress.sipoc },
    { key: "flowStage", num: "04", title: "Etapas do processo", pct: sectionProgress.flowStage },
    {
      key: "quantitative",
      num: "05",
      title: "Visão Quantitativa",
      pct: 100,
    },
    {
      key: "gaps",
      num: "06",
      title: "Oportunidades de melhoria",
      pct: sectionProgress.gaps,
    },
    { key: "nextSteps", num: "07", title: "Próximos passos", pct: sectionProgress.nextSteps },
    { key: "glossary", num: "08", title: "Glossário", pct: sectionProgress.glossary },
  ];
  const fillableSections = sections.filter((section) => section.key !== "quantitative");
  const overallPct = Math.round(
    fillableSections.reduce((sum, section) => sum + section.pct, 0) / fillableSections.length,
  );

  // O formulário está pronto para exibir as seções quando há um processo
  // selecionado OU quando já existe conteúdo salvo (documento aberto para
  // edição — mesmo que o processo vinculado não esteja no catálogo atual). O
  // estado vazio ("Selecione um processo") só vale para um mapeamento novo.
  const mappingReady =
    !!selectedProcess || !!data.macroprocess.processId || !!data.meta.codigo || !!data.meta.titulo;

  const [activeSection, setActiveSection] = useState("identification");
  const [openNonce, setOpenNonce] = useState(0);
  const [openTarget, setOpenTarget] = useState<string | null>(null);

  function goToSection(key: string) {
    setActiveSection(key);
    setOpenTarget(key);
    setOpenNonce((n) => n + 1);
    window.requestAnimationFrame(() => {
      document.getElementById(`sec-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Scrollspy: destaca no índice a última seção cujo topo já cruzou a linha
  // logo abaixo da barra de comando fixa (≈ a seção que está sendo lida).
  useEffect(() => {
    if (!mappingReady) return;
    const sectionKeys = [
      "identification",
      "overview",
      "systems",
      "sipoc",
      "flowStage",
      "quantitative",
      "gaps",
      "nextSteps",
      "glossary",
    ];
    function onScroll() {
      const line = 280;
      let current = sectionKeys[0];
      for (const key of sectionKeys) {
        const el = document.getElementById(`sec-${key}`);
        if (el && el.getBoundingClientRect().top <= line) current = key;
      }
      setActiveSection(current);
    }
    onScroll();
    // Captura scroll de qualquer contêiner (a página usa scroll na janela, mas
    // capture=true garante que funcione mesmo se houver rolagem aninhada).
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [mappingReady]);

  // Estado de salvamento honesto: marca "não salvo" ao editar; limpa quando o
  // pai sinaliza um salvamento concluído (savedNonce). O salvamento pode alterar
  // o próprio documento (reserva de código) — a flag ignora essa mudança.
  const [dirty, setDirty] = useState(false);
  const dataMounted = useRef(false);
  const justSaved = useRef(false);
  useEffect(() => {
    if (!dataMounted.current) {
      dataMounted.current = true;
      return;
    }
    if (justSaved.current) {
      justSaved.current = false;
      return;
    }
    setDirty(true);
  }, [data]);
  useEffect(() => {
    if (!savedNonce) return;
    justSaved.current = true;
    setDirty(false);
    setMappingImport(null);
    setAssistantCreatedProcesses({});
  }, [savedNonce]);

  const saveState: "idle" | "dirty" | "saving" | "saved" = saving
    ? "saving"
    : dirty
      ? "dirty"
      : savedNonce
        ? "saved"
        : "idle";

  useUnsavedChangesGuard(dirty && !saving);

  // Atalho ⌘S / Ctrl+S para salvar o preenchimento.
  useEffect(() => {
    if (!onSave) return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (mappingReady) onSave?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave, mappingReady]);

  function updateStep(stepId: string, patch: Partial<DdpFlowStep>) {
    update({
      ...data,
      steps: renumberFlowSteps(
        data.steps.map((item) => (item.id === stepId ? { ...item, ...patch } : item)),
      ),
    });
  }

  function updateSubstep(stepId: string, substepId: string, patch: Partial<DdpFlowSubstep>) {
    update({
      ...data,
      steps: renumberFlowSteps(
        data.steps.map((step) =>
          step.id === stepId
            ? {
                ...step,
                substeps: step.substeps.map((substep) =>
                  substep.id === substepId ? { ...substep, ...patch } : substep,
                ),
              }
            : step,
        ),
      ),
    });
  }

  function updateActivity(
    stepId: string,
    subprocessId: string,
    activityId: string,
    patch: Partial<DdpFlowActivity>,
  ) {
    update({
      ...data,
      steps: renumberFlowSteps(
        data.steps.map((step) =>
          step.id === stepId
            ? {
                ...step,
                substeps: step.substeps.map((substep) =>
                  substep.id === subprocessId
                    ? {
                        ...substep,
                        activities: substep.activities.map((activity) =>
                          activity.id === activityId ? { ...activity, ...patch } : activity,
                        ),
                      }
                    : substep,
                ),
              }
            : step,
        ),
      ),
    });
  }

  function updateActorTarget(
    target: NonNullable<typeof actorCatalogRequest>["target"],
    actorType: FlowActorType,
    actorName: string,
  ) {
    if (target.kind === "activity") {
      updateActivity(target.stepId, target.substepId, target.activityId, {
        actorType,
        actorName,
      });
      return;
    }
    updateSubstep(target.stepId, target.substepId, { actorType, actorName });
  }

  async function saveActorCatalog() {
    if (!actorCatalogRequest) return;
    const name = actorCatalogRequest.initial.trim();
    if (!name) {
      toast.error("Informe o nome do cadastro.");
      return;
    }
    try {
      if (!isDemo) {
        if (actorCatalogRequest.kind === "area") {
          const sigla = normalizeSigla(actorAreaSigla || name);
          if (sigla.length !== 3) {
            toast.error("Informe uma sigla de 3 letras para a área.");
            return;
          }
          await saveArea({ data: { organizationId, name, sigla } });
        } else {
          await savePosition({
            data: {
              organizationId,
              title: name,
              description: actorPositionDescription.trim() || null,
            },
          });
        }
        await onCatalogCreated?.();
      }
      updateActorTarget(
        actorCatalogRequest.target,
        actorCatalogRequest.kind === "area" ? "area" : "position",
        name,
      );
      toast.success(actorCatalogRequest.kind === "area" ? "Área cadastrada." : "Cargo cadastrado.");
      setActorCatalogRequest(null);
      setActorAreaSigla("");
      setActorPositionDescription("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar.");
    }
  }

  function renumberFlowSteps(steps: DdpFlowStep[]) {
    return steps.map((step, stepIndex) => ({
      ...step,
      substeps: step.substeps.map((substep, substepIndex) => {
        const activities = substep.activities.map((activity, activityIndex) => ({
          ...activity,
          codigo: `${stepIndex + 1}.${substepIndex + 1}.${activityIndex + 1}`,
        }));
        return {
          ...substep,
          codigo: `${stepIndex + 1}.${substepIndex + 1}`,
          systemIds:
            substep.tipo === "subprocesso"
              ? Array.from(new Set(activities.flatMap((activity) => activity.systemIds)))
              : substep.systemIds,
          activities,
        };
      }),
    }));
  }

  function moveItem<T>(items: T[], fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function reorderSteps(targetStepId: string) {
    if (!draggedStepId || draggedStepId === targetStepId) return;
    const fromIndex = data.steps.findIndex((step) => step.id === draggedStepId);
    const toIndex = data.steps.findIndex((step) => step.id === targetStepId);
    if (fromIndex < 0 || toIndex < 0) return;
    update({
      ...data,
      steps: renumberFlowSteps(moveItem(data.steps, fromIndex, toIndex)),
    });
    setDraggedStepId(null);
  }

  function reorderSubsteps(targetStepId: string, targetSubstepId: string) {
    if (
      !draggedSubstep ||
      draggedSubstep.stepId !== targetStepId ||
      draggedSubstep.substepId === targetSubstepId
    ) {
      return;
    }
    const step = data.steps.find((item) => item.id === targetStepId);
    if (!step) return;
    const fromIndex = step.substeps.findIndex((item) => item.id === draggedSubstep.substepId);
    const toIndex = step.substeps.findIndex((item) => item.id === targetSubstepId);
    if (fromIndex < 0 || toIndex < 0) return;
    update({
      ...data,
      steps: renumberFlowSteps(
        data.steps.map((item) =>
          item.id === targetStepId
            ? { ...item, substeps: moveItem(item.substeps, fromIndex, toIndex) }
            : item,
        ),
      ),
    });
    setDraggedSubstep(null);
  }

  function reorderActivities(
    targetStepId: string,
    targetSubprocessId: string,
    targetActivityId: string,
  ) {
    if (
      !draggedActivity ||
      draggedActivity.stepId !== targetStepId ||
      draggedActivity.subprocessId !== targetSubprocessId ||
      draggedActivity.activityId === targetActivityId
    ) {
      return;
    }
    const step = data.steps.find((item) => item.id === targetStepId);
    const subprocess = step?.substeps.find((item) => item.id === targetSubprocessId);
    if (!subprocess) return;
    const fromIndex = subprocess.activities.findIndex(
      (item) => item.id === draggedActivity.activityId,
    );
    const toIndex = subprocess.activities.findIndex((item) => item.id === targetActivityId);
    if (fromIndex < 0 || toIndex < 0) return;
    updateStep(targetStepId, {
      substeps: step!.substeps.map((item) =>
        item.id === targetSubprocessId
          ? { ...item, activities: moveItem(item.activities, fromIndex, toIndex) }
          : item,
      ),
    });
    setDraggedActivity(null);
  }

  function updateGap(gapId: string, patch: Partial<GapItem>) {
    update({
      ...data,
      gaps: data.gaps.map((gap) => (gap.id === gapId ? { ...gap, ...patch } : gap)),
    });
  }

  function setGapLibraryMode(gapId: string, enabled: boolean) {
    setLibraryCauseRows((current) => ({ ...current, [gapId]: enabled }));
    setCauseSearch((current) => {
      const next = { ...current };
      delete next[gapId];
      return next;
    });
    if (!enabled) updateGap(gapId, { sharedCauseId: "" });
  }

  function applySharedCauseToGap(gapId: string, causeId: string) {
    const cause = catalogs.causes.find((item) => item.id === causeId);
    if (!cause) {
      updateGap(gapId, { sharedCauseId: "" });
      return;
    }
    setLibraryCauseRows((current) => ({ ...current, [gapId]: true }));
    setCauseSearch((current) => {
      const next = { ...current };
      delete next[gapId];
      return next;
    });
    updateGap(gapId, gapPatchFromOrganizationCause(cause));
  }

  function selectSharedCauseByTitle(gapId: string, value: string) {
    setCauseSearch((current) => ({ ...current, [gapId]: value }));
    const selected = catalogs.causes.find(
      (cause) => normalizeLabel(cause.title) === normalizeLabel(value),
    );
    if (selected) applySharedCauseToGap(gapId, selected.id);
  }

  async function handleMappingDocxImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMappingAssistantBusy(true);
    try {
      const { parseDocxMapping } = await import("@/lib/docx-mapping-import");
      setAssistantCreatedProcesses({});
      applyMappingImport(await parseDocxMapping(file));
      setMappingAssistantOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível interpretar o DOCX.");
    } finally {
      setMappingAssistantBusy(false);
    }
  }

  async function handleMappingTextImport() {
    try {
      const { parseStructuredMappingText } = await import("@/lib/docx-mapping-import");
      setAssistantCreatedProcesses({});
      applyMappingImport(parseStructuredMappingText(mappingAssistantText));
      setMappingAssistantOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível interpretar o texto.");
    }
  }

  function mappingImage(image: { name: string; src: string }): ModuleImage {
    return { id: id("mapimg"), titulo: "", legenda: "", src: image.src };
  }

  function applyMappingImport(importResult: MappingDocumentImport | null = mappingImport) {
    if (!importResult) return;
    const preparedProcesses: Record<string, CreatedProcess> = {};
    const nowIso = new Date().toISOString();
    const referencedSystemNames = importResult.steps.flatMap((step) => [
      step.system,
      ...step.substeps.flatMap((substep) => [
        ...substep.systemNames,
        ...substep.activities.flatMap((activity) => activity.systemNames),
      ]),
    ]);
    const systemImports = [
      ...importResult.systems,
      ...referencedSystemNames
        .filter(Boolean)
        .filter(
          (name) =>
            !importResult.systems.some(
              (system) => normalizeLabel(system.name) === normalizeLabel(name),
            ),
        )
        .map((name) => ({ name, description: "", modality: "" })),
    ].filter(
      (system, index, rows) =>
        system.name.trim() &&
        rows.findIndex(
          (candidate) => normalizeLabel(candidate.name) === normalizeLabel(system.name),
        ) === index,
    );
    const importedSystems = systemImports.map((system) => {
      const catalogSystem = catalogs.systems.find(
        (item) => normalizeLabel(item.name) === normalizeLabel(system.name),
      );
      return {
        id: id("sys"),
        systemId: catalogSystem?.id ?? "",
        nome: catalogSystem?.name ?? system.name,
        tipo: normalizeSystemModality(catalogSystem?.modality || system.modality),
        dono: "",
        criticidade: "Média",
        descricao: system.description || catalogSystem?.description || "",
      };
    });
    const systemIdsForNames = (names: string[]) =>
      Array.from(
        new Set(
          names.flatMap((name) => {
            const system = importedSystems.find(
              (item) => normalizeLabel(item.nome) === normalizeLabel(name),
            );
            return system ? [system.id] : [];
          }),
        ),
      );
    const findOrPrepareProcess = (
      title: string,
      parentProcessId: string | null,
      department: string,
      owner: string,
      description: string,
    ) => {
      const normalizedTitle = normalizeLabel(title);
      let process =
        preparedProcesses[normalizedTitle] ??
        assistantCreatedProcesses[normalizedTitle] ??
        flowProcessOptions.find((item) => normalizeLabel(item.name) === normalizedTitle);
      if (!process) {
        process = {
          id: `pending-process:${crypto.randomUUID()}`,
          organization_id: organizationId ?? "",
          current_version: 1,
          code: null,
          name: title,
          type: "subprocess",
          value_chain_id: selectedProcess?.value_chain_id ?? null,
          parent_process_id: parentProcessId,
          department: department || selectedProcess?.department || null,
          owner: owner || selectedProcess?.owner || null,
          description: description || null,
          status: "Ativo",
          created_at: nowIso,
          updated_at: nowIso,
        };
        preparedProcesses[normalizedTitle] = process;
        void onSuggestedProcessPrepared(process);
      }
      return process;
    };
    const importedSteps = importResult.steps.map((step): DdpFlowStep => {
      const process = findOrPrepareProcess(
        step.title,
        selectedProcess?.id ?? data.macroprocess.processId ?? null,
        step.area,
        step.responsible,
        step.activity || step.notes,
      );
      return {
        id: id("step"),
        processId: process?.id ?? "",
        processVersion: 1,
        etapa: process?.name ?? step.title,
        responsavel: step.responsible || process?.owner || "",
        entrada: step.input,
        atividade: step.activity || process?.description || "",
        saida: step.output,
        sistema: step.system,
        risco: step.risk,
        observacoes: step.notes,
        images: step.images.map(mappingImage),
        substeps: step.substeps.map((substep, substepIndex) => {
          const subprocess =
            substep.kind === "subprocess"
              ? findOrPrepareProcess(
                  substep.title,
                  process?.id ?? null,
                  step.area,
                  step.responsible,
                  substep.description,
                )
              : null;
          const activities = substep.activities.map((activity, activityIndex) => ({
            id: id("activity"),
            codigo: `1.${substepIndex + 1}.${activityIndex + 1}`,
            titulo: activity.title,
            descricao: activity.description,
            classificacao: normalizeFlowExecutionType(activity.executionType),
            actorType: normalizeFlowActorType(activity.actorType),
            actorName: activity.actorName,
            systemIds: systemIdsForNames(activity.systemNames),
            images: activity.images.map(mappingImage),
          }));
          return {
            id: id("substep"),
            processId: subprocess?.id ?? "",
            processVersion: 1,
            codigo: `1.${substepIndex + 1}`,
            titulo: substep.title,
            descricao: substep.description,
            tipo: substep.kind === "subprocess" ? "subprocesso" : "atividade",
            classificacao: normalizeFlowExecutionType(substep.executionType),
            actorType: normalizeFlowActorType(substep.actorType),
            actorName: substep.actorName,
            systemIds:
              substep.kind === "subprocess"
                ? Array.from(new Set(activities.flatMap((activity) => activity.systemIds)))
                : systemIdsForNames(substep.systemNames),
            images: substep.images.map(mappingImage),
            activities,
          };
        }),
      };
    });
    const nextState: DdpState = {
      ...data,
      meta: {
        ...data.meta,
        titulo: importResult.title || data.meta.titulo,
        modalidade: importResult.modality || data.meta.modalidade,
        data: dateInputValue(importResult.date) || data.meta.data,
        elaborador: importResult.author || data.meta.elaborador,
        revisor: importResult.reviewer || data.meta.revisor,
      },
      overview: {
        ...data.overview,
        objetivo: importResult.objective || data.overview.objetivo,
        escopo: importResult.scope || data.overview.escopo,
        kpis: importResult.context || data.overview.kpis,
      },
      systems: importedSystems.length ? importedSystems : data.systems,
      sipocRows: importResult.sipoc.length
        ? importResult.sipoc.map((row) => ({
            id: id("sipoc"),
            fornecedores: row.suppliers,
            entradas: row.inputs,
            processo: row.process,
            saidas: row.outputs,
            clientes: row.customers,
          }))
        : data.sipocRows,
      macroprocess: importResult.macroImages.length
        ? {
            ...data.macroprocess,
            titulo: "Diagrama do processo",
            legenda: "",
            src: importResult.macroImages[0].src,
          }
        : data.macroprocess,
      steps: importedSteps.length
        ? fillMissingActivityActors(renumberFlowSteps(importedSteps))
        : data.steps,
      gaps: importResult.gaps.length
        ? importResult.gaps.map((gap) => ({
            id: id("gap"),
            sharedCauseId: "",
            causa: gap.cause,
            descricao: gap.description,
            impacto: gap.impact,
            acao: gap.action,
            responsavel: gap.responsible,
            prazo: gap.deadline,
            prioridade: CAUSE_PRIORITY_OPTIONS.includes(gap.priority as never)
              ? gap.priority
              : "Média",
            status: normalizeCauseStatus(gap.status),
            comentarios: [],
          }))
        : data.gaps,
      nextSteps: importResult.nextSteps.length
        ? importResult.nextSteps.map((item) => ({
            id: id("next"),
            text: item.text,
            responsavel: item.responsible,
            prazo: dateInputValue(item.deadline) || item.deadline,
          }))
        : data.nextSteps,
      glossary: importResult.glossary.length
        ? importResult.glossary.map((item) => ({
            id: id("gloss"),
            termo: item.term,
            definicao: item.definition,
          }))
        : data.glossary,
    };
    if (Object.keys(preparedProcesses).length) {
      setAssistantCreatedProcesses((current) => ({ ...current, ...preparedProcesses }));
    }
    update(nextState);
    setMappingImport(importResult);
    if (Object.keys(preparedProcesses).length) {
      toast.warning(
        `Conteúdo aplicado com ${Object.keys(preparedProcesses).length} subprocesso(s) preparado(s). Revise antes de salvar.`,
      );
    } else {
      toast.success("Conteúdo aplicado. Revise os campos antes de salvar o mapeamento.");
    }
  }

  function requestStatusChange(status: string) {
    if (status === (data.meta.status || "Em andamento")) return;
    setPendingStatus(status);
  }

  function confirmStatusChange() {
    if (!pendingStatus) return;
    update({ ...data, meta: { ...data.meta, status: pendingStatus } });
    setPendingStatus(null);
  }

  return (
    <div className="grid gap-5">
      {actorCatalogRequest ? (
        <Modal
          title={actorCatalogRequest.kind === "area" ? "Cadastrar área" : "Cadastrar cargo"}
          subtitle="O cadastro ficará disponível para esta e para as próximas atividades."
          onClose={() => setActorCatalogRequest(null)}
        >
          <div className="grid gap-4">
            <Field
              label={actorCatalogRequest.kind === "area" ? "Nome da área" : "Título do cargo"}
              value={actorCatalogRequest.initial}
              onChange={(initial) => setActorCatalogRequest({ ...actorCatalogRequest, initial })}
            />
            {actorCatalogRequest.kind === "area" ? (
              <Field
                label="Sigla"
                value={actorAreaSigla}
                onChange={(value) =>
                  setActorAreaSigla(
                    value
                      .replace(/[^A-Za-z]/g, "")
                      .toUpperCase()
                      .slice(0, 3),
                  )
                }
              />
            ) : (
              <TextArea
                label="Descrição"
                value={actorPositionDescription}
                rows={3}
                onChange={setActorPositionDescription}
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setActorCatalogRequest(null)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveActorCatalog}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {createProcessName !== null ? (
        <ProcessRegistrationDialog
          organizationId={organizationId}
          isDemo={isDemo}
          codeSettings={codeSettings}
          initialName={createProcessName}
          initialType={processCreationTarget?.kind === "subprocess" ? "subprocess" : "process"}
          deferPersistence={Boolean(assistantProcessStepTitle || processCreationTarget)}
          onClose={() => {
            setCreateProcessName(null);
            setAssistantProcessStepTitle(null);
            setProcessCreationTarget(null);
          }}
          onCreated={async (process) => {
            const importedStepTitle = assistantProcessStepTitle;
            if (importedStepTitle) {
              await onSuggestedProcessPrepared(process);
              update({
                ...data,
                steps: renumberFlowSteps(
                  data.steps.map((step) =>
                    normalizeLabel(step.etapa) === normalizeLabel(importedStepTitle)
                      ? {
                          ...step,
                          processId: process.id,
                          processVersion: 1,
                          etapa: process.name,
                          responsavel: step.responsavel || process.owner || "",
                        }
                      : step,
                  ),
                ),
              });
              setAssistantCreatedProcesses((current) => ({
                ...current,
                [normalizeLabel(importedStepTitle)]: process,
              }));
              toast.success("Processo associado à etapa sugerida.");
              return;
            }
            if (processCreationTarget) {
              await onSuggestedProcessPrepared(process);
              setAssistantCreatedProcesses((current) => ({
                ...current,
                [normalizeLabel(process.name)]: process,
              }));
              if (processCreationTarget.kind === "step") {
                updateStep(processCreationTarget.stepId, {
                  processId: process.id,
                  processVersion: 1,
                  etapa: process.name,
                  responsavel: process.owner || "",
                  atividade: process.description || "",
                });
              } else {
                updateSubstep(processCreationTarget.stepId, processCreationTarget.substepId, {
                  processId: process.id,
                  processVersion: 1,
                  titulo: process.name,
                  descricao: process.description || "",
                });
              }
              toast.success(
                processCreationTarget.kind === "subprocess"
                  ? "Subprocesso preparado e associado."
                  : "Processo preparado e associado.",
              );
              return;
            }
            await onProcessCreated(process);
            selectPrimaryProcess(process as unknown as OrganizationProcess);
          }}
        />
      ) : null}
      {createSystemRequest !== null ? (
        <SystemRegistrationDialog
          organizationId={organizationId}
          isDemo={isDemo}
          initialName={createSystemRequest.query}
          deferPersistence
          onClose={() => setCreateSystemRequest(null)}
          onCreated={(system) => {
            const { stepId } = createSystemRequest;
            update({
              ...data,
              systems: data.systems.map((item) =>
                item.id === stepId
                  ? {
                      ...item,
                      systemId: system.id,
                      nome: system.name,
                      tipo: normalizeSystemModality(system.modality),
                      descricao: item.descricao || system.description || "",
                    }
                  : item,
              ),
            });
            setCreateSystemRequest(null);
          }}
        />
      ) : null}
      <input
        ref={mappingDocxInputRef}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={handleMappingDocxImport}
        className="hidden"
      />
      {mappingAssistantOpen ? (
        <Modal
          title="Assistente de preenchimento"
          subtitle="Importe um DOCX ou cole um mapeamento estruturado. O conteúdo será aplicado diretamente ao formulário para revisão."
          onClose={() => setMappingAssistantOpen(false)}
        >
          <div className="grid gap-4">
            <div className="grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1">
              {(
                [
                  ["docx", "Importar DOCX", FileText],
                  ["text", "Colar texto", ListChecks],
                ] as const
              ).map(([source, label, Icon]) => (
                <button
                  key={source}
                  type="button"
                  onClick={() => setMappingAssistantSource(source)}
                  className={[
                    "inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition",
                    mappingAssistantSource === source
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            {mappingAssistantSource === "docx" ? (
              <button
                type="button"
                disabled={mappingAssistantBusy}
                onClick={() => mappingDocxInputRef.current?.click()}
                className="grid min-h-44 place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center transition hover:border-primary/60 hover:bg-primary/5 disabled:opacity-50"
              >
                <span>
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="mt-3 block font-bold text-foreground">
                    {mappingAssistantBusy ? "Lendo mapeamento..." : "Selecionar arquivo DOCX"}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    O processamento ocorre no navegador, sem envio para serviços externos.
                  </span>
                </span>
              </button>
            ) : (
              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className={fieldLabelClass}>Mapeamento estruturado</span>
                  <textarea
                    value={mappingAssistantText}
                    onChange={(event) => setMappingAssistantText(event.target.value)}
                    placeholder={
                      "00 Dados do Mapeamento\nTítulo: Recebimento e gestão de demandas\nModalidade: AS IS\n\n01 Visão geral\nObjetivo: Documentar o processo...\nEscopo: Da entrada até a conclusão...\nContexto: Cenário atual...\n\n02 Sistemas/Documentos envolvidos\nSistema: Fluig\nClassificação: Sistemas corporativos\nDescrição: Registro e acompanhamento...\nDocumento: Política de atendimento\nClassificação: Documentos e comunicações\nDescrição: Regras aplicáveis ao processo...\n\n03 Análise SIPOC\nFornecedores | Entradas | Processo | Saídas | Clientes\nÁrea solicitante | Demanda | Tratar demanda | Entrega | Solicitante\n\n04 Etapas do processo\nProcesso: Receber demanda\nÁrea: Atendimento\nResponsável: Analista\nDescrição do processo: Receber e qualificar a solicitação\nAtividade: Registrar solicitação\nForma de execução: Manual no sistema\nÁrea responsável pela atividade: Atendimento\nSistemas/Documentos: Fluig\nDescrição: O Atendimento registra os dados obrigatórios.\nSubprocesso: Validar informações\nDescrição: Conferir a consistência dos dados\nAtividade: Conferir campos\nForma de execução: Manual no sistema\nÁrea responsável pela atividade: Qualidade\nSistemas/Documentos: Fluig, Política de atendimento\nDescrição: A Qualidade verifica os campos e documentos recebidos.\n\n06 Oportunidades de melhoria\nOportunidade: Entrada incompleta\nImpacto: Retrabalho\nAção proposta: Tornar campos obrigatórios\n\n07 Próximos passos\n1. Revisar formulário de entrada\nResponsável: Coordenação\nPrazo: 31/07/2026\n\n08 Glossário\nSLA | Acordo de nível de serviço"
                    }
                    className={`${fieldInputBase} min-h-72 resize-y p-3 font-data text-xs leading-6`}
                  />
                  <span className="text-xs text-muted-foreground">
                    Para atribuir a execução, use “Área responsável pela atividade:”. Sem indicação
                    explícita, o campo será preenchido como “A definir”.
                  </span>
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setMappingAssistantOpen(false)}
                    className={secondaryButtonClass}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={!mappingAssistantText.trim()}
                    onClick={handleMappingTextImport}
                    className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <WandSparkles className="h-4 w-4" />
                    Preencher formulário
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      ) : null}
      {showMappingImportReview && mappingImport ? (
        <Modal
          title="Revisar preenchimento sugerido"
          subtitle="Confira o reconhecimento antes de aplicar. O processo selecionado, o código e os vínculos cadastrais serão preservados."
          onClose={() => setMappingImport(null)}
        >
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-lg border border-border bg-muted/35 p-4 sm:grid-cols-[1fr_auto]">
              <div>
                <div className={fieldLabelClass}>Mapeamento identificado</div>
                <div className="mt-1 font-bold text-foreground">
                  {mappingImport.title || mappingImport.fileName}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {[mappingImport.modality, mappingImport.date, mappingImport.author]
                    .filter(Boolean)
                    .join(" · ") || "Metadados não identificados"}
                </div>
              </div>
              <div className="min-w-44">
                <div className={fieldLabelClass}>Estrutura reconhecida</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {mappingImport.stats.sections} seções · {mappingImport.stats.steps} etapas
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {mappingImport.stats.substeps} atividades · {mappingImport.stats.images} imagens
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [
                  "Visão geral",
                  [mappingImport.objective, mappingImport.scope, mappingImport.context].filter(
                    Boolean,
                  ).length,
                  "3 campos",
                ],
                ["Sistemas", mappingImport.systems.length, "registros"],
                ["SIPOC", mappingImport.sipoc.length, "linhas"],
                ["Etapas", mappingImport.steps.length, "registros"],
                ["Gaps", mappingImport.gaps.length, "registros"],
                ["Próximos passos", mappingImport.nextSteps.length, "registros"],
                ["Glossário", mappingImport.glossary.length, "termos"],
                ["Imagens", mappingImport.stats.images, "arquivos"],
              ].map(([label, count, suffix]) => (
                <div key={String(label)} className="rounded-lg border border-border px-3 py-2">
                  <div className={fieldLabelClass}>{label}</div>
                  <div className="mt-1 text-sm font-semibold text-foreground">
                    {count} {suffix}
                  </div>
                </div>
              ))}
            </div>
            {mappingImport.warnings.length ? (
              <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100">
                <div className="flex items-center gap-2 font-bold">
                  <TriangleAlert className="h-4 w-4" /> Pontos para revisão
                </div>
                <ul className="mt-2 grid gap-1 pl-5">
                  {mappingImport.warnings.map((warning) => (
                    <li key={warning} className="list-disc">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {unmatchedImportedSteps.length ? (
              <div className="grid gap-3 rounded-lg border border-amber-300/60 bg-amber-50/60 p-4 text-sm text-foreground dark:border-amber-800 dark:bg-amber-950/20">
                <div>
                  <div className="flex items-center gap-2 font-bold">
                    <TriangleAlert className="h-4 w-4 text-amber-700 dark:text-amber-300" />
                    Processos não encontrados
                  </div>
                  <p className="mt-1 text-muted-foreground">
                    Cadastre os processos sugeridos para que estas etapas também sejam aplicadas ao
                    formulário.
                  </p>
                </div>
                <div className="grid gap-2">
                  {unmatchedImportedSteps.map((step, index) => (
                    <div
                      key={`${normalizeLabel(step.title)}-${index}`}
                      className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent font-data text-xs font-bold text-[var(--gold)]">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-foreground" title={step.title}>
                          {step.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Nenhum processo cadastrado possui este nome.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAssistantProcessStepTitle(step.title);
                          setCreateProcessName(step.title);
                        }}
                        className={`${secondaryButtonClass} shrink-0`}
                      >
                        <Plus className="h-4 w-4" />
                        Cadastrar processo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {Object.keys(assistantCreatedProcesses).length ? (
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/25 dark:text-emerald-100">
                <div className="flex items-center gap-2 font-bold">
                  <CheckCircle2 className="h-4 w-4" />
                  {Object.keys(assistantCreatedProcesses).length} processo(s) preparado(s)
                </div>
                <p className="mt-1 opacity-80">
                  Os novos processos ainda não foram gravados. Eles serão cadastrados somente ao
                  salvar o mapeamento.
                </p>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setMappingImport(null)}
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
              <button type="button" onClick={applyMappingImport} className={primaryButtonClass}>
                Aplicar ao formulário
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      <FlowCommandBar
        code={data.meta.codigo}
        sections={sections}
        overallPct={overallPct}
        saveState={saveState}
        canSave={mappingReady}
        onSave={onSave}
        onPreview={onPreview}
        eyebrow="Processos · Mapeamento"
        title="Formulário de Preenchimento"
        saveTitle="Salvar o preenchimento do mapeamento"
        previewTitle="Visualizar o que está sendo preenchido"
        processControl={
          <div className="grid items-end gap-2 sm:grid-cols-[minmax(280px,1fr)_auto]">
            <RegisteredProcessSelect
              required
              label="Processo do mapeamento"
              value={data.macroprocess.processId ?? ""}
              processes={primaryProcessOptions}
              placeholder="Selecione o processo que será mapeado"
              onSelect={selectPrimaryProcess}
              displayName={(process) => process.name}
              onRequestCreate={(name) => setCreateProcessName(name)}
            />
            <button
              type="button"
              disabled={!mappingReady}
              onClick={() => setMappingAssistantOpen(true)}
              className={`${secondaryButtonClass} h-10 disabled:cursor-not-allowed disabled:opacity-50`}
              title={
                mappingReady
                  ? "Preencher a partir de DOCX ou texto"
                  : "Selecione um processo primeiro"
              }
            >
              <WandSparkles className="h-4 w-4" />
              Assistente de preenchimento
            </button>
          </div>
        }
      />
      {mappingImport ? (
        <div className="grid gap-3 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-bold">Preenchimento sugerido aplicado</div>
              <p className="mt-0.5 text-xs opacity-80">
                Revise todas as seções antes de salvar. Foram reconhecidas{" "}
                {mappingImport.stats.steps} etapa(s) e {mappingImport.stats.substeps} atividade(s).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMappingImport(null)}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md hover:bg-black/5 dark:hover:bg-white/10"
              aria-label="Fechar aviso de revisão"
              title="Fechar aviso"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {mappingImport.warnings.length ? (
            <ul className="grid gap-1 border-t border-amber-300/60 pt-2 text-xs dark:border-amber-800">
              {mappingImport.warnings.map((warning) => (
                <li key={warning}>• {warning}</li>
              ))}
            </ul>
          ) : null}
          {unmatchedImportedSteps.length ? (
            <div className="grid gap-2 border-t border-amber-300/60 pt-2 dark:border-amber-800">
              <div className="text-xs font-bold">
                Etapas sem processo correspondente ({unmatchedImportedSteps.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {unmatchedImportedSteps.map((step) => (
                  <button
                    key={step.title}
                    type="button"
                    onClick={() => {
                      setAssistantProcessStepTitle(step.title);
                      setCreateProcessName(step.title);
                    }}
                    className="inline-flex min-w-0 items-center gap-1.5 rounded-md border border-amber-400/70 bg-card px-2.5 py-1.5 text-left text-xs font-semibold text-foreground hover:border-primary"
                    title={`Cadastrar processo: ${step.title}`}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="max-w-72 truncate">{step.title}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs opacity-75">
                Os processos sugeridos só serão gravados quando o mapeamento for salvo.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
      {!mappingReady ? (
        <div className="mt-2 grid place-items-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <div className="grid max-w-sm gap-2">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent text-[var(--gold)]">
              <Lock className="h-5 w-5" />
            </span>
            <h2 className="font-display text-lg font-bold text-foreground">
              Selecione um processo para começar
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Escolha, no campo acima, o processo cadastrado que será mapeado. As seções do
              relatório serão liberadas em seguida.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-2 grid gap-5 lg:grid-cols-[218px_minmax(0,1fr)] lg:items-start">
          <MappingSectionNav sections={sections} activeKey={activeSection} onSelect={goToSection} />
          <div className="grid min-w-0 gap-4">
            <Panel
              id="sec-identification"
              num="01"
              openSignal={openTarget === "identification" ? openNonce : 0}
              title="Dados do Mapeamento"
              progress={sectionProgress.identification}
              defaultOpen={mappingReady}
            >
              <div className="grid gap-4 md:grid-cols-3">
                {data.meta.codigo ? (
                  <div className="md:col-span-3 rounded-xl border border-[color-mix(in_oklab,var(--gold)_45%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_10%,var(--card))] px-4 py-3 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[color-mix(in_oklab,var(--gold)_80%,var(--foreground))]">
                          Código gerado do mapeamento
                        </span>
                        <strong className="mt-1 block font-data text-2xl font-black tracking-[0.14em] text-foreground">
                          {data.meta.codigo}
                        </strong>
                      </div>
                      <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                        Registro único
                      </span>
                    </div>
                  </div>
                ) : null}
                <Field
                  label="Título do Mapeamento"
                  value={data.meta.titulo}
                  onChange={(titulo) =>
                    update({
                      ...data,
                      meta: { ...data.meta, titulo: titulo.toLocaleUpperCase("pt-BR") },
                    })
                  }
                />
                {/* Ordem abaixo espelha a tabela de identificação do relatório Word
              (Tipo/Dono/Área/Modalidade, Elaborador/Revisor/Data). Tipo, Dono e
              Área são automáticos — não editáveis aqui. */}
                <ReadOnlyField label="Código do processo" value={selectedProcess?.code ?? ""} />
                <ReadOnlyField
                  label="Cadeia de valor"
                  value={(
                    findProcessValueChain(selectedProcess)?.name ??
                    data.legacy?.processValueChainName?.toString() ??
                    data.meta.valueChainName ??
                    ""
                  )
                    .trim()
                    .toLocaleUpperCase("pt-BR")}
                />
                <ReadOnlyField label="Tipo" value="Relatório de Mapeamento de Processo" />
                <ReadOnlyField
                  label="Dono"
                  value={
                    selectedProcess?.owner ??
                    data.overview.donoProcesso ??
                    data.meta.responsavel ??
                    ""
                  }
                />
                <ReadOnlyField
                  label="Área"
                  value={selectedProcess?.department ?? data.meta.area ?? ""}
                />
                <SelectField
                  label="Modalidade"
                  value={data.meta.modalidade || "AS IS"}
                  options={["AS IS", "TO BE"]}
                  onChange={(modalidade) =>
                    update({
                      ...data,
                      meta: { ...data.meta, modalidade: modalidade as "AS IS" | "TO BE" },
                    })
                  }
                />
                <UserSearchField
                  label="Elaborador"
                  value={data.meta.elaborador}
                  options={userOptions}
                  onChange={(elaborador) => update({ ...data, meta: { ...data.meta, elaborador } })}
                />
                <Field
                  label="Revisor"
                  value={data.meta.revisor}
                  onChange={(revisor) => update({ ...data, meta: { ...data.meta, revisor } })}
                />
                <Field
                  label="Data"
                  type="date"
                  value={data.meta.data}
                  onChange={(date) => update({ ...data, meta: { ...data.meta, data: date } })}
                />
                <SelectField
                  label="Status"
                  value={data.meta.status || "Em andamento"}
                  options={MODULE_STATUS_OPTIONS}
                  onChange={requestStatusChange}
                />
              </div>
            </Panel>
            <Panel
              id="sec-overview"
              num="02"
              openSignal={openTarget === "overview" ? openNonce : 0}
              title="Visão geral"
              progress={sectionProgress.overview}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextArea
                  label="Objetivo"
                  value={data.overview.objetivo}
                  onChange={(objetivo) =>
                    update({ ...data, overview: { ...data.overview, objetivo } })
                  }
                />
                <TextArea
                  label="Escopo"
                  value={data.overview.escopo}
                  onChange={(escopo) => update({ ...data, overview: { ...data.overview, escopo } })}
                />
                <div className="md:col-span-2">
                  <TextArea
                    label="Contexto"
                    value={data.overview.kpis}
                    onChange={(kpis) => update({ ...data, overview: { ...data.overview, kpis } })}
                  />
                </div>
              </div>
            </Panel>
            <Panel
              id="sec-systems"
              num="03"
              openSignal={openTarget === "systems" ? openNonce : 0}
              title="Sistemas/Documentos envolvidos"
              progress={sectionProgress.systems}
            >
              <div className="grid gap-3">
                {data.systems.map((system) => (
                  <div
                    key={system.id}
                    className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 lg:grid-cols-[1fr_auto]"
                  >
                    <RegisteredSystemSelect
                      label="Sistema/Documento"
                      value={system.systemId ?? ""}
                      displayValue={system.nome}
                      systems={catalogs.systems}
                      placeholder="Buscar sistema ou documento cadastrado..."
                      onSelect={(selectedSystem) =>
                        update({
                          ...data,
                          systems: data.systems.map((item) =>
                            item.id === system.id
                              ? {
                                  ...item,
                                  systemId: selectedSystem?.id ?? "",
                                  nome: selectedSystem?.name ?? "",
                                  tipo: normalizeSystemModality(selectedSystem?.modality),
                                  descricao: item.descricao || selectedSystem?.description || "",
                                }
                              : item,
                          ),
                        })
                      }
                      onRequestCreate={(query) =>
                        setCreateSystemRequest({ stepId: system.id, query })
                      }
                    />
                    <IconButton
                      label="Excluir"
                      onClick={() =>
                        update({
                          ...data,
                          systems: data.systems.filter((item) => item.id !== system.id),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                    {system.nome ? (
                      <span className="w-fit rounded-full border border-border bg-muted px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground lg:col-span-2">
                        {normalizeSystemModality(system.tipo)}
                      </span>
                    ) : null}
                    <div className="lg:col-span-2">
                      <TextArea
                        label="Descrição / uso no processo"
                        value={system.descricao}
                        onChange={(descricao) =>
                          update({
                            ...data,
                            systems: data.systems.map((item) =>
                              item.id === system.id ? { ...item, descricao } : item,
                            ),
                          })
                        }
                      />
                    </div>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update({
                      ...data,
                      systems: [
                        ...data.systems,
                        {
                          id: id("sys"),
                          nome: "",
                          tipo: "Sistemas corporativos",
                          dono: "",
                          criticidade: "Média",
                          descricao: "",
                        },
                      ],
                    })
                  }
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar sistema/documento
                </button>
              </div>
            </Panel>
            <Panel
              id="sec-sipoc"
              num="04"
              openSignal={openTarget === "sipoc" ? openNonce : 0}
              title="Análise SIPOC do processo"
              progress={sectionProgress.sipoc}
            >
              <div className="grid gap-3">
                {data.sipocRows.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
                  >
                    {(["fornecedores", "entradas", "processo", "saidas", "clientes"] as const).map(
                      (field) => (
                        <TextArea
                          key={field}
                          label={field === "saidas" ? "Saídas" : field}
                          value={row[field]}
                          onChange={(value) =>
                            update({
                              ...data,
                              sipocRows: data.sipocRows.map((item) =>
                                item.id === row.id ? { ...item, [field]: value } : item,
                              ),
                            })
                          }
                        />
                      ),
                    )}
                    <IconButton
                      label="Excluir"
                      onClick={() =>
                        update({
                          ...data,
                          sipocRows: data.sipocRows.filter((item) => item.id !== row.id),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update({
                      ...data,
                      sipocRows: [
                        ...data.sipocRows,
                        {
                          id: id("sipoc"),
                          fornecedores: "",
                          entradas: "",
                          processo: "",
                          saidas: "",
                          clientes: "",
                        },
                      ],
                    })
                  }
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar linha SIPOC
                </button>
              </div>
            </Panel>
            <Panel
              id="sec-flowStage"
              num="04"
              openSignal={openTarget === "flowStage" ? openNonce : 0}
              title="Etapas do processo"
              progress={sectionProgress.flowStage}
            >
              <div className="grid gap-5">
                <div>
                  <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
                    Processo
                  </h3>
                  <div className="grid gap-4">
                    <RegisteredProcessSelect
                      label="Processo, macroprocesso ou atividade"
                      value={data.macroprocess.processId ?? ""}
                      processes={primaryProcessOptions}
                      placeholder="Buscar processo, macroprocesso ou atividade"
                      onSelect={selectPrimaryProcess}
                      onRequestCreate={(name) => setCreateProcessName(name)}
                    />
                    <ImageManager
                      label="Imagem do processo"
                      captionLabel="Descrição"
                      images={
                        data.macroprocess.src
                          ? [
                              {
                                id: "macroprocess",
                                titulo: data.macroprocess.titulo || "Diagrama do Macroprocesso",
                                legenda: data.macroprocess.legenda,
                                src: data.macroprocess.src,
                              },
                            ]
                          : []
                      }
                      onChange={(images) => {
                        const image = images[images.length - 1];
                        update({
                          ...data,
                          macroprocess: {
                            ...data.macroprocess,
                            titulo: image?.titulo ?? data.macroprocess.titulo,
                            legenda: image?.legenda ?? data.macroprocess.legenda,
                            src: image?.src ?? "",
                          },
                        });
                      }}
                    />
                  </div>
                </div>
                <div className="border-t border-border pt-5">
                  <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
                    Etapas do processo
                  </h3>
                  <div className="grid gap-3">
                    {data.steps.map((step, index) => (
                      <div
                        key={step.id}
                        onDragOver={(event: DragEvent<HTMLDivElement>) => {
                          if (draggedStepId && draggedStepId !== step.id) event.preventDefault();
                        }}
                        onDrop={(event: DragEvent<HTMLDivElement>) => {
                          event.preventDefault();
                          reorderSteps(step.id);
                        }}
                        className={`rounded-lg border border-border bg-muted/20 p-3 transition ${
                          draggedStepId === step.id ? "opacity-60 ring-2 ring-[var(--gold)]/40" : ""
                        }`}
                      >
                        <div
                          className={`flex items-center gap-3 ${openSteps[step.id] ? "mb-3" : ""}`}
                        >
                          <button
                            type="button"
                            draggable
                            onDragStart={() => setDraggedStepId(step.id)}
                            onDragEnd={() => setDraggedStepId(null)}
                            className="grid h-9 w-9 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                            title="Arrastar etapa"
                            aria-label="Arrastar etapa"
                          >
                            <ArrowDownUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleStep(step.id)}
                            className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                            title={openSteps[step.id] ? "Recolher etapa" : "Expandir etapa"}
                            aria-label={openSteps[step.id] ? "Recolher etapa" : "Expandir etapa"}
                          >
                            {openSteps[step.id] ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-xs font-semibold text-[var(--gold)]">
                            {String(index + 1).padStart(2, "0")}
                          </div>
                          <div className="min-w-0 flex-1">
                            <RegisteredProcessSelect
                              label="Processo, macroprocesso ou atividade"
                              value={step.processId ?? ""}
                              processes={flowProcessOptions}
                              placeholder="Busque processo, macroprocesso ou atividade"
                              onSelect={(process) =>
                                updateStep(step.id, {
                                  processId: process?.id ?? "",
                                  processVersion: 1,
                                  etapa: process?.name ?? "",
                                  responsavel: process?.owner ?? "",
                                  atividade: step.atividade || process?.description || "",
                                })
                              }
                              onRequestCreate={(name) => {
                                setProcessCreationTarget({ kind: "step", stepId: step.id });
                                setCreateProcessName(name);
                              }}
                            />
                          </div>
                          <IconButton
                            label="Excluir"
                            onClick={() =>
                              update({
                                ...data,
                                steps: renumberFlowSteps(
                                  data.steps.filter((item) => item.id !== step.id),
                                ),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </IconButton>
                        </div>
                        {openSteps[step.id] ? (
                          <>
                            <div className="grid gap-3">
                              <ImageManager
                                label="Imagens da etapa"
                                captionLabel="Descrição"
                                images={step.images}
                                onChange={(images) => updateStep(step.id, { images })}
                              />
                              <div className="rounded-lg border border-border bg-card p-3">
                                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                  <div>
                                    <div className="text-[11px] font-semibold text-foreground">
                                      Atividades e subprocessos
                                    </div>
                                    <div className="mt-0.5 text-xs text-muted-foreground">
                                      Adicione atividades diretamente ou detalhe um subprocesso com
                                      atividades internas.
                                    </div>
                                  </div>
                                </div>
                                {step.substeps.length ? (
                                  <div className="grid gap-3">
                                    {step.substeps.map((substep, substepIndex) => (
                                      <div
                                        key={substep.id}
                                        onDragOver={(event: DragEvent<HTMLDivElement>) => {
                                          if (
                                            draggedSubstep?.stepId === step.id &&
                                            draggedSubstep.substepId !== substep.id
                                          ) {
                                            event.preventDefault();
                                          }
                                        }}
                                        onDrop={(event: DragEvent<HTMLDivElement>) => {
                                          event.preventDefault();
                                          reorderSubsteps(step.id, substep.id);
                                        }}
                                        className={`rounded-lg border border-border bg-muted/20 p-3 transition ${
                                          draggedSubstep?.substepId === substep.id
                                            ? "opacity-60 ring-2 ring-[var(--gold)]/40"
                                            : ""
                                        }`}
                                      >
                                        <div className="mb-3 grid gap-3 lg:grid-cols-[40px_110px_1fr_auto]">
                                          <button
                                            type="button"
                                            draggable
                                            onDragStart={() =>
                                              setDraggedSubstep({
                                                stepId: step.id,
                                                substepId: substep.id,
                                              })
                                            }
                                            onDragEnd={() => setDraggedSubstep(null)}
                                            className="mt-5 grid h-9 w-9 cursor-grab place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                            title="Arrastar atividade ou subprocesso"
                                            aria-label="Arrastar atividade ou subprocesso"
                                          >
                                            <ArrowDownUp className="h-4 w-4" />
                                          </button>
                                          <ReadOnlyField
                                            label="Código"
                                            value={`${index + 1}.${substepIndex + 1}`}
                                          />
                                          {substep.tipo === "subprocesso" ? (
                                            <RegisteredProcessSelect
                                              label="Subprocesso / etapa"
                                              value={substep.processId ?? ""}
                                              processes={flowProcessOptions}
                                              placeholder="Busque ou cadastre o subprocesso"
                                              displayName={(process) => process.name}
                                              onSelect={(process) =>
                                                updateSubstep(step.id, substep.id, {
                                                  processId: process?.id ?? "",
                                                  processVersion: 1,
                                                  titulo: process?.name ?? "",
                                                  descricao:
                                                    substep.descricao || process?.description || "",
                                                })
                                              }
                                              onRequestCreate={(name) => {
                                                setProcessCreationTarget({
                                                  kind: "subprocess",
                                                  stepId: step.id,
                                                  substepId: substep.id,
                                                });
                                                setCreateProcessName(name);
                                              }}
                                            />
                                          ) : (
                                            <Field
                                              compact
                                              label="Atividade"
                                              value={substep.titulo}
                                              onChange={(titulo) =>
                                                updateSubstep(step.id, substep.id, { titulo })
                                              }
                                            />
                                          )}
                                          <IconButton
                                            label={
                                              substep.tipo === "subprocesso"
                                                ? "Excluir subprocesso"
                                                : "Excluir atividade"
                                            }
                                            onClick={() =>
                                              updateStep(step.id, {
                                                substeps: step.substeps.filter(
                                                  (item) => item.id !== substep.id,
                                                ),
                                              })
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </IconButton>
                                        </div>
                                        <div className="mb-3 grid gap-3 md:grid-cols-2">
                                          <SelectField
                                            label="Classificação"
                                            value={substep.classificacao}
                                            options={FLOW_EXECUTION_TYPE_OPTIONS}
                                            onChange={(classificacao) =>
                                              updateSubstep(step.id, substep.id, {
                                                classificacao: classificacao as FlowExecutionType,
                                              })
                                            }
                                          />
                                          <div className="flex items-end pb-1">
                                            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground">
                                              <input
                                                type="checkbox"
                                                checked={substep.tipo === "subprocesso"}
                                                onChange={(event) =>
                                                  updateSubstep(step.id, substep.id, {
                                                    tipo: event.target.checked
                                                      ? "subprocesso"
                                                      : "atividade",
                                                    processId: "",
                                                    processVersion: 1,
                                                    activities: event.target.checked
                                                      ? substep.activities
                                                      : [],
                                                  })
                                                }
                                                className="h-4 w-4 accent-[var(--gold)]"
                                              />
                                              Criar como subprocesso / etapa
                                            </label>
                                          </div>
                                        </div>
                                        <TextArea
                                          label={
                                            substep.tipo === "subprocesso"
                                              ? "Descrição do subprocesso"
                                              : "Descrição da atividade"
                                          }
                                          value={substep.descricao}
                                          onChange={(descricao) =>
                                            updateSubstep(step.id, substep.id, { descricao })
                                          }
                                        />
                                        {substep.tipo === "atividade" ? (
                                          <div className="mt-3">
                                            <ActivityActorField
                                              actorType={substep.actorType}
                                              actorName={substep.actorName}
                                              catalogs={catalogs}
                                              onChange={(patch) =>
                                                updateSubstep(step.id, substep.id, patch)
                                              }
                                              onCreate={(kind, initial) =>
                                                setActorCatalogRequest({
                                                  kind,
                                                  initial,
                                                  target: {
                                                    kind: "substep",
                                                    stepId: step.id,
                                                    substepId: substep.id,
                                                  },
                                                })
                                              }
                                            />
                                          </div>
                                        ) : null}
                                        <div className="mt-3 grid gap-2 rounded-lg border border-border bg-background p-3">
                                          <span className="text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground">
                                            {substep.tipo === "subprocesso"
                                              ? "Resumo dos sistemas/documentos das atividades"
                                              : "Sistemas/Documentos utilizados"}
                                          </span>
                                          {substep.tipo === "subprocesso" ? (
                                            substep.systemIds.length ? (
                                              <div className="flex flex-wrap gap-2">
                                                {data.systems
                                                  .filter(
                                                    (system) =>
                                                      system.nome.trim() &&
                                                      (substep.systemIds.includes(system.id) ||
                                                        (!!system.systemId &&
                                                          substep.systemIds.includes(
                                                            system.systemId,
                                                          ))),
                                                  )
                                                  .map((system) => (
                                                    <span
                                                      key={system.id}
                                                      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground"
                                                    >
                                                      <span className="font-semibold">
                                                        {system.nome}
                                                      </span>
                                                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                                        {normalizeSystemModality(system.tipo)}
                                                      </span>
                                                    </span>
                                                  ))}
                                              </div>
                                            ) : (
                                              <p className="text-xs text-muted-foreground">
                                                Selecione sistemas ou documentos nas atividades
                                                deste subprocesso. O resumo será atualizado
                                                automaticamente.
                                              </p>
                                            )
                                          ) : data.systems.some((system) => system.nome.trim()) ? (
                                            <div className="flex flex-wrap gap-2">
                                              {data.systems
                                                .filter((system) => system.nome.trim())
                                                .map((system) => {
                                                  const checked =
                                                    substep.systemIds.includes(system.id) ||
                                                    (!!system.systemId &&
                                                      substep.systemIds.includes(system.systemId));
                                                  return (
                                                    <label
                                                      key={system.id}
                                                      className={[
                                                        "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                                                        checked
                                                          ? "border-[var(--gold)] bg-[color-mix(in_oklab,var(--gold)_10%,transparent)] text-foreground"
                                                          : "border-border bg-card text-muted-foreground hover:bg-muted",
                                                      ].join(" ")}
                                                    >
                                                      <input
                                                        type="checkbox"
                                                        checked={checked}
                                                        onChange={(event) => {
                                                          const nextIds = event.target.checked
                                                            ? [...substep.systemIds, system.id]
                                                            : substep.systemIds.filter(
                                                                (item) =>
                                                                  item !== system.id &&
                                                                  item !== system.systemId,
                                                              );
                                                          updateSubstep(step.id, substep.id, {
                                                            systemIds: Array.from(new Set(nextIds)),
                                                          });
                                                        }}
                                                        className="h-4 w-4 accent-[var(--gold)]"
                                                      />
                                                      <span className="font-semibold">
                                                        {system.nome}
                                                      </span>
                                                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                                                        {normalizeSystemModality(system.tipo)}
                                                      </span>
                                                    </label>
                                                  );
                                                })}
                                            </div>
                                          ) : (
                                            <p className="text-xs text-muted-foreground">
                                              Adicione primeiro os sistemas ou documentos na seção
                                              02.
                                            </p>
                                          )}
                                        </div>
                                        <div className="mt-3">
                                          <ImageManager
                                            label={
                                              substep.tipo === "subprocesso"
                                                ? "Imagens do subprocesso"
                                                : "Imagens da atividade"
                                            }
                                            images={substep.images}
                                            onChange={(images) =>
                                              updateSubstep(step.id, substep.id, { images })
                                            }
                                          />
                                        </div>
                                        {substep.tipo === "subprocesso" ? (
                                          <div className="mt-4 rounded-lg border border-border bg-background p-3">
                                            <div className="mb-3">
                                              <div className="text-[11px] font-semibold text-foreground">
                                                Atividades do subprocesso
                                              </div>
                                              <div className="mt-0.5 text-xs text-muted-foreground">
                                                A numeração é atualizada automaticamente.
                                              </div>
                                            </div>
                                            <div className="grid gap-3">
                                              {substep.activities.map((activity, activityIndex) => (
                                                <div
                                                  key={activity.id}
                                                  onDragOver={(event) => {
                                                    if (
                                                      draggedActivity?.subprocessId ===
                                                        substep.id &&
                                                      draggedActivity.activityId !== activity.id
                                                    ) {
                                                      event.preventDefault();
                                                    }
                                                  }}
                                                  onDrop={(event) => {
                                                    event.preventDefault();
                                                    reorderActivities(
                                                      step.id,
                                                      substep.id,
                                                      activity.id,
                                                    );
                                                  }}
                                                  className={`rounded-lg border border-border bg-muted/20 p-3 transition ${
                                                    draggedActivity?.activityId === activity.id
                                                      ? "opacity-60 ring-2 ring-[var(--gold)]/40"
                                                      : ""
                                                  }`}
                                                >
                                                  <div className="grid gap-3 lg:grid-cols-[40px_120px_1fr_220px_auto]">
                                                    <button
                                                      type="button"
                                                      draggable
                                                      onDragStart={() =>
                                                        setDraggedActivity({
                                                          stepId: step.id,
                                                          subprocessId: substep.id,
                                                          activityId: activity.id,
                                                        })
                                                      }
                                                      onDragEnd={() => setDraggedActivity(null)}
                                                      className="mt-5 grid h-9 w-9 cursor-grab place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                                      title="Arrastar atividade"
                                                      aria-label="Arrastar atividade"
                                                    >
                                                      <ArrowDownUp className="h-4 w-4" />
                                                    </button>
                                                    <ReadOnlyField
                                                      label="Código"
                                                      value={`${index + 1}.${substepIndex + 1}.${activityIndex + 1}`}
                                                    />
                                                    <Field
                                                      compact
                                                      label="Atividade"
                                                      value={activity.titulo}
                                                      onChange={(titulo) =>
                                                        updateActivity(
                                                          step.id,
                                                          substep.id,
                                                          activity.id,
                                                          { titulo },
                                                        )
                                                      }
                                                    />
                                                    <SelectField
                                                      label="Classificação"
                                                      value={activity.classificacao}
                                                      options={FLOW_EXECUTION_TYPE_OPTIONS}
                                                      onChange={(classificacao) =>
                                                        updateActivity(
                                                          step.id,
                                                          substep.id,
                                                          activity.id,
                                                          {
                                                            classificacao:
                                                              classificacao as FlowExecutionType,
                                                          },
                                                        )
                                                      }
                                                    />
                                                    <IconButton
                                                      label="Excluir atividade"
                                                      onClick={() =>
                                                        updateSubstep(step.id, substep.id, {
                                                          activities: substep.activities.filter(
                                                            (item) => item.id !== activity.id,
                                                          ),
                                                        })
                                                      }
                                                    >
                                                      <Trash2 className="h-4 w-4" />
                                                    </IconButton>
                                                  </div>
                                                  <div className="mt-3">
                                                    <TextArea
                                                      label="Descrição da atividade"
                                                      value={activity.descricao}
                                                      onChange={(descricao) =>
                                                        updateActivity(
                                                          step.id,
                                                          substep.id,
                                                          activity.id,
                                                          { descricao },
                                                        )
                                                      }
                                                      rows={3}
                                                    />
                                                  </div>
                                                  <div className="mt-3">
                                                    <ActivityActorField
                                                      actorType={activity.actorType}
                                                      actorName={activity.actorName}
                                                      catalogs={catalogs}
                                                      onChange={(patch) =>
                                                        updateActivity(
                                                          step.id,
                                                          substep.id,
                                                          activity.id,
                                                          patch,
                                                        )
                                                      }
                                                      onCreate={(kind, initial) =>
                                                        setActorCatalogRequest({
                                                          kind,
                                                          initial,
                                                          target: {
                                                            kind: "activity",
                                                            stepId: step.id,
                                                            substepId: substep.id,
                                                            activityId: activity.id,
                                                          },
                                                        })
                                                      }
                                                    />
                                                  </div>
                                                  {data.systems.some((system) =>
                                                    system.nome.trim(),
                                                  ) ? (
                                                    <div className="mt-3 flex flex-wrap gap-2">
                                                      {data.systems
                                                        .filter((system) => system.nome.trim())
                                                        .map((system) => {
                                                          const checked =
                                                            activity.systemIds.includes(
                                                              system.id,
                                                            ) ||
                                                            (!!system.systemId &&
                                                              activity.systemIds.includes(
                                                                system.systemId,
                                                              ));
                                                          return (
                                                            <label
                                                              key={system.id}
                                                              className={[
                                                                "inline-flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                                                                checked
                                                                  ? "border-[var(--gold)] bg-[color-mix(in_oklab,var(--gold)_10%,transparent)] text-foreground"
                                                                  : "border-border bg-card text-muted-foreground hover:bg-muted",
                                                              ].join(" ")}
                                                            >
                                                              <input
                                                                type="checkbox"
                                                                checked={checked}
                                                                onChange={(event) => {
                                                                  const nextIds = event.target
                                                                    .checked
                                                                    ? [
                                                                        ...activity.systemIds,
                                                                        system.id,
                                                                      ]
                                                                    : activity.systemIds.filter(
                                                                        (item) =>
                                                                          item !== system.id &&
                                                                          item !== system.systemId,
                                                                      );
                                                                  updateActivity(
                                                                    step.id,
                                                                    substep.id,
                                                                    activity.id,
                                                                    {
                                                                      systemIds: Array.from(
                                                                        new Set(nextIds),
                                                                      ),
                                                                    },
                                                                  );
                                                                }}
                                                                className="h-4 w-4 accent-[var(--gold)]"
                                                              />
                                                              {system.nome}
                                                            </label>
                                                          );
                                                        })}
                                                    </div>
                                                  ) : null}
                                                  <div className="mt-3">
                                                    <ImageManager
                                                      label="Imagens da atividade"
                                                      images={activity.images}
                                                      onChange={(images) =>
                                                        updateActivity(
                                                          step.id,
                                                          substep.id,
                                                          activity.id,
                                                          { images },
                                                        )
                                                      }
                                                    />
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                updateSubstep(step.id, substep.id, {
                                                  activities: [
                                                    ...substep.activities,
                                                    {
                                                      id: id("activity"),
                                                      codigo: "",
                                                      titulo: "Nova atividade",
                                                      descricao: "",
                                                      classificacao: "Automática",
                                                      actorType: "",
                                                      actorName: "",
                                                      systemIds: [],
                                                      images: [],
                                                    },
                                                  ],
                                                })
                                              }
                                              className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                                            >
                                              <Plus className="h-4 w-4" />
                                              Adicionar atividade ao subprocesso
                                            </button>
                                          </div>
                                        ) : null}
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateStep(step.id, {
                                      substeps: [
                                        ...step.substeps,
                                        {
                                          id: id("substep"),
                                          processId: "",
                                          processVersion: 1,
                                          codigo: `${index + 1}.${step.substeps.length + 1}`,
                                          titulo: "Nova atividade",
                                          descricao: "",
                                          tipo: "atividade",
                                          classificacao: "Automática",
                                          actorType: "",
                                          actorName: "",
                                          systemIds: [],
                                          images: [],
                                          activities: [],
                                        },
                                      ],
                                    })
                                  }
                                  className="mt-3 inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                                >
                                  <Plus className="h-4 w-4" />
                                  Adicionar atividade ou subprocesso
                                </button>
                              </div>
                            </div>
                          </>
                        ) : null}
                      </div>
                    ))}
                    <button
                      onClick={() =>
                        update({
                          ...data,
                          steps: renumberFlowSteps([
                            ...data.steps,
                            {
                              id: id("step"),
                              processId: "",
                              processVersion: 1,
                              etapa: "",
                              responsavel: "",
                              entrada: "",
                              atividade: "",
                              saida: "",
                              sistema: "",
                              risco: "",
                              observacoes: "",
                              images: [],
                              substeps: [],
                            },
                          ]),
                        })
                      }
                      className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar etapa
                    </button>
                  </div>
                </div>
              </div>
            </Panel>
            <Panel
              id="sec-quantitative"
              num="05"
              openSignal={openTarget === "quantitative" ? openNonce : 0}
              title="Visão Quantitativa"
            >
              <div className="grid gap-5">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  {[
                    {
                      label: "Processos",
                      value: quantitativeStats.processes,
                      icon: Workflow,
                    },
                    {
                      label: "Subprocessos",
                      value: quantitativeStats.subprocesses,
                      icon: GitBranch,
                    },
                    {
                      label: "Atividades",
                      value: quantitativeStats.activities,
                      icon: ListChecks,
                    },
                    {
                      label: "Áreas",
                      value: quantitativeStats.areas,
                      icon: Building2,
                    },
                    {
                      label: "Sistemas/Documentos",
                      value: quantitativeStats.systems,
                      icon: Database,
                    },
                  ].map((metric) => {
                    const Icon = metric.icon;
                    return (
                      <article
                        key={metric.label}
                        className="flex min-h-[112px] flex-col justify-between rounded-lg border border-border bg-card p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                            {metric.label}
                          </span>
                          <Icon className="h-4 w-4 text-[var(--gold)]" />
                        </div>
                        <strong className="text-3xl font-bold tabular-nums text-foreground">
                          {metric.value}
                        </strong>
                      </article>
                    );
                  })}
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <article className="rounded-lg border border-border bg-card p-4">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Média de atividades
                    </span>
                    <div className="mt-2 flex items-end gap-2">
                      <strong className="text-3xl font-bold tabular-nums text-foreground">
                        {quantitativeStats.averageActivities.toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}
                      </strong>
                      <span className="pb-1 text-xs text-muted-foreground">
                        por processo ou subprocesso
                      </span>
                    </div>
                  </article>
                  <article className="rounded-lg border border-border bg-card p-4">
                    <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Maior subprocesso
                    </span>
                    <div className="mt-2 flex items-end gap-2">
                      <strong className="text-3xl font-bold tabular-nums text-foreground">
                        {quantitativeStats.maxActivitiesInSubprocess}
                      </strong>
                      <span className="pb-1 text-xs text-muted-foreground">
                        atividades vinculadas
                      </span>
                    </div>
                  </article>
                </div>

                <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
                  <article className="rounded-lg border border-border bg-card p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">
                          Distribuição por forma de execução
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Composição das atividades classificadas no fluxo.
                        </p>
                      </div>
                      <ListChecks className="h-5 w-5 text-[var(--gold)]" />
                    </div>
                    <div className="grid gap-3">
                      {quantitativeStats.execution.map((item) => (
                        <div key={item.label} className="grid gap-1.5">
                          <div className="flex items-center justify-between gap-3 text-xs">
                            <span className="font-medium text-foreground">{item.label}</span>
                            <span className="tabular-nums text-muted-foreground">
                              {item.value} · {item.percentage}%
                            </span>
                          </div>
                          <div className="h-2 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-[var(--gold)] transition-[width] duration-300"
                              style={{ width: `${item.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className="grid gap-3 rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Indicadores de execução
                    </h3>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg bg-emerald-500/10 p-3">
                        <strong className="block text-2xl tabular-nums text-emerald-700 dark:text-emerald-300">
                          {quantitativeStats.automationPercentage}%
                        </strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Com algum grau de automação
                        </span>
                      </div>
                      <div className="rounded-lg bg-muted/60 p-3">
                        <strong className="block text-2xl tabular-nums text-foreground">
                          {quantitativeStats.fullyManualPercentage}%
                        </strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          Totalmente manuais
                        </span>
                      </div>
                    </div>
                  </article>
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <article className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Participação das áreas
                    </h3>
                    <div className="mt-4 grid gap-3">
                      {quantitativeStats.areaDistribution.length ? (
                        quantitativeStats.areaDistribution.map((item) => (
                          <div key={item.label} className="grid gap-1.5">
                            <div className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate font-medium text-foreground">
                                {item.label}
                              </span>
                              <span className="shrink-0 tabular-nums text-muted-foreground">
                                {item.value} · {item.percentage}%
                              </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${item.percentage}%` }}
                              />
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center text-xs text-muted-foreground">
                          As áreas aparecerão quando houver atividades vinculadas a processos
                          cadastrados.
                        </p>
                      )}
                    </div>
                  </article>

                  <article className="rounded-lg border border-border bg-card p-4">
                    <h3 className="text-sm font-semibold text-foreground">
                      Recursos mais utilizados
                    </h3>
                    <div className="mt-4 grid gap-2">
                      {quantitativeStats.resourceUsage.length ? (
                        quantitativeStats.resourceUsage.map((item, index) => (
                          <div
                            key={item.label}
                            className="flex items-center gap-3 rounded-lg bg-muted/45 px-3 py-2.5"
                          >
                            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-background text-xs font-bold text-[var(--gold)]">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                              {item.label}
                            </span>
                            <strong className="tabular-nums text-sm text-foreground">
                              {item.value}
                            </strong>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-lg border border-dashed border-border bg-muted/20 p-5 text-center text-xs text-muted-foreground">
                          Vincule sistemas ou documentos às atividades para identificar o uso.
                        </p>
                      )}
                    </div>
                  </article>
                </div>

                <article className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <TriangleAlert className="h-4 w-4 text-[var(--gold)]" />
                    <h3 className="text-sm font-semibold text-foreground">Alertas analíticos</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    {[
                      [
                        "Atividades integralmente manuais",
                        quantitativeStats.alerts.manualActivities,
                      ],
                      ["Sem área ou responsável", quantitativeStats.alerts.withoutOwner],
                      ["Sem descrição", quantitativeStats.alerts.withoutDescription],
                      ["Sem sistema relacionado", quantitativeStats.alerts.withoutSystem],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-lg border border-border p-3">
                        <strong className="block text-2xl tabular-nums text-foreground">
                          {value}
                        </strong>
                        <span className="mt-1 block text-xs text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </Panel>
            <Panel
              id="sec-gaps"
              num="06"
              openSignal={openTarget === "gaps" ? openNonce : 0}
              title="Oportunidades de melhoria"
              progress={sectionProgress.gaps}
            >
              <div className="grid gap-3">
                <div className="overflow-hidden rounded-lg border border-border bg-card">
                  <div className="overflow-auto">
                    <table className="w-full min-w-[1540px] border-collapse text-left text-sm">
                      <thead className="bg-muted text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                        <tr>
                          <th className="px-3 py-3">Usar oportunidade cadastrada?</th>
                          <th className="px-3 py-3">Oportunidade cadastrada</th>
                          <th className="px-3 py-3">Oportunidade de melhoria</th>
                          <th className="px-3 py-3">Descrição</th>
                          <th className="px-3 py-3">Impacto</th>
                          <th className="px-3 py-3">Ação proposta</th>
                          <th className="px-3 py-3">Responsável</th>
                          <th className="px-3 py-3">Prazo</th>
                          <th className="px-3 py-3">Prioridade</th>
                          <th className="px-3 py-3">Status</th>
                          <th className="px-3 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.gaps.map((gap) => {
                          const usesLibraryCause =
                            libraryCauseRows[gap.id] ?? Boolean(gap.sharedCauseId);
                          const selectedCause = catalogs.causes.find(
                            (cause) => cause.id === gap.sharedCauseId,
                          );
                          const causeSearchValue =
                            causeSearch[gap.id] ?? selectedCause?.title ?? "";

                          return (
                            <tr key={gap.id} className="border-t border-border align-top">
                              <td className="px-3 py-3">
                                <div className="grid min-w-[180px] gap-2">
                                  <div className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-background p-0.5">
                                    <button
                                      type="button"
                                      onClick={() => setGapLibraryMode(gap.id, false)}
                                      className={`rounded px-2.5 py-1.5 text-xs font-bold transition ${
                                        !usesLibraryCause
                                          ? "bg-[var(--gold)] text-black"
                                          : "text-muted-foreground hover:bg-muted"
                                      }`}
                                    >
                                      Não
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setGapLibraryMode(gap.id, true)}
                                      className={`rounded px-2.5 py-1.5 text-xs font-bold transition ${
                                        usesLibraryCause
                                          ? "bg-[var(--gold)] text-black"
                                          : "text-muted-foreground hover:bg-muted"
                                      }`}
                                    >
                                      Sim
                                    </button>
                                  </div>
                                  <span className="text-[11px] leading-snug text-muted-foreground">
                                    {usesLibraryCause
                                      ? "Dados preenchidos pela oportunidade cadastrada."
                                      : "Gap local/editavel neste mapeamento."}
                                  </span>
                                </div>
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause ? (
                                  <div className="grid min-w-[230px] gap-2">
                                    <DropdownTextField
                                      label="Oportunidade cadastrada"
                                      value={causeSearchValue}
                                      options={catalogs.causes.map((cause) => cause.title)}
                                      placeholder="Pesquisar oportunidade cadastrada"
                                      onChange={(value) => selectSharedCauseByTitle(gap.id, value)}
                                      compact
                                    />
                                    {!selectedCause ? (
                                      <span className="text-[11px] text-muted-foreground">
                                        Selecione uma oportunidade da lista para preencher os
                                        campos.
                                      </span>
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="min-w-[230px] rounded-md border border-dashed border-border bg-muted/25 px-2.5 py-2 text-xs text-muted-foreground">
                                    Marque Sim para pesquisar uma oportunidade existente.
                                  </div>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause && selectedCause ? (
                                  <TableReadonly value={gap.causa} />
                                ) : (
                                  <TableInput
                                    value={gap.causa}
                                    onChange={(causa) => updateGap(gap.id, { causa })}
                                    placeholder="Nome da oportunidade"
                                  />
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause && selectedCause ? (
                                  <TableReadonly value={gap.descricao} multiline />
                                ) : (
                                  <TableTextarea
                                    value={gap.descricao}
                                    onChange={(descricao) => updateGap(gap.id, { descricao })}
                                    placeholder="Descreva a oportunidade"
                                  />
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause && selectedCause ? (
                                  <TableReadonly value={gap.impacto} multiline />
                                ) : (
                                  <TableTextarea
                                    value={gap.impacto}
                                    onChange={(impacto) => updateGap(gap.id, { impacto })}
                                    placeholder="Impacto"
                                  />
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause && selectedCause ? (
                                  <TableReadonly value={gap.acao} multiline />
                                ) : (
                                  <TableTextarea
                                    value={gap.acao}
                                    onChange={(acao) => updateGap(gap.id, { acao })}
                                    placeholder="Ação proposta"
                                  />
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause && selectedCause ? (
                                  <TableReadonly value={gap.responsavel} />
                                ) : (
                                  <TableInput
                                    value={gap.responsavel}
                                    onChange={(responsavel) => updateGap(gap.id, { responsavel })}
                                    placeholder="Responsável"
                                  />
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause && selectedCause ? (
                                  <TableReadonly value={formatGapDateRangeBr(gap.prazo)} />
                                ) : (
                                  <TableDateRange
                                    value={gap.prazo}
                                    onChange={(prazo) => updateGap(gap.id, { prazo })}
                                  />
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause && selectedCause ? (
                                  <TableReadonly value={gap.prioridade} />
                                ) : (
                                  <TableSelect
                                    value={gap.prioridade}
                                    options={[...CAUSE_PRIORITY_OPTIONS]}
                                    onChange={(prioridade) => updateGap(gap.id, { prioridade })}
                                  />
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {usesLibraryCause && selectedCause ? (
                                  <TableReadonly value={gap.status} />
                                ) : (
                                  <TableSelect
                                    value={gap.status}
                                    options={[...CAUSE_STATUS_OPTIONS]}
                                    onChange={(status) => updateGap(gap.id, { status })}
                                  />
                                )}
                              </td>
                              <td className="px-3 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    update({
                                      ...data,
                                      gaps: data.gaps.filter((item) => item.id !== gap.id),
                                    })
                                  }
                                  className="inline-flex items-center gap-2 rounded-md border border-destructive/30 bg-background px-3 py-2 text-xs font-semibold text-destructive transition hover:bg-destructive/5"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Excluir
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {!data.gaps.length ? (
                          <tr>
                            <td
                              colSpan={11}
                              className="px-3 py-10 text-center text-sm text-muted-foreground"
                            >
                              Nenhum gap cadastrado.
                            </td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
                  </div>
                </div>
                <button
                  onClick={() =>
                    update({
                      ...data,
                      gaps: [
                        ...data.gaps,
                        {
                          id: id("gap"),
                          sharedCauseId: "",
                          causa: "",
                          descricao: "",
                          impacto: "",
                          acao: "",
                          responsavel: "",
                          prazo: "",
                          prioridade: "Média",
                          status: "Pendente",
                          comentarios: [],
                        },
                      ],
                    })
                  }
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar gap
                </button>
              </div>
            </Panel>
            <ListEditor
              anchorId="sec-nextSteps"
              num="07"
              openSignal={openTarget === "nextSteps" ? openNonce : 0}
              title="Próximos passos"
              items={data.nextSteps}
              onChange={(nextSteps) => update({ ...data, nextSteps })}
              placeholder="Próxima ação recomendada"
              progress={sectionProgress.nextSteps}
            />
            <Panel
              id="sec-glossary"
              num="08"
              openSignal={openTarget === "glossary" ? openNonce : 0}
              title="Glossário"
              progress={sectionProgress.glossary}
            >
              <div className="grid gap-3">
                {data.glossary.map((item) => (
                  <div
                    key={item.id}
                    className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[240px_1fr_auto]"
                  >
                    <Field
                      compact
                      label="Termo"
                      value={item.termo}
                      onChange={(termo) =>
                        update({
                          ...data,
                          glossary: data.glossary.map((row) =>
                            row.id === item.id ? { ...row, termo } : row,
                          ),
                        })
                      }
                    />
                    <Field
                      compact
                      label="Definição"
                      value={item.definicao}
                      onChange={(definicao) =>
                        update({
                          ...data,
                          glossary: data.glossary.map((row) =>
                            row.id === item.id ? { ...row, definicao } : row,
                          ),
                        })
                      }
                    />
                    <IconButton
                      label="Excluir"
                      onClick={() =>
                        update({
                          ...data,
                          glossary: data.glossary.filter((row) => row.id !== item.id),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update({
                      ...data,
                      glossary: [...data.glossary, { id: id("gloss"), termo: "", definicao: "" }],
                    })
                  }
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar termo
                </button>
              </div>
            </Panel>
            {/* Folga para que qualquer seção consiga alcançar o topo (abaixo da
              barra fixa) ao ser aberta pelo índice. */}
            <div aria-hidden className="h-[45vh]" />
          </div>
        </div>
      )}
      {pendingStatus ? (
        <Modal
          title="Alterar status do mapeamento"
          subtitle={`Confirma alterar o status de "${data.meta.status || "Em andamento"}" para "${pendingStatus}"?`}
          onClose={() => setPendingStatus(null)}
        >
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingStatus(null)}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmStatusChange}
              className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
            >
              Alterar
            </button>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

function PopModule({
  data,
  catalogs,
  organizationId,
  isDemo,
  codeSettings,
  update,
  onCatalogCreated,
  onProcessCreated,
  autoCode = false,
  codePreview = "",
  onSave,
  onPreview,
  saving = false,
  savedNonce = 0,
  isEditing = false,
}: {
  data: PopState;
  catalogs: OrganizationCatalogs;
  organizationId?: string | null;
  isDemo: boolean;
  codeSettings: CodeSettings | null;
  update: (value: PopState) => void;
  onCatalogCreated?: () => Promise<void> | void;
  onProcessCreated: (process: CreatedProcess) => Promise<void> | void;
  autoCode?: boolean;
  codePreview?: string;
  onSave?: () => void;
  onPreview?: () => void;
  saving?: boolean;
  savedNonce?: number;
  isEditing?: boolean;
}) {
  const saveArea = useServerFn(saveProcessArea);
  const savePosition = useServerFn(savePositionRegistration);
  const [createProcessName, setCreateProcessName] = useState<string | null>(null);
  const [quickCatalog, setQuickCatalog] = useState<
    { kind: "area"; initial: string } | { kind: "position"; initial: string } | null
  >(null);
  const [quickAreaSigla, setQuickAreaSigla] = useState("");
  const [quickPositionDescription, setQuickPositionDescription] = useState("");
  const [activeSection, setActiveSection] = useState("identification");
  const [openSignals, setOpenSignals] = useState<Record<string, number>>({});
  const [visibleClauseNotes, setVisibleClauseNotes] = useState<Record<string, boolean>>({});
  const [openProcedureNodes, setOpenProcedureNodes] = useState<Record<string, boolean>>({});
  const [draggedProcedureSubitem, setDraggedProcedureSubitem] = useState<{
    sectionId: string;
    subitemId: string;
  } | null>(null);
  const [draggedProcedureClause, setDraggedProcedureClause] = useState<{
    sectionId: string;
    subitemId: string;
    clauseId: string;
  } | null>(null);
  const [docxImport, setDocxImport] = useState<DocxDocumentImport | null>(null);
  const [importingDocx, setImportingDocx] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantMode, setAssistantMode] = useState<"docx" | "text">("docx");
  const [assistantText, setAssistantText] = useState("");
  const docxInputRef = useRef<HTMLInputElement>(null);
  const documentName = documentationTypeName(data.meta.tipo);
  const contentTitle = documentationContentTitle(data.meta.tipo);
  const visibleCode = data.meta.codigo || codePreview;
  const selectedDocumentProcess =
    catalogs.processes.find((process) => {
      const label = process.code ? `${process.code} - ${process.name}` : process.name;
      return (
        data.meta.processo === process.name ||
        data.meta.processo === process.code ||
        data.meta.processo === label
      );
    }) ?? null;
  const canEditDocument = Boolean(selectedDocumentProcess);
  const sectionProgress = {
    identification: completionPercent([
      data.meta.tipo,
      data.meta.codigo,
      data.meta.versao,
      data.meta.titulo,
      data.meta.publico,
      data.meta.area,
      data.meta.processo,
      data.meta.vigencia,
      data.meta.elaboracao,
      data.meta.revisor,
      data.meta.aprovacao,
      data.meta.publicacao,
    ]),
    objective: completionPercent([data.purpose.objetivo]),
    scope: completionPercent([data.purpose.abrangencia]),
    sections: completionPercent(
      data.sections.flatMap((section) => [
        section.code,
        section.title,
        section.body,
        section.images,
        ...(section.subitems ?? []).flatMap((subitem) => [
          subitem.code,
          subitem.title,
          ...subitem.clauses.flatMap((clause) => [
            clause.letter,
            clause.alert,
            ...procedureClauseBlocks(clause).flatMap((block) => [block.text, block.images]),
          ]),
        ]),
      ]),
    ),
    responsibilities: completionPercent(
      data.responsibilities.flatMap((row) => [row.area, row.cargo, row.responsabilidade]),
    ),
    references: completionPercent(
      data.references.flatMap((row) => [row.codigo, row.titulo, row.aplicabilidade]),
    ),
    history: completionPercent([
      ...data.history.flatMap((row) => [
        row.codigo,
        row.version,
        row.date,
        row.elaborador,
        row.revisor,
        row.aprovador,
      ]),
      ...data.changes.flatMap((row) => [row.versao, row.local, row.descricao]),
    ]),
  };
  const sections: MappingSectionInfo[] = [
    {
      key: "identification",
      num: "00",
      title: "Dados do documento",
      pct: sectionProgress.identification,
    },
    { key: "objective", num: "01", title: "Objetivo", pct: sectionProgress.objective },
    { key: "scope", num: "02", title: "Abrangência", pct: sectionProgress.scope },
    { key: "procedure", num: "03", title: contentTitle, pct: sectionProgress.sections },
    {
      key: "responsibilities",
      num: "04",
      title: "Responsabilidades",
      pct: sectionProgress.responsibilities,
    },
    {
      key: "references",
      num: "05",
      title: "Referências normativas",
      pct: sectionProgress.references,
    },
    { key: "history", num: "06", title: "Histórico e alterações", pct: sectionProgress.history },
  ];
  const procedureNodeKeys = data.sections.flatMap((section) => [
    `item:${section.id}`,
    ...(section.subitems ?? []).flatMap((subitem) => [
      `subitem:${subitem.id}`,
      ...subitem.clauses.map((clause) => `clause:${clause.id}`),
    ]),
  ]);

  useEffect(() => {
    setOpenProcedureNodes({});
  }, [isEditing, data.meta.codigo]);
  async function saveQuickCatalog() {
    if (!quickCatalog) return;
    try {
      if (quickCatalog.kind === "area") {
        const sigla = normalizeSigla(quickAreaSigla || quickCatalog.initial);
        if (sigla.length !== 3) {
          toast.error("Informe uma sigla de 3 letras para a área.");
          return;
        }
        await saveArea({
          data: {
            organizationId,
            name: quickCatalog.initial.trim(),
            sigla,
          },
        });
        toast.success("Área cadastrada.");
      } else {
        await savePosition({
          data: {
            organizationId,
            title: quickCatalog.initial.trim(),
            description: quickPositionDescription.trim() || null,
          },
        });
        toast.success("Cargo cadastrado.");
      }
      setQuickCatalog(null);
      setQuickAreaSigla("");
      setQuickPositionDescription("");
      await onCatalogCreated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar.");
    }
  }
  function historyVersion(index: number) {
    return String(index).padStart(2, "0");
  }
  function syncHistoryChanges(history: RevisionItem[], changes: ChangeItem[]) {
    return history.map((_, index) => {
      const current = changes[index];
      const versao = historyVersion(index);
      return {
        id: current?.id ?? id("change"),
        versao,
        local: current?.local || (index === 0 ? "Documento completo" : ""),
        descricao: current?.descricao || (index === 0 ? "Elaboração inicial do documento." : ""),
      };
    });
  }
  function setHistory(history: RevisionItem[], changes = data.changes) {
    update({
      ...data,
      history: history.map((row, index) => ({ ...row, version: historyVersion(index) })),
      changes: syncHistoryChanges(history, changes),
    });
  }
  useEffect(() => {
    const normalizedHistory = data.history.map((row, index) => ({
      ...row,
      version: historyVersion(index),
    }));
    const normalizedChanges = syncHistoryChanges(normalizedHistory, data.changes);
    const sameHistory = JSON.stringify(normalizedHistory) === JSON.stringify(data.history);
    const sameChanges = JSON.stringify(normalizedChanges) === JSON.stringify(data.changes);
    if (!sameHistory || !sameChanges) {
      update({ ...data, history: normalizedHistory, changes: normalizedChanges });
    }
    // Normaliza apenas quando o tamanho/versões mudam para evitar conflito de digitação.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.history.length, data.changes.length]);
  const completion = Math.round(
    sections.reduce((sum, section) => sum + section.pct, 0) / Math.max(1, sections.length),
  );
  const [dirty, setDirty] = useState(false);
  const dataMounted = useRef(false);
  const justSaved = useRef(false);

  useEffect(() => {
    const sectionKeys = sections.map((section) => section.key);
    function onScroll() {
      const line = 280;
      let current = sectionKeys[0];
      for (const key of sectionKeys) {
        const el = document.getElementById(`pop-sec-${key}`);
        if (el && el.getBoundingClientRect().top <= line) current = key;
      }
      setActiveSection(current);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!dataMounted.current) {
      dataMounted.current = true;
      return;
    }
    if (justSaved.current) {
      justSaved.current = false;
      return;
    }
    setDirty(true);
  }, [data]);

  useEffect(() => {
    if (!savedNonce) return;
    justSaved.current = true;
    setDirty(false);
  }, [savedNonce]);

  useEffect(() => {
    if (!onSave) return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        onSave?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSave]);

  const saveState: "idle" | "dirty" | "saving" | "saved" = saving
    ? "saving"
    : dirty
      ? "dirty"
      : savedNonce
        ? "saved"
        : "idle";

  useUnsavedChangesGuard(dirty && !saving);

  function selectSection(key: string) {
    setActiveSection(key);
    setOpenSignals((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
    window.setTimeout(() => {
      document
        .getElementById(`pop-sec-${key}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  function updateMeta(patch: Partial<PopState["meta"]>, resetCode = false) {
    update({
      ...data,
      meta: {
        ...data.meta,
        ...patch,
        codigo: resetCode ? "" : (patch.codigo ?? data.meta.codigo),
      },
    });
  }

  function selectDocumentProcess(value: string) {
    const selected =
      catalogs.processes.find((process) => {
        const label = process.code ? `${process.code} - ${process.name}` : process.name;
        return value === process.name || value === process.code || value === label;
      }) ?? null;

    updateMeta({
      processo: selected ? selected.name : value,
      area: selected?.department ?? "",
    });
  }

  function updateSection(sectionId: string, patch: Partial<PopSection>) {
    update({
      ...data,
      sections: renumberPopSections(
        data.sections.map((item) => (item.id === sectionId ? { ...item, ...patch } : item)),
      ),
    });
  }

  function procedureNodeOpen(key: string, initiallyOpen = false) {
    return openProcedureNodes[key] ?? initiallyOpen;
  }

  function setProcedureNodeOpen(key: string, open: boolean) {
    setOpenProcedureNodes((current) =>
      current[key] === open ? current : { ...current, [key]: open },
    );
  }

  function revealProcedureNodes(...keys: string[]) {
    setOpenProcedureNodes((current) => ({
      ...current,
      ...Object.fromEntries(keys.map((key) => [key, true])),
    }));
  }

  function updateProcedureSubitem(
    sectionId: string,
    subitemId: string,
    patch: Partial<PopProcedureSubitem>,
  ) {
    update({
      ...data,
      sections: renumberPopSections(
        data.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                subitems: (section.subitems ?? []).map((subitem) =>
                  subitem.id === subitemId ? { ...subitem, ...patch } : subitem,
                ),
              }
            : section,
        ),
      ),
    });
  }

  function updateProcedureClause(
    sectionId: string,
    subitemId: string,
    clauseId: string,
    patch: Partial<PopProcedureClause>,
  ) {
    update({
      ...data,
      sections: renumberPopSections(
        data.sections.map((section) =>
          section.id === sectionId
            ? {
                ...section,
                subitems: (section.subitems ?? []).map((subitem) =>
                  subitem.id === subitemId
                    ? {
                        ...subitem,
                        clauses: subitem.clauses.map((clause) =>
                          clause.id === clauseId ? { ...clause, ...patch } : clause,
                        ),
                      }
                    : subitem,
                ),
              }
            : section,
        ),
      ),
    });
  }

  function updateProcedureBlocks(
    sectionId: string,
    subitemId: string,
    clauseId: string,
    blocks: PopProcedureBlock[],
  ) {
    const normalizedBlocks = blocks.length
      ? blocks
      : [{ id: id("clauseblock"), text: "", images: [] }];
    updateProcedureClause(sectionId, subitemId, clauseId, {
      blocks: normalizedBlocks,
      text: normalizedBlocks
        .map((block) => block.text)
        .filter(Boolean)
        .join("\n\n"),
      images: normalizedBlocks.flatMap((block) => block.images),
    });
  }

  function moveProcedureItem<T>(items: T[], fromIndex: number, toIndex: number) {
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return items;
    const next = [...items];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  }

  function reorderProcedureSubitem(sectionId: string, targetSubitemId: string) {
    if (
      !draggedProcedureSubitem ||
      draggedProcedureSubitem.sectionId !== sectionId ||
      draggedProcedureSubitem.subitemId === targetSubitemId
    ) {
      return;
    }
    const section = data.sections.find((item) => item.id === sectionId);
    const subitems = section?.subitems ?? [];
    const fromIndex = subitems.findIndex((item) => item.id === draggedProcedureSubitem.subitemId);
    const toIndex = subitems.findIndex((item) => item.id === targetSubitemId);
    if (fromIndex < 0 || toIndex < 0) return;
    updateSection(sectionId, { subitems: moveProcedureItem(subitems, fromIndex, toIndex) });
    setDraggedProcedureSubitem(null);
  }

  function reorderProcedureClause(sectionId: string, subitemId: string, targetClauseId: string) {
    if (
      !draggedProcedureClause ||
      draggedProcedureClause.sectionId !== sectionId ||
      draggedProcedureClause.subitemId !== subitemId ||
      draggedProcedureClause.clauseId === targetClauseId
    ) {
      return;
    }
    const clauses =
      data.sections
        .find((section) => section.id === sectionId)
        ?.subitems?.find((subitem) => subitem.id === subitemId)?.clauses ?? [];
    const fromIndex = clauses.findIndex((clause) => clause.id === draggedProcedureClause.clauseId);
    const toIndex = clauses.findIndex((clause) => clause.id === targetClauseId);
    if (fromIndex < 0 || toIndex < 0) return;
    updateProcedureSubitem(sectionId, subitemId, {
      clauses: moveProcedureItem(clauses, fromIndex, toIndex),
    });
    setDraggedProcedureClause(null);
  }

  function addProcedureItem() {
    const sectionId = id("sec");
    update({
      ...data,
      sections: renumberPopSections([
        ...data.sections,
        {
          id: sectionId,
          code: "",
          title: "Novo item",
          description: "",
          body: "",
          records: "",
          risks: "",
          images: [],
          subitems: [],
        },
      ]),
    });
    revealProcedureNodes(`item:${sectionId}`);
  }

  function addProcedureSubitem(section: PopSection) {
    const subitemId = id("sub");
    const clauseId = id("clause");
    updateSection(section.id, {
      subitems: [
        ...(section.subitems ?? []),
        {
          id: subitemId,
          code: "",
          title: "Novo subitem",
          clauses: [
            {
              id: clauseId,
              letter: "a",
              text: "",
              alert: "",
              images: [],
              blocks: [{ id: id("clauseblock"), text: "", images: [] }],
            },
          ],
        },
      ],
    });
    revealProcedureNodes(`item:${section.id}`, `subitem:${subitemId}`, `clause:${clauseId}`);
  }

  function addProcedureClause(sectionId: string, subitem: PopProcedureSubitem, focusText = false) {
    const clauseId = id("clause");
    updateProcedureSubitem(sectionId, subitem.id, {
      clauses: [
        ...subitem.clauses,
        {
          id: clauseId,
          letter: procedureLetter(subitem.clauses.length),
          text: "",
          alert: "",
          images: [],
          blocks: [{ id: id("clauseblock"), text: "", images: [] }],
        },
      ],
    });
    revealProcedureNodes(`item:${sectionId}`, `subitem:${subitem.id}`, `clause:${clauseId}`);
    if (focusText) {
      window.setTimeout(() => {
        document
          .querySelector<HTMLTextAreaElement>(`[data-procedure-clause="${clauseId}"] textarea`)
          ?.focus();
      }, 0);
    }
  }

  function addClauseOnTab(
    event: ReactKeyboardEvent<HTMLElement>,
    sectionId: string,
    subitem: PopProcedureSubitem,
  ) {
    const target = event.target as HTMLElement;
    if (
      event.key !== "Tab" ||
      event.shiftKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      !target.matches('input, textarea, [contenteditable="true"]')
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    addProcedureClause(sectionId, subitem, true);
  }

  async function handleDocxImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImportingDocx(true);
    try {
      const { parseDocxDocument } = await import("@/lib/docx-document-import");
      const parsed = await parseDocxDocument(file);
      if (isEditing && parsed.type && parsed.type !== data.meta.tipo) {
        parsed.warnings.push(
          `O DOCX foi identificado como ${parsed.type}, mas este registro é ${data.meta.tipo}. O tipo atual será mantido.`,
        );
      }
      setDocxImport(parsed);
      setAssistantOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível interpretar o DOCX.");
    } finally {
      setImportingDocx(false);
    }
  }

  async function handleStructuredTextImport() {
    try {
      const { parseStructuredDocumentText } = await import("@/lib/docx-document-import");
      const parsed = parseStructuredDocumentText(assistantText);
      if (isEditing && parsed.type && parsed.type !== data.meta.tipo) {
        parsed.warnings.push(
          `O texto foi identificado como ${parsed.type}, mas este registro é ${data.meta.tipo}. O tipo atual será mantido.`,
        );
      }
      setDocxImport(parsed);
      setAssistantOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível interpretar o texto.");
    }
  }

  function applyDocxImport() {
    if (!docxImport) return;
    const importedType = docxImport.type ?? data.meta.tipo;
    const importedSections = docxImport.items.map((item) => ({
      id: id("sec"),
      code: "",
      title: item.title,
      description: "",
      body: item.body,
      records: "",
      risks: "",
      images: item.images.map((image) => ({
        id: id("popimg"),
        titulo: "",
        legenda: "",
        src: image.src,
      })),
      subitems: item.subitems.map((subitem) => ({
        id: id("sub"),
        code: "",
        title: subitem.title,
        clauses: subitem.clauses.map((clause, clauseIndex) => ({
          id: id("clause"),
          letter: procedureLetter(clauseIndex),
          text: clause.text,
          alert: clause.alert,
          images: clause.images.map((image) => ({
            id: id("popimg"),
            titulo: "",
            legenda: "",
            src: image.src,
          })),
          blocks: [
            {
              id: id("clauseblock"),
              text: clause.text,
              images: clause.images.map((image) => ({
                id: id("popimg"),
                titulo: "",
                legenda: "",
                src: image.src,
              })),
            },
          ],
        })),
      })),
    }));
    const importedHistory = docxImport.history.map((row, index) => ({
      id: id("rev"),
      codigo: row.code,
      version: String(index).padStart(2, "0"),
      date: dateInputValue(row.date),
      elaborador: row.author,
      revisor: row.reviewer,
      aprovador: row.approver,
    }));
    const nextHistory = importedHistory.length ? importedHistory : data.history;
    const importedChanges = docxImport.changes.map((row, index) => ({
      id: id("change"),
      versao: String(index).padStart(2, "0"),
      local: row.location,
      descricao: row.description,
    }));
    update({
      ...data,
      meta: {
        ...data.meta,
        tipo: isEditing ? data.meta.tipo : importedType,
        codigo: data.meta.codigo,
        titulo: docxImport.title || data.meta.titulo,
        versao: docxImport.version || data.meta.versao,
        publico: docxImport.classification || data.meta.publico,
        vigencia: dateInputValue(docxImport.effectiveDate) || data.meta.vigencia,
        elaboracao: docxImport.author || nextHistory[0]?.elaborador || data.meta.elaboracao,
        revisor: docxImport.reviewer || nextHistory[0]?.revisor || data.meta.revisor,
        aprovacao: docxImport.approver || nextHistory[0]?.aprovador || data.meta.aprovacao,
        publicacao: dateInputValue(docxImport.publicationDate) || data.meta.publicacao,
      },
      purpose: {
        ...data.purpose,
        objetivo: docxImport.objective,
        abrangencia: docxImport.scope,
      },
      sections: importedSections.length ? renumberPopSections(importedSections) : data.sections,
      responsibilities: docxImport.responsibilities.length
        ? docxImport.responsibilities.map((row) => ({
            id: id("resp"),
            area: row.area,
            cargo: row.cargo,
            responsabilidade: row.responsibility,
          }))
        : data.responsibilities,
      references: docxImport.references.length
        ? docxImport.references.map((row) => ({
            id: id("ref"),
            codigo: row.code,
            titulo: row.title,
            aplicabilidade: row.applicability,
          }))
        : data.references,
      history: nextHistory,
      changes: importedChanges.length ? importedChanges : syncHistoryChanges(nextHistory, []),
    });
    setDocxImport(null);
    toast.success("Conteúdo do DOCX aplicado. Revise os campos antes de salvar.");
  }

  return (
    <div className="grid gap-5">
      {createProcessName !== null ? (
        <ProcessRegistrationDialog
          organizationId={organizationId ?? null}
          isDemo={isDemo}
          codeSettings={codeSettings}
          initialName={createProcessName}
          onClose={() => setCreateProcessName(null)}
          onCreated={async (process) => {
            await onProcessCreated(process);
            updateMeta({
              processo: process.name,
              area: process.department ?? "",
            });
          }}
        />
      ) : null}
      {assistantOpen ? (
        <Modal
          title="Assistente de preenchimento"
          subtitle="Escolha a origem do conteúdo. O resultado será apresentado para conferência antes de preencher o formulário."
          onClose={() => setAssistantOpen(false)}
        >
          <div className="grid gap-4">
            <div className="grid grid-cols-2 rounded-lg border border-border bg-muted/40 p-1">
              {(
                [
                  ["docx", "Importar DOCX", FileText],
                  ["text", "Colar texto", ListChecks],
                ] as const
              ).map(([mode, label, Icon]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setAssistantMode(mode)}
                  className={[
                    "inline-flex h-10 items-center justify-center gap-2 rounded-md text-sm font-semibold transition",
                    assistantMode === mode
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>
            {assistantMode === "docx" ? (
              <button
                type="button"
                disabled={importingDocx}
                onClick={() => docxInputRef.current?.click()}
                className="grid min-h-44 place-items-center rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center transition hover:border-primary/60 hover:bg-primary/5 disabled:opacity-50"
              >
                <span>
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Upload className="h-5 w-5" />
                  </span>
                  <span className="mt-3 block font-bold text-foreground">
                    {importingDocx ? "Lendo documento..." : "Selecionar arquivo DOCX"}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    O arquivo é processado localmente e não é enviado a serviços externos.
                  </span>
                </span>
              </button>
            ) : (
              <div className="grid gap-3">
                <label className="grid gap-1.5">
                  <span className={fieldLabelClass}>Conteúdo estruturado</span>
                  <textarea
                    value={assistantText}
                    onChange={(event) => setAssistantText(event.target.value)}
                    placeholder={
                      "POP.SEP.001 — Título do documento\n\n1. Objetivo\nTexto do objetivo...\n\n2. Abrangência\nTexto da abrangência...\n\n3. Procedimento Operacional\n3.1 Item\n3.1.1 Subitem\na) Orientação..."
                    }
                    className={`${fieldInputBase} min-h-64 resize-y p-3 leading-6`}
                  />
                </label>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setAssistantOpen(false)}
                    className={secondaryButtonClass}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleStructuredTextImport}
                    disabled={!assistantText.trim()}
                    className={`${primaryButtonClass} disabled:cursor-not-allowed disabled:opacity-50`}
                  >
                    <WandSparkles className="h-4 w-4" />
                    Analisar estrutura
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      ) : null}
      {docxImport ? (
        <Modal
          title="Revisar preenchimento sugerido"
          subtitle="Confira o reconhecimento antes de preencher o formulário. Nenhuma alteração foi salva."
          onClose={() => setDocxImport(null)}
        >
          <div className="grid gap-4">
            <div className="grid gap-3 rounded-lg border border-border bg-muted/35 p-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <div className={fieldLabelClass}>Documento identificado</div>
                <div className="mt-1 font-bold text-foreground">
                  {docxImport.title || docxImport.fileName}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {[docxImport.type, docxImport.code, `versão ${docxImport.version}`]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div>
                <div className={fieldLabelClass}>Estrutura</div>
                <div className="mt-1 text-sm font-semibold text-foreground">
                  {docxImport.stats.items} itens · {docxImport.stats.subitems} subitens
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {docxImport.stats.clauses} alíneas · {docxImport.stats.images} imagens
                </div>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ["Objetivo", docxImport.objective],
                ["Abrangência", docxImport.scope],
                ["Responsabilidades", `${docxImport.responsibilities.length} registro(s)`],
                ["Referências", `${docxImport.references.length} registro(s)`],
                ["Histórico", `${docxImport.history.length} registro(s)`],
                ["Alterações", `${docxImport.changes.length} registro(s)`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-border px-3 py-2">
                  <div className={fieldLabelClass}>{label}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-foreground">
                    {value || "Não identificado"}
                  </div>
                </div>
              ))}
            </div>
            {docxImport.warnings.length ? (
              <div className="rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/25 dark:text-amber-100">
                <div className="flex items-center gap-2 font-bold">
                  <TriangleAlert className="h-4 w-4" /> Pontos para revisão
                </div>
                <ul className="mt-2 grid gap-1 pl-5">
                  {docxImport.warnings.map((warning) => (
                    <li key={warning} className="list-disc">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDocxImport(null)}
                className={secondaryButtonClass}
              >
                Cancelar
              </button>
              <button type="button" onClick={applyDocxImport} className={primaryButtonClass}>
                Aplicar ao formulário
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      <FlowCommandBar
        code={visibleCode}
        sections={sections}
        overallPct={completion}
        saveState={saveState}
        canSave={canEditDocument}
        onSave={onSave}
        onPreview={onPreview}
        eyebrow="Processos / Documentação"
        title="Preenchimento de documento"
        saveTitle="Salvar documento"
        previewTitle="Visualizar documento"
        processControl={
          <div className="grid items-end gap-3 lg:grid-cols-[260px_minmax(320px,1fr)_auto]">
            <div className="grid gap-1">
              <span className={fieldLabelClass}>Tipo de documento</span>
              <div className="inline-flex w-fit rounded-lg border border-border bg-card p-1">
                {DOCUMENTATION_TYPE_OPTIONS.map((tipo) => {
                  const selected = tipo === data.meta.tipo;
                  return (
                    <button
                      key={tipo}
                      type="button"
                      disabled={isEditing}
                      onClick={() => {
                        if (!isEditing) updateMeta({ tipo }, tipo !== data.meta.tipo);
                      }}
                      className={[
                        "h-9 min-w-20 rounded-md px-3 text-sm font-bold transition",
                        selected
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        isEditing ? "cursor-not-allowed opacity-60" : "",
                      ].join(" ")}
                      title={
                        isEditing
                          ? "O tipo não pode ser alterado após o documento ser salvo"
                          : documentationTypeName(tipo)
                      }
                    >
                      {tipo}
                    </button>
                  );
                })}
              </div>
            </div>
            <RegisteredProcessSelect
              label="Processo do documento"
              value={selectedDocumentProcess?.id ?? ""}
              processes={catalogs.processes}
              placeholder="Selecione um processo cadastrado"
              onSelect={(process) =>
                selectDocumentProcess(
                  process
                    ? process.code
                      ? `${process.code} - ${process.name}`
                      : process.name
                    : "",
                )
              }
              displayName={(process) => process.name}
              onRequestCreate={(name) => setCreateProcessName(name)}
            />
            <div>
              <input
                ref={docxInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={handleDocxImport}
              />
              <button
                type="button"
                disabled={!canEditDocument || importingDocx}
                onClick={() => setAssistantOpen(true)}
                className={`${secondaryButtonClass} h-10 disabled:cursor-not-allowed disabled:opacity-50`}
                title="Preencher a partir de DOCX ou texto estruturado"
              >
                <WandSparkles className="h-4 w-4" />
                Assistente de preenchimento
              </button>
            </div>
          </div>
        }
      />
      {!canEditDocument ? (
        <div className="grid min-h-[360px] place-items-center rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <div className="max-w-md">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="mt-4 text-xl font-bold text-foreground">
              Selecione um processo para começar
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              O preenchimento do documento será liberado após selecionar um processo cadastrado.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
          <MappingSectionNav
            sections={sections}
            activeKey={activeSection}
            onSelect={selectSection}
            label="Índice do Documento"
          />
          <div className="grid gap-5">
            <Panel
              id="pop-sec-identification"
              num="00"
              title="Dados do documento"
              progress={sectionProgress.identification}
              defaultOpen
              openSignal={openSignals.identification}
            >
              <div className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-3">
                <div className="md:col-span-3">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Identificação e governança
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Preencha apenas os dados que serão usados na codificação, apresentação e emissão
                    do documento.
                  </p>
                </div>
                {autoCode ? (
                  <ReadOnlyField label="Código gerado do documento" value={visibleCode} />
                ) : (
                  <Field
                    label="Código"
                    value={data.meta.codigo}
                    onChange={(codigo) => updateMeta({ codigo })}
                  />
                )}
                <Field
                  label="Versão"
                  value={data.meta.versao}
                  onChange={(versao) => updateMeta({ versao })}
                />
                <Field
                  label={`Título do ${documentName}`}
                  value={data.meta.titulo}
                  onChange={(titulo) => updateMeta({ titulo: titulo.toLocaleUpperCase("pt-BR") })}
                />
                <Field
                  label="Público / classificação"
                  value={data.meta.publico}
                  onChange={(publico) => updateMeta({ publico })}
                />
                <ReadOnlyField
                  label="Área do processo"
                  value={selectedDocumentProcess?.department || data.meta.area}
                />
                <ReadOnlyField
                  label="Processo selecionado"
                  value={selectedDocumentProcess?.name || data.meta.processo}
                />
                <Field
                  label="Vigência"
                  type="date"
                  value={data.meta.vigencia}
                  onChange={(vigencia) => updateMeta({ vigencia })}
                />
                <Field
                  label="Elaborador"
                  value={data.meta.elaboracao}
                  onChange={(elaboracao) => updateMeta({ elaboracao })}
                />
                <Field
                  label="Revisor"
                  value={data.meta.revisor}
                  onChange={(revisor) => updateMeta({ revisor })}
                />
                <Field
                  label="Aprovador"
                  value={data.meta.aprovacao}
                  onChange={(aprovacao) => updateMeta({ aprovacao })}
                />
                <Field
                  label="Publicação"
                  type="date"
                  value={data.meta.publicacao}
                  onChange={(publicacao) => updateMeta({ publicacao })}
                />
                <SelectField
                  label="Status"
                  value={data.meta.status || "Em andamento"}
                  options={MODULE_STATUS_OPTIONS}
                  onChange={(status) => updateMeta({ status })}
                />
              </div>
            </Panel>
            <Panel
              id="pop-sec-objective"
              num="01"
              title="Objetivo"
              progress={sectionProgress.objective}
              openSignal={openSignals.objective}
            >
              <div className="grid gap-4">
                <TextArea
                  label="Objetivo"
                  value={data.purpose.objetivo}
                  onChange={(objetivo) =>
                    update({ ...data, purpose: { ...data.purpose, objetivo } })
                  }
                />
              </div>
            </Panel>
            <Panel
              id="pop-sec-scope"
              num="02"
              title="Abrangência"
              progress={sectionProgress.scope}
              openSignal={openSignals.scope}
            >
              <div className="grid gap-4">
                <TextArea
                  label="Abrangência"
                  value={data.purpose.abrangencia}
                  onChange={(abrangencia) =>
                    update({ ...data, purpose: { ...data.purpose, abrangencia } })
                  }
                />
              </div>
            </Panel>
            <Panel
              id="pop-sec-procedure"
              num="03"
              title={contentTitle}
              progress={sectionProgress.sections}
              openSignal={openSignals.procedure}
            >
              <div className="grid gap-3">
                <div className="sticky top-24 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
                  <div className="text-sm text-muted-foreground">
                    <strong className="text-foreground">{data.sections.length}</strong>{" "}
                    {data.sections.length === 1 ? "item" : "itens"} no documento
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addProcedureItem}
                      className="inline-flex items-center gap-2 rounded-md bg-[var(--gold)] px-3 py-1.5 text-xs font-bold text-black transition hover:brightness-95"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Novo item
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenProcedureNodes(
                          Object.fromEntries(procedureNodeKeys.map((key) => [key, false])),
                        )
                      }
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      Recolher tudo
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setOpenProcedureNodes(
                          Object.fromEntries(procedureNodeKeys.map((key) => [key, true])),
                        )
                      }
                      className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    >
                      Expandir tudo
                    </button>
                  </div>
                </div>
                {data.sections.map((section) => (
                  <details
                    key={section.id}
                    open={procedureNodeOpen(
                      `item:${section.id}`,
                      !isEditing && data.sections[0]?.id === section.id,
                    )}
                    onToggle={(event) =>
                      setProcedureNodeOpen(`item:${section.id}`, event.currentTarget.open)
                    }
                    className="group overflow-hidden rounded-lg border border-border bg-muted/20"
                  >
                    <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 marker:hidden hover:bg-muted/40">
                      <span className="rounded-full bg-[color-mix(in_oklab,var(--gold)_16%,transparent)] px-3 py-1 text-xs font-bold text-[var(--gold)]">
                        {section.code}
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-sm text-foreground">
                          {section.title.replace(/^3\.\d+\s*/, "") || "Item sem título"}
                        </strong>
                        <small className="text-xs text-muted-foreground">
                          {(section.subitems ?? []).length}{" "}
                          {(section.subitems ?? []).length === 1 ? "subitem" : "subitens"}
                        </small>
                      </span>
                      <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
                    </summary>
                    <div className="border-t border-border p-3">
                      <div className="mb-3 grid gap-3 md:grid-cols-[100px_1fr_auto]">
                        <ReadOnlyField label="Item" value={section.code ?? ""} />
                        <Field
                          compact
                          label="Título do item"
                          value={section.title.replace(/^3\.\d+\s*/, "")}
                          onChange={(title) => updateSection(section.id, { title })}
                        />
                        <IconButton
                          label="Excluir item"
                          onClick={() =>
                            update({
                              ...data,
                              sections: renumberPopSections(
                                data.sections.filter((item) => item.id !== section.id),
                              ),
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </IconButton>
                      </div>
                      <div className="mb-3 grid gap-3 rounded-lg border border-border bg-card p-3">
                        <TextArea
                          label="Texto do item"
                          value={section.body}
                          rows={4}
                          onChange={(body) => updateSection(section.id, { body })}
                        />
                        <label
                          htmlFor={`procedure-item-images-${section.id}`}
                          title="Adicionar imagem ao item"
                          aria-label="Adicionar imagem ao item"
                          className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-[var(--gold)]/50 hover:bg-[color-mix(in_oklab,var(--gold)_8%,transparent)] hover:text-[var(--gold)]"
                        >
                          <ImagePlus className="h-3.5 w-3.5" />
                          <span className="sr-only">Adicionar imagem</span>
                        </label>
                        <ImageManager
                          label="Imagens do item"
                          captionLabel="Legenda"
                          showTitle={false}
                          inputId={`procedure-item-images-${section.id}`}
                          hideAddButton
                          hideEmptyContainer
                          images={section.images}
                          onChange={(images) => updateSection(section.id, { images })}
                        />
                      </div>
                      <div className="grid gap-3">
                        {(section.subitems ?? []).map((subitem) => (
                          <details
                            key={subitem.id}
                            open={procedureNodeOpen(
                              `subitem:${subitem.id}`,
                              !isEditing && (section.subitems ?? [])[0]?.id === subitem.id,
                            )}
                            onToggle={(event) =>
                              setProcedureNodeOpen(
                                `subitem:${subitem.id}`,
                                event.currentTarget.open,
                              )
                            }
                            onDragOver={(event: DragEvent<HTMLDetailsElement>) => {
                              if (
                                draggedProcedureSubitem?.sectionId === section.id &&
                                draggedProcedureSubitem.subitemId !== subitem.id
                              ) {
                                event.preventDefault();
                              }
                            }}
                            onDrop={(event: DragEvent<HTMLDetailsElement>) => {
                              event.preventDefault();
                              reorderProcedureSubitem(section.id, subitem.id);
                            }}
                            onKeyDown={(event) => addClauseOnTab(event, section.id, subitem)}
                            className={`group overflow-hidden rounded-lg border border-border bg-card transition ${
                              draggedProcedureSubitem?.subitemId === subitem.id
                                ? "opacity-60 ring-2 ring-[var(--gold)]/40"
                                : ""
                            }`}
                          >
                            <summary className="grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 marker:hidden hover:bg-muted/40">
                              <span className="font-mono text-xs font-bold text-[var(--gold)]">
                                {subitem.code}
                              </span>
                              <span className="min-w-0">
                                <strong className="block truncate text-sm text-foreground">
                                  {subitem.title || "Subitem sem título"}
                                </strong>
                                <small className="text-xs text-muted-foreground">
                                  {subitem.clauses.length}{" "}
                                  {subitem.clauses.length === 1 ? "alínea" : "alíneas"}
                                </small>
                              </span>
                              <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
                            </summary>
                            <div className="border-t border-border p-3">
                              <div className="mb-3 grid gap-3 md:grid-cols-[40px_120px_1fr_auto]">
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={() =>
                                    setDraggedProcedureSubitem({
                                      sectionId: section.id,
                                      subitemId: subitem.id,
                                    })
                                  }
                                  onDragEnd={() => setDraggedProcedureSubitem(null)}
                                  className="mt-5 grid h-9 w-9 cursor-grab place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                  title="Mover subitem"
                                  aria-label="Mover subitem"
                                >
                                  <ArrowDownUp className="h-4 w-4" />
                                </button>
                                <ReadOnlyField label="Subitem" value={subitem.code} />
                                <Field
                                  compact
                                  label="Título do subitem"
                                  value={subitem.title}
                                  onChange={(title) =>
                                    updateProcedureSubitem(section.id, subitem.id, { title })
                                  }
                                />
                                <IconButton
                                  label="Excluir subitem"
                                  onClick={() =>
                                    updateSection(section.id, {
                                      subitems: (section.subitems ?? []).filter(
                                        (item) => item.id !== subitem.id,
                                      ),
                                    })
                                  }
                                >
                                  <Trash2 className="h-4 w-4" />
                                </IconButton>
                              </div>
                              <div className="grid gap-3">
                                {subitem.clauses.map((clause) => {
                                  const blocks = procedureClauseBlocks(clause);
                                  return (
                                    <details
                                      key={clause.id}
                                      data-procedure-clause={clause.id}
                                      open={procedureNodeOpen(
                                        `clause:${clause.id}`,
                                        subitem.clauses[0]?.id === clause.id,
                                      )}
                                      onToggle={(event) =>
                                        setProcedureNodeOpen(
                                          `clause:${clause.id}`,
                                          event.currentTarget.open,
                                        )
                                      }
                                      onDragOver={(event: DragEvent<HTMLDetailsElement>) => {
                                        if (
                                          draggedProcedureClause?.sectionId === section.id &&
                                          draggedProcedureClause.subitemId === subitem.id &&
                                          draggedProcedureClause.clauseId !== clause.id
                                        ) {
                                          event.preventDefault();
                                          event.stopPropagation();
                                        }
                                      }}
                                      onDrop={(event: DragEvent<HTMLDetailsElement>) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        reorderProcedureClause(section.id, subitem.id, clause.id);
                                      }}
                                      onKeyDown={(event) =>
                                        addClauseOnTab(event, section.id, subitem)
                                      }
                                      className={`group overflow-hidden rounded-lg border border-border bg-muted/20 transition ${
                                        draggedProcedureClause?.clauseId === clause.id
                                          ? "opacity-60 ring-2 ring-[var(--gold)]/40"
                                          : ""
                                      }`}
                                    >
                                      <summary className="grid cursor-pointer list-none grid-cols-[36px_auto_minmax(0,1fr)_auto_auto] items-center gap-2 px-3 py-2 marker:hidden hover:bg-muted/40">
                                        <button
                                          type="button"
                                          draggable
                                          onClick={(event) => event.stopPropagation()}
                                          onDragStart={(event) => {
                                            event.stopPropagation();
                                            setDraggedProcedureClause({
                                              sectionId: section.id,
                                              subitemId: subitem.id,
                                              clauseId: clause.id,
                                            });
                                          }}
                                          onDragEnd={() => setDraggedProcedureClause(null)}
                                          className="grid h-9 w-9 shrink-0 cursor-grab place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground active:cursor-grabbing"
                                          title="Mover alínea"
                                          aria-label="Mover alínea"
                                        >
                                          <ArrowDownUp className="h-4 w-4" />
                                        </button>
                                        <span className="font-mono text-sm font-bold text-[var(--gold)]">
                                          {clause.letter})
                                        </span>
                                        <span className="min-w-0">
                                          <strong className="block truncate text-sm font-medium text-foreground">
                                            {blocks.find((block) => block.text.trim())?.text ||
                                              "Alínea sem texto"}
                                          </strong>
                                          <small className="text-xs text-muted-foreground">
                                            {blocks.length}{" "}
                                            {blocks.length === 1 ? "trecho" : "trechos"}
                                            {" · "}
                                            {blocks.reduce(
                                              (total, block) => total + block.images.length,
                                              0,
                                            )}{" "}
                                            imagens
                                          </small>
                                        </span>
                                        <div onClick={(event) => event.stopPropagation()}>
                                          <IconButton
                                            label="Excluir alínea"
                                            onClick={() =>
                                              updateProcedureSubitem(section.id, subitem.id, {
                                                clauses: subitem.clauses.filter(
                                                  (item) => item.id !== clause.id,
                                                ),
                                              })
                                            }
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </IconButton>
                                        </div>
                                        <ChevronDown className="h-4 w-4 text-muted-foreground transition group-open:rotate-180" />
                                      </summary>

                                      <div className="grid gap-3 border-t border-border p-3">
                                        {blocks.map((block, blockIndex) => (
                                          <div
                                            key={block.id}
                                            className="rounded-lg border border-border bg-card p-3"
                                          >
                                            <div className="mb-3 flex items-center justify-between gap-3">
                                              <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                                                Trecho {String(blockIndex + 1).padStart(2, "0")}
                                              </span>
                                              {blocks.length > 1 ? (
                                                <IconButton
                                                  label="Excluir trecho"
                                                  onClick={() =>
                                                    updateProcedureBlocks(
                                                      section.id,
                                                      subitem.id,
                                                      clause.id,
                                                      blocks.filter((item) => item.id !== block.id),
                                                    )
                                                  }
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </IconButton>
                                              ) : null}
                                            </div>
                                            <div className="grid gap-3">
                                              <TextArea
                                                label="Texto"
                                                value={block.text}
                                                rows={3}
                                                onChange={(text) =>
                                                  updateProcedureBlocks(
                                                    section.id,
                                                    subitem.id,
                                                    clause.id,
                                                    blocks.map((item) =>
                                                      item.id === block.id
                                                        ? { ...item, text }
                                                        : item,
                                                    ),
                                                  )
                                                }
                                              />
                                              <ImageManager
                                                label="Imagens deste trecho"
                                                captionLabel="Legenda"
                                                showTitle={false}
                                                inputId={`procedure-images-${block.id}`}
                                                hideAddButton
                                                images={block.images}
                                                onChange={(images) =>
                                                  updateProcedureBlocks(
                                                    section.id,
                                                    subitem.id,
                                                    clause.id,
                                                    blocks.map((item) =>
                                                      item.id === block.id
                                                        ? { ...item, images }
                                                        : item,
                                                    ),
                                                  )
                                                }
                                              />
                                            </div>
                                          </div>
                                        ))}

                                        <div className="flex items-center gap-1.5">
                                          <label
                                            htmlFor={`procedure-images-${blocks.at(-1)?.id}`}
                                            title="Adicionar imagem ao trecho atual"
                                            aria-label="Adicionar imagem ao trecho atual"
                                            className="grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-[var(--gold)]/50 hover:bg-[color-mix(in_oklab,var(--gold)_8%,transparent)] hover:text-[var(--gold)]"
                                          >
                                            <ImagePlus className="h-3.5 w-3.5" />
                                            <span className="sr-only">Adicionar imagem</span>
                                          </label>
                                          <button
                                            type="button"
                                            title="Adicionar trecho"
                                            aria-label="Adicionar trecho"
                                            onClick={() =>
                                              updateProcedureBlocks(
                                                section.id,
                                                subitem.id,
                                                clause.id,
                                                [
                                                  ...blocks,
                                                  { id: id("clauseblock"), text: "", images: [] },
                                                ],
                                              )
                                            }
                                            className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-[var(--gold)]/50 hover:bg-[color-mix(in_oklab,var(--gold)_8%,transparent)] hover:text-[var(--gold)]"
                                          >
                                            <Plus className="h-3.5 w-3.5" />
                                          </button>

                                          {!clause.alert && !visibleClauseNotes[clause.id] ? (
                                            <button
                                              type="button"
                                              title="Adicionar observação"
                                              aria-label="Adicionar observação"
                                              onClick={() =>
                                                setVisibleClauseNotes((current) => ({
                                                  ...current,
                                                  [clause.id]: true,
                                                }))
                                              }
                                              className="grid h-8 w-8 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-primary/40 hover:bg-primary/5 hover:text-primary"
                                            >
                                              <TriangleAlert className="h-3.5 w-3.5" />
                                            </button>
                                          ) : null}
                                        </div>

                                        {clause.alert || visibleClauseNotes[clause.id] ? (
                                          <div className="rounded-lg border border-primary/35 bg-primary/5 p-3">
                                            <div className="mb-2 flex items-center justify-between gap-3">
                                              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                                <TriangleAlert className="h-4 w-4 text-primary" />
                                                Observação
                                              </div>
                                              <IconButton
                                                label="Remover observação"
                                                onClick={() => {
                                                  updateProcedureClause(
                                                    section.id,
                                                    subitem.id,
                                                    clause.id,
                                                    {
                                                      alert: "",
                                                    },
                                                  );
                                                  setVisibleClauseNotes((current) => ({
                                                    ...current,
                                                    [clause.id]: false,
                                                  }));
                                                }}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </IconButton>
                                            </div>
                                            <TextArea
                                              label="Texto da observação"
                                              value={clause.alert}
                                              rows={2}
                                              onChange={(alert) =>
                                                updateProcedureClause(
                                                  section.id,
                                                  subitem.id,
                                                  clause.id,
                                                  {
                                                    alert,
                                                  },
                                                )
                                              }
                                            />
                                          </div>
                                        ) : null}
                                      </div>
                                    </details>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() => addProcedureClause(section.id, subitem)}
                                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                                >
                                  <Plus className="h-4 w-4" />
                                  Adicionar alínea
                                </button>
                              </div>
                            </div>
                          </details>
                        ))}
                        <button
                          type="button"
                          onClick={() => addProcedureSubitem(section)}
                          className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                        >
                          <Plus className="h-4 w-4" />
                          Adicionar subitem
                        </button>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </Panel>
            <Panel
              id="pop-sec-responsibilities"
              num="04"
              title="Responsabilidades"
              progress={sectionProgress.responsibilities}
              openSignal={openSignals.responsibilities}
            >
              <div className="grid gap-3">
                <div className="hidden rounded-t-lg border border-border bg-muted/50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground md:grid md:grid-cols-[220px_220px_1fr_44px]">
                  <span>Área</span>
                  <span>Cargo</span>
                  <span>Responsabilidades</span>
                  <span />
                </div>
                {data.responsibilities.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[220px_220px_1fr_auto]"
                  >
                    <CatalogSearchField
                      label="Área"
                      value={row.area}
                      options={catalogs.departments.map((department) => department.name)}
                      createLabel="Cadastrar área"
                      onCreate={(initial) => {
                        setQuickCatalog({ kind: "area", initial });
                        setQuickAreaSigla(normalizeSigla(initial));
                      }}
                      onChange={(area) =>
                        update({
                          ...data,
                          responsibilities: data.responsibilities.map((item) =>
                            item.id === row.id ? { ...item, area } : item,
                          ),
                        })
                      }
                    />
                    <CatalogSearchField
                      label="Cargo"
                      value={row.cargo ?? ""}
                      options={catalogs.positions.map((position) => position.title)}
                      createLabel="Cadastrar cargo"
                      onCreate={(initial) => setQuickCatalog({ kind: "position", initial })}
                      onChange={(cargo) =>
                        update({
                          ...data,
                          responsibilities: data.responsibilities.map((item) =>
                            item.id === row.id ? { ...item, cargo } : item,
                          ),
                        })
                      }
                    />
                    <TextArea
                      label="Responsabilidades"
                      value={row.responsabilidade}
                      onChange={(responsabilidade) =>
                        update({
                          ...data,
                          responsibilities: data.responsibilities.map((item) =>
                            item.id === row.id ? { ...item, responsabilidade } : item,
                          ),
                        })
                      }
                    />
                    <IconButton
                      label="Excluir"
                      onClick={() =>
                        update({
                          ...data,
                          responsibilities: data.responsibilities.filter(
                            (item) => item.id !== row.id,
                          ),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update({
                      ...data,
                      responsibilities: [
                        ...data.responsibilities,
                        { id: id("resp"), area: "", cargo: "", responsabilidade: "" },
                      ],
                    })
                  }
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar responsabilidade
                </button>
              </div>
            </Panel>
            <Panel
              id="pop-sec-references"
              num="05"
              title="Referências normativas"
              progress={sectionProgress.references}
              openSignal={openSignals.references}
            >
              <div className="grid gap-3">
                {data.references.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[1fr_auto]"
                  >
                    <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                      <Field
                        compact
                        label="Código"
                        value={row.codigo}
                        onChange={(codigo) =>
                          update({
                            ...data,
                            references: data.references.map((item) =>
                              item.id === row.id ? { ...item, codigo } : item,
                            ),
                          })
                        }
                      />
                      <Field
                        compact
                        label="Título"
                        value={row.titulo}
                        onChange={(titulo) =>
                          update({
                            ...data,
                            references: data.references.map((item) =>
                              item.id === row.id ? { ...item, titulo } : item,
                            ),
                          })
                        }
                      />
                      <div className="md:col-span-2">
                        <TextArea
                          label="Aplicabilidade"
                          value={row.aplicabilidade}
                          rows={2}
                          onChange={(aplicabilidade) =>
                            update({
                              ...data,
                              references: data.references.map((item) =>
                                item.id === row.id ? { ...item, aplicabilidade } : item,
                              ),
                            })
                          }
                        />
                      </div>
                    </div>
                    <IconButton
                      label="Excluir"
                      onClick={() =>
                        update({
                          ...data,
                          references: data.references.filter((item) => item.id !== row.id),
                        })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
                <button
                  onClick={() =>
                    update({
                      ...data,
                      references: [
                        ...data.references,
                        { id: id("ref"), codigo: "", titulo: "", aplicabilidade: "" },
                      ],
                    })
                  }
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar referência
                </button>
              </div>
            </Panel>
            <Panel
              id="pop-sec-history"
              num="06"
              title="Histórico e controle de alterações"
              progress={sectionProgress.history}
              openSignal={openSignals.history}
            >
              <h3 className="mb-3 text-sm font-semibold text-foreground">Histórico</h3>
              <div className="grid gap-3">
                {data.history.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 lg:grid-cols-[120px_100px_140px_1fr_1fr_1fr_auto]"
                  >
                    <Field
                      compact
                      label="Código"
                      value={row.codigo}
                      onChange={(codigo) =>
                        setHistory(
                          data.history.map((item) =>
                            item.id === row.id ? { ...item, codigo } : item,
                          ),
                        )
                      }
                    />
                    <ReadOnlyField
                      label="Versão"
                      value={historyVersion(data.history.findIndex((item) => item.id === row.id))}
                    />
                    <Field
                      compact
                      label="Data"
                      type="date"
                      value={row.date}
                      onChange={(date) =>
                        setHistory(
                          data.history.map((item) =>
                            item.id === row.id ? { ...item, date } : item,
                          ),
                        )
                      }
                    />
                    <Field
                      compact
                      label="Elaborador"
                      value={row.elaborador}
                      onChange={(elaborador) =>
                        setHistory(
                          data.history.map((item) =>
                            item.id === row.id ? { ...item, elaborador } : item,
                          ),
                        )
                      }
                    />
                    <Field
                      compact
                      label="Revisor"
                      value={row.revisor}
                      onChange={(revisor) =>
                        setHistory(
                          data.history.map((item) =>
                            item.id === row.id ? { ...item, revisor } : item,
                          ),
                        )
                      }
                    />
                    <Field
                      compact
                      label="Aprovador"
                      value={row.aprovador}
                      onChange={(aprovador) =>
                        setHistory(
                          data.history.map((item) =>
                            item.id === row.id ? { ...item, aprovador } : item,
                          ),
                        )
                      }
                    />
                    <IconButton
                      label="Excluir"
                      onClick={() => setHistory(data.history.filter((item) => item.id !== row.id))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                ))}
                <button
                  onClick={() =>
                    setHistory([
                      ...data.history,
                      {
                        id: id("rev"),
                        codigo: "",
                        version: historyVersion(data.history.length),
                        date: today(),
                        elaborador: "",
                        revisor: "",
                        aprovador: "",
                      },
                    ])
                  }
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar histórico
                </button>
              </div>
              <h3 className="mb-3 mt-6 text-sm font-semibold text-foreground">Alterações</h3>
              <div className="grid gap-3">
                {data.changes.map((row) => (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[120px_220px_1fr]"
                  >
                    <ReadOnlyField
                      label="Versão"
                      value={historyVersion(data.changes.findIndex((item) => item.id === row.id))}
                    />
                    <Field
                      compact
                      label="Local da revisão"
                      value={row.local}
                      onChange={(local) =>
                        update({
                          ...data,
                          changes: data.changes.map((item) =>
                            item.id === row.id ? { ...item, local } : item,
                          ),
                        })
                      }
                    />
                    <Field
                      compact
                      label="Descrição"
                      value={row.descricao}
                      onChange={(descricao) =>
                        update({
                          ...data,
                          changes: data.changes.map((item) =>
                            item.id === row.id ? { ...item, descricao } : item,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  As linhas de alteração são geradas automaticamente a partir do histórico.
                </p>
              </div>
            </Panel>
            <div aria-hidden className="h-[35vh]" />
          </div>
        </div>
      )}
      {quickCatalog ? (
        <Modal
          title={quickCatalog.kind === "area" ? "Cadastrar área" : "Cadastrar cargo"}
          subtitle={
            quickCatalog.kind === "area"
              ? "Cadastro utilizado pelos formulários e pela codificação de documentos."
              : "Cadastro utilizado nas responsabilidades dos documentos."
          }
          onClose={() => setQuickCatalog(null)}
        >
          <div className="grid gap-4">
            <Field
              label={quickCatalog.kind === "area" ? "Nome da área" : "Título do cargo"}
              value={quickCatalog.initial}
              onChange={(initial) => setQuickCatalog({ ...quickCatalog, initial })}
            />
            {quickCatalog.kind === "area" ? (
              <Field
                label="Sigla"
                value={quickAreaSigla}
                onChange={(value) =>
                  setQuickAreaSigla(
                    value
                      .replace(/[^A-Za-z]/g, "")
                      .toUpperCase()
                      .slice(0, 3),
                  )
                }
              />
            ) : (
              <TextArea
                label="Descrição"
                value={quickPositionDescription}
                rows={3}
                onChange={setQuickPositionDescription}
              />
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setQuickCatalog(null)}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={saveQuickCatalog}
                className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground hover:bg-muted"
              >
                Salvar
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

const BPMN_POOL_X = 80;
const BPMN_POOL_Y = 80;
const BPMN_POOL_LABEL_WIDTH = 62;
const BPMN_LANE_LABEL_WIDTH = 82;
const BPMN_LEFT_HEADER_WIDTH = BPMN_POOL_LABEL_WIDTH + BPMN_LANE_LABEL_WIDTH;

function bpmnLaneHeightsForTitle(title: string, current: number[] | undefined) {
  const laneHeights = current?.length ? [...current] : [260];
  const requiredPoolHeight = Math.max(
    260,
    Math.min(560, Math.ceil(title.trim().length * 8.5 + 48)),
  );
  const currentPoolHeight = laneHeights.reduce((total, height) => total + height, 0);
  if (currentPoolHeight < requiredPoolHeight) {
    laneHeights[0] += requiredPoolHeight - currentPoolHeight;
  }
  return laneHeights;
}

function xmlChildren(element: Element, localName?: string) {
  return Array.from(element.children).filter(
    (child) => !localName || child.localName === localName,
  );
}

function xmlFirst(element: Element, localName: string) {
  return xmlChildren(element, localName)[0] ?? null;
}

function xmlAttr(element: Element | null | undefined, name: string, fallback = "") {
  return element?.getAttribute(name) ?? fallback;
}

function xmlNumber(element: Element | null | undefined, name: string, fallback = 0) {
  const value = Number(xmlAttr(element, name));
  return Number.isFinite(value) ? value : fallback;
}

function nodeGraphicsInfo(element: Element) {
  return xmlFirst(xmlFirst(element, "NodeGraphicsInfos") ?? element, "NodeGraphicsInfo");
}

function nodeCoordinates(element: Element) {
  return xmlFirst(nodeGraphicsInfo(element) ?? element, "Coordinates");
}

function detectXpdlNodeType(activity: Element): BpmnNodeType {
  if (xmlFirst(xmlFirst(activity, "Event") ?? activity, "StartEvent")) return "start";
  if (xmlFirst(xmlFirst(activity, "Event") ?? activity, "EndEvent")) return "end";
  if (xmlFirst(activity, "Route")) return "gateway";
  return "task";
}

function normalizeImportedText(value: string, fallback: string) {
  return value.trim() || fallback;
}

async function selectedBizagiDiagramName(zip: JSZip) {
  const preferenceFile = Object.keys(zip.files).find((name) =>
    name.endsWith("UserPreferences.xml"),
  );
  if (!preferenceFile) return null;
  const xml = await zip.files[preferenceFile].async("text");
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const selected = Array.from(doc.getElementsByTagName("ModelItem")).find(
    (item) =>
      item.getAttribute("ItemType") === "Diagram" && item.getAttribute("IsSelected") === "true",
  );
  const diagramId = selected?.getAttribute("DiagramId");
  return diagramId ? `${diagramId}.diag` : null;
}

async function importBpmnFile(file: File): Promise<BpmnState> {
  const buffer = await file.arrayBuffer();
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".bpm")) {
    const { default: JSZipRuntime } = await import("jszip");
    const outer = await JSZipRuntime.loadAsync(buffer);
    const preferred = await selectedBizagiDiagramName(outer);
    const diagName =
      (preferred && outer.file(preferred) ? preferred : null) ??
      Object.keys(outer.files).find((name) => name.endsWith(".diag"));
    if (!diagName) throw new Error("Arquivo BPM sem diagrama importavel.");
    const inner = await JSZipRuntime.loadAsync(await outer.file(diagName)!.async("arraybuffer"));
    const diagram = inner.file("Diagram.xml");
    if (!diagram) throw new Error("Diagrama Bizagi sem Diagram.xml.");
    return parseXpdlDiagram(await diagram.async("text"));
  }
  const xml = new TextDecoder("utf-8").decode(buffer);
  if (xml.includes("XPDL2.2") || xml.includes("<Package")) return parseXpdlDiagram(xml);
  return parseBpmnXmlDiagram(xml);
}

function parseXpdlDiagram(xml: string): BpmnState {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const packageElement = doc.documentElement;
  const pools = Array.from(doc.getElementsByTagNameNS("*", "Pool"));
  const pool =
    pools.find(
      (item) =>
        item.getAttribute("BoundaryVisible") !== "false" &&
        item.getElementsByTagNameNS("*", "Lane").length > 0,
    ) ??
    pools.find((item) => item.getElementsByTagNameNS("*", "Lane").length > 0) ??
    pools[0];
  const lanesXml = pool ? Array.from(pool.getElementsByTagNameNS("*", "Lane")) : [];
  const laneSource = lanesXml.map((lane, index) => {
    const graphics = nodeGraphicsInfo(lane);
    const coordinates = nodeCoordinates(lane);
    return {
      name: normalizeImportedText(xmlAttr(lane, "Name"), `Raia ${index + 1}`),
      sourceY: xmlNumber(coordinates, "YCoordinate", index * 180),
      sourceHeight: Math.max(120, xmlNumber(graphics, "Height", 180)),
      sourceWidth: Math.max(760, xmlNumber(graphics, "Width", 1000)),
    };
  });
  const lanes = laneSource.length ? laneSource.map((lane) => lane.name) : ["Raia 1"];
  const maxSourceWidth = Math.max(...laneSource.map((lane) => lane.sourceWidth), 1000);
  const scale = Math.min(1, 1180 / Math.max(maxSourceWidth, 1));
  const laneHeights = laneSource.length
    ? laneSource.map((lane) => Math.max(140, Math.round(lane.sourceHeight * scale)))
    : [240];
  const laneTargetY = (index: number) =>
    BPMN_POOL_Y + laneHeights.slice(0, index).reduce((total, height) => total + height, 0);
  const sourceLaneIndex = (sourceY: number) => {
    const found = laneSource.findIndex(
      (lane) => sourceY >= lane.sourceY && sourceY <= lane.sourceY + lane.sourceHeight,
    );
    return found >= 0 ? found : 0;
  };
  const sourceMinX = Math.min(
    ...Array.from(doc.getElementsByTagNameNS("*", "Activity"))
      .map((activity) => xmlNumber(nodeCoordinates(activity), "XCoordinate", 0))
      .filter((value) => value > 0),
    120,
  );
  const sourceToTarget = (sourceX: number, sourceY: number) => {
    const laneIndex = sourceLaneIndex(sourceY);
    const lane = laneSource[laneIndex] ?? { sourceY: 0 };
    return {
      x: BPMN_POOL_X + BPMN_LEFT_HEADER_WIDTH + 60 + (sourceX - sourceMinX) * scale,
      y: laneTargetY(laneIndex) + Math.max(20, (sourceY - lane.sourceY) * scale),
    };
  };
  const activityNodes = Array.from(doc.getElementsByTagNameNS("*", "Activity"));
  const nodes: BpmnNode[] = activityNodes.map((activity, index) => {
    const type = detectXpdlNodeType(activity);
    const graphics = nodeGraphicsInfo(activity);
    const coordinates = nodeCoordinates(activity);
    const sourceX = xmlNumber(coordinates, "XCoordinate", 160 + index * 120);
    const sourceY = xmlNumber(coordinates, "YCoordinate", 120);
    const target = sourceToTarget(sourceX, sourceY);
    const rawWidth = xmlNumber(graphics, "Width", type === "task" ? 120 : 44) * scale;
    const rawHeight = xmlNumber(graphics, "Height", type === "task" ? 70 : 44) * scale;
    const width =
      type === "task"
        ? Math.max(100, rawWidth)
        : type === "gateway"
          ? Math.max(56, rawWidth)
          : Math.max(42, rawWidth);
    const height =
      type === "task"
        ? Math.max(58, rawHeight)
        : type === "gateway"
          ? Math.max(56, rawHeight)
          : Math.max(42, rawHeight);
    return {
      id: xmlAttr(activity, "Id", id(type)),
      type,
      label: normalizeImportedText(
        xmlAttr(activity, "Name"),
        type === "start"
          ? "Inicio"
          : type === "end"
            ? "Fim"
            : type === "gateway"
              ? "Decisao"
              : `Atividade ${index + 1}`,
      ),
      x: Math.round(target.x),
      y: Math.round(target.y),
      lane: sourceLaneIndex(sourceY + xmlNumber(graphics, "Height", 0) / 2),
      width: Math.round(width),
      height: Math.round(height),
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const flows = Array.from(doc.getElementsByTagNameNS("*", "Transition"))
    .map((transition) => {
      const from = xmlAttr(transition, "From");
      const to = xmlAttr(transition, "To");
      if (!nodeIds.has(from) || !nodeIds.has(to)) return null;
      const converted = Array.from(transition.getElementsByTagNameNS("*", "Coordinates")).map(
        (coordinates) =>
          sourceToTarget(
            xmlNumber(coordinates, "XCoordinate", 0),
            xmlNumber(coordinates, "YCoordinate", 0),
          ),
      );
      const middle = converted.length > 2 ? converted.slice(1, -1) : converted;
      return {
        id: xmlAttr(transition, "Id", id("flow")),
        from,
        to,
        label: xmlAttr(transition, "Name") || undefined,
        type: "sequence" as const,
        points: middle.map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) })),
      };
    })
    .filter(Boolean) as BpmnFlow[];
  const maxX = Math.max(
    ...nodes.map((node) => node.x + (node.width ?? 0)),
    ...flows.flatMap((flow) => flow.points ?? []).map((point) => point.x),
    1000,
  );
  return {
    poolName: normalizeImportedText(
      xmlAttr(pool, "Name"),
      xmlAttr(packageElement, "Name", "Processo importado"),
    ),
    codigo: xmlAttr(packageElement, "Id"),
    lanes,
    laneHeights,
    poolWidth: Math.max(900, Math.round(maxX - BPMN_POOL_X + 130)),
    nodes,
    flows,
  };
}

function parseBpmnXmlDiagram(xml: string): BpmnState {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const boundsByElement = new Map<
    string,
    { x: number; y: number; width: number; height: number }
  >();
  Array.from(doc.getElementsByTagNameNS("*", "BPMNShape")).forEach((shape) => {
    const elementId = xmlAttr(shape, "bpmnElement");
    const bounds = Array.from(shape.getElementsByTagNameNS("*", "Bounds"))[0];
    if (!elementId || !bounds) return;
    boundsByElement.set(elementId, {
      x: xmlNumber(bounds, "x", 0),
      y: xmlNumber(bounds, "y", 0),
      width: xmlNumber(bounds, "width", 120),
      height: xmlNumber(bounds, "height", 70),
    });
  });
  const minX = Math.min(...Array.from(boundsByElement.values()).map((item) => item.x), 100);
  const minY = Math.min(...Array.from(boundsByElement.values()).map((item) => item.y), 100);
  const target = (x: number, y: number) => ({
    x: Math.round(BPMN_POOL_X + BPMN_LEFT_HEADER_WIDTH + 60 + (x - minX)),
    y: Math.round(BPMN_POOL_Y + 60 + (y - minY)),
  });
  const mapType = (element: Element): BpmnNodeType => {
    if (element.localName === "startEvent") return "start";
    if (element.localName === "endEvent") return "end";
    if (element.localName.toLowerCase().includes("gateway")) return "gateway";
    return "task";
  };
  const names = [
    "startEvent",
    "endEvent",
    "task",
    "userTask",
    "serviceTask",
    "manualTask",
    "exclusiveGateway",
    "parallelGateway",
    "inclusiveGateway",
  ];
  const nodeElements = names.flatMap((name) => Array.from(doc.getElementsByTagNameNS("*", name)));
  const nodes = nodeElements.map((element, index) => {
    const elementId = xmlAttr(element, "id", id("task"));
    const type = mapType(element);
    const bounds = boundsByElement.get(elementId) ?? {
      x: 120 + index * 160,
      y: 120,
      width: type === "task" ? 130 : 50,
      height: type === "task" ? 72 : 50,
    };
    const p = target(bounds.x, bounds.y);
    return {
      id: elementId,
      type,
      label: normalizeImportedText(
        xmlAttr(element, "name"),
        type === "start"
          ? "Inicio"
          : type === "end"
            ? "Fim"
            : type === "gateway"
              ? "Decisao"
              : `Atividade ${index + 1}`,
      ),
      x: p.x,
      y: p.y,
      lane: 0,
      width: Math.max(type === "task" ? 110 : 46, bounds.width),
      height: Math.max(type === "task" ? 58 : 46, bounds.height),
    };
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const flows = Array.from(doc.getElementsByTagNameNS("*", "sequenceFlow"))
    .map((flow) => {
      const from = xmlAttr(flow, "sourceRef");
      const to = xmlAttr(flow, "targetRef");
      if (!nodeIds.has(from) || !nodeIds.has(to)) return null;
      return {
        id: xmlAttr(flow, "id", id("flow")),
        from,
        to,
        label: xmlAttr(flow, "name") || undefined,
        type: "sequence" as const,
        points: [],
      };
    })
    .filter(Boolean) as BpmnFlow[];
  const maxX = Math.max(...nodes.map((node) => node.x + (node.width ?? 0)), 1000);
  const maxY = Math.max(...nodes.map((node) => node.y + (node.height ?? 0)), BPMN_POOL_Y + 260);
  return {
    poolName: "Processo importado",
    lanes: ["Raia 1"],
    laneHeights: [Math.max(260, maxY - BPMN_POOL_Y + 80)],
    poolWidth: Math.max(900, maxX - BPMN_POOL_X + 120),
    nodes,
    flows,
  };
}

function BpmnModuleV2({
  data,
  catalogs,
  organizationId,
  isDemo,
  codeSettings,
  update,
  onProcessCreated,
}: {
  data: BpmnState;
  catalogs: OrganizationCatalogs;
  organizationId: string | null;
  isDemo: boolean;
  codeSettings: CodeSettings | null;
  update: (value: BpmnState) => void;
  onProcessCreated: (process: CreatedProcess) => Promise<void> | void;
  autoCode?: boolean;
  codePreview?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
  const ignoreCanvasClickRef = useRef(false);
  const ignoreNodeClickRef = useRef(false);
  const [tool, setTool] = useState<"select" | "connect">("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [connectFromAnchor, setConnectFromAnchor] = useState<BpmnEdgeAnchor | null>(null);
  const [connectionTarget, setConnectionTarget] = useState<{
    nodeId: string;
    anchor: BpmnEdgeAnchor;
  } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");
  const [editingLaneIndex, setEditingLaneIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [createProcessName, setCreateProcessName] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    nodeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [showInspector, setShowInspector] = useState(true);
  const [zoom, setZoom] = useState(100);
  const [showGrid] = useState(true);
  const [snap] = useState(true);
  const [history, setHistory] = useState<BpmnState[]>([]);
  const [future, setFuture] = useState<BpmnState[]>([]);
  const [drag, setDrag] = useState<
    | {
        kind: "node";
        id: string;
        ids: string[];
        dx: number;
        dy: number;
        start: { x: number; y: number };
        moved: boolean;
      }
    | { kind: "selection-box"; start: { x: number; y: number }; current: { x: number; y: number } }
    | {
        kind: "node-size";
        id: string;
        startX: number;
        startY: number;
        x: number;
        y: number;
        width: number;
        height: number;
        handle: BpmnResizeHandle;
      }
    | { kind: "pool-width"; startX: number; width: number }
    | { kind: "pool-height"; startY: number; laneHeights: number[] }
    | { kind: "lane-height"; lane: number; startY: number; laneHeights: number[] }
    | {
        kind: "flow-segment";
        flowId: string;
        firstPoint: number;
        secondPoint: number;
        axis: "x" | "y";
        points: Array<{ x: number; y: number }>;
      }
    | { kind: "flow-anchor"; flowId: string; end: "from" | "to" }
    | { kind: "free-flow-end"; flowId: string; end: "from" | "to" }
    | {
        kind: "new-flow";
        fromId: string;
        fromAnchor: BpmnEdgeAnchor;
        current: { x: number; y: number };
      }
    | null
  >(null);

  const lanes = data.lanes.length ? data.lanes : ["Raia 1"];
  const selectedProcess =
    catalogs.processes.find((process) => process.id === data.processId) ??
    catalogs.processes.find(
      (process) => normalizeLabel(process.name) === normalizeLabel(data.poolName),
    ) ??
    null;
  const hasPool = Boolean(data.poolName.trim());
  const laneHeights = lanes.map((_, index) => data.laneHeights?.[index] ?? 170);
  const selected = data.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedNodes = data.nodes.filter((node) => selectedNodeIds.includes(node.id));
  const selectedFlow = data.flows.find((flow) => flow.id === selectedFlowId) ?? null;
  const commonNodeStrokeColor = commonSelectionValue(
    selectedNodes.map((node) => node.strokeColor ?? defaultBpmnNodeStroke(node)),
  );
  const commonNodeStrokeWidth = commonSelectionValue(
    selectedNodes.map((node) => node.strokeWidth ?? defaultBpmnNodeStrokeWidth(node)),
  );
  const commonNodeFillColor = commonSelectionValue(
    selectedNodes.map((node) => node.fillColor ?? node.color ?? defaultBpmnNodeFill(node)),
  );
  const poolX = BPMN_POOL_X;
  const poolY = BPMN_POOL_Y;
  const poolLabelWidth = BPMN_POOL_LABEL_WIDTH;
  const laneLabelWidth = BPMN_LANE_LABEL_WIDTH;
  const leftHeaderWidth = BPMN_LEFT_HEADER_WIDTH;
  const maxNodeX = data.nodes.reduce((max, node) => Math.max(max, node.x + (node.width ?? 140)), 0);
  const poolWidth = Math.max(data.poolWidth ?? 1080, maxNodeX - poolX + 180, leftHeaderWidth + 720);
  const poolHeight = Math.max(
    laneHeights.reduce((total, height) => total + height, 0),
    260,
  );
  const canvasWidth = Math.max(poolX + poolWidth + 180, 1280);
  const canvasHeight = Math.max(poolY + poolHeight + 160, 760);

  useEffect(() => {
    setSelectedNodeIds((current) =>
      current.filter((nodeId) => data.nodes.some((node) => node.id === nodeId)),
    );
  }, [data.nodes]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.key === "Delete" || event.key === "Backspace") && (selectedId || selectedFlowId)) {
        const target = event.target as HTMLElement | null;
        if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
        event.preventDefault();
        deleteSelected();
      }
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        const target = event.target as HTMLElement | null;
        if (
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          !selectedNodeIds.length
        ) {
          return;
        }
        event.preventDefault();
        const distance = event.shiftKey ? 10 : 1;
        if (event.key === "ArrowLeft") nudgeSelectedNodes(-distance, 0);
        if (event.key === "ArrowRight") nudgeSelectedNodes(distance, 0);
        if (event.key === "ArrowUp") nudgeSelectedNodes(0, -distance);
        if (event.key === "ArrowDown") nudgeSelectedNodes(0, distance);
      }
      if (event.key === "Escape") {
        setTool("select");
        setConnectFrom(null);
        setConnectFromAnchor(null);
        setEditingNodeId(null);
        setContextMenu(null);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undo();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function commit(next: BpmnState) {
    setHistory((items) => [...items.slice(-24), { ...data, lanes }]);
    setFuture([]);
    update({ ...next, lanes: next.lanes.length ? next.lanes : lanes });
  }

  function undo() {
    const previous = history.at(-1);
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    setFuture((items) => [{ ...data, lanes }, ...items].slice(0, 24));
    update(previous);
  }

  function redo() {
    const next = future[0];
    if (!next) return;
    setFuture((items) => items.slice(1));
    setHistory((items) => [...items.slice(-24), { ...data, lanes }]);
    update(next);
  }

  function pointFromClient(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((clientX - rect.left) * 100) / zoom, y: ((clientY - rect.top) * 100) / zoom };
  }

  function point(event: React.PointerEvent<SVGSVGElement>) {
    return pointFromClient(event.clientX, event.clientY);
  }

  function startSelectionBox(event: React.PointerEvent<SVGSVGElement>) {
    if (tool !== "select" || editingNodeId || editingLaneIndex !== null) return;
    const start = point(event);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    // The click emitted after a drag must not clear the new area selection.
    ignoreCanvasClickRef.current = true;
    setSelectedId(null);
    setSelectedNodeIds([]);
    setSelectedFlowId(null);
    setConnectFrom(null);
    setDrag({ kind: "selection-box", start, current: start });
  }

  function selectionRect(start: { x: number; y: number }, current: { x: number; y: number }) {
    return {
      x: Math.min(start.x, current.x),
      y: Math.min(start.y, current.y),
      width: Math.abs(current.x - start.x),
      height: Math.abs(current.y - start.y),
    };
  }

  function snapValue(value: number) {
    return snap ? Math.round(value / 10) * 10 : value;
  }

  function laneY(index: number) {
    return poolY + laneHeights.slice(0, index).reduce((total, height) => total + height, 0);
  }

  function laneIndexFromY(y: number) {
    let cursor = poolY;
    for (let index = 0; index < laneHeights.length; index += 1) {
      cursor += laneHeights[index];
      if (y <= cursor) return index;
    }
    return Math.max(0, lanes.length - 1);
  }

  function isInsidePool(position: { x: number; y: number }) {
    return (
      hasPool &&
      position.x >= poolX &&
      position.x <= poolX + poolWidth &&
      position.y >= poolY &&
      position.y <= poolY + poolHeight
    );
  }

  function nodeAtPoint(position: { x: number; y: number }) {
    return data.nodes.find((node) => {
      const bounds = nodeBounds(node);
      return (
        position.x >= bounds.left &&
        position.x <= bounds.right &&
        position.y >= bounds.top &&
        position.y <= bounds.bottom
      );
    });
  }

  function alignNodePosition(
    x: number,
    y: number,
    width: number,
    height: number,
    ignoreId?: string,
  ) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const candidate = data.nodes.find((node) => {
      if (node.id === ignoreId) return false;
      const bounds = nodeBounds(node);
      return Math.abs(bounds.cy - centerY) <= 18 || Math.abs(bounds.cx - centerX) <= 18;
    });
    if (!candidate) return { x, y };
    const bounds = nodeBounds(candidate);
    return {
      x: Math.abs(bounds.cx - centerX) <= 12 ? bounds.cx - width / 2 : x,
      y: Math.abs(bounds.cy - centerY) <= 12 ? bounds.cy - height / 2 : y,
    };
  }

  function createFreeConnector(position: { x: number; y: number }) {
    if (!hasPool) {
      toast.error("Crie uma pool antes de adicionar conectores.");
      return;
    }
    const from = { x: snapValue(position.x - 80), y: snapValue(position.y) };
    const to = { x: snapValue(position.x + 80), y: snapValue(position.y) };
    const next: BpmnFlow = {
      id: id("flow"),
      type: "sequence",
      freeFrom: from,
      freeTo: to,
      points: [],
    };
    commit({ ...data, lanes, flows: [...data.flows, next] });
    setSelectedFlowId(next.id);
    setSelectedId(null);
    setSelectedNodeIds([]);
  }

  function startNodeConnector(
    event: React.PointerEvent<SVGCircleElement>,
    node: BpmnNode,
    anchor: BpmnEdgeAnchor,
  ) {
    const start = anchorPoint(node, anchor);
    svgRef.current?.setPointerCapture?.(event.pointerId);
    ignoreCanvasClickRef.current = true;
    setTool("select");
    setSelectedId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedFlowId(null);
    setDrag({ kind: "new-flow", fromId: node.id, fromAnchor: anchor, current: start });
  }

  function alignConnectedNodes(
    from: BpmnNode,
    to: BpmnNode,
    fromAnchor: BpmnEdgeAnchor,
    toAnchor: BpmnEdgeAnchor,
  ) {
    const fromBounds = nodeBounds(from);
    const toBounds = nodeBounds(to);
    const horizontal =
      (fromAnchor.side === "left" || fromAnchor.side === "right") &&
      (toAnchor.side === "left" || toAnchor.side === "right");
    const vertical =
      (fromAnchor.side === "top" || fromAnchor.side === "bottom") &&
      (toAnchor.side === "top" || toAnchor.side === "bottom");
    if (horizontal && from.lane === to.lane && Math.abs(fromBounds.cy - toBounds.cy) <= 48) {
      const height = to.height ?? 72;
      const y = Math.max(
        poolY + 12,
        Math.min(poolY + poolHeight - height - 12, snapValue(fromBounds.cy - height / 2)),
      );
      return data.nodes.map((node) =>
        node.id === to.id ? { ...node, y, lane: laneIndexFromY(y + height / 2) } : node,
      );
    }
    if (vertical && Math.abs(fromBounds.cx - toBounds.cx) <= 48) {
      const width = to.width ?? 140;
      const x = Math.max(
        poolX + leftHeaderWidth + 16,
        Math.min(poolX + poolWidth - width - 16, snapValue(fromBounds.cx - width / 2)),
      );
      return data.nodes.map((node) => (node.id === to.id ? { ...node, x } : node));
    }
    return data.nodes;
  }

  function defaultNode(type: BpmnNodeType) {
    if (type === "gateway") return { width: 64, height: 64, label: "Decisao" };
    if (type === "start") return { width: 44, height: 44, label: "Inicio" };
    if (type === "end") return { width: 48, height: 48, label: "Fim" };
    if (type === "annotation") return { width: 180, height: 90, label: "Anotacao" };
    return { width: 140, height: 72, label: "Atividade" };
  }

  function selectDiagramProcess(process: OrganizationProcess | null) {
    if (!process) {
      if (data.nodes.length || data.flows.length) {
        toast.error("Exclua os elementos antes de desvincular o processo.");
        return;
      }
      commit({
        ...data,
        processId: undefined,
        poolName: "",
        lanes: [],
        laneHeights: [],
        nodes: [],
        flows: [],
      });
      return;
    }
    if (hasPool && data.nodes.length && selectedProcess?.id !== process.id) {
      toast.error("O processo não pode ser trocado enquanto houver elementos no desenho.");
      return;
    }
    const nextLaneHeights = bpmnLaneHeightsForTitle(process.name, data.laneHeights);
    commit({
      ...data,
      processId: process.id,
      poolName: process.name,
      area: process.department ?? "",
      lanes: data.lanes.length ? data.lanes : ["Raia 1"],
      laneHeights: nextLaneHeights,
      poolWidth: data.poolWidth ?? 1100,
    });
  }

  function updateNodeNotation(nodeId: string, patch: Pick<BpmnNode, "taskType" | "gatewayType">) {
    commit({
      ...data,
      lanes,
      nodes: data.nodes.map((node) => (node.id === nodeId ? { ...node, ...patch } : node)),
    });
    setContextMenu(null);
  }

  function updateSelectedNodeStyle(
    patch: Pick<BpmnNode, "fillColor" | "strokeColor" | "strokeWidth">,
  ) {
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedId ? [selectedId] : [];
    if (!ids.length) return;
    commit({
      ...data,
      lanes,
      nodes: data.nodes.map((node) => (ids.includes(node.id) ? { ...node, ...patch } : node)),
    });
  }

  function updateSelectedFlowStyle(
    patch: Pick<BpmnFlow, "strokeColor" | "strokeWidth" | "lineStyle">,
  ) {
    if (!selectedFlowId) return;
    commit({
      ...data,
      lanes,
      flows: data.flows.map((flow) => (flow.id === selectedFlowId ? { ...flow, ...patch } : flow)),
    });
  }

  function arrangeSelectedNodes(
    mode:
      | "left"
      | "center-horizontal"
      | "top"
      | "center-vertical"
      | "distribute-horizontal"
      | "distribute-vertical",
  ) {
    if (selectedNodes.length < 2) return;
    const left = Math.min(...selectedNodes.map((node) => node.x));
    const right = Math.max(
      ...selectedNodes.map((node) => node.x + (node.width ?? defaultNode(node.type).width)),
    );
    const top = Math.min(...selectedNodes.map((node) => node.y));
    const bottom = Math.max(
      ...selectedNodes.map((node) => node.y + (node.height ?? defaultNode(node.type).height)),
    );
    const orderedHorizontal = [...selectedNodes].sort((a, b) => a.x - b.x);
    const orderedVertical = [...selectedNodes].sort((a, b) => a.y - b.y);
    const firstHorizontalCenter =
      orderedHorizontal[0].x +
      (orderedHorizontal[0].width ?? defaultNode(orderedHorizontal[0].type).width) / 2;
    const lastHorizontal = orderedHorizontal.at(-1)!;
    const lastHorizontalCenter =
      lastHorizontal.x + (lastHorizontal.width ?? defaultNode(lastHorizontal.type).width) / 2;
    const firstVerticalCenter =
      orderedVertical[0].y +
      (orderedVertical[0].height ?? defaultNode(orderedVertical[0].type).height) / 2;
    const lastVertical = orderedVertical.at(-1)!;
    const lastVerticalCenter =
      lastVertical.y + (lastVertical.height ?? defaultNode(lastVertical.type).height) / 2;
    const horizontalStep =
      (lastHorizontalCenter - firstHorizontalCenter) / (selectedNodes.length - 1);
    const verticalStep = (lastVerticalCenter - firstVerticalCenter) / (selectedNodes.length - 1);
    const positions = new Map<string, { x?: number; y?: number }>();

    selectedNodes.forEach((node) => {
      const width = node.width ?? defaultNode(node.type).width;
      const height = node.height ?? defaultNode(node.type).height;
      if (mode === "left") positions.set(node.id, { x: left });
      if (mode === "center-horizontal") {
        positions.set(node.id, { x: left + (right - left - width) / 2 });
      }
      if (mode === "top") positions.set(node.id, { y: top });
      if (mode === "center-vertical") {
        positions.set(node.id, { y: top + (bottom - top - height) / 2 });
      }
    });
    if (mode === "distribute-horizontal") {
      orderedHorizontal.forEach((node, index) =>
        positions.set(node.id, {
          x:
            firstHorizontalCenter +
            horizontalStep * index -
            (node.width ?? defaultNode(node.type).width) / 2,
        }),
      );
    }
    if (mode === "distribute-vertical") {
      orderedVertical.forEach((node, index) =>
        positions.set(node.id, {
          y:
            firstVerticalCenter +
            verticalStep * index -
            (node.height ?? defaultNode(node.type).height) / 2,
        }),
      );
    }

    commit({
      ...data,
      lanes,
      nodes: data.nodes.map((node) => {
        const position = positions.get(node.id);
        if (!position) return node;
        const nextY = position.y ?? node.y;
        return {
          ...node,
          x: snapValue(position.x ?? node.x),
          y: snapValue(nextY),
          lane: laneIndexFromY(nextY + (node.height ?? defaultNode(node.type).height) / 2),
        };
      }),
    });
  }

  function nudgeSelectedNodes(dx: number, dy: number) {
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedId ? [selectedId] : [];
    if (!ids.length) return;
    commit({
      ...data,
      lanes,
      nodes: data.nodes.map((node) => {
        if (!ids.includes(node.id)) return node;
        const width = node.width ?? defaultNode(node.type).width;
        const height = node.height ?? defaultNode(node.type).height;
        const x = Math.max(
          poolX + leftHeaderWidth + 8,
          Math.min(poolX + poolWidth - width - 8, node.x + dx),
        );
        const y = Math.max(poolY + 8, Math.min(poolY + poolHeight - height - 8, node.y + dy));
        return { ...node, x, y, lane: laneIndexFromY(y + height / 2) };
      }),
    });
  }

  function addNode(type: BpmnNodeType, position?: { x: number; y: number }) {
    if (!hasPool) {
      toast.error("Crie uma pool antes de adicionar elementos.");
      return;
    }
    const defaults = defaultNode(type);
    const targetLane = position
      ? laneIndexFromY(position.y)
      : Math.min(Math.max(selected?.lane ?? 0, 0), lanes.length - 1);
    const x = position
      ? Math.max(
          poolX + leftHeaderWidth + 20,
          Math.min(
            poolX + poolWidth - defaults.width - 20,
            snapValue(position.x - defaults.width / 2),
          ),
        )
      : poolX + leftHeaderWidth + 70 + data.nodes.length * 28;
    const y = position
      ? Math.max(
          poolY + 16,
          Math.min(
            poolY + poolHeight - defaults.height - 16,
            snapValue(position.y - defaults.height / 2),
          ),
        )
      : snapValue(
          laneY(targetLane) + Math.max(16, (laneHeights[targetLane] - defaults.height) / 2),
        );
    const aligned = alignNodePosition(x, y, defaults.width, defaults.height);
    const next: BpmnNode = {
      id: id(type),
      type,
      label: defaults.label,
      x: aligned.x,
      y: aligned.y,
      lane: laneIndexFromY(aligned.y + defaults.height / 2),
      width: defaults.width,
      height: defaults.height,
      taskType: type === "task" ? "none" : undefined,
      gatewayType: type === "gateway" ? "exclusive" : undefined,
    };
    commit({ ...data, lanes, nodes: [...data.nodes, next] });
    setSelectedId(next.id);
    setSelectedNodeIds([next.id]);
    setSelectedFlowId(null);
  }

  function addLane() {
    if (!hasPool) {
      toast.error("Crie uma pool antes de adicionar raias.");
      return;
    }
    commit({
      ...data,
      lanes: [...lanes, `Raia ${lanes.length + 1}`],
      laneHeights: [...laneHeights, 170],
      poolWidth,
    });
  }

  function updateLane(index: number, value: string) {
    commit({
      ...data,
      lanes: lanes.map((lane, laneIndex) => (laneIndex === index ? value : lane)),
      laneHeights,
      poolWidth,
    });
  }

  function deleteSelected() {
    if (selectedFlowId) {
      commit({ ...data, lanes, flows: data.flows.filter((flow) => flow.id !== selectedFlowId) });
      setSelectedFlowId(null);
      return;
    }
    const idsToDelete = selectedNodeIds.length ? selectedNodeIds : selectedId ? [selectedId] : [];
    if (!idsToDelete.length) return;
    commit({
      ...data,
      lanes,
      nodes: data.nodes.filter((node) => !idsToDelete.includes(node.id)),
      flows: data.flows.filter(
        (flow) => !idsToDelete.includes(flow.from ?? "") && !idsToDelete.includes(flow.to ?? ""),
      ),
    });
    setSelectedId(null);
    setSelectedNodeIds([]);
    setConnectFrom(null);
  }

  function duplicateSelected() {
    if (!selected) return;
    const copyNode = {
      ...selected,
      id: id(selected.type),
      label: `${selected.label} cópia`,
      x: selected.x + 30,
      y: selected.y + 30,
    };
    commit({ ...data, lanes, nodes: [...data.nodes, copyNode] });
    setSelectedId(copyNode.id);
    setSelectedFlowId(null);
  }

  function moveLane(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lanes.length) return;
    const nextLanes = [...lanes];
    const nextLaneHeights = [...laneHeights];
    [nextLanes[index], nextLanes[target]] = [nextLanes[target], nextLanes[index]];
    [nextLaneHeights[index], nextLaneHeights[target]] = [
      nextLaneHeights[target],
      nextLaneHeights[index],
    ];
    commit({ ...data, lanes: nextLanes, laneHeights: nextLaneHeights, poolWidth });
  }

  function deleteLane(index: number) {
    if (lanes.length <= 1) return;
    if (data.nodes.some((node) => node.lane === index)) {
      toast.error("Mova ou exclua os elementos da raia antes de removê-la.");
      return;
    }
    commit({
      ...data,
      lanes: lanes.filter((_, laneIndex) => laneIndex !== index),
      laneHeights: laneHeights.filter((_, laneIndex) => laneIndex !== index),
      poolWidth,
      nodes: data.nodes.map((node) =>
        node.lane > index ? { ...node, lane: node.lane - 1 } : node,
      ),
    });
  }

  function quickAddAfter(node: BpmnNode, type: BpmnNodeType) {
    if (!hasPool) return;
    const defaults = defaultNode(type);
    const nodeWidth = node.width ?? 140;
    const nodeHeight = node.height ?? 72;
    const x = Math.max(
      poolX + leftHeaderWidth + 16,
      Math.min(poolX + poolWidth - defaults.width - 16, snapValue(node.x + nodeWidth + 88)),
    );
    const y = Math.max(
      poolY + 12,
      Math.min(
        poolY + poolHeight - defaults.height - 12,
        snapValue(node.y + nodeHeight / 2 - defaults.height / 2),
      ),
    );
    const nextNode: BpmnNode = {
      id: id(type),
      type,
      label: defaults.label,
      x,
      y,
      lane: laneIndexFromY(y + defaults.height / 2),
      width: defaults.width,
      height: defaults.height,
      taskType: type === "task" ? "none" : undefined,
      gatewayType: type === "gateway" ? "exclusive" : undefined,
    };
    const fromAnchor = { side: "right", offset: 0.5 } as BpmnEdgeAnchor;
    const toAnchor = { side: "left", offset: 0.5 } as BpmnEdgeAnchor;
    const nextFlow: BpmnFlow = {
      id: id("flow"),
      from: node.id,
      to: nextNode.id,
      type: "sequence",
      fromAnchor,
      toAnchor,
      points: [],
    };
    commit({ ...data, lanes, nodes: [...data.nodes, nextNode], flows: [...data.flows, nextFlow] });
    setSelectedId(nextNode.id);
    setSelectedNodeIds([nextNode.id]);
    setSelectedFlowId(null);
  }

  function commitNodeLabel(nodeId: string) {
    const label = editingLabel.trim();
    if (label) {
      commit({
        ...data,
        lanes,
        nodes: data.nodes.map((node) => (node.id === nodeId ? { ...node, label } : node)),
      });
    }
    setEditingNodeId(null);
  }

  function startLaneEdit(index: number) {
    setEditingLaneIndex(index);
    setEditingText(lanes[index] ?? `Raia ${index + 1}`);
  }

  function commitLaneEdit() {
    if (editingLaneIndex == null) return;
    const value = editingText.trim();
    if (value) updateLane(editingLaneIndex, value);
    setEditingLaneIndex(null);
  }

  async function exportDiagramPng() {
    if (!hasPool || !svgRef.current) {
      toast.error("Selecione um processo e crie o diagrama antes de exportar.");
      return;
    }

    const previousSelection = {
      selectedId,
      selectedNodeIds,
      selectedFlowId,
    };

    if (editingNodeId) commitNodeLabel(editingNodeId);
    if (editingLaneIndex !== null) commitLaneEdit();
    setSelectedId(null);
    setSelectedNodeIds([]);
    setSelectedFlowId(null);
    setContextMenu(null);

    try {
      // Wait for React to remove editing and selection controls from the SVG.
      await nextPaint();
      const source = svgRef.current;
      if (!source) throw new Error("Área de desenho indisponível.");

      const margin = 18;
      const exportX = poolX - margin;
      const exportY = poolY - margin;
      const exportWidth = poolWidth + margin * 2;
      const exportHeight = poolHeight + margin * 2;
      const clone = source.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      clone.setAttribute("xmlns:xhtml", "http://www.w3.org/1999/xhtml");
      clone.setAttribute("viewBox", `${exportX} ${exportY} ${exportWidth} ${exportHeight}`);
      clone.setAttribute("width", String(exportWidth));
      clone.setAttribute("height", String(exportHeight));
      clone.removeAttribute("class");
      inlineSvgExportStyles(source, clone);
      clone.querySelectorAll('[data-export-ignore="true"]').forEach((element) => element.remove());

      const background = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      background.setAttribute("x", String(exportX));
      background.setAttribute("y", String(exportY));
      background.setAttribute("width", String(exportWidth));
      background.setAttribute("height", String(exportHeight));
      background.setAttribute("fill", getComputedStyle(source).backgroundColor || "#ffffff");
      const defs = clone.querySelector("defs");
      defs?.insertAdjacentElement("afterend", background);

      const serialized = new XMLSerializer().serializeToString(clone);
      const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
      const imageUrl = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Não foi possível renderizar o diagrama."));
        image.src = imageUrl;
      });

      const maxSide = Math.max(exportWidth, exportHeight);
      const scale = Math.max(1, Math.min(2.5, 8192 / maxSide));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(exportWidth * scale);
      canvas.height = Math.round(exportHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Canvas indisponível para exportação.");
      context.scale(scale, scale);
      context.drawImage(image, 0, 0, exportWidth, exportHeight);
      URL.revokeObjectURL(imageUrl);

      const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!png) throw new Error("Não foi possível gerar o arquivo PNG.");
      const downloadUrl = URL.createObjectURL(png);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `${safeFileName(data.poolName || "fluxograma")}.png`;
      link.click();
      URL.revokeObjectURL(downloadUrl);
      toast.success("Diagrama exportado em PNG.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao exportar o diagrama.");
    } finally {
      setSelectedId(previousSelection.selectedId);
      setSelectedNodeIds(previousSelection.selectedNodeIds);
      setSelectedFlowId(previousSelection.selectedFlowId);
    }
  }

  function selectFlow(flow: BpmnFlow) {
    setSelectedFlowId(flow.id);
    setSelectedId(null);
    setSelectedNodeIds([]);
  }

  function handleNodeClick(node: BpmnNode, pointer?: { x: number; y: number }) {
    if (tool === "connect") {
      const targetAnchor = pointer ? edgeAnchorFromPoint(node, pointer) : null;
      if (!connectFrom) {
        setConnectFrom(node.id);
        setConnectFromAnchor(targetAnchor);
        setSelectedId(node.id);
        setSelectedNodeIds([node.id]);
        setSelectedFlowId(null);
        return;
      }
      if (connectFrom !== node.id) {
        const from = data.nodes.find((item) => item.id === connectFrom);
        const fromAnchor =
          connectFromAnchor ??
          (from ? edgeAnchorFromPoint(from, nodeCenter(node)) : { side: "right", offset: 0.5 });
        const toAnchor =
          targetAnchor ??
          edgeAnchorFromPoint(node, from ? nodeCenter(from) : (pointer ?? nodeCenter(node)));
        commit({
          ...data,
          lanes,
          nodes: from ? alignConnectedNodes(from, node, fromAnchor, toAnchor) : data.nodes,
          flows: [
            ...data.flows,
            {
              id: id("flow"),
              from: connectFrom,
              to: node.id,
              type: "sequence",
              fromAnchor,
              toAnchor,
              points: [],
            },
          ],
        });
      }
      setConnectFrom(null);
      setConnectFromAnchor(null);
      setTool("select");
      setSelectedId(node.id);
      setSelectedNodeIds([node.id]);
      return;
    }
    setSelectedId(node.id);
    setSelectedNodeIds([node.id]);
    setSelectedFlowId(null);
  }

  function handleDrop(event: React.DragEvent<SVGSVGElement>) {
    event.preventDefault();
    const dropPoint = pointFromClient(event.clientX, event.clientY);
    const draggedTool = event.dataTransfer.getData("application/x-bf-bpmn-tool");
    if (draggedTool === "connector") {
      createFreeConnector(dropPoint);
      return;
    }
    if (draggedTool === "lane") {
      if (!isInsidePool(dropPoint)) {
        toast.error("Solte a raia dentro da pool.");
        return;
      }
      addLane();
      return;
    }
    const type = event.dataTransfer.getData("application/x-bf-bpmn-node") as BpmnNodeType;
    if (!type) return;
    addNode(type, dropPoint);
  }

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!selectedProcess) {
      toast.error("Selecione o processo antes de importar o desenho.");
      return;
    }
    try {
      const imported = await importBpmnFile(file);
      commit({
        ...imported,
        processId: selectedProcess.id,
        poolName: selectedProcess.name,
        area: selectedProcess.department ?? "",
      });
      setSelectedId(null);
      setSelectedFlowId(null);
      setConnectFrom(null);
      setConnectFromAnchor(null);
      setTool("select");
      toast.success("Fluxograma importado.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel importar o arquivo.";
      toast.error(message);
    }
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const p = point(event);
    if (drag.kind === "node") {
      if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 4) return;
      if (!drag.moved) {
        ignoreNodeClickRef.current = true;
        setDrag({ ...drag, moved: true });
      }
      const currentNode = data.nodes.find((node) => node.id === drag.id);
      if (!currentNode) return;
      const width = currentNode.width ?? 140;
      const height = currentNode.height ?? 64;
      const x = Math.max(
        poolX + leftHeaderWidth + 16,
        Math.min(poolX + poolWidth - width - 16, snapValue(p.x - drag.dx)),
      );
      const y = Math.max(
        poolY + 12,
        Math.min(poolY + poolHeight - height - 12, snapValue(p.y - drag.dy)),
      );
      const aligned = alignNodePosition(x, y, width, height, currentNode.id);
      const nextNode = {
        ...currentNode,
        x: aligned.x,
        y: aligned.y,
        lane: laneIndexFromY(aligned.y + height / 2),
      };
      const delta = { x: nextNode.x - currentNode.x, y: nextNode.y - currentNode.y };
      const nextNodes = data.nodes.map((node) => {
        if (!drag.ids.includes(node.id)) return node;
        if (node.id === drag.id) return nextNode;
        const nodeWidth = node.width ?? 140;
        const nodeHeight = node.height ?? 64;
        const nextX = Math.max(
          poolX + leftHeaderWidth + 16,
          Math.min(poolX + poolWidth - nodeWidth - 16, node.x + delta.x),
        );
        const nextY = Math.max(
          poolY + 12,
          Math.min(poolY + poolHeight - nodeHeight - 12, node.y + delta.y),
        );
        return { ...node, x: nextX, y: nextY, lane: laneIndexFromY(nextY + nodeHeight / 2) };
      });
      update({
        ...data,
        lanes,
        nodes: nextNodes,
        flows: data.flows.map((flow) =>
          drag.ids.reduce(
            (nextFlow, nodeId) =>
              refreshConnectorAfterNodeMove(
                moveConnectorWithNode(nextFlow, nodeId, delta),
                nextNodes,
                nodeId,
              ),
            flow,
          ),
        ),
      });
    }
    if (drag.kind === "selection-box") {
      setDrag({ ...drag, current: p });
    }
    if (drag.kind === "node-size") {
      update({
        ...data,
        lanes,
        nodes: data.nodes.map((node) => {
          if (node.id !== drag.id) return node;
          const dx = p.x - drag.startX;
          const dy = p.y - drag.startY;
          const right = drag.x + drag.width;
          const bottom = drag.y + drag.height;
          const resizesWest = drag.handle === "w" || drag.handle === "nw" || drag.handle === "sw";
          const resizesEast = drag.handle === "e" || drag.handle === "ne" || drag.handle === "se";
          const resizesNorth = drag.handle === "n" || drag.handle === "nw" || drag.handle === "ne";
          const resizesSouth = drag.handle === "s" || drag.handle === "sw" || drag.handle === "se";
          const width = snapValue(
            Math.max(
              58,
              resizesWest ? drag.width - dx : resizesEast ? drag.width + dx : drag.width,
            ),
          );
          const height = snapValue(
            Math.max(
              44,
              resizesNorth ? drag.height - dy : resizesSouth ? drag.height + dy : drag.height,
            ),
          );
          const x = resizesWest ? right - width : drag.x;
          const y = resizesNorth ? bottom - height : drag.y;
          return { ...node, x, y, width, height, lane: laneIndexFromY(y + height / 2) };
        }),
      });
    }
    if (drag.kind === "pool-width") {
      update({
        ...data,
        lanes,
        laneHeights,
        poolWidth: Math.max(720, snapValue(drag.width + p.x - drag.startX)),
      });
    }
    if (drag.kind === "pool-height") {
      const last = laneHeights.length - 1;
      update({
        ...data,
        lanes,
        poolWidth,
        laneHeights: drag.laneHeights.map((height, index) =>
          index === last ? Math.max(110, snapValue(height + p.y - drag.startY)) : height,
        ),
      });
    }
    if (drag.kind === "lane-height") {
      update({
        ...data,
        lanes,
        poolWidth,
        laneHeights: drag.laneHeights.map((height, index) =>
          index === drag.lane ? Math.max(110, snapValue(height + p.y - drag.startY)) : height,
        ),
      });
    }
    if (drag.kind === "flow-segment") {
      update({
        ...data,
        lanes,
        flows: data.flows.map((flow) => {
          if (flow.id !== drag.flowId) return flow;
          // Keep the geometry captured when the gesture started. Reading the
          // just-updated flow here made the handle briefly operate on an empty
          // route and produced broken segments during the first movement.
          const points = drag.points.map((routePoint) => ({ ...routePoint }));
          const value = snapValue(drag.axis === "x" ? p.x : p.y);
          points[drag.firstPoint] = { ...points[drag.firstPoint], [drag.axis]: value };
          points[drag.secondPoint] = { ...points[drag.secondPoint], [drag.axis]: value };
          return { ...flow, points };
        }),
      });
    }
    if (drag.kind === "flow-anchor") {
      update({
        ...data,
        lanes,
        flows: data.flows.map((flow) => {
          if (flow.id !== drag.flowId) return flow;
          if (!flow.from || !flow.to) return flow;
          const from = data.nodes.find((node) => node.id === flow.from);
          const to = data.nodes.find((node) => node.id === flow.to);
          if (!from || !to) return flow;
          const anchorNode = drag.end === "from" ? from : to;
          const anchor = edgeAnchorFromPoint(anchorNode, p);
          const nextFlow =
            drag.end === "from" ? { ...flow, fromAnchor: anchor } : { ...flow, toAnchor: anchor };
          return { ...nextFlow, points: [] };
        }),
      });
    }
    if (drag.kind === "free-flow-end") {
      const candidate = nodeAtPoint(p);
      setConnectionTarget(
        candidate ? { nodeId: candidate.id, anchor: edgeAnchorFromPoint(candidate, p) } : null,
      );
      update({
        ...data,
        lanes,
        flows: data.flows.map((flow) => {
          if (flow.id !== drag.flowId) return flow;
          const candidate = nodeAtPoint(p);
          const snapped = candidate
            ? anchorPoint(candidate, edgeAnchorFromPoint(candidate, p))
            : { x: snapValue(p.x), y: snapValue(p.y) };
          if (drag.end === "from") {
            const target = flow.to ? data.nodes.find((node) => node.id === flow.to) : undefined;
            const opposite = target
              ? anchorPoint(target, flow.toAnchor ?? { side: "left", offset: 0.5 })
              : (flow.freeTo ?? snapped);
            return {
              ...flow,
              from: undefined,
              fromAnchor: undefined,
              freeFrom: snapped,
              points: editableConnectorPoints(snapped, opposite),
            };
          }
          const source = flow.from ? data.nodes.find((node) => node.id === flow.from) : undefined;
          const opposite = source
            ? anchorPoint(source, flow.fromAnchor ?? { side: "right", offset: 0.5 })
            : (flow.freeFrom ?? snapped);
          return {
            ...flow,
            to: undefined,
            toAnchor: undefined,
            freeTo: snapped,
            points: editableConnectorPoints(opposite, snapped),
          };
        }),
      });
    }
    if (drag.kind === "new-flow") {
      const candidate = nodeAtPoint(p);
      setConnectionTarget(
        candidate && candidate.id !== drag.fromId
          ? { nodeId: candidate.id, anchor: edgeAnchorFromPoint(candidate, p) }
          : null,
      );
      setDrag({ ...drag, current: { x: snapValue(p.x), y: snapValue(p.y) } });
    }
  }

  function finishDrag(event?: React.PointerEvent<SVGSVGElement>) {
    const releasePoint = event ? point(event) : drag?.kind === "new-flow" ? drag.current : null;
    if (drag?.kind === "selection-box") {
      const box = selectionRect(drag.start, releasePoint ?? drag.current);
      const ids =
        box.width < 5 && box.height < 5
          ? []
          : data.nodes
              .filter((node) => {
                const bounds = nodeBounds(node);
                return (
                  bounds.right >= box.x &&
                  bounds.left <= box.x + box.width &&
                  bounds.bottom >= box.y &&
                  bounds.top <= box.y + box.height
                );
              })
              .map((node) => node.id);
      setSelectedNodeIds(ids);
      setSelectedId(ids.at(-1) ?? null);
      setSelectedFlowId(null);
    }
    if (drag?.kind === "node" && !drag.moved) {
      setSelectedNodeIds([drag.id]);
      setSelectedId(drag.id);
    }
    if (drag?.kind === "new-flow") {
      const fromNode = data.nodes.find((node) => node.id === drag.fromId);
      const endPoint = releasePoint ?? drag.current;
      const target = nodeAtPoint(endPoint);
      if (fromNode) {
        if (target && target.id !== fromNode.id) {
          const targetAnchor = edgeAnchorFromPoint(target, endPoint);
          const next: BpmnFlow = {
            id: id("flow"),
            from: fromNode.id,
            to: target.id,
            type: "sequence",
            fromAnchor: drag.fromAnchor,
            toAnchor: targetAnchor,
            points: [],
          };
          update({
            ...data,
            lanes,
            nodes: alignConnectedNodes(fromNode, target, drag.fromAnchor, targetAnchor),
            flows: [...data.flows, next],
          });
          setSelectedFlowId(next.id);
          setSelectedId(null);
        } else {
          const next: BpmnFlow = {
            id: id("flow"),
            from: fromNode.id,
            type: "sequence",
            fromAnchor: drag.fromAnchor,
            freeTo: endPoint,
            points: editableConnectorPoints(
              anchorPoint(fromNode, drag.fromAnchor),
              endPoint,
              drag.fromAnchor,
            ),
          };
          update({ ...data, lanes, flows: [...data.flows, next] });
          setSelectedFlowId(next.id);
          setSelectedId(null);
        }
      }
    }
    if (drag?.kind === "free-flow-end") {
      const current = data.flows.find((flow) => flow.id === drag.flowId);
      const position = releasePoint ?? (drag.end === "from" ? current?.freeFrom : current?.freeTo);
      const target = position ? nodeAtPoint(position) : null;
      if (current && position && target) {
        const anchor = edgeAnchorFromPoint(target, position);
        update({
          ...data,
          lanes,
          flows: data.flows.map((flow) => {
            if (flow.id !== drag.flowId) return flow;
            if (drag.end === "from") {
              return {
                ...flow,
                from: target.id,
                fromAnchor: anchor,
                freeFrom: undefined,
                points: [],
              };
            }
            return { ...flow, to: target.id, toAnchor: anchor, freeTo: undefined, points: [] };
          }),
        });
      }
    }
    if (drag && (drag.kind !== "node" || drag.moved)) {
      setHistory((items) => [...items.slice(-24), { ...data, lanes }]);
      setFuture([]);
    }
    if (event && svgRef.current?.hasPointerCapture(event.pointerId)) {
      svgRef.current.releasePointerCapture(event.pointerId);
    }
    setConnectionTarget(null);
    setDrag(null);
  }

  return (
    <div className="grid gap-3">
      {createProcessName !== null ? (
        <ProcessRegistrationDialog
          organizationId={organizationId}
          isDemo={isDemo}
          codeSettings={codeSettings}
          initialName={createProcessName}
          onClose={() => setCreateProcessName(null)}
          onCreated={async (process) => {
            await onProcessCreated(process);
            selectDiagramProcess(process as unknown as OrganizationProcess);
            setCreateProcessName(null);
          }}
        />
      ) : null}
      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[#f5f2ea] px-4 py-3 dark:bg-[#151a17]">
          <div className="min-w-[230px]">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
              Processos - Fluxograma
            </div>
            <h1 className="font-display text-xl font-semibold text-foreground">
              Editor de fluxograma
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".bpm,.bpmn,.xml,.xpdl"
              className="hidden"
              onChange={handleImportFile}
            />
            <ToolbarButton
              label="Importar"
              onClick={() => importInputRef.current?.click()}
              icon={<Upload className="h-4 w-4" />}
            />
            <ToolbarButton
              label="Exportar imagem (PNG)"
              onClick={exportDiagramPng}
              icon={<Download className="h-4 w-4" />}
            />
            <ToolbarButton
              label="Desfazer"
              onClick={undo}
              icon={<RotateCcw className="h-4 w-4" />}
            />
            <ToolbarButton
              label="Refazer"
              onClick={redo}
              icon={<RotateCcw className="h-4 w-4 rotate-180" />}
            />
            <ToolbarButton
              label="Excluir"
              onClick={deleteSelected}
              icon={<Trash2 className="h-4 w-4" />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              title="Reduzir zoom"
              aria-label="Reduzir zoom"
              onClick={() => setZoom((value) => Math.max(60, value - 10))}
              className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card font-bold"
            >
              -
            </button>
            <span className="w-14 text-center font-data text-sm font-bold">{zoom}%</span>
            <button
              type="button"
              title="Aumentar zoom"
              aria-label="Aumentar zoom"
              onClick={() => setZoom((value) => Math.min(160, value + 10))}
              className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card font-bold"
            >
              +
            </button>
            <button
              type="button"
              title={
                showInspector ? "Ocultar painel de propriedades" : "Mostrar painel de propriedades"
              }
              aria-label={
                showInspector ? "Ocultar painel de propriedades" : "Mostrar painel de propriedades"
              }
              onClick={() => setShowInspector((value) => !value)}
              className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-foreground"
            >
              {showInspector ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>

        <div className="border-b border-border bg-card px-4 py-3">
          <div className="mx-auto grid max-w-3xl gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <RegisteredProcessSelect
              label="Processo do diagrama"
              value={selectedProcess?.id ?? ""}
              processes={catalogs.processes.filter((process) => process.status !== "Arquivado")}
              onSelect={selectDiagramProcess}
              placeholder="Pesquise por código ou nome do processo"
              onRequestCreate={setCreateProcessName}
            />
            <div className="pb-0.5 text-xs text-muted-foreground sm:max-w-48">
              O processo selecionado identifica a pool.
            </div>
          </div>
        </div>

        <div
          className={`grid min-h-[calc(100vh-170px)] ${showInspector ? "xl:grid-cols-[190px_minmax(0,1fr)_280px]" : "xl:grid-cols-[190px_minmax(0,1fr)]"}`}
        >
          <aside className="border-b border-border bg-[#f8f8f5] p-4 dark:bg-[#111512] xl:border-b-0 xl:border-r">
            <div className="grid gap-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Estrutura
              </h3>
              <BpmnTool title="Raia" toolType="lane" disabled={!hasPool} onClick={addLane}>
                <span className="h-8 w-20 rounded-sm border-2 border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50" />
              </BpmnTool>
              <BpmnTool
                title="Conector"
                toolType="connector"
                disabled={!hasPool}
                onClick={() => setTool("connect")}
              >
                <span className="relative h-8 w-20">
                  <span className="absolute left-1 top-1/2 h-0.5 w-16 -translate-y-1/2 bg-[#26352f]" />
                  <span className="absolute right-1 top-1/2 h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[9px] border-y-transparent border-l-[#26352f]" />
                </span>
              </BpmnTool>
            </div>
            <div className="mt-5 grid gap-3 border-t border-border pt-4">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Elementos
              </h3>
              <BpmnTool
                title="Evento inicial"
                nodeType="start"
                disabled={!hasPool}
                onClick={() => addNode("start")}
              >
                <span className="h-9 w-9 rounded-full border-2 border-[#06966f] bg-[#d8f3e8]" />
              </BpmnTool>
              <BpmnTool
                title="Atividade"
                nodeType="task"
                disabled={!hasPool}
                onClick={() => addNode("task")}
              >
                <span className="h-9 w-14 rounded-md border-2 border-[#008c95] bg-[#e6f5f3]" />
              </BpmnTool>
              <BpmnTool
                title="Gateway"
                nodeType="gateway"
                disabled={!hasPool}
                onClick={() => addNode("gateway")}
              >
                <span className="h-10 w-10 rotate-45 border-2 border-[#d39a20] bg-[#fff5d8]" />
              </BpmnTool>
              <BpmnTool
                title="Evento final"
                nodeType="end"
                disabled={!hasPool}
                onClick={() => addNode("end")}
              >
                <span className="h-9 w-9 rounded-full border-4 border-[#a82b2b] bg-[#ffe1df]" />
              </BpmnTool>
              <BpmnTool
                title="Anotação"
                nodeType="annotation"
                disabled={!hasPool}
                onClick={() => addNode("annotation")}
              >
                <span className="h-10 w-8 border-2 border-dashed border-[#06966f] bg-white" />
              </BpmnTool>
            </div>
          </aside>

          <main className="min-w-0 bg-muted/35">
            {tool === "connect" ? (
              <div className="border-b border-[#b8d9cb] bg-[#e8f6f0] px-4 py-2 text-sm font-semibold text-[#064f3d]">
                {connectFrom ? "Clique no elemento de destino." : "Clique no elemento de origem."}
              </div>
            ) : null}
            <div className="h-[calc(100vh-230px)] min-h-[640px] overflow-auto bg-muted/20 p-8">
              <svg
                ref={svgRef}
                width={(canvasWidth * zoom) / 100}
                height={(canvasHeight * zoom) / 100}
                viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
                className="touch-none rounded-lg bg-card shadow-sm"
                onPointerDown={startSelectionBox}
                onPointerMove={handlePointerMove}
                onPointerUp={finishDrag}
                onClick={(event) => {
                  if (ignoreCanvasClickRef.current) {
                    ignoreCanvasClickRef.current = false;
                    return;
                  }
                  if (event.target !== event.currentTarget) return;
                  setSelectedId(null);
                  setSelectedNodeIds([]);
                  setSelectedFlowId(null);
                  if (tool !== "connect") setConnectFrom(null);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "copy";
                }}
                onDrop={handleDrop}
              >
                <defs>
                  <pattern id="bpmn-grid-v2" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path
                      d="M 20 0 L 0 0 0 20"
                      fill="none"
                      stroke="var(--border)"
                      strokeWidth="0.6"
                    />
                  </pattern>
                  <marker
                    id="arrow-v2"
                    markerHeight="9"
                    markerWidth="9"
                    orient="auto"
                    refX="8"
                    refY="4.5"
                  >
                    <path d="M0,0 L9,4.5 L0,9 Z" fill="context-stroke" />
                  </marker>
                  <filter id="bpmn-tool-shadow" x="-25%" y="-15%" width="150%" height="140%">
                    <feDropShadow
                      dx="0"
                      dy="2"
                      stdDeviation="2"
                      floodColor="#10251d"
                      floodOpacity="0.2"
                    />
                  </filter>
                </defs>
                {showGrid ? (
                  <rect
                    data-export-ignore="true"
                    width={canvasWidth}
                    height={canvasHeight}
                    fill="url(#bpmn-grid-v2)"
                    opacity="0.3"
                  />
                ) : null}
                {!hasPool ? (
                  <g>
                    <rect
                      x={poolX}
                      y={poolY}
                      width="720"
                      height="260"
                      rx="14"
                      fill="var(--card)"
                      stroke="var(--border)"
                      strokeDasharray="8 8"
                    />
                    <text
                      x={poolX + 360}
                      y={poolY + 118}
                      textAnchor="middle"
                      fontSize="20"
                      fontWeight="800"
                      fill="var(--foreground)"
                    >
                      Selecione o processo para iniciar
                    </text>
                    <text
                      x={poolX + 360}
                      y={poolY + 152}
                      textAnchor="middle"
                      fontSize="13"
                      fontWeight="600"
                      fill="var(--muted-foreground)"
                    >
                      A pool será criada com o nome do processo escolhido.
                    </text>
                  </g>
                ) : null}
                {hasPool ? (
                  <rect
                    x={poolX}
                    y={poolY}
                    width={poolWidth}
                    height={poolHeight}
                    fill="var(--card)"
                    stroke="var(--foreground)"
                    strokeWidth="1.7"
                  />
                ) : null}
                {hasPool ? (
                  <rect
                    x={poolX}
                    y={poolY}
                    width={poolLabelWidth}
                    height={poolHeight}
                    fill="color-mix(in oklab, var(--muted) 82%, var(--card))"
                    stroke="var(--foreground)"
                    strokeWidth="1.7"
                  />
                ) : null}
                {hasPool ? (
                  <text
                    x={poolX + poolLabelWidth / 2}
                    y={poolY + poolHeight / 2}
                    textAnchor="middle"
                    fontSize="16"
                    fontWeight="800"
                    fill="var(--foreground)"
                    transform={`rotate(-90 ${poolX + poolLabelWidth / 2} ${poolY + poolHeight / 2})`}
                  >
                    {data.poolName}
                  </text>
                ) : null}
                {hasPool
                  ? lanes.map((lane, index) => (
                      <g key={`lane-canvas-${index}`}>
                        <rect
                          x={poolX + poolLabelWidth}
                          y={laneY(index)}
                          width={laneLabelWidth}
                          height={laneHeights[index]}
                          fill="var(--card)"
                          stroke="var(--foreground)"
                          strokeWidth="1"
                          className="cursor-text"
                          onPointerDown={(event) => event.stopPropagation()}
                          onDoubleClick={(event) => {
                            event.stopPropagation();
                            startLaneEdit(index);
                          }}
                        />
                        <rect
                          x={poolX + leftHeaderWidth}
                          y={laneY(index)}
                          width={poolWidth - leftHeaderWidth}
                          height={laneHeights[index]}
                          fill="var(--card)"
                          stroke="var(--foreground)"
                          strokeWidth="1"
                        />
                        {editingLaneIndex === index ? (
                          <foreignObject
                            x={
                              poolX +
                              poolLabelWidth +
                              laneLabelWidth / 2 -
                              Math.min(laneHeights[index] - 24, 260) / 2
                            }
                            y={laneY(index) + laneHeights[index] / 2 - 19}
                            width={Math.min(laneHeights[index] - 24, 260)}
                            height={38}
                            transform={`rotate(-90 ${poolX + poolLabelWidth + laneLabelWidth / 2} ${laneY(index) + laneHeights[index] / 2})`}
                          >
                            <input
                              autoFocus
                              value={editingText}
                              aria-label={`Nome da raia ${index + 1}`}
                              onChange={(event) => setEditingText(event.target.value)}
                              onBlur={commitLaneEdit}
                              onPointerDown={(event) => event.stopPropagation()}
                              onClick={(event) => event.stopPropagation()}
                              onFocus={(event) => event.currentTarget.select()}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  commitLaneEdit();
                                }
                                if (event.key === "Escape") setEditingLaneIndex(null);
                              }}
                              className="h-full w-full rounded-md border-2 border-primary bg-card px-3 text-center text-sm font-semibold text-foreground shadow-lg outline-none ring-4 ring-primary/10"
                            />
                          </foreignObject>
                        ) : (
                          <g>
                            <text
                              x={poolX + poolLabelWidth + laneLabelWidth / 2}
                              y={laneY(index) + laneHeights[index] / 2}
                              textAnchor="middle"
                              fontSize="13"
                              fontWeight="800"
                              fill="var(--foreground)"
                              transform={`rotate(-90 ${poolX + poolLabelWidth + laneLabelWidth / 2} ${laneY(index) + laneHeights[index] / 2})`}
                              className="cursor-text"
                              onPointerDown={(event) => event.stopPropagation()}
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                                startLaneEdit(index);
                              }}
                            >
                              <title>Duplo clique para renomear a raia</title>
                              {lane || `Raia ${index + 1}`}
                            </text>
                            <foreignObject
                              x={poolX + poolLabelWidth + 7}
                              y={laneY(index) + 7}
                              width="28"
                              height="28"
                            >
                              <button
                                type="button"
                                title="Renomear raia"
                                aria-label={`Renomear ${lane || `Raia ${index + 1}`}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  startLaneEdit(index);
                                }}
                                onPointerDown={(event) => event.stopPropagation()}
                                className="grid h-7 w-7 place-items-center rounded-md border border-border bg-card text-muted-foreground shadow-sm hover:border-primary hover:text-primary"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            </foreignObject>
                          </g>
                        )}
                        {index < lanes.length - 1 ? (
                          <rect
                            x={poolX}
                            y={laneY(index) + laneHeights[index] - 4}
                            width={poolWidth}
                            height="8"
                            fill="transparent"
                            className="cursor-row-resize"
                            onPointerDown={(event) => {
                              event.stopPropagation();
                              setDrag({
                                kind: "lane-height",
                                lane: index,
                                startY: point(event as React.PointerEvent<SVGSVGElement>).y,
                                laneHeights,
                              });
                            }}
                          />
                        ) : null}
                      </g>
                    ))
                  : null}
                {hasPool ? (
                  <rect
                    x={poolX + poolWidth - 5}
                    y={poolY}
                    width="10"
                    height={poolHeight}
                    fill="transparent"
                    className="cursor-col-resize"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setDrag({
                        kind: "pool-width",
                        startX: point(event as React.PointerEvent<SVGSVGElement>).x,
                        width: poolWidth,
                      });
                    }}
                  />
                ) : null}
                {hasPool ? (
                  <rect
                    x={poolX}
                    y={poolY + poolHeight - 5}
                    width={poolWidth}
                    height="10"
                    fill="transparent"
                    className="cursor-row-resize"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setDrag({
                        kind: "pool-height",
                        startY: point(event as React.PointerEvent<SVGSVGElement>).y,
                        laneHeights,
                      });
                    }}
                  />
                ) : null}
                {hasPool ? (
                  <rect
                    x={poolX + poolWidth - 8}
                    y={poolY + poolHeight - 8}
                    width="16"
                    height="16"
                    fill="var(--gold)"
                    className="cursor-nwse-resize"
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      setDrag({
                        kind: "pool-width",
                        startX: point(event as React.PointerEvent<SVGSVGElement>).x,
                        width: poolWidth,
                      });
                    }}
                  />
                ) : null}
                {hasPool
                  ? data.flows.map((flow) => {
                      const from = flow.from
                        ? data.nodes.find((node) => node.id === flow.from)
                        : undefined;
                      const to = flow.to
                        ? data.nodes.find((node) => node.id === flow.to)
                        : undefined;
                      if ((!from && !flow.freeFrom) || (!to && !flow.freeTo)) return null;
                      return (
                        <BpmnConnectorV2
                          key={flow.id}
                          flow={flow}
                          from={from}
                          to={to}
                          selected={flow.id === selectedFlowId}
                          onClick={(event) => {
                            event.stopPropagation();
                            selectFlow(flow);
                          }}
                          onSegmentPointerDown={(
                            event,
                            routePoints,
                            firstPoint,
                            secondPoint,
                            axis,
                          ) => {
                            event.stopPropagation();
                            svgRef.current?.setPointerCapture?.(event.pointerId);
                            ignoreCanvasClickRef.current = true;
                            if (!flow.points?.length) {
                              update({
                                ...data,
                                lanes,
                                flows: data.flows.map((item) =>
                                  item.id === flow.id ? { ...item, points: routePoints } : item,
                                ),
                              });
                            }
                            setDrag({
                              kind: "flow-segment",
                              flowId: flow.id,
                              firstPoint,
                              secondPoint,
                              axis,
                              points: routePoints.map((routePoint) => ({ ...routePoint })),
                            });
                            setSelectedFlowId(flow.id);
                            setSelectedId(null);
                          }}
                          onAnchorPointerDown={(event, end) => {
                            event.stopPropagation();
                            const endpointNode = end === "from" ? from : to;
                            const oppositeNode = end === "from" ? to : from;
                            const fallback = end === "from" ? flow.freeFrom : flow.freeTo;
                            const endpoint =
                              endpointNode && oppositeNode
                                ? resolveConnectorPoint(
                                    endpointNode,
                                    oppositeNode,
                                    end === "from" ? flow.fromAnchor : flow.toAnchor,
                                  )
                                : endpointNode
                                  ? anchorPoint(endpointNode, { side: "right", offset: 0.5 })
                                  : fallback;
                            if (endpoint) {
                              update({
                                ...data,
                                lanes,
                                flows: data.flows.map((item) => {
                                  if (item.id !== flow.id) return item;
                                  return end === "from"
                                    ? {
                                        ...item,
                                        from: undefined,
                                        fromAnchor: undefined,
                                        freeFrom: endpoint,
                                      }
                                    : {
                                        ...item,
                                        to: undefined,
                                        toAnchor: undefined,
                                        freeTo: endpoint,
                                      };
                                }),
                              });
                            }
                            svgRef.current?.setPointerCapture?.(event.pointerId);
                            setDrag({ kind: "free-flow-end", flowId: flow.id, end });
                            setSelectedFlowId(flow.id);
                            setSelectedId(null);
                          }}
                        />
                      );
                    })
                  : null}
                {drag?.kind === "selection-box"
                  ? (() => {
                      const box = selectionRect(drag.start, drag.current);
                      return (
                        <rect
                          x={box.x}
                          y={box.y}
                          width={box.width}
                          height={box.height}
                          fill="#009b7420"
                          stroke="#008c68"
                          strokeWidth="1.5"
                          strokeDasharray="5 4"
                          pointerEvents="none"
                        />
                      );
                    })()
                  : null}
                {hasPool && drag?.kind === "new-flow"
                  ? (() => {
                      const from = data.nodes.find((node) => node.id === drag.fromId);
                      if (!from) return null;
                      const target = nodeAtPoint(drag.current);
                      const targetPoint =
                        target && target.id !== from.id
                          ? anchorPoint(target, edgeAnchorFromPoint(target, drag.current))
                          : drag.current;
                      return (
                        <BpmnConnectorV2
                          flow={{
                            id: "preview-flow",
                            from: from.id,
                            fromAnchor: drag.fromAnchor,
                            freeTo: targetPoint,
                            type: "sequence",
                            points: connectorRoutePoints(
                              anchorPoint(from, drag.fromAnchor),
                              targetPoint,
                              drag.fromAnchor,
                              target ? edgeAnchorFromPoint(target, drag.current) : undefined,
                            ),
                          }}
                          from={from}
                          selected
                          preview
                          onClick={(event) => event.stopPropagation()}
                          onSegmentPointerDown={(event) => event.stopPropagation()}
                          onAnchorPointerDown={(event) => event.stopPropagation()}
                        />
                      );
                    })()
                  : null}
                {hasPool && drag?.kind === "free-flow-end" && connectionTarget
                  ? (() => {
                      const original = data.flows.find((flow) => flow.id === drag.flowId);
                      const candidate = data.nodes.find(
                        (node) => node.id === connectionTarget.nodeId,
                      );
                      if (!original || !candidate) return null;
                      const from =
                        drag.end === "from"
                          ? candidate
                          : original.from
                            ? data.nodes.find((node) => node.id === original.from)
                            : undefined;
                      const to =
                        drag.end === "to"
                          ? candidate
                          : original.to
                            ? data.nodes.find((node) => node.id === original.to)
                            : undefined;
                      const previewFlow =
                        drag.end === "from"
                          ? {
                              ...original,
                              from: candidate.id,
                              fromAnchor: connectionTarget.anchor,
                              freeFrom: undefined,
                              points: [],
                            }
                          : {
                              ...original,
                              to: candidate.id,
                              toAnchor: connectionTarget.anchor,
                              freeTo: undefined,
                              points: [],
                            };
                      return (
                        <BpmnConnectorV2
                          flow={previewFlow}
                          from={from}
                          to={to}
                          selected
                          preview
                          onClick={(event) => event.stopPropagation()}
                          onSegmentPointerDown={(event) => event.stopPropagation()}
                          onAnchorPointerDown={(event) => event.stopPropagation()}
                        />
                      );
                    })()
                  : null}
                {hasPool
                  ? data.nodes.map((node) => (
                      <BpmnShapeV2
                        key={node.id}
                        node={node}
                        selected={selectedNodeIds.includes(node.id)}
                        primarySelected={node.id === selectedId}
                        connecting={node.id === connectFrom || node.id === connectionTarget?.nodeId}
                        canvasRight={poolX + poolWidth}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          if (event.button !== 0) return;
                          if (editingNodeId === node.id) return;
                          if (tool === "connect") return;
                          ignoreNodeClickRef.current = false;
                          svgRef.current?.setPointerCapture?.(event.pointerId);
                          ignoreCanvasClickRef.current = true;
                          const p = point(event as React.PointerEvent<SVGSVGElement>);
                          const ids = selectedNodeIds.includes(node.id)
                            ? selectedNodeIds
                            : [node.id];
                          setSelectedId(node.id);
                          setSelectedNodeIds(ids);
                          setSelectedFlowId(null);
                          setDrag({
                            kind: "node",
                            id: node.id,
                            ids,
                            dx: p.x - node.x,
                            dy: p.y - node.y,
                            start: p,
                            moved: false,
                          });
                        }}
                        onResizePointerDown={(event, handle) => {
                          event.stopPropagation();
                          svgRef.current?.setPointerCapture?.(event.pointerId);
                          ignoreCanvasClickRef.current = true;
                          const p = point(event as React.PointerEvent<SVGSVGElement>);
                          setDrag({
                            kind: "node-size",
                            id: node.id,
                            startX: p.x,
                            startY: p.y,
                            x: node.x,
                            y: node.y,
                            width: node.width ?? 140,
                            height: node.height ?? 64,
                            handle,
                          });
                        }}
                        onConnectorPointerDown={(event, anchor) => {
                          event.stopPropagation();
                          startNodeConnector(event, node, anchor);
                        }}
                        onClick={(event) => {
                          event.stopPropagation();
                          if (ignoreNodeClickRef.current) {
                            ignoreNodeClickRef.current = false;
                            return;
                          }
                          handleNodeClick(node, pointFromClient(event.clientX, event.clientY));
                        }}
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setTool("select");
                          setSelectedId(node.id);
                          setSelectedFlowId(null);
                          setEditingNodeId(node.id);
                          setEditingLabel(node.label);
                        }}
                        onContextMenu={(event) => {
                          if (node.type !== "task" && node.type !== "gateway") return;
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedId(node.id);
                          setSelectedNodeIds([node.id]);
                          setSelectedFlowId(null);
                          setContextMenu({ nodeId: node.id, x: event.clientX, y: event.clientY });
                        }}
                        onQuickCreate={(type) => quickAddAfter(node, type)}
                        editing={editingNodeId === node.id}
                        editingValue={editingLabel}
                        onEditingChange={setEditingLabel}
                        onEditingCommit={() => commitNodeLabel(node.id)}
                        onEditingCancel={() => setEditingNodeId(null)}
                      />
                    ))
                  : null}
              </svg>
            </div>
          </main>

          {showInspector ? (
            <aside className="border-t border-border bg-card p-4 xl:border-l xl:border-t-0">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                Propriedades
              </h3>
              {!selectedNodes.length && !selectedFlow ? (
                <>
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      Pool vinculada
                    </div>
                    <div className="mt-1 text-sm font-semibold text-foreground">
                      {data.poolName || "Selecione um processo"}
                    </div>
                  </div>
                  <div className="mt-5 border-t border-border pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <h4 className="text-sm font-bold text-foreground">Raias</h4>
                      <button
                        type="button"
                        onClick={addLane}
                        className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Nova
                      </button>
                    </div>
                    <div className="grid gap-2">
                      {lanes.map((lane, index) => (
                        <div
                          key={`lane-inspector-${index}`}
                          className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border border-border bg-muted/20 p-2"
                        >
                          <Field
                            compact
                            label={`Raia ${index + 1}`}
                            value={lane}
                            onChange={(value) => updateLane(index, value)}
                          />
                          <div className="flex items-end gap-1">
                            <IconButton label="Subir" onClick={() => moveLane(index, -1)}>
                              <ArrowUp className="h-4 w-4" />
                            </IconButton>
                            <IconButton label="Descer" onClick={() => moveLane(index, 1)}>
                              <ArrowDown className="h-4 w-4" />
                            </IconButton>
                            <IconButton label="Excluir raia" onClick={() => deleteLane(index)}>
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : null}
              {selectedNodes.length > 1 ? (
                <div className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="mb-1 text-sm font-bold text-foreground">
                    {selectedNodes.length} elementos selecionados
                  </div>
                  <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
                    As alterações serão aplicadas a todos os elementos compatíveis.
                  </p>
                  <div className="mb-4 border-b border-border pb-4">
                    <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Alinhar e distribuir
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <IconButton
                        label="Alinhar Ã  esquerda"
                        onClick={() => arrangeSelectedNodes("left")}
                      >
                        <AlignStartVertical className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Centralizar horizontalmente"
                        onClick={() => arrangeSelectedNodes("center-horizontal")}
                      >
                        <AlignCenterVertical className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Alinhar ao topo"
                        onClick={() => arrangeSelectedNodes("top")}
                      >
                        <AlignStartHorizontal className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Centralizar verticalmente"
                        onClick={() => arrangeSelectedNodes("center-vertical")}
                      >
                        <AlignCenterHorizontal className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Distribuir horizontalmente"
                        onClick={() => arrangeSelectedNodes("distribute-horizontal")}
                      >
                        <AlignHorizontalSpaceBetween className="h-4 w-4" />
                      </IconButton>
                      <IconButton
                        label="Distribuir verticalmente"
                        onClick={() => arrangeSelectedNodes("distribute-vertical")}
                      >
                        <AlignVerticalSpaceBetween className="h-4 w-4" />
                      </IconButton>
                    </div>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Use as setas para ajuste fino; pressione Shift para mover 10 px.
                    </p>
                  </div>
                  <BpmnStyleControls
                    lineColor={commonNodeStrokeColor ?? "#64748b"}
                    lineWidth={commonNodeStrokeWidth ?? 2}
                    fillColor={commonNodeFillColor ?? "#ffffff"}
                    showFill
                    mixedLineColor={!commonNodeStrokeColor}
                    mixedLineWidth={commonNodeStrokeWidth == null}
                    mixedFillColor={!commonNodeFillColor}
                    onLineColorChange={(strokeColor) => updateSelectedNodeStyle({ strokeColor })}
                    onLineWidthChange={(strokeWidth) => updateSelectedNodeStyle({ strokeWidth })}
                    onFillColorChange={(fillColor) => updateSelectedNodeStyle({ fillColor })}
                  />
                </div>
              ) : selected ? (
                <div className="mt-5 border-t border-border pt-4">
                  <h4 className="mb-3 text-sm font-bold text-foreground">Elemento</h4>
                  <div className="grid gap-3">
                    <Field
                      label="Texto"
                      value={selected.label}
                      onChange={(label) =>
                        commit({
                          ...data,
                          lanes,
                          nodes: data.nodes.map((node) =>
                            node.id === selected.id ? { ...node, label } : node,
                          ),
                        })
                      }
                    />
                    <TextArea
                      label="Descrição"
                      rows={3}
                      value={selected.description ?? ""}
                      onChange={(description) =>
                        commit({
                          ...data,
                          lanes,
                          nodes: data.nodes.map((node) =>
                            node.id === selected.id ? { ...node, description } : node,
                          ),
                        })
                      }
                    />
                    <Field
                      label="Responsável"
                      value={selected.responsible ?? ""}
                      onChange={(responsible) =>
                        commit({
                          ...data,
                          lanes,
                          nodes: data.nodes.map((node) =>
                            node.id === selected.id ? { ...node, responsible } : node,
                          ),
                        })
                      }
                    />
                  </div>
                  <div className="mt-5 border-t border-border pt-4">
                    <h5 className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
                      Aparência
                    </h5>
                    <BpmnStyleControls
                      lineColor={selected.strokeColor ?? defaultBpmnNodeStroke(selected)}
                      lineWidth={selected.strokeWidth ?? defaultBpmnNodeStrokeWidth(selected)}
                      fillColor={
                        selected.fillColor ?? selected.color ?? defaultBpmnNodeFill(selected)
                      }
                      showFill
                      onLineColorChange={(strokeColor) => updateSelectedNodeStyle({ strokeColor })}
                      onLineWidthChange={(strokeWidth) => updateSelectedNodeStyle({ strokeWidth })}
                      onFillColorChange={(fillColor) => updateSelectedNodeStyle({ fillColor })}
                    />
                  </div>
                </div>
              ) : selectedFlow ? (
                <div className="mt-5 border-t border-border pt-4">
                  <h4 className="mb-3 text-sm font-bold text-foreground">Conector</h4>
                  <Field
                    label="Rótulo / condição"
                    value={selectedFlow.label ?? ""}
                    onChange={(label) =>
                      commit({
                        ...data,
                        lanes,
                        flows: data.flows.map((flow) =>
                          flow.id === selectedFlow.id ? { ...flow, label } : flow,
                        ),
                      })
                    }
                  />
                  <div className="mt-4 border-t border-border pt-4">
                    <BpmnStyleControls
                      lineColor={selectedFlow.strokeColor ?? "#26352f"}
                      lineWidth={selectedFlow.strokeWidth ?? 2.2}
                      lineStyle={selectedFlow.lineStyle ?? "solid"}
                      showFill={false}
                      showLineStyle
                      onLineColorChange={(strokeColor) => updateSelectedFlowStyle({ strokeColor })}
                      onLineWidthChange={(strokeWidth) => updateSelectedFlowStyle({ strokeWidth })}
                      onLineStyleChange={(lineStyle) => updateSelectedFlowStyle({ lineStyle })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      commit({
                        ...data,
                        lanes,
                        flows: data.flows.map((flow) =>
                          flow.id === selectedFlow.id ? { ...flow, points: [] } : flow,
                        ),
                      })
                    }
                    className="mt-3 w-full rounded-md border border-border px-3 py-2 text-sm font-semibold hover:bg-muted"
                  >
                    Limpar pontos manuais
                  </button>
                </div>
              ) : (
                <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                  Selecione um elemento ou conector.
                </div>
              )}
            </aside>
          ) : null}
        </div>
      </div>
      {contextMenu && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[90]"
              onPointerDown={() => setContextMenu(null)}
              onContextMenu={(event) => event.preventDefault()}
            >
              {(() => {
                const node = data.nodes.find((item) => item.id === contextMenu.nodeId);
                if (!node) return null;
                const options = node.type === "task" ? BPMN_TASK_TYPES : BPMN_GATEWAY_TYPES;
                const current =
                  node.type === "task"
                    ? (node.taskType ?? "none")
                    : (node.gatewayType ?? "exclusive");
                return (
                  <div
                    className="fixed w-52 overflow-hidden rounded-lg border border-border bg-popover p-2 text-popover-foreground shadow-xl"
                    style={{
                      left: Math.min(contextMenu.x, window.innerWidth - 240),
                      top: Math.min(contextMenu.y, window.innerHeight - options.length * 38 - 56),
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                  >
                    <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                      {node.type === "task" ? "Tipo de tarefa" : "Tipo de gateway"}
                    </div>
                    <div
                      className={
                        node.type === "task"
                          ? "grid grid-cols-2 gap-1.5"
                          : "grid grid-cols-3 gap-1.5"
                      }
                    >
                      {options.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          title={option.label}
                          aria-label={option.label}
                          onClick={() =>
                            node.type === "task"
                              ? updateNodeNotation(node.id, {
                                  taskType: option.value as BpmnTaskType,
                                })
                              : updateNodeNotation(node.id, {
                                  gatewayType: option.value as BpmnGatewayType,
                                })
                          }
                          className={`relative grid h-16 place-items-center rounded-md border text-foreground transition hover:border-primary hover:bg-muted ${current === option.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card"}`}
                        >
                          <BpmnNotationIcon
                            kind={node.type === "task" ? "task" : "gateway"}
                            value={option.value}
                            className={node.type === "task" ? "h-12 w-[72px]" : "h-10 w-10"}
                          />
                          {current === option.value ? (
                            <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-primary" />
                          ) : null}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function nextPaint() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function safeFileName(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "fluxograma"
  );
}

function inlineSvgExportStyles(source: SVGSVGElement, clone: SVGSVGElement) {
  const sourceElements = [source, ...Array.from(source.querySelectorAll("*"))];
  const cloneElements = [clone, ...Array.from(clone.querySelectorAll("*"))];
  const commonProperties = [
    "color",
    "background-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-radius",
    "box-sizing",
    "display",
    "align-items",
    "justify-content",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "letter-spacing",
    "line-height",
    "text-align",
    "text-transform",
    "white-space",
  ];
  const svgProperties = [
    "fill",
    "fill-opacity",
    "stroke",
    "stroke-width",
    "stroke-opacity",
    "stroke-dasharray",
    "opacity",
    "paint-order",
  ];

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index] as HTMLElement | SVGElement | undefined;
    if (!cloneElement) return;
    const computed = getComputedStyle(sourceElement);
    const properties =
      sourceElement.namespaceURI === "http://www.w3.org/2000/svg"
        ? [...commonProperties, ...svgProperties]
        : commonProperties;
    properties.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value) cloneElement.style.setProperty(property, value);
    });
    if (sourceElement.namespaceURI === "http://www.w3.org/1999/xhtml") {
      cloneElement.style.setProperty("width", computed.width);
      cloneElement.style.setProperty("height", computed.height);
      cloneElement.style.setProperty("padding", computed.padding);
    }
  });
}

function defaultBpmnNodeStroke(node: BpmnNode) {
  if (node.type === "start") return "#66a80f";
  if (node.type === "end") return "#a40000";
  if (node.type === "gateway") return "#c49314";
  if (node.type === "annotation") return "#06966f";
  return "#26352f";
}

function defaultBpmnNodeFill(node: BpmnNode) {
  if (node.type === "start") return "#d8f3a7";
  if (node.type === "end") return "#f4c2bf";
  if (node.type === "gateway") return "#fff5d8";
  if (node.type === "annotation") return "#fff8e8";
  return "#ffffff";
}

function defaultBpmnNodeStrokeWidth(node: BpmnNode) {
  return node.type === "end" ? 4 : node.type === "start" ? 2.5 : 2;
}

function commonSelectionValue<T>(values: T[]) {
  if (!values.length) return undefined;
  return values.every((value) => value === values[0]) ? values[0] : undefined;
}

function BpmnStyleControls({
  lineColor,
  lineWidth,
  lineStyle = "solid",
  fillColor,
  showFill,
  showLineStyle = false,
  mixedLineColor = false,
  mixedLineWidth = false,
  mixedFillColor = false,
  onLineColorChange,
  onLineWidthChange,
  onLineStyleChange,
  onFillColorChange,
}: {
  lineColor: string;
  lineWidth: number;
  lineStyle?: "solid" | "dashed";
  fillColor?: string;
  showFill: boolean;
  showLineStyle?: boolean;
  mixedLineColor?: boolean;
  mixedLineWidth?: boolean;
  mixedFillColor?: boolean;
  onLineColorChange: (value: string) => void;
  onLineWidthChange: (value: number) => void;
  onLineStyleChange?: (value: "solid" | "dashed") => void;
  onFillColorChange?: (value: string) => void;
}) {
  return (
    <div className="grid gap-4">
      <label className="grid gap-2">
        <span className="text-xs font-semibold text-foreground">Espessura da linha</span>
        <span className="flex items-center gap-3">
          <input
            type="range"
            min="0.5"
            max="12"
            step="0.5"
            value={Math.min(lineWidth, 12)}
            onChange={(event) => onLineWidthChange(Number(event.target.value))}
            className="h-2 min-w-0 flex-1 cursor-pointer accent-[var(--gold)]"
          />
          <span className="flex h-9 w-[76px] items-center rounded-md border border-border bg-background px-2 focus-within:border-[var(--gold)]">
            <input
              type="number"
              min="0.5"
              max="20"
              step="0.5"
              aria-label="Espessura da linha em pixels"
              value={mixedLineWidth ? "" : lineWidth}
              placeholder="Mista"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value) && value >= 0.5 && value <= 20) {
                  onLineWidthChange(value);
                }
              }}
              className="min-w-0 flex-1 bg-transparent text-right text-xs font-semibold text-foreground outline-none"
            />
            <span className="ml-1 text-[10px] text-muted-foreground">px</span>
          </span>
        </span>
      </label>
      {showLineStyle && onLineStyleChange ? (
        <fieldset className="grid gap-2">
          <legend className="text-xs font-semibold text-foreground">Estilo da linha</legend>
          <div className="grid grid-cols-2 gap-2 rounded-md bg-muted/40 p-1">
            {(["solid", "dashed"] as const).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => onLineStyleChange(style)}
                className={cn(
                  "flex h-9 items-center justify-center gap-2 rounded px-2 text-xs font-semibold transition-colors",
                  lineStyle === style
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <svg viewBox="0 0 38 8" className="h-2 w-9" aria-hidden="true">
                  <line
                    x1="1"
                    y1="4"
                    x2="37"
                    y2="4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray={style === "dashed" ? "6 4" : undefined}
                  />
                </svg>
                {style === "solid" ? "Contínua" : "Tracejada"}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}
      <label className="grid gap-2">
        <span className="flex items-center justify-between text-xs font-semibold text-foreground">
          Cor da linha
          <span className="font-mono text-[10px] uppercase text-muted-foreground">
            {mixedLineColor ? "Mista" : lineColor}
          </span>
        </span>
        <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-2">
          <input
            type="color"
            value={lineColor}
            onChange={(event) => onLineColorChange(event.target.value)}
            className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
          />
          <span className="text-xs text-muted-foreground">Selecionar cor</span>
        </span>
      </label>
      {showFill && fillColor && onFillColorChange ? (
        <label className="grid gap-2">
          <span className="flex items-center justify-between text-xs font-semibold text-foreground">
            Cor de preenchimento
            <span className="font-mono text-[10px] uppercase text-muted-foreground">
              {mixedFillColor ? "Mista" : fillColor}
            </span>
          </span>
          <span className="flex h-10 items-center gap-2 rounded-md border border-border bg-background px-2">
            <input
              type="color"
              value={fillColor}
              onChange={(event) => onFillColorChange(event.target.value)}
              className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
            />
            <span className="text-xs text-muted-foreground">Selecionar cor</span>
          </span>
        </label>
      ) : null}
    </div>
  );
}

function BpmnConnectorV2({
  flow,
  from,
  to,
  selected,
  onClick,
  onSegmentPointerDown,
  onAnchorPointerDown,
  preview = false,
}: {
  flow: BpmnFlow;
  from?: BpmnNode;
  to?: BpmnNode;
  selected: boolean;
  onClick: (event: React.MouseEvent<SVGGElement>) => void;
  onSegmentPointerDown: (
    event: React.PointerEvent<SVGGElement>,
    routePoints: Array<{ x: number; y: number }>,
    firstPoint: number,
    secondPoint: number,
    axis: "x" | "y",
  ) => void;
  onAnchorPointerDown: (event: React.PointerEvent<SVGCircleElement>, end: "from" | "to") => void;
  preview?: boolean;
}) {
  const freeA = flow.freeFrom ?? { x: 0, y: 0 };
  const freeB = flow.freeTo ?? { x: freeA.x + 120, y: freeA.y };
  const fromAnchor =
    flow.fromAnchor ?? (from ? edgeAnchorFromPoint(from, to ? nodeCenter(to) : freeB) : undefined);
  const a = from ? anchorPoint(from, fromAnchor ?? { side: "right", offset: 0.5 }) : freeA;
  const toAnchor =
    flow.toAnchor ?? (to ? edgeAnchorFromPoint(to, from ? nodeCenter(from) : a) : undefined);
  const b = to ? anchorPoint(to, toAnchor ?? { side: "left", offset: 0.5 }) : freeB;
  const points = flow.points ?? [];
  // A rota automatica tambem nasce com uma alca central. Assim, ao puxar a
  // alca o usuario passa a controlar a mesma linha que ja estava vendo.
  const defaultPoints =
    points.length > 0 ? points : editableConnectorPoints(a, b, fromAnchor, toAnchor);
  const route = orthogonalRoute(a, defaultPoints, b, fromAnchor?.side, toAnchor?.side);
  const path = route
    .map((item, index) => `${index === 0 ? "M" : "L"} ${item.x} ${item.y}`)
    .join(" ");
  const labelPoint = points[0] ?? defaultPoints[0] ?? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const controlSegment = connectorControlSegment(defaultPoints);
  return (
    <g
      onPointerDown={(event) => event.stopPropagation()}
      onClick={onClick}
      className={preview ? "pointer-events-none" : "cursor-pointer"}
    >
      {!preview ? <path d={path} fill="none" stroke="transparent" strokeWidth="14" /> : null}
      <path
        d={path}
        fill="none"
        stroke={
          preview
            ? "#10a37f"
            : (flow.strokeColor ?? "color-mix(in oklab, var(--foreground) 82%, transparent)")
        }
        strokeWidth={preview ? 3.4 : (flow.strokeWidth ?? 2.2)}
        strokeDasharray={preview ? "8 6" : flow.lineStyle === "dashed" ? "10 7" : undefined}
        markerEnd="url(#arrow-v2)"
        pointerEvents="none"
      />
      {flow.label ? (
        <text
          x={labelPoint.x + 8}
          y={labelPoint.y - 8}
          fontSize="12"
          fontWeight="800"
          fill="var(--foreground)"
          stroke="var(--card)"
          strokeWidth="3"
          paintOrder="stroke"
        >
          {flow.label}
        </text>
      ) : null}
      {selected && !preview ? (
        <>
          <circle
            cx={a.x}
            cy={a.y}
            r="7.5"
            fill="#dcfce7"
            stroke="#4f9d1a"
            strokeWidth="2.2"
            className="cursor-crosshair"
            onPointerDown={(event) => onAnchorPointerDown(event, "from")}
          />
          <circle
            cx={b.x}
            cy={b.y}
            r="7.5"
            fill="#ffe4e6"
            stroke="#d24a5a"
            strokeWidth="2.2"
            className="cursor-crosshair"
            onPointerDown={(event) => onAnchorPointerDown(event, "to")}
          />
        </>
      ) : null}
      {selected && !preview && controlSegment
        ? (() => {
            const first = defaultPoints[controlSegment.firstPoint];
            const second = defaultPoints[controlSegment.secondPoint];
            const x = (first.x + second.x) / 2;
            const y = (first.y + second.y) / 2;
            const horizontal = controlSegment.axis === "y";
            return (
              <g
                className={horizontal ? "cursor-ns-resize" : "cursor-ew-resize"}
                onPointerDown={(event) =>
                  onSegmentPointerDown(
                    event,
                    defaultPoints,
                    controlSegment.firstPoint,
                    controlSegment.secondPoint,
                    controlSegment.axis,
                  )
                }
              >
                <rect
                  x={x - (horizontal ? 13 : 6)}
                  y={y - (horizontal ? 6 : 13)}
                  width={horizontal ? "26" : "12"}
                  height={horizontal ? "12" : "26"}
                  rx="6"
                  fill="var(--card)"
                  stroke="#2583ab"
                  strokeWidth="2"
                  filter="url(#bpmn-tool-shadow)"
                />
                {horizontal
                  ? [x - 5, x, x + 5].map((dot) => (
                      <circle
                        key={dot}
                        cx={dot}
                        cy={y}
                        r="1.25"
                        fill="#2583ab"
                        pointerEvents="none"
                      />
                    ))
                  : [y - 5, y, y + 5].map((dot) => (
                      <circle
                        key={dot}
                        cx={x}
                        cy={dot}
                        r="1.25"
                        fill="#2583ab"
                        pointerEvents="none"
                      />
                    ))}
              </g>
            );
          })()
        : null}
    </g>
  );
}

function BpmnShapeV2({
  node,
  selected,
  primarySelected,
  connecting,
  canvasRight,
  onPointerDown,
  onResizePointerDown,
  onConnectorPointerDown,
  onQuickCreate,
  onClick,
  onDoubleClick,
  onContextMenu,
  editing,
  editingValue,
  onEditingChange,
  onEditingCommit,
  onEditingCancel,
}: {
  node: BpmnNode;
  selected: boolean;
  primarySelected: boolean;
  connecting: boolean;
  canvasRight: number;
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
  onResizePointerDown: (
    event: React.PointerEvent<SVGCircleElement>,
    handle: BpmnResizeHandle,
  ) => void;
  onConnectorPointerDown: (
    event: React.PointerEvent<SVGCircleElement>,
    anchor: BpmnEdgeAnchor,
  ) => void;
  onQuickCreate: (type: BpmnNodeType) => void;
  onClick: (event: React.MouseEvent<SVGGElement>) => void;
  onDoubleClick: (event: React.MouseEvent<SVGGElement>) => void;
  onContextMenu: (event: React.MouseEvent<SVGGElement>) => void;
  editing: boolean;
  editingValue: string;
  onEditingChange: (value: string) => void;
  onEditingCommit: () => void;
  onEditingCancel: () => void;
}) {
  const width =
    node.width ??
    (node.type === "gateway" ? 90 : node.type === "start" || node.type === "end" ? 70 : 150);
  const height =
    node.height ??
    (node.type === "gateway" ? 90 : node.type === "start" || node.type === "end" ? 70 : 72);
  const stroke = connecting ? "var(--gold)" : (node.strokeColor ?? defaultBpmnNodeStroke(node));
  const fill =
    node.fillColor ??
    node.color ??
    (node.type === "annotation"
      ? "color-mix(in oklab, var(--gold) 13%, var(--card))"
      : "var(--card)");
  const strokeWidth = node.strokeWidth ?? defaultBpmnNodeStrokeWidth(node);
  const common = { fill, stroke, strokeWidth: connecting ? Math.max(strokeWidth, 3) : strokeWidth };
  const isEvent = node.type === "start" || node.type === "end";
  const quickToolsX = node.x + width + 52 > canvasRight ? node.x - 48 : node.x + width + 14;
  const connectionHandles: BpmnEdgeAnchor[] = [
    { side: "top", offset: 0.5 },
    { side: "right", offset: 0.5 },
    { side: "bottom", offset: 0.5 },
    { side: "left", offset: 0.5 },
  ];
  const resizeHandles: Array<{ handle: BpmnResizeHandle; x: number; y: number; cursor: string }> = [
    { handle: "nw", x: node.x, y: node.y, cursor: "nwse-resize" },
    { handle: "n", x: node.x + width / 2, y: node.y, cursor: "ns-resize" },
    { handle: "ne", x: node.x + width, y: node.y, cursor: "nesw-resize" },
    { handle: "e", x: node.x + width, y: node.y + height / 2, cursor: "ew-resize" },
    { handle: "se", x: node.x + width, y: node.y + height, cursor: "nwse-resize" },
    { handle: "s", x: node.x + width / 2, y: node.y + height, cursor: "ns-resize" },
    { handle: "sw", x: node.x, y: node.y + height, cursor: "nesw-resize" },
    { handle: "w", x: node.x, y: node.y + height / 2, cursor: "ew-resize" },
  ];
  return (
    <g
      onPointerDown={onPointerDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      className={editing ? "cursor-text" : "cursor-move"}
    >
      {node.type === "task" ? (
        <rect x={node.x} y={node.y} width={width} height={height} rx="10" {...common} />
      ) : null}
      {node.type === "annotation" ? (
        <path
          d={`M${node.x},${node.y} H${node.x + width - 18} L${node.x + width},${node.y + 18} V${node.y + height} H${node.x} Z`}
          fill={fill}
          stroke={stroke}
          strokeWidth={connecting ? Math.max(strokeWidth, 3) : strokeWidth}
          strokeDasharray="6 4"
        />
      ) : null}
      {node.type === "gateway" ? (
        <path
          d={`M${node.x + width / 2},${node.y} L${node.x + width},${node.y + height / 2} L${node.x + width / 2},${node.y + height} L${node.x},${node.y + height / 2} Z`}
          {...common}
        />
      ) : null}
      {node.type === "gateway" && (node.gatewayType ?? "exclusive") === "exclusive" ? (
        <path
          d={`M${node.x + width * 0.35},${node.y + height * 0.35} L${node.x + width * 0.65},${node.y + height * 0.65} M${node.x + width * 0.65},${node.y + height * 0.35} L${node.x + width * 0.35},${node.y + height * 0.65}`}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="3"
          pointerEvents="none"
        />
      ) : null}
      {node.type === "gateway" && node.gatewayType === "parallel" ? (
        <path
          d={`M${node.x + width / 2},${node.y + height * 0.28} V${node.y + height * 0.72} M${node.x + width * 0.28},${node.y + height / 2} H${node.x + width * 0.72}`}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="3"
          pointerEvents="none"
        />
      ) : null}
      {node.type === "gateway" && node.gatewayType === "inclusive" ? (
        <circle
          cx={node.x + width / 2}
          cy={node.y + height / 2}
          r={Math.min(width, height) * 0.2}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="3"
          pointerEvents="none"
        />
      ) : null}
      {node.type === "gateway" && node.gatewayType === "event-based" ? (
        <circle
          cx={node.x + width / 2}
          cy={node.y + height / 2}
          r={Math.min(width, height) * 0.2}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="2"
          strokeDasharray="3 2"
          pointerEvents="none"
        />
      ) : null}
      {node.type === "gateway" && node.gatewayType === "complex" ? (
        <text
          x={node.x + width / 2}
          y={node.y + height / 2 + 8}
          textAnchor="middle"
          fontSize="28"
          fontWeight="800"
          fill="var(--foreground)"
          pointerEvents="none"
        >
          *
        </text>
      ) : null}
      {node.type === "start" ? (
        <circle
          cx={node.x + width / 2}
          cy={node.y + height / 2}
          r={Math.min(width, height) / 2 - 4}
          fill={fill}
          stroke={stroke}
          strokeWidth={connecting ? Math.max(strokeWidth, 3) : strokeWidth}
        />
      ) : null}
      {node.type === "end" ? (
        <circle
          cx={node.x + width / 2}
          cy={node.y + height / 2}
          r={Math.min(width, height) / 2 - 5}
          fill={fill}
          stroke={stroke}
          strokeWidth={connecting ? Math.max(strokeWidth, 5) : strokeWidth}
        />
      ) : null}
      {isEvent && !editing ? (
        <text
          x={node.x + width / 2}
          y={node.y + height + 22}
          textAnchor="middle"
          fontSize="12"
          fontWeight="700"
          fill="var(--foreground)"
          pointerEvents="none"
        >
          {node.label}
        </text>
      ) : null}
      {editing ? (
        <foreignObject
          x={isEvent ? node.x - 48 : node.x + 8}
          y={isEvent ? node.y + height + 4 : node.y + Math.max(8, height / 2 - 24)}
          width={isEvent ? Math.max(120, width + 96) : Math.max(48, width - 16)}
          height={isEvent ? 36 : 52}
        >
          <input
            autoFocus
            value={editingValue}
            onChange={(event) => onEditingChange(event.target.value)}
            onBlur={onEditingCommit}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") onEditingCommit();
              if (event.key === "Escape") onEditingCancel();
            }}
            className="h-full w-full rounded-md border border-[var(--gold)] bg-card px-2 text-center text-xs font-bold text-foreground shadow-sm outline-none"
          />
        </foreignObject>
      ) : null}
      {!isEvent && !editing ? (
        <foreignObject
          x={node.x + 8}
          y={node.y + Math.max(8, height / 2 - 22)}
          width={Math.max(30, width - 16)}
          height={44}
          pointerEvents="none"
        >
          <div className="flex h-full items-center justify-center text-center text-[12px] font-bold leading-tight text-foreground">
            {node.label}
          </div>
        </foreignObject>
      ) : null}
      {node.type === "task" && node.taskType && node.taskType !== "none" && !editing ? (
        <foreignObject x={node.x + 7} y={node.y + 6} width="22" height="22" pointerEvents="none">
          <div className="text-foreground">
            <BpmnNotationIcon
              kind="task"
              value={node.taskType}
              framed={false}
              className="h-[20px] w-[20px]"
            />
          </div>
        </foreignObject>
      ) : null}
      {selected ? (
        <>
          <rect
            x={node.x - 4}
            y={node.y - 4}
            width={width + 8}
            height={height + 8}
            rx="12"
            fill="none"
            stroke="#d39a20"
            strokeDasharray="5 5"
            strokeWidth="1.5"
            pointerEvents="none"
          />
          {primarySelected ? (
            <>
              {resizeHandles.map((handle) => (
                <circle
                  key={`${node.id}-resize-${handle.handle}`}
                  cx={handle.x}
                  cy={handle.y}
                  r="4.5"
                  fill="#ffffff"
                  stroke="#2583ab"
                  strokeWidth="2"
                  className={handle.cursor}
                  onPointerDown={(event) => onResizePointerDown(event, handle.handle)}
                />
              ))}
              {connectionHandles.map((anchor) => {
                const handle = anchorPoint(node, anchor);
                return (
                  <circle
                    key={`${node.id}-${anchor.side}`}
                    cx={handle.x}
                    cy={handle.y}
                    r="6"
                    fill="#ffffff"
                    stroke="#06966f"
                    strokeWidth="2.5"
                    className="cursor-crosshair"
                    onPointerDown={(event) => onConnectorPointerDown(event, anchor)}
                  />
                );
              })}
              {!editing ? (
                <g transform={`translate(${quickToolsX} ${node.y + Math.max(0, height / 2 - 43)})`}>
                  <rect
                    x="0"
                    y="0"
                    width="34"
                    height="102"
                    rx="6"
                    fill="#ffffff"
                    stroke="#b9c7c0"
                    strokeWidth="1"
                    filter="url(#bpmn-tool-shadow)"
                  />
                  <g
                    className="cursor-pointer"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onQuickCreate("task");
                    }}
                  >
                    <rect
                      x="7"
                      y="7"
                      width="20"
                      height="18"
                      rx="4"
                      fill="#e6f5f3"
                      stroke="#008c95"
                      strokeWidth="1.8"
                    />
                  </g>
                  <g
                    className="cursor-pointer"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onQuickCreate("gateway");
                    }}
                  >
                    <path
                      d="M17 37 L27 47 L17 57 L7 47 Z"
                      fill="#fff5d8"
                      stroke="#c49314"
                      strokeWidth="1.8"
                    />
                  </g>
                  <g
                    className="cursor-pointer"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      onQuickCreate("end");
                    }}
                  >
                    <circle
                      cx="17"
                      cy="78"
                      r="10"
                      fill="#ffe1df"
                      stroke="#a82b2b"
                      strokeWidth="3"
                    />
                  </g>
                </g>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </g>
  );
}

function validateBpmnDiagram(
  data: BpmnState,
  lanes: string[],
  bounds: {
    poolX: number;
    poolY: number;
    laneLabelWidth: number;
    poolWidth: number;
    laneHeights: number[];
  },
) {
  const issues: Array<{
    id: string;
    kind: "Erro" | "Alerta" | "Recomendação";
    message: string;
    nodeId?: string;
  }> = [];
  const poolHeight = Math.max(
    bounds.laneHeights.reduce((total, height) => total + height, 0),
    220,
  );
  if (!data.nodes.some((node) => node.type === "start"))
    issues.push({ id: "missing-start", kind: "Erro", message: "Processo sem evento inicial." });
  if (!data.nodes.some((node) => node.type === "end"))
    issues.push({ id: "missing-end", kind: "Erro", message: "Processo sem evento final." });
  lanes.forEach((lane, index) => {
    if (!lane.trim())
      issues.push({
        id: `lane-${index}`,
        kind: "Alerta",
        message: `Raia ${index + 1} sem identificação.`,
      });
  });
  data.nodes.forEach((node) => {
    const width = node.width ?? 140;
    const height = node.height ?? 64;
    if (!node.label.trim())
      issues.push({
        id: `${node.id}-label`,
        kind: "Alerta",
        message: "Elemento sem nome.",
        nodeId: node.id,
      });
    const insideX =
      node.x >= bounds.poolX + bounds.laneLabelWidth &&
      node.x + width <= bounds.poolX + bounds.poolWidth;
    const insideY = node.y >= bounds.poolY && node.y + height <= bounds.poolY + poolHeight;
    if (node.type !== "annotation" && (!insideX || !insideY))
      issues.push({
        id: `${node.id}-outside`,
        kind: "Alerta",
        message: "Elemento BPMN fora dos limites da piscina.",
        nodeId: node.id,
      });
    if (node.type !== "start" && !data.flows.some((flow) => flow.to === node.id))
      issues.push({
        id: `${node.id}-in`,
        kind: "Recomendação",
        message: "Elemento sem entrada.",
        nodeId: node.id,
      });
    if (node.type !== "end" && !data.flows.some((flow) => flow.from === node.id))
      issues.push({
        id: `${node.id}-out`,
        kind: "Recomendação",
        message: "Elemento sem saída.",
        nodeId: node.id,
      });
  });
  data.flows.forEach((flow) => {
    if (flow.from && !data.nodes.some((node) => node.id === flow.from))
      issues.push({ id: `${flow.id}-from`, kind: "Erro", message: "Conector sem origem." });
    if (flow.to && !data.nodes.some((node) => node.id === flow.to))
      issues.push({ id: `${flow.id}-to`, kind: "Erro", message: "Conector sem destino." });
  });
  return issues;
}

function BpmnTool({
  title,
  onClick,
  children,
  nodeType,
  toolType,
  disabled = false,
}: {
  title: string;
  onClick: () => void;
  children: ReactNode;
  nodeType?: BpmnNodeType;
  toolType?: "pool" | "lane" | "connector";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      draggable={Boolean(nodeType || toolType) && !disabled}
      disabled={disabled}
      onDragStart={(event) => {
        if (nodeType) event.dataTransfer.setData("application/x-bf-bpmn-node", nodeType);
        if (toolType) event.dataTransfer.setData("application/x-bf-bpmn-tool", toolType);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onClick}
      className="grid h-16 place-items-center rounded-md border border-border bg-card text-foreground transition hover:border-emerald-600 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function nodeBounds(node: BpmnNode) {
  const width = node.width ?? 140;
  const height = node.height ?? 64;
  return {
    left: node.x,
    right: node.x + width,
    top: node.y,
    bottom: node.y + height,
    cx: node.x + width / 2,
    cy: node.y + height / 2,
  };
}

function nodeCenter(node: BpmnNode) {
  const bounds = nodeBounds(node);
  return { x: bounds.cx, y: bounds.cy };
}

function clampRatio(value: number) {
  return Math.max(0.08, Math.min(0.92, value));
}

function anchorPoint(node: BpmnNode, anchor: BpmnEdgeAnchor) {
  const bounds = nodeBounds(node);
  if (anchor.side === "top")
    return { x: bounds.left + (bounds.right - bounds.left) * anchor.offset, y: bounds.top };
  if (anchor.side === "bottom")
    return { x: bounds.left + (bounds.right - bounds.left) * anchor.offset, y: bounds.bottom };
  if (anchor.side === "left")
    return { x: bounds.left, y: bounds.top + (bounds.bottom - bounds.top) * anchor.offset };
  return { x: bounds.right, y: bounds.top + (bounds.bottom - bounds.top) * anchor.offset };
}

function edgeAnchorFromPoint(node: BpmnNode, point: { x: number; y: number }): BpmnEdgeAnchor {
  const bounds = nodeBounds(node);
  const distances = [
    { side: "top" as const, value: Math.abs(point.y - bounds.top) },
    { side: "right" as const, value: Math.abs(point.x - bounds.right) },
    { side: "bottom" as const, value: Math.abs(point.y - bounds.bottom) },
    { side: "left" as const, value: Math.abs(point.x - bounds.left) },
  ].sort((a, b) => a.value - b.value);
  const side = distances[0]?.side ?? "right";
  if (side === "top" || side === "bottom") {
    return {
      side,
      offset: clampRatio((point.x - bounds.left) / Math.max(1, bounds.right - bounds.left)),
    };
  }
  return {
    side,
    offset: clampRatio((point.y - bounds.top) / Math.max(1, bounds.bottom - bounds.top)),
  };
}

function resolveConnectorPoint(from: BpmnNode, to: BpmnNode, anchor?: BpmnEdgeAnchor) {
  return anchor ? anchorPoint(from, anchor) : connectorPoint(from, to);
}

function orthogonalPoints(a: { x: number; y: number }, b: { x: number; y: number }) {
  if (Math.abs(a.x - b.x) > Math.abs(a.y - b.y)) {
    const midX = (a.x + b.x) / 2;
    return [
      { x: midX, y: a.y },
      { x: midX, y: b.y },
    ];
  }
  const midY = (a.y + b.y) / 2;
  return [
    { x: a.x, y: midY },
    { x: b.x, y: midY },
  ];
}

function orthogonalRoute(
  start: { x: number; y: number },
  points: Array<{ x: number; y: number }>,
  end: { x: number; y: number },
  fromSide?: BpmnEdgeSide,
  toSide?: BpmnEdgeSide,
) {
  const raw = [start, ...points, end];
  const route: Array<{ x: number; y: number }> = [raw[0]];
  const horizontalSide = (side?: BpmnEdgeSide) => side === "left" || side === "right";

  for (let index = 1; index < raw.length; index += 1) {
    const previous = route.at(-1)!;
    const target = raw[index];
    if (previous.x !== target.x && previous.y !== target.y) {
      const firstSegment = index === 1;
      const lastSegment = index === raw.length - 1;
      const firstMustBeHorizontal = firstSegment && horizontalSide(fromSide);
      const firstMustBeVertical = firstSegment && fromSide && !horizontalSide(fromSide);
      const lastMustBeHorizontal = lastSegment && horizontalSide(toSide);
      const lastMustBeVertical = lastSegment && toSide && !horizontalSide(toSide);
      const preferHorizontal =
        firstMustBeHorizontal || lastMustBeVertical
          ? true
          : firstMustBeVertical || lastMustBeHorizontal
            ? false
            : Math.abs(target.x - previous.x) >= Math.abs(target.y - previous.y);
      route.push(
        preferHorizontal ? { x: target.x, y: previous.y } : { x: previous.x, y: target.y },
      );
    }
    route.push(target);
  }
  return route;
}

function edgeVector(side?: BpmnEdgeSide) {
  if (side === "top") return { x: 0, y: -1 };
  if (side === "bottom") return { x: 0, y: 1 };
  if (side === "left") return { x: -1, y: 0 };
  return { x: 1, y: 0 };
}

function editableConnectorPoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  fromAnchor?: BpmnEdgeAnchor,
  toAnchor?: BpmnEdgeAnchor,
) {
  if (!fromAnchor) return orthogonalPoints(a, b);
  const fromVector = edgeVector(fromAnchor.side);
  const toVector = edgeVector(toAnchor?.side);
  const distance = 30;
  const exit = { x: a.x + fromVector.x * distance, y: a.y + fromVector.y * distance };
  const entry = toAnchor ? { x: b.x + toVector.x * distance, y: b.y + toVector.y * distance } : b;
  const horizontal = fromVector.x !== 0;

  // The two middle points form one explicit, draggable bend. Keeping them even
  // when aligned makes a straight connection become an orthogonal one smoothly.
  if (horizontal) {
    const y = Math.abs(exit.y - entry.y) < 1 ? exit.y : (exit.y + entry.y) / 2;
    return [exit, { x: exit.x, y }, { x: entry.x, y }, entry];
  }
  const x = Math.abs(exit.x - entry.x) < 1 ? exit.x : (exit.x + entry.x) / 2;
  return [exit, { x, y: exit.y }, { x, y: entry.y }, entry];
}

function connectorControlSegment(points: Array<{ x: number; y: number }>) {
  if (points.length >= 4) {
    const firstPoint = 1;
    const secondPoint = 2;
    const first = points[firstPoint];
    const second = points[secondPoint];
    return {
      firstPoint,
      secondPoint,
      axis: Math.abs(first.y - second.y) < 1 ? ("y" as const) : ("x" as const),
    };
  }
  if (points.length < 2) return null;
  let firstPoint = 0;
  let secondPoint = 1;
  let longest = -1;
  for (let index = 0; index < points.length - 1; index += 1) {
    const first = points[index];
    const second = points[index + 1];
    const length = Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
    if (length > longest) {
      longest = length;
      firstPoint = index;
      secondPoint = index + 1;
    }
  }
  const first = points[firstPoint];
  const second = points[secondPoint];
  return {
    firstPoint,
    secondPoint,
    axis: Math.abs(first.y - second.y) < 1 ? ("y" as const) : ("x" as const),
  };
}

function moveConnectorWithNode(flow: BpmnFlow, nodeId: string, delta: { x: number; y: number }) {
  if (
    (!delta.x && !delta.y) ||
    !flow.points?.length ||
    (flow.from !== nodeId && flow.to !== nodeId)
  )
    return flow;
  const points = flow.points.map((point) => ({ ...point }));
  const movePoint = (index: number, x = 0, y = 0) => {
    if (!points[index]) return;
    points[index] = { x: points[index].x + x, y: points[index].y + y };
  };

  if (flow.from === nodeId) {
    movePoint(0, delta.x, delta.y);
    if (points.length >= 4) {
      const anchor = flow.fromAnchor?.side;
      if (anchor === "left" || anchor === "right") movePoint(1, delta.x, 0);
      else movePoint(1, 0, delta.y);
    }
  }
  if (flow.to === nodeId) {
    const last = points.length - 1;
    movePoint(last, delta.x, delta.y);
    if (points.length >= 4) {
      const anchor = flow.toAnchor?.side;
      if (anchor === "left" || anchor === "right") movePoint(last - 1, delta.x, 0);
      else movePoint(last - 1, 0, delta.y);
    }
  }
  return { ...flow, points };
}

function smartConnectorAnchors(
  from: BpmnNode,
  to: BpmnNode,
): { fromAnchor: BpmnEdgeAnchor; toAnchor: BpmnEdgeAnchor } {
  const source = nodeBounds(from);
  const target = nodeBounds(to);
  const dx = target.cx - source.cx;
  const dy = target.cy - source.cy;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  if (horizontal) {
    return {
      fromAnchor: { side: dx >= 0 ? "right" : "left", offset: 0.5 },
      // With an appreciable vertical displacement, approach the target from
      // above or below. This keeps the last segment perpendicular to the node.
      toAnchor:
        Math.abs(dy) > 24
          ? { side: dy >= 0 ? "top" : "bottom", offset: 0.5 }
          : { side: dx >= 0 ? "left" : "right", offset: 0.5 },
    };
  }
  return {
    fromAnchor: { side: dy >= 0 ? "bottom" : "top", offset: 0.5 },
    toAnchor:
      Math.abs(dx) > 24
        ? { side: dx >= 0 ? "left" : "right", offset: 0.5 }
        : { side: dy >= 0 ? "top" : "bottom", offset: 0.5 },
  };
}

function refreshConnectorAfterNodeMove(flow: BpmnFlow, nodes: BpmnNode[], movedNodeId: string) {
  if (
    flow.points?.length ||
    (flow.from !== movedNodeId && flow.to !== movedNodeId) ||
    !flow.from ||
    !flow.to
  )
    return flow;
  const from = nodes.find((node) => node.id === flow.from);
  const to = nodes.find((node) => node.id === flow.to);
  if (!from || !to) return flow;
  return { ...flow, ...smartConnectorAnchors(from, to) };
}

function connectorRoutePoints(
  a: { x: number; y: number },
  b: { x: number; y: number },
  fromAnchor?: BpmnEdgeAnchor,
  toAnchor?: BpmnEdgeAnchor,
) {
  if (!fromAnchor || !toAnchor) return orthogonalPoints(a, b);
  const distance = 28;
  const vector = (side: BpmnEdgeSide) => {
    if (side === "top") return { x: 0, y: -1 };
    if (side === "bottom") return { x: 0, y: 1 };
    if (side === "left") return { x: -1, y: 0 };
    return { x: 1, y: 0 };
  };
  const fromVector = vector(fromAnchor.side);
  const toVector = vector(toAnchor.side);
  const exit = { x: a.x + fromVector.x * distance, y: a.y + fromVector.y * distance };
  const entry = { x: b.x + toVector.x * distance, y: b.y + toVector.y * distance };
  const sourceHorizontal = fromVector.x !== 0;
  const targetHorizontal = toVector.x !== 0;
  const points =
    sourceHorizontal === targetHorizontal
      ? sourceHorizontal
        ? [
            exit,
            { x: (exit.x + entry.x) / 2, y: exit.y },
            { x: (exit.x + entry.x) / 2, y: entry.y },
            entry,
          ]
        : [
            exit,
            { x: exit.x, y: (exit.y + entry.y) / 2 },
            { x: entry.x, y: (exit.y + entry.y) / 2 },
            entry,
          ]
      : sourceHorizontal
        ? [exit, { x: entry.x, y: exit.y }, entry]
        : [exit, { x: exit.x, y: entry.y }, entry];
  return points.filter(
    (point, index, list) =>
      index === 0 || point.x !== list[index - 1].x || point.y !== list[index - 1].y,
  );
}

function connectorPoint(from: BpmnNode, to: BpmnNode) {
  const a = nodeBounds(from);
  const b = nodeBounds(to);
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? a.right : a.left, y: a.cy, orientation: "horizontal" as const };
  }
  return { x: a.cx, y: dy >= 0 ? a.bottom : a.top, orientation: "vertical" as const };
}

function Hero({
  title,
  eyebrow,
  progress,
  children,
}: {
  title: string;
  eyebrow: string;
  progress: number;
  children?: ReactNode;
}) {
  return (
    <section className="border-b border-border pb-5">
      <div className="grid items-end gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
            {eyebrow}
          </div>
          <h1 className="font-display text-3xl font-semibold text-foreground">{title}</h1>
          {children ? (
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{children}</p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border bg-muted/35 p-4">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-medium text-muted-foreground">Preenchimento</span>
            <strong className="text-lg font-semibold text-foreground">{progress}%</strong>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-border">
            <div
              className="h-full rounded-full bg-[var(--gold)] transition-[width]"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Panel({
  title,
  progress,
  defaultOpen = false,
  id,
  num,
  openSignal,
  children,
}: {
  title?: string;
  progress?: number;
  defaultOpen?: boolean;
  // Ancora para navegacao pelo indice do relatorio.
  id?: string;
  // Número da seção (ordem do relatório) — exibido num selo à esquerda.
  num?: string;
  // Sinal externo (número crescente) que força a abertura do painel — usado
  // quando o usuário clica na seção no índice lateral.
  openSignal?: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(title ? defaultOpen : true);
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);
  useEffect(() => {
    if (openSignal) setOpen(true);
  }, [openSignal]);
  const complete = typeof progress === "number" && progress >= 100;
  return (
    <section
      id={id}
      className={`scroll-mt-[16rem] overflow-hidden rounded-xl border bg-card transition-shadow ${
        open
          ? "border-[color-mix(in_oklab,var(--gold)_28%,var(--border))] shadow-[0_10px_30px_-22px_rgba(24,24,34,.45)]"
          : "border-border shadow-sm hover:border-[color-mix(in_oklab,var(--gold)_22%,var(--border))]"
      }`}
    >
      {title ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className={`flex min-h-16 w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors ${open ? "bg-[color-mix(in_oklab,var(--gold)_5%,transparent)]" : "hover:bg-muted/40"}`}
        >
          {num ? (
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg font-data text-[12px] font-bold transition-colors ${
                complete
                  ? "bg-emerald-500/15 text-emerald-600"
                  : open
                    ? "bg-[var(--gold)] text-[var(--primary-foreground)]"
                    : "bg-accent text-[var(--gold)]"
              }`}
            >
              {complete ? <Check className="h-4 w-4" strokeWidth={3} /> : num}
            </span>
          ) : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[15px] font-semibold text-foreground">
              {title}
            </span>
            {typeof progress === "number" ? (
              <span className="mt-0.5 block text-[11px] font-medium text-muted-foreground">
                {complete ? "Seção concluída" : progress > 0 ? "Em preenchimento" : "Não iniciada"}
              </span>
            ) : null}
          </span>
          {typeof progress === "number" ? (
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 font-data text-xs font-bold ${
                complete
                  ? "bg-emerald-500/12 text-emerald-600"
                  : progress > 0
                    ? "bg-[color-mix(in_oklab,var(--gold)_16%,transparent)] text-[var(--gold-ink,var(--gold))]"
                    : "bg-muted/70 text-muted-foreground"
              }`}
            >
              {progress}%
            </span>
          ) : null}
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors">
            {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
        </button>
      ) : null}
      {title && typeof progress === "number" ? (
        <div className="h-[3px] bg-border/60">
          <div
            className={`h-[3px] transition-[width] ${complete ? "bg-emerald-500" : "bg-[var(--gold)]"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      {open ? <div className={title ? "p-4 md:p-5" : "p-5"}>{children}</div> : null}
    </section>
  );
}

// ─── Formulário de Mapeamento: barra de comando fixa + índice do relatório ────

type MappingSectionInfo = { key: string; num: string; title: string; pct: number };

function useUnsavedChangesGuard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function preventAccidentalExit(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", preventAccidentalExit);
    return () => window.removeEventListener("beforeunload", preventAccidentalExit);
  }, [enabled]);
}

// Barra fixa no topo do formulário de mapeamento: identidade do documento,
// medidor de progresso segmentado (uma marca por seção), estado de salvamento e
// as ações Salvar / Visualizar sempre acessíveis.
function FlowCommandBar({
  code,
  sections,
  overallPct,
  saveState,
  canSave,
  onSave,
  onPreview,
  eyebrow = "Processos",
  title = "Preenchimento",
  saveTitle = "Salvar preenchimento",
  previewTitle = "Visualizar preenchimento",
  processControl,
}: {
  code: string;
  sections: MappingSectionInfo[];
  overallPct: number;
  saveState: "idle" | "dirty" | "saving" | "saved";
  canSave: boolean;
  onSave?: () => void;
  onPreview?: () => void;
  eyebrow?: string;
  title?: string;
  saveTitle?: string;
  previewTitle?: string;
  processControl: ReactNode;
}) {
  const stateLabel =
    saveState === "saving"
      ? "Salvando…"
      : saveState === "dirty"
        ? "Alterações não salvas"
        : saveState === "saved"
          ? "Tudo salvo"
          : "";
  return (
    <div className="sticky top-14 z-30 -mx-5 border-b border-border bg-[color-mix(in_oklab,var(--card)_94%,transparent)] px-3 py-3 backdrop-blur-md sm:px-5">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
            {eyebrow}
          </div>
          <h1 className="mt-0.5 flex items-baseline gap-2.5 font-display text-lg font-bold text-foreground md:text-xl">
            {title}
            {code ? (
              <span className="font-data text-xs font-semibold text-muted-foreground">{code}</span>
            ) : null}
          </h1>
        </div>

        <div className="flex-1" />

        <div
          className="order-last flex w-full items-center gap-3 sm:order-none sm:w-auto"
          title="Preenchimento por seção"
        >
          <div className="flex gap-[3px]">
            {sections.map((s) => (
              <span
                key={s.key}
                title={`${s.num} ${s.title} · ${s.pct}%`}
                className={[
                  "h-2 w-3.5 rounded-[3px] transition-colors",
                  s.pct >= 100 ? "bg-emerald-500" : s.pct > 0 ? "bg-[var(--gold)]" : "bg-border",
                ].join(" ")}
              />
            ))}
          </div>
          <div className="text-right leading-none">
            <div className="text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              Preench.
            </div>
            <div className="mt-0.5 font-data text-sm font-bold text-foreground">{overallPct}%</div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="sr-only sm:hidden" role="status" aria-live="polite">
            {stateLabel}
          </span>
          {stateLabel ? (
            <div className="hidden text-right sm:block" role="status" aria-live="polite">
              <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[var(--gold)]">
                {saveState === "dirty" ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--gold)]" />
                ) : saveState === "saved" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : null}
                {stateLabel}
              </span>
            </div>
          ) : null}
          {onPreview ? (
            <button
              type="button"
              onClick={onPreview}
              disabled={!canSave}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-45 sm:h-9 sm:px-3.5"
              title={previewTitle}
            >
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Visualizar</span>
            </button>
          ) : null}
          {onSave ? (
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave || saveState === "saving"}
              aria-busy={saveState === "saving"}
              className="relative inline-flex h-10 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-45 sm:h-9 sm:px-3.5"
              title={saveTitle}
            >
              {saveState === "dirty" && canSave ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--gold)] ring-2 ring-card" />
              ) : null}
              <Save className="h-4 w-4" />
              <span className="hidden sm:inline">Salvar</span>
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 max-w-xl">{processControl}</div>
    </div>
  );
}

// Índice lateral do relatório: lista as seções na ordem em que aparecem no
// documento (a mesma do Word), com o estado de preenchimento de cada uma.
function MappingSectionNav({
  sections,
  activeKey,
  onSelect,
  label = "Índice do relatório",
}: {
  sections: MappingSectionInfo[];
  activeKey: string;
  onSelect: (key: string) => void;
  label?: string;
}) {
  const done = sections.filter((s) => s.pct >= 100).length;
  return (
    <nav
      className="sticky top-[13.5rem] z-20 -mx-1 mb-3 rounded-lg border border-border bg-card/95 p-2 shadow-sm backdrop-blur lg:top-[16.5rem] lg:mx-0 lg:mb-0 lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none"
      aria-label={label}
    >
      <div className="mb-3 ml-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
        {label}
      </div>
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:gap-0.5 lg:overflow-visible lg:pb-0">
        {sections.map((s) => {
          const active = s.key === activeKey;
          return (
            <li key={s.key} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                className={[
                  "grid min-w-[150px] grid-cols-[20px_1fr_auto] items-center gap-2 rounded-md border-l-2 px-2 py-2 text-left transition lg:w-full lg:min-w-0 lg:gap-2.5 lg:pl-2 lg:pr-2.5",
                  active
                    ? "border-[var(--gold)] bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                ].join(" ")}
              >
                <span
                  className={`text-center font-data text-[11px] font-semibold ${active ? "text-[var(--gold)]" : "text-muted-foreground/70"}`}
                >
                  {s.num}
                </span>
                <span
                  className={`max-w-36 truncate text-[12.5px] lg:max-w-none ${active ? "font-bold" : "font-medium"}`}
                >
                  {s.title}
                </span>
                <MappingSectionDot pct={s.pct} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 ml-1 hidden items-center justify-between border-t border-border/70 pt-3 text-[11.5px] text-muted-foreground lg:flex">
        <span>Seções concluídas</span>
        <b className="font-data text-foreground">
          {done} / {sections.length}
        </b>
      </div>
    </nav>
  );
}

function MappingSectionDot({ pct }: { pct: number }) {
  if (pct >= 100) {
    return (
      <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-emerald-500 text-white">
        <Check className="h-2.5 w-2.5" strokeWidth={3.5} />
      </span>
    );
  }
  if (pct > 0) {
    return (
      <span
        className="h-3.5 w-3.5 rounded-full border-[1.5px] border-[var(--gold)]"
        style={{ background: "conic-gradient(var(--gold) 55%, transparent 55%)" }}
      />
    );
  }
  return <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-border" />;
}

function RegisteredProcessSelect({
  label,
  value,
  processes,
  onSelect,
  required = false,
  placeholder = "Buscar processo cadastrado...",
  displayName = processDisplayName,
  onRequestCreate,
}: {
  label: string;
  value: string;
  processes: OrganizationProcess[];
  onSelect: (process: OrganizationProcess | null) => void;
  required?: boolean;
  placeholder?: string;
  displayName?: (process: OrganizationProcess) => string;
  // Abre o cadastro de um novo processo (pré-preenchendo o nome pesquisado).
  onRequestCreate?: (query: string) => void;
}) {
  const selected = processes.find((process) => process.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputId = useId();
  const listboxId = `${inputId}-options`;
  const normalizedQuery = normalizeLabel(query);
  const filtered = useMemo(() => {
    if (!normalizedQuery) return processes.slice(0, 12);
    return processes
      .filter((process) =>
        normalizeLabel(
          [
            process.code ?? "",
            process.name,
            processTypeLabel(process.type),
            process.department ?? "",
            process.owner ?? "",
          ].join(" "),
        ).includes(normalizedQuery),
      )
      .slice(0, 12);
  }, [normalizedQuery, processes]);
  const canRequestCreate =
    !!onRequestCreate &&
    !!query.trim() &&
    !processes.some((process) => normalizeLabel(displayName(process)) === normalizedQuery);

  useEffect(() => {
    if (!open) setQuery(selected ? displayName(selected) : "");
    // Sincroniza o texto ao fechar; usa selected?.id de propósito (identidade estável).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected?.id, displayName]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") return setOpen(false);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (!filtered.length) return -1;
        if (current < 0) return direction > 0 ? 0 : filtered.length - 1;
        return (current + direction + filtered.length) % filtered.length;
      });
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) onSelect(filtered[activeIndex]);
      else if (canRequestCreate) onRequestCreate?.(query.trim());
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          required={required}
          value={open ? query : selected ? displayName(selected) : ""}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-input bg-background py-2.5 pl-9 pr-9 text-sm text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
        />
        {value ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              onSelect(null);
            }}
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Limpar seleção"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`Opções de ${label}`}
          className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg"
        >
          {filtered.length ? (
            filtered.map((process, index) => (
              <button
                type="button"
                key={process.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={process.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onSelect(process);
                  setOpen(false);
                }}
                className={`grid min-h-11 w-full gap-1 rounded-md border border-transparent px-3 py-2.5 text-left text-sm hover:border-border hover:bg-muted ${activeIndex === index ? "bg-muted" : ""}`}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-semibold text-foreground">
                    {displayName(process)}
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {processTypeLabel(process.type)}
                  </span>
                </span>
                <span className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-3">
                  <span className="truncate">{process.code || "Sem código"}</span>
                  <span className="truncate">{process.department || "Sem área"}</span>
                  <span className="truncate">{process.owner || "Sem dono"}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum processo encontrado.
            </div>
          )}
          {canRequestCreate ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false);
                onRequestCreate?.(query.trim());
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-[color-mix(in_oklab,var(--gold)_45%,var(--border))] px-3 py-2 text-left text-sm font-semibold text-[var(--gold)] hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Cadastrar novo processo{query.trim() ? ` "${query.trim()}"` : ""}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Mesma lógica de busca + cadastro rápido do RegisteredProcessSelect, aplicada
// ao catálogo de sistemas e documentos (Cadastros → Sistemas/Documentos).
function RegisteredSystemSelect({
  label,
  value,
  displayValue = "",
  systems,
  onSelect,
  placeholder = "Buscar sistema ou documento cadastrado...",
  onRequestCreate,
}: {
  label: string;
  value: string;
  displayValue?: string;
  systems: OrganizationSystem[];
  onSelect: (system: OrganizationSystem | null) => void;
  placeholder?: string;
  // Abre o cadastro de um novo sistema (pré-preenchendo o nome pesquisado).
  onRequestCreate?: (query: string) => void;
}) {
  const selected =
    systems.find((system) => system.id === value) ??
    systems.find((system) => normalizeLabel(system.name) === normalizeLabel(displayValue)) ??
    null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputId = useId();
  const listboxId = `${inputId}-options`;
  const normalizedQuery = normalizeLabel(query);
  const filtered = useMemo(() => {
    if (!normalizedQuery) return systems.slice(0, 12);
    return systems
      .filter((system) =>
        normalizeLabel([system.name, system.modality, system.description].join(" ")).includes(
          normalizedQuery,
        ),
      )
      .slice(0, 12);
  }, [normalizedQuery, systems]);
  const canRequestCreate =
    !!onRequestCreate &&
    !!query.trim() &&
    !systems.some((system) => normalizeLabel(system.name) === normalizedQuery);

  useEffect(() => {
    if (!open) setQuery(selected ? selected.name : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected?.id]);

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") return setOpen(false);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (!filtered.length) return -1;
        if (current < 0) return direction > 0 ? 0 : filtered.length - 1;
        return (current + direction + filtered.length) % filtered.length;
      });
    } else if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeIndex >= 0 && filtered[activeIndex]) onSelect(filtered[activeIndex]);
      else if (canRequestCreate) onRequestCreate?.(query.trim());
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          id={inputId}
          value={open ? query : (selected?.name ?? displayValue)}
          placeholder={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-md border border-input bg-background py-2.5 pl-9 pr-9 text-sm text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
        />
        {value || displayValue ? (
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              onSelect(null);
            }}
            className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Limpar seleção"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`Opções de ${label}`}
          className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg"
        >
          {filtered.length ? (
            filtered.map((system, index) => (
              <button
                type="button"
                key={system.id}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={system.id === value}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onSelect(system);
                  setOpen(false);
                }}
                className={`grid min-h-11 w-full gap-1 rounded-md border border-transparent px-3 py-2.5 text-left text-sm hover:border-border hover:bg-muted ${activeIndex === index ? "bg-muted" : ""}`}
              >
                <span className="flex min-w-0 items-center justify-between gap-2">
                  <span className="truncate font-semibold text-foreground">{system.name}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {normalizeSystemModality(system.modality)}
                  </span>
                </span>
                {system.description ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {system.description}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum sistema ou documento encontrado.
            </div>
          )}
          {canRequestCreate ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                setOpen(false);
                onRequestCreate?.(query.trim());
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-[color-mix(in_oklab,var(--gold)_45%,var(--border))] px-3 py-2 text-left text-sm font-semibold text-[var(--gold)] hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              Cadastrar novo sistema/documento{query.trim() ? ` "${query.trim()}"` : ""}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Linguagem visual única dos campos do formulário: mesma altura, foco em
// dourado, hover discreto no contorno. Mantém o comportamento — só refina a
// aparência e a consistência entre as seções.
const fieldLabelClass =
  "mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground/90";
const primaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90";
const secondaryButtonClass =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition hover:bg-muted";
const fieldInputBase =
  "w-full rounded-lg border border-input bg-background text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 hover:border-[color-mix(in_oklab,var(--foreground)_22%,var(--input))] focus:border-[var(--gold)] focus:ring-[3px] focus:ring-[var(--gold)]/18 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground disabled:hover:border-input";

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  // Campo preenchido automaticamente pelo cadastro — visualmente "travado".
  return (
    <label className="block">
      <span className={fieldLabelClass}>
        <Lock className="h-3 w-3" />
        {label}
      </span>
      <input
        readOnly
        tabIndex={-1}
        value={value}
        placeholder="Preenchido pelo processo selecionado"
        className="h-10 w-full cursor-not-allowed rounded-md border border-dashed border-border bg-muted/60 px-3 text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/50"
      />
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  compact,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const isDate = type === "date";
  if (isDate) {
    return <DateField label={label} value={value} onChange={onChange} compact={compact} />;
  }
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <input
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={`${fieldInputBase} px-3 ${compact ? "h-9" : "h-10"}`}
      />
    </label>
  );
}

function maskDateInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

function DateField({
  label,
  value,
  onChange,
  compact,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  compact?: boolean;
}) {
  const pickerRef = useRef<HTMLInputElement | null>(null);
  const displayValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDateBr(value) : value;
  function commitMasked(raw: string) {
    const masked = maskDateInput(raw);
    onChange(masked.length === 10 ? parseDateBrInput(masked) : masked);
  }
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          maxLength={10}
          placeholder="dd/mm/aaaa"
          value={displayValue}
          onChange={(event) => commitMasked(event.target.value)}
          onKeyDown={(event) => {
            const allowed = [
              "Backspace",
              "Delete",
              "ArrowLeft",
              "ArrowRight",
              "Tab",
              "Home",
              "End",
            ];
            if (allowed.includes(event.key) || event.ctrlKey || event.metaKey) return;
            if (!/^\d$/.test(event.key)) event.preventDefault();
          }}
          className={`${fieldInputBase} ${compact ? "h-9" : "h-10"} px-3 pr-10`}
        />
        <button
          type="button"
          className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
          title="Selecionar data"
          onClick={() => {
            const input = pickerRef.current;
            if (!input) return;
            if (typeof input.showPicker === "function") input.showPicker();
            else input.click();
          }}
        >
          <CalendarDays className="h-4 w-4" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          value={/^\d{4}-\d{2}-\d{2}$/.test(value) ? value : ""}
          onChange={(event) => onChange(event.target.value)}
          className="pointer-events-none absolute right-0 top-0 h-0 w-0 opacity-0"
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>
    </label>
  );
}

function UserSearchField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <DropdownTextField
      label={label}
      value={value}
      options={options}
      placeholder={options.length ? "Pesquise um usuário cadastrado" : "Informe o usuário"}
      onChange={onChange}
    />
  );
}

function CatalogSearchField({
  label,
  value,
  options,
  createLabel,
  onChange,
  onCreate,
}: {
  label: string;
  value: string;
  options: string[];
  createLabel: string;
  onChange: (value: string) => void;
  onCreate: (initial: string) => void;
}) {
  return (
    <DropdownTextField
      label={label}
      value={value}
      options={options}
      placeholder={`Pesquisar ${label.toLowerCase()}`}
      onChange={onChange}
      createLabel={createLabel}
      onCreate={onCreate}
      compact
    />
  );
}

function ActivityActorField({
  actorType,
  actorName,
  catalogs,
  onChange,
  onCreate,
}: {
  actorType: FlowActorType;
  actorName: string;
  catalogs: OrganizationCatalogs;
  onChange: (patch: { actorType?: FlowActorType; actorName?: string }) => void;
  onCreate: (kind: "area" | "position", initial: string) => void;
}) {
  const typeLabel =
    actorType === "area" ? "Área" : actorType === "position" ? "Cargo" : "Selecione";
  const options =
    actorType === "area"
      ? catalogs.departments.map((item) => item.name)
      : catalogs.positions.map((item) => item.title);

  return (
    <div className="grid gap-3 rounded-lg border border-border bg-background p-3 md:grid-cols-[180px_1fr]">
      <SelectField
        label="Tipo de ator"
        value={typeLabel}
        options={["Selecione", "Área", "Cargo"]}
        onChange={(value) =>
          onChange({
            actorType: value === "Área" ? "area" : value === "Cargo" ? "position" : "",
            actorName: "",
          })
        }
      />
      {actorType ? (
        <CatalogSearchField
          label="Área/ator da atividade"
          value={actorName}
          options={options}
          createLabel={actorType === "area" ? "Cadastrar nova área" : "Cadastrar novo cargo"}
          onChange={(value) => onChange({ actorName: value })}
          onCreate={(initial) => onCreate(actorType, initial)}
        />
      ) : (
        <ReadOnlyField
          label="Área/ator da atividade"
          value="Selecione primeiro se o ator é uma área ou um cargo"
        />
      )}
    </div>
  );
}

function DropdownTextField({
  label,
  value,
  options,
  placeholder,
  onChange,
  createLabel,
  onCreate,
  compact,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  createLabel?: string;
  onCreate?: (initial: string) => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputId = useId();
  const listboxId = `${inputId}-options`;
  const uniqueOptions = useMemo(() => Array.from(new Set(options.filter(Boolean))), [options]);
  const normalizedValue = normalizeLabel(value);
  const filteredOptions = useMemo(() => {
    if (!normalizedValue) return uniqueOptions.slice(0, 10);
    return uniqueOptions
      .filter((option) => normalizeLabel(option).includes(normalizedValue))
      .slice(0, 10);
  }, [normalizedValue, uniqueOptions]);
  const hasExact = uniqueOptions.some((option) => normalizeLabel(option) === normalizedValue);
  const canCreate = Boolean(onCreate && createLabel && value.trim() && !hasExact);

  useEffect(() => {
    setActiveIndex(-1);
  }, [value, open]);

  function selectOption(option: string) {
    onChange(option);
    setOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (!filteredOptions.length) return -1;
        if (current < 0) return direction > 0 ? 0 : filteredOptions.length - 1;
        return (current + direction + filteredOptions.length) % filteredOptions.length;
      });
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeIndex >= 0 && filteredOptions[activeIndex]) {
        selectOption(filteredOptions[activeIndex]);
      } else if (canCreate) {
        onCreate?.(value.trim());
        setOpen(false);
      }
    }
  }

  return (
    <label className="relative block" htmlFor={inputId}>
      <span className={fieldLabelClass}>{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          id={inputId}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          className={`${fieldInputBase} ${compact ? "h-9" : "h-10"} pl-9 pr-9`}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
      </div>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`Opções de ${label}`}
          className="absolute z-40 mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg"
        >
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => (
              <button
                key={option}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={normalizeLabel(option) === normalizedValue}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted ${
                  activeIndex === index ? "bg-muted" : ""
                }`}
              >
                <span className="truncate">{option}</span>
                {normalizeLabel(option) === normalizedValue ? (
                  <Check className="h-4 w-4 shrink-0 text-[var(--gold)]" />
                ) : null}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma opção encontrada.</div>
          )}
          {canCreate ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCreate?.(value.trim());
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-[color-mix(in_oklab,var(--gold)_45%,var(--border))] px-3 py-2 text-left text-sm font-semibold text-[var(--gold)] transition hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              {createLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <div className="relative">
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldInputBase} h-10 cursor-pointer appearance-none px-3 pr-9`}
        >
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 5,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <textarea
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        rows={rows}
        className={`${fieldInputBase} resize-y px-3 py-2.5 leading-relaxed`}
      />
    </label>
  );
}

function ImageManager({
  label = "Imagens",
  captionLabel = "Legenda",
  showTitle = true,
  inputId,
  hideAddButton = false,
  hideEmptyContainer = false,
  images,
  onChange,
}: {
  label?: string;
  captionLabel?: string;
  showTitle?: boolean;
  inputId?: string;
  hideAddButton?: boolean;
  hideEmptyContainer?: boolean;
  images: ModuleImage[];
  onChange: (images: ModuleImage[]) => void;
}) {
  async function addFiles(files: FileList | null) {
    if (!files?.length) return;
    try {
      const next = await Promise.all(
        Array.from(files).map(async (file) => ({
          id: id("img"),
          titulo: fileTitle(file),
          legenda: "",
          src: await fileToDataUrl(file),
        })),
      );
      onChange([...images, ...next]);
      toast.success(next.length === 1 ? "Imagem adicionada." : "Imagens adicionadas.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível adicionar a imagem.");
    }
  }

  if (hideEmptyContainer && !images.length) {
    return (
      <input
        id={inputId}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => {
          addFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {images.length ? `${images.length} imagem(ns) incorporada(s)` : "Nenhuma imagem ainda"}
          </div>
        </div>
        {!hideAddButton ? (
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted">
            <ImagePlus className="h-4 w-4" />
            Adicionar imagem
            <input
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                addFiles(event.target.files);
                event.currentTarget.value = "";
              }}
            />
          </label>
        ) : (
          <input
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(event) => {
              addFiles(event.target.files);
              event.currentTarget.value = "";
            }}
          />
        )}
      </div>
      {images.length ? (
        <div className="grid gap-3">
          {images.map((image) => (
            <div
              key={image.id}
              className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[160px_1fr_auto]"
            >
              <div className="overflow-hidden rounded-md border border-border bg-background">
                <img src={image.src} alt={image.titulo} className="h-32 w-full object-contain" />
              </div>
              <div className="grid gap-3">
                {showTitle ? (
                  <Field
                    compact
                    label="Título da imagem"
                    value={image.titulo}
                    onChange={(titulo) =>
                      onChange(
                        images.map((item) => (item.id === image.id ? { ...item, titulo } : item)),
                      )
                    }
                  />
                ) : null}
                <Field
                  compact
                  label={captionLabel}
                  value={image.legenda}
                  onChange={(legenda) =>
                    onChange(
                      images.map((item) => (item.id === image.id ? { ...item, legenda } : item)),
                    )
                  }
                />
              </div>
              <IconButton
                label="Excluir imagem"
                onClick={() => onChange(images.filter((item) => item.id !== image.id))}
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ListEditor({
  title,
  items,
  onChange,
  placeholder,
  progress,
  anchorId,
  num,
  openSignal,
}: {
  title: string;
  items: NextStepItem[];
  onChange: (items: NextStepItem[]) => void;
  placeholder: string;
  progress?: number;
  // Nome distinto de `id` para não sombrear o helper global id() usado abaixo.
  anchorId?: string;
  num?: string;
  openSignal?: number;
}) {
  return (
    <Panel title={title} progress={progress} id={anchorId} num={num} openSignal={openSignal}>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="grid gap-2 rounded-lg border border-border bg-card p-2 md:grid-cols-[auto_minmax(0,1fr)_180px_160px_auto]"
          >
            <div className="grid h-8 w-8 place-items-center rounded-md bg-muted text-xs font-semibold text-[var(--gold)]">
              {String(index + 1).padStart(2, "0")}
            </div>
            <input
              value={item.text}
              placeholder={placeholder}
              onChange={(event) =>
                onChange(
                  items.map((current) =>
                    current.id === item.id ? { ...current, text: event.target.value } : current,
                  ),
                )
              }
              className="min-w-0 rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-foreground outline-none transition focus:border-input focus:bg-background"
            />
            <input
              value={item.responsavel ?? ""}
              placeholder="Responsável"
              onChange={(event) =>
                onChange(
                  items.map((current) =>
                    current.id === item.id
                      ? { ...current, responsavel: event.target.value }
                      : current,
                  ),
                )
              }
              className="min-w-0 rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-foreground outline-none transition focus:border-input focus:bg-background"
            />
            <input
              type="date"
              value={dateInputValue(item.prazo)}
              aria-label="Prazo"
              onChange={(event) =>
                onChange(
                  items.map((current) =>
                    current.id === item.id ? { ...current, prazo: event.target.value } : current,
                  ),
                )
              }
              className="min-w-0 rounded-md border border-transparent bg-transparent px-2 py-2 text-sm text-foreground outline-none transition focus:border-input focus:bg-background"
            />
            <IconButton
              label="Excluir"
              onClick={() => onChange(items.filter((current) => current.id !== item.id))}
            >
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            onChange([...items, { id: id("item"), text: "", responsavel: "", prazo: "" }])
          }
          className="mt-2 inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </div>
    </Panel>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-foreground transition hover:bg-muted"
    >
      {icon}
    </button>
  );
}

function IconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
    >
      {children}
    </button>
  );
}

function Modal({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-lg border border-border bg-card p-4 text-foreground shadow-2xl sm:p-5"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-xl font-black tracking-tight">
              {title}
            </h2>
            {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar janela"
            title="Fechar"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-md hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function escapeXml(value: string) {
  return value.replace(/[<>&'"]/g, (char) => {
    const map: Record<string, string> = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&apos;",
      '"': "&quot;",
    };
    return map[char] ?? char;
  });
}
