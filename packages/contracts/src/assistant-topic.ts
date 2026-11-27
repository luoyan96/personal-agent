import { z } from 'zod'
import { Id, Version, Instant, ErrorResponse, errorStatus, data, page } from './models.js'

/**
 * Assistant topics are the personal-assistant domain's topic sub-item. They are
 * owner and agent scoped, not conversation scoped: one personal assistant has one
 * conversation. Preferences stay in personal_memories and assistant notes stay in
 * assistant_memories; a topic body never becomes either of them automatically.
 */
export const AssistantTopicState = z.enum(['active', 'paused', 'closed'])
export const AssistantTopicTitleStatus = z.enum(['provisional', 'final'])
export const AssistantTopicOrigin = z.enum(['curator', 'owner'])

const EntryText = z.string().trim().min(1).max(150)

/** Stored decisions carry a server-assigned id so a patch can retire one by id. */
export const AssistantTopicDecision = z.strictObject({
  id: Id,
  text: EntryText,
})

/** Input decisions may omit the id; the service assigns one and never reuses it. */
export const AssistantTopicDecisionInput = z.strictObject({
  id: Id.optional(),
  text: EntryText,
})

export const AssistantTopicNote = z.strictObject({
  kind: z.enum(['observation', 'idea', 'risk', 'reference', 'other']).default('observation'),
  text: z.string().trim().min(1).max(300),
  importance: z.enum(['low', 'medium', 'high']).default('medium'),
  status: z.enum(['observed', 'confirmed', 'obsolete']).default('observed'),
  sourceRefs: z.array(Id).max(5).default([]),
})

/** Stored body: four current-state sections. `context` is gone; notes stays unopened.
 *  Byte limits are enforced by the service. */
export const AssistantTopicBody = z.strictObject({
  decisions: z.array(AssistantTopicDecision).max(8).default([]),
  openQuestions: z.array(EntryText).max(10).default([]),
  next: z.array(EntryText).max(10).default([]),
  constraints: z.array(EntryText).max(10).default([]),
  notes: z.array(AssistantTopicNote).max(10).default([]),
})
export const emptyAssistantTopicBody = AssistantTopicBody.parse({})

/** Input body: same sections, decision ids optional because the service owns them. */
export const AssistantTopicBodyInput = z.strictObject({
  decisions: z.array(AssistantTopicDecisionInput).max(8).default([]),
  openQuestions: z.array(EntryText).max(10).default([]),
  next: z.array(EntryText).max(10).default([]),
  constraints: z.array(EntryText).max(10).default([]),
  notes: z.array(AssistantTopicNote).max(10).default([]),
})
const emptyAssistantTopicBodyInput = AssistantTopicBodyInput.parse({})

export const AssistantTopic = z.strictObject({
  id: Id,
  assistantId: Id,
  title: z.string().trim().min(1).max(60),
  titleStatus: AssistantTopicTitleStatus,
  summary: z.string().trim().min(1).max(600),
  body: AssistantTopicBody,
  state: AssistantTopicState,
  origin: AssistantTopicOrigin,
  version: Version,
  lastActiveAt: Instant,
  createdAt: Instant,
  updatedAt: Instant,
  allowedActions: z.array(z.enum(['edit', 'close', 'resume'])).max(3),
})

/** Retrieval projection: title and summary only; detail is fetched by id. */
export const AssistantTopicIndex = z.strictObject({
  id: Id,
  assistantId: Id,
  title: z.string().min(1).max(60),
  titleStatus: AssistantTopicTitleStatus,
  summary: z.string().min(1).max(600),
  state: AssistantTopicState,
  origin: AssistantTopicOrigin,
  version: Version,
  lastActiveAt: Instant,
  updatedAt: Instant,
})

export const AssistantTopicInput = z.strictObject({
  assistantId: Id,
  title: z.string().trim().min(1).max(60),
  summary: z.string().trim().min(1).max(600),
  body: AssistantTopicBodyInput.default(emptyAssistantTopicBodyInput),
})

export const AssistantTopicUpdate = z.strictObject({
  expectedVersion: Version,
  title: z.string().trim().min(1).max(60).optional(),
  summary: z.string().trim().min(1).max(600).optional(),
  body: AssistantTopicBodyInput.optional(),
})

export const AssistantTopicHistory = z.strictObject({
  topic: AssistantTopic,
  revisions: z.array(AssistantTopic).max(100),
})

export type AssistantTopicState = z.infer<typeof AssistantTopicState>
export type AssistantTopicBody = z.infer<typeof AssistantTopicBody>
export type AssistantTopicBodyInput = z.infer<typeof AssistantTopicBodyInput>
export type AssistantTopicDecision = z.infer<typeof AssistantTopicDecision>
export type AssistantTopic = z.infer<typeof AssistantTopic>
export type AssistantTopicIndex = z.infer<typeof AssistantTopicIndex>
export type AssistantTopicInput = z.infer<typeof AssistantTopicInput>
export type AssistantTopicUpdate = z.infer<typeof AssistantTopicUpdate>
export type AssistantTopicHistory = z.infer<typeof AssistantTopicHistory>

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

export const assistantTopicRoutes = {
  assistantTopics: route('GET', '/me/assistant-topics', empty, pagination.extend({ assistantId: Id, state: z.enum(['active', 'paused', 'closed', 'all']).default('all') }), z.null(), page(AssistantTopicIndex), 200, 'Current owner only. Lists own agent topics by state; index fields only, no body.'),
  assistantTopic: route('GET', '/me/assistant-topics/{id}', id, empty, z.null(), data(AssistantTopic), 200, 'Current owner only. Full topic including body; closed topics stay readable.'),
  createAssistantTopic: route('POST', '/me/assistant-topics', empty, empty, AssistantTopicInput, data(AssistantTopic), 201, 'Owner manual creation for an owned personal_agent. Joins the single active topic slot; no model call.'),
  updateAssistantTopic: route('POST', '/me/assistant-topics/{id}', id, empty, AssistantTopicUpdate, data(AssistantTopic), 200, 'Current owner only; exact version; title, summary or body. Body stays within 4KB and notes within 10 items.'),
  closeAssistantTopic: route('POST', '/me/assistant-topics/{id}/close', id, empty, z.strictObject({ expectedVersion: Version }), data(AssistantTopic), 200, 'Current owner only; exact version. Closes the topic without deleting it; closed topics are never injected and stay readable and resumable.'),
  resumeAssistantTopic: route('POST', '/me/assistant-topics/{id}/resume', id, empty, z.strictObject({ expectedVersion: Version }), data(AssistantTopic), 200, 'Current owner only; exact version. Resumes a paused or closed topic and pauses the previous active topic for this assistant.'),
  assistantTopicHistory: route('GET', '/me/assistant-topics/{id}/history', id, empty, z.null(), data(AssistantTopicHistory), 200, 'Current owner only. At most 100 revisions, newest first after reverse; closed topics keep history.'),
} as const
