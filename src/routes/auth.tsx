import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Noriam" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        toast.success("Conta criada. Você já pode entrar.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.invalidate();
        navigate({ to: "/" });
      }
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao autenticar");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) {
      toast.error(res.error.message ?? "Falha no login Google");
      setBusy(false);
      return;
    }
    if (res.redirected) return;
    navigate({ to: "/" });
  }

  return (
    <div className="min-h-screen flex items-stretch bg-background">
      {/* Left brand panel */}
      <div className="hidden md:flex flex-1 flex-col justify-between p-12 bg-primary text-primary-foreground relative overflow-hidden">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full" style={{ background: "color-mix(in oklab, var(--gold) 25%, transparent)", filter: "blur(60px)" }} />
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-lg bg-background/10 grid place-items-center">
              <div className="h-4 w-4 rounded-sm bg-brand rotate-45" />
            </div>
            <div className="font-display text-xl font-bold">Atelier</div>
          </div>
        </div>
        <div className="relative">
          <div className="text-[10px] font-display uppercase tracking-[0.25em] text-brand mb-3">workspace de processos</div>
          <h1 className="font-display text-4xl font-bold leading-[1.1] mb-4">
            Crie, versione e organize.<br />Em um só lugar.
          </h1>
          <p className="text-primary-foreground/70 text-[14px] max-w-sm leading-relaxed">
            Um ambiente modular para processos BPMN, políticas, procedimentos e diagnósticos —
            com histórico completo de versões.
          </p>
        </div>
        <div className="relative text-[11px] text-primary-foreground/50 font-display tracking-wider">
          © {new Date().getFullYear()} Atelier
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold">
              {mode === "signin" ? "Entrar no workspace" : "Criar sua conta"}
            </h2>
            <p className="text-[13px] text-muted-foreground mt-1">
              {mode === "signin" ? "Acesse seus documentos e versões." : "Comece em segundos."}
            </p>
          </div>

          <div className="flex gap-1 rounded-lg bg-secondary p-1 mb-5">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-[13px] font-medium rounded-md transition ${
                  mode === m ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <input
                type="text" placeholder="Nome completo" required
                value={name} onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-input rounded-md bg-background text-sm"
              />
            )}
            <input
              type="email" placeholder="seu@email.com" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-input rounded-md bg-background text-sm"
            />
            <input
              type="password" placeholder="Senha" required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-input rounded-md bg-background text-sm"
            />
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Aguarde…" : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <div className="flex items-center gap-3 text-[11px] text-muted-foreground my-5">
            <div className="flex-1 h-px bg-border" />
            ou
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={google} disabled={busy}
            className="w-full py-2.5 border border-input rounded-md text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Continuar com Google
          </button>
        </div>
      </div>
    </div>
  );
}
