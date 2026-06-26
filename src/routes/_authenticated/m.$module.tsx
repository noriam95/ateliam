import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Diamond,
  Download,
  FileSpreadsheet,
  Database,
  FileText,
  FlaskConical,
  FolderOpen,
  GitBranch,
  History,
  Home,
  ImagePlus,
  LayoutGrid,
  ListChecks,
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
import { AteliamMark } from "@/components/ateliam-mark";
import { ThemeControl } from "@/components/theme-control";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { DEFAULT_DOCUMENT_MODELS, type DocumentModelRow } from "@/lib/document-models";
import { supabase } from "@/integrations/supabase/client";
import {
  getOrCreateWorkspace,
  getWorkspaceVersionContent,
  listWorkspaceVersions,
} from "@/lib/workspace.functions";
import {
  createOrganizationCause,
  createOrganizationDepartment,
  createOrganizationProcess,
  createOrganizationProcessOwner,
  deleteModuleDocument,
  deleteOrganizationCatalogItem,
  deleteOrganizationCause,
  deleteOrganizationProcess,
  getModuleDocumentContent,
  getModuleDocumentVersionContent,
  getMe,
  listModuleDocumentVersions,
  listModuleDocuments,
  listOrganizationCatalogs,
  listOrganizationDocumentModels,
  reserveCode,
  saveModuleDocument,
  updateOrganizationCatalogItem,
  updateOrganizationCause,
  updateOrganizationProcess,
} from "@/lib/config.functions";
import { type CodeKind, type CodeSettings, normalizeRule, formatCode } from "@/lib/code-generation";
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

// Tipo de codificação associado a cada módulo.
const MODULE_CODE_KIND: Record<AteliamModule, CodeKind> = {
  ddp: "mapping",
  pop: "pop_it",
  bpmn: "flowchart",
};

