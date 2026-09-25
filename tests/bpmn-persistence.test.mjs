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
// Execute the exact repository filters and mutations against PostgreSQL, including concurrent CAS writes.
function client() {
  return {
    from(table) {
      assert.equal(table, "documents");
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
        const values = [];
        const param = (value) => {
          values.push(value);
          return `$${values.length}`;
        };
        let sql;
        if (mutation === "insert")
          sql = `insert into documents (${Object.keys(payload).join(",")}) values (${Object.values(payload).map(param).join(",")}) returning *`;
        else {
          const set =
            mutation === "update"
              ? `update documents set ${Object.entries(payload)
                  .map(([k, v]) => `${k}=${param(v)}`)
                  .join(",")}`
              : "select * from documents";
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
