import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

await build({
  entryPoints: ["src/lib/bpmn-colors.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".output/test-bpmn-colors.mjs",
});

const { BPMN_DEFAULT_COLORS, defaultBpmnColors } = await import(
  `${pathToFileURL(`${process.cwd()}/.output/test-bpmn-colors.mjs`).href}?t=${Date.now()}`
);

test("defines the BF Flow palette for every requested BPMN element", () => {
  assert.deepEqual(defaultBpmnColors("bpmn:UserTask"), {
    fill: "#EEF4FA",
    stroke: "#2563A6",
  });
  assert.deepEqual(defaultBpmnColors("bpmn:StartEvent"), {
    fill: "#EDF7ED",
    stroke: "#4E8A48",
  });
  assert.deepEqual(defaultBpmnColors("bpmn:EndEvent"), {
    fill: "#FBEDEE",
    stroke: "#B64C57",
  });
  assert.deepEqual(defaultBpmnColors("bpmn:ExclusiveGateway"), {
    fill: "#FFF5DE",
    stroke: "#B8862D",
  });
  assert.deepEqual(defaultBpmnColors("bpmn:TextAnnotation"), {
    fill: "#FFF2B3",
    stroke: "#B8862D",
  });
  assert.deepEqual(defaultBpmnColors("bpmn:SequenceFlow"), { stroke: "#343A40" });
  assert.deepEqual(defaultBpmnColors("bpmn:Lane"), {
    fill: "#FFFFFF",
    stroke: "#606770",
  });
  assert.equal(BPMN_DEFAULT_COLORS.connector.stroke, "#343A40");
});
