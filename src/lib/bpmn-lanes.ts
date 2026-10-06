import {
  getMovedSourceAnchor,
  getMovedTargetAnchor,
} from "diagram-js/lib/features/modeling/cmd/helper/AnchorsHelper";
const isLane = (e: any) => e?.type === "bpmn:Lane";
const horizontal = (lane: any) => lane.di?.isHorizontal !== false;
function poolOf(element: any): any {
  while (element && element.type !== "bpmn:Participant") element = element.parent;
  return element;
}

const containsPoint = (shape: any, x: number, y: number) =>
  x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height;

/** Pick a lane within the pool under the pointer, including its uncovered margins. */
export function resolveLaneDrop(registry: any, root: any, event: any) {
  const movingLane = event.context?.lane;
  const pools = registry
    .filter(
      (shape: any) =>
        shape.type === "bpmn:Participant" &&
        shape.parent === root &&
        !shape.hidden &&
        containsPoint(shape, event.x, event.y),
    )
    .sort((a: any, b: any) => a.width * a.height - b.width * b.height);
  const hoveredPool = poolOf(event.hover);
  const pool = pools.includes(hoveredPool) ? hoveredPool : pools[0];
  if (!pool || (movingLane && poolOf(movingLane) !== pool)) return null;
  if (movingLane && containsPoint(movingLane, event.x, event.y)) return null;

  const lanes = registry.filter(
    (shape: any) =>
      isLane(shape) &&
      !shape.hidden &&
      poolOf(shape) === pool &&
      (movingLane
        ? shape !== movingLane &&
          shape.parent === movingLane.parent &&
          shape.businessObject.$parent === movingLane.businessObject.$parent
        : shape.parent === pool),
  );
  const containing = lanes
    .filter((shape: any) => containsPoint(shape, event.x, event.y))
    .sort((a: any, b: any) => a.width * a.height - b.width * b.height);
  const nearest = lanes.sort((a: any, b: any) => {
    const distance = (shape: any) => {
      const axis = horizontal(shape) ? "y" : "x";
      const size = axis === "y" ? "height" : "width";
      return Math.max(shape[axis] - event[axis], 0, event[axis] - shape[axis] - shape[size]);
    };
    return distance(a) - distance(b);
  });
  const target = containing[0] || nearest[0] || (!movingLane ? pool : null);
  if (!target) return null;
  const axis = horizontal(target) ? "y" : "x";
  const size = axis === "y" ? "height" : "width";
  return { target, after: event[axis] > target[axis] + target[size] / 2 };
}

