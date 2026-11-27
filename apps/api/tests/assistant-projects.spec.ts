import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate, transaction, seed, checkDatabase } from '../src/database.js'
import { createServer } from '../src/server.js'
import { ChatService } from '../src/chat.js'
import { ChatWorker } from '../src/chat-worker.js'
import { serviceFor } from '../src/execution-worker.js'
import { AssistantProjectWorker, createAssistantProject, assistantProject, resolveAssistantProjectDecision } from '../src/assistant-projects.js'

const cleanup:(()=>unknown|Promise<unknown>)[]=[]
afterEach(async()=>{vi.restoreAllMocks();for(const fn of cleanup.splice(0).reverse())await fn()})
async function fixture(){
 const folder=mkdtempSync(join(tmpdir(),'assistant-project-core-'));cleanup.push(()=>rmSync(folder,{recursive:true,force:true}))
 const master=join(folder,'synthetic.key');writeFileSync(master,randomBytes(32).toString('hex'),{mode:0o600})
 const config=readConfig({NODE_ENV:'test',DATABASE_PATH:join(folder,'db.sqlite'),BLOB_ROOT:join(folder,'blobs'),APP_ORIGIN:'http://127.0.0.1:4317',B3_AI_ENABLED:'1',LAB_CREDENTIAL_KEY_FILE:master})
 mkdirSync(config.blobRoot);const db=openDatabase(config.databasePath,true);cleanup.push(()=>db.close());migrate(db)
 const app=createServer(config);cleanup.push(()=>app.close());let cookie='',csrf=''
 const call=async(name:RouteName,body:unknown=null,params:Record<string,string>={})=>{
  const route=routes[name],response=await app.inject({method:route.method,url:route.path.replace(/\{(\w+)\}/g,(_,key:string)=>params[key]!),headers:{origin:config.origin,'content-type':'application/json','idempotency-key':randomUUID(),cookie,'x-csrf-token':csrf},...(route.method==='GET'?{}:{payload:JSON.stringify(body)})})
  return {status:response.statusCode,value:response.json(),cookie:String(response.headers['set-cookie']??'').split(';')[0]!}
 }
 const username='core_'+randomUUID().slice(0,8),password='12345678'
 expect((await call('register',{username,password,displayName:'合成负责人'})).status).toBe(201)
 const login=await call('login',{username,password});cookie=login.cookie;csrf=(await call('session')).value.data.csrfToken
 expect((await call('createPersonalModel',{name:'Synthetic',provider:'deepseek',model:'deepseek-flash',enabled:true,apiKey:'synthetic-core-only'})).status).toBe(201)
 const own=(await call('personalConversation',{})).value.data
 const specialist=(await call('createPersonalAgent',{displayName:'合成助理',introduction:'核对提供的文本。',capabilityDescription:'整理用户提供的计划。',personality:'准确直接。'})).value.data
 const s=new ChatService(serviceFor(db,login.value.data.id,config).c,config)
 const source=(await call('agentChatMessage',{text:'请持续跟进这次计划，整理原稿并核对；只有真正缺少信息才问我。'},{id:own.conversation.id})).value.data
 await new ChatWorker(db,config,async()=>({text:'收到，按原稿核对。',failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})).tick()
 let now=Date.now()
 const input={title:'合成持续计划',goal:'整理并核对实际原稿。',dueAt:null as string|null,timeZone:'Asia/Shanghai',authorizationEvidence:'请持续跟进这次计划',sourceMessageIds:[] as string[],sourceFileMessageIds:[],existingTaskIds:[],commitments:[{title:'整理原稿',contactId:specialist.id as string|null,kind:'agent' as 'agent'|'human',instructions:'只整理这次用户提供的原稿。',acceptanceCriteria:'忠实提供的文字，不编造事实。',dueAt:null as string|null,existingTaskId:null}]}
 const create=()=>transaction(db,()=>createAssistantProject(s,input,{turnId:source.turn.id,messageId:source.message.id,conversationId:own.conversation.id},now))
 const tick=()=>new AssistantProjectWorker(db,config,()=>now).tick()
 return {db,config,s,call,own,specialist,source,input,create,tick,advance:(ms=31000)=>{now+=ms},now:()=>now}
}

