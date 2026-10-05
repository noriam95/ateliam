import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setup, ids } from "./user-tasks-fixture.mjs";
test("checklist modular: proteção de padrão, anexos e modalidade Outros", async () => {
  const { db, user, command, read } = await setup(true);
  try {
    await db.exec(
      "alter table profiles add column avatar_data_url text; grant select on profiles to authenticated; create table organization_departments(id uuid primary key,organization_id uuid,name text); grant select on organization_departments to authenticated;",
    );
    for (const f of [
      "20260911100000_tasks_workflow_v2.sql",
      "20260911150000_task_card_routing_comments.sql",
      "20260914120000_modular_task_checklist.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    await db.exec(
      "alter table user_tasks add column deleted_at timestamptz; alter table user_tasks add column deleted_by uuid references profiles(id);",
    );
    await db.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261005153000_mapping_scenario_flowchart_temporary_areas.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.query("update profiles set avatar_data_url=$1 where id=$2", [
      "https://example.com/photo.png",
      ids.analyst,
    ]);
    await user("admin");
    const id = crypto.randomUUID();
    await assert.rejects(
      command("create", {
        id,
        title: "Teste UX",
        kind: "mapping",
        modality: "Sistemas",
        mappingScenario: "FUTURO",
        assignedTo: ids.analyst,
        startsOn: "2026-09-14",
        dueOn: "2026-09-30",
      }),
      /cenário AS IS ou TO BE/,
    );
    await command("create", {
      id,
      title: "Teste UX",
      kind: "mapping",
      modality: "Sistemas",
      mappingScenario: "TO BE",
      assignedTo: ids.analyst,
      startsOn: "2026-09-14",
      dueOn: "2026-09-30",
    });
    let t = await read(id);
    await command("start_documentation", {
      id,
      revision: t.revision,
      note: "Levantar requisitos com a área.",
    });
    const feed = (
      await db.query("select user_tasks_feed($1,$2::jsonb) result", [
        ids.org,
        JSON.stringify({ id }),
      ])
    ).rows[0].result;
    assert.equal(feed.tasks[0].assignee_photo, "https://example.com/photo.png");
    assert.equal(
      feed.events.find((e) => e.movement_action).movement_note,
      "Levantar requisitos com a área.",
    );
    assert.equal(feed.tasks[0].mapping_scenario, "TO BE");
    t = await read(id);
    assert.equal(t.checklist.find((i) => i.group_key === "flowchart").entry_type, "flowchart");
    const key = t.checklist.find((i) => i.entry_type === "mapping").key;
    const started = await command("begin_document", { id, revision: t.revision, key });
    t = await read(id);
    const docId = t.checklist.find((i) => i.key === key).document_id;
    assert.ok(docId);
    const mappingContent = (
      await db.query("select content_inline::jsonb content from documents where id=$1", [docId])
    ).rows[0].content;
    assert.equal(mappingContent.ddp.meta.modalidade, "TO BE");
    await user("coordinator");
    await assert.rejects(command("remove_entry", { id, revision: t.revision, key }), /responsável/);
    await user("analyst");
    await assert.rejects(
      command("remove_entry", { id, revision: t.revision - 1, key }),
      /alterada/,
    );
    await command("remove_entry", { id, revision: t.revision, key });
    t = await read(id);
    assert.equal(t.checklist.find((i) => i.key === key).document_id, null);
    assert.equal(t.checklist.find((i) => i.key === key).completed, false);
    assert.equal((await db.query("select id from documents where id=$1", [docId])).rows.length, 1);

    t = await read(id);
    const flowchartKey = t.checklist.find((i) => i.entry_type === "flowchart").key;
    const flowchartStarted = await command("begin_document", {
      id,
      revision: t.revision,
      key: flowchartKey,
    });
    const flowchart = (
      await db.query("select module,content_inline::jsonb content from documents where id=$1", [
        flowchartStarted.documentId,
      ])
    ).rows[0];
    assert.equal(flowchart.module, "bpmn");
    assert.equal(flowchart.content.bpmn.schemaVersion, 2);
    assert.match(flowchart.content.bpmn.processName, /TO BE/);
    assert.match(flowchart.content.bpmn.xml, /bpmndi:BPMNDiagram/);
    t = await read(id);

    await assert.rejects(command("remove_section", { id, revision: t.revision, key }), /padrão/);
    const extra = crypto.randomUUID();
    await command("add_item", {
      id,
      revision: t.revision,
      entryId: extra,
      label: "Entrega extra",
      entryType: "file",
    });
    t = await read(id);
    await command("remove_section", { id, revision: t.revision, key: extra });
    t = await read(id);
    assert.ok(!t.checklist.some((i) => i.key === extra));
    const fileKey = t.checklist.find((i) => i.entry_type === "file").key;
    const path = `${ids.org}/${id}/${fileKey}/evidencia.pdf`;
    await db.query("insert into storage.objects(bucket_id,name) values($1,$2)", [
      "user-task-files",
      path,
    ]);
    await command("attach_file", {
      id,
      revision: t.revision,
      key: fileKey,
      attachment: { path, name: "evidencia.pdf", size: 10 },
    });
    t = await read(id);
    await command("remove_entry", { id, revision: t.revision, key: fileKey });
    t = await read(id);
    assert.ok(t.checklist.some((i) => i.key === fileKey));
    assert.equal(t.checklist.find((i) => i.key === fileKey).completed, false);
    assert.ok(!t.checklist.find((i) => i.key === fileKey).attachment);
    const other = crypto.randomUUID();
    await command("create", {
      id: other,
      title: "Checklist livre",
      kind: "mapping",
      modality: "Outros",
      mappingScenario: "AS IS",
      assignedTo: ids.analyst,
      startsOn: "2026-09-14",
      dueOn: "2026-09-30",
    });
    let o = await read(other);
    assert.deepEqual(o.checklist, []);
    await command("start_documentation", {
      id: other,
      revision: o.revision,
      note: "Definir entregas.",
    });
    o = await read(other);
    const custom = crypto.randomUUID();
    await command("add_item", {
      id: other,
      revision: o.revision,
      entryId: custom,
      label: "Análise livre",
      entryType: "note",
    });
    o = await read(other);
    await command("remove_section", { id: other, revision: o.revision, key: custom });
    assert.deepEqual((await read(other)).checklist, []);
  } finally {
    await db.close();
  }
});
