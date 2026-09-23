import { Paperclip, Send, FileText, Download, LoaderCircle } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { UserTask, TaskAction } from "@/lib/user-tasks";
type Attachment = { path: string; name: string; size: number };
export function TaskComment({
  task,
  userId,
  busy,
  write,
  onDirty,
}: {
  task: UserTask;
  userId: string;
  busy: boolean;
  write: (a: TaskAction, p: Record<string, unknown>) => Promise<boolean>;
  onDirty: (dirty: boolean) => void;
}) {
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const id = useRef(crypto.randomUUID());
  const uploaded = useRef(new Map<File, Attachment>());
  const input = useRef<HTMLInputElement>(null);
  return (
    <form
      className="ut-comment-composer"
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy || uploading) return;
        setError("");
        if (!note.trim()) {
          setError("Escreva um comentário para acompanhar os anexos.");
          return;
        }
        setUploading(true);
        try {
          const attachments: Attachment[] = [];
          for (const file of files) {
            let attachment = uploaded.current.get(file);
            if (!attachment) {
              const path = `${task.organization_id}/${task.id}/comments/${userId}/${id.current}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160)}`;
              const { error } = await supabase.storage
                .from("user-task-files")
                .upload(path, file, { upsert: false });
              if (error) throw error;
              attachment = { path, name: file.name, size: file.size };
              uploaded.current.set(file, attachment);
            }
            attachments.push(attachment);
          }
          if (await write("comment", { note, commentId: id.current, attachments })) {
            setNote("");
            setFiles([]);
            uploaded.current.clear();
            id.current = crypto.randomUUID();
            onDirty(false);
            if (input.current) input.current.value = "";
          }
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setUploading(false);
        }
      }}
    >
      <label>
        <span className="sr-only">Adicionar comentário</span>
        <textarea
          className="resize-none"
          rows={3}
          value={note}
          disabled={uploading || busy}
          onChange={(e) => {
            setNote(e.target.value);
            onDirty(!!e.target.value || files.length > 0);
          }}
          maxLength={10000}
          placeholder="Escrever um comentário…"
        />
      </label>
      <div className="ut-comment-toolbar">
        <button
          type="button"
          className="ut-icon-button"
          aria-label="Anexar arquivos ao comentário"
          title="Anexar arquivos"
          disabled={uploading || busy}
          onClick={() => input.current?.click()}
        >
          <Paperclip size={18} />
        </button>
        <button className="ut-primary" disabled={busy || uploading || !note.trim()}>
          <Send size={15} />
          {uploading ? "Enviando…" : "Enviar"}
        </button>
        <input
          ref={input}
          hidden
          type="file"
          multiple
          disabled={uploading || busy}
          onChange={(e) => {
            const selected = Array.from(e.target.files || []);
            if (
              selected.length + files.length > 5 ||
              selected.some((f) => !f.size || f.size > 20 * 1024 * 1024)
            ) {
              setError("Selecione até 5 arquivos de até 20 MB cada.");
              e.target.value = "";
              return;
            }
            setFiles([...files, ...selected]);
            onDirty(true);
            setError("");
            e.target.value = "";
          }}
        />
      </div>
      <ul>
        {files.map((file, index) => (
          <li key={index}>
            {file.name}{" "}
            <button
              type="button"
              disabled={uploading || busy}
              aria-label={`Remover ${file.name}`}
              onClick={() => {
                const next = files.filter((_, i) => i !== index);
                setFiles(next);
                onDirty(!!note || next.length > 0);
              }}
            >
              Remover
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="ut-error">
          {error}
        </p>
      )}
    </form>
  );
}
export function CommentAttachment({ attachment }: { attachment: Attachment }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="ut-attachment-download">
      <div className="ut-attachment-file">
        <FileText size={16} />
        <span>
          {attachment.name}
          <small>
            {attachment.size < 1048576
              ? `${Math.ceil(attachment.size / 1024)} KB`
              : `${(attachment.size / 1048576).toFixed(1)} MB`}
          </small>
        </span>
        <button
          className="ut-icon-action"
          disabled={busy}
          aria-label={`Baixar ${attachment.name}`}
          title={`Baixar ${attachment.name}`}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await supabase.storage
                .from("user-task-files")
                .download(attachment.path);
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
              setError(
                cause instanceof Error
                  ? cause.message
                  : "Não foi possível baixar o arquivo. Tente novamente.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? <LoaderCircle size={16} /> : <Download size={16} />}
        </button>
      </div>
      {busy && (
        <span className="ut-sr-only" role="status">
          Preparando arquivo…
        </span>
      )}
      {error && (
        <p className="ut-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
