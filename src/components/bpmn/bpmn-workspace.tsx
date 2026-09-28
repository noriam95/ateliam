import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { Plus, Upload, Workflow, Search } from "lucide-react";
import { BFFlowMark } from "@/components/bf-flow-mark";
import { WorkspaceLauncher } from "@/components/workspace-navigation";
import { TaskDialog } from "@/components/task-dialog";
import { TaskEditorContext } from "@/components/task-editor-context";
import {
  getMe,
  listAccessibleOrganizations,
  listOrganizationCatalogs,
  listBpmnDocuments,
  getModuleDocumentContent,
  saveBpmnDocument,
  saveProcessArea,
  savePositionRegistration,
  saveProcessRegistration,
  reserveCode,
} from "@/lib/config.functions";
import { normalizeCodeSettings } from "@/lib/code-generation";
import { visibleModulesFor } from "@/lib/module-visibility";
import { blankBpmn, readBpmnDocument, type BpmnDocument } from "@/lib/bpmn-document";
import { CatalogPicker, type BpmnCatalogs, type CreateCatalogItem } from "./catalog-picker";
import { BpmnEditor, type SavedBpmn } from "./bpmn-editor";
import { BpmnImportWizard } from "./import-wizard";
import "./bpmn.css";

export function BpmnWorkspace({
  documentId,
  requestedOrganization,
  newDrawing = false,
  taskId,
  itemKey,
}: {
  documentId?: string;
  requestedOrganization?: string;
  newDrawing?: boolean;
  taskId?: string;
  itemKey?: string;
}) {
  const navigate = useNavigate();
  const getUser = useServerFn(getMe);
  const getOrganizations = useServerFn(listAccessibleOrganizations);
  const getCatalogs = useServerFn(listOrganizationCatalogs);
  const getDocuments = useServerFn(listBpmnDocuments);
  const getDocument = useServerFn(getModuleDocumentContent);
  const saveDocument = useServerFn(saveBpmnDocument);
  const createArea = useServerFn(saveProcessArea);
  const createPosition = useServerFn(savePositionRegistration);
  const createProcess = useServerFn(saveProcessRegistration);
  const reserve = useServerFn(reserveCode);
  const me = useQuery({ queryKey: ["bpmn-me"], queryFn: () => getUser() });
  const organizations = useQuery({
    queryKey: ["bpmn-organizations"],
    queryFn: () => getOrganizations(),
  });
  const [organizationId, setOrganizationId] = useState("");
  const [catalogs, setCatalogs] = useState<BpmnCatalogs>({ process: [], area: [], position: [] });
  const [active, setActive] = useState<{
    document: BpmnDocument;
    record: SavedBpmn | null;
    key: string;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<"new" | "import" | null>(null);
  const [newProcess, setNewProcess] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const opened = useRef("");
  const loadToken = useRef(0);
  const canEdit = !!me.data?.roles.some((role) => role === "admin" || role === "editor");
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    withResolver: true,
    enableBeforeUnload: false,
  });
  useEffect(() => {
    if (!organizations.data?.length || organizationId) return;
    let preferred = requestedOrganization;
    if (!preferred)
      try {
        preferred = localStorage.getItem("ateliam-active-organization") || undefined;
      } catch {
        /* Use default membership. */
      }
    const organization =
      organizations.data.find((o) => o.id === preferred) ||
      organizations.data.find((o) => o.isDefault) ||
      organizations.data[0];
    setOrganizationId(organization.id);
  }, [organizations.data, organizationId, requestedOrganization]);
  const catalogQuery = useQuery({
    queryKey: ["bpmn-catalogs", organizationId],
    enabled: !!organizationId,
    queryFn: () => getCatalogs({ data: { organizationId } }),
  });
  useEffect(() => {
    if (catalogQuery.data)
      setCatalogs({
        process: catalogQuery.data.processes.filter(
          (p) => p.type === "process" || p.type === "subprocess",
        ),
        area: catalogQuery.data.departments,
        position: catalogQuery.data.positions.map((p) => ({ id: p.id, name: p.title })),
      });
  }, [catalogQuery.data]);
  const docs = useQuery({
    queryKey: ["bpmn-documents", organizationId, page, search],
    enabled: !!organizationId,
    queryFn: () => getDocuments({ data: { organizationId, page, search } }),
  });
  const loadDocument = useCallback(
    async (id: string) => {
      const token = ++loadToken.current;
      setLoading(true);
      setError("");
      try {
        const row = await getDocument({ data: { id } });
        if (token !== loadToken.current) return;
        if (row.organization_id !== organizationId || row.module !== "bpmn")
          throw new Error("O desenho não pertence ao módulo e à organização ativos.");
        if (!row.content_inline) throw new Error("Este documento não contém um desenho salvo.");
        const document = readBpmnDocument(row.content_inline);
        setActive({ document, record: { ...row, code: document.codigo }, key: row.id });
        setDirty(false);
      } catch (error) {
        if (token === loadToken.current)
          setError(error instanceof Error ? error.message : "Não foi possível abrir o desenho.");
      } finally {
        if (token === loadToken.current) setLoading(false);
      }
    },
    [getDocument, organizationId],
  );
  useEffect(() => {
    if (organizationId && documentId && opened.current !== `${organizationId}:${documentId}`) {
      opened.current = `${organizationId}:${documentId}`;
      void loadDocument(documentId);
    }
  }, [organizationId, documentId, loadDocument]);
  useEffect(() => {
    if (newDrawing && canEdit && !documentId) setModal("new");
  }, [newDrawing, canEdit, documentId]);
  const create: CreateCatalogItem = async (kind, values) => {
    if (!canEdit) throw new Error("Seu acesso permite somente visualizar desenhos.");
    let item;
    if (kind === "area") {
      const row = await createArea({
        data: { organizationId, name: values.name, sigla: values.sigla },
      });
      item = { id: row.id, name: row.name, sigla: row.sigla };
    } else if (kind === "position") {
      const row = await createPosition({ data: { organizationId, title: values.name } });
      item = { id: row.id, name: row.title };
    } else {
      const area = catalogs.area.find((a) => a.id === values.areaId);
      if (!area) throw new Error("Selecione uma área do cadastro central.");
      const organization = organizations.data?.find((o) => o.id === organizationId);
      const automatic = normalizeCodeSettings(organization?.code_settings).processo.mode === "auto";
      const code = automatic
        ? (
            await reserve({
              data: { organizationId, type: "processo", areaSigla: area.sigla || "GER" },
            })
          ).code
        : undefined;
      const row = await createProcess({
        data: {
          organizationId,
          name: values.name,
          department: area.name,
          code,
          type: "process",
          status: "Ativo",
        },
      });
      item = { id: row.id, name: row.name, code: row.code };
    }
    setCatalogs((current) => ({
      ...current,
      [kind]: [...current[kind].filter((i) => i.id !== item.id), item],
    }));
    return item;
  };
  const openNew = (document: BpmnDocument) => {
    setActive({ document, record: null, key: "new" });
    setModal(null);
    setDirty(true);
  };
  const failure =
    error || me.error?.message || organizations.error?.message || catalogQuery.error?.message;
  return (
    <main className="bf-bpmn-root">
      <header className="bf-bpmn-global-header">
        <WorkspaceLauncher
          activeArea="modules"
          visibleModules={visibleModulesFor(me.data?.profile, !!me.data?.roles.includes("admin"))}
          onSelect={(area) => void navigate({ to: "/", search: { area } as any })}
        />
        <BFFlowMark className="h-7" />
        <span className="bf-bpmn-global-name">Desenhos BPMN</span>
        <span className="bf-bpmn-org">
          {organizations.data?.find((o) => o.id === organizationId)?.name}
        </span>
        {!active && (
          <label className="bf-bpmn-org-select">
            <span className="sr-only">Organização ativa</span>
            <select
              aria-label="Organização ativa"
              value={organizationId}
              onChange={(e) => {
                loadToken.current++;
                setOrganizationId(e.target.value);
                setPage(0);
                setSearch("");
                setCatalogs({ process: [], area: [], position: [] });
                try {
                  localStorage.setItem("ateliam-active-organization", e.target.value);
                } catch {
                  /* Membership still applies for this session. */
                }
              }}
            >
              {organizations.data?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {failure && (
        <div className="bf-bpmn-error" role="alert">
          {failure}
          <button
            onClick={() => {
              setError("");
              void me.refetch();
              void organizations.refetch();
              void catalogQuery.refetch();
              if (documentId) void loadDocument(documentId);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {me.isPending || organizations.isPending || catalogQuery.isLoading || loading ? (
        <div className="bf-bpmn-empty" role="status">
          Carregando desenhos e cadastros…
        </div>
      ) : active ? (
        <BpmnEditor
          key={`${organizationId}:${active.key}`}
          initial={active.document}
          saved={active.record}
          storageKey={`bf-flow:bpmn:${me.data?.userId}:${organizationId}:${active.key}`}
          catalogs={catalogs}
          create={create}
          canEdit={canEdit}
          onDirty={setDirty}
          taskContext={
            taskId && itemKey && documentId && active.record?.id === documentId ? (
              <TaskEditorContext
                organizationId={organizationId}
                taskId={taskId}
                itemKey={itemKey}
                documentId={documentId}
              />
            ) : undefined
          }
          onBack={() => {
            setActive(null);
            setDirty(false);
            void docs.refetch();
          }}
          onSave={async (input) => {
            const row = await saveDocument({ data: { ...input, organizationId } });
            if (taskId && itemKey && documentId === row.id)
              window.dispatchEvent(
                new CustomEvent("bf-task-document-saved", {
                  detail: {
                    documentId: row.id,
                    version: row.current_version,
                    updatedAt: row.updated_at,
                    draft: input.saveMode === "draft",
                  },
                }),
              );
            void docs.refetch();
            return { ...row, code: readBpmnDocument(row.content_inline || "{}").codigo };
          }}
        />
      ) : (
        <div className="bf-bpmn-library">
          <div className="bf-bpmn-library-heading">
            <div>
              <h1>Desenhos BPMN</h1>
              <p>Modele processos e aproveite os desenhos que sua equipe já possui.</p>
            </div>
            {canEdit && (
              <div className="bf-bpmn-actions">
                <button onClick={() => setModal("import")}>
                  <Upload size={17} />
                  Importar BPMN
                </button>
                <button
                  className="bf-bpmn-primary"
                  onClick={() => {
                    setNewProcess("");
                    setModal("new");
                  }}
                >
                  <Plus size={17} />
                  Novo desenho
                </button>
              </div>
            )}
          </div>
          <label className="bf-bpmn-search">
            <Search size={17} />
            <input
              aria-label="Pesquisar desenhos"
              placeholder="Pesquisar por processo…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(0);
              }}
            />
          </label>
          {docs.isPending ? (
            <p role="status">Buscando desenhos…</p>
          ) : docs.error ? (
            <div role="alert">
              <p>{docs.error.message}</p>
              <button onClick={() => void docs.refetch()}>Tentar novamente</button>
            </div>
          ) : !docs.data?.rows.length ? (
            <div className="bf-bpmn-empty">
              <Workflow size={38} />
              <h2>{search ? "Nenhum desenho encontrado" : "Criar um desenho BPMN"}</h2>
              <p>
                {search
                  ? "Tente outro nome de processo."
                  : "Selecione um processo, defina as raias e comece a desenhar — ou importe um arquivo .bpmn."}
              </p>
              {!search && canEdit && (
                <div className="bf-bpmn-actions">
                  <button className="bf-bpmn-primary" onClick={() => setModal("new")}>
                    Novo desenho
                  </button>
                  <button onClick={() => setModal("import")}>Importar BPMN</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="bf-bpmn-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Processo / desenho</th>
                      <th>Versão</th>
                      <th>Atualizado em</th>
                      <th>
                        <span className="sr-only">Ação</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {docs.data.rows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.name}</td>
                        <td>{row.current_version || "Rascunho"}</td>
                        <td>{new Date(row.updated_at).toLocaleString("pt-BR")}</td>
                        <td>
                          <button onClick={() => void loadDocument(row.id)}>Abrir desenho</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bf-bpmn-pagination">
                <span>
                  {docs.data.count} desenhos · página {page + 1}
                </span>
                <button disabled={!page} onClick={() => setPage(page - 1)}>
                  Anterior
                </button>
                <button
                  disabled={(page + 1) * 20 >= docs.data.count}
                  onClick={() => setPage(page + 1)}
                >
                  Próxima
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {modal === "new" && (
        <TaskDialog title="Novo desenho BPMN" onClose={() => setModal(null)}>
          <div className="bf-bpmn-form">
            <p>
              Escolha o processo que será desenhado. Depois, defina os responsáveis pelas raias e
              insira o evento de início.
            </p>
            <CatalogPicker
              kind="process"
              catalogs={catalogs}
              value={newProcess}
              onChange={(p) => setNewProcess(p?.id || "")}
              create={create}
              label="Processo obrigatório"
            />
          </div>
          <footer>
            <button onClick={() => setModal("import")}>
              <Upload size={17} />
              Importar arquivo BPMN
            </button>
            <button onClick={() => setModal(null)}>Cancelar</button>
            <button
              className="bf-bpmn-primary"
              disabled={!newProcess}
              onClick={() => {
                const p = catalogs.process.find((p) => p.id === newProcess);
                if (p)
                  openNew({
                    schemaVersion: 2,
                    xml: blankBpmn(p.name),
                    processId: p.id,
                    processName: p.name,
                    laneBindings: {},
                    status: "Rascunho",
                    origin: "created",
                  });
              }}
            >
              Criar desenho
            </button>
          </footer>
        </TaskDialog>
      )}
      {modal === "import" && (
        <BpmnImportWizard
          catalogs={catalogs}
          create={create}
          onClose={() => setModal(null)}
          onImport={openNew}
        />
      )}
      {blocker.status === "blocked" && (
        <TaskDialog title="Há alterações não salvas" onClose={() => blocker.reset()}>
          <div className="bf-bpmn-form">
            <p>Volte ao desenho para salvar ou exportar antes de mudar de página.</p>
          </div>
          <footer>
            <button onClick={() => blocker.reset()}>Continuar editando</button>
            <button onClick={() => blocker.proceed()}>Sair sem salvar</button>
          </footer>
        </TaskDialog>
      )}
    </main>
  );
}
