import { createFileRoute, type SearchSchemaInput } from "@tanstack/react-router";
import { MappingWorkflow } from "@/components/mapping-workflow";
export const Route = createFileRoute("/_authenticated/mapping")({
  validateSearch: (s: Record<string, unknown> & SearchSchemaInput) => ({
    view: (["board", "tasks", "directions", "coordinators"] as string[]).includes(String(s.view))
      ? String(s.view)
      : "board",
    id: typeof s.id === "string" && /^[0-9a-f-]{36}$/i.test(s.id) ? s.id : undefined,
    q: typeof s.q === "string" ? s.q.slice(0, 120) : "",
    modality: typeof s.modality === "string" ? s.modality : "",
    layout: s.layout === "list" ? "list" : "kanban",
    taskStatus: s.taskStatus === "closed" ? "closed" : "open",
    mine: s.mine === false || s.mine === "false" ? false : true,
  }),
  head: () => ({ meta: [{ title: "Mapeamentos e tarefas — BF Flow" }] }),
  component: MappingWorkflow,
});
