import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const WORKSPACE_NAME = "Workspace Atelier";

/** Get or create the single workspace document for the current user. */
export const getOrCreateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: existing, error: selErr } = await context.supabase
      .from("documents")
      .select("*")
      .eq("owner_id", context.userId)
      .eq("module", "workspace")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);
    if (existing) return existing;

    const { data: row, error } = await context.supabase
      .from("documents")
      .insert({
        name: WORKSPACE_NAME,
        owner_id: context.userId,
        module: "workspace",
        description: "Workspace pessoal — contém todos os módulos (DDP, POP, BPMN).",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

/** Save a new version of the workspace (snapshot of iframe state). */
export const saveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { content: string; comment?: string }) =>
    z.object({
      content: z.string().min(2).max(20_000_000),
      comment: z.string().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Find or create the workspace row
    const { data: existing } = await context.supabase
      .from("documents")
      .select("*")
      .eq("owner_id", context.userId)
      .eq("module", "workspace")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    let doc = existing;
    if (!doc) {
      const ins = await context.supabase
        .from("documents")
        .insert({
          name: WORKSPACE_NAME,
          owner_id: context.userId,
          module: "workspace",
        })
        .select("*")
        .single();
      if (ins.error) throw new Error(ins.error.message);
      doc = ins.data;
    }

    const hash = await sha256Hex(data.content);
    const nextVersion = (doc.current_version ?? 0) + 1;

    // Try SharePoint upload (best-effort)
    let sharepointItemId = doc.sharepoint_item_id;
    let sharepointDriveId = doc.sharepoint_drive_id;
    let sharepointWebUrl = doc.sharepoint_web_url;
    let versionLabel: string | null = null;

    const { data: cfg } = await context.supabase
      .from("app_config")
      .select("*")
      .eq("id", 1)
      .single();

    if (cfg?.sharepoint_site_id && cfg?.sharepoint_drive_id) {
      try {
        const { isSharePointConfigured, uploadFile } = await import("./sharepoint.server");
        if (isSharePointConfigured()) {
          const uploaded = await uploadFile({
            siteId: cfg.sharepoint_site_id,
            driveId: cfg.sharepoint_drive_id,
            folderPath: cfg.sharepoint_folder_path ?? "/Atelier",
            filename: `${doc.name.replace(/[^\w.-]+/g, "_")}.json`,
            content: data.content,
          });
          sharepointItemId = uploaded.id;
          sharepointDriveId = cfg.sharepoint_drive_id;
          sharepointWebUrl = uploaded.webUrl;
          versionLabel = uploaded.eTag ?? null;
        }
      } catch (e) {
        console.error("SharePoint upload falhou:", e);
      }
    }

    const { error: vErr } = await context.supabase.from("document_versions").insert({
      document_id: doc.id,
      version_number: nextVersion,
      author_id: context.userId,
      comment: data.comment ?? null,
      content_hash: hash,
      content_snapshot: data.content,
      sharepoint_version_label: versionLabel,
    });
    if (vErr) throw new Error(vErr.message);

    const { error: uErr } = await context.supabase
      .from("documents")
      .update({
        content_inline: data.content,
        current_version: nextVersion,
        sharepoint_item_id: sharepointItemId,
        sharepoint_drive_id: sharepointDriveId,
        sharepoint_web_url: sharepointWebUrl,
      })
      .eq("id", doc.id);
    if (uErr) throw new Error(uErr.message);

    return { version: nextVersion, sharepointWebUrl };
  });

export const listWorkspaceVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: doc } = await context.supabase
      .from("documents")
      .select("id")
      .eq("owner_id", context.userId)
      .eq("module", "workspace")
      .limit(1)
      .maybeSingle();
    if (!doc) return [];
    const { data, error } = await context.supabase
      .from("document_versions")
      .select("id, version_number, comment, created_at, sharepoint_version_label")
      .eq("document_id", doc.id)
      .order("version_number", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getWorkspaceVersionContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { versionId: string }) =>
    z.object({ versionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: v, error } = await context.supabase
      .from("document_versions")
      .select("content_snapshot")
      .eq("id", data.versionId)
      .single();
    if (error) throw new Error(error.message);
    return { content: v?.content_snapshot ?? null };
  });
