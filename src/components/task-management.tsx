import { useState } from "react";
import { TASK_MODALITIES, type TaskFeed, type UserTask, type TaskAction } from "@/lib/user-tasks";
export function TaskManagement({
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
  const [confirm, setConfirm] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const allowed =
    data.isAdmin || (task.assigned_to === data.userId && task.documenter_id === data.userId);
  if (!allowed || task.status === "completed") return null;
  return (
    <div className="ut-header-editor">
      <form
        className="ut-form ut-header-fields"
        noValidate
        key={task.revision}
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const values = Object.fromEntries(new FormData(e.currentTarget));
          if (!values.startsOn || !values.dueOn || String(values.dueOn) < String(values.startsOn)) {
            setError("Informe um período válido.");
            return;
          }
          const payload = { ...values, modality: values.modality || task.modality };
          if (payload.modality !== task.modality) {
            setConfirm(payload);
            return;
          }
          await write("edit_details", payload);
        }}
      >
        <label>
          Início
          <input type="date" name="startsOn" defaultValue={task.starts_on} />
        </label>
        <label>
          Prazo
          <input type="date" name="dueOn" defaultValue={task.due_on} />
        </label>
        <label>
          Solicitante
          <select name="requestedBy" defaultValue={task.requested_by}>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Responsável pelo mapeamento
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
        {task.kind === "mapping" && task.stage === "documentation" && !task.review_started && (
          <label>
            Modalidade
            <select name="modality" defaultValue={task.modality || ""}>
              {TASK_MODALITIES.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
        )}
        <button disabled={busy} className="ut-primary">
          Salvar dados da tarefa
        </button>
        {error && (
          <p role="alert" className="ut-error">
            {error}
          </p>
        )}
      </form>
      {confirm && (
        <div role="alert" className="ut-warning">
          <p>
            Alterar a modalidade? Todas as entregas já preenchidas serão mantidas. Os itens que
            faltam na nova modalidade serão adicionados.
          </p>
          <button
            disabled={busy}
            onClick={async () => {
              if (await write("edit_details", { ...confirm, confirmModality: true }))
                setConfirm(null);
            }}
          >
            Confirmar alteração
          </button>
          <button onClick={() => setConfirm(null)}>Cancelar</button>
        </div>
      )}
    </div>
  );
}

export function TaskProcessFlow({ task }: { task: UserTask }) {
  const nodes = [
    { key: "registration", x: 90, y: 65, label: "Registro da tarefa" },
    { key: "intake", x: 90, y: 250, label: "Analisar demanda" },
    {
      key: "documentation",
      x: 350,
      y: 250,
      label: task.adjustment_request ? "Editar checklist" : "Preencher checklist",
    },
    { key: "technical_review", x: 350, y: 450, label: "Analisar preenchimento" },
    { key: "owner_approval", x: 660, y: 250, label: "Coletar aprovação da área" },
    { key: "completed", x: 860, y: 250, label: "Concluído" },
  ];
  return (
    <section className="ut-process-panel">
      <p>
        A etapa atual está destacada. Execute as decisões em{" "}
        <strong>Dados da tarefa → Encaminhamento</strong>.
      </p>
      <div
        className="ut-flow-scroll"
        role="region"
        aria-label="Fluxograma do mapeamento"
        tabIndex={0}
      >
        <svg
          viewBox="0 0 1080 600"
          role="img"
          aria-label={`Fluxo de mapeamento. Etapa atual: ${task.stage}.`}
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
              <rect x="10" y={l.y} width="1060" height={l.h} fill="none" stroke="var(--border)" />
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
            <path d="M170 125V250" />
            <path d="M250 280H350" />
            <path d="M430 310V450" />
            <path d="M510 480H740V310" />
            <path d="M820 280H860" />
            <path d="M170 250V210H285V95H250" />
            <path d="M390 450V310" />
            <path d="M740 250V205H470V250" />
          </g>
          <g fill="var(--muted-foreground)" fontSize="12">
            <text x="265" y="269">
              Seguir
            </text>
            <text x="295" y="158">
              Solicitar complemento
            </text>
            <text x="439" y="372">
              Enviar para revisão
            </text>
            <text x="308" y="383">
              Ajustar
            </text>
            <text x="579" y="468">
              Aprovado
            </text>
            <text x="525" y="195">
              Área solicitou ajustes → revisar novamente
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
