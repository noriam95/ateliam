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
  new URL("../supabase/migrations/20260909190000_user_tasks.sql", import.meta.url),
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
 insert into documents(id,organization_id,name,owner_id,module,content_inline) values('40000000-0000-4000-8000-000000000001','${ids.org}','Legado','${ids.analyst}','ddp','{"ddp":{"meta":{"codigo":"MAP.ADM.001"}},"persistence":{"saveMode":"final"}}');`);
  await db.exec(migration);
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/20260909210000_user_tasks_creation.sql", import.meta.url),
      "utf8",
    ),
  );
  const user = async (who) => {
    await db.exec("reset role");
    await db.query("select set_config('test.user',$1,false)", [ids[who] || who]);
    await db.exec("set role authenticated");
  };
  const command = async (action, payload, org = ids.org) =>
    (
      await db.query("select user_tasks_command($1,$2,$3::jsonb) result", [
        org,
        action,
        JSON.stringify(payload),
      ])
    ).rows[0].result;
  const read = async (id) => (await db.query("select * from user_tasks where id=$1", [id])).rows[0];
  return { db, user, command, read };
}
export { setup, ids };
