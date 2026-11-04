import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/lib/portal-content-index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { portalContentIndex } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
test("indexes long content, late records and structured roles without treating narrative as a role", () => {
  const content = {
    content: "<p>" + "Orientação. ".repeat(1500) + " fim pesquisável</p>",
    responsibilities: Array.from({ length: 150 }, (_, i) => ({
      cargo: i === 149 ? "Comprador" : "Analista",
      responsabilidade: "Etapa " + i,
    })),
    flow: [{ actorType: "position", actorName: "Motorista" }],
    lanes: { lane: { kind: "position", name: "Inspetor" } },
    description: "Diretor mencionado apenas no texto",
  };
  const index = portalContentIndex(content);
  assert.ok(index.text.includes("fim pesquisável"));
  assert.ok(index.text.includes("Etapa 149"));
  assert.deepEqual(
    new Set(index.roles),
    new Set(["Analista", "Comprador", "Motorista", "Inspetor"]),
  );
  assert.ok(!index.text.includes("<p>"));
});
test("indexes BPMN labels and excludes image payloads, scripts and original imports", () => {
  const index = portalContentIndex({
    xml: '<bpmn:task name="Conferir recebimento"/><bpmn:documentation>Validar nota</bpmn:documentation>',
    originalXml: '<task name="segredo importado"/>',
    image: "data:image/png;base64,AAAA",
    content: "<script>bad()</script><p>Orientação válida</p>",
  });
  assert.ok(index.text.includes("Conferir recebimento"));
  assert.ok(index.text.includes("Validar nota"));
  for (const excluded of ["segredo importado", "base64", "bad()", "<script>"])
    assert.ok(!index.text.includes(excluded));
});