/** Reorders complete lane bands as one undoable command. Semantic membership is unchanged. */
class ReorderLaneHandler {
  static $inject = ["elementRegistry", "modeling"];
  constructor(
    private registry: any,
    private modeling: any,
  ) {}
  execute(context: any) {
    if (!context.moves) {
      const { lane, target, after } = context;
      if (lane === target || lane.parent !== target.parent) return [];
      const axis = horizontal(lane) ? "y" : "x";
      const size = axis === "y" ? "height" : "width";
      const siblings = lane.parent.children
        .filter((e: any) => isLane(e) && e.businessObject.$parent === lane.businessObject.$parent)
        .sort((a: any, b: any) => a[axis] - b[axis]);
      const ordered = siblings.filter((e: any) => e !== lane);
      ordered.splice(ordered.indexOf(target) + (after ? 1 : 0), 0, lane);
      const deltas = new Map<any, any>();
      const add = (shape: any, delta: any) => {
        if (!shape || shape.waypoints || deltas.has(shape)) return;
        deltas.set(shape, delta);
        (shape.labels || []).forEach((label: any) => add(label, delta));
        (shape.attachers || []).forEach((child: any) => add(child, delta));
        (shape.children || []).forEach((child: any) => add(child, delta));
        if (isLane(shape))
          (shape.businessObject.flowNodeRef || []).forEach((ref: any) =>
            add(this.registry.get(ref.id), delta),
          );
      };
      let position = siblings[0][axis];
      for (const band of ordered) {
        const amount = position - band[axis];
        add(band, { x: axis === "x" ? amount : 0, y: axis === "y" ? amount : 0 });
        // Data objects and annotations have no BPMN lane references.
        this.registry
          .filter(
            (e: any) =>
              e.parent === band.parent &&
              !isLane(e) &&
              !e.waypoints &&
              !e.labelTarget &&
              e[axis] + e[size] / 2 >= band[axis] &&
              e[axis] + e[size] / 2 < band[axis] + band[size],
          )
          .forEach((e: any) =>
            add(e, { x: axis === "x" ? amount : 0, y: axis === "y" ? amount : 0 }),
          );
        position += band[size];
      }
      context.moves = [...deltas].map(([shape, delta]) => ({
        shape,
        delta,
        x: shape.x,
        y: shape.y,
      }));
      context.edges = [];
      context.reroute = [];
      for (const edge of this.registry.filter((e: any) => e.waypoints)) {
        const from = deltas.get(edge.source) || { x: 0, y: 0 };
        const to = deltas.get(edge.target) || { x: 0, y: 0 };
        if (!from.x && !from.y && !to.x && !to.y) continue;
        if (from.x === to.x && from.y === to.y) {
          context.edges.push({
            edge,
            before: edge.waypoints.map((p: any) => ({ ...p })),
            after: edge.waypoints.map((p: any) => ({ x: p.x + from.x, y: p.y + from.y })),
          });
          for (const label of edge.labels || [])
            if (!deltas.has(label))
              context.moves.push({ shape: label, delta: from, x: label.x, y: label.y });
        } else context.reroute.push({ edge, from, to });
      }
      context.laneSet = lane.businessObject.$parent;
      context.oldOrder = [...context.laneSet.lanes];
      context.newOrder = ordered.map((e: any) => e.businessObject);
    }
    this.apply(context, false);
    return [...context.moves.map((m: any) => m.shape), ...context.edges.map((m: any) => m.edge)];
  }
  postExecute(context: any) {
    for (const { edge, from, to } of context.reroute || [])
      this.modeling.layoutConnection(edge, {
        waypoints: [],
        connectionStart: getMovedSourceAnchor(edge, edge.source, from),
        connectionEnd: getMovedTargetAnchor(edge, edge.target, to),
      });
  }
  revert(context: any) {
    if (!context.moves) return [];
    this.apply(context, true);
    return [...context.moves.map((m: any) => m.shape), ...context.edges.map((m: any) => m.edge)];
  }
  private apply(context: any, undo: boolean) {
    if (!context.moves) return;
    for (const { shape, delta, x, y } of context.moves) {
      shape.x = x + (undo ? 0 : delta.x);
      shape.y = y + (undo ? 0 : delta.y);
      const bounds = shape.labelTarget ? shape.labelTarget.di?.label?.bounds : shape.di?.bounds;
      if (bounds) {
        bounds.x = shape.x;
        bounds.y = shape.y;
      }
    }
    for (const { edge, before, after } of context.edges) {
      edge.waypoints = (undo ? before : after).map((p: any) => ({ ...p }));
      edge.di.waypoint.forEach((p: any, i: number) => {
        p.x = edge.waypoints[i].x;
        p.y = edge.waypoints[i].y;
      });
    }
    context.laneSet.lanes = undo ? context.oldOrder : context.newOrder;
  }
}

