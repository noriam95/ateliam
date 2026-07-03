import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  Activity,
  AlertCircle,
  BarChart2,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
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
import {
  ModuleBranch as ModuleTreeGroup,
  TreeButton,
  TreeSection,
  WorkspaceRail,
} from "@/components/workspace-navigation";
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
type WorkspaceArea = "home" | "modules" | "value-chain" | "registrations" | "reports" | "settings";
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
  const [activeArea, setActiveArea] = useState<WorkspaceArea>(search.area ?? "home");
  const [view, setView] = useState<WorkspaceView>(
    (search.view as WorkspaceView | undefined) ?? "overview",
  );
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    organization: true,
    modules: true,
    ddp: false,
    pop: false,
    bpmn: false,
    causes: false,
    valueChain: true,
    registrations: false,
    processRegistrations: true,
    systemRegistrations: true,
    governance: true,
    settings: true,
  });
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
    if (area === "registrations") {
      setExpanded((current) => ({ ...current, registrations: true }));
      if (
        ![
          "areas",
          "roles",
          "access-profiles",
          "process-types",
          "systems",
          "owners",
          "owner-users",
          "processes",
          "causes",
        ].includes(view)
      ) {
        setView("processes");
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
          {activeArea !== "home" ? (
            <aside
              className={`sticky top-14 h-[calc(100vh-3.5rem)] self-start min-h-0 overflow-hidden border-r border-border bg-card/58 ${
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
                    ) : activeArea === "registrations" ? (
                      <Database className="h-4 w-4 text-foreground" />
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
                            : activeArea === "registrations"
                            ? "Cadastros"
                            : activeArea === "reports"
                              ? "Relatórios"
                              : "Configurações"}
                    </div>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3">
                  {activeArea === "modules" ? (
                    <div key="modules" className="grid gap-1 animate-[slideDown_0.18s_ease-out]">
                      <ModuleTreeGroup
                        title="Mapeamento"
                        icon={<FileText className="h-4 w-4" />}
                        active={isModuleView(view, "ddp")}
                        open={expanded.ddp}
                        onSelect={() => navigate({ to: "/m/$module", params: { module: "ddp" }, search: { view: "consult" } })}
                        onToggle={() => toggle("ddp")}
                      >
                        <TreeLink moduleId="ddp" targetView="new">
                          <Plus className="h-4 w-4" /> Novo
                        </TreeLink>
                        <TreeLink moduleId="ddp" targetView="consult">
                          <Search className="h-4 w-4" /> Consultar
                        </TreeLink>
                        <TreeSection
                          title="Causas"
                          icon={<FlaskConical className="h-4 w-4" />}
                          open={expanded.causes}
                          onToggle={() => toggle("causes")}
                        >
                          <TreeLink moduleId="ddp" targetView="cause-new">
                            <Plus className="h-4 w-4" /> Novo
                          </TreeLink>
                          <TreeLink moduleId="ddp" targetView="cause-consult">
                            <Search className="h-4 w-4" /> Consultar
                          </TreeLink>
                        </TreeSection>
                      </ModuleTreeGroup>

                      <ModuleTreeGroup
                        title="Documentação"
                        icon={<CheckCircle2 className="h-4 w-4" />}
                        active={isModuleView(view, "pop")}
                        open={expanded.pop}
                        onSelect={() => navigate({ to: "/m/$module", params: { module: "pop" }, search: { view: "consult" } })}
                        onToggle={() => toggle("pop")}
                      >
                        <TreeLink moduleId="pop" targetView="new">
                          <Plus className="h-4 w-4" /> Novo
                        </TreeLink>
                        <TreeLink moduleId="pop" targetView="consult">
                          <Search className="h-4 w-4" /> Consultar
                        </TreeLink>
                      </ModuleTreeGroup>

                      <ModuleTreeGroup
                        title="Fluxograma"
                        icon={<Workflow className="h-4 w-4" />}
                        active={isModuleView(view, "bpmn")}
                        open={expanded.bpmn}
                        onSelect={() => navigate({ to: "/m/$module", params: { module: "bpmn" }, search: { view: "consult" } })}
                        onToggle={() => toggle("bpmn")}
                      >
                        <TreeLink moduleId="bpmn" targetView="new">
                          <Plus className="h-4 w-4" /> Novo
                        </TreeLink>
                        <TreeLink moduleId="bpmn" targetView="consult">
                          <Search className="h-4 w-4" /> Consultar
                        </TreeLink>
                      </ModuleTreeGroup>

                      <ModuleTreeGroup
                        title="Cadastros"
                        icon={<Database className="h-4 w-4" />}
                        active={isRegistrationView(view)}
                        open={expanded.registrations}
                        onSelect={() => setView("processes")}
                        onToggle={() => toggle("registrations")}
                      >
                        <TreeButton
                          active={view === "processes"}
                          onClick={() => setView("processes")}
                        >
                          <GitBranch className="h-4 w-4" /> Processos
                        </TreeButton>
                        <TreeButton active={view === "areas"} onClick={() => setView("areas")}>
                          <Layers className="h-4 w-4" /> Áreas
                        </TreeButton>
                        <TreeButton active={view === "owners"} onClick={() => setView("owners")}>
                          <Users className="h-4 w-4" /> Donos de Processo
                        </TreeButton>
                        <TreeButton
                          active={view === "owner-users"}
                          onClick={() => setView("owner-users")}
                        >
                          <Link2 className="h-4 w-4" /> Vínculo Dono × Usuário
                        </TreeButton>
                        <TreeButton active={view === "systems"} onClick={() => setView("systems")}>
                          <Database className="h-4 w-4" /> Sistemas
                        </TreeButton>
                        <TreeButton
                          active={view === "process-types"}
                          onClick={() => setView("process-types")}
                        >
                          <ListChecks className="h-4 w-4" /> Categorias de Processo
                        </TreeButton>
                      </ModuleTreeGroup>
                    </div>
                  ) : null}

                  {activeArea === "value-chain" ? (
                    <div key="value-chain" className="grid gap-1 animate-[slideDown_0.18s_ease-out]">
                      <TreeButton
                        active={view === "value-chain-report"}
                        onClick={() => setView("value-chain-report")}
                      >
                        <Network className="h-4 w-4" /> Relatório
                      </TreeButton>
                      <TreeButton
                        active={view === "value-chains"}
                        onClick={() => setView("value-chains")}
                      >
                        <Database className="h-4 w-4" /> Cadastro
                      </TreeButton>
                    </div>
                  ) : null}

                  {activeArea === "registrations" ? (
                    <div key="registrations" className="grid gap-1 animate-[slideDown_0.18s_ease-out]">
                      <TreeButton
                        active={view === "processes"}
                        onClick={() => setView("processes")}
                      >
                        <GitBranch className="h-4 w-4" /> Processos
                      </TreeButton>
                      <TreeButton active={view === "areas"} onClick={() => setView("areas")}>
                        <Layers className="h-4 w-4" /> Áreas
                      </TreeButton>
                      <TreeButton active={view === "owners"} onClick={() => setView("owners")}>
                        <Users className="h-4 w-4" /> Donos de Processo
                      </TreeButton>
                      <TreeButton
                        active={view === "owner-users"}
                        onClick={() => setView("owner-users")}
                      >
                        <Link2 className="h-4 w-4" /> Vínculo Dono × Usuário
                      </TreeButton>
                      <TreeButton active={view === "systems"} onClick={() => setView("systems")}>
                        <Database className="h-4 w-4" /> Sistemas
                      </TreeButton>
                      <TreeButton
                        active={view === "process-types"}
                        onClick={() => setView("process-types")}
                      >
                        <ListChecks className="h-4 w-4" /> Categorias de Processo
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
              topDepartments={dashboard?.topDepartments ?? []}
              topOwners={dashboard?.topOwners ?? []}
              recentDocuments={dashboard?.recentDocuments ?? []}
              recentProcesses={dashboard?.recentProcesses ?? []}
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
        <div className="flex items-center justify-between">
          <span className={titleClassName}>{title}</span>
          <div className="flex items-center gap-1.5">
            {icon}
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

function WorkspaceContent({
  view,
  organizationName,
  organizationId,
  organizationSlug,
  codeSettings,
  totals,
  topDepartments,
  topOwners,
  recentDocuments,
  recentProcesses,
  isLoading,
  isDemo,
}: {
  view: WorkspaceView;
  organizationName: string;
  organizationId: string | null;
  organizationSlug: string | null;
  codeSettings: CodeSettings | null;
  totals: DashboardTotals | undefined;
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
  const reviewProcesses = totals?.reviewProcesses ?? 0;
  const ddpCount = totals?.ddps ?? 0;
  const popCount = totals?.pops ?? 0;
  const coveragePct = totalProcesses > 0 ? Math.round(((activeProcesses) / totalProcesses) * 100) : 0;
  const ddpCoverage = totalProcesses > 0 ? Math.round((ddpCount / totalProcesses) * 100) : 0;

  return (
    <div className="mx-auto grid w-full max-w-[1600px] gap-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--gold)]">
            Página Inicial
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Atualização do Painel:
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

      {/* Top Cards */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* Card 2: Índice de Mapeamento Operacional */}
        <ExpandableCard
          title="Índice de Mapeamento Operacional"
          icon={<Activity className="h-4 w-4 shrink-0 text-[var(--gold)]" />}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
          expanded={<ProcessRecordsTable isDemo={isDemo} />}
        >
          <div className="grid gap-2">
            <div className="grid gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Processos com Mapeamento</span>
                <span className="font-semibold text-foreground">{ddpCount}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[var(--gold)] transition-all"
                  style={{ width: `${ddpCoverage}%` }}
                />
              </div>
            </div>
            <div className="grid gap-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">Processos com Documentação</span>
                <span className="font-semibold text-foreground">{popCount}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-[var(--gold)]/60 transition-all"
                  style={{ width: `${totalProcesses > 0 ? Math.round((popCount / totalProcesses) * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
          <div className="mt-auto border-t border-border pt-2">
            <span className="font-data text-xl font-bold text-[var(--gold)]">{coveragePct}%</span>
            <span className="ml-2 text-xs text-muted-foreground">Cobertura de Processos</span>
            <div className="text-[11px] text-muted-foreground">{activeProcesses} de {totalProcesses} Processos</div>
          </div>
        </ExpandableCard>

        {/* Card 3: Mapeamentos Pendentes */}
        <ExpandableCard
          title="Mapeamentos Pendentes"
          icon={<FileText className="h-4 w-4 shrink-0 text-[var(--gold)]" />}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
          expanded={<ProcessRecordsTable isDemo={isDemo} />}
        >
          <div className="mt-auto grid grid-cols-2 gap-3">
            <div className="rounded-md bg-accent p-3 text-center">
              <div className="font-data text-3xl font-bold text-[var(--gold)]">{Math.max(0, totalProcesses - ddpCount)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground leading-tight">Mapeamentos em Atraso</div>
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-center">
              <div className="font-data text-3xl font-bold text-foreground">{ddpCount}</div>
              <div className="mt-1 text-[11px] text-muted-foreground leading-tight">Mapeamentos Salvos</div>
            </div>
          </div>
        </ExpandableCard>

        {/* Card 4: Processos & Documentos em Revisão */}
        <ExpandableCard
          title="Processos & Documentos em Revisão"
          icon={<AlertCircle className="h-4 w-4 shrink-0 text-[var(--gold)]" />}
          className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm"
          expanded={<ProcessRecordsTable isDemo={isDemo} filter={(p) => p.status === "Em revisão"} />}
        >
          <div className="mt-auto grid grid-cols-2 gap-3">
            <div className="rounded-md bg-accent p-3 text-center">
              <div className="font-data text-3xl font-bold text-[var(--gold)]">{reviewProcesses}</div>
              <div className="mt-1 text-[11px] text-muted-foreground leading-tight">Processos em Revisão</div>
            </div>
            <div className="rounded-md bg-muted/40 p-3 text-center">
              <div className="font-data text-3xl font-bold text-foreground">{Math.max(0, popCount - activeProcesses < 0 ? 0 : popCount)}</div>
              <div className="mt-1 text-[11px] text-muted-foreground leading-tight">Documentos em Revisão</div>
            </div>
          </div>
        </ExpandableCard>
      </section>

      {/* Bottom: Catálogo e Conformidade + Painel de Atividade Recente */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Catálogo e Conformidade */}
        <ExpandableCard
          title="Catálogo e Conformidade"
          icon={<CheckCircle2 className="h-4 w-4 text-[var(--gold)]" />}
          titleClassName="text-sm font-semibold text-foreground"
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
        >
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {/* Controle de Documentos */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Controle de Documentos
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-[10px] text-muted-foreground">
                    <th className="pb-1.5 text-left font-semibold">Tipo</th>
                    <th className="pb-1.5 text-right font-semibold">Status</th>
                    <th className="pb-1.5 text-right font-semibold">Conformidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {[
                    { tipo: "Normas", count: totals?.departments ?? 0 },
                    { tipo: "POPs", count: popCount },
                    { tipo: "Mapeamentos", count: ddpCount },
                  ].map((row) => (
                    <tr key={row.tipo}>
                      <td className="py-1.5 font-medium text-foreground">{row.tipo}</td>
                      <td className="py-1.5 text-right font-data text-foreground">{row.count}</td>
                      <td className="py-1.5 text-right">
                        <span className="inline-flex rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-[var(--gold)]">
                          {row.count > 0 ? "Ativo" : "—"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Aderência de Donos */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Aderência de Donos de Processo
              </div>
              {topOwners.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Sem donos cadastrados.</div>
              ) : (
                <div className="grid gap-1.5">
                  {topOwners.slice(0, 5).map((owner) => (
                    <div key={owner.label} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-xs text-foreground">{owner.label}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-[var(--gold)]"
                            style={{ width: `${Math.min(100, (owner.value / Math.max(1, topOwners[0].value)) * 100)}%` }}
                          />
                        </div>
                        <span className="w-6 text-right text-[10px] font-data font-semibold text-[var(--gold)]">{owner.value}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cobertura por área */}
          <div className="mt-4 border-t border-border pt-4">
            <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Cobertura por Área
            </div>
            <div className="grid gap-1.5">
              {topDepartments.slice(0, 4).map((dept, i) => {
                const maxVal = Math.max(1, topDepartments[0]?.value ?? 1);
                return (
                  <div key={dept.label} className="flex items-center gap-2">
                    <span className="w-4 text-[10px] font-data font-bold text-[var(--gold)]">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-foreground">{dept.label}</span>
                    <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted shrink-0">
                      <div
                        className="h-full rounded-full bg-[var(--gold)]/70"
                        style={{ width: `${(dept.value / maxVal) * 100}%` }}
                      />
                    </div>
                    <span className="w-5 text-right text-[10px] font-data text-muted-foreground">{dept.value}</span>
                  </div>
                );
              })}
              {topDepartments.length === 0 && (
                <div className="py-3 text-center text-xs text-muted-foreground">Sem áreas cadastradas.</div>
              )}
            </div>
          </div>
        </ExpandableCard>

        {/* Painel de Atividade Recente */}
        <ExpandableCard
          title="Painel de Atividade Recente"
          icon={<Activity className="h-4 w-4 text-[var(--gold)]" />}
          titleClassName="text-sm font-semibold text-foreground"
          className="rounded-lg border border-border bg-card p-5 shadow-sm"
        >
          <div className="mt-4 grid gap-5 sm:grid-cols-2">
            {/* Últimas atualizações de processos */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Últimas 3 Atualizações de Processos
              </div>
              {recentProcesses.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Sem atividade recente.</div>
              ) : (
                <div className="grid gap-2">
                  {recentProcesses.slice(0, 3).map((proc) => (
                    <div key={proc.id} className="rounded-md border border-border bg-background/50 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-foreground">{proc.name}</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">{proc.owner ?? "—"}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[10px] font-data text-muted-foreground">v{proc.current_version}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(proc.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Últimos documentos emitidos */}
            <div>
              <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Últimos 3 Documentos Emitidos
              </div>
              {recentDocuments.length === 0 ? (
                <div className="py-4 text-center text-xs text-muted-foreground">Sem documentos recentes.</div>
              ) : (
                <div className="grid gap-2">
                  {recentDocuments.slice(0, 3).map((doc) => (
                    <div key={doc.id} className="rounded-md border border-border bg-background/50 p-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="truncate text-xs font-semibold text-foreground">{doc.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <span className="inline-flex rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase text-[var(--gold)]">
                              {doc.module?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[10px] font-data text-muted-foreground">v{doc.current_version}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {new Date(doc.updated_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
  const latestVersion = Math.max(...moduleDocs.map((document) => document.current_version));

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

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <ModuleStat label="Documentos" value={moduleDocs.length} detail="na organização" />
          <ModuleStat label="Última versão" value={`v${latestVersion}`} detail="disponível" />
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
                  <th className="px-3 py-3 font-semibold">Versão</th>
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
                    <td className="px-3 py-3 font-data text-muted-foreground">
                      v{document.current_version}
                    </td>
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
        body: "Acompanhe documentos salvos, responsáveis e versões atuais antes de abrir o editor completo.",
      },
      {
        key: "versions",
        label: "Versões",
        description: "Veja o histórico de versões dos mapeamentos.",
        eyebrow: "versionamento",
        title: "Histórico de versões do mapeamento",
        body: "Cada versão deve preservar o vínculo com processo, macroprocesso, subprocesso, causas e exportações geradas.",
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
    status: index === 0 ? "Versionado" : "Em revisão",
    owner: index === 0 ? "PMO / Processos" : "Dono do processo",
  }));
}

function getModuleFlow(moduleId: AteliamModule) {
  if (moduleId === "ddp") {
    return [
      "Criar ou abrir um mapeamento.",
      "Preencher dados do processo, sistemas, fluxo, SIPOC, causas e próximos passos.",
      "Salvar uma nova versão no sistema.",
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

function TreeLink({
  moduleId,
  targetView,
  children,
}: {
  moduleId: AteliamModule;
  targetView: "new" | "consult" | "cause-new" | "cause-consult";
  children: ReactNode;
}) {
  // Navegação client-side (Link do router) em vez de <a href>: um <a> força
  // reload completo da página, descartando o estado em memória e recarregando
  // a última versão salva ("voltar para versão antiga"). O Link preserva o estado.
  return (
    <Link
      to="/m/$module"
      params={{ module: moduleId }}
      search={{ view: targetView }}
      className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground animate-in slide-in-from-left-2 fade-in duration-150 [&_svg]:shrink-0 [&_svg]:text-[var(--gold)]"
    >
      {children}
    </Link>
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
          <span className="text-xs text-muted-foreground">v{document.current_version}</span>
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

