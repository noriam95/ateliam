import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

await build({
  entryPoints: ["src/lib/bpmn-lanes.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".output/test-bpmn-lanes-drop.mjs",
});

const { resolveLaneDrop } = await import(
  `${pathToFileURL(`${process.cwd()}/.output/test-bpmn-lanes-drop.mjs`).href}?t=${Date.now()}`
);

const root = { id: "root" };
const pool = { type: "bpmn:Participant", x: 100, y: 100, width: 600, height: 400, parent: root };
const secondPool = {
  type: "bpmn:Participant",
  x: 100,
  y: 600,
  width: 600,
  height: 200,
  parent: root,
};
const laneSet = {};
const first = {
  type: "bpmn:Lane",
  x: 130,
  y: 100,
  width: 545,
  height: 200,
  parent: pool,
  businessObject: { $parent: laneSet },
  di: { isHorizontal: true },
};
const second = {
  ...first,
  y: 300,
  businessObject: { $parent: laneSet },
};
const registry = { filter: (predicate) => [pool, secondPool, first, second].filter(predicate) };

test("dropping in the uncovered pool margin inserts beside the nearest lane", () => {
  assert.deepEqual(resolveLaneDrop(registry, root, { x: 105, y: 390, context: {} }), {
    target: second,
    after: false,
  });
});

test("a pool without lanes is itself the insertion target", () => {
  assert.deepEqual(resolveLaneDrop(registry, root, { x: 400, y: 700, context: {} }), {
    target: secondPool,
    after: false,
  });
});

test("reordering cannot move a lane into another pool", () => {
  assert.equal(resolveLaneDrop(registry, root, { x: 400, y: 700, context: { lane: first } }), null);
});

test("releasing an existing lane over itself does not reorder it", () => {
  assert.equal(resolveLaneDrop(registry, root, { x: 300, y: 180, context: { lane: first } }), null);
});
