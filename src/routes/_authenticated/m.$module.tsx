import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  Building2,
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
  FileSpreadsheet,
  Database,
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
  Save,
  Search,
  Settings,
  Square,
  Trash2,
  Upload,
  Workflow,
  X,
} from "lucide-react";
import {
  type CSSProperties,
  type ChangeEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  isDemoSessionActive,
  endDemoSession,
  listDemoWorkspaceVersions,
  restoreDemoWorkspaceState,
  saveDemoWorkspaceVersion,
} from "@/lib/demo-session";
import { MODULES, type AteliamModule } from "@/lib/workspace-bridge";
import { toast } from "sonner";

type ModuleRouteView = "new" | "consult" | "cause-new" | "cause-consult" | "cause-edit";

// Tipo de documento (modalidade) associado a cada mÃ³dulo. O mÃ³dulo POP Ã©
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
  if (tipo === "IT") return "InstruÃ§Ã£o de Trabalho";
  return "Procedimento Operacional PadrÃ£o";
}

function documentationTypeDescription(tipo: PopState["meta"]["tipo"]) {
  if (tipo === "Norma") return "Diretrizes, regras e critÃ©rios de aplicaÃ§Ã£o obrigatÃ³ria.";
  if (tipo === "IT") return "InstruÃ§Ãµes detalhadas para execuÃ§Ã£o de uma atividade especÃ­fica.";
  return "Procedimento operacional padronizado para execuÃ§Ã£o do processo.";
}
// LÃª a organizaÃ§Ã£o demo ativa (id, slug, code_settings) do localStorage.
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
  }),
  beforeLoad: ({ params }) => {
    if (!MODULES.some((m) => m.id === params.module)) throw notFound();
  },
});

