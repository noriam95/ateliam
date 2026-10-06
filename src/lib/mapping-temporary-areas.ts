import type { MappingDocumentImport, MappingImportSubstep } from "./docx-mapping-import";
import type { LaneBinding, TemporaryBpmnArea } from "./bpmn-document";

export type TemporaryMappingArea = {
  id: string;
  name: string;
  sigla: string;
  status: "temporary";
};

export function normalizeAreaName(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleUpperCase("pt-BR");
}

function areaLetters(value: string) {
  return normalizeAreaName(value).replace(/[^A-Z]/g, "");
}

export function suggestAreaSigla(name: string, used: Iterable<string>) {
  const taken = new Set(Array.from(used, (value) => value.toUpperCase()));
  const words = normalizeAreaName(name).split(" ").filter(Boolean);
  const letters = areaLetters(name);
  const padded = `${letters}XXX`;
  const candidates = [
    padded.slice(0, 3),
    `${words.map((word) => word[0]).join("")}XXX`.slice(0, 3),
    `${padded.slice(0, 2)}${padded.at(-1)}`,
    `${padded[0]}${padded.slice(-2)}`,
  ];
  for (const candidate of candidates) {
    if (/^[A-Z]{3}$/.test(candidate) && !taken.has(candidate)) return candidate;
  }
  for (let code = 65; code <= 90; code += 1) {
    const candidate = `${padded.slice(0, 2)}${String.fromCharCode(code)}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Não foi possível gerar uma sigla exclusiva para a área ${name}.`);
}

function collectSubstepAreas(substep: MappingImportSubstep, names: Set<string>) {
  if (substep.actorType === "area" && substep.actorName.trim()) names.add(substep.actorName.trim());
  substep.activities.forEach((activity) => collectSubstepAreas(activity, names));
}

export function mappingAreaNamesFromImport(importResult: MappingDocumentImport) {
  const names = new Set<string>();
  importResult.steps.forEach((step) => {
    if (step.area.trim()) names.add(step.area.trim());
    step.substeps.forEach((substep) => collectSubstepAreas(substep, names));
  });
  return Array.from(names).filter((name, index, all) => {
    const normalized = normalizeAreaName(name);
    return normalized && all.findIndex((item) => normalizeAreaName(item) === normalized) === index;
  });
}

export function inferPrimaryMappingArea(
  explicitArea: string | null | undefined,
  processArea: string | null | undefined,
  suggestedAreas: Array<Pick<TemporaryMappingArea, "name">>,
) {
  return (
    explicitArea?.trim() ||
    processArea?.trim() ||
    suggestedAreas
      .find((area) => {
        const normalized = normalizeAreaName(area.name);
        return normalized && normalized !== "A DEFINIR";
      })
      ?.name.trim() ||
    ""
  );
}

export function prepareBpmnTemporaryAreas(
  lanes: Array<{ id: string; name: string }>,
  registeredAreas: Array<{ id: string; name: string; sigla?: string | null }>,
  createId: () => string = () => crypto.randomUUID(),
) {
  const knownAreas = new Map(registeredAreas.map((area) => [normalizeAreaName(area.name), area]));
  const usedSiglas = new Set(registeredAreas.map((area) => area.sigla).filter(Boolean) as string[]);
  const suggestedByName = new Map<string, TemporaryBpmnArea>();
  const bindings: Record<string, LaneBinding> = {};
  lanes.forEach((lane) => {
    const normalized = normalizeAreaName(lane.name);
    if (!normalized || normalized === "A DEFINIR") return;
    const known = knownAreas.get(normalized);
    if (known) {
      bindings[lane.id] = { kind: "area", id: known.id, name: known.name };
      return;
    }
    let suggested = suggestedByName.get(normalized);
    if (!suggested) {
      const sigla = suggestAreaSigla(lane.name, usedSiglas);
      usedSiglas.add(sigla);
      suggested = {
        id: `temporary-area:${createId()}`,
        name: lane.name.trim(),
        sigla,
        status: "temporary",
      };
      suggestedByName.set(normalized, suggested);
    }
    bindings[lane.id] = { kind: "area", id: suggested.id, name: suggested.name };
  });
  return { areas: Array.from(suggestedByName.values()), bindings };
}
