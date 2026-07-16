import JSZip from "jszip";

export type DocxImportImage = {
  name: string;
  src: string;
};

export type DocxImportClause = {
  text: string;
  alert: string;
  images: DocxImportImage[];
};

export type DocxImportSubitem = {
  title: string;
  clauses: DocxImportClause[];
};

export type DocxImportItem = {
  title: string;
  body: string;
  images: DocxImportImage[];
  subitems: DocxImportSubitem[];
};

export type DocxDocumentImport = {
  fileName: string;
  type: "Norma" | "POP" | "IT" | null;
  code: string;
  title: string;
  version: string;
  classification: string;
  effectiveDate: string;
  author: string;
  reviewer: string;
  approver: string;
  publicationDate: string;
  objective: string;
  scope: string;
  items: DocxImportItem[];
  responsibilities: Array<{ area: string; cargo: string; responsibility: string }>;
  references: Array<{ code: string; title: string; applicability: string }>;
  history: Array<{
    code: string;
    version: string;
    date: string;
    author: string;
    reviewer: string;
    approver: string;
  }>;
  changes: Array<{ version: string; location: string; description: string }>;
  warnings: string[];
  stats: {
    items: number;
    subitems: number;
    clauses: number;
    images: number;
    ignoredImages: number;
  };
};

type ParsedParagraph = {
  text: string;
  style: string;
  imageIds: string[];
};

type ParsedTable = string[][];

type DocumentEntry =
  | { kind: "paragraph"; value: ParsedParagraph }
  | { kind: "table"; value: ParsedTable };

const XML_MIME = "application/xml";

function xmlDocument(xml: string) {
  const parsed = new DOMParser().parseFromString(xml, XML_MIME);
  if (parsed.querySelector("parsererror")) throw new Error("O DOCX possui XML interno inválido.");
  return parsed;
}

function descendants(node: Element, name: string) {
  return Array.from(node.getElementsByTagNameNS("*", name));
}

function attribute(node: Element | undefined, name: string) {
  if (!node) return "";
  return (
    node.getAttribute(name) ||
    node.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      name,
    ) ||
    ""
  );
}

function paragraphFromElement(element: Element): ParsedParagraph {
  const text = descendants(element, "t")
    .map((item) => item.textContent || "")
    .join("")
    .replace(/\u00a0/g, " ")
    .trim();
  const style = attribute(descendants(element, "pStyle")[0], "val");
  const imageIds = descendants(element, "blip")
    .map((item) => attribute(item, "embed"))
    .filter(Boolean);
  return { text, style, imageIds };
}

function tableFromElement(element: Element): ParsedTable {
  return descendants(element, "tr").map((row) =>
    descendants(row, "tc").map((cell) =>
      descendants(cell, "t")
        .map((item) => item.textContent || "")
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    ),
  );
}

