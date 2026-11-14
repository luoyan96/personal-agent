import {randomUUID,randomBytes} from 'node:crypto'
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,it,expect} from 'vitest'
import {routes,type RouteName} from '@research-agent-platform/contracts'
import {readConfig} from '../src/config.js'
import {migrate,openDatabase} from '../src/database.js'
import {passwordHash,authenticate,hash} from '../src/auth.js'
import {createServer} from '../src/server.js'
import {serviceFor} from '../src/execution-worker.js'
import {personalModelRuntime} from '../src/personal-models.js'
import {encrypt} from '../src/lab-ai-settings.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const password=randomBytes(24).toString('hex'),encoded=passwordHash(password)
async function setup(){
 const dir=mkdtempSync(join(tmpdir(),'lab-membership-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
 const master=join(dir,'master.key');writeFileSync(master,randomBytes(32).toString('hex'),{mode:0o600})
 const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4498',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:master})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db)
 for(const id of ['A','B','C']){
  db.prepare('INSERT INTO labs VALUES (?,?)').run('home_'+id,'Private '+id)
  db.prepare('INSERT INTO members(id,lab_id,display_name) VALUES (?,?,?)').run(id,'home_'+id,'Synthetic '+id)
  db.prepare('INSERT INTO auth_accounts VALUES (?,?,?,0)').run(id,'synthetic_lab_'+id,await encoded)
  db.prepare('INSERT INTO personal_spaces VALUES (?,?)').run('home_'+id,id)
 }
 const app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
 const clients:Record<string,{cookie:string;csrf:string}>={}
 const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor='A',key=randomUUID(),extra:Record<string,string>={})=>{
  const route=routes[name],path=Object.entries(params).reduce((p,[k,v])=>p.replace('{'+k+'}',encodeURIComponent(v)),route.path)
  const response=await fetch(url+path,{method:route.method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':key,...(clients[actor]?{cookie:clients[actor].cookie,'x-csrf-token':clients[actor].csrf}:{}),...extra},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
  const text=await response.text(),value=JSON.parse(text);if(response.ok)route.response.parse(value)
  return {status:response.status,value,text,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
 }
 const ok=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor='A',key=randomUUID())=>{const r=await call(name,body,params,actor,key);expect(r.status,r.text).toBeLessThan(300);return r.value.data}
 for(const id of ['A','B','C']){const login=await call('login',{username:'synthetic_lab_'+id,password},{},id);expect(login.status).toBe(200);clients[id]={cookie:login.cookie,csrf:''};clients[id]!.csrf=(await ok('session',null,{},id)).csrfToken}
 const create=()=>ok('createLab',{name:'Synthetic research lab'})
 const invite=async(labId:string,actor='B')=>{const i=await ok('inviteLabMember',{username:'synthetic_lab_'+actor},{id:labId});await ok('decideLabInvitation',{expectedVersion:i.version,decision:'accepted'},{id:i.id},actor);return i}
 const codes=(id:string,maxUses=1)=>ok('createManagerInvite',{expiresAt:new Date(Date.now()+3600000).toISOString(),maxUses},{id})
 return {db,config,call,ok,create,invite,codes,clients}
}

describe('research group membership: real HTTP and isolated SQLite, synthetic accounts',{timeout:20000},()=>{
 it('creates a managed group on the same account without moving home, private collections, contacts or chat',async()=>{
  const s=await setup(),before=await s.ok('personalConversation',{}),privateCollection=await s.ok('createResearchCollection',{name:'Private source',description:'',scope:'owner_private',taskIds:[]})
  await s.ok('createPersonalModel',{name:'Synthetic private model',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:'synthetic_private_model_key'})
  const credentials=s.db.prepare('SELECT * FROM personal_model_configurations WHERE member_id=?').all('A'),defaults=s.db.prepare('SELECT * FROM personal_model_settings WHERE member_id=?').get('A')
  const lab=await s.create(),session=await s.ok('session'),after=await s.ok('personalConversation',{})
  expect(session.member).toMatchObject({id:'A',labId:lab.id});expect(session.isLabManager).toBe(true);expect(session.spaceKind).toBe('laboratory')
  expect(after.conversation.id).toBe(before.conversation.id);expect(after.agent.id).toBe(before.agent.id)
  expect(s.db.prepare('SELECT * FROM personal_model_configurations WHERE member_id=?').all('A')).toEqual(credentials)
  expect(s.db.prepare('SELECT * FROM personal_model_settings WHERE member_id=?').get('A')).toEqual(defaults)
  expect(s.db.prepare('SELECT lab_id FROM members WHERE id=?').get('A')!.lab_id).toBe('home_A')
  expect(s.db.prepare('SELECT lab_id,scope FROM research_collections WHERE id=?').get(privateCollection.id)).toEqual({lab_id:'home_A',scope:'owner_private'})
  expect((await s.ok('myLabs')).groups).toEqual([lab]);expect((await s.call('createLab',{name:'Second'})).value.error.code).toBe('LAB_ALREADY_MANAGED')
 })
 it('requires the intended existing account to accept and lists the real shared roster',async()=>{
  const s=await setup(),lab=await s.create(),i=await s.ok('inviteLabMember',{username:'synthetic_lab_B'},{id:lab.id})
  expect((await s.ok('myLabs',null,{},'B')).groups).toEqual([])
  expect((await s.call('decideLabInvitation',{expectedVersion:i.version,decision:'accepted'},{id:i.id},'C')).status).toBe(404)
  expect((await s.call('labMembership',null,{id:lab.id},'B')).status).toBe(404)
  await s.ok('decideLabInvitation',{expectedVersion:i.version,decision:'accepted'},{id:i.id},'B')
  expect((await s.ok('session',null,{},'B')).member).toMatchObject({id:'B',labId:lab.id})
  const members=await s.ok('labMembership',null,{id:lab.id},'B');expect(members.members.map((m:{id:string})=>m.id)).toEqual(['A','B'])
  const response=await s.call('members',null,{id:lab.id},'B');expect(response.status,response.text).toBe(200);expect(response.value.data.map((m:{id:string})=>m.id)).toEqual(['A','B'])
  expect((await s.call('inviteLabMember',{username:'synthetic_lab_C'},{id:lab.id},'B')).status).toBe(403)
  expect((await s.call('removeLabMember',{expectedVersion:1},{id:lab.id,memberId:'A'},'B')).status).toBe(403)
 })
 it('supports rejection, revocation, expiry and an exact invitation retry without duplicate membership',async()=>{
  const s=await setup(),lab=await s.create(),key=randomUUID(),body={username:'synthetic_lab_B'}
  const i=await s.ok('inviteLabMember',body,{id:lab.id},'A',key)
  expect((await s.ok('inviteLabMember',body,{id:lab.id},'A',key)).id).toBe(i.id)
  expect((await s.call('inviteLabMember',{username:'synthetic_lab_C'},{id:lab.id},'A',key)).value.error.code).toBe('IDEMPOTENCY_CONFLICT')
  await s.ok('decideLabInvitation',{expectedVersion:i.version,decision:'declined'},{id:i.id},'B')
  const next=await s.ok('inviteLabMember',body,{id:lab.id});await s.ok('revokeLabInvitation',{expectedVersion:next.version},{id:next.id})
  expect((await s.call('decideLabInvitation',{expectedVersion:next.version+1,decision:'accepted'},{id:next.id},'B')).value.error.code).toBe('INVITE_UNAVAILABLE')
  const expired=await s.ok('inviteLabMember',body,{id:lab.id});s.db.prepare('UPDATE lab_member_invitations SET expires_at=? WHERE id=?').run('2020-01-01T00:00:00Z',expired.id)
  expect((await s.call('decideLabInvitation',{expectedVersion:expired.version,decision:'accepted'},{id:expired.id},'B')).value.error.code).toBe('INVITE_UNAVAILABLE')
  expect((await s.ok('myLabs',null,{},'B')).groups).toEqual([])
 })
 it('shares a code between current-account joining and new-account registration, enforcing capacity atomically',async()=>{
  const s=await setup(),lab=await s.create(),issued=await s.codes(lab.id)
  expect(await s.ok('previewLabCode',{inviteCode:issued.code},{},'B')).toMatchObject({labId:lab.id,name:lab.name})
  const key=randomUUID(),joined=await s.ok('joinLab',{inviteCode:issued.code},{},'B',key)
  expect(joined.id).toBe(lab.id);expect((await s.ok('joinLab',{inviteCode:issued.code},{},'B',key)).id).toBe(lab.id)
  expect((await s.call('joinLab',{inviteCode:issued.code},{},'C')).value.error.code).toBe('INVITE_UNAVAILABLE')
  expect(s.db.prepare('SELECT used_count FROM registration_invites WHERE id=?').get(issued.invite.id)!.used_count).toBe(1)
  const second=await s.codes(lab.id)
  expect((await s.call('register',{username:'synthetic_new_member',displayName:'Synthetic new member',password,inviteCode:second.code},{},'anonymous')).status).toBe(201)
  expect(s.db.prepare('SELECT count(*) n FROM effective_lab_memberships WHERE lab_id=?').get(lab.id)!.n).toBe(3)
  const third=await s.codes(lab.id);await s.ok('revokeManagerInvite',{}, {id:lab.id,inviteId:third.invite.id})
  expect((await s.call('previewLabCode',{inviteCode:third.code},{},'C')).value.error.code).toBe('INVITE_UNAVAILABLE')
 })
 it('preserves private material until its owner explicitly shares and revokes it when the owner leaves',async()=>{
  const s=await setup(),lab=await s.create();await s.invite(lab.id)
  let collection=await s.ok('createResearchCollection',{name:'Owned B',description:'',scope:'owner_private',taskIds:[]},{},'B')
  expect((await s.ok('researchCollections')).some((c:{id:string})=>c.id===collection.id)).toBe(false)
  collection=await s.ok('updateResearchCollection',{expectedVersion:collection.version,settings:{name:collection.name,description:'',scope:'lab_shared',taskIds:[]}},{id:collection.id},'B')
  expect(collection.labId).toBe(lab.id)
  expect((await s.ok('researchCollections')).some((c:{id:string})=>c.id===collection.id)).toBe(true)
  await s.ok('leaveLab',{}, {id:lab.id},'B')
  expect((await s.ok('researchCollections')).some((c:{id:string})=>c.id===collection.id)).toBe(false)
  expect(s.db.prepare('SELECT lab_id,scope FROM research_collections WHERE id=?').get(collection.id)).toEqual({lab_id:'home_B',scope:'owner_private'})
  expect((await s.ok('session',null,{},'B')).member.labId).toBe('home_B')
 })
 it('uses group membership for task assignment and fences old grants and queued workers after removal',async()=>{
  const s=await setup(),lab=await s.create();await s.invite(lab.id)
  const plan=await s.ok('createPlan',{labId:lab.id,goal:'Synthetic team task',unresolvedQuestions:[],proposedItems:[{id:'step',title:'Synthetic task',goal:'Research question',deliverable:'Evidence',acceptanceCriteria:'Check evidence',allocation:{kind:'invitation',memberId:'B'},dependencies:[],schedule:{suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null},inputArtifactIds:[],budget:null}]})
  const confirmed=await s.ok('confirmPlan',{expectedVersion:plan.version},{id:plan.id}),taskId=confirmed.taskIds[0]
  expect((await s.call('task',null,{id:taskId},'B')).status).toBe(200)
  const member=(await s.ok('labMembership',null,{id:lab.id})).members.find((m:{id:string})=>m.id==='B')
  await s.ok('removeLabMember',{expectedVersion:member.version},{id:lab.id,memberId:'B'})
  expect((await s.call('task',null,{id:taskId},'B')).status).toBe(404)
  expect(()=>serviceFor(s.db,'B',s.config,lab.id)).toThrow('AUTHORITY_REVOKED')
  await s.invite(lab.id)
  expect((await s.call('task',null,{id:taskId},'B')).status).toBe(404)
  expect((await s.call('leaveLab',{}, {id:lab.id})).value.error.code).toBe('LAB_MANAGER_CANNOT_LEAVE')
 })
 it('keeps separate group contexts and refuses forged context, origin and CSRF requests',async()=>{
  const s=await setup(),lab=await s.create(),other=await s.ok('createLab',{name:'Other group'},{},'C')
  expect((await s.call('selectLab',{labId:other.id})).status).toBe(404)
  expect((await s.call('selectLab',{labId:'home_A'},{},'A',randomUUID(),{'x-csrf-token':''})).status).toBe(403)
  expect((await s.call('selectLab',{labId:'home_A'},{},'A',randomUUID(),{origin:'http://foreign.invalid'})).status).toBe(403)
  await s.ok('selectLab',{labId:'home_A'});expect((await s.ok('session')).spaceKind).toBe('personal')
  await s.ok('selectLab',{labId:lab.id});expect((await s.ok('session')).isLabManager).toBe(true)
  const token=s.clients.A!.cookie.split('=')[1]!,actor=authenticate(s.db,token);expect(actor.labId).toBe('home_A');expect(actor.teamLabId).toBe(lab.id)
  expect(s.db.prepare('SELECT token_hash FROM sessions WHERE member_id=?').get('A')!.token_hash).toBe(hash(token))
 })
 it('never charges an old lab model after removal from the immutable account home lab',async()=>{
  const s=await setup();s.db.prepare('DELETE FROM personal_spaces WHERE owner_id=?').run('C')
  s.db.prepare("INSERT INTO lab_memberships VALUES (?,?,'active',?,1)").run('home_C','A',new Date().toISOString())
  s.db.prepare('INSERT INTO lab_managers VALUES (?,?,?,NULL)').run('home_C','A',new Date().toISOString())
  s.db.prepare('INSERT INTO lab_ai_settings VALUES (?,1,?,?,1,?,?)').run('home_C','deepseek-flash',encrypt(s.config,'home_C','synthetic_legacy_lab_model_key'),'A',new Date().toISOString())
  const token=s.clients.C!.cookie.split('=')[1]!
  expect(personalModelRuntime(s.db,authenticate(s.db,token),s.config).enabled).toBe(true)
  await s.ok('removeLabMember',{expectedVersion:1},{id:'home_C',memberId:'C'})
  expect(personalModelRuntime(s.db,authenticate(s.db,token),s.config).enabled).toBe(false)
  expect((await s.ok('personalModels',null,{},'C')).legacyLabAvailable).toBe(false)
  expect((await s.ok('session',null,{},'C')).spaceKind).toBe('personal')
  expect(s.db.prepare('SELECT lab_id FROM members WHERE id=?').get('C')!.lab_id).toBe('home_C')
 })
 it('allows only one concurrent consumer of a single-use joining code',async()=>{
  const s=await setup(),lab=await s.create(),issued=await s.codes(lab.id)
  const joined=await Promise.all(['B','C'].map(actor=>s.call('joinLab',{inviteCode:issued.code},{},actor)))
  expect(joined.map(r=>r.status).sort()).toEqual([200,400])
  expect(s.db.prepare('SELECT used_count FROM registration_invites WHERE id=?').get(issued.invite.id)!.used_count).toBe(1)
  expect(s.db.prepare('SELECT count(*) n FROM effective_lab_memberships WHERE lab_id=?').get(lab.id)!.n).toBe(2)
 })
 it('requires open initiator/reviewer duties to be resolved before leaving and then supports an exact leave retry',async()=>{
  const s=await setup(),lab=await s.create();await s.invite(lab.id)
  const plan=await s.ok('createPlan',{labId:lab.id,goal:'Synthetic responsibility',unresolvedQuestions:[],proposedItems:[{id:'step',title:'Synthetic work',goal:'Question',deliverable:'Evidence',acceptanceCriteria:'Check evidence',allocation:{kind:'self'},dependencies:[],schedule:{suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null},inputArtifactIds:[],budget:null}]},{},'B')
  const confirmed=await s.ok('confirmPlan',{expectedVersion:plan.version},{id:plan.id},'B'),taskId=confirmed.taskIds[0]
  expect((await s.call('leaveLab',{}, {id:lab.id},'B')).value.error.code).toBe('LAB_MEMBER_HAS_ACTIVE_TASKS')
  const task=(await s.ok('task',null,{id:taskId},'B')).task
  await s.ok('cancelTask',{expectedVersion:task.version,reason:'Synthetic cancelled responsibility'},{id:taskId},'B')
  const key=randomUUID();await s.ok('leaveLab',{}, {id:lab.id},'B',key)
  expect(await s.ok('leaveLab',{}, {id:lab.id},'B',key)).toEqual({left:true})
 })
 it('upgrades schema 024 without moving existing owners, private model ciphertext or shared collection rows',async()=>{
  const s=await setup(),collection=await s.ok('createResearchCollection',{name:'Synthetic legacy shared source',description:'',scope:'owner_private',taskIds:[]})
  await s.ok('createPersonalModel',{name:'Synthetic retained model',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:'synthetic_migration_private_key'})
  s.db.prepare('DELETE FROM personal_spaces WHERE owner_id=?').run('A')
  s.db.prepare("UPDATE research_collections SET scope='lab_shared' WHERE id=?").run(collection.id)
  s.db.exec('DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE IF EXISTS team_library_repositories; DELETE FROM schema_migrations WHERE version=33; DROP TABLE IF EXISTS library_index_entries; DELETE FROM schema_migrations WHERE version=32; DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30; DROP TABLE work_context_revisions; DROP TABLE work_context_records; DELETE FROM schema_migrations WHERE version=29; DROP TABLE chat_message_retractions; DROP TABLE chat_message_relations; DELETE FROM schema_migrations WHERE version=28; DROP TABLE deleted_personal_agents; DROP TABLE peer_library_signals; DROP TABLE peer_library_requests; DROP TABLE peer_library_devices; DROP TABLE chat_turn_lab_contexts; DROP TABLE research_collection_labs; DROP TABLE lab_member_invitations; DROP TABLE member_lab_contexts; DROP VIEW effective_lab_memberships; DROP TABLE lab_memberships; DELETE FROM schema_migrations WHERE version>=25')
  const rows=()=>['members','auth_accounts','sessions','personal_model_settings','personal_model_configurations','research_collections'].map(table=>s.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())
  const before=rows();migrate(s.db);migrate(s.db)
  expect(rows()).toEqual(before)
  expect(s.db.prepare('SELECT * FROM research_collection_labs').all()).toEqual([{collection_id:collection.id,lab_id:'home_A'}])
  expect(s.db.prepare('SELECT * FROM effective_lab_memberships').all()).toContainEqual({member_id:'A',lab_id:'home_A'})
  expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  expect(s.db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok')
  expect(s.db.prepare('SELECT max(version) v FROM schema_migrations').get()!.v).toBe(39)
 })
})
