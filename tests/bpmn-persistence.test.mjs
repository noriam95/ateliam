import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { build } from "esbuild";
const bundle = await build({
  entryPoints: ["src/lib/bpmn-persistence.server.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { persistBpmnDocument } = await import(
  "data:text/javascript;base64," + Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const db = new PGlite();
await db.exec(
  `create table documents (id uuid primary key, organization_id uuid not null, owner_id uuid not null, name text, module text,content_inline text,primary_process_id uuid,primary_process_version int,current_version int,updated_at text,created_at text default '2026-09-25T00:00:00.000Z')`,
);
await db.exec(
  `create table document_versions (id uuid default gen_random_uuid(), document_id uuid references documents(id), version_number int, author_id uuid, content_snapshot text, comment text, unique(document_id,version_number))`,
);
// Execute the exact repository filters and mutations against PostgreSQL, including concurrent CAS writes.
function client(failVersionInsert = () => false) {
  return {
    from(table) {
      assert.ok(["documents", "document_versions"].includes(table));
      let mutation = null,
        payload = null;
      const filters = [];
      const query = {
        select() {
          return query;
        },
        eq(key, value) {
          filters.push([key, value]);
          return query;
        },
        update(value) {
          mutation = "update";
          payload = value;
          return query;
        },
        insert(value) {
          mutation = "insert";
          payload = value;
          return query;
        },
        single: execute,
        maybeSingle: execute,
      };
      async function execute() {
        if (table === "document_versions" && mutation === "insert" && failVersionInsert())
          return { data: null, error: { message: "simulated history outage" } };
        // Simulate PostgreSQL JSONB normalization performed by production triggers.
        if (table === "document_versions" && mutation === "insert")
          payload.content_snapshot = JSON.stringify(JSON.parse(payload.content_snapshot), null, 2);
        const values = [];
        const param = (value) => {
          values.push(value);
          return `$${values.length}`;
        };
        let sql;
        if (mutation === "insert")
          sql = `insert into ${table} (${Object.keys(payload).join(",")}) values (${Object.values(payload).map(param).join(",")}) returning *`;
        else {
          const set =
            mutation === "update"
              ? `update ${table} set ${Object.entries(payload)
                  .map(([k, v]) => `${k}=${param(v)}`)
                  .join(",")}`
              : `select * from ${table}`;
          sql =
            set +
            " where " +
            filters.map(([k, v]) => `${k}=${param(v)}`).join(" and ") +
            (mutation === "update" ? " returning *" : "");
        }
        try {
          const result = await db.query(sql, values);
          return { data: result.rows[0] || null, error: null };
        } catch (error) {
          return { data: null, error: { message: error.message, code: error.code } };
        }
      }
      return query;
    },
  };
}
const org = "340be419-c81c-4259-83e2-466a88d2f825",
  user = "8af89f15-ec1a-4a1b-92ae-4f983dc33b28";
function input() {
  return {
    supabase: client(),
    userId: user,
    organizationId: org,
    id: crypto.randomUUID(),
    mutationId: crypto.randomUUID(),
    expectedVersion: null,
    expectedUpdatedAt: null,
    processVersion: 1,
    document: {
      schemaVersion: 2,
      xml: "<test/>",
      processId: "b7f45733-02ae-4d5a-b803-77e128a168ec",
      processName: "MERCADO INTERNO",
      laneBindings: {},
      status: "Rascunho",
      origin: "created",
    },
  };
}
test("BPMN save retries are idempotent and preserve one document/version", async () => {
  const data = input();
  const first = await persistBpmnDocument(data);
  const retry = await persistBpmnDocument(data);
  assert.equal(first.id, retry.id);
  assert.equal(retry.current_version, 1);
  assert.equal(JSON.parse(retry.content_inline).updatedBy, user);
});
test("Concurrent updates cannot silently overwrite the same saved version", async () => {
  const data = input();
  const row = await persistBpmnDocument(data);
  const update = { ...data, expectedVersion: 1, expectedUpdatedAt: row.updated_at };
  const results = await Promise.allSettled([
    persistBpmnDocument({
      ...update,
      mutationId: crypto.randomUUID(),
      document: { ...data.document, xml: "<one/>" },
    }),
    persistBpmnDocument({
      ...update,
      mutationId: crypto.randomUUID(),
      document: { ...data.document, xml: "<two/>" },
    }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(results.find((r) => r.status === "rejected").reason.message, /CONFLICT/);
  const latest = (await db.query("select * from documents where id=$1", [data.id])).rows[0];
  assert.equal(latest.current_version, 2);
  assert.ok(["<one/>", "<two/>"].includes(JSON.parse(latest.content_inline).bpmn.xml));
});
test("A stale timestamp is rejected even when the version is unchanged", async () => {
  const data = input();
  await persistBpmnDocument(data);
  await assert.rejects(
    persistBpmnDocument({
      ...data,
      mutationId: crypto.randomUUID(),
      expectedVersion: 1,
      expectedUpdatedAt: "stale",
    }),
    /CONFLICT/,
  );
});
test("Another organization's id cannot be overwritten or returned", async () => {
  const data = input();
  await persistBpmnDocument(data);
  await assert.rejects(
    persistBpmnDocument({
      ...data,
      organizationId: crypto.randomUUID(),
      mutationId: crypto.randomUUID(),
    }),
    /CONFLICT/,
  );
  const row = (await db.query("select * from documents where id=$1", [data.id])).rows[0];
  assert.equal(row.organization_id, org);
  assert.equal(row.current_version, 1);
});
test("Saving a deleted document does not recreate it without explicit new-document intent", async () => {
  const data = input();
  await assert.rejects(
    persistBpmnDocument({ ...data, expectedVersion: 3, expectedUpdatedAt: "2026-09-25" }),
    /removido/,
  );
});
test.after(async () => await db.close());
test("The central code is reserved once and stays immutable on later saves", async () => {
  let reservations = 0;
  const data = {
    ...input(),
    reserveCode: async () => {
      reservations++;
      return "FLU.COM.001";
    },
  };
  const first = await persistBpmnDocument(data);
  await persistBpmnDocument(data);
  const updated = await persistBpmnDocument({
    ...data,
    mutationId: crypto.randomUUID(),
    expectedVersion: 1,
    expectedUpdatedAt: first.updated_at,
    document: { ...data.document, codigo: "FLU.COM.999" },
  });
  assert.equal(reservations, 1);
  assert.equal(JSON.parse(updated.content_inline).bpmn.codigo, "FLU.COM.001");
  assert.equal(updated.name, "FLU.COM.001 - MERCADO INTERNO");
});

test("Drafts keep one temporary record; only explicit saves create immutable versions", async () => {
  const data = { ...input(), saveMode: "draft", reserveCode: async () => "FLU.COM.007" };
  let row = await persistBpmnDocument(data);
  const save = async (mode, xml) => {
    row = await persistBpmnDocument({
      ...data,
      saveMode: mode,
      mutationId: crypto.randomUUID(),
      expectedVersion: row.current_version,
      expectedUpdatedAt: row.updated_at,
      document: { ...data.document, xml },
    });
  };
  assert.equal(row.current_version, 0);
  assert.equal(JSON.parse(row.content_inline).bpmn.codigo, "FLU.COM.007.TEMP");
  await save("draft", "<draft-two/>");
  assert.equal(row.current_version, 0);
  await save("final", "<version-one/>");
  assert.equal(row.current_version, 1);
  assert.equal(JSON.parse(row.content_inline).bpmn.codigo, "FLU.COM.007");
  await save("draft", "<draft-three/>");
  assert.equal(row.current_version, 1);
  assert.equal(JSON.parse(row.content_inline).bpmn.status, "Rascunho");
  const history = await db.query("select * from document_versions where document_id=$1", [data.id]);
  assert.equal(history.rows.length, 1);
  assert.equal(JSON.parse(history.rows[0].content_snapshot).bpmn.xml, "<version-one/>");
  await save("final", "<version-two/>");
  assert.equal(row.current_version, 2);
});

test("An interrupted history write is recovered without losing the snapshot or allocating another version", async () => {
  let fail = true;
  const data = { ...input(), versionStore: client(() => fail) };
  await assert.rejects(persistBpmnDocument(data), /concluir o histórico/);
  const stored = (await db.query("select * from documents where id=$1", [data.id])).rows[0];
  assert.equal(stored.current_version, 1);
  assert.equal(JSON.parse(stored.content_inline).pendingVersion.version, 1);
  fail = false;
  const retry = await persistBpmnDocument(data);
  assert.equal(retry.current_version, 1);
  const history = (
    await db.query("select * from document_versions where document_id=$1", [data.id])
  ).rows;
  assert.equal(history.length, 1);
  assert.equal(JSON.parse(history[0].content_snapshot).bpmn.xml, "<test/>");
  assert.ok(!JSON.parse(history[0].content_snapshot).pendingVersion);
});

test("Concurrent draft saves are protected even though neither increments the version", async () => {
  const data = { ...input(), saveMode: "draft" };
  const row = await persistBpmnDocument(data);
  const results = await Promise.allSettled(
    ["<a/>", "<b/>"].map((xml) =>
      persistBpmnDocument({
        ...data,
        expectedVersion: 0,
        expectedUpdatedAt: row.updated_at,
        mutationId: crypto.randomUUID(),
        document: { ...data.document, xml },
      }),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.match(results.find((r) => r.status === "rejected").reason.message, /CONFLICT/);
});

test("An existing drawing without a code gets a temporary central code on its next draft save", async () => {
  const data = { ...input(), saveMode: "draft" };
  const row = await persistBpmnDocument(data);
  const saved = await persistBpmnDocument({
    ...data,
    mutationId: crypto.randomUUID(),
    expectedVersion: 0,
    expectedUpdatedAt: row.updated_at,
    reserveCode: async () => "FLU.COM.009",
  });
  assert.equal(saved.current_version, 0);
  assert.equal(JSON.parse(saved.content_inline).bpmn.codigo, "FLU.COM.009.TEMP");
});
