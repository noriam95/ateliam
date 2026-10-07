import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

await build({
  entryPoints: ["src/lib/bpmn-engine-modules.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".output/test-bpmn-lane-renderer.mjs",
});

const { LaneRenderer } = await import(
  `${pathToFileURL(`${process.cwd()}/.output/test-bpmn-lane-renderer.mjs`).href}?t=${Date.now()}`
);

test("imported lanes keep one pool frame and only one divider between lanes", () => {
  const originalDocument = globalThis.document;
  const lines = [];
  globalThis.document = {
    createElementNS(_namespace, tag) {
      assert.equal(tag, "line");
      const line = {
        attributes: {},
        style: {},
        setAttribute(name, value) {
          this.attributes[name] = value;
        },
      };
      lines.push(line);
      return line;
    },
  };
  try {
    let render;
    const eventBus = {
      on(_name, _priority, handler) {
        render = handler;
      },
    };
    const strokes = [];
    const rect = {
      style: {
        setProperty(...args) {
          strokes.push(args);
        },
      },
    };
    LaneRenderer(eventBus, { drawShape: () => rect });
    const pool = { type: "bpmn:Participant", x: 100, y: 50, width: 600, height: 400 };
    const laneSet = {};
    const first = {
      type: "bpmn:Lane",
      x: 130,
      y: 50,
      width: 545,
      height: 200,
      parent: pool,
      businessObject: { $parent: laneSet },
      di: { isHorizontal: true, get: () => undefined },
    };
    const second = {
      ...first,
      y: 250,
      businessObject: { $parent: laneSet },
    };
    pool.children = [first, second];
    const gfx = {
      appendChild: (line) => lines.includes(line),
      querySelector: () => null,
    };
    assert.equal(render({}, { element: first, gfx }), rect);
    assert.equal(lines.length, 1);
    assert.equal(render({}, { element: second, gfx }), rect);
    assert.equal(lines.length, 2);
    assert.deepEqual(strokes, [
      ["stroke", "none", "important"],
      ["stroke", "none", "important"],
    ]);
    assert.deepEqual(lines[0].attributes, {
      x1: "30",
      x2: "30",
      y1: "0",
      y2: "400",
    });
    assert.equal(lines[0].style.stroke, "#606770");
    assert.deepEqual(lines[1].attributes, {
      x1: "0",
      x2: "570",
      y1: "0",
      y2: "0",
    });
  } finally {
    globalThis.document = originalDocument;
  }
});
