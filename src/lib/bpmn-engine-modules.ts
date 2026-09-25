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
    __init__: ["preserveDiagramGeometry"],
    preserveDiagramGeometry: ["type", PreserveDiagramGeometry],
    // The upstream compatibility importer moves collapsed subprocess DI to (180,160).
    // Existing BPMN planes must remain untouched; users can explicitly expand a subprocess.
    subprocessCompatibility: ["value", {}],
    translate: ["value", translate],
  },
];
