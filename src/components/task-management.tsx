import { useEffect, useId, useRef, useState } from "react";
import {
  TASK_KINDS,
  TASK_MODALITIES,
  type TaskFeed,
  type UserTask,
  type TaskAction,
} from "@/lib/user-tasks";
import { TaskDialog } from "./task-dialog";

export function TaskManagement({
  task,
  data,
  busy,
  write,
  onClose,
  serverError = "",
}: {
  task: UserTask;
  data: TaskFeed;
  busy: boolean;
  write: (action: TaskAction, payload: Record<string, unknown>) => Promise<boolean | undefined>;
  onClose: () => void;
  serverError?: string;
}) {
  const [confirm, setConfirm] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [revision] = useState(task.revision);
  const [dirty, setDirty] = useState(false);
  const submitting = useRef(false);
  const firstField = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    firstField.current?.focus();
  }, []);
  const errorId = useId();
  const allowed =
    data.isAdmin || (task.assigned_to === data.userId && task.documenter_id === data.userId);
  const canChangeModality =
    task.kind === "mapping" && task.stage === "documentation" && !task.review_started;
  if (!allowed || task.deleted_at || ["completed", "cancelled"].includes(task.status)) return null;

  async function save(payload: Record<string, unknown>) {
    if (submitting.current || busy) return;
    submitting.current = true;
    try {
      if (await write("edit_details", { ...payload, revision })) onClose();
      else setConfirm(null);
    } finally {
      submitting.current = false;
    }
  }

  return (
    <TaskDialog
      title="Editar dados da tarefa"
      onClose={onClose}
      busy={busy}
      dirty={dirty}
      className="ut-task-edit-dialog"
    >
      <form
        className="ut-form ut-task-edit-form"
        noValidate
        onChange={() => {
          setDirty(true);
          setError("");
        }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy || submitting.current || confirm) return;
          const form = e.currentTarget;
          const values = Object.fromEntries(new FormData(form));
          if (!values.startsOn || !values.dueOn || String(values.dueOn) < String(values.startsOn)) {
            setError("Informe as duas datas. O prazo deve ser igual ou posterior ao início.");
            (
              form.elements.namedItem(!values.startsOn ? "startsOn" : "dueOn") as HTMLInputElement
            )?.focus();
            return;
          }
          const payload = { ...values, modality: values.modality || task.modality };
          if (payload.modality !== task.modality) {
            setConfirm(payload);
            return;
          }
          await save(payload);
        }}
      >
        <p className="ut-edit-context">{task.title}</p>
        <fieldset disabled={busy} className="ut-edit-fields">
          <legend>Pessoas</legend>
          <label>
            Responsável
            <select ref={firstField} name="assignedTo" defaultValue={task.assigned_to}>
              {!data.people.some((p) => p.id === task.assigned_to && p.can_edit) && (
                <option value={task.assigned_to} disabled>
                  {task.assignee_name}
                </option>
              )}
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
            Solicitante
            <select name="requestedBy" defaultValue={task.requested_by}>
              {!data.people.some((p) => p.id === task.requested_by) && (
                <option value={task.requested_by} disabled>
                  {task.requester_name}
                </option>
              )}
              {data.people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        </fieldset>
        <fieldset disabled={busy} className="ut-edit-fields">
          <legend>Período</legend>
          <label>
            Início
            <input
              type="date"
              name="startsOn"
              defaultValue={task.starts_on}
              required
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
          <label>
            Prazo
            <input
              type="date"
              name="dueOn"
              defaultValue={task.due_on}
              required
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
            />
          </label>
        </fieldset>
        <fieldset disabled={busy} className="ut-edit-fields">
          <legend>Classificação</legend>
          <div className="ut-edit-readonly">
            <span>Tipo</span>
            <strong>{TASK_KINDS[task.kind]}</strong>
          </div>
          {canChangeModality ? (
            <label>
              Modalidade
              <select name="modality" defaultValue={task.modality || ""}>
                {!task.modality && <option value="">Selecione</option>}
                {TASK_MODALITIES.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </label>
          ) : (
            <div className="ut-edit-readonly">
              <span>Modalidade</span>
              <strong>{task.modality || "Não se aplica"}</strong>
            </div>
          )}
          {task.kind === "mapping" && (
            <p className="ut-field-help">
              {canChangeModality
                ? "Ao alterar a modalidade, as entregas preenchidas serão preservadas."
                : "A modalidade só pode ser alterada durante o primeiro atendimento, antes da revisão."}
            </p>
          )}
        </fieldset>
        {(error || serverError) && (
          <p id={errorId} role="alert" className="ut-error">
            {error || serverError}
          </p>
        )}
        <div className="ut-edit-actions">
          <button type="button" disabled={busy} onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" disabled={busy} aria-busy={busy} className="ut-primary">
            {busy ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </form>
      {confirm && (
        <TaskDialog title="Alterar modalidade?" onClose={() => setConfirm(null)} busy={busy}>
          <div className="ut-form">
            <p>
              As entregas preenchidas serão mantidas. Os itens que faltam na nova modalidade serão
              adicionados.
            </p>
          </div>
          <footer>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)}>
              Voltar à edição
            </button>
            <button
              type="button"
              className="ut-primary"
              disabled={busy}
              onClick={() => save({ ...confirm, confirmModality: true })}
            >
              Confirmar alteração
            </button>
          </footer>
        </TaskDialog>
      )}
    </TaskDialog>
  );
}

