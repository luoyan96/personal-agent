import { randomUUID } from 'node:crypto'
import { PersonalMemory,PersonalMemoryInput,PersonalMemorySettings,personalAssistantRoutes,type Contact,type Conversation,type ChatMessage } from '@research-agent-platform/contracts'
import { hash } from './auth.js'
import { fail } from './errors.js'
import type { ChatService,ChatRequest } from './chat.js'
export const personalCommands=Object.keys(personalAssistantRoutes)
export function memorySettings(s:ChatService){s.db.prepare('INSERT INTO personal_memory_settings(member_id) VALUES(?) ON CONFLICT DO NOTHING').run(s.c.actor.id);const r=s.db.prepare('SELECT * FROM personal_memory_settings WHERE member_id=?').get(s.c.actor.id)!;return PersonalMemorySettings.parse({candidateLearning:r.candidate_learning===1,timeZone:r.time_zone,quietHours:r.quiet_hours_json?JSON.parse(String(r.quiet_hours_json)):null,version:r.version})}
export function memory(s:ChatService,id:string){const r=s.db.prepare('SELECT * FROM personal_memories WHERE id=? AND member_id=?').get(id,s.c.actor.id);if(!r)fail('NOT_FOUND');return PersonalMemory.parse({id:r.id,topic:r.topic,content:r.content,scope:r.scope,status:r.status,origin:r.origin,sourceMessageId:r.source_message_id,version:r.version,createdAt:r.created_at,updatedAt:r.updated_at,allowedActions:r.status==='revoked'?[]:r.status==='candidate'?['edit','confirm','revoke']:['edit','revoke']})}
function revision(s:ChatService,id:string){const value=memory(s,id);s.db.prepare('INSERT INTO personal_memory_revisions VALUES(?,?,?,?)').run(id,value.version,JSON.stringify({...value,allowedActions:[]}),value.updatedAt);return value}
export function revokeMemory(s:ChatService,id:string){const value=memory(s,id);if(value.status==='revoked')fail('INVALID_STATE');s.db.prepare("UPDATE personal_memories SET status='revoked',version=version+1,updated_at=? WHERE id=?").run(new Date().toISOString(),id);return revision(s,id)}
export function saveMemory(s:ChatService,value:unknown,origin:'explicit'|'feedback'|'inferred'='explicit',source:ChatMessage|null=null,id?:string){
 const body=PersonalMemoryInput.parse(value),status=origin==='inferred'?'candidate':'confirmed',now=new Date().toISOString()
 const aliases:Record<string,string>={'回答方式':'回复方式','回复风格':'回复方式','回答风格':'回复方式','名字':'称呼'}
 body.topic=aliases[body.topic]??body.topic
 let old=id?memory(s,id):s.db.prepare('SELECT id,source_message_id FROM personal_memories WHERE member_id=? AND topic=? AND status=? ORDER BY updated_at DESC LIMIT 1').get(s.c.actor.id,body.topic,status)
 if(id&&old&&'status' in old&&old.status==='revoked')fail('INVALID_STATE')
 if(status==='confirmed'){
  const other=s.db.prepare("SELECT id FROM personal_memories WHERE member_id=? AND topic=? AND status='confirmed'").get(s.c.actor.id,body.topic)
  if(other&&other.id!==old?.id)revokeMemory(s,String(other.id))
  if(!old&&Number(s.db.prepare("SELECT count(*) n FROM personal_memories WHERE member_id=? AND status='confirmed'").get(s.c.actor.id)!.n)>=50)fail('RATE_LIMITED')
 }else if(!old&&Number(s.db.prepare("SELECT count(*) n FROM personal_memories WHERE member_id=? AND status='candidate'").get(s.c.actor.id)!.n)>=20)fail('RATE_LIMITED')
 const target=old?.id?String(old.id):randomUUID()
 const sourceId=source?.id??(old?('sourceMessageId' in old?old.sourceMessageId:old.source_message_id):null)??null
 if(old)s.db.prepare('UPDATE personal_memories SET topic=?,scope=?,status=?,origin=?,source_message_id=?,content=?,version=version+1,updated_at=? WHERE id=?').run(body.topic,body.scope,status,origin,sourceId,body.content,now,target)
 else s.db.prepare('INSERT INTO personal_memories VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(target,s.c.actor.id,body.topic,body.scope,status,origin,source?.id??null,body.content,1,now,now)
 return revision(s,target)
}
export function handleMemory(s:ChatService,name:string,req:ChatRequest):unknown{
 if(name==='personalMemorySettings')return {data:memorySettings(s)}
 if(name==='updatePersonalMemorySettings'){const current=memorySettings(s),b=req.body as PersonalMemorySettings&{expectedVersion:number};s.c.checkVersion(current.version,b.expectedVersion);s.db.prepare('UPDATE personal_memory_settings SET candidate_learning=?,time_zone=?,quiet_hours_json=?,version=version+1 WHERE member_id=?').run(b.candidateLearning?1:0,b.timeZone,b.quietHours?JSON.stringify(b.quietHours):null,s.c.actor.id);return {data:memorySettings(s)}}
 if(name==='personalMemories'){
  const ids=s.db.prepare("SELECT id FROM personal_memories WHERE member_id=? AND (?='all' OR status=?) ORDER BY updated_at DESC,id").all(s.c.actor.id,req.query.status??'all',req.query.status??'all').map(r=>String(r.id))
  return s.page(name as keyof typeof personalAssistantRoutes,req.query,ids,id=>{const value=memory(s,id);if(req.query.status!=='all'&&value.status!==req.query.status)fail('NOT_FOUND');return value})
 }
 if(name==='personalMemory')return {data:memory(s,req.params.id!)}
 if(name==='createPersonalMemory')return {data:saveMemory(s,req.body)}
 if(name==='updatePersonalMemory'){const b=req.body as {expectedVersion:number};s.c.checkVersion(memory(s,req.params.id!).version,b.expectedVersion);const {expectedVersion:_,...body}=req.body as Record<string,unknown>;return {data:saveMemory(s,body,'feedback',null,req.params.id)}}
 if(name==='decidePersonalMemory'){const value=memory(s,req.params.id!),b=req.body as {expectedVersion:number;decision:'confirm'|'revoke'};s.c.checkVersion(value.version,b.expectedVersion);if(b.decision==='revoke')return {data:revokeMemory(s,value.id)};if(value.status!=='candidate')fail('INVALID_STATE');return {data:saveMemory(s,{topic:value.topic,content:value.content,scope:value.scope},'feedback',null,value.id)}}
 return undefined
}
export function ownLocalMemoryScope(s:ChatService,agent:Contact,group:Conversation){return ['personal','direct'].includes(group.kind)&&agent.identity.kind==='personal_agent'&&agent.identity.ownerMemberId===s.c.actor.id&&!agent.agentRuntime}
export function personalMemoryContext(s:ChatService,agent:Contact,group:Conversation,text:string){
 if(!ownLocalMemoryScope(s,agent,group))return {fingerprint:null,records:[]}
 const settings=memorySettings(s),all=s.db.prepare('SELECT id,version,status FROM personal_memories WHERE member_id=? ORDER BY id').all(s.c.actor.id)
 const fingerprint=hash(JSON.stringify({settings:settings.version,all}))
 const match=(topic:string)=>{const target=(text+' '+agent.displayName+' '+agent.profile.capabilityDescription).toLocaleLowerCase(),tokens=topic.toLocaleLowerCase().match(/[a-z0-9_]{2,}|[\p{Script=Han}]{2,}/gu)??[];return tokens.some(term=>target.includes(term))}
 const records=s.db.prepare("SELECT id FROM personal_memories WHERE member_id=? AND status='confirmed' ORDER BY updated_at DESC,id").all(s.c.actor.id).map(r=>memory(s,String(r.id))).filter(v=>v.scope==='general'||match(v.topic)).map(v=>({id:v.id,topic:v.topic,content:v.content,scope:v.scope,origin:v.origin}))
 return {fingerprint,records}
}
function memoryTopic(content:string){
 if(/称呼|叫我|名字/.test(content))return '称呼'
 if(/语言|中文|英文|英语|日语/.test(content))return '语言'
 if(/写作|行文|论文.{0,5}风格/.test(content))return '写作'
 if(/回答|回复|先.{0,8}结论|简短|详细/.test(content))return '回复方式'
 if(/(?:我在|我的)(?:.{1,40})(?:工作|任职)|工作单位|所在实验室/.test(content))return '工作单位'
 return null
}
export function memoryCommand(s:ChatService,text:string,message:ChatMessage){
 const value=text.trim(),first=value.split(/[，,。;；\n]/)[0]!
 if(/[?？]$/.test(first)||/[，,。;；]\s*(?:但|不过|其实)?\s*(?:只是引用|只是举例|不要保存|别保存|不要记住|别记住|不是真的)/.test(value))return null
 const forget=/^(?:请)?(?:忘记|删除记忆)\s*[:：]?\s*(.+?)\s*[。.]?$/.exec(value)
 if(forget){let topic=forget[1]!.trim();topic=memoryTopic(topic)??topic;const matches=s.db.prepare("SELECT id FROM personal_memories WHERE member_id=? AND status!='revoked' AND (id=? OR topic=?)").all(s.c.actor.id,topic,topic);if(matches.length!==1)return {receipt:{operation:'clarify' as const,memoryId:null,topic:null,status:null,version:0,question:'请明确要忘记的记忆主题或编号。'},text:'请明确要忘记的记忆主题或编号；尚未修改。'};const saved=revokeMemory(s,String(matches[0]!.id));return {receipt:{operation:'forgotten' as const,memoryId:saved.id,topic:saved.topic,status:saved.status,version:saved.version,question:null},text:`已撤回本人记忆“${saved.topic}”。`}}
 const explicit=/^(?:请)?记住\s*[:：]?\s*(.+)$/.exec(value),correction=/^(?:请)?(?:纠正|更正)(?:我的)?(?:偏好|记忆)\s*[:：]\s*(.+)$/.exec(value),future=/^以后(?:请)?(?:回答|回复|称呼我|叫我|写作|分析|处理材料)[^?？]+$/.test(value)
 const inferred=!explicit&&!correction&&!future&&/^(?:我通常|我一般|我习惯|我更喜欢)[^?？]+$/.test(value)&&memorySettings(s).candidateLearning
 if(!explicit&&!correction&&!future&&!inferred)return null
 let content=(explicit?.[1]??correction?.[1]??value).trim(),topic=memoryTopic(content),scope:'general'|'topic'='general'
 const labeled=/^\[([^\]]{1,80})\]\s*[:：]?\s*(.+)$/.exec(content);if(labeled){topic=labeled[1]!;content=labeled[2]!;scope='topic'}
 if(correction&&!topic)return {receipt:{operation:'clarify' as const,memoryId:null,topic:null,status:null,version:0,question:'请说明要纠正的主题，例如：纠正记忆：[饮食] 我喜欢茶。'},text:'请说明要纠正的记忆主题；尚未修改。'}
 if(!content||content.length>1000)return {receipt:{operation:'clarify' as const,memoryId:null,topic:null,status:null,version:0,question:'请把要保存的单条偏好明确写在 1000 字内。'},text:'请把要保存的单条偏好明确写在 1000 字内；尚未保存。'}
 // Unclassified explicit facts are independent records, not one mutable bucket.
 // The suffix keeps different long facts with the same prefix distinct.
 topic??=content.length<=70?content:content.slice(0,60)+'…'+hash(content).slice(0,8)
 const existed=s.db.prepare("SELECT 1 FROM personal_memories WHERE member_id=? AND topic=? AND status='confirmed'").get(s.c.actor.id,topic),saved=saveMemory(s,{topic,content,scope},inferred?'inferred':correction?'feedback':'explicit',message)
 return {receipt:{operation:inferred?'candidate' as const:existed?'corrected' as const:'saved' as const,memoryId:saved.id,topic:saved.topic,status:saved.status,version:saved.version,question:null},text:inferred?`已记为待确认候选“${topic}”，确认后才用于后续聊天。`:`已${existed?'更新':'保存'}本人长期记忆“${topic}”。`}
}
