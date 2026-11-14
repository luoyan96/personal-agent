import {randomBytes,randomUUID,createHash} from 'node:crypto'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,it,expect} from 'vitest'
import {routes,type RouteName,AgentTurn} from '@research-agent-platform/contracts'
import {readConfig} from '../src/config.js'
import {migrate,openDatabase} from '../src/database.js'
import {createServer} from '../src/server.js'
import {ChatWorker} from '../src/chat-worker.js'
import {OpenImBridge} from '../src/openim-bridge.js'
import {OpenImCallbacks} from '../src/openim-callback.js'
import {serviceFor,type ModelCall,type ModelResult} from '../src/execution-worker.js'
import {ChatService} from '../src/chat.js'
const clean:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const f of clean.splice(0).reverse())await f()})
const model=(text:string,overrides:Partial<ModelResult>={}):ModelResult=>({text,inputTokens:80,outputTokens:90,elapsedMs:10,failure:null,...overrides})
const profile={displayName:'文稿助手',introduction:'讨论提供的文字',capabilityDescription:'分析结构与改写',personality:'简洁'}
async function setup(){
 const root=process.env.WORKSPACE_EVIDENCE_ROOT??tmpdir();mkdirSync(root,{recursive:true});const dir=mkdtempSync(join(root,'workspace-'));clean.push(()=>rmSync(dir,{recursive:true,force:true}))
 const key=join(dir,'key');writeFileSync(key,randomBytes(32).toString('hex'),{mode:0o600});const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4493',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:key});mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);clean.push(()=>db.close());migrate(db)
 let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});clean.push(()=>app.close());const people:{id:string;cookie:string;csrf:string;username:string}[]=[]
 const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,query='',key=randomUUID())=>{const route=routes[name],res=await fetch(url+route.path.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!)+query,{method:route.method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':key,...(people[actor]?{cookie:people[actor].cookie,'x-csrf-token':people[actor].csrf}:{})},...(route.method==='GET'?{}:{body:JSON.stringify(body)})}),text=await res.text();return {status:res.status,text,value:JSON.parse(text),cookie:res.headers.get('set-cookie')?.split(';')[0]??''}}
 const ok=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,query='',key=randomUUID())=>{const res=await call(name,body,params,actor,query,key);expect(res.status,res.text).toBeLessThan(300);return res.value.data}
 for(const actor of [0,1,2]){const username=`workspace_${actor}_${randomUUID().slice(0,8)}`,password='12345678';await ok('register',{username,password,displayName:`真实HTTP测试者${actor}`},{},actor);const login=await call('login',{username,password},{},actor);people[actor]={id:login.value.data.id,cookie:login.cookie,csrf:'',username};people[actor]!.csrf=(await ok('session',null,{},actor)).csrfToken;await ok('createPersonalModel',{name:'合成模型',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:`synthetic-person-${actor}`},{},actor)}
 const own=async(actor=0)=>ok('personalConversation',{}, {},actor)
 const accept=async(contactId:string,requester=0,decider=1)=>{const c=await ok('requestContact',{}, {id:contactId},requester);return ok('decideContactRequest',{expectedVersion:c.relationship.version,decision:'accept'},{id:c.relationship.requestId},decider)}
 const human=async(actor:number)=>(await ok('chatContacts',null,{},0,`?scope=global&search=${people[actor]!.username}`)).find((c:{identity:{kind:string}})=>c.identity.kind==='human')
 const tick=(call:ModelCall)=>new ChatWorker(db,config,call).tick()
 return {db,config,people,call,ok,own,accept,human,tick,restart:async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})},chat:(actor=0)=>new ChatService(serviceFor(db,people[actor]!.id,config).c,config)}
}
describe('social workspace actual HTTP/SQLite; model and IM transport deliberately synthetic',{timeout:45000},()=>{
 it('lets a joined cross-space colleague invite their own assistant and contacts without granting task or lab access',async()=>{
  const s=await setup(),colleague=await s.human(1),third=await s.human(2)
  await s.accept(colleague.id);await s.accept(third.id,1,2)
  const assistant=await s.ok('createPersonalAgent',profile,{},1)
  let group=await s.ok('imCreateGroup',{title:'成员可以拉人和自己的助手',contactIds:[colleague.id],plan:null,sharedContext:{selectedText:null,artifactRefs:[]}})
  expect((await s.ok('chatConversation',null,{id:group.id},1)).allowedActions).toContain('invite')
  expect((await s.call('chatConversation',null,{id:group.id},2)).status).toBe(404)
  expect((await s.call('imInviteContact',{contactId:assistant.id,expectedConversationVersion:group.version},{id:group.id},1)).value.error.code).toBe('GROUP_AGENT_NOT_ALLOWED')
  expect(group.members.some((m:{contactId:string})=>m.contactId===assistant.id)).toBe(false)
  const command={contactId:third.id,expectedConversationVersion:group.version},key=randomUUID()
  group=await s.ok('imInviteContact',command,{id:group.id},1,'',key)
  expect((await s.ok('imInviteContact',command,{id:group.id},1,'',key)).version).toBe(group.version)
  expect((await s.ok('chatConversation',null,{id:group.id},2)).allowedActions).toEqual(['send','invite'])
  expect(group.members.filter((m:{status:string})=>m.status==='joined')).toHaveLength(4)
  expect(s.db.prepare('SELECT count(*) n FROM chat_invitations WHERE conversation_id=?').get(group.id)!.n).toBe(0)
  expect(s.db.prepare('SELECT count(*) n FROM personal_work_tasks').get()!.n).toBe(0)
  expect(s.db.prepare('SELECT lab_id FROM members WHERE id=?').get(s.people[2]!.id)!.lab_id).not.toBe(s.db.prepare('SELECT lab_id FROM members WHERE id=?').get(s.people[0]!.id)!.lab_id)
  // Friendship is still checked live: the whole route through this colleague
  // disappears after the owner withdraws it, including old idempotent receipts.
  const relationship=(await s.ok('chatContact',null,{id:colleague.id})).relationship
  await s.ok('revokeContact',{expectedVersion:relationship.version},{id:colleague.id})
  expect((await s.call('chatConversation',null,{id:group.id},1)).status).toBe(200)
  expect((await s.call('chatConversation',null,{id:group.id},2)).status).toBe(200)
  expect((await s.call('imInviteContact',command,{id:group.id},1,'',key)).status).toBe(200)
 })
 it('requires explicit publication and real cross-space friendship; withdrawal invalidates cached discovery',async()=>{
  const s=await setup(),other=await s.own(1),agent=await s.ok('createPersonalAgent',profile,{},1)
  await s.ok('createPersonalMemory',{topic:'私有偏好',content:'PRIVATE_MEMORY_NEVER_PUBLIC',scope:'general'},{},1)
  expect(await s.ok('capabilityPublications')).toEqual([])
  const a=await s.ok('publishCapability',{contactId:agent.id,expectedVersion:0,tags:['写作']},{},1),h=await s.human(1)
  const b=await s.ok('publishCapability',{contactId:h.id,expectedVersion:0,tags:['协作']},{},1)
  const page=await s.call('capabilityPublications',null,{},0,'?limit=1'),cursor=page.value.nextCursor;expect(cursor).toBeTruthy();expect(page.text).not.toContain('PRIVATE_MEMORY_NEVER_PUBLIC');expect(page.text).not.toContain('synthetic-person-1');expect(page.text).not.toContain('encrypted_api_key')
  expect((await s.call('createDirectConversation',{contactId:agent.id})).status).toBe(403);await s.accept(agent.id);const direct=await s.ok('createDirectConversation',{contactId:agent.id});expect(direct.members.some((m:{contactId:string})=>m.contactId===agent.id)).toBe(true)
  const last=page.value.data[0].id===a.id?b:a;await s.ok('withdrawCapability',{expectedVersion:last.version},{id:last.id},1)
  expect((await s.ok('capabilityPublications',null,{},0,`?limit=1&cursor=${encodeURIComponent(cursor)}`))).toEqual([]);expect((await s.call('capabilityPublication',null,{id:last.id})).status).toBe(404);expect((await s.call('withdrawCapability',{expectedVersion:a.version},{id:a.id},2)).status).toBe(404)
  expect(other.agent.id).not.toBe(agent.id)
 })
 it('creates cross-space social groups with direct group membership, task acceptance, real output and exact review',async()=>{
  const s=await setup(),foreign=await s.human(1),agent=await s.ok('createPersonalAgent',profile),key=randomUUID()
  expect((await s.call('createPersonalWorkTask',{title:'真实协作',goal:'共享当前目标',contactIds:[foreign.id,agent.id]})).status).toBe(403);await s.accept(foreign.id)
  const task=await s.ok('createPersonalWorkTask',{title:'真实协作',goal:'分析共享的合成段落',contactIds:[foreign.id,agent.id],agentContactId:agent.id},{},0,'',key)
  expect((await s.ok('createPersonalWorkTask',{title:'真实协作',goal:'分析共享的合成段落',contactIds:[foreign.id,agent.id],agentContactId:agent.id},{},0,'',key)).id).toBe(task.id)
  const activation=randomUUID(),active=await s.ok('activatePersonalWorkTask',{expectedVersion:task.version},{id:task.id},0,'',activation);expect((await s.ok('activatePersonalWorkTask',{expectedVersion:task.version},{id:task.id},0,'',activation)).conversationId).toBe(active.conversationId)
  expect(active.participants.find((p:{contactId:string})=>p.contactId===agent.id).status).toBe('accepted')
  expect((await s.ok('chatConversation',null,{id:active.conversationId})).members.some((m:{contactId:string})=>m.contactId===agent.id)).toBe(false)
  expect((await s.ok('chatInvitations')).some((i:{conversationId:string;invitedContactId:string})=>i.conversationId===active.conversationId&&i.invitedContactId===agent.id)).toBe(false)
  expect((await s.call('chatConversation',null,{id:active.conversationId},1)).status).toBe(200)
  expect(await s.ok('personalWorkTask',null,{id:task.id},1)).toMatchObject({summaryOnly:true,goal:null,result:null,conversationId:null})
  // Group membership is direct; only task commitment needs the participant's decision.
  expect((await s.ok('chatInvitations',null,{},1)).filter((i:{conversationId:string})=>i.conversationId===active.conversationId)).toEqual([])
  expect((await s.call('runPersonalWorkTask',{expectedVersion:active.version,agentContactId:agent.id},{id:task.id},1)).status).toBe(403)
  let current=await s.ok('decidePersonalWorkTask',{expectedVersion:active.version,decision:'accept'},{id:task.id},1);expect(current.summaryOnly).toBe(false)
  await s.ok('createPersonalMemory',{topic:'私有',content:'OWNER_PRIVATE_NOT_GROUP',scope:'general'});current=await s.ok('personalWorkTask',null,{id:task.id})
  expect((await s.call('runPersonalWorkTask',{expectedVersion:current.version,agentContactId:agent.id},{id:task.id},1)).value.error.code).toBe('GROUP_AGENT_NOT_ALLOWED')
  await s.ok('submitPersonalWorkResult',{expectedVersion:current.version,text:'实际合成用户提交的分析结果'},{id:task.id},1)
  const output=await s.ok('personalWorkTask',null,{id:task.id});expect(output).toMatchObject({status:'awaiting_review',result:{accepted:false}})
  expect((await s.call('reviewPersonalWorkResult',{expectedVersion:output.version,messageId:output.result.messageId,decision:'accept'},{id:task.id},1)).status).toBe(403)
  expect((await s.call('reviewPersonalWorkResult',{expectedVersion:output.version,messageId:'wrong_result',decision:'accept'},{id:task.id})).status).toBe(409)
  const complete=await s.ok('reviewPersonalWorkResult',{expectedVersion:output.version,messageId:output.result.messageId,decision:'accept'},{id:task.id});expect(complete).toMatchObject({status:'completed',result:{accepted:true}})
  await s.restart();expect(await s.ok('personalWorkTask',null,{id:task.id},1)).toMatchObject({status:'completed',result:{accepted:true}});expect((await s.ok('workbench',null,{},1,'?category=completed')).some((c:{taskId:string})=>c.taskId===task.id)).toBe(true)
  const bridge=new OpenImBridge(s.db,s.config),mapping=bridge.mapping(s.chat(1),complete.conversationId);expect(mapping.kind).toBe('group');expect(mapping.transportStatus).toBe('unavailable');const callback=new OpenImCallbacks(bridge);expect(callback.group(mapping.groupID).members).toHaveLength(3)
  const relationship=(await s.ok('chatContact',null,{id:foreign.id})).relationship;await s.ok('revokeContact',{expectedVersion:relationship.version},{id:foreign.id})
  expect((await s.call('chatConversation',null,{id:complete.conversationId},1)).status).toBe(200);expect((await s.call('personalWorkTask',null,{id:task.id},1)).status).toBe(404);expect(callback.group(mapping.groupID).members).toHaveLength(3)
 })
 it('keeps social mentions explicit without personal memory or task creation',async()=>{
  const s=await setup(),foreign=await s.human(1);await s.accept(foreign.id);await s.ok('createPersonalMemory',{topic:'私有',content:'OWNER_PRIVATE_NOT_GROUP',scope:'general'});
  const group=await s.ok('imCreateGroup',{title:'纯社交群',contactIds:[foreign.id],plan:null,sharedContext:{selectedText:null,artifactRefs:[]}}),agentId=`group_assistant_${group.id}`;
  const ordinary=await s.ok('sendChatMessage',{text:'@群助理 你好',mentions:[{contactId:agentId,start:0,end:4}]},{id:group.id});expect(ordinary.turn).toBeNull();expect(await s.tick(async()=>model('不应调用'))).toBe(false);
  const sent=await s.ok('sendChatMessage',{text:'@群助理 请分析这句文字',intent:'ask_agent',agentContactId:agentId,mentions:[{contactId:agentId,start:0,end:4}],budget:{maxTokens:8000,maxSeconds:90}},{id:group.id});
  await s.tick(async input=>{expect(input.prompt).not.toContain('OWNER_PRIVATE_NOT_GROUP');return model(JSON.stringify({answer:'合成讨论回复',requests:[]}))});expect((await s.ok('chatTurn',null,{id:sent.turn.id})).status).toBe('succeeded');
  expect(s.db.prepare('SELECT count(*) n FROM personal_work_tasks').get()!.n).toBe(0);
 })
 it('owner confirmation immediately enables the selected owned Agent; group membership is direct while task commitment stays separate',async()=>{
  const s=await setup(),owned=await s.ok('createPersonalAgent',profile),human=await s.human(1),foreign=await s.ok('createPersonalAgent',{...profile,displayName:'好友的专家'},{},1)
  await s.accept(human.id);await s.accept(foreign.id)
  const task=await s.ok('createPersonalWorkTask',{title:'确认即可开始',goal:'分析当前合成文字',contactIds:[owned.id,human.id,foreign.id],agentContactId:owned.id}),active=await s.ok('activatePersonalWorkTask',{expectedVersion:task.version},{id:task.id})
  const group=await s.ok('chatConversation',null,{id:active.conversationId})
  // Everyone selected is a joined member immediately: no invitation round.
  expect(group.members.find((m:{contactId:string})=>m.contactId===human.id).status).toBe('joined');for(const contactId of [owned.id,foreign.id])expect(group.members.some((m:{contactId:string})=>m.contactId===contactId)).toBe(false)
  expect(s.db.prepare('SELECT status FROM personal_work_participants WHERE task_id=? AND contact_id=?').get(task.id,owned.id)!.status).toBe('accepted')
  // Direct membership creates no invitation and does not accept the task.
  for(const contactId of [human.id,foreign.id])expect(s.db.prepare('SELECT status FROM personal_work_participants WHERE task_id=? AND contact_id=?').get(task.id,contactId)!.status).toBe('invited')
  expect((await s.ok('chatInvitations')).filter((i:{conversationId:string})=>i.conversationId===group.id)).toEqual([])
  expect((await s.ok('chatInvitations',null,{},1)).filter((i:{conversationId:string})=>i.conversationId===group.id)).toEqual([])
  expect((await s.call('chatConversation',null,{id:group.id},1)).status).toBe(200)
  expect((await s.call('runPersonalWorkTask',{expectedVersion:active.version,agentContactId:owned.id},{id:task.id})).value.error.code).toBe('GROUP_AGENT_NOT_ALLOWED')
  expect((await s.call('imCreateGroup',{title:'禁止助手入群',contactIds:[owned.id],plan:null,sharedContext:{selectedText:null,artifactRefs:[]}})).value.error.code).toBe('GROUP_AGENT_NOT_ALLOWED')
 })
 it('assistant creates a real collaboration proposal and delegation work item, with no fake automatic membership/completion',async()=>{
  const s=await setup(),own=await s.own(),foreign=await s.human(1);await s.accept(foreign.id);const agent=await s.ok('createPersonalAgent',profile)
  const sent=await s.ok('agentChatMessage',{text:`请安排和好友 ${foreign.displayName} 一起修改论文`},{id:own.conversation.id});await s.tick(async input=>{expect(input.prompt).toContain(foreign.id);return model(JSON.stringify({kind:'team',title:'论文协作',contactIds:[foreign.id,agent.id]}))})
  const final=await s.ok('chatTurn',null,{id:sent.turn.id});expect(final.assistantReceipt).toMatchObject({kind:'work_task',status:'proposed',conversationId:null});expect(Number(s.db.prepare('SELECT count(*) n FROM social_groups').get()!.n)).toBe(0)
  const stored=JSON.parse(String(s.db.prepare('SELECT document FROM chat_turns WHERE id=?').get(sent.turn.id)!.document));expect(stored).not.toHaveProperty('assistantReceipt');expect(AgentTurn.omit({assistantReceipt:true}).safeParse(stored).success).toBe(true)
  const solo=await s.ok('agentChatMessage',{text:'帮我修改论文摘要'},{id:own.conversation.id});await s.tick(async()=>model(JSON.stringify({kind:'delegate',contactId:agent.id,profile:null})));const receipt=(await s.ok('chatTurn',null,{id:solo.turn.id})).assistantReceipt
  const cards=await s.ok('workbench');const work=cards.find((v:{source:string;conversationId:string})=>v.source==='personal_task'&&v.conversationId===receipt.conversationId);expect(work.status).toBe('running')
  await s.tick(async()=>model('真实合成修改结果'));const w=await s.ok('personalWorkTask',null,{id:work.taskId});expect(w.status).toBe('awaiting_review');expect(w.result.accepted).toBe(false)
  const directAnswer=await s.ok('agentChatMessage',{text:'请分析这两行合成文字'},{id:own.conversation.id});await s.tick(async()=>model(JSON.stringify({kind:'reply',answer:'本条真实合成分析结果'})));const answered=await s.ok('chatTurn',null,{id:directAnswer.turn.id});expect(answered.assistantReceipt.kind).toBe('work_task');expect(await s.ok('personalWorkTask',null,{id:answered.assistantReceipt.taskId})).toMatchObject({status:'awaiting_review',result:{summary:'本条真实合成分析结果',accepted:false}})
 })
 it('cancels late task output atomically and preserves actual usage; foreign participants cannot cancel or add arbitrary peers',async()=>{
  const s=await setup(),agent=await s.ok('createPersonalAgent',profile),task=await s.ok('createPersonalWorkTask',{title:'迟到输出',goal:'当前要求',contactIds:[agent.id]}),active=await s.ok('activatePersonalWorkTask',{expectedVersion:task.version},{id:task.id});const current=await s.ok('personalWorkTask',null,{id:task.id}),run=await s.ok('runPersonalWorkTask',{expectedVersion:current.version,agentContactId:agent.id},{id:task.id})
  let release!:(r:ModelResult)=>void,entered!:()=>void;const enteredPromise=new Promise<void>(r=>{entered=r}),pending=s.tick(async()=>{entered();return new Promise<ModelResult>(r=>{release=r})});await enteredPromise
  expect((await s.call('cancelPersonalWorkTask',{expectedVersion:run.version},{id:task.id},1)).status).toBe(404);await s.ok('cancelPersonalWorkTask',{expectedVersion:run.version},{id:task.id});release(model('过时结果不得保存'));await pending
  const turn=await s.ok('chatTurn',null,{id:run.turnId});expect(turn).toMatchObject({status:'cancelled',outputMessageId:null,usage:{inputTokens:80,outputTokens:90}});expect((await s.ok('personalWorkTask',null,{id:task.id})).result).toBeNull();expect(Number(s.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.origin')='model'").get()!.n)).toBe(0)
  expect(active.conversationId).toBeTruthy()
 })
 it('020 adds only new tables/indexes and preserves all019 rows/checksums on repeated migration',async()=>{
  const s=await setup();await s.own();s.db.exec('DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE IF EXISTS team_library_repositories; DELETE FROM schema_migrations WHERE version=33; DROP TABLE IF EXISTS library_index_entries; DELETE FROM schema_migrations WHERE version=32; DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30; DROP TABLE work_context_revisions; DROP TABLE work_context_records; DELETE FROM schema_migrations WHERE version=29; DROP TABLE chat_message_retractions; DROP TABLE chat_message_relations; DELETE FROM schema_migrations WHERE version=28; DROP TABLE deleted_personal_agents; DROP TABLE peer_library_signals; DROP TABLE peer_library_requests; DROP TABLE peer_library_devices; DROP TABLE chat_turn_lab_contexts; DROP TABLE research_collection_labs; DROP TABLE lab_member_invitations; DROP TABLE member_lab_contexts; DROP VIEW effective_lab_memberships; DROP TABLE lab_memberships; DROP TABLE feishu_library_sources; DROP TABLE feishu_previews; DROP TABLE feishu_connections; DROP TABLE feishu_oauth_states; DROP TABLE research_agent_bindings; DROP TABLE research_file_pages; DROP TABLE research_file_versions; DROP TABLE research_files; DROP TABLE research_collections; DROP TABLE installed_skill_uses; DROP TABLE installed_skill_versions; DROP TABLE installed_skills; DROP TABLE social_groups; DROP TABLE personal_work_participants; DROP TABLE personal_work_tasks; DROP TABLE capability_publications; DELETE FROM schema_migrations WHERE version>=20')
  const tables=s.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>String(r.name)),hashes=()=>Object.fromEntries(tables.map(t=>[t,createHash('sha256').update(JSON.stringify(s.db.prepare(`SELECT * FROM ${t} ${t==='schema_migrations'?'WHERE version<=19':''} ORDER BY rowid`).all())).digest('hex')]))
  const before=hashes();migrate(s.db);migrate(s.db);expect(hashes()).toEqual(before);expect(s.db.prepare('SELECT max(version) v FROM schema_migrations').get()!.v).toBe(39);expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
 })
})
