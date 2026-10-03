import { z } from 'zod'
import { Id, Title, Text, Version, Instant, ObjectRef, PublicCapabilityRef, Budget, Schedule, ModelUsage, ErrorResponse, errorStatus, data, page } from './models.js'

export const chatProtocolVersion = '1.0.0' as const
export const ChatAvailability = z.strictObject({ status: z.enum(['available', 'unavailable', 'disabled']), reason: z.enum(['platform_disabled', 'lab_disabled', 'missing_credentials', 'capability_unavailable', 'owner_authorization_required', 'not_connected']).nullable() })
export const Contact = z.strictObject({ id: Id, labId: Id, displayName: Title, identity: z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('human'), memberId: Id }),
  z.strictObject({ kind: z.literal('personal_agent'), ownerMemberId: Id }),
  z.strictObject({ kind: z.literal('public_agent'), ownerMemberId: Id, capability: PublicCapabilityRef }),
]), availability: ChatAvailability, version: Version })
export const ConversationMember = z.strictObject({ contactId: Id, role: z.enum(['owner', 'member']), status: z.enum(['invited', 'joined', 'declined', 'revoked']), version: Version })
export const Conversation = z.strictObject({ id: Id, labId: Id, kind: z.enum(['personal', 'direct', 'group']), title: Title, ownerMemberId: Id, version: Version, members: z.array(ConversationMember).max(100), taskIds: z.array(Id).max(100), lastSequence: z.number().int().nonnegative(), createdAt: Instant, updatedAt: Instant, allowedActions: z.array(z.enum(['send', 'invite', 'manage'])).max(3) })
export const Mention = z.strictObject({ contactId: Id, start: z.number().int().nonnegative(), end: z.number().int().positive() })
export const ChatResource = z.strictObject({ kind: z.enum(['plan', 'task', 'assignment', 'run', 'deliverable', 'artifact']), ref: ObjectRef })
export const SharedContext = z.strictObject({ selectedText: Text.nullable(), artifactRefs: z.array(ObjectRef).max(10) })
// These are typed proposals, never executable model tool calls or arbitrary URLs.
export const ChatActionPayload = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('create_group'), title: Title, plan: ObjectRef, contactIds: z.array(Id).min(1).max(99), sharedContext: SharedContext }),
  z.strictObject({ kind: z.literal('invite_contact'), contactId: Id }),
  z.strictObject({ kind: z.literal('invite_task'), contactId: Id, task: ObjectRef, scope: Text, schedule: Schedule }),
  z.strictObject({ kind: z.literal('run_task'), contactId: Id, task: ObjectRef, capability: PublicCapabilityRef, budget: Budget, inputArtifactRefs: z.array(ObjectRef).max(10) }),
])
export const ChatAction = z.strictObject({ id: Id, conversationId: Id, sourceMessageId: Id, payload: ChatActionPayload, status: z.enum(['proposed', 'applied', 'dismissed', 'stale']), version: Version, createdAt: Instant, expiresAt: Instant, allowedDecisions: z.array(z.enum(['confirm', 'dismiss'])).max(2) })
export const AgentTurn = z.strictObject({ id: Id, conversationId: Id, inputMessageId: Id, agentContactId: Id, status: z.enum(['queued', 'running', 'waiting_input', 'succeeded', 'unavailable', 'failed', 'interrupted', 'cancelled']), failure: z.enum(['MODEL_UNAVAILABLE', 'INVALID_MODEL_OUTPUT', 'MODEL_FAILED', 'LEASE_EXPIRED_USAGE_UNCERTAIN', 'AUTHORITY_CHANGED', 'INPUT_CHANGED', 'BUDGET_EXCEEDED']).nullable(), availability: ChatAvailability, outputMessageId: Id.nullable(), usage: ModelUsage.nullable(), budget: Budget, remainingBudget: Budget.nullable(), allowedActions: z.array(z.enum(['cancel','retry'])).max(2), version: Version, createdAt: Instant, updatedAt: Instant })
export const ChatMessage = z.strictObject({ id: Id, conversationId: Id, sequence: z.number().int().positive(), senderContactId: Id.nullable(), origin: z.enum(['human', 'model', 'service']), text: Text.nullable(), mentions: z.array(Mention).max(20), resources: z.array(ChatResource).max(20), actionIds: z.array(Id).max(10), turnId: Id.nullable(), createdAt: Instant })
export const SendChatMessage = z.strictObject({ text: Text, mentions: z.array(Mention).max(20).default([]), intent: z.enum(['chat', 'ask_agent']).default('chat'), agentContactId: Id.nullable().default(null), budget: Budget.nullable().default(null), context: z.array(ChatResource).max(20).default([]) }).superRefine((v, c) => {
  if (v.intent === 'ask_agent' && (!v.agentContactId || !v.budget)) c.addIssue({ code: 'custom', message: 'Explicit agent and bounded budget required' })
  if (v.intent === 'chat' && (v.agentContactId || v.budget)) c.addIssue({ code: 'custom', message: 'Ordinary chat cannot dispatch an agent' })
  const seen = new Set<string>(); let previousEnd = 0
  for (const mention of v.mentions) {
    if (mention.end <= mention.start || mention.end > v.text.length || mention.start < previousEnd || seen.has(mention.contactId)) c.addIssue({ code: 'custom', message: 'Mentions must be ordered, non-overlapping UTF-16 ranges with unique contacts' })
    previousEnd = mention.end; seen.add(mention.contactId)
  }
})
export type Contact = z.infer<typeof Contact>
export type Conversation = z.infer<typeof Conversation>
export type ChatMessage = z.infer<typeof ChatMessage>
export type ChatAction = z.infer<typeof ChatAction>
export type AgentTurn = z.infer<typeof AgentTurn>
export type SendChatMessage = z.input<typeof SendChatMessage>

