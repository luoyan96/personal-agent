import { randomBytes,randomUUID,createHash } from 'node:crypto'
import { mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync,readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach,describe,it,expect } from 'vitest'
import { routes,AgentTurn,ChatMessage,type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase,migrate } from '../src/database.js'
import { createServer } from '../src/server.js'
import { ChatWorker } from '../src/chat-worker.js'
import { backup,restore } from '../src/recovery.js'
import { externalWire } from './support/external-wire.js'
import type { ExternalAgentCall } from '../src/external-agent-client.js'
const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
const profile={displayName:'已有项目分析 Agent',introduction:'讨论提供的项目文字。',capabilityDescription:'分析项目信息与证据缺口。',personality:'直接并说明未知内容。'}
const document={format:'research-agent-profile/v1',profile}
const endpoint='https://agent.synthetic.example/v1/chat/completions'
async function setup(){
 const dir=mkdtempSync(join(process.env.AGENT_INTEGRATION_EVIDENCE_ROOT??tmpdir(),'rap-integration-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
 const key=join(dir,'synthetic-master.key');writeFileSync(key,randomBytes(32).toString('hex'),{mode:0o600})
 const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'platform.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4383',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:key});mkdirSync(config.blobRoot)
 const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db)
 const wire=await externalWire();cleanup.push(wire.close)
 const app=createServer(config,{externalCall:wire.call}),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
 const clients:{cookie:string;csrf:string;id:string;username:string}[]=[]
 const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,key=randomUUID())=>{
  const r=routes[name],response=await fetch(url+r.path.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!)+(name==='contactRequests'?'?status=all':''),{method:r.method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':key,...(clients[actor]?{cookie:clients[actor]!.cookie,'x-csrf-token':clients[actor]!.csrf}:{})},...(r.method==='GET'?{}:{body:JSON.stringify(body)})})
  const text=await response.text();return {status:response.status,value:JSON.parse(text),text,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
 }
 for(const actor of [0,1]){
  const username=`integration_${actor}_${randomUUID().slice(0,8)}`,password='12345678'
  expect((await call('register',{username,password,displayName:`合成账号${actor}`},{},actor)).status).toBe(201)
  const login=await call('login',{username,password},{},actor);expect(login.status).toBe(200);clients[actor]={cookie:login.cookie,csrf:'',id:login.value.data.id,username};clients[actor]!.csrf=(await call('session',null,{},actor)).value.data.csrfToken
  if(actor===0)expect((await call('createPersonalModel',{name:'本人合成平台模型',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:'SYNTHETIC_PLATFORM_KEY'},{},actor)).status).toBe(201)
 }
 const imported=await call('importAgentProfile',document);expect(imported.status,imported.text).toBe(201);const contact=imported.value.data.contact,conversation=imported.value.data.conversation
 const configure=async(overrides:Record<string,unknown>={})=>call('updateAgentConnection',{expectedVersion:0,protocol:'chat_completions',endpoint,model:'existing-deployed-agent',enabled:true,allowAcceptedContacts:false,apiKey:'SYNTHETIC_EXTERNAL_KEY',...overrides},{id:contact.id})
 const send=(text='本条合成当前文字。',actor=0,id=conversation.id,consent=true)=>call('agentChatMessage',{text,...(consent?{externalConsent:true}:{})},{id},actor)
 const turn=async(id:string,actor=0)=>(await call('chatTurn',null,{id},actor)).value.data
 const tick=(callExternal:ExternalAgentCall=wire.call)=>new ChatWorker(db,config,async()=>{throw new Error('LOCAL_MODEL_MUST_NOT_RUN')},callExternal).tick()
 const storedLegacy=()=>{
  for(const row of db.prepare('SELECT document FROM chat_turns').all()){const value=JSON.parse(String(row.document));expect(AgentTurn.safeParse(value).success).toBe(true);expect(value).not.toHaveProperty('externalAgent');expect(value).not.toHaveProperty('agentRuntime')}
  for(const row of db.prepare('SELECT document FROM chat_messages').all()){const value=JSON.parse(String(row.document));expect(ChatMessage.safeParse(value).success).toBe(true);expect(value).not.toHaveProperty('externalConsent')}
 }
 return {db,config,dir,app,wire,call,clients,contact,conversation,configure,send,turn,tick,storedLegacy}
}
describe('Agent import and scoped connection actual HTTP/SQLite/HTTPS',{timeout:20000},()=>{
 it('imports/exports exact portable profiles with atomic idempotent reuse and private ownership',async()=>{
  const s=await setup(),key=randomUUID()
  const a=await s.call('importAgentProfile',document,{},0,key),b=await s.call('importAgentProfile',document,{},0,key)
  expect(a.value.data).toEqual(b.value.data);expect(a.value.data).toMatchObject({reused:true,mode:'profile_only',contact:{id:s.contact.id},conversation:{id:s.conversation.id}})
  expect((await s.call('exportAgentProfile',null,{id:s.contact.id})).value.data).toEqual(document)
  expect(s.contact).not.toHaveProperty('agentRuntime')
  for(const extra of [{ownerId:s.clients[1]!.id},{apiKey:'NEVER_IMPORT'},{endpoint}])expect((await s.call('importAgentProfile',{...document,...extra})).status).toBe(400)
  expect((await s.call('exportAgentProfile',null,{id:s.contact.id},1)).status).toBe(403)
  expect((await s.call('agentConnection',null,{id:s.contact.id},1)).status).toBe(403)
  expect(Number(s.db.prepare("SELECT count(*) n FROM chat_contacts WHERE kind='personal_agent' AND principal<>owner_id").get()!.n)).toBe(1)
  const remote=await s.configure();expect(remote.status,remote.text).toBe(200)
  const local=await s.call('importAgentProfile',document);expect(local.status,local.text).toBe(201);expect(local.value.data.reused).toBe(false);expect(local.value.data.contact.id).not.toBe(s.contact.id)
 })
 it('encrypts credential, authorizes versioned config and dedupes a real synthetic HTTPS probe without user content',async()=>{
  const s=await setup();expect((await s.configure()).status).toBe(200)
  const row=s.db.prepare('SELECT * FROM agent_connections').get()!;expect(String(row.encrypted_api_key)).not.toContain('SYNTHETIC_EXTERNAL_KEY')
  const c=(await s.call('chatContact',null,{id:s.contact.id})).value.data;expect(c.agentRuntime).toMatchObject({serviceOrigin:'https://agent.synthetic.example',callerAllowed:true,verification:'unverified'});expect(JSON.stringify(c)).not.toMatch(/chat\/completions|SYNTHETIC_EXTERNAL_KEY|encrypted_api_key/)
  const probeKey=randomUUID(),probe=await s.call('probeAgentConnection',{expectedVersion:1},{id:s.contact.id},0,probeKey)
  expect(probe.status,probe.text).toBe(200);expect(probe.value.data).toMatchObject({status:'passed',failure:null,usage:{inputTokens:30,outputTokens:15}})
  expect((await s.call('probeAgentConnection',{expectedVersion:1},{id:s.contact.id},0,probeKey)).value).toEqual(probe.value);expect(s.wire.seen).toHaveLength(1)
  expect(s.wire.seen[0]!.body.messages[1].content).toBe('Connection check: reply briefly.')
  expect((await s.configure({expectedVersion:1,endpoint:'https://another.synthetic.example/chat/completions',apiKey:undefined})).status).toBe(400)
  expect((await s.configure({expectedVersion:0})).status).toBe(409)
  const k=randomUUID(),disconnected=await s.call('disconnectAgentConnection',{expectedVersion:1},{id:s.contact.id},0,k);expect(disconnected.value.data).toMatchObject({version:2,connection:null})
  expect((await s.call('disconnectAgentConnection',{expectedVersion:1},{id:s.contact.id},0,k)).value).toEqual(disconnected.value)
  expect((await s.configure({expectedVersion:2})).value.data.version).toBe(3)
 })
 it('requires per-message consent; sends no profile/history/private memory/file; fences disconnect without platform fallback',async()=>{
  const s=await setup();await s.configure()
  await s.call('createChatMemory',{scope:'private_agent',scopeId:s.contact.id,content:'OWNER_PRIVATE_NOT_SENT',source:null})
  expect((await s.send('不外发',0,s.conversation.id,false)).status).toBe(403);expect(Number(s.db.prepare('SELECT count(*) n FROM chat_messages').get()!.n)).toBe(0)
  const file=await s.call('agentFileMessage',{filename:'synthetic.txt',mediaType:'text/plain',contentBase64:Buffer.from('秘密附件').toString('base64')},{id:s.conversation.id});expect(file.status,file.text).toBe(422);expect(file.value.error.code).toBe('EXTERNAL_FILES_UNSUPPORTED')
  const sent=await s.send();expect(sent.status,sent.text).toBe(201);expect(await s.tick()).toBe(true);expect(await s.turn(sent.value.data.turn.id)).toMatchObject({status:'succeeded',usage:{inputTokens:30,outputTokens:15}})
  expect(s.wire.seen[0]!.body.messages[1]).toEqual({role:'user',content:'本条合成当前文字。'});expect(JSON.stringify(s.wire.seen)).not.toMatch(/OWNER_PRIVATE|displayName|ownerId|labId|profile|memories|fileSource/)
  const next=await s.send('第二条完整文字');expect((await s.call('updateContactProfile',{expectedVersion:s.contact.profile.version,...profile,personality:'修改不外发的性格'},{id:s.contact.id})).status).toBe(200);expect(await s.tick()).toBe(true);expect(await s.turn(next.value.data.turn.id)).toMatchObject({status:'succeeded'})
  const stale=await s.send('连接撤销前排队');await s.call('disconnectAgentConnection',{expectedVersion:1},{id:s.contact.id});expect(await s.tick()).toBe(false);expect(await s.turn(stale.value.data.turn.id)).toMatchObject({status:'cancelled',failure:'AUTHORITY_CHANGED'});expect(s.wire.seen).toHaveLength(2)
  s.storedLegacy();for(const table of ['plans','tasks','chat_actions','execution_jobs'])expect(Number(s.db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n)).toBe(0)
 })
 it('allows only owner-authorized accepted contacts, keeps private owner context private and fences revoked late results while retaining usage',async()=>{
  const s=await setup();await s.configure()
  const requested=await s.call('requestContact',{}, {id:s.contact.id},1),relation=requested.value.data.relationship
  expect(requested.status,requested.text).toBe(200)
  await s.call('decideContactRequest',{expectedVersion:relation.version,decision:'accept'},{id:relation.requestId})
  const direct=await s.call('createDirectConversation',{contactId:s.contact.id},{},1);expect(direct.status,direct.text).toBe(200)
  expect((await s.send('好友无主人共享许可',1,direct.value.data.id)).status).toBe(403)
  expect((await s.call('agentConnection',null,{id:s.contact.id},1)).status).toBe(403)
  await s.configure({expectedVersion:1,apiKey:undefined,allowAcceptedContacts:true})
  const shared=await s.send('好友本条文字',1,direct.value.data.id);expect(shared.status,shared.text).toBe(201);expect(await s.tick()).toBe(true);expect(await s.turn(shared.value.data.turn.id,1)).toMatchObject({status:'succeeded'})
  expect(s.wire.seen[0]!.authorization).toBe('Bearer SYNTHETIC_EXTERNAL_KEY');expect(s.wire.seen[0]!.body.messages[1].content).toBe('好友本条文字')
  const late=await s.send('撤回时正在执行',1,direct.value.data.id)
  let started!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>{started=r}),held=new Promise<void>(r=>{release=r})
  const working=s.tick(async()=>{started();await held;return {text:'不得提交的迟回复',failure:null,inputTokens:22,outputTokens:9,elapsedMs:5}});await ready
  const accepted=(await s.call('contactRequests',null,{},1)).value.data.find((v:any)=>v.id===relation.requestId)
  expect((await s.call('revokeContactRequest',{expectedVersion:accepted.version},{id:relation.requestId},1)).status).toBe(200);release();await working
  const row=s.db.prepare('SELECT * FROM chat_turns WHERE id=?').get(late.value.data.turn.id)!;expect(row.status).toBe('cancelled');expect(JSON.parse(String(row.document)).outputMessageId).toBeNull();expect(JSON.parse(String(s.db.prepare('SELECT usage_json FROM chat_attempts WHERE turn_id=?').get(late.value.data.turn.id)!.usage_json))).toMatchObject({inputTokens:22,outputTokens:9})
  expect((await s.call('chatConversation',null,{id:direct.value.data.id},1)).status).toBe(404)
 })
 it('rejects tool calls/truncation/unknown usage with no resource side effects and private failure metadata',async()=>{
  const s=await setup();await s.configure()
  for(const [mode,failure] of [['tools','MODEL_FAILED'],['length','BUDGET_EXCEEDED'],['unknown','MODEL_FAILED']]){
   s.wire.setMode(mode!);const sent=await s.send('仅讨论本条');await s.tick();const t=await s.turn(sent.value.data.turn.id);expect(t).toMatchObject({status:'failed',failure,outputMessageId:null})
   const input=JSON.parse(String(s.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(t.id)!.request_json));expect(input.modelOutputDiagnostic.failure).toBe(mode==='tools'?'EXTERNAL_RESPONSE_INVALID':mode==='length'?'OUTPUT_LIMIT':'USAGE_UNCERTAIN');expect(JSON.stringify(input.modelOutputDiagnostic)).not.toMatch(/SYNTHETIC|本地合成/)
   if(mode==='unknown')expect(t.allowedActions).not.toContain('retry')
  }
  expect(s.wire.seen).toHaveLength(3);for(const table of ['plans','tasks','chat_actions','execution_jobs'])expect(Number(s.db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n)).toBe(0)
 })
 it('disables restored external credentials/version and queued calls without deleting history or actual usage',async()=>{
  const s=await setup();await s.configure();const queued=await s.send('备份前排队')
  await s.app.close();const source=join(s.dir,'backup'),target=join(s.dir,'restored')
  backup(s.config,source,'synthetic_operator','a'.repeat(40),'synthetic_config');restore(source,target,'synthetic_operator')
  const db=openDatabase(join(target,'platform.sqlite'));cleanup.push(()=>db.close())
  expect(db.prepare('SELECT enabled,version,encrypted_api_key FROM agent_connections').get()).toMatchObject({enabled:0,version:2,encrypted_api_key:expect.any(String)})
  let calls=0;expect(await new ChatWorker(db,{...s.config,databasePath:join(target,'platform.sqlite'),blobRoot:join(target,'blobs')},async()=>{calls++;throw new Error('FORBIDDEN')},async()=>{calls++;throw new Error('FORBIDDEN')}).tick()).toBe(false);expect(calls).toBe(0);expect(db.prepare('SELECT status FROM chat_turns WHERE id=?').get(queued.value.data.turn.id)!.status).toBe('cancelled')
 })
})

