import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { routes, type RouteName, type Contact } from '@research-agent-platform/contracts'
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

 async function route(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,key=randomUUID()){
  const r=routes[name],url=r.path.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!);
  return app.inject({method:r.method,url,headers:{origin:config.origin,cookie:people[actor]!.cookie,'x-csrf-token':people[actor]!.csrf,'idempotency-key':key},...(r.method==='GET'?{}:{payload:body as any})});
 }
 const contacts=(await route('chatContacts')).json().data as Contact[];
 const human=(owner:string)=>contacts.find(c=>c.identity.kind==='human'&&c.identity.memberId===owner)!;
 const agent=(owner:string)=>contacts.find(c=>c.identity.kind==='personal_agent'&&c.identity.ownerMemberId===owner)!;
 const request=(await route('requestContact',{}, {id:human('member_B').id})).json().data.relationship;
 await route('decideContactRequest',{expectedVersion:request.version,decision:'accept'},{id:request.requestId},1);
 const created=await route('imCreateGroup',{title:'Synthetic literature group',contactIds:[human('member_B').id],plan:null,sharedContext:{selectedText:null,artifactRefs:[]}});
 expect(created.statusCode,created.body).toBe(200);const groupId=created.json().data.id;
 for(const actor of [0,1])for(const i of (await route('chatInvitations',null,{},actor)).json().data.filter((i:any)=>i.conversationId===groupId)){
  const accepted=await route('decideChatInvitation',{expectedVersion:i.version,decision:'accept'},{id:i.id},actor);expect(accepted.statusCode,accepted.body).toBe(200);
 }
 const source=await route('sendChatMessage',{text:'Please organize the synthetic literature.'},{id:groupId});expect(source.statusCode,source.body).toBe(201);
 const sourceMessageId=source.json().data.message.id;
 const group=(await route('chatConversation',null,{id:groupId})).json().data;
 const body={sourceMessageId,expectedConversationVersion:group.version,assignments:['member_A','member_B'].map(owner=>({agentContactId:agent(owner).id,title:owner+' literature',goal:'Compare two synthetic publications and cite original pages.'}))};
 return {db,app,call,route,groupId,sourceMessageId,body,agent};
}
async function assigned(s:Awaited<ReturnType<typeof setup>>){
 const key=randomUUID(),r=await s.route('createTeamWork',s.body,{id:s.groupId},0,key);expect(r.statusCode,r.body).toBe(200);
 return {items:r.json().data as any[],key};
}
async function begin(s:Awaited<ReturnType<typeof setup>>,id:string,actor=0){
 let data=(await s.route('task',null,{id},actor)).json().data;
 if(!data.task){
  const assignment=s.db.prepare("SELECT id,version FROM assignments WHERE task_id=? AND member_id=? AND status='pending'").get(id,actor===0?'member_A':'member_B')!;
  const accepted=await s.route('invitationDecision',{expectedVersion:assignment.version,expectedTaskVersion:data.version,decision:'accepted',comment:null},{id:String(assignment.id)},actor);expect(accepted.statusCode,accepted.body).toBe(200);
  data=(await s.route('task',null,{id},actor)).json().data;
 }
 const started=await s.route('start',{expectedVersion:data.task.version},{id},actor);expect(started.statusCode,started.body).toBe(200);
}
it('creates two independent human-confirmed assignments idempotently and shares only linked status receipts',{timeout:20000},async()=>{
 const s=await setup(),{items,key}=await assigned(s);
 expect(items.map(i=>i.status)).toEqual(['ready','awaiting_acceptance']);
 expect((await s.route('createTeamWork',s.body,{id:s.groupId},0,key)).json().data.map((i:any)=>i.taskId)).toEqual(items.map(i=>i.taskId));
 expect((await s.route('createTeamWork',{...s.body,expectedConversationVersion:items.length+999},{id:s.groupId},0,key)).statusCode).toBe(409);
 expect(s.db.prepare('SELECT count(*) n FROM tasks').get()!.n).toBe(2);
 expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0);
 expect((await s.route('teamWork',null,{id:s.groupId},2)).statusCode).toBe(404);
 const foreign=await s.route('claimWorkExecution',{deviceId:randomUUID(),requestId:randomUUID()},{kind:'research',id:items[1].taskId},0);expect(foreign.statusCode).toBe(403);
 const policy=(await s.call('work-context/research/'+items[0].taskId)).json().data;expect(policy.privateMemoryAllowed).toBe(false);
 expect(s.db.prepare('SELECT count(*) n FROM chat_message_relations WHERE reply_to_id=?').get(s.sourceMessageId)!.n).toBe(2);
});
it('requires acceptance, arbitrates devices, retains uncertain locks and bounds explicit retries',{timeout:20000},async()=>{
 const s=await setup(),{items}=await assigned(s),id=items[1].taskId,params={kind:'research',id},deviceId=randomUUID(),requestId=randomUUID();
 expect((await s.route('claimWorkExecution',{deviceId,requestId},params,1)).statusCode).toBe(403);
 await begin(s,id,1);
 const a=await s.route('claimWorkExecution',{deviceId,requestId},params,1);expect(a.statusCode,a.body).toBe(200);const e=a.json().data;
 expect((await s.route('claimWorkExecution',{deviceId,requestId},params,1)).json().data.id).toBe(e.id);
 expect((await s.route('claimWorkExecution',{deviceId:randomUUID(),requestId:randomUUID()},params,1)).statusCode).toBe(409);
 const expired={...e,heartbeatAt:'2020-01-01T00:00:00.000Z'};s.db.prepare('UPDATE work_executions SET document=? WHERE id=?').run(JSON.stringify(expired),e.id);
 expect((await s.route('workExecution',null,params,1)).json().data.execution.phase).toBe('uncertain');
 expect((await s.route('claimWorkExecution',{deviceId:randomUUID(),requestId:randomUUID()},params,1)).statusCode).toBe(409);
 const report={executionId:e.id,deviceId,requestId,phase:'finished'};
 expect((await s.route('reportWorkExecution',{...report,deviceId:randomUUID()},params,1)).statusCode).toBe(404);
 expect((await s.route('reportWorkExecution',report,params,1)).statusCode).toBe(200);
 for(let n=2;n<=3;n++){
  const requestId=randomUUID(),r=await s.route('claimWorkExecution',{deviceId,requestId},params,1);expect(r.statusCode,r.body).toBe(200);
  expect((await s.route('reportWorkExecution',{executionId:r.json().data.id,deviceId,requestId,phase:'failed'},params,1)).statusCode).toBe(200);
 }
 expect((await s.route('claimWorkExecution',{deviceId,requestId:randomUUID()},params,1)).statusCode).toBe(429);
 expect((await s.route('teamWork',null,{id:s.groupId})).json().data.find((i:any)=>i.taskId===items[0].taskId).status).toBe('ready');
});
it('revokes execution on group membership change while allowing the original device to close its process',{timeout:20000},async()=>{
 const s=await setup(),{items}=await assigned(s),id=items[1].taskId,params={kind:'research',id};await begin(s,id,1);
 const deviceId=randomUUID(),requestId=randomUUID(),claimed=await s.route('claimWorkExecution',{deviceId,requestId},params,1);expect(claimed.statusCode,claimed.body).toBe(200);
 const group=(await s.route('chatConversation',null,{id:s.groupId})).json().data,agentId=String(s.db.prepare("SELECT id FROM chat_contacts WHERE kind='human' AND owner_id='member_B'").get()!.id),member=group.members.find((m:any)=>m.contactId===agentId);
 const revoked=await s.route('revokeChatMember',{expectedVersion:member.version,expectedConversationVersion:group.version,reason:'Synthetic revoke'},{id:s.groupId,contactId:agentId});expect(revoked.statusCode,revoked.body).toBe(200);
 const report={executionId:claimed.json().data.id,deviceId,requestId,phase:'running'};
 const denied=await s.route('reportWorkExecution',report,params,1);expect(denied.statusCode,denied.body).toBe(404);
 expect((await s.route('reportWorkExecution',{...report,phase:'stopped'},params,1)).statusCode).toBe(200);
 expect((await s.route('teamWork',null,{id:s.groupId})).json().data.find((i:any)=>i.taskId===id).status).toBe('unavailable');
});
it('upgrades populated schema029 twice without changing old rows',{timeout:20000},async()=>{
 const s=await setup();s.db.exec('DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE IF EXISTS team_library_repositories; DELETE FROM schema_migrations WHERE version=33; DROP TABLE IF EXISTS library_index_entries; DELETE FROM schema_migrations WHERE version=32; DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30');
 s.db.exec("DELETE FROM chat_members WHERE contact_id IN (SELECT id FROM chat_contacts WHERE principal GLOB 'group:*'); DELETE FROM chat_contacts WHERE principal GLOB 'group:*'");
 // 035 intentionally changes group contacts/membership/version. Byte preservation
 // of messages/commitments and the actual 034→035 transition are covered in group-governance.spec.
 const tables=s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_migrations','chat_contacts','chat_conversations','chat_members','im_conversations') AND name NOT LIKE 'sqlite_%'").all().map(r=>String(r.name));
 const snapshot=()=>tables.map(t=>[t,s.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]);const before=snapshot();migrate(s.db);migrate(s.db);expect(snapshot()).toEqual(before);expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
});

