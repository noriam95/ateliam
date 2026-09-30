import { documentTitle } from "./document-label";

/** Read only list metadata; never convert or return the diagram XML. */
export function bpmnListMetadata(name: string, content: string | null) {
  let code = "";
  let processId = "";
  try {
    const parsed = JSON.parse(content || "{}");
    const drawing = parsed?.bpmn || parsed;
    if (typeof drawing?.codigo === "string") code = drawing.codigo.trim();
    if (typeof drawing?.processId === "string") processId = drawing.processId;
  } catch {
    // Keep legacy or malformed records consultable by their stored name.
  }
  return { code, title: documentTitle(name, code) || "Sem título", processId };
}
