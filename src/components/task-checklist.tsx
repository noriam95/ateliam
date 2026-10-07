import { documentLabel } from "@/lib/document-label";
import { TaskDocumentPreview } from "./task-delivery-export";
import { Pencil, Trash2, Eye, Paperclip, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  documentTaskPreviewUrl,
  documentTaskUrl,
  type TaskAction,
  type TaskItem,
  type UserTask,
} from "@/lib/user-tasks";
import { DEFAULT_MAPPING_SECTIONS } from "@/lib/user-tasks";
import { TaskDialog } from "./task-dialog";
import { TaskAttachmentActions } from "./task-attachment-actions";

function hasTaskContent(content: string) {
  return (
    content
      .replace(/<br\s*\/?\s*>/gi, "")
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;|&#160;/gi, " ")
      .trim().length > 0
  );
}

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
  const [removingSection, setRemovingSection] = useState<TaskItem | null>(null);
  const [removing, setRemoving] = useState<TaskItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("file");
  const [optional, setOptional] = useState(false);
  const [error, setError] = useState("");
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
      if (await write("attach_file", { key: uploadKey, attachment, replace: true })) setRetry(null);
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
            item.legacy_attachment ||
            hasTaskContent(item.content),
        );
        const status =
          completed === items.length ? "Concluído" : started ? "Em andamento" : "Pendente";
        const checklistStatus =
          completed === items.length ? "completed" : started ? "in-progress" : "pending";
        return (
          <details
            className="ut-delivery-group ut-delivery-disclosure"
            data-checklist-status={checklistStatus}
            key={key}
          >
            <summary className="ut-delivery-summary">
              <span className="ut-delivery-name">
                {first.key === "mapping" ? "Relatório" : first.label}
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
                  const historicalAttachment =
                    item.legacy_attachment ||
                    (item.key === "premises" ? item.attachment : undefined);
                  const itemStarted = Boolean(
                    item.stale ||
                    item.saved_version != null ||
                    item.saved_at ||
                    item.document_id ||
                    item.attachment ||
                    item.legacy_attachment ||
                    hasTaskContent(item.content),
                  );
                  const itemStatus = item.completed
                    ? "completed"
                    : itemStarted
                      ? "in-progress"
                      : "pending";
                  const module =
                    item.entry_type === "pop"
                      ? "pop"
                      : item.entry_type === "mapping"
                        ? "ddp"
                        : item.entry_type === "flowchart"
                          ? "bpmn"
                          : item.document_module || task.document_module;
                  return (
                    <div
                      className="ut-delivery-entry"
                      data-checklist-status={itemStatus}
                      key={item.key}
                    >
                      <div>
                        <strong>
                          {item.entry_type === "file" && item.key !== "premises"
                            ? item.attachment?.name || `Anexo ${index + 1}`
                            : item.document_id
                              ? documentLabel(item.document_code, item.document_name || item.label)
                              : item.key === "premises"
                                ? "Registro de premissas"
                                : `Preenchimento ${index + 1}`}
                        </strong>
                        <small>
                          {item.completed ? "Concluído" : itemStarted ? "Em andamento" : "Pendente"}
                        </small>
                      </div>
                      {historicalAttachment && (
                        <div className="ut-legacy-delivery-attachment">
                          <span>Arquivo anterior</span>
                          <TaskAttachmentActions
                            attachment={historicalAttachment}
                            disabled={busy}
                            onError={setError}
                          />
                        </div>
                      )}
                      {item.key !== "premises" && item.entry_type === "file" ? (
                        item.attachment ? (
                          <div className="ut-entry-actions">
                            <TaskAttachmentActions
                              attachment={item.attachment}
                              disabled={busy}
                              onError={setError}
                            />
                            {canEdit && (
                              <>
                                <button
                                  className="ut-icon-button"
                                  title="Substituir arquivo"
                                  aria-label="Substituir arquivo"
                                  disabled={busy || !!retry}
                                  onClick={() => {
                                    setUploadKey(item.key);
                                    fileInput.current?.click();
                                  }}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  className="ut-icon-button"
                                  title="Excluir arquivo do item"
                                  aria-label="Excluir arquivo do item"
                                  disabled={busy}
                                  onClick={() => setRemoving(item)}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </>
                            )}
                          </div>
                        ) : (
                          canEdit && (
                            <button
                              disabled={busy || !!retry}
                              onClick={() => {
                                setUploadKey(item.key);
                                fileInput.current?.click();
                              }}
                            >
                              <Paperclip size={16} /> Anexar arquivo
                            </button>
                          )
                        )
                      ) : item.document_id ? (
                        <div className="ut-entry-actions">
                          {module === "bpmn" ? (
                            <a
                              className="ut-button ut-icon-button"
                              aria-label="Visualizar fluxograma"
                              title="Visualizar fluxograma"
                              target="_blank"
                              rel="noreferrer"
                              href={documentTaskPreviewUrl(task, item, {
                                id: item.document_id,
                                module,
                                name: item.label,
                                code: "",
                                current_version: 0,
                              })}
                            >
                              <Eye size={16} />
                            </a>
                          ) : (
                            <TaskDocumentPreview task={task} documentId={item.document_id} />
                          )}
                          {canEdit && (
                            <a
                              className="ut-button ut-icon-button"
                              aria-label="Editar documento"
                              title="Editar documento"
                              href={documentTaskUrl(task, item, {
                                id: item.document_id,
                                module,
                                name: item.label,
                                code: "",
                                current_version: 0,
                              })}
                            >
                              <Pencil size={16} />
                            </a>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              className="ut-icon-button"
                              disabled={busy}
                              aria-label="Excluir vínculo do documento"
                              title="Excluir vínculo do documento"
                              onClick={() => setRemoving(item)}
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      ) : ["mapping", "pop", "flowchart"].includes(item.entry_type || "") ? (
                        canEdit && (
                          <div className="ut-inline">
                            <button
                              disabled={busy}
                              onClick={() => void write("begin_document", { key: item.key })}
                            >
                              <Pencil size={16} />
                              {item.entry_type === "flowchart" ? "Desenhar novo" : "Preencher novo"}
                            </button>
                            <button disabled={busy} onClick={() => edit(item)}>
                              Selecionar existente
                            </button>
                          </div>
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
                <div className="ut-delivery-toolbar">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void write("add_entry", { key: first.key, entryId: crypto.randomUUID() })
                    }
                  >
                    <Plus size={16} />{" "}
                    {first.entry_type === "file"
                      ? "Adicionar outro anexo"
                      : "Adicionar outro preenchimento"}
                  </button>
                  {(task.modality === "Outros" || !DEFAULT_MAPPING_SECTIONS.includes(key)) && (
                    <button
                      className="ut-icon-button"
                      disabled={busy}
                      title="Excluir seção adicional"
                      aria-label={`Excluir seção ${first.label}`}
                      onClick={() => setRemovingSection(first)}
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              )}
            </div>
          </details>
        );
      })}
      {error && (
        <p className="ut-error" role="alert">
          {error}
        </p>
      )}
      {retry && (
        <button
          disabled={busy}
          onClick={async () => {
            if (await write("attach_file", { ...retry, replace: true })) {
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
          <Plus size={16} /> Adicionar item ao checklist
        </button>
      )}
      {removingSection && (
        <TaskDialog
          title="Excluir seção do checklist"
          busy={busy}
          onClose={() => setRemovingSection(null)}
        >
          <div className="ut-form">
            <p>
              Excluir “{removingSection.label}” e suas entregas desta tarefa? Os documentos dos
              módulos de origem serão preservados.
            </p>
          </div>
          <footer>
            <button disabled={busy} onClick={() => setRemovingSection(null)}>
              Cancelar
            </button>
            <button
              className="ut-primary"
              disabled={busy}
              onClick={async () => {
                if (await write("remove_section", { key: removingSection.key }))
                  setRemovingSection(null);
              }}
            >
              Excluir seção
            </button>
          </footer>
        </TaskDialog>
      )}
      {task.modality === "Outros" && !groups.size && (
        <p className="ut-muted">
          Monte o checklist adicionando formulários, anexos ou registros em texto.
        </p>
      )}
      {removing && (
        <TaskDialog title="Excluir entrega do item" busy={busy} onClose={() => setRemoving(null)}>
          <div className="ut-form">
            <p>
              Remover “{removing.attachment?.name || removing.document_name || removing.label}”
              deste item? A seção do checklist será mantida. Documentos de mapeamento e POP
              continuam disponíveis no módulo de origem.
            </p>
          </div>
          <footer>
            <button disabled={busy} onClick={() => setRemoving(null)}>
              Cancelar
            </button>
            <button
              className="ut-primary"
              disabled={busy}
              onClick={async () => {
                if (await write("remove_entry", { key: removing.key })) setRemoving(null);
              }}
            >
              Excluir vínculo
            </button>
          </footer>
        </TaskDialog>
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
                  <option value="flowchart">Fluxograma BPMN</option>
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