it('keeps execution, submission and human acceptance separate for two owners', {timeout:20000},async()=>{
 const s=await setup(),{items}=await assigned(s);
 for(const [actor,item] of items.entries()){
  await begin(s,item.taskId,actor);
  const params={kind:'research',id:item.taskId},deviceId=randomUUID(),requestId=randomUUID();
  const claim=await s.route('claimWorkExecution',{deviceId,requestId},params,actor);expect(claim.statusCode,claim.body).toBe(200);
  const report={executionId:claim.json().data.id,deviceId,requestId,phase:'finished'};
  expect((await s.route('reportWorkExecution',report,params,actor)).statusCode).toBe(200);
  const task=(await s.route('task',null,{id:item.taskId},actor)).json().data.task;expect(task.status).toBe('in_progress');
  const delivery=await s.route('submit',{expectedVersion:task.version,summary:'Synthetic source comparison; manual inspection required.',artifactRefs:[],sources:[{kind:'note',locator:'synthetic:papers',label:'Synthetic papers'}]},{id:item.taskId},actor);expect(delivery.statusCode,delivery.body).toBe(201);
  const current=(await s.route('task',null,{id:item.taskId})).json().data.task;expect(current.status).toBe('in_review');
  const d=delivery.json().data,review={expectedVersion:d.version,expectedTaskVersion:current.version,revision:d.revision,decision:'accepted',comment:'Human inspected synthetic output'};
  if(actor===1)expect((await s.route('review',review,{id:d.id},1)).statusCode).toBe(403);
  const accepted=await s.route('review',review,{id:d.id});expect(accepted.statusCode,accepted.body).toBe(200);
 }
 const list=(await s.route('teamWork',null,{id:s.groupId})).json().data;
 expect(list.map((i:any)=>i.status)).toEqual(['completed','completed']);
 expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(0);
 const shared=s.db.prepare("SELECT document FROM chat_messages WHERE conversation_id=? AND json_extract(document,'$.origin')='service'").all(s.groupId).map(r=>String(r.document)).join('');
 expect(shared).toContain('成果已提交，待验收');expect(shared).toContain('成果已验收');expect(shared).not.toContain('synthetic:papers');
});
