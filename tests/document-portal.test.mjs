import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/document-portal.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  filterAndSortPortalDocuments,
  isPortalCurrentStatus,
  portalDocumentsForArea,
  portalDocumentsForProcess,
  relatedPortalDocuments,
} = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

const base = {
  module: "pop",
  moduleLabel: "Documentação",
  macroprocess: "Comercial",
  subprocess: "Exportação Direta",
  description: "Procedimento oficial para faturamento e embarque.",
  tags: ["exportação", "algodão"],
  responsible: "Área Comercial",
  status: "Vigente",
  revision: "3",
  effectiveAt: "2026-09-28",
  createdAt: "2026-08-10T12:00:00Z",
  searchText: "faturamento embarque exportacao algodao",
};
const documents = [
  {
    ...base,
    id: "a",
    title: "Procedimento de Exportação de Algodão",
    code: "POP.COM.003",
    type: "POP",
    area: "Comercial",
    process: "Comercial Algodão",
    updatedAt: "2026-10-02T12:00:00Z",
  },
  {
    ...base,
    id: "b",
    title: "Instrução de Reembolso",
    code: "IT.FIN.001",
    type: "IT",
    area: "Financeiro",
    macroprocess: "Financeiro",
    process: "Contas a pagar",
    subprocess: "Reembolsos",
    description: "Instrução oficial para reembolso de despesas.",
    responsible: "Área Financeira",
    updatedAt: "2026-09-20T12:00:00Z",
    tags: ["despesa"],
    searchText: "reembolso despesa",
  },
];

test("recognizes only statuses available to the document portal", () => {
  for (const status of ["Vigente", "Publicado", "Aprovado", "Concluído", "Ativo"]) {
    assert.equal(isPortalCurrentStatus(status), true);
  }
  for (const status of ["Rascunho", "Em revisão", "Obsoleto", "Arquivado", "Cancelado"]) {
    assert.equal(isPortalCurrentStatus(status), false);
  }
});

test("sorts effective dates written in Brazilian format", () => {
  const dated = [
    { ...documents[0], id: "old", effectiveAt: "30/09/2026" },
    { ...documents[1], id: "new", effectiveAt: "02/10/2026" },
  ];
  assert.deepEqual(
    filterAndSortPortalDocuments(dated, "", {}, "effective").map((document) => document.id),
    ["new", "old"],
  );
});

test("search is partial, accent-insensitive and combines terms across metadata", () => {
  assert.deepEqual(
    filterAndSortPortalDocuments(documents, "ALGOD exportacao", {}, "relevance").map(
      (document) => document.id,
    ),
    ["a"],
  );
  assert.deepEqual(
    filterAndSortPortalDocuments(documents, "comercial faturamento", {}, "relevance").map(
      (document) => document.id,
    ),
    ["a"],
  );
});

test("combines filters and supports popularity ordering", () => {
  assert.deepEqual(
    filterAndSortPortalDocuments(documents, "", { area: "Financeiro", type: "IT" }, "recent").map(
      (document) => document.id,
    ),
    ["b"],
  );
  assert.deepEqual(
    filterAndSortPortalDocuments(documents, "", {}, "popular", { a: 2, b: 7 }).map(
      (document) => document.id,
    ),
    ["b", "a"],
  );
  assert.deepEqual(
    filterAndSortPortalDocuments(
      documents,
      "",
      { macroprocess: "Financeiro", subprocess: "Reembolsos", responsible: "Área Financeira" },
      "relevance",
    ).map((document) => document.id),
    ["b"],
  );
});

test("prioritizes related documents from the same process and area", () => {
  const related = [
    ...documents,
    {
      ...documents[0],
      id: "c",
      title: "Política comercial",
      type: "Política",
      process: "Comercial Algodão",
      subprocess: "Mercado interno",
    },
  ];
  assert.deepEqual(
    relatedPortalDocuments(documents[0], related).map((document) => document.id),
    ["c"],
  );
});

test("catalog associations match areas without accent differences and processes by registered id", () => {
  const catalogDocuments = [
    { ...documents[0], id: "area", area: "Logística e Suprimentos", processId: "process-1" },
    { ...documents[1], id: "other-area", area: "Financeiro", processId: "process-2" },
    { ...documents[0], id: "unlinked", area: "Logística e Suprimentos", processId: "" },
  ];

  assert.deepEqual(
    portalDocumentsForArea(catalogDocuments, "Logistica e Suprimentos").map(
      (document) => document.id,
    ),
    ["area", "unlinked"],
  );
  assert.deepEqual(
    portalDocumentsForProcess(catalogDocuments, "process-1").map((document) => document.id),
    ["area"],
  );
});

test("searches role and chain metadata, with exact filters and ancestor process links", () => {
  const rows = [
    {
      ...documents[0],
      roles: ["Comprador"],
      chainNames: ["Logística & Supply Chain"],
      chainIds: ["chain-1", "output-1"],
      processIds: ["parent", "leaf"],
      processId: "leaf",
    },
    documents[1],
  ];
  assert.deepEqual(
    filterAndSortPortalDocuments(rows, "comprador logistica", {}, "relevance").map((d) => d.id),
    ["a"],
  );
  assert.equal(
    filterAndSortPortalDocuments(
      rows,
      "",
      { role: "comprador", chain: "output-1", processId: "parent" },
      "relevance",
    ).length,
    1,
  );
  assert.equal(
    filterAndSortPortalDocuments(rows, "", { role: "Analista", chain: "chain-1" }, "relevance")
      .length,
    0,
  );
  assert.equal(
    filterAndSortPortalDocuments(rows, "", { chain: "another-organization-chain" }, "relevance")
      .length,
    0,
  );
});
