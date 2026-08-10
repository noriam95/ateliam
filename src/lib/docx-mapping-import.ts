import JSZip from "jszip";
import { inferExplicitActivityArea } from "@/lib/mapping-actor-inference";

export type MappingImportImage = { name: string; src: string };
export type MappingImportSystem = { name: string; description: string; modality: string };
export type MappingImportSipoc = {
  suppliers: string;
  inputs: string;
  process: string;
  outputs: string;
  customers: string;
};
export type MappingImportSubstep = {
  title: string;
  description: string;
  kind: "activity" | "subprocess";
  executionType: string;
  actorType: "" | "area" | "position";
  actorName: string;
  systemNames: string[];
  images: MappingImportImage[];
  activities: MappingImportSubstep[];
};
export type MappingImportStep = {
  title: string;
  area: string;
  responsible: string;
  input: string;
  activity: string;
  output: string;
  system: string;
  risk: string;
  notes: string;
  images: MappingImportImage[];
  substeps: MappingImportSubstep[];
};
export type MappingImportGap = {
  cause: string;
  description: string;
  impact: string;
  action: string;
  responsible: string;
  deadline: string;
  priority: string;
  status: string;
};

export type MappingDocumentImport = {
  fileName: string;
  title: string;
  modality: "AS IS" | "TO BE" | null;
  date: string;
  author: string;
  reviewer: string;
  objective: string;
  scope: string;
  context: string;
  systems: MappingImportSystem[];
  sipoc: MappingImportSipoc[];
  steps: MappingImportStep[];
  macroImages: MappingImportImage[];
  gaps: MappingImportGap[];
  nextSteps: Array<{ text: string; responsible: string; deadline: string }>;
  glossary: Array<{ term: string; definition: string }>;
  warnings: string[];
  stats: {
    sections: number;
    systems: number;
    sipocRows: number;
    steps: number;
    substeps: number;
    gaps: number;
    images: number;
  };
};

type Paragraph = { text: string; imageIds: string[] };
type Entry = { kind: "paragraph"; value: Paragraph } | { kind: "table"; value: string[][] };
type MappingSection =
  | "metadata"
  | "overview"
  | "systems"
  | "sipoc"
  | "steps"
  | "quantitative"
  | "gaps"
  | "nextSteps"
  | "glossary"
  | null;

const XML_MIME = "application/xml";

function xmlDocument(xml: string) {
  const parsed = new DOMParser().parseFromString(xml, XML_MIME);
  if (parsed.querySelector("parsererror"))
    throw new Error("O DOCX possui estrutura interna inválida.");
  return parsed;
}

function descendants(node: Element, name: string) {
  return Array.from(node.getElementsByTagNameNS("*", name));
}

function relationshipAttribute(node: Element, name: string) {
  return (
    node.getAttribute(name) ||
    node.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      name,
    ) ||
    ""
  );
}

function entriesFromXml(xml: string): Entry[] {
  const parsed = xmlDocument(xml);
  const body = descendants(parsed.documentElement, "body")[0];
  if (!body) return [];
  return Array.from(body.children).flatMap((child): Entry[] => {
    if (child.localName === "p") {
      return [
        {
          kind: "paragraph",
          value: {
            text: descendants(child, "t")
              .map((node) => node.textContent || "")
              .join("")
              .replace(/\u00a0/g, " ")
              .trim(),
            imageIds: descendants(child, "blip")
              .map((node) => relationshipAttribute(node, "embed"))
              .filter(Boolean),
          },
        },
      ];
    }
    if (child.localName === "tbl") {
      return [
        {
          kind: "table",
          value: descendants(child, "tr").map((row) =>
            descendants(row, "tc").map((cell) =>
              descendants(cell, "t")
                .map((node) => node.textContent || "")
                .join(" ")
                .replace(/\s+/g, " ")
                .trim(),
            ),
          ),
        },
      ];
    }
    return [];
  });
}

function repairMojibake(value: string) {
  return value
    .replace(/Ã‡/g, "Ç")
    .replace(/Ã§/g, "ç")
    .replace(/Ãƒ/g, "Ã")
    .replace(/Ã¡|Ã |Ã¢|Ã£|Ã¤/g, "a")
    .replace(/Ã‰|ÃŠ|Ãˆ|Ã‹/g, "E")
    .replace(/Ã©|Ãª|Ã¨|Ã«/g, "e")
    .replace(/Ã|ÃŽ|ÃŒ|Ã/g, "I")
    .replace(/Ã­|Ã®|Ã¬|Ã¯/g, "i")
    .replace(/Ã“|Ã”|Ã•|Ã’|Ã–/g, "O")
    .replace(/Ã³|Ã´|Ãµ|Ã²|Ã¶/g, "o")
    .replace(/Ãš|Ã›|Ã™|Ãœ/g, "U")
    .replace(/Ãº|Ã»|Ã¹|Ã¼/g, "u")
    .replace(/Ã‘/g, "N")
    .replace(/Ã±/g, "n")
    .replace(/Ã§Ã£o/g, "ção")
    .replace(/Ã‡ÃƒO/g, "ÇÃO")
    .replace(/Ã£/g, "a")
    .replace(/Ãµ/g, "o")
    .replace(/Ãª/g, "e")
    .replace(/Ã­/g, "i")
    .replace(/Ã¡/g, "a")
    .replace(/Ã©/g, "e")
    .replace(/Ã³/g, "o")
    .replace(/Ãº/g, "u");
}

