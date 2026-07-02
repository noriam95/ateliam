import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Evita refetch redundante ao navegar entre telas num curto intervalo.
        // As mutações continuam refazendo o fetch explicitamente (refetch/
        // invalidate), então dados recém-salvos não ficam obsoletos.
        staleTime: 30_000,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Pré-carrega a rota ao passar o mouse / focar / tocar no link, deixando a
    // navegação praticamente instantânea. O pequeno delay evita pré-carregar em
    // passagens rápidas do cursor.
    defaultPreload: "intent",
    defaultPreloadDelay: 80,
  });

  return router;
};
