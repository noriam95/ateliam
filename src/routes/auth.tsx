import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { toast } from "sonner";
import { BFFlowMark } from "@/components/bf-flow-mark";
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
  const [flowStep, setFlowStep] = useState(0);

  useEffect(() => {
    clearLegacyDemoData();
    const timer = window.setInterval(() => {
      setFlowStep((current) => (current + 1) % 3);
    }, 1800);
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
    <main className="flex min-h-screen items-stretch bg-[#f5f6f6]">
      <section className="relative hidden w-[58%] overflow-hidden bg-[#151a1b] px-14 py-12 text-white md:flex md:flex-col lg:px-20 lg:py-16">
        <BFFlowMark className="h-12 self-start" variant="color" />

        <div className="mt-[clamp(5rem,13vh,8rem)] max-w-[44rem]">
          <span className="mb-7 block h-1 w-14 bg-[#d19a29]" />
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#e4af3a]">
            Gestão de processos
          </p>
          <h1 className="font-display text-5xl font-bold leading-[1.02] lg:text-7xl">
            Clareza para
            <br />
            fazer melhor.
          </h1>

          <div
            className="mt-10 grid max-w-xl grid-cols-[auto_1fr_auto_1fr_auto] items-center gap-3 text-xs font-semibold uppercase tracking-[0.14em]"
            aria-label="Mapear, documentar e evoluir"
          >
            {["Mapear", "Documentar", "Evoluir"].map((label, index) => (
              <div key={label} className="contents">
                <span
                  className={`transition-all duration-500 motion-reduce:transition-none ${
                    flowStep === index
                      ? "-translate-y-0.5 text-[#f0b93e]"
                      : index < flowStep
                        ? "text-white/72"
                        : "text-white/38"
                  }`}
                >
                  {label}
                </span>
                {index < 2 ? (
                  <span className="relative h-px overflow-hidden bg-white/15" aria-hidden="true">
                    <span
                      className={`absolute inset-y-0 left-0 bg-[#d19a29] transition-[width] duration-700 ease-out motion-reduce:transition-none ${
                        flowStep > index ? "w-full" : "w-0"
                      }`}
                    />
                    <span
                      className={`absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rotate-45 border-r border-t transition-colors duration-500 ${
                        flowStep > index ? "border-[#d19a29]" : "border-white/20"
                      }`}
                    />
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-auto text-[11px] text-white/38">© 2026 BF Flow</div>
      </section>

      <section className="flex flex-1 items-center justify-center border-l border-black/5 bg-[#f5f6f6] px-6 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-[420px]">
          <div className="mb-16 md:hidden">
            <BFFlowMark className="h-12" variant="color" />
          </div>

          <div className="mb-8 flex items-end justify-between border-b border-foreground/15 pb-5">
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--gold)]">
                BF Flow
              </div>
              <h2 className="font-display text-4xl font-bold leading-none text-foreground">
                Entrar
              </h2>
            </div>
            <span className="mb-1 h-2 w-2 bg-[var(--gold)]" aria-hidden="true" />
          </div>

          <form onSubmit={submit} className="grid gap-5">
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
  );
}
