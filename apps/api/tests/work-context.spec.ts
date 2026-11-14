import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'
import { WorkContext, WorkRule } from '@research-agent-platform/contracts'
import { z } from 'zod'
import { ChatWorker } from '../src/chat-worker.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f()})
async function setup(){
 const root=mkdtempSync(join(tmpdir(),'work-context-'));cleanup.push(()=>rmSync(root,{recursive:true,force:true}))
 const keyfile=join(root,'synthetic.key');writeFileSync(keyfile,randomBytes(32).toString('hex'),{mode:0o600})
 const config=readConfig({NODE_ENV:'test',B3_AI_ENABLED:'1',DATABASE_PATH:join(root,'db'),BLOB_ROOT:join(root,'blobs'),LAB_CREDENTIAL_KEY_FILE:keyfile,APP_ORIGIN:'http://127.0.0.1:4498'})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db);seed(db,'test')
 const password=randomBytes(24).toString('hex');await provisionTestAccounts(db,'test',['A','B','C'].map(x=>({memberId:`member_${x}`,username:`context_${x}`,password})))
 db.prepare('INSERT INTO lab_managers VALUES(?,?,?,NULL)').run('lab_synthetic','member_A',new Date().toISOString())
 const app=createServer(config);cleanup.push(()=>app.close());const people:{cookie:string;csrf:string}[]=[]
 for(const x of ['A','B','C']){
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:config.origin},payload:{username:`context_${x}`,password}})
  expect(login.statusCode,login.body).toBe(200)
  const cookie=String(login.headers['set-cookie']).split(';')[0]!,session=(await app.inject({url:'/api/v1/auth/session',headers:{cookie}})).json().data
  people.push({cookie,csrf:session.csrfToken})
 }
 const call=(path:string,body?:unknown,actor=0,key=randomUUID(),modern=false)=>app.inject({method:body===undefined?'GET':'POST',url:'/api/v1/'+path,headers:{origin:config.origin,cookie:people[actor]!.cookie,'x-csrf-token':people[actor]!.csrf,'idempotency-key':key,...(modern?{'x-acceptcat-work-rules':'layers-v1'}:{})},...(body===undefined?{}:{payload:body as any})})
 const schedule={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
 const plan=await call('plans',{labId:'lab_synthetic',goal:'Synthetic project',proposedItems:['one','two'].map(id=>({id,title:id,goal:'Compare synthetic methods',deliverable:'Table',acceptanceCriteria:'Cite evidence',allocation:{kind:'self'},dependencies:[],schedule,inputArtifactIds:[],budget:null})),unresolvedQuestions:[]})
 expect(plan.statusCode,plan.body).toBe(201)
 const confirmed=await call('plans/'+plan.json().data.id+'/confirm',{expectedVersion:1})
 expect(confirmed.statusCode,confirmed.body).toBe(200)
 const ids=db.prepare('SELECT id FROM tasks ORDER BY id').all().map(r=>String(r.id))
 for(const id of ids)db.prepare("INSERT INTO task_access(task_id,member_id,access) VALUES(?,?,'full') ON CONFLICT(task_id,member_id) DO UPDATE SET access='full'").run(id,'member_B')
 const url=`work-context/research/${ids[0]}`
 return {db,app,call,url,ids,config,modern:(path:string,body?:unknown,actor=0,key=randomUUID())=>call(path,body,actor,key,true)}
}
const input={scope:'project',kind:'rule',title:'Evidence rule',content:'Cite original page numbers.',recordId:null,expectedVersion:0,action:'save'}
it('publishes owner rules, stages member suggestions, checks versions and preserves immutable history',async()=>{
 const s=await setup(),created=await s.call(s.url+'/records',input,1)
 expect(created.statusCode,created.body).toBe(200);const candidate=created.json().data
 expect(candidate.status).toBe('candidate')
 const decision={...input,recordId:candidate.id,expectedVersion:1,action:'confirm'}
 expect((await s.call(s.url+'/records',decision,1)).statusCode).toBe(403)
 const confirmed=await s.call(s.url+'/records',decision)
 expect(confirmed.statusCode,confirmed.body).toBe(200);expect(confirmed.json().data.status).toBe('active')
 expect((await s.call(s.url+'/records',{...decision,action:'save'})).statusCode).toBe(409)
 const key=randomUUID(),revoke={...decision,expectedVersion:2,action:'revoke'}
 const first=await s.call(s.url+'/records',revoke,0,key),second=await s.call(s.url+'/records',revoke,0,key)
 expect(first.statusCode,first.body).toBe(200);expect(second.json()).toEqual(first.json())
 const history=await s.call(s.url+'/records/'+candidate.id)
 expect(history.json().data.map((r:any)=>r.status)).toEqual(['revoked','active','candidate'])
 expect((await s.call(s.url,undefined,2)).statusCode).toBe(404)
})
it('filters project memories and history by original task ACL, including after a source is revoked',async()=>{
 const s=await setup(),created=await s.call(s.url+'/records',{...input,kind:'memory',content:'SYNTHETIC_PRIVATE_SOURCE'})
 expect(created.statusCode,created.body).toBe(200)
 const other=`work-context/research/${s.ids[1]}`,id=created.json().data.id
 expect((await s.call(other,undefined,1)).body).toContain('SYNTHETIC_PRIVATE_SOURCE')
 s.db.prepare("UPDATE task_access SET access='revoked' WHERE task_id=? AND member_id='member_B'").run(s.ids[0]!)
 expect((await s.call(other,undefined,1)).body).not.toContain('SYNTHETIC_PRIVATE_SOURCE')
 expect((await s.call(other+'/records/'+id,undefined,1)).statusCode).toBe(404)
 expect((await s.call(other,undefined,1)).json().data.privateMemoryAllowed).toBe(false)
})
it('requires lab manager to activate lab rules and rejects scope/decision forgery',async()=>{
 const s=await setup(),r=await s.call(s.url+'/records',{...input,scope:'lab'},1)
 expect(r.json().data.status).toBe('candidate')
 const id=r.json().data.id
 expect((await s.call(s.url+'/records',{...input,recordId:id,expectedVersion:1})).statusCode).toBe(400)
 expect((await s.call(s.url+'/records',{...input,scope:'lab',kind:'memory'})).statusCode).toBe(403)
 const confirmed=await s.call(s.url+'/records',{...input,scope:'lab',recordId:id,expectedVersion:1,action:'confirm',content:'Forged decision content'})
 expect(confirmed.json().data.content).toBe(input.content)
 expect((await s.app.inject({url:'/api/v1/'+s.url})).statusCode).toBe(401)
})

it('upgrades populated schema028 twice while preserving all pre-existing task rows and migration checksums',async()=>{
 const s=await setup();
 s.db.exec('DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE IF EXISTS team_library_repositories; DELETE FROM schema_migrations WHERE version=33; DROP TABLE IF EXISTS library_index_entries; DELETE FROM schema_migrations WHERE version=32; DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30; DROP TABLE work_context_revisions; DROP TABLE work_context_records; DELETE FROM schema_migrations WHERE version=29');
 const tables=s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name!='schema_migrations' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>String(r.name));
 const snapshot=()=>Object.fromEntries(tables.map(name=>[name,s.db.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()]));
 const before=snapshot(),history=s.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
 migrate(s.db);migrate(s.db);
 expect(snapshot()).toEqual(before);expect(s.db.prepare('SELECT * FROM schema_migrations WHERE version<=28 ORDER BY version').all()).toEqual(history);
 expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);expect(s.db.prepare('SELECT count(*) n FROM work_context_records').get()!.n).toBe(0);
});

it('manages lab rules without a task: members stage candidates, the manager publishes, history and task context agree',async()=>{
 const s=await setup(),lab='lab/work-rules',body={scope:'lab',kind:'rule',title:'写作规范',content:'结论先行，引用保留页码。',recordId:null,expectedVersion:0,action:'save'}
 const created=await s.call(lab,body,1)
 expect(created.statusCode,created.body).toBe(200)
 const record=created.json().data
 expect(record.status).toBe('candidate')
 expect(record.sourceTaskId).toBe(null)
 const listed=await s.call(lab,undefined,0)
 expect(listed.statusCode,listed.body).toBe(200)
 expect(listed.json().data.canPublish).toBe(true)
 expect(listed.json().data.records.map((r:any)=>r.id)).toContain(record.id)
 // A task context carries the same lab rule, so the two surfaces cannot drift.
 expect((await s.call(s.url,undefined,1)).json().data.records.some((r:any)=>r.id===record.id)).toBe(true)
 const confirm={...body,recordId:record.id,expectedVersion:1,action:'confirm',content:'篡改内容'}
 expect((await s.call(lab,confirm,1)).statusCode).toBe(403)
 const confirmed=await s.call(lab,confirm,0)
 expect(confirmed.statusCode,confirmed.body).toBe(200)
 expect(confirmed.json().data.status).toBe('active')
 expect(confirmed.json().data.content).toBe(body.content)
 expect((await s.call(lab,{...body,recordId:record.id,expectedVersion:1,action:'save'},0)).statusCode).toBe(409)
 const revoked=await s.call(lab,{...body,recordId:record.id,expectedVersion:2,action:'revoke'},0)
 expect(revoked.json().data.status).toBe('revoked')
 expect((await s.call(lab,{...body,recordId:record.id,expectedVersion:3,action:'save'},0)).statusCode).toBe(409)
 // Scope and kind are fixed by the route; a project or memory record cannot be smuggled in.
 expect((await s.call(lab,{...body,scope:'project'})).statusCode).toBe(400)
 expect((await s.call(lab,{...body,kind:'memory'})).statusCode).toBe(400)
 expect((await s.app.inject({url:'/api/v1/'+lab})).statusCode).toBe(401)
})

