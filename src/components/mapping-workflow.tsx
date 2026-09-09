import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Check,
  CheckSquare,
  ChevronLeft,
  FileText,
  LayoutList,
  Loader2,
  Menu,
  Plus,
  Search,
  ShieldCheck,
  SquareKanban,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Route } from "@/routes/_authenticated/mapping";
import { BFFlowMark } from "@/components/bf-flow-mark";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { WorkspaceRail } from "@/components/workspace-navigation";
import { getMe, listAccessibleOrganizations } from "@/lib/config.functions";
import { loadMappingWorkflow, mutateMappingWorkflow } from "@/lib/mapping-workflow.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  MAPPING_MODALITIES,
  MAPPING_STATUSES,
  STATUS_LABELS,
  NEXT_ACTION,
  MODALITY_FIELDS,
  modalityChecklist,
  demandCode,
  isOverdue,
  nextStatuses,
  type MappingDemand,
  type MappingModality,
  type ChecklistItem,
  type WorkflowData,
  type MappingTask,
} from "@/lib/mapping-workflow";
import "./mapping-workflow.css";

type DialogState = {
  kind:
    | "direct"
    | "register"
    | "checklist"
    | "transition"
    | "task_create"
    | "task_update"
    | "reassign"
    | "cancel"
    | "coordinator"
    | "take_task"
    | "details";
  demand?: MappingDemand;
  item?: ChecklistItem;
  task?: MappingTask;
  status?: string;
  person?: string;
  enabled?: boolean;
  requestId?: string;
};
type Command = Parameters<typeof mutateMappingWorkflow>[0]["data"];
const date = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join("/") : "Sem prazo";
const taskLabels: Record<string, string> = {
  pending: "Pendente",
  in_progress: "Em andamento",
  waiting: "Aguardando retorno",
  completed: "Concluída",
  cancelled: "Cancelada",
};
const eventLabels: Record<string, string> = {
  register: "Mapeamento registrado",
  checklist: "Checklist atualizado",
  details: "Conteúdo da modalidade atualizado",
  transition: "Etapa alterada",
  task_create: "Tarefa criada",
  task_update: "Tarefa atualizada",
  reassign: "Analista reatribuído",
  cancel: "Demanda cancelada",
  take_task: "Tarefa assumida pelo Administrador",
};
function Badge({ modality }: { modality: MappingModality }) {
  return (
    <span className={`mw-badge mw-mod-${MAPPING_MODALITIES.indexOf(modality)}`}>{modality}</span>
  );
}
function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="mw-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({ children }: { children: ReactNode }) {
  return <div className="mw-empty">{children}</div>;
}
function Checklist({
  demand,
  onEdit,
  readOnly = false,
}: {
  demand: MappingDemand;
  onEdit: (item: ChecklistItem) => void;
  readOnly?: boolean;
}) {
  const count = demand.checklist.filter((x) => x.state !== "pending").length;
  return (
    <>
      <div className="mw-progress-label">
        <span>Checklist da modalidade</span>
        <span>
          {count}/{demand.checklist.length}
        </span>
      </div>
      <progress max={demand.checklist.length || 1} value={count} aria-label="Entregas concluídas" />
      <div className="mw-checks">
        {demand.checklist.map((item) => (
          <button
            type="button"
            key={item.key}
            className="mw-check"
            onClick={() => onEdit(item)}
            title={readOnly ? "Consultar entrega" : "Atualizar entrega"}
          >
            <span className={`mw-tick ${item.state !== "pending" ? "done" : ""}`}>
              {item.state !== "pending" && <Check size={11} />}
            </span>
            <span>
              {item.label}
              {item.optional && <small>Quando necessário</small>}
              {item.state === "not_applicable" && <small>Não aplicável</small>}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
export function MappingWorkflow() {
  const search = Route.useSearch(),
    navigate = useNavigate();
  const getProfile = useServerFn(getMe),
    getOrganizations = useServerFn(listAccessibleOrganizations),
    load = useServerFn(loadMappingWorkflow),
    mutate = useServerFn(mutateMappingWorkflow);
  const me = useQuery({ queryKey: ["me"], queryFn: () => getProfile() }),
    orgs = useQuery({ queryKey: ["accessible-organizations"], queryFn: () => getOrganizations() });
  const [org, setOrg] = useState(() =>
    typeof window !== "undefined" ? localStorage.getItem("ateliam-active-organization") || "" : "",
  );
  const allowedOrgs = orgs.data ?? [];
  const organizationId = allowedOrgs.some((o) => o.id === org)
    ? org
    : me.data?.profile.organization_id || "";
  const organizationName =
    allowedOrgs.find((o) => o.id === organizationId)?.name || me.data?.organization?.name || "";
  const query = useQuery({
    queryKey: ["mapping-workflow", organizationId],
    queryFn: () => load({ data: { organizationId } }),
    enabled: !!organizationId && !!orgs.data,
    refetchOnWindowFocus: true,
  });
  const state = query.data;
  const [collapsed, setCollapsed] = useState(false),
    [modal, setModal] = useState<DialogState | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [tab, setTab] = useState("Entregáveis"),
    [searchText, setSearchText] = useState(search.q);
  const person = (id: string | null | undefined) =>
    state?.people.find((p) => p.id === id)?.name || "Usuário indisponível";
  const change = (patch: Partial<typeof search>) =>
    navigate({ to: "/mapping", search: { ...search, ...patch } });
  const go = (view: string) => {
    setTab("Entregáveis");
    void change({ view, id: undefined, q: "" });
  };
  const selected = state?.demands.find((d) => d.id === search.id);
  useEffect(() => setSearchText(search.q), [search.q]);
  const open = (value: DialogState) => {
    setError("");
    setModal(value);
  };
  const write = async (action: Command["action"], payload: Record<string, unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await mutate({ data: { organizationId, action, payload } });
      await query.refetch();
      setModal(null);
      toast.success("Alteração salva. Tarefas e histórico atualizados.");
      if (action === "register" && result.id) await change({ view: "board", id: result.id });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };
  const admin = !!state?.isAdmin,
    coordinator = !!state?.isCoordinator;
  const canEdit = (d: MappingDemand) =>
    !!state &&
    (admin || d.analyst_id === state.userId) &&
    ["registered", "discovery", "documentation", "adjustments"].includes(d.status);
  const openDemand = (d: MappingDemand) => {
    if (d.status === "awaiting_registration") {
      open({ kind: "register", demand: d });
      return;
    }
    setTab("Entregáveis");
    void change({ view: "board", id: d.id });
  };
  const mineOpen =
    state?.tasks.filter(
      (t) => t.assigned_to === state.userId && !["completed", "cancelled"].includes(t.status),
    ) ?? [];
  const heading = search.id
    ? selected?.title || "Mapeamento"
    : {
        board: "Mapeamentos",
        tasks: "Minhas tarefas",
        directions: "Direcionamentos",
        coordinators: "Coordenadores",
      }[search.view] || "Mapeamentos";
  const actions = selected ? (
    <>
      <button onClick={() => go("board")}>
        <ChevronLeft size={15} />
        Voltar
      </button>
      {selected.document_id && (
        <a className="mw-button" href={`/m/ddp?document=${selected.document_id}`}>
          <FileText size={15} />
          Abrir mapeamento
        </a>
      )}
      {coordinator && !["completed", "cancelled", "validation"].includes(selected.status) && (
        <button onClick={() => open({ kind: "reassign", demand: selected })}>Reatribuir</button>
      )}
      {coordinator && !["completed", "cancelled"].includes(selected.status) && (
        <button
          className="mw-danger-text"
          onClick={() => open({ kind: "cancel", demand: selected })}
        >
          Cancelar demanda
        </button>
      )}
    </>
  ) : search.view === "board" ? (
    <>
      <button onClick={() => go("directions")}>Direcionamentos</button>
      <button className="mw-primary" onClick={() => go("tasks")}>
        <Plus size={15} />
        Registrar pela tarefa
      </button>
    </>
  ) : search.view === "directions" && coordinator ? (
    <button
      className="mw-primary"
      onClick={() => open({ kind: "direct", requestId: crypto.randomUUID() })}
    >
      <Plus size={15} />
      Solicitar registro
    </button>
  ) : null;
  return (
    <div className="mw-root">
      <header className="mw-topbar">
        <button aria-label="Alternar navegação" onClick={() => setCollapsed((x) => !x)}>
          <Menu size={17} />
        </button>
        <Link to="/" search={{ area: "home", view: undefined }}>
          <BFFlowMark className="h-8" />
        </Link>
        <div className="mw-spacer" />
        <select
          aria-label="Organização ativa"
          value={organizationId}
          onChange={(e) => {
            setOrg(e.target.value);
            localStorage.setItem("ateliam-active-organization", e.target.value);
            setModal(null);
            void change({ id: undefined });
          }}
        >
          {allowedOrgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        <button aria-label={`${mineOpen.length} tarefas abertas`} onClick={() => go("tasks")}>
          <Bell size={17} />
          {mineOpen.length > 0 && <span>{mineOpen.length}</span>}
        </button>
        <UserProfileMenu
          email={me.data?.profile.email || ""}
          organizationName={organizationName}
          profilePhoto={me.data?.profile.avatar_data_url || ""}
          isDemo={false}
          onProfileUpdated={() => {
            void me.refetch();
          }}
          onSignOut={async () => {
            await supabase.auth.signOut();
            window.location.assign("/auth");
          }}
        />
      </header>
      <div className={`mw-shell ${collapsed ? "mw-collapsed" : ""}`}>
        <div className="mw-rail">
          <WorkspaceRail
            activeArea="modules"
            onSelect={(area) => {
              void navigate({ to: "/", search: { area, view: undefined } });
            }}
          />
        </div>
        {!collapsed && (
          <aside className="mw-sidebar">
            <div className="mw-caption">NAVEGAÇÃO</div>
            <h2>Processos</h2>
            <p>Gestão do mapeamento</p>
            <nav>
              {[
                { id: "tasks", title: "Minhas tarefas", Icon: CheckSquare },
                { id: "directions", title: "Direcionamentos", Icon: ArrowUpRight },
                { id: "board", title: "Mapeamentos", Icon: SquareKanban },
                ...(admin ? [{ id: "coordinators", title: "Coordenadores", Icon: Users }] : []),
              ].map((n) => (
                <button
                  key={n.id}
                  className={search.view === n.id ? "active" : ""}
                  onClick={() => go(n.id)}
                >
                  <n.Icon size={17} />
                  {n.title}
                  {n.id === "tasks" && mineOpen.length > 0 && <b>{mineOpen.length}</b>}
                </button>
              ))}
            </nav>
            <div className="mw-caption mt-7">BIBLIOTECA</div>
            <a href="/m/ddp?view=consult">Mapeamentos existentes</a>
            <a href="/m/pop?view=consult">Documentação</a>
            <a href="/m/bpmn?view=consult">Fluxogramas</a>
            <p className="mw-side-note">
              Os documentos anteriores ao fluxo continuam disponíveis na biblioteca.
            </p>
            <div className="mw-side-user">
              <strong>{organizationName}</strong>
              <small>
                {admin ? "Administrador" : coordinator ? "Coordenador" : person(state?.userId)}
              </small>
            </div>
          </aside>
        )}
        <main className="mw-main">
          <div className="mw-breadcrumb">
            <button onClick={() => go("board")}>Processos</button>
            <span>›</span>
            {selected ? demandCode(selected.number) : heading}
          </div>
          <div className="mw-heading">
            <div>
              <h1>{heading}</h1>
              <p>
                {search.id
                  ? "Documentação, entregas e responsabilidade pela próxima ação."
                  : search.view === "tasks"
                    ? "Abra a tarefa para executar a próxima ação do mapeamento."
                    : search.view === "directions"
                      ? "A orientação do Coordenador antecede o registro pelo Analista."
                      : "Acompanhe o fluxo e as entregas de cada modalidade."}
              </p>
            </div>
            <div className="mw-actions">{actions}</div>
          </div>
          {(query.isPending || me.isPending || orgs.isPending) && (
            <div className="mw-panel mw-loading" role="status">
              <Loader2 className="animate-spin" size={22} />
              Carregando mapeamentos…
            </div>
          )}
          {(query.error || me.error || orgs.error) && (
            <div className="mw-panel" role="alert">
              <h2>Não foi possível carregar</h2>
              <p>{(query.error || me.error || orgs.error)?.message}</p>
              <button
                onClick={() => {
                  void query.refetch();
                  void me.refetch();
                  void orgs.refetch();
                }}
              >
                Tentar novamente
              </button>
            </div>
          )}
          {state && !(query.error || me.error || orgs.error) && (
            <>
              {selected ? (
                renderDetail(selected)
              ) : search.id ? (
                <Empty>
                  Demanda não encontrada entre os registros disponíveis.{" "}
                  <button onClick={() => go("board")}>Voltar aos mapeamentos</button>
                </Empty>
              ) : search.view === "tasks" ? (
                renderTasks()
              ) : search.view === "directions" ? (
                renderDirections()
              ) : search.view === "coordinators" ? (
                renderCoordinators()
              ) : (
                renderBoard()
              )}
            </>
          )}
        </main>
      </div>
      {modal && state && (
        <WorkflowDialog
          key={`${modal.kind}-${modal.demand?.id || modal.requestId || modal.person}-${modal.item?.key || ""}`}
          modal={modal}
          state={state}
          busy={busy}
          error={error}
          close={() => {
            if (!busy) setModal(null);
          }}
          submit={write}
        />
      )}
    </div>
  );

  function renderBoard() {
    if (!state) return null;
    const all = state.demands.filter(
      (d) => !["awaiting_registration", "cancelled"].includes(d.status),
    );
    const filtered = all.filter(
      (d) =>
        (!search.modality || d.modality === search.modality) &&
        (!search.q ||
          `${d.title} ${demandCode(d.number)} ${d.area}`
            .toLocaleLowerCase("pt-BR")
            .includes(search.q.toLocaleLowerCase("pt-BR"))),
    );
    return (
      <>
        <div className="mw-metrics">
          <span>
            <b>{all.length}</b>mapeamentos
          </span>
          <span>
            <b>{all.filter((d) => d.status !== "completed").length}</b>em andamento
          </span>
          <span>
            <b>{all.filter((d) => d.status === "validation").length}</b>em validação
          </span>
          <span>
            <b className="mw-late">{all.filter((d) => isOverdue(d.due_date, d.status)).length}</b>
            atrasados
          </span>
        </div>
        <div className="mw-toolbar">
          <form
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void change({ q: searchText });
            }}
            className="mw-search"
          >
            <Search size={15} />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Título, código ou área"
              aria-label="Buscar mapeamentos"
            />
            {searchText && (
              <button
                type="button"
                aria-label="Limpar busca"
                onClick={() => {
                  setSearchText("");
                  void change({ q: "" });
                }}
              >
                <X size={14} />
              </button>
            )}
            <button type="submit">Buscar</button>
          </form>
          <select
            aria-label="Modalidade"
            value={search.modality}
            onChange={(e) => {
              void change({ modality: e.target.value });
            }}
          >
            <option value="">Todas as modalidades</option>
            {MAPPING_MODALITIES.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
          <small>{filtered.length} resultados</small>
          <div className="mw-switch">
            <button
              className={search.layout === "kanban" ? "active" : ""}
              onClick={() => {
                void change({ layout: "kanban" });
              }}
            >
              <SquareKanban size={15} />
              Kanban
            </button>
            <button
              className={search.layout === "list" ? "active" : ""}
              onClick={() => {
                void change({ layout: "list" });
              }}
            >
              <LayoutList size={15} />
              Lista
            </button>
          </div>
        </div>
        {!filtered.length ? (
          <Empty>
            {all.length
              ? "Nenhum resultado. Ajuste os filtros."
              : "Nenhum mapeamento registrado. O Coordenador deve solicitar o registro e o Analista concluir a tarefa."}
          </Empty>
        ) : search.layout === "kanban" ? (
          <div className="mw-board">
            {MAPPING_STATUSES.map((status) => (
              <section className="mw-column" key={status}>
                <h2>
                  <span className={`mw-status-dot ${status}`} />
                  {STATUS_LABELS[status]}
                  <b>{filtered.filter((d) => d.status === status).length}</b>
                </h2>
                {filtered
                  .filter((d) => d.status === status)
                  .map((d) => (
                    <article className="mw-card" key={d.id}>
                      <div className="mw-card-top">
                        <small>{demandCode(d.number)}</small>
                        <Badge modality={d.modality} />
                      </div>
                      <button className="mw-card-title" onClick={() => openDemand(d)}>
                        {d.title}
                      </button>
                      <p>{d.area || "Área não informada"}</p>
                      <Checklist
                        demand={d}
                        readOnly={!canEdit(d)}
                        onEdit={(item) => open({ kind: "checklist", demand: d, item })}
                      />
                      <div className="mw-card-footer">
                        <span>{person(d.analyst_id)}</span>
                        <small className={isOverdue(d.due_date, d.status) ? "mw-late" : ""}>
                          {isOverdue(d.due_date, d.status) ? "Atrasado · " : ""}
                          {date(d.due_date)}
                        </small>
                      </div>
                      <div className="mw-next">
                        <small>Próxima ação</small>
                        <strong>{NEXT_ACTION[d.status]}</strong>
                        <span>
                          {d.status === "validation"
                            ? person(d.process_owner_id)
                            : person(d.analyst_id)}
                        </span>
                      </div>
                    </article>
                  ))}
                {!filtered.some((d) => d.status === status) && (
                  <div className="mw-column-empty">Nenhum mapeamento nesta etapa.</div>
                )}
              </section>
            ))}
          </div>
        ) : (
          <div className="mw-table">
            <table>
              <thead>
                <tr>
                  <th>Mapeamento</th>
                  <th>Modalidade</th>
                  <th>Situação</th>
                  <th>Responsável</th>
                  <th>Prazo</th>
                  <th>Checklist</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <small>{demandCode(d.number)}</small>
                      <strong>{d.title}</strong>
                    </td>
                    <td>
                      <Badge modality={d.modality} />
                    </td>
                    <td>{STATUS_LABELS[d.status]}</td>
                    <td>{person(d.analyst_id)}</td>
                    <td>{date(d.due_date)}</td>
                    <td>
                      {d.checklist.filter((x) => x.state !== "pending").length}/{d.checklist.length}
                    </td>
                    <td>
                      <button onClick={() => openDemand(d)}>Abrir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mw-footnote">
          Até 500 demandas recentes. No Kanban, role horizontalmente para ver todas as etapas. Abra
          um cartão para movimentar o fluxo.
        </p>
      </>
    );
  }
  function renderTasks(demand?: MappingDemand) {
    if (!state) return null;
    const tasks = state.tasks.filter(
      (t) =>
        (!demand || t.demand_id === demand.id) &&
        (!search.mine || t.assigned_to === state.userId) &&
        (search.taskStatus === "closed"
          ? ["completed", "cancelled"].includes(t.status)
          : !["completed", "cancelled"].includes(t.status)),
    );
    return (
      <>
        <div className="mw-toolbar">
          <button
            className={search.taskStatus === "open" ? "mw-primary" : ""}
            onClick={() => {
              void change({ taskStatus: "open" });
            }}
          >
            Abertas
          </button>
          <button
            className={search.taskStatus === "closed" ? "mw-primary" : ""}
            onClick={() => {
              void change({ taskStatus: "closed" });
            }}
          >
            Concluídas / canceladas
          </button>
          {(admin || coordinator || demand) && (
            <label className="mw-inline-check">
              <input
                type="checkbox"
                checked={!search.mine}
                onChange={(e) => {
                  void change({ mine: !e.target.checked });
                }}
              />
              Ver tarefas da equipe
            </label>
          )}
          {demand &&
            (admin || coordinator || demand.analyst_id === state.userId) &&
            !["completed", "cancelled"].includes(demand.status) && (
              <button onClick={() => open({ kind: "task_create", demand })}>
                <Plus size={15} />
                Nova tarefa
              </button>
            )}
        </div>
        {tasks.length ? (
          <div className="mw-table">
            <table>
              <thead>
                <tr>
                  <th>Tarefa e demanda</th>
                  <th>Responsável</th>
                  <th>Prazo</th>
                  <th>Situação</th>
                  <th>Próxima ação</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => {
                  const d = state.demands.find((x) => x.id === t.demand_id);
                  return (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.title}</strong>
                        <small>
                          {d
                            ? `${demandCode(d.number)} · ${d.title}`
                            : "Demanda fora do lote atual"}
                        </small>
                        {t.comment && <small>{t.comment}</small>}
                      </td>
                      <td>{person(t.assigned_to)}</td>
                      <td className={isOverdue(t.due_date, t.status) ? "mw-late" : ""}>
                        {date(t.due_date)}
                      </td>
                      <td>{taskLabels[t.status]}</td>
                      <td>
                        <div className="mw-actions">
                          {d && (
                            <button
                              onClick={() =>
                                t.kind === "manual" && (t.assigned_to === state.userId || admin)
                                  ? open({ kind: "task_update", demand: d, task: t })
                                  : openDemand(d)
                              }
                            >
                              {t.kind === "registration" ? "Registrar mapeamento" : "Abrir"}
                            </button>
                          )}
                          {d &&
                            admin &&
                            !["completed", "cancelled"].includes(t.status) &&
                            t.assigned_to !== state.userId && (
                              <button
                                onClick={() => open({ kind: "take_task", demand: d, task: t })}
                              >
                                <ShieldCheck size={14} />
                                Assumir
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>Nenhuma tarefa nesta situação.</Empty>
        )}
        <p className="mw-footnote">
          {tasks.length} tarefas exibidas · As tarefas de etapa são concluídas ao avançar o
          mapeamento.
        </p>
      </>
    );
  }
  function renderDirections() {
    if (!state) return null;
    return (
      <>
        <div className="mw-flow">
          <span>1. Coordenador direciona</span>
          <ArrowRight size={16} />
          <span>2. Analista recebe a tarefa</span>
          <ArrowRight size={16} />
          <span>3. Registra o mapeamento</span>
        </div>
        {!state.coordinators.length && !admin && (
          <div className="mw-banner">
            Nenhum Coordenador designado. Solicite ao Administrador a definição do responsável.
          </div>
        )}
        {state.demands.length ? (
          <div className="mw-table">
            <table>
              <thead>
                <tr>
                  <th>Direcionamento</th>
                  <th>Modalidade</th>
                  <th>Analista</th>
                  <th>Prazo de registro</th>
                  <th>Situação</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.demands.map((d) => (
                  <tr key={d.id}>
                    <td>
                      <small>
                        {demandCode(d.number)} · {person(d.coordinator_id)}
                      </small>
                      <strong>{d.title}</strong>
                    </td>
                    <td>
                      <Badge modality={d.modality} />
                    </td>
                    <td>{person(d.analyst_id)}</td>
                    <td>{date(d.registration_due)}</td>
                    <td>{STATUS_LABELS[d.status]}</td>
                    <td>
                      <button onClick={() => openDemand(d)}>
                        {d.status === "awaiting_registration" ? "Ver orientação" : "Ver mapeamento"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>
            Nenhum direcionamento.{" "}
            {coordinator
              ? "Use “Solicitar registro” para atribuir o trabalho ao Analista."
              : "Aguarde o direcionamento do Coordenador."}
          </Empty>
        )}
      </>
    );
  }
  function renderCoordinators() {
    if (!state || !admin) return <Empty>Acesso reservado a administradores.</Empty>;
    return (
      <div className="mw-panel">
        <h2>Responsáveis pelo direcionamento</h2>
        <p className="mw-muted">
          Coordenadores podem distribuir o trabalho. O Administrador mantém permissão para assumir
          tarefas e intervir em qualquer etapa, com justificativa.
        </p>
        {state.people.map((p) => (
          <div className="mw-row" key={p.id}>
            <span>{p.name}</span>
            <span>
              {state.coordinators.includes(p.id) ? "Coordenador" : "Sem papel de Coordenador"}
            </span>
            <button
              onClick={() =>
                open({
                  kind: "coordinator",
                  person: p.id,
                  enabled: !state.coordinators.includes(p.id),
                })
              }
            >
              {state.coordinators.includes(p.id) ? "Remover papel" : "Definir como Coordenador"}
            </button>
          </div>
        ))}
      </div>
    );
  }
  function renderDetail(d: MappingDemand) {
    if (!state) return null;
    const advance = nextStatuses(d.status);
    return (
      <>
        <div className="mw-meta">
          <Badge modality={d.modality} />
          <span>
            <small>Analista</small>
            {person(d.analyst_id)}
          </span>
          <span>
            <small>Dono do processo</small>
            {person(d.process_owner_id)}
          </span>
          <span>
            <small>Prazo</small>
            {date(d.due_date)}
          </span>
          <span>
            <small>Direcionado por</small>
            {person(d.coordinator_id)}
          </span>
        </div>
        <div className="mw-steps">
          {MAPPING_STATUSES.map((s, i) => (
            <div key={s} className={s === d.status ? "active" : ""}>
              <b>{i + 1}</b>
              {STATUS_LABELS[s]}
            </div>
          ))}
        </div>
        {d.status === "cancelled" && (
          <div className="mw-banner">
            Esta demanda foi cancelada. Os documentos e o histórico foram preservados.
          </div>
        )}
        <div className="mw-tabs">
          {["Visão geral", "Conteúdo da modalidade", "Entregáveis", "Tarefas", "Histórico"].map(
            (t) => (
              <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
                {t}
              </button>
            ),
          )}
        </div>
        <div className="mw-detail">
          <section className="mw-panel">
            {tab === "Visão geral" ? (
              <>
                <h2>Objetivo e escopo</h2>
                <p className="mw-bodycopy">{d.purpose}</p>
                <h3>Processo vinculado</h3>
                <p>
                  {state.processes.find((p) => p.id === d.process_id)?.name ||
                    "Processo indisponível"}
                </p>
                <h3>Modalidade</h3>
                <p>{d.modality} · O estado AS IS / TO BE permanece no editor do processo.</p>
              </>
            ) : tab === "Conteúdo da modalidade" ? (
              <>
                <div className="mw-panel-heading">
                  <h2>{d.modality}</h2>
                  {canEdit(d) && (
                    <button onClick={() => open({ kind: "details", demand: d })}>
                      Editar conteúdo
                    </button>
                  )}
                </div>
                {MODALITY_FIELDS[d.modality].map((f) => (
                  <div className="mw-content-section" key={f.key}>
                    <h3>{f.label}</h3>
                    <p className="mw-bodycopy">{d.details[f.key] || "Ainda não documentado."}</p>
                  </div>
                ))}
              </>
            ) : tab === "Entregáveis" ? (
              <>
                <h2>Checklist de {d.modality}</h2>
                <p className="mw-muted">
                  As entregas são as mesmas exibidas no cartão. Registre evidências e vincule
                  documentos antes da validação.
                </p>
                {d.checklist.map((item) => (
                  <div className="mw-row" key={item.key}>
                    <span className={`mw-tick ${item.state !== "pending" ? "done" : ""}`}>
                      {item.state !== "pending" && <Check size={12} />}
                    </span>
                    <div className="mw-grow">
                      <strong>{item.label}</strong>
                      <small>
                        {item.state === "done"
                          ? "Concluído"
                          : item.state === "not_applicable"
                            ? "Não aplicável"
                            : "Pendente"}
                        {item.optional ? " · Quando necessário" : ""}
                      </small>
                    </div>
                    <button onClick={() => open({ kind: "checklist", demand: d, item })}>
                      {canEdit(d) && item.key !== "validation" ? "Atualizar" : "Consultar"}
                    </button>
                  </div>
                ))}
              </>
            ) : tab === "Tarefas" ? (
              renderTasks(d)
            ) : (
              <>
                <h2>Histórico do mapeamento</h2>
                <div className="mw-timeline">
                  {state.events
                    .filter((e) => e.demand_id === d.id)
                    .map((e) => (
                      <div key={e.id}>
                        <strong>{eventLabels[e.action] || e.action}</strong>
                        <small>
                          {person(e.actor_id)} · {new Date(e.created_at).toLocaleString("pt-BR")}
                        </small>
                        {e.comment && <p>{e.comment}</p>}
                      </div>
                    ))}
                </div>
              </>
            )}
          </section>
          <aside className="mw-stack">
            <section className="mw-panel">
              <h3>Próxima ação</h3>
              <h2>{NEXT_ACTION[d.status]}</h2>
              <p className="mw-muted">
                {d.status === "validation" ? person(d.process_owner_id) : person(d.analyst_id)}
              </p>
              {advance.length > 0 &&
                (admin ||
                  (d.status === "validation"
                    ? d.process_owner_id === state.userId
                    : d.analyst_id === state.userId)) && (
                  <div className="mw-stack mt-4">
                    {advance.map((s) => (
                      <button
                        key={s}
                        className={s === "adjustments" ? "" : "mw-primary"}
                        onClick={() => open({ kind: "transition", demand: d, status: s })}
                      >
                        {s === "completed"
                          ? "Aprovar e concluir"
                          : s === "adjustments"
                            ? "Solicitar ajustes"
                            : s === "validation"
                              ? "Enviar para validação"
                              : s === "discovery"
                                ? "Iniciar levantamento"
                                : "Iniciar documentação"}
                      </button>
                    ))}
                  </div>
                )}
            </section>
            <section className="mw-panel">
              <h3>Vínculo de entrada</h3>
              <p className="mw-bodycopy">
                {demandCode(d.number)}
                <br />
                {person(d.coordinator_id)} · Direcionamento
                <br />
                {person(d.analyst_id)} · Registro
              </p>
              <small>
                O mapeamento e suas tarefas permanecem vinculados à orientação original.
              </small>
            </section>
            {admin && (
              <section className="mw-panel">
                <h3 className="flex items-center gap-2">
                  <ShieldCheck size={16} />
                  Intervenção administrativa
                </h3>
                <p className="mw-muted">
                  Você pode assumir tarefas, reatribuir responsáveis e movimentar o fluxo. Toda
                  intervenção exige justificativa e fica no histórico.
                </p>
              </section>
            )}
          </aside>
        </div>
      </>
    );
  }
}

function WorkflowDialog({
  modal,
  state,
  busy,
  error,
  close,
  submit,
}: {
  modal: DialogState;
  state: WorkflowData;
  busy: boolean;
  error: string;
  close: () => void;
  submit: (action: Command["action"], payload: Record<string, unknown>) => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    form = useRef<HTMLFormElement>(null),
    [dirty, setDirty] = useState(false),
    [discard, setDiscard] = useState(false),
    [validation, setValidation] = useState(""),
    [modality, setModality] = useState<MappingModality>(modal.demand?.modality || "Sistemas");
  const d = modal.demand,
    admin = state.isAdmin;
  const editable =
    !!d &&
    (admin || d.analyst_id === state.userId) &&
    ["registered", "discovery", "documentation", "adjustments"].includes(d.status);
  const readOnly =
    modal.kind === "register"
      ? !!d && !admin && d.analyst_id !== state.userId
      : modal.kind === "checklist" && (!editable || modal.item?.key === "validation");
  const title = {
    direct: "Solicitar registro de mapeamento",
    register: "Registrar mapeamento",
    checklist: modal.item?.label || "Entrega",
    transition:
      modal.status === "completed"
        ? "Aprovar e concluir"
        : modal.status === "adjustments"
          ? "Solicitar ajustes"
          : "Avançar mapeamento",
    task_create: "Nova tarefa",
    task_update: "Atualizar tarefa",
    reassign: "Reatribuir Analista",
    cancel: "Cancelar demanda",
    coordinator: modal.enabled ? "Definir Coordenador" : "Remover papel de Coordenador",
    take_task: "Assumir tarefa",
    details: "Conteúdo da modalidade",
  }[modal.kind];
  useEffect(() => {
    const element = ref.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  useEffect(() => {
    if (error || validation) form.current?.querySelector<HTMLElement>('[role="alert"]')?.focus();
  }, [error, validation]);
  const requestClose = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else close();
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    setValidation("");
    const element = e.currentTarget;
    for (const input of element.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("[required]")) {
      input.removeAttribute("aria-invalid");
      if (!input.value.trim()) {
        input.setAttribute("aria-invalid", "true");
        input.focus();
        setValidation("Preencha os campos obrigatórios.");
        return;
      }
    }
    const values = Object.fromEntries(new FormData(element));
    const payload: Record<string, unknown> = {
      ...values,
      ...(d ? { id: d.id, revision: d.revision } : {}),
    };
    if (modal.kind === "direct") payload.id = modal.requestId;
    if (modal.kind === "coordinator") {
      payload.userId = modal.person;
      payload.enabled = modal.enabled;
    }
    if (modal.kind === "checklist") payload.key = modal.item?.key;
    if (modal.kind === "transition") payload.status = modal.status;
    if (modal.task) payload.taskId = modal.task.id;
    if (modal.kind === "details")
      payload.details = Object.fromEntries(
        MODALITY_FIELDS[modality].map((f) => [f.key, values[f.key] || ""]),
      );
    void submit(modal.kind, payload);
  };
  const peopleOptions = (editors = false) =>
    state.people
      .filter((p) => !editors || p.can_edit)
      .map((p) => (
        <option value={p.id} key={p.id}>
          {p.name}
        </option>
      ));
  const reason = admin ? "Justificativa da intervenção administrativa" : "Observação / parecer";
  return (
    <dialog
      className="mw-dialog mw-root"
      ref={ref}
      aria-labelledby="mw-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        requestClose();
      }}
    >
      <div className="mw-panel-heading">
        <h2 id="mw-dialog-title">{title}</h2>
        <button aria-label="Fechar" onClick={requestClose} disabled={busy}>
          <X size={18} />
        </button>
      </div>
      <form ref={form} noValidate onSubmit={onSubmit} onChange={() => setDirty(true)}>
        {d && (
          <div className="mw-banner">
            <strong>
              {demandCode(d.number)} · {d.title}
            </strong>
            <p>{d.purpose}</p>
            <small>
              Direcionado por{" "}
              {state.people.find((p) => p.id === d.coordinator_id)?.name || "Coordenador"}
            </small>
          </div>
        )}
        {(modal.kind === "direct" || modal.kind === "register") && (
          <fieldset disabled={readOnly || busy} className="mw-form-grid">
            <Field label="Título *">
              <input name="title" defaultValue={d?.title} required maxLength={200} />
            </Field>
            {modal.kind === "direct" ? (
              <>
                <Field label="Analista responsável *">
                  <select name="analystId" required defaultValue="">
                    <option value="">Selecione</option>
                    {peopleOptions(true)}
                  </select>
                </Field>
                <Field label="Área">
                  <input name="area" maxLength={200} />
                </Field>
                <Field label="Prazo de registro *">
                  <input name="registrationDue" type="date" required />
                </Field>
                <Field label="Prioridade">
                  <select name="priority">
                    <option>Média</option>
                    <option>Alta</option>
                    <option>Baixa</option>
                  </select>
                </Field>
              </>
            ) : (
              <>
                <Field label="Processo *">
                  <select name="processId" required defaultValue="">
                    <option value="">Selecione um processo</option>
                    {state.processes.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Dono do processo *">
                  <select name="processOwnerId" required defaultValue="">
                    <option value="">Selecione</option>
                    {peopleOptions()}
                  </select>
                </Field>
                <Field label="Prazo do mapeamento *">
                  <input name="dueDate" type="date" required />
                </Field>
              </>
            )}
            <div className="mw-full">
              <Field
                label={
                  modal.kind === "direct" ? "Modalidade provável *" : "Modalidade do mapeamento *"
                }
              >
                <select
                  name="modality"
                  value={modality}
                  onChange={(e) => setModality(e.target.value as MappingModality)}
                >
                  {MAPPING_MODALITIES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mw-full">
              <Field label="Propósito e orientação *">
                <textarea
                  className="resize-none"
                  name="purpose"
                  defaultValue={d?.purpose}
                  required
                  maxLength={10000}
                />
              </Field>
            </div>
            {modal.kind === "register" && (
              <div className="mw-full mw-preview-checklist">
                <h3>Checklist que acompanhará o cartão</h3>
                <Badge modality={modality} />
                {modalityChecklist(modality).map((item) => (
                  <span key={item.key}>
                    <span className="mw-tick" />
                    {item.label}
                    {item.optional ? " (quando necessário)" : ""}
                  </span>
                ))}
                <p>
                  Ao registrar, a tarefa atual será concluída e o levantamento será atribuído ao
                  Analista.
                </p>
              </div>
            )}
          </fieldset>
        )}
        {modal.kind === "checklist" && (
          <fieldset disabled={readOnly || busy} className="mw-stack">
            <Field label="Situação">
              <select name="state" defaultValue={modal.item?.state}>
                <option value="pending">Pendente</option>
                <option value="done">Concluído</option>
                {modal.item?.optional && <option value="not_applicable">Não aplicável</option>}
              </select>
            </Field>
            <Field
              label="Evidência ou justificativa"
              hint="Obrigatória para concluir ou marcar como não aplicável."
            >
              <textarea
                className="resize-none"
                name="evidence"
                defaultValue={modal.item?.evidence}
                maxLength={10000}
              />
            </Field>
            <Field label="Documento vinculado">
              <select name="documentId" defaultValue={modal.item?.document_id || ""}>
                <option value="">Sem documento vinculado</option>
                {state.documents.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>
        )}
        {modal.kind === "details" && (
          <div className="mw-stack">
            {MODALITY_FIELDS[modality].map((f) => (
              <Field key={f.key} label={f.label} hint={f.hint}>
                <textarea
                  className="resize-none"
                  name={f.key}
                  defaultValue={d?.details[f.key]}
                  maxLength={20000}
                />
              </Field>
            ))}
          </div>
        )}
        {modal.kind === "transition" && (
          <p className="mw-bodycopy">
            Nova etapa: <strong>{STATUS_LABELS[modal.status as keyof typeof STATUS_LABELS]}</strong>
            .{" "}
            {modal.status === "completed"
              ? "A aprovação preserva uma cópia das entregas revisadas e conclui as tarefas da etapa."
              : "O sistema atualizará a tarefa e o responsável pela próxima ação."}
          </p>
        )}
        {modal.kind === "reassign" && (
          <Field label="Novo Analista *">
            <select name="analystId" defaultValue={d?.analyst_id} required>
              {peopleOptions(true)}
            </select>
          </Field>
        )}
        {modal.kind === "task_create" && (
          <div className="mw-stack">
            <Field label="Título da tarefa *">
              <input name="title" required maxLength={200} />
            </Field>
            <Field label="Responsável *">
              <select name="assignedTo" required defaultValue="">
                <option value="">Selecione</option>
                {peopleOptions()}
              </select>
            </Field>
            <Field label="Prazo *">
              <input name="dueDate" type="date" required />
            </Field>
          </div>
        )}
        {modal.kind === "task_update" && (
          <>
            <h3>{modal.task?.title}</h3>
            <Field label="Situação">
              <select name="status" defaultValue={modal.task?.status}>
                {["pending", "in_progress", "waiting", "completed"].map((s) => (
                  <option key={s} value={s}>
                    {taskLabels[s]}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        {modal.kind === "take_task" && (
          <p>
            Você passará a ser responsável por <strong>{modal.task?.title}</strong>. Se for uma
            tarefa de etapa, a responsabilidade correspondente no mapeamento também será atualizada.
          </p>
        )}
        {modal.kind === "coordinator" && (
          <p>
            {state.people.find((p) => p.id === modal.person)?.name}:{" "}
            {modal.enabled
              ? "poderá direcionar e redistribuir demandas."
              : "deixará de direcionar novas demandas. O histórico será preservado."}
          </p>
        )}
        {modal.kind === "cancel" && (
          <p>As tarefas abertas serão canceladas. Documentos e histórico serão preservados.</p>
        )}
        {!readOnly && (
          <div className="mt-4">
            <Field
              label={`${reason}${admin || ["transition", "cancel", "reassign", "take_task", "task_update"].includes(modal.kind) ? " *" : ""}`}
            >
              <textarea
                className="resize-none"
                name="comment"
                required={
                  admin ||
                  ["transition", "cancel", "reassign", "take_task", "task_update"].includes(
                    modal.kind,
                  )
                }
                maxLength={4000}
              />
            </Field>
          </div>
        )}
        {readOnly && (
          <p className="mw-muted mt-4">
            {modal.item?.key === "validation"
              ? "A validação é registrada pela ação “Aprovar e concluir”."
              : "Consulta disponível. Esta ação pertence ao responsável designado ou ao Administrador."}
          </p>
        )}
        <div role="alert" tabIndex={-1} className="mw-error">
          {validation || error}
        </div>
        {discard ? (
          <div className="mw-banner">
            <p>Descartar as alterações ainda não salvas?</p>
            <div className="mw-actions">
              <button type="button" onClick={() => setDiscard(false)}>
                Continuar editando
              </button>
              <button type="button" onClick={close}>
                Descartar alterações
              </button>
            </div>
          </div>
        ) : (
          <div className="mw-dialog-footer">
            <button type="button" disabled={busy} onClick={requestClose}>
              {readOnly ? "Fechar" : "Voltar"}
            </button>
            {!readOnly && (
              <button type="submit" disabled={busy} className="mw-primary">
                {busy && <Loader2 size={15} className="animate-spin" />}
                {busy
                  ? "Salvando…"
                  : modal.kind === "register"
                    ? "Criar mapeamento"
                    : modal.kind === "direct"
                      ? "Criar tarefa de registro"
                      : modal.kind === "take_task"
                        ? "Assumir tarefa"
                        : modal.kind === "transition" && modal.status === "completed"
                          ? "Aprovar e concluir"
                          : "Confirmar"}
              </button>
            )}
          </div>
        )}
      </form>
    </dialog>
  );
}
