import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setup, ids } from "./user-tasks-fixture.mjs";

test("reuniões: exclusão reversível, permissões, revisão e histórico", async () => {
  const { db, user } = await setup(true);
  try {
    await db.exec("grant select on profiles to authenticated;");
    for (const name of [
      "20260911100000_tasks_workflow_v2.sql",
      "20260911110000_task_meetings.sql",
      "20260924140000_meeting_soft_delete.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + name, import.meta.url), "utf8"),
      );
    const id = crypto.randomUUID();
    const payload = {
      id,
      taskId: null,
      title: "Reunião de teste",
      startsAt: "2026-09-24T14:00:00Z",
      endsAt: "2026-09-24T15:00:00Z",
      agenda: "Pauta preservada",
      attendees: ["pessoa@example.com"],
      status: "scheduled",
    };
    const save = async (revision) =>
      (
        await db.query("select task_meeting_save($1,$2::jsonb) data", [
          ids.org,
          JSON.stringify({ ...payload, revision }),
        ])
      ).rows[0].data;
    const change = async (action, revision, org = ids.org) =>
      (
        await db.query("select task_meeting_visibility($1,$2,$3,$4) data", [
          org,
          id,
          revision,
          action,
        ])
      ).rows[0].data;
    await user("analyst");
    const initial = await save();
    await user("owner");
    await assert.rejects(change("delete", initial.revision), /organizador/);
    await user("outsider");
    await assert.rejects(change("delete", initial.revision), /negado/);
    await user("analyst");
    await assert.rejects(change("delete", initial.revision + 1), /alterada/);
    const removed = await change("delete", initial.revision);
    assert.ok(removed.deleted_at);
    assert.equal(removed.deleted_by, ids.analyst);
    assert.equal(removed.agenda, initial.agenda);
    assert.deepEqual(removed.attendees, initial.attendees);
    assert.equal((await change("delete", initial.revision)).revision, removed.revision);
    await assert.rejects(save(removed.revision), /excluída/);
    await user("admin");
    const restored = await change("restore", removed.revision);
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.status, "scheduled");
    assert.equal(
      (await db.query("select * from task_meeting_events where meeting_id=$1", [id])).rows.length,
      2,
    );
    await assert.rejects(change("delete", restored.revision, ids.otherOrg), /negado|indisponível/);
  } finally {
    await db.close();
  }
});
