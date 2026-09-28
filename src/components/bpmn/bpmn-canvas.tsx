import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { edgeIdentification } from "@/lib/bpmn-viewport";
import { bpmnSelectionModule } from "@/lib/bpmn-selection";
import Modeler from "bpmn-js/lib/Modeler";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import type { LaneBinding } from "@/lib/bpmn-document";
import { bpmnEngineModules } from "@/lib/bpmn-engine-modules";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "./bpmn.css";

export type CanvasSelection = { id: string; type: string; name: string; count: number } | null;
export type BpmnCanvasHandle = {
  xml(): Promise<string>;
  svg(): Promise<string>;
  action(name: string, event?: any): void;
  rename(id: string, name: string): void;
  color(color: string): void;
  create(type: string, event?: any): void;
  lanes(): { id: string; name: string }[];
};

export const BpmnCanvas = forwardRef<
  BpmnCanvasHandle,
  {
    xml: string;
    readOnly?: boolean;
    frozen?: boolean;
    bindings?: Record<string, LaneBinding>;
    onChange?: () => void;
    onSelection?: (selection: CanvasSelection) => void;
    onWarnings?: (warnings: string[]) => void;
    onReady?: () => void;
    onProperties?: () => void;
    navigationAction?: ReactNode;
    processName?: string;
  }
