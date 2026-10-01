import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Circle,
  Square,
  Diamond,
  MessageSquare,
  Undo2,
  Redo2,
  Hand,
  Save,
  Download,
  Upload,
  Presentation,
  Pencil,
  SlidersHorizontal,
  CircleHelp,
  X,
  CheckCircle2,
  Image as ImageIcon,
  Copy,
  ClipboardPaste,
  Trash2,
  Minus,
  Plus,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ChevronUp,
  ChevronDown,
  Settings,
  Type,
  PaintBucket,
} from "lucide-react";
import { BpmnImportWizard } from "./import-wizard";
import { TaskDialog } from "@/components/task-dialog";
import { BpmnCanvas, type BpmnCanvasHandle, type CanvasSelection } from "./bpmn-canvas";
import { CatalogPicker, type BpmnCatalogs, type CreateCatalogItem } from "./catalog-picker";
import { captureBpmnSaveAttempt } from "@/lib/bpmn-save-attempt";
import { inspectBpmn, type BpmnDocument, type BpmnTextStyle } from "@/lib/bpmn-document";
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
  Group: "Imagem",
  SequenceFlow: "Fluxo de sequência",
  MessageFlow: "Fluxo de mensagem",
  Association: "Associação",
  label: "Rótulo",
};

export type SavedBpmn = {
  code?: string;
  id: string;
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
function downloadBpmnFile(content: string | Blob, filename: string, mime = "application/xml") {
  const url = URL.createObjectURL(
    content instanceof Blob ? content : new Blob([content], { type: mime }),
  );
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

  const [properties, setProperties] = useState(false);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [propertySection, setPropertySection] = useState<"element" | "document">("document");
  const [exportMenu, setExportMenu] = useState(false);
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
  const imageInput = useRef<HTMLInputElement>(null);
  const pendingImage = useRef<string | null>(null);
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
  const activeTextStyle = selection
    ? document.elementStyles?.[selection.id] || {}
    : ({} as BpmnTextStyle);
  const canFormat = Boolean(selection && !selection.isImage);
  const applyTextStyle = (patch: Partial<BpmnTextStyle>) => {
    const ids = canvas.current?.formatText(patch) || [];
    if (!ids.length) return;
    const next = { ...(documentRef.current.elementStyles || {}) };
    ids.forEach((id) => {
      next[id] = { ...(next[id] || {}), ...patch };
    });
    update({ elementStyles: next });
  };
  const requestImage = (id: string) => {
    pendingImage.current = id;
    if (imageInput.current) {
      imageInput.current.value = "";
      imageInput.current.click();
    }
  };
  const loadImage = (file?: File) => {
    const id = pendingImage.current;
    if (!id) return;
    if (!file) {
      canvas.current?.remove(id);
      pendingImage.current = null;
      return;
    }
    if (!file.type.startsWith("image/") || file.size > 2_500_000) {
      canvas.current?.remove(id);
      pendingImage.current = null;
      setError("Selecione uma imagem válida com até 2,5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => {
      canvas.current?.remove(id);
      pendingImage.current = null;
      setError("Não foi possível ler a imagem selecionada.");
    };
    reader.onload = () => {
      const src = String(reader.result || "");
      const probe = new window.Image();
      probe.onload = () => {
        canvas.current?.setImage(id, {
          src,
          name: file.name,
          aspectRatio: probe.naturalWidth / probe.naturalHeight,
        });
        pendingImage.current = null;
      };
      probe.onerror = reader.onerror;
      probe.src = src;
    };
    reader.readAsDataURL(file);
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
      setPropertySection("document");
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
  const [exporting, setExporting] = useState(false);
  async function exportFile(kind: "bpmn" | "png" | "original") {
    if (exporting) return;
    setExporting(true);
    try {
      const name =
        document.processName.replace(/[^\p{L}\p{N}\-_ ]/gu, "").slice(0, 100) || "desenho";
      if (kind === "original" && document.originalXml)
        downloadBpmnFile(
          document.originalXml,
          document.originalFilename || `${name}-original.bpmn`,
        );
      else if (kind === "png")
        downloadBpmnFile(
          await (presenting && canEdit ? presentationCanvas : canvas).current!.png(),
          `${name}.png`,
          "image/png",
        );
      else downloadBpmnFile(await canvas.current!.xml(), `${name}.bpmn`);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setExporting(false);
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
      <input
        ref={imageInput}
        className="bf-bpmn-image-input"
        type="file"
        accept="image/*"
        tabIndex={-1}
        onChange={(event) => loadImage(event.target.files?.[0])}
        onCancel={() => loadImage()}
      />
      {taskContext && <div hidden={readOnly}>{taskContext}</div>}
      {!readOnly && !toolbarCollapsed && (
        <div className="bf-bpmn-toolbar" aria-label="Ferramentas de edição">
          <div className="bf-bpmn-tool-group">
            <span>Arquivo</span>
            <div className="bf-bpmn-tool-grid">
              <button
                aria-label="Voltar aos desenhos"
                title="Voltar aos desenhos"
                disabled={busy}
                onClick={() => (dirty ? setExit(true) : onBack())}
              >
                <ArrowLeft size={16} />
              </button>
              <button
                aria-label="Importar BPMN"
                title="Importar BPMN"
                disabled={busy || !ready}
                onClick={() => setImporting(true)}
              >
                <Upload size={16} />
              </button>
              <button
                aria-label="Exportar"
                title="Exportar desenho"
                disabled={!ready || exporting}
                onClick={() => setExportMenu(true)}
              >
                <Download size={16} />
              </button>
              <button
                aria-label={busy ? "Salvando" : "Salvar"}
                title="Salvar"
                className="bf-bpmn-primary"
                disabled={busy || !ready}
                onClick={() => setSaveMenu(true)}
              >
                <Save size={16} />
              </button>
              <output className="bf-bpmn-toolbar-status" title={localStatus || notice || undefined}>
                {busy ? "Salvando…" : dirty ? "Não salvo" : "Salvo"}
              </output>
            </div>
          </div>

          <div className="bf-bpmn-tool-group">
            <span>Edição</span>
            <div className="bf-bpmn-tool-grid">
              <button
                aria-label="Desfazer"
                title="Desfazer (Ctrl+Z)"
                onClick={() => action("undo")}
              >
                <Undo2 size={16} />
              </button>
              <button
                aria-label="Refazer"
                title="Refazer (Ctrl+Shift+Z)"
                onClick={() => action("redo")}
              >
                <Redo2 size={16} />
              </button>
              <button
                aria-label="Copiar"
                title="Copiar (Ctrl+C)"
                disabled={!selection}
                onClick={() => action("copy")}
              >
                <Copy size={16} />
              </button>
              <button aria-label="Colar" title="Colar (Ctrl+V)" onClick={() => action("paste")}>
                <ClipboardPaste size={16} />
              </button>
              <button
                aria-label="Excluir"
                title="Excluir"
                disabled={!selection}
                onClick={() => action("delete")}
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>

          <div className="bf-bpmn-tool-group bf-bpmn-format-group">
            <span>Formatação</span>
            <div className="bf-bpmn-format-grid">
              <select
                aria-label="Família da fonte"
                title="Família da fonte"
                disabled={!canFormat}
                value={activeTextStyle.fontFamily || "Segoe UI"}
                onChange={(e) => applyTextStyle({ fontFamily: e.target.value })}
              >
                <option>Segoe UI</option>
                <option>Arial</option>
                <option>Calibri</option>
                <option>Georgia</option>
                <option>Verdana</option>
                <option>Times New Roman</option>
              </select>
              <input
                aria-label="Tamanho da fonte"
                title="Tamanho da fonte"
                type="number"
                min="8"
                max="72"
                disabled={!canFormat}
                value={activeTextStyle.fontSize || 12}
                onChange={(e) =>
                  applyTextStyle({
                    fontSize: Math.max(8, Math.min(72, Number(e.target.value) || 12)),
                  })
                }
              />
              <button
                aria-label="Diminuir fonte"
                title="Diminuir fonte"
                disabled={!canFormat}
                onClick={() =>
                  applyTextStyle({ fontSize: Math.max(8, (activeTextStyle.fontSize || 12) - 1) })
                }
              >
                <Minus size={14} />
              </button>
              <button
                aria-label="Aumentar fonte"
                title="Aumentar fonte"
                disabled={!canFormat}
                onClick={() =>
                  applyTextStyle({ fontSize: Math.min(72, (activeTextStyle.fontSize || 12) + 1) })
                }
              >
                <Plus size={14} />
              </button>
              <button
                aria-label="Negrito"
                title="Negrito"
                disabled={!canFormat}
                aria-pressed={Boolean(activeTextStyle.bold)}
                onClick={() => applyTextStyle({ bold: !activeTextStyle.bold })}
              >
                <Bold size={15} />
              </button>
              <button
                aria-label="Itálico"
                title="Itálico"
                disabled={!canFormat}
                aria-pressed={Boolean(activeTextStyle.italic)}
                onClick={() => applyTextStyle({ italic: !activeTextStyle.italic })}
              >
                <Italic size={15} />
              </button>
              <button
                aria-label="Sublinhado"
                title="Sublinhado"
                disabled={!canFormat}
                aria-pressed={Boolean(activeTextStyle.underline)}
                onClick={() => applyTextStyle({ underline: !activeTextStyle.underline })}
              >
                <Underline size={15} />
              </button>
              <button
                aria-label="Tachado"
                title="Tachado"
                disabled={!canFormat}
                aria-pressed={Boolean(activeTextStyle.strike)}
                onClick={() => applyTextStyle({ strike: !activeTextStyle.strike })}
              >
                <Strikethrough size={15} />
              </button>
              <label className="bf-bpmn-color-tool" title="Cor do texto">
                <Type size={15} />
                <input
                  aria-label="Cor do texto"
                  type="color"
                  disabled={!canFormat}
                  value={activeTextStyle.color || "#1f2937"}
                  onChange={(e) => applyTextStyle({ color: e.target.value })}
                />
              </label>
              <label className="bf-bpmn-color-tool" title="Cor de preenchimento">
                <PaintBucket size={15} />
                <input
                  aria-label="Cor de preenchimento"
                  type="color"
                  disabled={!selection}
                  value={selection?.fill || "#ffffff"}
                  onChange={(e) => changeFill(e.target.value)}
                />
              </label>
              <button
                aria-label="Alinhar à esquerda"
                title="Alinhar à esquerda"
                disabled={!canFormat}
                aria-pressed={activeTextStyle.align === "left"}
                onClick={() => applyTextStyle({ align: "left" })}
              >
                <AlignLeft size={15} />
              </button>
              <button
                aria-label="Centralizar texto"
                title="Centralizar texto"
                disabled={!canFormat}
                aria-pressed={!activeTextStyle.align || activeTextStyle.align === "center"}
                onClick={() => applyTextStyle({ align: "center" })}
              >
                <AlignCenter size={15} />
              </button>
              <button
                aria-label="Alinhar à direita"
                title="Alinhar à direita"
                disabled={!canFormat}
                aria-pressed={activeTextStyle.align === "right"}
                onClick={() => applyTextStyle({ align: "right" })}
              >
                <AlignRight size={15} />
              </button>
            </div>
          </div>

          <div className="bf-bpmn-tool-group">
            <span>Visualização</span>
            <div className="bf-bpmn-tool-grid">
              <button
                aria-label="Navegar"
                title="Mover a área de desenho"
                onClick={(e) => action("pan", e.nativeEvent)}
              >
                <Hand size={16} />
              </button>
              {presentationAction}
            </div>
          </div>

          <div className="bf-bpmn-tool-group">
            <span>Configurações</span>
            <div className="bf-bpmn-tool-grid">
              <button
                aria-label="Verificar desenho"
                title="Verificar desenho"
                disabled={!ready}
                onClick={async () => {
                  try {
                    const check = await inspectBpmn(await canvas.current!.xml());
                    const unbound = check.lanes
                      .filter((lane) => !document.laneBindings[lane.id])
                      .map((lane) => `Raia sem responsável: ${lane.name} (A DEFINIR).`);
                    setWarnings([...check.warnings, ...unbound]);
                    setShowWarnings(true);
                  } catch (error) {
                    setError(String(error));
                  }
                }}
              >
                <CheckCircle2 size={16} />
              </button>
              <button
                aria-label="Configurações do desenho"
                title="Configurações do desenho"
                aria-pressed={properties}
                onClick={() => setProperties(!properties)}
              >
                <Settings size={16} />
              </button>
              <button
                aria-label="Ajuda do editor"
                title="Ajuda do editor"
                onClick={() => setHelp(true)}
              >
                <CircleHelp size={16} />
              </button>
              <button
                aria-label="Recolher barra de ferramentas"
                title="Recolher barra de ferramentas"
                onClick={() => setToolbarCollapsed(true)}
              >
                <ChevronUp size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      {saveMenu && (
        <TaskDialog title="Salvar desenho" onClose={() => setSaveMenu(false)}>
          <div className="bf-bpmn-form">
            <p>
              O rascunho mantém o mesmo registro e não cria versões. Salvar versão registra uma
              cópia no histórico.
            </p>
          </div>
          <footer>
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
          </footer>
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
      {document.origin === "legacy" && (
        <div className="bf-bpmn-warning">
          Desenho convertido do editor anterior. Confira raias, símbolos e conexões antes de salvar
          a nova versão. Conexões livres antigas ficam preservadas no arquivo original de dados.
        </div>
      )}
      <div className="bf-bpmn-workarea">
        {!readOnly && toolbarCollapsed && (
          <button
            className="bf-bpmn-toolbar-restore"
            aria-label="Exibir barra de ferramentas"
            title="Exibir barra de ferramentas"
            onClick={() => setToolbarCollapsed(false)}
          >
            <ChevronDown size={17} />
          </button>
        )}
        {!readOnly && (
          <aside className="bf-bpmn-palette" aria-label="Elementos BPMN">
            <span title="Arraste para inserir. Use o botão direito para alterar o tipo.">
              Elementos
            </span>
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
            <button
              title="Imagem: arraste para o desenho ou pressione Enter"
              onMouseDown={(event) => {
                if (event.button === 0) canvas.current?.createImage(event.nativeEvent);
              }}
              onClick={(event) => {
                if (event.detail === 0) canvas.current?.createImage();
              }}
            >
              <ImageIcon size={22} strokeWidth={1.6} />
              <span>Imagem</span>
            </button>
            {[
              ["bpmn:DataObjectReference", "Dados", "bpmn-icon-data-object"],
              ["bpmn:DataStoreReference", "Armazenamento", "bpmn-icon-data-store"],
              ["bpmn:Participant", "Pool", "bpmn-icon-participant"],
              ["bpmn:Lane", "Raia", "bpmn-icon-lane"],
            ].map(([type, label, icon]) => (
              <button
                key={type}
                title={`${label}: arraste para o desenho`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return;
                  if (type === "bpmn:Lane") action("lane", e.nativeEvent);
                  else createShape(type, e.nativeEvent);
                }}
                onClick={(e) => {
                  if (e.detail !== 0) return;
                  if (type === "bpmn:Lane") action("lane");
                  else createShape(type);
                }}
              >
                {type === "bpmn:Lane" ? (
                  <svg width="24" height="22" viewBox="0 0 28 22" aria-hidden="true">
                    <rect x="1" y="1" width="26" height="20" fill="none" stroke="currentColor" />
                    <path d="M6 1v20" fill="none" stroke="currentColor" />
                  </svg>
                ) : (
                  <span className={`bf-bpmn-palette-icon ${icon}`} aria-hidden="true" />
                )}
                <span>{label}</span>
              </button>
            ))}
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
            navigationAction={
              <>
                {presentationAction}
                {readOnly && (
                  <>
                    <button
                      title="Voltar aos desenhos"
                      aria-label="Voltar aos desenhos"
                      onClick={() => (dirty ? setExit(true) : onBack())}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      title="Exportar desenho"
                      aria-label="Exportar desenho"
                      disabled={!ready || exporting}
                      onClick={() => setExportMenu(true)}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      title="Identificar raias fora da tela"
                      aria-label="Identificar raias fora da tela"
                      aria-pressed={frozen}
                      onClick={() => setFrozen(!frozen)}
                    >
                      <SlidersHorizontal size={15} />
                    </button>
                  </>
                )}
              </>
            }
            processName={document.processName}
            ref={canvas}
            xml={seed}
            readOnly={!canEdit}
            frozen={frozen}
            bindings={document.laneBindings}
            elementStyles={document.elementStyles}
            onImageRequest={requestImage}
            onChange={changed}
            onProperties={() => {
              setPropertySection("element");
              setProperties(true);
            }}
            onSelection={(next) => {
              setSelection(next);
              if (next) setPropertySection("element");
            }}
            onWarnings={setWarnings}
            onReady={() => setReady(true)}
          />
        </div>
        {presenting && canEdit && (
          <BpmnCanvas
            navigationAction={
              <>
                {presentationAction}
                {readOnly && (
                  <>
                    <button
                      title="Voltar aos desenhos"
                      aria-label="Voltar aos desenhos"
                      onClick={() => (dirty ? setExit(true) : onBack())}
                    >
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      title="Exportar desenho"
                      aria-label="Exportar desenho"
                      disabled={!ready || exporting}
                      onClick={() => setExportMenu(true)}
                    >
                      <Download size={15} />
                    </button>
                    <button
                      title="Identificar raias fora da tela"
                      aria-label="Identificar raias fora da tela"
                      aria-pressed={frozen}
                      onClick={() => setFrozen(!frozen)}
                    >
                      <SlidersHorizontal size={15} />
                    </button>
                  </>
                )}
              </>
            }
            processName={document.processName}
            ref={presentationCanvas}
            xml={presentationXml}
            readOnly
            frozen={frozen}
            bindings={document.laneBindings}
            elementStyles={document.elementStyles}
            onReady={() => setReady(true)}
            onWarnings={setWarnings}
          />
        )}
        {!readOnly && properties && (
          <aside className="bf-bpmn-properties" aria-label="Propriedades do desenho">
            <div className="bf-bpmn-section-heading">
              <h2>Propriedades</h2>
              <button aria-label="Fechar propriedades" onClick={() => setProperties(false)}>
                <X size={16} />
              </button>
            </div>
            <div
              className="bf-bpmn-property-switch"
              role="group"
              aria-label="Seção de propriedades"
            >
              <button
                aria-pressed={propertySection === "element"}
                onClick={() => setPropertySection("element")}
              >
                Elemento
              </button>
              <button
                aria-pressed={propertySection === "document"}
                onClick={() => setPropertySection("document")}
              >
                Desenho
              </button>
            </div>
            <div className="bf-bpmn-property-content" hidden={propertySection !== "element"}>
              {selection ? (
                <>
                  <small>
                    {selection.count > 1
                      ? `${selection.count} elementos selecionados`
                      : elementLabels[selection.type.replace("bpmn:", "")] || "Elemento BPMN"}
                  </small>
                  {selection.count === 1 && !selection.isImage && (
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
                  )}
                  <small>
                    {selection.isImage
                      ? "Mova a imagem livremente, use as alças para redimensionar ou pressione Delete para excluir."
                      : selection.count > 1
                        ? "Mova, copie ou exclua os elementos em conjunto. A cor será aplicada à seleção."
                        : "Dê dois cliques para editar o texto no desenho."}
                  </small>
                  {selection.count === 1 && selection.type === "bpmn:Lane" && (
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
                  {!selection.isImage && (
                    <label>
                      {selection.count > 1
                        ? "Cor dos elementos selecionados"
                        : "Cor de preenchimento"}
                      <input
                        type="color"
                        value={selection.fill || "#ffffff"}
                        onInput={(e) => changeFill(e.currentTarget.value)}
                        onChange={(e) => changeFill(e.target.value)}
                      />
                    </label>
                  )}
                </>
              ) : (
                <p>
                  Selecione um elemento para editar. Arraste os símbolos da paleta para o desenho.
                </p>
              )}
            </div>
            <div className="bf-bpmn-property-content" hidden={propertySection !== "document"}>
              <h3>Processo e situação</h3>
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
              <h3>Salvamento</h3>
              <label className="bf-bpmn-check">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                />
                Rascunho automático a cada 30 s
              </label>
              <p>{localStatus || "Cópia de recuperação neste navegador."}</p>
              <details className="bf-bpmn-file-info">
                <summary>Informações do arquivo</summary>
                {record?.created_at && (
                  <small>Criado em {new Date(record.created_at).toLocaleString("pt-BR")}</small>
                )}
                {document.originalFilename && <small>Origem: {document.originalFilename}</small>}
              </details>
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
              <label className="bf-bpmn-check">
                <input
                  type="checkbox"
                  checked={frozen}
                  onChange={(e) => setFrozen(e.target.checked)}
                />
                Identificar raias e piscinas fora da tela
              </label>
            </div>
          </aside>
        )}
      </div>
      {exportMenu && (
        <TaskDialog title="Exportar desenho" onClose={() => setExportMenu(false)}>
          <div className="bf-bpmn-form bf-bpmn-export-options">
            <p>O desenho inteiro será exportado, independentemente do zoom atual.</p>

            <button
              disabled={!ready || exporting}
              onClick={() => {
                setExportMenu(false);
                void exportFile("bpmn");
              }}
            >
              Arquivo BPMN
            </button>
            <button
              disabled={!ready || exporting}
              onClick={() => {
                setExportMenu(false);
                void exportFile("png");
              }}
            >
              Imagem PNG
            </button>
            {document.originalXml && (
              <button
                disabled={exporting}
                onClick={() => {
                  setExportMenu(false);
                  void exportFile("original");
                }}
              >
                BPMN original importado
              </button>
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
        </TaskDialog>
      )}
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
                Arraste Pool ou Raia da paleta para o canvas. Raias só podem ser soltas dentro de
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
                Arraste o fundo para selecionar vários elementos. Para navegar, use Navegar ou o
                botão do meio. Ctrl + roda ajusta o zoom.
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
