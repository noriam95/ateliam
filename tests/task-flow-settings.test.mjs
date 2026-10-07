import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("flow settings are admin-only, assign new tasks and guard checklist editing by stage", async () => {
  const db = new PGlite();
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20261007143000_task_flow_assignment_and_notifications.sql",
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
      create table public.user_tasks(
        id uuid primary key, organization_id uuid, kind text, assigned_to uuid,
        documenter_id uuid, stage text, checklist jsonb
      );
    `);
    await db.exec(migration);

    await db.query("select set_config('test.user',$1,false)", [admin]);
    await db.exec("set role authenticated");
    await db.query(
      `insert into public.task_flow_settings(organization_id,task_kind,default_assignee_id)
       values ($1,'mapping',$2)`,
      [organization, editor],
    );
    assert.equal((await db.query("select * from public.task_flow_settings")).rows.length, 1);
    await db.exec("reset role");

    await db.query(
      `insert into public.user_tasks(id,organization_id,kind,assigned_to,documenter_id,stage,checklist)
       values ($1,$2,'mapping',$3,$3,'intake',$4)`,
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
    const assigned = await db.query(
      "select assigned_to,documenter_id from public.user_tasks where id=$1",
      [task],
    );
    assert.equal(assigned.rows[0].assigned_to, editor);
    assert.equal(assigned.rows[0].documenter_id, editor);

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

    await db.query("select set_config('test.user',$1,false)", [editor]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from public.task_flow_settings")).rows.length, 0);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
