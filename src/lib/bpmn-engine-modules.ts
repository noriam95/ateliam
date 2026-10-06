import { BPMN_DEFAULT_COLORS } from "./bpmn-colors";

/** Keep native BPMN text editing and semantics, but draw annotations as filled notes. */
export function AnnotationRenderer(eventBus: any, bpmnRenderer: any) {
  eventBus.on("render.shape", 1500, (_event: any, context: any) => {
    const { element, gfx, attrs } = context;
    if (element.type !== "bpmn:TextAnnotation") return;

    const rect = bpmnRenderer.drawShape(gfx, element, attrs);
    const di = element.di || element.businessObject?.di;
    const defaults = BPMN_DEFAULT_COLORS.annotation;
    // The built-in annotation carries inline `fill: none; stroke: none` styles.
    // Override those styles so the colors remain visible and survive SVG export.
    rect.style.fill = di?.get("bioc:fill") || di?.get("color:background-color") || defaults.fill;
    rect.style.stroke = di?.get("bioc:stroke") || di?.get("color:border-color") || defaults.stroke;
    rect.style.strokeWidth = "2px";
    gfx.querySelector("path")?.remove();
    return rect;
  });
}
AnnotationRenderer.$inject = ["eventBus", "bpmnRenderer"];

/** A pool owns the outer frame; its lanes draw only the dividers between bands. */
export function LaneRenderer(eventBus: any, bpmnRenderer: any) {
  eventBus.on("render.shape", 1500, (_event: any, context: any) => {
    const { element, gfx, attrs } = context;
    if (element.type !== "bpmn:Lane") return;

    const rect = bpmnRenderer.drawShape(gfx, element, attrs);
    let ancestor = element.parent;
    while (ancestor && ancestor.type !== "bpmn:Participant") ancestor = ancestor.parent;
    if (!ancestor) return rect;

    const di = element.di || element.businessObject?.di;
    const stroke =
      di?.get("bioc:stroke") || di?.get("color:border-color") || BPMN_DEFAULT_COLORS.lane.stroke;
    rect.style.setProperty("stroke", "none", "important");
    const horizontal = element.di?.isHorizontal !== false;
    const axis = horizontal ? "y" : "x";
    const siblings = element.parent.children.filter(
      (other: any) =>
        other.type === "bpmn:Lane" &&
        other.businessObject.$parent === element.businessObject.$parent,
    );
    if (!siblings.some((other: any) => other !== element && other[axis] < element[axis]))
      return rect;

    const parent = element.parent;
    const divider = document.createElementNS("http://www.w3.org/2000/svg", "line");
    if (horizontal) {
      divider.setAttribute("x1", String(parent.x + 30 - element.x));
      divider.setAttribute("x2", String(parent.x + parent.width - element.x));
      divider.setAttribute("y1", "0");
      divider.setAttribute("y2", "0");
    } else {
      divider.setAttribute("x1", "0");
      divider.setAttribute("x2", "0");
      divider.setAttribute("y1", String(parent.y + 30 - element.y));
      divider.setAttribute("y2", String(parent.y + parent.height - element.y));
    }
    divider.style.stroke = stroke;
    divider.style.strokeWidth = "1.5px";
    divider.style.pointerEvents = "none";
    gfx.appendChild(divider);
    return rect;
  });
}
LaneRenderer.$inject = ["eventBus", "bpmnRenderer"];

