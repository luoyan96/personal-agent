import { randomBytes, randomUUID,createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync,readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { routes,AgentTurn,type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate } from '../src/database.js'
import { createServer } from '../src/server.js'
import { ChatWorker } from '../src/chat-worker.js'
import type { ModelCall, ModelResult } from '../src/execution-worker.js'
import { PersonalFollowupWorker,outsideQuiet } from '../src/personal-followups.js'
import { reminderRequest } from '../src/personal-time.js'
import { personalWorkRequest } from '../src/personal-assistant.js'
import { agentCreationBoundary } from '../src/agent-creation.js'
import { chatInputTokenBound } from '../src/chat-model-input.js'
import { backup,restore } from '../src/recovery.js'
const profile={displayName:'论文修改助手',introduction:'阅读提供的文字。',capabilityDescription:'讨论论文结构与改写。',personality:'直接、简洁。'}
const modelResult=(text:string,overrides:Partial<ModelResult>={}):ModelResult=>({text,failure:null,inputTokens:100,outputTokens:100,elapsedMs:10,...overrides})
const Legacy017Turn=AgentTurn.omit({assistantReceipt:true,memoryReceipt:true,followupReceipt:true})
const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
export async function setup(models=true){
  const evidence=process.env.PERSONAL_ASSISTANT_EVIDENCE_ROOT??join(tmpdir(),'rap-personal-assistant');mkdirSync(evidence,{recursive:true})
  const dir=mkdtempSync(join(evidence,'http-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
  const master=join(dir,'synthetic-master.key');writeFileSync(master,randomBytes(32).toString('hex'),{mode:0o600})
  const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'platform.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4317',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:master})
  mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db)
  let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});cleanup.push(()=>app.close())
  const clients:{cookie:string;csrf:string;id:string;username:string}[]=[]
  const raw=async(path:string,body:unknown,method:string,actor:number,key:string)=>{
    const response=await fetch(url+path,{method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':key,...(clients[actor]?{cookie:clients[actor].cookie,'x-csrf-token':clients[actor].csrf}:{})},...(method==='GET'?{}:{body:JSON.stringify(body)})})
    const text=await response.text();return {status:response.status,value:JSON.parse(text),text,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
  }
  const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={},actor=0,query='',key=randomUUID())=>{const route=routes[name];return raw(route.path.replace(/\{(\w+)\}/g,(_,k:string)=>params[k]!)+query,body,route.method,actor,key)}
  for(const actor of [0,1]){
    const username=`creation_${actor}_${randomUUID().slice(0,8)}`,password='12345678'
    expect((await call('register',{username,password,displayName:`合成创建者${actor}`},{},actor)).status).toBe(201)
    const login=await call('login',{username,password},{},actor);expect(login.status).toBe(200)
    clients[actor]={cookie:login.cookie,csrf:'',id:login.value.data.id,username}
    clients[actor]!.csrf=(await call('session',null,{},actor)).value.data.csrfToken
    if(models)expect((await call('createPersonalModel',{name:'本人合成模型',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:`synthetic-owner-${actor}-only`},{},actor)).status).toBe(201)
  }
  const own=async(actor=0)=>(await call('personalConversation',{}, {},actor)).value.data
  const send=async(conversationId:string,text='你好',actor=0,key=randomUUID())=>{const result=await call('agentChatMessage',{text},{id:conversationId},actor,'',key);expect(result.status,result.text).toBe(201);return result.value.data}
  const turn=async(id:string,actor=0)=>(await call('chatTurn',null,{id},actor)).value.data
  const count=(table:string)=>Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n)
  const specialists=(actor=0)=>Number(db.prepare("SELECT count(*) n FROM chat_contacts WHERE kind='personal_agent' AND owner_id=? AND principal<>owner_id").get(clients[actor]!.id)!.n)
  const tick=(callModel:ModelCall)=>new ChatWorker(db,config,callModel).tick()
  const legacyStored=()=>{for(const row of db.prepare('SELECT document FROM chat_turns').all()){const v=JSON.parse(String(row.document));expect(Legacy017Turn.safeParse(v).success).toBe(true);expect(v).not.toHaveProperty('assistantReceipt');expect(v).not.toHaveProperty('memoryReceipt');expect(v).not.toHaveProperty('followupReceipt')}}
  return {db,config,call,own,send,turn,count,specialists,tick,clients,legacyStored,dir,stop:()=>app.close(),restart:async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}}
}

