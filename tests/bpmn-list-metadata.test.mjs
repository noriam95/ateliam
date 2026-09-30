import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/lib/bpmn-list-metadata.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { bpmnListMetadata } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("separates persisted draft code from repeated title prefixes without exposing XML", () => {
  assert.deepEqual(
    bpmnListMetadata(
      "FLU.ADM.001.TEMP - FLU.ADM.001 - Compras",
      JSON.stringify({
        bpmn: { codigo: "FLU.ADM.001.TEMP", processId: "process-1", xml: "private diagram" },
      }),
    ),
    { code: "FLU.ADM.001.TEMP", title: "Compras", processId: "process-1" },
  );
});
test("supports legacy metadata and preserves titles with hyphens", () => {
  assert.deepEqual(
    bpmnListMetadata(
      "FLU.ADM.002 - Compras - Nacional",
      JSON.stringify({ codigo: "FLU.ADM.002", processId: "legacy" }),
    ),
    { code: "FLU.ADM.002", title: "Compras - Nacional", processId: "legacy" },
  );
});
test("missing, malformed or non-string metadata does not break the library", () => {
  for (const content of [null, "invalid", "null", '{"bpmn":{"codigo":12,"processId":false}}']) {
    assert.deepEqual(bpmnListMetadata("Título original", content), {
      code: "",
      title: "Título original",
      processId: "",
    });
  }
});
