import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { documentTaskUrl, type TaskAction, type TaskItem, type UserTask } from "@/lib/user-tasks";
import { TaskDialog } from "./task-dialog";

type Props = {
  task: UserTask;
  canEdit: boolean;
  busy: boolean;
  hideDone: boolean;
  edit: (item: TaskItem) => void;
  write: (action: TaskAction, payload: Record<string, unknown>) => Promise<boolean>;
  setBusy: (busy: boolean) => void;
};
export function TaskChecklist({ task, canEdit, busy, hideDone, edit, write, setBusy }: Props) {
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("file");
  const [optional, setOptional] = useState(false);
  const [error, setError] = useState("");
  const [download, setDownload] = useState<{ url: string; name: string } | null>(null);
  const [entryId, setEntryId] = useState(() => crypto.randomUUID());
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploadKey, setUploadKey] = useState("");
  const [retry, setRetry] = useState<{
    key: string;
    attachment: { path: string; name: string; size: number };
  } | null>(null);
  const groups = new Map<string, TaskItem[]>();
  for (const item of task.checklist) {
    const key = item.group_key || item.key;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  async function attach(file: File) {
    setError("");
    if (!file.size || file.size > 20 * 1024 * 1024) {
      setError("Selecione um arquivo de até 20 MB.");
      return;
    }
    setBusy(true);
    try {
      const path = `${task.organization_id}/${task.id}/${uploadKey}/${crypto.randomUUID()}/${file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-160)}`;
      const { error: uploadError } = await supabase.storage
        .from("user-task-files")
        .upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      const attachment = { path, name: file.name, size: file.size };
      setRetry({ key: uploadKey, attachment });
      if (await write("attach_file", { key: uploadKey, attachment })) setRetry(null);
      else setError("Arquivo enviado. Tente registrar o anexo novamente.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }
  return (
    <div className="ut-deliveries">
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        tabIndex={-1}
        aria-label="Selecionar anexo"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void attach(file);
        }}
      />
      {[...groups].map(([key, items]) => {
        if (hideDone && items.every((i) => i.completed)) return null;
        const first = items[0];
        const completed = items.filter((item) => item.completed).length;
        const started = items.some(
          (item) =>
            item.completed ||
            item.stale ||
            item.saved_version != null ||
            item.saved_at ||
            item.document_id ||
            item.attachment ||
            item.content.trim(),
        );
        const status =
          completed === items.length ? "Concluído" : started ? "Em andamento" : "Não iniciado";
        return (
          <details className="ut-delivery-group ut-delivery-disclosure" key={key}>
            <summary className="ut-delivery-summary">
              <span className="ut-delivery-name">
                {first.label}
                {first.optional ? " · Opcional" : ""}
              </span>
              <span className="ut-delivery-status">{status}</span>
              <strong
                className="ut-delivery-count"
                aria-label={`${completed} de ${items.length} entregas concluídas`}
              >
                {completed}/{items.length}
              </strong>
            </summary>
            <div className="ut-delivery-content">
              {items
                .filter((i) => !hideDone || !i.completed)
                .map((item) => {
                  const index = items.indexOf(item);
                  const module =
                    item.entry_type === "pop"
                      ? "pop"
                      : item.entry_type === "mapping"
                        ? "ddp"
                        : item.document_module || task.document_module;
                  return (
                    <div className="ut-delivery-entry" key={item.key}>
                      <div>
                        <strong>
                          {item.entry_type === "file"
                            ? item.attachment?.name || `Anexo ${index + 1}`
                            : `Preenchimento ${index + 1}`}
                        </strong>
                        <small>
                          {item.completed
                            ? "Concluído"
                            : item.stale || item.saved_version !== null || item.content
                              ? "Em andamento"
                              : "A fazer"}
                        </small>
                      </div>
                      {item.entry_type === "file" ? (
                        item.attachment ? (
                          <button
                            disabled={busy}
                            onClick={async () => {
                              setError("");
                              setDownload(null);
                              try {
                                const { data, error: err } = await supabase.storage
                                  .from("user-task-files")
                                  .createSignedUrl(item.attachment!.path, 60, {
                                    download: item.attachment!.name,
                                  });
                                if (err) throw err;
                                setDownload({ url: data.signedUrl, name: item.attachment!.name });
                              } catch (err) {
                                setError((err as Error).message);
                              }
                            }}
                          >
                            Baixar anexo
                          </button>
                        ) : (
                          canEdit && (
                            <button
                              disabled={busy || !!retry}
                              onClick={() => {
                                setUploadKey(item.key);
                                fileInput.current?.click();
                              }}
                            >
                              Enviar arquivo
                            </button>
                          )
                        )
                      ) : item.document_id ? (
                        <a
                          className="ut-button"
                          href={documentTaskUrl(task, item, {
                            id: item.document_id,
                            module,
                            name: item.label,
                            code: "",
                            current_version: 0,
                          })}
                        >
                          {canEdit ? (item.completed ? "Editar" : "Preencher") : "Abrir"}
                        </a>
                      ) : item.entry_type === "mapping" || item.entry_type === "pop" ? (
                        canEdit && (
                          <button
                            disabled={busy}
                            onClick={() => void write("begin_document", { key: item.key })}
                          >
                            Preencher {item.entry_type === "pop" ? "POP" : "mapeamento"}
                          </button>
                        )
                      ) : (
                        <button disabled={busy} onClick={() => edit(item)}>
                          {canEdit ? "Preencher" : "Visualizar"}
                        </button>
                      )}
                    </div>
                  );
                })}
              {canEdit && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void write("add_entry", { key: first.key, entryId: crypto.randomUUID() })
                  }
                >
                  +{" "}
                  {first.entry_type === "file"
                    ? "Adicionar outro anexo"
                    : "Adicionar outro preenchimento"}
                </button>
              )}
            </div>
          </details>
        );
      })}
      {download && (
        <p>
          <a className="ut-button" href={download.url} download={download.name}>
            Salvar {download.name}
          </a>
          <small>Link disponível por 1 minuto.</small>
        </p>
      )}
      {error && (
        <p className="ut-error" role="alert">
          {error}
        </p>
      )}
      {retry && (
        <button
          disabled={busy}
          onClick={async () => {
            if (await write("attach_file", retry)) {
              setRetry(null);
              setError("");
            }
          }}
        >
          Registrar arquivo enviado
        </button>
      )}
      {canEdit && (
        <button
          disabled={busy}
          onClick={() => {
            setEntryId(crypto.randomUUID());
            setAdding(true);
          }}
        >
          + Adicionar item ao checklist
        </button>
      )}
      {adding && (
        <TaskDialog
          title="Adicionar item ao checklist"
          onClose={() => setAdding(false)}
          busy={busy}
          dirty={!!label}
        >
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              if (label.trim().length < 2) {
                setError("Informe o nome do item.");
                return;
              }
              if (await write("add_item", { entryId, label, entryType: type, optional })) {
                setAdding(false);
                setLabel("");
                setError("");
              }
            }}
          >
            <div className="ut-form">
              <label>
                Nome do item
                <input maxLength={120} value={label} onChange={(e) => setLabel(e.target.value)} />
              </label>
              <label>
                Tipo de entrega
                <select value={type} onChange={(e) => setType(e.target.value)}>
                  <option value="file">Anexo</option>
                  <option value="mapping">Preenchimento de mapeamento</option>
                  <option value="pop">Preenchimento de POP</option>
                  <option value="note">Registro em texto</option>
                </select>
              </label>
              <label className="ut-checkbox">
                <input
                  type="checkbox"
                  checked={optional}
                  onChange={(e) => setOptional(e.target.checked)}
                />
                Item opcional
              </label>
              {error && <p role="alert">{error}</p>}
            </div>
            <footer>
              <button type="button" disabled={busy} onClick={() => setAdding(false)}>
                Cancelar
              </button>
              <button className="ut-primary" disabled={busy}>
                Adicionar item
              </button>
            </footer>
          </form>
        </TaskDialog>
      )}
    </div>
  );
}
