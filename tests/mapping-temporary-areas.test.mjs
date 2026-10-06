import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/mapping-temporary-areas.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  inferPrimaryMappingArea,
  mappingAreaNamesFromImport,
  normalizeAreaName,
  prepareBpmnTemporaryAreas,
  suggestAreaSigla,
} = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("normaliza áreas e gera siglas exclusivas", () => {
  assert.equal(normalizeAreaName("  Gestão   de Pessoas "), "GESTAO DE PESSOAS");
  assert.equal(suggestAreaSigla("Gestão de Pessoas", []), "GES");
  assert.notEqual(suggestAreaSigla("Gestão de Pessoas", ["GES"]), "GES");
});

test("extrai áreas únicas de etapas, subetapas e atividades do assistente", () => {
  const names = mappingAreaNamesFromImport({
    meta: {},
    steps: [
      {
        area: "Comercial",
        substeps: [
          {
            actorType: "area",
            actorName: "Financeiro",
            activities: [
              {
                actorType: "area",
                actorName: " comercial ",
                activities: [],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.deepEqual(names, ["Comercial", "Financeiro"]);
});

test("associa raias conhecidas e mantém áreas novas temporárias no assistente BPMN", () => {
  const prepared = prepareBpmnTemporaryAreas(
    [
      { id: "Lane_1", name: "Comercial" },
      { id: "Lane_2", name: "Financeiro" },
      { id: "Lane_3", name: " financeiro " },
      { id: "Lane_4", name: "A DEFINIR" },
    ],
    [{ id: "known-area", name: "Comercial", sigla: "COM" }],
    () => "00000000-0000-4000-8000-000000000001",
  );
  assert.equal(prepared.bindings.Lane_1.id, "known-area");
  assert.equal(prepared.areas.length, 1);
  assert.equal(prepared.bindings.Lane_2.id, prepared.bindings.Lane_3.id);
  assert.equal(prepared.bindings.Lane_4, undefined);
  assert.equal(prepared.areas[0].status, "temporary");
});

test("infere a área principal sem exigir intervenção em rascunhos do assistente", () => {
  assert.equal(
    inferPrimaryMappingArea("", null, [{ name: "Financeiro" }, { name: "Comercial" }]),
    "Financeiro",
  );
  assert.equal(inferPrimaryMappingArea("", "Operações", [{ name: "Financeiro" }]), "Operações");
  assert.equal(
    inferPrimaryMappingArea("Jurídico", "Operações", [{ name: "Financeiro" }]),
    "Jurídico",
  );
});
