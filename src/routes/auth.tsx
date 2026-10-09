import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { clearLegacyDemoData } from "@/lib/demo-session";
import { resolveLoginIdentifier } from "@/lib/config.functions";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — BF Flow" }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const router = useRouter();
  const resolveLogin = useServerFn(resolveLoginIdentifier);
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    clearLegacyDemoData();
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
    if (!login.trim() || !password) {
      toast.error("Informe seu usuário e sua senha.");
      return;
    }
    setBusy(true);
    try {
      const identifier = login.trim();
      const email = identifier.includes("@")
        ? identifier
        : (await resolveLogin({ data: { identifier } })).email;
      if (!email) throw new Error("Usuário ou senha inválidos.");
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

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-[72px] shrink-0 items-center border-b border-border bg-card px-6 sm:px-10 lg:px-[5.4vw]">
        <div className="flex items-center gap-3.5">
          <span
            className="grid h-8 w-8 place-items-center rounded-md border border-[color-mix(in_oklab,var(--gold)_42%,var(--border))] bg-accent text-[var(--gold-ink)]"
            aria-hidden="true"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-[18px] w-[18px]">
              <circle cx="4" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
              <rect
                x="12"
                y="3"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <rect
                x="12"
                y="12"
                width="5"
                height="5"
                rx="1"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d="M6 10h3V5.5h3M9 10v4.5h3"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="text-sm font-semibold tracking-[-0.015em] text-foreground">BF Flow</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-[1080px] flex-1 grid-cols-1 items-center gap-9 px-5 py-9 sm:px-8 md:grid-cols-[minmax(0,1fr)_minmax(370px,450px)] md:gap-14 md:py-12 lg:gap-[clamp(56px,9vw,138px)]">
        <section className="mx-auto w-full max-w-[34rem] md:mx-0" aria-label="Sobre o BF Flow">
          <p className="mb-3 text-xs font-semibold tracking-[0.045em] text-[var(--gold-ink)]">
            Gestão de processos
          </p>
          <h1 className="font-display text-[2.3rem] font-semibold leading-[1.08] tracking-[-0.055em] text-foreground sm:text-5xl lg:text-[3.6rem]">
            Processos claros.
            <br />
            <span className="text-[var(--gold-ink)]">Trabalho que avança.</span>
          </h1>
          <p className="mt-4 max-w-[25rem] text-[13px] leading-6 text-muted-foreground sm:mt-5 sm:text-[15px] sm:leading-7">
            Um espaço para organizar solicitações, documentar processos e acompanhar melhorias da
            organização.
          </p>
          <span className="mt-6 block h-0.5 w-10 bg-[var(--gold)] sm:mt-8" aria-hidden="true" />
          <p className="mt-3 text-[11px] text-muted-foreground sm:mt-4 sm:text-xs">
            Solicitações <span className="mx-1.5">·</span> Mapeamentos
            <span className="mx-1.5">·</span> Fluxos <span className="mx-1.5">·</span> Melhorias
          </p>
        </section>

        <section
          className="mx-auto w-full max-w-[450px] rounded-xl border border-border bg-card px-5 py-6 shadow-[0_16px_40px_rgb(24_43_34_/_5%),0_2px_8px_rgb(24_43_34_/_3%)] sm:px-9 sm:py-9"
          aria-label="Acesso"
        >
          <div className="w-full">
            <div className="mb-8 flex items-end justify-between border-b border-foreground/15 pb-5">
              <div>
                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold-ink)]">
                  BF Flow
                </div>
                <h2 className="font-display text-4xl font-bold leading-none text-foreground">
                  Entrar
                </h2>
              </div>
              <span className="mb-1 h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
            </div>

            <form noValidate onSubmit={submit} className="grid gap-5">
              <label className="grid gap-2 text-sm font-semibold text-foreground">
                E-mail ou usuário
                <span className="relative block">
                  <UserRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="E-mail ou usuário"
                    required
                    autoComplete="username"
                    value={login}
                    onChange={(event) => setLogin(event.target.value)}
                    className="h-[52px] w-full rounded-md border border-input bg-white pl-11 pr-4 text-sm font-normal outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--gold)_16%,transparent)]"
                  />
                </span>
              </label>

              <label className="grid gap-2 text-sm font-semibold text-foreground">
                Senha
                <span className="relative block">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    placeholder="Senha"
                    required
                    minLength={6}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-[52px] w-full rounded-md border border-input bg-white pl-11 pr-4 text-sm font-normal outline-none transition focus:border-[var(--gold)] focus:ring-2 focus:ring-[color-mix(in_oklab,var(--gold)_16%,transparent)]"
                  />
                </span>
              </label>

              <button
                type="submit"
                disabled={busy}
                className="mt-1 inline-flex h-[52px] w-full items-center justify-between rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Validando acesso..." : "Acessar"}
                {!busy ? <ArrowRight className="h-4 w-4" /> : null}
              </button>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}
