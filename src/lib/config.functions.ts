import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getAppConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.from("app_config").select("*").eq("id", 1).single();
    if (error) throw new Error(error.message);
    const { isSharePointConfigured } = await import("./sharepoint.server");
    return { config: data, connectorReady: isSharePointConfigured() };
  });

export const updateAppConfig = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sharepoint_site_id?: string; sharepoint_drive_id?: string; sharepoint_folder_path?: string }) =>
    z.object({
      sharepoint_site_id: z.string().max(500).optional().nullable(),
      sharepoint_drive_id: z.string().max(500).optional().nullable(),
      sharepoint_folder_path: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Apenas administradores podem alterar a configuração.");
    const { error } = await context.supabase
      .from("app_config")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSharePointSites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query?: string }) => z.object({ query: z.string().max(200).optional() }).parse(d))
  .handler(async ({ data }) => {
    const sp = await import("./sharepoint.server");
    return await sp.listSites(data.query);
  });

export const listSharePointDrives = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { siteId: string }) => z.object({ siteId: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const sp = await import("./sharepoint.server");
    return await sp.listDrives(data.siteId);
  });

export const getMe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: profile }, { data: roles }] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId),
    ]);
    return {
      userId: context.userId,
      profile,
      roles: (roles ?? []).map((r) => r.role),
    };
  });
