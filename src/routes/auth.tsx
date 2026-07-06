import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { BFFlowMark } from "@/components/bf-flow-mark";
import { supabase } from "@/integrations/supabase/client";
import { isDemoModeAvailable, isDemoSessionActive, startDemoSession } from "@/lib/demo-session";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — BF Flow" }] }),
  component: AuthPage,
});

const LOGIN_MESSAGES = [
  {
    eyebrow: "workspace de processos",
    title: "Crie, mapeie e organize.\nEm um só lugar.",
    text: "Um ambiente modular para fluxos de atividades, políticas, procedimentos e registros de mapeamento.",
  },
  {
    eyebrow: "diagnóstico de processo",
    title: "Mapeie o AS IS\ncom clareza.",
    text: "Estruture escopo, sistemas, SIPOC, causas-raiz, planos de ação, imagens do fluxo e próximos passos em um documento padronizado.",
  },
  {
    eyebrow: "procedimentos padrão",
    title: "Transforme conhecimento\nem rotina.",
    text: "Crie POPs com objetivo, abrangência, responsabilidades, procedimento, referências e histórico de mudanças.",
  },
  {
    eyebrow: "fluxo de atividades",
    title: "Desenhe fluxos\ncom precisão.",
    text: "Modele processos com elementos visuais, conexões organizadas e uma experiência familiar de fluxograma.",
  },
  {
    eyebrow: "governança documental",
    title: "Controle versões, áreas\ne responsáveis.",
    text: "Organize documentos por organização, área, dono do processo, permissões e identidade visual própria.",
  },
  {
    eyebrow: "exportação padronizada",
    title: "Documentos prontos\nno modelo certo.",
    text: "Exporte Relatórios de Mapeamento, POPs e fluxos nos formatos corretos, preservando estrutura, identidade visual e padrão corporativo.",
  },
];

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);
  const [demoModeAvailable, setDemoModeAvailable] = useState(false);

  useEffect(() => {
    setDemoModeAvailable(isDemoModeAvailable());
    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % LOGIN_MESSAGES.length);
    }, 7200);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;

    try {
      supabase.auth
        .getSession()
        .then(({ data }) => {
          if (!cancelled && data.session) navigate({ to: "/" });
          if (!cancelled && !data.session && isDemoSessionActive()) navigate({ to: "/" });
        })
        .catch(() => {
          if (!cancelled && isDemoSessionActive()) navigate({ to: "/" });
          // Keep the auth screen available even when Supabase is not configured locally.
        });
    } catch {
      if (isDemoSessionActive()) navigate({ to: "/" });
      // Keep the local demo entry available.
    }

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      router.invalidate();
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao autenticar");
    } finally {
      setBusy(false);
    }
  }

  function enterDemoMode() {
    if (!startDemoSession()) {
      toast.error("Não foi possível iniciar o modo de teste.");
      return;
    }

    toast.success("Modo de demonstração ativado.");
    router.invalidate();
    navigate({ to: "/", replace: true });
  }

  const message = LOGIN_MESSAGES[messageIndex];

  return (
    <div className="flex min-h-screen items-stretch bg-background">
      <section className="relative hidden flex-1 overflow-hidden bg-foreground p-12 text-background md:flex md:flex-col md:justify-between">
        <div className="relative z-10 flex items-center">
          <BFFlowMark className="h-12" variant="color" />
        </div>

        <div
          key={message.eyebrow}
          className="relative z-10 animate-in fade-in slide-in-from-bottom-2 duration-700"
        >
          <div className="mb-4 text-xs font-semibold uppercase tracking-[0.28em] text-brand">
            {message.eyebrow}
          </div>
          <h1 className="whitespace-pre-line font-display text-5xl font-bold leading-[1.04] xl:text-6xl">
            {message.title}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-background/76 xl:text-lg">
            {message.text}
          </p>
          <div className="mt-7 flex gap-1.5">
            {LOGIN_MESSAGES.map((item, index) => (
              <span
                key={item.eyebrow}
                className={`h-1.5 rounded-full transition-all ${
                  index === messageIndex ? "w-7 bg-brand" : "w-1.5 bg-background/22"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="relative z-10 text-[11px] text-background/50">
          © 2026 <span className="ateliam-wordmark">BF Flow</span>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 md:hidden">
            <div className="mb-6 flex items-center">
              <BFFlowMark className="h-12" variant="color" />
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-2xl font-bold">Entrar no workspace</h2>
            <p className="mt-1 text-[13px] text-muted-foreground">
              Acesse seus documentos, registros e processos.
            </p>
          </div>

          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              placeholder="seu@email.com"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-[var(--gold)]"
            />
            <input
              type="password"
              placeholder="Senha"
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-md border border-input bg-background px-3.5 py-2.5 text-sm outline-none focus:border-[var(--gold)]"
            />
            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-md bg-primary py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {busy ? "Aguarde..." : "Entrar"}
            </button>
          </form>

          {demoModeAvailable && (
            <button
              type="button"
              onClick={enterDemoMode}
              disabled={busy}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-input py-2.5 text-sm font-medium text-muted-foreground hover:border-[var(--gold)] hover:text-foreground disabled:opacity-50"
            >
              <PlayCircle className="h-4 w-4" />
              Testar localmente sem login
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
