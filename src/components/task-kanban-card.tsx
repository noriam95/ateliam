import type { ReactNode } from "react";
import { taskCode, localDay, taskDate, type UserTask, type TaskItem } from "@/lib/user-tasks";
export function TaskKanbanCard({
  task,
  open,
  compact = false,
  actions,
}: {
  task: UserTask;
  open: () => void;
  compact?: boolean;
  actions?: ReactNode;
}) {
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
  const late = !["completed", "cancelled"].includes(task.status) && task.due_on < localDay();
  if (compact)
    return (
      <article
        data-task-id={task.id}
        className="ut-card ut-rich-card ut-compact-card"
        tabIndex={0}
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("button,dialog,a")) open();
        }}
        onKeyDown={(event) => {
          if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) {
            event.preventDefault();
            open();
          }
        }}
        aria-label={`Abrir tarefa ${taskCode(task)}: ${task.title}. Responsável: ${task.assignee_name}. Vencimento: ${taskDate(task.due_on)}${late ? ". Atrasada" : ""}`}
      >
        <span className="ut-card-top">
          <small>{taskCode(task)}</small>
          {actions}
        </span>
        <strong className="ut-card-title" title={task.title}>
          {task.title}
        </strong>
        <span className="ut-card-subline">
          {" "}
          <span className="ut-modality ut-task-kind">
            {{ mapping: "Mapeamento", document: "Documento", improvement: "Melhoria" }[task.kind]}
          </span>
        </span>
        <span className="ut-card-owner">
          <span
            className="ut-avatar"
            title={task.assignee_name}
            aria-label={`Responsável: ${task.assignee_name}`}
          >
            {task.assignee_photo ? <img src={task.assignee_photo} alt="" /> : initials}
          </span>
          <time
            dateTime={task.due_on}
            className={late ? "ut-late" : ""}
            title={`${late ? "Atrasada · " : ""}Vencimento: ${taskDate(task.due_on)}`}
          >
            {taskDate(task.due_on)}
          </time>
        </span>
      </article>
    );
  return (
    <article
      data-task-id={task.id}
      className="ut-card ut-rich-card"
      tabIndex={0}
      onClick={(event) => {
        if (!(event.target as HTMLElement).closest("button,dialog,a")) open();
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget && ["Enter", " "].includes(event.key)) {
          event.preventDefault();
          open();
        }
      }}
      aria-label={`Abrir tarefa ${taskCode(task)}: ${task.title}`}
    >
      <span className="ut-card-top">
        <small title={task.id}>{taskCode(task)}</small>
        {actions}
      </span>
      <strong className="ut-card-title">{task.title}</strong>
      <span className="ut-card-subline">
        <span className={`ut-modality ut-kind-${task.kind}`}>
          {{ mapping: "Mapeamento", document: "Documento", improvement: "Melhoria" }[task.kind]}
        </span>
        <span>{task.area_name || task.modality}</span>
      </span>
      <span className="ut-card-progress-label">
        <span>Checklist</span>
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
        {[...groups].slice(0, 2).map(([key, items]) => {
          const done = items.filter((i) => i.completed).length;
          return (
            <span className="ut-card-checkitem" key={key}>
              <span
                aria-hidden="true"
                className={`ut-card-checkmark ${done === items.length ? "ut-card-checkmark-done" : ""}`}
              ></span>
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
        {groups.size > 2 && <small>+ {groups.size - 2} entregas</small>}
      </span>
      <span className="ut-card-owner">
        <span className="ut-card-person">
          <span className="ut-avatar" aria-hidden="true">
            {task.assignee_photo ? <img src={task.assignee_photo} alt="" /> : initials}
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
    </article>
  );
}
