import {randomUUID} from 'node:crypto'
import type {SQLOutputValue} from 'node:sqlite'
import {PersonalWorkTask,WorkbenchCard,CapabilityPublication,workspaceRoutes,type Conversation,type Contact,type RequestFor} from '@research-agent-platform/contracts'
import type {ChatService,ChatRequest,TurnInput} from './chat.js'
import {legacyChatMessage} from './chat.js'
import {instant} from './ai.js'
import {fail} from './errors.js'
import {hash} from './auth.js'
import {followup} from './personal-followups.js'
import {abortChatCall} from './continuous-chat.js'

type StoredWork={title:string;goal:string;contactIds:string[];agentContactId:string|null;sourceConversationId:string|null;sourceMessageId:string|null;messageId:string|null;turnId:string|null;resultMessageId:string|null;acceptedMessageId:string|null}
const decode=(value:unknown)=>JSON.parse(String(value))
export const workspaceCommands=Object.keys(workspaceRoutes)
export function isSocialGroup(s:ChatService,id:string){return !!s.db.prepare('SELECT 1 FROM social_groups WHERE conversation_id=?').get(id)}
export function socialContactAllowed(s:ChatService,ownerId:string,id:string){
 const c=s.db.prepare('SELECT c.owner_id,c.kind,a.disabled FROM chat_contacts c JOIN auth_accounts a ON a.member_id=c.owner_id WHERE c.id=?').get(id)
 if(!c||c.disabled!==0||c.kind==='public_agent')return false
 if(c.owner_id===ownerId)return true
 return !!s.db.prepare(`SELECT 1 FROM chat_contact_requests r JOIN chat_contacts t ON t.id=r.target_contact_id WHERE r.status='accepted' AND ((r.requester_id=? AND r.target_contact_id=?) OR (t.kind='human' AND r.decider_id=? AND r.requester_id=? AND ?='human'))`).get(ownerId,id,ownerId,c.owner_id!,c.kind!)
}
function person(s:ChatService,id:string,status:'invited'|'accepted'|'declined'|'revoked'='accepted'){
 const c=s.contact(id);return {contactId:id,displayName:c.displayName,kind:c.identity.kind==='human'?'human' as const:'agent' as const,status}
}
function workRow(s:ChatService,id:string){const row=s.db.prepare('SELECT * FROM personal_work_tasks WHERE id=?').get(id);if(!row)fail('NOT_FOUND');return row}
function viewerStatus(s:ChatService,row:Record<string,SQLOutputValue>){
 if(row.owner_id===s.c.actor.id)return 'owner'
 if(row.status==='proposed')fail('NOT_FOUND')
 const own=s.db.prepare('SELECT p.status FROM personal_work_participants p JOIN chat_contacts c ON c.id=p.contact_id WHERE p.task_id=? AND c.kind=\'human\' AND c.owner_id=?').get(row.id!,s.c.actor.id)
 if(!own||!socialContactAllowed(s,String(row.owner_id),s.human().id))fail('NOT_FOUND')
 if(row.conversation_id&&own.status==='accepted'){
  const member=s.db.prepare('SELECT status FROM chat_members WHERE conversation_id=? AND contact_id=?').get(String(row.conversation_id),s.human().id)
  if(!member||['revoked','declined'].includes(String(member.status)))fail('NOT_FOUND')
 }
 return String(own.status)
}
export function checkWorkTurn(s:ChatService,input:TurnInput,exact:boolean){
 if(!input.workTaskId)return
 const row=workRow(s,input.workTaskId),viewer=viewerStatus(s,row)
 if(!['owner','accepted'].includes(viewer))fail('FORBIDDEN')
 if(exact){if(row.status!=='active')fail('FORBIDDEN');s.c.checkVersion(Number(row.version),input.workTaskVersion!)}
}
export function socialWorkContext(s:ChatService,conversationId:string,agentContactId:string){
 const linked=s.db.prepare('SELECT task_id FROM social_groups WHERE conversation_id=?').get(conversationId);if(!linked?.task_id)return {}
 const row=workRow(s,String(linked.task_id)),viewer=viewerStatus(s,row)
 if(!['owner','accepted'].includes(viewer)||row.status!=='active')fail('FORBIDDEN')
 if(!s.db.prepare('SELECT 1 FROM personal_work_participants WHERE task_id=? AND contact_id=?').get(row.id!,agentContactId))fail('FORBIDDEN')
 const doc=decode(row.document) as StoredWork;doc.agentContactId=agentContactId;doc.resultMessageId=null;doc.acceptedMessageId=null;save(s,row,doc)
 return {workTaskId:String(row.id),workTaskVersion:Number(row.version)+1}
}
export function recordSocialWorkTurn(s:ChatService,taskId:string,messageId:string,turnId:string){
 const row=workRow(s,taskId),doc=decode(row.document) as StoredWork
 doc.messageId=messageId;doc.turnId=turnId;save(s,row,doc,false)
}
function save(s:ChatService,row:Record<string,SQLOutputValue>,doc:StoredWork,bump=true){
 s.db.prepare('UPDATE personal_work_tasks SET document=?,status=?,conversation_id=?,version=version+?,updated_at=? WHERE id=?').run(JSON.stringify(doc),row.status!,row.conversation_id??null,bump?1:0,instant(),row.id!)
}
function latestTurn(s:ChatService,doc:StoredWork){
 const message=doc.messageId?s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(doc.messageId):null
 const id=message?decode(message.document).turnId:doc.turnId
 const row=id?s.db.prepare('SELECT * FROM chat_turns WHERE id=?').get(id):null
 return row?s.materializedTurn(row):null
}
export function personalWork(s:ChatService,id:string):PersonalWorkTask{
 const row=workRow(s,id),viewer=viewerStatus(s,row),doc=decode(row.document) as StoredWork,full=['owner','accepted'].includes(viewer)
 const members=s.db.prepare('SELECT contact_id,status FROM personal_work_participants WHERE task_id=? ORDER BY contact_id').all(id).flatMap(p=>{
  try{let status=p.status as 'invited'|'accepted'|'declined'|'revoked';if(!socialContactAllowed(s,String(row.owner_id),String(p.contact_id)))status='revoked'
   const c=s.contact(String(p.contact_id));if(c.identity.kind!=='human'&&row.conversation_id){const m=s.db.prepare('SELECT status FROM chat_members WHERE conversation_id=? AND contact_id=?').get(row.conversation_id!,p.contact_id!);status=m?.status==='joined'?'accepted':m?.status==='declined'?'declined':status}
   return [person(s,String(p.contact_id),status)]
  }catch{return []}
 })
 const turn=full?latestTurn(s,doc):null
 let result:PersonalWorkTask['result']=null
 const resultId=doc.resultMessageId??turn?.outputMessageId
 if(full&&resultId){try{const message=s.projectedMessage(resultId);if(message.conversationId===row.conversation_id&&message.text)result={messageId:message.id,deliverableId:null,summary:message.text,accepted:doc.acceptedMessageId===message.id}}catch{/* revoke never discloses a cached result */}}
 const status:PersonalWorkTask['status']=row.status==='completed'?'completed':row.status==='cancelled'?'cancelled':row.status==='proposed'?'proposed':result?'awaiting_review':turn&&['queued','running'].includes(turn.status)?'running':turn&&['unavailable','failed','interrupted','cancelled'].includes(turn.status)?'blocked':'ready'
 const actions:PersonalWorkTask['allowedActions']=[]
 if(row.status==='proposed'&&viewer==='owner')actions.push('activate','cancel')
 if(row.status==='active'){
  if(viewer==='invited')actions.push('accept','decline')
  if(full){actions.push('submit');if(status!=='running')actions.push('run');if(viewer==='owner'){if(row.conversation_id&&isSocialGroup(s,String(row.conversation_id)))actions.push('invite');actions.push('cancel');if(result)actions.push('review')}}
 }
 return PersonalWorkTask.parse({id,title:doc.title,goal:full?doc.goal:null,owner:person(s,s.human(String(row.owner_id)).id),participants:members,status,summaryOnly:!full,conversationId:full?row.conversation_id:null,sourceConversationId:viewer==='owner'?doc.sourceConversationId:null,sourceMessageId:viewer==='owner'?doc.sourceMessageId:null,agentContactId:full?doc.agentContactId:null,turnId:full?turn?.id??null:null,result,version:row.version,createdAt:row.created_at,updatedAt:turn&&turn.updatedAt>String(row.updated_at)?turn.updatedAt:row.updated_at,allowedActions:actions})
}
function validateContacts(s:ChatService,ids:string[]){
 if(new Set(ids).size!==ids.length)fail('VALIDATION_ERROR')
 for(const id of ids){const c=s.contact(id);if(c.identity.kind==='public_agent'||!socialContactAllowed(s,s.c.actor.id,id))fail('FORBIDDEN')}
}
export function createWork(s:ChatService,body:RequestFor<'createPersonalWorkTask'>['body'],source?:{turnId:string;conversationId:string;messageId:string}){
 validateContacts(s,body.contactIds)
 if(body.agentContactId&&!body.contactIds.includes(body.agentContactId))fail('VALIDATION_ERROR')
 if(body.agentContactId&&s.contact(body.agentContactId).identity.kind==='human')fail('VALIDATION_ERROR')
 if(source){const old=s.db.prepare('SELECT id FROM personal_work_tasks WHERE source_turn_id=? AND owner_id=?').get(source.turnId,s.c.actor.id);if(old)return personalWork(s,String(old.id))}
 const id=randomUUID(),at=instant(),doc:StoredWork={title:body.title,goal:body.goal,contactIds:body.contactIds,agentContactId:body.agentContactId??null,sourceConversationId:source?.conversationId??null,sourceMessageId:source?.messageId??null,messageId:null,turnId:null,resultMessageId:null,acceptedMessageId:null}
 s.db.prepare('INSERT INTO personal_work_tasks VALUES (?,?,?,?,?,?,?,?,?)').run(id,s.c.actor.id,'proposed',source?.turnId??null,null,1,at,at,JSON.stringify(doc))
 for(const contactId of new Set([s.human().id,...body.contactIds]))s.db.prepare('INSERT INTO personal_work_participants VALUES (?,?,?)').run(id,contactId,contactId===s.human().id?'accepted':'invited')
 return personalWork(s,id)
}
export function recordDelegateWork(s:ChatService,parentId:string,receipt:{contactId:string;conversationId:string;messageId:string;turnId:string},goal:string){
 const parent=s.db.prepare('SELECT document FROM chat_turns WHERE id=?').get(parentId)!,input=decode(parent.document)
 const work=createWork(s,{title:goal.slice(0,100),goal,contactIds:[receipt.contactId],agentContactId:receipt.contactId},{turnId:parentId,conversationId:input.conversationId,messageId:input.inputMessageId})
 const row=workRow(s,work.id),doc=decode(row.document) as StoredWork
 row.status='active';row.conversation_id=receipt.conversationId;doc.messageId=receipt.messageId;doc.turnId=receipt.turnId;save(s,row,doc)
 s.db.prepare("UPDATE personal_work_participants SET status='accepted' WHERE task_id=?").run(work.id)
 const child=s.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(receipt.turnId)!,request=decode(child.request_json);request.workTaskId=work.id;request.workTaskVersion=work.version+1;s.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(request),receipt.turnId)
}
export function recordAssistantAnswerWork(s:ChatService,turnId:string,conversationId:string,agentContactId:string,goal:string,resultMessageId:string){
 const turn=s.db.prepare('SELECT document FROM chat_turns WHERE id=?').get(turnId)!,source=decode(turn.document)
 const work=createWork(s,{title:goal.slice(0,100),goal,contactIds:[agentContactId],agentContactId},{turnId,conversationId,messageId:source.inputMessageId})
 const row=workRow(s,work.id),doc=decode(row.document) as StoredWork;row.status='active';row.conversation_id=conversationId;doc.messageId=source.inputMessageId;doc.turnId=turnId;doc.resultMessageId=resultMessageId;save(s,row,doc)
 s.db.prepare("UPDATE personal_work_participants SET status='accepted' WHERE task_id=?").run(work.id)
 return {kind:'work_task' as const,taskId:work.id,conversationId,status:'ready' as const}
}
export function publication(s:ChatService,id:string){
 const row=s.db.prepare('SELECT * FROM capability_publications WHERE id=?').get(id);if(!row||row.status!=='published'&&row.owner_id!==s.c.actor.id)fail('NOT_FOUND')
 const contact=s.contact(String(row.contact_id)),doc=decode(row.document)
 // Explicit publication is a snapshot of public role facts; live identity,
 // relationship, runtime origin and actions never come from the stored snapshot.
 contact.displayName=doc.profile.displayName
 contact.profile={...contact.profile,...doc.profile,displayName:undefined} as Contact['profile']
 delete (contact.profile as unknown as {displayName?:unknown}).displayName
 return CapabilityPublication.parse({id,contactId:contact.id,status:row.status,contact,tags:doc.tags,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,allowedActions:row.owner_id===s.c.actor.id?row.status==='published'?['publish','withdraw']:['publish']:[]})
}
export function workspaceAuthorize(s:ChatService,name:string,req:ChatRequest){
 if(!workspaceCommands.includes(name))return false
 if(name==='capabilityPublication'||name==='withdrawCapability')publication(s,req.params.id!)
 else if(req.params.id)personalWork(s,req.params.id)
 return true
}
export function workspaceReplay(s:ChatService,name:string,previous:{data:{id:string}}){
 if(!workspaceCommands.includes(name))return null
 return {data:name==='publishCapability'||name==='withdrawCapability'?publication(s,previous.data.id):personalWork(s,previous.data.id)}
}
export function workspaceHandle(s:ChatService,name:string,req:ChatRequest):unknown{
 const id=req.params.id!,body=req.body as Record<string,unknown>
 if(name==='workbench'){
  const ids=[...s.db.prepare('SELECT id FROM tasks WHERE lab_id=? ORDER BY created_at DESC').all(s.c.actor.labId).map(r=>'research:'+r.id),...s.db.prepare(`SELECT DISTINCT t.id FROM personal_work_tasks t LEFT JOIN personal_work_participants p ON p.task_id=t.id LEFT JOIN chat_contacts c ON c.id=p.contact_id WHERE t.owner_id=? OR (c.kind='human' AND c.owner_id=?) ORDER BY t.updated_at DESC`).all(s.c.actor.id,s.c.actor.id).map(r=>'work:'+r.id),...s.db.prepare('SELECT id FROM personal_followups WHERE member_id=? ORDER BY updated_at DESC').all(s.c.actor.id).map(r=>'schedule:'+r.id)]
  const project=(key:string)=>{const value=card(s,key);if(value.status==='cancelled'||value.summaryOnly&&!value.allowedActions.length)fail('NOT_FOUND');if(req.query.category&&req.query.category!=='all'&&value.category!==req.query.category)fail('NOT_FOUND');return value}
  const filtered=ids.filter(key=>{try{project(key);return true}catch{return false}}).sort((a,b)=>card(s,b).updatedAt.localeCompare(card(s,a).updatedAt)||a.localeCompare(b))
  return s.page(name,req.query,filtered,project)
 }
 if(name==='capabilityPublications'){
  const project=(key:string)=>{const p=publication(s,key),owner=s.db.prepare('SELECT owner_id FROM capability_publications WHERE id=?').get(key)!.owner_id;if(req.query.view==='mine'?owner!==s.c.actor.id:p.status!=='published')fail('NOT_FOUND');if(req.query.kind&&req.query.kind!=='all'&&(p.contact.identity.kind==='human'?'human':'agent')!==req.query.kind)fail('NOT_FOUND');if(![p.contact.displayName,p.contact.profile.introduction,p.contact.profile.capabilityDescription,...p.tags].join(' ').toLocaleLowerCase().includes((req.query.search??'').toLocaleLowerCase()))fail('NOT_FOUND');return p}
  const ids=(req.query.view==='mine'?s.db.prepare('SELECT id FROM capability_publications WHERE owner_id=? ORDER BY updated_at DESC').all(s.c.actor.id):s.db.prepare("SELECT id FROM capability_publications WHERE status='published' ORDER BY updated_at DESC").all()).map(r=>String(r.id)).filter(id=>{try{project(id);return true}catch{return false}})
  return s.page(name,req.query,ids,project)
 }
 if(name==='capabilityPublication')return {data:publication(s,id)}
 if(name==='publishCapability'){
  const contact=s.contact(String(body.contactId)),owner=contact.identity.kind==='human'?contact.identity.memberId:contact.identity.ownerMemberId
  if(owner!==s.c.actor.id||contact.identity.kind==='public_agent')fail('FORBIDDEN')
  const old=s.db.prepare('SELECT * FROM capability_publications WHERE contact_id=?').get(contact.id);s.c.checkVersion(Number(old?.version??0),Number(body.expectedVersion))
  const doc=JSON.stringify({profile:{displayName:contact.displayName,introduction:contact.profile.introduction,capabilityDescription:contact.profile.capabilityDescription,personality:contact.profile.personality},tags:body.tags}),at=instant(),key=old?String(old.id):randomUUID()
  if(old)s.db.prepare("UPDATE capability_publications SET status='published',version=version+1,updated_at=?,document=? WHERE id=?").run(at,doc,key)
  else s.db.prepare('INSERT INTO capability_publications VALUES (?,?,?,?,?,?,?,?)').run(key,contact.id,s.c.actor.id,'published',1,at,at,doc)
  return {data:publication(s,key)}
 }
 if(name==='withdrawCapability'){
  const row=s.db.prepare('SELECT * FROM capability_publications WHERE id=? AND owner_id=?').get(id,s.c.actor.id);if(!row)fail('NOT_FOUND');s.c.checkVersion(Number(row.version),Number(body.expectedVersion));s.db.prepare("UPDATE capability_publications SET status='withdrawn',version=version+1,updated_at=? WHERE id=?").run(instant(),id);return {data:publication(s,id)}
 }
 if(name==='createPersonalWorkTask')return {data:createWork(s,req.body as RequestFor<'createPersonalWorkTask'>['body'])}
 if(name==='personalWorkTask')return {data:personalWork(s,id)}
 const row=workRow(s,id),viewer=viewerStatus(s,row),doc=decode(row.document) as StoredWork
 if(name==='socialConversation'){if(!row.conversation_id)fail('NOT_FOUND');return {data:s.conversation(String(row.conversation_id))}}
 s.c.checkVersion(Number(row.version),Number(body.expectedVersion))
 const owner=viewer==='owner',full=owner||viewer==='accepted'
 if(['activatePersonalWorkTask','invitePersonalWorkContact','reviewPersonalWorkResult','cancelPersonalWorkTask'].includes(name)&&!owner)fail('FORBIDDEN')
 if(name==='activatePersonalWorkTask'){
  if(row.status!=='proposed')fail('INVALID_STATE');validateContacts(s,doc.contactIds)
  const group=s.newConversation('group',doc.title,doc.contactIds,null,[],id);row.status='active';row.conversation_id=group.id;save(s,row,doc)
  // Only the explicitly shared task goal enters the social group, no other
  // conversation history, attachments or memories are copied.
  s.message(group.id,{senderContactId:null,origin:'service',text:doc.goal,mentions:[],resources:[],actionIds:[],turnId:null})
 }else if(name==='decidePersonalWorkTask'){
  if(row.status!=='active'||viewer!=='invited')fail('INVALID_STATE');s.db.prepare('UPDATE personal_work_participants SET status=? WHERE task_id=? AND contact_id=?').run(body.decision==='accept'?'accepted':'declined',id,s.human().id);save(s,row,doc)
 }else if(name==='invitePersonalWorkContact'){
  if(row.status!=='active'||!row.conversation_id)fail('INVALID_STATE');const contactId=String(body.contactId);validateContacts(s,[contactId]);if(s.db.prepare("SELECT 1 FROM personal_work_participants WHERE task_id=? AND contact_id=? AND status IN ('accepted','invited')").get(id,contactId))fail('INVALID_STATE')
  s.inviteContact(String(row.conversation_id),contactId);s.db.prepare("INSERT INTO personal_work_participants VALUES (?,?,'invited') ON CONFLICT(task_id,contact_id) DO UPDATE SET status='invited'").run(id,contactId);doc.contactIds=[...new Set([...doc.contactIds,contactId])];save(s,row,doc)
 }else if(name==='runPersonalWorkTask'){
  if(!full||row.status!=='active'||!row.conversation_id)fail('FORBIDDEN');const group=s.conversation(String(row.conversation_id),false),contactId=String(body.agentContactId),contact=s.joinedAgent(group,contactId)
  if(contact.agentRuntime)fail('EXTERNAL_SCOPE_UNSUPPORTED')
  if(contact.identity.kind!=='personal_agent'||!s.db.prepare('SELECT 1 FROM personal_work_participants WHERE task_id=? AND contact_id=?').get(id,contactId))fail('FORBIDDEN')
  const latest=latestTurn(s,doc);if(latest&&['queued','running'].includes(latest.status))fail('INVALID_STATE')
  doc.agentContactId=contactId;doc.resultMessageId=null;doc.acceptedMessageId=null;save(s,row,doc)
  const message=s.message(group.id,{senderContactId:s.human().id,origin:'human',text:`@${contact.displayName}\n${doc.goal}`,mentions:[{contactId,start:0,end:contact.displayName.length+1}],resources:[],actionIds:[],turnId:null})
  const turn=s.newTurn(group,message,contactId,{budget:{maxTokens:4000,maxSeconds:90},context:[],conversationVersion:group.version,inputSequence:message.sequence,dailyChat:true,workTaskId:id,workTaskVersion:Number(row.version)+1})
  message.turnId=turn.id;s.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(legacyChatMessage(message)),message.id);doc.messageId=message.id;doc.turnId=turn.id;save(s,{...row,version:Number(row.version)+1},doc,false)
 }else if(name==='submitPersonalWorkResult'){
  if(!full||row.status!=='active'||!row.conversation_id)fail('FORBIDDEN');const group=s.conversation(String(row.conversation_id),false)
  const message=s.message(group.id,{senderContactId:s.human().id,origin:'human',text:String(body.text),mentions:[],resources:[],actionIds:[],turnId:null});doc.resultMessageId=message.id;doc.acceptedMessageId=null;save(s,row,doc)
 }else if(name==='reviewPersonalWorkResult'){
  if(row.status!=='active')fail('INVALID_STATE');const current=personalWork(s,id).result;if(!current||current.messageId!==body.messageId)fail('VERSION_CONFLICT')
  if(body.decision==='accept'){row.status='completed';doc.acceptedMessageId=String(body.messageId)}else{doc.resultMessageId=null;doc.acceptedMessageId=null;doc.messageId=null;doc.turnId=null}save(s,row,doc)
 }else if(name==='cancelPersonalWorkTask'){
  if(['completed','cancelled'].includes(String(row.status)))fail('INVALID_STATE');row.status='cancelled';save(s,row,doc)
  for(const t of s.db.prepare("SELECT id FROM chat_turns WHERE json_extract(request_json,'$.workTaskId')=? AND status IN ('queued','running','waiting_input')").all(id)){abortChatCall(String(t.id));const turn=s.materializedTurn(s.db.prepare('SELECT * FROM chat_turns WHERE id=?').get(t.id!)!);turn.status='cancelled';turn.failure='AUTHORITY_CHANGED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);s.db.prepare('UPDATE chat_turns SET fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE id=?').run(t.id!)}
 }else fail('NOT_FOUND')
 return {data:personalWork(s,id)}
}
function card(s:ChatService,key:string):WorkbenchCard{
 const [source,id]=key.split(':') as [string,string]
 if(source==='work'){
  const w=personalWork(s,id),awaiting=w.allowedActions.includes('accept')||w.allowedActions.includes('activate')||w.allowedActions.includes('review')
  return WorkbenchCard.parse({id:`workbench_${hash(key).slice(0,40)}`,source:'personal_task',taskId:id,title:w.title,goal:w.goal,category:w.status==='completed'?'completed':awaiting?'awaiting_me':'ongoing',status:w.status,owner:w.owner,participants:w.participants,summaryOnly:w.summaryOnly,progress:{completed:w.status==='completed'?1:0,total:1,label:w.status==='awaiting_review'?'结果待验收':w.status==='running'?'实际模型处理中':w.status==='completed'?'指定结果已验收':'尚未验收'},result:w.result,conversationId:w.conversationId,version:w.version,updatedAt:w.updatedAt,allowedActions:w.allowedActions})
 }
 if(source==='schedule'){
  const f=followup(s,id),result=f.lastRun?.outputMessageId?(()=>{try{const m=s.projectedMessage(f.lastRun!.outputMessageId!);return m.text?{messageId:m.id,deliverableId:null,summary:m.text,accepted:false}:null}catch{return null}})():null
  const row=s.db.prepare('SELECT conversation_id FROM personal_followups WHERE id=?').get(id)!
  return WorkbenchCard.parse({id:`workbench_${hash(key).slice(0,40)}`,source:'followup',taskId:null,title:f.title,goal:f.body,category:f.status==='completed'?'completed':'scheduled',status:f.status,owner:person(s,s.human().id),participants:f.execution?[person(s,f.execution.contactId)]:[],summaryOnly:false,progress:{completed:f.lastRun?1:0,total:f.lastRun?1:0,label:f.delivery},result,conversationId:row.conversation_id,version:f.version,updatedAt:f.updatedAt,allowedActions:f.allowedActions})
 }
 const t=s.c.projection(id,false) as {projection?:string;id:string;title:string;summary?:string;goal?:string;status?:string;visibleStatus?:string;initiatorId:string;leadId?:string|null;reviewerId:string;participantIds?:string[];version:number;updatedAt?:string;allowedActions:string[]}
 const summaryOnly=t.projection==='claim_summary',status=t.status??t.visibleStatus??'awaiting_acceptance',pending=t.allowedActions.some(a=>['decide','claim','review'].includes(a))
 let result:WorkbenchCard['result']=null
 if(!summaryOnly){const d=s.db.prepare('SELECT id FROM deliverables WHERE task_id=? ORDER BY revision DESC LIMIT 1').get(id);if(d){const value=s.c.deliverable(String(d.id));result={messageId:null,deliverableId:value.id,summary:value.summary,accepted:value.review?.decision==='accepted'}}}
 const conversation=s.db.prepare('SELECT id FROM chat_conversations WHERE EXISTS(SELECT 1 FROM json_each(document,\'$.taskIds\') WHERE value=?) ORDER BY rowid DESC').all(id).find(r=>{try{s.conversation(String(r.id),false);return true}catch{return false}})
 return WorkbenchCard.parse({id:`workbench_${hash(key).slice(0,40)}`,source:'research_task',taskId:id,title:t.title,goal:summaryOnly?t.summary??null:t.goal??null,category:status==='completed'?'completed':pending?'awaiting_me':'ongoing',status,owner:person(s,s.human(t.initiatorId).id),participants:[...new Set([t.leadId,...t.participantIds??[]].filter((v):v is string=>!!v))].map(member=>person(s,s.human(member).id)),summaryOnly,progress:{completed:status==='completed'?1:0,total:1,label:status},result,conversationId:conversation?.id??null,version:t.version,updatedAt:t.updatedAt??String(s.c.taskRow(id).created_at),allowedActions:t.allowedActions})
}
