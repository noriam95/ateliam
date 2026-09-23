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
    <div className="ut-task-metadata">
      <div>
        <small>Responsável</small>
        <span>
          <span className="ut-avatar">
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
          {canEdit && (
            <button
              className="ut-icon-action"
              aria-label="Editar dados da tarefa"
              title="Editar dados da tarefa"
              aria-expanded={expanded}
              onClick={toggle}
            >
              <Pencil size={16} />
            </button>
          )}
        </span>
      </div>
      <div>
        <small>Solicitante</small>
        <span>{task.requester_name}</span>
      </div>
      <div>
        <small>Período</small>
        <span>
          {taskDate(task.starts_on)} → {taskDate(task.due_on)}
        </span>
      </div>
      <div>
        <small>Tipo · modalidade</small>
        <span>
          {TASK_KINDS[task.kind]}
          {task.modality ? ` · ${task.modality}` : ""}
        </span>
      </div>
    </div>
  );
}
