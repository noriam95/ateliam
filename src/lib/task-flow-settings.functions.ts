import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const kinds = ["mapping", "improvement", "document"] as const;
const channels = ["task_created", "stage_changed", "assignment", "checklist", "comment"] as const;
const scope = z.object({ organizationId: z.string().uuid() });
const channelPrefs = z.object(
  Object.fromEntries(channels.map((key) => [key, z.boolean()])) as Record<
    (typeof channels)[number],
    z.ZodBoolean
  >,
);

async function assertSystemAdmin(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("user_roles").select("role").eq("user_id", userId);
  if (error) throw new Error(error.message);
  if (!data?.some((role: { role: string }) => role.role === "admin"))
    throw new Error("Acesso restrito ao administrador do sistema.");
}

export const getTaskFlowSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => scope.parse(input))
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await assertSystemAdmin(db, context.userId);
    const [settingsResult, feedResult] = await Promise.all([
      db
        .from("task_flow_settings")
        .select("task_kind,default_assignee_id,system_notifications,email_notifications,updated_at")
        .eq("organization_id", data.organizationId),
      db.rpc("user_tasks_feed", { p_org: data.organizationId, p_filters: {} }),
    ]);
    if (settingsResult.error) throw new Error(settingsResult.error.message);
    if (feedResult.error) throw new Error(feedResult.error.message);
    const feed = feedResult.data as {
      people?: { id: string; name: string; can_edit: boolean }[];
    };
    return {
      settings: settingsResult.data || [],
      people: (feed.people || []).filter((person) => person.can_edit),
      emailConfigured: false,
    };
  });

export const saveTaskFlowSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    scope
      .extend({
        kind: z.enum(kinds),
        defaultAssigneeId: z.string().uuid().nullable(),
        systemNotifications: channelPrefs,
        emailNotifications: channelPrefs,
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    await assertSystemAdmin(db, context.userId);
    if (data.defaultAssigneeId) {
      const { data: feed, error: feedError } = await db.rpc("user_tasks_feed", {
        p_org: data.organizationId,
        p_filters: {},
      });
      if (feedError) throw new Error(feedError.message);
      const people = (feed as { people?: { id: string; can_edit: boolean }[] }).people || [];
      if (!people.some((person) => person.id === data.defaultAssigneeId && person.can_edit))
        throw new Error("Selecione um usuário com acesso de edição nesta organização.");
    }
    const { data: saved, error } = await db
      .from("task_flow_settings")
      .upsert(
        {
          organization_id: data.organizationId,
          task_kind: data.kind,
          default_assignee_id: data.defaultAssigneeId,
          system_notifications: data.systemNotifications,
          email_notifications: data.emailNotifications,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "organization_id,task_kind" },
      )
      .select("task_kind,default_assignee_id,system_notifications,email_notifications,updated_at")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });
