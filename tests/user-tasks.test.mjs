import { test } from "node:test";
import assert from "node:assert/strict";
import { setup, ids, installDeliveries } from "./user-tasks-fixture.mjs";
const doc = "40000000-0000-4000-8000-000000000001";
const taskId = "50000000-0000-4000-8000-000000000001";
const payload = (extra = {}) => ({
  id: taskId,
  documentId: doc,
  title: "Mapear manutenção",
  kind: "mapping",
  modality: "Sistemas",
  assignedTo: ids.analyst,
  startsOn: "2026-09-01",
  dueOn: "2026-09-20",
  ...extra,
});
const feed = async (db, filters = {}, org = ids.org) =>
  (await db.query("select user_tasks_feed($1,$2::jsonb) result", [org, JSON.stringify(filters)]))
    .rows[0].result;
test("tasks use document code, isolate organizations and enforce responsibility", async () => {
  const { db, user, command, read } = await setup();
  try {
    await user("coordinator");
    await command("create", payload());
    await command("create", payload());
    assert.equal((await db.query("select count(*)::int n from user_tasks")).rows[0].n, 1);
    await user("analyst");
    let data = await feed(db);
    assert.equal(data.tasks[0].code, "MAP.ADM.001");
    assert.equal(data.summary.mapping, 1);
    assert.equal((await feed(db, { kind: "document" })).total, 0);
    assert.equal((await feed(db, { from: "2026-09-21" })).total, 0);
    assert.equal((await feed(db, { from: "2026-09-10", until: "2026-09-12" })).total, 1);
    await user("owner");
    assert.equal((await feed(db)).total, 0);
    await assert.rejects(
      command("create", payload({ id: "50000000-0000-4000-8000-000000000002" })),
      /edição/,
    );
    await assert.rejects(
      command("transition", { id: taskId, revision: 0, status: "review" }),
      /responsável/,
    );
    await user("outsider");
    await assert.rejects(feed(db), /Acesso negado/);
    assert.equal((await db.query("select * from user_tasks")).rows.length, 0);
    await user("analyst");
    await assert.rejects(
      db.query("update user_tasks set status=$1 where id=$2", ["completed", taskId]),
      /permission denied/,
    );
    await command("item", {
      id: taskId,
      revision: 0,
      key: "requirements",
      content: "Requisitos iniciais",
      completed: false,
    });
    await assert.rejects(
      command("transition", { id: taskId, revision: 0, status: "review" }),
      /alterada/,
    );
    assert.equal((await read(taskId)).revision, 1);
  } finally {
    await db.close();
  }
});
test("draft is in progress; final save may complete; edits invalidate completion without blocking document modules", async () => {
  const { db, user, command, read } = await setup();
  try {
    await user("analyst");
    await command("create", payload());
    await db.query("update documents set content_inline=$1,updated_at=now() where id=$2", [
      JSON.stringify({
        ddp: { meta: { codigo: "MAP.ADM.001" } },
        persistence: { saveMode: "draft" },
      }),
      doc,
    ]);
    let d = (await db.query("select * from documents where id=$1", [doc])).rows[0];
    await command("item", {
      id: taskId,
      revision: 0,
      key: "mapping",
      documentId: doc,
      savedAt: d.updated_at,
      completed: false,
    });
    let t = (await feed(db)).tasks[0];
    assert.equal(t.checklist[0].completed, false);
    assert.ok(t.checklist[0].saved_at);
    await assert.rejects(
      command("item", {
        id: taskId,
        revision: 1,
        key: "mapping",
        documentId: doc,
        completed: true,
      }),
      /Rascunho/,
    );
    await db.query(
      "update documents set content_inline=$1,updated_at=clock_timestamp() where id=$2",
      [
        JSON.stringify({
          ddp: { meta: { codigo: "MAP.ADM.001" } },
          persistence: { saveMode: "final" },
        }),
        doc,
      ],
    );
    d = (await db.query("select * from documents where id=$1", [doc])).rows[0];
    await command("item", {
      id: taskId,
      revision: 1,
      key: "mapping",
      documentId: doc,
      savedAt: d.updated_at,
      completed: true,
    });
    assert.equal((await feed(db)).tasks[0].checklist[0].completed, true);
    await db.query("update documents set updated_at=clock_timestamp() where id=$1", [doc]);
    t = (await feed(db)).tasks[0];
    assert.equal(t.checklist[0].completed, false);
    assert.equal(t.checklist[0].stale, true);
    await assert.rejects(
      command("item", {
        id: taskId,
        revision: 2,
        key: "mapping",
        documentId: doc,
        savedAt: d.updated_at,
        completed: true,
      }),
      /outra versão/,
    );
    await db.query(
      "insert into documents(organization_id,module,name) values($1,'ddp','Mapeamento avulso preservado')",
      [ids.org],
    );
    assert.equal((await read(taskId)).revision, 2);
  } finally {
    await db.close();
  }
});
test("routing between users, adjustment loops, owner approval, comments and administrator override", async () => {
  const { db, user, command, read } = await setup();
  try {
    await user("analyst");
    await command("create", payload());
    await assert.rejects(
      command("send_review", { id: taskId, revision: 0, reviewerId: ids.coordinator }),
      /Confirme/,
    );
    await command("send_review", {
      id: taskId,
      revision: 0,
      reviewerId: ids.coordinator,
      confirmPending: true,
    });
    let t = await read(taskId);
    assert.equal(t.stage, "technical_review");
    assert.equal(t.assigned_to, ids.coordinator);
    assert.equal((await feed(db)).total, 0);
    assert.equal((await feed(db, { id: taskId })).total, 1);
    await assert.rejects(
      command("approve_review", { id: taskId, revision: 1, confirmPending: true }),
      /responsável/,
    );
    const commentId = "60000000-0000-4000-8000-000000000001";
    await command("comment", {
      id: taskId,
      commentId,
      note: "Mapeamento encaminhado com observações.",
    });
    await command("comment", {
      id: taskId,
      commentId,
      note: "Mapeamento encaminhado com observações.",
    });
    await user("coordinator");
    assert.equal((await feed(db)).total, 1);
    await assert.rejects(
      command("request_adjustments", { id: taskId, revision: 1, note: "" }),
      /Descreva/,
    );
    await command("request_adjustments", {
      id: taskId,
      revision: 1,
      note: "Detalhar os requisitos técnicos.",
    });
    t = await read(taskId);
    assert.equal(t.stage, "documentation");
    assert.equal(t.assigned_to, ids.analyst);
    assert.equal(t.return_stage, "technical_review");
    await user("analyst");
    await command("send_review", {
      id: taskId,
      revision: 2,
      reviewerId: ids.coordinator,
      confirmPending: true,
    });
    await user("coordinator");
    await command("approve_review", {
      id: taskId,
      revision: 3,
      confirmPending: true,
      note: "Revisão técnica aprovada.",
    });
    t = await read(taskId);
    assert.equal(t.stage, "owner_approval");
    assert.equal(t.assigned_to, ids.analyst);
    await user("analyst");
    await command("request_adjustments", {
      id: taskId,
      revision: 4,
      note: "Dono solicitou corrigir os volumes.",
    });
    t = await read(taskId);
    assert.equal(t.return_stage, "owner_approval");
    assert.equal(t.stage, "documentation");
    await command("send_review", { id: taskId, revision: 5, confirmPending: true });
    assert.equal((await read(taskId)).stage, "owner_approval");
    await assert.rejects(
      command("record_owner_approval", { id: taskId, revision: 6, confirmPending: true, note: "" }),
      /evidência/,
    );
    await command("record_owner_approval", {
      id: taskId,
      revision: 6,
      confirmPending: true,
      note: "João Silva aprovou por e-mail em 09/09/2026.",
    });
    t = await read(taskId);
    assert.equal(t.status, "completed");
    assert.ok(t.pending_at_transition.length > 0);
    assert.equal(t.checklist.find((i) => i.key === "validation").completed, true);
    assert.equal((await feed(db)).summary.mapping, 0);
    await user("admin");
    assert.equal((await feed(db, { team: true })).total, 1);
    await command("admin_move", {
      id: taskId,
      revision: 7,
      stage: "documentation",
      assignedTo: ids.admin,
      note: "Retomar documentação para conferência.",
    });
    assert.equal((await read(taskId)).assigned_to, ids.admin);
    for (const [i, modality] of ["Operacional", "Automação & IA", "Dados / BI"].entries()) {
      const id = `50000000-0000-4000-8000-00000000000${i + 2}`;
      await command("create", payload({ id, modality, assignedTo: ids.admin }));
      assert.ok((await read(id)).checklist.length >= 6);
    }
    const history = (await feed(db, { id: taskId })).events;
    assert.equal(history.filter((e) => e.action === "Comentário").length, 1);
    assert.ok(history.some((e) => e.note.includes("Itens pendentes")));
  } finally {
    await db.close();
  }
});

