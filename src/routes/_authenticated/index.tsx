import { OperationalDashboard } from "@/components/operational-dashboard";
import { loadTaskNotifications } from "@/lib/user-tasks.functions";
import { visibleModulesFor } from "@/lib/module-visibility";
import type { SearchSchemaInput } from "@tanstack/react-router";
import { UserTasks } from "@/components/user-tasks";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  lazy,
  Suspense,
  type CSSProperties,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  BarChart2,
  Bell,
  Building2,
  CalendarDays,
  Check,
  CheckCheck,
  CheckCircle2,
  CircleAlert,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  FileCheck2,
  FileText,
  FlaskConical,
  GitBranch,
  Layers,
  Link2,
  ListChecks,
  Maximize2,
  Network,
  Plus,
  Search,
  Settings,
  Users,
  Workflow,
  X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { BFFlowMark } from "@/components/bf-flow-mark";
import { ThemeControl } from "@/components/theme-control";
import { UserProfileMenu } from "@/components/user-profile-menu";
import {
  TreeButton,
  WorkspaceModulesTree,
  WorkspaceLauncher,
} from "@/components/workspace-navigation";
import {
  WorkspaceProcessRegistrations,
  type ProcessRegistrationView,
  DEMO_REGISTRY,
} from "@/components/workspace-process-registrations";
import {
  getMe,
  getOrganizationDashboard,
  listAccessibleOrganizations,
  listSystemReleaseNotes,
} from "@/lib/config.functions";
import { MODULES, type AteliamModule } from "@/lib/workspace-bridge";
import type { CodeSettings } from "@/lib/code-generation";

const WorkspaceSystemSettings = lazy(() =>
  import("@/components/workspace-system-settings").then((module) => ({
    default: module.WorkspaceSystemSettings,
  })),
);
const WorkspaceReports = lazy(() =>
  import("@/components/workspace-reports").then((module) => ({
    default: module.WorkspaceReports,
  })),
);
const TaskReminderSettings = lazy(() =>
  import("@/components/task-reminder-settings").then((module) => ({
    default: module.TaskReminderSettings,
  })),
);
const TaskFlowSettings = lazy(() =>
  import("@/components/task-flow-settings").then((module) => ({
    default: module.TaskFlowSettings,
  })),
);

const NAVIGATION_STATE_KEY = "bf-flow-navigation-expanded";

function readNavigationState(defaults: Record<string, boolean>) {
  if (typeof window === "undefined") return defaults;
  try {
    const saved = JSON.parse(window.localStorage.getItem(NAVIGATION_STATE_KEY) ?? "{}") as Record<
      string,
      boolean
    >;
    return { ...defaults, ...saved };
  } catch {
    return defaults;
  }
}

export const Route = createFileRoute("/_authenticated/")({
  component: WorkspaceHome,
  validateSearch: (search: Record<string, unknown> & SearchSchemaInput) => ({
    area:
      search.area === "reports"
        ? "value-chain"
        : search.area === "registrations"
          ? "modules"
          : search.area === "modules" || search.area === "value-chain" || search.area === "settings"
            ? search.area
            : undefined,
    taskState: typeof search.taskState === "string" ? search.taskState.slice(0, 2000) : undefined,
    view: typeof search.view === "string" ? search.view : undefined,
  }),
});

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

type WorkspaceView =
  | "overview"
  | "organizations"
  | "documents"
  | "processes"
  | "value-chains"
  | "process-types"
  | "areas"
  | "positions"
  | "owners"
  | "owner-users"
  | "causes"
  | "systems"
  | "exports"
  | "settings"
  | "appearance"
  | "theme"
  | "local-environment"
  | "profile"
  | "preferences"
  | "users"
  | "permissions"
  | "roles"
  | "access-profiles"
  | "document-types"
  | "document-models"
  | "task-reminders"
  | "task-flows"
  | "visual-identity"
  | "integrations"
  | "version-history"
  | "value-chain-report"
  | `module:${AteliamModule}:${ModuleTask}`
  | `module:${AteliamModule}`;

