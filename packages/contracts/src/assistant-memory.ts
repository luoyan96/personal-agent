import { z } from 'zod'
import { Id, Version, Instant, Timezone, ErrorResponse, errorStatus, data, page } from './models.js'

/**
 * Assistant memory is the personal-assistant domain only: owner preferences and
 * the assistant's own notes. Task/project memory, conclusions, links and group
 * memory remain separate assets with their own ACL and approval.
 *
 * `conversation`/group scope is deliberately absent until group memory is built.
 */
export const AssistantMemoryScope = z.enum(['personal', 'agent'])
export const AssistantMemoryType = z.enum(['preference', 'decision', 'commitment', 'note'])
export const AssistantMemoryStatus = z.enum(['candidate', 'confirmed', 'revoked'])
export const AssistantMemoryOrigin = z.enum(['explicit', 'feedback', 'inferred'])

export const AssistantMemorySource = z.strictObject({
  kind: z.enum(['manual', 'message', 'task', 'conversation']),
  id: Id.nullable().default(null),
  version: z.number().int().nonnegative().nullable().default(null),
  label: z.string().max(1000).nullable().default(null),
})

export const AssistantPreferencePayload = z.strictObject({
  type: z.literal('preference'),
  value: z.string().trim().min(1).max(1000),
  /** Legacy personal-memory matching: general preferences apply everywhere; topic preferences match the conversation text. */
  appliesTo: z.enum(['general', 'topic']).default('general'),
})
export const AssistantDecisionPayload = z.strictObject({
  type: z.literal('decision'),
  decision: z.string().trim().min(1).max(1000),
  rationale: z.string().trim().max(2000).nullable().default(null),
  alternatives: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
})
export const AssistantCommitmentPayload = z.strictObject({
  type: z.literal('commitment'),
  what: z.string().trim().min(1).max(1000),
  dueAt: Instant.nullable().default(null),
  state: z.enum(['open', 'done', 'dropped']).default('open'),
})
export const AssistantNotePayload = z.strictObject({
  type: z.literal('note'),
  text: z.string().trim().min(1).max(2000),
})
export const AssistantMemoryPayload = z.discriminatedUnion('type', [
  AssistantPreferencePayload,
  AssistantDecisionPayload,
  AssistantCommitmentPayload,
  AssistantNotePayload,
])

const subjectRule = (value: { scope: 'personal' | 'agent'; subjectId: string | null }, ctx: z.RefinementCtx) => {
  if (value.scope === 'agent' && !value.subjectId)
    ctx.addIssue({ code: 'custom', path: ['subjectId'], message: 'agent scope requires subjectId' })
  if (value.scope === 'personal' && value.subjectId)
    ctx.addIssue({ code: 'custom', path: ['subjectId'], message: 'personal scope cannot set subjectId' })
}

const AssistantMemoryFields = z.strictObject({
  scope: AssistantMemoryScope.default('personal'),
  subjectId: Id.nullable().default(null),
  topic: z.string().trim().min(1).max(80),
  type: AssistantMemoryType,
  summary: z.string().trim().min(1).max(300),
  detail: z.string().trim().max(4000).nullable().default(null),
  payload: AssistantMemoryPayload,
  source: AssistantMemorySource.default({ kind: 'manual', id: null, version: null, label: null }),
})

export const AssistantMemoryInput = AssistantMemoryFields.superRefine((value, ctx) => {
  subjectRule(value, ctx)
  if (value.payload.type !== value.type)
    ctx.addIssue({ code: 'custom', path: ['payload', 'type'], message: 'payload type must match memory type' })
})

export const AssistantMemory = AssistantMemoryFields.extend({
  id: Id,
  status: AssistantMemoryStatus,
  conflict: z.boolean().default(false),
  origin: AssistantMemoryOrigin,
  version: Version,
  createdAt: Instant,
  updatedAt: Instant,
  allowedActions: z.array(z.enum(['edit', 'confirm', 'revoke'])).max(3),
}).superRefine((value, ctx) => {
  if (value.payload.type !== value.type)
    ctx.addIssue({ code: 'custom', path: ['payload', 'type'], message: 'payload type must match memory type' })
})

export const AssistantMemoryUpdate = AssistantMemoryFields.omit({ scope: true, subjectId: true })
  .extend({ expectedVersion: Version })
  .superRefine((value, ctx) => {
    if (value.payload.type !== value.type)
      ctx.addIssue({ code: 'custom', path: ['payload', 'type'], message: 'payload type must match memory type' })
  })

/** Index projection used for selection; detail is fetched by id with a fresh ACL check. */
export const AssistantMemoryIndex = z.strictObject({
  id: Id,
  scope: AssistantMemoryScope,
  subjectId: Id.nullable(),
  topic: z.string().min(1).max(80),
  type: AssistantMemoryType,
  conflict: z.boolean(),
  summary: z.string().min(1).max(300),
  status: AssistantMemoryStatus,
  version: Version,
  source: AssistantMemorySource,
  updatedAt: Instant,
})

export const AssistantMemoryHistory = z.strictObject({
  memory: AssistantMemory,
  revisions: z.array(AssistantMemory).max(100),
})

