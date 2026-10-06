import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Crosshair } from "lucide-react";
import { createPortal } from "react-dom";
import { exportBpmnPng } from "@/lib/bpmn-export";
import { edgeIdentification } from "@/lib/bpmn-viewport";
import { bpmnLaneModule } from "@/lib/bpmn-lanes";
import { bpmnSelectionModule } from "@/lib/bpmn-selection";
import {
  bpmnImageModule,
  encodeBpmnImage,
  IMAGE_PENDING,
  isBpmnImageElement,
  isBpmnImagePending,
  readBpmnImageElement,
  type BpmnImagePayload,
} from "@/lib/bpmn-images";
import Modeler from "bpmn-js/lib/Modeler";
import NavigatedViewer from "bpmn-js/lib/NavigatedViewer";
import type { BpmnTextStyle, LaneBinding } from "@/lib/bpmn-document";
import { bpmnEngineModules } from "@/lib/bpmn-engine-modules";
import "bpmn-js/dist/assets/diagram-js.css";
import "bpmn-js/dist/assets/bpmn-font/css/bpmn.css";
import "./bpmn.css";

export type CanvasSelection = {
  id: string;
  type: string;
  name: string;
  fill?: string;
  stroke?: string;
  count: number;
  isImage?: boolean;
} | null;
export type BpmnCanvasHandle = {
  xml(): Promise<string>;
  png(): Promise<Blob>;
  action(name: string, event?: any): void;
  rename(id: string, name: string): void;
  color(fill?: string, stroke?: string): void;
  create(type: string, event?: any): void;
  createImage(event?: any): void;
  setImage(id: string, payload: BpmnImagePayload): void;
  remove(id: string): void;
  formatText(style: Partial<BpmnTextStyle>): string[];
  lanes(): { id: string; name: string }[];
};

const svgNamespace = "http://www.w3.org/2000/svg";
const annotationTextPadding = 12;

function wrapAnnotationText(
  text: SVGTextElement,
  content: string,
  width: number,
  fontSize: number,
  style: BpmnTextStyle | undefined,
) {
  const measureSurface = document.createElement("canvas");
  const context = measureSurface.getContext("2d");
  if (!context) return;

  const fontFamily = style?.fontFamily || getComputedStyle(text).fontFamily || "Arial, sans-serif";
  const fontWeight = style?.bold ? "700" : getComputedStyle(text).fontWeight || "400";
  const fontStyle = style?.italic ? "italic" : getComputedStyle(text).fontStyle || "normal";
  context.font = `${fontStyle} ${fontWeight} ${fontSize}px ${fontFamily}`;
  const maxWidth = Math.max(1, width - annotationTextPadding * 2);
  const lines: string[] = [];
  const addWord = (line: string, word: string) => {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || context.measureText(candidate).width <= maxWidth) return candidate;
    lines.push(line);
    return word;
  };

  for (const paragraph of content.replace(/\r\n?/g, "\n").split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (context.measureText(word).width <= maxWidth) {
        line = addWord(line, word);
        continue;
      }
      if (line) lines.push(line);
      line = "";
      let chunk = "";
      for (const character of word) {
        if (chunk && context.measureText(`${chunk}${character}`).width > maxWidth) {
          lines.push(chunk);
          chunk = character;
        } else {
          chunk += character;
        }
      }
      line = chunk;
    }
    lines.push(line);
  }

  const anchor = style?.align === "right" ? "end" : style?.align === "center" ? "middle" : "start";
  const x = anchor === "end" ? width - annotationTextPadding : anchor === "middle" ? width / 2 : annotationTextPadding;
  const lineHeight = fontSize * 1.2;
  text.setAttribute("text-anchor", anchor);
  text.replaceChildren(
    ...lines.map((line, index) => {
      const span = document.createElementNS(svgNamespace, "tspan");
      span.setAttribute("x", String(x));
      span.setAttribute("y", String(annotationTextPadding + fontSize + index * lineHeight));
      span.textContent = line;
      return span;
    }),
  );
}