it('updates personal rules in place, isolates owners, and projects a strict legacy task response',async()=>{
 const s=await setup(),body={kind:'rule',title:'本人输出要求',content:'PRIVATE_RULE_A_SENTINEL',recordId:null,expectedVersion:0,action:'save'}
 const created=await s.modern('personal/work-rules',body);expect(created.statusCode,created.body).toBe(200)
 const id=created.json().data.id,key=randomUUID(),revision={...body,recordId:id,expectedVersion:1,content:'PRIVATE_RULE_A_REVISED'}
 const updated=await s.modern('personal/work-rules',revision,0,key);expect(updated.statusCode,updated.body).toBe(200);expect(updated.json().data.version).toBe(2)
 expect((await s.modern('personal/work-rules',revision,0,key)).json()).toEqual(updated.json())
 expect(s.db.prepare('SELECT count(*) n FROM personal_work_rules').get()!.n).toBe(1)
 expect((await s.modern('personal/work-rules',revision,1)).statusCode).toBe(404)
 expect((await s.modern(s.url)).json().data.personalRules.map((r:any)=>r.id)).toEqual([id])
 expect((await s.modern(s.url,undefined,1)).json().data.personalRules).toEqual([])
 const legacy=(await s.call(s.url)).json();expect(legacy.data).not.toHaveProperty('personalRules')
 const legacyRule=WorkRule.omit({kind:true,scope:true}).extend({kind:z.enum(['rule','memory']),scope:z.enum(['lab','project'])})
 expect(WorkContext.omit({personalRules:true}).extend({records:z.array(legacyRule)}).safeParse(legacy.data).success).toBe(true)
 expect((await s.call('personal/work-rules')).statusCode).toBe(501)
})

it('requires a completed owned source for reusable methods, preserves its type, and hides it from old readers',async()=>{
 const s=await setup(),id=s.ids[0]!,body={scope:'lab',kind:'link',title:'合成工作方法',content:'先核对原件再归纳。',sourceTaskId:id,recordId:null,expectedVersion:0,action:'save'}
 expect((await s.modern('lab/work-rules',{...body,sourceTaskId:null},1)).statusCode).toBe(400)
 expect((await s.modern('lab/work-rules',body,1)).statusCode).toBe(403)
 s.db.prepare("UPDATE tasks SET lead_id='member_B',document=json_set(document,'$.leadId','member_B') WHERE id=?").run(id)
 expect((await s.modern('lab/work-rules',body,1)).statusCode).toBe(409)
 s.db.prepare("UPDATE tasks SET status='completed',document=json_set(document,'$.status','completed'),summary_document=json_set(summary_document,'$.status','completed') WHERE id=?").run(id)
 const saved=await s.modern('lab/work-rules',body,1);expect(saved.statusCode,saved.body).toBe(200);expect(saved.json().data.status).toBe('candidate')
 const record=saved.json().data,decision={...body,recordId:record.id,expectedVersion:1,action:'confirm'}
 expect((await s.modern('lab/work-rules',decision,1)).statusCode).toBe(403)
 const confirmed=await s.modern('lab/work-rules',decision);expect(confirmed.statusCode,confirmed.body).toBe(200)
 const revised=await s.modern('lab/work-rules',{...decision,expectedVersion:2,action:'save',content:'负责人修订方法'});expect(revised.statusCode,revised.body).toBe(200)
 expect((await s.modern('lab/work-rules',{...body,kind:'rule',recordId:record.id,expectedVersion:3},1)).statusCode).toBe(400)
 expect((await s.modern('lab/work-rules')).json().data.records.some((r:any)=>r.id===record.id)).toBe(true)
 expect((await s.call('lab/work-rules')).json().data.records.some((r:any)=>r.id===record.id)).toBe(false)
 expect((await s.call(s.url)).json().data.records.some((r:any)=>r.id===record.id)).toBe(false)
 expect((await s.call('lab/work-rules',body,1)).statusCode).toBe(501)
})