const empty = z.strictObject({})
const id = z.strictObject({ id: Id })
const pagination = z.strictObject({ cursor: z.string().min(1).max(2048).optional(), limit: z.number().int().min(1).max(100).default(30) })
const headers = z.strictObject({ 'Idempotency-Key': z.string().regex(/^[A-Za-z0-9_-]{16,128}$/) })
function route<P extends z.ZodType, Q extends z.ZodType, B extends z.ZodType, R extends z.ZodType>(method: 'GET' | 'POST', path: string, params: P, query: Q, body: B, response: R, status: number, rule: string) {
  return { method, path: `/api/v1${path}`, stage: 'CHAT1' as const, implemented: true, access: 'session', status, rule, idempotent: method !== 'GET', request: z.strictObject({ params, query, body, headers: method === 'GET' ? empty : headers }), response, errors: ErrorResponse, errorStatuses: errorStatus }
}
export const chatRoutes = {
  chatContacts: route('GET', '/chat/contacts', empty, pagination.extend({ search: z.string().max(200).optional() }), z.null(), page(Contact), 200, 'Current lab public humans, member personal agent identity and ownership metadata, and configured public capabilities; private history remains owner-only, other agents require group-specific owner approval; ACL before search/page.'),
  personalConversation: route('POST', '/chat/personal-conversation', empty, empty, empty, data(z.strictObject({ conversation: Conversation, agent: Contact })), 200, 'Ensure unique personal agent and conversation for current member; never exposes another owner history.'),
  chatConversations: route('GET', '/chat/conversations', empty, pagination, z.null(), page(Conversation), 200, 'Joined member only; pinned personal first then updatedAt/id descending.'),
  chatConversation: route('GET', '/chat/conversations/{id}', id, empty, z.null(), data(Conversation), 200, 'Joined member only; invitation is not group read authority.'),
  createDirectConversation: route('POST', '/chat/direct-conversations', empty, empty, z.strictObject({ contactId: Id }), data(Conversation), 200, 'Unique same-lab human pair; own agent resolves personal conversation. Other personal agents and public agents cannot be opened as direct chats in CHAT1.'),
  chatMessages: route('GET', '/chat/conversations/{id}/messages', id, pagination.extend({ afterSequence: z.number().int().nonnegative().optional() }), z.null(), page(ChatMessage), 200, 'Authorized immutable messages ordered by sequence; cursor and afterSequence mutually exclusive.'),
  sendChatMessage: route('POST', '/chat/conversations/{id}/messages', id, empty, SendChatMessage, data(z.strictObject({ message: ChatMessage, turn: AgentTurn.nullable() })), 201, 'Persist human message first; explicit ask_agent queues durable turn or returns persisted unavailable turn; ordinary mentions never execute tasks.'),
  chatTurn: route('GET', '/chat/turns/{id}', id, empty, z.null(), data(AgentTurn), 200, 'Conversation ACL and original turn owner only; poll actual model state.'),
  cancelChatTurn: route('POST', '/chat/turns/{id}/cancel', id, empty, z.strictObject({ expectedVersion: Version }), data(AgentTurn), 200, 'Original turn owner; queued/running/waiting_input only; fence late output.'),
  retryChatTurn: route('POST', '/chat/turns/{id}/retry', id, empty, z.strictObject({ expectedVersion: Version, budget: Budget }), data(AgentTurn), 202, 'Explicit owner retry creates new turn against persisted input and reauthorized current context; never automatically retries uncertain usage.'),
  chatActions: route('GET', '/chat/conversations/{id}/actions', id, pagination, z.null(), page(ChatAction), 200, 'Visible proposal and receipt history; allowedDecisions from current business authority, never model assertions.'),
  decideChatAction: route('POST', '/chat/actions/{id}/decision', id, empty, z.strictObject({ expectedVersion: Version, expectedConversationVersion: Version, decision: z.enum(['confirm', 'dismiss']) }), data(z.strictObject({ action: ChatAction, conversationId: Id, resources: z.array(ChatResource).max(100) })), 200, 'Confirm exact immutable proposal only; transaction rechecks ACL/versions and invokes canonical task commands; receipt links authority objects.'),
  chatInvitations: route('GET', '/chat/invitations', empty, pagination, z.null(), page(z.strictObject({ id: Id, conversationId: Id, title: Title, invitedContactId: Id, invitedByMemberId: Id, status: z.enum(['pending', 'accepted', 'declined', 'revoked']), version: Version })), 200, 'Current invitee or invited agent owner; summary only before acceptance.'),
  decideChatInvitation: route('POST', '/chat/invitations/{id}/decision', id, empty, z.strictObject({ expectedVersion: Version, decision: z.enum(['accept', 'decline']) }), data(ConversationMember), 200, 'Human invitee or personal agent owner only; acceptance authorizes that agent only within this group, never owner private history or task commitment.'),
  revokeChatMember: route('POST', '/chat/conversations/{id}/members/{contactId}/revoke', z.strictObject({ id: Id, contactId: Id }), empty, z.strictObject({ expectedVersion: Version, expectedConversationVersion: Version, reason: Text }), data(ConversationMember), 200, 'Group owner; revoke membership, fence turns, invalidate group projections. Canonical task permissions remain independently enforced; no silent withdrawal of accepted commitments.'),
} as const