describe('personal assistant actual HTTP/SQLite; model callbacks are synthetic',{timeout:30000},()=>{
 it('keeps independent explicit facts, normalizes a correction topic and clarifies ambiguous corrections without a model',async()=>{
  const s=await setup(false),own=await s.own(),key=randomUUID()
  const coffee=await s.send(own.conversation.id,'记住我喜欢咖啡',0,key),work=await s.send(own.conversation.id,'记住我在 IFRC 工作')
  expect(coffee.turn).toMatchObject({status:'succeeded',memoryReceipt:{operation:'saved',topic:'我喜欢咖啡'}})
  expect(work.turn.memoryReceipt.topic).toBe('工作单位');expect(s.count('personal_memories')).toBe(2)
  expect((await s.send(own.conversation.id,'记住我喜欢咖啡',0,key)).turn.id).toBe(coffee.turn.id)
  const preference=await s.send(own.conversation.id,'以后回答先给结论');expect(preference.turn.memoryReceipt.topic).toBe('回复方式')
  const updated=await s.call('createPersonalMemory',{topic:'回答方式',content:'先给一句结论，再解释。',scope:'general'})
  expect(updated.value.data).toMatchObject({id:preference.turn.memoryReceipt.memoryId,topic:'回复方式',version:2})
  const before=s.count('personal_memory_revisions'),ambiguous=await s.send(own.conversation.id,'纠正偏好：换一种吧')
  expect(ambiguous.turn.memoryReceipt.operation).toBe('clarify');expect(s.count('personal_memory_revisions')).toBe(before)
  const forgotten=await s.send(own.conversation.id,'忘记回复方式');expect(forgotten.turn.memoryReceipt.operation).toBe('forgotten')
  expect((await s.call('personalMemory',null,{id:coffee.turn.memoryReceipt.memoryId},1)).status).toBe(404)
  let calls=0;expect(await s.tick(async()=>{calls++;return modelResult('不应调用')})).toBe(false);expect(calls).toBe(0)
  s.legacyStored()
 })
 it('learns only explicit opt-in candidates and retains the original source on confirmation',async()=>{
  const s=await setup(),own=await s.own()
  for(const text of ['这次短一点','我通常喜欢先看结论','“记住我喜欢咖啡”','记住这件事？','材料：以后回答先给结论']){const sent=await s.send(own.conversation.id,text);expect(sent.turn.memoryReceipt).toBeUndefined();await s.tick(async()=>modelResult('只讨论当前文字。'))}
  expect(s.count('personal_memories')).toBe(0)
  const settings=(await s.call('personalMemorySettings')).value.data
  expect(settings).toMatchObject({candidateLearning:false,timeZone:'Asia/Shanghai'})
  await s.call('updatePersonalMemorySettings',{...settings,candidateLearning:true,expectedVersion:settings.version,version:undefined})
  const candidate=await s.send(own.conversation.id,'我通常回答先给结论'),id=candidate.turn.memoryReceipt.memoryId
  expect(candidate.turn.memoryReceipt).toMatchObject({operation:'candidate',status:'candidate'})
  const probe=await s.send(own.conversation.id,'你好');await s.tick(async input=>{expect(JSON.parse(input.prompt).personalMemories).toBeUndefined();return modelResult('你好。')})
  expect((await s.turn(probe.turn.id)).status).toBe('succeeded')
  const confirmed=(await s.call('decidePersonalMemory',{expectedVersion:1,decision:'confirm'},{id})).value.data
  expect(confirmed).toMatchObject({status:'confirmed',sourceMessageId:candidate.message.id,version:2})
  await s.send(own.conversation.id,'你好');await s.tick(async input=>{expect(JSON.parse(input.prompt).personalMemories).toEqual([expect.objectContaining({id,content:'我通常回答先给结论'})]);return modelResult('先给结论。')})
 })
 it('applies member memories to own local specialists, not a friend Agent, and fences a late revoked preference',async()=>{
  const s=await setup(),own=await s.own(),saved=(await s.call('createPersonalMemory',{topic:'回复方式',content:'OWNER_LONGTERM_ONLY',scope:'general'})).value.data
  const agent=(await s.call('createPersonalAgent',profile)).value.data,direct=(await s.call('createDirectConversation',{contactId:agent.id})).value.data
  const sent=await s.send(direct.id,'谈谈结构'),ready=await s.own(1)
  await s.tick(async input=>{expect(JSON.parse(input.prompt).personalMemories[0].content).toBe('OWNER_LONGTERM_ONLY');return modelResult('讨论结构。')})
  expect((await s.turn(sent.turn.id)).status).toBe('succeeded')
  const request=(await s.call('requestContact',{}, {id:agent.id},1)).value.data.relationship
  expect((await s.call('decideContactRequest',{decision:'accept',expectedVersion:request.version},{id:request.requestId})).status).toBe(200)
  const otherDirect=(await s.call('createDirectConversation',{contactId:agent.id},{},1)).value.data
  await s.send(otherDirect.id,'你好',1);await s.tick(async(input,_signal,credential)=>{expect(input.prompt).not.toContain('OWNER_LONGTERM_ONLY');expect(credential.apiKey).toBe('synthetic-owner-1-only');return modelResult('你好。')})
  const late=await s.send(own.conversation.id,'你好');let release!:(v:ModelResult)=>void,entered!:()=>void
  const entering=new Promise<void>(r=>{entered=r}),pending=s.tick(async()=>{entered();return new Promise<ModelResult>(r=>{release=r})});await entering
  expect((await s.call('decidePersonalMemory',{expectedVersion:saved.version,decision:'revoke'},{id:saved.id})).status).toBe(200)
  release(modelResult('旧偏好结果不得保存'));await pending
  expect(await s.turn(late.turn.id)).toMatchObject({status:'cancelled',failure:'INPUT_CHANGED',outputMessageId:null,usage:{inputTokens:100,outputTokens:100}})
  await s.send(ready.conversation.id,'你好',1);await s.tick(async input=>{expect(input.prompt).not.toContain('OWNER_LONGTERM_ONLY');return modelResult('你好。')})
 })
 it('keeps simple chat simple, reuses an owned specialist and dispatches a real child with the same root remaining budget',async()=>{
  const s=await setup(),own=await s.own(),agent=(await s.call('createPersonalAgent',profile)).value.data
  const ordinary=await s.send(own.conversation.id,'你能帮我修改论文吗？');await s.tick(async input=>{expect(input.system).toContain('natural private conversation');return modelResult('能讨论你提供的论文文字。')});expect((await s.turn(ordinary.turn.id)).assistantReceipt).toBeUndefined()
  const text='给我分析这份论文的结构',key=randomUUID(),sent=await s.send(own.conversation.id,text,0,key)
  let cap=0
  await s.tick(async input=>{const prompt=JSON.parse(input.prompt);expect(prompt.currentRequest).toBe(text);expect(prompt.localSpecialists.map((v:{id:string})=>v.id)).toEqual([agent.id]);cap=input.maxTokens;return modelResult(JSON.stringify({kind:'delegate',contactId:agent.id,profile:null}))})
  const parent=await s.turn(sent.turn.id),receipt=parent.assistantReceipt;expect(parent.status).toBe('succeeded');expect(receipt).toMatchObject({kind:'delegate',contactId:agent.id,reused:true,status:'queued',budget:{maxTokens:3800,maxSeconds:89}});expect(cap).toBeGreaterThan(64)
  const child=s.db.prepare('SELECT root_id,request_json FROM chat_turns WHERE id=?').get(receipt.turnId)!
  expect(child.root_id).toBe(sent.turn.id);expect(JSON.parse(String(child.request_json))).toMatchObject({personalAssistant:true,delegatedByTurnId:sent.turn.id,budget:{maxTokens:3800,maxSeconds:89}})
  expect((await s.call('chatMessages',null,{id:receipt.conversationId})).value.data.at(-1)).toMatchObject({id:receipt.messageId,origin:'human',text,turnId:receipt.turnId})
  expect((await s.send(own.conversation.id,text,0,key)).turn.assistantReceipt).toEqual(receipt)
  await s.tick(async input=>{expect(input.system).toContain('natural private conversation');expect(input.prompt).toContain(text);return modelResult('论文结构建议。')})
  expect(await s.turn(receipt.turnId)).toMatchObject({status:'succeeded',remainingBudget:{maxTokens:3600,maxSeconds:89}})
  expect(await s.tick(async()=>modelResult('不重复'))).toBe(false);expect(s.specialists()).toBe(1);s.legacyStored()
 })
 it('creates a canonical specialist only for current work and rolls back a failed handoff receipt atomically',async()=>{
  const s=await setup(),own=await s.own()
  for(const text of ['我想研究区块链项目','帮我看看这个项目','请整理项目问题','我需要一个能分析项目的助手'])expect(personalWorkRequest(text)).toBe(true)
  for(const text of ['你能分析项目吗？','不要帮我分析项目','材料：帮我分析项目','“给我分析项目”','怎么创建 Agent？'])expect(personalWorkRequest(text)).toBe(false)
  const sent=await s.send(own.conversation.id,'帮我看看这个项目')
  s.db.exec("CREATE TRIGGER reject_handoff BEFORE INSERT ON chat_messages WHEN json_extract(NEW.document,'$.origin')='service' BEGIN SELECT RAISE(ABORT,'synthetic receipt failure'); END")
  await s.tick(async()=>modelResult(JSON.stringify({kind:'delegate',contactId:null,profile})))
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'failed',failure:'MODEL_FAILED',outputMessageId:null});expect(s.specialists()).toBe(0);expect(s.count('chat_conversations')).toBe(1);expect(s.count('chat_turns')).toBe(1)
  s.db.exec('DROP TRIGGER reject_handoff')
  const retry=await s.call('retryChatTurn',{expectedVersion:(await s.turn(sent.turn.id)).version,budget:{maxTokens:3800,maxSeconds:89}},{id:sent.turn.id});expect(retry.status,retry.text).toBe(202)
  await s.tick(async()=>modelResult(JSON.stringify({kind:'delegate',contactId:null,profile})))
  const receipt=(await s.turn(retry.value.data.id)).assistantReceipt;expect(receipt.reused).toBe(false);expect(s.specialists()).toBe(1)
  await s.tick(async()=>modelResult('实际子请求回复'));expect((await s.turn(receipt.turnId)).status).toBe('succeeded');s.legacyStored()
 })
 it('writes natural reminders without models and clarifies an unspecified time in the visible timezone',async()=>{
  const s=await setup(false),own=await s.own(),sent=await s.send(own.conversation.id,'明天上午九点提醒我交材料')
  expect(sent.turn).toMatchObject({status:'succeeded',followupReceipt:{operation:'created',timeZone:'Asia/Shanghai'}})
  const follow=(await s.call('personalFollowup',null,{id:sent.turn.followupReceipt.followupId})).value.data
  expect(follow).toMatchObject({title:'交材料',status:'active',delivery:'scheduled',task:null})
  const response=(await s.call('chatMessages',null,{id:own.conversation.id})).value.data.at(-1).text;expect(response).toContain('09:00');expect(response).not.toContain('T01:00')
  const ambiguous=await s.send(own.conversation.id,'提醒我明天交材料');expect(ambiguous.turn.followupReceipt.operation).toBe('clarify');expect(s.count('personal_followups')).toBe(1)
  expect((await s.call('personalFollowup',null,{id:follow.id},1)).status).toBe(404)
  expect(await s.tick(async()=>modelResult('不应调用'))).toBe(false)
 })
 it('records one due canonical message across restart/multiworker, exposes pending IM honestly and never repeats a completed reminder',async()=>{
  const s=await setup(false),own=await s.own(),due=Date.now()+60000,key=randomUUID(),body={title:'合成提醒',body:'交材料',dueAt:new Date(due).toISOString(),timeZone:'Asia/Shanghai',task:null,quietHours:null}
  const result=await s.call('createPersonalFollowup',body,{},0,'',key),id=result.value.data.id
  expect(result.status,result.text).toBe(201);expect((await s.call('createPersonalFollowup',body,{},0,'',key)).value.data.id).toBe(id)
  const paused=(await s.call('changePersonalFollowup',{expectedVersion:1,action:'pause'},{id})).value.data
  expect(await new PersonalFollowupWorker(s.db,s.config,()=>due+1).tick()).toBe(false)
  expect((await s.call('changePersonalFollowup',{expectedVersion:1,action:'resume'},{id})).status).toBe(409)
  await s.call('changePersonalFollowup',{expectedVersion:paused.version,action:'resume'},{id});await s.restart()
  const second=openDatabase(s.config.databasePath);cleanup.push(()=>second.close())
  const workers=[new PersonalFollowupWorker(s.db,s.config,()=>due+1),new PersonalFollowupWorker(second,s.config,()=>due+1)]
  expect((await Promise.all(workers.map(w=>w.tick()))).filter(Boolean)).toHaveLength(1)
  const follow=(await s.call('personalFollowup',null,{id})).value.data;expect(follow).toMatchObject({status:'active',delivery:'recorded',messageId:expect.any(String)})
  expect((await s.call('chatMessages',null,{id:own.conversation.id})).value.data.filter((m:{id:string})=>m.id===follow.messageId)).toHaveLength(1)
  expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(follow.messageId)?.status).toBe('pending')
  s.db.prepare("UPDATE im_message_outbox SET status='sent' WHERE message_id=?").run(follow.messageId)
  expect((await s.call('personalFollowup',null,{id})).value.data.delivery).toBe('im_sent')
  await s.call('changePersonalFollowup',{expectedVersion:follow.version,action:'complete'},{id})
  expect(await workers[0]!.tick()).toBe(false);expect(s.count('chat_messages')).toBe(1);expect(s.count('chat_turns')).toBe(0)
 })
 it('keeps quiet-hour deliveries pending and stops cancelled reminders',async()=>{
  const s=await setup(false),due=Date.parse('2027-01-01T15:00:00Z'),body={title:'夜间提醒',body:'只一次',dueAt:new Date(due).toISOString(),timeZone:'Asia/Shanghai',task:null,quietHours:{start:'22:00',end:'08:00'}}
  const created=(await s.call('createPersonalFollowup',body)).value.data
  expect(created.nextDeliveryAt).toBe('2027-01-02T00:00:00.000Z');expect(await new PersonalFollowupWorker(s.db,s.config,()=>due+1).tick()).toBe(false)
  expect((await s.call('changePersonalFollowup',{expectedVersion:created.version,action:'cancel'},{id:created.id})).status).toBe(200)
  expect(await new PersonalFollowupWorker(s.db,s.config,()=>Date.parse(created.nextDeliveryAt)+1).tick()).toBe(false);expect(s.count('chat_messages')).toBe(0)
 })
 it('dispatches default4000 with five complete existing profiles and preferences, and updates the parent receipt after child retry',async()=>{
  const s=await setup(),own=await s.own(),targets=[]
  for(const [index,name] of ['论文结构','阅读文献','项目分析','研究设计','代码讨论'].entries())targets.push((await s.call('createPersonalAgent',{...profile,displayName:`合成${name}助手`,introduction:`讨论用户提供的${name}文字。`,capabilityDescription:`仅讨论${name}。\n${agentCreationBoundary}`,personality:'先结论，说明未知。'})).value.data)
  for(const [topic,content] of [['回复方式','先给结论，再简要解释。'],['称呼','叫我小罗。'],['语言','使用中文。']])await s.call('createPersonalMemory',{topic,content,scope:'general'})
  const sent=await s.send(own.conversation.id,'帮我修改论文结构')
  let reserve=0,cap=0
  await s.tick(async input=>{const p=JSON.parse(input.prompt);expect(p).not.toHaveProperty('messages');expect(p).not.toHaveProperty('contacts');expect(p.personalMemories).toHaveLength(3);expect(p.specialistsOmitted).toBe(true);expect(p.localSpecialists[0].id).toBe(targets[0].id);expect(p.localSpecialists[0].profile.capabilityDescription).toContain(agentCreationBoundary);reserve=chatInputTokenBound(input.system,input.prompt);cap=input.maxTokens;expect(cap).toBeGreaterThanOrEqual(512);return modelResult(JSON.stringify({kind:'delegate',contactId:targets[0].id,profile:null}))})
  const receipt=(await s.turn(sent.turn.id)).assistantReceipt
  await s.tick(async()=>modelResult('',{failure:'MODEL_FAILED'}))
  const failed=await s.turn(receipt.turnId);expect(failed.status).toBe('failed');expect(failed.remainingBudget.maxTokens).toBe(3600)
  const key=randomUUID(),body={expectedVersion:failed.version,budget:{maxTokens:3500,maxSeconds:80}}
  const retry=await s.call('retryChatTurn',body,{id:failed.id},0,'',key);expect(retry.status,retry.text).toBe(202)
  expect((await s.turn(sent.turn.id)).assistantReceipt.turnId).toBe(retry.value.data.id)
  expect((await s.call('retryChatTurn',body,{id:failed.id},0,'',key)).value.data.id).toBe(retry.value.data.id)
  await s.tick(async()=>modelResult('合成论文结构建议。'));expect((await s.turn(retry.value.data.id)).status).toBe('succeeded')
  expect(s.specialists()).toBe(5);expect(s.db.prepare('SELECT count(*) n FROM chat_messages WHERE conversation_id=? AND sequence=1').get(receipt.conversationId)!.n).toBe(1)
  const evidence=process.env.PERSONAL_ASSISTANT_EVIDENCE_ROOT;if(evidence){mkdirSync(evidence,{recursive:true});writeFileSync(join(evidence,'coordinate-budget.json'),JSON.stringify({synthetic:true,profiles:5,confirmedPreferences:3,budget:4000,reserve,maxOutputTokens:cap,replyProvider:'synthetic ModelCall'},null,2))}
 })
 it('keeps insufficient delegation budget atomic, rejects other-owner candidates and fences candidate-profile changes',async()=>{
  const s=await setup(),own=await s.own(),other=(await s.call('createPersonalAgent',profile,{},1)).value.data
  const forbidden=await s.send(own.conversation.id,'帮我修改论文');await s.tick(async()=>modelResult(JSON.stringify({kind:'delegate',contactId:other.id,profile:null})))
  expect((await s.turn(forbidden.turn.id)).status).toBe('failed');expect(s.specialists()).toBe(0)
  const tight=await s.send(own.conversation.id,'帮我看看这个项目');await s.tick(async()=>modelResult(JSON.stringify({kind:'delegate',contactId:null,profile}),{elapsedMs:89500}))
  expect(await s.turn(tight.turn.id)).toMatchObject({status:'failed',failure:'BUDGET_EXCEEDED',outputMessageId:null,usage:{elapsedMs:89500}});expect(s.specialists()).toBe(0);expect(s.count('chat_conversations')).toBe(1)
  const ownAgent=(await s.call('createPersonalAgent',profile)).value.data,late=await s.send(own.conversation.id,'帮我修改论文');let release!:(v:ModelResult)=>void,entered!:()=>void
  const entering=new Promise<void>(r=>{entered=r}),pending=s.tick(async()=>{entered();return new Promise<ModelResult>(r=>{release=r})});await entering
  await s.call('updateContactProfile',{displayName:ownAgent.displayName,introduction:'已改资料',capabilityDescription:ownAgent.profile.capabilityDescription,personality:ownAgent.profile.personality,expectedVersion:ownAgent.profile.version},{id:ownAgent.id})
  release(modelResult(JSON.stringify({kind:'delegate',contactId:ownAgent.id,profile:null})));await pending
  expect(await s.turn(late.turn.id)).toMatchObject({status:'cancelled',failure:'INPUT_CHANGED',outputMessageId:null,usage:{inputTokens:100,outputTokens:100}})
 })
 it('does not invent cross-workspace collaboration or pass preferences to a friend',async()=>{
  const s=await setup(),own=await s.own(),other=await s.own(1),human=(await s.call('chatContacts',null,{},0,`?scope=global&search=${s.clients[1]!.username}`)).value.data.find((c:{identity:{kind:string}})=>c.identity.kind==='human')
  const relation=(await s.call('requestContact',{}, {id:human.id})).value.data.relationship
  await s.call('decideContactRequest',{expectedVersion:relation.version,decision:'accept'},{id:relation.requestId},1)
  await s.call('createPersonalMemory',{topic:'回复方式',content:'PRIVATE_PREFERENCE',scope:'general'})
  const sent=await s.send(own.conversation.id,`请安排和好友 ${human.displayName} 一起写论文`)
  expect(sent.turn).toMatchObject({status:'succeeded',outputMessageId:expect.any(String)});expect(sent.turn.assistantReceipt).toBeUndefined()
  const reply=(await s.call('chatMessages',null,{id:own.conversation.id})).value.data.at(-1)
  expect(reply.text).toContain('跨个人空间');expect(reply.text).toContain('尚未建立群');expect(reply.text).not.toContain('PRIVATE_PREFERENCE')
  expect(s.count('plans')).toBe(0);expect(s.count('chat_actions')).toBe(0);expect((await s.call('chatConversation',null,{id:own.conversation.id},1)).status).toBe(404)
  expect(await s.tick(async()=>modelResult('不应模型处理未开放协作'))).toBe(false);expect(other.conversation.kind).toBe('personal')
 })
 it('stops a recorded but pending IM reminder after cancellation while retaining its canonical record',async()=>{
  const s=await setup(false),due=Date.now()+1000,result=await s.call('createPersonalFollowup',{title:'取消提醒',body:'仅一次',dueAt:new Date(due).toISOString(),timeZone:'Asia/Shanghai',task:null,quietHours:null}),id=result.value.data.id
  await new PersonalFollowupWorker(s.db,s.config,()=>due+1).tick();const follow=(await s.call('personalFollowup',null,{id})).value.data
  await s.call('changePersonalFollowup',{expectedVersion:follow.version,action:'cancel'},{id})
  expect((await s.call('personalFollowup',null,{id})).value.data).toMatchObject({status:'cancelled',delivery:'im_denied',messageId:follow.messageId});expect(s.db.prepare('SELECT id FROM chat_messages WHERE id=?').get(follow.messageId)).toBeDefined();expect(await new PersonalFollowupWorker(s.db,s.config,()=>due+1).tick()).toBe(false)
 })
 it('restores preferences for review, disables learning and pauses followups without dispatching old queued work',async()=>{
  const s=await setup(),own=await s.own(),settings=(await s.call('personalMemorySettings')).value.data
  await s.call('updatePersonalMemorySettings',{candidateLearning:true,timeZone:settings.timeZone,quietHours:null,expectedVersion:settings.version});await s.call('createPersonalMemory',{topic:'回复方式',content:'本人保留偏好',scope:'general'})
  const due=Date.now()+60000,f=(await s.call('createPersonalFollowup',{title:'恢复需复核',body:'不要自动续发',dueAt:new Date(due).toISOString(),timeZone:'Asia/Shanghai',task:null,quietHours:null})).value.data
  const queued=await s.send(own.conversation.id,'帮我修改论文');await s.stop();const source=join(s.dir,'backup'),target=join(s.dir,'restored')
  expect(backup(s.config,source,'synthetic_operator','a'.repeat(40),'synthetic').completed).toBe(true);expect(restore(source,target,'synthetic_operator').completed).toBe(true)
  const restored=openDatabase(join(target,'platform.sqlite'));cleanup.push(()=>restored.close())
  expect(restored.prepare('SELECT candidate_learning,version FROM personal_memory_settings WHERE member_id=?').get(s.clients[0]!.id)).toMatchObject({candidate_learning:0,version:3})
  expect(restored.prepare('SELECT content,status FROM personal_memories').get()).toMatchObject({content:'本人保留偏好',status:'confirmed'});expect(restored.prepare('SELECT status FROM personal_followups WHERE id=?').get(f.id)!.status).toBe('paused')
  const config={...s.config,databasePath:join(target,'platform.sqlite'),blobRoot:join(target,'blobs')};let calls=0;expect(await new ChatWorker(restored,config,async()=>{calls++;return modelResult('不应调用')}).tick()).toBe(false);expect(calls).toBe(0);expect(restored.prepare('SELECT status FROM chat_turns WHERE id=?').get(queued.turn.id)!.status).toBe('cancelled')
  expect(await new PersonalFollowupWorker(restored,config,()=>due+1).tick()).toBe(false)
 })
 it('requires full task authority and stops followup after real canonical acceptance of a delivery',async()=>{
  const s=await setup(false),labId=String(s.db.prepare('SELECT lab_id FROM members WHERE id=?').get(s.clients[0]!.id)!.lab_id),schedule={suggested:null,hardDeadline:null,committed:null,estimatedHumanHours:null,checkpoint:null}
  const plan=(await s.call('createPlan',{labId,goal:'合成跟进任务',proposedItems:[{id:'work',title:'整理',goal:'整理文字',deliverable:'清单',acceptanceCriteria:'能检查',allocation:{kind:'self'},dependencies:[],schedule,inputArtifactIds:[],budget:null}],unresolvedQuestions:[]})).value.data
  const confirmed=await s.call('confirmPlan',{expectedVersion:plan.version},{id:plan.id}),taskId=confirmed.value.data.taskIds[0],read=async()=>(await s.call('task',null,{id:taskId})).value.data.task
  const task=await read(),due=Date.now()+1000,body={title:'任务跟进',body:'查看验收',dueAt:new Date(due).toISOString(),timeZone:'Asia/Shanghai',task:{id:taskId,version:task.version},quietHours:null}
  expect((await s.call('createPersonalFollowup',body,{},1)).status).toBe(404)
  expect((await s.call('createPersonalFollowup',{...body,task:{id:taskId,version:task.version+1}})).status).toBe(409)
  const reminder=(await s.call('createPersonalFollowup',body)).value.data
  expect((await s.call('start',{expectedVersion:task.version},{id:taskId})).status).toBe(200)
  const submitted=(await s.call('submit',{expectedVersion:(await read()).version,summary:'合成完成清单',artifactRefs:[],sources:[]},{id:taskId})).value.data
  expect((await s.call('review',{expectedVersion:submitted.version,expectedTaskVersion:(await read()).version,revision:submitted.revision,decision:'accepted',comment:'合成指定版本验收'},{id:submitted.id})).status).toBe(200)
  expect(await new PersonalFollowupWorker(s.db,s.config,()=>due+1).tick()).toBe(true)
  expect((await s.call('personalFollowup',null,{id:reminder.id})).value.data).toMatchObject({status:'completed',messageId:null});expect(s.count('chat_messages')).toBe(0);expect(s.count('chat_turns')).toBe(0)
 })
 it('reports the real specialist limit without an orphan or incompatible persisted turn',async()=>{
  const s=await setup(),own=await s.own()
  for(let index=0;index<20;index++)expect((await s.call('createPersonalAgent',{...profile,displayName:`已有文本角色${index}`})).status).toBe(201)
  const sent=await s.send(own.conversation.id,'帮我分析一个新主题')
  await s.tick(async()=>modelResult(JSON.stringify({kind:'delegate',contactId:null,profile:{...profile,displayName:'新角色'}})))
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'failed',failure:'AGENT_LIMIT_REACHED',outputMessageId:null});expect(s.specialists()).toBe(20);expect(s.count('chat_conversations')).toBe(1);s.legacyStored()
 })
})
it('parses full local/relative dates, rejects DST gaps/overlaps, and keeps explicit offsets',()=>{
 const now=Date.parse('2026-10-06T06:00:00Z')
 expect(reminderRequest('明天上午九点提醒我交材料','Asia/Shanghai',now)).toEqual({due:Date.parse('2026-10-07T01:00:00Z'),body:'交材料'})
 expect(reminderRequest('提醒我 2026年10月8日下午三点半 交材料','Asia/Shanghai',now)).toEqual({due:Date.parse('2026-10-08T07:30:00Z'),body:'交材料'})
 expect(reminderRequest('提醒我 2026-11-01 01:30 交材料','America/New_York',now)).toBeNull()
 expect(reminderRequest('提醒我 2027-03-14 02:30 交材料','America/New_York',now)).toBeNull()
 expect(reminderRequest('提醒我 2026-11-01T01:30:00-04:00 交材料','America/New_York',now)?.due).toBe(Date.parse('2026-11-01T05:30:00Z'))
 expect(reminderRequest('提醒我 2027-02-31T09:00:00+08:00 交材料','Asia/Shanghai',now)).toBeNull()
 expect(reminderRequest('提醒我 2027年2月31日上午九点 交材料','Asia/Shanghai',now)).toBeNull()
 expect(outsideQuiet(Date.parse('2026-11-01T05:30Z'),'America/New_York',{start:'01:00',end:'02:00'})).toBe('2026-11-01T07:00:00.000Z')
})
it('migration017→018 changes no old table row and is repeatable',async()=>{
 const s=await setup(),own=await s.own();await s.send(own.conversation.id,'已有旧消息')
 s.db.exec('DROP TABLE personal_followups; DROP TABLE personal_memory_revisions; DROP TABLE personal_memories; DROP TABLE personal_memory_settings; DELETE FROM schema_migrations WHERE version=18')
 const tables=s.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>String(r.name))
 const digest=()=>Object.fromEntries(tables.filter(t=>t!=='schema_migrations').map(t=>[t,createHash('sha256').update(JSON.stringify(s.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())).digest('hex')]))
 const before=digest();migrate(s.db);migrate(s.db);expect(digest()).toEqual(before);expect(s.db.prepare('SELECT max(version) v FROM schema_migrations').get()!.v).toBe(18);expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