it('keeps member rule requests pending and removes method author privileges after task transfer',async()=>{
 const s=await setup(),path='lab/work-rules',body={scope:'lab',kind:'rule',title:'成员建议',content:'附原始依据。',recordId:null,expectedVersion:0,action:'save'}
 const proposed=await s.modern(path,body,1);expect(proposed.statusCode,proposed.body).toBe(200)
 const rule=proposed.json().data;expect(rule.status).toBe('candidate');expect(rule.allowedActions).toEqual(['revise','revoke'])
 const revised=await s.modern(path,{...body,recordId:rule.id,expectedVersion:1,content:'附原始依据与版本。'},1)
 expect(revised.statusCode,revised.body).toBe(200);expect(revised.json().data.status).toBe('candidate')
 expect((await s.modern(path,{...body,recordId:rule.id,expectedVersion:2,action:'confirm'},1)).statusCode).toBe(403)
 const id=s.ids[0]!
 s.db.prepare("UPDATE tasks SET lead_id='member_B',status='completed',document=json_set(document,'$.leadId','member_B','$.status','completed'),summary_document=json_set(summary_document,'$.status','completed') WHERE id=?").run(id)
 const method={...body,kind:'link',title:'任务方法',sourceTaskId:id}
 const submitted=await s.modern(path,method,1);expect(submitted.statusCode,submitted.body).toBe(200)
 const record=submitted.json().data;expect(record.allowedActions).toEqual(['revise','revoke'])
 s.db.prepare("UPDATE tasks SET lead_id='member_C',document=json_set(document,'$.leadId','member_C') WHERE id=?").run(id)
 const listed=(await s.modern(path,undefined,1)).json().data.records.find((r:any)=>r.id===record.id)
 expect(listed.allowedActions).toEqual([])
 for(const action of ['save','revoke','confirm'])expect((await s.modern(path,{...method,recordId:record.id,expectedVersion:1,action},1)).statusCode).toBe(403)
 // 来源任务发起人即使不再是课题组负责人，仍能审核该任务的方法。
 s.db.prepare("DELETE FROM lab_managers WHERE member_id='member_A'").run()
 const approved=await s.modern(path,{...method,recordId:record.id,expectedVersion:1,action:'confirm'})
 expect(approved.statusCode,approved.body).toBe(200);expect(approved.json().data.status).toBe('active')
})

it('injects only the current owner personal rules into a real worker request; legacy overflow fails the turn without a model call',async()=>{
 const s=await setup(),rule={kind:'rule',title:'本人偏好',content:'PRIVATE_RULE_A_SENTINEL',recordId:null,expectedVersion:0,action:'save'}
 expect((await s.modern('personal/work-rules',rule)).statusCode).toBe(200)
 expect((await s.modern('personal/work-rules',{...rule,content:'PRIVATE_RULE_B_SENTINEL'},1)).statusCode).toBe(200)
 expect((await s.call('me/model-configurations',{name:'合成模型',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:'synthetic-rules-only-key'})).statusCode).toBe(201)
 const conversation=(await s.call('chat/personal-conversation',{})).json().data.conversation
 const sent=await s.call(`chat/conversations/${conversation.id}/agent-messages`,{text:'你好，整理一下思路'});expect(sent.statusCode,sent.body).toBe(201)
 let calls=0;const worker=new ChatWorker(s.db,{...s.config,constitutionRules:true},async input=>{calls++;expect(input.system).toContain('PRIVATE_RULE_A_SENTINEL');expect(input.system).not.toContain('PRIVATE_RULE_B_SENTINEL');return{text:'合成答复。',failure:null,inputTokens:100,outputTokens:30,elapsedMs:2}})
 expect(await worker.tick()).toBe(true);expect(calls).toBe(1)
 const sample=JSON.parse(String(s.db.prepare("SELECT document FROM personal_work_rules WHERE member_id='member_A'").get()!.document))
 for(let i=0;i<7;i++){const id=randomUUID();s.db.prepare('INSERT INTO personal_work_rules VALUES(?,?,?)').run(id,'member_A',JSON.stringify({...sample,id,title:`存量长规则${i}`,content:'x'.repeat(2000)}))}
 const next=await s.call(`chat/conversations/${conversation.id}/agent-messages`,{text:'继续讨论'});expect(next.statusCode,next.body).toBe(201)
 expect(await worker.tick()).toBe(false);expect(calls).toBe(1)
 const turn=(await s.call(`chat/turns/${next.json().data.turn.id}`)).json().data
 expect(turn.status).toBe('failed');expect(turn.failure).toBe('BUDGET_EXCEEDED')
})
