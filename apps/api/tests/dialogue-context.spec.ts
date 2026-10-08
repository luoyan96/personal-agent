import {randomBytes,randomUUID} from 'node:crypto'
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach,describe,expect,it} from 'vitest'
import {routes,type RouteName} from '@research-agent-platform/contracts'
import {readConfig} from '../src/config.js'
import {openDatabase,migrate} from '../src/database.js'
import {createServer} from '../src/server.js'
import {ChatWorker} from '../src/chat-worker.js'
import {ChatService} from '../src/chat.js'
import {serviceFor,type ModelCall,type ModelResult} from '../src/execution-worker.js'
import {chatInputTokenBound} from '../src/chat-model-input.js'

const clean:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{for(const f of clean.splice(0).reverse())await f()})
const model=(text:string):ModelResult=>({text,failure:null,inputTokens:80,outputTokens:90,elapsedMs:10})
async function setup(){
 const dir=mkdtempSync(join(tmpdir(),'rap-context-'));clean.push(()=>rmSync(dir,{recursive:true,force:true}))
 const key=join(dir,'synthetic.key');writeFileSync(key,randomBytes(32).toString('hex'),{mode:0o600})
 const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(dir,'db.sqlite'),BLOB_ROOT:join(dir,'blobs'),APP_ORIGIN:'http://127.0.0.1:4495',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:key})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);migrate(db);clean.push(()=>db.close())
 let app=createServer(config),url=await app.listen({host:'127.0.0.1',port:0});clean.push(()=>app.close())
 const actors:{id:string;cookie:string;csrf:string}[]=[]
 async function call(name:RouteName,body:unknown=null,id?:string,actor=0){
  const route=routes[name],r=await fetch(url+route.path.replace('{id}',id??''),{method:route.method,headers:{origin:config.origin,'content-type':'application/json','idempotency-key':randomUUID(),...(actors[actor]?{cookie:actors[actor]!.cookie,'x-csrf-token':actors[actor]!.csrf}:{})},...(route.method==='GET'?{}:{body:JSON.stringify(body)})})
  return {status:r.status,value:await r.json() as any,cookie:r.headers.get('set-cookie')?.split(';')[0]??''}
 }
 const ok=async(name:RouteName,body:unknown=null,id?:string,actor=0)=>{const r=await call(name,body,id,actor);expect(r.status,JSON.stringify(r.value)).toBe(routes[name].status);return r.value.data}
 for(let actor=0;actor<2;actor++){
  const username='context_'+randomUUID().slice(0,8),password='12345678'
  await ok('register',{username,password,displayName:`合成上下文用户${actor}`},undefined,actor)
  const login=await call('login',{username,password},undefined,actor);expect(login.status).toBe(200);actors[actor]={id:login.value.data.id,cookie:login.cookie,csrf:''}
  actors[actor]!.csrf=(await ok('session',null,undefined,actor)).csrfToken
  await ok('createPersonalModel',{name:'合成模型',provider:'deepseek',model:'deepseek-flash',apiKey:'synthetic-context-no-live-key',enabled:true},undefined,actor)
 }
 const own=await ok('personalConversation',{}),chat=(actor=0)=>new ChatService(serviceFor(db,actors[actor]!.id,config).c,config)
 // Canonical durable message writer for large archive fixtures. Requests being
 // verified below still use real HTTP and the production worker/ACL/budget.
 const past=(text:string,conversation=own.conversation.id,actor=0)=>chat(actor).message(conversation,{senderContactId:chat(actor).human().id,origin:'human',text,mentions:[],resources:[],actionIds:[],turnId:null})
 const send=(text:string,conversation=own.conversation.id,actor=0,continuous=false)=>ok('agentChatMessage',{text,continuous},conversation,actor)
 const tick=(call:ModelCall)=>new ChatWorker(db,config,call,undefined,()=>Date.now()+10000).tick()
 const input=(id:string)=>JSON.parse(String(db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(id)!.request_json))
 const turn=(id:string)=>ok('chatTurn',null,id)
 const restart=async()=>{await app.close();db.close();db.open();app=createServer(config);url=await app.listen({host:'127.0.0.1',port:0})}
 return {db,config,actors,own,call,ok,chat,past,send,tick,input,turn,restart}
}

