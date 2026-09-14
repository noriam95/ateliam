import { Paperclip, Send } from "lucide-react";
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
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <div>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" download={attachment.name}>
          Baixar {attachment.name}
        </a>
      ) : (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await supabase.storage
                .from("user-task-files")
                .createSignedUrl(attachment.path, 300, { download: attachment.name });
              if (result.error) throw result.error;
              setUrl(result.data.signedUrl);
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Preparando arquivo…" : attachment.name}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
