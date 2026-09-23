import type { TaskFeed } from "@/lib/user-tasks";
import { CommentAttachment } from "./task-comment";

/** Original comments remain immutable; routing descriptions never replace the request. */
export function TaskRequestContext({ events }: { events: TaskFeed["events"] }) {
  const first = [...events]
    .reverse()
    .find(
      (event) =>
        event.action === "Comentário" &&
        event.note?.trim() &&
        event.note !== "Anexos da solicitação inicial.",
    );
  const files = [...events]
    .reverse()
    .flatMap((event) => (event.attachments || []).map((attachment) => ({ attachment, event })));
  return (
    <section className="ut-request-context" aria-label="Contexto da solicitação">
      <div className="ut-request-heading">
        <strong>Solicitação</strong>
      </div>
      {first ? (
        <>
          <p className="ut-muted ut-request-byline">
            {first.actor_name} ·{" "}
            <time dateTime={first.created_at}>
              {new Date(first.created_at).toLocaleString("pt-BR", {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </time>
          </p>
          <p className="ut-request-text">{first.note}</p>
        </>
      ) : (
        <p className="ut-muted">Nenhuma descrição registrada nos comentários da solicitação.</p>
      )}
      {files.length > 0 && (
        <ul className="ut-request-files">
          {files.slice(0, 2).map(({ attachment, event }) => (
            <li key={`${event.id}:${attachment.path}`}>
              <CommentAttachment attachment={attachment} />
              <small className="ut-muted">
                {event.actor_name} · {new Date(event.created_at).toLocaleDateString("pt-BR")}
              </small>
            </li>
          ))}
        </ul>
      )}
      {files.length > 2 && (
        <details>
          <summary>Mais {files.length - 2} anexos dos comentários</summary>
          <ul className="ut-request-files">
            {files.slice(2).map(({ attachment, event }) => (
              <li key={`${event.id}:${attachment.path}`}>
                <CommentAttachment attachment={attachment} />
                <small className="ut-muted">
                  {event.actor_name} · {new Date(event.created_at).toLocaleString("pt-BR")}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
