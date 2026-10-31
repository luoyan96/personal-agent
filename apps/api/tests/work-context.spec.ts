import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const f of cleanup.splice(0).reverse())await f()})
async function setup(){
 const root=mkdtempSync(join(tmpdir(),'work-context-'));cleanup.push(()=>rmSync(root,{recursive:true,force:true}))
 const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(root,'db'),BLOB_ROOT:join(root,'blobs'),APP_ORIGIN:'http://127.0.0.1:4498'})
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
 const call=(path:string,body?:unknown,actor=0,key=randomUUID())=>app.inject({method:body===undefined?'GET':'POST',url:'/api/v1/'+path,headers:{origin:config.origin,cookie:people[actor]!.cookie,'x-csrf-token':people[actor]!.csrf,'idempotency-key':key},...(body===undefined?{}:{payload:body as any})})
 const schedule={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
 const plan=await call('plans',{labId:'lab_synthetic',goal:'Synthetic project',proposedItems:['one','two'].map(id=>({id,title:id,goal:'Compare synthetic methods',deliverable:'Table',acceptanceCriteria:'Cite evidence',allocation:{kind:'self'},dependencies:[],schedule,inputArtifactIds:[],budget:null})),unresolvedQuestions:[]})
 expect(plan.statusCode,plan.body).toBe(201)
 const confirmed=await call('plans/'+plan.json().data.id+'/confirm',{expectedVersion:1})
 expect(confirmed.statusCode,confirmed.body).toBe(200)
 const ids=db.prepare('SELECT id FROM tasks ORDER BY id').all().map(r=>String(r.id))
 for(const id of ids)db.prepare("INSERT INTO task_access(task_id,member_id,access) VALUES(?,?,'full') ON CONFLICT(task_id,member_id) DO UPDATE SET access='full'").run(id,'member_B')
 const url=`work-context/research/${ids[0]}`
 return {db,app,call,url,ids}
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
 s.db.exec('DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30; DROP TABLE work_context_revisions; DROP TABLE work_context_records; DELETE FROM schema_migrations WHERE version=29');
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
