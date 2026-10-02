import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/bpmn-library.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { filterAndSortBpmnRows } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

const rows = [
  {
    id: "2",
    code: "FLU.COM.010",
    title: "Recebimentos nacionais",
    current_version: 2,
    updated_at: "2026-10-02T12:00:00.000Z",
    area: "Comercial",
    created_at: "2026-09-30T12:00:00.000Z",
  },
  {
    id: "1",
    code: "FLU.ADM.002.TEMP",
    title: "Admissão de colaborador",
    current_version: 0,
    updated_at: "2026-09-28T12:00:00.000Z",
    area: "Recursos Humanos",
    created_at: "2026-09-25T12:00:00.000Z",
  },
];

test("filters drawings by keywords from every visible column", () => {
  assert.deepEqual(
    filterAndSortBpmnRows(rows, "comercial 010", "updated_at", "desc").map((row) => row.id),
    ["2"],
  );
  assert.deepEqual(
    filterAndSortBpmnRows(rows, "rascunho recursos", "updated_at", "desc").map((row) => row.id),
    ["1"],
  );
  assert.deepEqual(
    filterAndSortBpmnRows(rows, "30/09/2026", "updated_at", "desc").map((row) => row.id),
    ["2"],
  );
});

test("sorts drawings by text, numeric version and date columns", () => {
  assert.deepEqual(
    filterAndSortBpmnRows(rows, "", "code", "asc").map((row) => row.id),
    ["1", "2"],
  );
  assert.deepEqual(
    filterAndSortBpmnRows(rows, "", "current_version", "desc").map((row) => row.id),
    ["2", "1"],
  );
  assert.deepEqual(
    filterAndSortBpmnRows(rows, "", "created_at", "asc").map((row) => row.id),
    ["1", "2"],
  );
});
