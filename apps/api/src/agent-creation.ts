import { z } from 'zod'
import { ContactProfileInput, type Contact, type Conversation, type AgentTurn, type CreatedAgentReceipt } from '@research-agent-platform/contracts'
import type { ChatService, ChatRequest } from './chat.js'

// A narrow imperative head grants this one operation. The model, historical
// dialogue, quoted material and a user-authored profile never grant authority.
export function isAgentCreationCommand(text: string) {
  const value=text.trim()
  const command=/^(?:(?:请(?:你)?(?:帮我|为我|给我)?|麻烦(?:你)?(?:帮我)?|帮我|给我|为我|替我)\s*)?(?:创建|新建)\s*(?:(?:一个|一位|一名|个)\s*)?[^。！？?!\r\n]{0,180}?(?:\bagent\b|智能体|助手)(?=\s*(?:$|[，,。；;！.!]))/i.exec(value)
    ?? /^(?:please\s+)?create\s+(?:an?\s+)?[^.!?\r\n]{0,180}?\b(?:agent|assistant)\b(?=\s*(?:$|[,.!;]))/i.exec(value)
  if(!command)return false
  const clause=value.split(/[，,。.;；\r\n]/,1)[0]!
  if(/[?？]/.test(clause)||/(?:吗|么|是不是|是否|可不可以|能不能|能否|需要什么|要怎么|该怎么|怎么样)\s*[。.!！]?$/u.test(clause))return false
  const rest=value.slice(command[0].length)
  if(/^\s*(?:吗|么|[?？])/.test(rest)||/^\s*[，,]\s*(?:可以吗|可以么|行吗|行么|好吗|好不好|可不可以|能不能|能否|是否)/.test(rest))return false
  // An explicit retraction of this operation is different from a personality
  // instruction such as "不要啰嗦" and must not cause a persistent write.
  if(/[，,。；;]\s*(?:但|不过|其实|请)?\s*(?:(?:不要|别|不用|无需|不需要|暂不|先不|取消)(?:真的|实际)?(?:创建|新建)|(?:只是|仅)(?:引用|举例|讨论|写人设))/.test(rest))return false
  return true
}

export const agentCreationBoundary='当前仅依据用户提供的文字进行讨论；不联网、不自动读取 PDF 或 SDK 文件、不运行工具，不配置独立模型或 API Key。'
const GeneratedProfile=z.strictObject({displayName:z.string().trim().min(1).max(200),introduction:z.string().trim().min(1).max(2000),capabilityDescription:z.string().trim().min(1).max(4000),personality:z.string().trim().min(1).max(2000)})
export const AgentCreationOutput=z.discriminatedUnion('kind',[
  z.strictObject({kind:z.literal('create_agent'),profile:GeneratedProfile}),
  z.strictObject({kind:z.literal('clarify'),question:z.string().trim().min(1).max(8000)}),
])
export const agentCreationSystem=`Generate the profile for the owner's explicitly requested new chatting Agent, based ONLY on this complete current request. No tools or external actions. Do not use history, private memories, other users, owner IDs, credentials or fictional installed capabilities. The service alone saves the contact and opens a direct conversation. These are text-only personas using the sender's existing model configuration: no web search, automatic PDF/SDK-file access, tool execution or independent API key. Describe requested external abilities as unavailable, never as installed or performed. If the topic and desired style are clear, create immediately without another confirmation. Ask clarification only when essential information is genuinely missing. Return ONLY strict JSON: {"kind":"create_agent","profile":{"displayName":"nonempty <=200 characters","introduction":"nonempty <=2000","capabilityDescription":"nonempty <=4000, text discussion abilities and limitations","personality":"nonempty <=2000"}} OR {"kind":"clarify","question":"nonempty <=8000"}. No additional keys, markdown, completion claims, task plans, owners, tools, model settings or URLs.`

export function applyAgentCreation(s:ChatService,turnId:string,generated:z.infer<typeof GeneratedProfile>):CreatedAgentReceipt {
  const profile=ContactProfileInput.parse({...generated,capabilityDescription:generated.capabilityDescription.endsWith(agentCreationBoundary)?generated.capabilityDescription:`${generated.capabilityDescription}\n${agentCreationBoundary}`})
  const existing=s.db.prepare(`SELECT c.id FROM chat_contacts c JOIN chat_contact_profiles p ON p.contact_id=c.id
    WHERE c.lab_id=? AND c.owner_id=? AND c.kind='personal_agent' AND p.role='specialist'
    AND p.display_name=? AND p.introduction=? AND p.capability_description=? AND p.personality=? ORDER BY c.id LIMIT 1`).get(s.c.actor.labId,s.c.actor.id,profile.displayName,profile.introduction,profile.capabilityDescription,profile.personality)
  const request=(body:unknown,key:string):ChatRequest=>({params:{},query:{},body,headers:{'Idempotency-Key':`creation_${turnId}_${key}`}})
  const agent=existing?s.contact(String(existing.id)):(s.run('createPersonalAgent',request(profile,'profile')) as {data:Contact}).data
  if(agent.identity.kind!=='personal_agent'||agent.identity.ownerMemberId!==s.c.actor.id||agent.profile.role!=='specialist')throw new Error('INVALID_MODEL_OUTPUT')
  const direct=(s.run('createDirectConversation',request({contactId:agent.id},'direct')) as {data:Conversation}).data
  return {contactId:agent.id,conversationId:direct.id,displayName:agent.displayName,reused:!!existing}
}

// Existing 0.14 workers/clients have strict schemas. New metadata belongs in
// request_json; even a new limit code has a legacy-compatible persisted failure.
export function legacyTurnDocument(turn:AgentTurn) {
  const {purpose:_purpose,createdAgent:_createdAgent,...document}=turn
  return {...document,failure:document.failure==='AGENT_LIMIT_REACHED'?'INVALID_MODEL_OUTPUT':document.failure}
}
