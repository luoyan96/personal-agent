import {describe,it,expect} from 'vitest'
import {AgentProfileDocument,AgentConnectionInput,AgentRuntimeMetadata,routes,Contact} from '../src/index.js'
describe('profile portability and explicitly scoped external Agent contract',()=>{
 const profile={displayName:'已有助手',introduction:'讨论用户文本。',capabilityDescription:'由用户指定的聊天角色。',personality:'直接。'}
 it('imports exactly the portable public profile, never identity, memory, endpoint, key or tools',()=>{
  const body={format:'research-agent-profile/v1',profile}
  expect(AgentProfileDocument.safeParse(body).success).toBe(true)
  for(const key of ['ownerId','apiKey','endpoint','memories','tools'])expect(AgentProfileDocument.safeParse({...body,[key]:'private'}).success).toBe(false)
  expect(AgentProfileDocument.safeParse({...body,profile:{...profile,tools:['shell']}}).success).toBe(false)
 })
 it('keeps remote authorization explicit and endpoint credentials out of URLs',()=>{
  const body={expectedVersion:0,protocol:'chat_completions',endpoint:'https://agent.example/v1/chat/completions',model:'deployed-agent',enabled:false}
  expect(AgentConnectionInput.parse(body).allowAcceptedContacts).toBe(false)
  for(const endpoint of ['http://agent.example/v1/chat/completions','https://key@agent.example/v1/chat/completions','https://agent.example/v1/chat/completions?key=secret','https://agent.example:8443/v1/chat/completions'])expect(AgentConnectionInput.safeParse({...body,endpoint}).success).toBe(false)
  expect(routes.agentChatMessage.request.shape.body.parse({text:'你好'})).toEqual({text:'你好'})
  expect(routes.agentChatMessage.request.shape.body.parse({text:'你好',externalConsent:true})).toEqual({text:'你好',externalConsent:true})
  expect(Contact.shape.agentRuntime.isOptional()).toBe(true)
  expect(AgentRuntimeMetadata.safeParse({kind:'external',protocol:'chat_completions',serviceOrigin:'https://agent.example/private',scope:'current_message',credentialPayer:'agent_owner',allowAcceptedContacts:false,callerAllowed:true,requiresConsent:true,verification:'unverified'}).success).toBe(false)
 })
})
