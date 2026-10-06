import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
import { pathToFileURL } from "node:url";

await build({
  entryPoints: ["src/lib/bpmn-engine-modules.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: ".output/test-bpmn-annotation.mjs",
});

const { AnnotationRenderer } = await import(
  `${pathToFileURL(`${process.cwd()}/.output/test-bpmn-annotation.mjs`).href}?t=${Date.now()}`
);

function renderAnnotation(colors = {}) {
  let render;
  const eventBus = {
    on(name, priority, handler) {
      assert.equal(name, "render.shape");
      assert.ok(priority > 1000);
      render = handler;
    },
  };
  const attrs = {};
  const rect = {
    style: {},
  };
  const bracket = { removed: false, remove() { this.removed = true; } };
  const gfx = { querySelector: () => bracket };
  const renderer = {
    drawShape(actualGfx, element, actualAttrs) {
      assert.equal(actualGfx, gfx);
      assert.equal(element.type, "bpmn:TextAnnotation");
      assert.equal(actualAttrs, attrs);
      return rect;
    },
  };
  AnnotationRenderer(eventBus, renderer);
  const element = {
    type: "bpmn:TextAnnotation",
    di: { get: (name) => colors[name] },
  };
  assert.equal(render({}, { element, gfx, attrs }), rect);
  assert.equal(bracket.removed, true);
  return rect.style;
}

test("annotations render as yellow filled rectangles with the native text renderer", () => {
  assert.deepEqual(renderAnnotation(), {
    fill: "#FFF2B3",
    stroke: "#B8862D",
    strokeWidth: "2px",
  });
});

test("annotations retain saved custom colors", () => {
  assert.deepEqual(renderAnnotation({ "bioc:fill": "#FDE047", "bioc:stroke": "#713F12" }), {
    fill: "#FDE047",
    stroke: "#713F12",
    strokeWidth: "2px",
  });
});
