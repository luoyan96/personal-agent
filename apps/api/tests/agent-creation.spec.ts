import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { afterEach, describe, expect, it } from 'vitest'
import { routes, Id, Budget, ModelUsage, Version, Instant, ChatAvailability, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate } from '../src/database.js'
import { createServer } from '../src/server.js'
import { ChatWorker } from '../src/chat-worker.js'
import type { ModelCall, ModelResult } from '../src/execution-worker.js'
import { AgentCreationOutput, agentCreationBoundary, isAgentCreationCommand } from '../src/agent-creation.js'

// Verbatim 0.14 AgentTurn schema from baseline 3be07110, before new metadata.
// This intentionally does not derive from the new schema or broaden its enum.
const LegacyTurn=z.strictObject({id:Id,conversationId:Id,inputMessageId:Id,agentContactId:Id,status:z.enum(['queued','running','waiting_input','succeeded','unavailable','failed','interrupted','cancelled']),failure:z.enum(['MODEL_UNAVAILABLE','INVALID_MODEL_OUTPUT','MODEL_FAILED','LEASE_EXPIRED_USAGE_UNCERTAIN','AUTHORITY_CHANGED','INPUT_CHANGED','BUDGET_EXCEEDED']).nullable(),availability:ChatAvailability,outputMessageId:Id.nullable(),usage:ModelUsage.nullable(),budget:Budget,remainingBudget:Budget.nullable(),allowedActions:z.array(z.enum(['cancel','retry'])).max(2),version:Version,createdAt:Instant,updatedAt:Instant})
const command='帮我创建一个研究区块链的 Agent，擅长分析项目，说话直接一点。'
const profile={displayName:'区块链项目助手',introduction:'讨论用户提供的区块链项目资料。',capabilityDescription:'分析提供的项目文字，区分事实、推断与风险。',personality:'直接、简洁，坦诚说明信息缺口。'}
const modelResult=(text:string,overrides:Partial<ModelResult>={}):ModelResult=>({text,failure:null,inputTokens:200,outputTokens:400,elapsedMs:10,...overrides})
const generated=(value=profile)=>modelResult(JSON.stringify({kind:'create_agent',profile:value}))
const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
async function setup(){
  const evidence=process.env.AGENT_CREATION_EVIDENCE_ROOT??join(tmpdir(),'rap-agent-creation');mkdirSync(evidence,{recursive:true})
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
    expect((await call('createPersonalModel',{name:'本人合成模型',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:`synthetic-owner-${actor}-only`},{},actor)).status).toBe(201)
  }
  const own=async(actor=0)=>(await call('personalConversation',{}, {},actor)).value.data
  const send=async(conversationId:string,text=command,actor=0,key=randomUUID())=>{const result=await call('agentChatMessage',{text},{id:conversationId},actor,'',key);expect(result.status,result.text).toBe(201);return result.value.data}
  const turn=async(id:string,actor=0)=>(await call('chatTurn',null,{id},actor)).value.data
  const count=(table:string)=>Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n)
  const specialists=(actor=0)=>Number(db.prepare("SELECT count(*) n FROM chat_contacts WHERE kind='personal_agent' AND owner_id=? AND principal<>owner_id").get(clients[actor]!.id)!.n)
  const tick=(callModel:ModelCall)=>new ChatWorker(db,config,callModel).tick()
  const legacyStored=()=>{for(const row of db.prepare('SELECT document FROM chat_turns').all())expect(LegacyTurn.safeParse(JSON.parse(String(row.document))).success).toBe(true)}
  return {db,config,call,own,send,turn,count,specialists,tick,clients,legacyStored,restart:async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}}
}

