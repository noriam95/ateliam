import { Pencil } from "lucide-react";
import { taskDate, TASK_KINDS, type UserTask } from "@/lib/user-tasks";

export function TaskHeaderSummary({
  task,
  canEdit,
  expanded,
  toggle,
}: {
  task: UserTask;
  canEdit: boolean;
  expanded: boolean;
  toggle: () => void;
}) {
  return (
    <section className="ut-task-summary" aria-label="Informações da tarefa">
      <div className="ut-summary-heading">
        <h3>Informações da tarefa</h3>
        {canEdit && (
          <button
            type="button"
            className="ut-edit-details"
            aria-haspopup="dialog"
            aria-expanded={expanded}
            onClick={toggle}
          >
            <Pencil size={15} aria-hidden="true" /> Editar dados
          </button>
        )}
      </div>
      <dl className="ut-task-metadata">
        <div>
          <dt>Responsável</dt>
          <dd>
            <span className="ut-avatar" aria-hidden="true">
              {task.assignee_photo ? (
                <img src={task.assignee_photo} alt="" />
              ) : (
                task.assignee_name
                  .split(" ")
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((n) => n[0])
                  .join("")
              )}
            </span>
            {task.assignee_name}
          </dd>
        </div>
        <div>
          <dt>Solicitante</dt>
          <dd>{task.requester_name || "Não informado"}</dd>
        </div>
        <div>
          <dt>Início</dt>
          <dd>
            <time dateTime={task.starts_on}>{taskDate(task.starts_on)}</time>
          </dd>
        </div>
        <div>
          <dt>Prazo</dt>
          <dd>
            <time dateTime={task.due_on}>{taskDate(task.due_on)}</time>
          </dd>
        </div>
        <div>
          <dt>Tipo</dt>
          <dd>{TASK_KINDS[task.kind]}</dd>
        </div>
        <div>
          <dt>Modalidade</dt>
          <dd>{task.modality || "Não se aplica"}</dd>
        </div>
      </dl>
    </section>
  );
}
