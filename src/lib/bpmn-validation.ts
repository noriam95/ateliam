/** Structural BPMN checks; diagnostics never rearrange or delete the user's diagram. */
export function validateBpmnRules(elements: any[]): string[] {
  const is = (e: any, type: string) => Boolean(e?.$instanceOf?.(`bpmn:${type}`));
  const flows = elements.filter((e) => is(e, "SequenceFlow"));
  const warnings: string[] = [];
  const report = (e: any, text: string) => warnings.push(`${e.name || e.id} [${e.id}]: ${text}`);
  for (const flow of flows) {
    if (!is(flow.sourceRef, "FlowNode") || !is(flow.targetRef, "FlowNode"))
      report(flow, "fluxo de sequência sem origem ou destino válido.");
    else if (flow.sourceRef.$parent !== flow.targetRef.$parent)
      report(
        flow,
        "fluxos de sequência não podem atravessar piscinas ou limites de subprocessos. Use fluxo de mensagem entre participantes.",
      );
    if (flow.conditionExpression && is(flow.sourceRef, "ParallelGateway"))
      report(flow, "gateway paralelo não admite condição nos fluxos de saída.");
  }
  const container = (node: any): any => {
    while (node && !is(node, "Process") && !is(node, "Participant")) node = node.$parent;
    return is(node, "Participant") ? node.processRef || node : node;
  };
  for (const flow of elements.filter((e) => is(e, "MessageFlow"))) {
    const from = container(flow.sourceRef),
      to = container(flow.targetRef);
    if (!from || !to) report(flow, "fluxo de mensagem sem origem ou destino válido.");
    else if (from === to) report(flow, "fluxo de mensagem deve ligar participantes diferentes.");
  }
  for (const node of elements.filter((e) => is(e, "FlowNode"))) {
    const incoming = flows.filter((e) => e.targetRef === node);
    const outgoing = flows.filter((e) => e.sourceRef === node);
    if (is(node, "StartEvent")) {
      if (incoming.length) report(node, "evento de início não pode receber fluxo de sequência.");
      if (!outgoing.length) report(node, "evento de início sem fluxo de saída.");
    } else if (is(node, "EndEvent")) {
      if (outgoing.length) report(node, "evento de fim não pode ter fluxo de saída.");
      if (!incoming.length) report(node, "evento de fim sem fluxo de entrada.");
    } else if (is(node, "BoundaryEvent")) {
      if (!is(node.attachedToRef, "Activity"))
        report(node, "evento de borda deve estar anexado a uma atividade.");
      if (incoming.length) report(node, "evento de borda não pode receber fluxo de sequência.");
      if (!outgoing.length) report(node, "evento de borda sem fluxo de saída.");
    } else if (!(is(node, "SubProcess") && node.triggeredByEvent)) {
      // Ad-hoc subprocesses explicitly permit activities without sequence flows.
      if (!is(node.$parent, "AdHocSubProcess")) {
        if (!incoming.length) report(node, "elemento sem fluxo de entrada.");
        if (!outgoing.length) report(node, "elemento sem fluxo de saída.");
      }
    }
    if (is(node, "SubProcess") && node.triggeredByEvent && (incoming.length || outgoing.length))
      report(node, "subprocesso de evento não pode receber ou emitir fluxos de sequência.");
    if (is(node, "Gateway") && incoming.length + outgoing.length < 3)
      report(node, "gateway deve dividir ou reunir pelo menos dois caminhos.");
    if (is(node, "EventBasedGateway")) {
      if (outgoing.length < 2)
        report(node, "gateway baseado em eventos precisa de pelo menos duas saídas.");
      for (const flow of outgoing) {
        if (!is(flow.targetRef, "IntermediateCatchEvent") && !is(flow.targetRef, "ReceiveTask"))
          report(
            flow,
            "saída de gateway baseado em eventos deve levar a evento de captura ou tarefa de recebimento.",
          );
        if (flow.conditionExpression)
          report(flow, "gateway baseado em eventos não admite condições nos fluxos de saída.");
      }
    }
    if (node.default && !outgoing.includes(node.default))
      report(node, "fluxo padrão não pertence às saídas deste elemento.");
  }
  for (const process of elements.filter((e) => is(e, "Process"))) {
    const nodes = (process.flowElements || []).filter((e: any) => is(e, "FlowNode"));
    if (!nodes.length) continue; // A black-box participant has no internal process to validate.
    if (!nodes.some((e: any) => is(e, "StartEvent")))
      report(process, "recomendação: identificar o início do processo com um evento de início.");
    if (!nodes.some((e: any) => is(e, "EndEvent")))
      report(process, "recomendação: identificar o término do processo com um evento de fim.");
  }
  return warnings;
}
