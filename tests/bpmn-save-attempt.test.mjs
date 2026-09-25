import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/lib/bpmn-save-attempt.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { captureBpmnSaveAttempt } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);

test("edits during XML serialization remain dirty after saving the older snapshot", async () => {
  let revision = 3;
  let finish;
  const snapshot = { xml: "<older-snapshot/>" };
  const saving = captureBpmnSaveAttempt({
    id: "document",
    mutationId: "mutation",
    expectedVersion: 2,
    expectedUpdatedAt: "before",
    revision,
    capture: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  });
  revision++;
  finish(snapshot);
  const attempt = await saving;
  assert.equal(attempt.revision, 3);
  assert.notEqual(attempt.revision, revision);
  assert.equal(attempt.input.document, snapshot);
  assert.equal(attempt.input.expectedVersion, 2);
});

test("serialization failure does not produce a save attempt", async () => {
  await assert.rejects(
    captureBpmnSaveAttempt({
      id: "document",
      mutationId: "mutation",
      expectedVersion: null,
      expectedUpdatedAt: null,
      revision: 0,
      capture: async () => {
        throw new Error("serialization failed");
      },
    }),
    /serialization failed/,
  );
});
