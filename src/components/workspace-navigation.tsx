import type { ReactNode } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  Home,
  Layers,
  Link2,
  ListChecks,
  Network,
  Plus,
  Search,
  Settings,
  Users,
  Workflow,
} from "lucide-react";

export type WorkspaceRailArea =
  | "home"
  | "modules"
  | "value-chain"
  | "reports"
  | "settings";

export function WorkspaceRail({
  activeArea,
  onSelect,
}: {
  activeArea: WorkspaceRailArea;
  onSelect: (area: WorkspaceRailArea) => void;
}) {
  return (
    <nav className="sticky top-14 flex h-[calc(100vh-3.5rem)] flex-col border-r border-border bg-card/70 py-3">
      <WorkspaceRailButton
        active={activeArea === "home"}
        label="Início"
        onClick={() => onSelect("home")}
      >
        <Home className="h-4 w-4" />
      </WorkspaceRailButton>
      <WorkspaceRailButton
        active={activeArea === "modules"}
        label="Processos"
        onClick={() => onSelect("modules")}
      >
        <GitBranch className="h-4 w-4" />
      </WorkspaceRailButton>
      <WorkspaceRailButton
        active={activeArea === "value-chain"}
        label="Cadeia de Valor"
        onClick={() => onSelect("value-chain")}
      >
        <Network className="h-4 w-4" />
      </WorkspaceRailButton>
      <div className="flex-1" />
      <WorkspaceRailButton
        active={activeArea === "settings"}
        label="Configurações"
        onClick={() => onSelect("settings")}
      >
        <Settings className="h-4 w-4" />
      </WorkspaceRailButton>
    </nav>
  );
}

