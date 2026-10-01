import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/lib/bpmn-images.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const {
  BpmnImageResize,
  IMAGE_PENDING,
  encodeBpmnImage,
  isBpmnImagePending,
  readBpmnImageElement,
} = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("image payload is stored in standard BPMN documentation", () => {
  const payload = {
    src: "data:image/png;base64,AA==",
    name: "referencia.png",
    aspectRatio: 16 / 9,
  };
  const element = {
    businessObject: {
      documentation: [{ text: encodeBpmnImage(payload) }],
    },
  };
  assert.deepEqual(readBpmnImageElement(element), payload);
});

test("pending image is detected without exposing a diagram label", () => {
  const element = {
    businessObject: { documentation: [{ text: IMAGE_PENDING }] },
  };
  assert.equal(isBpmnImagePending(element), true);
  assert.equal(readBpmnImageElement(element), null);
});

test("interactive image resize preserves its source aspect ratio", () => {
  const handlers = new Map();
  BpmnImageResize({
    on(name, priority, handler) {
      handlers.set(name, handler);
    },
  });
  const ratio = 337 / 98;
  const shape = {
    x: 100,
    y: 200,
    width: 240,
    height: 240 / ratio,
    businessObject: {
      documentation: [
        {
          text: encodeBpmnImage({
            src: "data:image/png;base64,AA==",
            name: "referencia.png",
            aspectRatio: ratio,
          }),
        },
      ],
    },
  };
  const event = {
    context: {
      shape,
      direction: "se",
      newBounds: { x: 100, y: 200, width: 360, height: 240 },
    },
  };
  handlers.get("resize.move")(event);
  assert.equal(event.context.newBounds.width, 360);
  assert.ok(Math.abs(event.context.newBounds.height - 360 / ratio) < 0.001);
});
