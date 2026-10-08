import { dashboardRows } from "./dashboard-pagination";
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
            stage: z.string().optional(),
            dueBefore: z.string().date().optional(),
            dueFrom: z.string().date().optional(),
            dueThrough: z.string().date().optional(),
            q: z.string().max(160).optional(),
            status: z.string().optional(),
            kind: z.string().optional(),
            modality: z.string().optional(),
            from: z.string().optional(),
            until: z.string().optional(),
            team: z.boolean().optional(),
            offset: z.number().int().min(0).optional(),
            id: z.string().uuid().optional(),
            documentModule: z.enum(["ddp", "pop", "bpmn"]).optional(),
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
    if (data.filters.id && feed.tasks.some((task) => task.id === data.filters.id)) {
      const history = await dashboardRows(
        db
          .from("user_task_events")
          .select(
            "id,action,note,created_at,attachments,movement_action,movement_note,actor:profiles!actor_id(display_name,username,avatar_data_url)",
          )
          .eq("organization_id", data.organizationId)
          .eq("task_id", data.filters.id)
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
      );
      if (history.error) throw new Error(history.error.message);
      feed.events = history.data.map((event) => {
        const actor = Array.isArray(event.actor) ? event.actor[0] : event.actor;
        return {
          ...event,
          actor_name: actor?.display_name || actor?.username || "Usuário",
          actor_photo: actor?.avatar_data_url,
        };
      });
    }
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
          "delete",
          "restore",
          "cancel",
          "pause",
          "resume",
          "edit_details",
          "start_documentation",
          "claim",
          "request_complement",
          "resubmit",
          "create",
          "add_item",
          "add_entry",
          "remove_entry",
          "remove_section",
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
    if (data.action === "claim") {
      const { data: claimed, error: claimError } = await db.rpc("claim_user_task", {
        p_org: data.organizationId,
        p_task: data.payload.id,
        p_revision: data.payload.revision,
      });
      if (claimError) throw new Error(claimError.message);
      return claimed as { id: string; documentId?: string; revision?: number };
    }
    const { data: result, error } = await db.rpc("user_tasks_command", {
      p_org: data.organizationId,
      p_action: data.action,
      p_payload: data.payload,
    });
    if (error) throw new Error(error.message);
    return result as { id: string; documentId?: string; revision?: number };
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
      .select("id,title,task_code,kind")
      .eq("organization_id", data.organizationId)
      .or(
        ["assigned_to", "requested_by", "created_by", "documenter_id", "reviewer_id"]
          .map((k) => `${k}.eq.${context.userId}`)
          .join(","),
      );
    if (error) throw new Error(error.message);
    const { data: poolFeed, error: poolError } = await db.rpc("user_tasks_feed", {
      p_org: data.organizationId,
      p_filters: { status: "open" },
    });
    if (poolError) throw new Error(poolError.message);
    const poolTasks = ((poolFeed as TaskFeed | null)?.tasks || [])
      .filter((task) => !task.claimed_by)
      .map((task) => ({
        id: task.id,
        title: task.title,
        task_code: task.task_code,
        kind: task.kind,
      }));
    const taskMap = new Map([...(tasks || []), ...poolTasks].map((task) => [task.id, task]));
    const visibleTasks = [...taskMap.values()];
    if (!visibleTasks.length) return [];
    const { data: flowSettings, error: settingsError } = await db
      .from("task_flow_settings")
      .select("task_kind,system_notifications")
      .eq("organization_id", data.organizationId);
    // Preserve existing in-app notifications until the optional settings migration is applied.
    const settingsAvailable = !settingsError;
    const systemPreferences = new Map(
      (flowSettings || []).map(
        (row: { task_kind: string; system_notifications: Record<string, boolean> }) => [
          row.task_kind,
          row.system_notifications,
        ],
      ),
    );
    const { data: events, error: eventError } = await db
      .from("user_task_events")
      .select("id,task_id,action,note,created_at")
      .in(
        "task_id",
        visibleTasks.map((t) => t.id),
      )
      .eq("organization_id", data.organizationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (eventError) throw new Error(eventError.message);
    const categoryForAction = (action: string) => {
      if (action === "Tarefa criada") return "task_created";
      if (action === "Responsável alterado") return "assignment";
      if (action === "Comentário") return "comment";
      if (
        [
          "Checklist atualizado",
          "Item adicionado",
          "Entrega adicionada",
          "Preenchimento iniciado",
          "Arquivo anexado",
          "Entrega removida",
          "Vínculo de documento excluído",
          "Seção adicional excluída",
        ].includes(action)
      )
        return "checklist";
      return "stage_changed";
    };
    return (events || [])
      .filter((event) => {
        if (!settingsAvailable) return true;
        const task = visibleTasks.find((row) => row.id === event.task_id);
        const preferences = task && systemPreferences.get(task.kind);
        return !preferences || preferences[categoryForAction(event.action)] !== false;
      })
      .map((e) => ({
        id: e.id,
        title: `${visibleTasks.find((t) => t.id === e.task_id)?.task_code || ""} · ${visibleTasks.find((t) => t.id === e.task_id)?.title || "Tarefa"}`,
        description: e.note || e.action,
        tag: e.action,
        updatedAt: e.created_at,
        taskId: e.task_id,
      }));
  });

export const loadTaskExportDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) => scope.extend({ taskId: z.string().uuid() }).parse(v))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const result = await db.rpc("user_task_export_documents", {
      p_org: data.organizationId,
      p_task: data.taskId,
    });
    if (result.error)
      throw new Error(
        result.error.code === "PGRST202"
          ? "Aplique a atualização do Supabase para consultar e baixar as entregas."
          : result.error.message,
      );
    return result.data as {
      documents: {
        id: string;
        name: string;
        module: string;
        code: string;
        content_inline: string;
      }[];
      brand?: { name?: string; logo_data_url?: string; word_header_color?: string };
    };
  });

export const loadHomeDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    scope
      .extend({
        from: z.string().date(),
        until: z.string().date(),
        chartFrom: z.string().date(),
        chartUntil: z.string().date(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const result = await db.rpc("user_home_dashboard", {
      p_org: data.organizationId,
      p_from: data.from,
      p_until: data.until,
      p_chart_from: data.chartFrom,
      p_chart_until: data.chartUntil,
    });
    if (result.error)
      throw new Error(
        result.error.code === "PGRST202"
          ? "Aplique a atualização da Home no Supabase para carregar sua agenda e o gráfico."
          : result.error.message,
      );
    return result.data as {
      tasks: import("./user-tasks").UserTask[];
      attention: { overdue: number; dueSoon: number; review: number };
      completions: { day: string; count: number }[];
      unknownCompletions: number;
    };
  });
