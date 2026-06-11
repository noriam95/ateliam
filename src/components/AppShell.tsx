import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Settings, LogOut, FileText } from "lucide-react";

const NAV = [
  { to: "/", label: "Documentos", icon: LayoutDashboard, num: "01" },
  { to: "/settings", label: "Configurações", icon: Settings, num: "02" },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="w-[240px] bg-sidebar text-sidebar-foreground flex flex-col flex-shrink-0">
        <div className="px-[18px] py-5 border-b border-sidebar-border">
          <div className="font-display text-[10px] tracking-[0.18em] uppercase text-brand mb-1">
            Noriam • BPMN
          </div>
          <div className="font-display text-[15px] font-bold uppercase text-white leading-tight">
            Gestão de Processos
          </div>
        </div>
        <div className="font-display text-[9px] tracking-[0.25em] uppercase text-white/35 px-[18px] pt-4 pb-1.5">
          Navegação
        </div>
        <nav className="flex-1 overflow-y-auto">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-2.5 px-[18px] py-2.5 text-[13px] font-medium border-l-[3px] transition ${
                  active
                    ? "bg-brand/12 text-white border-brand"
                    : "text-white/65 hover:bg-white/5 hover:text-white border-transparent"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                <span className={`ml-auto font-display text-[11px] font-bold ${active ? "text-brand" : "text-white/30"}`}>
                  {item.num}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <div className="text-[11px] text-white/55 truncate mb-2">{email}</div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 text-[12px] text-white/70 hover:text-white py-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-14 bg-card border-b border-border flex items-center gap-3 px-6 flex-shrink-0">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <div className="font-display text-sm font-semibold uppercase tracking-wider">
            Workspace Noriam
          </div>
        </header>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
