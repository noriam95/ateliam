import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const source = await readFile(new URL("../src/lib/status-color.ts", import.meta.url), "utf8");
const { code } = await transform(source, { loader: "ts", format: "esm" });
const { statusColor, statusTone } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

test("workflow statuses use the same semantic tone in Portuguese, including accents", () => {
  assert.equal(statusTone("Em andamento"), "progress");
  assert.equal(statusTone("EM REVISÃO"), "review");
  assert.equal(statusTone("Aprovado"), "approved");
  assert.equal(statusTone("Concluído"), "completed");
  assert.equal(statusTone("Cancelada"), "cancelled");
  assert.equal(statusTone("Pendente"), "pending");
  assert.equal(statusTone("Não iniciada"), "pending");
  assert.equal(statusTone("Rascunho"), "neutral");
  assert.equal(statusColor("Em andamento"), "var(--status-progress)");
  assert.equal(statusColor("Pendente"), "var(--status-pending)");
});