type ModuleTask = "home" | "consult" | "cause-new" | "cause-consult" | "cause-edit" | "library";
type WorkspaceArea = "home" | "portal" | "modules" | "value-chain" | "reports" | "settings";
function AdminSettingsTabs({ view }: { view: WorkspaceView }) {
  const tabs: { view: WorkspaceView; label: string }[] = [
    { view: "organizations", label: "Organizações" },
    { view: "users", label: "Usuários" },
    { view: "task-flows", label: "Fluxos e notificações" },
    { view: "task-reminders", label: "Lembretes de tarefas" },
  ];
  return (
    <nav
      aria-label="Seções de configurações"
      className="mb-5 flex flex-wrap gap-2 border-b border-border pb-3"
    >
      {tabs.map((tab) => (
        <Link
          key={tab.view}
          to="/"
          search={{ area: "settings", view: tab.view }}
          aria-current={
            view === tab.view || (view === "document-models" && tab.view === "organizations")
              ? "page"
              : undefined
          }
          className="rounded-md px-3 py-2 text-sm hover:bg-muted aria-[current=page]:bg-accent"
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
type DashboardTotals = {
  processes: number;
  activeProcesses: number;
  reviewProcesses: number;
  ddps: number;
  pops: number;
  departments: number;
  owners: number;
  valueChains: number;
};
type DashboardProcess = {
  id: string;
  name: string;
  type: string;
  department: string | null;
  owner: string | null;
  status: string;
  current_version: number;
  created_at: string;
  updated_at: string;
};
type MappingRow = {
  id: string;
  name: string;
  type: string;
  department: string | null;
  owner: string | null;
  status: string;
  updatedAt: string;
  mappings: Array<{ name: string; updatedAt: string }>;
};
type MappingCoverage = { covered: number; total: number; rows: MappingRow[] };

const PROCESS_TYPE_LABELS: Record<string, string> = {
  macroprocess: "Macroprocesso",
  process: "Processo",
  subprocess: "Subprocesso",
  atividade: "Atividade",
  tarefa: "Tarefa",
};

// Mapeamentos por processo no modo demonstração (espelham os documentos demo do
// módulo de Mapeamento). Um processo aqui listado conta como "coberto".
const DEMO_PROCESS_MAPPINGS: Record<string, { name: string }> = {
  "Planejamento Estratégico": { name: "MAP.PMO.001 — Planejamento Estratégico" },
  "Gestão de Indicadores e Desempenho": { name: "MAP.PMO.002 — Gestão de Indicadores" },
  "Recrutamento e Seleção": { name: "MAP.RH.001 — Recrutamento e Seleção" },
  "Integração e Onboarding": { name: "MAP.RH.002 — Integração e Onboarding" },
  "Gestão de Demandas de TI": { name: "MAP.TI.001 — Gestão de Demandas de TI" },
  "Gestão de Segurança da Informação": { name: "MAP.TI.002 — Segurança da Informação" },
  "Prospecção e Geração de Leads": { name: "MAP.COM.001 — Prospecção e Leads" },
  "Planejamento da Produção": { name: "MAP.OPE.001 — Planejamento da Produção" },
  "Contas a Receber": { name: "MAP.FIN.001 — Contas a Receber" },
};

function buildDemoMappingCoverage(): MappingCoverage {
  const now = new Date().toISOString();
  const rows: MappingRow[] = DEMO_REGISTRY.processes.map((process) => {
    const mapping = DEMO_PROCESS_MAPPINGS[process.name];
    return {
      id: process.id,
      name: process.name,
      type: process.type,
      department: process.department,
      owner: process.owner,
      status: process.status,
      updatedAt: now,
      mappings: mapping ? [{ name: mapping.name, updatedAt: now }] : [],
    };
  });
  return {
    covered: rows.filter((row) => row.mappings.length > 0).length,
    total: rows.length,
    rows,
  };
}

type DashboardMappingRow = {
  id: string;
  code: string;
  name: string;
  process: string;
  modalidade: string;
  area: string;
  owner: string;
  responsible: string;
  status: string;
  updatedAt: string;
};
type DashboardMappingStatusCounts = {
  emAndamento: number;
  emRevisao: number;
  aprovado: number;
  concluido: number;
};
type DashboardCauseRow = {
  area?: string;
  id: string;
  cause: string;
  source: "Mapeamento" | "Avulsa";
  mapping: string;
  process: string;
  responsible: string;
  priority: string;
  status: string;
  dueDate: string;
  updatedAt: string;
};
type DashboardCauseStatusCounts = {
  naoIniciada: number;
  emAndamento: number;
  encerrada: number;
  cancelada: number;
};

// Uma cor por etapa do acompanhamento de mapeamentos. As tonalidades seguem a
// paleta do sistema (âmbar/gold da marca + o verde e o teal já usados no
// diagrama de Cadeia de Valor), com fundo suave e número na própria cor.
const MAPPING_STATUS_TILES: Array<{
  key: keyof DashboardMappingStatusCounts;
  label: string;
  color: string;
}> = [
  { key: "emAndamento", label: "Em andamento", color: "var(--gold)" },
  { key: "emRevisao", label: "Em revisão", color: "#3b74c4" },
  { key: "aprovado", label: "Aprovado", color: "#1f9d6b" },
  { key: "concluido", label: "Concluído", color: "#0e8fa6" },
];

const CAUSE_STATUS_TILES: Array<{
  key: keyof DashboardCauseStatusCounts;
  label: string;
  color: string;
}> = [
  { key: "naoIniciada", label: "Não iniciada", color: "var(--gold)" },
  { key: "emAndamento", label: "Em andamento", color: "#3b74c4" },
  { key: "encerrada", label: "Encerrada", color: "#1f9d6b" },
  { key: "cancelada", label: "Cancelada", color: "#c95151" },
];

function normalizeStatusKey(status: string): keyof DashboardMappingStatusCounts | null {
  const value = status
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
  if (value.includes("andamento")) return "emAndamento";
  if (value.includes("revisao")) return "emRevisao";
  if (value.includes("aprov")) return "aprovado";
  if (value.includes("conclu")) return "concluido";
  return null;
}

const DASHBOARD_CARD_CLASS =
  "min-w-0 overflow-hidden rounded-lg border border-border bg-card p-5 shadow-sm ring-1 ring-transparent transition-shadow hover:shadow-md";
type DashboardDocumentType = "Norma" | "POP" | "Instrução" | "Fluxograma" | "Mapeamento";
type DashboardDocumentCatalogRow = {
  id: string;
  code: string;
  title: string;
  documentType: DashboardDocumentType;
  area: string;
  process: string;
  responsible: string;
  status: string;
  updatedAt: string;
};
type AccessibleOrganization = {
  id: string;
  name: string;
  slug: string;
  logo_data_url: string | null;
  code_settings?: CodeSettings | null;
  isDefault?: boolean;
};

const workspaceGrayVars = {
  "--accent": "color-mix(in oklab, var(--gold) 12%, var(--background))",
  "--accent-foreground": "var(--foreground)",
  "--brand": "var(--gold)",
  "--brand-foreground": "var(--foreground)",
  "--blue": "var(--gold)",
  "--indigo": "var(--muted-foreground)",
} as CSSProperties;

function isModuleView(view: WorkspaceView, moduleId: AteliamModule) {
  return String(view).startsWith(`module:${moduleId}`);
}

function isRegistrationView(view: WorkspaceView) {
  return ["processes", "areas", "owners", "owner-users", "systems", "process-types"].includes(view);
}

function WorkspaceHome() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const isDemo = false;
  const [demoOrganizations, setDemoOrganizations] = useState<AccessibleOrganization[]>(() => {
    const defaults: AccessibleOrganization[] = [
      {
        id: "demo-bom-futuro",
        name: "Bom Futuro",
        slug: "bom-futuro",
        logo_data_url:
          typeof window === "undefined"
            ? null
            : window.localStorage.getItem("ateliam-demo-organization-logo"),
        isDefault: true,
      },
      {
        id: "demo-bfflow-lab",
        name: "BF Flow Lab",
        slug: "bf-flow-lab",
        logo_data_url: null,
      },
    ];
    if (typeof window === "undefined") return defaults;
    try {
      const stored = JSON.parse(window.localStorage.getItem("ateliam-demo-organizations") ?? "[]");
      return Array.isArray(stored) && stored.length ? stored : defaults;
    } catch {
      return defaults;
    }
  });
  const [activeOrganizationId, setActiveOrganizationId] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("ateliam-active-organization") || "",
  );
  const [demoOrganizationLogo, setDemoOrganizationLogo] = useState(() =>
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("ateliam-demo-organization-logo"),
  );
  const [activeArea, setActiveArea] = useState<WorkspaceArea>(
    (search.area as WorkspaceArea | undefined) ?? "home",
  );
  const [view, setView] = useState<WorkspaceView>(
    (search.view as WorkspaceView | undefined) ?? "overview",
  );
  const initialView = (search.view as WorkspaceView | undefined) ?? "overview";
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    readNavigationState({
      organization: true,
      modules: true,
      ddp: false,
      pop: false,
      bpmn: false,
      causes: false,
      valueChain: true,
      registrations: isRegistrationView(initialView),
      processRegistrations: true,
      systemRegistrations: true,
      governance: true,
      settings: true,
    }),
  );

  useEffect(() => {
    window.localStorage.setItem(NAVIGATION_STATE_KEY, JSON.stringify(expanded));
  }, [expanded]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("area") !== "registrations") return;
    navigate({
      to: "/",
      search: { area: "modules", view: search.view },
      replace: true,
    });
  }, [navigate, search.view]);

  // Mant?m o estado em sincronia com a URL quando ela muda com o componente j?
  // montado (voltar/avan?ar do navegador, links de outras telas para "/?area=...").
  useEffect(() => {
    const nextArea = (search.area ?? "home") as WorkspaceArea;
    const nextView = (search.view as WorkspaceView | undefined) ?? "overview";
    const isRegistration = isRegistrationView(nextView);
    setActiveArea(nextArea);
    setView(nextView);

    setExpanded((current) => ({
      ...current,
      modules: current.modules || nextArea === "modules",
      registrations: current.registrations || isRegistration,
      valueChain: current.valueChain || nextArea === "value-chain",
      settings: current.settings || nextArea === "settings",
    }));
  }, [search.area, search.view]);
  const dashboardFn = useServerFn(getOrganizationDashboard);
  const accessibleOrganizationsFn = useServerFn(listAccessibleOrganizations);
  const listReleaseNotes = useServerFn(listSystemReleaseNotes);
  const me = useServerFn(getMe);
  const meQ = useQuery({
    queryKey: ["home-me"],
    queryFn: () => me(),
    enabled: !isDemo,
  });
  const isCurrentUserAdmin = isDemo || !!meQ.data?.roles?.some((role) => role === "admin");
  const accessibleOrganizationsQ = useQuery({
    queryKey: ["accessible-organizations", isDemo ? "demo" : "cloud"],
    queryFn: () => accessibleOrganizationsFn(),
    enabled: !isDemo,
  });
  const accessibleOrganizations = useMemo(
    () =>
      isDemo
        ? demoOrganizations
        : ((accessibleOrganizationsQ.data ?? []) as AccessibleOrganization[]),
    [accessibleOrganizationsQ.data, demoOrganizations, isDemo],
  );
  const activeOrganizationIsAvailable = accessibleOrganizations.some(
    (organization) => organization.id === activeOrganizationId,
  );
  const selectedOrganizationId =
    (activeOrganizationIsAvailable ? activeOrganizationId : "") ||
    accessibleOrganizations.find((organization) => organization.isDefault)?.id ||
    accessibleOrganizations[0]?.id ||
    "";
  const dashboardQ = useQuery({
    queryKey: ["organization-dashboard", isDemo ? "demo" : "cloud", selectedOrganizationId],
    queryFn: () => dashboardFn({ data: { organizationId: selectedOrganizationId || null } }),
    enabled: !isDemo && !!selectedOrganizationId,
  });
  const releaseNotesQ = useQuery({
    queryKey: ["system-release-notes"],
    queryFn: () => listReleaseNotes(),
    enabled: !isDemo,
    staleTime: 60_000,
  });
  const selectedDemoOrganization =
    demoOrganizations.find((organization) => organization.id === selectedOrganizationId) ??
    demoOrganizations[0];
  const dashboard = useMemo(
    () =>
      isDemo
        ? {
            organization: {
              ...selectedDemoOrganization,
              logo_data_url:
                selectedDemoOrganization.id === "demo-bom-futuro"
                  ? demoOrganizationLogo
                  : selectedDemoOrganization.logo_data_url,
            },
            totals:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? {
                    processes: DEMO_REGISTRY.processes.length,
                    activeProcesses: DEMO_REGISTRY.processes.filter((p) => p.status === "Ativo")
                      .length,
                    reviewProcesses: DEMO_REGISTRY.processes.filter(
                      (p) => p.status === "Em revisão",
                    ).length,
                    ddps: 4,
                    pops: 3,
                    departments: DEMO_REGISTRY.areas.length,
                    owners: DEMO_REGISTRY.owners.length,
                    valueChains: DEMO_REGISTRY.valueChains.filter((c) => c.status === "Ativa")
                      .length,
                  }
                : {
                    processes: 0,
                    activeProcesses: 0,
                    reviewProcesses: 0,
                    ddps: 0,
                    pops: 0,
                    departments: 0,
                    owners: 0,
                    valueChains: 0,
                  },
            mappingRows:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? [
                    {
                      id: "demo-map-1",
                      code: "MAP.PMO.007",
                      name: "Gestão de Demandas de BI Analytics",
                      process: "Gestão de Demandas de BI Analytics",
                      modalidade: "AS IS",
                      area: "Tecnologia da Informação",
                      owner: "Gerente de TI",
                      responsible: "Marina Costa",
                      status: "Em andamento",
                      updatedAt: new Date().toISOString(),
                    },
                    {
                      id: "demo-map-2",
                      code: "MAP.RH.001",
                      name: "Recrutamento e Seleção",
                      process: "Recrutamento e Seleção",
                      modalidade: "AS IS",
                      area: "Recursos Humanos",
                      owner: "BP de RH",
                      responsible: "Juliana Castro",
                      status: "Em revisão",
                      updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
                    },
                    {
                      id: "demo-map-3",
                      code: "MAP.FIN.001",
                      name: "Contas a Receber",
                      process: "Contas a Receber",
                      modalidade: "AS IS",
                      area: "Financeiro & Controladoria",
                      owner: "Gerente Financeiro",
                      responsible: "Bruno Cardoso",
                      status: "Aprovado",
                      updatedAt: new Date(Date.now() - 86400000 * 12).toISOString(),
                    },
                    {
                      id: "demo-map-4",
                      code: "MAP.COM.001",
                      name: "Prospecção e Geração de Leads",
                      process: "Prospecção e Geração de Leads",
                      modalidade: "AS IS",
                      area: "Comercial & Vendas",
                      owner: "Diretor Comercial",
                      responsible: "Rafael Souza",
                      status: "Concluído",
                      updatedAt: new Date(Date.now() - 86400000 * 18).toISOString(),
                    },
                  ]
                : [],
            mappingStatusCounts:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? { emAndamento: 1, emRevisao: 1, aprovado: 1, concluido: 1 }
                : { emAndamento: 0, emRevisao: 0, aprovado: 0, concluido: 0 },
            causeRows:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? [
                    {
                      id: "demo-cause-1",
                      cause: "Critérios de priorização não formalizados",
                      source: "Mapeamento" as const,
                      mapping: "MAP.PMO.007",
                      process: "Gestão de Demandas de BI Analytics",
                      responsible: "Gerente de TI",
                      priority: "Alta",
                      status: "Em andamento",
                      dueDate: "2026-07-30",
                      updatedAt: new Date().toISOString(),
                    },
                    {
                      id: "demo-cause-2",
                      cause: "Ausência de padrão na entrada das demandas",
                      source: "Mapeamento" as const,
                      mapping: "MAP.PMO.007",
                      process: "Gestão de Demandas de BI Analytics",
                      responsible: "Coordenador de BI",
                      priority: "Média",
                      status: "Não iniciada",
                      dueDate: "2026-08-15",
                      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
                    },
                    {
                      id: "demo-cause-3",
                      cause: "Cadastro incompleto de responsáveis",
                      source: "Avulsa" as const,
                      mapping: "-",
                      process: "Gestão do Portfólio de Processos",
                      responsible: "Coordenadora de Processos",
                      priority: "Baixa",
                      status: "Encerrado",
                      dueDate: "2026-07-10",
                      updatedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
                    },
                  ]
                : [],
            causeStatusCounts:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? { naoIniciada: 1, emAndamento: 1, encerrada: 1, cancelada: 0 }
                : { naoIniciada: 0, emAndamento: 0, encerrada: 0, cancelada: 0 },
            documentCatalogRows:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? [
                    {
                      id: "demo-cat-map-1",
                      code: "MAP.PMO.007",
                      title: "Gestão de Demandas de BI Analytics",
                      documentType: "Mapeamento" as const,
                      area: "Tecnologia da Informação",
                      process: "Gestão de Demandas de BI Analytics",
                      responsible: "Marina Costa",
                      status: "Em andamento",
                      updatedAt: new Date().toISOString(),
                    },
                    {
                      id: "demo-cat-map-2",
                      code: "MAP.RH.001",
                      title: "Recrutamento e Seleção",
                      documentType: "Mapeamento" as const,
                      area: "Recursos Humanos",
                      process: "Recrutamento e Seleção",
                      responsible: "Juliana Castro",
                      status: "Em revisão",
                      updatedAt: new Date(Date.now() - 86400000 * 3).toISOString(),
                    },
                    {
                      id: "demo-cat-pop-1",
                      code: "POP.ADM.001",
                      title: "Controle de Acesso às Unidades",
                      documentType: "POP" as const,
                      area: "Administrativo",
                      process: "Controle de Acesso às Unidades",
                      responsible: "Gestor da área",
                      status: "Aprovado",
                      updatedAt: new Date(Date.now() - 86400000 * 7).toISOString(),
                    },
                    {
                      id: "demo-cat-pop-2",
                      code: "POP.FIN.001",
                      title: "Conciliação Bancária",
                      documentType: "POP" as const,
                      area: "Financeiro & Controladoria",
                      process: "Contas a Receber",
                      responsible: "Bruno Cardoso",
                      status: "Concluído",
                      updatedAt: new Date(Date.now() - 86400000 * 11).toISOString(),
                    },
                    {
                      id: "demo-cat-nor-1",
                      code: "NOR.PMO.001",
                      title: "Governança de Processos",
                      documentType: "Norma" as const,
                      area: "Processos",
                      process: "Gestão do Portfólio de Processos",
                      responsible: "Coordenadora de Processos",
                      status: "Aprovado",
                      updatedAt: new Date(Date.now() - 86400000 * 14).toISOString(),
                    },
                    {
                      id: "demo-cat-flx-1",
                      code: "FLX.COM.001",
                      title: "Ciclo de Vendas",
                      documentType: "Fluxograma" as const,
                      area: "Comercial & Vendas",
                      process: "Comercialização & Vendas",
                      responsible: "Rafael Souza",
                      status: "Em andamento",
                      updatedAt: new Date(Date.now() - 86400000 * 18).toISOString(),
                    },
                  ]
                : [],
            topDepartments:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? [
                    { label: "Tecnologia da Informação", value: 2 },
                    { label: "Processos", value: 1 },
                  ]
                : [],
            topOwners:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? [
                    { label: "Dono do processo", value: 2 },
                    { label: "Gestor da área", value: 1 },
                  ]
                : [],
            recentDocuments:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? [
                    {
                      id: "demo-ddp",
                      name: "MAP.PMO.007 - Gestão de Demandas de BI Analytics",
                      module: "ddp",
                      current_version: 14,
                      updated_at: new Date().toISOString(),
                    },
                    {
                      id: "demo-pop",
                      name: "POP.ADM.001 - Controle de Acesso às Unidades",
                      module: "pop",
                      current_version: 1,
                      updated_at: new Date().toISOString(),
                    },
                  ]
                : [],
            recentProcesses:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? [
                    {
                      id: "demo-process-1",
                      name: "Gestão de Demandas de BI Analytics",
                      type: "process",
                      department: "Tecnologia da Informação",
                      owner: "PMO / Processos",
                      status: "Ativo",
                      current_version: 14,
                      created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
                      updated_at: new Date().toISOString(),
                    },
                    {
                      id: "demo-process-2",
                      name: "Controle de Acesso às Unidades",
                      type: "process",
                      department: "Administrativo",
                      owner: "Gestor da área",
                      status: "Em revisão",
                      current_version: 6,
                      created_at: new Date(Date.now() - 86400000 * 70).toISOString(),
                      updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
                    },
                    {
                      id: "demo-process-3",
                      name: "Gestão do Portfólio de Processos",
                      type: "macroprocess",
                      department: "Processos",
                      owner: "Dono do processo",
                      status: "Ativo",
                      current_version: 2,
                      created_at: new Date(Date.now() - 86400000 * 120).toISOString(),
                      updated_at: new Date(Date.now() - 86400000 * 8).toISOString(),
                    },
                  ]
                : [],
            mappingCoverage:
              selectedDemoOrganization.id === "demo-bom-futuro"
                ? buildDemoMappingCoverage()
                : { covered: 0, total: 0, rows: [] },
          }
        : dashboardQ.data,
    [dashboardQ.data, demoOrganizationLogo, isDemo, selectedDemoOrganization],
  );

  useEffect(() => {
    function updateDemoBrand() {
      setDemoOrganizationLogo(window.localStorage.getItem("ateliam-demo-organization-logo"));
    }
    function updateDemoOrganizations() {
      try {
        const stored = JSON.parse(
          window.localStorage.getItem("ateliam-demo-organizations") ?? "[]",
        );
        if (Array.isArray(stored) && stored.length) setDemoOrganizations(stored);
      } catch {
        // Keep the current local organizations.
      }
    }
    window.addEventListener("ateliam-organization-brand-changed", updateDemoBrand);
    window.addEventListener("ateliam-organizations-changed", updateDemoOrganizations);
    return () => {
      window.removeEventListener("ateliam-organization-brand-changed", updateDemoBrand);
      window.removeEventListener("ateliam-organizations-changed", updateDemoOrganizations);
    };
  }, []);

  useEffect(() => {
    if (!selectedOrganizationId) return;
    if (activeOrganizationId !== selectedOrganizationId) {
      setActiveOrganizationId(selectedOrganizationId);
    }
    window.localStorage.setItem("ateliam-active-organization", selectedOrganizationId);
  }, [activeOrganizationId, selectedOrganizationId]);

  useEffect(() => {
    let cancelled = false;

    if (isDemo) {
      setEmail("analista.local@bfflow");
      return () => {
        cancelled = true;
      };
    }

    try {
      supabase.auth
        .getUser()
        .then(({ data }) => {
          if (!cancelled) setEmail(data.user?.email ?? "");
        })
        .catch(() => {
          if (!cancelled) setEmail("");
        });
    } catch {
      setEmail("");
    }

    return () => {
      cancelled = true;
    };
  }, [isDemo]);

  async function signOut() {
    try {
      await supabase.auth.signOut();
    } catch {
      // The route change below still clears the local view.
    }
    navigate({ to: "/auth", replace: true });
  }

  function toggle(section: string) {
    setExpanded((current) => ({ ...current, [section]: !current[section] }));
  }

  function selectArea(area: WorkspaceArea) {
    setActiveArea(area);
    if (area === "home") {
      void navigate({ to: "/", search: {} });
      setView("overview");

      return;
    }
    if (area === "portal") {
      void navigate({ to: "/portal" });
      return;
    }

    if (area === "modules") {
      setExpanded((current) => ({ ...current, modules: true }));
      if (
        [
          "areas",
          "roles",
          "access-profiles",
          "process-types",
          "systems",
          "owners",
          "owner-users",
          "processes",
          "causes",
        ].includes(view) ||
        !String(view).startsWith("module:")
      ) {
        setView("overview");
      }
    }
    if (area === "value-chain") {
      setExpanded((current) => ({ ...current, valueChain: true }));
      if (!["value-chain-report", "value-chains"].includes(view)) {
        setView("value-chain-report");
      }
    }
    if (area === "reports") {
      setExpanded((current) => ({ ...current, reports: true }));
      if (!["value-chain-report"].includes(view)) {
        setView("value-chain-report");
      }
    }
    if (area === "settings") {
      setExpanded((current) => ({ ...current, settings: true }));
      if (
        ![
          "appearance",
          "preferences",
          "visual-identity",
          "integrations",
          "local-environment",
          "users",
          "organizations",
          "task-reminders",
        ].includes(view)
      ) {
        setView("users");
      }
    }
  }

  const organizationName = dashboard?.organization?.name ?? "Sua organização";
  const activeOrganization = accessibleOrganizations.find(
    (organization) => organization.id === selectedOrganizationId,
  );
  const totals = dashboard?.totals;
  const systemNotifications = useMemo<SystemNotification[]>(() => {
    const notes = [
      ...AUTOMATED_RELEASE_NOTES,
      ...((releaseNotesQ.data ?? []) as SystemReleaseNote[]),
    ];
    return Array.from(new Map(notes.map((note) => [note.id, note])).values())
      .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      .slice(0, 20)
      .map((note) => ({
        id: note.id,
        title: note.title,
        description: note.description,
        tag: note.category,
        updatedAt: note.published_at,
      }));
  }, [releaseNotesQ.data]);
  const activityFeed = useMemo<SystemNotification[]>(() => {
    const processUpdates = (dashboard?.recentProcesses ?? []).map((process) => ({
      id: `process-${process.id}`,
      title: process.name,
      description: "Processo atualizado",
      tag: "Processo",
      updatedAt: process.updated_at,
    }));
    const documentUpdates = (dashboard?.recentDocuments ?? []).map((document) => {
      const tag = documentActivityTag(document.module, document.name);
      return {
        id: `document-${document.id}`,
        title: document.name,
        description: `${tag} atualizado`,
        tag,
        updatedAt: document.updated_at,
      };
    });
    return [...systemNotifications, ...processUpdates, ...documentUpdates]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 8);
  }, [dashboard?.recentDocuments, dashboard?.recentProcesses, systemNotifications]);
  return (
    <div className="min-h-screen bg-background text-foreground" style={workspaceGrayVars}>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/92 px-4 backdrop-blur-xl">
        <WorkspaceLauncher
          visibleModules={visibleModulesFor(meQ.data?.profile, isCurrentUserAdmin)}
          activeArea={activeArea}
          activeTask={activeArea === "home" && String(view) === "tasks"}
          onSelect={selectArea}
        >
          {activeArea === "modules" ? (
            <WorkspaceModulesTree
              visibleModules={visibleModulesFor(meQ.data?.profile, isCurrentUserAdmin)}
              key="modules"
              expanded={expanded}
              onToggle={toggle}
              isActive={(target) =>
                target.kind === "module-root"
                  ? isModuleView(view, target.moduleId)
                  : target.kind === "registrations-root"
                    ? isRegistrationView(view)
                    : target.kind === "registration"
                      ? view === target.view
                      : false
              }
              onNavigate={(target) => {
                if (target.kind === "module-root") {
                  navigate({
                    to: "/m/$module",
                    params: { module: target.moduleId },
                    search: { view: "consult" },
                  });
                } else if (target.kind === "module-task") {
                  navigate({
                    to: "/m/$module",
                    params: { module: target.moduleId },
                    search: { view: target.task },
                  });
                } else if (target.kind === "registrations-root") {
                  toggle("registrations");
                } else {
                  navigate({
                    to: "/",
                    search: { area: "modules", view: target.view },
                  });
                }
              }}
            />
          ) : null}

          {activeArea === "value-chain" ? (
            <div key="value-chain" className="grid gap-1 animate-[slideDown_0.18s_ease-out]">
              {/* O cadastro foi incorporado ao relatório (tabela editável),
                          por isso a única entrada é o "Cadastro". */}
              <TreeButton
                active={view === "value-chain-report"}
                onClick={() => setView("value-chain-report")}
              >
                <Database className="h-4 w-4" /> Cadastro
              </TreeButton>
            </div>
          ) : null}

          {activeArea === "settings" ? (
            <div key="settings" className="grid gap-1 animate-[slideDown_0.18s_ease-out]">
              {isCurrentUserAdmin ? (
                <>
                  <TreeButton active={view === "users"} onClick={() => setView("users")}>
                    <Users className="h-4 w-4" /> Usuários
                  </TreeButton>
                  <TreeButton
                    active={view === "organizations"}
                    onClick={() => setView("organizations")}
                  >
                    <Building2 className="h-4 w-4" /> Organizações
                  </TreeButton>
                  <TreeButton
                    active={view === "task-reminders"}
                    onClick={() =>
                      void navigate({
                        to: "/",
                        search: { area: "settings", view: "task-reminders" },
                      })
                    }
                  >
                    <Bell className="h-4 w-4" /> Lembretes de tarefas
                  </TreeButton>
                  <TreeButton
                    active={view === "task-flows"}
                    onClick={() =>
                      void navigate({
                        to: "/",
                        search: { area: "settings", view: "task-flows" },
                      })
                    }
                  >
                    <Users className="h-4 w-4" /> Fluxos e notificações
                  </TreeButton>
                </>
              ) : (
                <div className="rounded-lg border border-border bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
                  Configurações administrativas disponíveis apenas para administradores.
                </div>
              )}
            </div>
          ) : null}
        </WorkspaceLauncher>
        <button
          type="button"
          onClick={() => selectArea("home")}
          className="flex items-center gap-2.5 rounded-md transition-opacity hover:opacity-80"
          title="Ir para a página inicial"
          aria-label="Ir para a página inicial"
        >
          <BFFlowMark className="h-8 text-foreground" />
        </button>

        <div className="flex-1" />

        {isDemo && (
          <span className="hidden items-center gap-1.5 rounded-md border border-brand/20 bg-brand/12 px-2.5 py-1 text-[11px] font-medium text-brand sm:inline-flex">
            <FlaskConical className="h-3.5 w-3.5" />
            Teste local
          </span>
        )}

        <div className="hidden items-center gap-1.5 rounded-md border border-border bg-card px-2 md:flex">
          <Building2 className="h-3.5 w-3.5 text-foreground" />
          <select
            aria-label="Organização ativa"
            value={selectedOrganizationId}
            onChange={(event) => setActiveOrganizationId(event.target.value)}
            className="h-8 max-w-[190px] bg-transparent text-xs font-semibold outline-none"
          >
            {accessibleOrganizations.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </div>

        <SystemNotificationsMenu
          items={systemNotifications}
          organizationId={selectedOrganizationId || ""}
          userId={meQ.data?.profile?.id || ""}
        />

        <UserProfileMenu
          canConfigure={isCurrentUserAdmin}
          email={email}
          organizationName={organizationName}
          organizations={accessibleOrganizations.map(({ id, name }) => ({ id, name }))}
          organizationId={selectedOrganizationId}
          onOrganizationChange={setActiveOrganizationId}
          profilePhoto={meQ.data?.profile?.avatar_data_url ?? ""}
          isDemo={isDemo}
          onProfileUpdated={async () => {
            await meQ.refetch();
          }}
          onSignOut={signOut}
        />
      </header>

      <div className="min-h-[calc(100vh-3.5rem)]">
        <div className="min-w-0">
          <main className={`min-w-0 ${activeArea === "home" ? "p-3 sm:p-5 lg:p-7" : "p-3 sm:p-5"}`}>
            {activeArea === "home" ? (
              <UserTasks
                organizationId={selectedOrganizationId || ""}
                overview={String(view) !== "tasks"}
                state={search.taskState}
                onState={(taskState) => {
                  void navigate({ to: "/", search: { view: "tasks", taskState } });
                }}
              />
            ) : (
              <WorkspaceContent
                view={view}
                organizationName={organizationName}
                organizationId={dashboard?.organization?.id ?? null}
                organizationSlug={activeOrganization?.slug ?? null}
                codeSettings={activeOrganization?.code_settings ?? null}
                totals={totals}
                mappingRows={(dashboard?.mappingRows ?? []) as DashboardMappingRow[]}
                mappingStatusCounts={
                  (dashboard?.mappingStatusCounts ?? {
                    emAndamento: 0,
                    emRevisao: 0,
                    aprovado: 0,
                    concluido: 0,
                  }) as DashboardMappingStatusCounts
                }
                causeRows={(dashboard?.causeRows ?? []) as DashboardCauseRow[]}
                causeStatusCounts={
                  (dashboard?.causeStatusCounts ?? {
                    naoIniciada: 0,
                    emAndamento: 0,
                    encerrada: 0,
                    cancelada: 0,
                  }) as DashboardCauseStatusCounts
                }
                documentCatalogRows={
                  (dashboard?.documentCatalogRows ?? []) as DashboardDocumentCatalogRow[]
                }
                dashboardError={
                  dashboardQ.error
                    ? "Não foi possível carregar os indicadores. Tente novamente."
                    : undefined
                }
                onRetry={() => {
                  void dashboardQ.refetch();
                }}
                departments={
                  dashboard && "departments" in dashboard
                    ? (dashboard.departments as { id: string; name: string }[])
                    : []
                }
                topDepartments={dashboard?.topDepartments ?? []}
                topOwners={dashboard?.topOwners ?? []}
                recentDocuments={dashboard?.recentDocuments ?? []}
                recentProcesses={dashboard?.recentProcesses ?? []}
                activityItems={activityFeed.slice(0, 5)}
                mappingCoverage={dashboard?.mappingCoverage ?? { covered: 0, total: 0, rows: [] }}
                isLoading={dashboardQ.isLoading && !isDemo}
                isDemo={isDemo}
                isAdmin={isCurrentUserAdmin}
              />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

// Card do painel inicial que pode ser expandido em tela cheia (janela).
function ExpandableCard({
  title,
  icon,
  className,
  titleClassName = "text-[11px] font-semibold uppercase tracking-[0.12em] text-foreground",
  children,
  expanded,
  onNavigate,
  navigateLabel = "Abrir consulta",
}: {
  title: string;
  icon?: ReactNode;
  className?: string;
  titleClassName?: string;
  children: ReactNode;
  // Conteúdo detalhado (tabela) mostrado quando o card é aberto em tela cheia.
  expanded?: ReactNode;
  onNavigate?: () => void;
  navigateLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <div className={className}>
        <div className="flex items-center justify-between gap-3 border-b border-border/70 pb-3">
          <span className="flex min-w-0 items-center gap-2">
            {icon ? (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--gold)_12%,var(--card))]">
                {icon}
              </span>
            ) : null}
            <span className={titleClassName}>{title}</span>
          </span>
          <div className="flex items-center gap-1.5">
            {onNavigate ? (
              <button
                type="button"
                onClick={onNavigate}
                title={navigateLabel}
                aria-label={navigateLabel}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setOpen(true)}
              title="Expandir em tela cheia"
              aria-label="Expandir em tela cheia"
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {children}
      </div>
      {open
        ? createPortal(
            <div
              className="fixed inset-0 z-[70] flex flex-col bg-background/90 p-4 backdrop-blur-sm sm:p-8"
              role="dialog"
              aria-modal="true"
              aria-label={`${title} em tela cheia`}
              onClick={() => setOpen(false)}
            >
              <div
                className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <span className="flex min-w-0 items-center gap-3 text-sm font-semibold text-foreground">
                    {icon}
                    <span className="min-w-0">
                      <span className="block truncate">{title}</span>
                      <span className="block text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                        Visualização detalhada
                      </span>
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    {onNavigate ? (
                      <button
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          onNavigate();
                        }}
                        className="inline-flex h-8 items-center gap-2 rounded-md border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:bg-muted"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                        {navigateLabel}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      title="Fechar"
                      aria-label="Fechar"
                      className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto p-5">{expanded ?? children}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function StatusSummaryTile({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="relative min-w-0 overflow-hidden rounded-lg border border-border bg-background p-3.5">
      <span className="absolute inset-x-0 top-0 h-0.5" style={{ backgroundColor: color }} />
      <div className="flex items-center justify-between gap-3">
        <div className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </div>
        <span
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 14%, var(--card))`,
            color,
          }}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <div className="font-data text-3xl font-bold leading-none text-foreground">{value}</div>
        <div className="pb-0.5 text-[10px] text-muted-foreground">de {total}</div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted/80">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

// Gráfico de rosca (anel de progresso) da cobertura de mapeamento: a fatia gold
// é a parte coberta; o restante (trilha neutra) é o que não tem mapeamento.
function CoverageDonut({
  covered,
  total,
  size = 112,
  stroke = 14,
  color = "var(--gold)",
}: {
  covered: number;
  total: number;
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const pct = total > 0 ? covered / total : 0;
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const filled = circ * pct;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`Cobertura de mapeamento: ${Math.round(pct * 100)}% — ${covered} de ${total} processos`}
      className="shrink-0"
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={stroke}
        />
        {pct > 0 ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeDasharray={`${filled} ${circ - filled}`}
            strokeLinecap="round"
          />
        ) : null}
      </g>
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: color, fontSize: size * 0.24, fontWeight: 700 }}
      >
        {Math.round(pct * 100)}%
      </text>
    </svg>
  );
}

// Tabela da cobertura de mapeamento por processo, no mesmo padrão do relatório
// de cadeia de valor (contagem + filtro + colunas com cabeçalho).
function MappingCoverageTable({ rows }: { rows: MappingRow[] }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter((row) =>
        [
          row.name,
          row.department ?? "",
          row.owner ?? "",
          row.status,
          row.mappings.map((mapping) => mapping.name).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : rows;
  const coveredCount = rows.filter((row) => row.mappings.length > 0).length;
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "processo" : "processos"} · {coveredCount} com
          mapeamento
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar..."
          className="h-8 w-48 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
        />
      </div>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Processo</th>
              <th className="px-3 py-2 text-left">Mapeamento cadastrado</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Área</th>
              <th className="px-3 py-2 text-left">Dono</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((row, index) => (
              <tr key={row.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{index + 1}</td>
                <td className="px-3 py-2 font-medium">{row.name}</td>
                <td className="px-3 py-2">
                  {row.mappings.length > 0 ? (
                    <span className="text-foreground">
                      {row.mappings.map((mapping) => mapping.name).join(", ")}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                      Sem mapeamento
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {PROCESS_TYPE_LABELS[row.type] ?? row.type}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{row.department || "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{row.owner || "-"}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full bg-[color-mix(in_oklab,var(--gold)_14%,var(--card))] px-2.5 py-0.5 text-xs font-medium text-[color-mix(in_oklab,var(--gold)_80%,var(--foreground))]">
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Conteúdo do card "Índice de Mapeamento" quando expandido: rosca + tabela.
function MappingCoverageExpanded({ coverage }: { coverage: MappingCoverage }) {
  const uncovered = Math.max(0, coverage.total - coverage.covered);
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-6">
        <CoverageDonut covered={coverage.covered} total={coverage.total} size={168} stroke={20} />
        <div className="grid gap-2">
          <div className="text-sm text-muted-foreground">
            {coverage.covered} de {coverage.total} processos com pelo menos um mapeamento
            cadastrado.
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-[var(--gold)]" />
            <span className="text-foreground">Com mapeamento</span>
            <span className="ml-2 font-semibold text-foreground">{coverage.covered}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-full bg-muted" />
            <span className="text-foreground">Sem mapeamento</span>
            <span className="ml-2 font-semibold text-foreground">{uncovered}</span>
          </div>
        </div>
      </div>
      <MappingCoverageTable rows={coverage.rows} />
    </div>
  );
}

// Tabela com os registros (processos) por trás dos números dos cards do painel,
// no mesmo espírito do relatório de cadeia de valor (coluna de índice + filtro).
function ProcessRecordsTable({
  isDemo,
  filter,
}: {
  isDemo: boolean;
  filter?: (p: (typeof DEMO_REGISTRY.processes)[number]) => boolean;
}) {
  const [query, setQuery] = useState("");
  if (!isDemo) {
    return (
      <p className="text-sm text-muted-foreground">
        O detalhamento dos registros está disponível no modo de demonstração.
      </p>
    );
  }
  const base = filter ? DEMO_REGISTRY.processes.filter(filter) : DEMO_REGISTRY.processes;
  const q = query.trim().toLowerCase();
  const rows = q
    ? base.filter((p) =>
        [p.code, p.name, p.department, p.owner, p.status].join(" ").toLowerCase().includes(q),
      )
    : base;
  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {rows.length} {rows.length === 1 ? "registro" : "registros"}
        </span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar..."
          className="h-8 w-48 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
        />
      </div>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">#</th>
              <th className="px-3 py-2 text-left">Código</th>
              <th className="px-3 py-2 text-left">Processo</th>
              <th className="px-3 py-2 text-left">Tipo</th>
              <th className="px-3 py-2 text-left">Cadeia de Valor</th>
              <th className="px-3 py-2 text-left">Área</th>
              <th className="px-3 py-2 text-left">Dono</th>
              <th className="px-3 py-2 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((p, i) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{p.code || "-"}</td>
                <td className="px-3 py-2">{p.name}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {DEMO_REGISTRY.types.find((t) => t.code === p.type)?.label || p.type}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {DEMO_REGISTRY.valueChains.find((c) => c.id === p.value_chain_id)?.name || "-"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{p.department || "-"}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.owner || "-"}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center rounded-full bg-[color-mix(in_oklab,var(--gold)_14%,var(--card))] px-2.5 py-0.5 text-xs font-medium text-[color-mix(in_oklab,var(--gold)_80%,var(--foreground))]">
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                  Nenhum registro encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type DashboardSortDir = "asc" | "desc";

function SortGlyph({ active, dir }: { active: boolean; dir: DashboardSortDir }) {
  if (!active) return <ArrowDownUp className="h-3 w-3 opacity-35" aria-hidden="true" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-[var(--gold)]" aria-hidden="true" />
  ) : (
    <ArrowDown className="h-3 w-3 text-[var(--gold)]" aria-hidden="true" />
  );
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  const tone = normalized.includes("conclu")
    ? { bg: "#DFF5E6", fg: "#147A3A", border: "#A8E5BA" }
    : normalized.includes("aprov")
      ? { bg: "#E6F4FF", fg: "#145DA0", border: "#B9DEFF" }
      : normalized.includes("revis")
        ? { bg: "#FFF3D8", fg: "#9A5A00", border: "#F3D18A" }
        : normalized.includes("andamento") || normalized.includes("ativo")
          ? {
              bg: "color-mix(in oklab, var(--gold) 15%, var(--card))",
              fg: "var(--gold)",
              border: "color-mix(in oklab, var(--gold) 35%, var(--border))",
            }
          : { bg: "var(--muted)", fg: "var(--muted-foreground)", border: "var(--border)" };
  return (
    <span
      className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: tone.bg, color: tone.fg, borderColor: tone.border }}
    >
      {status || "-"}
    </span>
  );
}

type DashboardMappingColumn = keyof Pick<
  DashboardMappingRow,
  | "code"
  | "name"
  | "process"
  | "modalidade"
  | "area"
  | "owner"
  | "responsible"
  | "status"
  | "updatedAt"
>;

const DASHBOARD_MAPPING_COLUMNS: Array<[DashboardMappingColumn, string]> = [
  ["code", "Código"],
  ["name", "Título do mapeamento"],
  ["process", "Nome do processo"],
  ["modalidade", "Modalidade"],
  ["area", "Área"],
  ["owner", "Dono do processo"],
  ["responsible", "Elaborador"],
  ["status", "Status"],
  ["updatedAt", "Última atualização"],
];

function compareMappingValues(
  a: DashboardMappingRow,
  b: DashboardMappingRow,
  field: DashboardMappingColumn,
  dir: DashboardSortDir,
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

function MappingRecordsTable({ rows }: { rows: DashboardMappingRow[] }) {
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<DashboardMappingColumn>("updatedAt");
  const [sortDir, setSortDir] = useState<DashboardSortDir>("desc");

  function toggleSort(field: DashboardMappingColumn) {
    if (field === sortField) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir(field === "updatedAt" ? "desc" : "asc");
  }

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? rows.filter((row) =>
          DASHBOARD_MAPPING_COLUMNS.some(([field]) =>
            String(row[field] ?? "")
              .toLowerCase()
              .includes(normalized),
          ),
        )
      : rows;
    return [...filtered].sort((a, b) => compareMappingValues(a, b, sortField, sortDir));
  }, [query, rows, sortDir, sortField]);

  return (
    <div className="grid gap-3">
      <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="text-xs font-semibold text-foreground">Consulta somente leitura</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Use esta tabela para acompanhar os registros. Edição, exclusão e mudança de status
            continuam restritas à consulta de mapeamentos.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
          {MAPPING_STATUS_TILES.map((tile) => (
            <div key={tile.key} className="rounded-md border border-border bg-card px-3 py-2">
              <div className="font-data text-lg font-bold" style={{ color: tile.color }}>
                {rows.filter((row) => normalizeStatusKey(row.status) === tile.key).length}
              </div>
              <div className="text-[10px] text-muted-foreground">{tile.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {visibleRows.length} {visibleRows.length === 1 ? "registro" : "registros"}
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar..."
          className="h-8 w-56 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
        />
      </div>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {DASHBOARD_MAPPING_COLUMNS.map(([field, label]) => (
                <th key={field} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort(field)}
                    className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                  >
                    {label}
                    <SortGlyph active={sortField === field} dir={sortDir} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30">
                {DASHBOARD_MAPPING_COLUMNS.map(([field]) => (
                  <td key={field} className="break-words px-3 py-3 text-foreground">
                    {field === "updatedAt" ? (
                      formatDateTimeBr(row.updatedAt)
                    ) : field === "status" ? (
                      <StatusBadge status={row.status || "-"} />
                    ) : (
                      row[field] || "-"
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={DASHBOARD_MAPPING_COLUMNS.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Nenhum mapeamento encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OperationalMetricCard({
  label,
  value,
  detail,
  icon,
  color,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  icon: ReactNode;
  color: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${DASHBOARD_CARD_CLASS} group flex min-h-[220px] flex-col p-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      <span className="text-sm font-semibold text-foreground">{label}</span>
      <strong className="mt-5 font-data text-5xl font-bold leading-none" style={{ color }}>
        {value}
      </strong>
      <p className="mt-3 max-w-[17ch] text-xs leading-relaxed text-muted-foreground">{detail}</p>
      <div className="mt-auto flex w-full items-end justify-between">
        <span
          className="grid h-10 w-10 place-items-center rounded-md"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 12%, var(--card))`,
            color,
          }}
        >
          {icon}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
      </div>
    </button>
  );
}

type DashboardCauseColumn = keyof Pick<
  DashboardCauseRow,
  | "cause"
  | "source"
  | "mapping"
  | "process"
  | "responsible"
  | "priority"
  | "status"
  | "dueDate"
  | "updatedAt"
>;

const DASHBOARD_CAUSE_COLUMNS: Array<[DashboardCauseColumn, string]> = [
  ["cause", "Oportunidade"],
  ["source", "Origem"],
  ["mapping", "Mapeamento"],
  ["process", "Processo"],
  ["responsible", "Responsável"],
  ["priority", "Prioridade"],
  ["status", "Status"],
  ["dueDate", "Prazo"],
  ["updatedAt", "Última atualização"],
];

function CauseRecordsTable({ rows }: { rows: DashboardCauseRow[] }) {
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<DashboardCauseColumn>("updatedAt");
  const [sortDir, setSortDir] = useState<DashboardSortDir>("desc");

  function toggleSort(field: DashboardCauseColumn) {
    if (field === sortField) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir(field === "updatedAt" || field === "dueDate" ? "desc" : "asc");
  }

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    const filtered = normalized
      ? rows.filter((row) =>
          DASHBOARD_CAUSE_COLUMNS.some(([field]) =>
            String(row[field] ?? "")
              .toLocaleLowerCase("pt-BR")
              .includes(normalized),
          ),
        )
      : rows;
    const sign = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) =>
        String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? ""), "pt-BR", {
          numeric: true,
          sensitivity: "base",
        }) * sign,
    );
  }, [query, rows, sortDir, sortField]);

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {visibleRows.length}{" "}
          {visibleRows.length === 1 ? "oportunidade de melhoria" : "oportunidades de melhoria"}
        </span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar oportunidades..."
          className="h-8 w-64 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
        />
      </div>
      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[1180px] text-left text-sm">
          <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {DASHBOARD_CAUSE_COLUMNS.map(([field, label]) => (
                <th key={field} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort(field)}
                    className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                  >
                    {label}
                    <SortGlyph active={sortField === field} dir={sortDir} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30">
                {DASHBOARD_CAUSE_COLUMNS.map(([field]) => (
                  <td key={field} className="break-words px-3 py-3 text-foreground">
                    {field === "updatedAt" ? (
                      formatDateTimeBr(row.updatedAt)
                    ) : field === "dueDate" ? (
                      formatDateBr(row.dueDate) || "-"
                    ) : field === "status" ? (
                      <StatusBadge status={row.status || "-"} />
                    ) : (
                      row[field] || "-"
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={DASHBOARD_CAUSE_COLUMNS.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Nenhuma oportunidade de melhoria identificada.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const DOCUMENT_CATALOG_TYPES: DashboardDocumentType[] = [
  "Norma",
  "POP",
  "Instrução",
  "Fluxograma",
  "Mapeamento",
];

type DocumentCatalogColumn = keyof Pick<
  DashboardDocumentCatalogRow,
  "code" | "title" | "area" | "process" | "responsible" | "status" | "updatedAt"
>;

const DOCUMENT_CATALOG_COLUMNS: Array<[DocumentCatalogColumn, string]> = [
  ["code", "Código"],
  ["title", "Documento"],
  ["area", "Área"],
  ["process", "Processo"],
  ["responsible", "Responsável"],
  ["status", "Status"],
  ["updatedAt", "Última atualização"],
];

function documentTypeCount(rows: DashboardDocumentCatalogRow[], type: DashboardDocumentType) {
  return rows.filter((row) => row.documentType === type).length;
}

// Status de andamento (Em andamento / Em revisão / Aprovado / Concluído) do
// documento mais recente do tipo — mesmo modelo já usado no preenchimento de
// Mapeamento. Sem documentos do tipo, não há status a exibir.
function latestStatusForDocumentType(
  rows: DashboardDocumentCatalogRow[],
  type: DashboardDocumentType,
) {
  const typeRows = rows.filter((row) => row.documentType === type);
  if (!typeRows.length) return "-";
  return (
    [...typeRows].sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    )[0].status || "-"
  );
}

function topAreasForDocumentType(rows: DashboardDocumentCatalogRow[], type: DashboardDocumentType) {
  const counts = new Map<string, number>();
  rows
    .filter((row) => row.documentType === type)
    .forEach((row) => {
      const area = row.area?.trim() && row.area !== "-" ? row.area : "Sem área";
      counts.set(area, (counts.get(area) ?? 0) + 1);
    });
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "pt-BR"))
    .slice(0, 5);
}

function DocumentTypeQuadrant({
  type,
  rows,
}: {
  type: DashboardDocumentType;
  rows: DashboardDocumentCatalogRow[];
}) {
  const areas = topAreasForDocumentType(rows, type);
  const maxValue = Math.max(1, areas[0]?.value ?? 1);
  return (
    <div className="min-h-[142px] min-w-0 overflow-hidden rounded-lg border border-border bg-background p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          {type}
        </div>
        <span className="rounded-full bg-[color-mix(in_oklab,var(--gold)_12%,var(--card))] px-2 py-0.5 font-data text-xs font-semibold text-[var(--gold)]">
          {documentTypeCount(rows, type)}
        </span>
      </div>
      <div className="grid gap-1.5">
        {areas.length ? (
          areas.map((area, index) => (
            <div
              key={area.label}
              className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)_1.25rem] items-center gap-x-2"
            >
              <span className="row-span-2 text-[10px] font-data font-bold text-[var(--gold)]">
                {index + 1}
              </span>
              <span className="min-w-0 truncate text-[11px] text-foreground" title={area.label}>
                {area.label}
              </span>
              <span className="text-right text-[10px] font-data text-muted-foreground">
                {area.value}
              </span>
              <div className="col-span-2 mt-1 h-1 min-w-0 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full max-w-full rounded-full bg-[var(--gold)]/80"
                  style={{ width: `${Math.max(8, (area.value / maxValue) * 100)}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="py-3 text-center text-xs text-muted-foreground">Sem registros.</div>
        )}
      </div>
    </div>
  );
}

function compareDocumentCatalogRows(
  a: DashboardDocumentCatalogRow,
  b: DashboardDocumentCatalogRow,
  field: DocumentCatalogColumn,
  dir: DashboardSortDir,
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

function DocumentCatalogExpanded({ rows }: { rows: DashboardDocumentCatalogRow[] }) {
  const [activeType, setActiveType] = useState<DashboardDocumentType>("Norma");
  const [query, setQuery] = useState("");
  const [sortField, setSortField] = useState<DocumentCatalogColumn>("updatedAt");
  const [sortDir, setSortDir] = useState<DashboardSortDir>("desc");

  useEffect(() => {
    if (rows.some((row) => row.documentType === activeType)) return;
    const nextType = DOCUMENT_CATALOG_TYPES.find((type) =>
      rows.some((row) => row.documentType === type),
    );
    if (nextType) setActiveType(nextType);
  }, [activeType, rows]);

  function toggleSort(field: DocumentCatalogColumn) {
    if (field === sortField) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDir(field === "updatedAt" ? "desc" : "asc");
  }

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (row.documentType !== activeType) return false;
      if (!normalized) return true;
      return DOCUMENT_CATALOG_COLUMNS.some(([field]) =>
        String(row[field] ?? "")
          .toLowerCase()
          .includes(normalized),
      );
    });
    return [...filtered].sort((a, b) => compareDocumentCatalogRows(a, b, sortField, sortDir));
  }, [activeType, query, rows, sortDir, sortField]);

  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-border bg-muted/30 p-3">
        <div className="text-xs font-semibold text-foreground">Catálogo por tipo de documento</div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Alterne entre as abas para consultar os registros por tipo. A tabela preserva filtro e
          ordenação para facilitar conferência.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
          {DOCUMENT_CATALOG_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setActiveType(type)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                activeType === type
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {type}
              <span className="ml-2 font-data text-[var(--gold)]">
                {documentTypeCount(rows, type)}
              </span>
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filtrar..."
          className="h-8 w-56 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--gold)]/40"
        />
      </div>

      <div className="overflow-auto rounded-lg border border-border">
        <table className="w-full min-w-[920px] text-left text-sm">
          <thead className="bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {DOCUMENT_CATALOG_COLUMNS.map(([field, label]) => (
                <th key={field} className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleSort(field)}
                    className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                  >
                    {label}
                    <SortGlyph active={sortField === field} dir={sortDir} />
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleRows.map((row) => (
              <tr key={row.id} className="hover:bg-muted/30">
                {DOCUMENT_CATALOG_COLUMNS.map(([field]) => (
                  <td key={field} className="break-words px-3 py-3 text-foreground">
                    {field === "updatedAt" ? (
                      formatDateTimeBr(row.updatedAt)
                    ) : field === "status" ? (
                      <StatusBadge status={row.status || "-"} />
                    ) : (
                      row[field] || "-"
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {!visibleRows.length ? (
              <tr>
                <td
                  colSpan={DOCUMENT_CATALOG_COLUMNS.length}
                  className="px-3 py-8 text-center text-muted-foreground"
                >
                  Nenhum documento encontrado.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type RecentActivityItem = {
  id: string;
  title: string;
  subtitle: string;
  tag: string;
  // Processos e mapeamentos não têm versionamento; version fica null nesses casos.
  version: string | null;
  updatedAt: string;
};

type SystemNotification = {
  id: string;
  title: string;
  description: string;
  tag: string;
  updatedAt: string;
};

type SystemReleaseNote = {
  id: string;
  title: string;
  description: string;
  category: string;
  published_at: string;
};

declare const __BF_FLOW_RELEASE_NOTES__: SystemReleaseNote[];

const AUTOMATED_RELEASE_NOTES =
  typeof __BF_FLOW_RELEASE_NOTES__ === "undefined" ? [] : __BF_FLOW_RELEASE_NOTES__;

function SystemNotificationsMenu({
  items: systemItems,
  organizationId,
  userId,
}: {
  items: SystemNotification[];
  organizationId: string;
  userId: string;
}) {
  const [tab, setTab] = useState("user");
  const load = useServerFn(loadTaskNotifications);
  const userQ = useQuery({
    queryKey: ["task-notifications", organizationId, userId],
    queryFn: () => load({ data: { organizationId } }),
    enabled: !!organizationId && !!userId,
    refetchInterval: 60000,
  });
  const items: (SystemNotification & { taskId?: string })[] =
    tab === "user" ? userQ.data || [] : systemItems;

  const [open, setOpen] = useState(false);
  const [readIds, setReadIds] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const readStorageKey = `bf-flow.notification-read.v2:${userId}:${organizationId}`;
  const readSet = useMemo(() => new Set(readIds), [readIds]);
  const notificationReadKey = (item: SystemNotification) => `${item.id}:${item.updatedAt}`;
  const allItems = [...(userQ.data || []), ...systemItems];
  const unreadCount = allItems.filter((item) => !readSet.has(notificationReadKey(item))).length;

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(readStorageKey) || "[]");
      if (Array.isArray(stored)) setReadIds(stored.filter((id) => typeof id === "string"));
    } catch {
      setReadIds([]);
    }
  }, [readStorageKey]);

  function saveReadIds(next: string[]) {
    const unique = Array.from(new Set(next));
    setReadIds(unique);
    try {
      localStorage.setItem(readStorageKey, JSON.stringify(unique.slice(-250)));
    } catch {
      // A leitura continua válida durante a sessão quando o armazenamento não está disponível.
    }
  }

  function markAsRead(item: SystemNotification) {
    const key = notificationReadKey(item);
    if (readSet.has(key)) return;
    saveReadIds([...readIds, key]);
  }

  function markAllAsRead() {
    saveReadIds([...readIds, ...allItems.map(notificationReadKey)]);
  }

  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative grid h-9 w-9 place-items-center rounded-md border border-border bg-card text-muted-foreground transition hover:border-[var(--gold)]/50 hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-[var(--gold)]/25"
        aria-label="Ver atividades e atualizações"
        aria-expanded={open}
        title="Atividades e atualizações"
      >
        <Bell className="h-4 w-4" />
        {unreadCount ? (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--gold)] ring-2 ring-card" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-card shadow-xl">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-foreground">Atividades e atualizações</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {unreadCount
                  ? `${unreadCount} não lida${unreadCount === 1 ? "" : "s"}`
                  : "Tudo lido"}
              </div>
            </div>
            {unreadCount ? (
              <button
                type="button"
                onClick={markAllAsRead}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-semibold text-[var(--gold)] transition hover:bg-muted"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Marcar todas
              </button>
            ) : (
              <CheckCheck className="h-4 w-4 text-emerald-600" />
            )}
          </div>
          <div className="flex gap-4 border-b border-border px-4">
            <button
              type="button"
              className={`py-3 text-xs ${tab === "user" ? "border-b-2 border-primary font-semibold" : ""}`}
              onClick={() => setTab("user")}
            >
              Usuário
            </button>
            <button
              type="button"
              className={`py-3 text-xs ${tab === "system" ? "border-b-2 border-primary font-semibold" : ""}`}
              onClick={() => setTab("system")}
            >
              Atualizações do sistema
            </button>
          </div>
          {tab === "user" && userQ.isLoading && (
            <p className="p-4 text-sm">Carregando notificações…</p>
          )}
          {tab === "user" && userQ.error && (
            <p role="alert" className="p-4 text-sm">
              {userQ.error.message}
            </p>
          )}
          {items.length ? (
            <div className="max-h-[360px] overflow-y-auto p-2">
              {items.map((item) => {
                const isRead = readSet.has(notificationReadKey(item));
                return (
                  <div
                    key={item.id}
                    className={`rounded-md px-3 py-2.5 transition hover:bg-muted ${
                      isRead ? "opacity-70" : "bg-[color-mix(in_oklab,var(--gold)_5%,var(--card))]"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 inline-flex shrink-0 rounded-full bg-[color-mix(in_oklab,var(--gold)_12%,var(--card))] px-2 py-0.5 text-[10px] font-semibold text-[var(--gold)]">
                        {item.tag}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-foreground">
                          {item.title}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground">
                          {item.description}
                        </div>{" "}
                        {item.taskId && (
                          <a
                            href={`/?view=tasks&taskState=${encodeURIComponent(JSON.stringify({ id: item.taskId }))}`}
                            onClick={() => markAsRead(item)}
                            className="mt-2 inline-block text-xs font-semibold text-primary"
                          >
                            Abrir tarefa
                          </a>
                        )}
                      </div>
                      <div className="grid shrink-0 justify-items-end gap-1">
                        <time className="text-[10px] text-muted-foreground">
                          {formatDateTimeBr(item.updatedAt)}
                        </time>
                        {isRead ? (
                          <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="Lida" />
                        ) : (
                          <button
                            type="button"
                            onClick={() => markAsRead(item)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-[var(--gold)] hover:bg-muted"
                          >
                            Marcar como lida
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">
              Sem atualizações recentes.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function documentActivityTag(module: string, name = "") {
  const normalizedName = name.toLowerCase();
  if (module === "ddp") return "Mapeamento";
  if (module === "bpmn") return "Fluxograma";
  if (normalizedName.includes("norma") || normalizedName.startsWith("nor.")) return "Norma";
  if (
    normalizedName.includes("instru") ||
    normalizedName.includes("trabalho") ||
    normalizedName.startsWith("it.")
  ) {
    return "Instrução";
  }
  if (module === "pop") return "POP";
  return "Documento";
}

function formatShortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return formatDateBr(date.toISOString().slice(0, 10)).slice(0, 5);
}

function WorkspaceContent({
  view,
  organizationName,
  organizationId,
  organizationSlug,
  codeSettings,
  totals,
  mappingRows,
  mappingStatusCounts,
  causeRows,
  causeStatusCounts,
  documentCatalogRows,
  dashboardError,
  onRetry,
  departments,
  topDepartments,
  topOwners,
  recentDocuments,
  recentProcesses,
  activityItems,
  mappingCoverage,
  isLoading,
  isDemo,
  isAdmin,
}: {
  view: WorkspaceView;
  organizationName: string;
  organizationId: string | null;
  organizationSlug: string | null;
  codeSettings: CodeSettings | null;
  totals: DashboardTotals | undefined;
  mappingRows: DashboardMappingRow[];
  mappingStatusCounts: DashboardMappingStatusCounts;
  causeRows: DashboardCauseRow[];
  causeStatusCounts: DashboardCauseStatusCounts;
  documentCatalogRows: DashboardDocumentCatalogRow[];
  dashboardError?: string;
  onRetry: () => void;
  departments: { id: string; name: string }[];
  topDepartments: { label: string; value: number }[];
  topOwners: { label: string; value: number }[];
  recentDocuments: Array<{
    id: string;
    name: string;
    module: string;
    current_version: number;
    updated_at: string;
  }>;
  recentProcesses: DashboardProcess[];
  activityItems: SystemNotification[];
  mappingCoverage: MappingCoverage;
  isLoading: boolean;
  isDemo: boolean;
  isAdmin: boolean;
}) {
  const navigate = useNavigate();

  function openActivityItem(item: SystemNotification) {
    const tag = item.tag
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const filter = item.title;

    if (tag.includes("mapeamento")) {
      navigate({
        to: "/m/$module",
        params: { module: "ddp" },
        search: { view: "consult", filter },
      });
      return;
    }
    if (tag.includes("fluxograma")) {
      navigate({
        to: "/m/$module",
        params: { module: "bpmn" },
        search: { view: "consult", filter },
      });
      return;
    }
    if (
      tag.includes("pop") ||
      tag.includes("norma") ||
      tag.includes("instrucao") ||
      tag.includes("documento")
    ) {
      navigate({
        to: "/m/$module",
        params: { module: "pop" },
        search: { view: "consult", filter },
      });
      return;
    }
    if (tag.includes("sistema")) {
      navigate({ to: "/", search: { area: "modules", view: "systems" } });
      return;
    }
    if (tag.includes("processo")) {
      navigate({ to: "/", search: { area: "modules", view: "processes" } });
      return;
    }
    navigate({ to: "/", search: { area: "modules" } });
  }

  if (String(view).startsWith("module:")) {
    const [, moduleId, task = "home"] = view.split(":") as [
      "module",
      AteliamModule,
      ModuleTask | undefined,
    ];
    const moduleInfo = MODULES.find((item) => item.id === moduleId)!;
    return (
      <ModuleWorkspacePanel module={moduleInfo} task={task} recentDocuments={recentDocuments} />
    );
  }

  if (view === "documents") {
    return (
      <section className="grid gap-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            biblioteca
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold">Documentos da organização</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Consulte mapeamentos, documentações, fluxogramas e registros salvos.
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <ModuleSummaryCard moduleId="ddp" title="Mapeamentos" count={totals?.ddps ?? 0} />
          <ModuleSummaryCard moduleId="pop" title="Documentações" count={totals?.pops ?? 0} />
          <ModuleSummaryCard moduleId="bpmn" title="Fluxogramas" count={0} />
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            últimas versões
          </div>
          <DocumentTable documents={recentDocuments} />
        </div>
      </section>
    );
  }

  if (view === "task-reminders") {
    if (!isAdmin) {
      return (
        <section className="rounded-lg border border-border bg-card p-6" role="alert">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
            configurações
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold text-foreground">Acesso restrito</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            As configurações de lembretes estão disponíveis somente para o administrador do sistema.
          </p>
        </section>
      );
    }
    return (
      <div>
        <AdminSettingsTabs view={view} />
        <Suspense fallback={<LoadingSkeleton />}>
          <TaskReminderSettings />
        </Suspense>
      </div>
    );
  }

  if (view === "task-flows") {
    if (!isAdmin) {
      return (
        <section className="rounded-lg border border-border bg-card p-6" role="alert">
          <h1 className="font-display text-2xl font-bold text-foreground">Acesso restrito</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            A configuração de responsáveis e notificações está disponível somente para o
            administrador do sistema.
          </p>
        </section>
      );
    }
    return (
      <div>
        <AdminSettingsTabs view={view} />
        <Suspense fallback={<LoadingSkeleton />}>
          <TaskFlowSettings organizationId={organizationId} />
        </Suspense>
      </div>
    );
  }

  if (view === "users" || view === "organizations" || view === "document-models") {
    if (!isAdmin) {
      return (
        <section className="rounded-lg border border-border bg-card p-6">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
            configurações
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold text-foreground">Acesso restrito</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            O cadastro de usuários e organizações é permitido somente para administradores.
          </p>
        </section>
      );
    }
    return (
      <div>
        <AdminSettingsTabs view={view} />
        <Suspense fallback={<LoadingSkeleton />}>
          <WorkspaceSystemSettings
            view={view === "document-models" ? "organizations" : view}
            isDemo={isDemo}
            organizationName={organizationName}
            organizationId={organizationId}
            isAdmin={isAdmin}
          />
        </Suspense>
      </div>
    );
  }

  if (view === "value-chain-report") {
    return (
      <Suspense fallback={<LoadingSkeleton />}>
        <WorkspaceReports
          view={view}
          organizationId={organizationId}
          organizationName={organizationName}
          isDemo={isDemo}
        />
      </Suspense>
    );
  }

  if (
    view === "value-chains" ||
    view === "processes" ||
    view === "areas" ||
    view === "positions" ||
    view === "owners" ||
    view === "owner-users" ||
    view === "systems" ||
    view === "process-types"
  ) {
    return (
      <WorkspaceProcessRegistrations
        key={`${view}-${organizationId ?? "default"}`}
        view={view as ProcessRegistrationView}
        organizationId={organizationId}
        organizationName={organizationName}
        organizationSlug={organizationSlug}
        codeSettings={codeSettings}
        isDemo={isDemo}
      />
    );
  }

  if (
    [
      "areas",
      "roles",
      "access-profiles",
      "document-types",
      "systems",
      "owners",
      "processes",
      "causes",
    ].includes(view)
  ) {
    const copy = getCatalogCopy(view, totals);
    return (
      <section className="grid gap-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            cadastros
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold">{copy.title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {copy.text}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {copy.metrics.map((metric) => (
            <DashboardMetric
              key={metric.label}
              icon={metric.icon}
              label={metric.label}
              value={metric.value}
              detail={metric.detail}
            />
          ))}
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="mb-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            consulta rápida
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <RankingCard title="Áreas com mais processos" rows={topDepartments} />
            <RankingCard title="Donos com mais processos" rows={topOwners} />
          </div>
        </div>
      </section>
    );
  }

  if (view === "exports") {
    return <ExportsPanel />;
  }

  if (view === "theme") {
    return (
      <section className="rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          configurações
        </div>
        <h1 className="mt-2 text-2xl font-semibold">Tema</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          O workspace usa o tema claro como padrão. Você ainda pode escolher outra preferência.
        </p>
        <div className="mt-6 max-w-xl">
          <ThemeControl />
        </div>
      </section>
    );
  }

  if (view === "profile") {
    return (
      <SimplePanel
        eyebrow="perfil"
        title="Perfil"
        text="Use o avatar no canto superior direito para adicionar sua foto, trocar a senha ou sair do sistema."
      />
    );
  }

  if (
    view === "appearance" ||
    view === "preferences" ||
    view === "visual-identity" ||
    view === "integrations" ||
    view === "local-environment" ||
    view === "version-history"
  ) {
    return (
      <SimplePanel
        eyebrow="configurações"
        title={
          view === "appearance"
            ? "Aparência"
            : view === "theme"
              ? "Tema"
              : view === "profile"
                ? "Perfil e acesso"
                : view === "preferences"
                  ? "Preferências"
                  : view === "visual-identity"
                    ? "Identidade visual"
                    : view === "integrations"
                      ? "Integrações"
                      : view === "local-environment"
                        ? "Ambiente de teste/local"
                        : view === "version-history"
                          ? "Histórico de versões"
                          : "Configurações"
        }
        text="Ajuste aparência, tema, preferências, identidade visual, integrações, ambiente local e dados de acesso."
      />
    );
  }

  return (
    <OperationalDashboard
      key={organizationId}
      organizationName={organizationName}
      error={dashboardError}
      onRetry={onRetry}
      departments={departments}
      processes={mappingCoverage.rows}
      mappings={mappingRows}
      documents={documentCatalogRows}
      improvements={causeRows}
      loading={isLoading}
    />
  );
}

function LoadingSkeleton() {
  return (
    <section className="grid gap-4" aria-busy="true" aria-label="Carregando conteúdo">
      <div className="h-32 animate-pulse rounded-lg border border-border bg-card" />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
        <div className="h-24 animate-pulse rounded-lg border border-border bg-card" />
      </div>
      <div className="h-72 animate-pulse rounded-lg border border-border bg-card" />
    </section>
  );
}

function ModuleSummaryCard({
  moduleId,
  title,
  count,
}: {
  moduleId: AteliamModule;
  title: string;
  count: number;
}) {
  const module = MODULES.find((item) => item.id === moduleId)!;
  return (
    <Link
      to="/m/$module"
      params={{ module: moduleId }}
      className="rounded-lg border border-border bg-card p-4 transition hover:border-[var(--gold)] hover:bg-muted/55"
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className="grid h-10 w-10 place-items-center rounded-lg font-data text-sm font-bold"
          style={{ background: "var(--accent)", color: module.accent }}
        >
          {module.glyph}
        </span>
        <span className="font-data text-2xl font-bold">{count}</span>
      </div>
      <div className="mt-4 font-display text-base font-bold">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">Abrir módulo</div>
    </Link>
  );
}

function ExportsPanel() {
  const exportCards: Array<{
    moduleId: AteliamModule;
    title: string;
    formats: string;
    text: string;
  }> = [
    {
      moduleId: "ddp",
      title: "Mapeamento",
      formats: "HTML interativo + Word",
      text: "Apresentação com zoom nas imagens de fluxo e relatório Word editável no modelo oficial.",
    },
    {
      moduleId: "pop",
      title: "Documentação",
      formats: "Word editável",
      text: "Documento normativo com cabeçalho, revisão, responsáveis, conteúdo e padrão visual da organização.",
    },
    {
      moduleId: "bpmn",
      title: "Fluxograma",
      formats: "XML/SVG/imagem",
      text: "Arquivos de desenho para documentação, revisão e publicação do fluxo do processo.",
    },
  ];

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          exportações
        </div>
        <h1 className="mt-3 font-display text-3xl font-bold">Arquivos padronizados</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Cada módulo mantém suas próprias saídas. A exportação acontece dentro do editor do módulo,
          preservando o modelo visual e estrutural de cada documento.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {exportCards.map((card) => {
          const module = MODULES.find((item) => item.id === card.moduleId)!;
          return (
            <Link
              key={card.moduleId}
              to="/m/$module"
              params={{ module: card.moduleId }}
              className="rounded-lg border border-border bg-card p-5 transition hover:border-[var(--gold)] hover:bg-muted/55"
            >
              <div
                className="grid h-10 w-10 place-items-center rounded-lg font-data text-sm font-bold"
                style={{ background: "var(--accent)", color: module.accent }}
              >
                {module.glyph}
              </div>
              <div className="mt-4 font-display text-lg font-bold">{card.title}</div>
              <div className="mt-2 rounded-md bg-accent px-2 py-1 text-xs font-bold text-[var(--gold)]">
                {card.formats}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{card.text}</p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function getCatalogCopy(
  view: WorkspaceView,
  totals:
    | {
        processes: number;
        activeProcesses: number;
        reviewProcesses: number;
        ddps: number;
        pops: number;
        departments: number;
        owners: number;
      }
    | undefined,
) {
  const baseMetrics = [
    {
      icon: <GitBranch className="h-4 w-4" />,
      label: "Processos",
      value: totals?.processes ?? 0,
      detail: `${totals?.activeProcesses ?? 0} ativos`,
    },
    {
      icon: <Building2 className="h-4 w-4" />,
      label: "Áreas",
      value: totals?.departments ?? 0,
      detail: "cadastradas",
    },
    {
      icon: <Users className="h-4 w-4" />,
      label: "Donos",
      value: totals?.owners ?? 0,
      detail: "responsáveis",
    },
  ];

  if (view === "organizations") {
    return {
      title: "Organizações",
      text: "Cadastre organizações, mantenha seus dados institucionais e controle o escopo das informações.",
      metrics: baseMetrics,
    };
  }

  if (view === "users") {
    return {
      title: "Usuários",
      text: "Cadastre usuários, credenciais e vínculo com a organização antes de liberar o acesso.",
      metrics: baseMetrics,
    };
  }

  if (view === "areas") {
    return {
      title: "Áreas e departamentos",
      text: "Gerencie as áreas que alimentam mapeamentos, documentos, processos e responsáveis.",
      metrics: baseMetrics,
    };
  }

  if (view === "roles") {
    return {
      title: "Cargos e funções",
      text: "Mantenha cargos e funções organizacionais reutilizáveis em responsabilidades e aprovações.",
      metrics: baseMetrics,
    };
  }

  if (view === "access-profiles") {
    return {
      title: "Perfis de acesso",
      text: "Defina perfis de consulta, edição, aprovação e administração para cada organização.",
      metrics: baseMetrics,
    };
  }

  if (view === "document-types") {
    return {
      title: "Tipos de processo",
      text: "Organize os tipos usados no catálogo de processos e mantenha o preenchimento padronizado.",
      metrics: baseMetrics,
    };
  }

  if (view === "document-models") {
    return {
      title: "Modelos de documento",
      text: "Mantenha modelos oficiais para orientar preenchimento, versionamento e exportação.",
      metrics: baseMetrics,
    };
  }

  if (view === "owners") {
    return {
      title: "Responsáveis",
      text: "Mantenha responsáveis selecionáveis para vincular processos, mapeamentos e documentos.",
      metrics: baseMetrics,
    };
  }

  if (view === "causes") {
    return {
      title: "Oportunidades de melhoria",
      text: "Consulte oportunidades identificadas nos mapeamentos e acompanhe status, responsável, comentários e vínculos com processos.",
      metrics: [
        ...baseMetrics.slice(0, 2),
        {
          icon: <CheckCircle2 className="h-4 w-4" />,
          label: "Em revisão",
          value: totals?.reviewProcesses ?? 0,
          detail: "pendências",
        },
      ],
    };
  }

  if (view === "systems") {
    return {
      title: "Sistemas/Documentos",
      text: "Cadastre sistemas e documentos para reutilizar nos mapeamentos e manter consistência entre processos.",
      metrics: [
        ...baseMetrics.slice(0, 2),
        {
          icon: <Database className="h-4 w-4" />,
          label: "Sistemas/Documentos",
          value: 0,
          detail: "base local",
        },
      ],
    };
  }

  return {
    title: "Catálogo de processos",
    text: "Centralize macroprocessos, subprocessos, áreas, responsáveis, oportunidades de melhoria, sistemas e documentos.",
    metrics: baseMetrics,
  };
}

type ModuleActionKey = ModuleTask | "new";

function ModuleWorkspacePanel({
  module,
  task,
  recentDocuments,
}: {
  module: (typeof MODULES)[number];
  task: ModuleTask;
  recentDocuments: Array<{
    id: string;
    name: string;
    module: string;
    current_version: number;
    updated_at: string;
  }>;
}) {
  const actions = getModuleActions(module.id);
  const activeAction = actions.find((action) => action.key === task) ?? actions[0];
  const moduleDocs = getModuleDocuments(module.id, recentDocuments);
  const exportLabel = getModuleExportLabel(module.id);
  // Mapeamentos (ddp) não são versionados; demais módulos mantêm versão.
  const isVersioned = module.id !== "ddp";
  const latestVersion = moduleDocs.length
    ? Math.max(...moduleDocs.map((document) => document.current_version))
    : 0;

  return (
    <div className="grid gap-4">
      <section className="rounded-lg border border-border bg-card p-5 shadow-[0_24px_70px_-55px_rgba(0,0,0,.75)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--gold)]">
              processos · {module.title}
            </div>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight md:text-4xl">
              {module.title}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {module.description}
            </p>
          </div>
        </div>

        <div className={`mt-5 grid gap-3 ${isVersioned ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
          <ModuleStat label="Documentos" value={moduleDocs.length} detail="na organização" />
          {isVersioned ? (
            <ModuleStat label="Última versão" value={`v${latestVersion}`} detail="disponível" />
          ) : null}
          <ModuleStat label="Exportação" value={exportLabel} detail="modelo preservado" />
        </div>
      </section>

      <section className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            {activeAction?.eyebrow ?? "operação"}
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold">{activeAction?.title}</h2>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {activeAction?.body}
          </p>
          <div className="mt-5 overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[760px] border-collapse text-left text-sm">
              <thead className="bg-muted/70 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3 font-semibold">Documento</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Responsável</th>
                  {isVersioned ? <th className="px-3 py-3 font-semibold">Versão</th> : null}
                  <th className="px-3 py-3 font-semibold">Atualização</th>
                  <th className="px-3 py-3 font-semibold">Saída</th>
                </tr>
              </thead>
              <tbody>
                {moduleDocs.map((document) => (
                  <tr
                    key={document.id}
                    className="border-t border-border bg-background/58 align-top"
                  >
                    <td className="px-3 py-3">
                      <div className="max-w-[320px] truncate font-semibold">{document.name}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{document.process}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="rounded-md bg-accent px-2 py-1 text-xs font-semibold text-[var(--gold)]">
                        {document.status}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{document.owner}</td>
                    {isVersioned ? (
                      <td className="px-3 py-3 font-data text-muted-foreground">
                        v{document.current_version}
                      </td>
                    ) : null}
                    <td className="px-3 py-3 text-muted-foreground">
                      {formatDateBr(document.updated_at)}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        to="/m/$module"
                        params={{ module: module.id }}
                        className="text-xs font-bold text-[var(--gold)] hover:underline"
                      >
                        {exportLabel}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-lg border border-border bg-card p-5">
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            fluxo recomendado
          </div>
          <div className="mt-4 grid gap-3">
            {getModuleFlow(module.id).map((item, index) => (
              <div key={item} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent font-data text-xs font-bold text-[var(--gold)]">
                  {index + 1}
                </span>
                <p className="pt-1 text-sm leading-relaxed text-muted-foreground">{item}</p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </div>
  );
}

function ModuleStat({ label, value, detail }: { label: string; value: ReactNode; detail: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/55 p-3">
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-2 font-data text-xl font-bold text-foreground">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function getModuleActions(moduleId: AteliamModule): Array<{
  key: ModuleActionKey;
  label: string;
  description: string;
  eyebrow: string;
  title: string;
  body: string;
}> {
  if (moduleId === "ddp") {
    return [
      {
        key: "new",
        label: "Novo",
        description: "Inicie um mapeamento estruturado.",
        eyebrow: "novo mapeamento",
        title: "Criar mapeamento",
        body: "Abra o editor para preencher identificação, escopo, sistemas, fluxo, SIPOC, oportunidades de melhoria, próximos passos e glossário.",
      },
      {
        key: "consult",
        label: "Consultar",
        description: "Localize mapeamentos por processo, área ou status.",
        eyebrow: "consulta",
        title: "Mapeamentos cadastrados",
        body: "Acompanhe documentos salvos e responsáveis antes de abrir o editor completo.",
      },
      {
        key: "exports",
        label: "Exportações",
        description: "Gere HTML interativo e relatório Word.",
        eyebrow: "saídas oficiais",
        title: "Exportações do mapeamento",
        body: "O mapeamento mantém duas saídas distintas: apresentação HTML com zoom de imagens e relatório Word editável no padrão do modelo.",
      },
    ];
  }

  if (moduleId === "pop") {
    return [
      {
        key: "new",
        label: "Novo",
        description: "Crie uma documentação operacional.",
        eyebrow: "nova documentação",
        title: "Criar documentação",
        body: "Abra o editor para preencher objetivo, abrangência, responsabilidades, procedimento, registros e revisões.",
      },
      {
        key: "consult",
        label: "Consultar",
        description: "Encontre documentos por processo, área ou dono.",
        eyebrow: "consulta",
        title: "Documentações cadastradas",
        body: "Consulte documentos normativos salvos pela organização e abra o editor quando precisar atualizar uma versão.",
      },
      {
        key: "versions",
        label: "Versões",
        description: "Controle revisões publicadas.",
        eyebrow: "versionamento",
        title: "Histórico de versões da documentação",
        body: "Mantenha a rastreabilidade entre o POP, processo relacionado, responsável e arquivo Word gerado.",
      },
      {
        key: "exports",
        label: "Exportações",
        description: "Gere Word editável no padrão definido.",
        eyebrow: "saída oficial",
        title: "Exportação Word da documentação",
        body: "A saída Word deve usar o cabeçalho, estilos e organização visual da organização ativa.",
      },
    ];
  }

  return [
    {
      key: "new",
      label: "Novo",
      description: "Abra o modelador de fluxograma.",
      eyebrow: "novo fluxograma",
      title: "Criar fluxograma",
      body: "Modele raias, eventos, tarefas, gateways e conectores com comportamento visual próximo ao Bizagi.",
    },
    {
      key: "consult",
      label: "Consultar",
      description: "Localize diagramas por processo.",
      eyebrow: "consulta",
      title: "Fluxogramas cadastrados",
      body: "Encontre fluxos por processo, subprocesso, versão ou responsável e continue a modelagem no editor.",
    },
    {
      key: "library",
      label: "Biblioteca",
      description: "Consulte elementos e padrões para fluxos de atividades.",
      eyebrow: "biblioteca de fluxo",
      title: "Elementos e padrões de desenho",
      body: "Centralize padrões de eventos, atividades, gateways, artefatos e conectores utilizados pela organização.",
    },
    {
      key: "versions",
      label: "Versões",
      description: "Acompanhe revisões dos fluxos.",
      eyebrow: "versionamento",
      title: "Histórico de versões do fluxograma",
      body: "Cada fluxo deve manter vínculo com o processo e permitir comparação entre versões de desenho.",
    },
    {
      key: "exports",
      label: "Exportações",
      description: "Exporte XML, SVG ou imagem.",
      eyebrow: "saídas do desenho",
      title: "Exportações do fluxograma",
      body: "Gere arquivos compatíveis para documentação, revisão e publicação do processo.",
    },
  ];
}

function getModuleExportLabel(moduleId: AteliamModule) {
  if (moduleId === "ddp") return "HTML + Word";
  if (moduleId === "pop") return "Word";
  return "XML/SVG";
}

function getModuleDocuments(
  moduleId: AteliamModule,
  recentDocuments: Array<{
    id: string;
    name: string;
    module: string;
    current_version: number;
    updated_at: string;
  }>,
) {
  const source = recentDocuments.filter((document) => document.module === moduleId);
  const fallback =
    moduleId === "ddp"
      ? [
          {
            id: "ddp-demo-1",
            name: "MAP.PMO.007 - Gestão de Demandas de BI Analytics",
            module: "ddp",
            current_version: 14,
            updated_at: new Date().toISOString(),
          },
          {
            id: "ddp-demo-2",
            name: "MAP.PMO.006 - Controle de Acesso às Unidades",
            module: "ddp",
            current_version: 6,
            updated_at: new Date(Date.now() - 86400000 * 3).toISOString(),
          },
        ]
      : moduleId === "pop"
        ? [
            {
              id: "pop-demo-1",
              name: "POP.ADM.001 - Controle de Acesso às Unidades",
              module: "pop",
              current_version: 1,
              updated_at: new Date().toISOString(),
            },
          ]
        : [
            {
              id: "bpmn-demo-1",
              name: "FLX.PMO.007 - Fluxo de Demandas de BI Analytics",
              module: "bpmn",
              current_version: 3,
              updated_at: new Date().toISOString(),
            },
          ];

  return (source.length ? source : fallback).map((document, index) => ({
    ...document,
    process:
      moduleId === "bpmn"
        ? "Fluxo vinculado ao processo"
        : index === 0
          ? "Gestão de Demandas de BI Analytics"
          : "Controle de Acesso às Unidades",
    status:
      moduleId === "ddp"
        ? index === 0
          ? "Concluído"
          : "Em revisão"
        : index === 0
          ? "Versionado"
          : "Em revisão",
    owner: index === 0 ? "PMO / Processos" : "Dono do processo",
  }));
}

function getModuleFlow(moduleId: AteliamModule) {
  if (moduleId === "ddp") {
    return [
      "Criar ou abrir um mapeamento.",
      "Preencher dados do processo, sistemas, fluxo, SIPOC, oportunidades de melhoria e próximos passos.",
      "Salvar o preenchimento como registro de mapeamento.",
      "Exportar apresentação HTML e relatório Word no modelo oficial.",
    ];
  }

  if (moduleId === "pop") {
    return [
      "Criar ou abrir um POP existente.",
      "Preencher estrutura normativa, responsáveis, conteúdo e revisão.",
      "Salvar e versionar o procedimento.",
      "Exportar Word editável no padrão da organização.",
    ];
  }

  return [
    "Criar ou abrir um fluxograma.",
    "Modelar o processo como um fluxo de atividades.",
    "Versionar o desenho vinculado ao processo.",
    "Exportar XML/SVG/imagem para documentação.",
  ];
}

function SimplePanel({
  eyebrow,
  title,
  text,
  actions = [],
}: {
  eyebrow: string;
  title: string;
  text: string;
  actions?: { label: string; moduleId: AteliamModule }[];
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">{eyebrow}</div>
      <h1 className="mt-3 font-display text-3xl font-bold">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">{text}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        {actions.map((action) => (
          <Link
            key={`${action.moduleId}-${action.label}`}
            to="/m/$module"
            params={{ module: action.moduleId }}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </section>
  );
}
function DashboardMetric({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-3 flex items-center justify-between text-muted-foreground">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-[var(--accent)] text-[var(--gold)]">
          {icon}
        </span>
        <span className="text-[9px] uppercase tracking-[0.14em]">{label}</span>
      </div>
      <div className="font-data text-2xl font-bold text-foreground">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{detail}</div>
    </div>
  );
}

function DocumentTable({
  documents,
}: {
  documents: Array<{
    id: string;
    name: string;
    module: string;
    current_version: number;
    updated_at: string;
  }>;
}) {
  if (!documents.length) {
    return (
      <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
        Nenhum documento salvo ainda.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border">
      {documents.map((document) => (
        <div
          key={document.id}
          className="grid gap-3 border-b border-border bg-background/72 px-3 py-3 last:border-b-0 md:grid-cols-[80px_minmax(0,1fr)_120px_120px]"
        >
          <span className="w-fit rounded-md bg-accent px-2 py-1 text-[10px] font-bold uppercase text-[var(--gold)]">
            {document.module}
          </span>
          <span className="truncate text-sm font-semibold">{document.name}</span>
          <span className="text-xs text-muted-foreground">
            {document.module === "ddp" ? "" : `v${document.current_version}`}
          </span>
          <span className="text-xs text-muted-foreground">{formatDateBr(document.updated_at)}</span>
        </div>
      ))}
    </div>
  );
}

function RankingCard({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
        {title}
      </div>
      <div className="grid gap-3">
        {rows.length ? (
          rows.map((row) => (
            <div key={row.label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-[12px]">
                <span className="truncate font-medium text-foreground">{row.label}</span>
                <span className="font-data text-muted-foreground">{row.value}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className="h-full rounded-full bg-[var(--gold)]"
                  style={{ width: `${(row.value / max) * 100}%` }}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Cadastre processos para preencher este ranking.
          </div>
        )}
      </div>
    </div>
  );
}
