import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  BarChart2,
  Building2,
  CheckCircle2,
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
  Menu,
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
import { TreeButton, WorkspaceModulesTree, WorkspaceRail } from "@/components/workspace-navigation";
import { WorkspaceSystemSettings } from "@/components/workspace-system-settings";
import {
  WorkspaceProcessRegistrations,
  type ProcessRegistrationView,
  DEMO_REGISTRY,
} from "@/components/workspace-process-registrations";
import { WorkspaceReports } from "@/components/workspace-reports";
import { endDemoSession, isDemoSessionActive } from "@/lib/demo-session";
import { getOrganizationDashboard, listAccessibleOrganizations } from "@/lib/config.functions";
import { MODULES, type AteliamModule } from "@/lib/workspace-bridge";
import type { CodeSettings } from "@/lib/code-generation";

export const Route = createFileRoute("/_authenticated/")({
  component: WorkspaceHome,
  validateSearch: (search: Record<string, unknown>) => ({
    area:
      search.area === "reports"
        ? "value-chain"
        : search.area === "registrations"
          ? "modules"
        : search.area === "modules" ||
          search.area === "value-chain" ||
          search.area === "settings"
          ? search.area
          : undefined,
    view: typeof search.view === "string" ? search.view : undefined,
  }),
});

type WorkspaceView =
  | "overview"
  | "organizations"
  | "documents"
  | "processes"
  | "value-chains"
  | "process-types"
  | "areas"
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
  | "visual-identity"
  | "integrations"
  | "version-history"
  | "value-chain-report"
  | `module:${AteliamModule}:${ModuleTask}`
  | `module:${AteliamModule}`;

type ModuleTask = "home" | "consult" | "cause-new" | "cause-consult" | "cause-edit" | "library";
type WorkspaceArea = "home" | "modules" | "value-chain" | "reports" | "settings";
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

const DASHBOARD_CARD_CLASS =
  "rounded-lg border border-border bg-card p-5 shadow-sm ring-1 ring-transparent transition-shadow hover:shadow-md";
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
  return [
    "processes",
    "areas",
    "owners",
    "owner-users",
    "systems",
    "process-types",
  ].includes(view);
}