test("creation without document keeps selected requester, author and initial comment; links document later", async () => {
  const { db, user, command, read } = await setup();
  try {
    await user("coordinator");
    const input = payload({
      documentId: undefined,
      requestedBy: ids.owner,
      note: "Priorizar levantamento de requisitos.",
    });
    await command("create", input);
    await command("create", input);
    let task = await read(taskId);
    assert.equal(task.document_id, null);
    assert.equal(task.requested_by, ids.owner);
    assert.equal(task.created_by, ids.coordinator);
    const events = (await feed(db, { id: taskId })).events;
    assert.equal(events.length, 2);
    assert.equal(events.find((e) => e.action === "Comentário").note, input.note);
    assert.equal(events.find((e) => e.action === "Comentário").actor_name, "coordinator");
    await assert.rejects(
      command(
        "create",
        payload({ id: crypto.randomUUID(), documentId: undefined, requestedBy: ids.outsider }),
      ),
      /solicitante/,
    );
    await user("owner");
    assert.equal((await feed(db, { id: taskId })).total, 1);
    await user("analyst");
    assert.equal((await feed(db)).total, 1);
    assert.equal((await feed(db)).tasks[0].code, "");
    await command("item", {
      id: taskId,
      revision: 0,
      key: "mapping",
      content: "Levantamento iniciado",
      completed: false,
    });
    await assert.rejects(
      command("item", {
        id: taskId,
        revision: 1,
        key: "mapping",
        content: "Texto",
        completed: true,
      }),
      /documento principal/,
    );
    await command("item", {
      id: taskId,
      revision: 1,
      key: "mapping",
      documentId: doc,
      content: "",
      completed: false,
    });
    task = await read(taskId);
    assert.equal(task.document_id, doc);
    assert.equal((await feed(db)).tasks[0].code, "MAP.ADM.001");
  } finally {
    await db.close();
  }
});

