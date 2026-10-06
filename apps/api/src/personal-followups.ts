import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { PersonalFollowup,PersonalFollowupInput,type ChatMessage } from '@research-agent-platform/contracts'
import { ChatService,type ChatRequest } from './chat.js'
import { memorySettings } from './personal-memories.js'
import { serviceFor } from './execution-worker.js'
import { transaction } from './database.js'
import { fail } from './errors.js'
import type { Config } from './config.js'
import { reminderRequest,displayReminderTime } from './personal-time.js'
type Quiet={start:string;end:string}|null
function minutes(value:string){const [h,m]=value.split(':').map(Number);return h!*60+m!}
function zonedMinute(at:number,zone:string){const parts=new Intl.DateTimeFormat('en',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(at);return Number(parts.find(p=>p.type==='hour')!.value)*60+Number(parts.find(p=>p.type==='minute')!.value)}
export function outsideQuiet(at:number,zone:string,quiet:Quiet){if(!quiet)return new Date(at).toISOString();const start=minutes(quiet.start),end=minutes(quiet.end),inside=(minute:number)=>start<end?minute>=start&&minute<end:minute>=start||minute<end;let candidate=at;for(let i=0;i<=1500;i++){if(!inside(zonedMinute(candidate,zone)))return new Date(candidate).toISOString();candidate=Math.floor(candidate/60000)*60000+60000}throw new Error('QUIET_WINDOW_INVALID')}
export function followup(s:ChatService,id:string,now=Date.now()){
 const row=s.db.prepare('SELECT * FROM personal_followups WHERE id=? AND member_id=?').get(id,s.c.actor.id);if(!row)fail('NOT_FOUND')
 const value=PersonalFollowup.parse(JSON.parse(String(row.document)));value.status=row.status as PersonalFollowup['status'];value.version=Number(row.version);value.updatedAt=String(row.updated_at);value.nextDeliveryAt=String(row.next_at);value.messageId=row.fired_message_id?String(row.fired_message_id):null
 if(value.task){try{s.c.task(value.task.id)}catch{value.task=null}}
 value.delivery=value.messageId?'recorded':value.status==='active'&&Date.parse(value.nextDeliveryAt)<=now?'due':'scheduled'
 if(value.messageId){const status=s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(value.messageId)?.status;value.delivery=status==='sent'||status==='mirrored'?'im_sent':status==='uncertain'?'im_uncertain':status==='denied'?'im_denied':'recorded'}
 value.allowedActions=['completed','cancelled'].includes(value.status)?[]:value.status==='paused'?['resume','complete','cancel',...(value.messageId?[]:['edit' as const])]:['pause','complete','cancel',...(value.messageId?[]:['edit' as const])]
 return value
}
export function createFollowup(s:ChatService,input:unknown,conversationId?:string,now=Date.now()){
 const b=PersonalFollowupInput.parse(input);if(Date.parse(b.dueAt)<=now||Date.parse(b.dueAt)>now+3*366*86400000)fail('VALIDATION_ERROR')
 if(b.task){const task=s.c.task(b.task.id);s.c.checkVersion(task.version,b.task.version);if(['completed','cancelled'].includes(task.status))fail('INVALID_STATE')}
 if(Number(s.db.prepare("SELECT count(*) n FROM personal_followups WHERE member_id=? AND status IN ('active','paused') AND fired_message_id IS NULL").get(s.c.actor.id)!.n)>=50)fail('RATE_LIMITED')
 const group=conversationId?s.conversation(conversationId,false):(s.handle('personalConversation',{params:{},query:{},headers:{},body:{}}) as {data:{conversation:{id:string}}}).data.conversation
 const at=new Date(now).toISOString(),value=PersonalFollowup.parse({id:randomUUID(),...b,status:'active',nextDeliveryAt:outsideQuiet(Date.parse(b.dueAt),b.timeZone,b.quietHours),messageId:null,delivery:'scheduled',version:1,createdAt:at,updatedAt:at,allowedActions:[]})
 s.db.prepare('INSERT INTO personal_followups VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(value.id,s.c.actor.id,group.id,'active',1,value.dueAt,value.nextDeliveryAt,null,JSON.stringify(value),at,at)
 return followup(s,value.id,now)
}
export function handleFollowup(s:ChatService,name:string,req:ChatRequest):unknown{
 if(name==='personalFollowups'){const ids=s.db.prepare("SELECT id FROM personal_followups WHERE member_id=? AND (?='all' OR status=?) ORDER BY next_at,id").all(s.c.actor.id,req.query.status??'all',req.query.status??'all').map(row=>String(row.id));return s.page(name,req.query,ids,id=>{const value=followup(s,id);if(req.query.status!=='all'&&value.status!==req.query.status)fail('NOT_FOUND');return value})}
 if(name==='personalFollowup')return {data:followup(s,req.params.id!)}
 if(name==='createPersonalFollowup')return {data:createFollowup(s,req.body)}
 if(name==='updatePersonalFollowup'){
  const old=followup(s,req.params.id!),b=req.body as {expectedVersion:number};s.c.checkVersion(old.version,b.expectedVersion);if(old.messageId||['completed','cancelled'].includes(old.status))fail('INVALID_STATE')
  const {expectedVersion:_,...raw}=req.body as Record<string,unknown>,body=PersonalFollowupInput.parse(raw);if(Date.parse(body.dueAt)<=Date.now()||Date.parse(body.dueAt)>Date.now()+3*366*86400000)fail('VALIDATION_ERROR');if(body.task){const task=s.c.task(body.task.id);s.c.checkVersion(task.version,body.task.version);if(['completed','cancelled'].includes(task.status))fail('INVALID_STATE')}
  const next=outsideQuiet(Date.parse(body.dueAt),body.timeZone,body.quietHours),at=new Date().toISOString(),value={...old,...body,version:old.version+1,updatedAt:at,nextDeliveryAt:next,allowedActions:[]}
  s.db.prepare('UPDATE personal_followups SET due_at=?,next_at=?,version=version+1,document=?,updated_at=? WHERE id=?').run(body.dueAt,next,JSON.stringify(value),at,old.id);return {data:followup(s,old.id)}
 }
 if(name==='changePersonalFollowup'){
  const old=followup(s,req.params.id!),b=req.body as {expectedVersion:number;action:'pause'|'resume'|'complete'|'cancel'};s.c.checkVersion(old.version,b.expectedVersion);if(!old.allowedActions.includes(b.action))fail('INVALID_STATE')
  const status={pause:'paused',resume:'active',complete:'completed',cancel:'cancelled'}[b.action],next=b.action==='resume'?outsideQuiet(Math.max(Date.now(),Date.parse(old.dueAt)),old.timeZone,old.quietHours):old.nextDeliveryAt
  s.db.prepare('UPDATE personal_followups SET status=?,next_at=?,version=version+1,updated_at=? WHERE id=?').run(status,next,new Date().toISOString(),old.id)
  if(old.messageId&&['complete','cancel'].includes(b.action))s.db.prepare("UPDATE im_message_outbox SET status='denied' WHERE message_id=? AND status='pending'").run(old.messageId)
  return {data:followup(s,old.id)}
 }
 return undefined
}
export function followupCommand(s:ChatService,text:string,message:ChatMessage){
 const value=text.trim();if(!/^(?:(?:请)?(?:提醒我|帮我提醒|跟进)|(?:在\s*)?(?:今天|明天|后天|\d{4}(?:年|-)).{0,30}提醒我)/.test(value)||/[?？]$/.test(value)||/[，,。;；]\s*(?:但)?(?:不要提醒|只是引用|只是举例)/.test(value))return null
 const settings=memorySettings(s),matched=reminderRequest(value,settings.timeZone)
 if(!matched)return {receipt:{operation:'clarify' as const,followupId:null,dueAt:null,timeZone:settings.timeZone,question:'请说明日期和具体时点，例如“明天上午九点提醒我提交材料”；也可以在“跟进”里选择时间。夏令时重复或不存在的时点请另选。'},text:'请说明提醒的日期和具体时点，或在“跟进”里选择时间；尚未创建提醒。'}
 const {due,body}=matched;if(due<=Date.now())return {receipt:{operation:'clarify' as const,followupId:null,dueAt:null,timeZone:settings.timeZone,question:'提醒时间必须在未来，请重新说明日期和时点。'},text:'提醒时间必须在未来；尚未创建提醒。'}
 const saved=createFollowup(s,{title:body.slice(0,200),body,dueAt:new Date(due).toISOString(),timeZone:settings.timeZone,quietHours:settings.quietHours,task:null},message.conversationId)
 return {receipt:{operation:'created' as const,followupId:saved.id,dueAt:saved.dueAt,timeZone:saved.timeZone,question:null},text:`已保存一次性提醒“${saved.title}”，时间 ${displayReminderTime(saved.dueAt,saved.timeZone)}（${saved.timeZone}）；到期写入本人的聊天，IM 送达另行记录。`}
}
export class PersonalFollowupWorker {
 constructor(readonly db:DatabaseSync,readonly config:Config,readonly clock:()=>number=Date.now){}
 async tick(){return transaction(this.db,()=>{
  const now=this.clock(),row=this.db.prepare("SELECT * FROM personal_followups WHERE status='active' AND fired_message_id IS NULL AND next_at<=? ORDER BY next_at,id LIMIT 1").get(new Date(now).toISOString());if(!row)return false
  let s:ChatService
  try{s=new ChatService(serviceFor(this.db,String(row.member_id),this.config).c,this.config)}catch{this.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(new Date(now).toISOString(),row.id!);return true}
  const value=followup(s,String(row.id),now)
  if(value.task){try{const task=s.c.task(value.task.id);if(['completed','cancelled'].includes(task.status)){this.db.prepare("UPDATE personal_followups SET status='completed',version=version+1,updated_at=? WHERE id=?").run(new Date(now).toISOString(),row.id!);return true}}catch{this.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(new Date(now).toISOString(),row.id!);return true}}
  // A lost task ACL must stop delivery, not turn the task-linked reminder into
  // an unscoped reminder through the public projection's task=null filtering.
  const raw=JSON.parse(String(row.document));if(raw.task&&!value.task){this.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(new Date(now).toISOString(),row.id!);return true}
  const permitted=outsideQuiet(now,value.timeZone,value.quietHours);if(Date.parse(permitted)>now){this.db.prepare('UPDATE personal_followups SET next_at=? WHERE id=?').run(permitted,row.id!);return true}
  let group
  try{group=s.conversation(String(row.conversation_id),false)}catch{this.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(new Date(now).toISOString(),row.id!);return true}
  if(!['personal','direct'].includes(group.kind)||group.ownerMemberId!==s.c.actor.id)fail('FORBIDDEN')
  const agent=group.members.find(m=>m.status==='joined'&&s.contact(m.contactId).identity.kind==='personal_agent'),contact=agent?s.contact(agent.contactId):null
  if(!contact||contact.identity.kind!=='personal_agent'||contact.identity.ownerMemberId!==s.c.actor.id||contact.agentRuntime){this.db.prepare("UPDATE personal_followups SET status='cancelled',version=version+1,updated_at=? WHERE id=?").run(new Date(now).toISOString(),row.id!);return true}
  const message=s.message(group.id,{senderContactId:contact.id,origin:'service',text:`提醒：${value.title}\n${value.body}`,mentions:[],resources:value.task?[{kind:'task',ref:value.task}]:[],actionIds:[],turnId:null})
  this.db.prepare('UPDATE personal_followups SET fired_message_id=?,version=version+1,updated_at=? WHERE id=? AND fired_message_id IS NULL').run(message.id,new Date(now).toISOString(),row.id!)
  return true
 })}
}

