import { test } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
const load = async (path) => {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  return import(
    "data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64")
  );
};
const { documentLabel, documentTitle, mappingCodeForMode } = await load(
  "src/lib/document-label.ts",
);
const { prepareMappingIdentity } = await load("src/lib/mapping-identity.ts");
const { reserveOrganizationCode } = await load("src/lib/code-reservation.ts");

test("document labels contain their code once, including legacy and TEMP names", () => {
  for (const name of [
    "Gestão",
    "MAP.BIA.001 - Gestão",
    "MAP.BIA.001 · MAP.BIA.001 — Gestão",
    "map.bia.001 - Gestão",
  ]) {
    assert.equal(documentLabel("MAP.BIA.001", name), "MAP.BIA.001 · Gestão");
  }
  assert.equal(
    documentLabel("MAP.BIA.001.TEMP", "MAP.BIA.001 - Gestão"),
    "MAP.BIA.001.TEMP · Gestão",
  );
  assert.equal(documentLabel("MAP.BIA.001", "MAP.BIA.001.TEMP - Gestão"), "MAP.BIA.001 · Gestão");
  assert.equal(documentTitle("MAP.BIA.0012 - Outro", "MAP.BIA.001"), "MAP.BIA.0012 - Outro");
  assert.equal(documentLabel("", "Gestão"), "Gestão");
  assert.equal(documentLabel("MAP.BIA.001", "MAP.BIA.001"), "MAP.BIA.001");
});
test("draft identity is stable across saves and becomes definitive without consuming another number", async () => {
  let reservations = 0;
  const reserve = async (area) => {
    assert.equal(area, "BI Analytics");
    reservations++;
    return "MAP.BIA.001";
  };
  const content = JSON.stringify({
    ddp: {
      meta: { titulo: "Gestão", area: "BI Analytics", codigo: "" },
      steps: [{ text: "Preservar" }],
    },
    persistence: { imported: true },
  });
  const first = await prepareMappingIdentity({ content, automatic: true, mode: "draft", reserve });
  assert.equal(first.code, "MAP.BIA.001.TEMP");
  const again = await prepareMappingIdentity({
    content: first.content,
    savedContent: first.content,
    automatic: true,
    mode: "draft",
    reserve,
  });
  assert.equal(again.code, first.code);
  const final = await prepareMappingIdentity({
    content: again.content,
    savedContent: again.content,
    automatic: true,
    mode: "final",
    reserve,
  });
  assert.equal(final.code, "MAP.BIA.001");
  assert.equal(reservations, 1);
  assert.deepEqual(JSON.parse(final.content).ddp.steps, [{ text: "Preservar" }]);
  assert.deepEqual(JSON.parse(final.content).persistence, {
    imported: true,
    draft: false,
    saveMode: "final",
  });
});
test("existing drafts gain TEMP and automatic new copies cannot reuse a supplied code", async () => {
  const content = JSON.stringify({ ddp: { meta: { codigo: "MAP.BIA.004", area: "BIA" } } });
  const reserve = async () => "MAP.BIA.005";
  assert.equal(
    (
      await prepareMappingIdentity({
        content,
        savedContent: content,
        automatic: true,
        mode: "draft",
        reserve,
      })
    ).code,
    "MAP.BIA.004.TEMP",
  );
  assert.equal(
    (
      await prepareMappingIdentity({
        content,
        requestedCode: "MAP.BIA.004",
        automatic: true,
        mode: "draft",
        reserve,
      })
    ).code,
    "MAP.BIA.005.TEMP",
  );
  assert.equal(mappingCodeForMode("MAP.BIA.004.TEMP.TEMP", "draft"), "MAP.BIA.004.TEMP");
});
test("manual codes, legacy modules envelope and reservation failures", async () => {
  const content = JSON.stringify({ modules: { ddp: { meta: { area: "BIA" } } } });
  const reserve = async () => {
    throw new Error("Sem conexão");
  };
  const result = await prepareMappingIdentity({
    content,
    requestedCode: "MAP.BIA.088",
    automatic: false,
    mode: "draft",
    reserve,
  });
  assert.equal(JSON.parse(result.content).modules.ddp.meta.codigo, "MAP.BIA.088.TEMP");
  await assert.rejects(
    prepareMappingIdentity({ content, automatic: true, mode: "draft", reserve }),
    /Sem conexão/,
  );
  await assert.rejects(
    prepareMappingIdentity({ content, automatic: false, mode: "final", reserve }),
    /Informe o código/,
  );
});

// Emulates PostgREST's conditional JSONB update, including competing snapshots.
function database(initial, documents = []) {
  let settings = structuredClone(initial);
  return {
    from(table) {
      const filters = new Map();
      let update;
      const query = {
        select() {
          return query;
        },
        order() {
          return query;
        },
        eq(k, v) {
          filters.set(k, v);
          return query;
        },
        is(k, v) {
          filters.set(k, v);
          return query;
        },
        update(v) {
          update = v;
          return query;
        },
        async range(a, b) {
          return { data: documents.slice(a, b + 1), error: null };
        },
        async single() {
          return { data: { code_settings: structuredClone(settings) }, error: null };
        },
        async maybeSingle() {
          assert.equal(table, "organizations");
          assert.equal(filters.get("id"), "org");
          const expected = filters.get("code_settings");
          if (JSON.stringify(settings) !== (expected === null ? "null" : expected))
            return { data: null, error: null };
          settings = structuredClone(update.code_settings);
          return { data: { id: "org" }, error: null };
        },
      };
      return query;
    },
  };
}
test("simultaneous reservations never share a number and skip existing final/draft codes", async () => {
  const db = database({ mapeamento: { mode: "auto", sequences: { BIA: 1 } } }, [
    { name: "MAP.BIA.009.TEMP - Rascunho", content_inline: "{}" },
    { name: "Legado", content_inline: '{"ddp":{"meta":{"codigo":"MAP.BIA.012"}}}' },
  ]);
  const codes = await Promise.all(
    Array.from({ length: 6 }, () => reserveOrganizationCode(db, "org", "mapeamento", "bia")),
  );
  assert.equal(new Set(codes).size, 6);
  assert.deepEqual(
    codes.sort(),
    [13, 14, 15, 16, 17, 18].map((n) => `MAP.BIA.0${n}`),
  );
});
test("empty settings initialize safely and invalid areas do not reserve", async () => {
  const db = database(null);
  assert.equal(await reserveOrganizationCode(db, "org", "mapeamento", "BIA"), "MAP.BIA.001");
  assert.equal(await reserveOrganizationCode(db, "org", "mapeamento", "ADM"), "MAP.ADM.001");
  await assert.rejects(reserveOrganizationCode(db, "org", "mapeamento", ""), /área responsável/);
});