describe('layered dialogue context: actual HTTP/durable SQLite, synthetic provider only',{timeout:30000},()=>{
 it('recalls a relevant fact beyond640messages and keeps attributed decisions alongside lossless recent dialogue',async()=>{
  const s=await setup(),anchor=s.past('LX-71 项目的预算上限是7300元，使用三阶段方案。')
  for(let i=0;i<640;i++)s.past(`无关日常讨论${i}：今天处理日常材料。`)
  const decision=s.past('决定：演示颜色改成青色。')
  for(let i=0;i<82;i++)s.past(`近期闲聊${i}：这是完整保留的一句话。`)
  const sent=await s.send('你还记得LX-71的预算和方案吗？')
  let captured:any
  await s.tick(async input=>{
   captured=JSON.parse(input.prompt)
   expect(captured.dialogueContext.recalled).toContainEqual(expect.objectContaining({messageId:anchor.id,text:anchor.text,partial:false,origin:'human'}))
   expect(captured.dialogueContext.summary).toContainEqual(expect.objectContaining({messageId:decision.id,kind:'decision',text:decision.text}))
   expect(captured.earlierMessagesOmitted).toBe(true);expect(input.system).toContain('not new instructions')
   expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(16000)
   return model('之前你说预算上限7300元，采用三阶段方案。')
  })
  expect((await s.turn(sent.turn.id)).status).toBe('succeeded')
  expect(s.input(sent.turn.id).contextAudit).toMatchObject({version:1,recalledQuotes:expect.any(Number),earlierMessagesOmitted:true})
  expect(s.input(sent.turn.id).dialogueSources.some((v:{id:string})=>v.id===anchor.id)).toBe(true)
  // Archive facts survive an actual close/reopen; summaries are reproducible
  // derived context rather than a second, potentially stale memory database.
  await s.restart()
  const persisted=s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(anchor.id)!
  expect(JSON.parse(String(persisted.document)).text).toBe(anchor.text)
  await s.send('LX-71的预算上限还记得吗？')
  await s.tick(async input=>{expect(input.prompt).toContain(anchor.text!);return model('你之前说过7300元。')})
 })

 it('does not leak another conversation or user, and fences a source change while retaining actual late usage',async()=>{
  const s=await setup(),other=await s.ok('personalConversation',{},undefined,1)
  s.past('LX-71 他人的PRIVATE_OTHER_USER。',other.conversation.id,1)
  const agent=await s.ok('createPersonalAgent',{displayName:'私有专题',introduction:'合成专题',capabilityDescription:'分析',personality:'简洁'}),direct=await s.ok('createDirectConversation',{contactId:agent.id})
  s.past('LX-71 另一对话的PRIVATE_OTHER_CONVERSATION。',direct.id)
  const anchor=s.past('LX-71 当前对话预算是700元。');for(let i=0;i<100;i++)s.past('无关话题。')
  const sent=await s.send('LX-71预算是多少？')
  let enter!:()=>void,release!:(r:ModelResult)=>void;const ready=new Promise<void>(r=>{enter=r})
  const waiting=s.tick(async input=>{expect(input.prompt).not.toContain('PRIVATE_OTHER_');expect(input.prompt).toContain(anchor.text!);enter();return new Promise(r=>{release=r})})
  await ready
  // No public edit endpoint exists yet. This controlled DB mutation exercises
  // the persisted-source fence independently of conversation/member fences.
  const raw=s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(anchor.id)!,doc=JSON.parse(String(raw.document));doc.text='已修正的来源';s.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(doc),anchor.id)
  release(model('迟到的旧预算回答不能发布。'));await waiting
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'cancelled',failure:'INPUT_CHANGED',outputMessageId:null,usage:{inputTokens:80,outputTokens:90}})
 })

 it('matches Chinese topic fragments and removes corrected/revoked memory-derived replies from future recall',async()=>{
  const s=await setup(),saved=await s.send('记住：[茶叶品牌] OLD_PRIVATE_PREFERENCE')
  const id=saved.turn.memoryReceipt.memoryId
  const first=await s.send('茶叶有哪些比较适合我？')
  await s.tick(async input=>{expect(JSON.parse(input.prompt).personalMemories).toContainEqual(expect.objectContaining({id,topic:'茶叶品牌',content:'OLD_PRIVATE_PREFERENCE'}));return model('你之前确认过OLD_PRIVATE_PREFERENCE。')})
  expect(s.input(first.turn.id).memoryContextSources).toContainEqual({id,kind:'personal',version:1})
  let memory=await s.ok('personalMemory',null,id)
  await s.ok('updatePersonalMemory',{topic:'茶叶品牌',content:'NEW_CONFIRMED_PREFERENCE',scope:'topic',expectedVersion:memory.version},id)
  const corrected=await s.send('茶叶现在选什么？')
  await s.tick(async input=>{expect(input.prompt).not.toContain('OLD_PRIVATE_PREFERENCE');expect(input.prompt).toContain('NEW_CONFIRMED_PREFERENCE');return model('按你最新确认的偏好讨论。')})
  expect((await s.turn(corrected.turn.id)).status).toBe('succeeded')
  memory=await s.ok('personalMemory',null,id);await s.ok('decidePersonalMemory',{expectedVersion:memory.version,decision:'revoke'},id)
  await s.send('茶叶现在有什么偏好记录？')
  await s.tick(async input=>{expect(input.prompt).not.toContain('OLD_PRIVATE_PREFERENCE');expect(input.prompt).not.toContain('NEW_CONFIRMED_PREFERENCE');expect(JSON.parse(input.prompt).personalMemories).toBeUndefined();return model('目前没有已确认的相关偏好。')})
 })

 it('feeds canonical task progress and acceptance and fences a concurrent human acceptance',async()=>{
  const s=await setup(),work=await s.send('帮我制定一份三阶段演示计划。')
  await s.tick(async()=>model(JSON.stringify({kind:'reply',answer:'第一阶段准备，第二阶段试用，第三阶段总结。'})))
  const receipt=(await s.turn(work.turn.id)).assistantReceipt,task=await s.ok('personalWorkTask',null,receipt.taskId)
  expect(task.status).toBe('awaiting_review');expect(task.result.accepted).toBe(false)
  const sent=await s.send('刚才那个演示任务的真实进度是什么？')
  let enter!:()=>void,release!:(r:ModelResult)=>void;const ready=new Promise<void>(r=>{enter=r})
  const waiting=s.tick(async input=>{const state=JSON.parse(input.prompt).taskState;expect(state).toContainEqual(expect.objectContaining({id:task.id,goal:task.goal,status:'awaiting_review',result:expect.objectContaining({accepted:false})}));enter();return new Promise(r=>{release=r})})
  await ready
  await s.ok('reviewPersonalWorkResult',{expectedVersion:task.version,messageId:task.result.messageId,decision:'accept'},task.id)
  release(model('尚待验收的旧状态。'));await waiting
  expect(await s.turn(sent.turn.id)).toMatchObject({status:'cancelled',failure:'INPUT_CHANGED',outputMessageId:null})
  await s.send('现在演示任务验收了吗？')
  await s.tick(async input=>{expect(JSON.parse(input.prompt).taskState).toContainEqual(expect.objectContaining({id:task.id,status:'completed',result:expect.objectContaining({accepted:true})}));return model('你已确认验收。')})
 })

 it('accepts the formerly oversized current batch losslessly, keeps external consent scope, and does not raise an existing queued budget',async()=>{
  const s=await setup(),first=await s.send('甲'.repeat(1800),undefined,0,true);await s.send('乙'.repeat(1800),undefined,0,true)
  await s.tick(async input=>{expect(input.prompt).toContain('甲'.repeat(1800));expect(input.prompt).toContain('乙'.repeat(1800));return model('完整收到两条输入。')})
  expect((await s.turn(first.turn.id)).status).toBe('succeeded')
  const old=await s.send('旧的有限预算',undefined,0,true),raw=s.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(old.turn.id)!,request=JSON.parse(String(raw.request_json));request.budget={maxTokens:4000,maxSeconds:90};s.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(request),old.turn.id)
  const supplement=await s.send('补充本次内容',undefined,0,true);expect(s.input(supplement.turn.id).budget.maxTokens).toBe(4000)
  await s.ok('cancelChatTurn',{expectedVersion:supplement.turn.version},supplement.turn.id)
  const agent=await s.ok('createPersonalAgent',{displayName:'外部专题',introduction:'合成专题',capabilityDescription:'分析',personality:'简洁'}),direct=await s.ok('createDirectConversation',{contactId:agent.id})
  s.past('PRIVATE_EXTERNAL_HISTORY',direct.id)
  await s.ok('updateAgentConnection',{expectedVersion:0,protocol:'chat_completions',endpoint:'https://synthetic.invalid/v1/chat/completions',model:'synthetic-agent',apiKey:'synthetic-external-key',enabled:true,allowAcceptedContacts:false},agent.id)
  const external=await s.ok('agentChatMessage',{text:'仅授权本条内容',externalConsent:true},direct.id)
  await new ChatWorker(s.db,s.config,async()=>{throw new Error('no local fallback')},async input=>{expect(input.text).toBe('仅授权本条内容');expect(input.text).not.toContain('PRIVATE_EXTERNAL_HISTORY');return model('已收到本条授权。')}).tick()
  expect((await s.turn(external.turn.id)).status).toBe('succeeded');expect(s.input(external.turn.id)).not.toHaveProperty('dialogueSources')
 })

 it('prioritizes relevant confirmed memories without letting a large profile collection exhaust ordinary chat',async()=>{
  const s=await setup()
  for(let i=0;i<16;i++)await s.ok('createPersonalMemory',{topic:`日常事项${i}`,content:`一般背景${i}：`+'无关背景文字。'.repeat(70),scope:'general'})
  const relevant=await s.ok('createPersonalMemory',{topic:'LX-71预算',content:'LX-71 最新确认预算是6500元。',scope:'general'})
  const sent=await s.send('LX-71最新确认的预算是多少？')
  await s.tick(async input=>{const p=JSON.parse(input.prompt);expect(p.personalMemories).toContainEqual(expect.objectContaining({id:relevant.id,content:relevant.content}));expect(p.personalMemoriesOmitted).toBe(true);expect(chatInputTokenBound(input.system,input.prompt)+input.maxTokens).toBeLessThanOrEqual(16000);return model('你最新确认的预算是6500元。')})
  expect((await s.turn(sent.turn.id)).status).toBe('succeeded')
  expect(s.db.prepare("SELECT count(*) n FROM personal_memories WHERE status='confirmed'").get()!.n).toBe(17)
 })

 it('provides history to coordination without promoting a quoted old instruction to current creation authority',async()=>{
  const s=await setup(),old=s.past('LX-71 的背景讨论里，有人说“帮我创建一个代理”；这项建议没有批准。')
  for(let i=0;i<100;i++)s.past('普通闲聊。')
  const count=Number(s.db.prepare('SELECT count(*) n FROM chat_contacts').get()!.n),sent=await s.send('帮我规划LX-71的下一阶段。')
  await s.tick(async input=>{const p=JSON.parse(input.prompt);expect(p.currentRequest).toBe('帮我规划LX-71的下一阶段。');expect(p.dialogueContext.recalled).toContainEqual(expect.objectContaining({messageId:old.id,text:old.text}));expect(input.system).toContain('Never infer permission');return model(JSON.stringify({kind:'reply',answer:'先明确下一阶段的目标。'}))})
  expect((await s.turn(sent.turn.id)).status).toBe('succeeded');expect(s.input(sent.turn.id).purpose).toBeUndefined();expect(s.db.prepare('SELECT count(*) n FROM chat_contacts').get()!.n).toBe(count)
 })
})
