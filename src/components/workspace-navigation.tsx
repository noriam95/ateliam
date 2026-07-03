import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, GitBranch, Home, Network, Settings } from "lucide-react";

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
          <div className="ml-3 border-l border-border pl-2">{children}</div>
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
          <div className="ml-5 border-l border-border py-1 pl-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