function normalized(value: string) {
  return repairMojibake(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function isPlaceholderCatalogName(value?: string | null) {
  const key = normalized(value ?? "");
  return (
    !key ||
    key === "a definir" ||
    key === "indefinido" ||
    key === "nao definido" ||
    key === "nao informado" ||
    key === "nenhum" ||
    key === "n a"
  );
}

function append(current: string, next: string) {
  const value = next.trim();
  if (!value) return current;
  if (!current) return value;
  const currentKey = normalized(current);
  const valueKey = normalized(value);
  if (currentKey === valueKey || currentKey.includes(valueKey)) return current;
  if (valueKey.includes(currentKey)) return value;
  return `${current}\n\n${value}`;
}

function listValues(value: string) {
  return value
    .split(/[,;|]/)
    .map((item) => item.trim())
    .filter((item) => !isPlaceholderCatalogName(item));
}

function emptySubstep(
  title: string,
  images: MappingImportImage[] = [],
  kind: MappingImportSubstep["kind"] = "activity",
): MappingImportSubstep {
  return {
    title,
    description: "",
    kind,
    executionType: "",
    actorType: "",
    actorName: "",
    systemNames: [],
    images,
    activities: [],
  };
}

function sanitizeImportResult(result: MappingDocumentImport) {
  const seenSystems = new Set<string>();
  result.systems = result.systems.filter((system) => {
    const key = normalized(system.name);
    if (isPlaceholderCatalogName(system.name) || seenSystems.has(key)) return false;
    seenSystems.add(key);
    return true;
  });

  const cleanSubstep = (substep: MappingImportSubstep) => {
    const seenNames = new Set<string>();
    substep.systemNames = substep.systemNames.filter((name) => {
      const key = normalized(name);
      if (isPlaceholderCatalogName(name) || seenNames.has(key)) return false;
      seenNames.add(key);
      return true;
    });
    substep.activities.forEach(cleanSubstep);
  };

  result.steps.forEach((step) => {
    if (isPlaceholderCatalogName(step.system)) step.system = "";
    step.substeps.forEach(cleanSubstep);
  });
}

function mime(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "webp") return "image/webp";
  if (extension === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function toDataUrl(bytes: Uint8Array, contentType: string) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function relationshipImages(zip: JSZip) {
  const relationFile = zip.file("word/_rels/document.xml.rels");
  const result = new Map<string, MappingImportImage>();
  if (!relationFile) return result;
  const parsed = xmlDocument(await relationFile.async("text"));
  await Promise.all(
    descendants(parsed.documentElement, "Relationship").map(async (relation) => {
      const id = relation.getAttribute("Id") || "";
      const target = relation.getAttribute("Target") || "";
      if (!id || !target.includes("media/")) return;
      const clean = target.replace(/^\.\.\//, "").replace(/^\//, "");
      const path = clean.startsWith("word/") ? clean : `word/${clean}`;
      const file = zip.file(path);
      if (!file) return;
      const name = path.split("/").pop() || "imagem";
      result.set(id, { name, src: toDataUrl(await file.async("uint8array"), mime(name)) });
    }),
  );
  return result;
}

function emptyImport(fileName: string): MappingDocumentImport {
  return {
    fileName,
    title: "",
    modality: null,
    date: "",
    author: "",
    reviewer: "",
    objective: "",
    scope: "",
    context: "",
    systems: [],
    sipoc: [],
    steps: [],
    macroImages: [],
    gaps: [],
    nextSteps: [],
    glossary: [],
    warnings: [],
    stats: { sections: 0, systems: 0, sipocRows: 0, steps: 0, substeps: 0, gaps: 0, images: 0 },
  };
}

function detectSection(value: string): MappingSection {
  const text = normalized(value)
    .replace(/^\d{1,2}\s+/, "")
    .replace(/^\d{1,2}\s*(?:[-.:])\s*/, "");
  if (/^(dados do mapeamento|identificacao|informacoes do mapeamento)$/.test(text))
    return "metadata";
  if (/^(visao geral|objetivo escopo e contexto)$/.test(text)) return "overview";
  if (
    /^(sistemas documentos envolvidos|sistemas documentos|sistemas envolvidos|documentos envolvidos)$/.test(
      text,
    )
  )
    return "systems";
  if (/^(analise )?sipoc( do processo)?$/.test(text)) return "sipoc";
  if (/^(etapas do processo|fluxo as is|fluxo to be)$/.test(text)) return "steps";
  if (/^visao quantitativa$/.test(text)) return "quantitative";
  if (
    /^(oportunidades?(?: de melhoria)?|melhorias?|pontos? de melhoria|gaps?(?: e causas? raiz)?|causas? raiz(?: e planos? de acao)?|causas? e oportunidades?)$/.test(
      text,
    )
  )
    return "gaps";
  if (/^proximos passos$/.test(text)) return "nextSteps";
  if (/^glossario$/.test(text)) return "glossary";
  return null;
}

function cellsFromLine(line: string) {
  return line.split(/[|\t]/).map((cell) => cell.trim());
}

function labelValue(line: string) {
  const match = line.match(/^([^:]{2,45}):\s*(.*)$/);
  return match ? { label: normalized(match[1]), value: match[2].trim() } : null;
}

function emptySipocRow(): MappingImportSipoc {
  return { suppliers: "", inputs: "", process: "", outputs: "", customers: "" };
}

function mapSipocFieldLabel(label: string): keyof MappingImportSipoc | null {
  if (label === "fornecedor" || label === "fornecedores") return "suppliers";
  if (label === "entrada" || label === "entradas" || label === "insumo" || label === "insumos")
    return "inputs";
  if (label === "processo" || label === "atividades do processo") return "process";
  if (label === "saida" || label === "saidas" || label === "produto" || label === "produtos")
    return "outputs";
  if (label === "cliente" || label === "clientes") return "customers";
  return null;
}

function isSipocHeaderLine(line: string) {
  const value = normalized(line);
  return (
    value.includes("fornecedor") &&
    value.includes("entrada") &&
    value.includes("processo") &&
    value.includes("saida") &&
    value.includes("cliente")
  );
}

function isSipocRowComplete(row: MappingImportSipoc | null) {
  return Boolean(row?.suppliers && row.inputs && row.process && row.outputs && row.customers);
}

function isGapTitleLabel(label: string) {
  return [
    "gap",
    "causa",
    "causa raiz",
    "oportunidade",
    "oportunidade de melhoria",
    "melhoria",
    "ponto de melhoria",
  ].includes(label);
}

function mapGapFieldLabel(
  label: string,
): "description" | "impact" | "action" | "responsible" | "deadline" | "priority" | "status" | null {
  if (
    [
      "descricao",
      "descricao e causa raiz",
      "detalhamento",
      "problema",
      "situacao atual",
      "cenario atual",
    ].includes(label)
  )
    return "description";
  if (["impacto", "efeito", "efeitos", "impacto esperado"].includes(label)) return "impact";
  if (
    [
      "acao",
      "acao proposta",
      "plano de acao",
      "como implementar",
      "recomendacao",
      "encaminhamento",
    ].includes(label)
  )
    return "action";
  if (label === "responsavel") return "responsible";
  if (label === "prazo" || label === "data") return "deadline";
  if (label === "prioridade") return "priority";
  if (label === "status" || label === "situacao") return "status";
  return null;
}

function paragraphLines(entries: Entry[]) {
  return entries
    .filter((entry): entry is Extract<Entry, { kind: "paragraph" }> => entry.kind === "paragraph")
    .map((entry) => entry.value.text.trim())
    .filter(Boolean);
}

function cleanImportedTitle(value: string) {
  return value
    .replace(/^\s*(?:etapa|processo|subprocesso|atividade|subetapa)\s+/i, "")
    .replace(/^\s*\d+(?:\.\d+){0,3}\s*[-\u2013\u2014.:)]\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function findExistingStep(result: MappingDocumentImport, title: string) {
  const key = normalized(title);
  return result.steps.find((step) => normalized(step.title) === key) ?? null;
}

function collectFollowingText(lines: string[], startIndex: number) {
  const chunks: string[] = [];
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (detectSection(line)) break;
    if (
      /^(?:etapa|processo|subprocesso|atividade|subetapa)?\s*\d+(?:\.\d+){0,3}\s*[-\u2013\u2014.:)]\s+/i.test(
        line,
      )
    )
      break;
    if (labelValue(line)) break;
    chunks.push(line);
  }
  return chunks.join("\n\n").trim();
}

function inferExecutionType(text: string) {
  const value = normalized(text);
  if (/automatic/.test(value) && !/manual/.test(value)) return "Automática";
  if (/manual/.test(value) && /sistema/.test(value)) return "Manual no sistema";
  if (/manual/.test(value) && /(fora do sistema|planilha|email|e mail|papel)/.test(value))
    return "Manual fora do sistema";
  if (/(hibrid|manual.*automatic|automatic.*manual)/.test(value))
    return "Híbrida (manual/automática)";
  return "";
}

function looseSectionRange(lines: string[], sectionNames: MappingSection[]) {
  const start = lines.findIndex((line) => {
    const detected = detectSection(line);
    return detected ? sectionNames.includes(detected) : false;
  });
  if (start < 0) return lines;
  const end = lines.findIndex((line, index) => index > start && Boolean(detectSection(line)));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

function inferLooseOverview(result: MappingDocumentImport, lines: string[]) {
  let current: "objective" | "scope" | "context" | null = null;
  const sourceLines = lines.some((line) => detectSection(line) === "overview")
    ? looseSectionRange(lines, ["overview"])
    : lines;
  for (const line of sourceLines) {
    if (detectSection(line)) continue;
    const labeled = labelValue(line);
    const label = labeled?.label ?? normalized(line.replace(/:$/, ""));
    const value = labeled?.value ?? "";
    if (label === "objetivo" || label === "finalidade") {
      current = "objective";
      if (value && !result.objective) result.objective = value;
      continue;
    }
    if (label === "escopo" || label === "abrangencia") {
      current = "scope";
      if (value && !result.scope) result.scope = value;
      continue;
    }
    if (label === "contexto" || label === "cenario" || label === "indicadores") {
      current = "context";
      if (value && !result.context) result.context = value;
      continue;
    }
    if (current) result[current] = append(result[current], line);
  }
}

function inferLooseSystems(result: MappingDocumentImport, lines: string[]) {
  const known = new Set(result.systems.map((system) => normalized(system.name)));
  const sourceLines = lines.some((line) => detectSection(line) === "systems")
    ? looseSectionRange(lines, ["systems"])
    : lines;
  sourceLines.forEach((line) => {
    const labeled = labelValue(line);
    const label = labeled?.label ?? "";
    if (
      ![
        "sistema",
        "sistemas",
        "documento",
        "documentos",
        "sistema documento",
        "sistema/documento",
        "recurso",
        "recursos",
      ].includes(label)
    )
      return;
    listValues(labeled?.value ?? "").forEach((name) => {
      const key = normalized(name);
      if (!key || known.has(key)) return;
      result.systems.push({
        name,
        description: "",
        modality: label.includes("document") ? "Documentos e comunicações" : "",
      });
      known.add(key);
    });
  });
}

function inferLooseSteps(result: MappingDocumentImport, lines: string[]) {
  let currentStep: MappingImportStep | null = result.steps.at(-1) ?? null;
  let currentSubprocess: MappingImportSubstep | null = null;
  const range = looseSectionRange(lines, ["steps"]);

  range.forEach((line, index) => {
    const trimmed = line.trim();
    const nested = trimmed.match(
      /^(?:(?:atividade)\s*)?(\d+)\.(\d+)\.(\d+)\s*[-\u2013\u2014.:)]\s*(.+)$/i,
    );
    const secondLevel = trimmed.match(
      /^(?:(subprocesso|subetapa|atividade)\s*)?(\d+)\.(\d+)\s*[-\u2013\u2014.:)]\s*(.+)$/i,
    );
    const firstLevel = trimmed.match(
      /^(?:(?:etapa|processo)\s*)?(\d{1,2})\s*[-\u2013\u2014.:)]\s*(.+)$/i,
    );
    const labeled = labelValue(trimmed);
    const label = labeled?.label ?? "";

    if (firstLevel) {
      const title = cleanImportedTitle(firstLevel[2]);
      currentStep =
        findExistingStep(result, title) ??
        ({
          title,
          area: "",
          responsible: "",
          input: "",
          activity: collectFollowingText(range, index),
          output: "",
          system: "",
          risk: "",
          notes: "",
          images: [],
          substeps: [],
        } satisfies MappingImportStep);
      if (!findExistingStep(result, title)) result.steps.push(currentStep);
      currentSubprocess = null;
      return;
    }

    if (secondLevel) {
      if (!currentStep) return;
      const title = cleanImportedTitle(secondLevel[4]);
      const explicitKind = normalized(secondLevel[1] ?? "");
      const inferredKind =
        explicitKind === "subprocesso" ||
        (!explicitKind && /^(processo|subprocesso|etapa)\b/i.test(secondLevel[4]))
          ? "subprocess"
          : "activity";
      const substep = {
        ...emptySubstep(title, [], inferredKind),
        description: collectFollowingText(range, index),
        executionType: inferExecutionType(trimmed),
      };
      if (!substep.actorName) {
        substep.actorType = "area";
        substep.actorName = inferExplicitActivityArea(`${title}\n${substep.description}`);
      }
      currentStep.substeps.push(substep);
      currentSubprocess = substep.kind === "subprocess" ? substep : null;
      return;
    }

    if (nested) {
      if (!currentStep) return;
      if (!currentSubprocess) {
        currentSubprocess = emptySubstep("Subprocesso", [], "subprocess");
        currentStep.substeps.push(currentSubprocess);
      }
      const activity = {
        ...emptySubstep(cleanImportedTitle(nested[4])),
        description: collectFollowingText(range, index),
        executionType: inferExecutionType(trimmed),
      };
      activity.actorType = "area";
      activity.actorName = inferExplicitActivityArea(`${activity.title}\n${activity.description}`);
      currentSubprocess.activities.push(activity);
      return;
    }

    if (
      currentSubprocess &&
      (label === "atividade" || label === "titulo da atividade" || label === "subetapa")
    ) {
      const activity = {
        ...emptySubstep(labeled?.value ?? ""),
        description: "",
        executionType: "",
      };
      currentSubprocess.activities.push(activity);
      return;
    }

    if (currentStep && !labeled && !detectSection(trimmed)) {
      if (currentSubprocess)
        currentSubprocess.description = append(currentSubprocess.description, trimmed);
      else currentStep.activity = append(currentStep.activity, trimmed);
    }
  });
}

function inferLooseMapping(
  result: MappingDocumentImport,
  entries: Entry[],
  seenSections: Set<MappingSection>,
) {
  const lines = paragraphLines(entries);
  if (!lines.length) return;
  if (!seenSections.has("overview") || !result.objective || !result.scope || !result.context)
    inferLooseOverview(result, lines);
  if (seenSections.has("systems")) inferLooseSystems(result, lines);
  if (!result.steps.length || seenSections.size < 2) inferLooseSteps(result, lines);
}

function headerIndex(headers: string[], fragments: string[]) {
  return headers.findIndex((header) => fragments.some((fragment) => header.includes(fragment)));
}

function applyMetadataField(result: MappingDocumentImport, rawLabel: string, value: string) {
  const label = normalized(rawLabel);
  if (label === "titulo" || label === "titulo do mapeamento") result.title = value;
  else if (label === "modalidade")
    result.modality = /to be/i.test(value) ? "TO BE" : /as is/i.test(value) ? "AS IS" : null;
  else if (label === "data") result.date = value;
  else if (label === "elaborador") result.author = value;
  else if (label === "revisor") result.reviewer = value;
}

function mapTable(
  result: MappingDocumentImport,
  table: string[][],
  context?: {
    section: MappingSection;
    currentStep: MappingImportStep | null;
    currentGap: MappingImportGap | null;
  },
) {
  const rows = table.filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return false;
  const headers = rows[0].map(normalized);
  const dataRows = rows.slice(1);
  const at = (row: string[], index: number) => (index >= 0 ? row[index]?.trim() || "" : "");

  const metadataField = headerIndex(headers, ["campo"]);
  const metadataValue = headerIndex(headers, ["informacao", "valor"]);
  if (context?.section === "metadata" && metadataField >= 0 && metadataValue >= 0) {
    dataRows.forEach((row) =>
      applyMetadataField(result, at(row, metadataField), at(row, metadataValue)),
    );
    return true;
  }

  const supplier = headerIndex(headers, ["fornecedor"]);
  const inputs = headerIndex(headers, ["entrada"]);
  const process = headerIndex(headers, ["processo"]);
  const outputs = headerIndex(headers, ["saida"]);
  const customers = headerIndex(headers, ["cliente"]);
  if ([supplier, inputs, process, outputs, customers].every((index) => index >= 0)) {
    dataRows.forEach((row) =>
      result.sipoc.push({
        suppliers: at(row, supplier),
        inputs: at(row, inputs),
        process: at(row, process),
        outputs: at(row, outputs),
        customers: at(row, customers),
      }),
    );
    return true;
  }

  const system = headerIndex(headers, ["sistema", "ferramenta", "documento"]);
  const description = headerIndex(headers, ["descricao", "uso no processo"]);
  if (system >= 0 && description >= 0 && headers.length <= 4) {
    const modality = headerIndex(headers, ["classificacao", "modalidade", "tipo"]);
    dataRows.forEach((row) =>
      result.systems.push({
        name: at(row, system),
        description: at(row, description),
        modality: at(row, modality),
      }),
    );
    return true;
  }

  const rowId = headerIndex(headers, ["id", "codigo"]);
  const activityTitle = headerIndex(headers, ["atividade"]);
  const activityDescription = headerIndex(headers, ["descricao"]);
  if (context?.section === "steps" && context.currentStep && rowId >= 0 && activityTitle >= 0) {
    dataRows.forEach((row) => {
      const title = at(row, activityTitle);
      const descriptionValue = at(row, activityDescription);
      if (!title && !descriptionValue) return;
      context.currentStep?.substeps.push({
        ...emptySubstep(title || at(row, rowId)),
        description: descriptionValue,
      });
    });
    return true;
  }

  const gapPriority = headerIndex(headers, ["prioridade"]);
  const gapResponsible = headerIndex(headers, ["responsavel"]);
  const gapDeadline = headerIndex(headers, ["prazo"]);
  const gapStatus = headerIndex(headers, ["status"]);
  if (
    context?.section === "gaps" &&
    context.currentGap &&
    [gapPriority, gapResponsible, gapDeadline, gapStatus].some((index) => index >= 0)
  ) {
    const row = dataRows[0] ?? [];
    context.currentGap.priority = at(row, gapPriority);
    context.currentGap.responsible = at(row, gapResponsible);
    context.currentGap.deadline = at(row, gapDeadline);
    context.currentGap.status = at(row, gapStatus);
    return true;
  }

  const stepTitle = headerIndex(headers, ["etapa", "processo atividade"]);
  const stepResponsible = headerIndex(headers, ["responsavel"]);
  const stepInput = headerIndex(headers, ["entrada"]);
  const stepActivity = headerIndex(headers, ["atividade", "descricao"]);
  const stepOutput = headerIndex(headers, ["saida"]);
  if (stepTitle >= 0 && (stepActivity >= 0 || stepResponsible >= 0)) {
    const stepSystem = headerIndex(headers, ["sistema"]);
    const stepRisk = headerIndex(headers, ["risco"]);
    const stepNotes = headerIndex(headers, ["observacao"]);
    dataRows.forEach((row) =>
      result.steps.push({
        title: at(row, stepTitle),
        responsible: at(row, stepResponsible),
        input: at(row, stepInput),
        activity: at(row, stepActivity),
        output: at(row, stepOutput),
        system: at(row, stepSystem),
        risk: at(row, stepRisk),
        notes: at(row, stepNotes),
        images: [],
        substeps: [],
      }),
    );
    return true;
  }

  const cause = headerIndex(headers, [
    "oportunidade de melhoria",
    "oportunidade",
    "causa raiz",
    "causa",
    "gap",
    "melhoria",
    "ponto de melhoria",
  ]);
  const gapDescription = headerIndex(headers, [
    "descricao",
    "descricao e causa raiz",
    "detalhamento",
    "problema",
    "situacao atual",
  ]);
  const impact = headerIndex(headers, ["impacto"]);
  const action = headerIndex(headers, ["acao proposta", "acao", "plano de acao", "recomendacao"]);
  if (cause >= 0) {
    const responsible = headerIndex(headers, ["responsavel"]);
    const deadline = headerIndex(headers, ["prazo"]);
    const priority = headerIndex(headers, ["prioridade"]);
    const status = headerIndex(headers, ["status", "situacao"]);
    dataRows.forEach((row) => {
      const causeValue = at(row, cause);
      const descriptionValue = at(row, gapDescription);
      const impactValue = at(row, impact);
      const actionValue = at(row, action);
      if (![causeValue, descriptionValue, impactValue, actionValue].some(Boolean)) return;
      result.gaps.push({
        cause: causeValue || descriptionValue.slice(0, 90),
        description: descriptionValue,
        impact: impactValue,
        action: actionValue,
        responsible: at(row, responsible),
        deadline: at(row, deadline),
        priority: at(row, priority),
        status: at(row, status),
      });
    });
    return true;
  }

  const nextAction = headerIndex(headers, ["proximo passo", "acao", "atividade"]);
  const nextResponsible = headerIndex(headers, ["responsavel"]);
  const nextDeadline = headerIndex(headers, ["prazo", "data"]);
  if (nextAction >= 0 && nextResponsible >= 0 && nextDeadline >= 0) {
    dataRows.forEach((row) =>
      result.nextSteps.push({
        text: at(row, nextAction),
        responsible: at(row, nextResponsible),
        deadline: at(row, nextDeadline),
      }),
    );
    return true;
  }

  const term = headerIndex(headers, ["termo"]);
  const definition = headerIndex(headers, ["definicao", "conceito"]);
  if (term >= 0 && definition >= 0) {
    dataRows.forEach((row) =>
      result.glossary.push({ term: at(row, term), definition: at(row, definition) }),
    );
    return true;
  }
  return false;
}

function parseEntries(
  entries: Entry[],
  fileName: string,
  imagesByRelationship = new Map<string, MappingImportImage>(),
) {
  const result = emptyImport(fileName);
  const seenSections = new Set<MappingSection>();
  let section: MappingSection = null;
  let overviewField: "objective" | "scope" | "context" | null = null;
  let currentSystem: MappingImportSystem | null = null;
  let currentStep: MappingImportStep | null = null;
  let currentSubstep: MappingImportSubstep | null = null;
  let currentActivity: MappingImportSubstep | null = null;
  let currentGap: MappingImportGap | null = null;
  let gapField: "description" | "impact" | "action" | null = null;
  let currentSipoc: MappingImportSipoc | null = null;
  let sipocField: keyof MappingImportSipoc | null = null;
  let currentNext: MappingDocumentImport["nextSteps"][number] | null = null;
  let currentGlossary: MappingDocumentImport["glossary"][number] | null = null;

  for (const entry of entries) {
    if (entry.kind === "table") {
      mapTable(result, entry.value, { section, currentStep, currentGap });
      continue;
    }
    const line = entry.value.text.trim();
    const images = entry.value.imageIds.flatMap((imageId) => {
      const image = imagesByRelationship.get(imageId);
      return image ? [image] : [];
    });
    const detectedSection = detectSection(line);
    if (detectedSection) {
      section = detectedSection;
      seenSections.add(section);
      overviewField = null;
      currentSystem = null;
      currentStep = null;
      currentSubstep = null;
      currentActivity = null;
      currentGap = null;
      gapField = null;
      currentSipoc = null;
      sipocField = null;
      currentNext = null;
      currentGlossary = null;
      continue;
    }
    if (!line && !images.length) continue;

    const labeled = labelValue(line);
    const label = labeled?.label || "";
    const value = labeled?.value || "";
    if (section === "metadata" || !section) {
      const cells = cellsFromLine(line);
      if (cells.length >= 2 && normalized(cells[0]) !== "campo")
        applyMetadataField(result, cells[0], cells.slice(1).join(" | "));
      else if (labeled) applyMetadataField(result, labeled.label, value);
      continue;
    }
    if (section === "overview") {
      const heading = normalized(line);
      if (heading === "objetivo") {
        overviewField = "objective";
      } else if (heading === "escopo" || heading === "abrangencia") {
        overviewField = "scope";
      } else if (heading === "contexto" || heading === "indicadores") {
        overviewField = "context";
      } else if (label === "objetivo") {
        result.objective = value;
        overviewField = "objective";
      } else if (label === "escopo" || label === "abrangencia") {
        result.scope = value;
        overviewField = "scope";
      } else if (label === "contexto" || label === "indicadores") {
        result.context = value;
        overviewField = "context";
      } else if (overviewField) result[overviewField] = append(result[overviewField], line);
      continue;
    }
    if (section === "systems") {
      const cells = cellsFromLine(line);
      if (
        cells.length >= 2 &&
        !["sistema", "sistema ou controle", "ferramenta"].includes(normalized(cells[0]))
      ) {
        result.systems.push({
          name: cells[0],
          description: cells.slice(1).join(" | "),
          modality: "",
        });
        currentSystem = result.systems.at(-1) ?? null;
      } else if (
        label === "sistema" ||
        label === "sistema documento" ||
        label === "sistema/documento" ||
        label === "ferramenta" ||
        label === "documento"
      ) {
        currentSystem = {
          name: value,
          description: "",
          modality: label === "documento" ? "Documentos e comunicações" : "",
        };
        result.systems.push(currentSystem);
      } else if (label === "classificacao" || label === "modalidade" || label === "tipo") {
        if (currentSystem) currentSystem.modality = value;
      } else if (label.includes("descricao") || label.includes("uso no processo")) {
        if (!currentSystem) {
          currentSystem = { name: "", description: "", modality: "" };
          result.systems.push(currentSystem);
        }
        currentSystem.description = value;
      } else if (currentSystem) currentSystem.description = append(currentSystem.description, line);
      continue;
    }
    if (section === "sipoc") {
      const cells = cellsFromLine(line);
      if (isSipocHeaderLine(line)) continue;
      if (cells.length >= 5 && !cells.map(normalized).includes("fornecedores")) {
        result.sipoc.push({
          suppliers: cells[0],
          inputs: cells[1],
          process: cells[2],
          outputs: cells[3],
          customers: cells.slice(4).join(" | "),
        });
        currentSipoc = result.sipoc.at(-1) ?? null;
        sipocField = null;
        continue;
      }
      const field = labeled ? mapSipocFieldLabel(label) : null;
      if (field) {
        if (!currentSipoc || isSipocRowComplete(currentSipoc)) {
          currentSipoc = emptySipocRow();
          result.sipoc.push(currentSipoc);
        }
        currentSipoc[field] = append(currentSipoc[field], value);
        sipocField = field;
      } else if (currentSipoc && sipocField) {
        currentSipoc[sipocField] = append(currentSipoc[sipocField], line);
      }
      continue;
    }
    if (section === "steps") {
      const cells = cellsFromLine(line);
      if (currentStep && cells.length >= 3 && /^\d+\.\d+$/.test(cells[0])) {
        currentSubstep = {
          ...emptySubstep(cells[1], images),
          description: cells.slice(2).join(" | "),
        };
        currentStep.substeps.push(currentSubstep);
        currentActivity = null;
        continue;
      }
      if (
        cells.length >= 3 &&
        normalized(cells[0]) === "id" &&
        normalized(cells[1]) === "atividade"
      ) {
        continue;
      }
      const nestedActivityHeading = line.match(
        /^(?:(?:atividade)\s*)?(\d+)\.(\d+)\.(\d+)\s*[-\u2013\u2014.:)]?\s*(.+)$/i,
      );
      const substepHeading = line.match(
        /^(?:(subprocesso|subetapa|atividade)\s*)?(\d+)\.(\d+)\s*[-\u2013\u2014.:)]?\s*(.+)$/i,
      );
      const stepHeading = line.match(
        /^(?:(?:etapa|processo)\s*)?(\d+)\s*[-\u2013\u2014.:)]\s*(.+)$/i,
      );
      if (nestedActivityHeading) {
        if (!currentStep) continue;
        if (!currentSubstep || currentSubstep.kind !== "subprocess") {
          if (currentSubstep) {
            currentSubstep.kind = "subprocess";
            currentSubstep.activities = [];
          } else {
            currentSubstep = emptySubstep("Subprocesso", [], "subprocess");
            currentStep.substeps.push(currentSubstep);
          }
        }
        currentActivity = emptySubstep(nestedActivityHeading[4].trim(), images);
        currentSubstep.activities.push(currentActivity);
      } else if (substepHeading) {
        if (!currentStep) {
          currentStep = {
            title: "Etapa",
            area: "",
            responsible: "",
            input: "",
            activity: "",
            output: "",
            system: "",
            risk: "",
            notes: "",
            images: [],
            substeps: [],
          };
          result.steps.push(currentStep);
        }
        currentSubstep = emptySubstep(
          substepHeading[4].trim(),
          images,
          normalized(substepHeading[1] || "") === "subprocesso" ? "subprocess" : "activity",
        );
        currentStep.substeps.push(currentSubstep);
        currentActivity = null;
      } else if (stepHeading) {
        currentStep = {
          title: stepHeading[2].trim(),
          area: "",
          responsible: "",
          input: "",
          activity: "",
          output: "",
          system: "",
          risk: "",
          notes: "",
          images,
          substeps: [],
        };
        result.steps.push(currentStep);
        currentSubstep = null;
        currentActivity = null;
      } else if (
        label === "etapa" ||
        label === "titulo da etapa" ||
        label === "processo" ||
        label === "titulo do processo"
      ) {
        currentStep = {
          title: value,
          area: "",
          responsible: "",
          input: "",
          activity: "",
          output: "",
          system: "",
          risk: "",
          notes: "",
          images,
          substeps: [],
        };
        result.steps.push(currentStep);
        currentSubstep = null;
        currentActivity = null;
      } else if (label === "subprocesso" || label === "titulo do subprocesso") {
        if (!currentStep) continue;
        currentSubstep = emptySubstep(value, images, "subprocess");
        currentStep.substeps.push(currentSubstep);
        currentActivity = null;
      } else if (
        label === "subetapa" ||
        label === "titulo da subetapa" ||
        label === "atividade" ||
        label === "titulo da atividade"
      ) {
        if (!currentStep) continue;
        if (currentSubstep?.kind === "subprocess") {
          currentActivity = emptySubstep(value, images);
          currentSubstep.activities.push(currentActivity);
        } else {
          currentSubstep = emptySubstep(value, images);
          currentStep.substeps.push(currentSubstep);
          currentActivity = null;
        }
      } else if (
        currentActivity &&
        (label === "forma de execucao" ||
          label === "classificacao" ||
          label === "tipo de execucao" ||
          label === "categoria de execucao" ||
          label === "modalidade de execucao" ||
          label === "execucao")
      ) {
        currentActivity.executionType = value;
      } else if (
        currentSubstep &&
        (label === "forma de execucao" ||
          label === "classificacao" ||
          label === "tipo de execucao" ||
          label === "categoria de execucao" ||
          label === "modalidade de execucao" ||
          label === "execucao")
      ) {
        currentSubstep.executionType = value;
      } else if (
        (currentActivity || currentSubstep) &&
        (label === "tipo do ator" || label === "origem do ator" || label === "categoria do ator")
      ) {
        const target = currentActivity ?? currentSubstep;
        const actorType = normalized(value);
        if (target) {
          target.actorType =
            actorType.includes("area") || actorType.includes("departamento")
              ? "area"
              : actorType.includes("cargo") || actorType.includes("posicao")
                ? "position"
                : "";
        }
      } else if (
        (currentActivity || currentSubstep) &&
        (label === "area ator" ||
          label === "area ou ator" ||
          label === "area ator do processo" ||
          label === "area ator da atividade" ||
          label === "area da atividade" ||
          label === "area executora" ||
          label === "area responsavel" ||
          label === "area responsavel pela atividade" ||
          label === "responsavel pela atividade" ||
          label === "responsavel da atividade" ||
          label === "responsavel pela execucao" ||
          label === "area cargo" ||
          label === "area/cargo" ||
          label === "ator" ||
          label === "ator do processo" ||
          label === "executante" ||
          label === "executor" ||
          label === "cargo")
      ) {
        const target = currentActivity ?? currentSubstep;
        if (target) {
          target.actorName = value;
          if (!target.actorType) target.actorType = label.includes("area") ? "area" : "position";
        }
      } else if (
        (currentActivity || currentSubstep) &&
        (label === "sistema" ||
          label === "sistemas" ||
          label === "documento" ||
          label === "documentos" ||
          label === "sistema documento" ||
          label === "sistema/documento" ||
          label === "sistemas/documentos" ||
          label === "sistemas documentos" ||
          label === "sistemas documentos envolvidos" ||
          label === "recursos utilizados" ||
          label === "recurso" ||
          label === "recursos")
      ) {
        const target = currentActivity ?? currentSubstep;
        if (target) target.systemNames = listValues(value);
      } else if (
        currentSubstep &&
        (label === "tipo" || label === "tipo do registro") &&
        normalized(value).includes("subprocesso")
      ) {
        currentSubstep.kind = "subprocess";
      } else if (currentStep && (label === "observacoes" || label === "observacao")) {
        currentStep.notes = append(currentStep.notes, value);
      } else if ((currentActivity || currentSubstep) && (label === "descricao" || !labeled)) {
        const target = currentActivity ?? currentSubstep;
        if (target) {
          target.description = append(target.description, labeled ? value : line);
          target.images.push(...images);
        }
      } else if (currentStep) {
        if (label === "area" || label === "area responsavel") currentStep.area = value;
        else if (label === "responsavel") currentStep.responsible = value;
        else if (label === "entrada") currentStep.input = value;
        else if (label === "descricao do processo" || label === "descricao da etapa")
          currentStep.activity = value;
        else if (label === "saida") currentStep.output = value;
        else if (label === "sistema" || label === "sistemas") currentStep.system = value;
        else if (label === "risco") currentStep.risk = value;
        else if (label === "observacoes" || label === "observacao") currentStep.notes = value;
        else if (!labeled) currentStep.activity = append(currentStep.activity, line);
        currentStep.images.push(...images);
      } else if (images.length) result.macroImages.push(...images);
      continue;
    }
    if (section === "gaps") {
      const cleanLine = line.replace(/^[•*-]\s*/, "").trim();
      const gapLabeled = labelValue(cleanLine) ?? labeled;
      const gapLabel = gapLabeled?.label || "";
      const gapValue = gapLabeled?.value || "";
      const gapHeading =
        cleanLine.match(/^(\d+)\s*[-\u2013\u2014.:)]\s*(.+)$/i) ??
        cleanLine.match(
          /^(?:oportunidade|melhoria|ponto de melhoria|gap|causa(?: raiz)?)\s*\d*\s*[-\u2013\u2014.:)]\s*(.+)$/i,
        );
      const heading = normalized(cleanLine.replace(/:$/, ""));
      const cells = cellsFromLine(cleanLine);
      if (gapHeading || isGapTitleLabel(gapLabel)) {
        const title = gapHeading?.[2]?.trim() || gapHeading?.[1]?.trim() || gapValue;
        if (!title) continue;
        currentGap = {
          cause: title,
          description: "",
          impact: "",
          action: "",
          responsible: "",
          deadline: "",
          priority: "",
          status: "",
        };
        result.gaps.push(currentGap);
        gapField = null;
      } else if (currentGap) {
        if (cells.length >= 4 && !cells.map(normalized).includes("prioridade") && !labeled) {
          currentGap.priority = cells[0];
          currentGap.responsible = cells[1];
          currentGap.deadline = cells[2];
          currentGap.status = cells[3];
        } else if (
          heading === "descricao e causa raiz" ||
          heading === "descricao" ||
          heading === "detalhamento" ||
          heading === "problema"
        ) {
          gapField = "description";
        } else if (heading === "efeito" || heading === "efeitos") {
          gapField = "impact";
        } else if (heading === "acao proposta" || heading === "plano de acao") {
          gapField = "action";
        } else if (heading === "como implementar") {
          gapField = "action";
          currentGap.action = append(currentGap.action, "Como implementar:");
        } else if (heading === "impacto esperado") {
          gapField = "impact";
          currentGap.impact = append(currentGap.impact, "Impacto esperado:");
        } else {
          const mappedField = mapGapFieldLabel(gapLabel);
          if (mappedField === "description") {
            currentGap.description = append(currentGap.description, gapValue);
            gapField = "description";
          } else if (mappedField === "impact") {
            currentGap.impact = append(currentGap.impact, gapValue);
            gapField = "impact";
          } else if (mappedField === "action") {
            currentGap.action = append(currentGap.action, gapValue);
            gapField = "action";
          } else if (mappedField) {
            currentGap[mappedField] = gapValue;
            gapField = null;
          } else if (gapField) currentGap[gapField] = append(currentGap[gapField], cleanLine);
          else currentGap.description = append(currentGap.description, cleanLine);
        }
      }
      continue;
    }
    if (section === "nextSteps") {
      const cells = cellsFromLine(line);
      const numbered = line.match(/^\d+[.)-]\s*(.+)$/);
      if (
        cells.length >= 3 &&
        !["acao", "proximo passo", "atividade"].includes(normalized(cells[0]))
      ) {
        result.nextSteps.push({
          text: cells[0],
          responsible: cells[1],
          deadline: cells.slice(2).join(" | "),
        });
        currentNext = result.nextSteps.at(-1) ?? null;
      } else if (label === "acao" || label === "proximo passo" || numbered) {
        currentNext = { text: value || numbered?.[1] || "", responsible: "", deadline: "" };
        result.nextSteps.push(currentNext);
      } else if (currentNext && label === "responsavel") currentNext.responsible = value;
      else if (currentNext && (label === "prazo" || label === "data")) currentNext.deadline = value;
      else if (!labeled && line) {
        currentNext = { text: line, responsible: "", deadline: "" };
        result.nextSteps.push(currentNext);
      }
      continue;
    }
    if (section === "glossary") {
      const cells = cellsFromLine(line);
      if (cells.length >= 2) {
        result.glossary.push({ term: cells[0], definition: cells.slice(1).join(" | ") });
        currentGlossary = result.glossary.at(-1) ?? null;
      } else if (labeled && label === "termo") {
        currentGlossary = { term: value, definition: "" };
        result.glossary.push(currentGlossary);
      } else if (labeled && (label === "definicao" || label === "conceito")) {
        if (currentGlossary) currentGlossary.definition = append(currentGlossary.definition, value);
      } else if (labeled) {
        currentGlossary = { term: labeled.label, definition: value };
        result.glossary.push(currentGlossary);
      } else if (currentGlossary) {
        currentGlossary.definition = append(currentGlossary.definition, line);
      }
    }
  }

  inferLooseMapping(result, entries, seenSections);
  sanitizeImportResult(result);

  result.stats = {
    sections: seenSections.size,
    systems: result.systems.length,
    sipocRows: result.sipoc.length,
    steps: result.steps.length,
    substeps: result.steps.reduce(
      (sum, step) =>
        sum +
        step.substeps.reduce(
          (subtotal, substep) =>
            subtotal + (substep.kind === "subprocess" ? substep.activities.length : 1),
          0,
        ),
      0,
    ),
    gaps: result.gaps.length,
    images:
      result.macroImages.length +
      result.steps.reduce(
        (sum, step) =>
          sum +
          step.images.length +
          step.substeps.reduce(
            (subtotal, substep) =>
              subtotal +
              substep.images.length +
              substep.activities.reduce(
                (activityTotal, activity) => activityTotal + activity.images.length,
                0,
              ),
            0,
          ),
        0,
      ),
  };
  if (!result.title) result.warnings.push("O título do mapeamento não foi identificado.");
  if (!result.objective)
    result.warnings.push("O objetivo não foi identificado na seção Visão geral.");
  if (!result.scope) result.warnings.push("O escopo não foi identificado na seção Visão geral.");
  if (!result.steps.length) result.warnings.push("Nenhuma etapa numerada foi identificada.");
  const activitiesWithoutExecutionType = result.steps.reduce(
    (total, step) =>
      total +
      step.substeps.reduce(
        (subtotal, substep) =>
          subtotal +
          (substep.kind === "subprocess"
            ? substep.activities.filter((activity) => !activity.executionType.trim()).length
            : Number(!substep.executionType.trim())),
        0,
      ),
    0,
  );
  if (activitiesWithoutExecutionType) {
    result.warnings.push(
      `${activitiesWithoutExecutionType} atividade(s) sem forma de execução. Revise a classificação antes de salvar.`,
    );
  }
  let activitiesWithoutExplicitArea = 0;
  result.steps.forEach((step) => {
    step.substeps.forEach((substep) => {
      if (substep.kind === "activity" && !substep.actorName.trim()) {
        substep.actorType = "area";
        substep.actorName = inferExplicitActivityArea(substep.description);
        if (substep.actorName === "A definir") activitiesWithoutExplicitArea += 1;
      }
      substep.activities.forEach((activity) => {
        if (activity.actorName.trim()) return;
        activity.actorType = "area";
        activity.actorName = inferExplicitActivityArea(activity.description);
        if (activity.actorName === "A definir") activitiesWithoutExplicitArea += 1;
      });
    });
  });
  if (activitiesWithoutExplicitArea) {
    result.warnings.push(
      `${activitiesWithoutExplicitArea} atividade(s) sem área responsável explícita. O campo foi preenchido como "A definir".`,
    );
  }
  if (result.stats.sections < 2 && !result.steps.length) {
    throw new Error(
      "A estrutura do mapeamento não foi reconhecida. Use os títulos de seção apresentados no modelo do assistente.",
    );
  }
  if (result.stats.sections < 2 && result.steps.length) {
    result.warnings.push(
      "A estrutura foi inferida por numeração e contexto. Revise os campos antes de salvar.",
    );
  }
  return result;
}

export async function parseDocxMapping(file: File) {
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Selecione um arquivo DOCX.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("O arquivo não contém um documento Word válido.");
  const [xml, images] = await Promise.all([documentFile.async("text"), relationshipImages(zip)]);
  return parseEntries(entriesFromXml(xml), file.name, images);
}

export function parseStructuredMappingText(rawText: string) {
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("Cole o conteúdo estruturado antes de analisar.");
  const entries: Entry[] = text.split("\n").map((line) => ({
    kind: "paragraph",
    value: { text: line.replace(/\u00a0/g, " ").trim(), imageIds: [] },
  }));
  return parseEntries(entries, "Texto estruturado");
}
