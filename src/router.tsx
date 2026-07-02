import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

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
