import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setup, ids } from "./user-tasks-fixture.mjs";
test("Home: conclusão tem data estável, reabertura remove contagem e escopo é pessoal", async () => {
  const { db, user, command, read } = await setup(true);
  try {
    await db.exec(
      "alter table organizations add column name text; alter table profiles add column avatar_data_url text; grant select on profiles to authenticated; create table organization_departments(id uuid primary key,organization_id uuid,name text);",
    );
    for (const f of [
      "20260911100000_tasks_workflow_v2.sql",
      "20260911150000_task_card_routing_comments.sql",
      "20260914120000_modular_task_checklist.sql",
      "20260914170000_home_dashboard.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    await user("admin");
    const id = crypto.randomUUID();
    const day = (
      await db.query("select (now() at time zone 'America/Cuiaba')::date::text as stamp")
    ).rows[0].stamp;
    await command("create", {
      id,
      title: "Conclusão Home",
      kind: "document",
      assignedTo: ids.analyst,
      startsOn: day,
      dueOn: day,
    });
    let t = await read(id);
    await command("transition", {
      id,
      revision: t.revision,
      status: "completed",
      note: "Entrega finalizada.",
      confirmPending: true,
    });
    t = await read(id);
    assert.ok(t.completed_at);
    await user("analyst");
    const get = async () =>
      (await db.query("select user_home_dashboard($1,$2,$2,$2,$2) data", [ids.org, day])).rows[0]
        .data;
    assert.equal((await get()).completions[0].count, 1);
    assert.equal((await get()).tasks.length, 0);
    await user("coordinator");
    assert.equal((await get()).completions.length, 0);
    await assert.rejects(
      db.query("select user_home_dashboard($1,$2,$2,$2,$2)", [ids.otherOrg, day]),
    );
    await user("admin");
    await command("transition", {
      id,
      revision: t.revision,
      status: "pending",
      note: "Reabertura para ajustes.",
    });
    await user("analyst");
    assert.equal((await get()).completions.length, 0);
    assert.equal((await get()).tasks.length, 1);
  } finally {
    await db.close();
  }
});
