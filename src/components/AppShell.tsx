import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Settings, Home } from "lucide-react";
import { MODULE_LIST } from "@/lib/modules";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");
  const [name, setName] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? "");
      setName((data.user?.user_metadata?.full_name as string) ?? "");
    });
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-[260px] bg-sidebar text-sidebar-foreground flex flex-col flex-shrink-0 border-r border-sidebar-border">
        {/* Brand */}
        <div className="px-5 pt-6 pb-5">
          <div className="flex items-center gap-2.5">
            <div className="relative h-9 w-9 rounded-lg bg-primary grid place-items-center">
              <div className="h-3.5 w-3.5 rounded-sm bg-brand rotate-45" />
            </div>
            <div className="leading-none">
              <div className="font-display text-[17px] font-bold tracking-tight text-foreground">Atelier</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
                workspace de processos
              </div>
            </div>
          </div>
        </div>

        {/* Workspace */}
        <NavLink to="/" label="Visão geral" active={pathname === "/"} icon={<Home className="h-4 w-4" />} />

        {/* Modules */}
        <SectionLabel>Módulos</SectionLabel>
        <nav className="flex flex-col gap-px">
          {MODULE_LIST.map((m, i) => {
            const to = `/m/${m.key}`;
            const active = isActive(to);
            const Icon = m.icon;
            return (
              <Link
                key={m.key}
                to="/m/$module"
                params={{ module: m.key }}
                className={`group flex items-center gap-3 mx-2 px-3 py-2.5 rounded-md text-[13.5px] transition ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-accent/60 hover:text-accent-foreground"
                }`}
              >
                <div
                  className="h-7 w-7 grid place-items-center rounded-md border border-sidebar-border bg-background/60"
                  style={{ color: `var(${m.accent})` }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium leading-tight">{m.short}</div>
                  <div className="text-[10.5px] text-muted-foreground truncate">{m.name}</div>
                </div>
                <span className="font-display text-[10px] text-muted-foreground tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
              </Link>
            );
          })}
        </nav>

        <SectionLabel>Sistema</SectionLabel>
        <NavLink
          to="/settings"
          label="Configurações"
          active={isActive("/settings")}
          icon={<Settings className="h-4 w-4" />}
        />

        <div className="flex-1" />

        {/* User */}
        <div className="m-3 rounded-lg border border-sidebar-border bg-background/70 p-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground grid place-items-center font-display text-xs font-bold">
              {(name || email).charAt(0).toUpperCase() || "?"}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-medium truncate">{name || "Usuário"}</div>
              <div className="text-[10.5px] text-muted-foreground truncate">{email}</div>
            </div>
            <button onClick={signOut} title="Sair" className="p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 mb-1.5 px-5 text-[10px] font-display uppercase tracking-[0.2em] text-muted-foreground">
      {children}
    </div>
  );
}

function NavLink({
  to, label, active, icon,
}: { to: string; label: string; active: boolean; icon: ReactNode }) {
  return (
    <Link
      to={to}
      className={`mx-2 px-3 py-2 rounded-md text-[13.5px] flex items-center gap-2.5 transition ${
        active ? "bg-accent text-accent-foreground" : "text-sidebar-foreground/80 hover:bg-accent/60 hover:text-accent-foreground"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
