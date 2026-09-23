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
  deleted_at?: string | null;
  people_search?: string;
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
    const { data: people, error: peopleError } = await db
      .from("profiles")
      .select("id,display_name,username,email");
    if (peopleError) throw new Error(peopleError.message);
    const meetings = (rows as TaskMeeting[])
      .filter((m) => !m.deleted_at)
      .map((m) => ({
        ...m,
        people_search: (people || [])
          .filter(
            (p) =>
              p.id === m.organizer_id ||
              m.attendees.some(
                (email) => email.toLowerCase() === (p.email || p.username || "").toLowerCase(),
              ),
          )
          .map((p) => [p.display_name, p.username, p.email].filter(Boolean).join(" "))
          .join(" "),
      }));
    return {
      meetings,
      total: count || 0,
      userId: context.userId,
      userEmail: String(context.claims.email || ""),
    };
  });
export const saveTaskMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        payload: z
          .object({
            id: z.string().uuid(),
            revision: z.number().int().optional(),
            taskId: z.string().uuid().nullable(),
            title: z.string().trim().min(2).max(200),
            startsAt: z.string().datetime(),
            endsAt: z.string().datetime(),
            attendees: z.array(z.string().email()).max(50),
            agenda: z.string().max(2000),
            status: z.enum(["scheduled", "completed", "cancelled"]),
          })
          .refine((p) => new Date(p.endsAt).getTime() > new Date(p.startsAt).getTime(), {
            message: "O fim da reunião deve ser posterior ao início.",
            path: ["endsAt"],
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

export const changeMeetingVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((v: unknown) =>
    z
      .object({
        organizationId: z.string().uuid(),
        id: z.string().uuid(),
        revision: z.number().int().nonnegative(),
        action: z.enum(["delete", "restore"]),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    const db = context.supabase as unknown as SupabaseClient;
    const { data: meeting, error } = await db.rpc("task_meeting_visibility", {
      p_org: data.organizationId,
      p_id: data.id,
      p_revision: data.revision,
      p_action: data.action,
    });
    if (error)
      throw new Error(
        error.code === "PGRST202"
          ? "A exclusão de reuniões depende da atualização do banco de dados."
          : error.message,
      );
    return meeting as TaskMeeting;
  });
