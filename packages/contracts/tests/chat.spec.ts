import { describe, expect, it } from 'vitest'
import { ChatActionPayload, SendChatMessage, routes } from '../src/index.js'

describe('CHAT1 dispatch and sharing boundaries', () => {
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
  it('keeps all CHAT1 endpoints explicitly unavailable until implementation', () => {
    const chat = Object.values(routes).filter(r => r.stage === 'CHAT1')
    expect(chat).toHaveLength(15)
    for (const r of chat) expect(r.implemented).toBe(false)
  })
})
