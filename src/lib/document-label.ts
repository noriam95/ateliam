/** Stored document names may already include their code, including legacy repetitions. */
export function documentTitle(name: string | null | undefined, code: string | null | undefined) {
  let title = (name || "").trim();
  const base = (code || "").trim().replace(/\.TEMP$/i, "");
  if (!base) return title;
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`^${escaped}(?:\\.TEMP)?(?:\\s*[·•–—-]\\s*|\\s*$)`, "i");
  while (prefix.test(title)) title = title.replace(prefix, "").trim();
  return title;
}

export function documentLabel(code: string | null | undefined, name: string | null | undefined) {
  const title = documentTitle(name, code);
  return [code?.trim(), title].filter(Boolean).join(" · ") || "Sem título";
}

/** A draft reserves the same numeric identity that it keeps when finalized. */
export function mappingCodeForMode(code: string, mode: "draft" | "final") {
  const base = code.trim().replace(/(?:\.TEMP)+$/i, "");
  return base ? `${base}${mode === "draft" ? ".TEMP" : ""}` : "";
}