>(
  (
    {
      xml,
      readOnly = false,
      frozen = true,
      bindings = {},
      onChange,
      onSelection,
      onWarnings,
      onReady,
      onProperties,
      navigationAction,
      processName,
    },
    ref,
  ) => {
    const host = useRef<HTMLDivElement>(null);
    const engine = useRef<any>(null);
    const callbacks = useRef({ onChange, onSelection, onWarnings, onReady, onProperties });
    callbacks.current = { onChange, onSelection, onWarnings, onReady, onProperties };
    const [error, setError] = useState("");
    const [ready, setReady] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [laneLabels, setLaneLabels] = useState<
      { id: string; name: string; kind: string; left: number; top: number; maxWidth: number }[]
    >([]);
    const [diagrams, setDiagrams] = useState<{ id: string; name: string }[]>([]);
    const [diagram, setDiagram] = useState("");
    const view = useRef<any>(null);
    const [contextMenu, setContextMenu] = useState<{ element: any; x: number; y: number } | null>(
      null,
    );
    const menuRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
      if (!contextMenu) return;
      menuRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
      const dismiss = (event: PointerEvent) => {
        if (!menuRef.current?.contains(event.target as Node)) setContextMenu(null);
      };
      window.addEventListener("pointerdown", dismiss, true);
      return () => window.removeEventListener("pointerdown", dismiss, true);
    }, [contextMenu]);
    const menuAction = (action: string) => {
      const m = engine.current;
      if (!m || !contextMenu || readOnly) return;
      const { element, x, y } = contextMenu;
      setContextMenu(null);
      try {
        if (action === "type") {
          m.get("popupMenu").open(
            element,
            "bpmn-replace",
            { x, y },
            {
              title: "Alterar tipo do elemento",
              width: "320px",
              search: true,
            },
          );
        }
        if (action === "edit") m.get("directEditing").activate(element);
        if (action === "properties") callbacks.current.onProperties?.();
        if (action === "copy" || action === "cut") m.get("copyPaste").copy([element]);
        if (action === "delete" || action === "cut") m.get("modeling").removeElements([element]);
        if (action === "duplicate") {
          const duplicated = m.get("copyPaste").duplicate([element], {
            element: element.parent,
            point: {
              x: element.x + element.width / 2 + 40,
              y: element.y + element.height / 2 + 40,
            },
          });
          if (duplicated) m.get("selection").select(duplicated);
        }
      } catch (error) {
        callbacks.current.onWarnings?.([
          error instanceof Error ? error.message : "Não foi possível executar a ação.",
        ]);
      }
    };

    useEffect(() => {
      let disposed = false;
      setReady(false);
      setError("");
      const instance: any = readOnly
        ? new NavigatedViewer({ container: host.current!, additionalModules: bpmnEngineModules })
        : new Modeler({
            container: host.current!,
            additionalModules: [...bpmnEngineModules, bpmnSelectionModule],
          });
      engine.current = instance;
      let importing = true;
      const updateOverlay = () => {
        if (disposed || !instance.getDefinitions()) return;
        const registry = instance.get("elementRegistry");
        registry.forEach((element: any) => {
          const graphics = registry.getGraphics(element);
          if (graphics) graphics.setAttribute("data-bf-type", element.type);
        });
        const canvas = instance.get("canvas");
        const vb = canvas.viewbox();
        view.current = vb;
        setZoom(Math.round(vb.scale * 100));
        const hostRect = host.current!.getBoundingClientRect();
        const viewport = { x: 0, y: 0, width: hostRect.width, height: hostRect.height };
        setLaneLabels(
          registry
            .filter((el: any) => ["bpmn:Lane", "bpmn:Participant"].includes(el.type) && !el.hidden)
            .flatMap((el: any) => {
              const graphics = registry.getGraphics(el);
              const label = graphics?.querySelector(".djs-label");
              if (!label) return [];
              const bounds = label.getBoundingClientRect();
              if (!bounds.width || !bounds.height) return [];
              const position = edgeIdentification(
                {
                  x: (el.x - vb.x) * vb.scale,
                  y: (el.y - vb.y) * vb.scale,
                  width: el.width * vb.scale,
                  height: el.height * vb.scale,
                },
                {
                  x: bounds.left - hostRect.left,
                  y: bounds.top - hostRect.top,
                  width: bounds.width,
                  height: bounds.height,
                },
                viewport,
              );
              return position
                ? [
                    {
                      id: el.id,
                      name: el.businessObject.name || "A DEFINIR",
                      kind: el.type,
                      ...position,
                    },
                  ]
                : [];
            }),
        );
      };
      instance.on("canvas.viewbox.changed", updateOverlay);
      instance.on("canvas.viewbox.changed", () => setContextMenu(null));
      if (!readOnly)
        instance.on("element.contextmenu", 1500, (event: any) => {
          const element = event.element.labelTarget || event.element;
          if (!element.parent) return;
          event.originalEvent.preventDefault();
          event.originalEvent.stopPropagation();
          instance.get("selection").select(element);
          instance.get("contextPad").close();
          setContextMenu({
            element,
            x: Math.max(8, Math.min(event.originalEvent.clientX, window.innerWidth - 248)),
            y: Math.max(8, Math.min(event.originalEvent.clientY, window.innerHeight - 310)),
          });
          return false;
        });

      instance.on("commandStack.changed", () => {
        if (!importing && !disposed) {
          updateOverlay();
          callbacks.current.onChange?.();
        }
      });
      instance.on("selection.changed", ({ newSelection }: any) => {
        const el = newSelection[0];
        callbacks.current.onSelection?.(
          el
            ? {
                id: el.id,
                type: el.type,
                name: el.businessObject.name || el.businessObject.text || "",
                count: newSelection.length,
              }
            : null,
        );
      });
      instance.on("elements.changed", () => {
        const selected = instance.get("selection").get();
        const el = selected[0];
        if (el)
          callbacks.current.onSelection?.({
            id: el.id,
            type: el.type,
            name: el.businessObject.name || el.businessObject.text || "",
            count: selected.length,
          });
      });
      instance
        .importXML(xml)
        .then(({ warnings }: any) => {
          if (disposed) return;
          const defs = instance.getDefinitions();
          setDiagrams(
            defs.diagrams.map((d: any, i: number) => ({
              id: d.id,
              name: d.name || `Diagrama ${i + 1}`,
            })),
          );
          setDiagram(defs.diagrams[0]?.id || "");
          instance.get("canvas").zoom("fit-viewport", "auto");
          importing = false;
          setReady(true);
          updateOverlay();
          callbacks.current.onWarnings?.((warnings || []).map((w: any) => w.message || String(w)));
          callbacks.current.onReady?.();
        })
        .catch((e: Error) => {
          if (!disposed) setError(`Não foi possível abrir este desenho: ${e.message}`);
        });
      const resize = new ResizeObserver(() => {
        if (!disposed && !importing && host.current && host.current.clientWidth > 0) {
          instance.get("canvas").resized();
          updateOverlay();
        }
      });
      if (host.current) resize.observe(host.current);
      return () => {
        disposed = true;
        resize.disconnect();
        instance.destroy();
        if (engine.current === instance) engine.current = null;
      };
    }, [xml, readOnly]);

    useImperativeHandle(
      ref,
      () => ({
        async xml() {
          if (!ready) throw new Error("Aguarde a abertura do desenho.");
          return (await engine.current.saveXML({ format: true })).xml;
        },
        async svg() {
          if (!ready) throw new Error("Aguarde a abertura do desenho.");
          return (await engine.current.saveSVG()).svg;
        },
        lanes() {
          return (
            engine.current
              ?.get("elementRegistry")
              .filter((e: any) => e.type === "bpmn:Lane")
              .map((e: any) => ({ id: e.id, name: e.businessObject.name || "A DEFINIR" })) || []
          );
        },
        rename(id, name) {
          if (!readOnly && ready) {
            const e = engine.current.get("elementRegistry").get(id);
            if (e && (e.businessObject.name || e.businessObject.text || "") !== name)
              engine.current.get("modeling").updateProperties(e, {
                [e.type === "bpmn:TextAnnotation" ? "text" : "name"]: name,
              });
          }
        },
        color(fill) {
          if (!readOnly && ready)
            engine.current
              .get("modeling")
              .setColor(engine.current.get("selection").get(), { fill });
        },
        create(type, event) {
          if (readOnly || !ready) return;
          const modeler = engine.current;
          const factory = modeler.get("elementFactory");
          const shape =
            type === "bpmn:Participant"
              ? factory.createParticipantShape()
              : factory.createShape({
                  type,
                  ...(type === "bpmn:SubProcess" ? { isExpanded: true } : {}),
                });
          if (event?.clientX) modeler.get("create").start(event, shape);
          else {
            const selected = modeler.get("selection").get()[0];
            const parent =
              type === "bpmn:Participant"
                ? modeler.get("canvas").getRootElement()
                : selected?.type === "bpmn:Lane" || selected?.type === "bpmn:Participant"
                  ? selected
                  : modeler.get("elementRegistry").find((e: any) => e.type === "bpmn:Lane") ||
                    modeler.get("canvas").getRootElement();
            const vb = modeler.get("canvas").viewbox();
            modeler.get("modeling").createShape(
              shape,
              {
                x: parent.x ? parent.x + 200 : vb.x + vb.width / 2,
                y: parent.y ? parent.y + parent.height / 2 : vb.y + vb.height / 2,
              },
              parent,
            );
            modeler.get("selection").select(shape);
          }
        },
        action(name, event) {
          const m = engine.current;
          if (!m || !ready) return;
          const canvas = m.get("canvas");
          if (name === "fit") {
            canvas.zoom("fit-viewport", "auto");
            return;
          }
          if (name === "center") {
            const v = canvas.viewbox();
            const b = v.inner;
            canvas.viewbox({
              x: b.x - (v.width - b.width) / 2,
              y: b.y - (v.height - b.height) / 2,
              width: v.width,
              height: v.height,
            });
            return;
          }
          if (name === "zoomIn" || name === "zoomOut") {
            canvas.zoom(
              Math.max(0.15, Math.min(4, canvas.zoom() * (name === "zoomIn" ? 1.2 : 1 / 1.2))),
            );
            return;
          }
          if (readOnly) return;
          const selection = m.get("selection").get();
          if (name === "undo" || name === "redo") m.get("commandStack")[name]();
          if (name === "delete" && selection.length) m.get("modeling").removeElements(selection);
          if (name === "selectAll")
            m.get("selection").select(
              m
                .get("elementRegistry")
                .filter((e: any) => e.parent === canvas.getRootElement() && !e.labelTarget),
            );
          if (name === "connect") m.get("globalConnect").start(event);
          if (name === "pan") m.get("handTool").activateHand(event);
          if (name === "lasso") m.get("lassoTool").activateSelection(event);
          if (name === "copy") m.get("copyPaste").copy(selection);
          if (name === "paste") m.get("copyPaste").paste();
          if (name === "duplicate" && selection.length) {
            const first = selection.find((e: any) => !e.waypoints) || selection[0];
            const duplicated = m.get("copyPaste").duplicate(selection, {
              element: first.parent,
              point: {
                x: (first.x || 0) + (first.width || 0) / 2 + 40,
                y: (first.y || 0) + (first.height || 0) / 2 + 40,
              },
            });
            if (duplicated) m.get("selection").select(duplicated);
          }
          if (name === "lane") {
            const target =
              selection.find((e: any) => e.type === "bpmn:Lane" || e.type === "bpmn:Participant") ||
              m.get("elementRegistry").find((e: any) => e.type === "bpmn:Participant");
            if (!target) throw new Error("Adicione ou selecione um pool antes de criar raias.");
            const lane = m.get("modeling").addLane(target, "bottom");
            m.get("modeling").updateProperties(lane, { name: "A DEFINIR" });
            m.get("selection").select(lane);
          }
        },
      }),
      [ready, readOnly],
    );

    return (
      <div
        className={`bf-bpmn-canvas ${readOnly ? "is-presentation" : ""} ${frozen ? "has-frozen-lanes" : ""}`}
      >
        <div
          className="bf-bpmn-engine"
          ref={host}
          tabIndex={-1}
          aria-label={readOnly ? "Desenho BPMN em apresentação" : "Área de desenho BPMN"}
        />
        {contextMenu && !readOnly && (
          <div
            ref={menuRef}
            className="bf-bpmn-context-menu"
            role="menu"
            aria-label="Ações do elemento"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setContextMenu(null);
                host.current?.focus();
              }
              if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
                event.preventDefault();
                const buttons = Array.from(
                  menuRef.current!.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
                );
                const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
                const next =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? buttons.length - 1
                      : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                        buttons.length;
                buttons[next]?.focus();
              }
              if (event.key === "Tab") setContextMenu(null);
            }}
          >
            <button role="menuitem" onClick={() => menuAction("edit")}>
              Editar texto
            </button>
            {!engine.current.get("popupMenu").isEmpty(contextMenu.element, "bpmn-replace") && (
              <button role="menuitem" onClick={() => menuAction("type")}>
                {contextMenu.element.type.includes("Task") ||
                contextMenu.element.type === "bpmn:SubProcess"
                  ? "Tipo de tarefa / subprocesso"
                  : contextMenu.element.type.includes("Event")
                    ? "Tipo de evento"
                    : contextMenu.element.type.includes("Gateway")
                      ? "Tipo de gateway"
                      : "Alterar tipo"}{" "}
                <span>›</span>
              </button>
            )}
            <hr />
            <button role="menuitem" onClick={() => menuAction("cut")}>
              Recortar
            </button>
            <button role="menuitem" onClick={() => menuAction("copy")}>
              Copiar
            </button>
            <button
              role="menuitem"
              disabled={!!contextMenu.element.waypoints}
              onClick={() => menuAction("duplicate")}
            >
              Duplicar
            </button>
            <button role="menuitem" onClick={() => menuAction("delete")}>
              Excluir
            </button>
            <hr />
            <button role="menuitem" onClick={() => menuAction("properties")}>
              Propriedades
            </button>
          </div>
        )}
        {!ready && (
          <div className="bf-bpmn-canvas-state" role={error ? "alert" : "status"}>
            {error || "Abrindo desenho…"}
          </div>
        )}
        {ready && frozen && laneLabels.length > 0 && (
          <div
            className="bf-bpmn-edge-identifications"
            aria-label="Identificações fora da área visível"
          >
            {laneLabels.map((label) => (
              <div
                key={label.id}
                className={`bf-bpmn-edge-label ${label.kind === "bpmn:Participant" ? "is-pool" : "is-lane"}`}
                style={{
                  left:
                    label.kind === "bpmn:Lane" &&
                    label.left === 8 &&
                    laneLabels.some(
                      (other) => other.kind === "bpmn:Participant" && other.left === 8,
                    )
                      ? 46
                      : label.left,
                  top: label.kind === "bpmn:Participant" ? Math.max(8, label.top - 70) : label.top,
                  maxWidth: label.maxWidth,
                }}
                title={label.name}
              >
                <small>{label.kind === "bpmn:Lane" ? "Raia" : "Piscina"}</small>
                <span>
                  {label.kind === "bpmn:Participant" && processName && processName !== label.name
                    ? `${processName} · ${label.name}`
                    : bindings[label.id]?.name || label.name}
                </span>
                {label.kind === "bpmn:Participant" && processName && processName !== label.name && (
                  <small>Processo: {processName}</small>
                )}
              </div>
            ))}
          </div>
        )}
        {diagrams.length > 1 && (
          <select
            className="bf-bpmn-diagrams"
            aria-label="Diagrama do arquivo"
            value={diagram}
            onChange={async (e) => {
              const next = e.target.value;
              try {
                await engine.current.open(
                  engine.current.getDefinitions().diagrams.find((d: any) => d.id === next),
                );
                setDiagram(next);
                engine.current.get("canvas").zoom("fit-viewport", "auto");
              } catch (error) {
                setError(String(error));
              }
            }}
          >
            {diagrams.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        )}
        {ready && (
          <div className="bf-bpmn-zoom" aria-label="Navegação do desenho">
            <button
              aria-label="Diminuir zoom"
              onClick={() => engine.current.get("canvas").zoom(Math.max(0.15, zoom / 100 / 1.2))}
            >
              −
            </button>
            {navigationAction}
            <output aria-label="Zoom atual">{zoom}%</output>
            <button
              aria-label="Aumentar zoom"
              onClick={() => engine.current.get("canvas").zoom(Math.min(4, (zoom / 100) * 1.2))}
            >
              +
            </button>
            <button onClick={() => engine.current.get("canvas").zoom("fit-viewport", "auto")}>
              Ajustar à tela
            </button>
          </div>
        )}
      </div>
    );
  },
);
BpmnCanvas.displayName = "BpmnCanvas";
