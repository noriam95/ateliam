import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { z } from "zod";

type AuthContext = {
  supabase: SupabaseClient<Database>;
  userId: string;
};

type SaveDocumentInput = {
  id: string;
  content: string;
  comment?: string;
};

async function userOrganizationId(context: AuthContext) {
  const { data, error } = await context.supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", context.userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.organization_id) throw new Error("Usuário sem organização vinculada.");
  return data.organization_id;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function saveDocumentSnapshot(data: SaveDocumentInput, context: AuthContext) {
  const { data: doc, error: docErr } = await context.supabase
    .from("documents")
    .select("*")
    .eq("id", data.id)
    .single();
  if (docErr || !doc) throw new Error(docErr?.message ?? "Documento não encontrado");

  const { data: cfg } = await context.supabase.from("app_config").select("*").eq("id", 1).single();

  const hash = await sha256Hex(data.content);
  let sharepointItemId = doc.sharepoint_item_id;
  let sharepointDriveId = doc.sharepoint_drive_id;
  let sharepointWebUrl = doc.sharepoint_web_url;
  let versionLabel: string | null = null;

  const { isSharePointConfigured, uploadFile } = await import("./sharepoint.server");
  if (cfg?.sharepoint_site_id && cfg?.sharepoint_drive_id && isSharePointConfigured()) {
    try {
      const filename = `${doc.name.replace(/[^\w.-]+/g, "_")}.html`;
      const uploaded = await uploadFile({
        siteId: cfg.sharepoint_site_id,
        driveId: cfg.sharepoint_drive_id,
        folderPath: cfg.sharepoint_folder_path ?? "/Ateliam",
        filename,
        content: data.content,
      });
      sharepointItemId = uploaded.id;
      sharepointDriveId = cfg.sharepoint_drive_id;
      sharepointWebUrl = uploaded.webUrl;
      versionLabel = uploaded.eTag ?? null;
    } catch (e) {
      console.error("SharePoint upload falhou; salvando apenas no banco:", e);
    }
  }

  const nextVersion = (doc.current_version ?? 0) + 1;

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
}

export const listDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d?: { module?: string }) =>
    z.object({ module: z.enum(["bpmn", "policy", "diagnostic"]).optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await userOrganizationId(context);
    let q = context.supabase
      .from("documents")
      .select(
        "id, name, description, owner_id, module, current_version, sharepoint_web_url, updated_at, created_at",
      )
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });
    if (data.module) q = q.eq("module", data.module);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: doc, error } = await context.supabase
      .from("documents")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!doc) throw new Error("Documento não encontrado");

    let content: string | null = doc.content_inline ?? null;
    if (doc.sharepoint_item_id && doc.sharepoint_drive_id) {
      try {
        const { downloadItem, isSharePointConfigured } = await import("./sharepoint.server");
        if (isSharePointConfigured()) {
          content = await downloadItem(
            (
              await context.supabase
                .from("app_config")
                .select("sharepoint_site_id")
                .eq("id", 1)
                .single()
            ).data?.sharepoint_site_id ?? "",
            doc.sharepoint_drive_id,
            doc.sharepoint_item_id,
          );
        }
      } catch (e) {
        console.error("SharePoint download falhou, usando snapshot local:", e);
      }
    }
    return { document: doc, content };
  });

export const createDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { name: string; description?: string; content?: string; module?: string }) =>
    z
      .object({
        name: z.string().min(1).max(200),
        description: z.string().max(500).optional(),
        content: z.string().optional(),
        module: z.enum(["bpmn", "policy", "diagnostic"]).default("bpmn"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const organizationId = await userOrganizationId(context);
    const { data: row, error } = await context.supabase
      .from("documents")
      .insert({
        name: data.name,
        description: data.description ?? null,
        owner_id: context.userId,
        organization_id: organizationId,
        content_inline: data.content ?? null,
        module: data.module,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const saveDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string; content: string; comment?: string }) =>
    z
      .object({
        id: z.string().uuid(),
        content: z.string().min(1).max(20_000_000),
        comment: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => saveDocumentSnapshot(data, context));

export const listVersions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("document_versions")
      .select("id, version_number, author_id, comment, created_at, sharepoint_version_label")
      .eq("document_id", data.id)
      .order("version_number", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const restoreVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { documentId: string; versionId: string }) =>
    z.object({ documentId: z.string().uuid(), versionId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: v, error } = await context.supabase
      .from("document_versions")
      .select("content_snapshot")
      .eq("id", data.versionId)
      .single();
    if (error || !v?.content_snapshot) throw new Error("Versão sem snapshot disponível");
    return await saveDocumentSnapshot(
      {
        id: data.documentId,
        content: v.content_snapshot,
        comment: "Restaurada de versão anterior",
      },
      context,
    );
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("documents").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
