import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { loadUserTasks, updateUserTask } from "@/lib/user-tasks.functions";
import { TaskDialog } from "./task-dialog";
import "./user-tasks.css";
export type TaskDocumentSaved = {
  documentId: string;
  version: number;
  updatedAt: string;
  draft: boolean;
};
/** Only mounted when the editor was opened from a checklist. */
export function TaskEditorContext({
  organizationId,
  taskId,
  itemKey,
  documentId,
}: {
  organizationId: string;
  taskId: string;
  itemKey: string;
  documentId: string;
}) {
  const load = useServerFn(loadUserTasks);
  const command = useServerFn(updateUserTask);
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saved = useRef<TaskDocumentSaved | null>(null);
  const query = useQuery({
    queryKey: ["task-editor", taskId],
    queryFn: () => load({ data: { organizationId, filters: { id: taskId } } }),
  });
  const task = query.data?.tasks[0];
  const item = task?.checklist.find((i) => i.key === itemKey);
  const live = useRef({ task, item });
  live.current = { task, item };
  async function record(completed: boolean) {
    const current = live.current;
    if (!current.task || !current.item || !saved.current)
      throw new Error("Não foi possível recuperar o item da tarefa. Atualize e tente novamente.");
    await command({
      data: {
        organizationId,
        action: "item",
        payload: {
          id: taskId,
          revision: current.task.revision,
          key: itemKey,
          documentId,
          savedVersion: saved.current.version,
          savedAt: saved.current.updatedAt,
          content: current.item.content,
          completed,
        },
      },
    });
    const fresh = await query.refetch();
    live.current = {
      task: fresh.data?.tasks[0],
      item: fresh.data?.tasks[0]?.checklist.find((i) => i.key === itemKey),
    };
  }
  const recordRef = useRef(record);
  recordRef.current = record;
  useEffect(() => {
    const handle = async (event: Event) => {
      const detail = (event as CustomEvent<TaskDocumentSaved>).detail;
      if (detail.documentId !== documentId) return;
      saved.current = detail;
      setBusy(true);
      setError("");
      setAsk(false);
      try {
        await recordRef.current(false);
        if (detail.draft)
          toast.success("Item do checklist em andamento. Rascunho não conclui a entrega.");
        else setAsk(true);
      } catch (err) {
        setError(`Documento salvo, mas o checklist não foi atualizado: ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    };
    window.addEventListener("bf-task-document-saved", handle);
    return () => window.removeEventListener("bf-task-document-saved", handle);
  }, [documentId]);
  return (
    <div className="ut-root mb-4">
      <div className="ut-warning">
        <div className="ut-heading" style={{ margin: 0 }}>
          <div>
            <strong>
              {task?.code} · {item?.label || "Item do checklist"}
            </strong>
            <p>
              {busy
                ? "Atualizando checklist…"
                : item?.completed
                  ? "Concluído. Salvar uma edição exigirá nova confirmação."
                  : "Rascunho mantém este item em andamento."}
            </p>
          </div>
          <a
            className="ut-button"
            href={`/?view=tasks&taskState=${encodeURIComponent(JSON.stringify({ id: taskId }))}`}
          >
            Voltar à tarefa
          </a>
        </div>
        {(error || query.error) && (
          <p role="alert" className="ut-error">
            {error || query.error?.message}
            {saved.current && (
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await query.refetch();
                    await recordRef.current(false);
                    setError("");
                    if (!saved.current?.draft) setAsk(true);
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Tentar atualizar checklist
              </button>
            )}
          </p>
        )}
      </div>
      {ask && (
        <TaskDialog
          title="Deseja concluir este item do checklist?"
          onClose={() => setAsk(false)}
          busy={busy}
        >
          <div className="ut-form">
            <p>O documento foi salvo. Confirme se a entrega “{item?.label}” está concluída.</p>
            <p>Se escolher não, o item continuará em andamento.</p>
            {error && (
              <p role="alert" className="ut-error">
                {error}
              </p>
            )}
          </div>
          <footer>
            <button disabled={busy} onClick={() => setAsk(false)}>
              Não, manter em andamento
            </button>
            <button
              className="ut-primary"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await record(true);
                  setAsk(false);
                  toast.success("Item concluído.");
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Sim, concluir item
            </button>
          </footer>
        </TaskDialog>
      )}
    </div>
  );
}
