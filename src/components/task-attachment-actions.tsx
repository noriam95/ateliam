import { Download, Eye, LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TaskDialog } from "./task-dialog";

export type TaskAttachment = { path: string; name: string; size: number };

type AttachmentPreview =
  | { kind: "docx"; blob: Blob }
  | { kind: "image" | "pdf" | "audio" | "video"; url: string }
  | { kind: "text"; content: string }
  | { kind: "unsupported" };

function extension(name: string) {
  return name.split(".").pop()?.toLocaleLowerCase() || "";
}

async function createPreview(attachment: TaskAttachment, blob: Blob): Promise<AttachmentPreview> {
  const fileExtension = extension(attachment.name);
  if (fileExtension === "docx") return { kind: "docx", blob };
  if (
    blob.type.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(fileExtension)
  )
    return { kind: "image", url: URL.createObjectURL(blob) };
  if (blob.type === "application/pdf" || fileExtension === "pdf")
    return { kind: "pdf", url: URL.createObjectURL(blob) };
  if (blob.type.startsWith("audio/")) return { kind: "audio", url: URL.createObjectURL(blob) };
  if (blob.type.startsWith("video/")) return { kind: "video", url: URL.createObjectURL(blob) };
  if (
    blob.type.startsWith("text/") ||
    ["txt", "csv", "json", "xml", "md", "log"].includes(fileExtension)
  )
    return { kind: "text", content: await blob.text() };
  return { kind: "unsupported" };
}

function DocxPreview({ blob }: { blob: Blob }) {
  const container = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Preparando visualização…");
  useEffect(() => {
    const target = container.current;
    if (!target) return;
    let active = true;
    target.replaceChildren();
    void import("docx-preview")
      .then(({ renderAsync }) =>
        renderAsync(blob, target, undefined, {
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          breakPages: true,
          useBase64URL: true,
        }),
      )
      .then(() => {
        if (active) setStatus("");
      })
      .catch((cause) => {
        if (active)
          setStatus(
            cause instanceof Error ? cause.message : "Não foi possível interpretar o arquivo DOCX.",
          );
      });
    return () => {
      active = false;
      target.replaceChildren();
    };
  }, [blob]);
  return (
    <div className="ut-docx-preview">
      {status && <p role="status">{status}</p>}
      <div ref={container} />
    </div>
  );
}

export function TaskAttachmentActions({
  attachment,
  className = "ut-icon-button",
  disabled = false,
  onError,
}: {
  attachment: TaskAttachment;
  className?: string;
  disabled?: boolean;
  onError?: (message: string) => void;
}) {
  const [action, setAction] = useState<"preview" | "download" | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<AttachmentPreview | null>(null);
  useEffect(
    () => () => {
      if (attachmentPreview && "url" in attachmentPreview)
        URL.revokeObjectURL(attachmentPreview.url);
    },
    [attachmentPreview],
  );

  function closePreview() {
    setAttachmentPreview(null);
  }

  async function preview() {
    setAction("preview");
    onError?.("");
    try {
      const result = await supabase.storage.from("user-task-files").download(attachment.path);
      if (result.error) throw result.error;
      setAttachmentPreview(await createPreview(attachment, result.data));
    } catch (cause) {
      onError?.(
        cause instanceof Error
          ? cause.message
          : "Não foi possível visualizar o arquivo. Tente novamente.",
      );
    } finally {
      setAction(null);
    }
  }

  async function download() {
    setAction("download");
    onError?.("");
    try {
      const result = await supabase.storage.from("user-task-files").download(attachment.path);
      if (result.error) throw result.error;
      const url = URL.createObjectURL(result.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = attachment.name;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      onError?.(
        cause instanceof Error
          ? cause.message
          : "Não foi possível baixar o arquivo. Tente novamente.",
      );
    } finally {
      setAction(null);
    }
  }

  return (
    <>
      <span className="ut-attachment-actions">
        <button
          type="button"
          className={className}
          disabled={disabled || action !== null}
          aria-label={`Visualizar ${attachment.name}`}
          title={`Visualizar ${attachment.name}`}
          onClick={() => void preview()}
        >
          {action === "preview" ? <LoaderCircle size={16} /> : <Eye size={16} />}
        </button>
        <button
          type="button"
          className={className}
          disabled={disabled || action !== null}
          aria-label={`Baixar ${attachment.name}`}
          title={`Baixar ${attachment.name}`}
          onClick={() => void download()}
        >
          {action === "download" ? <LoaderCircle size={16} /> : <Download size={16} />}
        </button>
      </span>
      {attachmentPreview && (
        <TaskDialog
          title={`Visualizar ${attachment.name}`}
          onClose={closePreview}
          wide
          className="ut-attachment-preview-dialog"
        >
          <div className="ut-attachment-preview-body">
            {attachmentPreview.kind === "docx" && <DocxPreview blob={attachmentPreview.blob} />}
            {attachmentPreview.kind === "image" && (
              <img src={attachmentPreview.url} alt={attachment.name} />
            )}
            {attachmentPreview.kind === "pdf" && (
              <iframe src={attachmentPreview.url} title={attachment.name} />
            )}
            {attachmentPreview.kind === "audio" && <audio src={attachmentPreview.url} controls />}
            {attachmentPreview.kind === "video" && <video src={attachmentPreview.url} controls />}
            {attachmentPreview.kind === "text" && <pre>{attachmentPreview.content}</pre>}
            {attachmentPreview.kind === "unsupported" && (
              <div className="ut-attachment-preview-empty">
                <p>Este formato não possui visualização interna.</p>
                <button type="button" onClick={() => void download()} disabled={action !== null}>
                  <Download size={16} /> Baixar arquivo
                </button>
              </div>
            )}
          </div>
        </TaskDialog>
      )}
    </>
  );
}
