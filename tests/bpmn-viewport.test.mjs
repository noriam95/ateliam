import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/lib/bpmn-viewport.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { selectedByRectangle, edgeIdentification } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const viewport = { x: 0, y: 0, width: 800, height: 500 };
test("rectangle selects partially overlapping shapes and crossed connections without selecting their background pool", () => {
  const box = { x: 100, y: 100, width: 100, height: 100 };
  assert.equal(
    selectedByRectangle(
      { parent: {}, type: "bpmn:Task", x: 190, y: 190, width: 80, height: 60 },
      box,
    ),
    true,
  );
  assert.equal(
    selectedByRectangle(
      { parent: {}, type: "bpmn:Task", x: 201, y: 201, width: 80, height: 60 },
      box,
    ),
    false,
  );
  assert.equal(
    selectedByRectangle(
      { parent: {}, type: "bpmn:Participant", x: 0, y: 0, width: 600, height: 400 },
      box,
    ),
    false,
  );
  assert.equal(
    selectedByRectangle(
      {
        parent: {},
        waypoints: [
          { x: 0, y: 150 },
          { x: 300, y: 150 },
        ],
      },
      box,
    ),
    true,
  );
  assert.equal(
    selectedByRectangle(
      {
        parent: {},
        waypoints: [
          { x: 0, y: 50 },
          { x: 300, y: 50 },
        ],
      },
      box,
    ),
    false,
  );
});
test("edge identifiers appear only for clipped names of visible regions, and disappear when names return", () => {
  const region = { x: -200, y: 80, width: 1200, height: 250 };
  assert.equal(
    edgeIdentification(region, { x: 10, y: 100, width: 20, height: 80 }, viewport),
    null,
  );
  const position = edgeIdentification(region, { x: -190, y: 100, width: 20, height: 80 }, viewport);
  assert.ok(position);
  assert.equal(position.left, 8);
  assert.equal(
    edgeIdentification(
      { x: -500, y: 0, width: 200, height: 200 },
      { x: -480, y: 10, width: 20, height: 50 },
      viewport,
    ),
    null,
  );
  assert.ok(edgeIdentification(region, { x: 10, y: -40, width: 20, height: 80 }, viewport));
  const presentation = edgeIdentification(
    region,
    { x: -190, y: viewport.height - 20, width: 20, height: 80 },
    viewport,
    { width: 240, height: 38 },
  );
  assert.equal(presentation.maxWidth, 240);
  assert.ok(presentation.top + 38 <= viewport.height - 8);
});
