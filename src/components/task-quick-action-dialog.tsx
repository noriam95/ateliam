import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Pause, Ban } from "lucide-react";
import { updateUserTask } from "@/lib/user-tasks.functions";
import { taskCode, type UserTask } from "@/lib/user-tasks";
import { TaskDialog } from "./task-dialog";

export function TaskQuickActionDialog({
  task,
  actions,
  close,
  refresh,
}: {
  task: UserTask;
  actions: ("pause" | "cancel")[];
  close: () => void;
  refresh: () => Promise<void>;
}) {
  const command = useServerFn(updateUserTask);
  const [action, setAction] = useState<"pause" | "cancel" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <TaskDialog
      title={
        action === "cancel"
          ? "Cancelar tarefa"
          : action === "pause"
            ? "Pausar tarefa"
            : "Ações da tarefa"
      }
      onClose={close}
      busy={busy}
      dirty={!!note.trim()}
    >
      <form
        noValidate
        className="ut-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!action || busy) return;
          if (note.trim().length < 3) {
            setError("Informe o motivo com pelo menos 3 caracteres.");
            return;
          }
          setBusy(true);
          setError("");
          try {
            await command({
              data: {
                organizationId: task.organization_id,
                action,
                payload: { id: task.id, revision: task.revision, note: note.trim() },
              },
            });
            await refresh();
            close();
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Não foi possível atualizar a tarefa.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <p>
          <strong>{taskCode(task)}</strong> · {task.title}
        </p>
        {!action ? (
          <div className="ut-inline">
            {actions.map((value) => (
              <button type="button" key={value} onClick={() => setAction(value)}>
                {value === "pause" ? <Pause size={16} /> : <Ban size={16} />}
                {value === "pause" ? "Pausar tarefa" : "Cancelar tarefa"}
              </button>
            ))}
          </div>
        ) : (
          <>
            <p className="ut-muted">
              {action === "cancel"
                ? "A tarefa será encerrada como cancelada. Os registros e arquivos serão preservados."
                : "A tarefa ficará parada até ser retomada."}{" "}
              O motivo ficará no histórico de movimentações.
            </p>
            <label>
              Motivo
              <textarea
                autoFocus
                rows={3}
                maxLength={10000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={busy}
              />
            </label>
            {error && (
              <p role="alert" className="ut-error">
                {error}
              </p>
            )}
            <div className="ut-inline">
              <button type="button" disabled={busy} onClick={() => setAction(null)}>
                Voltar
              </button>
              <button className="ut-primary" disabled={busy}>
                {busy
                  ? "Registrando…"
                  : action === "cancel"
                    ? "Confirmar cancelamento"
                    : "Confirmar pausa"}
              </button>
            </div>
          </>
        )}
      </form>
    </TaskDialog>
  );
}