describe('durable assistant project coordination; synthetic local inputs',()=>{
 it('writes the natural reply from a null-plan envelope without creating work',async()=>{
  const t=await fixture(),answer='我是你的个人助理，负责跟进科研任务。'
  const sent=(await t.call('agentChatMessage',{text:'你是谁？'},{id:t.own.conversation.id})).value.data
  await new ChatWorker(t.db,t.config,async()=>({text:JSON.stringify({plan:null,reply:answer}),failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})).tick()
  const turn=t.s.turn(sent.turn.id)
  expect(turn.status).toBe('succeeded')
  expect(t.s.projectedMessage(turn.outputMessageId!).text).toBe(answer)
  expect(t.db.prepare('SELECT count(*) n FROM assistant_projects').get()!.n).toBe(0)
  expect(t.db.prepare('SELECT count(*) n FROM personal_work_tasks').get()!.n).toBe(0)
 })
 it('corrects a model-proposed this-Friday date using the owner timestamp before future-date validation',async()=>{
  const t=await fixture(),row=t.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(t.source.message.id)!,source=JSON.parse(String(row.document))
  source.text='请持续跟进这次计划，下周五组会还要汇报合成项目。';source.createdAt='2026-11-16T01:00:00.000Z'
  t.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(source),t.source.message.id)
  const input={...t.input,dueDate:'2026-11-20',commitments:[{...t.input.commitments[0]!,dueDate:'2026-11-20'},{...t.input.commitments[0]!,dueDate:'2026-11-25'}]}
  const project=transaction(t.db,()=>createAssistantProject(t.s,input,{turnId:t.source.turn.id,messageId:t.source.message.id,conversationId:t.own.conversation.id},Date.parse('2026-11-23T01:00:00Z')))
  expect(project).toMatchObject({dueAt:null,dueDate:'2026-11-27',checkAt:'2026-11-27T15:59:00.000Z',checkpointKind:'date_end',timeZone:'Asia/Shanghai'})
  expect(project.commitments.map(c=>c.dueDate)).toEqual(['2026-11-27','2026-11-25'])
  expect(JSON.parse(String(t.db.prepare('SELECT document FROM assistant_projects WHERE id=?').get(project.id)!.document)).dueDate).toBe('2026-11-27')
 })
 it('acknowledges the corrected persisted date rather than the model-proposed date',async()=>{
  const t=await fixture(),text='下周五组会还要汇报合成项目，稿件交给你持续跟进。'
  const sent=(await t.call('agentChatMessage',{text},{id:t.own.conversation.id})).value.data
  const source=JSON.parse(String(t.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(sent.message.id)!.document));source.createdAt='2026-11-16T01:00:00.000Z'
  t.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(source),sent.message.id)
  vi.spyOn(Date,'now').mockReturnValue(Date.parse('2026-11-16T01:05:00Z'))
  await new ChatWorker(t.db,t.config,async()=>({text:JSON.stringify({kind:'project',project:{...t.input,authorizationEvidence:text,coordinatorFallbackReason:'本次由本人明确交给协调助理整理。',dueDate:'2026-11-20',commitments:[{...t.input.commitments[0]!,contactId:t.specialist.id,dueDate:'2026-11-20'}]}}),failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})).tick()
  const turn=t.s.turn(sent.turn.id)
  expect(turn.status).toBe('succeeded')
  const reply=t.s.projectedMessage(turn.outputMessageId!).text!
  expect(reply).toContain('2026-11-27');expect(reply).not.toContain('2026-11-20');expect(reply).toContain('具体时刻未指定')
 })
 it('deduplicates source-turn creation and rejects cross-owner access or fabricated current-request evidence',async()=>{
  const t=await fixture(),first=t.create(),second=t.create()
  expect(first.id).toBe(second.id)
  expect(t.db.prepare('SELECT count(*) n FROM assistant_projects').get()!.n).toBe(1)
  expect(t.db.prepare('SELECT count(*) n FROM personal_work_tasks WHERE source_turn_id=?').get(t.source.turn.id)!.n).toBe(1)
  expect(()=>transaction(t.db,()=>createAssistantProject(t.s,{...t.input,authorizationEvidence:'从旧记忆推断出来的授权'},{turnId:t.source.turn.id,messageId:t.source.message.id,conversationId:t.own.conversation.id}))).toThrow('FORBIDDEN')
  const otherName='other_'+randomUUID().slice(0,8),other=await t.call('register',{username:otherName,password:'12345678',displayName:'其他合成人'})
  expect(other.status).toBe(201)
  const otherId=String(t.db.prepare('SELECT member_id FROM auth_accounts WHERE username=?').get(otherName)!.member_id)
  const otherService=new ChatService(serviceFor(t.db,otherId,t.config).c,t.config)
  expect(()=>assistantProject(otherService,first.id)).toThrow('NOT_FOUND')
  expect(t.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
 })

 it('evaluates a due human commitment without a new message and records one concrete decision, never an invented acceptance',async()=>{
  const t=await fixture(),due=new Date(t.now()+60000).toISOString()
  t.input.dueAt=due;t.input.commitments[0]!.dueAt=due;t.input.commitments[0]!.kind='human';t.input.commitments[0]!.contactId=t.s.human().id
  const project=t.create();expect(await t.tick()).toBe(true)
  expect(assistantProject(t.s,project.id).commitments[0]!.status).toBe('waiting')
  const before=t.db.prepare('SELECT count(*) n FROM chat_messages').get()!.n
  t.advance(61000);expect(await t.tick()).toBe(true);await t.tick()
  expect(assistantProject(t.s,project.id).status).toBe('blocked')
  expect(t.db.prepare("SELECT count(*) n FROM assistant_project_events WHERE project_id=? AND kind='decision'").get(project.id)!.n).toBe(1)
  expect(Number(t.db.prepare('SELECT count(*) n FROM chat_messages').get()!.n)).toBe(Number(before)+1)
  t.advance(3600000);await t.tick();await t.tick()
  expect(t.db.prepare("SELECT count(*) n FROM assistant_project_events WHERE project_id=? AND kind='decision'").get(project.id)!.n).toBe(1)
  expect(t.db.prepare('SELECT status FROM personal_work_tasks WHERE id=?').get(project.workTaskId)!.status).toBe('active')
 })

 it('raises one actionable missing-input question before a future meeting and suppresses repeat deadline nudges',async()=>{
  const t=await fixture(),date=new Date(t.now()+7*86400000).toISOString().slice(0,10)
  const project=transaction(t.db,()=>createAssistantProject(t.s,{...t.input,dueAt:null,dueDate:date,commitments:[{...t.input.commitments[0],kind:'human',contactId:t.s.human().id,dueAt:null,dueDate:date}]},{turnId:t.source.turn.id,messageId:t.source.message.id,conversationId:t.own.conversation.id},t.now()))
  await t.tick();await t.tick()
  const dayBefore=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10)
  t.advance(Date.parse(dayBefore+'T01:00:00Z')-t.now());await t.tick();await t.tick()
  const events=t.db.prepare("SELECT * FROM assistant_project_events WHERE project_id=? AND kind='decision'").all(project.id)
  expect(events).toHaveLength(1);expect(String(events[0]!.event_key)).toMatch(/^advance-check:/)
  expect(String(events[0]!.created_at)<project.checkAt!).toBe(true)
  const text=t.s.projectedMessage(String(events[0]!.message_id)).text
  expect(text).toContain('请提供当前原稿或确认');expect(text).toContain('提前完成核对')
  t.advance(Date.parse(project.checkAt!)-t.now()+1000);await t.tick();await t.tick()
  expect(t.db.prepare("SELECT count(*) n FROM assistant_project_events WHERE project_id=? AND kind='decision'").get(project.id)!.n).toBe(1)
 })

 it('observes actual linked-task acceptance before the advance check and sends no missing-input question',async()=>{
  const t=await fixture(),date=new Date(t.now()+7*86400000).toISOString().slice(0,10)
  let linked=(await t.call('createPersonalWorkTask',{title:'合成真人原稿',goal:'提供真实原稿。',contactIds:[]})).value.data
  linked=(await t.call('activatePersonalWorkTask',{expectedVersion:linked.version},{id:linked.id})).value.data
  const project=transaction(t.db,()=>createAssistantProject(t.s,{...t.input,dueAt:null,dueDate:date,existingTaskIds:[linked.id],commitments:[{...t.input.commitments[0],kind:'human',contactId:t.s.human().id,dueAt:null,dueDate:date,existingTaskId:linked.id}]},{turnId:t.source.turn.id,messageId:t.source.message.id,conversationId:t.own.conversation.id},t.now()))
  await t.tick();await t.tick()
  linked=(await t.call('submitPersonalWorkResult',{expectedVersion:linked.version,text:'实际原稿已经提供。'},{id:linked.id})).value.data
  const accepted=await t.call('reviewPersonalWorkResult',{expectedVersion:linked.version,messageId:linked.result.messageId,decision:'accept'},{id:linked.id})
  expect(accepted.status).toBe(200)
  const previous=new Date(Date.parse(date+'T00:00:00Z')-86400000).toISOString().slice(0,10)
  t.advance(Date.parse(previous+'T01:00:00Z')-t.now());await t.tick();await t.tick()
  expect(t.db.prepare("SELECT count(*) n FROM assistant_project_events WHERE project_id=? AND event_key LIKE 'advance-check:%'").get(project.id)!.n).toBe(0)
  expect(assistantProject(t.s,project.id).commitments[0]!.status).toBe('ready')
 })

 it('cancels queued execution when the real task is cancelled and cannot commit a late model output',async()=>{
  const t=await fixture(),project=t.create();expect(await t.tick()).toBe(true)
  const commitment=assistantProject(t.s,project.id).commitments[0]!
  expect(commitment.status).toBe('running')
  const visible=(await t.call('personalWorkTask',null,{id:project.workTaskId})).value.data
  expect(visible.status).toBe('running');expect(visible.allowedActions).not.toContain('run')
  expect((await t.call('runPersonalWorkTask',{expectedVersion:visible.version,agentContactId:t.own.agent.id},{id:project.workTaskId})).status).toBe(409)
  t.db.prepare("UPDATE personal_work_tasks SET status='cancelled',version=version+1 WHERE id=?").run(project.workTaskId)
  expect(await t.tick()).toBe(true)
  expect(assistantProject(t.s,project.id).status).toBe('cancelled')
  expect(t.db.prepare('SELECT status,fence FROM chat_turns WHERE id=?').get(commitment.turnId!)!).toMatchObject({status:'cancelled',fence:1})
  let called=false
  await new ChatWorker(t.db,t.config,async()=>{called=true;return {text:'late forbidden output',failure:null,inputTokens:1,outputTokens:1,elapsedMs:1}}).tick()
  expect(called).toBe(false)
  expect(t.db.prepare('SELECT output_message_id FROM assistant_project_commitments WHERE id=?').get(commitment.id)!.output_message_id).toBeNull()
 })

 it('preserves a date-only deadline and uses a timezone date-end checkpoint without inventing a meeting time',async()=>{
  const t=await fixture(),date=new Date(t.now()+7*86400000).toISOString().slice(0,10)
  const project=transaction(t.db,()=>createAssistantProject(t.s,{...t.input,dueAt:null,dueDate:date,commitments:[{...t.input.commitments[0],dueAt:null,dueDate:date}]},{turnId:t.source.turn.id,messageId:t.source.message.id,conversationId:t.own.conversation.id},t.now()))
  expect(project).toMatchObject({dueAt:null,dueDate:date,checkpointKind:'date_end',checkAt:date+'T15:59:00.000Z'})
  expect(JSON.parse(String(t.db.prepare('SELECT document FROM assistant_projects WHERE id=?').get(project.id)!.document)).dueAt).toBeNull()
 })

 it('delivers a real reviewable result and automatically continues from the existing owner request-changes action',async()=>{
  const t=await fixture()
  t.input.commitments.push({...t.input.commitments[0]!,title:'整理第二份原稿'})
  const project=t.create()
  const model=async(text:string)=>new ChatWorker(t.db,t.config,async()=>({text,failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})).tick()
  for(const text of ['实际整理的原稿：先核对材料，再起草。','第二份原稿：分别记录两项交付。']){
   expect(await t.tick()).toBe(true);await model(text)
   t.advance();await t.tick();await t.tick()
   await model(JSON.stringify({assessment:'ready',summary:'已忠实核对原稿。',instructions:null,question:null}))
   t.advance();await t.tick()
  }
  await t.tick()
  const first=(await t.call('personalWorkTask',null,{id:project.workTaskId})).value.data
  expect(first.status).toBe('awaiting_review');expect(first.result.summary).toContain('实际整理的原稿')
  expect(first.result.summary).toContain('第二份原稿')
  const firstNotice=await t.call('chatProjectNotice',null,{id:t.own.conversation.id,messageId:first.result.messageId})
  expect(firstNotice.value.data).toEqual({projectId:project.id,taskId:project.workTaskId,kind:'result'})
  expect(t.db.prepare('SELECT event_key FROM assistant_project_events WHERE message_id=?').get(first.result.messageId)!.event_key).toMatch(/^ready:\d+$/)
  const changed=await t.call('reviewPersonalWorkResult',{expectedVersion:first.version,messageId:first.result.messageId,decision:'request_changes',comment:'把两步改成一段简洁的安排。'},{id:project.workTaskId})
  expect(changed.status).toBe(200);expect(changed.value.data.status).toBe('running')
  expect(await t.tick()).toBe(true)
  await new ChatWorker(t.db,t.config,async input=>{
   expect(JSON.parse(input.prompt).instruction).toContain('实际整理的原稿：先核对材料，再起草。')
   expect(JSON.parse(input.prompt).instruction).toContain('第二份原稿：分别记录两项交付。')
   return {text:'核对材料、起草并记录两项交付，统一整理成这份安排。',failure:null,inputTokens:100,outputTokens:100,elapsedMs:10}
  }).tick()
  t.advance();await t.tick();await t.tick()
  await model(JSON.stringify({assessment:'ready',summary:'已按本人修改意见完成并核对。',instructions:null,question:null}))
  t.advance();await t.tick();await t.tick()
  const final=(await t.call('personalWorkTask',null,{id:project.workTaskId})).value.data
  expect(final.status).toBe('awaiting_review');expect(final.result.messageId).not.toBe(first.result.messageId)
  expect(final.result.summary).toContain('统一整理成这份安排')
  expect(final.result.summary).not.toContain('实际整理的原稿：')
  expect(final.result.summary).not.toContain('第二份原稿：')
  expect(t.db.prepare("SELECT count(*) n FROM assistant_project_commitments WHERE project_id=? AND json_extract(document,'$.phase')='work' AND output_message_id IS NOT NULL").get(project.id)!.n).toBe(2)
  expect(t.s.projectedMessage(first.result.messageId).text).toContain('第二份原稿：')
  expect((await t.call('chatProjectNotice',null,{id:t.own.conversation.id,messageId:final.result.messageId})).value.data.kind).toBe('result')
  expect(final.result.accepted).toBe(false)
  expect(t.db.prepare("SELECT count(*) n FROM assistant_project_events WHERE project_id=? AND kind='owner_revision'").get(project.id)!.n).toBe(1)
 })

 it('settles a deleted running specialist once and keeps another project dispatchable',async()=>{
  const t=await fixture(),first=t.create()
  expect(await t.tick()).toBe(true)
  expect((await t.call('deletePersonalAgent',{expectedVersion:t.specialist.profile.version},{id:t.specialist.id})).status).toBe(200)
  const next=(await t.call('agentChatMessage',{text:'请持续跟进这次计划，另行整理下一份原稿。'},{id:t.own.conversation.id})).value.data
  await new ChatWorker(t.db,t.config,async()=>({text:'收到。',failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})).tick()
  const second=transaction(t.db,()=>createAssistantProject(t.s,{...t.input,title:'独立后续项目',commitments:[{...t.input.commitments[0]!,contactId:t.own.agent.id}]},{turnId:next.turn.id,messageId:next.message.id,conversationId:t.own.conversation.id},t.now()))
  t.advance()
  expect(await t.tick()).toBe(true)
  for(let i=0;i<5;i++)await t.tick()
  expect(assistantProject(t.s,first.id).commitments[0]).toMatchObject({status:'blocked',failure:'AUTHORITY_CHANGED',outputMessageId:null})
  expect(assistantProject(t.s,second.id).commitments[0]!.status).toBe('running')
  expect(t.db.prepare("SELECT count(*) n FROM assistant_project_events WHERE project_id=? AND event_key LIKE 'blocked:%'").get(first.id)!.n).toBe(1)
 })

 it('passes the checked corrected output into the downstream writing commitment without another owner prompt',async()=>{
  const t=await fixture(),project=transaction(t.db,()=>createAssistantProject(t.s,{...t.input,commitments:[t.input.commitments[0],{...t.input.commitments[0],title:'写最终说明',instructions:'根据前序核对产出写最终说明。'}]},{turnId:t.source.turn.id,messageId:t.source.message.id,conversationId:t.own.conversation.id},t.now()))
  await t.tick()
  const outputs=['旧稿遗漏了原因。',JSON.stringify({assessment:'revise',summary:'原稿已提供变更原因，应补齐。',instructions:'补齐实际原因：旧方法不能分辨早期变化。',question:null}),'修正后的真实内容：旧方法不能分辨早期变化。',JSON.stringify({assessment:'ready',summary:'原因已经补齐并核对。',instructions:null,question:null})]
  for(const text of outputs){await new ChatWorker(t.db,t.config,async()=>({text,failure:null,inputTokens:100,outputTokens:100,elapsedMs:10})).tick();t.advance();await t.tick();await t.tick()}
  let called=false
  await new ChatWorker(t.db,t.config,async model=>{called=true;const payload=JSON.parse(model.prompt);expect(payload.instruction).toContain('修正后的真实内容：旧方法不能分辨早期变化。');expect(payload.instruction).not.toContain('旧稿遗漏了原因。');return {text:'基于已核对的变更原因写成最终说明。',failure:null,inputTokens:100,outputTokens:100,elapsedMs:10}}).tick()
  expect(called).toBe(true)
  expect(assistantProject(t.s,project.id).commitments.filter(c=>c.phase==='work')).toHaveLength(2)
 })

 it('does not let an unrelated waiting-input conversation prevent dispatch and binds owner decisions to one exact blocked item',async()=>{
  const t=await fixture(),project=t.create()
  const other=(await t.call('createPersonalAgent',{displayName:'其他合成助理',introduction:'提供建议。',capabilityDescription:'另一个独立任务。',personality:'直接。'})).value.data
  const direct=(await t.call('createDirectConversation',{contactId:other.id})).value.data
  const pending=(await t.call('agentChatMessage',{text:'独立任务等待输入'},{id:direct.id})).value.data
  const pendingRow=t.db.prepare('SELECT * FROM chat_turns WHERE id=?').get(pending.turn.id)!,turn=t.s.materializedTurn(pendingRow);turn.status='waiting_input';t.s.saveTurn(turn)
  expect(await t.tick()).toBe(true)
  const commitment=assistantProject(t.s,project.id).commitments[0]!
  expect(commitment.status).toBe('running')
  expect(()=>transaction(t.db,()=>resolveAssistantProjectDecision(t.s,project.id,{turnId:t.source.turn.id,messageId:t.source.message.id},{commitmentId:randomUUID(),instructions:'改为B',authorizationEvidence:'请持续跟进这次计划'}))).toThrow('INVALID_STATE')
 })
})

