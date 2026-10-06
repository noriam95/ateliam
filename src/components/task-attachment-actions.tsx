import { Download, Eye, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TaskAttachment = { path: string; name: string; size: number };

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

  async function preview() {
    const previewWindow = window.open("about:blank", "_blank");
    if (!previewWindow) {
      onError?.(
        "O navegador bloqueou a visualização. Permita a abertura de novas abas e tente novamente.",
      );
      return;
    }
    previewWindow.opener = null;
    setAction("preview");
    onError?.("");
    try {
      const result = await supabase.storage
        .from("user-task-files")
        .createSignedUrl(attachment.path, 300);
      if (result.error) throw result.error;
      previewWindow.location.replace(result.data.signedUrl);
    } catch (cause) {
      previewWindow.close();
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
    </>
  );
}
