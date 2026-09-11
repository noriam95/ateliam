import { useState } from "react";
import {
  TASK_STAGE_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskAction,
  type TaskFeed,
  type UserTask,
} from "@/lib/user-tasks";
export function TaskRoutingActions({
  task,
  data,
  busy,
  write,
}: {
  task: UserTask;
  data: TaskFeed;
  busy: boolean;
  write: (action: TaskAction, payload: Record<string, unknown>) => Promise<boolean | undefined>;
}) {
  const options: [TaskAction, string][] =
    task.status === "paused"
      ? [["resume", "Retomar tarefa"]]
      : task.kind !== "mapping"
        ? [["transition", "Alterar situação"]]
        : (
            {
              intake: [
                ["start_documentation", "Seguir para preenchimento"],
                ["request_complement", "Solicitar complemento da demanda"],
              ],
              registration: [["resubmit", "Retornar para análise da demanda"]],
              documentation: [["send_review", "Enviar para revisão técnica"]],
              technical_review: [
                ["approve_review", "Aprovar revisão técnica"],
                ["request_adjustments", "Solicitar ajustes na documentação"],
              ],
              owner_approval: [
                ["record_owner_approval", "Registrar aprovação da área e concluir"],
                ["request_adjustments", "Solicitar ajustes na documentação"],
              ],
            } as Record<string, [TaskAction, string][]>
          )[task.stage] || [];
  if (
    task.status !== "paused" &&
    task.status !== "completed" &&
    (data.isAdmin || (task.assigned_to === data.userId && task.documenter_id === data.userId))
  )
    options.push(["pause", "Marcar como parada"]);
  const [decision, setDecision] = useState<TaskAction>(options[0]?.[0] || "transition");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Record<string, unknown> | null>(null);
  const missing = task.checklist.filter(
    (i) => !i.optional && !i.completed && i.key !== "validation",
  );
  async function apply(payload: Record<string, unknown>) {
    if (await write(decision, payload)) {
      setNote("");
      setPending(null);
    }
  }
  if (!options.length || task.status === "completed") return null;
  return (
    <section className="ut-routing">
      <h3>Encaminhamento · {TASK_STAGE_LABELS[task.stage] || TASK_STATUS_LABELS[task.status]}</h3>
      <form
        className="ut-form"
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const payload = Object.fromEntries(new FormData(e.currentTarget));
          if (note.trim().length < 3) {
            setError("Descreva a orientação, o parecer ou o motivo do encaminhamento.");
            return;
          }
          if (decision === "send_review" && !payload.reviewerId) {
            setError("Selecione o responsável técnico.");
            return;
          }
          if (
            ["send_review", "approve_review", "record_owner_approval", "transition"].includes(
              decision,
            ) &&
            missing.length
          ) {
            setPending(payload);
            return;
          }
          await apply(payload);
        }}
      >
        <label>
          Ação
          <select
            value={decision}
            onChange={(e) => {
              setDecision(e.target.value as TaskAction);
              setPending(null);
            }}
          >
            {options.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {decision === "send_review" && (
          <label>
            Responsável técnico
            <select name="reviewerId" defaultValue={task.reviewer_id || ""}>
              <option value="">Selecione um usuário</option>
              {data.people
                .filter((p) => p.can_edit)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {decision === "transition" && (
          <label>
            Situação
            <select name="status" defaultValue={task.status}>
              {TASK_STATUSES.filter((s) => s !== "paused").map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          {decision === "record_owner_approval"
            ? "Descrição da aprovação — dono do processo e evidência"
            : "Descrição do encaminhamento"}
          <textarea
            className="resize-none"
            name="note"
            rows={4}
            maxLength={10000}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setPending(null);
            }}
            placeholder="Registre o que foi realizado e o que o próximo responsável deverá fazer."
          />
        </label>
        <button className="ut-primary" disabled={busy}>
          Confirmar encaminhamento
        </button>
      </form>
      {error && (
        <p role="alert" className="ut-error">
          {error}
        </p>
      )}
      {pending && (
        <div role="alert" className="ut-warning">
          <strong>Avançar com itens pendentes?</strong>
          <ul>
            {missing.map((i) => (
              <li key={i.key}>{i.label}</li>
            ))}
          </ul>
          <button disabled={busy} onClick={() => setPending(null)}>
            Voltar
          </button>
          <button disabled={busy} onClick={() => apply({ ...pending, confirmPending: true })}>
            Confirmar com pendências
          </button>
        </div>
      )}
    </section>
  );
}
