import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { updateUserTask } from "@/lib/user-tasks.functions";
import { taskCode, type UserTask } from "@/lib/user-tasks";
import { TaskDialog } from "./task-dialog";
export function TaskDeleteAction({
  task,
  allowed,
  changed,
  onDeleted,
}: {
  task: UserTask;
  allowed: boolean;
  changed: () => Promise<void>;
  onDeleted?: () => void;
}) {
  const command = useServerFn(updateUserTask);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function restore(revision: number) {
    try {
      await command({
        data: {
          organizationId: task.organization_id,
          action: "restore",
          payload: { id: task.id, revision },
        },
      });
      await changed();
      toast.success("Tarefa restaurada.");
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível restaurar a tarefa.");
    }
  }
  if (!allowed) return null;
  return (
    <>
      <button
        className="ut-icon-action ut-delete-action"
        type="button"
        disabled={busy}
        aria-label={task.deleted_at ? "Restaurar tarefa" : `Excluir tarefa ${taskCode(task)}`}
        title={task.deleted_at ? "Restaurar tarefa" : "Excluir tarefa"}
        onClick={(event) => {
          event.stopPropagation();
          if (task.deleted_at) {
            void restore(task.revision);
          } else {
            setError("");
            setConfirm(true);
          }
        }}
      >
        {task.deleted_at ? <Undo2 size={16} /> : <Trash2 size={16} />}
      </button>
      {confirm && (
        <TaskDialog
          title="Excluir tarefa?"
          onClose={() => setConfirm(false)}
          busy={busy}
          className="ut-delete-dialog"
        >
          <div className="ut-form">
            <div className="ut-delete-badge">
              <Trash2 size={20} />
            </div>
            <strong>
              {taskCode(task)} · {task.title}
            </strong>
            <p>
              A tarefa sairá das visualizações ativas. Seu histórico, anexos e documentos vinculados
              serão preservados. A exclusão ficará registrada com autor e data.
            </p>
            {error && (
              <p className="ut-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <footer>
            <button disabled={busy} onClick={() => setConfirm(false)}>
              Voltar
            </button>
            <button
              className="ut-danger-button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const result = await command({
                    data: {
                      organizationId: task.organization_id,
                      action: "delete",
                      payload: { id: task.id, revision: task.revision },
                    },
                  });
                  setConfirm(false);
                  await changed();
                  onDeleted?.();
                  toast.success("Tarefa excluída das visualizações ativas.", {
                    duration: 12000,
                    action: {
                      label: "Desfazer",
                      onClick: () => void restore(result.revision ?? task.revision + 1),
                    },
                  });
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Não foi possível excluir a tarefa.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Excluindo…" : "Excluir tarefa"}
            </button>
          </footer>
        </TaskDialog>
      )}
    </>
  );
}
