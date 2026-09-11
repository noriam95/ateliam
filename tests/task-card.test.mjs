import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setup, ids } from "./user-tasks-fixture.mjs";
test("encaminhamento comum, permissão de administrador e anexos privados", async () => {
  const { db, user, command, read } = await setup(true);
  try {
    await db.exec(
      "alter table profiles add column avatar_data_url text; grant select on profiles to authenticated",
    );
    for (const f of [
      "20260911100000_tasks_workflow_v2.sql",
      "20260911150000_task_card_routing_comments.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    await user("admin");
    const id = crypto.randomUUID();
    await command("create", {
      id,
      title: "Teste de card",
      kind: "mapping",
      modality: "Sistemas",
      assignedTo: ids.analyst,
      startsOn: "2026-09-11",
      dueOn: "2026-09-30",
    });
    let t = await read(id);
    await command("start_documentation", {
      id,
      revision: t.revision,
      note: "Documentar o processo",
    });
    t = await read(id);
    assert.equal(t.routing_description, "Documentar o processo");
    await user("coordinator");
    await assert.rejects(
      command("send_review", {
        id,
        revision: t.revision,
        note: "Revisar processo",
        reviewerId: ids.coordinator,
        confirmPending: true,
      }),
      /responsável/,
    );
    await user("analyst");
    const commentId = crypto.randomUUID();
    const path = `${ids.org}/${id}/comments/${ids.analyst}/${commentId}/evidencia.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
      "user-task-files",
      path,
    ]);
    await command("comment", {
      id,
      commentId,
      note: "Confira a evidência",
      attachments: [{ path, name: "evidencia.pdf", size: 10 }],
    });
    const feed = (
      await db.query("select user_tasks_feed($1,$2::jsonb) result", [
        ids.org,
        JSON.stringify({ id }),
      ])
    ).rows[0].result;
    assert.equal(feed.events.find((e) => e.id === commentId).attachments[0].path, path);
    await assert.rejects(
      command("comment", {
        id,
        commentId: crypto.randomUUID(),
        note: "Anexo externo",
        attachments: [{ path, name: "evidencia.pdf", size: 10 }],
      }),
      /Anexo inválido/,
    );
    await command("send_review", {
      id,
      revision: t.revision,
      note: "Revisar processo",
      reviewerId: ids.coordinator,
      confirmPending: true,
    });
    t = await read(id);
    assert.equal(t.routing_description, "Revisar processo");
  } finally {
    await db.close();
  }
});
