import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {setup,ids} from "./user-tasks-fixture.mjs";
test("visibilidade inicia completa e somente administrador pode alterar", async()=>{
 const {db,user}=await setup();
 try {
 await db.exec(await readFile(new URL("../supabase/migrations/20260910110000_user_module_visibility.sql",import.meta.url),"utf8"));
 await db.exec("grant select,update on profiles to authenticated");
 const initial=await db.query("select visible_modules from profiles where id=$1",[ids.analyst]);
 assert.equal(initial.rows[0].visible_modules.length,7);
 await user("analyst");
 await assert.rejects(db.query("update profiles set visible_modules=array['ddp'] where id=$1",[ids.analyst]),/Somente administradores/);
 await user("admin");
 await db.query("update profiles set visible_modules=array['ddp'] where id=$1",[ids.analyst]);
 assert.deepEqual((await db.query("select visible_modules from profiles where id=$1",[ids.analyst])).rows[0].visible_modules,["ddp"]);
 await assert.rejects(db.query("update profiles set visible_modules=array['invalid'] where id=$1",[ids.analyst]),/Módulo inválido/);
 }finally{await db.close()}
});
