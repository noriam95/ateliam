import JSZip from "jszip";

export type MappingImportImage = { name: string; src: string };
export type MappingImportSystem = { name: string; description: string };
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
  images: MappingImportImage[];
};
export type MappingImportStep = {
  title: string;
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

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}

function append(current: string, next: string) {
  const value = next.trim();
  if (!value) return current;
  return current ? `${current}\n\n${value}` : value;
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
  const text = normalized(value).replace(/^0?[0-7]\s+/, "");
  if (/^(dados do mapeamento|identificacao|informacoes do mapeamento)$/.test(text))
    return "metadata";
  if (/^(visao geral|objetivo escopo e contexto)$/.test(text)) return "overview";
  if (/^sistemas envolvidos$/.test(text)) return "systems";
  if (/^(analise )?sipoc( do processo)?$/.test(text)) return "sipoc";
  if (/^(etapas do processo|fluxo as is|fluxo to be)$/.test(text)) return "steps";
  if (/^gaps? e causas? raiz$/.test(text)) return "gaps";
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

function headerIndex(headers: string[], fragments: string[]) {
  return headers.findIndex((header) => fragments.some((fragment) => header.includes(fragment)));
}

function mapTable(result: MappingDocumentImport, table: string[][]) {
  const rows = table.filter((row) => row.some((cell) => cell.trim()));
  if (rows.length < 2) return false;
  const headers = rows[0].map(normalized);
  const dataRows = rows.slice(1);
  const at = (row: string[], index: number) => (index >= 0 ? row[index]?.trim() || "" : "");

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

  const system = headerIndex(headers, ["sistema", "ferramenta"]);
  const description = headerIndex(headers, ["descricao", "uso no processo"]);
  if (system >= 0 && description >= 0 && headers.length <= 4) {
    dataRows.forEach((row) =>
      result.systems.push({ name: at(row, system), description: at(row, description) }),
    );
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

  const cause = headerIndex(headers, ["causa raiz", "causa", "gap"]);
  const impact = headerIndex(headers, ["impacto"]);
  const action = headerIndex(headers, ["acao proposta", "acao"]);
  if (cause >= 0 && (impact >= 0 || action >= 0)) {
    const responsible = headerIndex(headers, ["responsavel"]);
    const deadline = headerIndex(headers, ["prazo"]);
    const priority = headerIndex(headers, ["prioridade"]);
    const status = headerIndex(headers, ["status"]);
    dataRows.forEach((row) =>
      result.gaps.push({
        cause: at(row, cause),
        description: at(row, description),
        impact: at(row, impact),
        action: at(row, action),
        responsible: at(row, responsible),
        deadline: at(row, deadline),
        priority: at(row, priority),
        status: at(row, status),
      }),
    );
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
  let currentGap: MappingImportGap | null = null;
  let currentNext: MappingDocumentImport["nextSteps"][number] | null = null;

  for (const entry of entries) {
    if (entry.kind === "table") {
      mapTable(result, entry.value);
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
      currentGap = null;
      currentNext = null;
      continue;
    }
    if (!line && !images.length) continue;

    const labeled = labelValue(line);
    const label = labeled?.label || "";
    const value = labeled?.value || "";
    if (section === "metadata" || !section) {
      if (label === "titulo" || label === "titulo do mapeamento") result.title = value;
      else if (label === "modalidade")
        result.modality = /to be/i.test(value) ? "TO BE" : /as is/i.test(value) ? "AS IS" : null;
      else if (label === "data") result.date = value;
      else if (label === "elaborador") result.author = value;
      else if (label === "revisor") result.reviewer = value;
      continue;
    }
    if (section === "overview") {
      if (label === "objetivo") {
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
      if (label === "sistema" || label === "ferramenta") {
        currentSystem = { name: value, description: "" };
        result.systems.push(currentSystem);
      } else if (label.includes("descricao") || label.includes("uso no processo")) {
        if (!currentSystem) {
          currentSystem = { name: "", description: "" };
          result.systems.push(currentSystem);
        }
        currentSystem.description = value;
      } else if (currentSystem) currentSystem.description = append(currentSystem.description, line);
      continue;
    }
    if (section === "sipoc") {
      const cells = cellsFromLine(line);
      if (cells.length >= 5 && !cells.map(normalized).includes("fornecedores")) {
        result.sipoc.push({
          suppliers: cells[0],
          inputs: cells[1],
          process: cells[2],
          outputs: cells[3],
          customers: cells.slice(4).join(" | "),
        });
      }
      continue;
    }
    if (section === "steps") {
      const stepHeading = line.match(/^(?:etapa\s*)?(\d+)\s*[-.:)]\s*(.+)$/i);
      const substepHeading = line.match(/^(?:subetapa\s*)?(\d+)\.(\d+)\s*[-.:)]\s*(.+)$/i);
      if (substepHeading) {
        if (!currentStep) {
          currentStep = {
            title: "Etapa",
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
        currentSubstep = { title: substepHeading[3].trim(), description: "", images };
        currentStep.substeps.push(currentSubstep);
      } else if (stepHeading) {
        currentStep = {
          title: stepHeading[2].trim(),
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
      } else if (label === "etapa" || label === "titulo da etapa") {
        currentStep = {
          title: value,
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
      } else if (label === "subetapa" || label === "titulo da subetapa") {
        if (!currentStep) continue;
        currentSubstep = { title: value, description: "", images };
        currentStep.substeps.push(currentSubstep);
      } else if (currentSubstep && (label === "descricao" || !labeled)) {
        currentSubstep.description = append(currentSubstep.description, labeled ? value : line);
        currentSubstep.images.push(...images);
      } else if (currentStep) {
        if (label === "responsavel") currentStep.responsible = value;
        else if (label === "entrada") currentStep.input = value;
        else if (label === "atividade" || label === "descricao") currentStep.activity = value;
        else if (label === "saida") currentStep.output = value;
        else if (label === "sistema") currentStep.system = value;
        else if (label === "risco") currentStep.risk = value;
        else if (label === "observacoes" || label === "observacao") currentStep.notes = value;
        else if (!labeled) currentStep.activity = append(currentStep.activity, line);
        currentStep.images.push(...images);
      } else if (images.length) result.macroImages.push(...images);
      continue;
    }
    if (section === "gaps") {
      if (label === "gap" || label === "causa" || label === "causa raiz") {
        currentGap = {
          cause: value,
          description: "",
          impact: "",
          action: "",
          responsible: "",
          deadline: "",
          priority: "",
          status: "",
        };
        result.gaps.push(currentGap);
      } else if (currentGap) {
        if (label === "descricao") currentGap.description = value;
        else if (label === "impacto") currentGap.impact = value;
        else if (label === "acao" || label === "acao proposta") currentGap.action = value;
        else if (label === "responsavel") currentGap.responsible = value;
        else if (label === "prazo") currentGap.deadline = value;
        else if (label === "prioridade") currentGap.priority = value;
        else if (label === "status") currentGap.status = value;
        else currentGap.description = append(currentGap.description, line);
      }
      continue;
    }
    if (section === "nextSteps") {
      const numbered = line.match(/^\d+[.)-]\s*(.+)$/);
      if (label === "acao" || label === "proximo passo" || numbered) {
        currentNext = { text: value || numbered?.[1] || "", responsible: "", deadline: "" };
        result.nextSteps.push(currentNext);
      } else if (currentNext && label === "responsavel") currentNext.responsible = value;
      else if (currentNext && (label === "prazo" || label === "data")) currentNext.deadline = value;
      continue;
    }
    if (section === "glossary") {
      const cells = cellsFromLine(line);
      if (cells.length >= 2)
        result.glossary.push({ term: cells[0], definition: cells.slice(1).join(" | ") });
      else if (labeled) result.glossary.push({ term: labeled.label, definition: value });
    }
  }

  result.stats = {
    sections: seenSections.size,
    systems: result.systems.length,
    sipocRows: result.sipoc.length,
    steps: result.steps.length,
    substeps: result.steps.reduce((sum, step) => sum + step.substeps.length, 0),
    gaps: result.gaps.length,
    images:
      result.macroImages.length +
      result.steps.reduce(
        (sum, step) =>
          sum +
          step.images.length +
          step.substeps.reduce((subtotal, substep) => subtotal + substep.images.length, 0),
        0,
      ),
  };
  if (!result.title) result.warnings.push("O título do mapeamento não foi identificado.");
  if (!result.objective)
    result.warnings.push("O objetivo não foi identificado na seção Visão geral.");
  if (!result.scope) result.warnings.push("O escopo não foi identificado na seção Visão geral.");
  if (!result.steps.length) result.warnings.push("Nenhuma etapa numerada foi identificada.");
  if (result.stats.sections < 2) {
    throw new Error(
      "A estrutura do mapeamento não foi reconhecida. Use os títulos de seção apresentados no modelo do assistente.",
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
