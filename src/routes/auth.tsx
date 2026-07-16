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
      <section className="relative hidden w-[58%] overflow-hidden bg-[#151a1b] px-14 py-12 text-white md:flex md:flex-col md:justify-between lg:px-20 lg:py-16">
        <BFFlowMark className="h-12 self-start" variant="color" />

        <div className="max-w-[44rem] pb-10">
          <span className="mb-7 block h-1 w-14 bg-[#d19a29]" />
          <p className="mb-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#e4af3a]">
            Gestão de processos
          </p>
          <h1 className="font-display text-5xl font-bold leading-[1.02] lg:text-7xl">
            Clareza para
            <br />
            fazer melhor.
          </h1>

          <div className="mt-12 flex max-w-lg items-center gap-4 text-xs font-semibold uppercase tracking-[0.14em] text-white/58">
            <span>Mapear</span>
            <span className="h-px flex-1 bg-white/20" />
            <span>Documentar</span>
            <span className="h-px flex-1 bg-white/20" />
            <span>Evoluir</span>
          </div>
        </div>

        <div className="text-[11px] text-white/38">© 2026 BF Flow</div>
      </section>

      <section className="flex flex-1 items-center justify-center border-l border-black/5 bg-[#f5f6f6] px-6 py-12 sm:px-10 lg:px-16">
        <div className="w-full max-w-sm">
          <div className="mb-16 md:hidden">
            <BFFlowMark className="h-12" variant="color" />
          </div>

          <div className="mb-10 flex items-end justify-between border-b border-foreground/15 pb-5">
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

          <form onSubmit={submit} className="grid gap-6">
            <label className="grid gap-2.5 text-sm font-semibold text-foreground">
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

            <label className="grid gap-2.5 text-sm font-semibold text-foreground">
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
              className="mt-2 inline-flex h-[52px] w-full items-center justify-between rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
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
