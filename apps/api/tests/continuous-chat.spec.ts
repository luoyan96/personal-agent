import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,it,expect} from 'vitest'
import {routes,Id,Budget,ModelUsage,Version,Instant,ChatAvailability,type RouteName} from '@research-agent-platform/contracts'
import {z} from 'zod'
import {readConfig} from '../src/config.js'
import {openDatabase,migrate} from '../src/database.js'
import {createServer} from '../src/server.js'
import {ChatWorker,reconcileChat} from '../src/chat-worker.js'
import {extendContinuous,startContinuous} from '../src/continuous-chat.js'
import type {ModelCall,ModelResult} from '../src/execution-worker.js'

const clean:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const fn of clean.splice(0).reverse())await fn()})
const result=(text:string,extra:Partial<ModelResult>={}):ModelResult=>({text,failure:null,inputTokens:100,outputTokens:100,elapsedMs:20,...extra})
const profile={displayName:'研究助手',introduction:'讨论提供的研究文字',capabilityDescription:'给出文字分析',personality:'直接简洁'}
// Verbatim strict persisted turn shape from pre-creation0.14, also accepted by
// deployed0.18. This is independent of the new optional progress contract.
const LegacyTurn=z.strictObject({id:Id,conversationId:Id,inputMessageId:Id,agentContactId:Id,status:z.enum(['queued','running','waiting_input','succeeded','unavailable','failed','interrupted','cancelled']),failure:z.enum(['MODEL_UNAVAILABLE','INVALID_MODEL_OUTPUT','MODEL_FAILED','LEASE_EXPIRED_USAGE_UNCERTAIN','AUTHORITY_CHANGED','INPUT_CHANGED','BUDGET_EXCEEDED']).nullable(),availability:ChatAvailability,outputMessageId:Id.nullable(),usage:ModelUsage.nullable(),budget:Budget,remainingBudget:Budget.nullable(),allowedActions:z.array(z.enum(['cancel','retry'])).max(2),version:Version,createdAt:Instant,updatedAt:Instant})
async function setup(){
 const dir=mkdtempSync(join(tmpdir(),'rap-continuous-'));clean.push(()=>rmSync(dir,{recursive:true,force:true}))
 const key=join(dir,'synthetic.key');writeFileSync(key,randomBytes(32).toString('hex'))
 const config=readConfig({NODE_ENV:'test',APP_ORIGIN:'http://127.0.0.1:4423',DATABASE_PATH:join(dir,'platform.sqlite'),BLOB_ROOT:join(dir,'blobs'),B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:key})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);migrate(db);clean.push(()=>db.close())
 let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});clean.push(()=>app.close())
 const actors:{cookie:string;csrf:string;id:string}[]=[]
 const call=async(name:RouteName,body:unknown=null,id?:string,actor=0,key:string=randomUUID())=>{
  const route=routes[name],response=await fetch(url+route.path.replace('{id}',id??''),{method:route.method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':key,...(actors[actor]?{cookie:actors[actor]!.cookie,'x-csrf-token':actors[actor]!.csrf}:{})},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
  return {status:response.status,value:await response.json() as any,cookie:response.headers.get('set-cookie')?.split(';')[0]??''}
 }
 for(const actor of [0,1]){const username=`continuous_${randomUUID().slice(0,8)}`,password='12345678';expect((await call('register',{username,password,displayName:`连续聊天者${actor}`},undefined,actor)).status).toBe(201);const login=await call('login',{username,password},undefined,actor);actors[actor]={cookie:login.cookie,csrf:'',id:login.value.data.id};actors[actor]!.csrf=(await call('session',null,undefined,actor)).value.data.csrfToken;await call('createPersonalModel',{name:'合成模型',provider:'deepseek',model:'deepseek-flash',apiKey:'synthetic-no-live-key',enabled:true},undefined,actor)}
 const own=(await call('personalConversation',{})).value.data
 const send=async(text:string,key:string=randomUUID(),continuous=true)=>{const r=await call('agentChatMessage',{text,continuous},own.conversation.id,0,key);expect(r.status,JSON.stringify(r.value)).toBe(201);return r.value.data}
 const turn=async(id:string)=>(await call('chatTurn',null,id)).value.data
 const progress=async(id:string)=>(await call('chatTurnProgress',null,id)).value.data
 const tick=(model:ModelCall,ready=true)=>new ChatWorker(db,config,model,undefined,ready?()=>Date.now()+10000:Date.now).tick()
 const count=(table:string)=>Number(db.prepare(`SELECT count(*) n FROM ${table}`).get()!.n)
 const restart=async()=>{await app.close();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}
 return {db,config,call,own,send,turn,progress,tick,count,actors,restart}
}
describe('continuous local chat: actual HTTP/SQLite, synthetic ModelCall only',{timeout:20000},()=>{
 it('persists seven queued supplements as one batch/call/budget, replays exactly, and exposes real deltas before canonical final',async()=>{
  const s=await setup(),ids:string[]=[],keys:string[]=[],sent:any[]=[]
  for(let i=0;i<7;i++){keys.push(randomUUID());const r=await s.send(`第${i+1}条补充完整文字。`,keys[i]);ids.push(r.message.id);sent.push(r);expect(r.turn.id).toBe(sent[0].turn.id)}
  expect(s.count('chat_turns')).toBe(1);expect(s.count('chat_messages')).toBe(7);expect(s.count('chat_attempts')).toBe(0)
  expect(await s.tick(async()=>{throw new Error('must not call inside merge window')},false)).toBe(false)
  expect(await s.progress(sent[0].turn.id)).toMatchObject({phase:'queued',text:'',inputMessageIds:ids})
  expect((await s.send('第1条补充完整文字。',keys[0])).message.id).toBe(ids[0])
  let release!:(v:ModelResult)=>void,enter!:()=>void;const ready=new Promise<void>(r=>{enter=r})
  const pending=s.tick(async(input,_signal,_credential,onDelta)=>{for(let i=0;i<7;i++)expect(input.prompt).toContain(`第${i+1}条补充完整文字。`);expect(input.maxTokens).toBeGreaterThan(64);onDelta?.('我收到了');enter();return new Promise(r=>{release=r})})
  await ready;const streamed=await s.progress(sent[0].turn.id);expect(streamed).toMatchObject({phase:'streaming',text:'我收到了',finalMessageId:null})
  expect(s.count('chat_messages')).toBe(7);release(result('我收到了全部补充。'));await pending
  const final=await s.progress(sent[0].turn.id);expect(final).toMatchObject({phase:'final',text:'我收到了全部补充。',inputMessageIds:ids});expect(final.finalMessageId).toBe((await s.turn(sent[0].turn.id)).outputMessageId);expect(final.revision).toBeGreaterThan(streamed.revision)
  expect(s.count('chat_attempts')).toBe(1);expect(await s.tick(async()=>{throw new Error('no duplicate charge')})).toBe(false)
  const stored=JSON.parse(String(s.db.prepare('SELECT document FROM chat_turns').get()!.document));expect(stored).not.toHaveProperty('continuous');expect(LegacyTurn.safeParse(stored).success).toBe(true);expect(LegacyTurn.safeParse(await s.turn(sent[0].turn.id)).success).toBe(true)
  await s.restart();expect((await s.progress(sent[0].turn.id)).finalMessageId).toBe(final.finalMessageId)
  expect((await s.call('chatTurnProgress',null,sent[0].turn.id,1)).status).toBe(404)
 })
 it('uses bounded monotonic sliding deadlines and re-evaluates pending creation when supplemented or withdrawn',async()=>{
  let c=startContinuous('a',1000);for(let i=1;i<6;i++)c=extendContinuous(c,`a${i}`,1000+i*700);expect(c.dueAt).toBe(5000);expect(extendContinuous(c,'clock-back',100).dueAt).toBe(5000)
  const s=await setup(),first=await s.send('帮我创建一个研究区块链的 Agent。');await s.send('擅长分析项目，说话直接一点。')
  await s.tick(async input=>{expect(JSON.parse(input.prompt).request).toBe('帮我创建一个研究区块链的 Agent。\n擅长分析项目，说话直接一点。');return result(JSON.stringify({kind:'create_agent',profile}))})
  expect((await s.turn(first.turn.id)).createdAgent).not.toBeNull()
  const no=await s.send('帮我创建一个研究科学的 Agent。');await s.send('先别创建，先给我思路。');await s.send('说话直接一点。')
  await s.tick(async(input,_sig,_cred,onDelta)=>{expect(input.system).toContain('natural private conversation');expect(input.prompt).toContain('先别创建');onDelta?.('先讨论思路');return result('先讨论思路，不创建联系人。')})
  expect(await s.turn(no.turn.id)).toMatchObject({status:'succeeded'});expect((await s.turn(no.turn.id)).purpose).toBeUndefined()
  expect(s.count('chat_contacts')).toBe(3)
 })
 it('supersedes an in-flight creation across workers, retains late actual usage, and starts the explicitly new batch without stale side effects',async()=>{
  const s=await setup(),old=await s.send('帮我创建一个研究区块链的 Agent。')
  let release!:(v:ModelResult)=>void,enter!:()=>void,signal!:AbortSignal;const ready=new Promise<void>(r=>{enter=r})
  const waiting=s.tick(async(_input,sig,_credential,onDelta)=>{signal=sig;expect(onDelta).toBeUndefined();enter();return new Promise(r=>{release=r})});await ready
  const replacement=await s.send('先别创建，只聊一下就好。');expect(signal.aborted).toBe(true);expect(replacement.turn.id).not.toBe(old.turn.id)
  expect(await s.progress(old.turn.id)).toMatchObject({phase:'superseded',text:'',supersededByTurnId:replacement.turn.id})
  const oldRoot=s.db.prepare('SELECT root_id FROM chat_turns WHERE id=?').get(old.turn.id)!.root_id,newRoot=s.db.prepare('SELECT root_id FROM chat_turns WHERE id=?').get(replacement.turn.id)!.root_id;expect(newRoot).not.toBe(oldRoot)
  // Another worker may process the new batch while the old provider ignores abort.
  await s.tick(async()=>result('可以，只聊思路。'));release(result(JSON.stringify({kind:'create_agent',profile}),{inputTokens:350,outputTokens:80}));await waiting
  expect(await s.turn(old.turn.id)).toMatchObject({status:'cancelled',usage:{inputTokens:350,outputTokens:80},outputMessageId:null});expect((await s.turn(old.turn.id)).allowedActions).not.toContain('retry')
  expect(await s.turn(replacement.turn.id)).toMatchObject({status:'succeeded',budget:{maxTokens:4000,maxSeconds:90}})
  expect(s.count('chat_contacts')).toBe(2);expect(s.count('chat_conversations')).toBe(1);expect(s.count('chat_actions')).toBe(0)
 })
 it('clears drafts on memory/config revocation or cancellation and never finalizes provisional/unknown usage',async()=>{
  const s=await setup()
  for(const mode of ['memory','cancel','unknown'] as const){
   const sent=await s.send('你好，继续讨论。');let release!:(v:ModelResult)=>void,enter!:()=>void;const ready=new Promise<void>(r=>{enter=r})
   const wait=s.tick(async(_input,_sig,_cred,onDelta)=>{onDelta?.('暂存回复');enter();return new Promise(r=>{release=r})});await ready;expect((await s.progress(sent.turn.id)).text).toBe('暂存回复')
   if(mode==='memory')await s.send('以后回答先给结论。')
   if(mode==='cancel')await s.call('cancelChatTurn',{expectedVersion:(await s.turn(sent.turn.id)).version},sent.turn.id)
   release(result('不应该成为旧最终回复',mode==='unknown'?{inputTokens:null,outputTokens:null}:{}));await wait
   const progress=await s.progress(sent.turn.id);expect(progress.text).toBe('');expect(progress.finalMessageId).toBeNull();expect(['stopped','superseded']).toContain(progress.phase)
   expect((await s.turn(sent.turn.id)).outputMessageId).toBeNull()
  }
  expect(s.db.prepare("SELECT count(*) n FROM chat_messages WHERE json_extract(document,'$.origin')='model'").get()!.n).toBe(0)
 })
 it('handles restart/expired leases fail closed without replaying uncertain charges, while a new explicit message remains usable',async()=>{
  const s=await setup(),queued=await s.send('第一条，等待重启。');await s.restart();await s.tick(async()=>result('重启后一次回复。'));expect((await s.turn(queued.turn.id)).status).toBe('succeeded')
  const lost=await s.send('模拟中断期间的新消息。'),row=s.db.prepare('SELECT document FROM chat_turns WHERE id=?').get(lost.turn.id)!,document=JSON.parse(String(row.document));document.status='running'
  s.db.prepare("UPDATE chat_turns SET status='running',document=?,lease_until=?,fence=1 WHERE id=?").run(JSON.stringify(document),Date.now()-1,lost.turn.id)
  s.db.prepare('INSERT INTO chat_attempts VALUES (?,?,?,NULL)').run(lost.turn.id,lost.turn.id,new Date().toISOString())
  reconcileChat(s.db,s.config);expect(await s.turn(lost.turn.id)).toMatchObject({status:'interrupted',failure:'LEASE_EXPIRED_USAGE_UNCERTAIN',remainingBudget:null})
  expect((await s.call('retryChatTurn',{expectedVersion:(await s.turn(lost.turn.id)).version,budget:{maxTokens:4000,maxSeconds:90}},lost.turn.id)).status).toBe(409)
  const next=await s.send('这是我的新一轮明确输入。');await s.tick(async()=>result('新一轮收到。'));expect((await s.turn(next.turn.id)).status).toBe('succeeded');expect(s.count('chat_attempts')).toBe(3)
 })
 it('never exposes structured JSON through the draft endpoint and budgets all merged current messages without trimming',async()=>{
  const s=await setup(),sent=await s.send('普通聊天。');let release!:(v:ModelResult)=>void,enter!:()=>void;const ready=new Promise<void>(r=>{enter=r})
  const wait=s.tick(async(_i,_sig,_cred,delta)=>{delta?.('{"kind":"delegate","profile":{"personality":"secret"}}');enter();return new Promise(r=>{release=r})});await ready;expect((await s.progress(sent.turn.id)).text).toBe('');release(result('普通回复'));await wait
  const huge=await s.send('甲'.repeat(1800));await s.send('乙'.repeat(1800));expect(await s.tick(async()=>{throw new Error('must not call over-budget batch')})).toBe(false);expect(await s.turn(huge.turn.id)).toMatchObject({status:'failed',failure:'BUDGET_EXCEEDED'})
 })
 it('exposes a validated clarification as final reply while retaining waiting_input business state',async()=>{
  const s=await setup(),sent=await s.send('帮我创建一个 Agent。')
  await s.tick(async(_i,_s,_c,delta)=>{expect(delta).toBeUndefined();return result(JSON.stringify({kind:'clarify',question:'希望它讨论什么主题？'}))})
  const actual=await s.turn(sent.turn.id);expect(actual.status).toBe('waiting_input')
  expect(await s.progress(sent.turn.id)).toMatchObject({phase:'final',text:'希望它讨论什么主题？',finalMessageId:actual.outputMessageId})
 })
 it('keeps a fresh explicit creation after small talk authorized by the new current command, with no call for superseded queued text',async()=>{
  const s=await setup(),hi=await s.send('你好。'),create=await s.send('帮我创建一个研究区块链的 Agent。')
  expect(create.turn.id).not.toBe(hi.turn.id);expect(create.turn.purpose).toBe('create_agent');expect((await s.turn(hi.turn.id)).status).toBe('cancelled')
  await s.tick(async input=>{expect(JSON.parse(input.prompt).request).toBe('帮我创建一个研究区块链的 Agent。');return result(JSON.stringify({kind:'create_agent',profile}))})
  expect(s.count('chat_attempts')).toBe(1);expect((await s.turn(create.turn.id)).createdAgent).not.toBeNull()
 })
 it('delegates the complete merged work request into one canonical child with the same remaining-budget ledger',async()=>{
  const s=await setup(),agent=(await s.call('createPersonalAgent',profile)).value.data,first=await s.send('帮我分析区块链项目。');await s.send('补充：重点说清证据不足。')
  await s.tick(async input=>{expect(JSON.parse(input.prompt).currentRequest).toBe('帮我分析区块链项目。\n补充：重点说清证据不足。');return result(JSON.stringify({kind:'delegate',contactId:agent.id,profile:null}))})
  const parent=await s.turn(first.turn.id),receipt=parent.assistantReceipt;expect(parent.status).toBe('succeeded');expect(receipt.kind).toBe('delegate')
  const message=JSON.parse(String(s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(receipt.messageId)!.document));expect(message.text).toBe('帮我分析区块链项目。\n补充：重点说清证据不足。')
  expect(s.db.prepare('SELECT root_id FROM chat_turns WHERE id=?').get(receipt.turnId)!.root_id).toBe(first.turn.id)
  await s.tick(async input=>{expect(input.prompt).toContain('重点说清证据不足');return result('先看证据和信息缺口。')})
  expect(await s.turn(receipt.turnId)).toMatchObject({status:'succeeded',budget:{maxTokens:4000,maxSeconds:90},remainingBudget:{maxTokens:3600,maxSeconds:89}})
 })
 it('keeps external messages separate and requires new consent before superseding/sending only the new current text',async()=>{
  const s=await setup(),agent=(await s.call('createPersonalAgent',profile)).value.data,direct=(await s.call('createDirectConversation',{contactId:agent.id})).value.data
  expect((await s.call('updateAgentConnection',{expectedVersion:0,protocol:'chat_completions',endpoint:'https://synthetic.invalid/v1/chat/completions',model:'synthetic-agent',enabled:true,allowAcceptedContacts:false,apiKey:'synthetic-external-key'},agent.id)).status).toBe(200)
  const first=await s.call('agentChatMessage',{text:'第一条单独同意外发',continuous:true,externalConsent:true},direct.id)
  expect(first.status).toBe(201)
  expect((await s.call('agentChatMessage',{text:'没有外发许可',continuous:true},direct.id)).status).toBe(403)
  expect((await s.turn(first.value.data.turn.id)).status).toBe('queued')
  const second=await s.call('agentChatMessage',{text:'只外发本条新要求',continuous:true,externalConsent:true},direct.id);expect(second.status).toBe(201);expect(second.value.data.turn.id).not.toBe(first.value.data.turn.id)
  expect(await s.progress(first.value.data.turn.id)).toMatchObject({phase:'superseded',text:'',supersededByTurnId:second.value.data.turn.id})
  let calls=0
  await new ChatWorker(s.db,s.config,async()=>{throw new Error('No local fallback')},async(input)=>{calls++;expect(input.text).toBe('只外发本条新要求');expect(input.maxTokens).toBeLessThan(4000);return result('本条外部回复。')}).tick()
  expect(calls).toBe(1);expect((await s.turn(second.value.data.turn.id)).status).toBe('succeeded')
  const input=JSON.parse(String(s.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(second.value.data.turn.id)!.request_json));expect(input.continuous.messageIds).toEqual([second.value.data.message.id]);expect(input.context).toEqual([])
 })
})