export const AssistantMemoryQuietHours = z
  .strictObject({
    start: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    end: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
  })
  .refine(value => value.start !== value.end, 'Quiet interval must not be a whole day')

export const AssistantMemorySettings = z.strictObject({
  candidateLearning: z.boolean(),
  timeZone: Timezone,
  quietHours: AssistantMemoryQuietHours.nullable(),
  version: Version,
})

export const AssistantMemoryCompression = z.strictObject({
  scope: z.literal('agent'),
  subjectId: Id,
  merged: z.number().int().nonnegative(),
  archived: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  detailBytes: z.number().int().nonnegative(),
})

export const AssistantMemoryCompressionJob = z.strictObject({
  id: Id,
  status: z.enum(['queued', 'running', 'succeeded', 'failed']),
  result: AssistantMemoryCompression.nullable(),
  failure: z.string().max(300).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type AssistantMemory = z.infer<typeof AssistantMemory>
export type AssistantMemoryInput = z.infer<typeof AssistantMemoryInput>
export type AssistantMemoryUpdate = z.infer<typeof AssistantMemoryUpdate>
export type AssistantMemoryIndex = z.infer<typeof AssistantMemoryIndex>
export type AssistantMemoryHistory = z.infer<typeof AssistantMemoryHistory>
export type AssistantMemorySettings = z.infer<typeof AssistantMemorySettings>
export type AssistantMemoryCompression = z.infer<typeof AssistantMemoryCompression>
export type AssistantMemoryCompressionJob = z.infer<typeof AssistantMemoryCompressionJob>

const empty = z.strictObject({})
const id = z.strictObject({ id: Id })
const headers = z.strictObject({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) })
const pagination = z.strictObject({ cursor: z.string().max(2048).optional(), limit: z.number().int().min(1).max(100).default(30) })
function route<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType, R extends z.ZodType>(
  method: 'GET' | 'POST',
  path: string,
  params: P,
  query: Q,
  body: B,
  response: R,
  status: number,
  rule: string,
) {
  return {
    method,
    path: `/api/v1${path}`,
    stage: 'CHAT1' as const,
    implemented: true,
    access: 'session' as const,
    status,
    rule,
    idempotent: method !== 'GET',
    request: z.strictObject({ params, query, headers: method === 'GET' ? empty : headers, body }),
    response,
    errors: ErrorResponse,
    errorStatuses: errorStatus,
  }
}

export const assistantMemoryRoutes = {
  assistantMemorySettings: route('GET', '/me/assistant-memory-settings', empty, empty, z.null(), data(AssistantMemorySettings), 200, 'Current member only; candidate learning, timezone and quiet hours. No model call.'),
  updateAssistantMemorySettings: route('POST', '/me/assistant-memory-settings', empty, empty, z.strictObject({ expectedVersion: Version, candidateLearning: z.boolean(), timeZone: Timezone, quietHours: AssistantMemoryQuietHours.nullable() }), data(AssistantMemorySettings), 200, 'Owner-versioned assistant-memory policy; fences local preference consumers.'),
  assistantMemories: route('GET', '/me/assistant-memories', empty, pagination.extend({ scope: AssistantMemoryScope.default('personal'), subjectId: Id.optional(), status: z.enum(['confirmed', 'candidate', 'revoked', 'all']).default('all') }), z.null(), page(AssistantMemory), 200, 'Current owner only. personal scope has no subject; agent scope is an owned personal_agent. Candidates are not applied until confirmed.'),
  compressAssistantMemories: route('POST', '/me/assistant-memories/compress', empty, empty, z.strictObject({ subjectId: Id }), data(AssistantMemoryCompressionJob), 202, 'Queue one manual compression for an owned agent. The request returns before the model runs; one active job per owner and agent.'),
  assistantMemoryCompressionJob: route('GET', '/me/assistant-memories/compression-jobs/{id}', z.strictObject({ id: Id }), empty, z.null(), data(AssistantMemoryCompressionJob), 200, 'Owner only. The job exposes only status, counts and failure code; memory details stay in the memory routes.'),
  assistantMemory: route('GET', '/me/assistant-memories/{id}', id, empty, z.null(), data(AssistantMemory), 200, 'Current owner or live agent scope only, including revoked records; no cross-owner discovery.'),
  createAssistantMemory: route('POST', '/me/assistant-memories', empty, empty, AssistantMemoryInput, data(AssistantMemory), 201, 'Explicit owner save; personal or owned-agent scope. Correct the current confirmed same-topic preference atomically; no model required.'),
  updateAssistantMemory: route('POST', '/me/assistant-memories/{id}', id, empty, AssistantMemoryUpdate, data(AssistantMemory), 200, 'Current manager only; exact version; scope/subject immutable; append revision and fence older model context.'),
  decideAssistantMemory: route('POST', '/me/assistant-memories/{id}/decision', id, empty, z.strictObject({ expectedVersion: Version, decision: z.enum(['confirm', 'revoke']) }), data(AssistantMemory), 200, 'Candidate confirm or active revoke; revoked entries never enter prompts. Idempotent owner action.'),
  assistantMemoryHistory: route('GET', '/me/assistant-memories/{id}/history', id, empty, z.null(), data(AssistantMemoryHistory), 200, 'Same live scope authority, including after revoke; at most 100 revisions.'),
} as const
