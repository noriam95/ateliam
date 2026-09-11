import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
export type TaskMeeting = {
  id: string;
  organization_id: string;
  organizer_id: string;
  task_id: string | null;
  title: string;
  starts_at: string;
  ends_at: string;
  attendees: string[];
  agenda: string;
  status: "scheduled" | "completed" | "cancelled";
  revision: number;
};
export const loadTaskMeetings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        from: z.string(),
        until: z.string(),
        taskId: z.string().uuid().optional(),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    let q = db
      .from("task_meetings")
      .select("*", { count: "exact" })
      .eq("organization_id", data.organizationId)
      .order("starts_at")
      .limit(500);
    if (data.taskId) q = q.eq("task_id", data.taskId);
    else q = q.lte("starts_at", data.until).gte("ends_at", data.from);
    const { data: rows, error, count } = await q;
    if (error)
      throw new Error(
        error.code === "PGRST205"
          ? "Aplique a atualização de reuniões no Supabase."
          : error.message,
      );
    return { meetings: rows as TaskMeeting[], total: count || 0, userId: context.userId };
  });
export const saveTaskMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        payload: z.object({
          id: z.string().uuid(),
          revision: z.number().int().optional(),
          taskId: z.string().uuid().nullable(),
          title: z.string().trim().min(2).max(200),
          startsAt: z.string().datetime(),
          endsAt: z.string().datetime(),
          attendees: z.array(z.string().email()).max(50),
          agenda: z.string().max(2000),
          status: z.enum(["scheduled", "completed", "cancelled"]),
        }),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: meeting, error } = await db.rpc("task_meeting_save", {
      p_org: data.organizationId,
      p_payload: data.payload,
    });
    if (error) throw new Error(error.message);
    return meeting as TaskMeeting;
  });
