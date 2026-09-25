import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { BpmnDocument } from "./bpmn-document";

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
}: {
  supabase: SupabaseClient<Database>;
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
  if (existing) {
    try {
      if (JSON.parse(existing.content_inline || "{}").mutationId === mutationId) return existing;
    } catch {
      /* Legacy content has no mutation identity. */
    }
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
    codigo: existing
      ? persistedCode || document.codigo
      : reserveCode
        ? await reserveCode()
        : document.codigo,
  };
  const payload = {
    name: document.codigo ? `${document.codigo} - ${document.processName}` : document.processName,
    module: "bpmn",
    organization_id: organizationId,
    content_inline: JSON.stringify({
      tipo: "bpmn",
      schemaVersion: 2,
      mutationId: mutationId,
      updatedBy: userId,
      titulo: document.processName,
      bpmn: { ...document, poolName: document.processName },
    }),
    primary_process_id: document.processId,
    primary_process_version: processVersion,
    current_version: (existing?.current_version ?? 0) + 1,
    updated_at: new Date().toISOString(),
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
      try {
        if (JSON.parse(retry.data.content_inline || "{}").mutationId === mutationId)
          return retry.data;
      } catch {
        /* Ignore malformed historical data. */
      }
    }
    throw new Error(
      result.error?.code === "23505" || !result.error
        ? "CONFLICT: Outra sessão salvou este desenho. Exporte suas alterações antes de reabrir."
        : result.error.message,
    );
  }
  return result.data;
}
