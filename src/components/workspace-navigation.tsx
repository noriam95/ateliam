import type { ReactNode } from "react";
import { BarChart2, Database, Home, LayoutGrid, Settings } from "lucide-react";

export type WorkspaceRailArea = "home" | "modules" | "reports" | "registrations" | "settings";

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
        label="Módulos"
        onClick={() => onSelect("modules")}
      >
        <LayoutGrid className="h-4 w-4" />
      </WorkspaceRailButton>
      <WorkspaceRailButton
        active={activeArea === "reports"}
        label="Relatórios"
        onClick={() => onSelect("reports")}
      >
        <BarChart2 className="h-4 w-4" />
      </WorkspaceRailButton>
      <WorkspaceRailButton
        active={activeArea === "registrations"}
        label="Cadastros"
        onClick={() => onSelect("registrations")}
      >
        <Database className="h-4 w-4" />
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
