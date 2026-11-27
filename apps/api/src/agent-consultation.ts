import { AgentConsultation, type Contact, type Conversation, type RequestFor } from '@research-agent-platform/contracts'
import type { ChatService } from './chat.js'
import { fail } from './errors.js'
import { requireActiveAgent } from './agent-lifecycle.js'
import { personalModelRuntime } from './personal-models.js'

export function visitorAgent(chat: ChatService, contact: Contact) {
  return contact.identity.kind === 'personal_agent' && contact.identity.ownerMemberId !== chat.c.actor.id
}

export function consultationAgent(chat: ChatService, conversation: Conversation) {
  if (conversation.kind !== 'direct') return undefined
  const selfId = chat.human().id
  const peer = conversation.members.find(member => member.contactId !== selfId && member.status === 'joined')
  if (!peer) return undefined
  const contact = chat.contact(peer.contactId)
  return visitorAgent(chat, contact) ? contact : undefined
}

export function consultationPolicy(chat: ChatService, contactId: string) {
  const row = chat.db.prepare('SELECT mode,version FROM agent_consultations WHERE contact_id=?').get(contactId)
  return { mode: row?.mode === 'free' ? 'free' as const : 'closed' as const, version: Number(row?.version ?? 0) }
}

export function consultationContact(chat: ChatService, contactId: string, edit = false) {
  const contact = chat.baseContact(contactId)
  if (contact.identity.kind !== 'personal_agent' || contact.groupConversationId) fail('NOT_FOUND')
  requireActiveAgent(chat.db, contactId)
  if (edit && visitorAgent(chat, contact)) fail('FORBIDDEN')
  return contact
}

export function agentConsultation(chat: ChatService, contactId: string) {
  const contact = consultationContact(chat, contactId)
  const policy = consultationPolicy(chat, contactId)
  const canEdit = !visitorAgent(chat, contact)
  return AgentConsultation.parse({ contactId, ...policy, canEdit, canChat: !canEdit && policy.mode === 'free' })
}

export function updateAgentConsultation(chat: ChatService, contactId: string, body: RequestFor<'updateAgentConsultation'>['body']) {
  consultationContact(chat, contactId, true)
  const policy = consultationPolicy(chat, contactId)
  chat.c.checkVersion(policy.version, body.expectedVersion)
  if (policy.mode !== body.mode) {
    chat.db.prepare(`INSERT INTO agent_consultations VALUES (?,?,1)
      ON CONFLICT(contact_id) DO UPDATE SET mode=excluded.mode, version=agent_consultations.version+1`).run(contactId, body.mode)
  }
  return agentConsultation(chat, contactId)
}

export function consultationAvailability(chat: ChatService): Contact['availability'] {
  const model = personalModelRuntime(chat.db, chat.c.actor, chat.config)
  if (!chat.config.aiEnabled) return { status: 'unavailable', reason: 'platform_disabled' }
  if (model.source !== 'personal') return { status: 'unavailable', reason: 'missing_credentials' }
  if (model.disabled) return { status: 'disabled', reason: null }
  return model.enabled ? { status: 'available', reason: null } : { status: 'unavailable', reason: 'missing_credentials' }
}
