import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { test } from "node:test";

const ids = {
  org: "10000000-0000-4000-8000-000000000001",
  otherOrg: "10000000-0000-4000-8000-000000000002",
  admin: "20000000-0000-4000-8000-000000000001",
  coordinator: "20000000-0000-4000-8000-000000000002",
  analyst: "20000000-0000-4000-8000-000000000003",
  owner: "20000000-0000-4000-8000-000000000004",
  outsider: "20000000-0000-4000-8000-000000000005",
  process: "30000000-0000-4000-8000-000000000001",
};
const migration = await readFile(
  new URL("../supabase/migrations/20260909120000_mapping_workflow.sql", import.meta.url),
  "utf8",
);
async function setup() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
 grant usage on schema auth to authenticated;
 create table organizations(id uuid primary key);
 create table profiles(id uuid primary key,organization_id uuid references organizations(id),display_name text,username text,email text);
 create table user_roles(user_id uuid,role text);
 create function has_role(p_user uuid,p_role text) returns boolean language sql stable security definer as $$ select exists(select 1 from user_roles where user_id=p_user and role=p_role) $$;
 create table user_organization_access(user_id uuid,organization_id uuid);
 create table organization_processes(id uuid primary key,organization_id uuid,name text,department text);
 create table documents(id uuid primary key default gen_random_uuid(),organization_id uuid,name text,description text,owner_id uuid,module text,content_inline text,current_version integer default 0,primary_process_id uuid,created_at timestamptz default now(),updated_at timestamptz default now());
 grant select,insert,update,delete on documents to authenticated;
 insert into organizations values('${ids.org}'),('${ids.otherOrg}');
 insert into profiles values ${Object.entries(ids)
   .filter(([k]) => ["admin", "coordinator", "analyst", "owner", "outsider"].includes(k))
   .map(([k, v]) => `('${v}','${k === "outsider" ? ids.otherOrg : ids.org}','${k}','${k}',null)`)
   .join(",")};
 insert into user_roles values('${ids.admin}','admin'),('${ids.coordinator}','editor'),('${ids.analyst}','editor'),('${ids.owner}','viewer'),('${ids.outsider}','editor');
 insert into organization_processes values('${ids.process}','${ids.org}','Manutenção','Operações');
 insert into documents(id,organization_id,name,owner_id,module,content_inline) values('40000000-0000-4000-8000-000000000001','${ids.org}','Legado','${ids.analyst}','ddp','{}');`);
  await db.exec(migration);
  const user = async (who) => {
    await db.exec("reset role");
    await db.query("select set_config('test.user',$1,false)", [ids[who] || who]);
    await db.exec("set role authenticated");
  };
  const command = async (action, payload, org = ids.org) =>
    (
      await db.query("select mapping_command($1,$2,$3::jsonb) result", [
        org,
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].result;
  const read = async (id) =>
    (await db.query("select * from mapping_demands where id=$1", [id])).rows[0];
  const direct = async (id = "50000000-0000-4000-8000-000000000001", modality = "Sistemas") =>
    command("direct", {
      id,
      title: "Mapeamento de manutenção",
      purpose: "Documentar o fluxo e suas entregas.",
      modality,
      analystId: ids.analyst,
      area: "Operações",
      registrationDue: "2026-09-30",
    });
  const register = async (d) =>
    command("register", {
      id: d.id,
      revision: d.revision,
      title: d.title,
      purpose: d.purpose,
      modality: d.modality,
      processId: ids.process,
      processOwnerId: ids.owner,
      dueDate: "2026-10-15",
      comment: "Registro administrativo quando necessário.",
    });
  await user("admin");
  await command("coordinator", { userId: ids.coordinator, enabled: true });
  return { db, user, command, read, direct, register };
}

test("governed intake, tenant isolation, authorization, checklist and approval snapshot", async () => {
  const { db, user, command, read, direct, register } = await setup();
  try {
    await user("analyst");
    await assert.rejects(direct(), /Coordenador/);
    await assert.rejects(
      db.query(
        "insert into documents(organization_id,name,owner_id,module) values($1,'Sem direção',$2,'ddp')",
        [ids.org, ids.analyst],
      ),
      /tarefa de registro/,
    );
    await user("coordinator");
    let d = await direct();
    const again = await direct();
    assert.equal(again.id, d.id);
    assert.equal((await db.query("select count(*)::int n from mapping_tasks")).rows[0].n, 1);
    await assert.rejects(register(d), /Analista/);
    await user("outsider");
    assert.equal((await db.query("select * from mapping_demands")).rows.length, 0);
    await assert.rejects(command("register", { id: d.id, revision: 0 }), /Acesso negado/);
    await user("analyst");
    await assert.rejects(
      db.query("update mapping_demands set status='completed' where id=$1", [d.id]),
      /permission denied/,
    );
    d = await register(d);
    assert.ok(d.document_id);
    assert.equal(d.status, "registered");
    assert.equal(d.checklist.length, 6);
    assert.equal((await register(d)).document_id, d.document_id);
    const initialRevision = d.revision;
    d = await command("transition", { id: d.id, revision: d.revision, status: "discovery" });
    await assert.rejects(
      command("transition", { id: d.id, revision: initialRevision, status: "documentation" }),
      /outra pessoa/,
    );
    d = await command("transition", { id: d.id, revision: d.revision, status: "documentation" });
    await assert.rejects(
      command("transition", {
        id: d.id,
        revision: d.revision,
        status: "completed",
        comment: "Ignorar etapas",
      }),
      /Transição/,
    );
    await assert.rejects(
      command("transition", { id: d.id, revision: d.revision, status: "validation" }),
      /entregas obrigatórias/,
    );
    await assert.rejects(
      command("checklist", {
        id: d.id,
        revision: d.revision,
        key: "validation",
        state: "done",
        evidence: "Tentativa",
      }),
      /inválida/,
    );
    await assert.rejects(
      command("checklist", {
        id: d.id,
        revision: d.revision,
        key: "report",
        state: "not_applicable",
        evidence: "Não necessário",
      }),
      /obrigatória/,
    );
    for (const item of d.checklist.filter((x) => x.key !== "validation"))
      d = await command("checklist", {
        id: d.id,
        revision: d.revision,
        key: item.key,
        state: "done",
        evidence: "Entregável revisado e documentado.",
      });
    // Editing a linked document invalidates its completion marker.
    await db.query("update documents set content_inline=$1 where id=$2", [
      JSON.stringify({ tipo: "ddp", ddp: { meta: { titulo: "Revisado" } } }),
      d.document_id,
    ]);
    d = await read(d.id);
    assert.equal(d.checklist.find((x) => x.key === "report").state, "pending");
    d = await command("checklist", {
      id: d.id,
      revision: d.revision,
      key: "report",
      state: "done",
      evidence: "Relatório revisado.",
    });
    d = await command("transition", { id: d.id, revision: d.revision, status: "validation" });
    await assert.rejects(
      db.query("update documents set content_inline='{}' where id=$1", [d.document_id]),
      /bloqueado/,
    );
    await assert.rejects(
      command("transition", {
        id: d.id,
        revision: d.revision,
        status: "completed",
        comment: "Aprovar",
      }),
      /dono do processo/,
    );
    await user("owner");
    d = await command("transition", {
      id: d.id,
      revision: d.revision,
      status: "adjustments",
      comment: "Revisar as regras.",
    });
    await user("analyst");
    d = await command("transition", { id: d.id, revision: d.revision, status: "validation" });
    await user("owner");
    d = await command("transition", {
      id: d.id,
      revision: d.revision,
      status: "completed",
      comment: "Processo e entregas validados.",
    });
    assert.equal(d.checklist.at(-1).state, "done");
    assert.equal(d.status, "completed");
    const events = (
      await db.query(
        "select snapshot from mapping_events where demand_id=$1 and snapshot ? 'documents'",
        [d.id],
      )
    ).rows;
    assert.equal(events.length, 1);
    assert.equal(events[0].snapshot.documents[0].id, d.document_id);
    assert.ok(events[0].snapshot.documents[0].content);
    await user("admin");
    await assert.rejects(
      command("details", { id: d.id, revision: d.revision, details: {}, comment: "Intervenção" }),
      /nesta etapa/,
    );
    await assert.rejects(
      db.query("delete from documents where id=$1", [d.document_id]),
      /histórico/,
    );
    // Legacy remains editable, without a fabricated intake or modality.
    await user("analyst");
    await db.query(
      "update documents set name='Legado preservado' where id='40000000-0000-4000-8000-000000000001'",
    );
  } finally {
    await db.close();
  }
});

test("administrator assumes registration, execution and validation with audit; four modality checklists", async () => {
  const { db, user, command, read, direct, register } = await setup();
  try {
    for (const [index, modality] of [
      "Sistemas",
      "Operacional",
      "Automação & IA",
      "Dados / BI",
    ].entries()) {
      await user("admin");
      let d = await direct(`50000000-0000-4000-8000-00000000000${index + 1}`, modality);
      const task = (await db.query("select * from mapping_tasks where demand_id=$1", [d.id]))
        .rows[0];
      await assert.rejects(
        command("take_task", { id: d.id, revision: d.revision, taskId: task.id }),
        /justificativa/,
      );
      d = await command("take_task", {
        id: d.id,
        revision: d.revision,
        taskId: task.id,
        comment: "Assumindo registro por necessidade operacional.",
      });
      assert.equal(d.analyst_id, ids.admin);
      d = await register(d);
      assert.equal(d.checklist.length, modality === "Automação & IA" ? 8 : 6);
      if (modality === "Operacional") {
        await assert.rejects(
          command("checklist", {
            id: d.id,
            revision: d.revision,
            key: "communication",
            state: "not_applicable",
            evidence: "",
            comment: "Revisão",
          }),
          /evidência|justificativa/,
        );
        d = await command("checklist", {
          id: d.id,
          revision: d.revision,
          key: "communication",
          state: "not_applicable",
          evidence: "O POP já será divulgado no treinamento.",
        });
        assert.equal(d.checklist.find((x) => x.key === "communication").state, "not_applicable");
      }
      d = await command("transition", {
        id: d.id,
        revision: d.revision,
        status: "discovery",
        comment: "Priorização administrativa.",
      });
      d = await command("transition", {
        id: d.id,
        revision: d.revision,
        status: "documentation",
        comment: "Levantamento concluído.",
      });
      for (const item of d.checklist.filter((x) => x.key !== "validation" && x.state === "pending"))
        d = await command("checklist", {
          id: d.id,
          revision: d.revision,
          key: item.key,
          state: "done",
          evidence: "Entrega conferida pelo Administrador.",
        });
      d = await command("transition", {
        id: d.id,
        revision: d.revision,
        status: "validation",
        comment: "Encaminhado para revisão.",
      });
      const validationTask = (
        await db.query("select * from mapping_tasks where demand_id=$1 and status='pending'", [
          d.id,
        ])
      ).rows[0];
      d = await command("take_task", {
        id: d.id,
        revision: d.revision,
        taskId: validationTask.id,
        comment: "Assumindo a validação na ausência do responsável.",
      });
      assert.equal(d.process_owner_id, ids.admin);
      d = await command("transition", {
        id: d.id,
        revision: d.revision,
        status: "completed",
        comment: "Validação administrativa documentada.",
      });
      assert.equal(d.status, "completed");
      const event = (
        await db.query("select * from mapping_events where demand_id=$1 and action='take_task'", [
          d.id,
        ])
      ).rows;
      assert.equal(event.length, 2);
      assert.ok(event.every((e) => e.actor_id === ids.admin && e.comment.length > 2));
    }
  } finally {
    await db.close();
  }
});

test("manual tasks, cancellation, reassign and admin operation without assuming first", async () => {
  const { db, user, command, direct, register } = await setup();
  try {
    await user("coordinator");
    let d = await direct();
    await user("admin");
    d = await register(d);
    assert.equal(d.analyst_id, ids.analyst);
    d = await command("task_create", {
      id: d.id,
      revision: d.revision,
      title: "Confirmar dados",
      assignedTo: ids.owner,
      dueDate: "2026-10-01",
      comment: "Revisão adicional necessária.",
    });
    const t = (await db.query("select * from mapping_tasks where kind='manual'")).rows[0];
    d = await command("task_update", {
      id: d.id,
      revision: d.revision,
      taskId: t.id,
      status: "completed",
      comment: "Administrador confirmou o retorno.",
    });
    d = await command("reassign", {
      id: d.id,
      revision: d.revision,
      analystId: ids.coordinator,
      comment: "Redistribuição da carga de trabalho.",
    });
    assert.equal(d.analyst_id, ids.coordinator);
    await user("owner");
    await assert.rejects(
      command("cancel", { id: d.id, revision: d.revision, comment: "Cancelar" }),
      /Coordenador/,
    );
    await user("admin");
    d = await command("cancel", {
      id: d.id,
      revision: d.revision,
      comment: "Demanda substituída por nova orientação.",
    });
    assert.equal(d.status, "cancelled");
    assert.equal(
      (
        await db.query(
          "select count(*)::int n from mapping_tasks where demand_id=$1 and status not in ('completed','cancelled')",
          [d.id],
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
