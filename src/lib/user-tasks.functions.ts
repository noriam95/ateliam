import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { TaskFeed } from "./user-tasks";
const scope = z.object({ organizationId: z.string().uuid() });
export const loadUserTasks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope
      .extend({
        filters: z
          .object({
            q: z.string().max(160).optional(),
            status: z.string().optional(),
            kind: z.string().optional(),
            modality: z.string().optional(),
            from: z.string().optional(),
            until: z.string().optional(),
            team: z.boolean().optional(),
            offset: z.number().int().min(0).optional(),
            id: z.string().uuid().optional(),
            documentQuery: z.string().max(160).optional(),
          })
          .default({}),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: result, error } = await db.rpc("user_tasks_feed", {
      p_org: data.organizationId,
      p_filters: data.filters,
    });
    if (error)
      throw new Error(
        error.code === "PGRST202"
          ? "Minhas tarefas aguarda a atualização do banco de dados."
          : error.message,
      );
    const feed = result as TaskFeed;
    if (feed.tasks.length) {
      const { data: rows, error: activityError } = await db
        .from("user_tasks")
        .select("id,user_task_events(action,note,created_at)")
        .in(
          "id",
          feed.tasks.map((task) => task.id),
        )
        .order("created_at", { referencedTable: "user_task_events", ascending: false })
        .order("id", { referencedTable: "user_task_events", ascending: false })
        .limit(1, { referencedTable: "user_task_events" });
      if (activityError) throw new Error(activityError.message);
      const latest = new Map(
        (rows || []).map((row) => [row.id, row.user_task_events?.[0] || null]),
      );
      feed.tasks = feed.tasks.map((task) => ({
        ...task,
        latest_activity: latest.get(task.id) || null,
      }));
    }
    return feed;
  });
export const updateUserTask = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope
      .extend({
        action: z.enum([
          "pause",
          "resume",
          "edit_details",
          "start_documentation",
          "request_complement",
          "resubmit",
          "create",
          "add_item",
          "add_entry",
          "remove_entry",
          "begin_document",
          "attach_file",
          "item",
          "transition",
          "assign",
          "send_review",
          "approve_review",
          "request_adjustments",
          "record_owner_approval",
          "admin_move",
          "comment",
        ]),
        payload: z
          .record(z.string(), z.unknown())
          .refine((v) => JSON.stringify(v).length <= 100000, "Conteúdo muito extenso."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: result, error } = await db.rpc("user_tasks_command", {
      p_org: data.organizationId,
      p_action: data.action,
      p_payload: data.payload,
    });
    if (error) throw new Error(error.message);
    return result as { id: string; documentId?: string };
  });

export const loadTaskAreas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => scope.parse(v))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("organization_departments")
      .select("id,name")
      .eq("organization_id", data.organizationId)
      .order("name");
    if (error) throw new Error(error.message);
    return rows;
  });
export const loadTaskNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => scope.parse(v))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: tasks, error } = await db
      .from("user_tasks")
      .select("id,title,task_code")
      .eq("organization_id", data.organizationId)
      .or(
        ["assigned_to", "requested_by", "created_by", "documenter_id", "reviewer_id"]
          .map((k) => `${k}.eq.${context.userId}`)
          .join(","),
      );
    if (error) throw new Error(error.message);
    if (!tasks?.length) return [];
    const { data: events, error: eventError } = await db
      .from("user_task_events")
      .select("id,task_id,action,note,created_at")
      .in(
        "task_id",
        tasks.map((t) => t.id),
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (eventError) throw new Error(eventError.message);
    return (events || []).map((e) => ({
      id: e.id,
      title: `${tasks.find((t) => t.id === e.task_id)?.task_code || ""} · ${tasks.find((t) => t.id === e.task_id)?.title || "Tarefa"}`,
      description: e.note || e.action,
      tag: e.action,
      updatedAt: e.created_at,
      taskId: e.task_id,
    }));
  });
