import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";
const source = await readFile(
  new URL("../src/lib/dashboard-pagination.ts", import.meta.url),
  "utf8",
);
const { code } = await transform(source, { loader: "ts", format: "esm" });
const { dashboardRows } = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);
test("loads all records beyond the API page limit", async () => {
  const data = Array.from({ length: 1203 }, (_, id) => ({ id }));
  const calls = [];
  const result = await dashboardRows({
    range: async (a, b) => {
      calls.push([a, b]);
      return { data: data.slice(a, b + 1), error: null };
    },
  });
  assert.deepEqual(result.data, data);
  assert.deepEqual(calls, [
    [0, 499],
    [500, 999],
    [1000, 1499],
  ]);
});
test("never returns partial totals after a failed page", async () => {
  const result = await dashboardRows({
    range: async (a) =>
      a ? { data: null, error: { message: "failed" } } : { data: Array(500).fill({}), error: null },
  });
  assert.equal(result.data, null);
  assert.equal(result.error.message, "failed");
});
test("empty organization returns an empty collection", async () => {
  assert.deepEqual(await dashboardRows({ range: async () => ({ data: [], error: null }) }), {
    data: [],
    error: null,
  });
});