it('migrates the deployed 039 schema twice while preserving every old table and migration record',()=>{
 const folder=mkdtempSync(join(tmpdir(),'assistant-project-upgrade-039-'));cleanup.push(()=>rmSync(folder,{recursive:true,force:true}))
 const db=openDatabase(join(folder,'db.sqlite'),true);cleanup.push(()=>db.close())
 db.exec('PRAGMA foreign_keys=OFF; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT')
 const root=new URL('../migrations/',import.meta.url),files=readdirSync(root).filter(name=>/^\d{3}-/.test(name)&&Number(name.slice(0,3))<=39).sort()
 expect(files).toHaveLength(39)
 for(const name of files){const sql=readFileSync(new URL(name,root),'utf8');db.exec(sql);db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(Number(name.slice(0,3)),createHash('sha256').update(sql).digest('hex'),'2026-11-16T00:00:00Z')}
 db.exec('PRAGMA foreign_keys=ON');seed(db,'test')
 db.prepare('INSERT INTO runtime_meta VALUES(?,?)').run('signing_key','synthetic-preserved-key')
 db.prepare('INSERT INTO personal_memory_settings VALUES(?,?,?,?,?)').run('member_A',1,'Asia/Shanghai',null,4)
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row=>String(row.name))
 const snapshot=()=>Object.fromEntries(tables.map(name=>[name,createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all())).digest('hex')]))
 const before=snapshot();migrate(db);migrate(db);checkDatabase(db)
 const after=snapshot();delete before.schema_migrations;delete after.schema_migrations
 expect(after).toEqual(before)
 expect(db.prepare('SELECT count(*) n FROM schema_migrations WHERE version<=39 AND applied_at=?').get('2026-11-16T00:00:00Z')!.n).toBe(39)
 expect(db.prepare('SELECT max(version) n FROM schema_migrations').get()!.n).toBe(42)
 expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
},20000)