function WorkspaceRailButton({
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
      aria-label={label}
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

// Building blocks compartilhados da árvore de navegação (usados tanto no
// workspace quanto na página de módulo, para as duas barras não divergirem).
export function TreeButton({
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
      className={`mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm animate-in slide-in-from-left-2 fade-in duration-150 [&_svg]:shrink-0 [&_svg]:text-[var(--gold)] ${
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

export function TreeSection({
  title,
  icon,
  open,
  children,
  onToggle,
}: {
  title: string;
  icon?: ReactNode;
  open: boolean;
  children: ReactNode;
  onToggle: () => void;
}) {
  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {icon ? <span className="shrink-0 text-[var(--gold)]">{icon}</span> : null}
        {title}
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="ml-3 pl-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Ramo de módulo compartilhado: cabeçalho clicável (seleciona) + botão de
// expandir/recolher, com a lista de submenus animada.
export function ModuleBranch({
  title,
  icon,
  active,
  open,
  children,
  onSelect,
  onToggle,
}: {
  title: string;
  icon?: ReactNode;
  active?: boolean;
  open: boolean;
  children: ReactNode;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="mb-1 animate-in slide-in-from-left-2 fade-in duration-200">
      <div
        className={`flex items-stretch rounded-md ${
          active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left"
        >
          {icon ? <span className="shrink-0 text-[var(--gold)]">{icon}</span> : null}
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
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="ml-5 py-1 pl-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Árvore de "Processos" (módulos + cadastros) ─────────────────────────────
// UM único componente com todo o markup (títulos, ícones, ordem e cores) usado
// pela página inicial E pela página de módulo. As páginas fornecem apenas o
// comportamento (o que acontece ao clicar e qual item está ativo); o visual é
// idêntico por construção e não pode divergir.

export type ModulesTreeModuleId = "ddp" | "pop" | "bpmn";
export type ModulesTreeTask = "new" | "consult" | "cause-new" | "cause-consult";
export type ModulesTreeRegistration =
  | "processes"
  | "areas"
  | "owners"
  | "owner-users"
  | "systems"
  | "process-types";

export type ModulesTreeTarget =
  | { kind: "module-root"; moduleId: ModulesTreeModuleId }
  | { kind: "module-task"; moduleId: ModulesTreeModuleId; task: ModulesTreeTask }
  | { kind: "registrations-root" }
  | { kind: "registration"; view: ModulesTreeRegistration };

const MODULES_TREE_BRANCHES: Array<{
  moduleId: ModulesTreeModuleId;
  title: string;
  icon: ReactNode;
}> = [
  { moduleId: "ddp", title: "Mapeamento", icon: <FileText className="h-4 w-4" /> },
  { moduleId: "pop", title: "Documentação", icon: <CheckCircle2 className="h-4 w-4" /> },
  { moduleId: "bpmn", title: "Fluxograma", icon: <Workflow className="h-4 w-4" /> },
];

const MODULES_TREE_REGISTRATIONS: Array<{
  view: ModulesTreeRegistration;
  label: string;
  icon: ReactNode;
}> = [
  { view: "processes", label: "Processos", icon: <GitBranch className="h-4 w-4" /> },
  { view: "areas", label: "Áreas", icon: <Layers className="h-4 w-4" /> },
  { view: "owners", label: "Donos de Processo", icon: <Users className="h-4 w-4" /> },
  { view: "owner-users", label: "Vínculo Dono × Usuário", icon: <Link2 className="h-4 w-4" /> },
  { view: "systems", label: "Sistemas", icon: <Database className="h-4 w-4" /> },
  {
    view: "process-types",
    label: "Categorias de Processo",
    icon: <ListChecks className="h-4 w-4" />,
  },
];

export function WorkspaceModulesTree({
  expanded,
  onToggle,
  isActive,
  onNavigate,
}: {
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  isActive: (target: ModulesTreeTarget) => boolean;
  onNavigate: (target: ModulesTreeTarget) => void;
}) {
  return (
    <div className="grid gap-1 animate-[slideDown_0.18s_ease-out]">
      {MODULES_TREE_BRANCHES.map((branch) => (
        <ModuleBranch
          key={branch.moduleId}
          title={branch.title}
          icon={branch.icon}
          active={isActive({ kind: "module-root", moduleId: branch.moduleId })}
          open={!!expanded[branch.moduleId]}
          onSelect={() => onNavigate({ kind: "module-root", moduleId: branch.moduleId })}
          onToggle={() => onToggle(branch.moduleId)}
        >
          <TreeButton
            active={isActive({ kind: "module-task", moduleId: branch.moduleId, task: "new" })}
            onClick={() =>
              onNavigate({ kind: "module-task", moduleId: branch.moduleId, task: "new" })
            }
          >
            <Plus className="h-4 w-4" /> Novo
          </TreeButton>
          <TreeButton
            active={isActive({ kind: "module-task", moduleId: branch.moduleId, task: "consult" })}
            onClick={() =>
              onNavigate({ kind: "module-task", moduleId: branch.moduleId, task: "consult" })
            }
          >
            <Search className="h-4 w-4" /> Consultar
          </TreeButton>
          {branch.moduleId === "ddp" ? (
            <TreeSection
              title="Causas"
              icon={<FlaskConical className="h-4 w-4" />}
              open={!!expanded.causes}
              onToggle={() => onToggle("causes")}
            >
              <TreeButton
                active={isActive({ kind: "module-task", moduleId: "ddp", task: "cause-new" })}
                onClick={() =>
                  onNavigate({ kind: "module-task", moduleId: "ddp", task: "cause-new" })
                }
              >
                <Plus className="h-4 w-4" /> Novo
              </TreeButton>
              <TreeButton
                active={isActive({ kind: "module-task", moduleId: "ddp", task: "cause-consult" })}
                onClick={() =>
                  onNavigate({ kind: "module-task", moduleId: "ddp", task: "cause-consult" })
                }
              >
                <Search className="h-4 w-4" /> Consultar
              </TreeButton>
            </TreeSection>
          ) : null}
        </ModuleBranch>
      ))}

      <ModuleBranch
        title="Cadastros"
        icon={<Database className="h-4 w-4" />}
        active={isActive({ kind: "registrations-root" })}
        open={!!expanded.registrations}
        onSelect={() => onNavigate({ kind: "registrations-root" })}
        onToggle={() => onToggle("registrations")}
      >
        {MODULES_TREE_REGISTRATIONS.map((item) => (
          <TreeButton
            key={item.view}
            active={isActive({ kind: "registration", view: item.view })}
            onClick={() => onNavigate({ kind: "registration", view: item.view })}
          >
            {item.icon} {item.label}
          </TreeButton>
        ))}
      </ModuleBranch>
    </div>
  );
}
