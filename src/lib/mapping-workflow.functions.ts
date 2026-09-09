import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorkflowData } from "./mapping-workflow";
import type { MappingDemand } from "./mapping-workflow";

export const getDocumentMapping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { documentId: string }) => z.object({ documentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<MappingDemand | null> => {
    const db = context.supabase as unknown as SupabaseClient;
    const document = await db
      .from("documents")
      .select("mapping_demand_id")
      .eq("id", data.documentId)
      .single();
    if (document.error) throw new Error(document.error.message);
    if (!document.data?.mapping_demand_id) return null;
    const result = await db
      .from("mapping_demands")
      .select("*")
      .eq("id", document.data.mapping_demand_id)
      .single();
    if (result.error) throw new Error(result.error.message);
    return result.data as MappingDemand;
  });

const scope = z.object({ organizationId: z.string().uuid() });
export const loadMappingWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof scope>) => scope.parse(data))
  .handler(async ({ data, context }): Promise<WorkflowData> => {
    const db = context.supabase as unknown as SupabaseClient;
    const access = await db.rpc("mapping_context", { p_org: data.organizationId });
    if (access.error)
      throw new Error(
        access.error.code === "PGRST202"
          ? "O fluxo de mapeamento ainda não foi instalado no banco. Aplique a migração 20260909120000_mapping_workflow."
          : access.error.message,
      );
    const results = await Promise.all([
      db
        .from("mapping_demands")
        .select("*")
        .eq("organization_id", data.organizationId)
        .order("updated_at", { ascending: false })
        .limit(500),
      db
        .from("mapping_tasks")
        .select("*")
        .eq("organization_id", data.organizationId)
        .order("created_at", { ascending: false })
        .limit(2000),
      db
        .from("mapping_events")
        .select("id,demand_id,actor_id,action,comment,created_at")
        .eq("organization_id", data.organizationId)
        .order("created_at", { ascending: false })
        .limit(500),
      db
        .from("organization_processes")
        .select("id,name,department")
        .eq("organization_id", data.organizationId)
        .order("name")
        .limit(2000),
      db
        .from("documents")
        .select("id,name,module")
        .eq("organization_id", data.organizationId)
        .in("module", ["ddp", "pop", "bpmn"])
        .order("updated_at", { ascending: false })
        .limit(1000),
    ]);
    for (const result of results) if (result.error) throw new Error(result.error.message);
    return {
      ...access.data,
      demands: results[0].data ?? [],
      tasks: results[1].data ?? [],
      events: results[2].data ?? [],
      processes: results[3].data ?? [],
      documents: results[4].data ?? [],
    } as WorkflowData;
  });

const command = scope.extend({
  action: z.enum([
    "coordinator",
    "direct",
    "register",
    "checklist",
    "details",
    "transition",
    "task_create",
    "task_update",
    "reassign",
    "cancel",
    "take_task",
  ]),
  payload: z
    .record(z.string(), z.unknown())
    .refine(
      (value) => JSON.stringify(value).length <= 120000,
      "Conteúdo excede o limite permitido.",
    ),
});
export const mutateMappingWorkflow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.infer<typeof command>) => command.parse(data))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const result = await db.rpc("mapping_command", {
      p_org: data.organizationId,
      p_action: data.action,
      p_payload: data.payload,
    });
    if (result.error) throw new Error(result.error.message);
    return result.data as { id?: string; document_id?: string };
  });
