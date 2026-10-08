import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("flow pools are admin-only, tasks require an atomic claim, and checklist editing is stage-guarded", async () => {
  const db = new PGlite();
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261007143000_task_flow_assignment_and_notifications.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const poolsMigration = await readFile(
    new URL(
      "../supabase/migrations/20261008120000_task_flow_pools_and_claiming.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const admin = "20000000-0000-4000-8000-000000000001";
  const editor = "20000000-0000-4000-8000-000000000002";
  const organization = "30000000-0000-4000-8000-000000000001";
  const task = "40000000-0000-4000-8000-000000000001";

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${admin}'), ('${editor}');
      create table public.organizations(id uuid primary key);
      insert into public.organizations values ('${organization}');
      create table public.user_roles(user_id uuid, role text);
      insert into public.user_roles values ('${admin}', 'admin'), ('${editor}', 'editor');
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.user', true), '')::uuid
      $$;
      create function public.has_role(p_user uuid, p_role text) returns boolean
        language sql stable security definer as $$
          select exists(select 1 from public.user_roles where user_id=p_user and role=p_role)
        $$;
      create function public.user_tasks_member(p_user uuid, p_org uuid) returns boolean
        language sql stable as $$ select p_user = '${editor}'::uuid $$;
      create function public.user_tasks_access(p_org uuid) returns boolean
        language sql stable as $$ select true $$;
      create table public.user_tasks(
        id uuid primary key, organization_id uuid, kind text, assigned_to uuid,
        created_by uuid, documenter_id uuid, stage text, status text,
        revision integer default 0, deleted_at timestamptz,
        created_at timestamptz default now(), updated_at timestamptz default now(),
        checklist jsonb
      );
      create table public.user_task_events(
        task_id uuid, organization_id uuid, actor_id uuid, action text, note text,
        movement_action text, movement_note text
      );
    `);
    await db.exec(migration);
    await db.exec(poolsMigration);

    await db.query("select set_config('test.user',$1,false)", [admin]);
    await db.exec("set role authenticated");
    await db.query(
      `insert into public.task_flow_settings(organization_id,task_kind,attendant_ids)
       values ($1,'mapping',array[$2]::uuid[])`,
      [organization, editor],
    );
    assert.equal((await db.query("select * from public.task_flow_settings")).rows.length, 1);
    await db.exec("reset role");

    await db.query(
      `insert into public.user_tasks(id,organization_id,kind,assigned_to,created_by,documenter_id,stage,status,revision,checklist)
       values ($1,$2,'mapping',$3,$3,$3,'intake','pending',0,$4)`,
      [
        task,
        organization,
        admin,
        [
          { key: "mapping", completed: false },
          { key: "validation", completed: false },
        ],
      ],
    );
    const available = await db.query(
      "select assigned_to,documenter_id,claimed_by from public.user_tasks where id=$1",
      [task],
    );
    assert.equal(available.rows[0].assigned_to, admin);
    assert.equal(available.rows[0].documenter_id, admin);
    assert.equal(available.rows[0].claimed_by, null);
    await assert.rejects(
      db.query("update public.user_tasks set status='in_progress' where id=$1", [task]),
      /Assuma o atendimento pela pool/,
    );

    await db.query("select set_config('test.user',$1,false)", [admin]);
    await assert.rejects(
      db.query("select public.claim_user_task($1,$2,0)", [organization, task]),
      /não está alocado na pool/,
    );
    await db.query("select set_config('test.user',$1,false)", [editor]);
    const claimed = await db.query("select public.claim_user_task($1,$2,0)", [organization, task]);
    assert.equal(claimed.rows[0].claim_user_task.id, task);
    const assigned = await db.query(
      "select assigned_to,documenter_id,claimed_by,revision from public.user_tasks where id=$1",
      [task],
    );
    assert.equal(assigned.rows[0].assigned_to, editor);
    assert.equal(assigned.rows[0].documenter_id, editor);
    assert.equal(assigned.rows[0].claimed_by, editor);
    assert.equal(assigned.rows[0].revision, 1);
    await assert.rejects(
      db.query("select public.claim_user_task($1,$2,1)", [organization, task]),
      /já assumiu/,
    );

    await assert.rejects(
      db.query("update public.user_tasks set checklist=$1 where id=$2", [
        [
          { key: "mapping", completed: true },
          { key: "validation", completed: false },
        ],
        task,
      ]),
      /só pode ser preenchido na atividade Atender solicitação/,
    );
    await db.query("update public.user_tasks set stage='documentation' where id=$1", [task]);
    await db.query("update public.user_tasks set checklist=$1 where id=$2", [
      [
        { key: "mapping", completed: true },
        { key: "validation", completed: false },
      ],
      task,
    ]);

    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from public.task_flow_settings")).rows.length, 0);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