function paintCanvasExtensions(instance: any, styles: Record<string, BpmnTextStyle>) {
  if (!instance?.getDefinitions?.()) return;
  const registry = instance.get("elementRegistry");
  registry.forEach((element: any) => {
    const graphics = registry.getGraphics(element);
    if (!graphics) return;
    const style = styles[element.labelTarget?.id || element.id];
    const texts = graphics.querySelectorAll<SVGTextElement>(".djs-label, text");
    texts.forEach((text) => {
      text.style.fontFamily = style?.fontFamily || "";
      text.style.fontSize = style?.fontSize ? `${style.fontSize}px` : "";
      text.style.fontWeight = style?.bold ? "700" : "";
      text.style.fontStyle = style?.italic ? "italic" : "";
      text.style.textDecoration = [style?.underline && "underline", style?.strike && "line-through"]
        .filter(Boolean)
        .join(" ");
      text.style.fill = style?.color || "";
      text.style.textAnchor =
        style?.align === "left" ? "start" : style?.align === "right" ? "end" : "";
    });

    if (element.type === "bpmn:TextAnnotation") {
      const text = graphics.querySelector<SVGTextElement>(".djs-label");
      if (text) {
        const textStyle = styles[element.id];
        const fontSize = textStyle?.fontSize || Number.parseFloat(getComputedStyle(text).fontSize) || 12;
        wrapAnnotationText(
          text,
          element.businessObject?.text || text.textContent || "",
          element.width,
          fontSize,
          textStyle,
        );
      }
    }

    const visual = graphics.querySelector<SVGGElement>(".djs-visual");
    const image = readBpmnImageElement(element);
    graphics.toggleAttribute("data-bf-image", Boolean(image));
    visual?.querySelector(".bf-bpmn-image-render")?.remove();
    if (!visual || !image) return;
    const node = document.createElementNS(svgNamespace, "image");
    node.classList.add("bf-bpmn-image-render");
    node.setAttribute("href", image.src);
    node.setAttribute("width", String(element.width));
    node.setAttribute("height", String(element.height));
    node.setAttribute("preserveAspectRatio", "xMidYMid meet");
    node.setAttribute("aria-label", image.name);
    visual.appendChild(node);
  });
}

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
    elementStyles?: Record<string, BpmnTextStyle>;
    onImageRequest?: (id: string) => void;
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
      elementStyles = {},
      onImageRequest,
    },
    ref,
  ) => {
    const host = useRef<HTMLDivElement>(null);
    const engine = useRef<any>(null);
    const callbacks = useRef({
      onChange,
      onSelection,
      onWarnings,
      onReady,
      onProperties,
      onImageRequest,
    });
    callbacks.current = {
      onChange,
      onSelection,
      onWarnings,
      onReady,
      onProperties,
      onImageRequest,
    };
    const stylesRef = useRef(elementStyles);
    stylesRef.current = elementStyles;
    const [error, setError] = useState("");
    const [ready, setReady] = useState(false);
    const [zoom, setZoom] = useState(100);
    const [laneLabels, setLaneLabels] = useState<
      { id: string; name: string; kind: string; left: number; top: number; maxWidth: number }[]
    >([]);
    const [diagrams, setDiagrams] = useState<{ id: string; name: string }[]>([]);
    const [diagram, setDiagram] = useState("");
    const view = useRef<any>(null);
    const [contextMenu, setContextMenu] = useState<{
      element: any;
      x: number;
      y: number;
      point: { x: number; y: number };
    } | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
      const menu = menuRef.current;
      if (!contextMenu || !menu) return;
      const bounds = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(contextMenu.x, window.innerWidth - bounds.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(contextMenu.y, window.innerHeight - bounds.height - 8))}px`;
    }, [contextMenu]);
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
        if (action === "paste") {
          const parent =
            ["bpmn:Participant", "bpmn:Lane", "bpmn:SubProcess"].includes(element.type) ||
            !element.parent
              ? element
              : element.parent;
          const pasted = m.get("copyPaste").paste({ element: parent, point: contextMenu.point });
          if (pasted) m.get("selection").select(pasted);
        }
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
        const selected = m.get("selection").get();
        const targets = selected.includes(element) ? selected : [element];
        if (action === "copy") m.get("copyPaste").copy(targets);
        if (action === "cut") m.get("copyPaste").cut(targets);
        if (action === "delete") m.get("modeling").removeElements(targets);
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
            additionalModules: [
              ...bpmnEngineModules,
              bpmnSelectionModule,
              bpmnLaneModule,
              bpmnImageModule,
            ],
          });
      engine.current = instance;
      // Native replace menus share the viewport overlay layer, not the clipped canvas.
      let popupLayer: HTMLElement | null = null;
      let popupFrame = 0;
      instance.on("popupMenu.open", () => {
        popupLayer = host.current?.querySelector<HTMLElement>(".djs-popup-parent") || null;
        if (!popupLayer) return;
        popupLayer.classList.add("bf-bpmn-engine-popup", "bio-theme-parent", "djs-parent");
        (host.current?.closest("dialog") || window.document.body).appendChild(popupLayer);
      });
      instance.on("popupMenu.opened", () => {
        popupFrame = requestAnimationFrame(() => {
          const popup = popupLayer?.querySelector<HTMLElement>(".djs-popup");
          if (!popup || disposed) return;
          const bounds = popup.getBoundingClientRect();
          popup.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - bounds.width - 8))}px`;
          popup.style.top = `${Math.max(8, Math.min(bounds.top, window.innerHeight - bounds.height - 8))}px`;
        });
      });
      const closeMenus = () => {
        setContextMenu(null);
        if (!readOnly) instance.get("popupMenu").close();
      };
      window.addEventListener("resize", closeMenus);

      let importing = true;
      const updateOverlay = () => {
        if (disposed || !instance.getDefinitions()) return;
        const registry = instance.get("elementRegistry");
        registry.forEach((element: any) => {
          const graphics = registry.getGraphics(element);
          if (graphics) {
            graphics.setAttribute("data-bf-type", element.type);
            graphics.setAttribute(
              "data-bf-custom-fill",
              String(
                Boolean(
                  element.di?.get("bioc:fill") ||
                  element.di?.get("color:background-color") ||
                  element.di?.get("bioc:stroke") ||
                  element.di?.get("color:border-color"),
                ),
              ),
            );
            graphics.toggleAttribute("data-bf-pool", element.type === "bpmn:Participant");
          }
        });
        paintCanvasExtensions(instance, stylesRef.current);
        const canvas = instance.get("canvas");
        const vb = canvas.viewbox();
        view.current = vb;
        setZoom(Math.round(vb.scale * 100));
        const hostRect = host.current!.getBoundingClientRect();
        const viewport = { x: 0, y: 0, width: hostRect.width, height: hostRect.height };
        setLaneLabels(
          registry
            .filter((el: any) => el.type === "bpmn:Lane" && !el.hidden)
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
                readOnly ? { width: 240, height: 38 } : undefined,
              );
              graphics.toggleAttribute("data-bf-clipped-label", Boolean(position));
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
          event.originalEvent.preventDefault();
          event.originalEvent.stopPropagation();
          if (element.parent && !instance.get("selection").get().includes(element))
            instance.get("selection").select(element);
          const vb = instance.get("canvas").viewbox();
          const rect = host.current!.getBoundingClientRect();
          instance.get("contextPad").close();
          setContextMenu({
            element,
            point: {
              x: vb.x + (event.originalEvent.clientX - rect.left) / vb.scale,
              y: vb.y + (event.originalEvent.clientY - rect.top) / vb.scale,
            },
            x: Math.max(8, Math.min(event.originalEvent.clientX, window.innerWidth - 248)),
            y: Math.max(8, Math.min(event.originalEvent.clientY, window.innerHeight - 310)),
          });
          return false;
        });
      if (!readOnly)
        instance.on("shape.added", ({ element }: any) => {
          if (!importing && isBpmnImagePending(element))
            callbacks.current.onImageRequest?.(element.id);
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
                fill: el.di?.get("bioc:fill") || el.di?.get("color:background-color"),
                stroke: el.di?.get("bioc:stroke") || el.di?.get("color:border-color"),
                count: newSelection.length,
                isImage: Boolean(readBpmnImageElement(el)),
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
            fill: el.di?.get("bioc:fill") || el.di?.get("color:background-color"),
            stroke: el.di?.get("bioc:stroke") || el.di?.get("color:border-color"),
            count: selected.length,
            isImage: Boolean(readBpmnImageElement(el)),
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
        window.removeEventListener("resize", closeMenus);
        cancelAnimationFrame(popupFrame);
        instance.destroy();
        popupLayer?.remove();
        if (engine.current === instance) engine.current = null;
      };
    }, [xml, readOnly]);

    useEffect(() => {
      if (ready && engine.current) paintCanvasExtensions(engine.current, elementStyles);
    }, [elementStyles, ready]);

    useImperativeHandle(
      ref,
      () => ({
        async xml() {
          if (!ready) throw new Error("Aguarde a abertura do desenho.");
          return (await engine.current.saveXML({ format: true })).xml;
        },
        async png() {
          if (!ready) throw new Error("Aguarde a abertura do desenho.");
          return exportBpmnPng(engine.current);
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
        color(fill, stroke) {
          if (readOnly || !ready || (!fill && !stroke)) return;
          const modeler = engine.current;
          const elements = modeler.get("selection").get();
          if (
            elements.every(
              (e: any) =>
                (!fill || e.di?.get("bioc:fill") === fill) &&
                (!stroke || e.di?.get("bioc:stroke") === stroke),
            )
          )
            return;
          modeler
            .get("modeling")
            .setColor(elements, { ...(fill ? { fill } : {}), ...(stroke ? { stroke } : {}) });
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
        createImage(event) {
          if (readOnly || !ready) return;
          const modeler = engine.current;
          const shape = modeler.get("elementFactory").createShape({
            type: "bpmn:Group",
            width: 240,
            height: 160,
          });
          const pending = modeler
            .get("bpmnFactory")
            .create("bpmn:Documentation", { text: IMAGE_PENDING });
          pending.$parent = shape.businessObject;
          shape.businessObject.documentation = [pending];
          if (event?.clientX) modeler.get("create").start(event, shape);
          else {
            const selected = modeler.get("selection").get()[0];
            const parent =
              selected?.type === "bpmn:Lane" || selected?.type === "bpmn:Participant"
                ? selected
                : modeler.get("elementRegistry").find((e: any) => e.type === "bpmn:Lane") ||
                  modeler.get("canvas").getRootElement();
            const vb = modeler.get("canvas").viewbox();
            modeler.get("modeling").createShape(
              shape,
              {
                x: parent.x ? parent.x + 240 : vb.x + vb.width / 2,
                y: parent.y ? parent.y + parent.height / 2 : vb.y + vb.height / 2,
              },
              parent,
            );
            modeler.get("selection").select(shape);
          }
        },
        setImage(id, payload) {
          if (readOnly || !ready) return;
          const modeler = engine.current;
          const element = modeler.get("elementRegistry").get(id);
          if (!element) return;
          const width = 240;
          const height = width / payload.aspectRatio;
          const documentation = (element.businessObject.documentation || []).filter(
            (item: any) => !item?.text?.startsWith("BF_IMAGE_V1:"),
          );
          const imageDocumentation = modeler.get("bpmnFactory").create("bpmn:Documentation", {
            text: encodeBpmnImage(payload),
          });
          imageDocumentation.$parent = element.businessObject;
          modeler.get("modeling").updateProperties(element, {
            documentation: [...documentation, imageDocumentation],
          });
          modeler.get("modeling").resizeShape(
            element,
            {
              x: element.x,
              y: element.y + (element.height - height) / 2,
              width,
              height,
            },
            undefined,
            { autoResize: true },
          );
          paintCanvasExtensions(modeler, stylesRef.current);
        },
        remove(id) {
          if (readOnly || !ready) return;
          const element = engine.current.get("elementRegistry").get(id);
          if (element) engine.current.get("modeling").removeElements([element]);
        },
        formatText(patch) {
          if (readOnly || !ready) return [];
          const selected = engine.current
            .get("selection")
            .get()
            .map((element: any) => element.labelTarget || element)
            .filter((element: any) => element.parent && !readBpmnImageElement(element));
          const ids = [...new Set<string>(selected.map((element: any) => element.id))];
          stylesRef.current = { ...stylesRef.current };
          ids.forEach((id) => {
            stylesRef.current[id] = { ...(stylesRef.current[id] || {}), ...patch };
          });
          paintCanvasExtensions(engine.current, stylesRef.current);
          return ids;
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
          if (name === "lane" && event) {
            m.get("bfLaneDrag").start(event);
            return;
          }
          if (name === "lane") {
            const target =
              selection.find((e: any) => e.type === "bpmn:Lane" || e.type === "bpmn:Participant") ||
              m.get("elementRegistry").find((e: any) => e.type === "bpmn:Participant");
            if (!target) throw new Error("Adicione ou selecione um pool antes de criar raias.");
            const insertion: any = { target, after: true };
            m.get("commandStack").execute("bf.lane.insert", insertion);
            m.get("selection").select(insertion.lane);
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
        {contextMenu &&
          !readOnly &&
          createPortal(
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
              {contextMenu.element.parent && (
                <>
                  {!isBpmnImageElement(contextMenu.element) && (
                    <>
                      <button role="menuitem" onClick={() => menuAction("edit")}>
                        Editar texto
                      </button>
                      <hr />
                    </>
                  )}
                  <button role="menuitem" onClick={() => menuAction("cut")}>
                    Recortar
                  </button>
                  <button role="menuitem" onClick={() => menuAction("copy")}>
                    Copiar
                  </button>
                </>
              )}
              <button
                role="menuitem"
                disabled={engine.current.get("clipboard").isEmpty()}
                onClick={() => menuAction("paste")}
              >
                Colar
              </button>
              {contextMenu.element.parent && (
                <>
                  <button
                    role="menuitem"
                    disabled={!!contextMenu.element.waypoints}
                    onClick={() => menuAction("duplicate")}
                  >
                    Duplicar
                  </button>
                  <hr />
                  {!isBpmnImageElement(contextMenu.element) &&
                    !engine.current
                      .get("popupMenu")
                      .isEmpty(contextMenu.element, "bpmn-replace") && (
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
                  <button role="menuitem" onClick={() => menuAction("properties")}>
                    Propriedades
                  </button>
                  <hr />
                  <button role="menuitem" onClick={() => menuAction("delete")}>
                    Excluir
                  </button>
                </>
              )}
            </div>,
            host.current?.closest("dialog") || window.document.body,
          )}
        {!ready && (
          <div className="bf-bpmn-canvas-state" role={error ? "alert" : "status"}>
            {error || "Abrindo desenho…"}
          </div>
        )}
        {ready && frozen && laneLabels.length > 0 && (
          <div
            className="bf-bpmn-edge-identifications"
            aria-label="Identificações de raias fora da área visível"
          >
            {laneLabels.map((label) => (
              <div
                key={label.id}
                className="bf-bpmn-edge-label is-lane"
                style={{
                  left: label.left,
                  top: label.top,
                  maxWidth: label.maxWidth,
                }}
                title={label.name}
              >
                {!readOnly && <small>Raia</small>}
                <span>{bindings[label.id]?.name || label.name}</span>
              </div>
            ))}
          </div>
        )}
        {ready && (
          <div className="bf-bpmn-zoom" aria-label="Navegação do desenho">
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

            <button
              aria-label="Diminuir zoom"
              title="Diminuir zoom"
              onClick={() => engine.current.get("canvas").zoom(Math.max(0.15, zoom / 100 / 1.2))}
            >
              −
            </button>
            <output aria-label="Zoom atual">{zoom}%</output>
            <button
              aria-label="Aumentar zoom"
              title="Aumentar zoom"
              onClick={() => engine.current.get("canvas").zoom(Math.min(4, (zoom / 100) * 1.2))}
            >
              +
            </button>
            <button
              title="Centralizar sem alterar o zoom"
              aria-label="Centralizar"
              onClick={() => {
                const canvas = engine.current.get("canvas");
                const box = canvas.viewbox();
                canvas.viewbox({
                  x: box.inner.x - (box.width - box.inner.width) / 2,
                  y: box.inner.y - (box.height - box.inner.height) / 2,
                  width: box.width,
                  height: box.height,
                });
              }}
            >
              <Crosshair size={15} />
            </button>
            {navigationAction}
            <button
              title="Exibir o desenho inteiro"
              onClick={() => engine.current.get("canvas").zoom("fit-viewport", "auto")}
            >
              Ajustar à tela
            </button>
          </div>
        )}
      </div>
    );
  },
);
BpmnCanvas.displayName = "BpmnCanvas";
