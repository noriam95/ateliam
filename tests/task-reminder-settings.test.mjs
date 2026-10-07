import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("task reminder settings persist policy and are visible/editable only by system admins", async () => {
  const db = new PGlite();
  const migration = await readFile(
    new URL("../supabase/migrations/20261007121000_task_reminder_settings.sql", import.meta.url),
    "utf8",
  );
  const admin = "20000000-0000-4000-8000-000000000001";
  const editor = "20000000-0000-4000-8000-000000000002";

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('test.user', true), '')::uuid
      $$;
      create table public.user_roles(user_id uuid, role text);
      create function public.has_role(p_user uuid, p_role text) returns boolean
        language sql stable security definer as $$
          select exists(select 1 from public.user_roles where user_id=p_user and role=p_role)
        $$;
      insert into public.user_roles values ('${admin}', 'admin'), ('${editor}', 'editor');
    `);
    await db.exec(migration);

    await db.query("select set_config('test.user',$1,false)", [admin]);
    await db.exec("set role authenticated");
    const visible = await db.query("select * from public.task_reminder_settings");
    assert.equal(visible.rows.length, 1);
    assert.deepEqual(visible.rows[0].reminder_days, [3, 1]);
    await db.query("update public.task_reminder_settings set reminder_days=$1 where id=1", [
      [7, 1],
    ]);
    await db.exec("reset role");

    await db.query("select set_config('test.user',$1,false)", [editor]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from public.task_reminder_settings")).rows.length, 0);
    await db.query("update public.task_reminder_settings set reminder_days=$1 where id=1", [[14]]);
    await db.exec("reset role");

    const stored = await db.query(
      "select reminder_days, enabled from public.task_reminder_settings",
    );
    assert.deepEqual(stored.rows[0].reminder_days, [7, 1]);
    assert.equal(stored.rows[0].enabled, false);
  } finally {
    await db.close();
  }
});
