import {
  taskCode,
  localDay,
  taskDate,
  TASK_KINDS,
  TASK_STAGE_LABELS,
  type UserTask,
  type TaskItem,
} from "@/lib/user-tasks";
export function TaskKanbanCard({ task, open }: { task: UserTask; open: () => void }) {
  const groups = new Map<string, TaskItem[]>();
  for (const item of task.checklist) {
    const key = item.group_key || item.key;
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  const completed = task.checklist.filter((i) => i.completed).length;
  const initials = task.assignee_name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
  const latest = task.latest_activity;
  const late = task.status !== "completed" && task.due_on < localDay();
  const modality =
    task.modality === "Sistemas"
      ? "systems"
      : task.modality === "Operacional"
        ? "operational"
        : task.modality === "Dados / BI"
          ? "bi"
          : "automation";
  return (
    <button
      className="ut-card ut-rich-card"
      onClick={open}
      aria-label={`Abrir tarefa ${taskCode(task.id)}: ${task.title}`}
    >
      <span className="ut-card-top">
        <small title={task.id}>{taskCode(task.id)}</small>
        <span className={`ut-modality ut-modality-${modality}`}>
          {task.modality || TASK_KINDS[task.kind]}
        </span>
      </span>
      <strong className="ut-card-title">{task.title}</strong>
      <span className="ut-card-stage">{TASK_STAGE_LABELS[task.stage]}</span>
      <span className="ut-card-progress-label">
        <span>Checklist da modalidade</span>
        <span>
          {completed}/{task.checklist.length}
        </span>
      </span>
      <progress
        aria-label="Entregas concluídas"
        max={task.checklist.length || 1}
        value={completed}
      />
      <span className="ut-card-checklist">
        {[...groups].map(([key, items]) => {
          const done = items.filter((i) => i.completed).length;
          return (
            <span className="ut-card-checkitem" key={key}>
              <span
                aria-hidden="true"
                className={`ut-card-checkmark ${done === items.length ? "ut-card-checkmark-done" : ""}`}
              >
                {done === items.length ? "✓" : ""}
              </span>
              <span>
                {items[0].label}
                {items[0].optional ? " · Opcional" : ""}
              </span>
              <small>
                {done}/{items.length}
              </small>
            </span>
          );
        })}
      </span>
      <span className="ut-card-owner">
        <span className="ut-card-person">
          <span className="ut-avatar" aria-hidden="true">
            {initials}
          </span>
          <span>{task.assignee_name}</span>
        </span>
        <time
          dateTime={task.due_on}
          className={late ? "ut-late" : ""}
          title={`Prazo: ${taskDate(task.due_on)}`}
        >
          {late ? "Atrasada · " : ""}
          {taskDate(task.due_on)}
        </time>
      </span>
      {task.pending_at_transition.some((label) =>
        task.checklist.some((i) => !i.completed && i.label === label),
      ) && <span className="ut-card-pending">Encaminhada com pendências</span>}
      <span className="ut-card-activity">
        <small>Último comentário / movimentação</small>
        <span>
          {latest
            ? latest.action === "Comentário"
              ? latest.note
              : `${latest.action}${latest.note ? `: ${latest.note}` : ""}`
            : "Nenhum registro disponível."}
        </span>
        {latest && (
          <time dateTime={latest.created_at}>
            {new Date(latest.created_at).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            })}
          </time>
        )}
      </span>
    </button>
  );
}