function documentEntries(documentXml: string): DocumentEntry[] {
  const parsed = xmlDocument(documentXml);
  const body = descendants(parsed.documentElement, "body")[0];
  if (!body) return [];
  return Array.from(body.children).flatMap((child): DocumentEntry[] => {
    if (child.localName === "p") return [{ kind: "paragraph", value: paragraphFromElement(child) }];
    if (child.localName === "tbl") return [{ kind: "table", value: tableFromElement(child) }];
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

function appendText(current: string, next: string) {
  if (!next.trim()) return current;
  return current ? `${current}\n\n${next.trim()}` : next.trim();
}

function mimeForFile(name: string) {
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension === "png") return "image/png";
  if (extension === "jpg" || extension === "jpeg") return "image/jpeg";
  if (extension === "gif") return "image/gif";
  if (extension === "svg") return "image/svg+xml";
  if (extension === "webp") return "image/webp";
  return "application/octet-stream";
}

function uint8ToDataUrl(bytes: Uint8Array, mime: string) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function relationshipImages(zip: JSZip) {
  const relationships = zip.file("word/_rels/document.xml.rels");
  if (!relationships) return new Map<string, DocxImportImage>();
  const parsed = xmlDocument(await relationships.async("text"));
  const images = new Map<string, DocxImportImage>();
  await Promise.all(
    descendants(parsed.documentElement, "Relationship").map(async (relationship) => {
      const id = relationship.getAttribute("Id") || "";
      const target = relationship.getAttribute("Target") || "";
      if (!id || !target || !target.includes("media/")) return;
      const cleanTarget = target.replace(/^\.\.\//, "").replace(/^\//, "");
      const path = cleanTarget.startsWith("word/") ? cleanTarget : `word/${cleanTarget}`;
      const file = zip.file(path);
      if (!file) return;
      const name = path.split("/").pop() || "imagem";
      images.set(id, {
        name,
        src: uint8ToDataUrl(await file.async("uint8array"), mimeForFile(name)),
      });
    }),
  );
  return images;
}

function detectMetadata(fileName: string, searchableText: string) {
  const cleanedName = fileName
    .replace(/\.docx$/i, "")
    .replace(/\u00a0/g, " ")
    .trim();
  const codeMatch = `${cleanedName} ${searchableText}`.match(
    /\b(POP|NOR|IT)\.[A-Z0-9]{2,8}\.\d{3}\b/i,
  );
  const code = codeMatch?.[0]?.toUpperCase() || "";
  const prefix = code.split(".")[0];
  const type =
    prefix === "POP" ? "POP" : prefix === "NOR" ? "Norma" : prefix === "IT" ? "IT" : null;
  const title = cleanedName
    .replace(codeMatch?.[0] || "", "")
    .replace(/[-–—_]+/g, " ")
    .replace(/\bv\d+\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const versionMatch = cleanedName.match(/\bv(\d+)\b/i);
  return {
    code,
    type: type as DocxDocumentImport["type"],
    title,
    version: versionMatch?.[1]?.padStart(2, "0") || "00",
  };
}

function meaningfulRows(table: ParsedTable) {
  return table.filter((row) => row.some((cell) => cell.trim()));
}

function mapTable(result: DocxDocumentImport, table: ParsedTable) {
  const rows = meaningfulRows(table);
  if (rows.length < 2) return false;
  const headerTerms = [
    "area cargo",
    "responsabilidade",
    "codigo",
    "titulo",
    "aplicabilidade",
    "versao",
    "data",
    "elaborador",
    "revisor",
    "aprovador",
    "local da revisao",
    "descricao",
  ];
  const headerRowIndex = rows.reduce((bestIndex, row, rowIndex) => {
    const score = row
      .map(normalized)
      .filter((cell) => headerTerms.some((term) => cell.includes(term))).length;
    const bestScore = rows[bestIndex]
      .map(normalized)
      .filter((cell) => headerTerms.some((term) => cell.includes(term))).length;
    return score > bestScore ? rowIndex : bestIndex;
  }, 0);
  const headers = rows[headerRowIndex].map(normalized);
  const dataRows = rows.slice(headerRowIndex + 1);
  const index = (fragments: string[]) =>
    headers.findIndex((header) => fragments.some((fragment) => header.includes(fragment)));
  const value = (row: string[], position: number) =>
    position >= 0 ? row[position]?.trim() || "" : "";

  const responsibilityIndex = index(["responsabilidade", "descricao"]);
  const areaCargoIndex = index(["area cargo", "cargo"]);
  if (
    responsibilityIndex >= 0 &&
    areaCargoIndex >= 0 &&
    !headers.some((header) => header.includes("versao"))
  ) {
    dataRows.forEach((row) => {
      const cargo = value(row, areaCargoIndex);
      const responsibility = value(row, responsibilityIndex);
      if (cargo || responsibility)
        result.responsibilities.push({ area: "", cargo, responsibility });
    });
    result.warnings.push(
      "As responsabilidades trouxeram Área/Cargo em uma coluna única. O conteúdo foi colocado em Cargo; revise a Área.",
    );
    return true;
  }

  const codeIndex = index(["codigo"]);
  const titleIndex = index(["titulo"]);
  const applicabilityIndex = index(["aplicabilidade"]);
  if (codeIndex >= 0 && titleIndex >= 0 && applicabilityIndex >= 0) {
    dataRows.forEach((row) => {
      const item = {
        code: value(row, codeIndex),
        title: value(row, titleIndex),
        applicability: value(row, applicabilityIndex),
      };
      if (item.code || item.title || item.applicability) result.references.push(item);
    });
    return true;
  }

  const versionIndex = index(["versao"]);
  const dateIndex = index(["data emi", "data"]);
  const authorIndex = index(["elaborador"]);
  const reviewerIndex = index(["revisor"]);
  const approverIndex = index(["aprovador"]);
  if (versionIndex >= 0 && authorIndex >= 0 && reviewerIndex >= 0) {
    dataRows.forEach((row) => {
      const item = {
        code: value(row, codeIndex),
        version: value(row, versionIndex) || "00",
        date: value(row, dateIndex),
        author: value(row, authorIndex),
        reviewer: value(row, reviewerIndex),
        approver: value(row, approverIndex),
      };
      if (Object.values(item).some(Boolean)) result.history.push(item);
    });
    return true;
  }

  const locationIndex = index(["local da revisao", "local"]);
  const descriptionIndex = index(["descricao"]);
  if (versionIndex >= 0 && locationIndex >= 0 && descriptionIndex >= 0) {
    dataRows.forEach((row) => {
      const item = {
        version: value(row, versionIndex) || "00",
        location: value(row, locationIndex),
        description: value(row, descriptionIndex),
      };
      if (Object.values(item).some(Boolean)) result.changes.push(item);
    });
    return true;
  }
  return false;
}

export async function parseDocxDocument(file: File): Promise<DocxDocumentImport> {
  if (!file.name.toLowerCase().endsWith(".docx")) throw new Error("Selecione um arquivo DOCX.");
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const documentFile = zip.file("word/document.xml");
  if (!documentFile) throw new Error("O arquivo não contém um documento Word válido.");
  const documentXml = await documentFile.async("text");
  const entries = documentEntries(documentXml);
  const searchableText = entries
    .filter(
      (entry): entry is Extract<DocumentEntry, { kind: "paragraph" }> => entry.kind === "paragraph",
    )
    .map((entry) => entry.value.text)
    .join(" ");
  const metadata = detectMetadata(file.name, searchableText);
  const result: DocxDocumentImport = {
    fileName: file.name,
    ...metadata,
    classification: "",
    effectiveDate: "",
    author: "",
    reviewer: "",
    approver: "",
    publicationDate: "",
    objective: "",
    scope: "",
    items: [],
    responsibilities: [],
    references: [],
    history: [],
    changes: [],
    warnings: [],
    stats: { items: 0, subitems: 0, clauses: 0, images: 0, ignoredImages: 0 },
  };
  const imagesByRelationship = await relationshipImages(zip);
  let mainSection = 0;
  let currentItem: DocxImportItem | null = null;
  let currentSubitem: DocxImportSubitem | null = null;
  let currentClause: DocxImportClause | null = null;

  for (const entry of entries) {
    if (entry.kind === "table") {
      mapTable(result, entry.value);
      continue;
    }
    const { text, imageIds } = entry.value;
    const paragraphImages = imageIds.flatMap((relationshipId) => {
      const image = imagesByRelationship.get(relationshipId);
      return image ? [image] : [];
    });
    const heading = text.match(/^(\d+)\.?\s+(.+)$/);
    const itemHeading = text.match(/^3\.(\d+)\.?\s+(.+)$/);
    const subitemHeading = text.match(/^3\.(\d+)\.(\d+)\.?\s+(.+)$/);
    const clauseHeading = text.match(/^([a-z])\)\s*(.*)$/i);

    if (subitemHeading) {
      mainSection = 3;
      if (!currentItem) {
        currentItem = { title: "Procedimento", body: "", images: [], subitems: [] };
        result.items.push(currentItem);
      }
      currentSubitem = { title: subitemHeading[3].trim(), clauses: [] };
      currentItem.subitems.push(currentSubitem);
      currentClause = null;
      continue;
    }
    if (itemHeading) {
      mainSection = 3;
      currentItem = { title: itemHeading[2].trim(), body: "", images: [], subitems: [] };
      result.items.push(currentItem);
      currentSubitem = null;
      currentClause = null;
      continue;
    }
    if (heading) {
      mainSection = Number(heading[1]);
      currentItem = null;
      currentSubitem = null;
      currentClause = null;
      continue;
    }

    if (mainSection === 1) result.objective = appendText(result.objective, text);
    else if (mainSection === 2) result.scope = appendText(result.scope, text);
    else if (mainSection === 3) {
      if (clauseHeading) {
        if (!currentItem) {
          currentItem = { title: "Procedimento", body: "", images: [], subitems: [] };
          result.items.push(currentItem);
        }
        if (!currentSubitem) {
          currentSubitem = { title: "Orientações", clauses: [] };
          currentItem.subitems.push(currentSubitem);
        }
        currentClause = { text: clauseHeading[2].trim(), alert: "", images: paragraphImages };
        currentSubitem.clauses.push(currentClause);
      } else if (text || paragraphImages.length) {
        if (currentClause) {
          currentClause.text = appendText(currentClause.text, text);
          currentClause.images.push(...paragraphImages);
        } else if (currentSubitem) {
          currentClause = { text, alert: "", images: paragraphImages };
          currentSubitem.clauses.push(currentClause);
        } else if (currentItem) {
          currentItem.body = appendText(currentItem.body, text);
          currentItem.images.push(...paragraphImages);
        }
      }
    } else if (paragraphImages.length) {
      result.stats.ignoredImages += paragraphImages.length;
    }
  }

  const mediaCount = Object.keys(zip.files).filter(
    (path) => path.startsWith("word/media/") && !zip.files[path].dir,
  ).length;
  result.stats.items = result.items.length;
  result.stats.subitems = result.items.reduce((sum, item) => sum + item.subitems.length, 0);
  result.stats.clauses = result.items.reduce(
    (sum, item) =>
      sum + item.subitems.reduce((subtotal, subitem) => subtotal + subitem.clauses.length, 0),
    0,
  );
  result.stats.images = result.items.reduce(
    (sum, item) =>
      sum +
      item.images.length +
      item.subitems.reduce(
        (subtotal, subitem) =>
          subtotal +
          subitem.clauses.reduce((clauseTotal, clause) => clauseTotal + clause.images.length, 0),
        0,
      ),
    0,
  );
  result.stats.ignoredImages += Math.max(
    0,
    mediaCount - result.stats.images - result.stats.ignoredImages,
  );
  if (!result.type)
    result.warnings.push("Não foi possível identificar se o documento é Norma, POP ou IT.");
  if (!result.objective) result.warnings.push("A seção Objetivo não foi identificada.");
  if (!result.scope) result.warnings.push("A seção Abrangência não foi identificada.");
  if (!result.items.length)
    result.warnings.push("Nenhum item numerado da seção 03 foi identificado.");
  if (result.stats.ignoredImages) {
    result.warnings.push(
      `${result.stats.ignoredImages} imagem(ns) fora da seção 03 não serão importadas.`,
    );
  }
  return result;
}

export function parseStructuredDocumentText(rawText: string): DocxDocumentImport {
  const text = rawText.replace(/\r\n?/g, "\n").trim();
  if (!text) throw new Error("Cole o conteúdo estruturado antes de analisar.");
  const lines = text
    .split("\n")
    .map((line) => line.replace(/\u00a0/g, " ").trim())
    .filter(Boolean);
  const metadata = detectMetadata("Texto colado.docx", text);
  const codeLine = lines.find((line) => metadata.code && line.includes(metadata.code));
  const inferredTitle = codeLine
    ?.replace(metadata.code, "")
    .replace(/^\s*[-–—:|]+\s*/, "")
    .trim();
  const result: DocxDocumentImport = {
    fileName: "Texto estruturado",
    ...metadata,
    title: inferredTitle || "",
    classification: "",
    effectiveDate: "",
    author: "",
    reviewer: "",
    approver: "",
    publicationDate: "",
    objective: "",
    scope: "",
    items: [],
    responsibilities: [],
    references: [],
    history: [],
    changes: [],
    warnings: [],
    stats: { items: 0, subitems: 0, clauses: 0, images: 0, ignoredImages: 0 },
  };
  let mainSection = 0;
  let currentItem: DocxImportItem | null = null;
  let currentSubitem: DocxImportSubitem | null = null;
  let currentClause: DocxImportClause | null = null;
  let changesSection = false;
  let lastResponsibility: DocxDocumentImport["responsibilities"][number] | null = null;

  for (const line of lines) {
    const labeledValue = line.match(/^([^:]+):\s*(.+)$/);
    if (!mainSection && labeledValue) {
      const label = normalized(labeledValue[1]);
      const value = labeledValue[2].trim();
      if (label === "classificacao") result.classification = value;
      else if (label === "codigo") result.code = value.toUpperCase();
      else if (label === "titulo") result.title = value;
      else if (label === "vigencia") result.effectiveDate = value;
      else if (label === "versao") result.version = value.padStart(2, "0");
      else if (label === "elaboracao" || label === "elaborador") result.author = value;
      else if (label === "revisor") result.reviewer = value;
      else if (label === "aprovacao" || label === "aprovador") result.approver = value;
      else if (label === "publicacao") result.publicationDate = value;
      continue;
    }
    const subitemHeading = line.match(/^3\.(\d+)\.(\d+)\.?\s+(.+)$/);
    const itemHeading = line.match(/^3\.(\d+)\.?\s+(.+)$/);
    const mainHeadingCandidate = line.match(/^(\d+)\.?\s+(.+)$/);
    const mainHeading =
      mainHeadingCandidate &&
      /^(objetivo|abrangencia|procedimento|responsabilidades|referencias|historico)/.test(
        normalized(mainHeadingCandidate[2]),
      )
        ? mainHeadingCandidate
        : null;
    const clauseHeading = line.match(/^([a-z])\)\s*(.*)$/i);

    if (/^6\.1\.?\s+/i.test(line)) {
      mainSection = 6;
      changesSection = true;
      continue;
    }

    if (subitemHeading) {
      mainSection = 3;
      if (!currentItem) {
        currentItem = { title: "Procedimento", body: "", images: [], subitems: [] };
        result.items.push(currentItem);
      }
      currentSubitem = { title: subitemHeading[3].trim(), clauses: [] };
      currentItem.subitems.push(currentSubitem);
      currentClause = null;
      continue;
    }
    if (itemHeading) {
      mainSection = 3;
      currentItem = { title: itemHeading[2].trim(), body: "", images: [], subitems: [] };
      result.items.push(currentItem);
      currentSubitem = null;
      currentClause = null;
      continue;
    }
    if (mainHeading) {
      mainSection = Number(mainHeading[1]);
      changesSection = false;
      currentItem = null;
      currentSubitem = null;
      currentClause = null;
      continue;
    }

    if (mainSection === 1) {
      result.objective = appendText(result.objective, line);
      continue;
    }
    if (mainSection === 2) {
      result.scope = appendText(result.scope, line);
      continue;
    }
    if (mainSection === 3) {
      if (clauseHeading) {
        if (!currentItem) {
          currentItem = { title: "Procedimento", body: "", images: [], subitems: [] };
          result.items.push(currentItem);
        }
        if (!currentSubitem) {
          currentSubitem = { title: "Orientações", clauses: [] };
          currentItem.subitems.push(currentSubitem);
        }
        currentClause = { text: clauseHeading[2].trim(), alert: "", images: [] };
        currentSubitem.clauses.push(currentClause);
      } else if (currentClause) currentClause.text = appendText(currentClause.text, line);
      else if (currentSubitem) {
        currentClause = { text: line, alert: "", images: [] };
        currentSubitem.clauses.push(currentClause);
      } else if (currentItem) currentItem.body = appendText(currentItem.body, line);
      continue;
    }

    const cells = line.split(/[|\t]/).map((cell) => cell.trim());
    const normalizedLine = normalized(line);
    const tableHeader =
      (mainSection === 4 && /area cargo.*responsabilidade/.test(normalizedLine)) ||
      (mainSection === 5 && /codigo.*titulo.*aplicabilidade/.test(normalizedLine)) ||
      (mainSection === 6 && /versao.*local.*descricao/.test(normalizedLine)) ||
      (mainSection === 6 && /codigo.*versao.*data.*elaborador/.test(normalizedLine));
    if (tableHeader) {
      continue;
    }
    if (mainSection === 4) {
      if (cells.length >= 2) {
        const [area, cargo, ...responsibilityParts] =
          cells.length >= 3 ? cells : ["", cells[0], cells[1]];
        lastResponsibility = {
          area,
          cargo,
          responsibility: responsibilityParts.join(" | "),
        };
        result.responsibilities.push(lastResponsibility);
      } else if (lastResponsibility) {
        lastResponsibility.responsibility = appendText(lastResponsibility.responsibility, line);
      }
    } else if (mainSection === 5 && cells.length >= 3) {
      result.references.push({
        code: cells[0],
        title: cells[1],
        applicability: cells.slice(2).join(" | "),
      });
    } else if (mainSection === 6 && changesSection && cells.length >= 3) {
      result.changes.push({
        version: cells[0],
        location: cells[1],
        description: cells.slice(2).join(" | "),
      });
    } else if (mainSection === 6 && cells.length >= 6) {
      result.history.push({
        code: cells[0],
        version: cells[1],
        date: cells[2],
        author: cells[3],
        reviewer: cells[4],
        approver: cells[5],
      });
    }
  }

  result.stats.items = result.items.length;
  result.stats.subitems = result.items.reduce((sum, item) => sum + item.subitems.length, 0);
  result.stats.clauses = result.items.reduce(
    (sum, item) =>
      sum + item.subitems.reduce((subtotal, subitem) => subtotal + subitem.clauses.length, 0),
    0,
  );
  if (!result.type)
    result.warnings.push("O tipo não foi identificado. Informe POP, NOR ou IT junto ao código.");
  if (!result.objective) result.warnings.push("A seção 1 - Objetivo não foi identificada.");
  if (!result.scope) result.warnings.push("A seção 2 - Abrangência não foi identificada.");
  if (!result.items.length) result.warnings.push("Nenhum item 3.x foi identificado.");
  return result;
}
