import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportError } from "../lib/error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço que você acessou não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Voltar
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  const technicalMessage = error?.message?.trim();
  useEffect(() => {
    reportError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-destructive/10 text-sm font-bold text-destructive">
          !
        </div>
        <h1 className="mt-4 text-xl font-semibold">Nao foi possivel carregar a pagina</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          A navegacao encontrou uma falha inesperada. Tente recarregar a pagina; se o erro
          continuar, volte para o inicio e acesse novamente o modulo desejado.
        </p>
        {technicalMessage ? (
          <details className="mt-4 rounded-md border border-border bg-muted/40 p-3 text-left">
            <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">
              Detalhe tecnico
            </summary>
            <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
              {technicalMessage}
            </pre>
          </details>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Tentar de novo
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Recarregar
          </button>
          <a
            href="/"
            className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            Inicio
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "BF Flow — Workspace de processos" },
      {
        name: "description",
        content: "Workspace modular para cadastrar processos, registrar mapeamentos e gerenciar documentos.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700;800&family=Geist+Mono:wght@500;600;700&family=IBM+Plex+Serif:wght@600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => { try { const key = "ateliam-theme-preference"; const migrationKey = "ateliam-light-workspace-v1"; if (!localStorage.getItem(migrationKey)) { localStorage.setItem(key, "light"); localStorage.setItem(migrationKey, "1"); } let preference = localStorage.getItem(key) || "light"; if (!["dark","light","system"].includes(preference)) preference = "light"; const resolved = preference === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : preference; const root = document.documentElement; root.dataset.theme = resolved; root.dataset.themePreference = preference; root.classList.toggle("dark", resolved === "dark"); root.style.colorScheme = resolved; } catch { document.documentElement.dataset.theme = "light"; document.documentElement.classList.remove("dark"); document.documentElement.style.colorScheme = "light"; } })();`,
          }}
        />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
    });
    return () => sub.subscription.unsubscribe();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster position="top-right" richColors />
    </QueryClientProvider>
  );
}
