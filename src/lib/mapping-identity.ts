import { mappingCodeForMode } from "./document-label";

export async function prepareMappingIdentity({
  content,
  savedContent,
  requestedCode,
  automatic,
  mode,
  reserve,
}: {
  content: string;
  savedContent?: string | null;
  requestedCode?: string | null;
  automatic: boolean;
  mode: "draft" | "final";
  reserve: (area: string) => Promise<string>;
}) {
  const parsed = JSON.parse(content);
  const source = parsed.modules || parsed;
  if (!source.ddp?.meta) throw new Error("Conteúdo do mapeamento inválido.");
  let savedCode = "";
  try {
    const saved = JSON.parse(savedContent || "{}");
    savedCode = String((saved.modules || saved).ddp?.meta?.codigo || "").trim();
  } catch {
    /* Legacy content receives its first identity when saved. */
  }
  let code = automatic ? savedCode : requestedCode?.trim() || savedCode;
  if (!code) {
    if (!automatic && mode === "final")
      throw new Error("Informe o código do mapeamento antes de salvar.");
    code = await reserve(String(source.ddp.meta.area || "").trim());
  }
  code = mappingCodeForMode(code, mode);
  source.ddp.meta.codigo = code;
  parsed.persistence = { ...parsed.persistence, saveMode: mode, draft: mode === "draft" };
  return { code, content: JSON.stringify(parsed) };
}
