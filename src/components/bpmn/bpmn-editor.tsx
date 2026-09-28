import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Circle,
  Square,
  Diamond,
  MessageSquare,
  Plus,
  Undo2,
  Redo2,
  MousePointer2,
  Hand,
  Link2,
  Save,
  Download,
  Upload,
  Presentation,
  Pencil,
  SlidersHorizontal,
  CircleHelp,
  Copy,
  ClipboardPaste,
  Trash2,
} from "lucide-react";
import { BpmnImportWizard } from "./import-wizard";
import { TaskDialog } from "@/components/task-dialog";
import { BpmnCanvas, type BpmnCanvasHandle, type CanvasSelection } from "./bpmn-canvas";
import { CatalogPicker, type BpmnCatalogs, type CreateCatalogItem } from "./catalog-picker";
import { captureBpmnSaveAttempt } from "@/lib/bpmn-save-attempt";
import { inspectBpmn, type BpmnDocument } from "@/lib/bpmn-document";
import "@/components/user-tasks.css";

const elementLabels: Record<string, string> = {
  Task: "Tarefa",
  UserTask: "Tarefa de usuário",
  ManualTask: "Tarefa manual",
  ServiceTask: "Tarefa de serviço",
  StartEvent: "Evento de início",
  EndEvent: "Evento de fim",
  IntermediateThrowEvent: "Evento intermediário",
  IntermediateCatchEvent: "Evento de captura",
  ExclusiveGateway: "Decisão exclusiva",
  ParallelGateway: "Gateway paralelo",
  SubProcess: "Subprocesso",
  Participant: "Pool",
  Lane: "Raia",
  TextAnnotation: "Anotação",
  SequenceFlow: "Fluxo de sequência",
  MessageFlow: "Fluxo de mensagem",
  Association: "Associação",
  label: "Rótulo",
};

