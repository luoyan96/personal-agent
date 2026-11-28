import { z } from 'zod'
import { data, ErrorResponse, errorStatus, Id, Instant, page, Version } from './models.js'

export const AssistantRelationshipMemoryKind = z.enum(['open_thread', 'experience'])
const subject = z.string().trim().min(2).max(80)
const text = z.string().trim().min(2).max(600)
const activeStatus = z.enum(['active', 'resolved'])

export const AssistantRelationshipMemory = z.strictObject({
  id: Id,
  kind: AssistantRelationshipMemoryKind,
  subject,
  text,
  status: activeStatus,
  version: Version,
  source: z.strictObject({ conversationId: Id, messageId: Id }),
  createdAt: Instant,
  updatedAt: Instant,
  expiresAt: Instant,
})

export type AssistantRelationshipMemory = z.infer<typeof AssistantRelationshipMemory>

export const AssistantRelationshipMemoryUpdate = z.discriminatedUnion('operation', [
  z.strictObject({ operation: z.literal('edit'), expectedVersion: Version, subject, text }),
  z.strictObject({ operation: z.enum(['resolve', 'forget']), expectedVersion: Version }),
])

export const AssistantRelationshipMemoryReceipt = z.strictObject({
  id: Id,
  version: Version,
  status: z.enum(['active', 'resolved', 'forgotten', 'expired']),
})

const empty = z.strictObject({})
const common = { stage: 'CHAT1', implemented: true, access: 'session', status: 200, errors: ErrorResponse, errorStatuses: errorStatus } as const

export const assistantRelationshipMemoryRoutes = {
  assistantRelationshipMemories: {
    ...common, method: 'GET', path: '/api/v1/me/assistant-relationship-memories', idempotent: false,
    rule: 'Current owner only. Lists sourced relationship memories that remain available and unexpired.',
    request: z.strictObject({ params: empty, headers: empty, body: z.null(),
      query: z.strictObject({ cursor: z.string().max(2048).optional(), limit: z.number().int().min(1).max(100).default(30) }) }),
    response: page(AssistantRelationshipMemory),
  },
  updateAssistantRelationshipMemory: {
    ...common, method: 'POST', path: '/api/v1/me/assistant-relationship-memories/{id}', idempotent: true,
    rule: 'Current owner and exact version. Edit or resolve the memory, or erase its text from assistant memory and prevent source relearning.',
    request: z.strictObject({ params: z.strictObject({ id: Id }), query: empty,
      headers: z.strictObject({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) }), body: AssistantRelationshipMemoryUpdate }),
    response: data(AssistantRelationshipMemoryReceipt),
  },
} as const
