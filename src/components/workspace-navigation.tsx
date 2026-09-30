import { MODULE_IDS } from "@/lib/module-visibility";
import { Fragment, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import "./workspace-launcher.css";
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  BriefcaseBusiness,
  Database,
  FileText,
  FlaskConical,
  GitBranch,
  Home,
  Layers,
  LayoutGrid,
  Link2,
  ListChecks,
  Network,
  Plus,
  Search,
  Users,
  Workflow,
} from "lucide-react";

export type WorkspaceRailArea = "home" | "modules" | "value-chain" | "reports" | "settings";

export function WorkspaceLauncher({
  activeArea,
  onSelect,
  activeTask = false,
  visibleModules = MODULE_IDS,
  children,
}: {
  activeArea: WorkspaceRailArea;
  onSelect: (area: WorkspaceRailArea) => void;
  activeTask?: boolean;
  visibleModules?: readonly string[];
  children?: ReactNode;
}) {
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(activeArea === "modules");
  const close = () => panel.current?.hidePopover();
  const entries = [
    {
      area: "home" as const,
      label: "Página inicial",
      description: "Resumo das suas atividades",
      icon: Home,
    },
    {
      area: "modules" as const,
      label: "Processos",
      description: "Mapeamento, POP, fluxogramas e cadastros",
      icon: GitBranch,
    },
    {
      area: "value-chain" as const,
      label: "Cadeia de Valor",
      description: "Estrutura e relacionamento dos processos",
      icon: Network,
    },
  ];
  return (
    <div className="workspace-launcher">
      <button
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        aria-label="Abrir módulos"
        title="Módulos"
        className="workspace-launcher-trigger"
      >
        <LayoutGrid size={20} aria-hidden="true" />
      </button>
      <div
        id={id}
        ref={panel}
        popover="auto"
        className="workspace-launcher-panel"
        onToggle={(event) => setOpen(event.newState === "open")}
        onClick={(event) => {
          if ((event.target as HTMLElement).closest("[data-workspace-destination]")) close();
        }}
      >
        <nav aria-label="Módulos do BF Flow">
          <div className="workspace-launcher-heading">
            BF Flow <span>Módulos</span>
          </div>

          {entries
            .filter(
              (entry) =>
                entry.area === "home" ||
                (entry.area === "value-chain"
                  ? visibleModules.includes("value-chain")
                  : ["ddp", "pop", "bpmn", "improvements", "registrations"].some((id) =>
                      visibleModules.includes(id),
                    )),
            )
            .map(({ area, label, description, icon: Icon }) => (
              <div key={area}>
                <button
                  type="button"
                  className="workspace-launcher-entry"
                  aria-current={activeArea === area && !activeTask ? "page" : undefined}
                  onClick={() => {
                    if (area === "modules") setModulesOpen((value) => !value);
                    onSelect(area);
                    if (area === "home" || area === "value-chain") close();
                  }}
                >
                  <span className="workspace-launcher-icon">
                    <Icon size={22} />
                  </span>
                  <span>
                    <strong>{label}</strong>
                    <small>{description}</small>
                  </span>
                  {area === "modules" &&
                    (modulesOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                </button>
                {area === "home" && visibleModules.includes("tasks") && (
                  <Link
                    to="/"
                    search={{ view: "tasks" }}
                    onClick={close}
                    aria-current={activeTask ? "page" : undefined}
                    className="workspace-launcher-entry"
                  >
                    <span className="workspace-launcher-icon">
                      <ListChecks size={22} />
                    </span>
                    <span>
                      <strong>Minhas tarefas</strong>
                      <small>Acompanhe entregas e prazos</small>
                    </span>
                  </Link>
                )}
                {activeArea === area &&
                  area !== "home" &&
                  (area !== "modules" || modulesOpen) &&
                  children && <div className="workspace-launcher-context">{children}</div>}
              </div>
            ))}
        </nav>
      </div>
    </div>
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
      data-workspace-destination
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
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm font-semibold text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        {icon ? <span className="shrink-0 text-[var(--gold)]">{icon}</span> : null}
        {title}
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden" inert={!open}>
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
  destination = true,
}: {
  destination?: boolean;
  title: string;
  icon?: ReactNode;
  active?: boolean;
  open: boolean;
  children: ReactNode;
  onSelect: () => void;
  onToggle: () => void;
}) {
  return (
    <div
      className="mb-1 animate-in slide-in-from-left-2 fade-in duration-200"
      data-nav-branch={title}
      data-open={open ? "true" : "false"}
    >
      <div
        className={`flex items-stretch rounded-md ${
          active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-muted"
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          data-workspace-destination={destination || undefined}
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
          title={`${open ? "Recolher" : "Expandir"} ${title}`}
          aria-expanded={open}
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
        <div className="overflow-hidden" inert={!open}>
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
  | "positions"
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
  { view: "positions", label: "Cargos", icon: <BriefcaseBusiness className="h-4 w-4" /> },
  { view: "owners", label: "Donos de Processo", icon: <Users className="h-4 w-4" /> },
  { view: "owner-users", label: "Vínculo Dono x Usuário", icon: <Link2 className="h-4 w-4" /> },
  { view: "systems", label: "Sistemas/Documentos", icon: <Database className="h-4 w-4" /> },
  {
    view: "process-types",
    label: "Categorias de Processo",
    icon: <ListChecks className="h-4 w-4" />,
  },
];

function ModuleActionsRow({
  title,
  icon,
  active,
  newActive,
  consultActive,
  onNew,
  onConsult,
}: {
  title: string;
  icon: ReactNode;
  active: boolean;
  newActive: boolean;
  consultActive: boolean;
  onNew: () => void;
  onConsult: () => void;
}) {
  return (
    <div className="workspace-module-row" data-active={active} role="group" aria-label={title}>
      <span className="workspace-module-label">
        <span aria-hidden="true">{icon}</span>
        <span>{title}</span>
      </span>
      <div className="workspace-module-actions">
        {[
          { label: "Novo", Icon: Plus, onClick: onNew, current: newActive },
          { label: "Consultar", Icon: Search, onClick: onConsult, current: consultActive },
        ].map(({ label, Icon, onClick, current }) => (
          <button
            key={label}
            type="button"
            className="workspace-module-action"
            data-workspace-destination
            aria-label={`${label} — ${title}`}
            aria-current={current ? "page" : undefined}
            onClick={onClick}
          >
            <Icon size={16} aria-hidden="true" />
            <span className="workspace-module-tooltip" aria-hidden="true">
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function WorkspaceModulesTree({
  expanded,
  onToggle,
  isActive,
  onNavigate,
  visibleModules = MODULE_IDS,
}: {
  visibleModules?: readonly string[];
  expanded: Record<string, boolean>;
  onToggle: (key: string) => void;
  isActive: (target: ModulesTreeTarget) => boolean;
  onNavigate: (target: ModulesTreeTarget) => void;
}) {
  const branchIsActive = (moduleId: ModulesTreeModuleId) =>
    isActive({ kind: "module-root", moduleId }) ||
    (
      [
        "new",
        "consult",
        ...(moduleId === "ddp" ? ["cause-new", "cause-consult"] : []),
      ] as ModulesTreeTask[]
    ).some((task) => isActive({ kind: "module-task", moduleId, task }));
  const registrationsAreActive =
    isActive({ kind: "registrations-root" }) ||
    MODULES_TREE_REGISTRATIONS.some((item) => isActive({ kind: "registration", view: item.view }));

  return (
    <div className="grid gap-1 animate-[slideDown_0.18s_ease-out]">
      {MODULES_TREE_BRANCHES.map((branch) => (
        <Fragment key={branch.moduleId}>
          {visibleModules.includes(branch.moduleId) && (
            <ModuleActionsRow
              title={branch.title}
              icon={branch.icon}
              active={branchIsActive(branch.moduleId)}
              newActive={isActive({ kind: "module-task", moduleId: branch.moduleId, task: "new" })}
              onNew={() =>
                onNavigate({ kind: "module-task", moduleId: branch.moduleId, task: "new" })
              }
              consultActive={isActive({
                kind: "module-task",
                moduleId: branch.moduleId,
                task: "consult",
              })}
              onConsult={() =>
                onNavigate({ kind: "module-task", moduleId: branch.moduleId, task: "consult" })
              }
            />
          )}
          {branch.moduleId === "ddp" && visibleModules.includes("improvements") ? (
            <ModuleActionsRow
              title="Oportunidades de melhoria"
              active={["cause-new", "cause-consult"].some((task) =>
                isActive({ kind: "module-task", moduleId: "ddp", task: task as ModulesTreeTask }),
              )}
              icon={<FlaskConical className="h-4 w-4" />}
              newActive={isActive({ kind: "module-task", moduleId: "ddp", task: "cause-new" })}
              onNew={() => onNavigate({ kind: "module-task", moduleId: "ddp", task: "cause-new" })}
              consultActive={isActive({
                kind: "module-task",
                moduleId: "ddp",
                task: "cause-consult",
              })}
              onConsult={() =>
                onNavigate({ kind: "module-task", moduleId: "ddp", task: "cause-consult" })
              }
            />
          ) : null}
        </Fragment>
      ))}

      {visibleModules.includes("registrations") && (
        <ModuleBranch
          destination={false}
          title="Cadastros"
          icon={<Database className="h-4 w-4" />}
          active={registrationsAreActive}
          open={!!expanded.registrations}
          onSelect={() => onToggle("registrations")}
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
      )}
    </div>
  );
}