test("modality templates support repeated forms, optional files, custom items and private attachments", async () => {
  const { db, user, command, read } = await setup(true);
  try {
    await user("analyst");
    for (const modality of ["Operacional", "Sistemas", "Automação & IA", "Dados / BI"]) {
      const id = crypto.randomUUID();
      await command("create", payload({ id, documentId: undefined, modality }));
      const t = await read(id);
      assert.deepEqual(
        t.checklist.map((i) => i.label),
        modality === "Operacional"
          ? ["Mapeamento", "Fluxograma", "POP", "Comunicado"]
          : ["Mapeamento", "Fluxograma", "Premissas"],
      );
    }
    await command("create", payload({ documentId: undefined, modality: "Operacional" }));
    let t = await read(taskId);
    const form = await command("begin_document", {
      id: taskId,
      revision: t.revision,
      key: "mapping",
    });
    let d = (await db.query("select * from documents where id=$1", [form.documentId])).rows[0];
    assert.equal(d.module, "ddp");
    assert.equal(JSON.parse(d.content_inline).persistence.saveMode, "draft");
    t = await read(taskId);
    assert.equal(t.checklist[0].completed, false);
    await assert.rejects(
      command("item", {
        id: taskId,
        revision: t.revision,
        key: "mapping",
        documentId: form.documentId,
        completed: true,
      }),
      /Rascunho/,
    );
    const second = crypto.randomUUID();
    await command("add_entry", {
      id: taskId,
      revision: t.revision,
      key: "mapping",
      entryId: second,
    });
    t = await read(taskId);
    const secondDoc = await command("begin_document", {
      id: taskId,
      revision: t.revision,
      key: second,
    });
    assert.notEqual(secondDoc.documentId, form.documentId);
    t = await read(taskId);
    const pop = await command("begin_document", { id: taskId, revision: t.revision, key: "pop" });
    assert.equal(
      (await db.query("select module from documents where id=$1", [pop.documentId])).rows[0].module,
      "pop",
    );
    t = await read(taskId);
    await command("add_item", {
      id: taskId,
      revision: t.revision,
      entryId: crypto.randomUUID(),
      label: "Evidência adicional",
      entryType: "file",
      optional: true,
    });
    t = await read(taskId);
    const path = `${ids.org}/${taskId}/flowchart/${crypto.randomUUID()}/fluxo.pdf`;
    await assert.rejects(
      command("attach_file", {
        id: taskId,
        revision: t.revision,
        key: "flowchart",
        attachment: { path, name: "fluxo.pdf", size: 10 },
      }),
      /Envie o arquivo/,
    );
    await db.query("insert into storage.objects(bucket_id,name) values('user-task-files',$1)", [
      path,
    ]);
    await command("attach_file", {
      id: taskId,
      revision: t.revision,
      key: "flowchart",
      attachment: { path, name: "fluxo.pdf", size: 10 },
    });
    t = await read(taskId);
    assert.equal(t.checklist.find((i) => i.key === "flowchart").completed, true);
    await assert.rejects(
      command("item", { id: taskId, revision: t.revision, key: "flowchart", completed: true }),
      /envio de anexo/,
    );
    await user("outsider");
    assert.equal((await db.query("select * from storage.objects")).rows.length, 0);
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values('user-task-files',$1)", [
        path + "2",
      ]),
      /row-level security/,
    );
    await user("analyst");
    await command("send_review", {
      id: taskId,
      revision: t.revision,
      reviewerId: ids.coordinator,
      confirmPending: true,
    });
    t = await read(taskId);
    assert.ok(!t.pending_at_transition.includes("Comunicado"));
    assert.ok(!t.pending_at_transition.includes("Evidência adicional"));
    await assert.rejects(
      db.query("insert into storage.objects(bucket_id,name) values('user-task-files',$1)", [
        path + "2",
      ]),
      /row-level security/,
    );
  } finally {
    await db.close();
  }
});

test("upgrading templates preserves completed historical tasks and recorded deliveries", async () => {
  const { db, user, command, read } = await setup();
  try {
    await user("analyst");
    await command("create", payload());
    await command("item", {
      id: taskId,
      revision: 0,
      key: "requirements",
      content: "Requisito registrado antes da migração",
      completed: true,
    });
    const closed = crypto.randomUUID();
    await command("create", payload({ id: closed }));
    await user("admin");
    await command("admin_move", {
      id: closed,
      revision: 0,
      stage: "completed",
      assignedTo: ids.admin,
      note: "Encerramento histórico",
    });
    const before = (await read(closed)).checklist;
    await db.exec("reset role");
    await installDeliveries(db);
    await user("analyst");
    const t = await read(taskId);
    assert.deepEqual(
      t.checklist.slice(0, 3).map((i) => i.label),
      ["Mapeamento", "Fluxograma", "Premissas"],
    );
    assert.equal(
      t.checklist.find((i) => i.key === "legacy-requirements").content,
      "Requisito registrado antes da migração",
    );
    assert.equal(t.checklist.find((i) => i.key === "legacy-requirements").completed, true);
    await user("admin");
    assert.deepEqual((await read(closed)).checklist, before);
  } finally {
    await db.close();
  }
});
