import { describe, expect, it } from 'vitest'
import { AgentTurn, CreatedAgentReceipt, ChatActionPayload, SendChatMessage, routes } from '../src/index.js'

describe('CHAT1 dispatch and sharing boundaries', () => {
  it('defaults historical turns to reply and limits creation receipts to actual contact pointers', () => {
    const historical={id:'turn_a',conversationId:'conversation_a',inputMessageId:'message_a',agentContactId:'agent_a',status:'queued',failure:null,availability:{status:'available',reason:null},outputMessageId:null,usage:null,budget:{maxTokens:4000,maxSeconds:90},remainingBudget:{maxTokens:4000,maxSeconds:90},allowedActions:[],version:1,createdAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'}
    expect(AgentTurn.parse(historical)).toMatchObject({purpose:'reply',createdAgent:null})
    const receipt={contactId:'agent_b',conversationId:'direct_b',displayName:'区块链助手',reused:false}
    expect(AgentTurn.parse({...historical,purpose:'create_agent',createdAgent:receipt,status:'succeeded'}).createdAgent).toEqual(receipt)
    expect(CreatedAgentReceipt.safeParse({...receipt,ownerId:'someone_else'}).success).toBe(false)
    expect(AgentTurn.safeParse({...historical,purpose:'execute_tool'}).success).toBe(false)
  })
  it('requires an explicit agent and budget without dispatching ordinary mentions', () => {
    expect(SendChatMessage.safeParse({ text: '@李 看一下', mentions: [{ contactId: 'human_li', start: 0, end: 2 }] }).success).toBe(true)
    expect(SendChatMessage.safeParse({ text: 'hello', intent: 'ask_agent' }).success).toBe(false)
    expect(SendChatMessage.safeParse({ text: 'hello', agentContactId: 'agent_a' }).success).toBe(false)
    expect(SendChatMessage.safeParse({ text: 'hello', intent: 'ask_agent', agentContactId: 'agent_a', budget: { maxTokens: 1000, maxSeconds: 30 } }).success).toBe(true)
  })
  it('rejects ambiguous ranges and spoofed sender, status or model commands', () => {
    expect(SendChatMessage.safeParse({ text: 'hello', senderContactId: 'other' }).success).toBe(false)
    expect(SendChatMessage.safeParse({ text: 'hello', mentions: [{ contactId: 'a', start: 0, end: 6 }] }).success).toBe(false)
    expect(SendChatMessage.safeParse({ text: 'hello', mentions: [{ contactId: 'a', start: 0, end: 3 }, { contactId: 'b', start: 2, end: 4 }] }).success).toBe(false)
    expect(ChatActionPayload.safeParse({ kind: 'execute', command: 'arbitrary shell' }).success).toBe(false)
  })
  it('requires explicit selected sharing and version-bound plan for group proposals', () => {
    const payload = { kind: 'create_group', title: '合成任务群', plan: { id: 'plan_a', version: 1 }, contactIds: ['human_a'], sharedContext: { selectedText: null, artifactRefs: [] } }
    expect(ChatActionPayload.safeParse(payload).success).toBe(true)
    expect(ChatActionPayload.safeParse({ ...payload, sharedContext: { shareAllHistory: true } }).success).toBe(false)
    expect(ChatActionPayload.safeParse({ ...payload, plan: { id: 'plan_a' } }).success).toBe(false)
  })
  it('marks all CHAT1 endpoints implemented with the service milestone', () => {
    const chat = Object.values(routes).filter(r => r.stage === 'CHAT1')
    expect(chat).toHaveLength(31)
    for (const r of chat) expect(r.implemented).toBe(true)
  })
})
