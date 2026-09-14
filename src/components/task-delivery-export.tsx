import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, Eye } from "lucide-react";
import { loadTaskExportDocuments } from "@/lib/user-tasks.functions";
import { supabase } from "@/integrations/supabase/client";
import { taskCode, type UserTask } from "@/lib/user-tasks";
import { TaskDialog } from "./task-dialog";

const filename = (name: string) => name.replace(/[<>:"/\\|?*]/g, "_").slice(0, 160) || "entrega";
function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export function TaskChecklistDownload({ task }: { task: UserTask }) {
  const load = useServerFn(loadTaskExportDocuments);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const items = task.checklist.filter((i) => i.document_id || i.attachment);
  return (
    <div className="ut-bundle-download">
      <button
        disabled={busy || !items.length}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const [{ default: JSZip }, renderer, data] = await Promise.all([
              import("jszip"),
              import("@/routes/_authenticated/m.$module"),
              load({ data: { organizationId: task.organization_id, taskId: task.id } }),
            ]);
            const zip = new JSZip();
            for (const [index, item] of items.entries()) {
              setProgress(`Preparando ${index + 1} de ${items.length}`);
              const prefix = `${String(index + 1).padStart(2, "0")}-`;
              if (item.attachment) {
                const result = await supabase.storage
                  .from("user-task-files")
                  .download(item.attachment.path);
                if (result.error)
                  throw new Error(
                    `Não foi possível baixar ${item.attachment.name}: ${result.error.message}`,
                  );
                zip.file(prefix + filename(item.attachment.name), await result.data.arrayBuffer());
              } else {
                const doc = data.documents.find((d) => d.id === item.document_id);
                if (!doc)
                  throw new Error(
                    `Documento de ${item.label} não encontrado. Nenhum ZIP foi gerado.`,
                  );
                const rendered = renderer.renderTaskDelivery(
                  doc.content_inline,
                  doc.module,
                  data.brand,
                );
                zip.file(
                  prefix + filename(`${doc.code ? doc.code + " - " : ""}${doc.name}`) + ".docx",
                  await rendered.word.arrayBuffer(),
                );
              }
            }
            setProgress("Compactando arquivos…");
            save(
              await zip.generateAsync({ type: "blob", compression: "DEFLATE" }),
              `${filename(taskCode(task))}-entregas.zip`,
            );
            setProgress("Download preparado.");
          } catch (e) {
            setError((e as Error).message);
            setProgress("");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Download size={16} />
        {busy ? "Preparando ZIP…" : "Baixar todas as entregas (.zip)"}
      </button>
      {progress && <small role="status">{progress}</small>}
      {error && (
        <p className="ut-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function TaskDocumentPreview({ task, documentId }: { task: UserTask; documentId: string }) {
  const load = useServerFn(loadTaskExportDocuments);
  const [busy, setBusy] = useState(false);
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <button
        className="ut-icon-button"
        aria-label="Visualizar documento"
        title="Visualizar documento"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const [data, renderer] = await Promise.all([
              load({ data: { organizationId: task.organization_id, taskId: task.id } }),
              import("@/routes/_authenticated/m.$module"),
            ]);
            const doc = data.documents.find((d) => d.id === documentId);
            if (!doc) throw new Error("Documento não encontrado.");
            setHtml(renderer.renderTaskDelivery(doc.content_inline, doc.module, data.brand).html);
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Eye size={16} />
      </button>
      {error && (
        <span role="alert" className="ut-error">
          {error}
        </span>
      )}
      {html && (
        <TaskDialog title="Visualizar documento" onClose={() => setHtml("")}>
          <iframe
            title="Documento preenchido — somente leitura"
            srcDoc={html}
            sandbox=""
            style={{ width: "100%", height: "70dvh", border: 0, background: "white" }}
          />
        </TaskDialog>
      )}
    </>
  );
}
