import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setup, ids } from "./user-tasks-fixture.mjs";
test("exclusão reversível exige admin, conserva dados e retira tarefa da Home e feeds ativos", async () => {
  const { db, user, command, read } = await setup(true);
  try {
    await db.exec(
      "alter table organizations add column name text; alter table profiles add column avatar_data_url text; grant select on profiles to authenticated; create table organization_departments(id uuid primary key,organization_id uuid,name text);",
    );
    for (const name of [
      "20260911100000_tasks_workflow_v2.sql",
      "20260911150000_task_card_routing_comments.sql",
      "20260914120000_modular_task_checklist.sql",
      "20260914170000_home_dashboard.sql",
      "20260924120000_task_soft_delete.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8"),
      );
    await user("admin");
    const id = crypto.randomUUID();
    await command("create", {
      id,
      title: "Solicitação preservada",
      kind: "mapping",
      modality: "Sistemas",
      documentId: "40000000-0000-4000-8000-000000000001",
      assignedTo: ids.analyst,
      startsOn: "2026-09-23",
      dueOn: "2026-09-26",
      note: "Escopo original.",
    });
    const original = await read(id);
    await user("analyst");
    await assert.rejects(command("delete", { id, revision: original.revision }), /administrador/);
    await user("outsider");
    await assert.rejects(command("delete", { id, revision: original.revision }), /negado/);
    await user("admin");
    await assert.rejects(command("delete", { id, revision: original.revision + 1 }), /alterada/);
    const result = await command("delete", { id, revision: original.revision });
    const deleted = await read(id);
    assert.ok(deleted.deleted_at);
    assert.equal(deleted.deleted_by, ids.admin);
    assert.deepEqual(deleted.checklist, original.checklist);
    assert.equal(deleted.document_id, original.document_id);
    assert.equal(
      (await command("delete", { id, revision: original.revision })).revision,
      result.revision,
    );
    const feed = async (filters) =>
      (
        await db.query("select user_tasks_feed($1,$2::jsonb) data", [
          ids.org,
          JSON.stringify(filters),
        ])
      ).rows[0].data;
    assert.equal((await feed({ team: true })).tasks.length, 0);
    assert.equal((await feed({ team: true, status: "deleted" })).tasks.length, 1);
    assert.ok((await feed({ id })).events.some((e) => e.action === "Tarefa excluída"));
    assert.ok((await feed({ id })).events.some((e) => e.note === "Escopo original."));
    await assert.rejects(
      command("comment", { id, commentId: crypto.randomUUID(), note: "Alterar excluída" }),
      /excluída/,
    );
    await user("analyst");
    assert.equal((await feed({ id })).tasks.length, 0);
    assert.equal((await feed({ status: "deleted" })).tasks.length, 0);
    const home = (
      await db.query("select user_home_dashboard($1,$2,$3,$2,$3) data", [
        ids.org,
        "2026-09-01",
        "2026-09-30",
      ])
    ).rows[0].data;
    assert.equal(home.tasks.length, 0);
    await assert.rejects(command("restore", { id, revision: deleted.revision }), /administrador/);
    await user("admin");
    await command("restore", { id, revision: result.revision });
    const restored = await read(id);
    assert.equal(restored.deleted_at, null);
    assert.deepEqual(restored.checklist, original.checklist);
    assert.equal(restored.status, original.status);
    assert.equal((await feed({ team: true })).tasks.length, 1);
    assert.ok((await feed({ id })).events.some((e) => e.action === "Tarefa restaurada"));
  } finally {
    await db.close();
  }
});