it('migration 016 to 017 preserves every populated old table row and is repeatable',async()=>{
 const fixture=await setup(),db=fixture.db
 // The populated fixture uses only legacy account/profile/direct operations.
 // Remove the empty 017 table/history entry to make an exact 016 snapshot.
 expect(db.prepare('SELECT count(*) n FROM agent_connections').get()!.n).toBe(0)
 db.exec('DROP TABLE installed_skill_uses; DROP TABLE installed_skill_versions; DROP TABLE installed_skills; DROP TABLE social_groups; DROP TABLE personal_work_participants; DROP TABLE personal_work_tasks; DROP TABLE capability_publications; DROP TABLE personal_followup_runs; DROP TABLE personal_followups; DROP TABLE personal_memory_revisions; DROP TABLE personal_memories; DROP TABLE personal_memory_settings; DROP TABLE agent_connections; DELETE FROM schema_migrations WHERE version>=17')
 const tables=db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations' ORDER BY name").all().map(r=>String(r.name))
 const digest=()=>Object.fromEntries(tables.map(table=>[table,createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM "${table}" ORDER BY rowid`).all())).digest('hex')]))
 const count=tables.reduce((n,t)=>n+Number(db.prepare(`SELECT count(*) n FROM "${t}"`).get()!.n),0);expect(count).toBeGreaterThan(30)
 const before=digest();migrate(db);migrate(db);expect(digest()).toEqual(before);expect(db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(21);expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