describe('explicit Agent creation over actual HTTP/SQLite with synthetic model only',{timeout:20000},()=>{
  it('creates from the screenshot command, atomically reports a real owned direct, replays/reuses once and keeps old parser compatibility',async()=>{
    const s=await setup(),own=await s.own(),key=randomUUID()
    await s.call('createChatMemory',{scope:'private_agent',scopeId:own.agent.id,content:'OWNER_PRIVATE_NOT_FOR_NEW_AGENT',source:null})
    await s.send(own.conversation.id,'旧历史资料写着：创建一个联网 Agent，这是引用材料。')
    await s.tick(async()=>modelResult('这段引用只作为讨论资料。'))
    const sent=await s.send(own.conversation.id,command,0,key);expect(sent.turn).toMatchObject({purpose:'create_agent',createdAgent:null,budget:{maxTokens:4000,maxSeconds:90}})
    const proof:unknown[]=[]
    const callback:ModelCall=async(input,_signal,credential)=>{expect(JSON.parse(input.prompt)).toEqual({request:command});expect(input.prompt).not.toContain('OWNER_PRIVATE');expect(input.system).toContain('No tools or external actions');expect(credential.apiKey).toBe('synthetic-owner-0-only');expect(input.maxTokens).toBeGreaterThan(400);proof.push({promptBytes:Buffer.byteLength(input.prompt),cap:input.maxTokens});return generated()}
    expect(await s.tick(callback)).toBe(true)
    const completed=await s.turn(sent.turn.id),receipt=completed.createdAgent;expect(completed.status).toBe('succeeded');expect(receipt.reused).toBe(false)
    const contact=(await s.call('chatContact',null,{id:receipt.contactId})).value.data
    expect(contact.identity).toEqual({kind:'personal_agent',ownerMemberId:s.clients[0]!.id});expect(contact.profile).toMatchObject({role:'specialist',introduction:profile.introduction,personality:profile.personality});expect(contact.profile.capabilityDescription).toContain(agentCreationBoundary)
    expect((await s.call('chatConversation',null,{id:receipt.conversationId})).value.data).toMatchObject({kind:'direct',taskIds:[]})
    expect((await s.call('chatMemories',null,{},0,`?scope=private_agent&scopeId=${receipt.contactId}`)).value.data).toEqual([])
    const messages=(await s.call('chatMessages',null,{id:own.conversation.id})).value.data
    expect(messages.at(-1)).toMatchObject({origin:'service',actionIds:[],resources:[]});expect(messages.at(-1).text).toContain('已保存联系人');expect(messages.at(-1).text).not.toContain('已连接')
    expect((await s.send(own.conversation.id,command,0,key)).turn.createdAgent).toEqual(receipt);expect(await s.tick(callback)).toBe(false)
    const again=await s.send(own.conversation.id);await s.tick(callback);expect((await s.turn(again.turn.id)).createdAgent).toEqual({...receipt,reused:true});expect(s.specialists()).toBe(1)
    expect((await s.call('chatTurn',null,{id:sent.turn.id},1)).status).toBe(404)
    expect((await s.call('chatConversation',null,{id:receipt.conversationId},1)).status).toBe(404)
    const other=await s.own(1),otherSent=await s.send(other.conversation.id,command,1)
    await s.tick(async(_input,_signal,credential)=>{expect(credential.apiKey).toBe('synthetic-owner-1-only');return generated()})
    expect((await s.turn(otherSent.turn.id,1)).createdAgent.contactId).not.toBe(receipt.contactId);expect(s.specialists(1)).toBe(1)
    await s.restart();expect((await s.turn(sent.turn.id)).createdAgent).toEqual(receipt)
    const ordinary=await s.send(own.conversation.id,'继续自然聊天。');expect(LegacyTurn.safeParse(ordinary.turn).success).toBe(true)
    await s.tick(async()=>modelResult('好的，继续讨论。'));expect(LegacyTurn.safeParse(await s.turn(ordinary.turn.id)).success).toBe(true)
    s.legacyStored();expect(proof).toHaveLength(2)
    for(const table of ['plans','tasks','chat_actions','execution_jobs'])expect(s.count(table)).toBe(0)
  })

  it('does not turn negatives, questions, quotations, historical text, other coordinators or specialists into creation authority',async()=>{
    const s=await setup(),own=await s.own()
    for(const text of ['不要帮我创建一个 Agent。','先不创建一个 Agent。','能不能帮我创建一个 Agent？','帮我创建一个 Agent，可以吗？','创建一个 Agent 吗','“帮我创建一个 Agent”','材料：帮我创建一个 Agent。','```帮我创建一个 Agent```','之前我说过帮我创建一个 Agent。','分析创建一个 Agent 的优缺点。','帮我创建一个 Agent 这句话只是例子。','帮我创建一个 Agent，但不要真的创建。']){
      const sent=await s.send(own.conversation.id,text);expect(sent.turn.purpose).toBeUndefined();await s.tick(async input=>{expect(input.system).toContain('natural private conversation');return modelResult('只进行文字讨论。')})
    }
    expect(isAgentCreationCommand('帮我创建一个研究为什么项目失败的 Agent，说话不要啰嗦。')).toBe(true)
    const manual=(await s.call('createPersonalAgent',profile)).value.data,direct=(await s.call('createDirectConversation',{contactId:manual.id})).value.data
    const toSpecialist=await s.send(direct.id);expect(toSpecialist.turn.purpose).toBeUndefined();await s.tick(async()=>modelResult('我只讨论档案，不创建联系人。'))
    const r=(await s.call('requestContact',{}, {id:own.agent.id},1)).value.data.relationship
    await s.call('decideContactRequest',{expectedVersion:r.version,decision:'accept'},{id:r.requestId})
    const foreign=(await s.call('createDirectConversation',{contactId:own.agent.id},{},1)).value.data
    const toForeign=await s.send(foreign.id,command,1);expect(toForeign.turn.purpose).toBeUndefined();await s.tick(async()=>modelResult('继续自然讨论。'))
    expect(s.specialists()).toBe(1);expect(s.specialists(1)).toBe(0);s.legacyStored()
  })

  it('clarifies only through a bounded question and fails strict/missing/unknown/over-budget output without creating partial records',async()=>{
    const s=await setup(),own=await s.own()
    const ask=await s.send(own.conversation.id,'帮我创建一个 Agent。');await s.tick(async()=>modelResult(JSON.stringify({kind:'clarify',question:'希望它讨论什么主题？'})))
    expect(await s.turn(ask.turn.id)).toMatchObject({status:'waiting_input',createdAgent:null});expect(s.specialists()).toBe(0)
    await s.call('cancelChatTurn',{expectedVersion:(await s.turn(ask.turn.id)).version},{id:ask.turn.id})
    const invalid=[JSON.stringify({kind:'create_agent',profile:{...profile,ownerId:'other'}}),JSON.stringify({kind:'create_agent',profile:{...profile,introduction:'  '}}),JSON.stringify({kind:'create_agent',profile:{...profile,displayName:'x'.repeat(201)}}),JSON.stringify({kind:'create_agent',profile,tools:['web']}),JSON.stringify({kind:'clarify',question:'',createdAgent:{}})]
    for(const output of invalid){const sent=await s.send(own.conversation.id);await s.tick(async()=>modelResult(output));expect(await s.turn(sent.turn.id)).toMatchObject({status:'failed',failure:'INVALID_MODEL_OUTPUT',createdAgent:null,outputMessageId:null})}
    for(const [failure,result] of [['MODEL_FAILED',generated(profile)],['BUDGET_EXCEEDED',generated(profile)]] as const){
      const sent=await s.send(own.conversation.id);await s.tick(async()=>({...result,...(failure==='MODEL_FAILED'?{inputTokens:null}:{inputTokens:4000})}));expect(await s.turn(sent.turn.id)).toMatchObject({status:'failed',failure,createdAgent:null})
    }
    expect(s.specialists()).toBe(0);expect(s.count('chat_conversations')).toBe(1);s.legacyStored()
  })

  it('rolls back contact/direct/receipts on a later persistence failure, and retries within remaining real usage once',async()=>{
    const s=await setup(),own=await s.own(),sent=await s.send(own.conversation.id)
    s.db.exec("CREATE TRIGGER reject_creation_receipt BEFORE INSERT ON chat_messages WHEN json_extract(NEW.document,'$.origin')='service' BEGIN SELECT RAISE(ABORT,'synthetic persistence failure'); END")
    await s.tick(async()=>generated());const failed=await s.turn(sent.turn.id)
    expect(failed).toMatchObject({status:'failed',failure:'INVALID_MODEL_OUTPUT',createdAgent:null});expect(s.specialists()).toBe(0);expect(s.count('chat_conversations')).toBe(1)
    expect(s.db.prepare("SELECT count(*) n FROM idempotency_results WHERE key LIKE 'creation_%'").get()!.n).toBe(0)
    s.db.exec('DROP TRIGGER reject_creation_receipt')
    const key=randomUUID(),body={expectedVersion:failed.version,budget:{maxTokens:3000,maxSeconds:80}}
    const retried=await s.call('retryChatTurn',body,{id:sent.turn.id},0,'',key);expect(retried.status,retried.text).toBe(202)
    await s.tick(async()=>generated());expect((await s.turn(retried.value.data.id)).createdAgent.reused).toBe(false)
    expect((await s.call('retryChatTurn',body,{id:sent.turn.id},0,'',key)).value.data.createdAgent.contactId).toBe((await s.turn(retried.value.data.id)).createdAgent.contactId)
    expect(await s.tick(async()=>generated())).toBe(false);expect(s.specialists()).toBe(1);s.legacyStored()
  })

  it('fences cancelled/changed-authority late creation but keeps actual usage and prevents orphan contacts',async()=>{
    const s=await setup(),own=await s.own()
    for(const mode of ['cancel','profile_change'] as const){
      const sent=await s.send(own.conversation.id)
      let release!:(value:ModelResult)=>void,entered!:()=>void
      const ready=new Promise<void>(resolve=>{entered=resolve}),pending=s.tick(async()=>{entered();return new Promise<ModelResult>(resolve=>{release=resolve})})
      await ready
      if(mode==='cancel')await s.call('cancelChatTurn',{expectedVersion:(await s.turn(sent.turn.id)).version},{id:sent.turn.id})
      else {const contact=(await s.call('chatContact',null,{id:own.agent.id})).value.data;await s.call('updateContactProfile',{displayName:contact.displayName,introduction:'新介绍',capabilityDescription:'仅文字讨论',personality:'自然',expectedVersion:contact.profile.version},{id:own.agent.id})}
      release(generated());await pending
      expect(await s.turn(sent.turn.id)).toMatchObject({status:'cancelled',createdAgent:null,usage:{inputTokens:200,outputTokens:400}})
      expect(s.specialists()).toBe(0);expect(s.count('chat_conversations')).toBe(1)
    }
    s.legacyStored()
  })

  it('reuses an exact owner profile at the limit but fails a different profile with a legacy-readable limit receipt',async()=>{
    const s=await setup(),own=await s.own(),saved={...profile,capabilityDescription:`${profile.capabilityDescription}\n${agentCreationBoundary}`}
    for(let i=0;i<20;i++)expect((await s.call('createPersonalAgent',i===0?saved:{...saved,displayName:`其他角色${i}`})).status).toBe(201)
    const reuse=await s.send(own.conversation.id);await s.tick(async()=>generated());expect((await s.turn(reuse.turn.id)).createdAgent.reused).toBe(true)
    const limited=await s.send(own.conversation.id);await s.tick(async()=>generated({...profile,displayName:'另一角色'}))
    expect(await s.turn(limited.turn.id)).toMatchObject({status:'failed',failure:'AGENT_LIMIT_REACHED',createdAgent:null,outputMessageId:null});expect(s.specialists()).toBe(20)
    expect(s.count('chat_conversations')).toBe(2);s.legacyStored()
  })

  it('keeps the complete command and rejects tight default input budget before any model call',async()=>{
    const s=await setup(),own=await s.own(),text=`帮我创建一个 Agent，研究${'完整材料'.repeat(1800)}`
    const sent=await s.send(own.conversation.id,text);let calls=0
    expect(await s.tick(async()=>{calls++;return generated()})).toBe(false)
    expect(await s.turn(sent.turn.id)).toMatchObject({status:'failed',failure:'BUDGET_EXCEEDED',budget:{maxTokens:4000,maxSeconds:90},usage:null,createdAgent:null})
    expect(calls).toBe(0);expect(s.specialists()).toBe(0);expect(JSON.parse(String(s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(sent.message.id)!.document)).text).toBe(text);s.legacyStored()
  })

  it('limits only generated profiles to concise complete fields and retains the manual profile API limits',async()=>{
    const s=await setup(),own=await s.own(),limits={displayName:60,introduction:80,capabilityDescription:200,personality:80}
    const bounded=Object.fromEntries(Object.entries(limits).map(([field,size])=>[field,'研'.repeat(size)])) as typeof profile
    expect(AgentCreationOutput.safeParse({kind:'create_agent',profile:bounded}).success).toBe(true)
    for(const [field,size] of Object.entries(limits)){
      const oversized={...profile,[field]:'研'.repeat(size+1)}
      expect(AgentCreationOutput.safeParse({kind:'create_agent',profile:oversized}).success).toBe(false)
      const sent=await s.send(own.conversation.id);await s.tick(async()=>generated(oversized));expect(await s.turn(sent.turn.id)).toMatchObject({status:'failed',failure:'INVALID_MODEL_OUTPUT',createdAgent:null})
    }
    const sent=await s.send(own.conversation.id);await s.tick(async()=>generated(bounded));const receipt=(await s.turn(sent.turn.id)).createdAgent
    const created=(await s.call('chatContact',null,{id:receipt.contactId})).value.data
    expect(created.displayName).toBe(bounded.displayName);expect(created.profile).toMatchObject({introduction:bounded.introduction,personality:bounded.personality,capabilityDescription:`${bounded.capabilityDescription}\n${agentCreationBoundary}`})
    expect((await s.call('createPersonalAgent',{...profile,introduction:'研'.repeat(111),capabilityDescription:'研'.repeat(426),personality:'研'.repeat(127)})).status).toBe(201)
  })

  it('keeps an existing long persona intact across three long-reply rounds by omitting only oldest whole daily messages',async()=>{
    const s=await setup(),text=(prefix:string,length:number)=>prefix+'研'.repeat(length-prefix.length)
    const capabilityPrefix='合成项目文字分析，不运行工具。',capability=text(capabilityPrefix,426-agentCreationBoundary.length-1)+'\n'+agentCreationBoundary
    const large={displayName:'合成链研',introduction:text('合成介绍：',111),capabilityDescription:capability,personality:text('直接、坦诚：',127)}
    const agent=(await s.call('createPersonalAgent',large)).value.data,direct=(await s.call('createDirectConversation',{contactId:agent.id})).value.data
    const reply=text('合成讨论回复：',260),proofs:{cap:number;messages:number;omitted:boolean}[]=[]
    for(const current of ['你擅长什么？两句话回答','请再说一遍完整观点，直接一点。','继续讨论，当前请求文字须完整保留。']){
      const sent=await s.send(direct.id,current);let calls=0
      expect(await s.tick(async input=>{
        calls++;const p=JSON.parse(input.prompt),column=p.messageColumns.indexOf('text'),rows=p.messages as unknown[][]
        expect(rows.at(-1)![column]).toBe(current);expect(rows.length).toBeLessThanOrEqual(20)
        for(const field of ['introduction','capabilityDescription','personality'] as const)expect(p.requestedAgent.profile[field]).toBe(large[field])
        for(const row of rows)expect([current,reply,'你擅长什么？两句话回答','请再说一遍完整观点，直接一点。']).toContain(row[column])
        if(proofs.length)expect(p.earlierMessagesOmitted).toBe(true)
        expect(input.maxTokens).toBeGreaterThanOrEqual(64);proofs.push({cap:input.maxTokens,messages:rows.length,omitted:!!p.earlierMessagesOmitted})
        return modelResult(reply,{outputTokens:Math.min(256,input.maxTokens)})
      })).toBe(true)
      expect(calls).toBe(1);expect(await s.turn(sent.turn.id)).toMatchObject({status:'succeeded',budget:{maxTokens:4000,maxSeconds:90}})
    }
    expect((await s.call('chatContact',null,{id:agent.id})).value.data.profile).toMatchObject({introduction:large.introduction,capabilityDescription:large.capabilityDescription,personality:large.personality})
    expect((await s.call('chatMessages',null,{id:direct.id})).value.data).toHaveLength(6)
    if(process.env.AGENT_CREATION_EVIDENCE_ROOT)writeFileSync(join(process.env.AGENT_CREATION_EVIDENCE_ROOT,'daily-long-persona-proof.json'),JSON.stringify({kind:'real-http-sqlite-synthetic-model',lengths:{introduction:111,capabilityDescription:426,personality:127,reply:260},proofs,defaultBudget:{maxTokens:4000,maxSeconds:90},actualVendorCalls:0},null,2))
  })

  it('reserves output for compact daily history, retains authorized memory, and rejects an oversized current request or base without trimming',async()=>{
    const s=await setup(),agent=(await s.call('createPersonalAgent',profile)).value.data,direct=(await s.call('createDirectConversation',{contactId:agent.id})).value.data
    const privateMemory='OWNER_PRIVATE_MEMORY_MUST_STAY_COMPLETE',memory=(await s.call('createChatMemory',{scope:'private_agent',scopeId:agent.id,content:privateMemory,source:null})).value.data
    for(let i=0;i<10;i++)expect((await s.call('sendChatMessage',{text:`旧资料${i}：`+'史'.repeat(260)},{id:direct.id})).status).toBe(201)
    const current='CURRENT_REQUEST_'+ '完整新句'.repeat(40),sent=await s.send(direct.id,current)
    await s.tick(async input=>{const p=JSON.parse(input.prompt),column=p.messageColumns.indexOf('text');expect(p.earlierMessagesOmitted).toBe(true);expect(p.messages.at(-1)[column]).toBe(current);expect(p.memories.some((m:any)=>m.content===privateMemory)).toBe(true);expect(input.maxTokens).toBeGreaterThanOrEqual(512);return modelResult('完整保留当前请求和获准记忆。')})
    expect((await s.turn(sent.turn.id)).status).toBe('succeeded')
    const foreign=(await s.call('requestContact',{}, {id:agent.id},1)).value.data.relationship;await s.call('decideContactRequest',{expectedVersion:foreign.version,decision:'accept'},{id:foreign.requestId})
    const otherDirect=(await s.call('createDirectConversation',{contactId:agent.id},{},1)).value.data
    const otherSent=await s.send(otherDirect.id,'另一人的独立文字讨论。',1)
    await s.tick(async input=>{expect(input.prompt).not.toContain(privateMemory);return modelResult('只使用当前人的获准上下文。')});expect((await s.turn(otherSent.turn.id,1)).status).toBe('succeeded')
    for(const mode of ['current','memory'] as const){
      if(mode==='memory')await s.call('reviseChatMemory',{content:'记'.repeat(2000),source:null,expectedVersion:memory.version},{id:memory.id})
      const huge=mode==='current'?'完整当前请求：'+'新'.repeat(2400):'当前短问题，记忆本身超预算。',rejected=await s.send(direct.id,huge);let calls=0
      expect(await s.tick(async()=>{calls++;return modelResult('不能调用')})).toBe(false);expect(calls).toBe(0);expect(await s.turn(rejected.turn.id)).toMatchObject({status:'failed',failure:'BUDGET_EXCEEDED',usage:null})
      expect(JSON.parse(String(s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(rejected.message.id)!.document)).text).toBe(huge)
    }
  })
})
