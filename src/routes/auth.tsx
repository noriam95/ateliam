import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { BFFlowMark } from "@/components/bf-flow-mark";
import { supabase } from "@/integrations/supabase/client";
import { clearLegacyDemoData } from "@/lib/demo-session";
import { resolveLoginIdentifier } from "@/lib/config.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — BF Flow" }] }),
  component: AuthPage,
});

const LOGIN_MESSAGES = [
  {
    eyebrow: "gestão integrada de processos",
    title: "Da cadeia de valor\nà execução.",
    text: "Organize processos, responsabilidades, documentos e resultados em um ambiente único e estruturado.",
  },
  {
    eyebrow: "mapeamento de processos",
    title: "Compreenda antes\nde transformar.",
    text: "Registre contexto, sistemas, fornecedores, etapas, causas e próximos passos com rastreabilidade.",
  },
  {
    eyebrow: "documentação padronizada",
    title: "Conhecimento claro.\nExecução consistente.",
    text: "Produza normas, procedimentos e instruções de trabalho com responsabilidades e histórico de alterações.",
  },
  {
    eyebrow: "modelagem de fluxos",
    title: "Desenhe o trabalho\ncomo ele acontece.",
    text: "Modele atividades, decisões, responsáveis e conexões em diagramas simples de consultar e manter.",
  },
  {
    eyebrow: "governança e acompanhamento",
    title: "Informação confiável\npara decidir melhor.",
    text: "Acompanhe cobertura, situação dos registros, catálogo documental e atividades recentes da organização.",
  },
];

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const resolveLogin = useServerFn(resolveLoginIdentifier);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    clearLegacyDemoData();
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
        })
        .catch(() => {
          // Keep the auth screen available even when Supabase is not configured locally.
        });
    } catch {
      // Keep the auth screen available even when Supabase is not configured locally.
    }

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const identifier = login.trim();
      const email = identifier.includes("@")
        ? identifier
        : (await resolveLogin({ data: { identifier } })).email;
      if (!email) throw new Error("Usuário ou senha inválidos.");
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      router.invalidate();
      navigate({ to: "/" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao autenticar");
    } finally {
      setBusy(false);
    }
  }

  const message = LOGIN_MESSAGES[messageIndex];

  return (
    <div className="flex min-h-screen items-stretch bg-background">
      <section className="relative hidden w-[54%] overflow-hidden border-r border-white/10 bg-[#171b1d] p-12 text-white md:flex md:flex-col md:justify-between lg:w-[56%] lg:p-16">
        <div className="flex items-center">
          <BFFlowMark className="h-12" variant="color" />
        </div>

        <div className="max-w-2xl">
          <div
            key={message.eyebrow}
            className="animate-in fade-in slide-in-from-bottom-2 duration-700"
          >
            <div className="mb-5 flex items-center gap-3 text-xs font-semibold uppercase text-[#f0b93e]">
              <span className="h-px w-8 bg-[#f0b93e]" />
              {message.eyebrow}
            </div>
            <h1 className="whitespace-pre-line font-display text-5xl font-bold leading-[1.03] lg:text-6xl">
              {message.title}
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/72 lg:text-lg">
              {message.text}
            </p>
          </div>

          <div className="mt-9 flex items-center gap-2" aria-label="Destaques do sistema">
            {LOGIN_MESSAGES.map((item, index) => (
              <button
                key={item.eyebrow}
                type="button"
                onClick={() => setMessageIndex(index)}
                aria-label={`Exibir: ${item.eyebrow}`}
                aria-current={index === messageIndex}
                className={`h-1.5 rounded-full transition-all ${
                  index === messageIndex ? "w-8 bg-[#f0b93e]" : "w-2 bg-white/25 hover:bg-white/45"
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-white/45">
          <span>© 2026 BF Flow</span>
          <span className="h-1 w-1 rounded-full bg-white/30" />
          <span>Gestão de processos e documentos</span>
        </div>
      </section>

      <section className="flex flex-1 items-center justify-center bg-[#f6f7f7] p-6 dark:bg-background sm:p-10 lg:p-16">
        <div className="w-full max-w-md">
          <div className="mb-10 md:hidden">
            <BFFlowMark className="h-12" variant="color" />
          </div>

          <div className="mb-9">
            <div className="mb-3 text-xs font-semibold uppercase text-[var(--gold)]">
              Acesso ao sistema
            </div>
            <h2 className="font-display text-3xl font-bold text-foreground">Acesse o BF Flow</h2>
            <p className="mt-2 max-w-sm text-sm leading-6 text-muted-foreground">
              Entre com suas credenciais para consultar e manter os processos da organização.
            </p>
          </div>

          <form onSubmit={submit} className="grid gap-5">
            <label className="grid gap-2 text-sm font-semibold text-foreground">
              E-mail ou usuário
              <span className="relative block">
                <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Informe seu e-mail ou usuário"
                  required
                  autoComplete="username"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  className="h-12 w-full rounded-lg border border-input bg-card pl-11 pr-4 text-sm font-normal outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--gold)_18%,transparent)]"
                />
              </span>
            </label>

            <label className="grid gap-2 text-sm font-semibold text-foreground">
              Senha
              <span className="relative block">
                <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="password"
                  placeholder="Digite sua senha"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-12 w-full rounded-lg border border-input bg-card pl-11 pr-4 text-sm font-normal outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--gold)_18%,transparent)]"
                />
              </span>
            </label>

            <button
              type="submit"
              disabled={busy}
              className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Validando acesso..." : "Acessar sistema"}
              {!busy ? <ArrowRight className="h-4 w-4" /> : null}
            </button>
          </form>

          <div className="mt-6 flex items-center gap-2 border-t border-border pt-5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4 text-emerald-600" />
            Acesso restrito a usuários cadastrados.
          </div>
        </div>
      </section>
    </div>
  );
}