function WorkspaceHome() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [isDemo] = useState(() => isDemoSessionActive());
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
        slug: "ateliam-lab",
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
  const [treeOpen, setTreeOpen] = useState(!!search.area);
  // Em telas pequenas o painel de navegação começa recolhido (vira gaveta).
  useEffect(() => {
    if (window.matchMedia("(max-width: 1023px)").matches) setTreeOpen(false);
  }, []);
  const [activeArea, setActiveArea] = useState<WorkspaceArea>(search.area ?? "home");
  const [view, setView] = useState<WorkspaceView>(
    (search.view as WorkspaceView | undefined) ?? "overview",
  );
  const initialView = (search.view as WorkspaceView | undefined) ?? "overview";
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
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
  });

  // Mant?m o estado em sincronia com a URL quando ela muda com o componente j?
  // montado (voltar/avan?ar do navegador, links de outras telas para "/?area=...").
  useEffect(() => {
    const nextArea = (search.area ?? "home") as WorkspaceArea;
    const nextView = (search.view as WorkspaceView | undefined) ?? "overview";
    const isRegistration = isRegistrationView(nextView);
    setActiveArea(nextArea);
    setView(nextView);
    setTreeOpen(!!search.area && !window.matchMedia("(max-width: 1023px)").matches);
    setExpanded((current) => ({
      ...current,
      modules: current.modules || nextArea === "modules",
      registrations: isRegistration,
      valueChain: current.valueChain || nextArea === "value-chain",
      settings: current.settings || nextArea === "settings",
    }));
  }, [search.area, search.view]);
  const dashboardFn = useServerFn(getOrganizationDashboard);
  const accessibleOrganizationsFn = useServerFn(listAccessibleOrganizations);
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
    if (isDemo) {
      endDemoSession();
      navigate({ to: "/auth", replace: true });
      return;
    }

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
      setView("overview");
      setTreeOpen(false);
      return;
    }
    setTreeOpen(true);
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
  return (
    <div className="min-h-screen bg-background text-foreground" style={workspaceGrayVars}>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-border bg-background/92 px-4 backdrop-blur-xl">
        {activeArea === "home" ? (
          <div className="h-9 w-9" aria-hidden="true" />
        ) : (
          <button
            type="button"
            onClick={() => setTreeOpen((current) => !current)}
            className="grid h-9 w-9 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title={treeOpen ? "Ocultar navegação" : "Mostrar navegação"}
          >
            <Menu className="h-4 w-4" />
          </button>
        )}

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

        <UserProfileMenu
          email={email}
          organizationName={organizationName}
          isDemo={isDemo}
          onSignOut={signOut}
        />
      </header>

      <div className="grid min-h-[calc(100vh-3.5rem)] grid-cols-[52px_minmax(0,1fr)]">
        <WorkspaceRail activeArea={activeArea} onSelect={selectArea} />

        <div
          className={`grid min-w-0 transition-[grid-template-columns] duration-200 ${
            activeArea === "home"
              ? "lg:grid-cols-[minmax(0,1fr)]"
              : treeOpen
                ? "lg:grid-cols-[320px_minmax(0,1fr)]"
                : "lg:grid-cols-[0_minmax(0,1fr)]"
          }`}
        >
          {activeArea !== "home" && treeOpen ? (
            <button
              type="button"
              aria-label="Fechar navegação"
              onClick={() => setTreeOpen(false)}
              className="fixed bottom-0 left-[372px] right-0 top-14 z-30 bg-foreground/10 backdrop-blur-[1px] lg:hidden"
            />
          ) : null}
          {activeArea !== "home" ? (
            <aside
              className={`fixed bottom-0 left-[52px] top-14 z-30 min-h-0 w-[min(320px,calc(100vw-52px))] overflow-hidden border-r border-border bg-card shadow-xl lg:sticky lg:top-14 lg:bottom-auto lg:z-auto lg:h-[calc(100vh-3.5rem)] lg:w-auto lg:self-start lg:bg-card/58 lg:shadow-none ${
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
                    {activeArea === "home" ? (
                      <Building2 className="h-4 w-4 text-foreground" />
                    ) : activeArea === "modules" ? (
                      <GitBranch className="h-4 w-4 text-foreground" />
                    ) : activeArea === "value-chain" ? (
                      <Network className="h-4 w-4 text-foreground" />
                    ) : activeArea === "reports" ? (
                      <BarChart2 className="h-4 w-4 text-foreground" />
                    ) : (
                      <Settings className="h-4 w-4 text-foreground" />
                    )}
                    <div className="truncate font-display text-base font-bold">
                      {activeArea === "home"
                        ? organizationName
                        : activeArea === "modules"
                          ? "Processos"
                          : activeArea === "value-chain"
                            ? "Cadeia de Valor"
                            : activeArea === "reports"
                              ? "Relatórios"
                              : "Configurações"}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {activeArea === "modules" ? (
                    <WorkspaceModulesTree
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
                          setView(target.view);
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
                      <TreeButton active={view === "users"} onClick={() => setView("users")}>
                        <Users className="h-4 w-4" /> Usuários
                      </TreeButton>
                      <TreeButton
                        active={view === "organizations"}
                        onClick={() => setView("organizations")}
                      >
                        <Building2 className="h-4 w-4" /> Organizações
                      </TreeButton>
                    </div>
                  ) : null}
                </div>
              </div>
            </aside>
          ) : null}

          <main className={`min-w-0 ${activeArea === "home" ? "p-5 lg:p-7" : "p-5"}`}>
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
              documentCatalogRows={
                (dashboard?.documentCatalogRows ?? []) as DashboardDocumentCatalogRow[]
              }
              topDepartments={dashboard?.topDepartments ?? []}
              topOwners={dashboard?.topOwners ?? []}
              recentDocuments={dashboard?.recentDocuments ?? []}
              recentProcesses={dashboard?.recentProcesses ?? []}
              mappingCoverage={dashboard?.mappingCoverage ?? { covered: 0, total: 0, rows: [] }}
              isLoading={dashboardQ.isLoading && !isDemo}
              isDemo={isDemo}
            />
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
}: {
  title: string;
  icon?: ReactNode;
  className?: string;
  titleClassName?: string;
  children: ReactNode;
  // Conteúdo detalhado (tabela) mostrado quando o card é aberto em tela cheia.
  expanded?: ReactNode;
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
              onClick={() => setOpen(false)}
            >
              <div
                className="mx-auto flex h-full w-full max-w-7xl flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between border-b border-border px-5 py-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    {icon}
                    {title}
                  </span>
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
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-data text-3xl font-bold leading-none" style={{ color }}>
            {value}
          </div>
          <div className="mt-1 text-[11px] font-medium leading-tight text-muted-foreground">
            {label}
          </div>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            backgroundColor: `color-mix(in oklab, ${color} 14%, var(--card))`,
            color,
          }}
        >
          {pct}%
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
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
}: {
  covered: number;
  total: number;
  size?: number;
  stroke?: number;
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
            stroke="var(--gold)"
            strokeWidth={stroke}
            strokeDasharray={`${filled} ${circ - filled}`}
            strokeLinecap="round"
          />
        ) : null}
      </g>
      <text
        x="50%"
        y="47%"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: "var(--foreground)", fontSize: size * 0.24, fontWeight: 700 }}
      >
        {Math.round(pct * 100)}%
      </text>
      <text
        x="50%"
        y="64%"
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fill: "var(--muted-foreground)",
          fontSize: size * 0.1,
          letterSpacing: "0.12em",
        }}
      >
        COBERTURA
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
            {coverage.covered} de {coverage.total} processos com pelo menos um mapeamento cadastrado.
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

function SortGlyph({
  active,
  dir,
}: {
  active: boolean;
  dir: DashboardSortDir;
}) {
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
          ? { bg: "color-mix(in oklab, var(--gold) 15%, var(--card))", fg: "var(--gold)", border: "color-mix(in oklab, var(--gold) 35%, var(--border))" }
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
  "code" | "name" | "process" | "modalidade" | "area" | "owner" | "responsible" | "status" | "updatedAt"
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
  return String(a[field] ?? "").localeCompare(String(b[field] ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  }) * sign;
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
            String(row[field] ?? "").toLowerCase().includes(normalized),
          ),
        )
      : rows;
    return [...filtered].sort((a, b) => compareMappingValues(a, b, sortField, sortDir));
  }, [query, rows, sortDir, sortField]);

  return (
    <div className="grid gap-3">
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
                      new Date(row.updatedAt).toLocaleString("pt-BR")
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
    .slice(0, 4);
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
    <div className="min-h-[118px] rounded-lg border border-border bg-background p-3">
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
              className="grid min-w-0 grid-cols-[1rem_minmax(6rem,1fr)_4.5rem_1.25rem] items-center gap-2"
            >
              <span className="text-[10px] font-data font-bold text-[var(--gold)]">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-foreground">{area.label}</span>
              <div className="h-1.5 w-full min-w-0 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[var(--gold)]/80"
                  style={{ width: `${Math.max(10, (area.value / maxValue) * 100)}%` }}
                />
              </div>
              <span className="text-right text-[10px] font-data text-muted-foreground">
                {area.value}
              </span>
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
  return String(a[field] ?? "").localeCompare(String(b[field] ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  }) * sign;
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
        String(row[field] ?? "").toLowerCase().includes(normalized),
      );
    });
    return [...filtered].sort((a, b) => compareDocumentCatalogRows(a, b, sortField, sortDir));
  }, [activeType, query, rows, sortDir, sortField]);

  return (
    <div className="grid gap-4">
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
                      new Date(row.updatedAt).toLocaleString("pt-BR")
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
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
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
  documentCatalogRows,
  topDepartments,
  topOwners,
  recentDocuments,
  recentProcesses,
  mappingCoverage,
  isLoading,
  isDemo,
}: {
  view: WorkspaceView;
  organizationName: string;
  organizationId: string | null;
  organizationSlug: string | null;
  codeSettings: CodeSettings | null;
  totals: DashboardTotals | undefined;
  mappingRows: DashboardMappingRow[];
  mappingStatusCounts: DashboardMappingStatusCounts;
  documentCatalogRows: DashboardDocumentCatalogRow[];
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
  mappingCoverage: MappingCoverage;
  isLoading: boolean;
  isDemo: boolean;
}) {
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
            Consulte mapeamentos, documentações, fluxogramas e versões salvas.
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

  if (view === "users" || view === "organizations" || view === "document-models") {
    return (
      <WorkspaceSystemSettings
        view={view === "document-models" ? "organizations" : view}
        isDemo={isDemo}
        organizationName={organizationName}
        organizationId={organizationId}
      />
    );
  }

  if (view === "value-chain-report") {
    return <WorkspaceReports view={view} organizationId={organizationId} isDemo={isDemo} />;
  }

  if (
    view === "value-chains" ||
    view === "processes" ||
    view === "areas" ||
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

  const totalProcesses = totals?.processes ?? 0;
  const activeProcesses = totals?.activeProcesses ?? 0;
  const ddpCount = totals?.ddps ?? 0;
  const popCount = totals?.pops ?? 0;
  const coveragePct = totalProcesses > 0 ? Math.round(((activeProcesses) / totalProcesses) * 100) : 0;
  const ddpCoverage = totalProcesses > 0 ? Math.round((ddpCount / totalProcesses) * 100) : 0;
  const recentActivityItems: RecentActivityItem[] = [
    ...recentProcesses.map((proc) => ({
      id: `process-${proc.id}`,
      title: proc.name,
      subtitle: proc.owner ?? "-",
      tag: "Processo",
      // Processos não são versionados.
      version: null,
      updatedAt: proc.updated_at,
    })),
    ...recentDocuments.map((doc) => ({
      id: `document-${doc.id}`,
      title: doc.name,
      subtitle: "Documento emitido",
      tag: documentActivityTag(doc.module, doc.name),
      // Mapeamentos (ddp) não são versionados; demais documentos mantêm versão.
      version: doc.module === "ddp" ? null : `v${doc.current_version}`,
      updatedAt: doc.updated_at,
    })),
  ]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6);

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-5">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">
              Página Inicial
            </div>
            <h1 className="mt-2 font-display text-2xl font-bold text-foreground">
              Visão operacional
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Acompanhe mapeamentos, cobertura de processos, catálogo documental e atividades recentes.
            </p>
          </div>
          <div className="rounded-lg border border-border bg-background px-4 py-3 text-right">
            <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              Atualização do Painel
            </div>
            <div className="mt-0.5 text-sm font-semibold text-foreground">
              {new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
            </div>
            {isLoading ? (
              <span className="mt-1 inline-flex rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                Atualizando...
              </span>
            ) : null}
          </div>
        </div>
      </section>

      {/* Top Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Card 2: Índice de Mapeamento (cobertura de processos com mapeamento) */}
        <ExpandableCard
          title="Índice de Mapeamento"
          icon={<Activity className="h-4 w-4 shrink-0 text-[var(--gold)]" />}
          className={`${DASHBOARD_CARD_CLASS} flex min-h-[230px] flex-col gap-4`}
          expanded={<MappingCoverageExpanded coverage={mappingCoverage} />}
        >
          <div className="flex items-center gap-4">
            <CoverageDonut covered={mappingCoverage.covered} total={mappingCoverage.total} />
            <div className="grid flex-1 gap-2 text-[11px]">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-[var(--gold)]" />
                <span className="text-muted-foreground">Com mapeamento</span>
                <span className="ml-auto font-semibold text-foreground">
                  {mappingCoverage.covered}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted" />
                <span className="text-muted-foreground">Sem mapeamento</span>
                <span className="ml-auto font-semibold text-foreground">
                  {Math.max(0, mappingCoverage.total - mappingCoverage.covered)}
                </span>
              </div>
            </div>
          </div>
          <div className="mt-auto border-t border-border pt-2 text-[11px] text-muted-foreground">
            {mappingCoverage.covered} de {mappingCoverage.total} processos com mapeamento
          </div>
        </ExpandableCard>

        {/* Card 3: Acompanhamento de Mapeamentos */}
        <ExpandableCard
          title="Acompanhamento de Mapeamentos"
          icon={<FileText className="h-4 w-4 shrink-0 text-[var(--gold)]" />}
          className={`${DASHBOARD_CARD_CLASS} flex min-h-[230px] flex-col gap-4 xl:col-span-2`}
          expanded={<MappingRecordsTable rows={mappingRows} />}
        >
          <div className="mt-auto grid grid-cols-2 gap-3 lg:grid-cols-4">
            {MAPPING_STATUS_TILES.map((tile) => (
              <StatusSummaryTile
                key={tile.key}
                label={tile.label}
                value={mappingStatusCounts[tile.key]}
                total={mappingRows.length}
                color={tile.color}
              />
            ))}
          </div>
        </ExpandableCard>

      </section>

      {/* Bottom: Catálogo e Conformidade + Painel de Atividade Recente */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Catálogo e Conformidade */}
        <ExpandableCard
          title="Catálogo e Conformidade"
          icon={<FileCheck2 className="h-4 w-4 text-[var(--gold)]" />}
          titleClassName="text-sm font-semibold text-foreground"
          className={DASHBOARD_CARD_CLASS}
          expanded={<DocumentCatalogExpanded rows={documentCatalogRows} />}
        >
          <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.35fr)]">
            {/* Controle de Documentos */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Controle de Documentos
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] text-muted-foreground">
                    <th className="pb-1.5 text-left font-semibold">Tipo</th>
                    <th className="pb-1.5 text-right font-semibold">Qtd.</th>
                    <th className="pb-1.5 text-right font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {DOCUMENT_CATALOG_TYPES.map((type) => {
                    const count = documentTypeCount(documentCatalogRows, type);
                    return (
                      <tr key={type}>
                        <td className="py-1.5 font-medium text-foreground">{type}</td>
                        <td className="py-1.5 text-right font-data text-foreground">{count}</td>
                        <td className="py-1.5 text-right">
                          <StatusBadge status={count > 0 ? "Ativo" : "-"} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Quadrantes por tipo de documento */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Documentos por Área
              </div>
              <div className="grid gap-3 xl:grid-cols-2">
                {DOCUMENT_CATALOG_TYPES.map((type, index) => (
                  <div
                    key={type}
                    className={
                      DOCUMENT_CATALOG_TYPES.length % 2 === 1 &&
                      index === DOCUMENT_CATALOG_TYPES.length - 1
                        ? "sm:col-span-2"
                        : undefined
                    }
                  >
                    <DocumentTypeQuadrant type={type} rows={documentCatalogRows} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </ExpandableCard>

        {/* Painel de Atividade Recente */}
        <ExpandableCard
          title="Painel de Atividade Recente"
          icon={<Activity className="h-4 w-4 text-[var(--gold)]" />}
          titleClassName="text-sm font-semibold text-foreground"
          className={DASHBOARD_CARD_CLASS}
        >
          <div className="mt-4">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Últimas atividades
            </div>
            {recentActivityItems.length === 0 ? (
              <div className="py-4 text-center text-xs text-muted-foreground">Sem atividade recente.</div>
            ) : (
              <div className="grid gap-2">
                {recentActivityItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-border bg-background p-3 transition hover:border-[color-mix(in_oklab,var(--gold)_45%,var(--border))] hover:bg-[color-mix(in_oklab,var(--gold)_5%,var(--background))]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex rounded-full bg-[color-mix(in_oklab,var(--gold)_12%,var(--card))] px-2 py-0.5 text-[10px] font-semibold text-[var(--gold)]">
                            {item.tag}
                          </span>
                          <div className="min-w-0 truncate text-xs font-semibold text-foreground">
                            {item.title}
                          </div>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">{item.subtitle}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        {item.version ? (
                          <div className="text-[10px] font-data text-muted-foreground">
                            {item.version}
                          </div>
                        ) : null}
                        <div className="text-[10px] text-muted-foreground">
                          {formatShortDate(item.updatedAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ExpandableCard>
      </section>
    </div>
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
      title: "Gestão de causas",
      text: "Consulte causas cadastradas nos mapeamentos, acompanhe status, responsável, comentários e vínculos com processos.",
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
      title: "Sistemas envolvidos",
      text: "Cadastre sistemas para reutilizar nos mapeamentos e manter consistência entre processos.",
      metrics: [
        ...baseMetrics.slice(0, 2),
        {
          icon: <Database className="h-4 w-4" />,
          label: "Sistemas",
          value: 0,
          detail: "base local",
        },
      ],
    };
  }

  return {
    title: "Catálogo de processos",
    text: "Centralize macroprocessos, subprocessos, áreas, responsáveis, causas e sistemas.",
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
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              <span>workspace</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
              <span>módulos</span>
              <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
              <span>{module.glyph}</span>
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
                      {new Date(document.updated_at).toLocaleDateString("pt-BR")}
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
        body: "Abra o editor para preencher identificação, escopo, sistemas, fluxo, SIPOC, causas, próximos passos e glossário.",
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
      "Preencher dados do processo, sistemas, fluxo, SIPOC, causas e próximos passos.",
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
          <span className="text-xs text-muted-foreground">
            {new Date(document.updated_at).toLocaleDateString("pt-BR")}
          </span>
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