/** Importing must not round DI coordinates or resize existing external labels. */
function PreserveDiagramGeometry(eventBus: any, elementRegistry: any, graphicsFactory: any) {
  eventBus.on("commandStack.shape.resize.canExecute", 2000, ({ context }: any) => {
    const shape = context.shape;
    if (
      !shape?.businessObject?.$instanceOf("bpmn:Task") &&
      !(shape?.type === "bpmn:SubProcess" && shape.collapsed)
    )
      return;
    return !context.newBounds || (context.newBounds.width >= 80 && context.newBounds.height >= 50);
  });
  eventBus.on("import.render.complete", 500, () => {
    for (const element of elementRegistry.getAll()) {
      const di = element.di || element.businessObject?.di;
      const bounds = element.type === "label" ? di?.label?.bounds : di?.bounds;
      if (!bounds || !element.parent) continue;
      Object.assign(element, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
      graphicsFactory.update("shape", element, elementRegistry.getGraphics(element));
    }
  });
}
PreserveDiagramGeometry.$inject = ["eventBus", "elementRegistry", "graphicsFactory"];

const translations: Record<string, string> = {
  "Parallel multi-instance": "Múltiplas instâncias paralelas",
  "Sequential multi-instance": "Múltiplas instâncias sequenciais",
  "Sub-process (collapsed)": "Subprocesso recolhido",
  "Sub-process (expanded)": "Subprocesso expandido",
  "Ad-hoc sub-process (collapsed)": "Subprocesso ad hoc recolhido",
  "Ad-hoc sub-process (expanded)": "Subprocesso ad hoc expandido",
  "Event-based gateway": "Gateway baseado em eventos",
  "Conditional start event": "Início condicional",
  "Signal start event": "Início por sinal",
  "Signal end event": "Fim por sinal",
  "Escalation end event": "Fim por escalonamento",
  "Compensation end event": "Fim por compensação",
  "Cancel end event": "Fim por cancelamento",
  "Conditional intermediate catch event": "Captura condicional",
  "Signal intermediate catch event": "Captura de sinal",
  "Link intermediate catch event": "Captura de ligação",
  "Link intermediate throw event": "Lançamento de ligação",
  "Escalation intermediate throw event": "Lançamento de escalonamento",
  "Compensation intermediate throw event": "Lançamento de compensação",

  "Append end event": "Adicionar evento de fim",
  "Append gateway": "Adicionar decisão",
  "Append task": "Adicionar tarefa",
  "Append intermediate/boundary event": "Adicionar evento intermediário",
  "Add text annotation": "Adicionar anotação",
  "Change element": "Alterar elemento",
  "Connect to other element": "Conectar a outro elemento",
  "Connect using association": "Conectar por associação",
  "Connect using data input association": "Associar entrada de dados",
  "Append receive task": "Adicionar tarefa de recebimento",
  "Append message intermediate catch event": "Adicionar captura de mensagem",
  "Append timer intermediate catch event": "Adicionar evento de tempo",
  "Append conditional intermediate catch event": "Adicionar evento condicional",
  "Append signal intermediate catch event": "Adicionar captura de sinal",
  "Append compensation activity": "Adicionar atividade de compensação",
  "Append EndEvent": "Adicionar evento de fim",
  "Append Gateway": "Adicionar decisão",
  "Append Task": "Adicionar tarefa",
  "Append Intermediate/Boundary Event": "Adicionar evento intermediário",
  "Append TextAnnotation": "Adicionar anotação",
  "Connect using Sequence/MessageFlow or Association": "Conectar por fluxo ou associação",
  "Change type": "Alterar tipo",
  Remove: "Excluir",
  Delete: "Excluir",
  "Start Event": "Evento de início",
  "End Event": "Evento de fim",
  "Intermediate Throw Event": "Evento intermediário de lançamento",
  "Intermediate Catch Event": "Evento intermediário de captura",
  Task: "Tarefa",
  "User Task": "Tarefa de usuário",
  "Manual Task": "Tarefa manual",
  "Service Task": "Tarefa de serviço",
  "Send Task": "Tarefa de envio",
  "Receive Task": "Tarefa de recebimento",
  "Script Task": "Tarefa de script",
  "Business Rule Task": "Tarefa de regra de negócio",
  "Sub Process (collapsed)": "Subprocesso recolhido",
  "Sub Process (expanded)": "Subprocesso expandido",
  "Call Activity": "Atividade de chamada",
  "Exclusive Gateway": "Gateway exclusivo",
  "Parallel Gateway": "Gateway paralelo",
  "Inclusive Gateway": "Gateway inclusivo",
  "Event based Gateway": "Gateway baseado em eventos",
  "Complex Gateway": "Gateway complexo",
  "Message Start Event": "Início por mensagem",
  "Timer Start Event": "Início por tempo",
  "Message End Event": "Fim por mensagem",
  "Terminate End Event": "Fim de término",
  "Error End Event": "Fim por erro",
  "Message Intermediate Catch Event": "Capturar mensagem",
  "Timer Intermediate Catch Event": "Aguardar tempo",
  "Message Intermediate Throw Event": "Enviar mensagem",
  "Signal Intermediate Throw Event": "Lançar sinal",
  "Add Lane above": "Adicionar raia acima",
  "Add Lane below": "Adicionar raia abaixo",
  "Divide into two Lanes": "Dividir em duas raias",
  "Divide into three Lanes": "Dividir em três raias",
  "Activate the hand tool": "Mover canvas",
  "Activate the lasso tool": "Selecionar vários elementos",
  "Activate the create/remove space tool": "Ajustar espaço",
  "Sequence Flow": "Fluxo de sequência",
  "Default Flow": "Fluxo padrão",
  "Conditional Flow": "Fluxo condicional",
  "Message Flow": "Fluxo de mensagem",
  Association: "Associação",
  Search: "Pesquisar",
  "No results found": "Nenhum resultado",
  "Parallel Multi Instance": "Múltiplas instâncias paralelas",
  "Sequential Multi Instance": "Múltiplas instâncias sequenciais",
  Loop: "Repetição",
  "Ad-hoc": "Ad hoc",
};
function translate(template: string, replacements: Record<string, string> = {}) {
  return (
    translations[template] ||
    Object.entries(translations).find(
      ([key]) => key.toLowerCase() === template.toLowerCase(),
    )?.[1] ||
    template
  ).replace(/\{([^}]+)\}/g, (_, key) => replacements[key] || `{${key}}`);
}
export const bpmnEngineModules = [
  {
    __init__: ["preserveDiagramGeometry", "annotationRenderer", "laneRenderer"],
    annotationRenderer: ["type", AnnotationRenderer],
    laneRenderer: ["type", LaneRenderer],
    preserveDiagramGeometry: ["type", PreserveDiagramGeometry],
    // The upstream compatibility importer moves collapsed subprocess DI to (180,160).
    // Existing BPMN planes must remain untouched; users can explicitly expand a subprocess.
    subprocessCompatibility: ["value", {}],
    translate: ["value", translate],
  },
];
