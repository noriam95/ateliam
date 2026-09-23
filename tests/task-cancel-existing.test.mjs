import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setup, ids } from "./user-tasks-fixture.mjs";
test("cancelamento respeita etapa, ator, revisão e preserva registros; seleção filtra módulo", async () => {
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
      "20260915180000_task_cancel_existing_records.sql",
    ])
      await db.exec(
        await readFile(new URL("../supabase/migrations/" + f, import.meta.url), "utf8"),
      );
    const create = async () => {
      await user("admin");
      const id = crypto.randomUUID();
      await command("create", {
        id,
        title: "Teste cancelamento",
        note: "Descrição original para atendimento.",
        kind: "mapping",
        modality: "Sistemas",
        assignedTo: ids.analyst,
        requestedBy: ids.coordinator,
        startsOn: "2026-09-15",
        dueOn: "2026-09-16",
      });
      return id;
    };
    let id = await create();
    let t = await read(id);
    await assert.rejects(
      command("comment", {
        id,
        commentId: crypto.randomUUID(),
        note: "Anexos da solicitação inicial.",
        attachments: [{ path: "arquivo-inexistente", name: "escopo.pdf", size: 100 }],
      }),
      /Anexo/,
    );
    assert.equal(
      (
        await db.query(
          "select note from user_task_events where task_id=$1 and action='Comentário' order by created_at limit 1",
          [id],
        )
      ).rows[0].note,
      "Descrição original para atendimento.",
    );

    await user("coordinator");
    await assert.rejects(
      command("cancel", { id, revision: t.revision, note: "Cancelar demanda" }),
      /responsável/,
    );
    await user("analyst");
    await assert.rejects(command("cancel", { id, revision: t.revision, note: "" }), /motivo/);
    await command("request_complement", {
      id,
      revision: t.revision,
      note: "Completar solicitação",
    });
    t = await read(id);
    assert.equal(t.assigned_to, ids.coordinator);
    await user("coordinator");
    await command("cancel", { id, revision: t.revision, note: "Demanda retirada" });
    t = await read(id);
    assert.equal(t.status, "cancelled");
    assert.ok(t.checklist.length);
    await user("admin");
    await assert.rejects(
      command("admin_move", {
        id,
        revision: t.revision,
        note: "Tentar reabrir",
        stage: "documentation",
        assignedTo: ids.analyst,
      }),
      /cancelada/,
    );
    const events = (
      await db.query(
        "select * from user_task_events where task_id=$1 and movement_action='Cancelar tarefa'",
        [id],
      )
    ).rows;
    assert.equal(events[0].actor_id, ids.coordinator);
    assert.equal(events[0].movement_note, "Demanda retirada");
    assert.ok(events[0].created_at);
    for (const stage of ["intake", "documentation", "owner_approval"]) {
      id = await create();
      await db.exec("reset role");
      await db.query("update user_tasks set stage=$2 where id=$1", [id, stage]);
      await user("analyst");
      t = await read(id);
      await command("pause", { id, revision: t.revision, note: "Aguardar informações" });
      t = await read(id);
      await command("cancel", { id, revision: t.revision, note: "Solicitação retirada" });
      assert.equal((await read(id)).status, "cancelled");
    }
    id = await create();
    await db.exec("reset role");
    await db.query(
      "update user_tasks set stage='technical_review',assigned_to=$2,reviewer_id=$2 where id=$1",
      [id, ids.coordinator],
    );
    for (const who of ["coordinator", "admin"]) {
      await user(who);
      t = await read(id);
      for (const action of ["pause", "cancel"])
        await assert.rejects(
          command(action, { id, revision: t.revision, note: "Não permitido aqui" }),
          /atividade/,
        );
    }
    id = await create();
    await user("analyst");
    t = await read(id);
    await command("start_documentation", { id, revision: t.revision, note: "Iniciar atendimento" });
    t = await read(id);
    await command("item", {
      id,
      revision: t.revision,
      key: "mapping",
      documentId: "40000000-0000-4000-8000-000000000001",
      content: "Registro existente",
      completed: true,
    });
    t = await read(id);
    assert.equal(t.document_id, "40000000-0000-4000-8000-000000000001");
    const popId = crypto.randomUUID(),
      foreignId = crypto.randomUUID();
    await db.exec("reset role");
    await db.query(
      "insert into documents(id,organization_id,name,module,owner_id,content_inline) values($1,$2,'POP anterior','pop',$3,'{}'),($4,$5,'Outro órgão','ddp',$3,'{}')",
      [popId, ids.org, ids.analyst, foreignId, ids.otherOrg],
    );
    await user("analyst");
    const extra = crypto.randomUUID();
    await command("add_entry", { id, revision: t.revision, key: "mapping", entryId: extra });
    t = await read(id);
    await assert.rejects(
      command("item", {
        id,
        revision: t.revision,
        key: extra,
        documentId: popId,
        content: "",
        completed: false,
      }),
      /mapeamento/,
    );
    await assert.rejects(
      command("item", {
        id,
        revision: t.revision,
        key: extra,
        documentId: foreignId,
        content: "",
        completed: false,
      }),
      /organização/,
    );
    const feed = async (filters) =>
      (
        await db.query("select user_tasks_feed($1,$2::jsonb) data", [
          ids.org,
          JSON.stringify(filters),
        ])
      ).rows[0].data;
    assert.ok(
      (await feed({ documentQuery: "", documentModule: "ddp" })).documents.every(
        (d) => d.module === "ddp",
      ),
    );
    assert.equal((await feed({ documentQuery: "", documentModule: "pop" })).documents.length, 1);
    assert.ok((await feed({ status: "open" })).tasks.every((t) => t.status !== "cancelled"));
  } finally {
    await db.close();
  }
});
