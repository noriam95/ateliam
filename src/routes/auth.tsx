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
    <div className="min-h-screen flex items-center justify-center bg-sidebar p-4">
      <div className="w-full max-w-md bg-card rounded-xl shadow-2xl overflow-hidden">
        <div className="bg-sidebar px-6 py-8 text-center">
          <div className="font-display text-[10px] tracking-[0.2em] text-brand">NORIAM • BPMN</div>
          <h1 className="font-display text-2xl font-bold text-white mt-1">Gestão de Processos</h1>
        </div>
        <div className="p-6 space-y-4">
          <div className="flex gap-1 rounded-lg bg-secondary p-1">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 py-2 text-sm font-medium rounded-md transition ${
                  mode === m ? "bg-card shadow-sm" : "text-muted-foreground"
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
                className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
              />
            )}
            <input
              type="email" placeholder="seu@email.com" required
              value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
            />
            <input
              type="password" placeholder="Senha" required minLength={6}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border border-input rounded-md bg-background text-sm"
            />
            <button
              type="submit" disabled={busy}
              className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
