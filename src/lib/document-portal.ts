export type PortalDocumentModule = "ddp" | "pop" | "bpmn";

export type PortalDocument = {
  id: string;
  module: PortalDocumentModule;
  moduleLabel: string;
  title: string;
  code: string;
  type: string;
  area: string;
  macroprocess: string;
  process: string;
  subprocess: string;
  description: string;
  tags: string[];
  responsible: string;
  status: string;
  revision: string;
  effectiveAt: string;
  updatedAt: string;
  createdAt: string;
  searchText: string;
};

export type PortalDocumentFilters = {
  area?: string;
  macroprocess?: string;
  process?: string;
  subprocess?: string;
  type?: string;
  responsible?: string;
  module?: string;
};

export type PortalDocumentSort =
  "relevance" | "recent" | "popular" | "alphabetical" | "effective" | "updated";

export function normalizePortalText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isPortalCurrentStatus(status: unknown) {
  const normalized = normalizePortalText(status);
  return ["vigente", "publicado", "aprovado", "concluido", "ativo"].some(
    (allowed) => normalized === allowed || normalized.startsWith(`${allowed} `),
  );
}

function portalDocumentHaystack(document: PortalDocument) {
  return normalizePortalText(
    [
      document.title,
      document.code,
      document.type,
      document.area,
      document.macroprocess,
      document.process,
      document.subprocess,
      document.description,
      document.tags.join(" "),
      document.responsible,
      document.moduleLabel,
      document.searchText,
    ].join(" "),
  );
}

export function portalDocumentRelevance(document: PortalDocument, query: string) {
  const normalizedQuery = normalizePortalText(query);
  if (!normalizedQuery) return 0;
  const terms = normalizedQuery.split(" ").filter(Boolean);
  const haystack = portalDocumentHaystack(document);
  if (!terms.every((term) => haystack.includes(term))) return -1;

  const title = normalizePortalText(document.title);
  const code = normalizePortalText(document.code);
  const tags = normalizePortalText(document.tags.join(" "));
  return terms.reduce((score, term) => {
    if (code === term || code.startsWith(term)) score += 12;
    if (title === term) score += 10;
    else if (title.startsWith(term)) score += 8;
    else if (title.includes(term)) score += 5;
    if (tags.includes(term)) score += 3;
    return score + 1;
  }, 0);
}

export function filterAndSortPortalDocuments(
  documents: PortalDocument[],
  query: string,
  filters: PortalDocumentFilters,
  sort: PortalDocumentSort,
  accessCounts: Record<string, number> = {},
) {
  const matchesFilter = (value: string, expected?: string) =>
    !expected || normalizePortalText(value) === normalizePortalText(expected);
  const rows = documents
    .map((document) => ({ document, relevance: portalDocumentRelevance(document, query) }))
    .filter(
      ({ document, relevance }) =>
        relevance >= 0 &&
        matchesFilter(document.area, filters.area) &&
        matchesFilter(document.macroprocess, filters.macroprocess) &&
        matchesFilter(document.process, filters.process) &&
        matchesFilter(document.subprocess, filters.subprocess) &&
        matchesFilter(document.type, filters.type) &&
        matchesFilter(document.responsible, filters.responsible) &&
        matchesFilter(document.module, filters.module),
    );

  const time = (value: string) => {
    const brazilianDate = value.match(
      /^(\d{2})\/(\d{2})\/(\d{4})(?:,?\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
    );
    const parsed = brazilianDate
      ? new Date(
          Number(brazilianDate[3]),
          Number(brazilianDate[2]) - 1,
          Number(brazilianDate[1]),
          Number(brazilianDate[4] || 0),
          Number(brazilianDate[5] || 0),
          Number(brazilianDate[6] || 0),
        ).getTime()
      : new Date(value).getTime();
    return Number.isFinite(parsed) ? parsed : 0;
  };
  rows.sort((a, b) => {
    if (sort === "alphabetical")
      return a.document.title.localeCompare(b.document.title, "pt-BR", { sensitivity: "base" });
    if (sort === "effective") return time(b.document.effectiveAt) - time(a.document.effectiveAt);
    if (sort === "updated") return time(b.document.updatedAt) - time(a.document.updatedAt);
    if (sort === "popular")
      return (accessCounts[b.document.id] || 0) - (accessCounts[a.document.id] || 0);
    if (sort === "recent") return time(b.document.createdAt) - time(a.document.createdAt);
    if (a.relevance !== b.relevance) return b.relevance - a.relevance;
    return time(b.document.updatedAt) - time(a.document.updatedAt);
  });
  return rows.map(({ document }) => document);
}

export function relatedPortalDocuments(
  document: PortalDocument,
  documents: PortalDocument[],
  limit = 5,
) {
  const sourceTags = new Set(document.tags.map(normalizePortalText).filter(Boolean));
  return documents
    .filter((candidate) => candidate.id !== document.id)
    .map((candidate) => {
      let score = 0;
      if (
        document.subprocess &&
        normalizePortalText(candidate.subprocess) === normalizePortalText(document.subprocess)
      )
        score += 10;
      if (
        document.process &&
        normalizePortalText(candidate.process) === normalizePortalText(document.process)
      )
        score += 7;
      if (
        document.area &&
        normalizePortalText(candidate.area) === normalizePortalText(document.area)
      )
        score += 4;
      if (normalizePortalText(candidate.type) === normalizePortalText(document.type)) score += 2;
      score += candidate.tags.reduce(
        (total, tag) => total + (sourceTags.has(normalizePortalText(tag)) ? 1 : 0),
        0,
      );
      return { candidate, score };
    })
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        new Date(b.candidate.updatedAt).getTime() - new Date(a.candidate.updatedAt).getTime(),
    )
    .slice(0, Math.max(0, limit))
    .map(({ candidate }) => candidate);
}
