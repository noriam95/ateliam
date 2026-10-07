import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

const reminderDaysSchema = z
  .array(z.number().int().min(0).max(30))
  .min(1, "Escolha ao menos um prazo para o lembrete.")
  .max(5)
  .refine((values) => new Set(values).size === values.length, "Os prazos não podem se repetir.");

async function assertSystemAdmin(context: { supabase: SupabaseClient<Database>; userId: string }) {
  const { data, error } = await context.supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", context.userId);
  if (error) throw new Error(error.message);
  if (!data?.some((row: { role: string }) => row.role === "admin"))
    throw new Error("Acesso restrito ao administrador do sistema.");
}

export const getTaskReminderSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSystemAdmin(context);
    const { data, error } = await context.supabase
      .from("task_reminder_settings")
      .select("id, enabled, reminder_days, send_time, timezone, updated_at")
      .eq("id", 1)
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const saveTaskReminderSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        reminderDays: reminderDaysSchema,
        sendTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Informe um horário válido."),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSystemAdmin(context);
    const { data: saved, error } = await context.supabase
      .from("task_reminder_settings")
      .update({
        reminder_days: data.reminderDays,
        send_time: `${data.sendTime}:00`,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
        // Delivery is intentionally kept off until the company configures a provider.
        enabled: false,
      })
      .eq("id", 1)
      .select("id, enabled, reminder_days, send_time, timezone, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return saved;
  });
