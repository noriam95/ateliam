export const MODULE_OPTIONS = [
  { id: "tasks", label: "Minhas tarefas" },
  { id: "ddp", label: "Mapeamento" },
  { id: "improvements", label: "Oportunidades de melhoria" },
  { id: "pop", label: "Documentação" },
  { id: "bpmn", label: "Fluxograma" },
  { id: "registrations", label: "Cadastros" },
  { id: "value-chain", label: "Cadeia de Valor" },
] as const;
export const MODULE_IDS = MODULE_OPTIONS.map((option) => option.id);
export type VisibleModule = (typeof MODULE_OPTIONS)[number]["id"];
export function visibleModulesFor(
  profile?: { visible_modules?: string[] | null } | null,
  admin = false,
): string[] {
  return admin ? [...MODULE_IDS] : (profile?.visible_modules ?? [...MODULE_IDS]);
}