const DRAFT_KEY = "ateliam_modern_workspace_v2";

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
type DdpFlowSubstep = {
  id: string;
  processId?: string;
  processVersion?: number;
  codigo: string;
  titulo: string;
  descricao: string;
  images: ModuleImage[];
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
type BpmnNodeType = "start" | "task" | "gateway" | "end";
type BpmnNode = {
  id: string;
  type: BpmnNodeType;
  label: string;
  x: number;
  y: number;
  lane: 0 | 1;
};
type BpmnFlow = { id: string; from: string; to: string; label?: string };

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
  codigo?: string;
  area?: string;
  lanes: [string, string];
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
const CAUSE_STATUS_OPTIONS = ["Pendente", "Em andamento", "ConcluÃ­da"] as const;
const CAUSE_PRIORITY_OPTIONS = ["Baixa", "MÃ©dia", "Alta", "CrÃ­tica"] as const;
const DEMO_CATALOGS: OrganizationCatalogs = {
  departments: [
    { id: "demo-dept-processos", name: "Processos", sigla: "PRO" },
    { id: "demo-dept-ti", name: "Tecnologia da InformaÃ§Ã£o", sigla: "TIN" },
  ],
  positions: [
    { id: "demo-position-analista", title: "Analista de Processos", description: "Executa e mantÃ©m documentaÃ§Ã£o de processos." },
    { id: "demo-position-gestor", title: "Gestor da Ãrea", description: "Aprova e responde pela aplicaÃ§Ã£o do documento." },
  ],
  processOwners: [
    { id: "demo-owner-processo", name: "Dono do processo" },
    { id: "demo-owner-area", name: "Gestor da Ã¡rea" },
  ],
  causes: [
    {
      id: "demo-cause-info",
      title: "InformaÃ§Ã£o descentralizada",
      description: "Dados e evidÃªncias ficam espalhados em canais diferentes.",
      impact: "Retrabalho e baixa rastreabilidade",
      action: "Padronizar registro e responsÃ¡veis",
      priority: "Alta",
    },
  ],
  valueChains: [
    {
      id: "demo-chain-operacao",
      name: "OperaÃ§Ã£o e GestÃ£o",
      category: "management",
      description: "Cadeia de valor principal da organizaÃ§Ã£o.",
      status: "Ativa",
    },
  ],
  processes: [
    {
      id: "demo-process-bi",
      code: "PROC-001",
      name: "GestÃ£o de Demandas de BI Analytics",
      type: "process",
      value_chain_id: "demo-chain-operacao",
      parent_process_id: null,
      department: "Tecnologia da InformaÃ§Ã£o",
      owner: "Dono do processo",
      description: "Processo corporativo de gestÃ£o de demandas.",
      status: "Ativo",
      current_version: 1,
    },
  ],
  systems: [
    { id: "sys-erp", name: "ERP TOTVS", description: "Sistema transacional de gestÃ£o (financeiro, fiscal, estoque)." },
    { id: "sys-powerbi", name: "Power BI", description: "Plataforma de dashboards e relatÃ³rios analÃ­ticos." },
    { id: "sys-crm", name: "HubSpot CRM", description: "GestÃ£o de leads, funil e atividades comerciais." },
    { id: "sys-ats", name: "Gupy (ATS)", description: "Recrutamento e seleÃ§Ã£o: publicaÃ§Ã£o de vagas e triagem." },
    { id: "sys-jira", name: "Jira", description: "GestÃ£o de demandas e projetos de TI." },
    { id: "sys-workspace", name: "Google Workspace", description: "E-mail, colaboraÃ§Ã£o e agenda corporativa." },
  ],
};

function moduleDocumentLabel(moduleId: AteliamModule) {
  if (moduleId === "ddp") return "Mapeamento";
  if (moduleId === "pop") return "DocumentaÃ§Ã£o";
  return "Fluxograma";
}

function processDisplayName(process: OrganizationProcess) {
  return `${process.code ? `${process.code} Â· ` : ""}${process.name}`;
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
        publico: "PÃºblico Interno",
        area: "",
        processo: "",
        versao: "00",
        vigencia: "",
        elaboracao: "",
        revisor: "",
        aprovacao: "",
        publicacao: "",
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
          title: "3.2 Tratamento de exceÃ§Ãµes e registros",
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
          descricao: "ElaboraÃ§Ã£o inicial do documento.",
        },
      ],
    },
    bpmn: {
      poolName: "Processo principal",
      area: "",
      lanes: ["Solicitante", "Executor"],
      nodes: [
        { id: "start_1", type: "start", label: "InÃ­cio", x: 120, y: 135, lane: 0 },
        { id: "task_1", type: "task", label: "Receber solicitaÃ§Ã£o", x: 260, y: 110, lane: 0 },
        { id: "gateway_1", type: "gateway", label: "Completo?", x: 470, y: 135, lane: 0 },
        { id: "task_2", type: "task", label: "Executar atividade", x: 610, y: 310, lane: 1 },
        { id: "end_1", type: "end", label: "Fim", x: 825, y: 335, lane: 1 },
      ],
      flows: [
        { id: "flow_1", from: "start_1", to: "task_1" },
        { id: "flow_2", from: "task_1", to: "gateway_1" },
        { id: "flow_3", from: "gateway_1", to: "task_2", label: "Sim" },
        { id: "flow_4", from: "task_2", to: "end_1" },
      ],
    },
  };
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Documentos de demonstraÃ§Ã£o REAIS e encadeados com o DEMO_REGISTRY
// (Ã¡rea â†’ dono â†’ cadeia de valor â†’ processo â†’ mapeamento/documento).
// Servem para visualizar o preenchimento completo dos formulÃ¡rios.
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      macroprocess: { ...base.ddp.macroprocess, legenda: `Macroprocesso AS IS â€” ${spec.titulo}` },
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
      gaps: spec.gaps.map(([causa, descricao, impacto, acao, responsavel, prazo, prioridade, status]) => ({
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
      })),
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
    titulo: "GestÃ£o de Demandas de BI & Analytics",
    area: "Tecnologia da InformaÃ§Ã£o",
    donoProcesso: "Carlos Menezes Â· TI",
    responsavel: "Carlos Menezes Â· TI",
    elaborador: "Aline Ferreira Â· Processos & Qualidade",
    revisor: "Carlos Menezes Â· TI",
    valueChainId: "chain-gestao-ti",
    valueChainName: "GestÃ£o de TI & InovaÃ§Ã£o",
    versao: "03",
    status: "Aprovado",
    updatedAt: "2026-06-20",
    objetivo:
      "Mapear o ciclo de atendimento das demandas de BI e Analytics, do pedido do solicitante atÃ© a publicaÃ§Ã£o do dashboard, identificando gargalos e retrabalho.",
    escopo:
      "Inclui solicitaÃ§Ã£o, priorizaÃ§Ã£o, modelagem de dados, construÃ§Ã£o de dashboards e publicaÃ§Ã£o. NÃ£o inclui a infraestrutura do data warehouse.",
    estadoAtual:
      "Demandas chegam por e-mail e canais diversos, sem padronizaÃ§Ã£o. A priorizaÃ§Ã£o Ã© informal e depende da disponibilidade do time.",
    kpis: "Lead time mÃ©dio da demanda; % de dashboards publicados no prazo; nÂº de retrabalhos por demanda.",
    volume: "~25 demandas/mÃªs",
    frequencia: "Fluxo contÃ­nuo (diÃ¡rio)",
    dores:
      "Falta de critÃ©rio claro de priorizaÃ§Ã£o; requisitos incompletos; retrabalho por validaÃ§Ã£o tardia com o solicitante.",
    oportunidades:
      "Portal Ãºnico de demandas, template de requisitos e checkpoint de validaÃ§Ã£o intermediÃ¡ria.",
    systems: [
      ["Power BI", "Plataforma de BI", "Alta", "ConstruÃ§Ã£o e publicaÃ§Ã£o de dashboards e relatÃ³rios."],
      ["Azure SQL / DW", "Banco de dados analÃ­tico", "Alta", "Camada de dados consolidada para anÃ¡lise."],
      ["Jira", "GestÃ£o de demandas", "MÃ©dia", "Registro e acompanhamento das demandas priorizadas."],
    ],
    steps: [
      ["Receber e registrar demanda", "Analista de BI", "Pedido do solicitante", "Registrar a demanda e capturar o objetivo de negÃ³cio.", "Demanda registrada", "Jira", "Requisito incompleto"],
      ["Priorizar demanda", "Carlos Menezes Â· TI", "Backlog de demandas", "Classificar por valor e esforÃ§o no comitÃª semanal.", "Demanda priorizada", "Jira", "PriorizaÃ§Ã£o subjetiva"],
      ["Modelar dados", "Engenheiro de Dados", "Fontes de dados", "Construir/ajustar o modelo de dados necessÃ¡rio.", "Modelo pronto", "Azure SQL / DW", "Qualidade de dados"],
      ["Construir dashboard", "Analista de BI", "Modelo de dados", "Desenvolver visualizaÃ§Ãµes conforme requisitos.", "Dashboard em homologaÃ§Ã£o", "Power BI", "DivergÃªncia de requisito"],
      ["Validar e publicar", "Solicitante", "Dashboard homologado", "Validar com o solicitante e publicar no workspace.", "Dashboard publicado", "Power BI", "ValidaÃ§Ã£o tardia"],
    ],
    sipoc: [
      ["Ãreas de negÃ³cio", "Pedido e regras de negÃ³cio", "Atendimento da demanda de BI", "Dashboard publicado", "Gestores e analistas"],
      ["Sistemas transacionais", "Dados brutos", "Modelagem e consolidaÃ§Ã£o", "Base analÃ­tica confiÃ¡vel", "Time de BI"],
    ],
    gaps: [
      ["PriorizaÃ§Ã£o informal", "NÃ£o hÃ¡ critÃ©rio objetivo para priorizar demandas.", "Atrasos e insatisfaÃ§Ã£o das Ã¡reas", "Implantar matriz valor Ã— esforÃ§o no comitÃª", "Carlos Menezes Â· TI", "2026-07-31", "Alta", "Pendente"],
      ["Requisitos incompletos", "Demandas chegam sem detalhamento suficiente.", "Retrabalho e atraso", "Adotar template de requisitos no portal", "Aline Ferreira Â· Processos & Qualidade", "2026-07-15", "Alta", "Em andamento"],
    ],
    nextSteps: [
      "Implantar portal Ãºnico de demandas com template de requisitos",
      "Definir SLA por tipo de demanda",
      "Validar o mapeamento com o dono do processo",
    ],
    glossary: [
      ["BI", "Business Intelligence â€” anÃ¡lise de dados para apoio Ã  decisÃ£o."],
      ["Lead time", "Tempo total entre a abertura e a entrega da demanda."],
      ["DW", "Data Warehouse â€” repositÃ³rio central de dados analÃ­ticos."],
    ],
  },
  {
    id: "demo-doc:ddp:MAP.RH.001",
    codigo: "MAP.RH.001",
    titulo: "Recrutamento e SeleÃ§Ã£o",
    area: "Recursos Humanos",
    donoProcesso: "Juliana Castro Â· RH",
    responsavel: "Juliana Castro Â· RH",
    elaborador: "Juliana Castro Â· RH",
    revisor: "Aline Ferreira Â· Processos & Qualidade",
    valueChainId: "chain-gestao-pessoas",
    valueChainName: "GestÃ£o de Pessoas",
    versao: "02",
    status: "Em revisÃ£o",
    updatedAt: "2026-06-18",
    objetivo:
      "Mapear o fluxo de recrutamento e seleÃ§Ã£o, da abertura da vaga Ã  admissÃ£o, reduzindo o tempo de contrataÃ§Ã£o.",
    escopo:
      "Da requisiÃ§Ã£o de pessoal atÃ© a proposta aceita. NÃ£o inclui onboarding, tratado em processo prÃ³prio.",
    estadoAtual:
      "Triagem manual de currÃ­culos e agenda de entrevistas por e-mail, gerando demora e perda de candidatos.",
    kpis: "Tempo mÃ©dio de contrataÃ§Ã£o (time-to-hire); taxa de aceitaÃ§Ã£o de propostas; nÂº de candidatos por vaga.",
    volume: "~12 vagas/mÃªs",
    frequencia: "Conforme demanda das Ã¡reas",
    dores: "Triagem demorada; baixa padronizaÃ§Ã£o de entrevistas; comunicaÃ§Ã£o lenta com candidatos.",
    oportunidades: "ATS para triagem; roteiro de entrevista padrÃ£o; comunicaÃ§Ã£o automatizada.",
    systems: [
      ["Gupy (ATS)", "Recrutamento e seleÃ§Ã£o", "Alta", "PublicaÃ§Ã£o de vagas e triagem de candidatos."],
      ["LinkedIn Recruiter", "Sourcing", "MÃ©dia", "Busca ativa de candidatos."],
      ["Google Workspace", "ColaboraÃ§Ã£o", "MÃ©dia", "Agendamento e comunicaÃ§Ã£o."],
    ],
    steps: [
      ["Abrir requisiÃ§Ã£o de vaga", "Gestor da Ã¡rea", "Necessidade de contrataÃ§Ã£o", "Registrar a vaga com perfil e justificativa.", "Vaga aprovada", "Gupy (ATS)", "Perfil mal definido"],
      ["Divulgar e captar", "Analista de R&S", "Vaga aprovada", "Publicar a vaga e fazer sourcing ativo.", "Pipeline de candidatos", "Gupy / LinkedIn", "Poucos candidatos"],
      ["Triar candidatos", "Analista de R&S", "CurrÃ­culos recebidos", "Avaliar fit tÃ©cnico e cultural.", "Shortlist", "Gupy (ATS)", "Triagem subjetiva"],
      ["Entrevistar", "Gestor da Ã¡rea", "Shortlist", "Conduzir entrevistas conforme roteiro.", "Candidato avaliado", "Google Workspace", "Falta de padronizaÃ§Ã£o"],
      ["Fazer proposta e admitir", "Juliana Castro Â· RH", "Candidato aprovado", "Negociar proposta e iniciar admissÃ£o.", "Colaborador admitido", "Gupy (ATS)", "Recusa de proposta"],
    ],
    sipoc: [
      ["Ãreas requisitantes", "RequisiÃ§Ã£o de pessoal", "Recrutamento e seleÃ§Ã£o", "Profissional contratado", "Ãrea requisitante"],
      ["Fontes de candidatos", "CurrÃ­culos", "Triagem e avaliaÃ§Ã£o", "Shortlist qualificada", "Gestores"],
    ],
    gaps: [
      ["Triagem manual", "CurrÃ­culos avaliados manualmente um a um.", "Demora e perda de talentos", "Configurar filtros e ranking no ATS", "Juliana Castro Â· RH", "2026-07-20", "Alta", "Pendente"],
      ["Entrevistas sem roteiro", "Cada gestor entrevista de forma diferente.", "DecisÃ£o inconsistente", "Criar roteiro e ficha de avaliaÃ§Ã£o padrÃ£o", "Juliana Castro Â· RH", "2026-07-10", "MÃ©dia", "Em andamento"],
    ],
    nextSteps: [
      "Padronizar roteiro de entrevista por nÃ­vel",
      "Automatizar comunicaÃ§Ã£o com candidatos",
      "Validar o mapeamento com o dono do processo",
    ],
    glossary: [
      ["ATS", "Applicant Tracking System â€” sistema de gestÃ£o de candidaturas."],
      ["Time-to-hire", "Tempo entre abertura da vaga e aceite da proposta."],
      ["Sourcing", "Busca ativa de candidatos."],
    ],
  },
  {
    id: "demo-doc:ddp:MAP.FIN.001",
    codigo: "MAP.FIN.001",
    titulo: "Contas a Receber",
    area: "Financeiro & Controladoria",
    donoProcesso: "Bruno Cardoso Â· Financeiro",
    responsavel: "Bruno Cardoso Â· Financeiro",
    elaborador: "Bruno Cardoso Â· Financeiro",
    revisor: "Aline Ferreira Â· Processos & Qualidade",
    valueChainId: "chain-financeiro",
    valueChainName: "GestÃ£o Financeira",
    versao: "04",
    status: "Aprovado",
    updatedAt: "2026-03-19",
    objetivo:
      "Mapear o ciclo de contas a receber, da emissÃ£o da fatura Ã  baixa, melhorando o Ã­ndice de inadimplÃªncia.",
    escopo: "Da emissÃ£o da fatura Ã  conciliaÃ§Ã£o bancÃ¡ria. NÃ£o inclui negociaÃ§Ã£o de crÃ©dito.",
    estadoAtual:
      "CobranÃ§a reativa, sem rÃ©gua definida; conciliaÃ§Ã£o parcialmente manual no fim do mÃªs.",
    kpis: "DSO (prazo mÃ©dio de recebimento); % de inadimplÃªncia; % de conciliaÃ§Ã£o automÃ¡tica.",
    volume: "~800 tÃ­tulos/mÃªs",
    frequencia: "DiÃ¡ria",
    dores: "CobranÃ§a tardia; conciliaÃ§Ã£o manual demorada; falta de visÃ£o de aging.",
    oportunidades: "RÃ©gua de cobranÃ§a automatizada; conciliaÃ§Ã£o via API bancÃ¡ria; painel de aging.",
    systems: [
      ["ERP TOTVS", "Sistema transacional", "Alta", "EmissÃ£o de faturas, baixa e razÃ£o contÃ¡bil."],
      ["Portal BancÃ¡rio / API", "IntegraÃ§Ã£o financeira", "Alta", "RecebÃ­veis e retorno bancÃ¡rio."],
      ["Planilhas de aging", "Controle manual", "MÃ©dia", "Acompanhamento de vencidos (a ser substituÃ­do)."],
    ],
    steps: [
      ["Emitir fatura", "Analista Financeiro", "Pedido faturado", "Gerar a fatura e a nota fiscal.", "Fatura emitida", "ERP TOTVS", "Erro de dados cadastrais"],
      ["Enviar cobranÃ§a", "Analista Financeiro", "Fatura emitida", "Enviar boleto e lembretes ao cliente.", "CobranÃ§a enviada", "ERP TOTVS", "CobranÃ§a tardia"],
      ["Receber pagamento", "Cliente", "Boleto", "Cliente efetua o pagamento.", "Pagamento recebido", "Portal BancÃ¡rio / API", "Pagamento divergente"],
      ["Conciliar", "Analista Financeiro", "Retorno bancÃ¡rio", "Conciliar recebimentos e dar baixa.", "TÃ­tulo baixado", "ERP TOTVS", "ConciliaÃ§Ã£o manual"],
      ["Tratar inadimplÃªncia", "Bruno Cardoso Â· Financeiro", "TÃ­tulos vencidos", "Acionar rÃ©gua de cobranÃ§a e negociaÃ§Ã£o.", "TÃ­tulo regularizado", "ERP TOTVS", "Perda por inadimplÃªncia"],
    ],
    sipoc: [
      ["Ãrea Comercial", "Pedidos faturados", "Faturamento e cobranÃ§a", "Recebimento conciliado", "Tesouraria"],
      ["Bancos", "Retorno bancÃ¡rio", "ConciliaÃ§Ã£o e baixa", "RazÃ£o atualizado", "Controladoria"],
    ],
    gaps: [
      ["CobranÃ§a reativa", "NÃ£o hÃ¡ rÃ©gua de cobranÃ§a automatizada.", "Aumento da inadimplÃªncia", "Implantar rÃ©gua automÃ¡tica por faixa de atraso", "Bruno Cardoso Â· Financeiro", "2026-04-30", "Alta", "ConcluÃ­do"],
      ["ConciliaÃ§Ã£o manual", "ConciliaÃ§Ã£o feita em planilhas no fim do mÃªs.", "Erros e atraso no fechamento", "Integrar conciliaÃ§Ã£o via API bancÃ¡ria", "Bruno Cardoso Â· Financeiro", "2026-05-31", "MÃ©dia", "Em andamento"],
    ],
    nextSteps: [
      "Publicar painel de aging em tempo real",
      "Automatizar a rÃ©gua de cobranÃ§a",
      "Validar o mapeamento com o dono do processo",
    ],
    glossary: [
      ["DSO", "Days Sales Outstanding â€” prazo mÃ©dio de recebimento."],
      ["Aging", "RelatÃ³rio de tÃ­tulos por faixa de vencimento."],
      ["ConciliaÃ§Ã£o", "Confronto entre extrato bancÃ¡rio e tÃ­tulos."],
    ],
  },
  {
    id: "demo-doc:ddp:MAP.COM.001",
    codigo: "MAP.COM.001",
    titulo: "ProspecÃ§Ã£o e GeraÃ§Ã£o de Leads",
    area: "Comercial & Vendas",
    donoProcesso: "Rafael Souza Â· Comercial",
    responsavel: "Rafael Souza Â· Comercial",
    elaborador: "Rafael Souza Â· Comercial",
    revisor: "Aline Ferreira Â· Processos & Qualidade",
    valueChainId: "chain-comercial",
    valueChainName: "ComercializaÃ§Ã£o & Vendas",
    versao: "01",
    status: "Ativo",
    updatedAt: "2026-06-09",
    objetivo:
      "Mapear a geraÃ§Ã£o e qualificaÃ§Ã£o de leads, do primeiro contato Ã  passagem para vendas, aumentando a taxa de conversÃ£o.",
    escopo: "Da captaÃ§Ã£o do lead Ã  qualificaÃ§Ã£o (MQLâ†’SQL). NÃ£o inclui negociaÃ§Ã£o e fechamento.",
    estadoAtual:
      "Leads dispersos entre planilhas e e-mails; qualificaÃ§Ã£o sem critÃ©rio Ãºnico; baixa rastreabilidade.",
    kpis: "Taxa de conversÃ£o leadâ†’SQL; custo por lead; tempo de resposta ao lead.",
    volume: "~400 leads/mÃªs",
    frequencia: "DiÃ¡ria",
    dores: "Leads sem follow-up; qualificaÃ§Ã£o subjetiva; falta de integraÃ§Ã£o marketing-vendas.",
    oportunidades: "CRM Ãºnico; critÃ©rio BANT; automaÃ§Ã£o de nutriÃ§Ã£o.",
    systems: [
      ["HubSpot CRM", "CRM", "Alta", "GestÃ£o de leads, funil e atividades comerciais."],
      ["RD Station", "AutomaÃ§Ã£o de marketing", "MÃ©dia", "CaptaÃ§Ã£o e nutriÃ§Ã£o de leads."],
      ["Planilhas de apoio", "Controle manual", "Baixa", "Controles paralelos (a eliminar)."],
    ],
    steps: [
      ["Captar lead", "Marketing", "Campanhas e formulÃ¡rios", "Capturar o lead e registrar a origem.", "Lead registrado", "RD Station", "Lead duplicado"],
      ["Qualificar (MQL)", "SDR", "Lead registrado", "Avaliar fit com critÃ©rio BANT.", "Lead qualificado (MQL)", "HubSpot CRM", "QualificaÃ§Ã£o subjetiva"],
      ["Abordar e nutrir", "SDR", "MQL", "Realizar abordagem e nutriÃ§Ã£o atÃ© o interesse.", "Lead engajado", "HubSpot CRM", "Falta de follow-up"],
      ["Converter em SQL", "SDR", "Lead engajado", "Confirmar oportunidade e agendar reuniÃ£o.", "SQL gerado", "HubSpot CRM", "Passagem incompleta"],
      ["Passar para vendas", "Rafael Souza Â· Comercial", "SQL gerado", "Repassar o SQL ao executivo de vendas.", "Oportunidade no funil", "HubSpot CRM", "Perda na passagem"],
    ],
    sipoc: [
      ["Marketing", "Leads captados", "QualificaÃ§Ã£o de leads", "SQL qualificado", "Time de Vendas"],
      ["Canais digitais", "Dados de contato", "NutriÃ§Ã£o e abordagem", "Lead engajado", "SDRs"],
    ],
    gaps: [
      ["Sem critÃ©rio Ãºnico", "QualificaÃ§Ã£o varia entre SDRs.", "ConversÃ£o baixa e inconsistente", "Adotar critÃ©rio BANT padronizado", "Rafael Souza Â· Comercial", "2026-07-15", "Alta", "Pendente"],
      ["Follow-up manual", "Acompanhamento depende de memÃ³ria do SDR.", "Leads esfriam", "Automatizar cadÃªncia de follow-up no CRM", "Rafael Souza Â· Comercial", "2026-07-05", "MÃ©dia", "Pendente"],
    ],
    nextSteps: [
      "Unificar a base de leads no CRM",
      "Definir SLA de resposta ao lead",
      "Validar o mapeamento com o dono do processo",
    ],
    glossary: [
      ["MQL", "Marketing Qualified Lead â€” lead qualificado pelo marketing."],
      ["SQL", "Sales Qualified Lead â€” lead qualificado para vendas."],
      ["BANT", "Budget, Authority, Need, Timing â€” critÃ©rio de qualificaÃ§Ã£o."],
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
    titulo: "AdmissÃ£o de Colaborador",
    area: "Recursos Humanos",
    processo: "Recrutamento e SeleÃ§Ã£o",
    responsavel: "Juliana Castro Â· RH",
    elaboracao: "Juliana Castro Â· RH",
    aprovacao: "Aline Ferreira Â· Processos & Qualidade",
    versao: "02",
    status: "Aprovado",
    updatedAt: "2026-05-04",
    objetivo: "Padronizar a admissÃ£o de novos colaboradores, garantindo conformidade e prazo.",
    abrangencia: "Aplica-se a todas as admissÃµes CLT da organizaÃ§Ã£o.",
    sections: [
      ["1. PrÃ©-requisitos", "Documentos e aprovaÃ§Ãµes necessÃ¡rias", "Proposta aceita, documentos pessoais do candidato e exame admissional agendado."],
      ["2. Registro e contrato", "Cadastro e formalizaÃ§Ã£o", "Cadastrar o colaborador no sistema de folha, gerar e colher assinatura do contrato e anexos."],
      ["3. IntegraÃ§Ã£o inicial", "Acessos e boas-vindas", "Solicitar acessos a TI, preparar estaÃ§Ã£o de trabalho e agendar o onboarding."],
    ],
    responsibilities: [
      ["RH", "Conduzir a admissÃ£o e validar a documentaÃ§Ã£o."],
      ["TI", "Provisionar acessos e equipamentos."],
      ["Gestor", "Receber e integrar o novo colaborador."],
    ],
  },
  {
    id: "demo-doc:pop:IT.TI.001",
    tipo: "IT",
    codigo: "IT.TI.001",
    titulo: "ConcessÃ£o de Acessos",
    area: "Tecnologia da InformaÃ§Ã£o",
    processo: "GestÃ£o de SeguranÃ§a da InformaÃ§Ã£o",
    responsavel: "Carlos Menezes Â· TI",
    elaboracao: "Carlos Menezes Â· TI",
    aprovacao: "Carlos Menezes Â· TI",
    versao: "01",
    status: "Aprovado",
    updatedAt: "2026-05-22",
    objetivo: "Definir as regras para concessÃ£o, revisÃ£o e revogaÃ§Ã£o de acessos a sistemas.",
    abrangencia: "Aplica-se a todos os sistemas corporativos e usuÃ¡rios internos.",
    sections: [
      ["1. SolicitaÃ§Ã£o", "Abertura do pedido", "Gestor solicita o acesso via chamado, informando sistema, perfil e justificativa."],
      ["2. AprovaÃ§Ã£o e provisionamento", "AnÃ¡lise e liberaÃ§Ã£o", "TI valida o perfil mÃ­nimo necessÃ¡rio, aprova e provisiona o acesso registrando evidÃªncia."],
      ["3. RevisÃ£o periÃ³dica", "RecertificaÃ§Ã£o", "Revisar trimestralmente os acessos ativos e revogar os desnecessÃ¡rios."],
    ],
    responsibilities: [
      ["Gestor solicitante", "Justificar a necessidade do acesso."],
      ["TI / SeguranÃ§a", "Conceder o acesso mÃ­nimo necessÃ¡rio e registrar."],
    ],
  },
  {
    id: "demo-doc:pop:POP.FIN.001",
    tipo: "POP",
    codigo: "POP.FIN.001",
    titulo: "ConciliaÃ§Ã£o BancÃ¡ria",
    area: "Financeiro & Controladoria",
    processo: "Contas a Receber",
    responsavel: "Bruno Cardoso Â· Financeiro",
    elaboracao: "Bruno Cardoso Â· Financeiro",
    aprovacao: "Aline Ferreira Â· Processos & Qualidade",
    versao: "03",
    status: "Ativo",
    updatedAt: "2026-04-30",
    objetivo: "Padronizar a conciliaÃ§Ã£o entre extratos bancÃ¡rios e tÃ­tulos no ERP.",
    abrangencia: "Aplica-se a todas as contas correntes da organizaÃ§Ã£o.",
    sections: [
      ["1. Importar retorno bancÃ¡rio", "Coleta dos dados", "Baixar o arquivo de retorno e importar no ERP."],
      ["2. Conciliar movimentos", "Confronto", "Confrontar recebimentos com tÃ­tulos em aberto e dar baixa nos correspondentes."],
      ["3. Tratar divergÃªncias", "ExceÃ§Ãµes", "Investigar divergÃªncias, registrar ajustes e escalar quando necessÃ¡rio."],
    ],
    responsibilities: [
      ["Analista Financeiro", "Executar a conciliaÃ§Ã£o diÃ¡ria."],
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
  if (normalized.includes("conclu")) return "ConcluÃ­da";
  return "Pendente";
}

function normalizeCausePriority(value: unknown) {
  const normalized = normalizeLabel(String(value ?? ""));
  if (normalized.includes("critic")) return "CrÃ­tica";
  if (normalized.includes("alta")) return "Alta";
  if (normalized.includes("baixa")) return "Baixa";
  return "MÃ©dia";
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

function normalizeDdpSubsteps(values: unknown[] | undefined) {
  return (values ?? []).map((value, index) => {
    const row = asObject(value);
    return {
      id: textAt(row, "id") || id("substep"),
      processId: textAt(row, "processId"),
      processVersion: Number(textAt(row, "processVersion") || 1),
      codigo: textAt(row, "codigo") || String(index + 1).padStart(2, "0"),
      titulo: textAt(row, "titulo") || textAt(row, "title") || `Subetapa ${index + 1}`,
      descricao: textAt(row, "descricao") || textAt(row, "desc") || textAt(row, "text"),
      images: normalizeImages(
        arrayAt(row, "images").length ? arrayAt(row, "images") : arrayAt(row, "imagens"),
        "subimg",
      ),
    };
  });
}

function normalizeDdp(input: Partial<DdpState> | undefined, fallback: DdpState): DdpState {
  const legacySipoc = input?.sipoc;
  return {
    ...fallback,
    ...input,
    meta: { ...fallback.meta, ...(input?.meta ?? {}) },
    overview: { ...fallback.overview, ...(input?.overview ?? {}) },
    systems: (input?.systems ?? fallback.systems).map((system) => {
      const legacy = system as Partial<DdpSystem> & Partial<TextItem>;
      return {
        id: legacy.id || id("sys"),
        nome: legacy.nome || legacy.text || "",
        tipo: legacy.tipo || "",
        dono: legacy.dono || "",
        criticidade: legacy.criticidade || "MÃ©dia",
        descricao: legacy.descricao || "",
      };
    }),
    macroprocess: {
      ...fallback.macroprocess,
      ...(input?.macroprocess ?? {}),
      processId: textAt(asObject(input?.macroprocess ?? {}), "processId"),
      processVersion: Number(textAt(asObject(input?.macroprocess ?? {}), "processVersion") || 1),
    },
    steps: (input?.steps ?? fallback.steps).map((step) => {
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
      input?.sipocRows && input.sipocRows.length
        ? input.sipocRows.map((row) => ({ ...row, id: row.id || id("sipoc") }))
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
    gaps: (input?.gaps ?? fallback.gaps).map((gap) => {
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
        prioridade: normalizeCausePriority(legacy.prioridade || "MÃ©dia"),
        status: normalizeCauseStatus(legacy.status),
        comentarios: normalizeCauseComments(
          legacy.comentarios ?? legacy.comments ?? legacy.comentario ?? legacy.observacoes,
        ),
      };
    }),
    nextSteps: (input?.nextSteps ?? fallback.nextSteps).map(asNextStepItem),
    glossary: (input?.glossary ?? fallback.glossary).map((item) => {
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

function normalizePop(input: Partial<PopState> | undefined, fallback: PopState): PopState {
  const normalizeClauses = (items: unknown[] | undefined, fallbackText = ""): PopProcedureClause[] => {
    const source = Array.isArray(items) ? items : [];
    if (!source.length && fallbackText.trim()) {
      return [{ id: id("clause"), letter: "a", text: fallbackText, alert: "", images: [] }];
    }
    return source.map((item, index) => {
      const row = (item && typeof item === "object" ? item : {}) as Partial<PopProcedureClause>;
      return {
        id: row.id || id("clause"),
        letter: row.letter || String.fromCharCode(97 + index),
        text: row.text || "",
        alert: row.alert || "",
        images: normalizeImages(row.images, "popclauseimg"),
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
    sections: (input?.sections ?? fallback.sections).map((section, index) => {
      const code = section.code || `3.${index + 1}`;
      return {
        id: section.id || id("sec"),
        code,
        title: section.title || `${code} Novo item`,
        description: section.description || "",
        body: section.body || "",
        records: section.records || "",
        risks: section.risks || "",
        images: normalizeImages(section.images, "popimg"),
        subitems: normalizeSubitems(section.subitems, code, section.body || section.description || ""),
      };
    }),
    responsibilities: (input?.responsibilities ?? fallback.responsibilities).map((item) => {
      const legacy = item as Partial<ResponsibilityItem> & Partial<TextItem>;
      return {
        id: legacy.id || id("resp"),
        area: legacy.area || "",
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
  return "MÃ©dia";
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
      criticidade: textAt(row, "badgeType") || "MÃ©dia",
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
    reader.onerror = () => reject(reader.error ?? new Error("NÃ£o foi possÃ­vel ler a imagem."));
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
type ExportSystem = { name: string; type: string; description: string; items: string[] };
type ExportFlowStep = {
  title: string;
  description: string;
  owner: string;
  system: string;
  risk: string;
  images: ExportImage[];
  substeps: Array<{ code: string; title: string; description: string; images: ExportImage[] }>;
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
  items: Array<{ text: string; note: string; images: ExportImage[] }>;
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
  organization_id?: string;
  created_at?: string;
  updated_at?: string;
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
  category: "primary" | "support" | "management";
  description: string | null;
  status: string;
  organization_id?: string;
};
type OrganizationSystem = { id: string; name: string; description: string };
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

function getDdpExportModel(data: DdpState) {
  const legacy = data.legacy ?? {};
  const overviewCards: ExportCard[] = [
    { title: "Objetivo", text: data.overview.objetivo },
    { title: "Escopo", text: data.overview.escopo },
    { title: "Contexto", text: data.overview.kpis },
  ].filter((item) => item.text);

  const systems: ExportSystem[] = data.systems.map((system) => ({
    name: system.nome,
    type: system.tipo || system.criticidade,
    description: system.descricao,
    items: splitText(system.descricao),
  }));

  const flowSteps: ExportFlowStep[] = data.steps.map((step) => ({
        title: step.etapa,
        description: "",
        owner: "",
        system: "",
        risk: "",
        images: step.images.map((image) => ({
          title: image.titulo,
          caption: image.legenda,
          src: image.src,
        })),
        substeps: step.substeps.length
          ? step.substeps.map((substep) => ({
              code: substep.codigo,
              title: substep.titulo,
              description: substep.descricao,
              images: substep.images.map((image) => ({
                title: image.titulo,
                caption: image.legenda,
                src: image.src,
              })),
            }))
          : [],
      }));

  const gaps: ExportGap[] = data.gaps.map((gap) => ({
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

  const nextSteps: ExportNextStep[] = data.nextSteps.map((item) => ({
        title: plain(item.text),
        description: "",
        owner: item.responsavel || "",
        due: item.prazo || "",
      }));

  const currentMacro = data.macroprocess;

  return {
    meta: data.meta,
    // Ãrea e Dono do documento vÃªm do processo vinculado (preenchido no cadastro).
    processName: textAt(legacy, "processName") || currentMacro.titulo,
    processCode: textAt(legacy, "processCode"),
    valueChainName:
      textAt(legacy, "processValueChainName") || data.meta.valueChainName || data.meta.valueChainId,
    area: textAt(legacy, "processArea") || data.meta.area,
    owner: textAt(legacy, "processOwner") || data.meta.responsavel,
    description: data.overview.objetivo,
    scope: data.overview.escopo,
    overview: data.overview.estadoAtual,
    stats: [],
    cards: overviewCards,
    systems,
    macroprocess: {
      title: currentMacro.titulo,
      caption: currentMacro.legenda,
      src: currentMacro.src,
    },
    flowSteps,
    sipocRows: data.sipocRows,
    gaps,
    nextSteps,
    images: [],
    glossary: data.glossary,
  };
}

function getPopExportModel(data: PopState) {
  const sections: ExportPopSection[] = data.sections.map((section) => {
    const nestedItems =
      section.subitems?.flatMap((subitem) => [
        {
          text: `${subitem.code} ${subitem.title}`.trim(),
          note: "",
          images: [],
        },
        ...subitem.clauses.map((clause) => ({
          text: `${clause.letter}) ${clause.text}`.trim(),
          note: clause.alert,
          images: clause.images.map((image) => ({
            title: image.titulo,
            caption: image.legenda,
            src: image.src,
          })),
        })),
      ]) ?? [];
    const legacyItems = [
      ...splitText(section.body || section.records || section.risks).map((line) => ({
        text: line,
        note: "",
        images: [],
      })),
      ...(section.images.length
        ? [
            {
              text: "Imagens e evidÃªncias",
              note: "",
              images: section.images.map((image) => ({
                title: image.titulo,
                caption: image.legenda,
                src: image.src,
              })),
            },
          ]
        : []),
    ];
    return {
        title: section.title,
        description: section.description,
        items: nestedItems.length ? nestedItems : legacyItems,
      };
  });

  return {
    meta: data.meta,
    typeLabel:
      data.meta.tipo === "Norma"
        ? "Norma"
        : data.meta.tipo === "IT"
          ? "InstruÃ§Ã£o de Trabalho - IT"
          : "Procedimento Operacional PadrÃ£o - POP",
    contentTitle:
      data.meta.tipo === "Norma"
        ? "Diretrizes"
        : data.meta.tipo === "IT"
          ? "InstruÃ§Ã£o de Trabalho"
          : "Procedimento Operacional",
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
        ["nome", "tipo", "dono", "criticidade", "descricao"],
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
      name: "Subetapas Fluxo",
      rows: [
        ["etapa", "codigo", "titulo", "descricao"],
        ...data.steps.flatMap((step, index) =>
          step.substeps.map((substep) => [
            String(index + 1),
            substep.codigo,
            substep.titulo,
            substep.descricao,
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
        ...data.responsibilities.map((item) => [item.area, item.cargo ?? "", item.responsabilidade]),
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
    tipo: rowValue(row, "tipo"),
    dono: rowValue(row, "dono"),
    criticidade: rowValue(row, "criticidade", "MÃ©dia"),
    descricao: rowValue(row, "descricao"),
  }));
  const substepRows = rowObjects(sheetRows(sheets, "Subetapas Fluxo"));
  const steps = rowObjects(sheetRows(sheets, "Fluxo AS IS")).map((row, index) => ({
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
    substeps: substepRows
      .filter((substep) => {
        const stepRef = rowValue(substep, "etapa");
        return (
          stepRef === String(index + 1) ||
          normalizeLabel(stepRef) === normalizeLabel(rowValue(row, "etapa"))
        );
      })
      .map((substep, subIndex) => ({
        id: current.steps[index]?.substeps[subIndex]?.id || id("substep"),
        codigo: rowValue(substep, "codigo") || `${index + 1}.${subIndex + 1}`,
        titulo: rowValue(substep, "titulo"),
        descricao: rowValue(substep, "descricao"),
        images: current.steps[index]?.substeps[subIndex]?.images ?? [],
      })),
  }));

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
        prioridade: normalizeCausePriority(rowValue(row, "prioridade", "MÃ©dia")),
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
        title: rowValue(row, "title", "Nova seÃ§Ã£o"),
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
      "PÃ¡g ",
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
    sectionTitle,
    subTitle,
    tocLine,
    sectionBreak,
    imageParagraph,
    finish,
  };
}

function buildDdpDocx(data: DdpState, brand?: OrganizationBrand) {
  const model = getDdpExportModel(data);
  const title = plain(model.meta.titulo).replace(/^Processo\s+de\s+/i, "") || "Mapeamento";
  const doc = createDocxContext({
    code: model.meta.codigo,
    title,
    footerLeft: `${formatDateBr(model.meta.dataRelatorio || model.meta.data)} - por ${model.meta.elaborador || "BF Flow"}`,
    brand,
  });
  const parts: string[] = [];

  parts.push(doc.sectionTitle("01 Dados do Mapeamento"));
  parts.push(
    doc.table(
      [
        [
          { xml: doc.labelValue("CÃ³digo do mapeamento", model.meta.codigo) },
          { xml: doc.labelValue("TÃ­tulo do mapeamento", model.meta.titulo), gridSpan: 2 },
          { xml: doc.labelValue("Modalidade", model.meta.modalidade) },
        ],
        [
          { xml: doc.labelValue("Tipo", "RelatÃ³rio de Mapeamento de Processo"), fill: doc.C.gray50 },
          { xml: doc.labelValue("Status", model.meta.status || "Em andamento"), fill: doc.C.gray50 },
          { xml: doc.labelValue("Data", formatDateBr(model.meta.dataRelatorio || model.meta.data)), fill: doc.C.gray50 },
          { xml: doc.labelValue("Sistema", "BF Flow"), fill: doc.C.gray50 },
        ],
        [
          { xml: doc.labelValue("Processo", model.processName || "-"), gridSpan: 2 },
          { xml: doc.labelValue("CÃ³digo do processo", model.processCode || "-") },
          { xml: doc.labelValue("Cadeia de valor", model.valueChainName || "-") },
        ],
        [
          { xml: doc.labelValue("Dono", model.owner || "-"), fill: doc.C.gray50 },
          { xml: doc.labelValue("Ãrea", model.area || "-"), fill: doc.C.gray50 },
          { xml: doc.labelValue("Elaborador", model.meta.elaborador || "-"), fill: doc.C.gray50 },
          { xml: doc.labelValue("Revisor", model.meta.revisor || "-"), fill: doc.C.gray50 },
        ],
      ],
      [2576, 2576, 2576, 2578],
      { full: true },
    ),
  );
  parts.push(doc.sectionTitle("Ãndice"));
  [
    ["01", "Dados do Mapeamento"],
    ["02", "VisÃ£o Geral"],
    ["03", "Sistemas Envolvidos"],
    ["04", "AnÃ¡lise SIPOC"],
    ["05", "Fluxo AS IS"],
    ["06", "Gaps e Causas-Raiz"],
    ["07", "PrÃ³ximos Passos"],
    ["08", "GlossÃ¡rio"],
  ].forEach(([num, label]) => parts.push(doc.tocLine(num, label)));
  parts.push(doc.sectionBreak());

  parts.push(doc.sectionTitle("02 VisÃ£o Geral"));
  if (model.overview) parts.push(doc.p(model.overview, { align: "both", line: 1.05 }));
  model.cards.forEach((card) => {
    parts.push(doc.subTitle(card.title || "Item"));
    parts.push(doc.p(card.text, { align: "both", line: 1.05 }));
  });

  parts.push(doc.sectionTitle("03 Sistemas Envolvidos"));
  parts.push(
    model.systems.length
      ? doc.table(
          [
            [
              doc.headerCell("Sistema"),
              doc.headerCell("DescriÃ§Ã£o / uso no processo"),
            ],
            ...model.systems.map((system) => [
              doc.bodyCell(system.name),
              doc.bodyCell(system.items.join("; ") || system.description),
            ]),
          ],
          [3000, 7306],
          { full: true },
        )
      : doc.p("Nenhum sistema cadastrado."),
  );

  parts.push(doc.sectionTitle("04 AnÃ¡lise SIPOC do Processo"));
  parts.push(
    model.sipocRows.length
      ? doc.table(
          [
            [
              doc.headerCell("Fornecedores"),
              doc.headerCell("Entradas"),
              doc.headerCell("Processo"),
              doc.headerCell("SaÃ­das"),
              doc.headerCell("Clientes"),
            ],
            ...model.sipocRows.map((row) => [
              doc.bodyCell(row.fornecedores),
              doc.bodyCell(row.entradas),
              doc.bodyCell(row.processo),
              doc.bodyCell(row.saidas),
              doc.bodyCell(row.clientes),
            ]),
          ],
          [2000, 2000, 2100, 2000, 2206],
          { full: true },
        )
      : doc.p("Nenhuma linha SIPOC cadastrada."),
  );

  parts.push(doc.sectionTitle("05 Fluxo AS IS - Etapas do Processo"));
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
    parts.push(doc.subTitle(`${String(index + 1).padStart(2, "0")} â€” ${step.title || "Etapa"}`));
    parts.push(doc.p(step.description, { align: "both", line: 1.05 }));
    if (step.owner || step.system || step.risk) {
      parts.push(
        doc.table(
          [
            [
              doc.headerCell("ResponsÃ¡vel"),
              doc.headerCell("Sistema"),
              doc.headerCell("Risco / ObservaÃ§Ã£o"),
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
            [doc.headerCell("ID"), doc.headerCell("Atividade"), doc.headerCell("DescriÃ§Ã£o")],
            ...step.substeps.map((substep) => [
              doc.bodyCell(substep.code),
              doc.bodyCell(substep.title),
              doc.bodyCell(substep.description),
            ]),
          ],
          [1000, 3100, 6206],
          { full: true },
        ),
      );
      step.substeps.forEach((substep) =>
        substep.images.forEach((image) => {
          if (!image.src) return;
          parts.push(doc.imageParagraph(image.src, image.title));
          if (image.caption)
            parts.push(doc.p(image.caption, { size: 8.5, color: doc.C.gray500, align: "center" }));
        }),
      );
    }
  });

  parts.push(doc.sectionTitle("06 Causas-Raiz e Planos de AÃ§Ã£o"));
  model.gaps.forEach((gap, index) => {
    parts.push(
      doc.table(
        [
          [
            {
              xml: doc.p(`${String(index + 1).padStart(2, "0")} â€” ${gap.title || "Causa-raiz"}`, {
                size: 11.5,
                bold: true,
                caps: true,
                color: doc.C.white,
                after: 0,
              }),
              fill: doc.C.gray700,
              gridSpan: 3,
            },
          ],
          [
            doc.bodyCell(`Prioridade: ${gap.priority || "-"}`),
            doc.bodyCell(`ResponsÃ¡vel: ${gap.owner || "-"}`),
            doc.bodyCell(`Prazo: ${formatGapDateRangeBr(gap.due) || "-"}`),
          ],
          [{ xml: doc.mixedP("Status: ", gap.status || "-", { size: 9 }), gridSpan: 3 }],
          [{ xml: doc.mixedP("DescriÃ§Ã£o: ", gap.description || "-", { size: 9 }), gridSpan: 3 }],
          [{ xml: doc.mixedP("Impacto esperado: ", gap.impact || "-", { size: 9 }), gridSpan: 3 }],
          [{ xml: doc.mixedP("AÃ§Ã£o proposta: ", gap.action || "-", { size: 9 }), gridSpan: 3 }],
          ...(gap.comments.length
            ? [
                [
                  {
                    xml: doc.mixedP(
                      "ComentÃ¡rios: ",
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
  if (!model.gaps.length) parts.push(doc.p("Nenhuma causa-raiz cadastrada."));

  parts.push(doc.sectionTitle("07 PrÃ³ximos Passos"));
  parts.push(
    model.nextSteps.length
      ? doc.table(
          [
            [
              doc.headerCell("AÃ§Ã£o"),
              doc.headerCell("ResponsÃ¡vel"),
              doc.headerCell("Prazo"),
            ],
            ...model.nextSteps.map((step) => [
              doc.bodyCell(step.title),
              doc.bodyCell(step.owner || "-"),
              doc.bodyCell(formatDateBr(step.due) || "-"),
            ]),
          ],
          [6800, 1900, 1606],
          { full: true },
        )
      : doc.p("Nenhum prÃ³ximo passo cadastrado."),
  );

  parts.push(doc.pageBreak());
  parts.push(doc.sectionTitle("08 GlossÃ¡rio"));
  parts.push(
    model.glossary.length
      ? doc.table(
          [
            [doc.headerCell("Termo"), doc.headerCell("DefiniÃ§Ã£o")],
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
          { xml: doc.labelValue("CÃ³digo", model.meta.codigo) },
          { xml: doc.labelValue("VigÃªncia", formatDateBr(model.meta.vigencia)) },
          { xml: doc.labelValue("VersÃ£o", model.meta.versao) },
        ],
        [
          {
            xml: doc.labelValue("PÃºblico / ClassificaÃ§Ã£o", model.meta.publico),
            fill: doc.C.gray50,
          },
          { xml: doc.labelValue("Ãrea responsÃ¡vel", model.meta.area), fill: doc.C.gray50 },
          { xml: doc.labelValue("Processo relacionado", model.meta.processo), fill: doc.C.gray50 },
          { xml: doc.labelValue("PublicaÃ§Ã£o", formatDateBr(model.meta.publicacao)), fill: doc.C.gray50 },
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
  parts.push(doc.sectionTitle("Ãndice"));
  [
    ["01", "Objetivo"],
    ["02", "AbrangÃªncia"],
    ["03", model.contentTitle],
    ["04", "Responsabilidades"],
    ["05", "ReferÃªncias Normativas"],
    ["06", "HistÃ³rico e Controle de AlteraÃ§Ãµes"],
  ].forEach(([num, label]) => parts.push(doc.tocLine(num, label)));
  parts.push(doc.sectionBreak());

  parts.push(doc.sectionTitle("01 Objetivo"));
  parts.push(
    doc.p(model.purpose.objetivo || "Objetivo nÃ£o informado.", { align: "both", line: 1.05 }),
  );
  parts.push(doc.sectionTitle("02 AbrangÃªncia"));
  parts.push(
    doc.p(model.purpose.abrangencia || "AbrangÃªncia nÃ£o informada.", {
      align: "both",
      line: 1.05,
    }),
  );
  if (model.purpose.premissas) {
    parts.push(doc.subTitle("Premissas e Regras Gerais"));
    splitText(model.purpose.premissas).forEach((line) =>
      parts.push(doc.p(`â€¢ ${line}`, { left: 360 })),
    );
  }

  parts.push(doc.sectionTitle(`03 ${model.contentTitle}`));
  model.sections.forEach((section, sectionIndex) => {
    parts.push(doc.subTitle(`3.${sectionIndex + 1} - ${section.title || "SeÃ§Ã£o"}`));
    if (section.description) parts.push(doc.p(section.description, { align: "both", line: 1.05 }));
    section.items.forEach((item, itemIndex) => {
      parts.push(doc.mixedP(`${String.fromCharCode(97 + itemIndex)}) `, item.text));
      if (item.note)
        parts.push(
          doc.p(`ObservaÃ§Ã£o: ${item.note}`, { size: 9.5, color: doc.C.gray500, left: 360 }),
        );
      item.images.forEach((image, imageIndex) => {
        if (!image.src) return;
        parts.push(
          doc.imageParagraph(image.src, image.title || `Figura ${imageIndex + 1}`, 6.5, 4.2),
        );
        parts.push(
          doc.p(
            `Figura ${imageIndex + 1} - ${image.caption || image.title || "Imagem do documento"}`,
            {
              size: 8.5,
              align: "center",
              color: doc.C.gray500,
            },
          ),
        );
      });
    });
  });
  if (!model.sections.length) parts.push(doc.p("Nenhuma seÃ§Ã£o preenchida."));
  if (model.purpose.importante) {
    parts.push(doc.subTitle("Importante"));
    splitText(model.purpose.importante).forEach((line) =>
      parts.push(doc.p(`â€¢ ${line}`, { left: 360 })),
    );
  }

  parts.push(doc.sectionTitle("04 Responsabilidades"));
  parts.push(
    model.responsibilities.length
      ? doc.table(
          [
            [doc.headerCell("Ãrea"), doc.headerCell("Cargo"), doc.headerCell("Responsabilidades")],
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

  parts.push(doc.sectionTitle("05 ReferÃªncias Normativas"));
  parts.push(
    model.references.length
      ? doc.table(
          [
            [doc.headerCell("CÃ³digo"), doc.headerCell("TÃ­tulo"), doc.headerCell("Aplicabilidade")],
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

  parts.push(doc.sectionTitle("06 HistÃ³rico e Controle de AlteraÃ§Ãµes"));
  parts.push(doc.subTitle("HistÃ³rico"));
  parts.push(
    doc.table(
      [
        [
          doc.headerCell("CÃ³digo"),
          doc.headerCell("VersÃ£o"),
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
  parts.push(doc.subTitle("Controle de AlteraÃ§Ãµes"));
  parts.push(
    doc.table(
      [
        [doc.headerCell("VersÃ£o"), doc.headerCell("Local da RevisÃ£o"), doc.headerCell("DescriÃ§Ã£o")],
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
// VisualizaÃ§Ã£o somente-leitura genÃ©rica de um registro da consulta, a partir
// dos metadados da linha. Usada para registros de demonstraÃ§Ã£o e para a
// prÃ©-visualizaÃ§Ã£o amigÃ¡vel de DocumentaÃ§Ã£o/Fluxograma.
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
    ["CÃ³digo", row.code],
    [moduleId === "ddp" ? "TÃ­tulo do mapeamento" : "Nome", row.name],
    [processLabel, moduleId === "pop" ? row.type : row.process],
    ["Ãrea", row.area],
    ...(moduleId === "ddp" ? ([["Dono do processo", row.owner]] as Array<[string, string]>) : []),
    [moduleId === "ddp" ? "Elaborador" : "ResponsÃ¡vel", row.responsible],
    ["Status", row.status],
    ["Ãšltima atualizaÃ§Ã£o", formatDateTimeBr(row.updatedAt)],
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
<div class="head"><div class="kicker">${html(label)} Â· VisualizaÃ§Ã£o</div><h1>${html(row.name)}</h1><span class="badge">${html(row.status)}</span></div>
<div class="card">${rows}</div>
<p class="note">VisualizaÃ§Ã£o somente-leitura â€” as informaÃ§Ãµes nÃ£o podem ser editadas nesta tela. Para alterar, use a opÃ§Ã£o â€œEditarâ€ na consulta de registros.</p>
</div></body></html>`;
}

// VisualizaÃ§Ã£o somente-leitura de DocumentaÃ§Ã£o (POP/IT) com o conteÃºdo do
// formulÃ¡rio, seguindo a identidade visual do sistema.
function buildPopPreviewHtml(pop: PopState, brand?: OrganizationBrand) {
  const accent = docxColor(brand?.word_header_color, "1D1F23");
  const meta: Array<[string, string]> = [
    ["CÃ³digo", pop.meta.codigo],
    ["Tipo", pop.meta.tipo],
    ["Ãrea", pop.meta.area],
    ["Processo", pop.meta.processo],
    ["VersÃ£o", pop.meta.versao],
    ["ElaboraÃ§Ã£o", pop.meta.elaboracao],
    ["AprovaÃ§Ã£o", pop.meta.aprovacao],
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
    .map((r) => `<tr><td>${html(r.area)}</td><td>${html(r.cargo || "-")}</td><td>${html(r.responsabilidade)}</td></tr>`)
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
<div class="head"><div class="kicker">DocumentaÃ§Ã£o Â· VisualizaÃ§Ã£o</div><h1>${html(pop.meta.titulo)}</h1><div class="meta">${meta}</div></div>
${pop.purpose.objetivo || pop.purpose.abrangencia ? `<div class="card"><h2>Objetivo e abrangÃªncia</h2>${pop.purpose.objetivo ? `<p>${html(pop.purpose.objetivo)}</p>` : ""}${pop.purpose.abrangencia ? `<p class="note">${html(pop.purpose.abrangencia)}</p>` : ""}</div>` : ""}
<div class="card"><h2>Procedimento</h2>${sections}</div>
${resp ? `<div class="card"><h2>Responsabilidades</h2><table><thead><tr><th>Ãrea</th><th>Cargo</th><th>Responsabilidade</th></tr></thead><tbody>${resp}</tbody></table></div>` : ""}
<p class="note">VisualizaÃ§Ã£o somente-leitura â€” para alterar, use â€œEditarâ€ na consulta de registros.</p>
</div></body></html>`;
}

function buildDdpPresentationHtml(data: DdpState, brand?: OrganizationBrand) {
  const model = getDdpExportModel(data);
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
  const description = model.description || data.overview.objetivo;
  const nav = [
    ["capa", "01 Capa"],
    ["visao", "02 VisÃ£o geral"],
    ["sistemas", "03 Sistemas envolvidos"],
    ["sipoc", "04 SIPOC"],
    ["fluxo", "05 Fluxo AS IS"],
    ["gaps", "06 Gaps e causas-raiz"],
    ["proximos", "07 PrÃ³ximos passos"],
    ["glossario", "08 GlossÃ¡rio"],
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

  const overviewIcon = (type: "target" | "scope" | "metrics") => {
    const icons = {
      target:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>',
      scope:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4z"/><path d="M8 9h8"/><path d="M8 13h5"/><path d="M6 3v4M18 3v4"/></svg>',
      metrics:
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 16v-4"/><path d="M12 16V8"/><path d="M16 16v-6"/><path d="M7 9l4-3 4 2 4-5"/></svg>',
    };
    return icons[type];
  };

  const emptyBlock = (text = "Sem informaÃ§Ã£o preenchida.") =>
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
        )}" data-title="${html(image.title || "Imagem")}" onclick="openImageZoom(this)"/></figure>`
      : "";

  const systemCards = model.systems.length
    ? model.systems
        .map(
          (system, index) =>
            `<article class="list-card"><div class="index">${String(index + 1).padStart(
              2,
              "0",
            )}</div><h3>${html(system.name || "Sistema")}</h3>${
              system.type ? `<p class="muted-line">${html(system.type)}</p>` : ""
            }${system.description ? `<p>${html(system.description)}</p>` : ""}${
              system.items?.length
                ? `<ul>${system.items.map((item) => `<li>${html(item)}</li>`).join("")}</ul>`
                : ""
            }</article>`,
        )
        .join("")
    : emptyBlock("Nenhum sistema informado.");

  const flowSteps = model.flowSteps.length
    ? model.flowSteps
        .map(
          (step, index) =>
            `<article class="flow-card"><div class="index">${String(index + 1).padStart(
              2,
              "0",
            )}</div><div class="flow-content"><h3>${html(step.title || "Etapa")}</h3>${
              step.owner || step.system || step.risk
                ? `<div class="mini-grid">${fieldGrid([
                    ["ResponsÃ¡vel", step.owner],
                    ["Sistema", step.system],
                    ["Risco", step.risk],
                  ])}</div>`
                : ""
            }${step.description ? `<p>${html(step.description)}</p>` : ""}${step.images
              .map(zoomImage)
              .join("")}${step.substeps
              .map(
                (substep) =>
                  `<div class="substep"><h4>${html(
                    joinClean([substep.code, substep.title], " - ") || "Subetapa",
                  )}</h4>${substep.description ? `<p>${html(substep.description)}</p>` : ""}${substep.images
                    .map(zoomImage)
                    .join("")}</div>`,
              )
              .join("")}</div></article>`,
        )
        .join("")
    : emptyBlock("Nenhuma etapa informada.");

  const sipocRows = model.sipocRows.length
    ? `<div class="table-wrap"><table><thead><tr><th>Fornecedores</th><th>Entradas</th><th>Processo</th><th>SaÃ­das</th><th>Clientes</th></tr></thead><tbody>${model.sipocRows
        .map(
          (row) =>
            `<tr><td>${html(row.fornecedores)}</td><td>${html(row.entradas)}</td><td>${html(
              row.processo,
            )}</td><td>${html(row.saidas)}</td><td>${html(row.clientes)}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : emptyBlock("Nenhuma linha SIPOC informada.");

  const gapTable = model.gaps.length
    ? `<div class="table-wrap gap-table"><table><thead><tr><th>Causa-raiz</th><th>DescriÃ§Ã£o</th><th>Impacto</th><th>AÃ§Ã£o proposta</th><th>ResponsÃ¡vel</th><th>Prazo</th><th>Prioridade</th><th>Status</th></tr></thead><tbody>${model.gaps
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
            )}</div><h3>${html(step.title || "PrÃ³ximo passo")}</h3>${
              step.description ? `<p>${html(step.description)}</p>` : ""
            }${fieldGrid([
              ["ResponsÃ¡vel", step.owner],
              ["Prazo", formatDateBr(step.due)],
            ])}</article>`,
        )
        .join("")
    : emptyBlock("Nenhum prÃ³ximo passo informado.");

  const glossaryCards = model.glossary.length
    ? model.glossary
        .map(
          (item) =>
            `<article class="glossary-card"><h3>${html(item.termo || "Termo")}</h3><p>${html(
              item.definicao,
            )}</p></article>`,
        )
        .join("")
    : emptyBlock("Nenhum termo informado.");

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
<title>${html(code)} - ApresentaÃ§Ã£o de Mapeamento</title>
<style>
:root{--accent:#${presentationColor};--accent-strong:color-mix(in srgb,var(--accent) 78%,#000);--gold:#d49a21;--bg:#f4f2ea;--surface:#fff;--surface-2:#faf8f1;--text:#17191f;--muted:#626a73;--line:#ddd8ca;--shadow:0 18px 60px rgba(28,28,28,.12);--nav:282px}
[data-theme="dark"]{--bg:#0f1114;--surface:#171a1f;--surface-2:#1e2329;--text:#f4f6f8;--muted:#aab2bc;--line:#343a42;--shadow:0 18px 70px rgba(0,0,0,.45);--accent-strong:color-mix(in srgb,var(--accent) 66%,#fff)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:"Segoe UI",Arial,sans-serif}.shell{display:grid;grid-template-columns:var(--nav) minmax(0,1fr);min-height:100vh}.sidebar{position:sticky;top:0;height:100vh;background:linear-gradient(180deg,var(--accent-strong),color-mix(in srgb,var(--accent) 52%,#111));color:#fff;padding:26px 20px;display:flex;flex-direction:column;gap:26px}.brand{display:flex;align-items:center;gap:12px;min-height:54px}.brand-logo{max-width:170px;max-height:54px;object-fit:contain}.system-logo-pair{display:inline-flex;align-items:center}.logo-dark{display:none}[data-theme="dark"] .logo-light{display:none}[data-theme="dark"] .logo-dark{display:block}.brand strong{font-size:15px;letter-spacing:.08em;text-transform:uppercase}.brand-mark{display:grid;width:36px;height:36px;place-items:center;border-radius:10px;background:rgba(255,255,255,.14);color:var(--gold)}.brand-mark span{width:17px;height:17px;border:2px solid currentColor;border-radius:50%;position:relative}.brand-mark span:after{content:"";position:absolute;inset:4px;border-radius:50%;background:currentColor}.doc-code{border:1px solid rgba(255,255,255,.22);border-radius:14px;padding:14px;background:rgba(255,255,255,.08)}.doc-code span{display:block;font-size:11px;letter-spacing:.16em;text-transform:uppercase;opacity:.75}.doc-code strong{display:block;margin-top:8px;font-size:16px;line-height:1.25;letter-spacing:0}.nav{display:grid;gap:4px}.nav a{color:rgba(255,255,255,.82);text-decoration:none;border-radius:9px;padding:10px 12px;font-size:12px;font-weight:750;text-transform:uppercase;letter-spacing:.1em}.nav a:hover{background:rgba(255,255,255,.12);color:#fff}.theme-toggle{margin-top:auto;display:grid;grid-template-columns:1fr 1fr;gap:6px;border:1px solid rgba(255,255,255,.22);border-radius:12px;padding:5px;background:rgba(0,0,0,.12)}.theme-toggle button{display:grid;place-items:center;border:0;border-radius:8px;background:transparent;color:rgba(255,255,255,.72);font-weight:800;padding:9px;cursor:pointer}.theme-toggle button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}.theme-toggle button.active{background:#fff;color:#111}.content{min-width:0}.slide{min-height:100vh;padding:56px 72px;border-bottom:1px solid var(--line);background:var(--surface);position:relative}.slide.alt{background:var(--surface-2)}.cover{display:flex;min-height:100vh;flex-direction:column;justify-content:center;background:radial-gradient(circle at 84% 12%,color-mix(in srgb,var(--gold) 30%,transparent),transparent 30%),linear-gradient(135deg,var(--accent-strong),color-mix(in srgb,var(--accent) 48%,#111));color:#fff}.kicker{font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:#ffd47a;font-weight:900}.cover h1{max-width:980px;margin:18px 0 22px;font-size:clamp(44px,6vw,82px);line-height:.95;letter-spacing:-.02em}.cover p{max-width:900px;margin:0;color:rgba(255,255,255,.84);font-size:22px;line-height:1.45}.cover-board{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr);gap:24px;max-width:1180px;margin-top:42px;align-items:stretch}.cover-summary{border-left:6px solid #ffd47a;padding:6px 0 6px 24px}.cover-summary span{display:block;color:rgba(255,255,255,.66);font-size:11px;font-weight:900;letter-spacing:.22em;text-transform:uppercase}.cover-summary strong{display:block;margin-top:10px;font-size:34px;line-height:1.05;letter-spacing:.08em}.cover-summary small{display:block;margin-top:12px;max-width:620px;color:rgba(255,255,255,.78);font-size:15px;line-height:1.45}.cover-facts{display:grid;gap:14px;border:1px solid rgba(255,255,255,.22);border-radius:22px;background:linear-gradient(180deg,rgba(255,255,255,.16),rgba(255,255,255,.08));padding:22px;backdrop-filter:blur(8px)}.cover-group{display:grid;gap:10px}.cover-group h2{margin:0;color:#ffd47a;font-size:12px;letter-spacing:.2em;text-transform:uppercase}.cover-list{display:grid;gap:8px;margin:0}.cover-row{display:grid;grid-template-columns:118px minmax(0,1fr);gap:12px;align-items:baseline}.cover-row dt{color:rgba(255,255,255,.62);font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.cover-row dd{margin:0;color:#fff;font-size:14px;font-weight:750;line-height:1.35}.cover-meta{margin-top:38px;display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;max-width:1020px}.cover-meta div{border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);border-radius:12px;padding:12px}.cover-meta span,.field span{display:block;color:var(--muted);font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase}.cover-meta span{color:rgba(255,255,255,.68)}.cover-meta strong,.field strong{display:block;margin-top:5px;font-size:14px;line-height:1.35}.section-head{display:flex;gap:22px;align-items:flex-start;margin-bottom:30px}.section-head>span{display:grid;width:64px;height:64px;place-items:center;border-radius:16px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent-strong);font-size:28px;font-weight:950}.section-head p{margin:0 0 7px;color:var(--gold);font-size:11px;font-weight:900;letter-spacing:.26em;text-transform:uppercase}.section-head h2{margin:0;font-size:clamp(30px,4vw,48px);line-height:1.02}.section-head small{display:block;margin-top:8px;color:var(--muted);font-size:15px;line-height:1.45}.field-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px}.field{border:1px solid var(--line);border-radius:12px;background:var(--surface);padding:13px 14px;box-shadow:0 1px 0 rgba(0,0,0,.03)}.field strong{color:var(--text);font-size:15px}.text-stack{display:grid;gap:14px}.text-panel,.list-card,.flow-card,.glossary-card{border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:var(--shadow);padding:22px}.text-panel{box-shadow:none;background:var(--surface-2);display:grid;grid-template-columns:auto minmax(0,1fr);gap:14px}.overview-icon{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:color-mix(in srgb,var(--accent) 14%,transparent);color:var(--accent-strong);font-size:20px;font-weight:900}.text-panel h3,.list-card h3,.flow-card h3,.glossary-card h3{margin:0 0 10px;color:var(--accent-strong);font-size:18px}.text-panel p,.list-card p,.flow-card p,.glossary-card p{margin:0;color:var(--muted);line-height:1.55}.card-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}.index{display:inline-grid;place-items:center;min-width:38px;height:30px;border-radius:999px;background:color-mix(in srgb,var(--gold) 18%,transparent);color:var(--gold);font-weight:950;margin-bottom:12px}.muted-line{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.list-card ul{margin:12px 0 0;padding-left:18px;color:var(--muted)}.flow-stack{display:grid;gap:18px}.flow-card{display:grid;grid-template-columns:58px minmax(0,1fr);gap:18px}.flow-card .index{margin:0}.mini-grid .field-grid{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:12px}.mini-grid .field{box-shadow:none;padding:9px 10px}.substep{margin-top:16px;border-top:1px solid var(--line);padding-top:14px}.substep h4{margin:0 0 6px;color:var(--text)}.diagram{display:grid;gap:12px;border:1px solid var(--line);border-radius:16px;background:var(--surface-2);padding:14px;margin:16px 0}.diagram h3{margin:0;color:var(--accent-strong)}.diagram p{margin:4px 0 0;color:var(--muted)}.diagram img{width:100%;max-height:62vh;object-fit:contain;border:1px solid var(--line);border-radius:12px;background:#fff;cursor:zoom-in}.table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px;background:var(--surface);box-shadow:var(--shadow)}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid var(--line);border-right:1px solid var(--line);padding:14px 16px;text-align:left;vertical-align:top;font-size:14px;line-height:1.45}th{background:color-mix(in srgb,var(--accent) 16%,var(--surface));color:var(--accent-strong);font-size:11px;letter-spacing:.14em;text-transform:uppercase}.gap-table td:first-child{min-width:190px;color:var(--accent-strong)}.gap-table td:nth-child(2),.gap-table td:nth-child(3),.gap-table td:nth-child(4){min-width:220px}.empty{border:1px dashed var(--line);border-radius:16px;background:var(--surface-2);color:var(--muted);padding:34px;text-align:center;font-style:italic}.zoom-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(5,7,10,.92);z-index:20;padding:28px}.zoom-modal.open{display:flex}.zoom-modal img{max-width:94vw;max-height:86vh;background:#fff;box-shadow:0 20px 70px rgba(0,0,0,.55);cursor:zoom-out}.zoom-title{position:fixed;left:28px;top:22px;color:white;font-weight:900;text-transform:uppercase;letter-spacing:.12em}.zoom-close{position:fixed;right:28px;top:20px;border:1px solid rgba(255,255,255,.35);background:transparent;color:white;padding:9px 14px;border-radius:8px;cursor:pointer}@media(max-width:980px){.shell{display:block}.sidebar{position:static;height:auto}.slide{padding:36px 22px}.cover-board{grid-template-columns:1fr}.cover-row{grid-template-columns:1fr;gap:3px}.cover-meta{grid-template-columns:1fr 1fr}.flow-card{grid-template-columns:1fr}.mini-grid .field-grid{grid-template-columns:1fr}.text-panel{grid-template-columns:1fr}}@media print{.sidebar{display:none}.shell{display:block}.slide{break-after:page;min-height:100vh;box-shadow:none}.content{margin:0}}
.cover-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:44px;align-items:end;max-width:1180px}.cover h1{margin-top:18px}.cover-code{min-width:190px;border-left:4px solid #ffd47a;padding:0 0 3px 18px}.cover-code span{display:block;color:rgba(255,255,255,.62);font-size:10px;font-weight:900;letter-spacing:.2em;text-transform:uppercase}.cover-code strong{display:block;margin-top:10px;color:#fff;font-size:28px;letter-spacing:.08em}.cover-context{display:grid;grid-template-columns:1.25fr 1fr 1fr;gap:1px;max-width:1180px;margin-top:52px;border-top:1px solid rgba(255,255,255,.24);border-bottom:1px solid rgba(255,255,255,.24);background:rgba(255,255,255,.18)}.cover-line{display:grid;gap:10px;margin:0;padding:22px 24px;background:rgba(0,0,0,.16)}.cover-line dt{color:#ffd47a;font-size:11px;font-weight:900;letter-spacing:.18em;text-transform:uppercase}.cover-line dd{margin:0;color:#fff;font-size:18px;font-weight:800;line-height:1.25}.cover-line small{display:block;margin-top:7px;color:rgba(255,255,255,.7);font-size:13px;font-weight:650;line-height:1.35}.cover-meta{margin-top:28px;display:flex;flex-wrap:wrap;gap:10px;max-width:1180px}.cover-meta .field{border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:999px;padding:9px 13px;box-shadow:none}.cover-meta .field span{display:inline;color:rgba(255,255,255,.62);margin-right:7px}.cover-meta .field strong{display:inline;color:#fff;font-size:13px}.overview-icon{width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,color-mix(in srgb,var(--accent) 18%,transparent),color-mix(in srgb,var(--gold) 15%,transparent));border:1px solid color-mix(in srgb,var(--accent) 28%,transparent)}.overview-icon svg{width:25px;height:25px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}.presentation-controls{margin-top:auto;display:grid;grid-template-columns:1fr 40px;gap:8px;align-items:center}.presentation-controls .theme-toggle{margin-top:0}.fullscreen-button{display:grid;height:40px;width:40px;place-items:center;border:1px solid rgba(255,255,255,.28);border-radius:12px;background:rgba(255,255,255,.08);color:rgba(255,255,255,.9);cursor:pointer}.fullscreen-button:hover{border-color:rgba(255,255,255,.48);background:rgba(255,255,255,.14);color:#fff}.fullscreen-button svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}[data-theme="dark"]{--bg:#101418;--surface:#171c22;--surface-2:#1d232a;--text:#f7f9fb;--muted:#c8d0da;--line:#3f4853;--shadow:0 20px 80px rgba(0,0,0,.58);--accent-strong:color-mix(in srgb,var(--accent) 28%,#f4f8fb)}[data-theme="dark"] body{background:linear-gradient(180deg,#101418,#14191f);color:var(--text)}[data-theme="dark"] .sidebar{background:linear-gradient(180deg,#111820,#0b0f13);border-right:1px solid #303943;box-shadow:inset -1px 0 rgba(255,255,255,.04)}[data-theme="dark"] .brand-logo{filter:drop-shadow(0 2px 10px rgba(0,0,0,.35))}[data-theme="dark"] .doc-code{border-color:#66717d;background:linear-gradient(180deg,rgba(255,255,255,.13),rgba(255,255,255,.07));box-shadow:inset 0 1px rgba(255,255,255,.08)}[data-theme="dark"] .doc-code span,[data-theme="dark"] .cover-meta span{color:#d3dbe4;opacity:1}[data-theme="dark"] .doc-code strong,[data-theme="dark"] .nav a{color:#fff}[data-theme="dark"] .nav a{opacity:.95}[data-theme="dark"] .nav a:hover{background:rgba(255,255,255,.14)}[data-theme="dark"] .theme-toggle{border-color:#55606b;background:#06090c}[data-theme="dark"] .theme-toggle button{color:#dce3eb}[data-theme="dark"] .theme-toggle button.active{background:#f5f7fa;color:#111820}[data-theme="dark"] .slide{background:#151a20}[data-theme="dark"] .slide.alt{background:#11161b}[data-theme="dark"] .section-head>span{background:rgba(212,154,33,.16);color:#f2bc4b;border:1px solid rgba(242,188,75,.3)}[data-theme="dark"] .section-head p,[data-theme="dark"] .kicker{color:#f2bc4b}[data-theme="dark"] .section-head small{color:#cfd7df}[data-theme="dark"] .text-panel,[data-theme="dark"] .list-card,[data-theme="dark"] .flow-card,[data-theme="dark"] .glossary-card{background:#1b2128;border-color:#46505b}[data-theme="dark"] .field{background:#1a2027;border-color:#46505b}[data-theme="dark"] .text-panel h3,[data-theme="dark"] .list-card h3,[data-theme="dark"] .flow-card h3,[data-theme="dark"] .glossary-card h3,[data-theme="dark"] .diagram h3,[data-theme="dark"] .gap-table td:first-child{color:#f2bc4b}[data-theme="dark"] .text-panel p,[data-theme="dark"] .list-card p,[data-theme="dark"] .flow-card p,[data-theme="dark"] .glossary-card p,[data-theme="dark"] .diagram p,[data-theme="dark"] .list-card ul{color:#d5dce4}[data-theme="dark"] .table-wrap{background:#171d24;border-color:#505a66;box-shadow:0 16px 50px rgba(0,0,0,.35)}[data-theme="dark"] th{background:#232b34;color:#dfe6ee;border-color:#505a66}[data-theme="dark"] td{border-color:#404a55;color:#eef2f6}[data-theme="dark"] tr:hover td{background:rgba(242,188,75,.06)}[data-theme="dark"] .empty{background:#1b2128;border-color:#505a66;color:#d4dbe3}@media(max-width:980px){.cover-hero{grid-template-columns:1fr;gap:24px}.cover-context{grid-template-columns:1fr}.presentation-controls{grid-template-columns:1fr 40px}}
</style>
</head>
<body>
<div class="shell">
<aside class="sidebar">
  <div class="brand">${bfFlowLogoHtml(brand, assetBase)}</div>
  <div class="doc-code"><span>${html(code)}</span><strong>${html(model.meta.titulo || title)}</strong></div>
  <nav class="nav">${nav.map(([href, label]) => `<a href="#${href}">${html(label)}</a>`).join("")}</nav>
  <div class="presentation-controls"><div class="theme-toggle" aria-label="Tema da apresentaÃ§Ã£o"><button type="button" data-theme-choice="light" class="active" title="Tema claro" aria-label="Tema claro"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg></button><button type="button" data-theme-choice="dark" title="Tema escuro" aria-label="Tema escuro"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A7.5 7.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z"/></svg></button></div><button type="button" class="fullscreen-button" id="fullscreen-toggle" title="Tela cheia" aria-label="Tela cheia"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H3v5"/><path d="M16 3h5v5"/><path d="M8 21H3v-5"/><path d="M16 21h5v-5"/></svg></button></div>
</aside>
<main class="content">
<section class="slide cover" id="capa"><div class="cover-hero"><div><div class="kicker">01 Â· ApresentaÃ§Ã£o de Mapeamento</div><h1>${html(title)}</h1><p>${html(description || "RelatÃ³rio de mapeamento de processo.")}</p></div><div class="cover-code"><span>CÃ³digo</span><strong>${html(code)}</strong></div></div><dl class="cover-context">${[
    coverLine("Processo mapeado", processName, processCode),
    coverLine("Cadeia e Ã¡rea", processValueChain, processArea),
    coverLine("Dono do processo", processOwner),
  ].join("")}</dl>${fieldGrid([
    ["Modalidade", model.meta.modalidade],
    ["Status", model.meta.status || "Em andamento"],
    ["Data", formatDateBr(model.meta.dataRelatorio || model.meta.data)],
    ["Elaborador", model.meta.elaborador],
    ["Revisor", model.meta.revisor],
  ]).replace('class="field-grid"', 'class="cover-meta"')}</section>
<section class="slide" id="visao">${sectionHead("02", "VisÃ£o geral", "Objetivo, escopo e contexto operacional do mapeamento.")}<div class="text-stack">${[
    textPanel("Objetivo", model.description, overviewIcon("target")),
    textPanel("Escopo", data.overview.escopo, overviewIcon("scope")),
    textPanel("Estado atual", data.overview.estadoAtual),
    textPanel("Indicadores", data.overview.kpis, overviewIcon("metrics")),
    textPanel("Volume", data.overview.volume),
    textPanel("FrequÃªncia", data.overview.frequencia),
    textPanel("Dores", data.overview.dores),
    textPanel("Oportunidades", data.overview.oportunidades),
  ].join("") || emptyBlock()}</div></section>
<section class="slide alt" id="sistemas">${sectionHead("03", "Sistemas envolvidos", "Sistemas, ferramentas e uso no processo.")}<div class="card-grid">${systemCards}</div></section>
<section class="slide" id="sipoc">${sectionHead("04", "AnÃ¡lise SIPOC", "Fornecedores, entradas, processo, saÃ­das e clientes.")}${sipocRows}</section>
<section class="slide alt" id="fluxo">${sectionHead("05", "Fluxo AS IS", "RepresentaÃ§Ã£o do macroprocesso e etapas detalhadas.")}${macroDiagram}<div class="flow-stack">${flowSteps}</div></section>
<section class="slide" id="gaps">${sectionHead("06", "Gaps e causas-raiz", "Causas, impactos e planos de aÃ§Ã£o relacionados.")}${gapTable}</section>
<section class="slide alt" id="proximos">${sectionHead("07", "PrÃ³ximos passos", "Encaminhamentos definidos para continuidade.")}<div class="card-grid">${nextCards}</div></section>
<section class="slide" id="glossario">${sectionHead("08", "GlossÃ¡rio", "Termos utilizados no relatÃ³rio.")}<div class="card-grid">${glossaryCards}</div></section>
</main>
</div>
<div class="zoom-modal" id="zoom-modal" onclick="closeImageZoom()"><div class="zoom-title" id="zoom-title"></div><button class="zoom-close" onclick="closeImageZoom();event.stopPropagation()">Fechar</button><img id="zoom-img" alt="Imagem ampliada"/></div>
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
function openImageZoom(img){var modal=document.getElementById('zoom-modal');var target=document.getElementById('zoom-img');var title=document.getElementById('zoom-title');target.src=img.src;title.textContent=img.dataset.title||img.alt||'Imagem';modal.classList.add('open');}
function closeImageZoom(){var modal=document.getElementById('zoom-modal');var target=document.getElementById('zoom-img');modal.classList.remove('open');target.src='';}
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
  const [isDemo] = useState(() => isDemoSessionActive());
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
  const [expandedTree, setExpandedTree] = useState<Record<string, boolean>>({
    home: true,
    modules: true,
    registrations: false,
    // Expande jÃ¡ o branch do mÃ³dulo atual, para a barra lateral refletir onde o
    // usuÃ¡rio estÃ¡ em vez de aparecer recolhida ("menu voltou para versÃ£o antiga").
    ddp: moduleId === "ddp",
    pop: moduleId === "pop",
    bpmn: moduleId === "bpmn",
    causes: false,
    settings: true,
    processRegistrations: true,
    systemRegistrations: true,
  });

  const [showSave, setShowSave] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState("");
  // Incrementa a cada salvamento concluÃ­do â€” informa ao formulÃ¡rio de mapeamento
  // que o estado "nÃ£o salvo" pode ser limpo.
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
  const [demoCatalogs, setDemoCatalogs] = useState<OrganizationCatalogs>(DEMO_CATALOGS);
  // AlteraÃ§Ã£o de status do documento na tela de consulta (Em andamento, etc.).
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
    () => ((accessibleOrganizationsQ.data ?? []) as AccessibleOrganization[]),
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
    enabled: (showLibrary || moduleSurface === "consult") && !isDemo,
  });
  const draftKey = isDemo ? DRAFT_KEY : `${DRAFT_KEY}_${wsQ.data?.id ?? "cloud"}`;
  const organizationCatalogs: OrganizationCatalogs = isDemo
    ? demoCatalogs
    : {
        departments: catalogsQ.data?.departments ?? [],
        processOwners: catalogsQ.data?.processOwners ?? [],
        positions: ((catalogsQ.data as { positions?: OrganizationPosition[] } | undefined)?.positions) ?? [],
        causes: catalogsQ.data?.causes ?? [],
        processes: catalogsQ.data?.processes ?? [],
        valueChains: catalogsQ.data?.valueChains ?? [],
        systems:
          ((catalogsQ.data as { systems?: OrganizationSystem[] } | undefined)?.systems) ?? [],
      };
  const organizationBrand: OrganizationBrand = isDemo
    ? {
        name: "Bom Futuro",
        word_header_color: "1D1D1F",
        logo_data_url: demoOrganizationLogo,
      }
    : (selectedOrganization ?? meQ.data?.organization ?? { name: "BF Flow", word_header_color: "1D1D1F" });
  const elaboratorOptions = useMemo(() => {
    const fromUsers =
      (usersQ.data as Array<{ email?: string | null; display_name?: string | null }> | undefined)
        ?.map((user) => user.display_name || user.email || "")
        .filter(Boolean) ?? [];
    const currentUser = !isDemo
      ? [meQ.data?.profile?.display_name || meQ.data?.profile?.email || ""].filter(Boolean)
      : [];
    const demoUsers = isDemo
      ? ["Administrador local", "Analista de processos", "UsuÃ¡rio consulta"]
      : [];
    return Array.from(new Set([...fromUsers, ...currentUser, ...demoUsers]));
  }, [isDemo, meQ.data?.profile?.display_name, meQ.data?.profile?.email, usersQ.data]);
  const currentElaborator =
    !isDemo
      ? meQ.data?.profile?.display_name || meQ.data?.profile?.email || ""
      : "Administrador local";

  // Contexto de codificaÃ§Ã£o da organizaÃ§Ã£o ativa (modo demo via localStorage).
  const demoOrgForCode = isDemo ? readActiveDemoOrganization() : null;
  const codeOrganizationId = isDemo ? demoOrgForCode!.id : (selectedOrganizationId ?? null);
  const codeSettings: CodeSettings | null = isDemo
    ? demoOrgForCode!.code_settings
    : ((selectedOrganization?.code_settings as CodeSettings | null | undefined) ??
      (meQ.data?.organization?.code_settings as CodeSettings | null | undefined) ??
      null);

  // Resolve a sigla (3 letras) a partir do nome da Ã¡rea: usa a sigla cadastrada
  // quando hÃ¡ correspondÃªncia; caso contrÃ¡rio, deriva do prÃ³prio nome.
  function resolveAreaSigla(name: string | null | undefined): string {
    const match = organizationCatalogs.departments.find((dept) => dept.name === name);
    return normalizeSigla(match?.sigla ?? name ?? "");
  }

  // Tipo e Ã¡rea do documento ativo (o cÃ³digo depende de ambos).
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
  // Reserva o prÃ³ximo cÃ³digo (consome a sequÃªncia) no momento de salvar.
  async function reserveModuleCode(): Promise<string> {
    if (currentAreaSigla.length !== 3) {
      throw new Error("Defina a Ã¡rea responsÃ¡vel (sigla de 3 letras) antes de gerar o cÃ³digo.");
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
    // Expande o branch do mÃ³dulo atual (recolhendo os demais), para a barra
    // lateral refletir onde o usuÃ¡rio estÃ¡ em vez de aparecer toda recolhida.
    setExpandedTree((current) => ({
      ...current,
      modules: true,
      ddp: moduleId === "ddp",
      pop: moduleId === "pop",
      bpmn: moduleId === "bpmn",
      causes: false,
    }));
  }, [moduleId]);

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
    // No view param â€” always reset to editor to avoid stale surface from previous navigation
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
      if (!row.content_inline) throw new Error("Documento sem conteÃºdo salvo.");
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
      toast.error(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel abrir o documento.");
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

  // Devolve o cÃ³digo atual do documento para o tipo do mÃ³dulo (vazio = sem cÃ³digo).
  function currentModuleCode(ws: WorkspaceState = workspace): string {
    if (moduleId === "ddp") return ws.ddp.meta.codigo;
    if (moduleId === "pop") return ws.pop.meta.codigo;
    return ws.bpmn.codigo ?? "";
  }

  // Injeta um cÃ³digo no workspace conforme o tipo do mÃ³dulo.
  function withModuleCode(ws: WorkspaceState, code: string): WorkspaceState {
    if (moduleId === "ddp")
      return { ...ws, ddp: { ...ws.ddp, meta: { ...ws.ddp.meta, codigo: code } } };
    if (moduleId === "pop")
      return { ...ws, pop: { ...ws.pop, meta: { ...ws.pop.meta, codigo: code } } };
    return { ...ws, bpmn: { ...ws.bpmn, codigo: code } };
  }

  function downloadImportTemplate() {
    if (moduleId === "bpmn") {
      toast.info("Modelo Excel textual estÃ¡ disponÃ­vel para Mapeamento e POP por enquanto.");
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
      toast.info("ImportaÃ§Ã£o textual por Excel estÃ¡ disponÃ­vel para Mapeamento e POP por enquanto.");
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

  const saveMut = useMutation({
    mutationFn: async () => {
      if (moduleId === "ddp" && !workspace.ddp.macroprocess.processId) {
        throw new Error(
          "Selecione um processo previamente cadastrado antes de salvar o Mapeamento.",
        );
      }
      // GeraÃ§Ã£o automÃ¡tica de cÃ³digo: reserva a sequÃªncia quando configurado e
      // o documento ainda nÃ£o tem cÃ³digo.
      let workspaceToSave = workspace;
      if (moduleId === "ddp") {
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
          id:
            activeCloudDocument?.moduleId === moduleId
              ? activeCloudDocument.id
              : null,
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
        moduleId === "ddp" ? "Mapeamento salvo." : `Documento salvo. RevisÃ£o v${revisionVersion}.`,
      );
      setShowSave(false);
      setComment("");
      setSavedNonce((n) => n + 1);
      if (moduleId === "ddp") {
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
      if (!content) throw new Error("VersÃ£o sem conteÃºdo.");
      return content;
    },
    onSuccess: (content) => {
      const result = importWorkspaceFromJson(content, workspace, moduleId);
      setWorkspace(result.workspace);
      if (isDemo) restoreDemoWorkspaceState(content);
      window.localStorage.setItem(draftKey, JSON.stringify(result.workspace));
      setShowHistory(false);
      toast.success("VersÃ£o restaurada.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function brandForDocumentModel(modelKey: DocumentModelRow["model_key"]): OrganizationBrand {
    const models = isDemo
      ? demoDocumentModels
      : ((documentModelsQ.data as DocumentModelRow[] | undefined) ?? DEFAULT_DOCUMENT_MODELS);
    const model = models.find((item) => item.model_key === modelKey);
    // A logo do documento usa o que foi configurado no modelo; se o modelo nÃ£o
    // tiver logo, cai para a logo da organizaÃ§Ã£o; por fim, o nome como texto.
    const logo = model?.logo_data_url ?? organizationBrand.logo_data_url ?? null;
    return {
      name: organizationBrand.name || "BF Flow",
      logo_data_url: logo,
      word_header_color: model?.primary_color ?? organizationBrand.word_header_color ?? "1D1F23",
    };
  }

  async function addCauseToCatalog(gap: GapItem) {
    const title = plain(gap.causa);
    if (!title) throw new Error("Informe o nome da causa antes de cadastrar na biblioteca.");
    const existing = organizationCatalogs.causes.find(
      (item) => normalizeLabel(item.title) === normalizeLabel(title),
    );
    if (existing) return existing;
    const payload = {
      title,
      description: plain(gap.descricao) || null,
      impact: plain(gap.impacto) || null,
      action: plain(gap.acao) || null,
      priority: gap.prioridade || "MÃ©dia",
    };
    if (isDemo) {
      const row = { id: id("cause"), ...payload };
      setDemoCatalogs((current) => ({ ...current, causes: [...current.causes, row] }));
      return row;
    }
    const row = await createSharedCause({ data: payload });
    await catalogsQ.refetch();
    return row;
  }

  async function syncDdpGapsToCatalog(source: WorkspaceState) {
    if (moduleId !== "ddp") return source;
    const knownCauses = new Map(
      organizationCatalogs.causes.map((cause) => [normalizeLabel(cause.title), cause]),
    );
    let changed = false;
    const gaps: GapItem[] = [];

    for (const gap of source.ddp.gaps) {
      const title = plain(gap.causa);
      if (!title) {
        gaps.push(gap);
        continue;
      }

      const linked = organizationCatalogs.causes.find((item) => item.id === gap.sharedCauseId);
      const payload = {
        title,
        description: plain(gap.descricao) || null,
        impact: plain(gap.impacto) || null,
        action: plain(gap.acao) || null,
        priority: gap.prioridade || "MÃ©dia",
      };
      const cause = linked
        ? await updateCauseCatalog({ ...linked, ...payload })
        : (knownCauses.get(normalizeLabel(title)) ?? (await addCauseToCatalog(gap)));

      knownCauses.set(normalizeLabel(cause.title), cause);
      if (gap.sharedCauseId !== cause.id) changed = true;
      gaps.push(gap.sharedCauseId === cause.id ? gap : { ...gap, sharedCauseId: cause.id });
    }

    return changed ? { ...source, ddp: { ...source.ddp, gaps } } : source;
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
        title: cause.title,
        description: cause.description,
        impact: cause.impact,
        action: cause.action,
        priority: cause.priority,
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
    await removeSharedCause({ data: { id: causeId } });
    await catalogsQ.refetch();
  }

  async function signOut() {
    if (isDemo) endDemoSession();
    else await supabase.auth.signOut();
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
    savedDemoDocument,
    isDemo,
  ).map((row) =>
    statusOverrides[row.id] ? { ...row, status: statusOverrides[row.id] } : row,
  );

  async function changeRowStatus(row: ModuleGridRow, status: string) {
    if (row.status === status) return;

    if (isDemo || row.id.startsWith("demo-")) {
      setStatusOverrides((current) => ({ ...current, [row.id]: status }));
      toast.success(`Status atualizado para â€œ${status}â€.`);
      return;
    }

    if (moduleId !== "ddp") {
      setStatusOverrides((current) => ({ ...current, [row.id]: status }));
      toast.success(`Status atualizado para â€œ${status}â€.`);
      return;
    }

    if (!selectedOrganizationId) {
      toast.error("Selecione uma organizaÃ§Ã£o antes de alterar o status.");
      return;
    }

    const cloudDocument = (cloudDocsQ.data as CloudModuleDocument[] | undefined)?.find(
      (document) => document.id === row.id,
    );
    if (!cloudDocument) {
      toast.error("Registro nÃ£o encontrado para atualizaÃ§Ã£o.");
      return;
    }

    const document = await getCloudDocument({ data: { id: row.id } });
    if (!document.content_inline) {
      toast.error("Registro sem conteÃºdo salvo.");
      return;
    }

    const snapshot = parseWorkspace(document.content_inline);
    const updatedWorkspace: WorkspaceState = {
      ...snapshot,
      ddp: {
        ...snapshot.ddp,
        meta: {
          ...snapshot.ddp.meta,
          status,
        },
      },
    };
    const payload = {
      code: updatedWorkspace.ddp.meta.codigo,
      title: updatedWorkspace.ddp.meta.titulo,
      description: updatedWorkspace.ddp.overview.objetivo || updatedWorkspace.ddp.overview.escopo,
      primaryProcessId: updatedWorkspace.ddp.macroprocess.processId || null,
      primaryProcessVersion: null,
    };

    await saveCloudDocument({
      data: {
        organizationId: selectedOrganizationId,
        id: row.id,
        moduleId: "ddp",
        code: payload.code,
        title: payload.title,
        description: payload.description,
        content: buildModuleJson("ddp", updatedWorkspace),
        comment: `[Mapeamento] Status alterado para ${status}`,
        primaryProcessId: payload.primaryProcessId,
        primaryProcessVersion: payload.primaryProcessVersion,
      },
    });

    if (activeCloudDocument?.id === row.id) {
      setWorkspace(updatedWorkspace);
      window.localStorage.setItem(draftKey, JSON.stringify(updatedWorkspace));
    }
    await cloudDocsQ.refetch();
    toast.success(`Status atualizado para â€œ${status}â€.`);
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
      toast.info("Registro de demonstraÃ§Ã£o. Use â€œNovoâ€ para criar um caso editÃ¡vel.");
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
      toast.error(error instanceof Error ? error.message : "Nao foi possivel duplicar o mapeamento.");
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
      toast.success(ids.length > 1 ? "Registros excluÃ­dos." : "Registro excluÃ­do.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel excluir o registro.");
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

  // Abre uma visualizaÃ§Ã£o somente-leitura amigÃ¡vel do registro em nova aba, com todas
  // as informaÃ§Ãµes preenchidas no formulÃ¡rio e seguindo a identidade visual.
  function viewDocumentRow(row: ModuleGridRow) {
    const snapshot = resolveRowSnapshot(row);
    let docHtml: string;
    if (snapshot && moduleId === "ddp") {
      docHtml = buildDdpPresentationHtml(snapshot.ddp, brandForDocumentModel("ddp-html"));
    } else if (snapshot && moduleId === "pop") {
      docHtml = buildPopPreviewHtml(snapshot.pop, brandForDocumentModel("pop-word"));
    } else {
      docHtml = buildReadonlyPreviewHtml(moduleId, row, organizationBrand);
    }
    const url = URL.createObjectURL(new Blob([docHtml], { type: "text/html;charset=utf-8" }));
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) toast.error("Habilite pop-ups para visualizar o registro.");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  // Visualiza, em nova aba, o que estÃ¡ sendo preenchido agora no formulÃ¡rio,
  // na mesma modalidade somente-leitura disponÃ­vel na consulta.
  function previewCurrentDdp() {
    const docHtml = buildDdpPresentationHtml(workspace.ddp, brandForDocumentModel("ddp-html"));
    const url = URL.createObjectURL(new Blob([docHtml], { type: "text/html;charset=utf-8" }));
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) toast.error("Habilite pop-ups para visualizar o preenchimento.");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function previewCurrentPop() {
    const docHtml = buildPopPreviewHtml(workspace.pop, brandForDocumentModel("pop-word"));
    const url = URL.createObjectURL(new Blob([docHtml], { type: "text/html;charset=utf-8" }));
    const opened = window.open(url, "_blank", "noopener");
    if (!opened) toast.error("Habilite pop-ups para visualizar o preenchimento.");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  async function exportDocumentRow(
    row: ModuleGridRow,
    format: "ddp-html" | "ddp-docx" | "ddp-presentation-doc" | "pop-docx" | "pop-presentation-doc",
  ) {
    if (row.id.startsWith("demo-row:")) {
      toast.info("Registro de demonstraÃ§Ã£o. Crie um caso real em â€œNovoâ€ para exportar.");
      return;
    }
    const snapshot = resolveRowSnapshot(row);
    if (!snapshot) throw new Error("Documento salvo nÃ£o encontrado.");

    if (format === "ddp-html") {
      const filename = cleanFileName(
        `${snapshot.ddp.meta.codigo}-${snapshot.ddp.meta.titulo}-apresentacao-${stamp()}`,
      );
      downloadText(
        `${filename}.html`,
        buildDdpPresentationHtml(snapshot.ddp, brandForDocumentModel("ddp-html")),
        "text/html;charset=utf-8",
      );
    } else if (format === "ddp-presentation-doc") {
      const filename = cleanFileName(
        `${snapshot.ddp.meta.codigo}-${snapshot.ddp.meta.titulo}-apresentacao`,
      );
      downloadText(
        `${filename}.doc`,
        buildDdpPresentationHtml(snapshot.ddp, brandForDocumentModel("ddp-html")),
        "application/msword;charset=utf-8",
      );
    } else if (format === "ddp-docx") {
      const filename = cleanFileName(`${snapshot.ddp.meta.codigo}-${snapshot.ddp.meta.titulo}`);
      downloadBlob(
        `${filename}.docx`,
        buildDdpDocx(snapshot.ddp, brandForDocumentModel("ddp-word")),
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
        : "Documento exportado a partir da versÃ£o salva.",
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
      />
    ) : (
      <>
        {!loaded && !isDemo ? (
          <Panel>
            <div className="py-20 text-center text-sm text-[#6e6e73]">Carregando workspace...</div>
          </Panel>
        ) : null}
        {loaded && moduleId === "ddp" ? (
          ddpView === "causes" ? (
            <DdpCausesModuleV2
              data={workspace.ddp}
              catalogs={organizationCatalogs}
              update={(ddp) => updateWorkspace((current) => ({ ...current, ddp }))}
              onDeleteSharedCause={deleteCauseCatalog}
              mode={
                search.view?.startsWith("cause-")
                  ? (search.view.slice(6) as "new" | "consult" | "edit")
                  : "consult"
              }
              onOpenEditor={() => setDdpView("editor")}
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
              onProcessCreated={async (process) => {
                if (isDemo) {
                  setDemoCatalogs((current) => ({
                    ...current,
                    processes: [
                      ...current.processes,
                      process as unknown as OrganizationProcess,
                    ],
                  }));
                } else {
                  await catalogsQ.refetch();
                }
              }}
              onSystemCreated={async (system) => {
                if (isDemo) {
                  setDemoCatalogs((current) => ({
                    ...current,
                    systems: [...current.systems, system],
                  }));
                } else {
                  await catalogsQ.refetch();
                }
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
            />
          ) : (
            <PopModule
              data={workspace.pop}
              catalogs={organizationCatalogs}
              organizationId={codeOrganizationId}
              update={(pop) => updateWorkspace((current) => ({ ...current, pop }))}
              onCatalogCreated={async () => {
                if (!isDemo) await catalogsQ.refetch();
              }}
              autoCode={isAutoCodeModule}
              codePreview={autoCodePreview}
              onSave={() => setShowSave(true)}
              onPreview={previewCurrentPop}
              saving={saveMut.isPending}
              savedNonce={savedNonce}
            />
          )
        ) : null}
        {loaded && moduleId === "bpmn" ? (
          <BpmnModule
            data={workspace.bpmn}
            update={(bpmn) => updateWorkspace((current) => ({ ...current, bpmn }))}
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
          title={treeOpen ? "Ocultar navegaÃ§Ã£o" : "Mostrar navegaÃ§Ã£o"}
        >
          <Menu className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/" })}
          className="flex h-full items-center rounded-md transition-opacity hover:opacity-80"
          title="Ir para a pÃ¡gina inicial"
          aria-label="Ir para a pÃ¡gina inicial"
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
            title="OrganizaÃ§Ã£o ativa"
            aria-label="OrganizaÃ§Ã£o ativa"
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
          isDemo={isDemo}
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
              aria-label="Fechar navegaÃ§Ã£o"
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
                    navegaÃ§Ã£o
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
                        : "ConfiguraÃ§Ãµes"}
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
                          ? target.task === "consult" &&
                            moduleId === target.moduleId &&
                            contentMode === "module" &&
                            moduleSurface === "consult"
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
                    {/* Mesmos itens/Ã­cones da pÃ¡gina inicial (componentes compartilhados). */}
                    <ModuleTreeButton
                      onClick={() =>
                        navigate({ to: "/", search: { area: "settings", view: "users" } })
                      }
                    >
                      <Users className="h-4 w-4" /> UsuÃ¡rios
                    </ModuleTreeButton>
                    <ModuleTreeButton
                      onClick={() =>
                        navigate({ to: "/", search: { area: "settings", view: "organizations" } })
                      }
                    >
                      <Building2 className="h-4 w-4" /> OrganizaÃ§Ãµes
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

          <main className="min-w-0 p-4 sm:p-5">
            <section className="min-w-0">{moduleMainContent}</section>
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
                  Arquivo modelo de importaÃ§Ã£o textual
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
                  Importa o Excel preenchido e atualiza os campos do mÃ³dulo.
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
              : "Grava o preenchimento da documentaÃ§Ã£o e mantÃ©m o histÃ³rico."
          }
          onClose={() => setShowSave(false)}
        >
          <textarea
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={
              moduleId === "ddp"
                ? "ObservaÃ§Ã£o opcional sobre o registro"
                : "ObservaÃ§Ã£o opcional sobre o documento"
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
          title="HistÃ³rico"
          subtitle="Restaure uma versÃ£o salva quando precisar."
          onClose={() => setShowHistory(false)}
        >
          {versionsQ.isLoading ? (
            <div className="py-8 text-center text-sm text-[#6e6e73]">Carregando...</div>
          ) : null}
          {!versionsQ.isLoading && !versionsQ.data?.length ? (
            <div className="py-8 text-center text-sm text-[#6e6e73]">
              Nenhuma versÃ£o salva ainda.
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
                    {version.comment || "Sem comentÃ¡rio"}
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
          subtitle={`Documentos de ${moduleDocLabel} salvos no sistema para esta organizaÃ§Ã£o.`}
          onClose={() => setShowLibrary(false)}
        >
          {isDemo ? (
            <div className="py-8 text-center text-sm text-[#6e6e73]">
              No modo de teste local, salve versÃµes locais ou abra um JSON. No ambiente conectado, a
              busca consulta o Supabase da organizaÃ§Ã£o.
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
      eyebrow: "configuraÃ§Ãµes Â· aparÃªncia",
      title: "AparÃªncia",
      text: `Ajuste a experiÃªncia visual do workspace para a organizaÃ§Ã£o ${organizationName}.`,
    },
    theme: {
      eyebrow: "configuraÃ§Ãµes Â· aparÃªncia",
      title: "Tema",
      text: "Controle tema claro, escuro e preferÃªncia automÃ¡tica do navegador.",
    },
    preferences: {
      eyebrow: "configuraÃ§Ãµes Â· aparÃªncia",
      title: "PreferÃªncias",
      text: "Defina comportamento padrÃ£o, densidade visual e preferÃªncias gerais do workspace.",
    },
    "visual-identity": {
      eyebrow: "configuraÃ§Ãµes Â· identidade visual",
      title: "Identidade visual",
      text: "Configure logo, cores institucionais e personalizaÃ§Ã£o dos cabeÃ§alhos dos documentos exportados.",
    },
    integrations: {
      eyebrow: "configuraÃ§Ãµes Â· integraÃ§Ãµes",
      title: "IntegraÃ§Ãµes",
      text: "Gerencie conexÃµes do sistema, serviÃ§os externos e integraÃ§Ãµes tÃ©cnicas.",
    },
    "local-environment": {
      eyebrow: "configuraÃ§Ãµes Â· ambiente local",
      title: "Ambiente de teste/local",
      text: "Controle recursos locais de teste sem expor aÃ§Ãµes tÃ©cnicas na navegaÃ§Ã£o dos mÃ³dulos.",
    },
    profile: {
      eyebrow: "configuraÃ§Ãµes Â· perfil",
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
      name: workspace.ddp.meta.titulo || "Mapeamento sem tÃ­tulo",
      type: "Mapeamento",
      modalidade: workspace.ddp.meta.modalidade || "AS IS",
      process:
        workspace.ddp.macroprocess.titulo ||
        workspace.ddp.legacy?.processName?.toString() ||
        "-",
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
      code: workspace.pop.meta.codigo || "-",
      name: workspace.pop.meta.titulo || "Documento sem tÃ­tulo",
      type: workspace.pop.meta.tipo || "Documento",
      modalidade: "-",
      process: workspace.pop.meta.processo || "-",
      area: workspace.pop.meta.area || "-",
      owner: "-",
      responsible: workspace.pop.meta.elaboracao || workspace.pop.meta.aprovacao || "-",
    };
  }
  return {
    ...base,
    code: "FLX",
    name: workspace.bpmn.poolName || "Fluxograma sem tÃ­tulo",
    type: "Fluxo de atividades",
    modalidade: "-",
    process: workspace.bpmn.poolName || "-",
    area: "-",
    owner: "-",
    responsible: workspace.bpmn.lanes.filter(Boolean).join(" / ") || "-",
  };
}

// Casos fictÃ­cios prÃ©-preenchidos para o modo demo, para que as telas de
// "Consultar registros" tenham volume suficiente para testes robustos.
// Tupla: [code, name, process, area, owner, responsible, status, updatedAt]
type DemoRowTuple = [string, string, string, string, string, string, string, string];
const DEMO_MODULE_ROW_DATA: Record<AteliamModule, DemoRowTuple[]> = {
  ddp: [
    ["MAP.PMO.001", "Mapeamento â€” Planejamento EstratÃ©gico", "Planejamento EstratÃ©gico", "Processos & Qualidade", "Aline Ferreira", "Aline Ferreira", "Aprovado", "2026-05-12"],
    ["MAP.PMO.002", "Mapeamento â€” GestÃ£o de Indicadores", "GestÃ£o de Indicadores e Desempenho", "Processos & Qualidade", "Aline Ferreira", "Bruno Cardoso", "Ativo", "2026-06-02"],
    ["MAP.RH.001", "Mapeamento â€” Recrutamento e SeleÃ§Ã£o", "Recrutamento e SeleÃ§Ã£o", "Recursos Humanos", "Juliana Castro", "Juliana Castro", "Em revisÃ£o", "2026-06-18"],
    ["MAP.RH.002", "Mapeamento â€” IntegraÃ§Ã£o e Onboarding", "IntegraÃ§Ã£o e Onboarding", "Recursos Humanos", "Juliana Castro", "PatrÃ­cia Lima", "Ativo", "2026-04-27"],
    ["MAP.TI.001", "Mapeamento â€” GestÃ£o de Demandas de TI", "GestÃ£o de Demandas de TI", "Tecnologia da InformaÃ§Ã£o", "Carlos Menezes", "Carlos Menezes", "Aprovado", "2026-05-30"],
    ["MAP.TI.002", "Mapeamento â€” SeguranÃ§a da InformaÃ§Ã£o", "GestÃ£o de SeguranÃ§a da InformaÃ§Ã£o", "Tecnologia da InformaÃ§Ã£o", "Carlos Menezes", "Carlos Menezes", "Rascunho", "2026-06-21"],
    ["MAP.COM.001", "Mapeamento â€” ProspecÃ§Ã£o e Leads", "ProspecÃ§Ã£o e GeraÃ§Ã£o de Leads", "Comercial & Vendas", "Rafael Souza", "Rafael Souza", "Ativo", "2026-06-09"],
    ["MAP.OPE.001", "Mapeamento â€” Planejamento da ProduÃ§Ã£o", "Planejamento da ProduÃ§Ã£o", "OperaÃ§Ãµes", "PatrÃ­cia Lima", "PatrÃ­cia Lima", "Em revisÃ£o", "2026-06-15"],
    ["MAP.FIN.001", "Mapeamento â€” Contas a Receber", "Contas a Receber", "Financeiro & Controladoria", "Bruno Cardoso", "Bruno Cardoso", "Aprovado", "2026-03-19"],
  ],
  pop: [
    ["POP.RH.001", "POP â€” AdmissÃ£o de Colaborador", "Recrutamento e SeleÃ§Ã£o", "Recursos Humanos", "-", "Juliana Castro", "Aprovado", "2026-05-04"],
    ["POP.RH.002", "POP â€” Desligamento de Colaborador", "AvaliaÃ§Ã£o de Desempenho", "Recursos Humanos", "-", "Juliana Castro", "Ativo", "2026-06-01"],
    ["IT.TI.001", "IT â€” ConcessÃ£o de Acessos", "GestÃ£o de SeguranÃ§a da InformaÃ§Ã£o", "Tecnologia da InformaÃ§Ã£o", "-", "Carlos Menezes", "Aprovado", "2026-05-22"],
    ["IT.TI.002", "IT â€” Rotina de Backup", "GestÃ£o de Demandas de TI", "Tecnologia da InformaÃ§Ã£o", "-", "Carlos Menezes", "Em revisÃ£o", "2026-06-17"],
    ["POP.FIN.001", "POP â€” ConciliaÃ§Ã£o BancÃ¡ria", "Contas a Receber", "Financeiro & Controladoria", "-", "Bruno Cardoso", "Ativo", "2026-04-30"],
    ["POP.FIN.002", "POP â€” AprovaÃ§Ã£o de Pagamentos", "Contas a Pagar", "Financeiro & Controladoria", "-", "Bruno Cardoso", "Rascunho", "2026-06-20"],
    ["POP.OPE.001", "POP â€” InspeÃ§Ã£o de Qualidade", "Controle de Qualidade na ProduÃ§Ã£o", "OperaÃ§Ãµes", "-", "PatrÃ­cia Lima", "Aprovado", "2026-05-15"],
    ["POP.LOG.001", "POP â€” Recebimento de Mercadorias", "LogÃ­stica & Supply Chain", "LogÃ­stica & Supply Chain", "-", "Marcos Oliveira", "Ativo", "2026-06-07"],
  ],
  bpmn: [
    ["FLX.COM.001", "Fluxograma â€” Ciclo de Vendas", "ComercializaÃ§Ã£o & Vendas", "Comercial & Vendas", "-", "Rafael Souza", "Aprovado", "2026-05-18"],
    ["FLX.OPE.001", "Fluxograma â€” Ordem de ProduÃ§Ã£o", "ProduÃ§Ã£o & Entrega", "OperaÃ§Ãµes", "-", "PatrÃ­cia Lima", "Ativo", "2026-06-03"],
    ["FLX.FIN.001", "Fluxograma â€” Contas a Pagar", "GestÃ£o Financeira", "Financeiro & Controladoria", "-", "Bruno Cardoso", "Em revisÃ£o", "2026-06-19"],
    ["FLX.RH.001", "Fluxograma â€” Onboarding", "GestÃ£o de Pessoas", "Recursos Humanos", "-", "Juliana Castro", "Aprovado", "2026-04-25"],
    ["FLX.LOG.001", "Fluxograma â€” ExpediÃ§Ã£o", "LogÃ­stica & Supply Chain", "LogÃ­stica & Supply Chain", "-", "Marcos Oliveira", "Rascunho", "2026-06-22"],
  ],
};

function buildDemoModuleRows(moduleId: AteliamModule): ModuleGridRow[] {
  const tuples = DEMO_MODULE_ROW_DATA[moduleId] ?? [];
  const typeLabel = moduleId === "ddp" ? "Mapeamento" : moduleId === "pop" ? "Documento" : "Fluxo de atividades";
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
  savedDemoDocument: {
    id: string;
    workspace: WorkspaceState;
    updatedAt: string;
  } | null,
  isDemo: boolean,
) {
  const cloudRows = documents.map((document) => {
    const snapshot = parseWorkspace(document.content_inline);
    return moduleGridRowFromWorkspace(moduleId, snapshot, {
      id: document.id,
      status: "Ativo",
      updatedAt: document.updated_at,
    });
  });
  if (cloudRows.length) return cloudRows;
  if (isDemo) {
    // Documentos de demonstraÃ§Ã£o reais (preenchidos e encadeados ao registry).
    const realDocs = DEMO_DOCUMENTS[moduleId] ?? [];
    const realRows = realDocs.map((doc) =>
      moduleGridRowFromWorkspace(moduleId, doc.workspace, {
        id: doc.id,
        status: doc.status,
        updatedAt: doc.updatedAt,
      }),
    );
    // Para mÃ³dulos sem snapshots reais (ex.: fluxograma), mantÃ©m os cards de metadados.
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

const MODULE_STATUS_OPTIONS = ["Em andamento", "Em revisÃ£o", "Aprovado", "ConcluÃ­do"];
type ModuleGridSortDir = "asc" | "desc";
type ModuleGridColumn = keyof Pick<
  ModuleGridRow,
  "code" | "name" | "type" | "modalidade" | "process" | "area" | "owner" | "responsible" | "status" | "updatedAt"
>;

function ModuleSortGlyph({
  active,
  dir,
}: {
  active: boolean;
  dir: ModuleGridSortDir;
}) {
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
  return String(a[field] ?? "").localeCompare(String(b[field] ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  }) * sign;
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
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [sortField, setSortField] = useState<ModuleGridColumn>("updatedAt");
  const [sortDir, setSortDir] = useState<ModuleGridSortDir>("desc");
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
  const filtered = useMemo(() => {
    const normalized = normalizeLabel(query);
    return rows.filter((row) =>
      !normalized ? true : normalizeLabel(Object.values(row).join(" ")).includes(normalized),
    );
  }, [query, rows]);
  const columns =
    moduleId === "ddp"
      ? [
          ["code", "CÃ³digo"],
          ["name", "TÃ­tulo do mapeamento"],
          ["process", "Nome do processo"],
          ["modalidade", "Modalidade"],
          ["area", "Ãrea"],
          ["owner", "Dono do processo"],
          ["responsible", "Elaborador"],
          ["status", "Status"],
          ["updatedAt", "Ãšltima atualizaÃ§Ã£o"],
        ]
      : moduleId === "pop"
        ? [
            ["code", "CÃ³digo"],
            ["name", "Nome do documento"],
            ["type", "Tipo"],
            ["area", "Ãrea"],
            ["responsible", "ResponsÃ¡vel"],
            ["status", "Status"],
            ["updatedAt", "Ãšltima atualizaÃ§Ã£o"],
          ]
        : [
            ["code", "CÃ³digo"],
            ["name", "Nome do fluxo"],
            ["process", "Processo vinculado"],
            ["area", "Ãrea"],
            ["responsible", "ResponsÃ¡vel"],
            ["status", "Status"],
            ["updatedAt", "Ãšltima atualizaÃ§Ã£o"],
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

  function exportVisibleRows() {
    const workbookRows = [
      columns.map(([, label]) => label),
      ...sortedRows.map((row) =>
        columns.map(([key]) => {
          const value = row[key as keyof ModuleGridRow];
          return key === "updatedAt" ? formatDateTimeBr(value) : value;
        }),
      ),
    ];
    downloadBlob(
      `${moduleId}-consulta-${today()}.xlsx`,
      buildXlsxWorkbook([{ name: moduleDocumentLabel(moduleId), rows: workbookRows }]),
    );
    toast.success("Excel gerado com os registros exibidos.");
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
      toast.error(error instanceof Error ? error.message : "NÃƒÂ£o foi possÃƒÂ­vel excluir o registro.");
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
      toast.error(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel alterar o status.");
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
              processos Â· {moduleDocumentLabel(moduleId)}
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
            <button
              type="button"
              onClick={exportVisibleRows}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar para Excel
            </button>
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
                  checked={!!sortedRows.length && sortedRows.every((row) => selected.includes(row.id))}
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
                AÃ§Ãµes
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
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : null}
            {!loading
              ? sortedRows.map((row) => (
                  <tr
                    key={row.id}
                    onDoubleClick={() => onEdit(row)}
                    className={`border-t border-border ${
                      selected.includes(row.id) ? "bg-accent/70" : "bg-card hover:bg-muted/45"
                    }`}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Selecionar ${row.name}`}
                        checked={selected.includes(row.id)}
                        onChange={() => toggleRow(row.id)}
                      />
                    </td>
                    {columns.map(([key]) => {
                      const value = row[key as keyof ModuleGridRow];
                      if (key === "status" && (moduleId === "ddp" || moduleId === "pop")) {
                        const options = MODULE_STATUS_OPTIONS.includes(value)
                          ? MODULE_STATUS_OPTIONS
                          : [value, ...MODULE_STATUS_OPTIONS];
                        return (
                          <td key={key} className="px-3 py-3">
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
                        <td key={key} className="break-words px-3 py-3 text-foreground">
                          {key === "updatedAt" ? formatDateTimeBr(value) : value}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3">
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
        {sortedRows.length} registro(s) exibido(s) Â· {selected.length} selecionado(s)
      </footer>
      {pendingStatus ? (
        <Modal
          title="Alterar status do mapeamento"
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

  useEffect(() => {
    if (!menuOpen) return;
    function onDocClick(event: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const reportFormat: ExportFormat = moduleId === "ddp" ? "ddp-docx" : "pop-docx";
  // ApresentaÃ§Ã£o no formato padrÃ£o (HTML) â€” disponÃ­vel apenas para Mapeamento.
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
        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 z-20 mt-1 w-60 overflow-hidden rounded-md border border-border bg-popover shadow-lg"
          >
            <button type="button" role="menuitem" className={menuItem} onClick={() => run(onView)}>
              <Eye className="h-4 w-4 shrink-0" /> Visualizar
            </button>
            <button type="button" role="menuitem" className={menuItem} onClick={() => run(onEdit)}>
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
              <FileText className="h-4 w-4 shrink-0" /> RelatÃ³rio
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
                <Presentation className="h-4 w-4 shrink-0" /> ApresentaÃ§Ã£o
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
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DdpCausesModuleV2({
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
    // Inicializa o formulÃ¡rio de causa uma Ãºnica vez ao entrar no modo "new"
    // (guardado por initializedNew.current); depende apenas de `mode`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode === "edit" && selectedForEdit && !draft) {
      openEditCause(selectedForEdit);
    }
    // Reage Ã  mudanÃ§a de modo/seleÃ§Ã£o; usa selectedForEdit?.id de propÃ³sito
    // (identidade estÃ¡vel) e a guarda !draft evita reabrir sobre a ediÃ§Ã£o em curso.
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
      prioridade: "MÃ©dia",
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
      causa: draft.causa.trim() || "Causa sem nome",
      comentarios: draft.comentarios ?? [],
    };

    if (draft.id) {
      update({
        ...data,
        gaps: data.gaps.map((gap) => (gap.id === draft.id ? normalized : gap)),
      });
      toast.success("Causa atualizada.");
    } else {
      update({ ...data, gaps: [...data.gaps, normalized] });
      toast.success("Causa cadastrada.");
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
      toast.success(ids.length > 1 ? "Causas excluidas." : "Causa excluida.");
      setPendingDeleteIds([]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel excluir a causa.");
    } finally {
      setDeleteSaving(false);
    }
  }

  function exportRows(rows: GapItem[], fileName = `causas-${today()}.xlsx`) {
    downloadBlob(
      fileName,
      buildXlsxWorkbook([
        {
          name: "Causas",
          rows: [
            [
              "CÃ³digo",
              "Causa",
              "DescriÃ§Ã£o",
              "Impacto",
              "AÃ§Ã£o proposta",
              "ResponsÃ¡vel",
              "Prazo",
              "Prioridade",
              "Status",
              "ComentÃ¡rios",
              "Ãšltima atualizaÃ§Ã£o",
            ],
            ...rows.map((gap, index) => [
              causeCode(index),
              gap.causa,
              gap.descricao,
              gap.impacto,
              gap.acao,
              gap.responsavel || "-",
              formatGapDateRangeBr(gap.prazo) || "-",
              gap.prioridade,
              gap.status,
              gap.comentarios.length,
              lastUpdated(gap),
            ]),
          ],
        },
      ]),
    );
    toast.success("Excel gerado com os registros exibidos.");
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
                processos Â· mapeamento Â· causas
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
              <button
                type="button"
                onClick={() => exportRows(filtered)}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Exportar para Excel
              </button>
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
                    aria-label="Selecionar causas exibidas"
                    checked={
                      !!filtered.length && filtered.every((gap) => selectedIds.includes(gap.id))
                    }
                    onChange={(event) =>
                      setSelectedIds(event.target.checked ? filtered.map((gap) => gap.id) : [])
                    }
                  />
                </th>
                <th className="px-3 py-3 font-semibold">Origem</th>
                <th className="px-3 py-3 font-semibold">Causa reutilizÃ¡vel</th>
                <th className="px-3 py-3 font-semibold">Causa</th>
                <th className="px-3 py-3 font-semibold">DescriÃ§Ã£o</th>
                <th className="px-3 py-3 font-semibold">Impacto</th>
                <th className="px-3 py-3 font-semibold">AÃ§Ã£o proposta</th>
                <th className="px-3 py-3 font-semibold">ResponsÃ¡vel</th>
                <th className="px-3 py-3 font-semibold">Prazo</th>
                <th className="px-3 py-3 font-semibold">Prioridade</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="w-[160px] whitespace-nowrap px-4 py-3 text-right font-semibold">
                  AÃ§Ãµes
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
                  <td className="px-3 py-3 text-foreground">{gap.sharedCauseId ? "Sim" : "NÃ£o"}</td>
                  <td className="break-words px-3 py-3 font-medium text-foreground">
                    {gap.causa || "Causa sem nome"}
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
                  <td className="break-words px-3 py-3 text-foreground">{formatGapDateRangeBr(gap.prazo) || "-"}</td>
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
                        title="Exportar"
                        onClick={() => exportRows([gap], `causa-${causeCode(index)}-${today()}.xlsx`)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-foreground hover:bg-muted"
                      >
                        <Download className="h-4 w-4" />
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
          {filtered.length} registro(s) exibido(s) Â· {selectedIds.length} selecionado(s)
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
                {draft.id ? "Editar causa" : "Nova causa"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setCommentDraft("");
                }}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar"
                aria-label="Fechar formulÃ¡rio"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-3 md:col-span-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    Causa reutilizÃ¡vel da organizaÃ§Ã£o
                  </span>
                  <select
                    value={draft.sharedCauseId ?? ""}
                    onChange={(event) => applySharedCauseToDraft(event.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
                  >
                    <option value="">Causa local / nova</option>
                    {catalogs.causes.map((cause) => (
                      <option key={cause.id} value={cause.id}>
                        {cause.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Field label="Causa" value={draft.causa} onChange={(causa) => updateDraft({ causa })} />
              <Field
                label="ResponsÃ¡vel"
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
                label="DescriÃ§Ã£o"
                value={draft.descricao}
                onChange={(descricao) => updateDraft({ descricao })}
              />
              <TextArea
                label="Impacto"
                value={draft.impacto}
                onChange={(impacto) => updateDraft({ impacto })}
              />
              <TextArea
                label="AÃ§Ã£o proposta"
                value={draft.acao}
                onChange={(acao) => updateDraft({ acao })}
              />
            </div>

            <div className="rounded-lg border border-border bg-muted/35 p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-foreground" />
                <h3 className="text-sm font-semibold text-foreground">ComentÃ¡rios</h3>
              </div>
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                rows={4}
                placeholder="Registre uma atualizaÃ§Ã£o, decisÃ£o ou pendÃªncia da causa."
                className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={addComment}
                disabled={!commentDraft.trim()}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-foreground px-3 py-2.5 text-sm font-bold text-background hover:opacity-90 disabled:opacity-45"
              >
                Inserir comentÃ¡rio
              </button>
              <div className="mt-4 grid gap-2">
                {draft.comentarios.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-border bg-muted/20 p-3">
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
                    Nenhum comentÃ¡rio registrado.
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
              Salvar causa
            </button>
          </div>
          </div>
        </div>
      ) : null}
      {pendingDeleteIds.length ? (
        <Modal
          title="Excluir causas selecionadas"
          subtitle={`Confirma excluir ${pendingDeleteIds.length} causa(s) selecionada(s)?`}
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
    .split(/\s+(?:atÃ©|a)\s+|\|/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const isIsoDate = (part: string) => /^\d{4}-\d{2}-\d{2}$/.test(part);
  return {
    start: isIsoDate(parts[0] ?? "") ? parts[0] : "",
    end: isIsoDate(parts[1] ?? "") ? parts[1] : isIsoDate(parts[0] ?? "") ? parts[0] : "",
  };
}

function formatGapDateRange(start: string, end: string) {
  if (start && end && start !== end) return `${start} atÃ© ${end}`;
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <TableDateRange value={value} onChange={onChange} />
    </label>
  );
}

function TableDateRange({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const range = parseGapDateRange(value);
  return (
    <div className="grid min-w-[220px] gap-2 sm:grid-cols-2">
      <input
        type="date"
        value={range.start}
        aria-label="InÃ­cio do prazo"
        onChange={(event) => onChange(formatGapDateRange(event.target.value, range.end))}
        className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
      />
      <input
        type="date"
        value={range.end}
        aria-label="Fim do prazo"
        min={range.start || undefined}
        onChange={(event) => onChange(formatGapDateRange(range.start, event.target.value))}
        className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
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

function TableReadonly({
  value,
  multiline = false,
}: {
  value: string;
  multiline?: boolean;
}) {
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
  onProcessCreated,
  onSystemCreated,
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
  // Contador que incrementa a cada salvamento concluÃ­do com sucesso.
  savedNonce?: number;
  organizationId: string | null;
  isDemo: boolean;
  codeSettings: CodeSettings | null;
  // Persiste (nuvem: refetch; demo: adiciona ao catÃ¡logo) o processo recÃ©m-criado.
  onProcessCreated: (process: CreatedProcess) => Promise<void> | void;
  // Idem, para o sistema recÃ©m-cadastrado a partir de "Sistemas envolvidos".
  onSystemCreated: (system: OrganizationSystem) => Promise<void> | void;
}) {
  const [createProcessName, setCreateProcessName] = useState<string | null>(null);
  const [createSystemRequest, setCreateSystemRequest] = useState<{
    stepId: string;
    query: string;
  } | null>(null);
  const [libraryCauseRows, setLibraryCauseRows] = useState<Record<string, boolean>>({});
  const [causeSearch, setCauseSearch] = useState<Record<string, string>>({});
  const selectedProcess = useMemo(
    () => catalogs.processes.find((process) => process.id === data.macroprocess.processId) ?? null,
    [catalogs.processes, data.macroprocess.processId],
  );
  const primaryProcessOptions = useMemo(
    () =>
      catalogs.processes.filter((process) => process.status !== "Arquivado"),
    [catalogs.processes],
  );
  const flowProcessOptions = useMemo(() => {
    const allowedTypes = new Set(["process", "subprocess", "atividade", "tarefa"]);
    const base = catalogs.processes.filter(
      (process) => process.status !== "Arquivado" && allowedTypes.has(process.type),
    );
    if (!selectedProcess) return base;
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
    return base.filter((process) => branchIds.has(process.id));
  }, [catalogs.processes, selectedProcess]);

  // Cada etapa do fluxo AS IS comeÃ§a recolhida; o usuÃ¡rio expande quando precisa.
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const toggleStep = (stepId: string) =>
    setOpenSteps((current) => ({ ...current, [stepId]: !current[stepId] }));

  useEffect(() => {
    if (!currentElaborator || data.meta.elaborador.trim()) return;
    update({ ...data, meta: { ...data.meta, elaborador: currentElaborator } });
  }, [currentElaborator, data, update]);

  function findProcessValueChain(process: OrganizationProcess | null) {
    let current = process;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.value_chain_id) {
        return catalogs.valueChains.find((chain) => chain.id === current?.value_chain_id) ?? null;
      }
      current = current.parent_process_id
        ? catalogs.processes.find((item) => item.id === current?.parent_process_id) ?? null
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
    // NÃ£o contabilizamos campos preenchidos automaticamente (cÃ³digo, data de
    // hoje, modalidade e status jÃ¡ vÃªm com valor padrÃ£o) â€” sÃ³ os campos que
    // dependem do usuÃ¡rio entram no cÃ¡lculo de preenchimento.
    identification: completionPercent([
      data.meta.titulo,
      data.meta.elaborador,
      data.meta.revisor,
    ]),
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
          ...substep.images.flatMap((image) => [image.src, image.titulo, image.legenda]),
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

  // SeÃ§Ãµes na ordem exata do relatÃ³rio em Word â€” fonte Ãºnica para o Ã­ndice
  // lateral e para o medidor segmentado da barra de comando.
  const sections: MappingSectionInfo[] = [
    { key: "identification", num: "01", title: "Dados do Mapeamento", pct: sectionProgress.identification },
    { key: "overview", num: "02", title: "VisÃ£o geral", pct: sectionProgress.overview },
    { key: "systems", num: "03", title: "Sistemas envolvidos", pct: sectionProgress.systems },
    { key: "sipoc", num: "04", title: "AnÃ¡lise SIPOC", pct: sectionProgress.sipoc },
    { key: "flowStage", num: "05", title: "Fluxo AS IS", pct: sectionProgress.flowStage },
    { key: "gaps", num: "06", title: "Gaps e causas-raiz", pct: sectionProgress.gaps },
    { key: "nextSteps", num: "07", title: "PrÃ³ximos passos", pct: sectionProgress.nextSteps },
    { key: "glossary", num: "08", title: "GlossÃ¡rio", pct: sectionProgress.glossary },
  ];
  const overallPct = Math.round(
    sections.reduce((sum, section) => sum + section.pct, 0) / sections.length,
  );

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

  // Scrollspy: destaca no Ã­ndice a Ãºltima seÃ§Ã£o cujo topo jÃ¡ cruzou a linha
  // logo abaixo da barra de comando fixa (â‰ˆ a seÃ§Ã£o que estÃ¡ sendo lida).
  useEffect(() => {
    if (!selectedProcess) return;
    const sectionKeys = [
      "identification",
      "overview",
      "systems",
      "sipoc",
      "flowStage",
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
    // Captura scroll de qualquer contÃªiner (a pÃ¡gina usa scroll na janela, mas
    // capture=true garante que funcione mesmo se houver rolagem aninhada).
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProcess]);

  // Estado de salvamento honesto: marca "nÃ£o salvo" ao editar; limpa quando o
  // pai sinaliza um salvamento concluÃ­do (savedNonce). O salvamento pode alterar
  // o prÃ³prio documento (reserva de cÃ³digo) â€” a flag ignora essa mudanÃ§a.
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
  }, [savedNonce]);

  const saveState: "idle" | "dirty" | "saving" | "saved" = saving
    ? "saving"
    : dirty
      ? "dirty"
      : savedNonce
        ? "saved"
        : "idle";

  // Atalho âŒ˜S / Ctrl+S para salvar o preenchimento.
  useEffect(() => {
    if (!onSave) return;
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (selectedProcess) onSave?.();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onSave, selectedProcess]);

  function updateStep(stepId: string, patch: Partial<DdpFlowStep>) {
    update({
      ...data,
      steps: data.steps.map((item) => (item.id === stepId ? { ...item, ...patch } : item)),
    });
  }

  function updateSubstep(stepId: string, substepId: string, patch: Partial<DdpFlowSubstep>) {
    update({
      ...data,
      steps: data.steps.map((step) =>
        step.id === stepId
          ? {
              ...step,
              substeps: step.substeps.map((substep) =>
                substep.id === substepId ? { ...substep, ...patch } : substep,
              ),
            }
          : step,
      ),
    });
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
      {createProcessName !== null ? (
        <ProcessRegistrationDialog
          organizationId={organizationId}
          isDemo={isDemo}
          codeSettings={codeSettings}
          initialName={createProcessName}
          onClose={() => setCreateProcessName(null)}
          onCreated={async (process) => {
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
          onClose={() => setCreateSystemRequest(null)}
          onCreated={async (system) => {
            await onSystemCreated(system);
            const { stepId } = createSystemRequest;
            update({
              ...data,
              systems: data.systems.map((item) =>
                item.id === stepId
                  ? {
                      ...item,
                      systemId: system.id,
                      nome: system.name,
                      descricao: item.descricao || system.description || "",
                    }
                  : item,
              ),
            });
            setCreateSystemRequest(null);
          }}
        />
      ) : null}
      <FlowCommandBar
        code={data.meta.codigo}
        sections={sections}
        overallPct={overallPct}
        saveState={saveState}
        canSave={!!selectedProcess}
        onSave={onSave}
        onPreview={onPreview}
        eyebrow="Processos Â· Mapeamento"
        title="FormulÃ¡rio de Preenchimento"
        saveTitle="Salvar o preenchimento do mapeamento"
        previewTitle="Visualizar o que estÃ¡ sendo preenchido"
        processControl={
          <RegisteredProcessSelect
            required
            label="Processo do mapeamento"
            value={data.macroprocess.processId ?? ""}
            processes={primaryProcessOptions}
            placeholder="Selecione o processo que serÃ¡ mapeado"
            onSelect={selectPrimaryProcess}
            displayName={(process) => process.name}
            onRequestCreate={(name) => setCreateProcessName(name)}
          />
        }
      />
      {!selectedProcess ? (
        <div className="mt-2 grid place-items-center rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <div className="grid max-w-sm gap-2">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-accent text-[var(--gold)]">
              <Lock className="h-5 w-5" />
            </span>
            <h2 className="font-display text-lg font-bold text-foreground">
              Selecione um processo para comeÃ§ar
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Escolha, no campo acima, o processo cadastrado que serÃ¡ mapeado. As seÃ§Ãµes do
              relatÃ³rio serÃ£o liberadas em seguida.
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-2 grid gap-5 lg:grid-cols-[218px_minmax(0,1fr)] lg:items-start">
          <MappingSectionNav
            sections={sections}
            activeKey={activeSection}
            onSelect={goToSection}
          />
          <div className="grid min-w-0 gap-4">
      <Panel
        id="sec-identification"
        num="01"
        openSignal={openTarget === "identification" ? openNonce : 0}
        title="Dados do Mapeamento"
        progress={sectionProgress.identification}
        defaultOpen={!!selectedProcess}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {data.meta.codigo ? (
            <div className="md:col-span-3 rounded-xl border border-[color-mix(in_oklab,var(--gold)_45%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_10%,var(--card))] px-4 py-3 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-[color-mix(in_oklab,var(--gold)_80%,var(--foreground))]">
                    CÃ³digo gerado do mapeamento
                  </span>
                  <strong className="mt-1 block font-data text-2xl font-black tracking-[0.14em] text-foreground">
                    {data.meta.codigo}
                  </strong>
                </div>
                <span className="rounded-full border border-border bg-background px-3 py-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  Registro Ãºnico
                </span>
              </div>
            </div>
          ) : null}
          <Field
            label="TÃ­tulo do Mapeamento"
            value={data.meta.titulo}
            onChange={(titulo) => update({ ...data, meta: { ...data.meta, titulo } })}
          />
          {/* Ordem abaixo espelha a tabela de identificaÃ§Ã£o do relatÃ³rio Word
              (Tipo/Dono/Ãrea/Modalidade, Elaborador/Revisor/Data). Tipo, Dono e
              Ãrea sÃ£o automÃ¡ticos â€” nÃ£o editÃ¡veis aqui. */}
          <ReadOnlyField label="CÃ³digo do processo" value={selectedProcess?.code ?? ""} />
          <ReadOnlyField
            label="Cadeia de valor"
            value={
              data.legacy?.processValueChainName?.toString() ??
              findProcessValueChain(selectedProcess)?.name ??
              ""
            }
          />
          <ReadOnlyField label="Tipo" value="RelatÃ³rio de Mapeamento de Processo" />
          <ReadOnlyField label="Dono" value={selectedProcess?.owner ?? ""} />
          <ReadOnlyField label="Ãrea" value={selectedProcess?.department ?? ""} />
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
        title="VisÃ£o geral"
        progress={sectionProgress.overview}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea
            label="Objetivo"
            value={data.overview.objetivo}
            onChange={(objetivo) => update({ ...data, overview: { ...data.overview, objetivo } })}
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
        title="Sistemas envolvidos"
        progress={sectionProgress.systems}
      >
        <div className="grid gap-3">
          {data.systems.map((system) => (
            <div
              key={system.id}
              className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 lg:grid-cols-[1fr_auto]"
            >
              <RegisteredSystemSelect
                label="Sistema"
                value={system.systemId ?? ""}
                systems={catalogs.systems}
                placeholder="Buscar sistema cadastrado..."
                onSelect={(selectedSystem) =>
                  update({
                    ...data,
                    systems: data.systems.map((item) =>
                      item.id === system.id
                        ? {
                            ...item,
                            systemId: selectedSystem?.id ?? "",
                            nome: selectedSystem?.name ?? "",
                            descricao: item.descricao || selectedSystem?.description || "",
                          }
                        : item,
                    ),
                  })
                }
                onRequestCreate={(query) => setCreateSystemRequest({ stepId: system.id, query })}
              />
              <IconButton
                label="Excluir"
                onClick={() =>
                  update({ ...data, systems: data.systems.filter((item) => item.id !== system.id) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
              <div className="lg:col-span-2">
                <TextArea
                  label="DescriÃ§Ã£o / uso no processo"
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
                    tipo: "",
                    dono: "",
                    criticidade: "MÃ©dia",
                    descricao: "",
                  },
                ],
              })
            }
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
          >
            <Plus className="h-4 w-4" />
            Adicionar sistema
          </button>
        </div>
      </Panel>
      <Panel
        id="sec-sipoc"
        num="04"
        openSignal={openTarget === "sipoc" ? openNonce : 0}
        title="AnÃ¡lise SIPOC do processo"
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
                    label={field === "saidas" ? "SaÃ­das" : field}
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
        num="05"
        openSignal={openTarget === "flowStage" ? openNonce : 0}
        title="Fluxo AS IS â€” Etapas do processo"
        progress={sectionProgress.flowStage}
      >
        <div className="grid gap-5">
        <div>
        <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wide text-muted-foreground">
          Macroprocesso
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
            captionLabel="DescriÃ§Ã£o"
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
            <div key={step.id} className="rounded-lg border border-border bg-muted/20 p-3">
              <div className={`flex items-center gap-3 ${openSteps[step.id] ? "mb-3" : ""}`}>
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
                  />
                </div>
                <IconButton
                  label="Excluir"
                  onClick={() =>
                    update({ ...data, steps: data.steps.filter((item) => item.id !== step.id) })
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
                  captionLabel="DescriÃ§Ã£o"
                  images={step.images}
                  onChange={(images) => updateStep(step.id, { images })}
                />
                <div className="rounded-lg border border-border bg-card p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-foreground">Subetapas</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Detalhe subprocessos e adicione imagens especÃ­ficas quando necessÃ¡rio.
                      </div>
                    </div>
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
                              titulo: "Nova subetapa",
                              descricao: "",
                              images: [],
                            },
                          ],
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
                    >
                      <Plus className="h-4 w-4" />
                      Adicionar subetapa
                    </button>
                  </div>
                  {step.substeps.length ? (
                    <div className="grid gap-3">
                      {step.substeps.map((substep) => (
                        <div
                          key={substep.id}
                          className="rounded-lg border border-border bg-muted/20 p-3"
                        >
                          <div className="mb-3 grid gap-3 md:grid-cols-[120px_1fr_auto]">
                            <Field
                              compact
                              label="CÃ³digo"
                              value={substep.codigo}
                              onChange={(codigo) => updateSubstep(step.id, substep.id, { codigo })}
                            />
                            <Field
                              compact
                              label="TÃ­tulo"
                              value={substep.titulo}
                              onChange={(titulo) => updateSubstep(step.id, substep.id, { titulo })}
                            />
                            <IconButton
                              label="Excluir subetapa"
                              onClick={() =>
                                updateStep(step.id, {
                                  substeps: step.substeps.filter((item) => item.id !== substep.id),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                          <TextArea
                            label="DescriÃ§Ã£o da subetapa"
                            value={substep.descricao}
                            onChange={(descricao) =>
                              updateSubstep(step.id, substep.id, { descricao })
                            }
                          />
                          <div className="mt-3">
                            <ImageManager
                              label="Imagens da subetapa"
                              images={substep.images}
                              onChange={(images) => updateSubstep(step.id, substep.id, { images })}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
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
                steps: [
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
                ],
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
        id="sec-gaps"
        num="06"
        openSignal={openTarget === "gaps" ? openNonce : 0}
        title="Gaps e causas-raiz"
        progress={sectionProgress.gaps}
      >
        <div className="grid gap-3">
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="overflow-auto">
              <table className="w-full min-w-[1540px] border-collapse text-left text-sm">
                <thead className="bg-muted text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-3">Usar causa cadastrada?</th>
                    <th className="px-3 py-3">Causa cadastrada</th>
                    <th className="px-3 py-3">Causa</th>
                    <th className="px-3 py-3">DescriÃ§Ã£o</th>
                    <th className="px-3 py-3">Impacto</th>
                    <th className="px-3 py-3">AÃ§Ã£o proposta</th>
                    <th className="px-3 py-3">ResponsÃ¡vel</th>
                    <th className="px-3 py-3">Prazo</th>
                    <th className="px-3 py-3">Prioridade</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3 text-right">AÃ§Ãµes</th>
                  </tr>
                </thead>
                <tbody>
                  {data.gaps.map((gap) => {
                    const usesLibraryCause = libraryCauseRows[gap.id] ?? Boolean(gap.sharedCauseId);
                    const selectedCause = catalogs.causes.find((cause) => cause.id === gap.sharedCauseId);
                    const causeSearchValue = causeSearch[gap.id] ?? selectedCause?.title ?? "";

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
                                NÃ£o
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
                                ? "Dados bloqueados pela causa cadastrada."
                                : "Gap local/editavel neste mapeamento."}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          {usesLibraryCause ? (
                            <div className="grid min-w-[230px] gap-2">
                              <input
                                list={`gap-cause-options-${gap.id}`}
                                value={causeSearchValue}
                                onChange={(event) =>
                                  selectSharedCauseByTitle(gap.id, event.target.value)
                                }
                                placeholder="Pesquisar causa cadastrada"
                                className="w-full rounded-md border border-input bg-background px-2.5 py-2 text-xs font-semibold text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
                              />
                              <datalist id={`gap-cause-options-${gap.id}`}>
                                {catalogs.causes.map((cause) => (
                                  <option key={cause.id} value={cause.title} />
                                ))}
                              </datalist>
                              {!selectedCause ? (
                                <span className="text-[11px] text-muted-foreground">
                                  Selecione uma causa da lista para preencher os campos.
                                </span>
                              ) : null}
                            </div>
                          ) : (
                            <div className="min-w-[230px] rounded-md border border-dashed border-border bg-muted/25 px-2.5 py-2 text-xs text-muted-foreground">
                              Marque Sim para pesquisar uma causa existente.
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
                              placeholder="Nome da causa"
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
                              placeholder="Descreva a causa"
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
                              placeholder="AÃ§Ã£o proposta"
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
                              placeholder="ResponsÃ¡vel"
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
                    prioridade: "MÃ©dia",
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
        id="sec-nextSteps"
        num="07"
        openSignal={openTarget === "nextSteps" ? openNonce : 0}
        title="PrÃ³ximos passos"
        items={data.nextSteps}
        onChange={(nextSteps) => update({ ...data, nextSteps })}
        placeholder="PrÃ³xima aÃ§Ã£o recomendada"
        progress={sectionProgress.nextSteps}
      />
      <Panel
        id="sec-glossary"
        num="08"
        openSignal={openTarget === "glossary" ? openNonce : 0}
        title="GlossÃ¡rio"
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
                label="DefiniÃ§Ã£o"
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
                  update({ ...data, glossary: data.glossary.filter((row) => row.id !== item.id) })
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
          {/* Folga para que qualquer seÃ§Ã£o consiga alcanÃ§ar o topo (abaixo da
              barra fixa) ao ser aberta pelo Ã­ndice. */}
          <div aria-hidden className="h-[45vh]" />
          </div>
        </div>
      )}
      {pendingStatus ? (
        <Modal
          title="Alterar status do mapeamento"
          subtitle={`Confirma alterar o status de â€œ${data.meta.status || "Em andamento"}â€ para â€œ${pendingStatus}â€?`}
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
  update,
  onCatalogCreated,
  autoCode = false,
  codePreview = "",
  onSave,
  onPreview,
  saving = false,
  savedNonce = 0,
}: {
  data: PopState;
  catalogs: OrganizationCatalogs;
  organizationId?: string | null;
  update: (value: PopState) => void;
  onCatalogCreated?: () => Promise<void> | void;
  autoCode?: boolean;
  codePreview?: string;
  onSave?: () => void;
  onPreview?: () => void;
  saving?: boolean;
  savedNonce?: number;
}) {
  const saveArea = useServerFn(saveProcessArea);
  const savePosition = useServerFn(savePositionRegistration);
  const [quickCatalog, setQuickCatalog] = useState<
    | { kind: "area"; initial: string }
    | { kind: "position"; initial: string }
    | null
  >(null);
  const [quickAreaSigla, setQuickAreaSigla] = useState("");
  const [quickPositionDescription, setQuickPositionDescription] = useState("");
  const [activeSection, setActiveSection] = useState("identification");
  const [openSignals, setOpenSignals] = useState<Record<string, number>>({});
  const documentName = documentationTypeName(data.meta.tipo);
  const visibleCode = data.meta.codigo || codePreview;
  const departmentOptions = catalogs.departments.map((department) => department.name);
  const processOptions = catalogs.processes.map((process) =>
    process.code ? `${process.code} Â· ${process.name}` : process.name,
  );
  const publicOptions = Array.from(
    new Set(["PÃºblico interno", "Uso restrito", "Confidencial", data.meta.publico].filter(Boolean)),
  );
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
        ...(section.subitems ?? []).flatMap((subitem) => [
          subitem.code,
          subitem.title,
          ...subitem.clauses.flatMap((clause) => [
            clause.letter,
            clause.text,
            clause.alert,
            clause.images,
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
    { key: "identification", num: "00", title: "Dados do documento", pct: sectionProgress.identification },
    { key: "objective", num: "01", title: "Objetivo", pct: sectionProgress.objective },
    { key: "scope", num: "02", title: "AbrangÃªncia", pct: sectionProgress.scope },
    { key: "procedure", num: "03", title: "Procedimento operacional", pct: sectionProgress.sections },
    { key: "responsibilities", num: "04", title: "Responsabilidades", pct: sectionProgress.responsibilities },
    { key: "references", num: "05", title: "ReferÃªncias normativas", pct: sectionProgress.references },
    { key: "history", num: "06", title: "HistÃ³rico e alteraÃ§Ãµes", pct: sectionProgress.history },
  ];
  async function saveQuickCatalog() {
    if (!quickCatalog) return;
    try {
      if (quickCatalog.kind === "area") {
        const sigla = normalizeSigla(quickAreaSigla || quickCatalog.initial);
        if (sigla.length !== 3) {
          toast.error("Informe uma sigla de 3 letras para a Ã¡rea.");
          return;
        }
        await saveArea({
          data: {
            organizationId,
            name: quickCatalog.initial.trim(),
            sigla,
          },
        });
        toast.success("Ãrea cadastrada.");
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
      toast.error(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel cadastrar.");
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
        descricao: current?.descricao || (index === 0 ? "ElaboraÃ§Ã£o inicial do documento." : ""),
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
    // Normaliza apenas quando o tamanho/versÃµes mudam para evitar conflito de digitaÃ§Ã£o.
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

  function selectSection(key: string) {
    setActiveSection(key);
    setOpenSignals((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
    window.setTimeout(() => {
      document.getElementById(`pop-sec-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
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

  function updateSection(sectionId: string, patch: Partial<PopSection>) {
    update({
      ...data,
      sections: data.sections.map((item) => (item.id === sectionId ? { ...item, ...patch } : item)),
    });
  }

  function updateProcedureSubitem(
    sectionId: string,
    subitemId: string,
    patch: Partial<PopProcedureSubitem>,
  ) {
    update({
      ...data,
      sections: data.sections.map((section) =>
        section.id === sectionId
          ? {
              ...section,
              subitems: (section.subitems ?? []).map((subitem) =>
                subitem.id === subitemId ? { ...subitem, ...patch } : subitem,
              ),
            }
          : section,
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
      sections: data.sections.map((section) =>
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
    });
  }

  function nextClauseLetter(clauses: PopProcedureClause[]) {
    return String.fromCharCode(97 + clauses.length);
  }

  return (
    <div className="grid gap-5">
      <FlowCommandBar
        code={visibleCode}
        sections={sections}
        overallPct={completion}
        saveState={saveState}
        canSave
        onSave={onSave}
        onPreview={onPreview}
        eyebrow="Processos Â· DocumentaÃ§Ã£o"
        title="Preenchimento de documento"
        saveTitle="Salvar documento"
        previewTitle="Visualizar documento"
        processControl={
          <div className="grid gap-2">
            <div className="grid gap-2 sm:grid-cols-3">
              {DOCUMENTATION_TYPE_OPTIONS.map((tipo) => {
                const selected = tipo === data.meta.tipo;
                return (
                  <button
                    key={tipo}
                    type="button"
                    onClick={() => updateMeta({ tipo }, tipo !== data.meta.tipo)}
                    className={[
                      "rounded-lg border px-3 py-2 text-left transition",
                      selected
                        ? "border-[var(--gold)] bg-[color-mix(in_oklab,var(--gold)_18%,var(--card))] text-foreground shadow-sm"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    <span className="block text-xs font-black uppercase tracking-[0.16em] text-[var(--gold)]">
                      {tipo}
                    </span>
                    <span className="mt-1 block text-[12px] font-semibold leading-snug">
                      {documentationTypeName(tipo)}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
              {documentationTypeDescription(data.meta.tipo)}
            </p>
          </div>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[220px_minmax(0,1fr)]">
        <MappingSectionNav sections={sections} activeKey={activeSection} onSelect={selectSection} />
        <div className="grid gap-5">
      <Panel
        id="pop-sec-identification"
        num="00"
        title="Dados do documento"
        progress={sectionProgress.identification}
        defaultOpen
        openSignal={openSignals.identification}
      >
        <div className="grid gap-4">
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Identificação
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Dados usados no cabeçalho, nome do arquivo e rastreabilidade do documento.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
              {autoCode ? (
                <ReadOnlyField label="Código gerado" value={visibleCode} />
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
              <SelectField
                label="Classificação"
                value={data.meta.publico || publicOptions[0] || ""}
                options={publicOptions}
                onChange={(publico) => updateMeta({ publico })}
              />
              <div className="md:col-span-3">
                <Field
                  label={`Título do ${documentName}`}
                  value={data.meta.titulo}
                  onChange={(titulo) => updateMeta({ titulo })}
                />
              </div>
              <CatalogSearchField
                label="Área responsável"
                value={data.meta.area}
                options={departmentOptions}
                createLabel="Cadastrar área"
                onCreate={(initial) => {
                  setQuickCatalog({ kind: "area", initial });
                  setQuickAreaSigla(normalizeSigla(initial));
                }}
                onChange={(area) => updateMeta({ area }, area !== data.meta.area)}
              />
              <div className="md:col-span-2">
                <SearchOnlyField
                  label="Processo relacionado"
                  value={data.meta.processo}
                  options={processOptions}
                  placeholder="Pesquise pelo código ou nome do processo"
                  onChange={(processo) => updateMeta({ processo })}
                />
              </div>
            </div>
          </div>
          <div className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                Aprovação e vigência
              </div>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Responsáveis e datas que controlam emissão, validade e publicação.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-3">
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
                label="Vigência"
                type="date"
                value={data.meta.vigencia}
                onChange={(vigencia) => updateMeta({ vigencia })}
              />
              <Field
                label="Publicação"
                type="date"
                value={data.meta.publicacao}
                onChange={(publicacao) => updateMeta({ publicacao })}
              />
            </div>
          </div>
        </div>
      </Panel>
      <Panel
        id="pop-sec-objective"
        num="01"
        title="Objetivo"
        progress={sectionProgress.objective}
        openSignal={openSignals.objective}
      >
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Finalidade
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Declare o resultado esperado do documento. Evite repetir abrangência ou procedimento.
            </p>
          </div>
          <TextArea
            label="Objetivo"
            value={data.purpose.objetivo}
            rows={7}
            onChange={(objetivo) => update({ ...data, purpose: { ...data.purpose, objetivo } })}
          />
        </div>
      </Panel>
      <Panel
        id="pop-sec-scope"
        num="02"
        title="AbrangÃªncia"
        progress={sectionProgress.scope}
        openSignal={openSignals.scope}
      >
        <div className="grid gap-4 rounded-xl border border-border bg-card p-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Limites de aplicação
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Informe onde o documento se aplica, quem deve segui-lo e quais situações ficam fora.
            </p>
          </div>
          <TextArea
            label="AbrangÃªncia"
            value={data.purpose.abrangencia}
            rows={7}
            onChange={(abrangencia) =>
              update({ ...data, purpose: { ...data.purpose, abrangencia } })
            }
          />
        </div>
      </Panel>
      <Panel
        id="pop-sec-procedure"
        num="03"
        title="Procedimento operacional"
        progress={sectionProgress.sections}
        openSignal={openSignals.procedure}
      >
        <div className="grid gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Estrutura do procedimento
            </div>
            <div className="mt-3 grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <strong className="block text-foreground">3.1 Item</strong>
                Agrupa uma etapa principal do procedimento.
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <strong className="block text-foreground">3.1.1 Subitem</strong>
                Detalha a etapa em ações executáveis.
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <strong className="block text-foreground">a) Alínea</strong>
                Recebe texto, alerta e imagens operacionais.
              </div>
            </div>
          </div>
          {data.sections.map((section) => (
            <div key={section.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="mb-3 grid gap-3 md:grid-cols-[100px_1fr_auto]">
                <Field
                  compact
                  label="Item"
                  value={section.code ?? ""}
                  onChange={(code) => updateSection(section.id, { code })}
                />
                <Field
                  compact
                  label="TÃ­tulo do item"
                  value={section.title.replace(/^3\.\d+\s*/, "")}
                  onChange={(title) => updateSection(section.id, { title })}
                />
                <IconButton
                  label="Excluir item"
                  onClick={() =>
                    update({
                      ...data,
                      sections: data.sections.filter((item) => item.id !== section.id),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="grid gap-3">
                {(section.subitems ?? []).map((subitem) => (
                  <div key={subitem.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-3 grid gap-3 md:grid-cols-[120px_1fr_auto]">
                      <Field
                        compact
                        label="Subitem"
                        value={subitem.code}
                        onChange={(code) => updateProcedureSubitem(section.id, subitem.id, { code })}
                      />
                      <Field
                        compact
                        label="TÃ­tulo do subitem"
                        value={subitem.title}
                        onChange={(title) => updateProcedureSubitem(section.id, subitem.id, { title })}
                      />
                      <IconButton
                        label="Excluir subitem"
                        onClick={() =>
                          updateSection(section.id, {
                            subitems: (section.subitems ?? []).filter((item) => item.id !== subitem.id),
                          })
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </IconButton>
                    </div>
                    <div className="grid gap-3">
                      {subitem.clauses.map((clause) => (
                        <div key={clause.id} className="rounded-lg border border-border bg-muted/20 p-3">
                          <div className="mb-3 grid gap-3 md:grid-cols-[80px_1fr_auto]">
                            <Field
                              compact
                              label="AlÃ­nea"
                              value={clause.letter}
                              onChange={(letter) =>
                                updateProcedureClause(section.id, subitem.id, clause.id, { letter })
                              }
                            />
                            <TextArea
                              label="Texto da alÃ­nea"
                              value={clause.text}
                              rows={3}
                              onChange={(text) =>
                                updateProcedureClause(section.id, subitem.id, clause.id, { text })
                              }
                            />
                            <IconButton
                              label="Excluir alÃ­nea"
                              onClick={() =>
                                updateProcedureSubitem(section.id, subitem.id, {
                                  clauses: subitem.clauses.filter((item) => item.id !== clause.id),
                                })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          </div>
                          <div className="grid gap-3">
                            <TextArea
                              label="Alerta / observaÃ§Ã£o crÃ­tica"
                              value={clause.alert}
                              rows={2}
                              onChange={(alert) =>
                                updateProcedureClause(section.id, subitem.id, clause.id, { alert })
                              }
                            />
                            <ImageManager
                              label="Imagens da alÃ­nea"
                              images={clause.images}
                              onChange={(images) =>
                                updateProcedureClause(section.id, subitem.id, clause.id, { images })
                              }
                            />
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() =>
                          updateProcedureSubitem(section.id, subitem.id, {
                            clauses: [
                              ...subitem.clauses,
                              {
                                id: id("clause"),
                                letter: nextClauseLetter(subitem.clauses),
                                text: "",
                                alert: "",
                                images: [],
                              },
                            ],
                          })
                        }
                        className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar alÃ­nea
                      </button>
                    </div>
                  </div>
                ))}
                {!(section.subitems ?? []).length ? (
                  <div className="rounded-lg border border-dashed border-border bg-muted/30 p-5 text-sm text-muted-foreground">
                    Nenhum subitem criado. Adicione o primeiro subitem para registrar as ações
                    executáveis deste item.
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    updateSection(section.id, {
                      subitems: [
                        ...(section.subitems ?? []),
                        {
                          id: id("sub"),
                          code: `${section.code || `3.${data.sections.indexOf(section) + 1}`}.${(section.subitems ?? []).length + 1}`,
                          title: "Novo subitem",
                          clauses: [{ id: id("clause"), letter: "a", text: "", alert: "", images: [] }],
                        },
                      ],
                    })
                  }
                  className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
                >
                  <Plus className="h-4 w-4" />
                  Adicionar subitem
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={() =>
              update({
                ...data,
                sections: [
                  ...data.sections,
                  {
                    id: id("sec"),
                    code: `3.${data.sections.length + 1}`,
                    title: "Novo item",
                    description: "",
                    body: "",
                    records: "",
                    risks: "",
                    images: [],
                    subitems: [],
                  },
                ],
              })
            }
            className="inline-flex w-fit items-center gap-2 rounded-lg border border-dashed border-[color-mix(in_oklab,var(--gold)_50%,var(--border))] bg-[color-mix(in_oklab,var(--gold)_7%,transparent)] px-3.5 py-2 text-[13px] font-semibold text-[color-mix(in_oklab,var(--gold)_78%,var(--foreground))] transition hover:border-[var(--gold)] hover:bg-[color-mix(in_oklab,var(--gold)_14%,transparent)]"
          >
            <Plus className="h-4 w-4" />
            Adicionar item do procedimento
          </button>
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
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Matriz de responsabilidade
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Selecione a área, selecione ou cadastre o cargo e descreva somente a responsabilidade
              daquele papel no documento.
            </p>
          </div>
          <div className="hidden rounded-t-lg border border-border bg-muted/50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground md:grid md:grid-cols-[220px_220px_1fr_44px]">
            <span>Ãrea</span>
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
                label="Ãrea"
                value={row.area}
                options={catalogs.departments.map((department) => department.name)}
                createLabel="Cadastrar Ã¡rea"
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
                    responsibilities: data.responsibilities.filter((item) => item.id !== row.id),
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
        title="ReferÃªncias normativas"
        progress={sectionProgress.references}
        openSignal={openSignals.references}
      >
        <div className="grid gap-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Documentos de apoio
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Informe normas, políticas, legislações ou documentos internos que sustentam este
              procedimento.
            </p>
          </div>
          {data.references.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[1fr_auto]"
            >
              <div className="grid gap-3 md:grid-cols-[160px_1fr]">
                <Field
                  compact
                  label="CÃ³digo"
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
                  label="TÃ­tulo"
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
            Adicionar referÃªncia
          </button>
        </div>
      </Panel>
      <Panel
        id="pop-sec-history"
        num="06"
        title="HistÃ³rico e controle de alteraÃ§Ãµes"
        progress={sectionProgress.history}
        openSignal={openSignals.history}
      >
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            Controle de revisão
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Cada linha do histórico cria automaticamente a versão correspondente em alterações. A
            numeração começa em 00 e segue a ordem das linhas.
          </p>
        </div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">HistÃ³rico</h3>
        <div className="grid gap-3">
          {data.history.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 lg:grid-cols-[120px_100px_140px_1fr_1fr_1fr_auto]"
            >
              <Field
                compact
                label="CÃ³digo"
                value={row.codigo}
                onChange={(codigo) =>
                  setHistory(
                    data.history.map((item) =>
                      item.id === row.id ? { ...item, codigo } : item,
                    ),
                  )
                }
              />
              <ReadOnlyField label="VersÃ£o" value={historyVersion(data.history.findIndex((item) => item.id === row.id))} />
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
                onClick={() =>
                  setHistory(data.history.filter((item) => item.id !== row.id))
                }
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
            Adicionar histÃ³rico
          </button>
        </div>
        <h3 className="mb-3 mt-6 text-sm font-semibold text-foreground">AlteraÃ§Ãµes</h3>
        <div className="grid gap-3">
          {data.changes.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-border bg-muted/20 p-3 md:grid-cols-[120px_220px_1fr]"
            >
              <ReadOnlyField label="VersÃ£o" value={historyVersion(data.changes.findIndex((item) => item.id === row.id))} />
              <Field
                compact
                label="Local da revisÃ£o"
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
                label="DescriÃ§Ã£o"
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
            As linhas de alteraÃ§Ã£o sÃ£o geradas automaticamente a partir do histÃ³rico.
          </p>
        </div>
      </Panel>
          <div aria-hidden className="h-[35vh]" />
        </div>
      </div>
      {quickCatalog ? (
        <Modal
          title={quickCatalog.kind === "area" ? "Cadastrar Ã¡rea" : "Cadastrar cargo"}
          subtitle={
            quickCatalog.kind === "area"
              ? "Cadastro utilizado pelos formulÃ¡rios e pela codificaÃ§Ã£o de documentos."
              : "Cadastro utilizado nas responsabilidades dos documentos."
          }
          onClose={() => setQuickCatalog(null)}
        >
          <div className="grid gap-4">
            <Field
              label={quickCatalog.kind === "area" ? "Nome da Ã¡rea" : "TÃ­tulo do cargo"}
              value={quickCatalog.initial}
              onChange={(initial) => setQuickCatalog({ ...quickCatalog, initial })}
            />
            {quickCatalog.kind === "area" ? (
              <Field
                label="Sigla"
                value={quickAreaSigla}
                onChange={(value) =>
                  setQuickAreaSigla(value.replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 3))
                }
              />
            ) : (
              <TextArea
                label="DescriÃ§Ã£o"
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

function BpmnModule({
  data,
  update,
  autoCode = false,
  codePreview = "",
}: {
  data: BpmnState;
  update: (value: BpmnState) => void;
  autoCode?: boolean;
  codePreview?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [dragging, setDragging] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const selected = data.nodes.find((node) => node.id === selectedId) ?? null;
  const diagramProgress = completionPercent([data.poolName, data.lanes, data.nodes, data.flows]);

  function point(event: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function addNode(type: BpmnNodeType) {
    const next: BpmnNode = {
      id: id(type),
      type,
      label:
        type === "start"
          ? "InÃ­cio"
          : type === "end"
            ? "Fim"
            : type === "gateway"
              ? "DecisÃ£o"
              : "Nova tarefa",
      x: 160 + data.nodes.length * 40,
      y: data.nodes.length % 2 === 0 ? 130 : 315,
      lane: data.nodes.length % 2 === 0 ? 0 : 1,
    };
    update({ ...data, nodes: [...data.nodes, next] });
    setSelectedId(next.id);
  }

  function deleteSelected() {
    if (!selectedId) return;
    update({
      ...data,
      nodes: data.nodes.filter((node) => node.id !== selectedId),
      flows: data.flows.filter((flow) => flow.from !== selectedId && flow.to !== selectedId),
    });
    setSelectedId(null);
    setConnectFrom(null);
  }

  function handleNodeClick(node: BpmnNode) {
    if (connectFrom && connectFrom !== node.id) {
      update({
        ...data,
        flows: [...data.flows, { id: id("flow"), from: connectFrom, to: node.id }],
      });
      setConnectFrom(null);
      setSelectedId(node.id);
      return;
    }
    setSelectedId(node.id);
  }

  function exportSvg() {
    const svg = svgRef.current?.outerHTML ?? "";
    downloadText(`bf-flow-fluxograma-${today()}.svg`, svg, "image/svg+xml");
  }

  function exportBpmnXml() {
    const xml = `<definitions id="BF_Flow_Fluxograma" targetNamespace="https://bf-flow.local/fluxograma">
  <process id="Process_1" name="${escapeXml(data.poolName)}">
${data.nodes.map((node) => `    <${node.type === "start" ? "startEvent" : node.type === "end" ? "endEvent" : node.type === "gateway" ? "exclusiveGateway" : "task"} id="${node.id}" name="${escapeXml(node.label)}" />`).join("\n")}
${data.flows.map((flow) => `    <sequenceFlow id="${flow.id}" sourceRef="${flow.from}" targetRef="${flow.to}" name="${escapeXml(flow.label ?? "")}" />`).join("\n")}
  </process>
</definitions>`;
    downloadText(`bf-flow-fluxograma-${today()}.xml`, xml, "application/xml");
  }

  return (
    <div className="grid gap-5">
      <Hero
        title="Editor de fluxograma"
        eyebrow="Processos Â· Fluxograma"
        progress={data.nodes.length ? 100 : 0}
      >
        Um modelador visual leve para desenhar fluxo, movimentar elementos e exportar o diagrama.
      </Hero>
      <Panel title="Ãrea de desenho" progress={diagramProgress}>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <ToolbarButton onClick={() => addNode("start")} icon={<Circle className="h-4 w-4" />}>
            Evento inicial
          </ToolbarButton>
          <ToolbarButton onClick={() => addNode("task")} icon={<Square className="h-4 w-4" />}>
            Tarefa
          </ToolbarButton>
          <ToolbarButton onClick={() => addNode("gateway")} icon={<Diamond className="h-4 w-4" />}>
            Gateway
          </ToolbarButton>
          <ToolbarButton onClick={() => addNode("end")} icon={<Circle className="h-4 w-4" />}>
            Evento final
          </ToolbarButton>
          <ToolbarButton
            onClick={() => selectedId && setConnectFrom(selectedId)}
            icon={<GitBranch className="h-4 w-4" />}
          >
            Conectar
          </ToolbarButton>
          <ToolbarButton onClick={deleteSelected} icon={<Trash2 className="h-4 w-4" />}>
            Excluir
          </ToolbarButton>
          <div className="flex-1" />
          <ToolbarButton onClick={exportBpmnXml} icon={<Download className="h-4 w-4" />}>
            XML
          </ToolbarButton>
          <ToolbarButton onClick={exportSvg} icon={<Download className="h-4 w-4" />}>
            SVG
          </ToolbarButton>
        </div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="overflow-hidden rounded-lg border border-[#d2d2d7] bg-white">
            <svg
              ref={svgRef}
              viewBox="0 0 1000 520"
              className="h-[520px] w-full touch-none bg-[#fbfaf6]"
              onPointerMove={(event) => {
                if (!dragging) return;
                const p = point(event);
                update({
                  ...data,
                  nodes: data.nodes.map((node) =>
                    node.id === dragging.id
                      ? {
                          ...node,
                          x: Math.max(40, Math.min(930, p.x - dragging.dx)),
                          y: Math.max(80, Math.min(445, p.y - dragging.dy)),
                          lane: p.y > 260 ? 1 : 0,
                        }
                      : node,
                  ),
                });
              }}
              onPointerUp={() => setDragging(null)}
              onPointerLeave={() => setDragging(null)}
            >
              <defs>
                <marker id="arrow" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M0,0 L8,4 L0,8 Z" fill="#3f3f46" />
                </marker>
              </defs>
              <rect
                x="20"
                y="40"
                width="960"
                height="440"
                rx="18"
                fill="#ffffff"
                stroke="#d2d2d7"
              />
              <rect
                x="20"
                y="40"
                width="120"
                height="440"
                rx="18"
                fill="#f5f5f7"
                stroke="#d2d2d7"
              />
              <line x1="20" x2="980" y1="260" y2="260" stroke="#d2d2d7" />
              <text x="52" y="70" fontSize="14" fontWeight="700" fill="#3f3f46">
                {data.poolName}
              </text>
              <text x="52" y="150" fontSize="13" fontWeight="700" fill="#566056">
                {data.lanes[0]}
              </text>
              <text x="52" y="345" fontSize="13" fontWeight="700" fill="#566056">
                {data.lanes[1]}
              </text>
              {data.flows.map((flow) => {
                const from = data.nodes.find((node) => node.id === flow.from);
                const to = data.nodes.find((node) => node.id === flow.to);
                if (!from || !to) return null;
                return (
                  <g key={flow.id}>
                    <line
                      x1={from.x + 45}
                      y1={from.y + 24}
                      x2={to.x + 5}
                      y2={to.y + 24}
                      stroke="#3f3f46"
                      strokeWidth="2"
                      markerEnd="url(#arrow)"
                    />
                    {flow.label ? (
                      <text
                        x={(from.x + to.x) / 2 + 26}
                        y={(from.y + to.y) / 2 + 14}
                        fontSize="11"
                        fill="#3f3f46"
                      >
                        {flow.label}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              {data.nodes.map((node) => (
                <BpmnShape
                  key={node.id}
                  node={node}
                  selected={node.id === selectedId}
                  connecting={node.id === connectFrom}
                  onPointerDown={(event) => {
                    event.stopPropagation();
                    const p = point(event as React.PointerEvent<SVGSVGElement>);
                    setDragging({ id: node.id, dx: p.x - node.x, dy: p.y - node.y });
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    handleNodeClick(node);
                  }}
                />
              ))}
            </svg>
          </div>
          <div className="rounded-lg border border-[#d2d2d7] bg-white/90 p-4">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.16em] text-[#6e6e73]">
              Propriedades
            </h3>
            <Field
              label="Nome da piscina"
              value={data.poolName}
              onChange={(poolName) => update({ ...data, poolName })}
            />
            <div className="mt-3">
              <Field
                label="Ãrea responsÃ¡vel"
                value={data.area ?? ""}
                onChange={(area) => update({ ...data, area })}
              />
            </div>
            <div className="mt-3">
              {autoCode ? (
                <ReadOnlyField label="CÃ³digo (automÃ¡tico)" value={data.codigo || codePreview} />
              ) : (
                <Field
                  label="CÃ³digo"
                  value={data.codigo ?? ""}
                  onChange={(codigo) => update({ ...data, codigo })}
                />
              )}
            </div>
            <div className="mt-3 grid gap-3">
              <Field
                label="Raia 1"
                value={data.lanes[0]}
                onChange={(value) => update({ ...data, lanes: [value, data.lanes[1]] })}
              />
              <Field
                label="Raia 2"
                value={data.lanes[1]}
                onChange={(value) => update({ ...data, lanes: [data.lanes[0], value] })}
              />
            </div>
            {selected ? (
              <div className="mt-5 border-t border-[#d2d2d7] pt-4">
                <Field
                  label="Texto do elemento"
                  value={selected.label}
                  onChange={(label) =>
                    update({
                      ...data,
                      nodes: data.nodes.map((node) =>
                        node.id === selected.id ? { ...node, label } : node,
                      ),
                    })
                  }
                />
                <div className="mt-3 text-xs text-[#6e6e73]">
                  Selecione um elemento, clique em <strong>Conectar</strong> e depois clique no
                  destino.
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-lg bg-[#f5f5f7] p-3 text-sm text-[#6e6e73]">
                Clique em um elemento do diagrama para editar.
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function BpmnShape({
  node,
  selected,
  connecting,
  onPointerDown,
  onClick,
}: {
  node: BpmnNode;
  selected: boolean;
  connecting: boolean;
  onPointerDown: (event: React.PointerEvent<SVGGElement>) => void;
  onClick: (event: React.MouseEvent<SVGGElement>) => void;
}) {
  const stroke = connecting ? "#d6a33f" : selected ? "#3f3f46" : "#3f3f46";
  const common = { fill: "#ffffff", stroke, strokeWidth: selected || connecting ? 3 : 2 };
  return (
    <g onPointerDown={onPointerDown} onClick={onClick} className="cursor-move">
      {node.type === "task" ? (
        <rect x={node.x} y={node.y} width="120" height="58" rx="10" {...common} />
      ) : null}
      {node.type === "gateway" ? (
        <path
          d={`M${node.x + 45},${node.y} L${node.x + 90},${node.y + 45} L${node.x + 45},${node.y + 90} L${node.x},${node.y + 45} Z`}
          {...common}
        />
      ) : null}
      {node.type === "start" ? (
        <circle cx={node.x + 35} cy={node.y + 35} r="31" {...common} />
      ) : null}
      {node.type === "end" ? (
        <circle
          cx={node.x + 35}
          cy={node.y + 35}
          r="31"
          fill="#ffffff"
          stroke={stroke}
          strokeWidth={selected ? 5 : 4}
        />
      ) : null}
      <text
        x={node.x + (node.type === "task" ? 60 : 35)}
        y={node.y + (node.type === "gateway" ? 50 : 40)}
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="#3f3f46"
      >
        {node.label.length > 18 ? `${node.label.slice(0, 18)}...` : node.label}
      </text>
    </g>
  );
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
  // Ã‚ncora para navegaÃ§Ã£o pelo Ã­ndice do relatÃ³rio.
  id?: string;
  // NÃºmero da seÃ§Ã£o (ordem do relatÃ³rio) â€” exibido num selo Ã  esquerda.
  num?: string;
  // Sinal externo (nÃºmero crescente) que forÃ§a a abertura do painel â€” usado
  // quando o usuÃ¡rio clica na seÃ§Ã£o no Ã­ndice lateral.
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
                {complete ? "SeÃ§Ã£o concluÃ­da" : progress > 0 ? "Em preenchimento" : "NÃ£o iniciada"}
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

// â”€â”€â”€ FormulÃ¡rio de Mapeamento: barra de comando fixa + Ã­ndice do relatÃ³rio â”€â”€â”€â”€

type MappingSectionInfo = { key: string; num: string; title: string; pct: number };

// Barra fixa no topo do formulÃ¡rio de mapeamento: identidade do documento,
// medidor de progresso segmentado (uma marca por seÃ§Ã£o), estado de salvamento e
// as aÃ§Ãµes Salvar / Visualizar sempre acessÃ­veis.
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
      ? "Salvandoâ€¦"
      : saveState === "dirty"
        ? "AlteraÃ§Ãµes nÃ£o salvas"
        : saveState === "saved"
          ? "Tudo salvo"
          : "";
  return (
    <div className="sticky top-14 z-30 -mx-5 border-b border-border bg-[color-mix(in_oklab,var(--card)_88%,transparent)] px-5 py-3 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
            {eyebrow}
          </div>
          <h1 className="mt-0.5 flex items-baseline gap-2.5 font-display text-lg font-bold text-foreground md:text-xl">
            {title}
            {code ? <span className="font-data text-xs font-semibold text-muted-foreground">{code}</span> : null}
          </h1>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-3" title="Preenchimento por seÃ§Ã£o">
          <div className="flex gap-[3px]">
            {sections.map((s) => (
              <span
                key={s.key}
                title={`${s.num} ${s.title} Â· ${s.pct}%`}
                className={[
                  "h-2 w-3.5 rounded-[3px] transition-colors",
                  s.pct >= 100
                    ? "bg-emerald-500"
                    : s.pct > 0
                      ? "bg-[var(--gold)]"
                      : "bg-border",
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
          {stateLabel ? (
            <div className="hidden text-right sm:block">
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
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3.5 text-sm font-semibold text-foreground transition hover:bg-muted disabled:opacity-45"
              title={previewTitle}
            >
              <Eye className="h-4 w-4" />
              Visualizar
            </button>
          ) : null}
          {onSave ? (
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="relative inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-45"
              title={saveTitle}
            >
              {saveState === "dirty" && canSave ? (
                <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-[var(--gold)] ring-2 ring-card" />
              ) : null}
              <Save className="h-4 w-4" />
              Salvar
            </button>
          ) : null}
        </div>
      </div>
      <div className="mt-3 max-w-xl">{processControl}</div>
    </div>
  );
}

// Ãndice lateral do relatÃ³rio: lista as seÃ§Ãµes na ordem em que aparecem no
// documento (a mesma do Word), com o estado de preenchimento de cada uma.
function MappingSectionNav({
  sections,
  activeKey,
  onSelect,
}: {
  sections: MappingSectionInfo[];
  activeKey: string;
  onSelect: (key: string) => void;
}) {
  const done = sections.filter((s) => s.pct >= 100).length;
  return (
    <nav className="sticky top-[16.5rem] hidden lg:block" aria-label="Ãndice do relatÃ³rio">
      <div className="mb-3 ml-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/70">
        Ãndice do relatÃ³rio
      </div>
      <ul className="grid gap-0.5">
        {sections.map((s) => {
          const active = s.key === activeKey;
          return (
            <li key={s.key}>
              <button
                type="button"
                onClick={() => onSelect(s.key)}
                className={[
                  "grid w-full grid-cols-[20px_1fr_auto] items-center gap-2.5 rounded-md border-l-2 py-2 pl-2 pr-2.5 text-left transition",
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
                <span className={`truncate text-[12.5px] ${active ? "font-bold" : "font-medium"}`}>
                  {s.title}
                </span>
                <MappingSectionDot pct={s.pct} />
              </button>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 ml-1 flex items-center justify-between border-t border-border/70 pt-3 text-[11.5px] text-muted-foreground">
        <span>SeÃ§Ãµes concluÃ­das</span>
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
  // Abre o cadastro de um novo processo (prÃ©-preenchendo o nome pesquisado).
  onRequestCreate?: (query: string) => void;
}) {
  const selected = processes.find((process) => process.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
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
    // Sincroniza o texto ao fechar; usa selected?.id de propÃ³sito (identidade estÃ¡vel).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selected?.id, displayName]);

  return (
    <div className="relative">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          required={required}
          value={open ? query : selected ? displayName(selected) : ""}
          placeholder={placeholder}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
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
            title="Limpar seleÃ§Ã£o"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          {filtered.length ? (
            filtered.map((process) => (
              <button
                type="button"
                key={process.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(process);
                  setOpen(false);
                }}
                className="grid w-full gap-1 rounded-md border border-transparent px-3 py-2.5 text-left text-sm hover:border-border hover:bg-muted"
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
                  <span className="truncate">{process.code || "Sem cÃ³digo"}</span>
                  <span className="truncate">{process.department || "Sem Ã¡rea"}</span>
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

// Mesma lÃ³gica de busca + cadastro rÃ¡pido do RegisteredProcessSelect, aplicada
// ao catÃ¡logo de sistemas (Cadastros â†’ Sistemas).
function RegisteredSystemSelect({
  label,
  value,
  systems,
  onSelect,
  placeholder = "Buscar sistema cadastrado...",
  onRequestCreate,
}: {
  label: string;
  value: string;
  systems: OrganizationSystem[];
  onSelect: (system: OrganizationSystem | null) => void;
  placeholder?: string;
  // Abre o cadastro de um novo sistema (prÃ©-preenchendo o nome pesquisado).
  onRequestCreate?: (query: string) => void;
}) {
  const selected = systems.find((system) => system.id === value) ?? null;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const normalizedQuery = normalizeLabel(query);
  const filtered = useMemo(() => {
    if (!normalizedQuery) return systems.slice(0, 12);
    return systems
      .filter((system) =>
        normalizeLabel([system.name, system.description].join(" ")).includes(normalizedQuery),
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

  return (
    <div className="relative">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={open ? query : (selected?.name ?? "")}
          placeholder={placeholder}
          onFocus={() => {
            setQuery("");
            setOpen(true);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
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
            title="Limpar seleÃ§Ã£o"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg">
          {filtered.length ? (
            filtered.map((system) => (
              <button
                type="button"
                key={system.id}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onSelect(system);
                  setOpen(false);
                }}
                className="grid w-full gap-1 rounded-md border border-transparent px-3 py-2.5 text-left text-sm hover:border-border hover:bg-muted"
              >
                <span className="truncate font-semibold text-foreground">{system.name}</span>
                {system.description ? (
                  <span className="truncate text-xs text-muted-foreground">
                    {system.description}
                  </span>
                ) : null}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">
              Nenhum sistema encontrado.
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
              Cadastrar novo sistema{query.trim() ? ` "${query.trim()}"` : ""}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

// Linguagem visual Ãºnica dos campos do formulÃ¡rio: mesma altura, foco em
// dourado, hover discreto no contorno. MantÃ©m o comportamento â€” sÃ³ refina a
// aparÃªncia e a consistÃªncia entre as seÃ§Ãµes.
const fieldLabelClass =
  "mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground/90";
const fieldInputBase =
  "w-full rounded-lg border border-input bg-background text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 hover:border-[color-mix(in_oklab,var(--foreground)_22%,var(--input))] focus:border-[var(--gold)] focus:ring-[3px] focus:ring-[var(--gold)]/18";

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  // Campo preenchido automaticamente pelo cadastro â€” visualmente "travado".
  return (
    <label className="block">
      <span className={fieldLabelClass}>
        <Lock className="h-3 w-3" />
        {label}
        <span className="font-medium normal-case italic opacity-70">Â· do cadastro</span>
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  compact?: boolean;
}) {
  const isDate = type === "date";
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <input
        type={isDate ? "text" : type}
        inputMode={isDate ? "numeric" : undefined}
        placeholder={isDate ? "dd/mm/aaaa" : undefined}
        value={isDate ? formatDateBr(value) : value}
        onChange={(event) => onChange(isDate ? parseDateBrInput(event.target.value) : event.target.value)}
        className={`${fieldInputBase} px-3 ${compact ? "h-9" : "h-10"}`}
      />
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
  const listId = useRef(`user-options-${id("list")}`);
  const uniqueOptions = useMemo(() => Array.from(new Set(options.filter(Boolean))), [options]);
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          list={uniqueOptions.length ? listId.current : undefined}
          value={value}
          placeholder={uniqueOptions.length ? "Pesquise um usuÃ¡rio cadastrado" : "Informe o usuÃ¡rio"}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldInputBase} h-10 pl-9 pr-3`}
        />
      </div>
      {uniqueOptions.length ? (
        <datalist id={listId.current}>
          {uniqueOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </label>
  );
}

function SearchOnlyField({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const listId = useRef(`search-options-${id("list")}`);
  const uniqueOptions = useMemo(() => Array.from(new Set(options.filter(Boolean))), [options]);
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          list={uniqueOptions.length ? listId.current : undefined}
          value={value}
          placeholder={placeholder ?? `Pesquisar ${label.toLowerCase()}`}
          onChange={(event) => onChange(event.target.value)}
          className={`${fieldInputBase} h-10 pl-9 pr-3`}
        />
      </div>
      {uniqueOptions.length ? (
        <datalist id={listId.current}>
          {uniqueOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
    </label>
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
  const listId = useRef(`catalog-options-${id("list")}`);
  const uniqueOptions = useMemo(() => Array.from(new Set(options.filter(Boolean))), [options]);
  const normalizedValue = normalizeLabel(value);
  const hasExact = uniqueOptions.some((option) => normalizeLabel(option) === normalizedValue);
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <div className="flex gap-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
          <input
            list={uniqueOptions.length ? listId.current : undefined}
            value={value}
            placeholder={`Pesquisar ${label.toLowerCase()}`}
            onChange={(event) => onChange(event.target.value)}
            className={`${fieldInputBase} h-9 pl-9 pr-3`}
          />
        </div>
        <button
          type="button"
          disabled={!value.trim() || hasExact}
          onClick={() => onCreate(value.trim())}
          className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-card px-2 text-xs font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Plus className="h-3.5 w-3.5" />
          Novo
        </button>
      </div>
      {uniqueOptions.length ? (
        <datalist id={listId.current}>
          {uniqueOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>
      ) : null}
      <span className="mt-1 block text-[11px] text-muted-foreground">
        Pesquise ou informe o texto e use â€œNovoâ€ para {createLabel.toLowerCase()}.
      </span>
    </label>
  );
}

function SelectField({
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
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <div className="relative">
        <select
          value={value}
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className={fieldLabelClass}>{label}</span>
      <textarea
        value={value}
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
  images,
  onChange,
}: {
  label?: string;
  captionLabel?: string;
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
      toast.error(error instanceof Error ? error.message : "NÃ£o foi possÃ­vel adicionar a imagem.");
    }
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
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted">
          <ImagePlus className="h-4 w-4" />
          Adicionar imagem
          <input
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
                <Field
                  compact
                  label="TÃ­tulo da imagem"
                  value={image.titulo}
                  onChange={(titulo) =>
                    onChange(
                      images.map((item) => (item.id === image.id ? { ...item, titulo } : item)),
                    )
                  }
                />
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
  id: panelId,
  num,
  openSignal,
}: {
  title: string;
  items: NextStepItem[];
  onChange: (items: NextStepItem[]) => void;
  placeholder: string;
  progress?: number;
  id?: string;
  num?: string;
  openSignal?: number;
}) {
  return (
    <Panel title={title} progress={progress} id={panelId} num={num} openSignal={openSignal}>
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
              placeholder="ResponsÃ¡vel"
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
              type="text"
              inputMode="numeric"
              placeholder="dd/mm/aaaa"
              value={formatDateBr(item.prazo ?? "")}
              aria-label="Prazo"
              onChange={(event) =>
                onChange(
                  items.map((current) =>
                    current.id === item.id
                      ? { ...current, prazo: parseDateBrInput(event.target.value) }
                      : current,
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
          onClick={() => onChange([...items, { id: id("item"), text: "", responsavel: "", prazo: "" }])}
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
  children,
  icon,
  onClick,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
    >
      {icon}
      {children}
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
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-foreground/20 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-lg border border-border bg-card p-5 text-foreground shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-black tracking-tight">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-[#6e6e73]">{subtitle}</p> : null}
          </div>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-lg hover:bg-[#f5f5f7]"
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
