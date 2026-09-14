import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setup, ids } from "./user-tasks-fixture.mjs";
test("exportação de entregas: revisor vinculado pode consultar; terceiro e outra organização não", async () => {
  const { db, user, command, read } = await setup(true);
  try {
    await db.exec(
      "alter table organizations add column name text; alter table profiles add column avatar_data_url text; grant select on profiles to authenticated;",
    );
    for (const f of [
      "20260911100000_tasks_workflow_v2.sql",
      "20260911150000_task_card_routing_comments.sql",
      "20260914150000_task_delivery_exports.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    await user("admin");
    const id = crypto.randomUUID();
    await command("create", {
      id,
      title: "Exportação",
      kind: "mapping",
      modality: "Sistemas",
      assignedTo: ids.analyst,
      startsOn: "2026-09-14",
      dueOn: "2026-09-30",
    });
    let t = await read(id);
    await command("start_documentation", {
      id,
      revision: t.revision,
      note: "Atender solicitação.",
    });
    t = await read(id);
    await command("begin_document", { id, revision: t.revision, key: "mapping" });
    t = await read(id);
    await command("send_review", {
      id,
      revision: t.revision,
      reviewerId: ids.coordinator,
      note: "Revisar informações.",
      confirmPending: true,
    });
    await user("coordinator");
    const result = await db.query("select user_task_export_documents($1,$2) result", [ids.org, id]);
    assert.equal(result.rows[0].result.documents.length, 1);
    assert.equal(result.rows[0].result.documents[0].module, "ddp");
    await assert.rejects(db.query("select user_task_export_documents($1,$2)", [ids.otherOrg, id]));
    await user("outsider");
    await assert.rejects(db.query("select user_task_export_documents($1,$2)", [ids.org, id]));
  } finally {
    await db.close();
  }
});
