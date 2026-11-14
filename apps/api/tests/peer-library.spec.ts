import {randomUUID,randomBytes,createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync} from 'node:fs'
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
 return {db,config,call,ok,create,invite,codes,clients,url}
}


const file={id:'file_record',name:'record.txt',size:5,sha256:'a'.repeat(64),modifiedAt:'2026-10-23T00:00:00Z'}
async function pair(){const s=await setup(),lab=await s.create();await s.invite(lab.id);for(const actor of ['A','B'])await s.ok('peerDevice',{deviceId:'device_'+actor,enabled:true},{},actor);return {...s,lab}}
async function get(s:Awaited<ReturnType<typeof pair>>,name:'peerRequests'|'peerSignals',actor='A',params:Record<string,string>={},query:Record<string,string>={}){
 const route=routes[name],path=Object.entries(params).reduce((p,[k,v])=>p.replace('{'+k+'}',v),route.path);const r=await fetch(s.url+path+'?'+new URLSearchParams(query),{headers:{cookie:s.clients[actor]!.cookie}});const value=await r.json();if(r.ok)route.response.parse(value);return {status:r.status,value}
}
describe('peer local-library coordination (real HTTP/SQLite, no file relay)',()=>{
 it('upgrades populated schema025 twice without changing old rows, blob bytes or migration checksums',async()=>{
  const s=await setup();writeFileSync(join(s.config.blobRoot,'synthetic-retained.blob'),'synthetic immutable original')
  s.db.exec('DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE IF EXISTS team_library_repositories; DELETE FROM schema_migrations WHERE version=33; DROP TABLE IF EXISTS library_index_entries; DELETE FROM schema_migrations WHERE version=32; DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30; DROP TABLE work_context_revisions; DROP TABLE work_context_records; DELETE FROM schema_migrations WHERE version=29; DROP TABLE chat_message_retractions; DROP TABLE chat_message_relations; DELETE FROM schema_migrations WHERE version=28; DROP TABLE deleted_personal_agents; DELETE FROM schema_migrations WHERE version=27; DROP TABLE peer_library_signals; DROP TABLE peer_library_requests; DROP TABLE peer_library_devices; DELETE FROM schema_migrations WHERE version=26')
  const tables=(s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='schema_migrations' ORDER BY name").all()).map(r=>String(r.name))
  const snapshot=()=>Object.fromEntries(tables.map(table=>[table,createHash('sha256').update(JSON.stringify(s.db.prepare('SELECT * FROM '+table+' ORDER BY rowid').all())).digest('hex')]))
  const before=snapshot(),history=s.db.prepare('SELECT * FROM schema_migrations').all();migrate(s.db);migrate(s.db)
  expect(readFileSync(join(s.config.blobRoot,'synthetic-retained.blob'),'utf8')).toBe('synthetic immutable original');expect(snapshot()).toEqual(before);expect(s.db.prepare('SELECT * FROM schema_migrations WHERE version<=25').all()).toEqual(history)
  expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);expect(s.db.prepare('PRAGMA integrity_check').get()!.integrity_check).toBe('ok')
  expect(s.db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(39)
 })
 it('queues while provider offline, returns only approved metadata and binds the selected attempt to both devices',async()=>{
  const s=await pair(),key=randomUUID(),request=await s.ok('createPeerRequest',{deviceId:'device_A',providerId:'B',query:'record'},{},'A',key)
  expect(request.status).toBe('requested');expect((await s.ok('createPeerRequest',{deviceId:'device_A',providerId:'B',query:'record'},{},'A',key)).id).toBe(request.id)
  expect((await get(s,'peerRequests','B',{}, {deviceId:'device_B'})).value.data).toHaveLength(1)
  const found=await s.ok('updatePeerRequest',{deviceId:'device_B',expectedVersion:request.version,action:'match',files:[file]},{id:request.id},'B')
  const selected=await s.ok('updatePeerRequest',{deviceId:'device_A',expectedVersion:found.version,action:'select',fileId:file.id},{id:request.id})
  expect(selected).toMatchObject({providerDeviceId:'device_B',requesterDeviceId:'device_A',status:'selected'})
  await s.ok('sendPeerSignal',{deviceId:'device_A',attemptId:selected.attemptId,kind:'offer',sdp:'v=0\r\nsynthetic-offer'},{id:request.id})
  expect((await get(s,'peerSignals','B',{id:request.id},{deviceId:'device_B',attemptId:selected.attemptId})).value.data).toEqual([{kind:'offer',sdp:'v=0\r\nsynthetic-offer'}])
  expect((await s.call('sendPeerSignal',{deviceId:'device_B',attemptId:selected.attemptId,kind:'offer',sdp:'spoof'},{id:request.id},'B')).status).toBe(403)
  await s.ok('sendPeerSignal',{deviceId:'device_B',attemptId:selected.attemptId,kind:'answer',sdp:'v=0\r\nsynthetic-answer'},{id:request.id},'B')
  const received=await s.ok('updatePeerRequest',{deviceId:'device_A',expectedVersion:selected.version,action:'received'},{id:request.id});expect(received.status).toBe('received')
  expect(s.db.prepare('SELECT count(*) n FROM peer_library_signals').get()!.n).toBe(0)
  expect(s.db.prepare('SELECT count(*) n FROM research_files').get()!.n).toBe(0)
  expect(s.db.prepare('SELECT document FROM chat_messages WHERE document LIKE ?').all('%原件已在接收设备%')).toHaveLength(1)
 })
 it('requires current same-group membership, CSRF, registered session device and blocks file bytes and local paths',async()=>{
  const s=await pair();expect((await s.call('createPeerRequest',{deviceId:'device_A',providerId:'C',query:'record'})).status).toBe(404)
  expect((await s.call('createPeerRequest',{deviceId:'device_B',providerId:'B',query:'record'})).status).toBe(409)
  expect((await s.call('createPeerRequest',{deviceId:'device_A',providerId:'B',query:'record',contentBase64:'eA=='})).status).toBe(400)
  const request=await s.ok('createPeerRequest',{deviceId:'device_A',providerId:'B',query:'record'})
  expect((await s.call('updatePeerRequest',{deviceId:'device_B',expectedVersion:1,action:'match',files:[{...file,name:'D:\\secret.txt'}]},{id:request.id},'B')).status).toBe(400)
  expect((await s.call('peerRequest',null,{id:request.id},'C')).status).toBe(403)
  expect((await s.call('updatePeerRequest',{deviceId:'device_B',expectedVersion:1,action:'match',files:[file]},{id:request.id},'B',randomUUID(),{'x-csrf-token':''})).status).toBe(403)
 })
 it('does not resurrect requests or cached mutations after removal and rejoining',async()=>{
  const s=await pair(),key=randomUUID(),body={deviceId:'device_A',providerId:'B',query:'record'},request=await s.ok('createPeerRequest',body,{},'A',key)
  const roster=await s.ok('labMembership',null,{id:s.lab.id}),member=roster.members.find((m:{id:string})=>m.id==='B')
  await s.ok('removeLabMember',{expectedVersion:member.version},{id:s.lab.id,memberId:'B'})
  expect((await s.call('peerRequest',null,{id:request.id})).status).toBe(404)
  await s.invite(s.lab.id)
  expect((await s.call('peerRequest',null,{id:request.id})).status).toBe(404)
  expect((await s.call('createPeerRequest',body,{},'A',key)).status).toBe(404)
 })
 it('fences stale versions, old signal attempts and expired device leases',async()=>{
  const s=await pair(),request=await s.ok('createPeerRequest',{deviceId:'device_A',providerId:'B',query:'record'})
  const found=await s.ok('updatePeerRequest',{deviceId:'device_B',expectedVersion:1,action:'match',files:[file]},{id:request.id},'B')
  expect((await s.call('updatePeerRequest',{deviceId:'device_A',expectedVersion:1,action:'select',fileId:file.id},{id:request.id})).status).toBe(409)
  const selected=await s.ok('updatePeerRequest',{deviceId:'device_A',expectedVersion:found.version,action:'select',fileId:file.id},{id:request.id})
  await s.ok('updatePeerRequest',{deviceId:'device_A',expectedVersion:selected.version,action:'retry'},{id:request.id})
  expect((await s.call('sendPeerSignal',{deviceId:'device_A',attemptId:selected.attemptId,kind:'offer',sdp:'old'},{id:request.id})).status).toBe(409)
  s.db.prepare('UPDATE peer_library_devices SET expires_at=?').run('2000-01-01T00:00:00Z')
  expect((await get(s,'peerRequests','A',{}, {deviceId:'device_A'})).status).toBe(409)
 })
 it('records a direct personal-assistant file request without calling a model or fabricating receipt',async()=>{
  const s=await pair(),personal=await s.ok('personalConversation',{})
  const response=await s.ok('agentChatMessage',{text:'帮我找Synthetic B的record',peerFileRequest:{deviceId:'device_A',providerId:'B',query:'record'}},{id:personal.conversation.id})
  expect(response.turn.status).toBe('succeeded');expect(s.db.prepare('SELECT status FROM peer_library_requests').get()!.status).toBe('requested')
  const output=JSON.parse(String(s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(response.turn.outputMessageId)!.document));expect(output.text).toContain('等待对方设备上线或本人同意')
  expect(s.db.prepare('SELECT count(*) n FROM peer_library_signals').get()!.n).toBe(0)
 })
})
