import { FeedbackWorker } from '../src/feedback-worker.js'
import { agentRoles, roleDefaults } from '@research-agent-platform/research-skills/role-catalog'
import { randomBytes, randomUUID,createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync,readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,resolve } from 'node:path'
import {pathToFileURL} from 'node:url'
import {AssistantProjectWorker} from '../src/assistant-projects.js'
import { afterEach, describe, expect, it } from 'vitest'
import { routes,AgentTurn,type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate } from '../src/database.js'
import { createServer } from '../src/server.js'
import { ChatWorker } from '../src/chat-worker.js'
import { ExecutionWorker, type ModelCall, type ModelResult } from '../src/execution-worker.js'
import { MemoryCompressionWorker } from '../src/memory-compression-worker.js'
import { PersonalFollowupWorker,outsideQuiet } from '../src/personal-followups.js'
import { reminderRequest } from '../src/personal-time.js'
import { nextRecurring,scheduledRequest } from '../src/recurring-time.js'
import { personalWorkRequest } from '../src/personal-assistant.js'
import { agentCreationBoundary } from '../src/agent-creation.js'
import { chatInputTokenBound } from '../src/chat-model-input.js'
import { researchConversationPolicy } from '../src/conversation-policy.js'
import { agentStyleInstruction } from '../src/agent-style.js'
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
 it('loads the canonical colleague documents for the coordinator and every research, project and IP specialist in actual bounded model input',async()=>{
  const s=await setup(),own=await s.own()
  const personal=agentRoles.find(role=>role.id===roleDefaults.coordinator)!
  const first=await s.send(own.conversation.id,'你好，一起看看今天的研究')
  await s.tick(async input=>{
   const p=JSON.parse(input.prompt)
   expect(p.requestedAgent.profile.personality).toBe(personal.profile.personality)
   expect(p.requestedAgent.profile.capabilityDescription).toBe(personal.profile.capabilityDescription)
   expect(input.system).toContain(researchConversationPolicy)
   expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(first.turn.budget.maxTokens)
   return modelResult('我们先看看眼下最值得推进的事。')
  })
  expect((await s.turn(first.turn.id)).status).toBe('succeeded')
  for(const role of agentRoles.filter(role=>role.kind==='specialist'&&role.id!=='general-specialist')){
   const created=await s.call('createPersonalAgent',role.profile)
   expect(created.status,created.text).toBe(201)
   const agent=created.value.data,direct=(await s.call('createDirectConversation',{contactId:agent.id})).value.data
   const sent=await s.send(direct.id,'请先根据当前提供的文字一起讨论这个问题')
   let called=false
   await s.tick(async input=>{
    called=true;const p=JSON.parse(input.prompt)
    expect(p.requestedAgent.profile.personality).toBe(role.profile.personality)
    expect(p.requestedAgent.profile.capabilityDescription).toBe(role.profile.capabilityDescription)
    expect(input.system).toContain(researchConversationPolicy)
    expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(sent.turn.budget.maxTokens)
    return modelResult('先从目前的材料看起。')
   })
   expect(called,role.id).toBe(true)
   expect((await s.turn(sent.turn.id)).status,role.id).toBe('succeeded')
  }
 })

 it('adapts ordinary personal replies using earlier owner turns without creating permanent entries', async () => {
  const s = await setup(), own = await s.own()
  await s.send(own.conversation.id, '这次说得口语一点。')
  await s.tick(async () => modelResult('好。'))
  const next = await s.send(own.conversation.id, '那明天呢？')
  await s.tick(async input => {
   expect(input.system).toContain('Adapt reply length')
   expect(input.prompt).toContain('这次说得口语一点。')
   return modelResult('明天再接着聊。')
  })
  expect((await s.turn(next.turn.id)).status).toBe('succeeded')
  expect(s.count('personal_memories')).toBe(0)
 })
 it('revises a directly stated conversation preference under the same topic', async () => {
  const s = await setup(), own = await s.own()
  const first = await s.send(own.conversation.id, '我喜欢你说话自然一点。')
  const next = await s.send(own.conversation.id, '我更希望你回答先说结论。')
  expect(next.turn.memoryReceipt).toMatchObject({ operation: 'corrected', memoryId: first.turn.memoryReceipt.memoryId, version: 2 })
  await s.send(own.conversation.id, '讨论一下这个方案')
  await s.tick(async input => {
   expect(JSON.parse(input.prompt).personalMemories.map((m: {content: string}) => m.content)).toEqual(['我更希望你回答先说结论。'])
   return modelResult('先说结论。')
  })
 })
 it('summarizes open-ended work feedback, reuses it across assistants, revises it from planning and honors revocation', async () => {
  const s = await setup(), agent = (await s.call('createPersonalAgent', profile)).value.data
  const direct = (await s.call('createDirectConversation', { contactId: agent.id })).value.data
  const first = '比较方案时，我习惯先看每种方法的反例，再看优点。'
  const correction = '以后比较方案先摆证据矩阵，把反例放在最后一列。'
  const analyze = async (feedback: string, previous: string, summary: string) => {
   expect(await new FeedbackWorker(s.db,s.config,async input => {
    expect(JSON.parse(input.prompt)).toMatchObject({feedback,previous})
    return modelResult(JSON.stringify({ evidence: feedback, summary }))
   }).tick()).toBe(true)
  }
  await s.send(direct.id,first)
  await s.tick(async () => modelResult('好。'))
  await analyze(first,'','比较方案先列反例。')
  const own = await s.own()
  await s.send(own.conversation.id,'帮我比较甲乙两个方案')
  let nextPrompt = ''
  await s.tick(async input => { nextPrompt = input.prompt; return modelResult('好。') })
  expect(nextPrompt).toContain('比较方案先列反例。')
  await new FeedbackWorker(s.db,s.config,async () => modelResult('null')).tick()
  const labId = (await s.call('createLab',{name:'Synthetic lab'})).value.data.id
  const plan = await s.call('planRequest',{labId,replyMode:'conversation',prompt:correction, intent:'draft',inputArtifactIds:[],budget:{maxTokens:32000,maxSeconds:90}})
  expect(plan.status,plan.text).toBe(202)
  // The projection is allowed to run once the planning job has finished.
  let planningPrompt = ''
  await new ExecutionWorker(s.db,s.config,async input => {
   planningPrompt = input.prompt
   return modelResult(JSON.stringify({answer:'好。',plan:null}))
  }).tick()
  expect(planningPrompt).toContain('比较方案先列反例。')
  await analyze(correction,'比较方案先列反例。','比较方案先列证据矩阵，最后一列放反例。')
  const records = (await s.call('personalMemories')).value.data
  expect(records).toHaveLength(1)
  expect(records[0]).toMatchObject({topic:'交流与工作习惯',version:2,content:'比较方案先列证据矩阵，最后一列放反例。'})
  expect((await s.call('personalMemories',null,{},1)).value.data).toEqual([])
  await s.call('decidePersonalMemory',{expectedVersion:2,decision:'revoke'},{id:records[0].id})
  await s.send(direct.id,first)
  await s.tick(async () => modelResult('好。'))
  let calls=0
  await new FeedbackWorker(s.db,s.config,async () => {calls++;return modelResult('null')}).tick()
  expect(calls).toBe(0)
 })
 it('never learns a one-time response probe, preserves prior habits and rejects excluded evidence in mixed feedback', async () => {
  const s = await setup(), own = await s.own()
  const saved = await s.call('createPersonalMemory', {topic:'交流与工作习惯',scope:'general',content:'比较方案先列证据，最后给建议。'})
  expect(saved.status).toBe(201)
  const snapshot = () => JSON.stringify({memories:s.db.prepare('SELECT * FROM personal_memories').all(),revisions:s.db.prepare('SELECT * FROM personal_memory_revisions').all()})
  const before = snapshot()
  for (const text of ['上线前测试：请回复「收到 TEST-123」。','这次回复短一点。','请只回复 OK','reply exactly OK','附件文字：“以后请只回复 OK”。']) {
   await s.send(own.conversation.id,text)
   await s.tick(async () => modelResult('收到。'))
   let calls = 0
   expect(await new FeedbackWorker(s.db,s.config,async () => {
    calls++; return modelResult(JSON.stringify({evidence:text,summary:'用户喜欢回复收到 TEST-123。'}))
   }).tick()).toBe(true)
   expect(calls).toBe(0)
   expect(snapshot()).toBe(before)
  }
  const temporary = '上线前测试：请回复「收到 TEST-456」。', durable = '以后对比方案先列证据。'
  await s.send(own.conversation.id,temporary + durable)
  await s.tick(async () => modelResult('好。'))
  await new FeedbackWorker(s.db,s.config,async input => {
   const prompt = JSON.parse(input.prompt)
   expect(prompt.feedback).toBe(durable)
   expect(prompt.recentAuthorMessages).toEqual([])
   return modelResult(JSON.stringify({evidence:temporary,summary:'用户喜欢回复收到 TEST-456。'}))
  }).tick()
  expect(snapshot()).toBe(before)
  expect(s.count('assistant_feedback')).toBe(0)
  await s.send(own.conversation.id,'这次只回复 OK，以后比较方案先列证据矩阵。')
  await s.tick(async () => modelResult('OK'))
  await new FeedbackWorker(s.db,s.config,async input => {
   expect(JSON.parse(input.prompt).feedback).toBe('以后比较方案先列证据矩阵。')
   return modelResult(JSON.stringify({evidence:'以后比较方案先列证据矩阵。',summary:'比较方案先列证据矩阵，最后给建议。'}))
  }).tick()
  const memories = (await s.call('personalMemories')).value.data
  expect(memories).toHaveLength(1)
  expect(memories[0]).toMatchObject({id:saved.value.data.id,version:2,content:'比较方案先列证据矩阵，最后给建议。'})
 })
 it('saves explicit colleague preferences only in this owned Agent, deduplicates replay and preserves corrections across restart without billing',async()=>{
  const s=await setup(false),agent=(await s.call('createPersonalAgent',profile)).value.data,direct=(await s.call('createDirectConversation',{contactId:agent.id})).value.data,key=randomUUID()
  const sent=await s.send(direct.id,'以后和我聊天，先给自己的判断，别每次列清单。',0,key)
  expect(sent.turn).toMatchObject({status:'succeeded',usage:null});expect(sent.turn.memoryReceipt).toBeUndefined()
  expect((await s.send(direct.id,'以后和我聊天，先给自己的判断，别每次列清单。',0,key)).turn.id).toBe(sent.turn.id)
  expect(s.count('personal_memories')).toBe(0);expect(s.count('chat_memories')).toBe(1)
  const query=`?scope=private_agent&scopeId=${agent.id}`
  let entries=(await s.call('chatMemories',null,{},0,query)).value.data
  expect(entries[0]).toMatchObject({scope:'private_agent',scopeId:agent.id,version:1});expect(entries[0].content).toContain('先给自己的判断')
  await s.restart()
  await s.send(direct.id,'纠正你的交流方式：讨论证据时直接指出薄弱处，并给一个修改建议。')
  entries=(await s.call('chatMemories',null,{},0,query)).value.data
  expect(entries).toHaveLength(1);expect(entries[0].version).toBe(2);expect(entries[0].content).toContain('先给自己的判断');expect(entries[0].content).toContain('直接指出薄弱处')
  expect((await s.call('chatMemoryHistory',null,{id:entries[0].id})).value.data.revisions).toHaveLength(2)
  expect((await s.call('chatMemories',null,{},1,query)).status).toBe(404)
  const exported=(await s.call('exportAgentProfile',null,{id:agent.id})).value.data
  expect(JSON.stringify(exported)).not.toContain('直接指出薄弱处');expect(exported.profile.personality).toBe(profile.personality)
  let calls=0;await s.tick(async()=>{calls++;return modelResult('不应调用')});expect(calls).toBe(0)
  await s.send(direct.id,'清除你的交流偏好')
  expect((await s.call('chatMemories',null,{},0,query)).value.data).toHaveLength(0)
  expect((await s.call('chatMemoryHistory',null,{id:entries[0].id})).value.data.revisions.at(-1).status).toBe('revoked')
 })
 it('uses Agent corrections in subsequent private chat, isolates other roles and friends, and fences an in-flight older preference',async()=>{
  const s=await setup(),own=await s.own(),agent=(await s.call('createPersonalAgent',profile)).value.data,direct=(await s.call('createDirectConversation',{contactId:agent.id})).value.data
  await s.send(direct.id,'调整你的交流方式：PRIVATE_STYLE_ONLY_先判断再解释。')
  await s.send(direct.id,'谈谈这段结论');await s.tick(async input=>{expect(input.prompt).toContain('PRIVATE_STYLE_ONLY');expect(input.system).toContain(researchConversationPolicy);return modelResult('先讨论证据。')})
  await s.send(own.conversation.id,'你好');await s.tick(async input=>{expect(input.prompt).not.toContain('PRIVATE_STYLE_ONLY');return modelResult('你好。')})
  await s.own(1)
  const relationship=(await s.call('requestContact',{}, {id:agent.id},1)).value.data.relationship
  await s.call('decideContactRequest',{decision:'accept',expectedVersion:relationship.version},{id:relationship.requestId})
  const other=(await s.call('createDirectConversation',{contactId:agent.id},{},1)).value.data
  await s.send(other.id,'调整你的交流方式：FOREIGN_STYLE_MUST_NOT_SAVE',1)
  await s.tick(async input=>{expect(input.prompt).not.toContain('PRIVATE_STYLE_ONLY');return modelResult('只能当前讨论。')})
  expect(s.db.prepare("SELECT content FROM chat_memories WHERE scope_id=? AND status='active'").all(agent.id)).toHaveLength(1)
  const late=await s.send(direct.id,'继续分析');let release!:(v:ModelResult)=>void,entered!:()=>void
  const entering=new Promise<void>(r=>{entered=r}),pending=s.tick(async()=>{entered();return new Promise<ModelResult>(r=>{release=r})});await entering
  await s.send(direct.id,'清除你的交流偏好')
  release(modelResult('旧口吻结果不得保存'));await pending
  expect(await s.turn(late.turn.id)).toMatchObject({status:'cancelled',failure:'INPUT_CHANGED',outputMessageId:null,usage:{inputTokens:100,outputTokens:100}})
 })
 it('requires a complete explicit style instruction and keeps existing memories intact at capacity',async()=>{
  for(const text of ['“以后和我聊天，短一点”','材料：调整你的交流方式：直接一点','调整你的交流方式：直接一点？','调整你的交流方式：直接一点，但不要保存','你问太多了','这次短一点'])expect(agentStyleInstruction(text),text).toBeNull()
  const s=await setup(false),own=await s.own()
  for(let i=0;i<10;i++)expect((await s.call('createChatMemory',{scope:'private_agent',scopeId:own.agent.id,content:`保留原记忆${i}`,source:null})).status).toBe(201)
  const sent=await s.send(own.conversation.id,'调整你的交流方式：直接指出证据不足')
  expect(sent.turn.status).toBe('succeeded');expect(s.count('chat_memories')).toBe(10);expect(s.count('chat_memory_revisions')).toBe(10)
  expect(JSON.parse(String(s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(sent.turn.outputMessageId)!.document)).text).toContain('还没保存')
 })
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
  await s.tick(async input=>{expect(input.system).toContain(researchConversationPolicy);const prompt=JSON.parse(input.prompt);expect(prompt.currentRequest).toBe(text);expect(prompt.localSpecialists.map((v:{id:string})=>v.id)).toEqual([agent.id]);cap=input.maxTokens;return modelResult(JSON.stringify({kind:'delegate',contactId:agent.id,profile:null}))})
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
 it.each([0,1,2,3])('dispatches default4000 with five complete existing profiles and preferences, and updates the parent receipt after child retry %i',async variant=>{
  const s=await setup(),own=await s.own(),targets:{id:string}[]=[]
  if(variant)expect((await s.call('updateContactProfile',{displayName:own.agent.displayName+'甲'.repeat(variant),introduction:own.agent.profile.introduction,capabilityDescription:own.agent.profile.capabilityDescription,personality:own.agent.profile.personality,expectedVersion:own.agent.profile.version},{id:own.agent.id})).status).toBe(200)
  for(const [index,name] of ['论文结构','阅读文献','项目分析','研究设计','代码讨论'].entries())targets.push((await s.call('createPersonalAgent',{...profile,displayName:`合成${name}助手`,introduction:`讨论用户提供的${name}文字。`,capabilityDescription:`仅讨论${name}。\n${agentCreationBoundary}`,personality:'先结论，说明未知。'})).value.data)
  for(const [topic,content] of [['回复方式','先给结论，再简要解释。'],['称呼','叫我小罗。'],['语言','使用中文。']])await s.call('createPersonalMemory',{topic,content,scope:'general'})
  const sent=await s.send(own.conversation.id,'帮我修改论文结构')
  let reserve=0,cap=0
  await s.tick(async input=>{const p=JSON.parse(input.prompt);expect(p).not.toHaveProperty('messages');expect(p).not.toHaveProperty('contacts');expect(p.personalMemories).toHaveLength(3);expect(p.specialistsOmitted).toBe(true);expect(p.localSpecialists[0].id).toBe(targets[0]!.id);expect(p.localSpecialists[0].profile.capabilityDescription).toContain(agentCreationBoundary);reserve=chatInputTokenBound(input.system,input.prompt);cap=input.maxTokens;expect(cap).toBeGreaterThanOrEqual(512);return modelResult(JSON.stringify({kind:'delegate',contactId:targets[0]!.id,profile:null}))})
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
 it('saves a cross-workspace collaboration proposal without inviting anyone or passing preferences',async()=>{
  const s=await setup(),own=await s.own(),other=await s.own(1),human=(await s.call('chatContacts',null,{},0,`?scope=global&search=${s.clients[1]!.username}`)).value.data.find((c:{identity:{kind:string}})=>c.identity.kind==='human')
  const relation=(await s.call('requestContact',{}, {id:human.id})).value.data.relationship
  await s.call('decideContactRequest',{expectedVersion:relation.version,decision:'accept'},{id:relation.requestId},1)
  await s.call('createPersonalMemory',{topic:'回复方式',content:'PRIVATE_PREFERENCE',scope:'general'})
  const sent=await s.send(own.conversation.id,`请安排和好友 ${human.displayName} 一起写论文`)
  expect(sent.turn.status).toBe('queued')
  await s.tick(async input=>{expect(input.prompt).toContain(human.id);return modelResult(JSON.stringify({kind:'team',title:'合成跨空间建议',contactIds:[human.id]}))})
  const final=await s.turn(sent.turn.id);expect(final).toMatchObject({status:'succeeded',assistantReceipt:{kind:'work_task',status:'proposed',conversationId:null}})
  const reply=(await s.call('chatMessages',null,{id:own.conversation.id})).value.data.at(-1)
  expect(reply.text).toContain('确认后');expect(reply.text).not.toContain('PRIVATE_PREFERENCE')
  expect(s.count('social_groups')).toBe(0);expect(s.count('plans')).toBe(0);expect(s.count('chat_actions')).toBe(0);expect((await s.call('chatConversation',null,{id:own.conversation.id},1)).status).toBe(404)
  expect(other.conversation.kind).toBe('personal')
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
it('migration017→020 changes no old table row and is repeatable',async()=>{
 const s=await setup(),own=await s.own();await s.send(own.conversation.id,'已有旧消息')
 s.db.exec('DROP TABLE IF EXISTS assistant_topic_curator_jobs; DROP TABLE IF EXISTS assistant_topic_revisions; DROP TABLE IF EXISTS assistant_topics; DELETE FROM schema_migrations WHERE version=41; DROP TABLE IF EXISTS assistant_project_events; DROP TABLE IF EXISTS assistant_project_commitments; DROP TABLE IF EXISTS assistant_projects; DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE IF EXISTS team_library_repositories; DELETE FROM schema_migrations WHERE version=33; DROP TABLE IF EXISTS library_index_entries; DELETE FROM schema_migrations WHERE version=32; DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30; DROP TABLE work_context_revisions; DROP TABLE work_context_records; DELETE FROM schema_migrations WHERE version=29; DROP TABLE chat_message_retractions; DROP TABLE chat_message_relations; DELETE FROM schema_migrations WHERE version=28; DROP TABLE deleted_personal_agents; DROP TABLE peer_library_signals; DROP TABLE peer_library_requests; DROP TABLE peer_library_devices; DROP TABLE chat_turn_lab_contexts; DROP TABLE research_collection_labs; DROP TABLE lab_member_invitations; DROP TABLE member_lab_contexts; DROP VIEW effective_lab_memberships; DROP TABLE lab_memberships; DROP TABLE feishu_library_sources; DROP TABLE feishu_previews; DROP TABLE feishu_connections; DROP TABLE feishu_oauth_states; DROP TABLE research_agent_bindings; DROP TABLE research_file_pages; DROP TABLE research_file_versions; DROP TABLE research_files; DROP TABLE research_collections; DROP TABLE installed_skill_uses; DROP TABLE installed_skill_versions; DROP TABLE installed_skills; DROP TABLE social_groups; DROP TABLE personal_work_participants; DROP TABLE personal_work_tasks; DROP TABLE capability_publications; DROP TABLE personal_followup_runs; DROP TABLE personal_followups; DROP TABLE personal_memory_revisions; DROP TABLE personal_memories; DROP TABLE personal_memory_settings; DELETE FROM schema_migrations WHERE version>=18')
 const tables=s.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(r=>String(r.name))
 const digest=()=>Object.fromEntries(tables.filter(t=>t!=='schema_migrations').map(t=>[t,createHash('sha256').update(JSON.stringify(s.db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())).digest('hex')]))
 const before=digest();migrate(s.db);migrate(s.db);expect(digest()).toEqual(before);expect(s.db.prepare('SELECT max(version) v FROM schema_migrations').get()!.v).toBe(42);expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})

describe('recurring reminders and persistent local Agent jobs; synthetic model callbacks',{timeout:30000},()=>{
 const fields=(due:number)=>({title:'合成周期事项',body:'根据提供的文字整理三条待办。',dueAt:new Date(due).toISOString(),timeZone:'Asia/Shanghai',task:null,quietHours:null})
 const result=(text:string,failure:ModelResult['failure']=null):ModelResult=>({text,failure,inputTokens:100,outputTokens:50,elapsedMs:10})
 it('parses explicit daily/weekly/workday commands in local time and skips DST gaps/overlaps',()=>{
  const now=Date.parse('2026-10-07T06:00:00Z')
  expect(scheduledRequest('每天上午九点提醒我交材料','Asia/Shanghai',now)).toMatchObject({due:Date.parse('2026-10-08T01:00:00Z'),body:'交材料',recurrence:{frequency:'daily'},execute:false})
  expect(scheduledRequest('每周五下午六点帮我总结最近的聊天','Asia/Shanghai',now)).toMatchObject({due:Date.parse('2026-10-09T10:00:00Z'),recurrence:{frequency:'weekly',weekdays:[5]},execute:true})
  expect(scheduledRequest('每个工作日上午九点提醒我整理待办','Asia/Shanghai',Date.parse('2026-10-09T12:00:00Z'))?.due).toBe(Date.parse('2026-10-12T01:00:00Z'))
  expect(scheduledRequest('每天九点提醒我，只是举例','Asia/Shanghai',now)).toBeNull()
  expect(scheduledRequest('每天九点能帮我吗？','Asia/Shanghai',now)).toBeNull()
  expect(scheduledRequest('每天九点不要提醒我','Asia/Shanghai',now)).toBeNull()
  expect(nextRecurring(Date.parse('2027-03-13T07:30Z'),'America/New_York',{frequency:'daily'},Date.parse('2027-03-13T08:00Z'))).toBe(Date.parse('2027-03-15T06:30Z'))
  expect(nextRecurring(Date.parse('2026-10-31T05:30Z'),'America/New_York',{frequency:'daily'},Date.parse('2026-10-31T06:00Z'))).toBe(Date.parse('2026-11-02T06:30Z'))
 })
 it('creates recurring reminders and scheduled instructions from chat without executing immediately',async()=>{
  const s=await setup(false),own=await s.own()
  const reminded=await s.send(own.conversation.id,'每天上午九点提醒我整理待办')
  const executed=await s.send(own.conversation.id,'每周五下午六点帮我总结最近的聊天')
  expect((await s.call('personalFollowup',null,{id:reminded.turn.followupReceipt.followupId})).value.data).toMatchObject({recurrence:{frequency:'daily'},execution:null})
  expect((await s.call('personalFollowup',null,{id:executed.turn.followupReceipt.followupId})).value.data).toMatchObject({recurrence:{frequency:'weekly',weekdays:[5]},execution:{contactId:own.agent.id,budget:{maxTokens:4000,maxSeconds:90}}})
  expect(await s.tick(async()=>result('不应执行'))).toBe(false)
 })
 it('coalesces overdue periods, remains daily, and atomically deduplicates competing workers after restart',async()=>{
  const s=await setup(false),due=Date.now()+60000,created=await s.call('createPersonalFollowup',{...fields(due),recurrence:{frequency:'daily'}}),id=created.value.data.id
  expect(created.status,created.text).toBe(201);await s.restart()
  const second=openDatabase(s.config.databasePath);cleanup.push(()=>second.close())
  const now=due+3*86400000+5000,workers=[new PersonalFollowupWorker(s.db,s.config,()=>now),new PersonalFollowupWorker(second,s.config,()=>now)]
  expect((await Promise.all(workers.map(w=>w.tick()))).filter(Boolean)).toHaveLength(1)
  expect(s.count('personal_followup_runs')).toBe(1);expect(s.count('chat_messages')).toBe(1)
  const record=(await s.call('personalFollowup',null,{id})).value.data;expect(Date.parse(record.dueAt)).toBeGreaterThan(now);expect(record.lastRun.status).toBe('recorded');expect(record.allowedActions).toContain('edit')
  expect(await new PersonalFollowupWorker(s.db,s.config,()=>Date.parse(record.nextDeliveryAt)+1).tick()).toBe(true)
  expect(s.count('personal_followup_runs')).toBe(2);expect(s.count('chat_messages')).toBe(2)
  expect((await s.call('personalFollowupRuns',null,{id},1)).status).toBe(404)
  const page=(await s.call('personalFollowupRuns',null,{id},0,'?limit=1')).value;expect(page.data).toHaveLength(1);expect(page.nextCursor).toBeTruthy()
  expect((await s.call('personalFollowupRuns',null,{id},0,`?limit=1&cursor=${encodeURIComponent(page.nextCursor)}`)).value.data).toHaveLength(1)
 })
 it('executes a scheduled local Agent turn through the real ChatWorker and exposes its canonical response/history',async()=>{
  const s=await setup(),own=await s.own(),due=Date.now()+60000
  const created=await s.call('createPersonalFollowup',{...fields(due),execution:{kind:'agent',contactId:own.agent.id}});expect(created.status,created.text).toBe(201)
  const worker=new PersonalFollowupWorker(s.db,s.config,()=>due+1);expect(await worker.tick()).toBe(true)
  let calls=0
  await s.tick(async input=>{calls++;expect(input.system).toContain('owner-authorized scheduled instruction');expect(input.prompt).toContain('根据提供的文字整理三条待办');expect(input.maxTokens).toBeLessThan(4000);return result('合成模型生成的三条待办')})
  expect(await worker.tick()).toBe(true);expect(await worker.tick()).toBe(false);expect(calls,JSON.stringify((await s.call('personalFollowup',null,{id:created.value.data.id})).value.data)).toBe(1)
  const record=(await s.call('personalFollowup',null,{id:created.value.data.id})).value.data
  expect(record).toMatchObject({status:'completed',lastRun:{status:'succeeded',outputMessageId:expect.any(String)}})
  expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(record.lastRun.outputMessageId)?.status).toBe('pending')
  expect((await s.call('chatMessages',null,{id:own.conversation.id})).value.data.at(-1).text).toBe('合成模型生成的三条待办')
 })
 it('shows failures once, never automatically reissues a failed or uncertain call, and keeps the next recurring date',async()=>{
  const s=await setup(),own=await s.own(),due=Date.now()+60000,created=(await s.call('createPersonalFollowup',{...fields(due),recurrence:{frequency:'daily'},execution:{kind:'agent',contactId:own.agent.id}})).value.data
  const worker=new PersonalFollowupWorker(s.db,s.config,()=>due+1);await worker.tick();let calls=0
  await s.tick(async()=>{calls++;return result('', 'MODEL_FAILED')});await worker.tick()
  expect(await worker.tick()).toBe(false);expect(await s.tick(async()=>{calls++;return result('不可自动重试')})).toBe(false);expect(calls).toBe(1)
  const record=(await s.call('personalFollowup',null,{id:created.id})).value.data;expect(record).toMatchObject({status:'active',lastRun:{status:'failed',failure:'MODEL_FAILED',outputMessageId:expect.any(String)}})
  expect(s.count('chat_messages')).toBe(2);expect(Date.parse(record.nextDeliveryAt)).toBeGreaterThan(due+1)
 })
 it('pausing during a model call fences a late response; resume uses the next future time',async()=>{
  const s=await setup(),own=await s.own(),due=Date.now()+60000,created=(await s.call('createPersonalFollowup',{...fields(due),recurrence:{frequency:'daily'},execution:{kind:'agent',contactId:own.agent.id}})).value.data
  const worker=new PersonalFollowupWorker(s.db,s.config,()=>due+1);await worker.tick()
  let release!:(v:ModelResult)=>void,started!:()=>void;const ready=new Promise<void>(resolve=>started=resolve)
  const pending=s.tick(async()=>{started();return new Promise<ModelResult>(resolve=>release=resolve)});await ready
  const current=(await s.call('personalFollowup',null,{id:created.id})).value.data
  expect((await s.call('changePersonalFollowup',{expectedVersion:current.version,action:'pause'},{id:created.id})).status).toBe(200)
  release(result('迟到回复，不得保存'));await pending;await worker.tick()
  expect(s.count('chat_messages')).toBe(1);expect((await s.call('personalFollowup',null,{id:created.id})).value.data.lastRun.status).toBe('cancelled')
  const paused=(await s.call('personalFollowup',null,{id:created.id})).value.data
  const resumed=(await s.call('changePersonalFollowup',{expectedVersion:paused.version,action:'resume'},{id:created.id})).value.data
  expect(Date.parse(resumed.nextDeliveryAt)).toBeGreaterThan(Date.now());expect(s.count('personal_followup_runs')).toBe(1)
 })
 it('records a missing model and a busy conversation without interrupting existing user work',async()=>{
  const s=await setup(false),own=await s.own(),due=Date.now()+60000
  const unavailable=(await s.call('createPersonalFollowup',{...fields(due),execution:{kind:'agent',contactId:own.agent.id}})).value.data
  await new PersonalFollowupWorker(s.db,s.config,()=>due+1).tick();expect((await s.call('personalFollowup',null,{id:unavailable.id})).value.data.lastRun).toMatchObject({status:'skipped',failure:'MODEL_UNAVAILABLE'});expect(s.count('chat_turns')).toBe(0)
  await s.call('createPersonalModel',{name:'合成模型',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:'synthetic-only-key'})
  const original=await s.send(own.conversation.id,'普通消息保持待处理')
  const busy=(await s.call('createPersonalFollowup',{...fields(due+1000),execution:{kind:'agent',contactId:own.agent.id}})).value.data
  await new PersonalFollowupWorker(s.db,s.config,()=>due+1001).tick();expect((await s.call('personalFollowup',null,{id:busy.id})).value.data.lastRun).toMatchObject({status:'skipped',failure:'AGENT_BUSY'});expect((await s.turn(original.turn.id)).status).toBe('queued')
 })
 it('rejects other owners, keeps version conflicts, cancels queued work on edit and preserves existing schema18 rows',async()=>{
  const s=await setup(),own=await s.own(),foreign=await s.own(1),due=Date.now()+60000
  expect((await s.call('createPersonalFollowup',{...fields(due),execution:{kind:'agent',contactId:foreign.agent.id}})).status).toBe(403)
  const created=(await s.call('createPersonalFollowup',{...fields(due),recurrence:{frequency:'daily'},execution:{kind:'agent',contactId:own.agent.id}})).value.data
  await new PersonalFollowupWorker(s.db,s.config,()=>due+1).tick()
  expect((await s.call('updatePersonalFollowup',{...fields(due+86400000),expectedVersion:created.version} ,{id:created.id})).status).toBe(409)
  const current=(await s.call('personalFollowup',null,{id:created.id})).value.data
  expect((await s.call('updatePersonalFollowup',{...fields(due+86400000),expectedVersion:current.version,recurrence:{frequency:'daily'},execution:{kind:'agent',contactId:own.agent.id}},{id:created.id})).status).toBe(200)
  expect((await s.call('personalFollowup',null,{id:created.id})).value.data.lastRun.status).toBe('cancelled');expect(await s.tick(async()=>result('旧指令不能执行'))).toBe(false)
  s.db.exec('DROP TABLE IF EXISTS assistant_topic_curator_jobs; DROP TABLE IF EXISTS assistant_topic_revisions; DROP TABLE IF EXISTS assistant_topics; DELETE FROM schema_migrations WHERE version=41; DROP TABLE IF EXISTS assistant_project_events; DROP TABLE IF EXISTS assistant_project_commitments; DROP TABLE IF EXISTS assistant_projects; DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE IF EXISTS team_library_repositories; DELETE FROM schema_migrations WHERE version=33; DROP TABLE IF EXISTS library_index_entries; DELETE FROM schema_migrations WHERE version=32; DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30; DROP TABLE work_context_revisions; DROP TABLE work_context_records; DELETE FROM schema_migrations WHERE version=29; DROP TABLE chat_message_retractions; DROP TABLE chat_message_relations; DELETE FROM schema_migrations WHERE version=28; DROP TABLE deleted_personal_agents; DROP TABLE peer_library_signals; DROP TABLE peer_library_requests; DROP TABLE peer_library_devices; DROP TABLE chat_turn_lab_contexts; DROP TABLE research_collection_labs; DROP TABLE lab_member_invitations; DROP TABLE member_lab_contexts; DROP VIEW effective_lab_memberships; DROP TABLE lab_memberships; DROP TABLE feishu_library_sources; DROP TABLE feishu_previews; DROP TABLE feishu_connections; DROP TABLE feishu_oauth_states; DROP TABLE research_agent_bindings; DROP TABLE research_file_pages; DROP TABLE research_file_versions; DROP TABLE research_files; DROP TABLE research_collections; DROP TABLE installed_skill_uses; DROP TABLE installed_skill_versions; DROP TABLE installed_skills; DROP TABLE social_groups; DROP TABLE personal_work_participants; DROP TABLE personal_work_tasks; DROP TABLE capability_publications; DELETE FROM personal_followup_runs; DROP TABLE personal_followup_runs; DELETE FROM schema_migrations WHERE version>=19')
  const before=JSON.stringify(s.db.prepare('SELECT * FROM personal_followups ORDER BY id').all());migrate(s.db);migrate(s.db)
  expect(JSON.stringify(s.db.prepare('SELECT * FROM personal_followups ORDER BY id').all())).toBe(before);expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
 })
 it('revises an assistant preference for the same owner and topic and keeps both versions',async()=>{
  const s=await setup(false)
  const save=(value:string)=>s.call('createAssistantMemory',{scope:'personal',subjectId:null,topic:'format',type:'preference',summary:value,payload:{type:'preference',value}})
  const first=await save('paragraphs'),second=await save('bullet points')
  expect(first.status,first.text).toBe(201)
  expect(second.status,second.text).toBe(201)
  expect(second.value.data).toMatchObject({id:first.value.data.id,version:2})
  const history=await s.call('assistantMemoryHistory',null,{id:first.value.data.id})
  expect(history.value.data.revisions.map((v:{summary:string})=>v.summary)).toEqual(['paragraphs','bullet points'])
 })
 it('compresses identical private-agent notes and reports conflicts',async()=>{
  const s=await setup(false),agent=(await s.call('createPersonalAgent',profile)).value.data
  const note=(topic:string,detail:string)=>({scope:'agent',subjectId:agent.id,topic,type:'note',summary:detail,detail,payload:{type:'note',text:detail},source:{kind:'manual',id:null,version:null,label:null}})
  const list=async()=>(await s.call('assistantMemories',null,{},0,`?scope=agent&subjectId=${agent.id}&status=confirmed`)).value.data as any[]
  for(let i=0;i<2;i++)expect((await s.call('createAssistantMemory',note('引用格式','保留页码'),{},0)).status).toBe(201)
  const worker=new MemoryCompressionWorker(s.db,s.config)
  const first=await s.call('compressAssistantMemories',{subjectId:agent.id})
  expect(first.status,first.text).toBe(202);await worker.tick()
  const firstRead=await s.call('assistantMemoryCompressionJob',null,{id:first.value.data.id})
  expect(firstRead.status,firstRead.text).toBe(200)
  const firstJob=firstRead.value.data
  expect(firstJob.status).toBe('succeeded');expect(firstJob.result.merged).toBe(1);expect(await list()).toHaveLength(1)
  expect((await s.call('createAssistantMemory',note('引用格式','去掉页码'),{},0)).status).toBe(201)
  const second=await s.call('compressAssistantMemories',{subjectId:agent.id})
  expect(second.status,second.text).toBe(202);await worker.tick()
  const secondJob=(await s.call('assistantMemoryCompressionJob',null,{id:second.value.data.id})).value.data
  expect(secondJob.result.conflicts).toBe(2)
  const rows=await list();expect(rows).toHaveLength(2);expect(rows.every((row:any)=>row.conflict)).toBe(true)
 })
 it('lets the model group similar topics before the deterministic merge',async()=>{
  const s=await setup(),agent=(await s.call('createPersonalAgent',profile)).value.data
  const note=(topic:string,detail:string)=>({scope:'agent',subjectId:agent.id,topic,type:'note',summary:detail,detail,payload:{type:'note',text:detail},source:{kind:'manual',id:null,version:null,label:null}})
  const list=async()=>(await s.call('assistantMemories',null,{},0,`?scope=agent&subjectId=${agent.id}&status=confirmed`)).value.data as any[]
  for(const topic of ['引用','引用格式'])expect((await s.call('createAssistantMemory',note(topic,'保留页码'),{},0)).status).toBe(201)
  const ids=(await list()).map(row=>row.id)
  const worker=new MemoryCompressionWorker(s.db,s.config,Date.now,async()=>({text:JSON.stringify({groups:[{topic:'引用格式',ids}]}),failure:null,inputTokens:1,outputTokens:1,elapsedMs:1}))
  const queued=await s.call('compressAssistantMemories',{subjectId:agent.id})
  expect(queued.status,queued.text).toBe(202);await worker.tick()
  const read=await s.call('assistantMemoryCompressionJob',null,{id:queued.value.data.id})
  expect(read.status,read.text).toBe(200)
  const job=read.value.data
  expect(job.status).toBe('succeeded');expect(job.result.merged).toBe(1);expect(await list()).toHaveLength(1)
 })
})


describe('model-driven project entry from the actual personal chat',{timeout:30000},()=>{
 const project=(text:string,sourceMessageId:string,overrides:Record<string,unknown>={})=>({kind:'project',project:{title:'合成持续准备',goal:'周五前得到可核对的组会稿',dueAt:null,timeZone:'Asia/Shanghai',authorizationEvidence:text,sourceMessageIds:[sourceMessageId],sourceFileMessageIds:[],existingTaskIds:[],commitments:[{title:'整理现有材料',kind:'agent',contactId:null,instructions:'依据给出的合成材料整理一段组会稿；缺数字需明示。',acceptanceCriteria:'实际材料可追溯，未知数字不捏造。',dueAt:null,existingTaskId:null}],...overrides}})
 it('lets the model interpret wording outside the legacy shortcut and persists explicit owners, sources and scheduling once',async()=>{
  const s=await setup(),own=await s.own(),text='下周组会交给你持续推进，先整理现有材料，周五前准备好稿件。'
  expect(personalWorkRequest(text)).toBe(false)
  const sent=await s.send(own.conversation.id,text)
  await s.tick(async input=>{const p=JSON.parse(input.prompt);expect(p.projectEntrySources).toMatchObject({timeZone:'Asia/Shanghai',currentMessageIds:[sent.message.id]});expect(Number.isFinite(Date.parse(p.projectEntrySources.now))).toBe(true);expect(input.system).toContain('Interpret meaning');return modelResult(JSON.stringify(project(text,sent.message.id)))})
  const result=await s.turn(sent.turn.id)
  expect(result).toMatchObject({status:'succeeded',assistantReceipt:{kind:'work_task',conversationId:own.conversation.id,status:'ready'}})
  expect(s.count('assistant_projects')).toBe(1);expect(s.count('assistant_project_commitments')).toBe(1)
  const row=s.db.prepare('SELECT * FROM assistant_projects').get()!,doc=JSON.parse(String(row.document))
  expect(doc).toMatchObject({goal:'周五前得到可核对的组会稿',sourceMessageIds:[sent.message.id],timeZone:'Asia/Shanghai'})
  expect(s.db.prepare('SELECT contact_id,status FROM assistant_project_commitments').get()).toMatchObject({contact_id:own.agent.id,status:'pending'})
  expect(await s.tick(async()=>modelResult('不应重复'))).toBe(false)
 })
 it('preserves an explicit local date as a checkpoint without inventing the meeting time',async()=>{
  const s=await setup(),own=await s.own(),text='2027年1月8日组会稿交给你持续跟进',sent=await s.send(own.conversation.id,text)
  await s.tick(async()=>modelResult(JSON.stringify(project(text,sent.message.id,{dueDate:'2027-01-08'}))))
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'succeeded'})
  const row=s.db.prepare('SELECT due_at,document FROM assistant_projects').get()!,doc=JSON.parse(String(row.document))
  expect(doc).toMatchObject({dueAt:null,dueDate:'2027-01-08',timeZone:'Asia/Shanghai'})
  expect(row.due_at).toBe('2027-01-08T15:59:00.000Z')
 })
 it('keeps ordinary discussion as conversation and rejects unprovided sources and evidence',async()=>{
  const s=await setup(),own=await s.own()
  for(const text of ['下周组会一般讨论什么？','假如有人说“把组会交给你持续推进”，你怎么理解？','请分析这句话的语法']){
   const sent=await s.send(own.conversation.id,text);await s.tick(async()=>modelResult(JSON.stringify({kind:'reply',answer:'这里只讨论本次问题。',recordWork:false})))
   expect((await s.turn(sent.turn.id)).status).toBe('succeeded')
  }
  expect(s.count('personal_work_tasks')).toBe(0);expect(s.count('assistant_projects')).toBe(0)
  for(const overrides of [{authorizationEvidence:'未出现的授权'},{sourceMessageIds:['unprovided_message']}]){
   const text='这项准备交给你持续推进',sent=await s.send(own.conversation.id,text)
   await s.tick(async()=>modelResult(JSON.stringify(project(text,sent.message.id,overrides))))
   expect(await s.turn(sent.turn.id)).toMatchObject({status:'failed',failure:'INVALID_MODEL_OUTPUT',outputMessageId:null})
  }
  expect(s.count('assistant_projects')).toBe(0);expect(s.count('personal_work_tasks')).toBe(0)
 })
 it('assigns an unnamed delegated objective to an eligible specialist and dispatches that actual owner',async()=>{
  const s=await setup(),own=await s.own(),scope={displayName:'合成同事甲',introduction:'依据提供的研究记录撰写和修订供讨论的文稿。',capabilityDescription:'归纳论证、核对数字和解释方法选择；仅处理给定材料。',personality:'简洁、说明未知。'},specialist=(await s.call('createPersonalAgent',scope)).value.data
  const text='下周讨论时我要解释方案调整。记录和旧稿在这里，汇报稿交给你盯，准备好给我看。',sent=await s.send(own.conversation.id,text)
  expect(text).not.toContain(specialist.displayName)
  await s.tick(async input=>{const directory=JSON.parse(input.prompt).projectEntrySources.localSpecialists;expect(directory).toContainEqual({id:specialist.id,displayName:scope.displayName,introduction:scope.introduction,capabilityDescription:scope.capabilityDescription});expect(input.system).toContain('even when none is named');const output=project(text,sent.message.id);output.project.commitments[0]!.contactId=specialist.id;return modelResult(JSON.stringify(output))})
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'succeeded'})
  const work=s.db.prepare('SELECT * FROM assistant_project_commitments').get()!
  expect(work.contact_id).toBe(specialist.id)
  await new AssistantProjectWorker(s.db,s.config).tick()
  expect(s.db.prepare('SELECT status,turn_id FROM assistant_project_commitments WHERE id=?').get(work.id!)).toMatchObject({status:'running',turn_id:expect.any(String)})
  await s.tick(async input=>{const p=JSON.parse(input.prompt);expect(p.requestedAgent.id).toBe(specialist.id);return modelResult('实际由合成同事甲准备的稿件。')})
  expect((await s.turn(String(s.db.prepare('SELECT turn_id FROM assistant_project_commitments WHERE id=?').get(work.id!)!.turn_id))).status).toBe('succeeded')
 })
 it('retains coordinator fallback for unrelated specialist scope but rejects silent bypass of shown specialists',async()=>{
  const s=await setup(),own=await s.own(),specialist=(await s.call('createPersonalAgent',{displayName:'合成同事乙',introduction:'核对数据库索引设计。',capabilityDescription:'只讨论提供的SQL和查询计划，不撰写研究文稿。',personality:'直接。'})).value.data
  const text='这份研究讨论稿交给你持续跟进',silent=await s.send(own.conversation.id,text)
  await s.tick(async()=>modelResult(JSON.stringify(project(text,silent.message.id))))
  expect(await s.turn(silent.turn.id)).toMatchObject({status:'failed',failure:'INVALID_MODEL_OUTPUT'})
  expect(s.count('assistant_projects')).toBe(0)
  const sent=await s.send(own.conversation.id,text)
  await s.tick(async input=>{expect(JSON.parse(input.prompt).projectEntrySources.localSpecialists.map((c:{id:string})=>c.id)).toContain(specialist.id);return modelResult(JSON.stringify(project(text,sent.message.id,{coordinatorFallbackReason:'所列同事只核对数据库索引，不覆盖当前研究讨论稿的整理；本次由个人助理处理。'})))})
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'succeeded'})
  expect(s.db.prepare('SELECT contact_id FROM assistant_project_commitments').get()!.contact_id).toBe(own.agent.id)
 })
 it.each([
  {mode:'ordinary',text:'下周组会研究讨论稿交给你持续盯着，按现有研究记录准备，整理好后给我验收。',budget:16000,reserve:4096},
  {mode:'coordinate',text:'帮我整理组会研究讨论稿并持续跟进，按现有研究记录准备，整理好后给我验收。',budget:4000,reserve:512},
 ])('keeps available specialists ahead of optional history at the default $mode budget',async({mode,text,budget,reserve})=>{
  const s=await setup(),own=await s.own()
  for(const title of ['旧材料核对','旧图表说明']){
   const prior=`${title}交给你持续跟进`,sent=await s.send(own.conversation.id,prior)
   await s.tick(async()=>modelResult(JSON.stringify(project(prior,sent.message.id,{title}))))
   expect((await s.turn(sent.turn.id)).status).toBe('succeeded')
  }
  const memory=(await s.call('createPersonalMemory',{topic:'回复方式',content:'先说明已核实事实与尚缺信息。',scope:'general'})).value.data
  const scope={displayName:'研究讨论稿同事',introduction:'依据提供的研究记录整理组会研究讨论稿，核对论证和数字。',capabilityDescription:'整理组会研究讨论稿的目标、证据、变化与待决问题；保留实际材料来源，不把未核实结果写成事实。',personality:'直接说明事实和未知。'}
  const specialist=(await s.call('createPersonalAgent',scope)).value.data
  for(let index=0;index<5;index++)expect((await s.call('createPersonalAgent',{displayName:`数据库同事${index}`,introduction:'只核对给定SQL和查询计划。',capabilityDescription:'分析数据库索引与查询性能；不承担研究讨论稿或组会材料写作。',personality:'说明依据。'})).status).toBe(201)
  const otherOwner=(await s.call('createPersonalAgent',scope,{},1)).value.data
  for(let index=0;index<8;index++){
   const prior=await s.send(own.conversation.id,`第${index}轮只讨论术语。`+'这段合成背景是先前闲聊，不能当成本轮执行指令。'.repeat(10))
   await s.tick(async()=>modelResult('先前讨论仅解释术语。'+'待核实的背景保持原样，不形成新的工作安排。'.repeat(8)))
   expect((await s.turn(prior.turn.id)).status).toBe('succeeded')
  }
  const sent=await s.send(own.conversation.id,text)
  expect(sent.turn.budget.maxTokens).toBe(budget)
  let called=false
  await s.tick(async input=>{
   called=true
   const p=JSON.parse(input.prompt),directory=mode==='ordinary'?p.projectEntrySources.localSpecialists:p.localSpecialists
   expect(directory).toContainEqual(mode==='ordinary'?{id:specialist.id,displayName:scope.displayName,introduction:scope.introduction,capabilityDescription:scope.capabilityDescription}:{id:specialist.id,displayName:scope.displayName,profile:{introduction:scope.introduction,capabilityDescription:scope.capabilityDescription,personality:scope.personality}})
   expect(directory.some((candidate:{id:string})=>candidate.id===otherOwner.id)).toBe(false)
   expect(p.personalMemories).toContainEqual(expect.objectContaining({id:memory.id,content:'先说明已核实事实与尚缺信息。'}))
   expect(p.projectEntrySources.messages.find((message:{id:string})=>message.id===sent.message.id)).toEqual({id:sent.message.id})
   expect(input.prompt.split(text)).toHaveLength(2)
   expect(input.maxTokens).toBeGreaterThanOrEqual(reserve)
   expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(budget)
   const output=project(text,sent.message.id);output.project.commitments[0]!.contactId=specialist.id
   return modelResult(JSON.stringify(output))
  })
  expect(called).toBe(true)
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'succeeded'})
  const request=JSON.parse(String(s.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(sent.turn.id)!.request_json))
  expect(request.projectEntryInventory.specialistIds).toContain(specialist.id)
  expect(request.projectEntryInventory.specialistIds).not.toContain(otherOwner.id)
  expect(request.contextAudit.earlierMessagesOmitted).toBe(true)
  expect(s.db.prepare('SELECT contact_id FROM assistant_project_commitments ORDER BY rowid DESC LIMIT 1').get()!.contact_id).toBe(specialist.id)
  expect(s.count('assistant_projects')).toBe(3)
 },60000)
 it('keeps optional inventory inside the actual budget for an established account with many active commitments',async()=>{
  const s=await setup(),own=await s.own()
  for(let index=0;index<6;index++){
   const text=`第${index}项长期准备交给你持续推进`,sent=await s.send(own.conversation.id,text),base=project(text,sent.message.id)
   base.project.title=`项目${index}`+'合成资料'.repeat(30)
   base.project.commitments=Array.from({length:10},(_,i)=>({...base.project.commitments[0]!,title:`第${i}项`+'可核对交付'.repeat(25)}))
   await s.tick(async()=>modelResult(JSON.stringify(base)))
   expect((await s.turn(sent.turn.id)).status).toBe('succeeded')
  }
  const sent=await s.send(own.conversation.id,'今天只聊一下这段文字的意思。')
  await s.tick(async input=>{const p=JSON.parse(input.prompt);expect(p.projectEntrySources.projects.length).toBeLessThan(6);expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(sent.turn.budget.maxTokens);return modelResult('好，我们就看这段文字。')})
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'succeeded'})
  expect(s.count('assistant_projects')).toBe(6);expect(s.count('personal_work_tasks')).toBe(6)
 },60000)
 it('binds a fresh owner decision to the selected project and commitment instead of the newest project',async()=>{
  const s=await setup(),own=await s.own()
  for(const title of ['较早项目','较新项目']){const text=`${title}交给你持续跟进`,sent=await s.send(own.conversation.id,text);await s.tick(async()=>modelResult(JSON.stringify(project(text,sent.message.id,{title}))))}
  const rows=s.db.prepare('SELECT id,document FROM assistant_projects ORDER BY rowid').all(),first=rows[0]!,second=rows[1]!,commitment=s.db.prepare('SELECT id FROM assistant_project_commitments WHERE project_id=?').get(first.id!)!
  s.db.prepare("UPDATE assistant_project_commitments SET status='blocked',failure='OWNER_DECISION' WHERE id=?").run(commitment.id!)
  const text='帮我修改较早项目，采用已核实的24份数据，另外两份暂不纳入',sent=await s.send(own.conversation.id,text)
  expect(sent.turn.budget.maxTokens).toBe(4000)
  let seen:{system:string;prompt:string;maxTokens:number}|undefined
  await s.tick(async input=>{
   seen=input
   return modelResult(JSON.stringify({kind:'project_decision',projectId:first.id,commitmentId:commitment.id,instructions:'按24份已核实的数据继续修改，两份暂不纳入。',authorizationEvidence:text}))
  })
  expect(seen).toBeDefined()
  const sources=JSON.parse(seen!.prompt).projectEntrySources
  expect(seen!.system).toContain('kind:"project_decision"')
  expect(sources.projects.find((p:{id:string})=>p.id===first.id)?.commitments.map((c:{id:string})=>c.id)).toContain(commitment.id)
  expect(chatInputTokenBound(seen!.system,seen!.prompt)+seen!.maxTokens).toBeLessThanOrEqual(4000)
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'succeeded',assistantReceipt:{kind:'work_task'}})
  expect(s.count('assistant_projects')).toBe(2)
  expect(s.db.prepare('SELECT count(*) n FROM assistant_project_commitments WHERE project_id=?').get(first.id!)!.n).toBe(2)
  expect(s.db.prepare('SELECT count(*) n FROM assistant_project_commitments WHERE project_id=?').get(second.id!)!.n).toBe(1)
  expect(JSON.parse(String(s.db.prepare('SELECT document FROM assistant_projects WHERE id=?').get(first.id!)!.document)).sourceMessageIds).toContain(sent.message.id)
 })
 it('uses the same model entry for uploaded text and preserves the actual source file reference',async()=>{
  const s=await setup(),own=await s.own(),text='这份合成说明交给你持续整理成稿并跟进缺项'
  const sent=await s.call('agentFileMessage',{text,filename:'synthetic-brief.txt',mediaType:'text/plain',contentBase64:Buffer.from('目标：比较两种方法。缺项：样本量尚未确认。').toString('base64')},{id:own.conversation.id})
  expect(sent.status,sent.text).toBe(201);const data=sent.value.data
  await s.tick(async input=>{const p=JSON.parse(input.prompt);expect(p.fileExcerpts[0].text).toContain('样本量');expect(p.projectEntrySources.fileMessageIds).toContain(data.message.id);return modelResult(JSON.stringify(project(text,data.message.id,{sourceFileMessageIds:[data.message.id]})))})
  expect(await s.turn(data.turn.id)).toMatchObject({status:'succeeded',assistantReceipt:{kind:'work_task'}})
  expect(JSON.parse(String(s.db.prepare('SELECT document FROM assistant_projects').get()!.document)).sourceFileMessageIds).toEqual([data.message.id])
 })
 it.skipIf(!process.env.TEST_PROJECT_MODEL_ADAPTER)('opt-in live project lifecycle from one owner message across worker restart',async()=>{
  const adapter=await import(pathToFileURL(resolve(process.env.TEST_PROJECT_MODEL_ADAPTER!)).href),callModel:ModelCall=adapter.default??adapter.callModel
  if(typeof callModel!=='function')throw new Error('Adapter must export default ModelCall with actual provider usage')
  const s=await setup(),own=await s.own()
  const specialist=(await s.call('createPersonalAgent',{displayName:'组会文稿助手',introduction:'根据给定的合成资料撰写和核对组会文字。',capabilityDescription:'梳理研究目标、结果与尚缺实验信息；不虚构数字。',personality:'直接说明证据与缺项。'})).value.data
  const text='下周五组会我得解释为什么从乙方案换成甲方案。实验记录和旧稿都在这儿，汇报稿交给你盯，准备好给我看，有需要我定的再来找我。\n<合成实验记录>本轮24份数据已复核，另外2份尚待质量复核，不可列入已验证结果。甲方案波动范围2到4，乙方案3到5；改用甲的原因是乙在第二批出现批次漂移，甲在两批的趋势一致。</合成实验记录>\n<合成旧稿>本研究采用乙方案，因为乙更稳定；本轮共验证100份数据。</合成旧稿>'
  const calls:{input:unknown;result:ModelResult}[]=[],traced:ModelCall=async(input,signal,credential,onDelta)=>{const result=await callModel(input,signal,credential,onDelta);calls.push({input,result});return result}
  const sent=await s.send(own.conversation.id,text)
  const evidence=process.env.PROJECT_LIVE_EVIDENCE_ROOT?resolve(process.env.PROJECT_LIVE_EVIDENCE_ROOT):join(s.dir,'live-evidence');mkdirSync(evidence,{recursive:true})
  const prepareQueued=()=>{for(const row of s.db.prepare("SELECT id,request_json,document FROM chat_turns WHERE status='queued'").all()){const request=JSON.parse(String(row.request_json)),turn=JSON.parse(String(row.document));request.budget={maxTokens:64000,maxSeconds:300};turn.budget=request.budget;s.db.prepare('UPDATE chat_turns SET request_json=?,document=? WHERE id=?').run(JSON.stringify(request),JSON.stringify(turn),row.id!)}}
  try{
   prepareQueued();await new ChatWorker(s.db,s.config,traced).tick()
   expect(await s.turn(sent.turn.id)).toMatchObject({status:'succeeded',assistantReceipt:{kind:'work_task'}})
   expect(s.count('assistant_projects')).toBe(1)
   const scheduled=s.db.prepare('SELECT due_at,document FROM assistant_projects').get()!,schedule=JSON.parse(String(scheduled.document))
   expect(scheduled.due_at).not.toBeNull();expect(schedule.dueDate??schedule.dueAt).not.toBeNull()
   // Use the exact trusted clock/zone supplied by the API to this model call,
   // so the check stays valid across midnight and does not pin today's date.
   const trusted=JSON.parse((calls[0]!.input as {prompt:string}).prompt).projectEntrySources
   const localDate=(at:string,zone:string)=>{const fields=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(at));return ['year','month','day'].map(key=>fields.find(part=>part.type===key)!.value).join('-')}
   const calendar=new Date(localDate(trusted.now,trusted.timeZone)+'T00:00:00.000Z'),daysSinceMonday=(calendar.getUTCDay()+6)%7
   calendar.setUTCDate(calendar.getUTCDate()+11-daysSinceMonday)
   const nextFriday=calendar.toISOString().slice(0,10)
   expect(schedule.timeZone).toBe(trusted.timeZone)
   expect(schedule.dueDate??localDate(schedule.dueAt,schedule.timeZone)).toBe(nextFriday)
   await s.restart()
   let now=Date.now()
   for(let step=0;step<48;step++){
    now+=31000
    await new AssistantProjectWorker(s.db,s.config,()=>now).tick()
    prepareQueued();await new ChatWorker(s.db,s.config,traced).tick()
    const pending=Number(s.db.prepare("SELECT count(*) n FROM assistant_project_commitments WHERE status IN ('pending','running','waiting')").get()!.n)
    if(!pending&&['blocked','awaiting_review'].includes(String(s.db.prepare('SELECT status FROM assistant_projects').get()?.status)))break
   }
   const projectRow=s.db.prepare('SELECT * FROM assistant_projects').get()!,commitments=s.db.prepare('SELECT * FROM assistant_project_commitments ORDER BY position').all(),messages=(await s.call('chatMessages',null,{id:own.conversation.id})).value.data
   expect(messages.filter((m:{origin:string})=>m.origin==='human')).toHaveLength(1)
   expect(commitments.some(c=>c.output_message_id)).toBe(true)
   const actualOutputs=commitments.filter(c=>c.output_message_id&&JSON.parse(String(c.document)).phase!=='review').map(c=>JSON.parse(String(s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(c.output_message_id!)!.document)).text).join('\n')
   expect(actualOutputs).toMatch(/24/);expect(actualOutputs).toMatch(/(?<!\d)2(?!\d)/);expect(actualOutputs).toContain('批次漂移')
   expect(commitments.some(c=>JSON.parse(String(c.document)).phase==='review')).toBe(true)
   expect(['blocked','awaiting_review']).toContain(projectRow.status)
   const events=s.db.prepare('SELECT * FROM assistant_project_events WHERE project_id=? ORDER BY rowid').all(projectRow.id!),work=(await s.call('personalWorkTask',null,{id:String(projectRow.work_task_id)})).value.data
   expect(Number(projectRow.version)).toBeGreaterThan(1);expect(work.version).toBeGreaterThan(1)
   const published=events.filter(e=>e.kind==='decision'&&e.message_id),messageFor=(id:unknown)=>messages.find((m:{id:string})=>m.id===id)
   for(const event of published){const message=messageFor(event.message_id);expect(message).toMatchObject({id:event.message_id,conversationId:own.conversation.id,origin:'service'});expect(message.text).toBe(JSON.parse(String(event.document)).text)}
   if(projectRow.status==='awaiting_review'){
    const ready=published.filter(e=>String(e.event_key).startsWith('ready:')).at(-1)
    expect(ready).toBeDefined();const final=messageFor(ready!.message_id)
    expect(work).toMatchObject({status:'awaiting_review',result:{messageId:final.id,summary:final.text,accepted:false}})
    expect(final.text).toMatch(/24/);expect(final.text).toMatch(/(?<!\d)2(?!\d)/);expect(final.text).toContain('批次漂移')
    expect(commitments.every(c=>c.status==='ready')).toBe(true)
    const checked=events.filter(e=>e.kind==='assessment'&&JSON.parse(String(e.document)).assessment==='ready')
    expect(checked.length).toBeGreaterThan(0)
    for(const assessment of checked){
     const review=commitments.find(c=>c.id===assessment.commitment_id)!,parentId=JSON.parse(String(review.document)).parentCommitmentId,parent=commitments.find(c=>c.id===parentId)!
     expect(parent.output_message_id).not.toBeNull()
     const original=JSON.parse(String(s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(parent.output_message_id!)!.document))
     expect(original.origin).toBe('model');expect((await s.turn(original.turnId)).outputMessageId).toBe(original.id)
     expect(calls.map(call=>call.result.text)).toContain(original.text)
     expect(final.text).toContain(original.text)
    }
   }else{
    // Only a grounded review question counts as reaching the owner. Transport,
    // provider, malformed review, deadline or correction-limit failures do not.
    const decision=published.find(e=>String(e.event_key).startsWith('review-decision:'))
    expect(decision).toBeDefined();const item=commitments.find(c=>c.id===decision!.commitment_id)!
    expect(item).toMatchObject({status:'blocked',failure:'OWNER_DECISION'})
    const assessment=events.find(e=>e.kind==='assessment'&&e.commitment_id===item.id)!,review=JSON.parse(String(assessment.document))
    expect(review.assessment).toBe('decision');expect(typeof review.question).toBe('string');expect(review.question.trim().length).toBeGreaterThan(10)
    expect(messageFor(decision!.message_id).text).toContain(review.question.trim())
    expect(commitments.filter(c=>c.status==='blocked').every(c=>c.failure==='OWNER_DECISION')).toBe(true)
   }
   expect(calls.length).toBeGreaterThanOrEqual(3)
   expect(commitments.some(c=>c.contact_id===specialist.id)).toBe(true)
  }finally{
   writeFileSync(join(evidence,'project-live-evidence.json'),JSON.stringify({kind:'isolated-synthetic-materials-live-model',fixtureBudget:{maxTokens:64000,maxSeconds:300,productionBudgetChanged:false},sourceMessageId:sent.message.id,calls,workTasks:s.db.prepare('SELECT * FROM personal_work_tasks').all(),projects:s.db.prepare('SELECT * FROM assistant_projects').all(),commitments:s.db.prepare('SELECT * FROM assistant_project_commitments ORDER BY position').all(),events:s.db.prepare('SELECT * FROM assistant_project_events ORDER BY created_at,rowid').all(),messages:s.db.prepare('SELECT document FROM chat_messages ORDER BY rowid').all().map(r=>JSON.parse(String(r.document)))},null,2))
   console.log('PROJECT_LIVE_EVIDENCE',join(evidence,'project-live-evidence.json'))
  }
 },900000)
})