export type SavedBpmn = {
  code?: string;
  id: string;
  code?: string;
  current_version: number | null;
  updated_at: string;
  created_at?: string;
  owner_id?: string;
};
export type BpmnSaveInput = {
  id: string;
  mutationId: string;
  saveMode: "draft" | "final";
  expectedVersion: number | null;
  expectedUpdatedAt: string | null;
  document: BpmnDocument;
};
function downloadBpmnFile(content: string, filename: string, mime = "application/xml") {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BpmnEditor({
  initial,
  saved,
  storageKey,
  catalogs,
  create,
  canEdit = true,
  onSave,
  onDirty,
  onBack,
  taskContext,
}: {
  initial: BpmnDocument;
  saved: SavedBpmn | null;
  storageKey: string;
  catalogs: BpmnCatalogs;
  create: CreateCatalogItem;
  canEdit?: boolean;
  onSave: (input: BpmnSaveInput) => Promise<SavedBpmn>;
  onDirty?: (dirty: boolean) => void;
  onBack: () => void;
  taskContext?: ReactNode;
}) {
  const canvas = useRef<BpmnCanvasHandle>(null);
  const presentationCanvas = useRef<BpmnCanvasHandle>(null);
  const [document, setDocument] = useState(initial);
  const documentRef = useRef(document);
  documentRef.current = document;
  const [seed, setSeed] = useState(initial.xml);
  const [canvasGeneration, setCanvasGeneration] = useState(0);
  const [presentationXml, setPresentationXml] = useState(initial.xml);
  const [record, setRecord] = useState(saved);
  const recordRef = useRef(saved);
  const newId = useRef(saved?.id || crypto.randomUUID());
  const [revision, setRevision] = useState(0);
  const revisionRef = useRef(0);
  const [dirty, setDirty] = useState(!saved);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const pending = useRef<{ input: BpmnSaveInput; revision: number } | null>(null);
  const [ready, setReady] = useState(false);
  const [presenting, setPresenting] = useState(!canEdit);
  const [frozen, setFrozen] = useState(true);
  const [appearance, setAppearance] = useState<"color" | "mono">(() => {
    try {
      const preference = localStorage.getItem("bf-flow:bpmn:appearance");
      return preference === "color" || preference === "mono" ? preference : "color";
    } catch {
      return "color";
    }
  });

  const [properties, setProperties] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 1000,
  );
  const [selection, setSelection] = useState<CanvasSelection>(null);
  const [elementName, setElementName] = useState("");
  const [laneKind, setLaneKind] = useState<"area" | "position">("area");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showWarnings, setShowWarnings] = useState(false);
  const [help, setHelp] = useState(false);
  const [saveMenu, setSaveMenu] = useState(false);
  const [exit, setExit] = useState(false);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<BpmnDocument | null>(null);
  const [autoSave, setAutoSave] = useState(initial.origin !== "legacy");
  const [recovery, setRecovery] = useState<{
    document: BpmnDocument;
    savedAt: string;
    record: SavedBpmn | null;
    id?: string;
  } | null>(null);
  const [localStatus, setLocalStatus] = useState("");
  const readOnly = presenting || !canEdit;
  const changed = () => {
    revisionRef.current++;
    setRevision(revisionRef.current);
    setDirty(true);
    setNotice("");
  };
  const update = (patch: Partial<BpmnDocument>) => {
    setDocument((current) => ({ ...current, ...patch }));
    changed();
  };
  const capture = async () => ({ ...documentRef.current, xml: await canvas.current!.xml() });
  const action = (name: string, event?: any) => {
    try {
      (presenting && canEdit ? presentationCanvas : canvas).current?.action(name, event);
    } catch (error) {
      setError(error instanceof Error ? error.message : "A ação não pôde ser concluída.");
    }
  };
  const createShape = (type: string, event?: any) => {
    try {
      canvas.current?.create(type, event);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Não foi possível inserir o elemento.");
    }
  };

  useEffect(() => {
    onDirty?.(dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    setElementName(selection?.name || "");
    if (selection) setLaneKind(documentRef.current.laneBindings[selection.id]?.kind || "area");
  }, [selection]);
  useEffect(() => {
    if (!canEdit) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const draft = JSON.parse(raw);
        if (
          draft.document?.schemaVersion === 2 &&
          JSON.stringify(draft.document) !== JSON.stringify(initial)
        )
          setRecovery(draft);
      }
    } catch {
      setLocalStatus("A recuperação local não está disponível neste navegador.");
    }
  }, [storageKey, initial, canEdit]);
  useEffect(() => {
    if (!dirty || !ready || !canEdit || recovery) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const next = await capture();
        if (cancelled) return;
        const savedAt = new Date().toISOString();
        localStorage.setItem(
          storageKey,
          JSON.stringify({ document: next, savedAt, record: recordRef.current, id: newId.current }),
        );
        setLocalStatus(
          `Cópia local às ${new Date(savedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
        );
      } catch {
        if (!cancelled)
          setLocalStatus("Não foi possível guardar a cópia local. Salve ou exporte seu desenho.");
      }
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [revision, dirty, ready, canEdit, storageKey, recovery, record]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function changeFill(fill: string) {
    setAppearance("color");
    try {
      localStorage.setItem("bf-flow:bpmn:appearance", "color");
    } catch {
      /* Session preference remains available. */
    }
    canvas.current?.color(fill);
  }

  async function save(saveMode: "draft" | "final" = "draft") {
    if (busyRef.current || !ready || !canEdit) return;
    if (!documentRef.current.processId) {
      setError("Selecione um processo do cadastro central antes de salvar.");
      setProperties(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      // A corrected draft needs a new attempt. CAS still catches an earlier lost response.
      if (
        pending.current &&
        (pending.current.revision !== revisionRef.current ||
          pending.current.input.saveMode !== saveMode)
      )
        pending.current = null;
      // Retry the exact mutation when the snapshot has not changed.
      if (!pending.current)
        pending.current = await captureBpmnSaveAttempt({
          saveMode,
          id: newId.current,
          mutationId: crypto.randomUUID(),
          expectedVersion: recordRef.current?.current_version ?? null,
          expectedUpdatedAt: recordRef.current?.updated_at ?? null,
          revision: revisionRef.current,
          capture: async () => ({
            ...(await capture()),
            status:
              saveMode === "draft"
                ? "Rascunho"
                : documentRef.current.status === "Rascunho"
                  ? "Em revisão"
                  : documentRef.current.status,
          }),
        });
      const attempt = pending.current;
      if (new TextEncoder().encode(JSON.stringify(attempt.input)).length > 4_000_000) {
        pending.current = null;
        throw new Error(
          "O desenho excede o tamanho de envio permitido. Exporte o BPMN para preservar seu trabalho.",
        );
      }
      const next = await onSave(attempt.input);
      recordRef.current = next;
      setRecord(next);
      const status = attempt.input.document.status;
      setDocument((current) => ({
        ...current,
        codigo: next.code || current.codigo,
        status: revisionRef.current === attempt.revision ? status : current.status,
      }));
      pending.current = null;
      if (revisionRef.current === attempt.revision) {
        setDirty(false);
        try {
          localStorage.removeItem(storageKey);
        } catch {
          /* Cloud save succeeded independently of browser storage. */
        }
        setLocalStatus("");
      }
      setNotice(
        `${attempt.input.saveMode === "draft" ? "Rascunho salvo" : `Versão ${next.current_version} salva`} às ${new Date(next.updated_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao salvar. Suas alterações continuam abertas.";
      setError(message);
      setAutoSave(false);
      if (message.includes("CONFLICT:")) pending.current = null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (!autoSave || !dirty || !canEdit || recovery || importing || imported || saveMenu) return;
    const timer = setInterval(() => void saveRef.current(), 30_000);
    return () => clearInterval(timer);
  }, [autoSave, dirty, canEdit, recovery, importing, imported, saveMenu]);
  async function exportFile(kind: "bpmn" | "svg" | "original") {
    try {
      const name =
        document.processName.replace(/[^\p{L}\p{N}\-_ ]/gu, "").slice(0, 100) || "desenho";
      if (kind === "original" && document.originalXml)
        downloadBpmnFile(
          document.originalXml,
          document.originalFilename || `${name}-original.bpmn`,
        );
      else if (kind === "svg")
        downloadBpmnFile(
          await (presenting && canEdit ? presentationCanvas : canvas).current!.svg(),
          `${name}.svg`,
          "image/svg+xml",
        );
      else downloadBpmnFile(await canvas.current!.xml(), `${name}.bpmn`);
    } catch (error) {
      setError(String(error));
    }
  }
  const presentationAction = canEdit ? (
    <button
      aria-label={presenting ? "Editar desenho" : "Apresentar"}
      title={presenting ? "Editar desenho" : "Apresentar"}
      disabled={!ready || busy}
      onClick={async () => {
        try {
          const snapshot = await capture();
          setPresentationXml(snapshot.xml);
          if (!presenting) setReady(false);
          setPresenting(!presenting);
        } catch (error) {
          setError(String(error));
        }
      }}
    >
      <span>{presenting ? <Pencil size={16} /> : <Presentation size={16} />}</span>
    </button>
  ) : null;
  const palette = [
    ["bpmn:StartEvent", "Evento", Circle],
    ["bpmn:Task", "Tarefa", Square],
    ["bpmn:ExclusiveGateway", "Gateway", Diamond],
    ["bpmn:SubProcess", "Subprocesso", Square],
    ["bpmn:TextAnnotation", "Anotação", MessageSquare],
  ] as const;
  return (
    <section
      data-appearance={appearance}
      className={`bf-bpmn-editor ${readOnly ? "is-presentation" : ""}`}
    >
      {taskContext && <div hidden={readOnly}>{taskContext}</div>}
      {!readOnly && (
        <div className="bf-bpmn-toolbar" aria-label="Ferramentas de edição">
          <button
            aria-label="Voltar aos desenhos"
            title="Voltar aos desenhos"
            disabled={busy}
            onClick={() => (dirty ? setExit(true) : onBack())}
          >
            <ArrowLeft size={18} />
          </button>
          <button aria-label="Desfazer" title="Desfazer (Ctrl+Z)" onClick={() => action("undo")}>
            <Undo2 size={17} />
          </button>
          <button
            aria-label="Refazer"
            title="Refazer (Ctrl+Shift+Z)"
            onClick={() => action("redo")}
          >
            <Redo2 size={17} />
          </button>
          <span className="bf-bpmn-divider" />
          <button onClick={(e) => action("lasso", e.nativeEvent)}>
            <MousePointer2 size={16} />
            Selecionar
          </button>
          <button
            title="Mover a área de desenho (ou arraste com o botão do meio)"
            onClick={(e) => action("pan", e.nativeEvent)}
          >
            <Hand size={16} />
            Navegar
          </button>
          <button onClick={(e) => action("connect", e.nativeEvent)}>
            <Link2 size={16} />
            Conectar
          </button>
          <button
            title="Arraste uma raia para dentro de uma piscina"
            onMouseDown={(e) => action("lane", e.nativeEvent)}
            onKeyDown={(e) => {
              if (e.key === "Enter") action("lane");
            }}
          >
            <Plus size={16} />
            Raia
          </button>
          <button
            title="Arraste uma piscina para o canvas"
            onMouseDown={(e) => createShape("bpmn:Participant", e.nativeEvent)}
            onKeyDown={(e) => {
              if (e.key === "Enter") createShape("bpmn:Participant");
            }}
          >
            <Plus size={16} />
            Pool
          </button>
          <button disabled={busy || !ready} onClick={() => setImporting(true)}>
            <Upload size={16} />
            Importar BPMN
          </button>
          <span className="bf-bpmn-divider" />
          <button aria-label="Copiar seleção" disabled={!selection} onClick={() => action("copy")}>
            <Copy size={16} />
          </button>
          <button aria-label="Colar" onClick={() => action("paste")}>
            <ClipboardPaste size={16} />
          </button>
          <button disabled={!selection} onClick={() => action("duplicate")}>
            Duplicar
          </button>
          <button
            aria-label="Excluir seleção"
            disabled={!selection}
            onClick={() => action("delete")}
          >
            <Trash2 size={16} />
          </button>
          <div className="bf-bpmn-toolbar-spacer" />
          <button
            aria-label={busy ? "Salvando…" : "Salvar"}
            title="Salvar"
            className="bf-bpmn-primary"
            disabled={busy || !ready}
            onClick={() => setSaveMenu(true)}
          >
            <Save size={16} />
          </button>
          <button onClick={() => setProperties(!properties)} aria-pressed={properties}>
            <SlidersHorizontal size={16} />
            Propriedades
          </button>
          <button aria-label="Ajuda do editor" onClick={() => setHelp(true)}>
            <CircleHelp size={17} />
          </button>
        </div>
      )}
      {saveMenu && (
        <TaskDialog title="Salvar desenho" onClose={() => setSaveMenu(false)}>
          <p>
            O rascunho mantém o mesmo registro e não cria versões. Salvar versão registra uma cópia
            no histórico.
          </p>
          <div className="bf-bpmn-save-options">
            <button
              onClick={() => {
                setSaveMenu(false);
                void save("draft");
              }}
            >
              Salvar rascunho
            </button>
            <button
              className="bf-bpmn-primary"
              onClick={() => {
                setSaveMenu(false);
                void save("final");
              }}
            >
              Salvar versão
            </button>
          </div>
        </TaskDialog>
      )}
      {error && (
        <div className="bf-bpmn-error" role="alert">
          {error.replace("CONFLICT: ", "")}{" "}
          <button onClick={() => void exportFile("bpmn")}>Exportar minhas alterações</button>
          <button aria-label="Fechar aviso de erro" onClick={() => setError("")}>
            ×
          </button>
        </div>
      )}
      {!!notice && (
        <div className="bf-bpmn-notice" role="status">
          {notice}
        </div>
      )}
      {document.origin === "legacy" && (
        <div className="bf-bpmn-warning">
          Desenho convertido do editor anterior. Confira raias, símbolos e conexões antes de salvar
          a nova versão. Conexões livres antigas ficam preservadas no arquivo original de dados.
        </div>
      )}
      <div className="bf-bpmn-workarea">
        {!readOnly && (
          <aside className="bf-bpmn-palette" aria-label="Elementos BPMN">
            <span>Elementos</span>
            <small>Botão direito para alterar o tipo.</small>
            {palette.map(([type, label, Icon]) => (
              <button
                key={type}
                title={`${label}: arraste para o desenho ou pressione Enter`}
                onMouseDown={(e) => {
                  if (e.button === 0) createShape(type, e.nativeEvent);
                }}
                onClick={(e) => {
                  if (e.detail === 0) createShape(type);
                }}
              >
                <Icon size={22} strokeWidth={1.6} />
                <span>{label}</span>
              </button>
            ))}
            <details>
              <summary>Mais elementos</summary>
              {[
                ["bpmn:DataObjectReference", "Dados"],
                ["bpmn:DataStoreReference", "Armazenamento"],
              ].map(([type, label]) => (
                <button
                  key={type}
                  onMouseDown={(e) => createShape(type, e.nativeEvent)}
                  onClick={(e) => {
                    if (!e.detail) createShape(type);
                  }}
                >
                  {label}
                </button>
              ))}
            </details>
          </aside>
        )}
        <div
          style={{
            display: presenting && canEdit ? "none" : "flex",
            flex: 1,
            minWidth: 0,
            minHeight: 0,
          }}
        >
          <BpmnCanvas
            key={canvasGeneration}
            navigationAction={presentationAction}
            processName={document.processName}
            ref={canvas}
            xml={seed}
            readOnly={!canEdit}
            frozen={frozen}
            bindings={document.laneBindings}
            onChange={changed}
            onProperties={() => setProperties(true)}
            onSelection={setSelection}
            onWarnings={setWarnings}
            onReady={() => setReady(true)}
          />
        </div>
        {presenting && canEdit && (
          <BpmnCanvas
            navigationAction={presentationAction}
            processName={document.processName}
            ref={presentationCanvas}
            xml={presentationXml}
            readOnly
            frozen={frozen}
            bindings={document.laneBindings}
            onReady={() => setReady(true)}
            onWarnings={setWarnings}
          />
        )}
        {!readOnly && properties && (
          <aside className="bf-bpmn-properties" aria-label="Propriedades do desenho">
            <div className="bf-bpmn-section-heading">
              <h2>{selection ? "Elemento selecionado" : "Propriedades"}</h2>
              <button aria-label="Fechar propriedades" onClick={() => setProperties(false)}>
                ×
              </button>
            </div>
            {selection ? (
              <>
                <small>
                  {selection.count > 1
                    ? `${selection.count} elementos selecionados`
                    : elementLabels[selection.type.replace("bpmn:", "")] || "Elemento BPMN"}
                </small>
                <label>
                  Texto do elemento
                  <textarea
                    className="resize-none"
                    key={selection.id}
                    value={elementName}
                    onChange={(e) => setElementName(e.target.value)}
                    onBlur={() => {
                      if (elementName !== selection.name)
                        canvas.current?.rename(selection.id, elementName);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        canvas.current?.rename(selection.id, elementName);
                        e.currentTarget.blur();
                      }
                    }}
                  />
                </label>
                <small>Dê dois cliques no elemento para editar diretamente no desenho.</small>
                {selection.type === "bpmn:Lane" && (
                  <>
                    <label>
                      Responsável da raia
                      <select
                        value={laneKind}
                        onChange={(e) => setLaneKind(e.target.value as "area" | "position")}
                      >
                        <option value="area">Área</option>
                        <option value="position">Cargo</option>
                      </select>
                    </label>
                    <CatalogPicker
                      key={`${selection.id}:${laneKind}`}
                      kind={laneKind}
                      catalogs={catalogs}
                      value={
                        document.laneBindings[selection.id]?.kind === laneKind
                          ? document.laneBindings[selection.id]?.id || ""
                          : ""
                      }
                      onChange={(item) => {
                        const next = { ...document.laneBindings };
                        if (item) {
                          next[selection.id] = { kind: laneKind, id: item.id, name: item.name };
                          canvas.current?.rename(selection.id, item.name);
                        } else delete next[selection.id];
                        update({ laneBindings: next });
                      }}
                      create={create}
                    />
                    <p>
                      {document.laneBindings[selection.id]
                        ? `Vinculada a ${document.laneBindings[selection.id].name}`
                        : "A DEFINIR · selecione uma Área ou um Cargo."}
                    </p>
                  </>
                )}
                <label>
                  Cor de preenchimento
                  <input
                    type="color"
                    value={selection.fill || "#ffffff"}
                    onInput={(e) => changeFill(e.currentTarget.value)}
                    onChange={(e) => changeFill(e.target.value)}
                  />
                </label>
                <hr />
              </>
            ) : (
              <p>
                Selecione um elemento para editar. Arraste os símbolos da paleta para o desenho.
              </p>
            )}
            <CatalogPicker
              kind="process"
              catalogs={catalogs}
              value={document.processId}
              onChange={(item) => {
                if (item && document.origin === "created")
                  canvas.current?.rename("Pool_Flow", item.name);
                update({ processId: item?.id || "", processName: item?.name || "" });
              }}
              create={create}
              label="Processo vinculado (obrigatório)"
            />
            <label>
              Status
              <select
                value={document.status}
                onChange={(e) => update({ status: e.target.value as BpmnDocument["status"] })}
              >
                <option>Rascunho</option>
                <option>Em revisão</option>
                <option>Publicado</option>
              </select>
            </label>
            <label className="bf-bpmn-check">
              <input
                type="checkbox"
                checked={autoSave}
                onChange={(e) => setAutoSave(e.target.checked)}
              />
              Salvar rascunho automaticamente a cada 30 s
            </label>
            <p>Alterações são guardadas também neste navegador para recuperação.</p>
            {record?.created_at && (
              <small>Criado em {new Date(record.created_at).toLocaleString("pt-BR")}</small>
            )}
            {document.originalFilename && <small>Origem: {document.originalFilename}</small>}
            <fieldset className="bf-bpmn-appearance">
              <legend>Aparência do desenho</legend>
              <div role="group" aria-label="Cores do desenho">
                {(
                  [
                    ["color", "Com cores"],
                    ["mono", "Preto e branco"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={appearance === value}
                    onClick={() => {
                      setAppearance(value);
                      try {
                        localStorage.setItem("bf-flow:bpmn:appearance", value);
                      } catch {
                        /* Preference remains for this session. */
                      }
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <small>
                Preferência de visualização. O arquivo e as cores originais são preservados.
              </small>
            </fieldset>
          </aside>
        )}
      </div>
      <footer className="bf-bpmn-footer">
        {readOnly && (
          <button
            aria-label="Voltar aos desenhos"
            onClick={() => (dirty ? setExit(true) : onBack())}
          >
            <ArrowLeft size={16} />
          </button>
        )}
        <span role="status">
          {busy ? "Salvando…" : dirty ? "Alterações não salvas" : "Salvo"}
          {localStatus ? ` · ${localStatus}` : ""}
          {` · ${record?.code || document.codigo || "Desenho BPMN"}${record?.current_version ? ` · v${record.current_version}` : ""} · ${document.status}`}
        </span>
        <label className="bf-bpmn-check">
          <input type="checkbox" checked={frozen} onChange={(e) => setFrozen(e.target.checked)} />
          Identificar fora da tela
        </label>
        <button disabled={!ready} onClick={() => action("center")}>
          Centralizar
        </button>
        {!readOnly && (
          <button
            disabled={!ready}
            onClick={async () => {
              try {
                const check = await inspectBpmn(await canvas.current!.xml());
                const unbound = check.lanes
                  .filter((l) => !document.laneBindings[l.id])
                  .map((l) => `Raia sem responsável: ${l.name} (A DEFINIR).`);
                setWarnings([...check.warnings, ...unbound]);
                setShowWarnings(true);
              } catch (error) {
                setError(String(error));
              }
            }}
          >
            Verificar desenho
          </button>
        )}
        <details className="bf-bpmn-export">
          <summary>
            <Download size={14} />
            Exportar
          </summary>
          <div>
            <button disabled={!ready} onClick={() => void exportFile("bpmn")}>
              BPMN editável
            </button>
            <button disabled={!ready} onClick={() => void exportFile("svg")}>
              Imagem SVG
            </button>
            {document.originalXml && (
              <button onClick={() => void exportFile("original")}>Arquivo original</button>
            )}
            {document.legacySource && (
              <button
                onClick={() =>
                  downloadBpmnFile(
                    document.legacySource!,
                    "desenho-anterior.json",
                    "application/json",
                  )
                }
              >
                Dados do editor anterior
              </button>
            )}
          </div>
        </details>
      </footer>
      {showWarnings && (
        <TaskDialog title="Verificação do desenho" onClose={() => setShowWarnings(false)}>
          <div className="bf-bpmn-form">
            {warnings.length ? (
              <>
                <p>Estes avisos não impedem salvar o desenho.</p>
                <ul>
                  {warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p>Nenhum aviso nas verificações básicas de estrutura e vínculos.</p>
            )}
          </div>
          <footer>
            <button onClick={() => setShowWarnings(false)}>Fechar</button>
          </footer>
        </TaskDialog>
      )}
      {help && (
        <TaskDialog title="Como desenhar" onClose={() => setHelp(false)}>
          <div className="bf-bpmn-form">
            <ol>
              <li>Selecione um Processo e associe as raias a Áreas ou Cargos.</li>
              <li>
                Arraste Pool ou Raia da barra para o canvas. Raias só podem ser soltas dentro de
                piscinas. Para reordenar, arraste o cabeçalho com o nome da raia até a posição
                desejada na mesma piscina.
              </li>
              <li>
                Salvar rascunho e o salvamento automático mantêm um registro temporário. Use Salvar
                versão para criar uma versão no histórico.
              </li>
              <li>
                Arraste elementos da paleta. Pelo teclado, use Enter para inserir na raia
                selecionada.
              </li>
              <li>
                Selecione um elemento para acessar conexões e próximos elementos. Dê dois cliques
                para editar o texto.
              </li>
              <li>
                Arraste conexões e seus pontos para ajustar os trajetos. Arraste as bordas de
                tarefas, pools e raias para redimensionar.
              </li>
              <li>
                Arraste o fundo para navegar. Use a roda para deslocar e Ctrl + roda para zoom.
              </li>
              <li>
                Shift + clique seleciona vários elementos. Ctrl+C / Ctrl+V copiam e colam; Delete
                exclui; Ctrl+Z desfaz.
              </li>
            </ol>
            <p>
              Apresentação permite somente navegar e exportar. O cabeçalho e as identificações fixas
              não fazem parte das coordenadas do desenho.
            </p>
          </div>
          <footer>
            <button onClick={() => setHelp(false)}>Fechar</button>
          </footer>
        </TaskDialog>
      )}
      {importing && (
        <BpmnImportWizard
          catalogs={catalogs}
          create={create}
          onClose={() => setImporting(false)}
          onImport={(next) => {
            setImporting(false);
            setImported(next);
          }}
        />
      )}
      {imported && (
        <TaskDialog title="Substituir o desenho aberto?" onClose={() => setImported(null)}>
          <div className="bf-bpmn-form">
            <p>
              O arquivo {imported.originalFilename} substituirá o conteúdo deste desenho. O processo
              e os responsáveis serão os selecionados na importação.
            </p>
            <p>Exporte o desenho atual se quiser guardar uma cópia antes de continuar.</p>
          </div>
          <footer>
            <button onClick={() => void exportFile("bpmn")}>Exportar desenho atual</button>
            <button onClick={() => setImported(null)}>Cancelar</button>
            <button
              className="bf-bpmn-primary"
              onClick={() => {
                setReady(false);
                setDocument({ ...imported, codigo: record?.code || document.codigo });
                setSeed(imported.xml);
                setCanvasGeneration((generation) => generation + 1);
                setSelection(null);
                setWarnings([]);
                pending.current = null;
                setImported(null);
                changed();
              }}
            >
              Substituir desenho
            </button>
          </footer>
        </TaskDialog>
      )}
      {exit && (
        <TaskDialog title="Sair com alterações não salvas?" onClose={() => setExit(false)}>
          <div className="bf-bpmn-form">
            <p>
              Salve ou exporte o desenho antes de sair. A cópia local, quando disponível, permite
              recuperar o trabalho neste navegador.
            </p>
          </div>
          <footer>
            <button onClick={() => setExit(false)}>Continuar editando</button>
            <button
              onClick={() => {
                setDirty(false);
                onBack();
              }}
            >
              Sair sem salvar
            </button>
          </footer>
        </TaskDialog>
      )}
      {recovery && (
        <TaskDialog title="Recuperar alterações deste navegador?" onClose={() => setRecovery(null)}>
          <div className="bf-bpmn-form">
            <p>Há uma cópia local de {new Date(recovery.savedAt).toLocaleString("pt-BR")}.</p>
            <p>
              Se outra pessoa salvou uma versão mais recente, exporte a cópia recuperada antes de
              conciliar as alterações.
            </p>
          </div>
          <footer>
            <button
              onClick={() => {
                localStorage.removeItem(storageKey);
                setRecovery(null);
              }}
            >
              Usar versão salva
            </button>
            <button
              className="bf-bpmn-primary"
              onClick={() => {
                setDocument(recovery.document);
                setSeed(recovery.document.xml);
                recordRef.current = recovery.record;
                setRecord(recovery.record);
                if (recovery.id) newId.current = recovery.id;
                setRecovery(null);
                changed();
              }}
            >
              Recuperar cópia local
            </button>
          </footer>
        </TaskDialog>
      )}
    </section>
  );
}
