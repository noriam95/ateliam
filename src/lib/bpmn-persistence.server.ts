import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BpmnDocument } from "./bpmn-document";
import { mappingCodeForMode } from "./document-label";

/** Authorization and catalog validation happen in saveBpmnDocument before this repository call. */
export async function persistBpmnDocument({
  supabase,
  userId,
  organizationId,
  id,
  mutationId,
  expectedVersion,
  expectedUpdatedAt,
  document,
  processVersion,
  reserveCode,
  saveMode = "final",
  versionStore = supabase,
}: {
  supabase: SupabaseClient<Database>;
  versionStore?: SupabaseClient<Database>;
  saveMode?: "draft" | "final";
  userId: string;
  organizationId: string;
  id: string;
  mutationId: string;
  expectedVersion: number | null;
  expectedUpdatedAt: string | null;
  document: BpmnDocument;
  processVersion: number;
  reserveCode?: () => Promise<string | undefined>;
}) {
  const query = () =>
    supabase
      .from("documents")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .eq("module", "bpmn");
  const { data: existing, error: readError } = await query().maybeSingle();
  if (readError) throw new Error(readError.message);
  // The snapshot journal is committed with the document CAS. A retry (or the next
  // authorized save) finishes an interrupted history insert without another version.
  async function flushVersion(row: { content_inline: string | null }) {
    const { pendingVersion: journal, ...snapshot } = JSON.parse(row.content_inline || "{}");
    if (!journal) return;
    const snapshotContent = JSON.stringify(snapshot);
    const find = () =>
      versionStore
        .from("document_versions")
        .select("content_snapshot")
        .eq("document_id", id)
        .eq("version_number", journal.version)
        .maybeSingle();
    const before = await find();
    if (before.error) throw new Error(before.error.message);
    if (before.data) {
      if (before.data.content_snapshot !== snapshotContent)
        throw new Error("CONFLICT: Histórico de versões inconsistente.");
      return;
    }
    const inserted = await versionStore
      .from("document_versions")
      .insert({
        document_id: id,
        version_number: journal.version,
        author_id: journal.authorId,
        content_snapshot: snapshotContent,
        comment: "Versão salva no editor BPMN",
      })
      .select("id")
      .single();
    if (inserted.error) {
      const raced = await find();
      if (raced.data?.content_snapshot !== snapshotContent)
        throw new Error(
          "Não foi possível concluir o histórico. Tente salvar novamente: " +
            inserted.error.message,
        );
    }
  }
  if (existing) {
    await flushVersion(existing);
    if (JSON.parse(existing.content_inline || "{}").mutationId === mutationId) return existing;
  }
  if (
    existing &&
    ((existing.current_version ?? 0) !== expectedVersion ||
      existing.updated_at !== expectedUpdatedAt)
  )
    throw new Error(
      "CONFLICT: Este desenho foi alterado em outra sessão. Exporte seu BPMN antes de reabrir a versão atual.",
    );
  if (!existing && expectedVersion !== null)
    throw new Error("Este desenho foi removido ou não está disponível nesta organização.");
  let persistedCode: string | undefined;
  if (existing) {
    try {
      persistedCode = JSON.parse(existing.content_inline || "{}").bpmn?.codigo;
    } catch {
      /* A legacy file may not have a code. */
    }
  }
  document = {
    ...document,
    codigo:
      persistedCode ||
      (existing && document.codigo) ||
      (reserveCode ? await reserveCode() : document.codigo),
  };
  document = {
    ...document,
    codigo: document.codigo ? mappingCodeForMode(document.codigo, saveMode) : undefined,
    status:
      saveMode === "draft"
        ? "Rascunho"
        : document.status === "Rascunho"
          ? "Em revisão"
          : document.status,
  };
  const version = (existing?.current_version ?? 0) + (saveMode === "final" ? 1 : 0);
  const content = {
    tipo: "bpmn",
    schemaVersion: 2,
    mutationId,
    updatedBy: userId,
    titulo: document.processName,
    persistence: { saveMode, draft: saveMode === "draft" },
    bpmn: { ...document, poolName: document.processName },
  };
  const payload = {
    name: document.codigo ? `${document.codigo} - ${document.processName}` : document.processName,
    module: "bpmn",
    organization_id: organizationId,
    content_inline: JSON.stringify({
      ...content,
      ...(saveMode === "final" ? { pendingVersion: { version, authorId: userId } } : {}),
    }),
    primary_process_id: document.processId,
    primary_process_version: processVersion,
    current_version: version,
    updated_at: new Date(
      Math.max(Date.now(), Date.parse(existing?.updated_at || "") + 1 || 0),
    ).toISOString(),
  };
  const result = existing
    ? await supabase
        .from("documents")
        .update(payload)
        .eq("id", id)
        .eq("organization_id", organizationId)
        .eq("module", "bpmn")
        .eq("current_version", expectedVersion!)
        .eq("updated_at", expectedUpdatedAt!)
        .select("*")
        .maybeSingle()
    : await supabase
        .from("documents")
        .insert({ ...payload, id: id, owner_id: userId })
        .select("*")
        .single();
  if (result.error || !result.data) {
    const retry = await query().maybeSingle();
    if (retry.data) {
      if (JSON.parse(retry.data.content_inline || "{}").mutationId === mutationId) {
        await flushVersion(retry.data);
        return retry.data;
      }
    }
    throw new Error(
      result.error?.code === "23505" || !result.error
        ? "CONFLICT: Outra sessão salvou este desenho. Exporte suas alterações antes de reabrir."
        : result.error.message,
    );
  }
  await flushVersion(result.data);
  return result.data;
}
