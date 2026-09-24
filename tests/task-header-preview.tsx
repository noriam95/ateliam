// Local visual/interaction fixture. It never calls the production API.
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { TaskDialog } from "../src/components/task-dialog";
import { TaskHeaderSummary } from "../src/components/task-header-summary";
import { TaskManagement } from "../src/components/task-management";
import type { UserTask, TaskFeed } from "../src/lib/user-tasks";
import { documentLabel } from "../src/lib/document-label";

const people = [
  { id: "mairon", name: "Mairon Conceição", can_edit: true },
  { id: "analista", name: "Analista de processos e melhoria contínua", can_edit: true },
];
function Preview() {
  const [task, setTask] = useState({
    id: "preview",
    title: "Teste",
    task_code: "TAR.0008.2026",
    kind: "mapping",
    modality: "Sistemas",
    assigned_to: "mairon",
    requested_by: "mairon",
    documenter_id: "mairon",
    assignee_name: "Mairon Conceição",
    requester_name: "Mairon Conceição",
    starts_on: "2026-09-24",
    due_on: "2026-09-25",
    stage: "documentation",
    status: "in_progress",
    revision: 1,
  } as UserTask);
  const [open, setOpen] = useState(true);
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const params = new URLSearchParams(location.search);
  const data = { userId: "mairon", isAdmin: !params.has("readonly"), people } as TaskFeed;
  const readOnly = params.has("readonly");
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir tarefa de teste</button>
      {open && (
        <TaskDialog
          title={task.title}
          wide
          onClose={() => setOpen(false)}
          className="ut-task-detail-dialog"
          titlePrefix={
            <div className="ut-detail-code">
              <span>{task.task_code}</span>
              <span className="ut-status">Em andamento</span>
            </div>
          }
        >
          <TaskHeaderSummary
            task={task}
            canEdit={!readOnly}
            expanded={edit}
            toggle={() => {
              setError("");
              setEdit(true);
            }}
          />
          <nav className="ut-detail-tabs">
            <button>Dados da tarefa</button>
            <button>Movimentações</button>
            <button>Fluxo do processo</button>
          </nav>
          <div className="ut-form">
            <h3>Entregas</h3>
            <p>{documentLabel("MAP.BIA.001.TEMP", "MAP.BIA.001.TEMP - GESTÃO DE DEMANDAS")}</p>
            <small>Rascunho</small>
          </div>
          {edit && (
            <TaskManagement
              task={task}
              data={data}
              busy={busy}
              serverError={error}
              onClose={() => setEdit(false)}
              write={async (_action, payload) => {
                setBusy(true);
                setError("");
                await new Promise((resolve) => setTimeout(resolve, 600));
                if (params.has("error")) {
                  setError("Não foi possível salvar. Seus dados foram mantidos. Tente novamente.");
                  setBusy(false);
                  return false;
                }
                setTask((current) => ({
                  ...current,
                  revision: current.revision + 1,
                  starts_on: String(payload.startsOn),
                  due_on: String(payload.dueOn),
                  requested_by: String(payload.requestedBy),
                  assigned_to: String(payload.assignedTo),
                  assignee_name: people.find((p) => p.id === payload.assignedTo)!.name,
                  requester_name: people.find((p) => p.id === payload.requestedBy)!.name,
                  modality: String(payload.modality),
                }));
                setBusy(false);
                return true;
              }}
            />
          )}
        </TaskDialog>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Preview />);
