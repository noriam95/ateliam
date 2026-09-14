import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {setup,ids} from './user-tasks-fixture.mjs';
test('card: foto, descrição original e exclusão do vínculo com permissões e revisão',async()=>{
 const {db,user,command,read}=await setup(true);
 try {
 await db.exec("alter table profiles add column avatar_data_url text; grant select on profiles to authenticated; create table organization_departments(id uuid primary key,organization_id uuid,name text); grant select on organization_departments to authenticated;");
 for(const f of ['20260911100000_tasks_workflow_v2.sql','20260911150000_task_card_routing_comments.sql','20260914100000_task_card_ux.sql']) await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 await db.query('update profiles set avatar_data_url=$1 where id=$2',['https://example.com/photo.png',ids.analyst]);
 await user('admin');const id=crypto.randomUUID();
 await command('create',{id,title:'Teste UX',kind:'mapping',modality:'Sistemas',assignedTo:ids.analyst,startsOn:'2026-09-14',dueOn:'2026-09-30'});
 let t=await read(id);await command('start_documentation',{id,revision:t.revision,note:'Levantar requisitos com a área.'});
 const feed=(await db.query('select user_tasks_feed($1,$2::jsonb) result',[ids.org,JSON.stringify({id})])).rows[0].result;
 assert.equal(feed.tasks[0].assignee_photo,'https://example.com/photo.png');
 assert.equal(feed.events.find(e=>e.movement_action).movement_note,'Levantar requisitos com a área.');
 t=await read(id);const key=t.checklist.find(i=>i.entry_type==='mapping').key;
 const started=await command('begin_document',{id,revision:t.revision,key});
 t=await read(id);const docId=t.checklist.find(i=>i.key===key).document_id;
 assert.ok(docId);
 await user('coordinator');await assert.rejects(command('remove_entry',{id,revision:t.revision,key}),/responsável/);
 await user('analyst');await assert.rejects(command('remove_entry',{id,revision:t.revision-1,key}),/alterada/);
 await command('remove_entry',{id,revision:t.revision,key});
 t=await read(id);assert.equal(t.checklist.find(i=>i.key===key).document_id,null);assert.equal(t.checklist.find(i=>i.key===key).completed,false);
 assert.equal((await db.query('select id from documents where id=$1',[docId])).rows.length,1);
 } finally {await db.close();}
});
