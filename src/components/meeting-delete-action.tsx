import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Trash2 } from "lucide-react";
import { changeMeetingVisibility, type TaskMeeting } from "@/lib/task-meetings.functions";
import { TaskDialog } from "./task-dialog";

export function MeetingDeleteAction({
  meeting,
  changed,
  onDeleted,
}: {
  meeting: TaskMeeting;
  changed: () => Promise<void>;
  onDeleted: (meeting: TaskMeeting) => void;
}) {
  const command = useServerFn(changeMeetingVisibility);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = (action: "delete" | "restore", revision: number) =>
    command({
      data: {
        organizationId: meeting.organization_id,
        id: meeting.id,
        revision,
        action,
      },
    });
  return (
    <>
      <button
        type="button"
        className="ut-icon-action ut-delete-action"
        aria-label={`Excluir reunião ${meeting.title}`}
        title="Excluir reunião"
        onClick={() => {
          setError("");
          setConfirm(true);
        }}
      >
        <Trash2 size={16} />
      </button>
      {confirm && (
        <TaskDialog
          title="Excluir reunião?"
          busy={busy}
          onClose={() => setConfirm(false)}
          className="ut-delete-dialog"
        >
          <div className="ut-form">
            <strong>{meeting.title}</strong>
            <p>
              A reunião será removida da agenda e da lista da tarefa no BF Flow. Você poderá
              desfazer a exclusão logo após confirmar.
            </p>
            <p className="ut-muted">
              Se você criou o compromisso no Outlook, exclua-o também por lá. Esta ação não cancela
              os convites enviados.
            </p>
            {error && (
              <p role="alert" className="ut-error">
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
                  const result = await run("delete", meeting.revision);
                  setConfirm(false);
                  await changed();
                  onDeleted(result);
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : "Não foi possível excluir a reunião.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Excluindo…" : "Excluir reunião"}
            </button>
          </footer>
        </TaskDialog>
      )}
    </>
  );
}