export function TaskProcessFlow({ task }: { task: UserTask }) {
  const nodes = [
    { key: "registration", x: 150, y: 65, label: "Preencher solicitação" },
    { key: "intake", x: 150, y: 250, label: "Analisar demanda" },
    {
      key: "documentation",
      x: 450,
      y: 250,
      label: "Atender solicitação",
    },
    { key: "technical_review", x: 450, y: 450, label: "Analisar informações" },
    { key: "owner_approval", x: 770, y: 250, label: "Coletar aprovação da área" },
  ];
  return (
    <section className="ut-process-panel">
      <p>
        A etapa atual está destacada. Execute as decisões em{" "}
        <strong>Movimentações → Encaminhamento</strong>.
      </p>
      <div
        className="ut-flow-scroll"
        role="region"
        aria-label="Fluxograma do mapeamento"
        tabIndex={0}
      >
        <svg
          viewBox="0 0 1180 590"
          role="img"
          aria-label={`Fluxo de mapeamento com início, decisões e fim. Etapa atual: ${task.stage}.`}
        >
          <defs>
            <marker
              id="task-flow-arrow"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0 0L8 4L0 8Z" fill="currentColor" />
            </marker>
          </defs>
          {[
            { y: 15, h: 160, name: "Usuário" },
            { y: 175, h: 225, name: "Responsável pelo mapeamento" },
            { y: 400, h: 180, name: "Revisor" },
          ].map((l) => (
            <g key={l.name}>
              <rect x="10" y={l.y} width="1160" height={l.h} fill="none" stroke="var(--border)" />
              <text
                x="32"
                y={l.y + l.h / 2}
                transform={`rotate(-90 32 ${l.y + l.h / 2})`}
                textAnchor="middle"
                fontSize="12"
                fill="var(--muted-foreground)"
              >
                {l.name}
              </text>
            </g>
          ))}
          <g fill="none" stroke="currentColor" strokeWidth="1.5" markerEnd="url(#task-flow-arrow)">
            <path d="M108 95H150" />
            <path d="M230 125V250" />
            <path d="M310 280H337" />
            <path d="M373 280H450" />
            <path d="M355 262V95H310" />
            <path d="M530 310V450" />
            <path d="M610 480H667" />
            <path d="M685 462V350H580V310" />
            <path d="M703 480H850V310" />
            <path d="M930 280H982" />
            <path d="M1018 280H1092" />
            <path d="M1000 262V205H530V250" />
          </g>
          <circle
            cx="90"
            cy="95"
            r="18"
            fill="var(--card)"
            stroke="currentColor"
            strokeWidth="1.5"
          />
          <text x="90" y="130" textAnchor="middle" fontSize="12" fill="var(--foreground)">
            Início
          </text>
          {[
            { x: 355, y: 280 },
            { x: 685, y: 480 },
            { x: 1000, y: 280 },
          ].map((g) => (
            <g key={g.x}>
              <path
                d={`M${g.x} ${g.y - 18}l18 18-18 18-18-18Z`}
                fill="var(--card)"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <path
                d={`M${g.x - 6} ${g.y - 6}l12 12m0-12-12 12`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </g>
          ))}
          <circle
            cx="1110"
            cy="280"
            r="18"
            fill={task.stage === "completed" ? "var(--accent)" : "var(--card)"}
            stroke={task.stage === "completed" ? "var(--gold)" : "currentColor"}
            strokeWidth="4"
          />
          <text x="1110" y="318" textAnchor="middle" fontSize="12" fill="var(--foreground)">
            Concluído
          </text>
          <g fill="var(--muted-foreground)" fontSize="12">
            <text x="388" y="269">
              Seguir
            </text>
            <text x="367" y="153">
              Solicitar complemento
            </text>
            <text x="540" y="430">
              Enviar para revisão
            </text>
            <text x="618" y="340">
              Ajustar
            </text>
            <text x="743" y="468">
              Aprovado
            </text>
            <text x="682" y="194">
              Área solicitou ajustes
            </text>
            <text x="1026" y="269">
              Aprovado
            </text>
          </g>
          {nodes.map((n) => (
            <g key={n.key}>
              <rect
                x={n.x}
                y={n.y}
                width="160"
                height="60"
                rx="9"
                fill={task.stage === n.key ? "var(--accent)" : "var(--card)"}
                stroke={task.stage === n.key ? "var(--gold)" : "var(--muted-foreground)"}
                strokeWidth={task.stage === n.key ? 3 : 1}
              />
              <text
                x={n.x + 80}
                y={n.y + 26}
                textAnchor="middle"
                fontSize="12"
                fontWeight="600"
                fill="var(--foreground)"
              >
                {n.label}
              </text>
              {task.stage === n.key && (
                <text
                  x={n.x + 80}
                  y={n.y + 47}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--foreground)"
                >
                  {task.status === "paused" ? "Parada nesta etapa" : "Etapa atual"}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <p className="ut-muted">
        Todo ajuste do checklist passa novamente pela revisão técnica antes da aprovação da área.
      </p>
    </section>
  );
}
