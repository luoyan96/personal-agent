import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { PersonalFollowup,PersonalFollowupInput,PersonalFollowupRun,type ChatMessage,type Conversation } from '@research-agent-platform/contracts'
import { ChatService,legacyChatMessage,type ChatRequest,type TurnInput } from './chat.js'
import { memorySettings } from './personal-memories.js'
import { serviceFor } from './execution-worker.js'
import { transaction } from './database.js'
import { fail } from './errors.js'
import type { Config } from './config.js'
import { reminderRequest,displayReminderTime } from './personal-time.js'
import { nextRecurring,scheduledRequest,recurrenceLabel } from './recurring-time.js'
import { abortChatCall } from './continuous-chat.js'

type Quiet={start:string;end:string}|null
type FollowupInput=ReturnType<typeof PersonalFollowupInput.parse>
function minutes(value:string){const [h,m]=value.split(':').map(Number);return h!*60+m!}
function zonedMinute(at:number,zone:string){const parts=new Intl.DateTimeFormat('en',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);return Number(parts.find(p=>p.type==='hour')!.value)*60+Number(parts.find(p=>p.type==='minute')!.value)}
export function outsideQuiet(at:number,zone:string,quiet:Quiet){if(!quiet)return new Date(at).toISOString();const start=minutes(quiet.start),end=minutes(quiet.end),inside=(minute:number)=>start<end?minute>=start&&minute<end:minute>=start||minute<end;let candidate=at;for(let i=0;i<=1500;i++){if(!inside(zonedMinute(candidate,zone)))return new Date(candidate).toISOString();candidate=Math.floor(candidate/60000)*60000+60000}throw new Error('QUIET_WINDOW_INVALID')}
function delivery(s:ChatService,messageId:string|null):PersonalFollowup['delivery']{
 if(!messageId)return 'scheduled'
 const status=s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(messageId)?.status
 return status==='sent'||status==='mirrored'?'im_sent':status==='uncertain'?'im_uncertain':status==='denied'?'im_denied':'recorded'
}
function projectRun(s:ChatService,row:Record<string,unknown>){
 let turn:ReturnType<ChatService['turn']>|null=null,unreadable=false
 try{turn=row.turn_id?s.turn(String(row.turn_id)):null}catch{unreadable=true}
 const outputMessageId=turn?.outputMessageId??(row.notification_id?String(row.notification_id):null)
 const messageId=row.message_id?String(row.message_id):null
 return PersonalFollowupRun.parse({id:row.id,scheduledAt:row.scheduled_at,messageId,turnId:row.turn_id??null,outputMessageId,status:unreadable?'cancelled':turn?.status??(row.failure?'skipped':'recorded'),failure:unreadable?'AUTHORITY_CHANGED':turn?.failure??row.failure??null,delivery:delivery(s,outputMessageId??messageId)})
}
export function followup(s:ChatService,id:string,now=Date.now()){
 const row=s.db.prepare('SELECT * FROM personal_followups WHERE id=? AND member_id=?').get(id,s.c.actor.id);if(!row)fail('NOT_FOUND')
 const value=PersonalFollowup.parse(JSON.parse(String(row.document)))
 value.status=row.status as PersonalFollowup['status'];value.version=Number(row.version);value.updatedAt=String(row.updated_at);value.dueAt=String(row.due_at);value.nextDeliveryAt=String(row.next_at)
 if(value.task){try{s.c.task(value.task.id)}catch{value.task=null}}
 const last=s.db.prepare('SELECT * FROM personal_followup_runs WHERE followup_id=? ORDER BY scheduled_at DESC,id DESC LIMIT 1').get(id)
 value.lastRun=last?projectRun(s,last):null
 value.messageId=value.lastRun?.outputMessageId??value.lastRun?.messageId??(row.fired_message_id?String(row.fired_message_id):null)
 value.delivery=value.messageId?delivery(s,value.messageId):value.status==='active'&&Date.parse(value.nextDeliveryAt)<=now?'due':'scheduled'
 const editable=!row.fired_message_id||!!value.recurrence
 value.allowedActions=['completed','cancelled'].includes(value.status)?[]:value.status==='paused'?['resume','complete','cancel',...(editable?['edit' as const]:[])]:['pause','complete','cancel',...(editable?['edit' as const]:[])]
 return value
}
function checkTask(s:ChatService,value:FollowupInput){
 if(value.task){const task=s.c.task(value.task.id);s.c.checkVersion(task.version,value.task.version);if(['completed','cancelled'].includes(task.status))fail('INVALID_STATE')}
}
function ownAgent(s:ChatService,id:string){
 const contact=s.contact(id)
 if(contact.identity.kind!=='personal_agent'||contact.identity.ownerMemberId!==s.c.actor.id||contact.agentRuntime||s.db.prepare('SELECT configured FROM agent_connections WHERE contact_id=?').get(id)?.configured===1)fail('FORBIDDEN')
 return contact
}
function scheduleConversation(s:ChatService,value:FollowupInput,conversationId?:string):Conversation {
 if(value.execution){ownAgent(s,value.execution.contactId);return (s.handle('createDirectConversation',{params:{},query:{},headers:{},body:{contactId:value.execution.contactId}}) as {data:Conversation}).data}
 const group=conversationId?s.conversation(conversationId,false):(s.handle('personalConversation',{params:{},query:{},headers:{},body:{}}) as {data:{conversation:Conversation}}).data.conversation
 if(!['personal','direct'].includes(group.kind)||group.ownerMemberId!==s.c.actor.id)fail('FORBIDDEN')
 const agent=group.members.find(m=>m.status==='joined'&&s.contact(m.contactId).identity.kind==='personal_agent');if(!agent)fail('FORBIDDEN');ownAgent(s,agent.contactId)
 return group
}
function validateTime(value:FollowupInput,now:number){
 if(Date.parse(value.dueAt)<=now||Date.parse(value.dueAt)>now+3*366*86400000)fail('VALIDATION_ERROR')
 if(value.recurrence?.frequency==='weekly'){
  const day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(new Intl.DateTimeFormat('en',{timeZone:value.timeZone,weekday:'short'}).format(Date.parse(value.dueAt)))||7
  if(!value.recurrence.weekdays.includes(day))fail('VALIDATION_ERROR')
 }
}
export function createFollowup(s:ChatService,input:unknown,conversationId?:string,now=Date.now()){
 const b=PersonalFollowupInput.parse(input);validateTime(b,now);checkTask(s,b)
 b.dueAt=new Date(b.dueAt).toISOString()
 if(Number(s.db.prepare("SELECT count(*) n FROM personal_followups WHERE member_id=? AND status IN ('active','paused') AND (fired_message_id IS NULL OR json_extract(document,'$.recurrence') IS NOT NULL)").get(s.c.actor.id)!.n)>=50)fail('RATE_LIMITED')
 const group=scheduleConversation(s,b,conversationId),at=new Date(now).toISOString()
 const value=PersonalFollowup.parse({id:randomUUID(),...b,status:'active',nextDeliveryAt:outsideQuiet(Date.parse(b.dueAt),b.timeZone,b.quietHours),messageId:null,delivery:'scheduled',version:1,createdAt:at,updatedAt:at,allowedActions:[]})
 s.db.prepare('INSERT INTO personal_followups VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(value.id,s.c.actor.id,group.id,'active',1,value.dueAt,value.nextDeliveryAt,null,JSON.stringify(value),at,at)
 return followup(s,value.id,now)
}
function fenceExecutions(s:ChatService,id:string){
 for(const row of s.db.prepare("SELECT t.* FROM chat_turns t JOIN personal_followup_runs r ON r.turn_id=t.id WHERE r.followup_id=? AND t.owner_id=? AND t.status IN ('queued','running','waiting_input')").all(id,s.c.actor.id)){
  const turn=s.materializedTurn(row);abortChatCall(turn.id);turn.status='cancelled';turn.failure=null;turn.version++;turn.updatedAt=new Date().toISOString();s.saveTurn(turn)
  s.db.prepare('UPDATE chat_turns SET fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE id=?').run(turn.id)
 }
}
export function handleFollowup(s:ChatService,name:string,req:ChatRequest):unknown{
 if(name==='personalFollowups'){const ids=s.db.prepare("SELECT id FROM personal_followups WHERE member_id=? AND (?='all' OR status=?) ORDER BY next_at,id").all(s.c.actor.id,req.query.status??'all',req.query.status??'all').map(row=>String(row.id));return s.page(name,req.query,ids,id=>{const value=followup(s,id);if(req.query.status!=='all'&&value.status!==req.query.status)fail('NOT_FOUND');return value})}
 if(name==='personalFollowupRuns'){
  followup(s,req.params.id!);const ids=s.db.prepare('SELECT id FROM personal_followup_runs WHERE followup_id=? ORDER BY scheduled_at DESC,id DESC').all(req.params.id!).map(row=>String(row.id))
  return s.page(name,{...req.query,search:req.params.id},ids,id=>projectRun(s,s.db.prepare('SELECT * FROM personal_followup_runs WHERE id=? AND followup_id=?').get(id,req.params.id!)!))
 }
 if(name==='personalFollowup')return {data:followup(s,req.params.id!)}
 if(name==='createPersonalFollowup')return {data:createFollowup(s,req.body)}
 if(name==='updatePersonalFollowup'){
  const old=followup(s,req.params.id!),b=req.body as {expectedVersion:number};s.c.checkVersion(old.version,b.expectedVersion);if(!old.allowedActions.includes('edit'))fail('INVALID_STATE')
  const {expectedVersion:_,...raw}=req.body as Record<string,unknown>,body=PersonalFollowupInput.parse(raw);validateTime(body,Date.now());checkTask(s,body)
  body.dueAt=new Date(body.dueAt).toISOString()
  const group=scheduleConversation(s,body),next=outsideQuiet(Date.parse(body.dueAt),body.timeZone,body.quietHours),at=new Date().toISOString(),value={...old,...body,version:old.version+1,updatedAt:at,nextDeliveryAt:next,allowedActions:[]}
  fenceExecutions(s,old.id)
  s.db.prepare('UPDATE personal_followups SET conversation_id=?,due_at=?,next_at=?,fired_message_id=NULL,version=version+1,document=?,updated_at=? WHERE id=?').run(group.id,body.dueAt,next,JSON.stringify(value),at,old.id);return {data:followup(s,old.id)}
 }
 if(name==='changePersonalFollowup'){
  const old=followup(s,req.params.id!),b=req.body as {expectedVersion:number;action:'pause'|'resume'|'complete'|'cancel'};s.c.checkVersion(old.version,b.expectedVersion);if(!old.allowedActions.includes(b.action))fail('INVALID_STATE')
  const status={pause:'paused',resume:'active',complete:'completed',cancel:'cancelled'}[b.action]
  const due=b.action==='resume'&&old.recurrence?new Date(nextRecurring(Date.parse(old.dueAt),old.timeZone,old.recurrence,Date.now())).toISOString():old.dueAt
  const next=b.action==='resume'?outsideQuiet(Math.max(Date.now(),Date.parse(due)),old.timeZone,old.quietHours):old.nextDeliveryAt
  if(b.action!=='resume')fenceExecutions(s,old.id)
  s.db.prepare('UPDATE personal_followups SET status=?,due_at=?,next_at=?,version=version+1,updated_at=? WHERE id=?').run(status,due,next,new Date().toISOString(),old.id)
  if(old.messageId&&['complete','cancel'].includes(b.action))s.db.prepare("UPDATE im_message_outbox SET status='denied' WHERE message_id=? AND status='pending'").run(old.messageId)
  return {data:followup(s,old.id)}
 }
 return undefined
}
export function followupCommand(s:ChatService,text:string,message:ChatMessage){
 const value=text.trim()
 if(!/^(?:(?:请)?(?:提醒我|帮我提醒|跟进)|(?:请(?:你)?|帮我)?\s*(?:在\s*)?(?:今天|明天|后天|每天|每个?工作日|每周|每星期|\d{4}(?:年|-)))/.test(value)||/[?？]$/.test(value)||/[，,。;；]\s*(?:但|不过)?\s*(?:不要提醒|只是引用|只是举例)/.test(value))return null
 const settings=memorySettings(s),scheduled=scheduledRequest(value,settings.timeZone),matched=scheduled??(value.includes('提醒')||value.startsWith('跟进')?reminderRequest(value,settings.timeZone):null)
 if(!matched){if(!/提醒|跟进|^每/.test(value))return null;return {receipt:{operation:'clarify' as const,followupId:null,dueAt:null,timeZone:settings.timeZone,question:'请说明具体时点和事项，例如“每天上午九点提醒我交材料”或“每周五下午六点帮我总结本周聊天”；也可以在“定时任务”里设置。'},text:'请补充具体时点和事项；尚未创建定时任务。'}}
 const {due,body}=matched;if(due<=Date.now())return {receipt:{operation:'clarify' as const,followupId:null,dueAt:null,timeZone:settings.timeZone,question:'安排时间必须在未来，请重新说明日期和时点。'},text:'安排时间必须在未来；尚未创建定时任务。'}
 const group=s.conversation(message.conversationId,false),agent=group.members.find(m=>m.status==='joined'&&s.contact(m.contactId).identity.kind==='personal_agent')!
 const recurrence=scheduled?.recurrence??null,execution=scheduled?.execute?{kind:'agent' as const,contactId:agent.contactId,budget:{maxTokens:4000,maxSeconds:90}}:null
 const saved=createFollowup(s,{title:body.slice(0,200),body,dueAt:new Date(due).toISOString(),timeZone:settings.timeZone,quietHours:settings.quietHours,task:null,recurrence,execution},message.conversationId)
 return {receipt:{operation:'created' as const,followupId:saved.id,dueAt:saved.dueAt,timeZone:saved.timeZone,question:null},text:`已安排${recurrenceLabel(recurrence)}${execution?'任务':'提醒'}“${saved.title}”。首次时间 ${displayReminderTime(saved.dueAt,saved.timeZone)}（${saved.timeZone}），${execution?'到时由当前 Agent 执行并把结果发回聊天。每次最多4000 Token / 90秒，可在定时任务中暂停。':'到时发回这段聊天。'}`}
}

export class PersonalFollowupWorker {
 constructor(readonly db:DatabaseSync,readonly config:Config,readonly clock:()=>number=Date.now){}
 async tick(){return transaction(this.db,()=>{
  const now=this.clock(),at=new Date(now).toISOString()
  // Settle each finished run once; uncertain or failed model calls are not reissued.
  const settled=this.db.prepare("SELECT r.*,f.member_id,f.conversation_id,f.document FROM personal_followup_runs r JOIN personal_followups f ON f.id=r.followup_id JOIN chat_turns t ON t.id=r.turn_id WHERE r.finished_at IS NULL AND t.status IN ('succeeded','failed','unavailable','interrupted','cancelled','waiting_input') ORDER BY r.scheduled_at,r.id LIMIT 1").get()
  if(settled){
   let notification:string|null=null,authorized:{s:ChatService;turn:ReturnType<ChatService['turn']>;value:PersonalFollowup}|undefined
   try{const s=new ChatService(serviceFor(this.db,String(settled.member_id),this.config).c,this.config),turn=s.turn(String(settled.turn_id));ownAgent(s,turn.agentContactId);s.conversation(turn.conversationId,false);authorized={s,turn,value:PersonalFollowup.parse(JSON.parse(String(settled.document)))}}catch{/* Revoked authority must not send an unscoped notification. */}
   // Writes stay outside the authority catch, so a failed canonical write rolls
   // back settlement and can be retried without repeating the model call.
   if(authorized){const {s,turn,value}=authorized
    if(turn.status!=='succeeded'&&turn.status!=='cancelled')notification=s.message(turn.conversationId,{senderContactId:turn.agentContactId,origin:'service',text:`定时任务“${value.title}”${turn.status==='waiting_input'?'需要补充信息':'未完成'}：${turn.failure??'请查看本次回复'}。可在定时任务中查看记录。`,mentions:[],resources:[],actionIds:[],turnId:null}).id
    if(!value.recurrence)this.db.prepare("UPDATE personal_followups SET status='completed',version=version+1,updated_at=? WHERE id=? AND status='active'").run(at,settled.followup_id!)
   }
   this.db.prepare('UPDATE personal_followup_runs SET finished_at=?,notification_id=? WHERE id=?').run(at,notification,settled.id!);return true
  }
  const row=this.db.prepare("SELECT * FROM personal_followups WHERE status='active' AND fired_message_id IS NULL AND next_at<=? ORDER BY next_at,id LIMIT 1").get(at);if(!row)return false
  let s:ChatService
  try{s=new ChatService(serviceFor(this.db,String(row.member_id),this.config).c,this.config)}catch{this.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(at,row.id!);return true}
  const raw=PersonalFollowup.parse(JSON.parse(String(row.document))),value=followup(s,String(row.id),now)
  if(raw.task){try{const task=s.c.task(raw.task.id);if(['completed','cancelled'].includes(task.status)){this.db.prepare("UPDATE personal_followups SET status='completed',version=version+1,updated_at=? WHERE id=?").run(at,row.id!);fenceExecutions(s,String(row.id));return true}}catch{this.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(at,row.id!);fenceExecutions(s,String(row.id));return true}}
  const permitted=outsideQuiet(now,value.timeZone,value.quietHours);if(Date.parse(permitted)>now){this.db.prepare('UPDATE personal_followups SET next_at=? WHERE id=?').run(permitted,row.id!);return true}
  let group:Conversation,contact:ReturnType<typeof ownAgent>
  try{group=s.conversation(String(row.conversation_id),false);if(!['personal','direct'].includes(group.kind)||group.ownerMemberId!==s.c.actor.id)fail('FORBIDDEN');const agent=group.members.find(m=>m.status==='joined'&&s.contact(m.contactId).identity.kind==='personal_agent');if(!agent)fail('FORBIDDEN');contact=ownAgent(s,value.execution?.contactId??agent.contactId);s.joinedAgent(group,contact.id)}catch{this.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(at,row.id!);return true}
  const next=value.recurrence?new Date(nextRecurring(Date.parse(value.dueAt),value.timeZone,value.recurrence,Math.max(now,Date.parse(value.dueAt)))).toISOString():null
  const existing=this.db.prepare('SELECT id FROM personal_followup_runs WHERE followup_id=? AND scheduled_at=?').get(row.id!,value.dueAt)
  if(existing){if(next)this.db.prepare('UPDATE personal_followups SET due_at=?,next_at=?,version=version+1,updated_at=? WHERE id=?').run(next,outsideQuiet(Date.parse(next),value.timeZone,value.quietHours),at,row.id!);else this.db.prepare("UPDATE personal_followups SET status='completed',version=version+1,updated_at=? WHERE id=?").run(at,row.id!);return true}
  const runId=randomUUID()
  const busy=value.execution&&(Number(this.db.prepare("SELECT count(*) n FROM chat_turns WHERE owner_id=? AND status IN ('queued','running','waiting_input')").get(s.c.actor.id)!.n)>=5||this.db.prepare("SELECT id FROM chat_turns WHERE conversation_id=? AND owner_id=? AND status IN ('queued','running','waiting_input')").get(group.id,s.c.actor.id))
  const failure=value.execution?(busy?'AGENT_BUSY':contact.availability.status!=='available'?'MODEL_UNAVAILABLE':null):null
  const text=failure?`定时任务“${value.title}”本次未执行：${failure==='AGENT_BUSY'?'Agent 正在处理其他消息':'请在模型设置中启用可用模型'}。已保留运行记录。`:value.execution?`定时任务：${value.title}\n${value.body}`:`提醒：${value.title}\n${value.body}`
  const message=s.message(group.id,{senderContactId:contact.id,origin:'service',text,mentions:[],resources:value.task?[{kind:'task',ref:value.task}]:[],actionIds:[],turnId:null})
  let turnId:string|null=null
  if(value.execution&&!failure){
   const turn=s.newTurn(group,message,contact.id,{budget:value.execution.budget,context:[],conversationVersion:group.version,inputSequence:message.sequence,dailyChat:true,personalAssistant:true})
   turnId=turn.id;message.turnId=turn.id;this.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(legacyChatMessage(message)),message.id)
   const input=JSON.parse(String(this.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(turn.id)!.request_json)) as TurnInput
   input.scheduledFollowupId=value.id;input.scheduledRunId=runId;this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),turn.id)
  }
  this.db.prepare('INSERT INTO personal_followup_runs VALUES (?,?,?,?,?,?,?,?)').run(runId,value.id,value.dueAt,message.id,turnId,null,failure,turnId?null:at)
  this.db.prepare('UPDATE personal_followups SET due_at=?,next_at=?,fired_message_id=?,version=version+1,updated_at=? WHERE id=?').run(next??value.dueAt,next?outsideQuiet(Date.parse(next),value.timeZone,value.quietHours):value.nextDeliveryAt,next?null:message.id,at,value.id)
  if(failure&&!value.recurrence)this.db.prepare("UPDATE personal_followups SET status='completed' WHERE id=?").run(value.id)
  return true
 })}
}