class InsertLaneHandler {
  static $inject = ["modeling", "bpmnFactory", "bpmnjs"];
  constructor(
    private modeling: any,
    private bpmnFactory: any,
    private bpmnjs: any,
  ) {}
  preExecute(context: any) {
    if (!poolOf(context.target))
      throw new Error("A raia só pode ser inserida dentro de uma piscina.");
    if (context.target.type === "bpmn:Participant" && !context.target.businessObject.processRef) {
      const definitions = this.bpmnjs.getDefinitions();
      const process = this.bpmnFactory.create("bpmn:Process", { isExecutable: false });
      this.modeling.updateModdleProperties(context.target, definitions, {
        rootElements: [...definitions.rootElements, process],
      });
      this.modeling.updateProperties(context.target, { processRef: process });
    }
    if (context.target.type === "bpmn:Participant" && !context.target.children.some(isLane)) {
      this.modeling.splitLane(context.target, 1);
      context.lane = context.target.children.find(isLane);
    } else {
      context.lane = this.modeling.addLane(context.target, context.after ? "bottom" : "top");
    }
    this.modeling.updateProperties(context.lane, { name: "A DEFINIR" });
  }
  execute() {
    return [];
  }
  revert() {
    return [];
  }
}

export class LaneDrag {
  static $inject = [
    "eventBus",
    "dragging",
    "canvas",
    "elementRegistry",
    "commandStack",
    "modeling",
    "selection",
  ];
  constructor(
    eventBus: any,
    private dragging: any,
    canvas: any,
    registry: any,
    commandStack: any,
    modeling: any,
    selection: any,
  ) {
    commandStack.registerHandler("bf.lane.reorder", ReorderLaneHandler);
    commandStack.registerHandler("bf.lane.insert", InsertLaneHandler);
    const indicator = document.createElement("div");
    indicator.className = "bf-bpmn-lane-drop";
    indicator.style.display = "none";
    canvas.getContainer().append(indicator);
    const destination = (event: any) => resolveLaneDrop(registry, canvas.getRootElement(), event);
    eventBus.on("element.mousedown", 2500, (event: any) => {
      const lane = event.element;
      if (!isLane(lane) || event.originalEvent.button !== 0 || dragging.context()) return;
      const vb = canvas.viewbox(),
        rect = canvas.getContainer().getBoundingClientRect();
      const x = (event.originalEvent.clientX - rect.left) / vb.scale + vb.x;
      const y = (event.originalEvent.clientY - rect.top) / vb.scale + vb.y;
      if (horizontal(lane) ? x > lane.x + 30 : y > lane.y + 30) return;
      selection.select(lane);
      this.start(event.originalEvent, lane);
      return false;
    });
    eventBus.on("bf-lane.move", (event: any) => {
      const dest = destination(event);
      indicator.style.display = "block";
      if (!dest) {
        const vb = canvas.viewbox();
        Object.assign(indicator.style, {
          left: `${(event.x - vb.x) * vb.scale}px`,
          top: `${(event.y - vb.y) * vb.scale}px`,
          width: "220px",
          height: "auto",
        });
        indicator.textContent = event.context.lane
          ? "Solte sobre outra raia da mesma piscina"
          : "Solte dentro de uma piscina";
        return;
      }
      const { target, after } = dest,
        vb = canvas.viewbox();
      const h = horizontal(target);
      Object.assign(indicator.style, {
        left: `${(target.x - vb.x + (!h && after ? target.width : 0)) * vb.scale}px`,
        top: `${(target.y - vb.y + (h && after ? target.height : 0)) * vb.scale}px`,
        width: h ? `${target.width * vb.scale}px` : "3px",
        height: h ? "3px" : `${target.height * vb.scale}px`,
      });
      indicator.textContent = "";
    });
    eventBus.on("bf-lane.end", (event: any) => {
      const dest = destination(event);
      if (!dest) return;
      if (event.context.lane)
        commandStack.execute("bf.lane.reorder", { lane: event.context.lane, ...dest });
      else {
        const insertion: any = { ...dest };
        commandStack.execute("bf.lane.insert", insertion);
        selection.select(insertion.lane);
      }
    });
    eventBus.on("bf-lane.cleanup", () => {
      indicator.style.display = "none";
    });
    eventBus.on("diagram.destroy", () => indicator.remove());
  }
  start(event: any, lane?: any) {
    this.dragging.init(event, "bf-lane", { cursor: "grabbing", data: { context: { lane } } });
  }
}
export const bpmnLaneModule = { __init__: ["bfLaneDrag"], bfLaneDrag: ["type", LaneDrag] };
