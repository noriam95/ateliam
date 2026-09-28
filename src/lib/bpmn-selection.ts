import { selectedByRectangle } from "./bpmn-viewport";
export function RectangleSelection(
  eventBus: any,
  canvas: any,
  elementRegistry: any,
  lassoTool: any,
  dragging: any,
) {
  eventBus.on("element.mousedown", 2000, (event: any) => {
    const original = event.originalEvent,
      element = event.element;
    if (
      original.button !== 0 ||
      original.altKey ||
      original.ctrlKey ||
      original.metaKey ||
      dragging.context()
    )
      return;
    const background = !element.parent || ["bpmn:Participant", "bpmn:Lane"].includes(element.type);
    if (!background || original.target.closest?.("text")) return;
    lassoTool.activateLasso(original);
    return true;
  });
  eventBus.on("lasso.move", 900, (event: any) => {
    const context = event.context;
    const root = canvas.getRootElement();
    const visible = (e: any) => {
      let p = e;
      while (p.parent) p = p.parent;
      return p === root;
    };
    const next = new Set<any>([
      ...context.initialMarked,
      ...elementRegistry
        .getAll()
        .filter((e: any) => visible(e) && selectedByRectangle(e, context.bbox)),
    ]);
    for (const e of context.marked) if (!next.has(e)) canvas.removeMarker(e, "selected");
    for (const e of next) if (!context.marked.has(e)) canvas.addMarker(e, "selected");
    context.marked = next;
  });
}
RectangleSelection.$inject = ["eventBus", "canvas", "elementRegistry", "lassoTool", "dragging"];
export const bpmnSelectionModule = {
  __init__: ["rectangleSelection"],
  rectangleSelection: ["type", RectangleSelection],
};
