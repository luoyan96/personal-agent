import { describe, expect, it } from 'vitest'
import { AssistantMemory, AssistantMemoryIndex, AssistantMemoryInput } from '../src/index.js'

const base = {
  topic: '称呼',
  type: 'preference',
  summary: '称呼：小王',
  detail: null,
  payload: { type: 'preference', value: '小王', appliesTo: 'general' },
  source: { kind: 'manual', id: null, version: null, label: null },
} as const

describe('assistant memory contract', () => {
  it('keeps personal and agent scopes separate', () => {
    expect(AssistantMemoryInput.safeParse({ ...base, scope: 'personal', subjectId: null }).success).toBe(true)
    expect(AssistantMemoryInput.safeParse({ ...base, scope: 'agent', subjectId: 'agent_a' }).success).toBe(true)
    expect(AssistantMemoryInput.safeParse({ ...base, scope: 'agent', subjectId: null }).success).toBe(false)
    expect(AssistantMemoryInput.safeParse({ ...base, scope: 'personal', subjectId: 'agent_a' }).success).toBe(false)
  })

  it('requires payload type to match the memory type', () => {
    expect(AssistantMemoryInput.safeParse({ ...base, type: 'decision' }).success).toBe(false)
    expect(
      AssistantMemoryInput.safeParse({
        ...base,
        type: 'decision',
        summary: '决定：先做文献综述',
        payload: { type: 'decision', decision: '先做文献综述', rationale: null, alternatives: [] },
      }).success,
    ).toBe(true)
  })

  it('projects an index without detail or payload', () => {
    const index = {
      id: 'memory_a',
      scope: 'personal',
      subjectId: null,
      topic: '称呼',
      type: 'preference',
      conflict: false,
      summary: '称呼：小王',
      status: 'confirmed',
      version: 1,
      source: { kind: 'manual', id: null, version: null, label: null },
      updatedAt: '2026-11-13T00:00:00Z',
    }
    expect(AssistantMemoryIndex.parse(index)).toEqual(index)
  })

  it('rejects client-supplied status, origin and id', () => {
    expect(AssistantMemory.safeParse({ ...base, id: 'memory_a', status: 'confirmed', origin: 'explicit', version: 1, createdAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z', allowedActions: [] }).success).toBe(true)
    expect(AssistantMemory.safeParse({ ...base, id: 'memory_a', status: 'active', origin: 'explicit', version: 1, createdAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z', allowedActions: [] }).success).toBe(false)
  })
})
