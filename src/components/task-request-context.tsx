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
  const files = events.flatMap((event) =>
    (event.attachments || []).map((attachment) => ({ attachment, event })),
  );
  return (
    <section className="ut-request-context" aria-label="Contexto da solicitação">
      <div className="ut-request-heading">
        <strong>Contexto da solicitação</strong>
        <span className="ut-muted">Preservado durante todo o fluxo</span>
      </div>
      {first ? (
        <>
          <p className="ut-muted">
            Primeiro comentário registrado · {first.actor_name} ·{" "}
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
      <details>
        <summary>
          Arquivos dos comentários e da solicitação <strong>{files.length}</strong>
        </summary>
        {files.length ? (
          <ul className="ut-request-files">
            {files.map(({ attachment, event }) => (
              <li key={`${event.id}:${attachment.path}`}>
                <CommentAttachment attachment={attachment} />
                <small className="ut-muted">
                  {event.actor_name} · {new Date(event.created_at).toLocaleString("pt-BR")}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p className="ut-muted">
            Nenhum arquivo anexado aos comentários. As entregas ficam no checklist.
          </p>
        )}
      </details>
    </section>
  );
}
