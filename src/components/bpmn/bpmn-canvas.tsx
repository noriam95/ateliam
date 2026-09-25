import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
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
    },
    ref,
  ) => {
    const host = useRef<HTMLDivElement>(null);
    const engine = useRef<any>(null);
    const callbacks = useRef({ onChange, onSelection, onWarnings, onReady });
    callbacks.current = { onChange, onSelection, onWarnings, onReady };
    const [error, setError] = useState("");
    const [ready, setReady] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [laneLabels, setLaneLabels] = useState<
      { id: string; name: string; top: number; height: number }[]
    >([]);
    const [diagrams, setDiagrams] = useState<{ id: string; name: string }[]>([]);
    const [diagram, setDiagram] = useState("");
    const view = useRef<any>(null);

    useEffect(() => {
      let disposed = false;
      setReady(false);
      setError("");
      const instance: any = readOnly
        ? new NavigatedViewer({ container: host.current!, additionalModules: bpmnEngineModules })
        : new Modeler({ container: host.current!, additionalModules: bpmnEngineModules });
      engine.current = instance;
      let importing = true;
      const updateOverlay = () => {
        if (disposed || !instance.getDefinitions()) return;
        const canvas = instance.get("canvas");
        const vb = canvas.viewbox();
        view.current = vb;
        setZoom(Math.round(vb.scale * 100));
        setLaneLabels(
          instance
            .get("elementRegistry")
            .filter((el: any) => el.type === "bpmn:Lane" && !el.hidden)
            .map((el: any) => ({
              id: el.id,
              name: el.businessObject.name || "A DEFINIR",
              top: (el.y - vb.y) * vb.scale,
              height: el.height * vb.scale,
            })),
        );
      };
      instance.on("canvas.viewbox.changed", updateOverlay);
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
          aria-label={readOnly ? "Desenho BPMN em apresentação" : "Área de desenho BPMN"}
        />
        {!ready && (
          <div className="bf-bpmn-canvas-state" role={error ? "alert" : "status"}>
            {error || "Abrindo desenho…"}
          </div>
        )}
        {ready && frozen && (
          <div className="bf-bpmn-frozen-lanes" aria-label="Identificações fixas das raias">
            {laneLabels
              .filter((l) => l.top + l.height > 0)
              .map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={readOnly}
                  style={{
                    top: Math.max(0, l.top),
                    height: Math.max(24, l.height + Math.min(0, l.top)),
                  }}
                  onClick={() =>
                    engine.current
                      ?.get("selection")
                      .select(engine.current.get("elementRegistry").get(l.id))
                  }
                >
                  <span title={`Rótulo no desenho: ${l.name}`}>
                    {bindings[l.id]?.name || l.name}
                  </span>
                  <small>
                    {bindings[l.id]
                      ? bindings[l.id].kind === "area"
                        ? "Área"
                        : "Cargo"
                      : "A DEFINIR"}
                  </small>
                </button>
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
