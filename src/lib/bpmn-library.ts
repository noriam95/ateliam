export type BpmnLibrarySortField =
  "code" | "title" | "current_version" | "updated_at" | "area" | "created_at";

export type BpmnLibrarySortDirection = "asc" | "desc";

export type BpmnLibraryRow = {
  id: string;
  code: string;
  title: string;
  current_version: number;
  updated_at: string;
  area: string | null;
  created_at: string;
};

function normalizeSearch(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

function formattedDate(value: string, includeTime: boolean) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return includeTime
    ? date.toLocaleString("pt-BR", { timeZone: "America/Cuiaba" })
    : date.toLocaleDateString("pt-BR", { timeZone: "America/Cuiaba" });
}

function searchableRow(row: BpmnLibraryRow) {
  return normalizeSearch(
    [
      row.code,
      row.title,
      row.current_version || "Rascunho",
      row.updated_at,
      formattedDate(row.updated_at, true),
      row.area || "Não informada",
      row.created_at,
      formattedDate(row.created_at, false),
    ].join(" "),
  );
}

export function filterAndSortBpmnRows(
  rows: BpmnLibraryRow[],
  search: string,
  sortField: BpmnLibrarySortField,
  sortDirection: BpmnLibrarySortDirection,
) {
  const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
  const filtered = terms.length
    ? rows.filter((row) => {
        const haystack = searchableRow(row);
        return terms.every((term) => haystack.includes(term));
      })
    : rows;
  const sign = sortDirection === "asc" ? 1 : -1;
  return [...filtered].sort((a, b) => {
    if (sortField === "current_version") {
      return (a.current_version - b.current_version) * sign || a.title.localeCompare(b.title);
    }
    if (sortField === "updated_at" || sortField === "created_at") {
      return (
        (new Date(a[sortField]).getTime() - new Date(b[sortField]).getTime()) * sign ||
        a.title.localeCompare(b.title)
      );
    }
    return (
      String(a[sortField] ?? "").localeCompare(String(b[sortField] ?? ""), "pt-BR", {
        numeric: true,
        sensitivity: "base",
      }) * sign || a.title.localeCompare(b.title)
    );
  });
}
