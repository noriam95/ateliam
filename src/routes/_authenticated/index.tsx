import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MODULES } from "@/lib/workspace-bridge";
import { ArrowRight, LogOut, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/")({
  component: ModulePicker,
});

function ModulePicker() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? ""));
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Topbar */}
      <header className="h-14 bg-primary text-primary-foreground flex items-center gap-3 px-6 border-b border-primary/20">
        <div className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-md bg-background/10 grid place-items-center">
            <div className="h-2.5 w-2.5 rounded-sm bg-brand rotate-45" />
          </div>
          <div className="font-display text-[17px] font-bold tracking-tight">Atelier</div>
          <span className="text-[10px] font-display uppercase tracking-[0.22em] text-primary-foreground/55 ml-1 hidden sm:inline">
            estúdio de processos
          </span>
        </div>
        <div className="flex-1" />
        <button onClick={() => navigate({ to: "/settings" })} title="Configurações" className="p-2 rounded-md hover:bg-background/10">
          <Settings className="h-4 w-4" />
        </button>
        <span className="hidden md:inline text-[12px] text-primary-foreground/70 max-w-[200px] truncate">{email}</span>
        <button onClick={signOut} title="Sair" className="p-2 rounded-md hover:bg-background/10">
          <LogOut className="h-4 w-4" />
        </button>
      </header>

      {/* Hero / picker */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="mb-14">
          <div className="text-[11px] font-display uppercase tracking-[0.28em] text-muted-foreground mb-3">
            Workspace · {new Date().toLocaleDateString("pt-BR", { dateStyle: "long" })}
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold tracking-tight text-foreground max-w-3xl leading-[1.05]">
            Escolha um módulo para começar.
          </h1>
          <p className="text-muted-foreground mt-4 max-w-2xl text-[15px] leading-relaxed">
            Cada módulo é um ambiente independente, com as ferramentas certas para o trabalho.
            Suas alterações ficam isoladas dentro do módulo escolhido.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {MODULES.map((m, i) => (
            <Link
              key={m.id}
              to="/m/$module"
              params={{ module: m.id }}
              className="group relative bg-card border border-border rounded-2xl p-7 hover:border-primary/40 transition-all hover:shadow-[0_18px_40px_-22px_rgba(26,60,42,0.35)] hover:-translate-y-0.5"
            >
              <div className="absolute top-7 right-7 text-[10px] font-display uppercase tracking-[0.2em] text-muted-foreground/70">
                0{i + 1}
              </div>
              <div
                className="h-12 w-12 rounded-lg grid place-items-center text-2xl mb-6"
                style={{ background: "var(--accent)", color: m.accent as string }}
              >
                {m.glyph}
              </div>
              <div className="text-[10px] font-display uppercase tracking-[0.22em] text-muted-foreground mb-1.5">
                {m.tagline}
              </div>
              <h2 className="font-display text-[20px] font-bold leading-snug text-foreground mb-3">
                {m.title}
              </h2>
              <p className="text-[13px] text-muted-foreground leading-relaxed mb-6 min-h-[60px]">
                {m.description}
              </p>
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-primary group-hover:gap-2.5 transition-all">
                Abrir módulo <ArrowRight className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-16 pt-8 border-t border-border text-[12px] text-muted-foreground flex items-center justify-between">
          <span>Atelier · workspace pessoal de processos.</span>
          <Link to="/settings" className="hover:text-foreground">Configurações & integrações →</Link>
        </div>
      </main>
    </div>
  );
}
