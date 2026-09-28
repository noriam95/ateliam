import { BpmnModdle } from "bpmn-moddle";

export type LaneBinding = { kind: "area" | "position"; id: string; name: string };
export type BpmnDocument = {
  schemaVersion: 2;
  xml: string;
  processId: string;
  processName: string;
  laneBindings: Record<string, LaneBinding>;
  status: "Rascunho" | "Em revisão" | "Publicado";
  origin: "created" | "imported" | "legacy";
  originalXml?: string;
  originalFilename?: string;
  importedAt?: string;
  codigo?: string;
  legacySource?: string;
};
export const xmlEscape = (value: string) =>
  value.replace(
    /[<>&"']/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]!,
  );
export const normalizedBpmnName = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

export function blankBpmn(name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI" xmlns:dc="http://www.omg.org/spec/DD/20100524/DC" xmlns:di="http://www.omg.org/spec/DD/20100524/DI" id="Definitions_Flow" targetNamespace="https://bfflow.app/bpmn">
  <bpmn:collaboration id="Collaboration_Flow"><bpmn:participant id="Pool_Flow" name="${xmlEscape(name)}" processRef="Process_Flow" /></bpmn:collaboration>
  <bpmn:process id="Process_Flow" name="${xmlEscape(name)}" isExecutable="false"><bpmn:laneSet id="Lanes_Flow"><bpmn:lane id="Lane_Flow" name="A DEFINIR" /></bpmn:laneSet></bpmn:process>
  <bpmndi:BPMNDiagram id="Diagram_Flow"><bpmndi:BPMNPlane id="Plane_Flow" bpmnElement="Collaboration_Flow">
    <bpmndi:BPMNShape id="Pool_Flow_di" bpmnElement="Pool_Flow" isHorizontal="true"><dc:Bounds x="180" y="120" width="1100" height="360" /></bpmndi:BPMNShape>
    <bpmndi:BPMNShape id="Lane_Flow_di" bpmnElement="Lane_Flow" isHorizontal="true"><dc:Bounds x="210" y="120" width="1070" height="360" /></bpmndi:BPMNShape>
  </bpmndi:BPMNPlane></bpmndi:BPMNDiagram>
</bpmn:definitions>`;
}

export type BpmnInspection = {
  name: string;
  lanes: { id: string; name: string }[];
  counts: {
    pools: number;
    lanes: number;
    activities: number;
    events: number;
    gateways: number;
    connections: number;
    annotations: number;
  };
  warnings: string[];
};

/** Parse, never lay out: DI remains the authoritative source of geometry. */
export async function inspectBpmn(xml: string): Promise<BpmnInspection> {
  if (!xml.trim() || xml.length > 12_000_000)
    throw new Error("O arquivo está vazio ou excede o limite de 12 MB.");
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw new Error("Declarações DTD e entidades externas não são aceitas.");
  const moddle = new BpmnModdle();
  let result: any;
  try {
    result = await moddle.fromXML(xml);
  } catch {
    throw new Error("XML inválido. Exporte um arquivo BPMN 2.0 com informações visuais BPMN DI.");
  }
  const definitions = result.rootElement;
  if (definitions?.$type !== "bpmn:Definitions")
    throw new Error("O arquivo não contém definições BPMN 2.0.");
  if (!definitions.diagrams?.some((d: any) => d.plane?.planeElement?.length))
    throw new Error(
      "O arquivo não contém BPMN DI. As posições originais são necessárias para importar sem reorganização.",
    );
  const elements: any[] = Object.values(result.elementsById);
  const is = (e: any, type: string) => e.$instanceOf?.(`bpmn:${type}`);
  const counts = {
    pools: elements.filter((e) => is(e, "Participant")).length,
    lanes: elements.filter((e) => is(e, "Lane")).length,
    activities: elements.filter((e) => is(e, "Activity")).length,
    events: elements.filter((e) => is(e, "Event")).length,
    gateways: elements.filter((e) => is(e, "Gateway")).length,
    connections: elements.filter(
      (e) => is(e, "SequenceFlow") || is(e, "MessageFlow") || is(e, "Association"),
    ).length,
    annotations: elements.filter((e) => is(e, "TextAnnotation")).length,
  };
  const warnings = (result.warnings || []).map((w: any) => `Conteúdo XML: ${w.message}`);
  if (definitions.diagrams.length > 1)
    warnings.push(
      "O arquivo tem mais de um diagrama. Use o seletor de diagramas para conferir todos.",
    );
  if (!elements.some((e) => is(e, "StartEvent")))
    warnings.push("Nenhum evento de início identificado.");
  if (!elements.some((e) => is(e, "EndEvent"))) warnings.push("Nenhum evento de fim identificado.");
  const connected = new Set(
    elements
      .filter((e) => is(e, "SequenceFlow") || is(e, "MessageFlow"))
      .flatMap((e) => [e.sourceRef?.id, e.targetRef?.id])
      .filter(Boolean),
  );
  for (const e of elements) {
    if (is(e, "Activity") && !e.name?.trim()) warnings.push(`Atividade sem nome: ${e.id}.`);
    if (is(e, "FlowNode") && !connected.has(e.id) && !e.incoming?.length && !e.outgoing?.length)
      warnings.push(`Elemento desconectado: ${e.name || e.id}.`);
    if (
      e.$type === "bpmndi:BPMNShape" &&
      (!e.bounds ||
        ![e.bounds.x, e.bounds.y, e.bounds.width, e.bounds.height].every(Number.isFinite))
    )
      throw new Error(`Dimensões inválidas em ${e.id}.`);
    if (
      e.$type === "bpmndi:BPMNEdge" &&
      (!e.waypoint?.length ||
        e.waypoint.some((p: any) => !Number.isFinite(p.x) || !Number.isFinite(p.y)))
    )
      throw new Error(`Trajeto inválido em ${e.id}.`);
  }
  // Unregistered vendor attributes/elements are retained in originalXml, even if a renderer cannot edit them.
  if (
    elements.some(
      (e) =>
        e.extensionElements?.values?.length ||
        Object.keys(e.$attrs || {}).some((key) => key !== "xmlns" && !key.startsWith("xmlns:")),
    )
  )
    warnings.push(
      "Há extensões ou atributos externos. O XML original ficará disponível para download; confira esses recursos antes de usar o XML editado em outro sistema.",
    );
  const mainProcess = elements
    .filter((e) => is(e, "Process"))
    .sort((a, b) => (b.flowElements?.length || 0) - (a.flowElements?.length || 0))[0];
  return {
    name:
      mainProcess?.name ||
      elements.find((e) => is(e, "Participant") && e.processRef?.id === mainProcess?.id)?.name ||
      elements.find((e) => is(e, "Participant"))?.name ||
      "Processo importado",
    lanes: elements
      .filter((e) => is(e, "Lane"))
      .map((e) => ({ id: e.id, name: e.name || "A DEFINIR" })),
    counts,
    warnings: [...new Set<string>(warnings)],
  };
}

export function readBpmnDocument(content: string): BpmnDocument {
  const parsed = JSON.parse(content);
  const data = parsed.bpmn || parsed;
  if (data.schemaVersion === 2 && typeof data.xml === "string") return data;
  if (Array.isArray(data.nodes) && Array.isArray(data.flows)) return legacyBpmn(data);
  throw new Error("O documento não contém um desenho BPMN reconhecido.");
}

/** Compatibility adapter only; the former editor is not retained. */
export function legacyBpmn(data: any): BpmnDocument {
  const nodes = data.nodes || [];
  const lanes = data.lanes?.length ? data.lanes : ["A DEFINIR"];
  const id = (value: string) => `Legacy_${String(value).replace(/[^a-zA-Z0-9_]/g, "_")}`;
  const nodeTypes: Record<string, string> = {
    start: "startEvent",
    end: "endEvent",
    task: "task",
    gateway: "exclusiveGateway",
    annotation: "textAnnotation",
  };
  const bounds = (n: any) => ({
    x: n.x,
    y: n.y,
    width: n.width ?? 140,
    height: n.height ?? 64,
  });
  const flows = data.flows.filter(
    (f: any) => nodes.some((n: any) => n.id === f.from) && nodes.some((n: any) => n.id === f.to),
  );
  let xml = blankBpmn(data.poolName || "Processo").replace(
    "xmlns:di=",
    'xmlns:bioc="http://bpmn.io/schema/bpmn/biocolor/1.0" xmlns:di=',
  );
  const nodeTag = (n: any) =>
    n.type === "task"
      ? (
          {
            user: "userTask",
            manual: "manualTask",
            service: "serviceTask",
            script: "scriptTask",
            "business-rule": "businessRuleTask",
            send: "sendTask",
            receive: "receiveTask",
          } as Record<string, string>
        )[n.taskType] || "task"
      : n.type === "gateway"
        ? (
            {
              parallel: "parallelGateway",
              inclusive: "inclusiveGateway",
              "event-based": "eventBasedGateway",
              complex: "complexGateway",
            } as Record<string, string>
          )[n.gatewayType] || "exclusiveGateway"
        : nodeTypes[n.type] || "task";
  const laneXml = lanes
    .map(
      (name: string, i: number) =>
        `<bpmn:lane id="Legacy_lane_${i}" name="${xmlEscape(name)}">${nodes
          .filter((n: any) => n.lane === i && n.type !== "annotation")
          .map((n: any) => `<bpmn:flowNodeRef>${id(n.id)}</bpmn:flowNodeRef>`)
          .join("")}</bpmn:lane>`,
    )
    .join("");
  const semantic =
    nodes
      .map(
        (n: any) =>
          `<bpmn:${nodeTag(n)} id="${id(n.id)}" ${n.type !== "annotation" ? `name="${xmlEscape(n.label || "")}"` : ""}>${n.type === "annotation" ? `<bpmn:text>${xmlEscape(n.label || "")}</bpmn:text>` : ""}</bpmn:${nodeTag(n)}>`,
      )
      .join("") +
    flows
      .map(
        (f: any) =>
          `<bpmn:${f.type === "association" ? "association" : "sequenceFlow"} id="${id(f.id)}" sourceRef="${id(f.from)}" targetRef="${id(f.to)}" name="${xmlEscape(f.label || "")}" />`,
      )
      .join("");
  xml = xml.replace(
    /<bpmn:laneSet[\s\S]*?<\/bpmn:laneSet>/,
    `<bpmn:laneSet id="Lanes_Flow">${laneXml}</bpmn:laneSet>${semantic}`,
  );
  let y = 80;
  const poolWidth = Math.max(
    data.poolWidth ?? 1080,
    ...nodes.map((n: any) => n.x + (n.width ?? 140) - 80 + 180),
    864,
  );
  const laneDi = lanes
    .map((_: string, i: number) => {
      const height = data.laneHeights?.[i] ?? 170;
      const out = `<bpmndi:BPMNShape id="Legacy_lane_${i}_di" bpmnElement="Legacy_lane_${i}" isHorizontal="true"><dc:Bounds x="142" y="${y}" width="${poolWidth - 62}" height="${height}" /></bpmndi:BPMNShape>`;
      y += height;
      return out;
    })
    .join("");
  const shapes = nodes
    .map((n: any) => {
      const b = bounds(n);
      return `<bpmndi:BPMNShape id="${id(n.id)}_di" bpmnElement="${id(n.id)}" ${n.fillColor || n.color ? `bioc:fill="${xmlEscape(n.fillColor || n.color)}"` : ""} ${n.strokeColor ? `bioc:stroke="${xmlEscape(n.strokeColor)}"` : ""}><dc:Bounds x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" /></bpmndi:BPMNShape>`;
    })
    .join("");
  const edges = flows
    .map((f: any) => {
      const a = bounds(nodes.find((n: any) => n.id === f.from));
      const b = bounds(nodes.find((n: any) => n.id === f.to));
      const points =
        f.points?.length >= 2
          ? f.points
          : [
              { x: a.x + a.width, y: a.y + a.height / 2 },
              { x: b.x, y: b.y + b.height / 2 },
            ];
      return `<bpmndi:BPMNEdge id="${id(f.id)}_di" bpmnElement="${id(f.id)}">${points.map((p: any) => `<di:waypoint x="${p.x}" y="${p.y}" />`).join("")}</bpmndi:BPMNEdge>`;
    })
    .join("");
  xml = xml
    .replace(
      /<bpmndi:BPMNShape id="Lane_Flow_di"[\s\S]*?<\/bpmndi:BPMNShape>/,
      laneDi + shapes + edges,
    )
    .replace(
      'x="180" y="120" width="1100" height="360"',
      `x="80" y="80" width="${poolWidth}" height="${Math.max(y - 80, 260)}"`,
    );
  return {
    schemaVersion: 2,
    xml,
    processId: data.processId || "",
    processName: data.poolName || "Processo",
    laneBindings: {},
    status: "Rascunho",
    origin: "legacy",
    codigo: data.codigo || undefined,
    legacySource: JSON.stringify(data),
  };
}

/** Only explicitly associated lane names change; source XML remains separately retained. */
export async function applyBpmnLaneNames(xml: string, bindings: Record<string, LaneBinding>) {
  if (!Object.keys(bindings).length) return xml;
  const moddle = new BpmnModdle();
  const parsed = await moddle.fromXML(xml);
  let changed = false;
  for (const [id, binding] of Object.entries(bindings)) {
    const lane = parsed.elementsById[id];
    if (lane?.$type === "bpmn:Lane" && lane.name !== binding.name) {
      lane.name = binding.name;
      changed = true;
    }
  }
  return changed ? (await moddle.toXML(parsed.rootElement, { format: true })).xml : xml;
}
