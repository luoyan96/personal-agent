import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Task, TaskEvent } from '@research-agent-platform/contracts'
import { openDatabase, migrate, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { readConfig } from '../src/config.js'
import { createServer } from '../src/server.js'
import { TaskInvitationWorker } from '../src/task-invitation.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const schedule={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
async function setup(){
 const dir=mkdtempSync(join(tmpdir(),'task-handoff-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
 const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4173'})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db);seed(db,'test')
 const accounts=['A','B','C'].map(letter=>({memberId:`member_${letter}`,username:`handoff_${letter}`,password:randomBytes(24).toString('hex')}))
 await provisionTestAccounts(db,'test',accounts)
 const app=createServer(config);cleanup.push(()=>app.close());const people:{cookie:string;csrf:string}[]=[]
 for(const account of accounts){
  const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers:{origin:config.origin},payload:{username:account.username,password:account.password}})
  expect(login.statusCode,login.body).toBe(200);const cookie=String(login.headers['set-cookie']).split(';')[0]!
  const session=await app.inject({url:'/api/v1/auth/session',headers:{cookie}});people.push({cookie,csrf:session.json().data.csrfToken})
 }
 const call=(path:string,body?:unknown,actor=0,key=randomUUID(),modern=true)=>app.inject({method:body===undefined?'GET':'POST',url:'/api/v1/'+path,headers:{origin:config.origin,cookie:people[actor]!.cookie,'x-csrf-token':people[actor]!.csrf,'idempotency-key':key,...(modern?{'x-acceptcat-task-workflow':'handoff-v1'}:{})},...(body===undefined?{}:{payload:body as any})})
 const ok=async(path:string,body?:unknown,actor=0,key=randomUUID())=>{const response=await call(path,body,actor,key);expect(response.statusCode,response.body).toBeLessThan(300);return response.json().data}
 const task=async(id:string,actor=0)=>(await ok('tasks/'+id,undefined,actor)).task
 const create=async(invited=false)=>{
  const plan=await ok('plans',{labId:'lab_synthetic',goal:'Synthetic project',proposedItems:[{id:'one',title:'Synthetic comparison',goal:'Compare synthetic materials',deliverable:'Original scope',acceptanceCriteria:'Keep sources',allocation:invited?{kind:'invitation',memberId:'member_B'}:{kind:'self'},dependencies:[],schedule,inputArtifactIds:[],budget:null}],unresolvedQuestions:[]})
  return (await ok('plans/'+plan.id+'/confirm',{expectedVersion:1})).taskIds[0] as string
 }
 const decide=async(id:string,actor:number,decision='accepted')=>{
  const offer=db.prepare("SELECT document FROM assignments WHERE task_id=? AND status='pending'").get(id)!,assignment=JSON.parse(String(offer.document))
  return ok('invitations/'+assignment.id+'/decision',{expectedVersion:assignment.version,expectedTaskVersion:Number(db.prepare('SELECT version FROM tasks WHERE id=?').get(id)!.version),decision,comment:null},actor)
 }
 const transfer=async(id:string,actor:number,to:string)=>ok('tasks/'+id+'/withdraw',{expectedVersion:(await task(id,actor)).version,transferToMemberId:to,remainingScope:'Remaining synthetic scope',reason:'Synthetic handoff'},actor)
 return {db,config,call,ok,task,create,decide,transfer}
}

describe('reviewed handoff integration',{timeout:30000},()=>{
 it('a non-initiating lead cancels the exact offer, restores the running state/scope and replays once',async()=>{
  const s=await setup(),id=await s.create(true);await s.decide(id,1)
  await s.ok('tasks/'+id+'/start',{expectedVersion:(await s.task(id,1)).version},1)
  await s.transfer(id,1,'member_C');const pending=await s.task(id,1)
  expect(pending.allowedActions).toContain('cancel_invitation');expect(pending.allowedActions).not.toContain('submit')
  const key=randomUUID(),body={expectedVersion:pending.version},cancelled=await s.ok('tasks/'+id+'/invitations/cancel',body,1,key)
  expect(cancelled).toMatchObject({leadId:'member_B',status:'in_progress',schedule})
  expect(await s.ok('tasks/'+id+'/invitations/cancel',body,1,key)).toEqual(cancelled)
  expect(JSON.parse(String(s.db.prepare('SELECT summary_document FROM tasks WHERE id=?').get(id)!.summary_document)).deliverable).toBe('Original scope')
  expect(s.db.prepare("SELECT count(*) n FROM assignments WHERE task_id=? AND status='accepted'").get(id)!.n).toBe(1)
  expect(s.db.prepare("SELECT count(*) n FROM task_events WHERE task_id=? AND json_extract(document,'$.kind')='invitation_cancelled'").get(id)!.n).toBe(1)
  expect((await s.call('tasks/'+id,undefined,2)).statusCode).toBe(404)
 })
 it('an old declined handoff cannot restore the wrong person during a later handoff',async()=>{
  const s=await setup(),id=await s.create();await s.transfer(id,0,'member_C');await s.decide(id,2,'declined')
  // 拒绝后任务回到派发人手里，他不能再邀请别人，只能再转交出去。
  await s.transfer(id,0,'member_B')
  await s.decide(id,1);await s.transfer(id,1,'member_C')
  const result=await s.ok('tasks/'+id+'/invitations/cancel',{expectedVersion:(await s.task(id,1)).version},1)
  expect(result.leadId).toBe('member_B');expect(result.status).toBe('ready')
  expect(s.db.prepare("SELECT from_member_id FROM task_handoffs WHERE task_id=? AND status='cancelled'").get(id)!.from_member_id).toBe('member_B')
 })
 it('successor acceptance ends the former lead access; explicit revocation never gets undone by cancellation',async()=>{
  const s=await setup(),id=await s.create(true);await s.decide(id,1);await s.transfer(id,1,'member_C');await s.decide(id,2)
  expect((await s.call('tasks/'+id,undefined,1)).statusCode).toBe(404);expect((await s.task(id,2)).leadId).toBe('member_C')
  const declined=await s.create(true);await s.decide(declined,1);await s.transfer(declined,1,'member_C');await s.decide(declined,2,'declined')
  expect((await s.call('tasks/'+declined,undefined,1)).statusCode).toBe(404)
  const other=await s.create(true);await s.decide(other,1);await s.transfer(other,1,'member_C')
  s.db.prepare("UPDATE task_access SET access='revoked' WHERE task_id=? AND member_id='member_B'").run(other)
  const version=Number(s.db.prepare('SELECT version FROM tasks WHERE id=?').get(other)!.version)
  expect((await s.call('tasks/'+other+'/invitations/cancel',{expectedVersion:version},1)).statusCode).toBe(404)
  const result=await s.ok('tasks/'+other+'/invitations/cancel',{expectedVersion:version})
  expect(result).toMatchObject({leadId:null,status:'unassigned'});expect((await s.call('tasks/'+other,undefined,1)).statusCode).toBe(404)
 })
 it('revoking the invited target closes the handoff and permits a later valid transfer',async()=>{
  const s=await setup(),id=await s.create();await s.transfer(id,0,'member_C')
  await s.ok('tasks/'+id+'/revoke-access',{expectedVersion:(await s.task(id)).version,memberId:'member_C',reason:'Synthetic revocation'})
  expect(s.db.prepare("SELECT count(*) n FROM task_handoffs WHERE task_id=? AND status='pending'").get(id)!.n).toBe(0)
  await s.ok('tasks/'+id+'/invitations',{expectedVersion:(await s.task(id)).version,memberId:'member_B',scope:'B scope',schedule})
  await s.decide(id,1);await s.transfer(id,1,'member_A')
  expect((await s.task(id)).status).toBe('awaiting_acceptance')
 })
 it('older strict readers get legacy summary fields and no unknown handoff action',async()=>{
  const s=await setup(),id=await s.create(true)
  const modern=await s.call('tasks/'+id);expect(modern.json().data.task.allowedActions).toContain('cancel_invitation')
  const legacy=await s.call('tasks/'+id,undefined,0,randomUUID(),false)
  expect(legacy.json().data.task.allowedActions).not.toContain('cancel_invitation');expect(Task.safeParse(legacy.json().data.task).success).toBe(true)
  const overview=await s.call('labs/lab_synthetic/overview?scope=lab',undefined,0,randomUUID(),false)
  expect(overview.statusCode,overview.body).toBe(200);expect(overview.json().data.blockedTaskIds).toEqual([])
  const workspace=await s.call('labs/lab_synthetic/research-workspace',undefined,0,randomUUID(),false)
  expect(workspace.statusCode,workspace.body).toBe(200);expect(workspace.json().summary.blocked).toBe(0)
  await s.ok('tasks/'+id+'/invitations/cancel',{expectedVersion:1})
  const events=await s.call('tasks/'+id+'/events',undefined,0,randomUUID(),false)
  const legacyEvent=TaskEvent.extend({kind:TaskEvent.shape.kind.exclude(['invitation_cancelled'])})
  expect(events.statusCode,events.body).toBe(200)
  for(const event of events.json().data)expect(legacyEvent.safeParse(event).success).toBe(true)
  const modernEvents=await s.call('tasks/'+id+'/events')
  expect(modernEvents.json().data.some((event:any)=>event.kind==='invitation_cancelled')).toBe(true)
 })
 it('invitation notices are persisted once and cancelled offers never notify a new target',async()=>{
  const s=await setup(),id=await s.create(true),worker=new TaskInvitationWorker(s.db,s.config)
  while(await worker.tick()){};expect(await worker.tick()).toBe(false)
  const notice=s.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.origin')='service' AND json_extract(document,'$.text') LIKE '%邀请你承接任务%'").get()!
  expect(notice.n).toBe(1)
  await s.decide(id,1);await s.transfer(id,1,'member_C');await s.ok('tasks/'+id+'/invitations/cancel',{expectedVersion:(await s.task(id,1)).version},1)
  while(await worker.tick()){}
  expect(s.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.origin')='service' AND json_extract(document,'$.text') LIKE '%邀请你承接任务%'").get()!.n).toBe(1)
 })
 it('migration031 restores current blocked tasks once and preserves all prior versions, events and account rows',async()=>{
  const s=await setup(),id=await s.create();await s.ok('tasks/'+id+'/start',{expectedVersion:1})
  s.db.exec('DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31')
  const old=JSON.parse(String(s.db.prepare('SELECT document FROM tasks WHERE id=?').get(id)!.document));old.version++;old.status='blocked';old.blocker={reason:'Synthetic old blocker',requestedMemberId:null,requestedAction:'Synthetic evidence',resumeStatus:'in_progress'}
  s.db.prepare("UPDATE tasks SET status='blocked',version=?,document=? WHERE id=?").run(old.version,JSON.stringify(old),id)
  s.db.prepare('INSERT INTO task_versions VALUES(?,?,?)').run(id,old.version,JSON.stringify(old))
  const accounts=s.db.prepare('SELECT * FROM auth_accounts ORDER BY member_id').all(),history=s.db.prepare('SELECT * FROM schema_migrations').all()
  migrate(s.db);const restored=await s.task(id);expect(restored).toMatchObject({status:'in_progress',version:old.version+1,blocker:null})
  const saved=String(s.db.prepare('SELECT document FROM task_versions WHERE task_id=? AND version=?').get(id,old.version)!.document)
  expect(JSON.parse(saved)).toEqual(old);expect(Task.safeParse(JSON.parse(saved)).success).toBe(true)
  const eventCount=s.db.prepare('SELECT count(*) n FROM task_events').get()!.n
  migrate(s.db);expect((await s.task(id)).version).toBe(restored.version);expect(s.db.prepare('SELECT count(*) n FROM task_events').get()!.n).toBe(eventCount)
  expect(s.db.prepare('SELECT * FROM auth_accounts ORDER BY member_id').all()).toEqual(accounts);expect(s.db.prepare('SELECT * FROM schema_migrations WHERE version<=30').all()).toEqual(history)
  expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
 })
})
