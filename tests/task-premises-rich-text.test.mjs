import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("Premissas becomes an internal entry while legacy files stay read-only", async () => {
  const db = new PGlite();
  const migration = await readFile(
    new URL("../supabase/migrations/20261007152000_task_premises_rich_text.sql", import.meta.url),
    "utf8",
  );
  const org = "30000000-0000-4000-8000-000000000001";
  const user = "40000000-0000-4000-8000-000000000001";
  const task = "50000000-0000-4000-8000-000000000001";
  const filePath = `${org}/${task}/premises/old.docx`;

  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select '${user}'::uuid
      $$;
      create function public.has_role(uuid, text) returns boolean language sql stable as $$ select false $$;
      create function public.user_tasks_access(uuid) returns boolean language sql stable as $$ select true $$;
      create function public.user_tasks_checklist_legacy(text, text, uuid) returns jsonb
        language sql immutable as $$ select '[]'::jsonb $$;
      create table public.user_tasks (
        id uuid primary key, organization_id uuid, kind text, modality text, document_id uuid,
        checklist jsonb, revision int default 0, updated_at timestamptz default now(),
        stage text, status text, assigned_to uuid, requested_by uuid, created_by uuid,
        documenter_id uuid, reviewer_id uuid
      );
      create function public.guard_task_checklist_stage() returns trigger
        language plpgsql as $$ begin return new; end $$;
      create trigger task_checklist_stage_guard before update of checklist on public.user_tasks
        for each row execute function public.guard_task_checklist_stage();
      insert into public.user_tasks(id, organization_id, kind, modality, checklist, stage, status,
        assigned_to, requested_by, created_by)
      values ('${task}', '${org}', 'mapping', 'Sistemas',
        '[{"key":"mapping","label":"Mapeamento","entry_type":"mapping"},
          {"key":"premises","label":"Premissas","entry_type":"file",
           "attachment":{"path":"${filePath}","name":"old.docx","size":100}}]'::jsonb,
        'intake', 'in_progress', '${user}', '${user}', '${user}');
    `);

    await db.exec(migration);

    const taskResult = await db.query("select checklist from public.user_tasks where id=$1", [
      task,
    ]);
    const checklist = taskResult.rows[0].checklist;
    assert.equal(checklist[0].label, "Relatório");
    assert.equal(checklist[1].entry_type, "note");
    assert.equal(checklist[1].attachment, undefined);
    assert.equal(checklist[1].legacy_attachment.path, filePath);

    const template = await db.query(
      "select public.user_tasks_checklist('mapping', 'Sistemas', null) as items",
    );
    assert.equal(template.rows[0].items[0].label, "Relatório");
    assert.equal(template.rows[0].items[1].entry_type, "flowchart");
    assert.equal(template.rows[0].items[2].entry_type, "note");

    const read = await db.query("select public.user_tasks_file_access($1, false) as allowed", [
      filePath,
    ]);
    const write = await db.query("select public.user_tasks_file_access($1, true) as allowed", [
      filePath,
    ]);
    assert.equal(read.rows[0].allowed, true);
    assert.equal(write.rows[0].allowed, false);
  } finally {
    await db.close();
  }
});
