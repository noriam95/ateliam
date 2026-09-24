import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  applyNextDocumentCode,
  DOC_TYPE_SIGLA,
  normalizeCodeSettings,
  normalizeSigla,
  type DocType,
} from "./code-generation";
import { dashboardRows } from "./dashboard-pagination";

/** Compare-and-swap protects the shared organization counters across server instances. */
export async function reserveOrganizationCode(
  supabase: SupabaseClient<Database>,
  organizationId: string,
  type: DocType,
  areaSigla: string,
) {
  const sigla = normalizeSigla(areaSigla);
  if (sigla.length !== 3)
    throw new Error("Defina a área responsável com uma sigla de 3 letras antes de salvar.");
  const prefix = `${DOC_TYPE_SIGLA[type]}.${sigla}.`;
  let highest = 0;
  const consider = (code: unknown) => {
    if (typeof code !== "string" || !code.toUpperCase().startsWith(prefix)) return;
    const tail = code.slice(prefix.length);
    if (/^\d+(?:\.TEMP)?$/i.test(tail)) highest = Math.max(highest, Number.parseInt(tail, 10));
  };
  if (type === "processo") {
    const result = await dashboardRows(
      supabase
        .from("organization_processes")
        .select("code")
        .eq("organization_id", organizationId)
        .order("id"),
    );
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data || []) consider(row.code);
  } else {
    const module = type === "mapeamento" ? "ddp" : type === "fluxograma" ? "bpmn" : "pop";
    const result = await dashboardRows(
      supabase
        .from("documents")
        .select("name,content_inline")
        .eq("organization_id", organizationId)
        .eq("module", module)
        .order("id"),
    );
    if (result.error) throw new Error(result.error.message);
    for (const row of result.data || []) {
      consider(row.name.split(/\s+[·•–—-]\s+/)[0]);
      try {
        const parsed = JSON.parse(row.content_inline || "{}");
        const source = parsed.modules || parsed;
        consider(source[module]?.meta?.codigo || source[module]?.codigo || source[module]?.code);
      } catch {
        /* Legacy rows without JSON still reserve the code in their name. */
      }
    }
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const { data: org, error } = await supabase
      .from("organizations")
      .select("code_settings")
      .eq("id", organizationId)
      .single();
    if (error) throw new Error(error.message);
    const settings = normalizeCodeSettings(org.code_settings);
    settings[type].sequences[sigla] = Math.max(settings[type].sequences[sigla] || 1, highest + 1);
    const { code, settings: updated } = applyNextDocumentCode(settings, type, sigla);
    let query = supabase
      .from("organizations")
      .update({ code_settings: updated, updated_at: new Date().toISOString() })
      .eq("id", organizationId);
    query =
      org.code_settings === null
        ? query.is("code_settings", null)
        : query.eq("code_settings", JSON.stringify(org.code_settings));
    const result = await query.select("id").maybeSingle();
    if (result.error) throw new Error(result.error.message);
    if (result.data) return code;
  }
  throw new Error("Não foi possível reservar um código agora. Tente salvar novamente.");
}
