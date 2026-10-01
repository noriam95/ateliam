export const BPMN_DEFAULT_COLORS = {
  activity: { fill: "#EEF4FA", stroke: "#2563A6" },
  startEvent: { fill: "#EDF7ED", stroke: "#4E8A48" },
  endEvent: { fill: "#FBEDEE", stroke: "#B64C57" },
  gateway: { fill: "#FFF5DE", stroke: "#B8862D" },
  connector: { stroke: "#343A40" },
  lane: { fill: "#FFFFFF", stroke: "#606770" },
} as const;

export type BpmnElementColors = { fill?: string; stroke?: string };

export function defaultBpmnColors(type: string): BpmnElementColors {
  if (type.endsWith("Task") || type === "bpmn:SubProcess") return BPMN_DEFAULT_COLORS.activity;
  if (type === "bpmn:StartEvent") return BPMN_DEFAULT_COLORS.startEvent;
  if (type === "bpmn:EndEvent") return BPMN_DEFAULT_COLORS.endEvent;
  if (type.endsWith("Gateway")) return BPMN_DEFAULT_COLORS.gateway;
  if (type === "bpmn:Participant" || type === "bpmn:Lane") return BPMN_DEFAULT_COLORS.lane;
  if (type.endsWith("Flow") || type === "bpmn:Association") {
    return BPMN_DEFAULT_COLORS.connector;
  }
  return {};
}