// Em modo demo a sequência de código é mantida por (organização, tipo) no
// localStorage, inicializada a partir da regra configurada.
function demoCodeNextKey(organizationId: string | null | undefined, kind: CodeKind) {
  return `ateliam-demo-code-next:${organizationId ?? "default"}:${kind}`;
}
function readDemoCodeNext(
  organizationId: string | null | undefined,
  kind: CodeKind,
  fallback: number,
) {
  if (typeof window === "undefined") return fallback;
  const stored = Number(window.localStorage.getItem(demoCodeNextKey(organizationId, kind)));
  return Number.isFinite(stored) && stored >= 1 ? Math.floor(stored) : fallback;
}
function reserveDemoCode(
  organizationId: string | null | undefined,
  kind: CodeKind,
  settings: CodeSettings | null | undefined,
  slug: string | null | undefined,
) {
  const rule = normalizeRule(kind, settings?.[kind]);
  const next = readDemoCodeNext(organizationId, kind, rule.next);
  const code = formatCode(rule.mask, next, { slug });
  if (typeof window !== "undefined") {
    window.localStorage.setItem(demoCodeNextKey(organizationId, kind), String(next + 1));
  }
  return code;
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

type RailArea = "home" | "modules" | "registrations" | "settings";
type ModuleContentMode = "module" | "registrations" | "settings";
type ModuleSurface = "editor" | "consult";
type ModuleRegistrationView = "areas" | "process-types" | "owners" | "processes";
type ModuleSettingsView = "theme";

type TextItem = { id: string; text: string };
type ModuleImage = { id: string; titulo: string; legenda: string; src: string };
type DdpSystem = {
  id: string;
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
  title: string;
  description: string;
  body: string;
  records: string;
  risks: string;
  images: ModuleImage[];
};
type ResponsibilityItem = { id: string; area: string; responsabilidade: string };
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
  nextSteps: TextItem[];
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
const CAUSE_STATUS_OPTIONS = ["Pendente", "Em andamento", "Concluída"] as const;
const CAUSE_PRIORITY_OPTIONS = ["Baixa", "Média", "Alta", "Crítica"] as const;
const DEMO_CATALOGS: OrganizationCatalogs = {
  departments: [
    { id: "demo-dept-processos", name: "Processos" },
    { id: "demo-dept-ti", name: "Tecnologia da Informação" },
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
};

function moduleDocumentLabel(moduleId: AteliamModule) {
  if (moduleId === "ddp") return "Mapeamento";
  if (moduleId === "pop") return "Documentação";
  return "Fluxograma";
}

function processDisplayName(process: OrganizationProcess) {
  return `${process.code ? `${process.code} · ` : ""}${process.name} · v${process.current_version}`;
}

function processTypeLabel(type: string) {
  if (type === "macroprocess") return "macroprocesso";
  if (type === "subprocess") return "subprocesso";
  return "processo";
}

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function defaultWorkspace(): WorkspaceState {
  return {
    ddp: {
      meta: {
        codigo: "",
        subtitulo: "AS IS",
        titulo: "",
        area: "",
        responsavel: "",
        valueChainId: "",
        valueChainName: "",
        versao: "01",
        data: today(),
        dataRelatorio: new Date().toLocaleDateString("pt-BR", {
          month: "long",
          year: "numeric",
        }),
        elaborador: "",
        revisor: "",
      },
      overview: {
        objetivo: "Entender o estado atual, riscos e oportunidades do processo.",
        escopo: "",
        estadoAtual: "",
        kpis: "",
        donoProcesso: "",
        volume: "",
        frequencia: "",
        dores: "",
        oportunidades: "",
      },
      systems: [
        {
          id: id("sys"),
          nome: "ERP / sistema principal",
          tipo: "Sistema transacional",
          dono: "",
          criticidade: "Alta",
          descricao: "",
        },
        {
          id: id("sys"),
          nome: "Planilhas de apoio",
          tipo: "Controle manual",
          dono: "",
          criticidade: "Média",
          descricao: "",
        },
      ],
      macroprocess: {
        processId: "",
        processVersion: 1,
        titulo: "Diagrama do Macroprocesso",
        legenda: "",
        src: "",
      },
      steps: [
        {
          id: id("step"),
          processId: "",
          processVersion: 1,
          etapa: "Receber solicitação",
          responsavel: "",
          entrada: "",
          atividade: "Registrar demanda e validar dados mínimos.",
          saida: "",
          sistema: "",
          risco: "",
          observacoes: "",
          images: [],
          substeps: [],
        },
        {
          id: id("step"),
          processId: "",
          processVersion: 1,
          etapa: "Analisar informações",
          responsavel: "",
          entrada: "",
          atividade: "Conferir regras, documentos e pendências.",
          saida: "",
          sistema: "",
          risco: "",
          observacoes: "",
          images: [],
          substeps: [],
        },
        {
          id: id("step"),
          processId: "",
          processVersion: 1,
          etapa: "Executar e concluir",
          responsavel: "",
          entrada: "",
          atividade: "Executar atividade, registrar evidência e comunicar conclusão.",
          saida: "",
          sistema: "",
          risco: "",
          observacoes: "",
          images: [],
          substeps: [],
        },
      ],
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
      gaps: [
        {
          id: id("gap"),
          sharedCauseId: "",
          causa: "Informação descentralizada",
          descricao: "Dados e evidências ficam espalhados em canais diferentes.",
          impacto: "Retrabalho e baixa rastreabilidade",
          acao: "Padronizar registro e responsáveis",
          responsavel: "",
          prazo: "",
          prioridade: "Alta",
          status: "Pendente",
          comentarios: [],
        },
      ],
      nextSteps: [{ id: id("next"), text: "Validar mapeamento com o dono do processo" }],
      glossary: [
        {
          id: id("gloss"),
          termo: "AS IS",
          definicao: "Representação do estado atual do processo analisado.",
        },
      ],
    },
    pop: {
      meta: {
        tipo: "POP",
        codigo: "POP.ADM.001",
        titulo: "Procedimento Operacional Padrão",
        publico: "Interno",
        area: "Administrativo",
        processo: "",
        versao: "01",
        vigencia: today(),
        elaboracao: "",
        revisor: "",
        aprovacao: "",
        publicacao: "",
      },
      purpose: {
        objetivo: "Padronizar a execução do procedimento e reduzir variações.",
        abrangencia: "",
        premissas: "",
        importante: "",
      },
      sections: [
        {
          id: id("sec"),
          title: "1. Preparação",
          description: "Pré-requisitos, documentos e sistemas necessários.",
          body: "Descreva os pré-requisitos, documentos e sistemas necessários.",
          records: "",
          risks: "",
          images: [],
        },
        {
          id: id("sec"),
          title: "2. Execução",
          description: "Passo a passo principal do procedimento.",
          body: "Liste o passo a passo em ordem operacional.",
          records: "",
          risks: "",
          images: [],
        },
      ],
      responsibilities: [
        {
          id: id("resp"),
          area: "Dono do processo",
          responsabilidade: "Aprovar e manter o documento atualizado.",
        },
      ],
      references: [
        {
          id: id("ref"),
          codigo: "",
          titulo: "Políticas internas e legislação aplicável",
          aplicabilidade: "",
        },
      ],
      history: [
        {
          id: id("rev"),
          codigo: "HIS-001",
          version: "01",
          date: today(),
          elaborador: "",
          revisor: "",
          aprovador: "",
        },
      ],
      changes: [
        {
          id: id("change"),
          versao: "01",
          local: "Documento completo",
          descricao: "Criação do documento",
        },
      ],
    },
    bpmn: {
      poolName: "Processo principal",
      lanes: ["Solicitante", "Executor"],
      nodes: [
        { id: "start_1", type: "start", label: "Início", x: 120, y: 135, lane: 0 },
        { id: "task_1", type: "task", label: "Receber solicitação", x: 260, y: 110, lane: 0 },
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

function asTextItem(value: unknown, prefix: string): TextItem {
  if (value && typeof value === "object" && "text" in value) {
    const row = value as Partial<TextItem>;
    return { id: row.id || id(prefix), text: String(row.text ?? "") };
  }
  return { id: id(prefix), text: String(value ?? "") };
}

function normalizeCauseStatus(value: unknown) {
  const normalized = normalizeLabel(String(value ?? ""));
  if (normalized.includes("andamento")) return "Em andamento";
  if (normalized.includes("conclu")) return "Concluída";
  return "Pendente";
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
        prioridade: normalizeCausePriority(legacy.prioridade || "Média"),
        status: normalizeCauseStatus(legacy.status),
        comentarios: normalizeCauseComments(
          legacy.comentarios ?? legacy.comments ?? legacy.comentario ?? legacy.observacoes,
        ),
      };
    }),
    nextSteps: (input?.nextSteps ?? fallback.nextSteps).map((item) => asTextItem(item, "next")),
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
  return {
    ...fallback,
    ...input,
    meta: { ...fallback.meta, ...(input?.meta ?? {}) },
    purpose: { ...fallback.purpose, ...(input?.purpose ?? {}) },
    sections: (input?.sections ?? fallback.sections).map((section) => ({
      id: section.id || id("sec"),
      title: section.title || "Nova seção",
      description: section.description || "",
      body: section.body || "",
      records: section.records || "",
      risks: section.risks || "",
      images: normalizeImages(section.images, "popimg"),
    })),
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
      label: "Workspace Ateliam",
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

function td(value: unknown) {
  return `<td>${html(value)}</td>`;
}

function th(value: unknown) {
  return `<th>${html(value)}</th>`;
}

function table(headers: string[], rows: unknown[][]) {
  return `<table><thead><tr>${headers.map(th).join("")}</tr></thead><tbody>${
    rows.length
      ? rows.map((row) => `<tr>${row.map(td).join("")}</tr>`).join("")
      : `<tr><td colspan="${headers.length}">Sem registros.</td></tr>`
  }</tbody></table>`;
}

function list(items: TextItem[]) {
  if (!items.length) return "<p>Sem registros.</p>";
  return `<ol>${items.map((item) => `<li>${html(item.text)}</li>`).join("")}</ol>`;
}

function docShell(title: string, body: string) {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${html(title)}</title>
  <style>
    body{font-family:Arial,sans-serif;color:#1f2933;line-height:1.45;margin:34px;}
    h1{font-size:28px;color:#173e2a;margin:0 0 8px;}
    h2{font-size:18px;color:#173e2a;border-bottom:2px solid #e5b653;padding-bottom:6px;margin-top:26px;}
    h3{font-size:14px;color:#173e2a;margin:16px 0 8px;}
    p{font-size:11pt;margin:6px 0 10px;}
    .cover{border-left:8px solid #e5b653;background:#f7f2e9;padding:18px 22px;margin-bottom:22px;}
    .muted{color:#667085;font-size:10pt;}
    table{border-collapse:collapse;width:100%;margin:10px 0 18px;table-layout:fixed;}
    th,td{border:1px solid #d0d5dd;padding:7px 8px;vertical-align:top;font-size:10pt;}
    th{background:#173e2a;color:white;text-align:left;}
    ol,ul{font-size:10.5pt;}
  </style>
</head>
<body>${body}</body>
</html>`;
}

function buildDdpWord(data: DdpState) {
  const body = `
    <div class="cover">
      <h1>${html(data.meta.titulo)}</h1>
      <p class="muted">${html(data.meta.codigo)} · ${html(data.meta.subtitulo)} · versão ${html(data.meta.versao)}</p>
      <p>${html(data.overview.objetivo)}</p>
    </div>
    <h2>01 Metadados</h2>
    ${table(
      ["Campo", "Informação"],
      [
        ["Código", data.meta.codigo],
        ["Subtítulo", data.meta.subtitulo],
        ["Título", data.meta.titulo],
        ["Área", data.meta.area],
        ["Responsável", data.meta.responsavel],
        ["Data do relatório", data.meta.dataRelatorio || data.meta.data],
        ["Elaborador", data.meta.elaborador],
        ["Revisor", data.meta.revisor],
      ],
    )}
    <h2>02 Visão geral</h2>
    ${table(
      ["Campo", "Descrição"],
      [
        ["Objetivo", data.overview.objetivo],
        ["Abrangência / escopo", data.overview.escopo],
        ["Dono do processo", data.overview.donoProcesso],
        ["Estado atual", data.overview.estadoAtual],
        ["Indicadores / evidências", data.overview.kpis],
        ["Volume", data.overview.volume],
        ["Frequência", data.overview.frequencia],
        ["Dores", data.overview.dores],
        ["Oportunidades", data.overview.oportunidades],
      ],
    )}
    <h2>03 Sistemas envolvidos</h2>
    ${table(
      ["Sistema", "Tipo", "Dono", "Criticidade", "Descrição"],
      data.systems.map((item) => [
        item.nome,
        item.tipo,
        item.dono,
        item.criticidade,
        item.descricao,
      ]),
    )}
    <h2>04 Fluxo AS IS</h2>
    ${table(
      ["Etapa", "Responsável", "Entrada", "Atividade", "Saída", "Sistema", "Risco"],
      data.steps.map((item) => [
        item.etapa,
        item.responsavel,
        item.entrada,
        item.atividade,
        item.saida,
        item.sistema,
        item.risco,
      ]),
    )}
    <h2>05 Análise SIPOC</h2>
    ${table(
      ["Fornecedores", "Entradas", "Processo", "Saídas", "Clientes"],
      data.sipocRows.map((item) => [
        item.fornecedores,
        item.entradas,
        item.processo,
        item.saidas,
        item.clientes,
      ]),
    )}
    <h2>06 Causas-raiz e planos de ação</h2>
    ${table(
      ["Causa", "Impacto", "Ação", "Responsável", "Prazo", "Prioridade", "Status"],
      data.gaps.map((item) => [
        item.causa,
        item.impacto,
        item.acao,
        item.responsavel,
        item.prazo,
        item.prioridade,
        item.status,
      ]),
    )}
    <h2>07 Próximos passos</h2>
    ${list(data.nextSteps)}
    <h2>08 Glossário</h2>
    ${table(
      ["Termo", "Definição"],
      data.glossary.map((item) => [item.termo, item.definicao]),
    )}
  `;
  return docShell(`Mapeamento - ${data.meta.titulo}`, body);
}

function buildPopWord(data: PopState) {
  const contentTitle =
    data.meta.tipo === "Norma"
      ? "Diretrizes"
      : data.meta.tipo === "IT"
        ? "Instruções de trabalho"
        : "Procedimento";
  const body = `
    <div class="cover">
      <h1>${html(data.meta.titulo)}</h1>
      <p class="muted">${html(data.meta.tipo)} · ${html(data.meta.codigo)} · versão ${html(data.meta.versao)}</p>
      <p>${html(data.purpose.objetivo)}</p>
    </div>
    <h2>01 Identificação</h2>
    ${table(
      ["Campo", "Informação"],
      [
        ["Tipo", data.meta.tipo],
        ["Código", data.meta.codigo],
        ["Título", data.meta.titulo],
        ["Público / classificação", data.meta.publico],
        ["Área responsável", data.meta.area],
        ["Processo relacionado", data.meta.processo],
        ["Vigência", data.meta.vigencia],
        ["Elaborador", data.meta.elaboracao],
        ["Revisor", data.meta.revisor],
        ["Aprovador", data.meta.aprovacao],
        ["Publicação", data.meta.publicacao],
      ],
    )}
    <h2>02 Objetivo e abrangência</h2>
    ${table(
      ["Campo", "Descrição"],
      [
        ["Objetivo", data.purpose.objetivo],
        ["Abrangência", data.purpose.abrangencia],
        ["Premissas e regras gerais", data.purpose.premissas],
        ["Observações críticas", data.purpose.importante],
      ],
    )}
    <h2>03 ${html(contentTitle)}</h2>
    ${data.sections
      .map(
        (section) => `
        <h3>${html(section.title)}</h3>
        ${table(
          ["Campo", "Conteúdo"],
          [
            ["Contexto / descrição", section.description],
            ["Procedimento", section.body],
            ["Registros / evidências", section.records],
            ["Riscos / cuidados", section.risks],
          ],
        )}
      `,
      )
      .join("")}
    <h2>04 Responsabilidades</h2>
    ${table(
      ["Área / cargo", "Responsabilidades"],
      data.responsibilities.map((item) => [item.area, item.responsabilidade]),
    )}
    <h2>05 Referências normativas</h2>
    ${table(
      ["Código", "Título", "Aplicabilidade"],
      data.references.map((item) => [item.codigo, item.titulo, item.aplicabilidade]),
    )}
    <h2>06 Histórico e controle de alterações</h2>
    <h3>Histórico</h3>
    ${table(
      ["Código", "Versão", "Data", "Elaborador", "Revisor", "Aprovador"],
      data.history.map((item) => [
        item.codigo,
        item.version,
        item.date,
        item.elaborador,
        item.revisor,
        item.aprovador,
      ]),
    )}
    <h3>Alterações</h3>
    ${table(
      ["Versão", "Local da revisão", "Descrição"],
      data.changes.map((item) => [item.versao, item.local, item.descricao]),
    )}
  `;
  return docShell(`${data.meta.tipo} - ${data.meta.titulo}`, body);
}

function downloadWord(filename: string, htmlContent: string) {
  downloadText(filename, htmlContent, "application/msword;charset=utf-8");
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
type OrganizationCatalogItem = {
  id: string;
  name: string;
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
type OrganizationCatalogs = {
  departments: OrganizationCatalogItem[];
  processOwners: OrganizationCatalogItem[];
  causes: OrganizationCause[];
  processes: OrganizationProcess[];
  valueChains: OrganizationValueChain[];
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
  const legacyCards = arrayAt(legacy, "vgCards").map((item) => {
    const row = asObject(item);
    return { title: textAt(row, "title"), text: textAt(row, "text") };
  });
  const overviewCards: ExportCard[] = legacyCards.length
    ? legacyCards
    : [
        { title: "Objetivo", text: data.overview.objetivo },
        { title: "Escopo", text: data.overview.escopo },
        { title: "Contexto", text: data.overview.kpis },
        { title: "Situação Atual", text: data.overview.estadoAtual },
      ].filter((item) => item.text);

  const legacySystems = arrayAt(legacy, "sistemas").map((item, index) => {
    const row = asObject(item);
    const current = data.systems[index];
    return {
      name: current?.nome || textAt(row, "nome"),
      type: current?.tipo || textAt(row, "badge") || "Sistema",
      description: current?.descricao || textAt(row, "desc"),
      items: arrayAt(row, "items").map(textValue).filter(Boolean),
    };
  });
  const systems: ExportSystem[] = legacySystems.length
    ? legacySystems
    : data.systems.map((system) => ({
        name: system.nome,
        type: system.tipo || system.criticidade,
        description: system.descricao,
        items: splitText(system.descricao),
      }));

  const legacyFlow = arrayAt(legacy, "flowSteps").map((item, index) => {
    const row = asObject(item);
    const current = data.steps[index];
    return {
      title: current?.etapa || textAt(row, "titulo"),
      description: current?.atividade || textAt(row, "descricao"),
      owner: current?.responsavel || textAt(row, "detalheAtores"),
      system: current?.sistema || textAt(row, "detalheSistemas"),
      risk: current?.risco || joinClean([textAt(row, "detalheRiscos"), textAt(row, "detalheObs")]),
      images: current?.images?.length
        ? current.images.map((image) => ({
            title: image.titulo,
            caption: image.legenda,
            src: image.src,
          }))
        : exportImages(arrayAt(row, "imagens"), "Diagrama"),
      substeps: current?.substeps?.length
        ? current.substeps.map((substep) => ({
            code: substep.codigo,
            title: substep.titulo,
            description: substep.descricao,
            images: substep.images.map((image) => ({
              title: image.titulo,
              caption: image.legenda,
              src: image.src,
            })),
          }))
        : arrayAt(row, "substeps").map((substep, subIndex) => {
            const sub = asObject(substep);
            return {
              code: textAt(sub, "codigo") || String(subIndex + 1).padStart(2, "0"),
              title: textAt(sub, "titulo"),
              description: textAt(sub, "desc") || textAt(sub, "descricao"),
              images: exportImages(arrayAt(sub, "imagens"), "Imagem"),
            };
          }),
    };
  });
  const flowSteps: ExportFlowStep[] = legacyFlow.length
    ? legacyFlow
    : data.steps.map((step) => ({
        title: step.etapa,
        description: step.atividade,
        owner: step.responsavel,
        system: step.sistema,
        risk: joinClean([step.risco, step.observacoes]),
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
          : [
              {
                code: "01",
                title: step.etapa,
                description: joinClean(
                  [
                    step.entrada ? `Entrada: ${step.entrada}` : "",
                    step.atividade,
                    step.saida ? `Saída: ${step.saida}` : "",
                  ],
                  "\n",
                ),
                images: [],
              },
            ],
      }));

  const legacyGaps = arrayAt(legacy, "gaps").map((item, index) => {
    const row = asObject(item);
    const current = data.gaps[index];
    return {
      title: current?.causa || textAt(row, "titulo"),
      description: current?.descricao || textAt(row, "descricao") || current?.causa || "",
      impact: current?.impacto || textAt(row, "impacto"),
      action: current?.acao || textAt(row, "acaoProposta"),
      owner: current?.responsavel || textAt(row, "responsavel"),
      due: current?.prazo || textAt(row, "prazo"),
      priority: current?.prioridade || normalizePriority(textAt(row, "prioridade")),
      status: current?.status || normalizeCauseStatus(textAt(row, "status")),
      implementation: textAt(row, "comoImplementar") || current?.acao || "",
    };
  });
  const gaps: ExportGap[] = legacyGaps.length
    ? legacyGaps
    : data.gaps.map((gap) => ({
        title: gap.causa,
        description: gap.descricao || gap.causa,
        impact: gap.impacto,
        action: gap.acao,
        owner: gap.responsavel,
        due: gap.prazo,
        priority: gap.prioridade,
        status: gap.status,
        implementation: gap.acao,
      }));

  const legacyNext = arrayAt(legacy, "proxPassos").map((item) => {
    const row = asObject(item);
    return {
      title: textAt(row, "titulo"),
      description: textAt(row, "desc") || textAt(row, "descricao"),
      owner: textAt(row, "responsavel"),
      due: textAt(row, "prazo"),
    };
  });
  const nextSteps: ExportNextStep[] = legacyNext.length
    ? legacyNext
    : data.nextSteps.map((item) => {
        const parts = item.text.split("|").map((part) => plain(part));
        return {
          title: parts[0] || item.text,
          description: parts[1] || "",
          owner: parts[2] || "",
          due: parts[3] || "",
        };
      });

  const macro = objectAt(legacy, "macroprocesso");
  const currentMacro = data.macroprocess;

  return {
    meta: data.meta,
    description: data.overview.objetivo,
    scope: data.overview.escopo,
    overview: data.overview.estadoAtual,
    stats: arrayAt(legacy, "stats").map((item) => {
      const row = asObject(item);
      return { num: textAt(row, "num"), label: textAt(row, "label") };
    }),
    cards: overviewCards,
    systems,
    macroprocess: {
      title: currentMacro.titulo || textAt(macro, "titulo"),
      caption: currentMacro.legenda || textAt(macro, "legenda"),
      src: currentMacro.src || textAt(macro, "imagem") || textAt(macro, "src"),
    },
    flowSteps,
    sipocRows: data.sipocRows,
    gaps,
    nextSteps,
    images: exportImages(arrayAt(legacy, "imagens"), "Imagem"),
    glossary: data.glossary,
  };
}

function getPopExportModel(data: PopState) {
  const legacy = data.legacy ?? {};
  const legacySections = arrayAt(legacy, "secoes").map((item, index) => {
    const row = asObject(item);
    const current = data.sections[index];
    return {
      title: current?.title || textAt(row, "titulo"),
      description: current?.description || textAt(row, "descricao"),
      items: current?.images?.length
        ? [
            {
              text: current.body || current.description,
              note: joinClean([current.records, current.risks]),
              images: current.images.map((image) => ({
                title: image.titulo,
                caption: image.legenda,
                src: image.src,
              })),
            },
          ]
        : arrayAt(row, "itens").map((sectionItem) => {
            const currentItem = asObject(sectionItem);
            return {
              text: textAt(currentItem, "texto"),
              note: textAt(currentItem, "observacao"),
              images: exportImages(arrayAt(currentItem, "imagens"), "Figura"),
            };
          }),
    };
  });

  const sections: ExportPopSection[] = legacySections.length
    ? legacySections
    : data.sections.map((section) => ({
        title: section.title,
        description: section.description,
        items: [
          ...splitText(section.body || section.records || section.risks).map((line) => ({
            text: line,
            note: "",
            images: [],
          })),
          ...(section.images.length
            ? [
                {
                  text: "Imagens e evidências",
                  note: "",
                  images: section.images.map((image) => ({
                    title: image.titulo,
                    caption: image.legenda,
                    src: image.src,
                  })),
                },
              ]
            : []),
        ],
      }));

  return {
    meta: data.meta,
    typeLabel:
      data.meta.tipo === "Norma"
        ? "Norma"
        : data.meta.tipo === "IT"
          ? "Instrução de Trabalho - IT"
          : "Procedimento Operacional Padrão - POP",
    contentTitle:
      data.meta.tipo === "Norma"
        ? "Diretrizes"
        : data.meta.tipo === "IT"
          ? "Instrução de Trabalho"
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
        ["Uso", "Preencha apenas textos. Imagens devem ser adicionadas diretamente no Ateliam."],
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
      rows: [["texto"], ...data.nextSteps.map((item) => [item.text])],
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
        ["Uso", "Preencha apenas textos. Imagens devem ser adicionadas diretamente no Ateliam."],
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
        ["area", "responsabilidade"],
        ...data.responsibilities.map((item) => [item.area, item.responsabilidade]),
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
    criticidade: rowValue(row, "criticidade", "Média"),
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
  const organizationName = params.brand?.name || "Ateliam";
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
    widthIn = 6.7,
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
    )}${p(params.title, { size: 20, bold: true, color: C.white, after: 0, line: 1 })}</w:tc><w:tc><w:tcPr><w:tcW w:w="3572" w:type="dxa"/><w:shd w:fill="${C.green}"/><w:vAlign w:val="center"/></w:tcPr>${headerBrandXml}</w:tc></w:tr><w:tr><w:trPr><w:trHeight w:val="70" w:hRule="exact"/></w:trPr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:tcW w:w="${PAGE_W}" w:type="dxa"/><w:shd w:fill="${C.headerLine}"/></w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr><w:r><w:rPr><w:sz w:val="2"/></w:rPr><w:t> </w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:hdr>`;
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
    footerLeft: `${model.meta.dataRelatorio || model.meta.data} · por ${model.meta.elaborador || "Ateliam"}`,
    brand,
  });
  const parts: string[] = [];

  parts.push(
    doc.table(
      [
        [
          { xml: doc.labelValue("Tipo", "Relatório de Mapeamento de Processo") },
          { xml: doc.labelValue("Subtítulo", model.meta.subtitulo) },
          { xml: doc.labelValue("Data", model.meta.dataRelatorio || model.meta.data) },
          { xml: doc.labelValue("Versão", model.meta.versao) },
        ],
        [
          { xml: doc.labelValue("Elaborador", model.meta.elaborador), fill: doc.C.gray50 },
          { xml: doc.labelValue("Revisor", model.meta.revisor), fill: doc.C.gray50 },
          { xml: doc.labelValue("Área", model.meta.area), fill: doc.C.gray50 },
          { xml: doc.labelValue("Responsável", model.meta.responsavel), fill: doc.C.gray50 },
        ],
      ],
      [2576, 2576, 2576, 2578],
      { full: true },
    ),
  );
  parts.push(doc.sectionTitle("Descrição do Projeto"));
  parts.push(doc.p(model.description || "Descrição não informada.", { align: "both", line: 1.05 }));
  parts.push(doc.sectionTitle("Abrangência / Escopo"));
  parts.push(doc.p(model.scope || "Escopo não informado.", { align: "both", line: 1.05 }));
  parts.push(doc.sectionTitle("Índice"));
  [
    ["02", "Visão Geral"],
    ["03", "Sistemas Envolvidos"],
    ["04", "Fluxo AS IS"],
    ["05", "Análise SIPOC"],
    ["06", "Causas-Raiz e Planos de Ação"],
    ["07", "Próximos Passos"],
    ["08", "Glossário"],
  ].forEach(([num, label]) => parts.push(doc.tocLine(num, label)));
  parts.push(doc.sectionBreak());

  parts.push(doc.sectionTitle("02 Visão Geral"));
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
              doc.headerCell("Tipo"),
              doc.headerCell("Descrição"),
              doc.headerCell("Uso"),
            ],
            ...model.systems.map((system) => [
              doc.bodyCell(system.name),
              doc.bodyCell(system.type),
              doc.bodyCell(system.description),
              doc.bodyCell(system.items.join("; ") || system.description),
            ]),
          ],
          [2100, 1500, 3900, 2806],
          { full: true },
        )
      : doc.p("Nenhum sistema cadastrado."),
  );

  parts.push(doc.sectionTitle("04 Fluxo AS IS - Etapas do Processo"));
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
    parts.push(doc.subTitle(`${String(index + 1).padStart(2, "0")} - ${step.title || "Etapa"}`));
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
            [doc.headerCell("ID"), doc.headerCell("Atividade"), doc.headerCell("Descrição")],
            ...step.substeps.map((substep) => [
              doc.bodyCell(substep.code),
              doc.bodyCell(substep.title),
              doc.bodyCell(substep.description),
            ]),
          ],
          [900, 3000, 6406],
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

  parts.push(doc.sectionTitle("05 Análise SIPOC do Processo"));
  parts.push(
    model.sipocRows.length
      ? doc.table(
          [
            [
              doc.headerCell("Fornecedores"),
              doc.headerCell("Entradas"),
              doc.headerCell("Processo"),
              doc.headerCell("Saídas"),
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

  parts.push(doc.sectionTitle("06 Causas-Raiz e Planos de Ação"));
  model.gaps.forEach((gap, index) => {
    parts.push(
      doc.table(
        [
          [
            {
              xml: doc.p(`${String(index + 1).padStart(2, "0")} - ${gap.title || "Causa-raiz"}`, {
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
            doc.bodyCell(`Responsável: ${gap.owner || "-"}`),
            doc.bodyCell(`Prazo: ${gap.due || "-"}`),
          ],
          [{ xml: doc.mixedP("Descrição: ", gap.description || "-"), gridSpan: 3 }],
          [{ xml: doc.mixedP("Impacto esperado: ", gap.impact || "-"), gridSpan: 3 }],
          [{ xml: doc.mixedP("Ação proposta: ", gap.action || "-"), gridSpan: 3 }],
          [{ xml: doc.mixedP("Como implementar: ", gap.implementation || "-"), gridSpan: 3 }],
        ],
        [3100, 3100, 4106],
        { full: true },
      ),
    );
  });
  if (!model.gaps.length) parts.push(doc.p("Nenhuma causa-raiz cadastrada."));

  parts.push(doc.sectionTitle("07 Próximos Passos"));
  parts.push(
    model.nextSteps.length
      ? doc.table(
          [
            [
              doc.headerCell("Ação"),
              doc.headerCell("Descrição"),
              doc.headerCell("Responsável"),
              doc.headerCell("Prazo"),
            ],
            ...model.nextSteps.map((step) => [
              doc.bodyCell(step.title),
              doc.bodyCell(step.description),
              doc.bodyCell(step.owner || "A definir"),
              doc.bodyCell(step.due || "A definir"),
            ]),
          ],
          [2600, 4200, 1900, 1606],
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
    footerLeft: `${model.meta.publicacao || model.meta.vigencia || today()} · por ${
      model.meta.elaboracao || "Ateliam"
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
          { xml: doc.labelValue("Vigência", model.meta.vigencia) },
          { xml: doc.labelValue("Versão", model.meta.versao) },
        ],
        [
          {
            xml: doc.labelValue("Público / Classificação", model.meta.publico),
            fill: doc.C.gray50,
          },
          { xml: doc.labelValue("Área responsável", model.meta.area), fill: doc.C.gray50 },
          { xml: doc.labelValue("Processo relacionado", model.meta.processo), fill: doc.C.gray50 },
          { xml: doc.labelValue("Publicação", model.meta.publicacao), fill: doc.C.gray50 },
        ],
        [
          { xml: doc.labelValue("Elaborador", model.meta.elaboracao), fill: doc.C.gray50 },
          { xml: doc.labelValue("Revisor", model.meta.revisor), fill: doc.C.gray50 },
          { xml: doc.labelValue("Aprovador", model.meta.aprovacao), fill: doc.C.gray50 },
          { xml: doc.labelValue("Sistema", "Ateliam"), fill: doc.C.gray50 },
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
  model.sections.forEach((section, sectionIndex) => {
    parts.push(doc.subTitle(`3.${sectionIndex + 1} - ${section.title || "Seção"}`));
    if (section.description) parts.push(doc.p(section.description, { align: "both", line: 1.05 }));
    section.items.forEach((item, itemIndex) => {
      parts.push(doc.mixedP(`${String.fromCharCode(97 + itemIndex)}) `, item.text));
      if (item.note)
        parts.push(
          doc.p(`Observação: ${item.note}`, { size: 9.5, color: doc.C.gray500, left: 360 }),
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
            [doc.headerCell("Área / Cargo"), doc.headerCell("Responsabilidades")],
            ...model.responsibilities.map((item) => [
              doc.bodyCell(item.area),
              doc.bodyCell(item.responsabilidade),
            ]),
          ],
          [3000, 7306],
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

function ateliamLogoHtml(brand?: OrganizationBrand) {
  if (brand?.logo_data_url) {
    return `<img src="${html(brand.logo_data_url)}" alt="${html(brand.name || "Organização")}"/><strong>${html(brand.name || "Organização")}</strong>`;
  }
  return `<span class="brand-mark"><span></span></span><strong>Ateliam</strong>`;
}

function buildDdpPresentationHtml(data: DdpState, brand?: OrganizationBrand) {
  const model = getDdpExportModel(data);
  const presentationColor = docxColor(brand?.word_header_color, "1D1F23");
  const code = html(model.meta.codigo);
  const title = html(
    plain(model.meta.titulo).replace(/^Processo\s+de\s+/i, "") || model.meta.titulo,
  );
  const nav = [
    ["capa", "Capa"],
    ["sistemas", "02 Sistemas Envolvidos e Escopo"],
    ["fluxo", "03 Fluxo AS IS"],
    ["sipoc", "04 Análise SIPOC"],
    ["causas", "05 Causas-Raiz e Planos de Ação"],
    ["proximos", "06 Próximos Passos"],
    ["glossario", "07 Glossário"],
  ];
  const cardGrid = (items: ExportCard[]) =>
    `<div class="cards">${items
      .map((item) => `<article><h3>${html(item.title)}</h3><p>${html(item.text)}</p></article>`)
      .join("")}</div>`;
  const zoomImage = (image: ExportImage) =>
    image.src
      ? `<figure class="diagram"><h3>${html(image.title || "Diagrama")}</h3><img class="zoomable" src="${html(
          image.src,
        )}" alt="${html(image.title || "Diagrama")}" data-title="${html(
          image.title || "Diagrama",
        )}" onclick="openImageZoom(this)"/><p>${html(image.caption)}</p></figure>`
      : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${code} - Apresentação de Mapeamento</title>
<style>
:root{--green:#${presentationColor};--dark:#${presentationColor};--line:#c9cccb;--paper:#f8f7f1;--text:#202124;--muted:#5f6368;--nav:256px}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--paper);color:var(--text);font-family:"Segoe UI",Arial,sans-serif}
.brand{display:flex;align-items:center;gap:12px;color:white}.brand img{width:52px;height:38px;object-fit:contain;background:white;border-radius:6px;padding:3px}.brand-mark{display:grid;width:34px;height:34px;place-items:center;border-radius:10px;background:rgba(255,255,255,.12);color:#e5b653}.brand-mark span{width:17px;height:17px;border:2px solid currentColor;border-radius:50%;position:relative}.brand-mark span:after{content:"";position:absolute;inset:4px;border-radius:50%;background:currentColor}
nav{position:fixed;inset:0 auto 0 0;width:var(--nav);background:var(--dark);padding:26px 18px;color:white;z-index:4}nav .brand{margin-bottom:36px}nav a{display:block;color:rgba(255,255,255,.82);text-decoration:none;border-left:3px solid transparent;padding:10px 10px 10px 13px;font-size:12px;text-transform:uppercase;letter-spacing:.12em}nav a:hover{background:rgba(255,255,255,.08);border-color:#e5b653;color:white}
main{margin-left:var(--nav)}section{min-height:100vh;padding:58px 72px;border-bottom:1px solid #ddd8ca;background:#fff}section:nth-child(even){background:#fbfaf6}.kicker{font-size:12px;letter-spacing:.36em;text-transform:uppercase;color:#e5b653;font-weight:800;margin-bottom:18px}.hero{display:flex;min-height:100vh;flex-direction:column;justify-content:center;background:linear-gradient(135deg,var(--dark),color-mix(in srgb,var(--green) 74%,white));color:white}.hero h1{max-width:920px;font-size:64px;line-height:.98;margin:0 0 22px;text-transform:uppercase}.hero p{max-width:860px;font-size:21px;line-height:1.45;color:rgba(255,255,255,.82)}.meta{margin-top:42px;display:grid;gap:8px;color:rgba(255,255,255,.78)}
.section-head{display:flex;align-items:flex-start;gap:20px;margin-bottom:32px;border-bottom:2px solid var(--line);padding-bottom:18px}.section-head span{font-size:46px;font-weight:900;color:var(--green)}.section-head h2{font-size:36px;line-height:1.05;margin:0;text-transform:uppercase;color:var(--green)}.section-head p{margin:6px 0 0;color:var(--muted)}
.cards,.flow,.causes,.next{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.cards article,.flow article,.causes article,.next article{border:1px solid #d8d3c6;border-left:7px solid var(--green);background:#fff;padding:22px;min-height:150px}.cards h3,.flow h3,.causes h3,.next h3{margin:0 0 10px;color:var(--green);text-transform:uppercase}.cards p,.flow p,.causes p,.next p{line-height:1.48;color:#4b5563}.num{font-size:28px;font-weight:900;color:rgba(27,94,60,.38);margin-bottom:8px}.diagram img{max-width:100%;max-height:62vh;object-fit:contain;border:1px solid #d8d3c6;background:white}.diagram{margin:18px 0}.zoomable{cursor:zoom-in}.zoom-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;background:rgba(8,12,10,.92);z-index:20;padding:28px}.zoom-modal.open{display:flex}.zoom-modal img{max-width:94vw;max-height:86vh;background:#fff;box-shadow:0 20px 70px rgba(0,0,0,.55);cursor:zoom-out}.zoom-title{position:fixed;left:28px;top:22px;color:white;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.zoom-close{position:fixed;right:28px;top:20px;border:1px solid rgba(255,255,255,.35);background:transparent;color:white;padding:9px 14px;border-radius:6px;cursor:pointer}.sipoc{width:100%;border-collapse:collapse}.sipoc th{background:var(--green);color:white;text-align:left;text-transform:uppercase;font-size:12px;letter-spacing:.12em}.sipoc td,.sipoc th{border:1px solid #d4d0c6;padding:12px;vertical-align:top}.footer{position:absolute;right:72px;bottom:28px;color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.12em}@media(max-width:900px){nav{position:static;width:auto}main{margin-left:0}section{padding:34px 22px}.hero h1{font-size:42px}.cards,.flow,.causes,.next{grid-template-columns:1fr}}
</style>
</head>
<body>
<nav><div class="brand">${ateliamLogoHtml(brand)}</div>${nav
    .map(([href, label]) => `<a href="#${href}">${html(label)}</a>`)
    .join("")}</nav>
<main>
<section class="hero" id="capa"><div class="kicker">Relatório de Mapeamento de Processo</div><h1>${title}</h1><p>${html(model.scope || model.description)}</p><div class="meta"><div><b>Documento:</b> ${code}</div><div><b>Versão:</b> ${html(model.meta.versao)}</div><div><b>Data:</b> ${html(model.meta.dataRelatorio || model.meta.data)}</div><div><b>Elaborador:</b> ${html(model.meta.elaborador)}</div><div><b>Revisor:</b> ${html(model.meta.revisor)}</div></div></section>
<section id="sistemas"><div class="section-head"><span>02</span><div><h2>Sistemas Envolvidos e Escopo</h2><p>${html(model.scope)}</p></div></div>${cardGrid(
    model.systems.map((system) => ({
      title: system.name,
      text: joinClean([system.type, system.description], " - "),
    })),
  )}</section>
<section id="fluxo"><div class="section-head"><span>03</span><div><h2>Fluxo AS IS</h2><p>Etapas e subprocessos principais identificados no mapeamento.</p></div></div>${
    model.macroprocess.src
      ? `<div class="diagram"><h3>${html(model.macroprocess.title || "Macroprocesso")}</h3><img class="zoomable" src="${model.macroprocess.src}" alt="${html(
          model.macroprocess.title,
        )}" data-title="${html(model.macroprocess.title || "Macroprocesso")}" onclick="openImageZoom(this)"/><p>${html(model.macroprocess.caption)}</p></div>`
      : ""
  }<div class="flow">${model.flowSteps
    .map(
      (step, index) =>
        `<article><div class="num">${String(index + 1).padStart(2, "0")}</div><h3>${html(
          step.title,
        )}</h3><p>${html(step.description)}</p>${step.images.map(zoomImage).join("")}${step.substeps
          .map(
            (substep) =>
              `<div><h3>${html(joinClean([substep.code, substep.title], " - "))}</h3><p>${html(
                substep.description,
              )}</p>${substep.images.map(zoomImage).join("")}</div>`,
          )
          .join("")}</article>`,
    )
    .join("")}</div></section>
<section id="sipoc"><div class="section-head"><span>04</span><div><h2>Análise SIPOC</h2><p>Fornecedores, entradas, processo, saídas e clientes.</p></div></div><table class="sipoc"><thead><tr><th>Fornecedores</th><th>Entradas</th><th>Processo</th><th>Saídas</th><th>Clientes</th></tr></thead><tbody>${model.sipocRows
    .map(
      (row) =>
        `<tr><td>${html(row.fornecedores)}</td><td>${html(row.entradas)}</td><td>${html(
          row.processo,
        )}</td><td>${html(row.saidas)}</td><td>${html(row.clientes)}</td></tr>`,
    )
    .join("")}</tbody></table></section>
<section id="causas"><div class="section-head"><span>05</span><div><h2>Causas-Raiz e Planos de Ação</h2><p>Causas priorizadas para encaminhamento.</p></div></div><div class="causes">${model.gaps
    .map(
      (gap, index) =>
        `<article><div class="num">${String(index + 1).padStart(2, "0")}</div><h3>${html(
          gap.title,
        )}</h3><p>${html(gap.description)}</p><p><b>Ação:</b> ${html(gap.action)}</p><p><b>Responsável:</b> ${html(
          gap.owner || "A definir",
        )}</p></article>`,
    )
    .join("")}</div></section>
<section id="proximos"><div class="section-head"><span>06</span><div><h2>Próximos Passos</h2><p>Responsáveis e prazos para continuidade.</p></div></div><div class="next">${model.nextSteps
    .map(
      (step, index) =>
        `<article><div class="num">${String(index + 1).padStart(2, "0")}</div><h3>${html(
          step.title,
        )}</h3><p>${html(step.description)}</p><p><b>Responsável:</b> ${html(
          step.owner || "A definir",
        )} · <b>Prazo:</b> ${html(step.due || "A definir")}</p></article>`,
    )
    .join("")}</div></section>
<section id="glossario"><div class="section-head"><span>07</span><div><h2>Glossário</h2><p>Termos operacionais e técnicos do relatório.</p></div></div>${cardGrid(
    model.glossary.map((item) => ({ title: item.termo, text: item.definicao })),
  )}</section>
</main>
<div class="zoom-modal" id="zoom-modal" onclick="closeImageZoom()"><div class="zoom-title" id="zoom-title"></div><button class="zoom-close" onclick="closeImageZoom();event.stopPropagation()">Fechar</button><img id="zoom-img" alt="Imagem ampliada"/></div>
<script>
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
    registrations: true,
    ddp: false,
    pop: false,
    bpmn: false,
    causes: false,
    settings: true,
    processRegistrations: true,
    systemRegistrations: true,
  });
  const [showSave, setShowSave] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [comment, setComment] = useState("");
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
  const [ddpView, setDdpView] = useState<"editor" | "causes" | "processes">("editor");
  const moduleDocLabel = moduleDocumentLabel(moduleId);

  const ensure = useServerFn(getOrCreateWorkspace);
  const listVersions = useServerFn(listWorkspaceVersions);
  const getVersion = useServerFn(getWorkspaceVersionContent);
  const me = useServerFn(getMe);
  const listCatalogs = useServerFn(listOrganizationCatalogs);
  const listDocumentModels = useServerFn(listOrganizationDocumentModels);
  const createDepartment = useServerFn(createOrganizationDepartment);
  const createProcessOwner = useServerFn(createOrganizationProcessOwner);
  const createSharedCause = useServerFn(createOrganizationCause);
  const createProcess = useServerFn(createOrganizationProcess);
  const updateProcess = useServerFn(updateOrganizationProcess);
  const listCloudDocuments = useServerFn(listModuleDocuments);
  const getCloudDocument = useServerFn(getModuleDocumentContent);
  const listCloudDocumentVersions = useServerFn(listModuleDocumentVersions);
  const getCloudDocumentVersion = useServerFn(getModuleDocumentVersionContent);
  const saveCloudDocument = useServerFn(saveModuleDocument);
  const removeCloudDocument = useServerFn(deleteModuleDocument);
  const updateCatalogItem = useServerFn(updateOrganizationCatalogItem);
  const removeCatalogItem = useServerFn(deleteOrganizationCatalogItem);
  const updateSharedCause = useServerFn(updateOrganizationCause);
  const removeSharedCause = useServerFn(deleteOrganizationCause);
  const removeProcess = useServerFn(deleteOrganizationProcess);
  const [demoCatalogs, setDemoCatalogs] = useState<OrganizationCatalogs>(DEMO_CATALOGS);
  const [processTypes, setProcessTypes] = useState(["macroprocess", "process", "subprocess"]);

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

  const documentModelsQ = useQuery({
    queryKey: ["module-document-models", isDemo ? "demo" : "cloud"],
    queryFn: () => listDocumentModels({ data: { organizationId: null } }),
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
    enabled: showHistory,
  });
  const catalogsQ = useQuery({
    queryKey: ["organization-catalogs", isDemo ? "demo" : "cloud"],
    queryFn: () => listCatalogs(),
    enabled: !isDemo && loaded,
  });
  const cloudDocsQ = useQuery({
    queryKey: ["module-documents", moduleId, isDemo ? "demo" : "cloud"],
    queryFn: () => listCloudDocuments({ data: { moduleId: moduleId as "ddp" | "pop" | "bpmn" } }),
    enabled: (showLibrary || moduleSurface === "consult") && !isDemo,
  });
  const draftKey = isDemo ? DRAFT_KEY : `${DRAFT_KEY}_${wsQ.data?.id ?? "cloud"}`;
  const organizationCatalogs: OrganizationCatalogs = isDemo
    ? demoCatalogs
    : {
        departments: catalogsQ.data?.departments ?? [],
        processOwners: catalogsQ.data?.processOwners ?? [],
        causes: catalogsQ.data?.causes ?? [],
        processes: catalogsQ.data?.processes ?? [],
        valueChains: catalogsQ.data?.valueChains ?? [],
      };
  const organizationBrand: OrganizationBrand = isDemo
    ? {
        name: "Bom Futuro",
        word_header_color: "1D1D1F",
        logo_data_url: demoOrganizationLogo,
      }
    : (meQ.data?.organization ?? { name: "Ateliam", word_header_color: "1D1D1F" });

  // Contexto de codificação da organização ativa (modo demo via localStorage).
  const codeKind = MODULE_CODE_KIND[moduleId];
  const demoOrgForCode = isDemo ? readActiveDemoOrganization() : null;
  const codeOrganizationId = isDemo ? demoOrgForCode!.id : (meQ.data?.organization?.id ?? null);
  const codeOrganizationSlug = isDemo
    ? demoOrgForCode!.slug
    : (meQ.data?.organization?.slug ?? null);
  const codeSettings: CodeSettings | null = isDemo
    ? demoOrgForCode!.code_settings
    : ((meQ.data?.organization?.code_settings as CodeSettings | null | undefined) ?? null);
  const codeRule = normalizeRule(codeKind, codeSettings?.[codeKind]);
  const isAutoCodeModule = codeRule.mode === "auto";
  const autoCodePreview = isAutoCodeModule
    ? formatCode(
        codeRule.mask,
        isDemo ? readDemoCodeNext(codeOrganizationId, codeKind, codeRule.next) : codeRule.next,
        { slug: codeOrganizationSlug },
      )
    : "";

  const reserveCodeFn = useServerFn(reserveCode);
  // Reserva o próximo código (consome a sequência) no momento de salvar.
  async function reserveModuleCode(): Promise<string> {
    if (isDemo) {
      return reserveDemoCode(codeOrganizationId, codeKind, codeSettings, codeOrganizationSlug);
    }
    const result = await reserveCodeFn({
      data: { organizationId: codeOrganizationId, kind: codeKind },
    });
    return result.code;
  }

  const documentModels = isDemo
    ? demoDocumentModels
    : DEFAULT_DOCUMENT_MODELS.map((fallback) => ({
        ...fallback,
        ...((documentModelsQ.data as DocumentModelRow[] | undefined)?.find(
          (row) => row.model_key === fallback.model_key,
        ) ?? {}),
      }));

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
    setExpandedTree((current) => ({
      ...current,
      modules: true,
      ddp: false,
      pop: false,
      bpmn: false,
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
    }
  }, [moduleId, search.view]);

  useEffect(() => {
    const key = `ateliam-process-types:${organizationBrand.name || "default"}`;
    try {
      const stored = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
      if (Array.isArray(stored)) {
        const values = stored.filter(
          (item): item is string => typeof item === "string" && !!item.trim(),
        );
        if (values.length) setProcessTypes(values);
      }
    } catch {
      // Keep the default process types when local preferences are unavailable.
    }
  }, [organizationBrand.name]);

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
            description: "JSON Ateliam",
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
      : `ateliam-${moduleId}-${today()}.json`;

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
        primaryProcessVersion: ws.ddp.macroprocess.processVersion || null,
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
      toast.info("Importação textual por Excel está disponível para DDP e POP por enquanto.");
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
      // Geração automática de código: reserva a sequência quando configurado e
      // o documento ainda não tem código.
      let workspaceToSave = workspace;
      if (isAutoCodeModule && !currentModuleCode(workspace)) {
        const reserved = await reserveModuleCode();
        workspaceToSave = withModuleCode(workspace, reserved);
        setWorkspace(workspaceToSave);
        window.localStorage.setItem(draftKey, JSON.stringify(workspaceToSave));
      }
      const fullComment = `[${moduleInfo.title}] ${comment || "Versão salva"}`;
      if (isDemo) return saveDemoWorkspaceVersion(JSON.stringify(workspaceToSave), fullComment);
      const payload = currentModuleSavePayload(workspaceToSave);
      const row = await saveCloudDocument({
        data: {
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
      toast.success(`Versão v${result.version} salva.`);
      setShowSave(false);
      setComment("");
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
    const model = documentModels.find((item) => item.model_key === modelKey);
    return {
      name: model?.logo_data_url ? organizationBrand.name : "Ateliam",
      logo_data_url: model?.logo_data_url ?? null,
      word_header_color: model?.primary_color ?? "1D1F23",
    };
  }

  async function addDepartmentToCatalog(name: string) {
    const clean = plain(name);
    if (!clean) return null;
    const existing = organizationCatalogs.departments.find(
      (item) => normalizeLabel(item.name) === normalizeLabel(clean),
    );
    if (existing) return existing;
    if (isDemo) {
      const row = { id: id("dept"), name: clean };
      setDemoCatalogs((current) => ({ ...current, departments: [...current.departments, row] }));
      return row;
    }
    const row = await createDepartment({ data: { name: clean } });
    await catalogsQ.refetch();
    return row;
  }

  async function addProcessOwnerToCatalog(name: string) {
    const clean = plain(name);
    if (!clean) return null;
    const existing = organizationCatalogs.processOwners.find(
      (item) => normalizeLabel(item.name) === normalizeLabel(clean),
    );
    if (existing) return existing;
    if (isDemo) {
      const row = { id: id("owner"), name: clean };
      setDemoCatalogs((current) => ({
        ...current,
        processOwners: [...current.processOwners, row],
      }));
      return row;
    }
    const row = await createProcessOwner({ data: { name: clean } });
    await catalogsQ.refetch();
    return row;
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
      priority: gap.prioridade || "Média",
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

  async function addProcessToCatalog(
    draft: Partial<OrganizationProcess> & { name: string; type?: string },
  ) {
    const name = plain(draft.name);
    if (!name) throw new Error("Informe o nome do processo.");
    const existing = organizationCatalogs.processes.find(
      (item) => normalizeLabel(item.name) === normalizeLabel(name),
    );
    if (existing) return existing;
    const payload = {
      code: plain(draft.code) || null,
      name,
      type:
        draft.type === "macroprocess" || draft.type === "subprocess" || draft.type === "process"
          ? draft.type
          : "process",
      parent_process_id: draft.parent_process_id || null,
      department: plain(draft.department) || null,
      owner: plain(draft.owner) || null,
      description: plain(draft.description) || null,
      status:
        draft.status === "Em revisão" || draft.status === "Arquivado" || draft.status === "Ativo"
          ? draft.status
          : "Ativo",
    };
    if (isDemo) {
      const row: OrganizationProcess = {
        id: id("process"),
        organization_id: "demo",
        current_version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...payload,
      };
      setDemoCatalogs((current) => ({ ...current, processes: [...current.processes, row] }));
      return row;
    }
    const row = await createProcess({ data: payload });
    await catalogsQ.refetch();
    return row;
  }

  async function updateProcessCatalog(process: OrganizationProcess) {
    if (isDemo) {
      const row = {
        ...process,
        current_version: process.current_version + 1,
        updated_at: new Date().toISOString(),
      };
      setDemoCatalogs((current) => ({
        ...current,
        processes: current.processes.map((item) => (item.id === row.id ? row : item)),
      }));
      return row;
    }
    const row = await updateProcess({
      data: {
        id: process.id,
        code: process.code,
        name: process.name,
        type: process.type as "macroprocess" | "process" | "subprocess",
        parent_process_id: process.parent_process_id,
        department: process.department,
        owner: process.owner,
        description: process.description,
        status: process.status as "Ativo" | "Em revisão" | "Arquivado",
      },
    });
    await catalogsQ.refetch();
    return row;
  }

  async function deleteProcessCatalog(processId: string) {
    if (isDemo) {
      setDemoCatalogs((current) => ({
        ...current,
        processes: current.processes.filter((item) => item.id !== processId),
      }));
      return;
    }
    await removeProcess({ data: { id: processId } });
    await catalogsQ.refetch();
  }

  async function saveCatalogName(kind: "department" | "owner", item: OrganizationCatalogItem) {
    if (isDemo) {
      setDemoCatalogs((current) => ({
        ...current,
        [kind === "department" ? "departments" : "processOwners"]: (kind === "department"
          ? current.departments
          : current.processOwners
        ).map((row) => (row.id === item.id ? { ...row, name: item.name } : row)),
      }));
      return item;
    }
    const row = await updateCatalogItem({ data: { kind, id: item.id, name: item.name } });
    await catalogsQ.refetch();
    return row;
  }

  async function deleteCatalogName(kind: "department" | "owner", itemId: string) {
    if (isDemo) {
      setDemoCatalogs((current) => ({
        ...current,
        [kind === "department" ? "departments" : "processOwners"]: (kind === "department"
          ? current.departments
          : current.processOwners
        ).filter((row) => row.id !== itemId),
      }));
      return;
    }
    await removeCatalogItem({ data: { kind, id: itemId } });
    await catalogsQ.refetch();
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

  function persistProcessTypes(next: string[]) {
    const normalized = [...new Set(next.map((item) => item.trim()).filter(Boolean))];
    setProcessTypes(normalized);
    try {
      window.localStorage.setItem(
        `ateliam-process-types:${organizationBrand.name || "default"}`,
        JSON.stringify(normalized),
      );
    } catch {
      // The in-memory catalog remains usable when local storage is blocked.
    }
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
    setRailArea(area);
    setTreeOpen(true);
    if (area === "modules") {
      setContentMode("module");
      setExpandedTree((current) => ({ ...current, modules: true }));
    }
    if (area === "registrations") {
      setContentMode("registrations");
      setExpandedTree((current) => ({ ...current, registrations: true }));
    }
    if (area === "settings") {
      setContentMode("settings");
      setExpandedTree((current) => ({ ...current, settings: true }));
    }
  }

  function selectRegistration(view: ModuleRegistrationView) {
    setRailArea("registrations");
    setContentMode("registrations");
    setRegistrationView(view);
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
  );

  async function editDocumentRow(row: ModuleGridRow) {
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
        await Promise.all(ids.map((item) => removeCloudDocument({ data: { id: item } })));
        await cloudDocsQ.refetch();
      }
      toast.success(ids.length > 1 ? "Registros excluídos." : "Registro excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o registro.");
    }
  }

  async function exportDocumentRow(
    row: ModuleGridRow,
    format: "ddp-html" | "ddp-docx" | "pop-docx",
  ) {
    const cloudDocument = (cloudDocsQ.data as CloudModuleDocument[] | undefined)?.find(
      (document) => document.id === row.id,
    );
    const snapshot = row.id.startsWith("demo-saved:")
      ? savedDemoDocument?.workspace
      : cloudDocument?.content_inline
        ? parseWorkspace(cloudDocument.content_inline)
        : null;
    if (!snapshot) throw new Error("Documento salvo não encontrado.");

    if (format === "ddp-html") {
      const filename = cleanFileName(
        `${snapshot.ddp.meta.codigo}-${snapshot.ddp.meta.titulo}-apresentacao-${stamp()}`,
      );
      downloadText(
        `${filename}.html`,
        buildDdpPresentationHtml(snapshot.ddp, brandForDocumentModel("ddp-html")),
        "text/html;charset=utf-8",
      );
    } else if (format === "ddp-docx") {
      const filename = cleanFileName(`${snapshot.ddp.meta.codigo}-${snapshot.ddp.meta.titulo}`);
      downloadBlob(
        `${filename}.docx`,
        buildDdpDocx(snapshot.ddp, brandForDocumentModel("ddp-word")),
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
    toast.success("Documento exportado a partir da versão salva.");
  }

  const moduleMainContent =
    contentMode === "registrations" ? (
      registrationView === "processes" ? (
        <ProcessRegistryModule
          catalogs={organizationCatalogs}
          processTypes={processTypes}
          onCreateProcess={addProcessToCatalog}
          onUpdateProcess={updateProcessCatalog}
          onDeleteProcess={deleteProcessCatalog}
          onOpenEditor={() => {
            setDdpView("editor");
            openModuleBranch("ddp");
          }}
        />
      ) : registrationView === "areas" || registrationView === "owners" ? (
        <CatalogRegistryModule
          title={registrationView === "areas" ? "Áreas" : "Donos de Processo"}
          singular={registrationView === "areas" ? "área" : "dono de processo"}
          items={
            registrationView === "areas"
              ? organizationCatalogs.departments
              : organizationCatalogs.processOwners
          }
          onCreate={
            registrationView === "areas" ? addDepartmentToCatalog : addProcessOwnerToCatalog
          }
          onUpdate={(item) =>
            saveCatalogName(registrationView === "areas" ? "department" : "owner", item)
          }
          onDelete={(id) =>
            deleteCatalogName(registrationView === "areas" ? "department" : "owner", id)
          }
        />
      ) : (
        <ProcessTypeRegistryModule values={processTypes} onChange={persistProcessTypes} />
      )
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
      />
    ) : (
      <>
        {!loaded && !isDemo ? (
          <Panel>
            <div className="py-20 text-center text-sm text-[#6e6e73]">Carregando workspace...</div>
          </Panel>
        ) : null}
        {loaded && moduleId === "ddp" ? (
          ddpView === "processes" ? (
            <ProcessRegistryModule
              catalogs={organizationCatalogs}
              processTypes={processTypes}
              onCreateProcess={addProcessToCatalog}
              onUpdateProcess={updateProcessCatalog}
              onDeleteProcess={deleteProcessCatalog}
              onOpenEditor={() => setDdpView("editor")}
            />
          ) : ddpView === "causes" ? (
            <DdpCausesModule
              data={workspace.ddp}
              catalogs={organizationCatalogs}
              update={(ddp) => updateWorkspace((current) => ({ ...current, ddp }))}
              onCreateSharedCause={addCauseToCatalog}
              onUpdateSharedCause={updateCauseCatalog}
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
            />
          ) : (
            <DdpModule
              data={workspace.ddp}
              catalogs={organizationCatalogs}
              update={(ddp) => updateWorkspace((current) => ({ ...current, ddp }))}
              onCreateSharedCause={addCauseToCatalog}
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
            />
          ) : (
            <PopModule
              data={workspace.pop}
              update={(pop) => updateWorkspace((current) => ({ ...current, pop }))}
              autoCode={isAutoCodeModule}
              codePreview={autoCodePreview}
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
          title={treeOpen ? "Ocultar navegação" : "Mostrar navegação"}
        >
          {treeOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex items-center gap-2.5">
          {organizationBrand.logo_data_url ? (
            <img
              src={organizationBrand.logo_data_url}
              alt={`Logo ${organizationBrand.name}`}
              className="h-8 w-20 object-contain object-left"
            />
          ) : (
            <AteliamMark
              className="h-7 w-7 text-foreground"
              markClassName="h-3.5 w-3.5 after:h-1.5 after:w-1.5"
            />
          )}
        </div>
        <div className="h-6 w-px bg-border" />
        <div className="hidden min-w-0 items-center gap-2 md:flex">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-muted text-foreground">
            {moduleId === "ddp" ? <FileText className="h-4 w-4" /> : null}
            {moduleId === "pop" ? <CheckCircle2 className="h-4 w-4" /> : null}
            {moduleId === "bpmn" ? <GitBranch className="h-4 w-4" /> : null}
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-bold">{moduleInfo.title}</div>
          </div>
        </div>
        <div className="flex-1" />
        {(moduleId === "ddp" || moduleId === "pop") &&
        contentMode === "module" &&
        moduleSurface === "editor" &&
        moduleEditStarted ? (
          <button
            type="button"
            onClick={() => setShowSave(true)}
            className="grid h-9 w-9 place-items-center rounded-md bg-primary text-primary-foreground shadow-sm hover:opacity-90"
            title={`Salvar ${moduleDocLabel}`}
            aria-label={`Salvar ${moduleDocLabel}`}
          >
            <Save className="h-4 w-4" />
          </button>
        ) : null}
        {isDemo && (
          <span className="hidden items-center gap-1.5 rounded-md border border-border bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground sm:inline-flex">
            <FlaskConical className="h-3.5 w-3.5" />
            Teste local v{demoVersion}
          </span>
        )}
        <UserProfileMenu
          email={isDemo ? "analista.local@ateliam" : (meQ.data?.profile?.email ?? "")}
          organizationName={organizationBrand.name ?? "Ateliam"}
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
        <nav className="sticky top-14 h-[calc(100vh-3.5rem)] border-r border-border bg-card/70 py-3">
          <ModuleRailButton
            active={railArea === "home"}
            label="Home"
            onClick={() => selectRailArea("home")}
          >
            <Home className="h-4 w-4" />
          </ModuleRailButton>
          <ModuleRailButton
            active={railArea === "modules"}
            label="Módulos"
            onClick={() => selectRailArea("modules")}
          >
            <LayoutGrid className="h-4 w-4" />
          </ModuleRailButton>
          <ModuleRailButton
            active={railArea === "registrations"}
            label="Cadastros"
            onClick={() => selectRailArea("registrations")}
          >
            <Database className="h-4 w-4" />
          </ModuleRailButton>
          <div className="mt-auto" />
          <ModuleRailButton
            active={railArea === "settings"}
            label="Configurações"
            onClick={() => selectRailArea("settings")}
          >
            <Settings className="h-4 w-4" />
          </ModuleRailButton>
        </nav>

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
            className={`fixed bottom-0 left-[52px] top-14 z-30 min-h-0 w-[min(320px,calc(100vw-52px))] overflow-hidden border-r border-border bg-card shadow-xl lg:static lg:w-auto lg:bg-card/58 lg:shadow-none ${
              treeOpen ? "block" : "hidden lg:block"
            }`}
          >
            <div className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col">
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
                    <LayoutGrid className="h-4 w-4 text-foreground" />
                  ) : railArea === "registrations" ? (
                    <Database className="h-4 w-4 text-foreground" />
                  ) : (
                    <Settings className="h-4 w-4 text-foreground" />
                  )}
                  <div className="truncate font-display text-base font-bold">
                    {railArea === "home"
                      ? "Home"
                      : railArea === "modules"
                        ? "Módulos"
                        : railArea === "registrations"
                          ? "Cadastros"
                          : "Configurações"}
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {railArea === "home" ? (
                  <ModuleTreeSection
                    title="Organização Ativa"
                    open={expandedTree.home}
                    onToggle={() => toggleTree("home")}
                  >
                    <ModuleTreeButton onClick={() => navigate({ to: "/" })}>
                      Visão geral
                    </ModuleTreeButton>
                  </ModuleTreeSection>
                ) : null}

                {railArea === "modules" ? (
                  <div className="grid gap-1">
                    <ModuleTreeBranch
                      title="Mapeamento"
                      active={moduleId === "ddp"}
                      open={expandedTree.ddp}
                      onSelect={() => openModuleBranch("ddp")}
                      onToggle={() => toggleTree("ddp")}
                    >
                      <ModuleTreeButton onClick={() => openNewForModule("ddp")}>
                        Novo
                      </ModuleTreeButton>
                      <ModuleTreeButton onClick={() => openSearchForModule("ddp")}>
                        Consultar
                      </ModuleTreeButton>
                      <ModuleTreeSection
                        title="Causas"
                        open={expandedTree.causes}
                        onToggle={() => toggleTree("causes")}
                      >
                        <ModuleTreeButton onClick={() => openCauses("new")}>Novo</ModuleTreeButton>
                        <ModuleTreeButton onClick={() => openCauses("consult")}>
                          Consultar
                        </ModuleTreeButton>
                        <ModuleTreeButton onClick={() => openCauses("edit")}>
                          Editar
                        </ModuleTreeButton>
                      </ModuleTreeSection>
                    </ModuleTreeBranch>

                    <ModuleTreeBranch
                      title="Documentação"
                      active={moduleId === "pop"}
                      open={expandedTree.pop}
                      onSelect={() => openModuleBranch("pop")}
                      onToggle={() => toggleTree("pop")}
                    >
                      <ModuleTreeButton onClick={() => openNewForModule("pop")}>
                        Novo
                      </ModuleTreeButton>
                      <ModuleTreeButton onClick={() => openSearchForModule("pop")}>
                        Consultar
                      </ModuleTreeButton>
                    </ModuleTreeBranch>

                    <ModuleTreeBranch
                      title="Fluxograma"
                      active={moduleId === "bpmn"}
                      open={expandedTree.bpmn}
                      onSelect={() => openModuleBranch("bpmn")}
                      onToggle={() => toggleTree("bpmn")}
                    >
                      <ModuleTreeButton onClick={() => openNewForModule("bpmn")}>
                        Novo
                      </ModuleTreeButton>
                      <ModuleTreeButton onClick={() => openSearchForModule("bpmn")}>
                        Consultar
                      </ModuleTreeButton>
                    </ModuleTreeBranch>
                  </div>
                ) : null}

                {railArea === "registrations" ? (
                  <div className="grid gap-1">
                    <ModuleTreeAnchor href="/?area=registrations&view=value-chains">
                      Cadeia de valor
                    </ModuleTreeAnchor>
                    <ModuleTreeAnchor href="/?area=registrations&view=processes">
                      Processos
                    </ModuleTreeAnchor>
                    <ModuleTreeAnchor href="/?area=registrations&view=areas">
                      Áreas
                    </ModuleTreeAnchor>
                    <ModuleTreeAnchor href="/?area=registrations&view=owners">
                      Donos de Processo
                    </ModuleTreeAnchor>
                    <ModuleTreeAnchor href="/?area=registrations&view=process-types">
                      Tipos
                    </ModuleTreeAnchor>
                  </div>
                ) : null}

                {railArea === "settings" ? (
                  <div className="grid gap-1">
                    <ModuleTreeAnchor href="/?area=settings&view=users">Usuários</ModuleTreeAnchor>
                    <ModuleTreeAnchor href="/?area=settings&view=organizations">
                      Organizações
                    </ModuleTreeAnchor>
                    <ModuleTreeAnchor href="/?area=settings&view=document-models">
                      Modelos de Documentos
                    </ModuleTreeAnchor>
                    <ModuleTreeButton
                      active={settingsView === "theme"}
                      onClick={() => selectSettings("theme")}
                    >
                      Tema
                    </ModuleTreeButton>
                    <ModuleTreeButton onClick={signOut}>Sair</ModuleTreeButton>
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
          title="Salvar versão"
          subtitle="Cria um ponto de restauração para este workspace."
          onClose={() => setShowSave(false)}
        >
          <textarea
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Descreva rapidamente o que foi alterado"
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

      {showHistory && (
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
                    {new Date(version.created_at).toLocaleString("pt-BR")}
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
                  v{document.current_version}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-black text-[#1d1d1f]">{document.name}</div>
                  <div className="mt-1 truncate text-xs text-[#6e6e73]">
                    Atualizado em {new Date(document.updated_at).toLocaleString("pt-BR")}
                    {document.primary_process_version
                      ? ` · Processo v${document.primary_process_version}`
                      : ""}
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

function ModuleRailButton({
  active,
  label,
  children,
  onClick,
}: {
  active?: boolean;
  label: string;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`mx-auto mb-1 grid h-10 w-10 place-items-center rounded-lg transition ${
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ModuleTreeSection({
  title,
  open,
  children,
  onToggle,
}: {
  title: string;
  open: boolean;
  children: ReactNode;
  onToggle: () => void;
}) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] font-bold uppercase tracking-[0.12em] text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {title}
      </button>
      {open ? <div className="ml-3 border-l border-border pl-2">{children}</div> : null}
    </div>
  );
}

function ModuleTreeBranch({
  title,
  active,
  open,
  children,
  onSelect,
  onToggle,
}: {
  title: string;
  active?: boolean;
  open: boolean;
  children: ReactNode;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="mb-1">
      <div
        className={`flex items-stretch rounded-md ${
          active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center px-2 py-1.5 text-left"
        >
          <span className="block min-w-0 truncate text-sm font-normal text-foreground">
            {title}
          </span>
        </button>
        <button
          type="button"
          onClick={onToggle}
          className="grid w-8 place-items-center rounded-r-md text-muted-foreground hover:bg-muted hover:text-foreground"
          title={open ? "Recolher módulo" : "Expandir módulo"}
        >
          {open ? (
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {open ? <div className="ml-5 border-l border-border py-1 pl-2">{children}</div> : null}
    </div>
  );
}

function ModuleTreeButton({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`mb-1 flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function ModuleTreeAnchor({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="mb-1 flex w-full items-center rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
    >
      {children}
    </a>
  );
}

function ModuleRegistrationsPanel({
  view,
  organizationName,
}: {
  view:
    | ModuleRegistrationView
    | "organizations"
    | "users"
    | "document-models"
    | "roles"
    | "access-profiles"
    | "document-types"
    | "systems"
    | "causes";
  organizationName: string;
}) {
  const [selectedId, setSelectedId] = useState("");
  const copy: Record<string, { eyebrow: string; title: string; text: string }> = {
    organizations: {
      eyebrow: "cadastros",
      title: "Organizações",
      text: `Mantenha os dados das organizações atendidas pelo Ateliam. Organização atual: ${organizationName}.`,
    },
    users: {
      eyebrow: "cadastros",
      title: "Usuários",
      text: "Cadastre usuários, senhas e vínculo com a organização antes de liberar acesso aos módulos.",
    },
    areas: {
      eyebrow: "cadastros",
      title: "Áreas",
      text: "Mantenha áreas e departamentos selecionáveis nos mapeamentos, documentos e processos.",
    },
    roles: {
      eyebrow: "cadastros",
      title: "Cargos e funções",
      text: "Cadastre cargos, funções e papéis organizacionais para compor responsabilidades.",
    },
    "access-profiles": {
      eyebrow: "cadastros",
      title: "Perfis de acesso",
      text: "Defina perfis de acesso por organização, separando consulta, edição, aprovação e administração.",
    },
    "document-types": {
      eyebrow: "cadastros",
      title: "Tipos de documento",
      text: "Organize os tipos usados pela documentação, como Norma, POP, IT, relatório e apresentação.",
    },
    "document-models": {
      eyebrow: "cadastros",
      title: "Modelos de documento",
      text: "Cadastre modelos oficiais para orientar preenchimento, versionamento e exportação.",
    },
    systems: {
      eyebrow: "cadastros",
      title: "Sistemas",
      text: "Centralize sistemas corporativos usados nos processos, mapeamentos e fluxogramas.",
    },
    owners: {
      eyebrow: "cadastros",
      title: "Responsáveis",
      text: "Mantenha responsáveis e donos de processo reutilizáveis em todos os documentos da organização.",
    },
    processes: {
      eyebrow: "cadastros",
      title: "Processos",
      text: "Cadastre e versione processos para manter vínculo entre mapeamentos, documentos e fluxogramas.",
    },
    causes: {
      eyebrow: "cadastros",
      title: "Causas",
      text: "Consulte causas reutilizáveis e acompanhe status, responsáveis e comentários.",
    },
  };
  const item = copy[view];
  const rows =
    view === "organizations"
      ? [
          {
            id: "organization",
            name: organizationName,
            detail: "Organização ativa",
            status: "Ativa",
          },
        ]
      : view === "users"
        ? [{ id: "current-user", name: "Usuário atual", detail: organizationName, status: "Ativo" }]
        : [
            {
              id: "ddp-model",
              name: "Modelo de Mapeamento",
              detail: "HTML e Word",
              status: "Ativo",
            },
            { id: "pop-model", name: "Modelo de Documentação", detail: "Word", status: "Ativo" },
          ];

  function exportRows() {
    downloadBlob(
      `${cleanFileName(item.title)}-${today()}.xlsx`,
      buildXlsxWorkbook([
        {
          name: item.title,
          rows: [
            ["Nome", "Detalhe", "Status"],
            ...rows.map((row) => [row.name, row.detail, row.status]),
          ],
        },
      ]),
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="border-b border-border px-5 py-4">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {item.eyebrow}
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-foreground">{item.title}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{item.text}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/settings"
              className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
            >
              <Plus className="h-4 w-4" /> Novo
            </a>
            <a
              href="/settings"
              aria-disabled={!selectedId}
              className={`inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted ${!selectedId ? "pointer-events-none opacity-40" : ""}`}
            >
              <Pencil className="h-4 w-4" /> Editar
            </a>
            <button
              type="button"
              disabled={!selectedId}
              onClick={() =>
                toast.info("A exclusão deste cadastro exige validação administrativa.")
              }
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" /> Excluir
            </button>
            <button
              type="button"
              onClick={exportRows}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted"
            >
              <FileSpreadsheet className="h-4 w-4" /> Exportar para Excel
            </button>
          </div>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-muted/80 text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-3" />
              <th className="px-3 py-3">Nome</th>
              <th className="px-3 py-3">Detalhe</th>
              <th className="px-3 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                className={`cursor-pointer border-t border-border ${selectedId === row.id ? "bg-accent/70" : "hover:bg-muted/45"}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="radio"
                    checked={selectedId === row.id}
                    onChange={() => setSelectedId(row.id)}
                  />
                </td>
                <td className="px-3 py-3 font-semibold">{row.name}</td>
                <td className="px-3 py-3 text-muted-foreground">{row.detail}</td>
                <td className="px-3 py-3">
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold">
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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
      eyebrow: "configurações",
      title: "Aparência",
      text: `Ajuste a experiência visual do workspace para a organização ${organizationName}.`,
    },
    theme: {
      eyebrow: "configurações",
      title: "Tema",
      text: "Controle tema claro, escuro e preferência automática do navegador.",
    },
    preferences: {
      eyebrow: "configurações",
      title: "Preferências",
      text: "Defina comportamento padrão, densidade visual e preferências gerais do workspace.",
    },
    "visual-identity": {
      eyebrow: "identidade visual",
      title: "Identidade visual",
      text: "Configure logo, cores institucionais e personalização dos cabeçalhos dos documentos exportados.",
    },
    integrations: {
      eyebrow: "configurações",
      title: "Integrações",
      text: "Gerencie conexões do sistema, serviços externos e integrações técnicas.",
    },
    "local-environment": {
      eyebrow: "configurações",
      title: "Ambiente de teste/local",
      text: "Controle recursos locais de teste sem expor ações técnicas na navegação dos módulos.",
    },
    profile: {
      eyebrow: "perfil e acesso",
      title: "Perfil",
      text: "Use o avatar no canto superior direito para adicionar sua foto, trocar a senha ou sair do sistema.",
    },
  };
  const item = copy[view];
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
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
      code: workspace.ddp.meta.codigo || "-",
      name: workspace.ddp.meta.titulo || "Mapeamento sem título",
      type: "Mapeamento",
      process: workspace.ddp.macroprocess.titulo || "-",
      area: workspace.ddp.meta.area || "-",
      owner: workspace.ddp.overview.donoProcesso || "-",
      responsible: workspace.ddp.meta.responsavel || workspace.ddp.meta.elaborador || "-",
    };
  }
  if (moduleId === "pop") {
    return {
      ...base,
      code: workspace.pop.meta.codigo || "-",
      name: workspace.pop.meta.titulo || "Documento sem título",
      type: workspace.pop.meta.tipo || "Documento",
      process: workspace.pop.meta.processo || "-",
      area: workspace.pop.meta.area || "-",
      owner: "-",
      responsible: workspace.pop.meta.elaboracao || workspace.pop.meta.aprovacao || "-",
    };
  }
  return {
    ...base,
    code: "FLX",
    name: workspace.bpmn.poolName || "Fluxograma sem título",
    type: "Fluxo de atividades",
    process: workspace.bpmn.poolName || "-",
    area: "-",
    owner: "-",
    responsible: workspace.bpmn.lanes.filter(Boolean).join(" / ") || "-",
  };
}

function buildModuleGridRows(
  moduleId: AteliamModule,
  documents: CloudModuleDocument[],
  savedDemoDocument: {
    id: string;
    workspace: WorkspaceState;
    updatedAt: string;
  } | null,
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
  if (!savedDemoDocument) return [];
  return [
    moduleGridRowFromWorkspace(moduleId, savedDemoDocument.workspace, {
      id: savedDemoDocument.id,
      status: "Salvo",
      updatedAt: savedDemoDocument.updatedAt,
    }),
  ];
}

function ModuleDocumentGrid({
  moduleId,
  rows,
  loading,
  onEdit,
  onDelete,
  onExport,
}: {
  moduleId: AteliamModule;
  rows: ModuleGridRow[];
  loading: boolean;
  onEdit: (row: ModuleGridRow) => void | Promise<void>;
  onDelete: (ids: string[]) => void | Promise<void>;
  onExport: (
    row: ModuleGridRow,
    format: "ddp-html" | "ddp-docx" | "pop-docx",
  ) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
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
          ["name", "Nome do processo"],
          ["area", "Área"],
          ["owner", "Dono do processo"],
          ["responsible", "Responsável"],
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

  function toggleRow(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function exportVisibleRows() {
    const workbookRows = [
      columns.map(([, label]) => label),
      ...filtered.map((row) =>
        columns.map(([key]) => {
          const value = row[key as keyof ModuleGridRow];
          return key === "updatedAt" ? new Date(value).toLocaleString("pt-BR") : value;
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
    if (!window.confirm(`Excluir ${selected.length} registro(s) selecionado(s)?`)) return;
    await onDelete(selected);
    setSelected([]);
  }

  const selectedRow =
    selected.length === 1 ? rows.find((row) => row.id === selected[0]) : undefined;

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="border-b border-border bg-card px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {moduleDocumentLabel(moduleId)}
            </div>
            <h1 className="mt-1 text-xl font-semibold text-foreground">Consultar registros</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!selectedRow}
              onClick={() => selectedRow && onEdit(selectedRow)}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Pencil className="h-4 w-4" />
              Editar
            </button>
            <button
              type="button"
              disabled={!selected.length}
              onClick={removeSelected}
              className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
              Excluir
            </button>
            {moduleId === "ddp" ? (
              <>
                <button
                  type="button"
                  disabled={!selectedRow}
                  onClick={() => selectedRow && onExport(selectedRow, "ddp-html")}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download className="h-4 w-4" /> HTML
                </button>
                <button
                  type="button"
                  disabled={!selectedRow}
                  onClick={() => selectedRow && onExport(selectedRow, "ddp-docx")}
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <FileText className="h-4 w-4" /> Word
                </button>
              </>
            ) : null}
            {moduleId === "pop" ? (
              <button
                type="button"
                disabled={!selectedRow}
                onClick={() => selectedRow && onExport(selectedRow, "pop-docx")}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
              >
                <FileText className="h-4 w-4" /> Word
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
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] table-fixed border-collapse text-left text-sm">
          <thead className="bg-muted/80 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Selecionar registros exibidos"
                  checked={!!filtered.length && filtered.every((row) => selected.includes(row.id))}
                  onChange={(event) =>
                    setSelected(event.target.checked ? filtered.map((row) => row.id) : [])
                  }
                />
              </th>
              {columns.map(([, label]) => (
                <th key={label} className="px-3 py-3 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  Carregando registros...
                </td>
              </tr>
            ) : null}
            {!loading && !filtered.length ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : null}
            {!loading
              ? filtered.map((row) => (
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
                      return (
                        <td key={key} className="break-words px-3 py-3 text-foreground">
                          {key === "updatedAt" ? new Date(value).toLocaleString("pt-BR") : value}
                        </td>
                      );
                    })}
                  </tr>
                ))
              : null}
          </tbody>
        </table>
      </div>
      <footer className="border-t border-border bg-muted/35 px-5 py-3 text-xs text-muted-foreground">
        {filtered.length} registro(s) exibido(s) · {selected.length} selecionado(s)
      </footer>
    </section>
  );
}

function CatalogRegistryModule({
  title,
  singular,
  items,
  onCreate,
  onUpdate,
  onDelete,
}: {
  title: string;
  singular: string;
  items: OrganizationCatalogItem[];
  onCreate: (name: string) => Promise<OrganizationCatalogItem | null>;
  onUpdate: (item: OrganizationCatalogItem) => Promise<OrganizationCatalogItem | null | void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<OrganizationCatalogItem | null>(null);

  async function save() {
    if (!draft?.name.trim()) return;
    try {
      if (draft.id) await onUpdate({ ...draft, name: draft.name.trim() });
      else await onCreate(draft.name.trim());
      setDraft(null);
      toast.success(`${singular[0]?.toUpperCase()}${singular.slice(1)} salvo(a).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o cadastro.");
    }
  }

  async function remove() {
    if (!selectedId || !window.confirm(`Excluir o ${singular} selecionado?`)) return;
    try {
      await onDelete(selectedId);
      setSelectedId("");
      setDraft(null);
      toast.success("Cadastro excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o cadastro.");
    }
  }

  function exportRows() {
    downloadBlob(
      `${cleanFileName(title)}-${today()}.xlsx`,
      buildXlsxWorkbook([
        {
          name: title,
          rows: [
            ["Nome", "Criado em", "Atualizado em"],
            ...items.map((item) => [
              item.name,
              item.created_at ? new Date(item.created_at).toLocaleString("pt-BR") : "-",
              item.updated_at ? new Date(item.updated_at).toLocaleString("pt-BR") : "-",
            ]),
          ],
        },
      ]),
    );
  }

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Cadastros de Processo
          </div>
          <h1 className="mt-1 text-xl font-semibold">{title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setDraft({ id: "", name: "" })}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Novo
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => setDraft(items.find((item) => item.id === selectedId) ?? null)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-40"
          >
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={remove}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <button
            type="button"
            onClick={exportRows}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exportar para Excel
          </button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left text-sm">
          <thead className="bg-muted/80 text-xs text-muted-foreground">
            <tr>
              <th className="w-12 px-4 py-3" />
              <th className="px-3 py-3 font-semibold">Nome</th>
              <th className="px-3 py-3 font-semibold">Criado em</th>
              <th className="px-3 py-3 font-semibold">Atualizado em</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                onDoubleClick={() => setDraft(item)}
                className={`cursor-pointer border-t border-border ${selectedId === item.id ? "bg-accent/70" : "hover:bg-muted/45"}`}
              >
                <td className="px-4 py-3">
                  <input
                    type="radio"
                    checked={selectedId === item.id}
                    onChange={() => setSelectedId(item.id)}
                  />
                </td>
                <td className="px-3 py-3 font-semibold">{item.name}</td>
                <td className="px-3 py-3 text-muted-foreground">
                  {item.created_at ? new Date(item.created_at).toLocaleDateString("pt-BR") : "-"}
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  {item.updated_at ? new Date(item.updated_at).toLocaleDateString("pt-BR") : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {draft ? (
        <div className="border-t border-border bg-muted/25 p-5">
          <div className="grid max-w-xl gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <Field
              label={`Nome do ${singular}`}
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="h-10 rounded-md border border-border px-4 text-sm font-semibold hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              className="h-10 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              Salvar
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ProcessTypeRegistryModule({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}) {
  const items = values.map((name) => ({ id: name, name }));
  return (
    <CatalogRegistryModule
      title="Tipos"
      singular="tipo"
      items={items}
      onCreate={async (name) => {
        if (values.some((item) => normalizeLabel(item) === normalizeLabel(name))) return null;
        onChange([...values, name]);
        return { id: name, name };
      }}
      onUpdate={async (item) => {
        const previous = values.find((value) => value === item.id);
        if (!previous) return null;
        onChange(values.map((value) => (value === previous ? item.name : value)));
        return item;
      }}
      onDelete={async (id) => onChange(values.filter((value) => value !== id))}
    />
  );
}

function ProcessRegistryModule({
  catalogs,
  processTypes,
  onCreateProcess,
  onUpdateProcess,
  onDeleteProcess,
  onOpenEditor,
}: {
  catalogs: OrganizationCatalogs;
  processTypes: string[];
  onCreateProcess: (
    process: Partial<OrganizationProcess> & { name: string; type?: string },
  ) => Promise<OrganizationProcess>;
  onUpdateProcess: (process: OrganizationProcess) => Promise<OrganizationProcess>;
  onDeleteProcess: (processId: string) => Promise<void>;
  onOpenEditor: () => void;
}) {
  const processes = catalogs.processes;
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [draft, setDraft] = useState<OrganizationProcess | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const filtered = useMemo(() => {
    const normalized = normalizeLabel(query);
    return processes.filter((process) => {
      const matchesType = typeFilter === "Todos" || process.type === typeFilter;
      const matchesQuery =
        !normalized ||
        normalizeLabel(
          [
            process.code,
            process.name,
            process.department,
            process.owner,
            process.description,
            process.status,
          ].join(" "),
        ).includes(normalized);
      return matchesType && matchesQuery;
    });
  }, [processes, query, typeFilter]);

  const processOptions = processes.map((process) => ({
    id: process.id,
    label: processDisplayName(process),
  }));

  function newDraft() {
    setDraft({
      id: "",
      code: "",
      name: "",
      type: "process",
      parent_process_id: null,
      department: "",
      owner: "",
      description: "",
      status: "Ativo",
      current_version: 1,
      created_at: "",
      updated_at: "",
    });
  }

  async function saveDraft() {
    if (!draft) return;
    try {
      if (draft.id) {
        await onUpdateProcess(draft);
        toast.success("Processo atualizado e versionado.");
      } else {
        await onCreateProcess(draft);
        toast.success("Processo cadastrado.");
      }
      setDraft(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar o processo.");
    }
  }

  async function removeSelected() {
    if (!selectedId || !window.confirm("Excluir o processo selecionado?")) return;
    try {
      await onDeleteProcess(selectedId);
      setSelectedId("");
      setDraft(null);
      toast.success("Processo excluído.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir o processo.");
    }
  }

  function exportVisible() {
    downloadBlob(
      `processos-${today()}.xlsx`,
      buildXlsxWorkbook([
        {
          name: "Processos",
          rows: [
            ["Código", "Processo", "Tipo", "Área", "Dono", "Status", "Versão"],
            ...filtered.map((process) => [
              process.code || "-",
              process.name,
              process.type,
              process.department || "-",
              process.owner || "-",
              process.status,
              `v${process.current_version}`,
            ]),
          ],
        },
      ]),
    );
  }

  return (
    <div className="grid gap-5">
      <Hero title="Processos da organização" eyebrow="Catálogo · versões · vínculos" progress={100}>
        Consulte, cadastre e versione processos para que DDPs, macroprocessos e subprocessos tenham
        um vínculo corporativo claro.
      </Hero>
      <Panel title="Consulta de processos" progress={processes.length ? 100 : 0}>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_180px]">
          <Field label="Buscar" value={query} onChange={setQuery} />
          <SelectField
            label="Tipo"
            value={typeFilter}
            options={["Todos", ...processTypes]}
            onChange={setTypeFilter}
          />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={newDraft}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Novo processo
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={() => setDraft(processes.find((item) => item.id === selectedId) ?? null)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-40"
          >
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button
            type="button"
            disabled={!selectedId}
            onClick={removeSelected}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <button
            type="button"
            onClick={exportVisible}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exportar para Excel
          </button>
          <button
            type="button"
            onClick={onOpenEditor}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            <FileText className="h-4 w-4" /> Preenchimento
          </button>
        </div>
        <div className="overflow-hidden rounded-lg border border-[#d2d2d7] bg-white">
          <div className="overflow-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <thead className="bg-[#f5f5f7] text-[11px] uppercase tracking-[0.14em] text-[#6e6e73]">
                <tr>
                  <th className="w-12 px-3 py-3" />
                  <th className="px-3 py-3">Código</th>
                  <th className="px-3 py-3">Processo</th>
                  <th className="px-3 py-3">Tipo</th>
                  <th className="px-3 py-3">Área</th>
                  <th className="px-3 py-3">Dono</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Versão</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((process) => (
                  <tr
                    key={process.id}
                    onClick={() => setSelectedId(process.id)}
                    className={`cursor-pointer border-t border-[#d2d2d7] ${selectedId === process.id ? "bg-accent/70" : ""}`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="radio"
                        checked={selectedId === process.id}
                        onChange={() => setSelectedId(process.id)}
                      />
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#515154]">
                      {process.code || "-"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-black text-[#1d1d1f]">{process.name}</div>
                      <div className="mt-1 line-clamp-1 text-xs text-[#6e6e73]">
                        {process.description || "Sem descrição"}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#515154]">{process.type}</td>
                    <td className="px-3 py-3 text-[#515154]">{process.department || "-"}</td>
                    <td className="px-3 py-3 text-[#515154]">{process.owner || "-"}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full border border-[#d2d2d7] bg-[#f5f5f7] px-2.5 py-1 text-xs font-bold text-[#515154]">
                        {process.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-bold text-[#3f3f46]">
                      v{process.current_version}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setDraft(process)}
                        className="inline-flex items-center gap-2 rounded-lg border border-[#d2d2d7] px-3 py-2 text-xs font-bold text-[#3f3f46] hover:bg-[#f5f5f7]"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-sm text-[#6e6e73]">
                      Nenhum processo encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {draft ? (
        <Panel
          title={draft.id ? "Editar processo" : "Novo processo"}
          progress={completionPercent([draft.name, draft.type, draft.status])}
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Field
              label="Código"
              value={draft.code ?? ""}
              onChange={(code) => setDraft({ ...draft, code })}
            />
            <Field
              label="Nome do processo"
              value={draft.name}
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <SelectField
              label="Tipo"
              value={draft.type}
              options={processTypes}
              onChange={(type) => setDraft({ ...draft, type })}
            />
            <SelectField
              label="Processo pai"
              value={draft.parent_process_id ?? ""}
              options={["", ...processOptions.map((option) => option.id)]}
              onChange={(parent_process_id) =>
                setDraft({ ...draft, parent_process_id: parent_process_id || null })
              }
            />
            <SelectField
              label="Área / Departamento"
              value={draft.department ?? ""}
              options={["", ...catalogs.departments.map((item) => item.name)]}
              onChange={(department) => setDraft({ ...draft, department })}
            />
            <SelectField
              label="Dono"
              value={draft.owner ?? ""}
              options={["", ...catalogs.processOwners.map((item) => item.name)]}
              onChange={(owner) => setDraft({ ...draft, owner })}
            />
            <SelectField
              label="Status"
              value={draft.status}
              options={["Ativo", "Em revisão", "Arquivado"]}
              onChange={(status) => setDraft({ ...draft, status })}
            />
            <div className="md:col-span-3">
              <TextArea
                label="Descrição"
                value={draft.description ?? ""}
                onChange={(description) => setDraft({ ...draft, description })}
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="rounded-lg px-4 py-2 text-sm hover:bg-[#f5f5f7]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-lg bg-[#3f3f46] px-4 py-2 text-sm font-bold text-white hover:bg-[#27272a]"
            >
              Salvar processo
            </button>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function DdpCausesModule({
  data,
  catalogs,
  update,
  onCreateSharedCause,
  onUpdateSharedCause,
  onDeleteSharedCause,
  mode = "consult",
  onOpenEditor,
}: {
  data: DdpState;
  catalogs: OrganizationCatalogs;
  update: (value: DdpState) => void;
  onCreateSharedCause: (gap: GapItem) => Promise<OrganizationCause>;
  onUpdateSharedCause: (cause: OrganizationCause) => Promise<OrganizationCause>;
  onDeleteSharedCause: (causeId: string) => Promise<void>;
  mode?: "new" | "consult" | "edit";
  onOpenEditor: () => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [priorityFilter, setPriorityFilter] = useState("Todas");
  const [selectedId, setSelectedId] = useState(() => data.gaps[0]?.id ?? "");
  const [commentDraft, setCommentDraft] = useState("");
  const initializedNew = useRef(false);
  const selected = data.gaps.find((gap) => gap.id === selectedId) ?? data.gaps[0] ?? null;

  useEffect(() => {
    if (!selectedId && data.gaps[0]?.id) setSelectedId(data.gaps[0].id);
    if (selectedId && !data.gaps.some((gap) => gap.id === selectedId)) {
      setSelectedId(data.gaps[0]?.id ?? "");
    }
  }, [data.gaps, selectedId]);

  const filtered = useMemo(() => {
    const normalizedQuery = normalizeLabel(query);
    return data.gaps.filter((gap) => {
      const matchesQuery =
        !normalizedQuery ||
        normalizeLabel(
          [gap.causa, gap.descricao, gap.responsavel, gap.impacto, gap.acao].join(" "),
        ).includes(normalizedQuery);
      const matchesStatus = statusFilter === "Todos" || gap.status === statusFilter;
      const matchesPriority = priorityFilter === "Todas" || gap.prioridade === priorityFilter;
      return matchesQuery && matchesStatus && matchesPriority;
    });
  }, [data.gaps, priorityFilter, query, statusFilter]);
  const linkedCatalogIds = useMemo(
    () => new Set(data.gaps.map((gap) => gap.sharedCauseId).filter(Boolean)),
    [data.gaps],
  );
  const filteredCatalogCauses = useMemo(() => {
    const normalizedQuery = normalizeLabel(query);
    return catalogs.causes.filter((cause) => {
      if (linkedCatalogIds.has(cause.id)) return false;
      const duplicatedByTitle = data.gaps.some(
        (gap) => normalizeLabel(gap.causa) === normalizeLabel(cause.title),
      );
      if (duplicatedByTitle) return false;
      const matchesQuery =
        !normalizedQuery ||
        normalizeLabel(
          [cause.title, cause.description, cause.impact, cause.action, cause.priority].join(" "),
        ).includes(normalizedQuery);
      const matchesPriority =
        priorityFilter === "Todas" || normalizeCausePriority(cause.priority) === priorityFilter;
      return matchesQuery && matchesPriority && statusFilter === "Todos";
    });
  }, [catalogs.causes, data.gaps, linkedCatalogIds, priorityFilter, query, statusFilter]);

  const totalComments = data.gaps.reduce((sum, gap) => sum + gap.comentarios.length, 0);
  const finished = data.gaps.filter(
    (gap) => normalizeCauseStatus(gap.status) === "Concluída",
  ).length;
  const inProgress = data.gaps.filter(
    (gap) => normalizeCauseStatus(gap.status) === "Em andamento",
  ).length;
  const pending = data.gaps.filter((gap) => normalizeCauseStatus(gap.status) === "Pendente").length;

  function updateGap(gapId: string, patch: Partial<GapItem>) {
    update({
      ...data,
      gaps: data.gaps.map((gap) => (gap.id === gapId ? { ...gap, ...patch } : gap)),
    });
  }

  function applySharedCause(gapId: string, causeId: string) {
    const cause = catalogs.causes.find((item) => item.id === causeId);
    if (!cause) {
      updateGap(gapId, { sharedCauseId: "" });
      return;
    }
    updateGap(gapId, gapPatchFromOrganizationCause(cause));
  }

  function addCause() {
    const next: GapItem = {
      id: id("gap"),
      sharedCauseId: "",
      causa: "Nova causa",
      descricao: "",
      impacto: "",
      acao: "",
      responsavel: "",
      prazo: "",
      prioridade: "Média",
      status: "Pendente",
      comentarios: [],
    };
    update({ ...data, gaps: [...data.gaps, next] });
    setSelectedId(next.id);
  }

  useEffect(() => {
    if (mode === "new" && !initializedNew.current) {
      initializedNew.current = true;
      const next: GapItem = {
        id: id("gap"),
        sharedCauseId: "",
        causa: "Nova causa",
        descricao: "",
        impacto: "",
        acao: "",
        responsavel: "",
        prazo: "",
        prioridade: "Média",
        status: "Pendente",
        comentarios: [],
      };
      update({ ...data, gaps: [...data.gaps, next] });
      setSelectedId(next.id);
    }
  }, [data, mode, update]);

  function addCatalogCauseToDdp(cause: OrganizationCause) {
    const patch = gapPatchFromOrganizationCause(cause);
    const next: GapItem = {
      id: id("gap"),
      sharedCauseId: patch.sharedCauseId ?? cause.id,
      causa: patch.causa ?? cause.title,
      descricao: patch.descricao ?? "",
      impacto: patch.impacto ?? "",
      acao: patch.acao ?? "",
      responsavel: "",
      prazo: "",
      prioridade: patch.prioridade ?? "Média",
      status: "Pendente",
      comentarios: [],
    };
    update({ ...data, gaps: [...data.gaps, next] });
    setSelectedId(next.id);
  }

  async function saveGapToLibrary(gap: GapItem) {
    try {
      const linked = catalogs.causes.find((item) => item.id === gap.sharedCauseId);
      const cause = linked
        ? await onUpdateSharedCause({
            ...linked,
            title: gap.causa,
            description: gap.descricao || null,
            impact: gap.impacto || null,
            action: gap.acao || null,
            priority: gap.prioridade,
          })
        : await onCreateSharedCause(gap);
      updateGap(gap.id, { sharedCauseId: cause.id });
      toast.success(
        linked ? "Causa compartilhada atualizada." : "Causa disponível para outros mapeamentos.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel cadastrar a causa.");
    }
  }

  function removeGap(gapId: string) {
    update({ ...data, gaps: data.gaps.filter((gap) => gap.id !== gapId) });
  }

  async function deleteSelectedCause() {
    if (!selected || !window.confirm("Excluir a causa selecionada?")) return;
    try {
      if (selected.sharedCauseId) await onDeleteSharedCause(selected.sharedCauseId);
      removeGap(selected.id);
      toast.success("Causa excluída.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível excluir a causa.");
    }
  }

  function exportVisibleCauses() {
    downloadBlob(
      `causas-${today()}.xlsx`,
      buildXlsxWorkbook([
        {
          name: "Causas",
          rows: [
            [
              "Código",
              "Nome da causa",
              "Categoria",
              "Descrição",
              "Status",
              "Criado por",
              "Atualizado em",
            ],
            ...filtered.map((gap, index) => [
              `CAU-${String(index + 1).padStart(3, "0")}`,
              gap.causa,
              gap.prioridade,
              gap.descricao,
              gap.status,
              gap.responsavel || "-",
              new Date().toLocaleString("pt-BR"),
            ]),
          ],
        },
      ]),
    );
  }

  function addComment() {
    if (!selected || !commentDraft.trim()) return;
    updateGap(selected.id, {
      comentarios: [
        ...selected.comentarios,
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
    if (!selected) return;
    updateGap(selected.id, {
      comentarios: selected.comentarios.filter((comment) => comment.id !== commentId),
    });
  }

  return (
    <div className="grid gap-5">
      <Hero
        title={
          mode === "new" ? "Nova Causa" : mode === "edit" ? "Editar Causa" : "Consulta de Causas"
        }
        eyebrow="Mapeamento · gestão · acompanhamento"
        progress={100}
      >
        Consulte causas cadastradas no DDP, filtre por situação, acompanhe responsáveis e registre
        comentários sem sair do documento versionado.
      </Hero>

      <div className="grid gap-3 md:grid-cols-4">
        <CauseMetric label="Total" value={data.gaps.length} />
        <CauseMetric label="Pendentes" value={pending} />
        <CauseMetric label="Em andamento" value={inProgress} />
        <CauseMetric label="Concluídas" value={finished} detail={`${totalComments} comentários`} />
      </div>

      <Panel title="Causas cadastradas" progress={data.gaps.length ? 100 : 0}>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_190px_170px]">
          <Field label="Buscar" value={query} onChange={setQuery} />
          <SelectField
            label="Status"
            value={statusFilter}
            options={["Todos", ...CAUSE_STATUS_OPTIONS]}
            onChange={setStatusFilter}
          />
          <SelectField
            label="Prioridade"
            value={priorityFilter}
            options={["Todas", ...CAUSE_PRIORITY_OPTIONS]}
            onChange={setPriorityFilter}
          />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addCause}
            className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground"
          >
            <Plus className="h-4 w-4" /> Criar
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={() => selected && saveGapToLibrary(selected)}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-40"
          >
            <Pencil className="h-4 w-4" /> Editar
          </button>
          <button
            type="button"
            disabled={!selected}
            onClick={deleteSelectedCause}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold text-destructive hover:bg-destructive/5 disabled:opacity-40"
          >
            <Trash2 className="h-4 w-4" /> Excluir
          </button>
          <button
            type="button"
            onClick={exportVisibleCauses}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exportar para Excel
          </button>
          <button
            type="button"
            onClick={onOpenEditor}
            className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm font-semibold hover:bg-muted"
          >
            <FileText className="h-4 w-4" /> Editar Mapeamento
          </button>
        </div>

        <div className="overflow-hidden rounded-lg border border-[#d2d2d7] bg-white">
          <div className="overflow-auto">
            <table className="w-full min-w-[1680px] border-collapse text-left text-sm">
              <thead className="bg-[#f5f5f7] text-[11px] uppercase tracking-[0.14em] text-[#6e6e73]">
                <tr>
                  <th className="w-12 px-3 py-3" />
                  <th className="px-3 py-3">Origem</th>
                  <th className="px-3 py-3">Causa reutilizável</th>
                  <th className="px-3 py-3">Causa</th>
                  <th className="px-3 py-3">Descrição</th>
                  <th className="px-3 py-3">Impacto / ação</th>
                  <th className="px-3 py-3">Responsável</th>
                  <th className="px-3 py-3">Prazo</th>
                  <th className="px-3 py-3">Prioridade</th>
                  <th className="px-3 py-3">Status</th>
                  <th className="px-3 py-3">Comentários</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((gap) => (
                  <tr
                    key={gap.id}
                    onClick={() => setSelectedId(gap.id)}
                    className={`border-t border-[#d2d2d7] ${
                      selected?.id === gap.id ? "bg-[#f3f4f6]" : "bg-white"
                    }`}
                  >
                    <td className="px-3 py-3">
                      <input
                        type="radio"
                        checked={selected?.id === gap.id}
                        onChange={() => setSelectedId(gap.id)}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-[#d2d2d7] bg-white px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#515154]">
                        {gap.sharedCauseId ? "Biblioteca" : "DDP"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <select
                        value={gap.sharedCauseId ?? ""}
                        onChange={(event) => applySharedCause(gap.id, event.target.value)}
                        className="w-full min-w-[190px] rounded-lg border border-[#d2d2d7] bg-white px-2.5 py-2 text-xs font-semibold outline-none focus:border-[#3f3f46]"
                      >
                        <option value="">Causa local</option>
                        {catalogs.causes.map((cause) => (
                          <option key={cause.id} value={cause.id}>
                            {cause.title}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <TableInput
                        value={gap.causa}
                        onChange={(causa) => updateGap(gap.id, { causa })}
                        placeholder="Nome da causa"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TableTextarea
                        value={gap.descricao}
                        onChange={(descricao) => updateGap(gap.id, { descricao })}
                        placeholder="Descreva a causa"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <div className="grid gap-2">
                        <TableTextarea
                          value={gap.impacto}
                          onChange={(impacto) => updateGap(gap.id, { impacto })}
                          placeholder="Impacto"
                        />
                        <TableTextarea
                          value={gap.acao}
                          onChange={(acao) => updateGap(gap.id, { acao })}
                          placeholder="Ação proposta"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <TableInput
                        value={gap.responsavel}
                        onChange={(responsavel) => updateGap(gap.id, { responsavel })}
                        placeholder="Responsável"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TableInput
                        value={gap.prazo}
                        onChange={(prazo) => updateGap(gap.id, { prazo })}
                        placeholder="Prazo"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TableSelect
                        value={gap.prioridade}
                        options={[...CAUSE_PRIORITY_OPTIONS]}
                        onChange={(prioridade) => updateGap(gap.id, { prioridade })}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <TableSelect
                        value={gap.status}
                        options={[...CAUSE_STATUS_OPTIONS]}
                        onChange={(status) => updateGap(gap.id, { status })}
                      />
                    </td>
                    <td className="px-3 py-3 text-[#515154]">
                      <button
                        type="button"
                        onClick={() => setSelectedId(gap.id)}
                        className="inline-flex rounded-lg border border-[#d2d2d7] bg-white px-3 py-2 text-xs font-bold text-[#3f3f46] hover:bg-[#f5f5f7]"
                      >
                        {gap.comentarios.length} comentário(s)
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => saveGapToLibrary(gap)}
                          className="inline-flex items-center gap-2 rounded-lg border border-[#d2d2d7] bg-white px-3 py-2 text-xs font-bold text-[#3f3f46] hover:bg-[#f5f5f7]"
                        >
                          Biblioteca
                        </button>
                        <button
                          type="button"
                          onClick={() => removeGap(gap.id)}
                          className="inline-flex items-center gap-2 rounded-lg border border-[#ffd1cc] bg-white px-3 py-2 text-xs font-bold text-[#d70015] hover:bg-[#fff1f0]"
                        >
                          Excluir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredCatalogCauses.map((cause) => (
                  <tr key={cause.id} className="border-t border-[#d2d2d7] bg-[#f8f8fb]">
                    <td className="px-3 py-3" />
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-[#d4d4d8] bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-[#3f3f46]">
                        Biblioteca
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-[#515154]">
                      Disponível para vínculo
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#1d1d1f]">{cause.title}</td>
                    <td className="px-3 py-3 text-[#515154]">{cause.description || "-"}</td>
                    <td className="px-3 py-3 text-[#515154]">
                      <div className="grid gap-1">
                        <span>{cause.impact || "-"}</span>
                        <span>{cause.action || "-"}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[#6e6e73]">A definir no DDP</td>
                    <td className="px-3 py-3 text-[#6e6e73]">-</td>
                    <td className="px-3 py-3">
                      <CausePill value={normalizeCausePriority(cause.priority)} tone="priority" />
                    </td>
                    <td className="px-3 py-3 text-[#6e6e73]">-</td>
                    <td className="px-3 py-3 text-[#6e6e73]">-</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => addCatalogCauseToDdp(cause)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#3f3f46] px-3 py-2 text-xs font-bold text-white hover:bg-[#27272a]"
                      >
                        Usar neste DDP
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && !filteredCatalogCauses.length ? (
                  <tr>
                    <td colSpan={11} className="px-3 py-10 text-center text-sm text-[#6e6e73]">
                      Nenhuma causa encontrada para os filtros aplicados.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </div>
      </Panel>

      {selected ? (
        <Panel
          title="Causa aberta"
          progress={completionPercent([
            selected.causa,
            selected.descricao,
            selected.responsavel,
            selected.status,
          ])}
        >
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="grid gap-3 md:col-span-2 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.14em] text-[#6e6e73]">
                    Causa reutilizável da organização
                  </span>
                  <select
                    value={selected.sharedCauseId ?? ""}
                    onChange={(event) => applySharedCause(selected.id, event.target.value)}
                    className="w-full rounded-lg border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3f3f46]"
                  >
                    <option value="">Causa local / nova</option>
                    {catalogs.causes.map((cause) => (
                      <option key={cause.id} value={cause.id}>
                        {cause.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => saveGapToLibrary(selected)}
                  className="self-end inline-flex items-center justify-center gap-2 rounded-lg border border-[#d2d2d7] bg-white px-3 py-2.5 text-sm font-bold text-[#3f3f46] hover:bg-[#f5f5f7]"
                >
                  <Plus className="h-4 w-4" />
                  Salvar na biblioteca
                </button>
              </div>
              <Field
                label="Causa"
                value={selected.causa}
                onChange={(causa) => updateGap(selected.id, { causa })}
              />
              <Field
                label="Responsável"
                value={selected.responsavel}
                onChange={(responsavel) => updateGap(selected.id, { responsavel })}
              />
              <SelectField
                label="Status"
                value={selected.status}
                options={[...CAUSE_STATUS_OPTIONS]}
                onChange={(status) => updateGap(selected.id, { status })}
              />
              <SelectField
                label="Prioridade"
                value={selected.prioridade}
                options={[...CAUSE_PRIORITY_OPTIONS]}
                onChange={(prioridade) => updateGap(selected.id, { prioridade })}
              />
              <Field
                label="Prazo"
                value={selected.prazo}
                onChange={(prazo) => updateGap(selected.id, { prazo })}
              />
              <TextArea
                label="Descrição"
                value={selected.descricao}
                onChange={(descricao) => updateGap(selected.id, { descricao })}
              />
              <TextArea
                label="Impacto"
                value={selected.impacto}
                onChange={(impacto) => updateGap(selected.id, { impacto })}
              />
              <TextArea
                label="Ação proposta"
                value={selected.acao}
                onChange={(acao) => updateGap(selected.id, { acao })}
              />
            </div>

            <div className="rounded-lg border border-[#d2d2d7] bg-[#f5f5f7] p-4">
              <div className="mb-3 flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-[#3f3f46]" />
                <h3 className="text-sm font-black uppercase tracking-[0.16em] text-[#1d1d1f]">
                  Comentários
                </h3>
              </div>
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                rows={4}
                placeholder="Registre uma atualização, decisão ou pendência da causa."
                className="w-full resize-y rounded-lg border border-[#d2d2d7] bg-white px-3 py-2 text-sm outline-none focus:border-[#3f3f46]"
              />
              <button
                type="button"
                onClick={addComment}
                disabled={!commentDraft.trim()}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#1d1d1f] px-3 py-2.5 text-sm font-bold text-white hover:bg-[#2c2c2e] disabled:opacity-45"
              >
                Inserir comentário
              </button>
              <div className="mt-4 grid gap-2">
                {selected.comentarios.map((comment) => (
                  <div key={comment.id} className="rounded-lg border border-[#d2d2d7] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm leading-5 text-[#1d1d1f]">{comment.text}</p>
                      <button
                        type="button"
                        onClick={() => removeComment(comment.id)}
                        className="text-[#6e6e73] hover:text-[#ff3b30]"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {comment.createdAt ? (
                      <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6e6e73]">
                        {new Date(comment.createdAt).toLocaleString("pt-BR")}
                      </div>
                    ) : null}
                  </div>
                ))}
                {!selected.comentarios.length ? (
                  <div className="rounded-lg border border-dashed border-[#c7c7cc] bg-white/60 p-4 text-center text-sm text-[#6e6e73]">
                    Nenhum comentário registrado.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </Panel>
      ) : null}
    </div>
  );
}

function CauseMetric({ label, value, detail }: { label: string; value: number; detail?: string }) {
  return (
    <div className="rounded-lg border border-[#d2d2d7] bg-white/90 p-4 shadow-[0_18px_44px_rgba(0,0,0,.05)]">
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-[#6e6e73]">
        {label}
      </div>
      <div className="mt-2 text-3xl font-black text-[#1d1d1f]">{value}</div>
      {detail ? <div className="mt-1 text-xs text-[#6e6e73]">{detail}</div> : null}
    </div>
  );
}

function CausePill({ value, tone }: { value: string; tone: "priority" | "status" }) {
  const normalized = normalizeLabel(value);
  const color =
    tone === "status" && normalized.includes("conclu")
      ? "bg-[#e8f7ee] text-[#1f7a3a] border-[#b9e6c6]"
      : tone === "status" && normalized.includes("andamento")
        ? "bg-[#fff7e6] text-[#a05a00] border-[#f3d39b]"
        : normalized.includes("alta") || normalized.includes("critic")
          ? "bg-[#fff1f0] text-[#b42318] border-[#ffc9c4]"
          : "bg-[#f3f4f6] text-[#3f3f46] border-[#d4d4d8]";
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${color}`}>
      {value}
    </span>
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

function DdpModule({
  data,
  catalogs,
  update,
  onCreateSharedCause,
}: {
  data: DdpState;
  catalogs: OrganizationCatalogs;
  update: (value: DdpState) => void;
  onCreateSharedCause: (gap: GapItem) => Promise<OrganizationCause>;
}) {
  const selectedProcess = useMemo(
    () => catalogs.processes.find((process) => process.id === data.macroprocess.processId) ?? null,
    [catalogs.processes, data.macroprocess.processId],
  );
  const flowProcessOptions = useMemo(() => {
    if (!selectedProcess) return catalogs.processes;
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
    return catalogs.processes.filter((process) => branchIds.has(process.id));
  }, [catalogs.processes, selectedProcess]);

  function selectPrimaryProcess(process: OrganizationProcess | null) {
    const valueChain = process?.value_chain_id
      ? catalogs.valueChains.find((chain) => chain.id === process.value_chain_id)
      : null;
    update({
      ...data,
      meta: {
        ...data.meta,
        codigo: process?.code ?? "",
        titulo: process?.name ?? "",
        area: process?.department ?? "",
        responsavel: process?.owner ?? "",
        valueChainId: valueChain?.id ?? "",
        valueChainName: valueChain?.name ?? "",
      },
      overview: {
        ...data.overview,
        donoProcesso: process?.owner ?? "",
        escopo: data.overview.escopo || process?.description || "",
      },
      macroprocess: {
        ...data.macroprocess,
        processId: process?.id ?? "",
        processVersion: process?.current_version ?? 1,
        titulo: process?.name || data.macroprocess.titulo,
        legenda: data.macroprocess.legenda || process?.description || "",
      },
    });
  }

  const completion = useMemo(() => {
    const fields = [
      data.macroprocess.processId,
      data.meta.titulo,
      data.meta.responsavel,
      data.meta.elaborador,
      data.meta.revisor,
      data.overview.objetivo,
      data.overview.escopo,
      data.overview.estadoAtual,
      data.overview.donoProcesso,
      data.sipocRows[0]?.processo,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [data]);
  const sectionProgress = {
    identification: completionPercent([
      data.macroprocess.processId,
      data.meta.codigo,
      data.meta.titulo,
      data.meta.area,
      data.meta.responsavel,
      data.meta.valueChainName,
      data.meta.elaborador,
      data.meta.revisor,
      data.meta.versao,
      data.meta.data,
      data.meta.dataRelatorio,
    ]),
    overview: completionPercent([
      data.overview.objetivo,
      data.overview.escopo,
      data.overview.donoProcesso,
      data.overview.volume,
      data.overview.frequencia,
      data.overview.estadoAtual,
      data.overview.kpis,
      data.overview.dores,
      data.overview.oportunidades,
    ]),
    systems: completionPercent(
      data.systems.flatMap((system) => [
        system.nome,
        system.tipo,
        system.dono,
        system.criticidade,
        system.descricao,
      ]),
    ),
    macroprocess: completionPercent([
      data.macroprocess.titulo,
      data.macroprocess.legenda,
      data.macroprocess.src,
    ]),
    flow: completionPercent(
      data.steps.flatMap((step) => [
        step.etapa,
        step.responsavel,
        step.entrada,
        step.atividade,
        step.saida,
        step.sistema,
        step.risco,
        step.observacoes,
        step.images,
        ...step.substeps.flatMap((substep) => [
          substep.codigo,
          substep.titulo,
          substep.descricao,
          substep.images,
        ]),
      ]),
    ),
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
    nextSteps: completionPercent(data.nextSteps.map((item) => item.text)),
    glossary: completionPercent(data.glossary.flatMap((item) => [item.termo, item.definicao])),
  };

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

  function applySharedCauseToGap(gapId: string, causeId: string) {
    const cause = catalogs.causes.find((item) => item.id === causeId);
    if (!cause) {
      updateGap(gapId, { sharedCauseId: "" });
      return;
    }
    updateGap(gapId, gapPatchFromOrganizationCause(cause));
  }

  async function saveGapToCatalog(gap: GapItem) {
    try {
      const cause = await onCreateSharedCause(gap);
      updateGap(gap.id, { sharedCauseId: cause.id });
      toast.success("Causa disponivel para outros DDPs.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Nao foi possivel cadastrar a causa.");
    }
  }

  return (
    <div className="grid gap-5">
      <Hero title="Diagnóstico de Processo" eyebrow="Mapeamento" progress={completion}>
        Capture capa, metadados, visão geral, sistemas, fluxo AS IS, SIPOC, gaps, próximos passos e
        glossário em um documento exportável.
      </Hero>
      <Panel title="Identificação" progress={sectionProgress.identification}>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <RegisteredProcessSelect
              required
              label="Processo cadastrado"
              value={data.macroprocess.processId ?? ""}
              processes={catalogs.processes.filter((process) => process.status !== "Arquivado")}
              onSelect={selectPrimaryProcess}
            />
          </div>
          <ReadOnlyField label="Código do processo" value={data.meta.codigo} />
          <ReadOnlyField label="Título do processo" value={data.meta.titulo} />
          <ReadOnlyField label="Área / Departamento" value={data.meta.area} />
          <ReadOnlyField label="Responsável / Dono" value={data.meta.responsavel} />
          <ReadOnlyField label="Cadeia de valor" value={data.meta.valueChainName} />
          <ReadOnlyField
            label="Versão do processo"
            value={selectedProcess ? `v${data.macroprocess.processVersion ?? 1}` : ""}
          />
          <Field
            label="Elaborador"
            value={data.meta.elaborador}
            onChange={(elaborador) => update({ ...data, meta: { ...data.meta, elaborador } })}
          />
          <Field
            label="Revisor"
            value={data.meta.revisor}
            onChange={(revisor) => update({ ...data, meta: { ...data.meta, revisor } })}
          />
          <Field
            label="Versão"
            value={data.meta.versao}
            onChange={(versao) => update({ ...data, meta: { ...data.meta, versao } })}
          />
          <Field
            label="Data"
            type="date"
            value={data.meta.data}
            onChange={(date) => update({ ...data, meta: { ...data.meta, data: date } })}
          />
          <Field
            label="Data do relatório"
            value={data.meta.dataRelatorio}
            onChange={(dataRelatorio) => update({ ...data, meta: { ...data.meta, dataRelatorio } })}
          />
        </div>
      </Panel>
      <Panel title="Visão geral" progress={sectionProgress.overview}>
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
          <ReadOnlyField label="Dono do processo" value={data.overview.donoProcesso} />
          <Field
            label="Volume"
            value={data.overview.volume}
            onChange={(volume) => update({ ...data, overview: { ...data.overview, volume } })}
          />
          <Field
            label="Frequência"
            value={data.overview.frequencia}
            onChange={(frequencia) =>
              update({ ...data, overview: { ...data.overview, frequencia } })
            }
          />
          <TextArea
            label="Estado atual"
            value={data.overview.estadoAtual}
            onChange={(estadoAtual) =>
              update({ ...data, overview: { ...data.overview, estadoAtual } })
            }
          />
          <TextArea
            label="Indicadores / evidências"
            value={data.overview.kpis}
            onChange={(kpis) => update({ ...data, overview: { ...data.overview, kpis } })}
          />
          <TextArea
            label="Dores / problemas"
            value={data.overview.dores}
            onChange={(dores) => update({ ...data, overview: { ...data.overview, dores } })}
          />
          <TextArea
            label="Oportunidades"
            value={data.overview.oportunidades}
            onChange={(oportunidades) =>
              update({ ...data, overview: { ...data.overview, oportunidades } })
            }
          />
        </div>
      </Panel>
      <Panel title="Sistemas envolvidos" progress={sectionProgress.systems}>
        <div className="grid gap-3">
          {data.systems.map((system) => (
            <div
              key={system.id}
              className="grid gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-[1fr_170px_170px_130px_auto]"
            >
              <Field
                compact
                label="Sistema"
                value={system.nome}
                onChange={(nome) =>
                  update({
                    ...data,
                    systems: data.systems.map((item) =>
                      item.id === system.id ? { ...item, nome } : item,
                    ),
                  })
                }
              />
              <Field
                compact
                label="Tipo"
                value={system.tipo}
                onChange={(tipo) =>
                  update({
                    ...data,
                    systems: data.systems.map((item) =>
                      item.id === system.id ? { ...item, tipo } : item,
                    ),
                  })
                }
              />
              <Field
                compact
                label="Dono"
                value={system.dono}
                onChange={(dono) =>
                  update({
                    ...data,
                    systems: data.systems.map((item) =>
                      item.id === system.id ? { ...item, dono } : item,
                    ),
                  })
                }
              />
              <Field
                compact
                label="Criticidade"
                value={system.criticidade}
                onChange={(criticidade) =>
                  update({
                    ...data,
                    systems: data.systems.map((item) =>
                      item.id === system.id ? { ...item, criticidade } : item,
                    ),
                  })
                }
              />
              <IconButton
                label="Excluir"
                onClick={() =>
                  update({ ...data, systems: data.systems.filter((item) => item.id !== system.id) })
                }
              >
                <Trash2 className="h-4 w-4" />
              </IconButton>
              <div className="lg:col-span-5">
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
                    tipo: "",
                    dono: "",
                    criticidade: "Média",
                    descricao: "",
                  },
                ],
              })
            }
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar sistema
          </button>
        </div>
      </Panel>
      <Panel title="Representação do processo" progress={sectionProgress.macroprocess}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Título da representação"
            value={data.macroprocess.titulo}
            onChange={(titulo) =>
              update({ ...data, macroprocess: { ...data.macroprocess, titulo } })
            }
          />
          <Field
            label="Legenda"
            value={data.macroprocess.legenda}
            onChange={(legenda) =>
              update({ ...data, macroprocess: { ...data.macroprocess, legenda } })
            }
          />
          <div className="md:col-span-2">
            <ImageManager
              label="Imagem do processo"
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
      </Panel>
      <Panel title="Fluxo AS IS" progress={sectionProgress.flow}>
        <div className="grid gap-3">
          {data.steps.map((step, index) => (
            <div key={step.id} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 flex items-center gap-3">
                <div className="grid h-9 w-9 place-items-center rounded-md bg-muted text-xs font-semibold text-[var(--gold)]">
                  {String(index + 1).padStart(2, "0")}
                </div>
                <div className="grid flex-1 gap-3 md:grid-cols-2">
                  <RegisteredProcessSelect
                    label="Processo da etapa"
                    value={step.processId ?? ""}
                    processes={flowProcessOptions}
                    onSelect={(process) =>
                      updateStep(step.id, {
                        processId: process?.id ?? "",
                        processVersion: process?.current_version ?? 1,
                        etapa: process?.name ?? "",
                        responsavel: process?.owner ?? "",
                        atividade: step.atividade || process?.description || "",
                      })
                    }
                  />
                  <Field
                    compact
                    label="Responsável"
                    value={step.responsavel}
                    onChange={(responsavel) => updateStep(step.id, { responsavel })}
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
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {(["entrada", "atividade", "saida", "sistema", "risco"] as const).map((field) => (
                  <TextArea
                    key={field}
                    label={
                      field === "saida"
                        ? "Saída"
                        : field === "risco"
                          ? "Risco / ponto de atenção"
                          : field[0].toUpperCase() + field.slice(1)
                    }
                    value={step[field]}
                    onChange={(value) => updateStep(step.id, { [field]: value })}
                  />
                ))}
                <TextArea
                  label="Observações adicionais"
                  value={step.observacoes}
                  onChange={(observacoes) => updateStep(step.id, { observacoes })}
                />
              </div>
              <div className="mt-3 grid gap-3">
                <ImageManager
                  label="Diagramas / imagens da etapa"
                  images={step.images}
                  onChange={(images) => updateStep(step.id, { images })}
                />
                <div className="rounded-lg border border-border bg-muted/35 p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[11px] font-semibold text-foreground">Subetapas</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Detalhe subprocessos e adicione imagens específicas quando necessário.
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
                          className="rounded-lg border border-border bg-card p-3"
                        >
                          <div className="mb-3 grid gap-3 md:grid-cols-[120px_1fr_auto]">
                            <Field
                              compact
                              label="Código"
                              value={substep.codigo}
                              onChange={(codigo) => updateSubstep(step.id, substep.id, { codigo })}
                            />
                            <Field
                              compact
                              label="Título"
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
                            label="Descrição da subetapa"
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
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar etapa
          </button>
        </div>
      </Panel>
      <Panel title="SIPOC" progress={sectionProgress.sipoc}>
        <div className="grid gap-3">
          {data.sipocRows.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-border bg-card p-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]"
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
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar linha SIPOC
          </button>
        </div>
      </Panel>
      <Panel title="Gaps e causas-raiz" progress={sectionProgress.gaps}>
        <div className="grid gap-3">
          {data.gaps.map((gap) => (
            <div key={gap.id} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <label className="block">
                  <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">
                    Causa reutilizável da organização
                  </span>
                  <select
                    value={gap.sharedCauseId ?? ""}
                    onChange={(event) => applySharedCauseToGap(gap.id, event.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
                  >
                    <option value="">Causa local / nova</option>
                    {catalogs.causes.map((cause) => (
                      <option key={cause.id} value={cause.id}>
                        {cause.title}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => saveGapToCatalog(gap)}
                  className="self-end inline-flex items-center justify-center gap-2 rounded-md border border-border bg-card px-3 py-2.5 text-sm font-semibold text-foreground transition hover:bg-muted"
                >
                  <Plus className="h-4 w-4" />
                  Salvar na biblioteca
                </button>
              </div>
              <div className="mb-3 flex items-start gap-3">
                <div className="grid flex-1 gap-3 md:grid-cols-[minmax(0,1fr)_180px_150px_150px]">
                  <Field
                    compact
                    label="Causa"
                    value={gap.causa}
                    onChange={(causa) =>
                      update({
                        ...data,
                        gaps: data.gaps.map((item) =>
                          item.id === gap.id ? { ...item, causa } : item,
                        ),
                      })
                    }
                  />
                  <Field
                    compact
                    label="Responsável"
                    value={gap.responsavel}
                    onChange={(responsavel) =>
                      update({
                        ...data,
                        gaps: data.gaps.map((item) =>
                          item.id === gap.id ? { ...item, responsavel } : item,
                        ),
                      })
                    }
                  />
                  <SelectField
                    label="Prioridade"
                    value={gap.prioridade}
                    options={[...CAUSE_PRIORITY_OPTIONS]}
                    onChange={(prioridade) =>
                      update({
                        ...data,
                        gaps: data.gaps.map((item) =>
                          item.id === gap.id ? { ...item, prioridade } : item,
                        ),
                      })
                    }
                  />
                  <SelectField
                    label="Status"
                    value={gap.status}
                    options={[...CAUSE_STATUS_OPTIONS]}
                    onChange={(status) =>
                      update({
                        ...data,
                        gaps: data.gaps.map((item) =>
                          item.id === gap.id ? { ...item, status } : item,
                        ),
                      })
                    }
                  />
                </div>
                <IconButton
                  label="Excluir"
                  onClick={() =>
                    update({ ...data, gaps: data.gaps.filter((item) => item.id !== gap.id) })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                <TextArea
                  label="Descrição"
                  value={gap.descricao}
                  onChange={(descricao) =>
                    update({
                      ...data,
                      gaps: data.gaps.map((item) =>
                        item.id === gap.id ? { ...item, descricao } : item,
                      ),
                    })
                  }
                />
                <TextArea
                  label="Impacto"
                  value={gap.impacto}
                  onChange={(impacto) =>
                    update({
                      ...data,
                      gaps: data.gaps.map((item) =>
                        item.id === gap.id ? { ...item, impacto } : item,
                      ),
                    })
                  }
                />
                <TextArea
                  label="Ação proposta"
                  value={gap.acao}
                  onChange={(acao) =>
                    update({
                      ...data,
                      gaps: data.gaps.map((item) =>
                        item.id === gap.id ? { ...item, acao } : item,
                      ),
                    })
                  }
                />
                <Field
                  compact
                  label="Prazo"
                  value={gap.prazo}
                  onChange={(prazo) =>
                    update({
                      ...data,
                      gaps: data.gaps.map((item) =>
                        item.id === gap.id ? { ...item, prazo } : item,
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
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar gap
          </button>
        </div>
      </Panel>
      <ListEditor
        title="Próximos passos"
        items={data.nextSteps}
        onChange={(nextSteps) => update({ ...data, nextSteps })}
        placeholder="Próxima ação recomendada"
        progress={sectionProgress.nextSteps}
      />
      <Panel title="Glossário" progress={sectionProgress.glossary}>
        <div className="grid gap-3">
          {data.glossary.map((item) => (
            <div
              key={item.id}
              className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[240px_1fr_auto]"
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
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar termo
          </button>
        </div>
      </Panel>
    </div>
  );
}

function PopModule({
  data,
  update,
  autoCode = false,
  codePreview = "",
}: {
  data: PopState;
  update: (value: PopState) => void;
  autoCode?: boolean;
  codePreview?: string;
}) {
  const completion = useMemo(() => {
    const fields = [
      data.meta.codigo,
      data.meta.titulo,
      data.meta.area,
      data.meta.elaboracao,
      data.meta.revisor,
      data.meta.aprovacao,
      data.purpose.objetivo,
      data.purpose.abrangencia,
      data.sections[0]?.body,
    ];
    return Math.round((fields.filter(Boolean).length / fields.length) * 100);
  }, [data]);
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
    purpose: completionPercent([
      data.purpose.objetivo,
      data.purpose.abrangencia,
      data.purpose.premissas,
      data.purpose.importante,
    ]),
    sections: completionPercent(
      data.sections.flatMap((section) => [
        section.title,
        section.description,
        section.body,
        section.records,
        section.risks,
        section.images,
      ]),
    ),
    responsibilities: completionPercent(
      data.responsibilities.flatMap((row) => [row.area, row.responsabilidade]),
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

  function updateSection(sectionId: string, patch: Partial<PopSection>) {
    update({
      ...data,
      sections: data.sections.map((item) => (item.id === sectionId ? { ...item, ...patch } : item)),
    });
  }

  return (
    <div className="grid gap-5">
      <Hero title="Documento Normativo e Operacional" eyebrow="Documentação" progress={completion}>
        Crie Norma, POP ou IT com identificação completa, premissas, conteúdo, responsabilidades,
        referências, histórico e controle de alterações.
      </Hero>
      <Panel title="Identificação" progress={sectionProgress.identification}>
        <div className="grid gap-4 md:grid-cols-3">
          <SelectField
            label="Tipo"
            value={data.meta.tipo}
            options={["Norma", "POP", "IT"]}
            onChange={(tipo) =>
              update({ ...data, meta: { ...data.meta, tipo: tipo as PopState["meta"]["tipo"] } })
            }
          />
          {autoCode ? (
            <ReadOnlyField label="Código (automático)" value={data.meta.codigo || codePreview} />
          ) : (
            <Field
              label="Código"
              value={data.meta.codigo}
              onChange={(codigo) => update({ ...data, meta: { ...data.meta, codigo } })}
            />
          )}
          <Field
            label="Versão"
            value={data.meta.versao}
            onChange={(versao) => update({ ...data, meta: { ...data.meta, versao } })}
          />
          <Field
            label="Título"
            value={data.meta.titulo}
            onChange={(titulo) => update({ ...data, meta: { ...data.meta, titulo } })}
          />
          <Field
            label="Público / classificação"
            value={data.meta.publico}
            onChange={(publico) => update({ ...data, meta: { ...data.meta, publico } })}
          />
          <Field
            label="Área responsável"
            value={data.meta.area}
            onChange={(area) => update({ ...data, meta: { ...data.meta, area } })}
          />
          <Field
            label="Processo relacionado"
            value={data.meta.processo}
            onChange={(processo) => update({ ...data, meta: { ...data.meta, processo } })}
          />
          <Field
            label="Vigência"
            type="date"
            value={data.meta.vigencia}
            onChange={(vigencia) => update({ ...data, meta: { ...data.meta, vigencia } })}
          />
          <Field
            label="Elaborador"
            value={data.meta.elaboracao}
            onChange={(elaboracao) => update({ ...data, meta: { ...data.meta, elaboracao } })}
          />
          <Field
            label="Revisor"
            value={data.meta.revisor}
            onChange={(revisor) => update({ ...data, meta: { ...data.meta, revisor } })}
          />
          <Field
            label="Aprovador"
            value={data.meta.aprovacao}
            onChange={(aprovacao) => update({ ...data, meta: { ...data.meta, aprovacao } })}
          />
          <Field
            label="Publicação"
            value={data.meta.publicacao}
            onChange={(publicacao) => update({ ...data, meta: { ...data.meta, publicacao } })}
          />
        </div>
      </Panel>
      <Panel title="Objetivo e abrangência" progress={sectionProgress.purpose}>
        <div className="grid gap-4 md:grid-cols-2">
          <TextArea
            label="1. Objetivo"
            value={data.purpose.objetivo}
            onChange={(objetivo) => update({ ...data, purpose: { ...data.purpose, objetivo } })}
          />
          <TextArea
            label="2. Abrangência"
            value={data.purpose.abrangencia}
            onChange={(abrangencia) =>
              update({ ...data, purpose: { ...data.purpose, abrangencia } })
            }
          />
          <TextArea
            label="Premissas e regras gerais"
            value={data.purpose.premissas}
            onChange={(premissas) => update({ ...data, purpose: { ...data.purpose, premissas } })}
          />
          <TextArea
            label="Bloco importante / observações críticas"
            value={data.purpose.importante}
            onChange={(importante) => update({ ...data, purpose: { ...data.purpose, importante } })}
          />
        </div>
      </Panel>
      <Panel title="Conteúdo do documento" progress={sectionProgress.sections}>
        <div className="grid gap-3">
          {data.sections.map((section) => (
            <div key={section.id} className="rounded-lg border border-border bg-card p-3">
              <div className="mb-3 flex gap-2">
                <input
                  value={section.title}
                  onChange={(event) =>
                    update({
                      ...data,
                      sections: data.sections.map((item) =>
                        item.id === section.id ? { ...item, title: event.target.value } : item,
                      ),
                    })
                  }
                  className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm font-semibold text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
                />
                <IconButton
                  label="Excluir"
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
              <div className="grid gap-3 md:grid-cols-2">
                <TextArea
                  label="Contexto / descrição"
                  value={section.description}
                  onChange={(description) =>
                    update({
                      ...data,
                      sections: data.sections.map((item) =>
                        item.id === section.id ? { ...item, description } : item,
                      ),
                    })
                  }
                />
                <TextArea
                  label="Procedimento / diretriz"
                  value={section.body}
                  onChange={(body) =>
                    update({
                      ...data,
                      sections: data.sections.map((item) =>
                        item.id === section.id ? { ...item, body } : item,
                      ),
                    })
                  }
                />
                <TextArea
                  label="Registros / evidências"
                  value={section.records}
                  onChange={(records) =>
                    update({
                      ...data,
                      sections: data.sections.map((item) =>
                        item.id === section.id ? { ...item, records } : item,
                      ),
                    })
                  }
                />
                <TextArea
                  label="Riscos / cuidados"
                  value={section.risks}
                  onChange={(risks) =>
                    update({
                      ...data,
                      sections: data.sections.map((item) =>
                        item.id === section.id ? { ...item, risks } : item,
                      ),
                    })
                  }
                />
              </div>
              <div className="mt-3">
                <ImageManager
                  label="Imagens / evidências da seção"
                  images={section.images}
                  onChange={(images) => updateSection(section.id, { images })}
                />
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
                    title: "Nova seção",
                    description: "",
                    body: "",
                    records: "",
                    risks: "",
                    images: [],
                  },
                ],
              })
            }
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar seção
          </button>
        </div>
      </Panel>
      <Panel title="Responsabilidades" progress={sectionProgress.responsibilities}>
        <div className="grid gap-3">
          {data.responsibilities.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[240px_1fr_auto]"
            >
              <Field
                compact
                label="Área / cargo"
                value={row.area}
                onChange={(area) =>
                  update({
                    ...data,
                    responsibilities: data.responsibilities.map((item) =>
                      item.id === row.id ? { ...item, area } : item,
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
                  { id: id("resp"), area: "", responsabilidade: "" },
                ],
              })
            }
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar responsabilidade
          </button>
        </div>
      </Panel>
      <Panel title="Referências normativas" progress={sectionProgress.references}>
        <div className="grid gap-3">
          {data.references.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[160px_1fr_1fr_auto]"
            >
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
              <Field
                compact
                label="Aplicabilidade"
                value={row.aplicabilidade}
                onChange={(aplicabilidade) =>
                  update({
                    ...data,
                    references: data.references.map((item) =>
                      item.id === row.id ? { ...item, aplicabilidade } : item,
                    ),
                  })
                }
              />
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
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar referência
          </button>
        </div>
      </Panel>
      <Panel title="Histórico e controle de alterações" progress={sectionProgress.history}>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Histórico</h3>
        <div className="grid gap-3">
          {data.history.map((row) => (
            <div
              key={row.id}
              className="grid gap-3 rounded-lg border border-border bg-card p-3 lg:grid-cols-[120px_100px_140px_1fr_1fr_1fr_auto]"
            >
              <Field
                compact
                label="Código"
                value={row.codigo}
                onChange={(codigo) =>
                  update({
                    ...data,
                    history: data.history.map((item) =>
                      item.id === row.id ? { ...item, codigo } : item,
                    ),
                  })
                }
              />
              <Field
                compact
                label="Versão"
                value={row.version}
                onChange={(version) =>
                  update({
                    ...data,
                    history: data.history.map((item) =>
                      item.id === row.id ? { ...item, version } : item,
                    ),
                  })
                }
              />
              <Field
                compact
                label="Data"
                type="date"
                value={row.date}
                onChange={(date) =>
                  update({
                    ...data,
                    history: data.history.map((item) =>
                      item.id === row.id ? { ...item, date } : item,
                    ),
                  })
                }
              />
              <Field
                compact
                label="Elaborador"
                value={row.elaborador}
                onChange={(elaborador) =>
                  update({
                    ...data,
                    history: data.history.map((item) =>
                      item.id === row.id ? { ...item, elaborador } : item,
                    ),
                  })
                }
              />
              <Field
                compact
                label="Revisor"
                value={row.revisor}
                onChange={(revisor) =>
                  update({
                    ...data,
                    history: data.history.map((item) =>
                      item.id === row.id ? { ...item, revisor } : item,
                    ),
                  })
                }
              />
              <Field
                compact
                label="Aprovador"
                value={row.aprovador}
                onChange={(aprovador) =>
                  update({
                    ...data,
                    history: data.history.map((item) =>
                      item.id === row.id ? { ...item, aprovador } : item,
                    ),
                  })
                }
              />
              <IconButton
                label="Excluir"
                onClick={() =>
                  update({ ...data, history: data.history.filter((item) => item.id !== row.id) })
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
                history: [
                  ...data.history,
                  {
                    id: id("rev"),
                    codigo: "",
                    version: "",
                    date: today(),
                    elaborador: "",
                    revisor: "",
                    aprovador: "",
                  },
                ],
              })
            }
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
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
              className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[120px_220px_1fr_auto]"
            >
              <Field
                compact
                label="Versão"
                value={row.versao}
                onChange={(versao) =>
                  update({
                    ...data,
                    changes: data.changes.map((item) =>
                      item.id === row.id ? { ...item, versao } : item,
                    ),
                  })
                }
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
              <IconButton
                label="Excluir"
                onClick={() =>
                  update({ ...data, changes: data.changes.filter((item) => item.id !== row.id) })
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
                changes: [
                  ...data.changes,
                  { id: id("change"), versao: "", local: "", descricao: "" },
                ],
              })
            }
            className="inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
          >
            <Plus className="h-4 w-4" />
            Adicionar alteração
          </button>
        </div>
      </Panel>
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
          ? "Início"
          : type === "end"
            ? "Fim"
            : type === "gateway"
              ? "Decisão"
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
    downloadText(`ateliam-fluxograma-${today()}.svg`, svg, "image/svg+xml");
  }

  function exportBpmnXml() {
    const xml = `<definitions id="Ateliam_Fluxograma" targetNamespace="https://ateliam.local/fluxograma">
  <process id="Process_1" name="${escapeXml(data.poolName)}">
${data.nodes.map((node) => `    <${node.type === "start" ? "startEvent" : node.type === "end" ? "endEvent" : node.type === "gateway" ? "exclusiveGateway" : "task"} id="${node.id}" name="${escapeXml(node.label)}" />`).join("\n")}
${data.flows.map((flow) => `    <sequenceFlow id="${flow.id}" sourceRef="${flow.from}" targetRef="${flow.to}" name="${escapeXml(flow.label ?? "")}" />`).join("\n")}
  </process>
</definitions>`;
    downloadText(`ateliam-fluxograma-${today()}.xml`, xml, "application/xml");
  }

  return (
    <div className="grid gap-5">
      <Hero
        title="Editor de fluxograma"
        eyebrow="Fluxo de atividades"
        progress={data.nodes.length ? 100 : 0}
      >
        Um modelador visual leve para desenhar fluxo, movimentar elementos e exportar o diagrama.
      </Hero>
      <Panel title="Área de desenho" progress={diagramProgress}>
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
              {autoCode ? (
                <ReadOnlyField label="Código (automático)" value={data.codigo || codePreview} />
              ) : (
                <Field
                  label="Código"
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
  children: ReactNode;
}) {
  return (
    <section className="border-b border-border pb-5">
      <div className="grid items-end gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--gold)]">
            {eyebrow}
          </div>
          <h1 className="font-display text-3xl font-semibold text-foreground">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{children}</p>
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
  children,
}: {
  title?: string;
  progress?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(title ? defaultOpen : true);
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      {title ? (
        <button
          type="button"
          onClick={() => setOpen((current) => !current)}
          className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/45"
        >
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <h2 className="min-w-0 flex-1 text-[15px] font-semibold text-foreground">{title}</h2>
          {typeof progress === "number" ? (
            <span className="rounded-full border border-border bg-muted/70 px-2.5 py-1 text-xs font-semibold text-foreground">
              {progress}%
            </span>
          ) : null}
        </button>
      ) : null}
      {title && typeof progress === "number" ? (
        <div className="h-px bg-border">
          <div
            className="h-px bg-[var(--gold)] transition-[width]"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}
      {open ? <div className={title ? "p-4 md:p-5" : "p-5"}>{children}</div> : null}
    </section>
  );
}

function ModuleMenuGroup({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/72 p-2">
      <div className="mb-1.5 px-1">
        <div className="text-[9px] font-black uppercase tracking-[0.17em] text-muted-foreground">
          {title}
        </div>
        <div className="mt-0.5 text-[10px] text-muted-foreground">{detail}</div>
      </div>
      <div className="grid gap-1">{children}</div>
    </div>
  );
}

function ModuleMenuButton({
  active,
  variant = "default",
  icon,
  children,
  onClick,
  disabled,
}: {
  active?: boolean;
  variant?: "default" | "primary" | "dark";
  icon: ReactNode;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const className =
    variant === "dark"
      ? "bg-primary text-primary-foreground border-primary hover:opacity-90"
      : variant === "primary"
        ? "bg-foreground text-background border-foreground hover:opacity-90"
        : active
          ? "bg-accent text-foreground border-border"
          : "bg-card text-foreground border-border hover:bg-muted";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[13px] font-bold transition disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
    >
      <span className={variant === "default" && !active ? "text-foreground" : ""}>{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
    </button>
  );
}

function CatalogSelectWithCreate({
  label,
  value,
  options,
  onChange,
  onCreate,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onCreate: (value: string) => Promise<OrganizationCatalogItem | null>;
}) {
  const [creating, setCreating] = useState(false);
  const normalizedOptions = new Set(options.map((option) => normalizeLabel(option)));
  const visibleOptions = [
    ...options,
    value && !normalizedOptions.has(normalizeLabel(value)) ? value : "",
  ].filter(Boolean);

  async function createOption() {
    const next = window.prompt(`Cadastrar ${label.toLowerCase()}`, value || "");
    const clean = next?.trim();
    if (!clean) return;
    setCreating(true);
    try {
      const row = await onCreate(clean);
      onChange(row?.name || clean);
      toast.success(`${label} cadastrado.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível cadastrar.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
        >
          <option value="">Selecione</option>
          {visibleOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={createOption}
          disabled={creating}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-45"
          title={`Cadastrar ${label}`}
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </label>
  );
}

function RegisteredProcessSelect({
  label,
  value,
  processes,
  onSelect,
  required = false,
}: {
  label: string;
  value: string;
  processes: OrganizationProcess[];
  onSelect: (process: OrganizationProcess | null) => void;
  required?: boolean;
}) {
  const selected = processes.find((process) => process.id === value) ?? null;

  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <select
        required={required}
        value={value}
        onChange={(event) => {
          const process = processes.find((item) => item.id === event.target.value) ?? null;
          onSelect(process);
        }}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
      >
        <option value="">Selecione um processo previamente cadastrado</option>
        {processes.map((process) => (
          <option key={process.id} value={process.id}>
            {processDisplayName(process)}
          </option>
        ))}
      </select>
      {selected ? (
        <span className="mt-1.5 block text-[11px] text-muted-foreground">
          Vinculado como {processTypeLabel(selected.type)} na versão {selected.current_version}.
        </span>
      ) : null}
    </label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <input
        readOnly
        value={value}
        placeholder="Preenchido pelo processo selecionado"
        className="w-full rounded-md border border-border bg-muted/55 px-3 py-2.5 text-sm text-muted-foreground outline-none"
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
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10 ${compact ? "py-2" : "py-2.5"}`}
      />
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
      <span className="mb-1.5 block text-[11px] font-semibold text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextArea({
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
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
        className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[var(--gold)]/10"
      />
    </label>
  );
}

function ImageManager({
  label = "Imagens",
  images,
  onChange,
}: {
  label?: string;
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

  return (
    <div className="rounded-lg border border-border bg-muted/35 p-3">
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
              className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[160px_1fr_auto]"
            >
              <div className="overflow-hidden rounded-md border border-border bg-background">
                <img src={image.src} alt={image.titulo} className="h-32 w-full object-contain" />
              </div>
              <div className="grid gap-3">
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
                <Field
                  compact
                  label="Legenda"
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
}: {
  title: string;
  items: TextItem[];
  onChange: (items: TextItem[]) => void;
  placeholder: string;
  progress?: number;
}) {
  return (
    <Panel title={title} progress={progress}>
      <div className="grid gap-2">
        {items.map((item, index) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-lg border border-border bg-card p-2"
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
              className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-foreground outline-none"
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
          onClick={() => onChange([...items, { id: id("item"), text: "" }])}
          className="mt-2 inline-flex w-fit items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted"
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
      className="grid h-10 w-10 place-items-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-foreground"
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
