import { useEffect, useRef, useState } from "react";
import {
  TASK_STAGE_LABELS,
  TASK_STATUS_LABELS,
  TASK_STATUSES,
  type TaskFeed,
  type UserTask,
  type TaskAction,
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
  const [action, setAction] = useState<{
    kind: TaskAction;
    payload: Record<string, unknown>;
    label: string;
  } | null>(null);
  const [error, setError] = useState("");
  const confirmation = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (action) confirmation.current?.focus();
  }, [action]);
  const missing = task.checklist.filter(
    (i) => !i.completed && (task.kind !== "mapping" || i.key !== "validation"),
  );
  async function submit(kind: TaskAction, payload: Record<string, unknown>, label: string) {
    setError("");
    if (
      ["send_review", "approve_review", "record_owner_approval", "transition"].includes(kind) &&
      missing.length
    ) {
      setAction({ kind, payload, label });
      return;
    }
    await write(kind, payload);
  }
  const fields = (form: HTMLFormElement) => Object.fromEntries(new FormData(form));
  return (
    <div className="ut-routing">
      {task.kind === "mapping" ? (
        <>
          <h3>Encaminhamento · {TASK_STAGE_LABELS[task.stage]}</h3>
          {task.stage === "documentation" && (
            <form
              noValidate
              className="ut-form"
              onSubmit={(e) => {
                e.preventDefault();
                const values = fields(e.currentTarget);
                if (task.return_stage !== "owner_approval" && !values.reviewerId) {
                  setError("Selecione o responsável técnico.");
                  return;
                }
                void submit(
                  "send_review",
                  values,
                  task.return_stage === "owner_approval"
                    ? "Encaminhar para aprovação do dono"
                    : "Enviar para revisão técnica",
                );
              }}
            >
              {task.return_stage === "owner_approval" ? (
                <p>
                  Após os ajustes, a tarefa retornará ao responsável pela documentação para coletar
                  novamente a aprovação do dono do processo.
                </p>
              ) : (
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
              <button className="ut-primary" disabled={busy}>
                {task.return_stage === "owner_approval"
                  ? "Enviar para aprovação do dono"
                  : "Enviar para revisão técnica"}
              </button>
            </form>
          )}
          {task.stage === "technical_review" && (
            <form
              noValidate
              className="ut-form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit("approve_review", fields(e.currentTarget), "Aprovar revisão técnica");
              }}
            >
              <p>
                Ao aprovar, a tarefa retorna para{" "}
                {data.people.find((p) => p.id === task.documenter_id)?.name ||
                  "o responsável pela documentação"}{" "}
                coletar a aprovação do dono do processo.
              </p>
              <label>
                Parecer técnico
                <textarea className="resize-none" name="note" rows={3} />
              </label>
              <button className="ut-primary" disabled={busy}>
                Aprovar revisão técnica
              </button>
            </form>
          )}
          {task.stage === "owner_approval" && (
            <form
              noValidate
              className="ut-form"
              onSubmit={(e) => {
                e.preventDefault();
                const values = fields(e.currentTarget);
                if (String(values.note || "").trim().length < 3) {
                  setError("Registre o nome do dono do processo e a evidência da aprovação.");
                  return;
                }
                void submit("record_owner_approval", values, "Registrar aprovação do dono");
              }}
            >
              <p>Registre a aprovação coletada com o dono do processo.</p>
              <label>
                Dono do processo e evidência da aprovação
                <textarea
                  className="resize-none"
                  name="note"
                  rows={4}
                  placeholder="Nome, data e referência do e-mail, reunião ou documento de aprovação"
                />
              </label>
              <button className="ut-primary" disabled={busy}>
                Registrar aprovação do dono e concluir
              </button>
            </form>
          )}
          {["technical_review", "owner_approval"].includes(task.stage) && (
            <details>
              <summary>Solicitar ajustes</summary>
              <form
                noValidate
                className="ut-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const values = fields(e.currentTarget);
                  if (String(values.note || "").trim().length < 3) {
                    setError("Descreva os ajustes solicitados.");
                    return;
                  }
                  setError("");
                  await write("request_adjustments", values);
                }}
              >
                <label>
                  Ajustes solicitados
                  <textarea className="resize-none" name="note" rows={4} />
                </label>
                <p>
                  A tarefa retorna à documentação, sob responsabilidade de{" "}
                  {data.people.find((p) => p.id === task.documenter_id)?.name ||
                    "quem inseriu a demanda"}
                  .
                </p>
                <button disabled={busy}>Enviar para ajustes na documentação</button>
              </form>
            </details>
          )}
        </>
      ) : (
        <form
          noValidate
          className="ut-actions"
          onSubmit={(e) => {
            e.preventDefault();
            void submit("transition", fields(e.currentTarget), "Alterar situação");
          }}
        >
          <label>
            Situação
            <select name="status" defaultValue={task.status}>
              {TASK_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {TASK_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <button className="ut-primary" disabled={busy}>
            Alterar situação
          </button>
        </form>
      )}
      {data.isAdmin && (
        <details>
          <summary>Movimentação administrativa</summary>
          <form
            noValidate
            className="ut-form"
            onSubmit={(e) => {
              e.preventDefault();
              const values = fields(e.currentTarget);
              if (String(values.note || "").trim().length < 3) {
                setError("Informe o motivo da movimentação.");
                return;
              }
              setError("");
              void write(task.kind === "mapping" ? "admin_move" : "assign", values);
            }}
          >
            {task.kind === "mapping" && (
              <label>
                Etapa
                <select name="stage" defaultValue={task.stage}>
                  {Object.entries(TASK_STAGE_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              Responsável
              <select name="assignedTo" defaultValue={task.assigned_to}>
                {data.people
                  .filter((p) => p.can_edit)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Motivo
              <textarea className="resize-none" name="note" rows={3} />
            </label>
            <p>
              O administrador pode movimentar a tarefa em qualquer etapa. A movimentação e os itens
              pendentes permanecem no histórico.
            </p>
            <button disabled={busy}>Aplicar movimentação</button>
          </form>
        </details>
      )}
      {error && (
        <p role="alert" className="ut-error">
          {error}
        </p>
      )}
      {action && (
        <div className="ut-warning" role="alert" ref={confirmation} tabIndex={-1}>
          <strong>Deseja avançar mesmo sem concluir todo o checklist?</strong>
          <ul>
            {missing.map((i) => (
              <li key={i.key}>{i.label}</li>
            ))}
          </ul>
          <p>Esses itens continuarão identificados como pendentes.</p>
          <div className="ut-inline">
            <button disabled={busy} onClick={() => setAction(null)}>
              Voltar ao checklist
            </button>
            <button
              disabled={busy}
              onClick={async () => {
                if (await write(action.kind, { ...action.payload, confirmPending: true }))
                  setAction(null);
              }}
            >
              {action.label} com pendências
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
