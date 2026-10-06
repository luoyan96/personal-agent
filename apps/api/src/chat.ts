import { randomUUID, createHmac } from 'node:crypto'
import { z } from 'zod'
import { Contact, Conversation, ConversationMember, ConversationViewerState, ChatMessage, ChatAction, ChatActionPayload, AgentTurn, SendChatMessage, ChatResource, routes, chatRoutes, agentIntegrationRoutes, personalAssistantRoutes } from '@research-agent-platform/contracts'
import type { RequestFor } from '@research-agent-platform/contracts'
import { Collaboration } from './collaboration.js'
import { AiService, canonical, instant } from './ai.js'
import { hash, signingKey } from './auth.js'
import { labAiRuntime } from './lab-ai-settings.js'
import { chatModelFingerprint, connectionRow, connectionState as connectionStateForReplay } from './agent-connections.js'
import { personalModelRuntime } from './personal-models.js'
import type { Config } from './config.js'
import { fail } from './errors.js'
import { ContactDirectory, directoryCommands } from './contact-directory.js'
import { fileReadMetadata,pageNumbersFromQuestion } from './agent-files.js'
import type { FileDocument, ParsedAgentFile } from './agent-files.js'
import type { AgentFileSelection } from '@research-agent-platform/contracts'
import { personalCommands,handleMemory,memory,memorySettings,ownLocalMemoryScope,personalMemoryContext,memoryCommand } from './personal-memories.js'
import { handleFollowup,followup,followupCommand } from './personal-followups.js'
import { personalWorkRequest,assistantDirectoryFingerprint,unsupportedCollaboration } from './personal-assistant.js'
import { isAgentCreationCommand, legacyTurnDocument } from './agent-creation.js'
import { startContinuous,extendContinuous,currentTurnText,supersedeTurn,turnProgress,abortChatCall } from './continuous-chat.js'
import type { ContinuousInput } from './continuous-chat.js'

export type ChatCommand = keyof typeof chatRoutes | keyof typeof agentIntegrationRoutes | keyof typeof personalAssistantRoutes | 'imCreateGroup' | 'imInviteContact'
type Resource = z.infer<typeof ChatResource>
export type TurnInput = { continuous?:ContinuousInput; budget: { maxTokens: number; maxSeconds: number }; context: Resource[]; conversationVersion: number; inputSequence: number; agentContextFingerprint?: string; modelSelectionFingerprint?:string; dailyChat?:boolean; personalAssistant?:boolean; assistantMode?:'coordinate'; delegatedByTurnId?:string; personalMemoryFingerprint?:string; assistantDirectoryFingerprint?:string; assistantReceipt?:AgentTurn['assistantReceipt'];memoryReceipt?:AgentTurn['memoryReceipt'];followupReceipt?:AgentTurn['followupReceipt']; externalConsent?:boolean; externalAgent?:boolean; externalConnectionVersion?:number; purpose?:'create_agent'; createdAgent?:AgentTurn['createdAgent']; creationFailure?:'AGENT_LIMIT_REACHED'; assistantFailure?:'AGENT_LIMIT_REACHED'; fileDocument?:FileDocument; fileSource?:AgentFileSelection; fileRead?:AgentTurn['fileRead']; modelOutputDiagnostic?:{stage:string;returnedTextLength:number;trimEmpty:boolean;maxOutputTokens:number;reasoningEffort:string;finishReason?:string;failure?:string;errorCategory?:string} }
export type ChatRequest = { params: { id?: string; contactId?: string }; query: { cursor?: string; limit?: number; search?: string; afterSequence?: number; view?: 'directory'|'mine'; direction?: 'all'|'incoming'|'outgoing'; status?: 'all'|'pending'|'confirmed'|'candidate'|'revoked'|'active'|'paused'|'completed'|'cancelled'; scope?: 'private_agent'|'conversation'|'local'|'global'; scopeId?: string }; headers: { 'Idempotency-Key'?: string }; body: unknown }
type Request = ChatRequest
const decode = (value: unknown) => JSON.parse(String(value))
const encode = JSON.stringify
export class ChatService {
  constructor(readonly c: Collaboration, readonly config: Config,readonly clock:()=>number=Date.now) {}
  get db() { return this.c.db }
  get directory() { return new ContactDirectory(this) }
  get ai() { const r = labAiRuntime(this.db, this.c.actor.labId, this.config); return new AiService(this.c, r.enabled, r.model) }
  availability(): Contact['availability'] {
    const personal=personalModelRuntime(this.db,this.c.actor,this.config)
    if(personal.source==='personal')return {status:personal.enabled?'available':personal.disabled?'disabled':'unavailable',reason:personal.enabled||personal.disabled?null:!this.config.aiEnabled?'platform_disabled':'missing_credentials'}
    const s = this.db.prepare('SELECT enabled,encrypted_api_key FROM lab_ai_settings WHERE lab_id=?').get(this.c.actor.labId)
    const reason = !this.config.aiEnabled ? 'platform_disabled' : s?.enabled !== 1 ? 'lab_disabled' : !s.encrypted_api_key || !this.ai.enabled ? 'missing_credentials' : null
    return { status: reason ? 'unavailable' as const : 'available' as const, reason }
  }
  ensureContacts() {
    const insert = (kind: string, owner: string, principal: string) => {
      const id = `contact_${hash(`${this.c.actor.labId}:${kind}:${principal}`).slice(0, 40)}`
      this.db.prepare('INSERT INTO chat_contacts VALUES (?,?,?,?,?) ON CONFLICT(lab_id,kind,principal) DO NOTHING').run(id, this.c.actor.labId, kind, owner, principal)
    }
    for (const r of this.db.prepare('SELECT m.id FROM members m JOIN auth_accounts a ON a.member_id=m.id WHERE m.lab_id=? AND a.disabled=0').all(this.c.actor.labId)) {
      insert('human', String(r.id), String(r.id)); insert('personal_agent', String(r.id), String(r.id))
    }
    const cap = this.ai.capability(); if (cap) insert('public_agent', cap.ownerId, cap.id)
  }
  ensureMemberContacts(memberId:string){
    const member=this.db.prepare('SELECT m.lab_id FROM members m JOIN auth_accounts a ON a.member_id=m.id WHERE m.id=? AND a.disabled=0').get(memberId)
    if(!member)fail('NOT_FOUND')
    for(const kind of ['human','personal_agent']){
      const id=`contact_${hash(`${member.lab_id}:${kind}:${memberId}`).slice(0,40)}`
      this.db.prepare('INSERT INTO chat_contacts VALUES (?,?,?,?,?) ON CONFLICT(lab_id,kind,principal) DO NOTHING').run(id,member.lab_id!,kind,memberId,memberId)
    }
  }
  mineContactIds(){
    return this.db.prepare(`SELECT id FROM chat_contacts WHERE owner_id=?
      UNION SELECT target_contact_id FROM chat_contact_requests WHERE requester_id=? AND status='accepted'
      UNION SELECT peer.id FROM chat_contact_requests r JOIN chat_contacts target ON target.id=r.target_contact_id AND target.kind='human'
        JOIN chat_contacts peer ON peer.kind='human' AND peer.owner_id=r.requester_id
        JOIN members m ON m.id=peer.owner_id AND m.lab_id=peer.lab_id
        WHERE r.decider_id=? AND r.status='accepted'`).all(this.c.actor.id,this.c.actor.id,this.c.actor.id).map(row=>String(row.id??row.target_contact_id))
  }
  human(memberId = this.c.actor.id) {
    this.ensureMemberContacts(memberId)
    const row = this.db.prepare("SELECT c.id FROM chat_contacts c JOIN members m ON m.id=c.principal AND m.lab_id=c.lab_id WHERE c.kind='human' AND c.principal=?").get(memberId)
    if (!row) fail('NOT_FOUND'); return this.contact(String(row.id))
  }
  contact(id: string): Contact { return this.directory.contact(id) }
  baseContact(id: string): Contact {
    const row = this.db.prepare('SELECT * FROM chat_contacts WHERE id=?').get(id)
    if (!row) fail('NOT_FOUND')
    const owner = this.db.prepare('SELECT m.display_name,m.version,a.disabled,a.username FROM members m JOIN auth_accounts a ON a.member_id=m.id WHERE m.id=? AND m.lab_id=?').get(row.owner_id!, row.lab_id!)
    if (!owner || owner.disabled !== 0) fail('NOT_FOUND')
    const base = { id, labId: row.lab_id, version: owner.version }
    if (row.kind === 'human') return Contact.parse({ ...base, username:owner.username, displayName: owner.display_name, identity: { kind: 'human', memberId: row.principal }, availability: { status: 'available', reason: null } })
    if (row.kind === 'personal_agent') {
      const authorized = row.owner_id === this.c.actor.id || !!this.db.prepare("SELECT 1 FROM chat_members agent JOIN chat_members human ON human.conversation_id=agent.conversation_id JOIN chat_contacts self ON self.id=human.contact_id WHERE agent.contact_id=? AND agent.status='joined' AND human.status='joined' AND self.owner_id=? AND self.kind='human'").get(id, this.c.actor.id)
      return Contact.parse({ ...base, displayName: `${owner.display_name}的个人助理`, identity: { kind: 'personal_agent', ownerMemberId: row.owner_id }, availability: authorized ? this.availability() : { status: 'unavailable', reason: 'owner_authorization_required' } })
    }
    if(row.lab_id!==this.c.actor.labId)fail('NOT_FOUND')
    const cap = this.ai.capability(); if (!cap || cap.id !== row.principal || cap.ownerId !== row.owner_id) fail('NOT_FOUND')
    return Contact.parse({ ...base, version: cap.version, displayName: cap.name, identity: { kind: 'public_agent', ownerMemberId: cap.ownerId, capability: { id: cap.id, version: cap.version, visibility: 'lab_public' } }, availability: cap.status === 'available' ? this.availability() : { status: 'unavailable', reason: 'capability_unavailable' } })
  }
  conversation(id: string, withViewerState = true): Conversation {
    const row = this.db.prepare('SELECT * FROM chat_conversations WHERE id=?').get(id)
    if(row && row.kind!=='direct' && row.lab_id!==this.c.actor.labId)fail('NOT_FOUND')
    if (!row || (row.kind === 'personal' && row.owner_id !== this.c.actor.id)) fail('NOT_FOUND')
    const self = this.human().id
    // Authorizing an owned AI to participate is independent from the owner's
    // human browser membership. Agent-only acceptance must not reveal history.
    const joined = this.db.prepare("SELECT 1 FROM chat_members WHERE conversation_id=? AND status='joined' AND contact_id=?").get(id, self)
    if (!joined) fail('NOT_FOUND')
    const value = Conversation.parse(decode(row.document))
    value.members = this.db.prepare('SELECT contact_id,role,status,version FROM chat_members WHERE conversation_id=? ORDER BY contact_id').all(id).map(r => ConversationMember.parse({ contactId: r.contact_id, role: r.role, status: r.status, version: r.version }))
    value.allowedActions = value.kind === 'group' && value.ownerMemberId === this.c.actor.id ? ['send', 'invite', 'manage'] : value.members.some(m => m.contactId === self && m.status === 'joined') ? ['send'] : []
    if(value.ownerMemberId===this.c.actor.id)value.allowedActions.push('manage_memory')
    // Task association is an ACL-filtered directory, not a grant.
    value.taskIds = value.taskIds.filter(taskId => { try { this.c.taskRow(taskId); return true } catch { return false } })
    if (value.kind === 'direct') {
      const other = value.members.find(member => member.contactId !== self)
      if (other) {
        const contact=this.contact(other.contactId);if(!contact.allowedActions.includes('chat'))fail('NOT_FOUND');value.title=contact.displayName
      }
    } else if(value.kind==='personal') {
      const agent=value.members.find(member=>member.contactId!==self)
      if(agent)value.title=this.contact(agent.contactId).displayName
    }
    if (withViewerState) value.viewerState = this.viewerState(value)
    return value
  }
  viewerState(group: Conversation): ConversationViewerState {
    const stored = this.db.prepare('SELECT * FROM chat_viewer_states WHERE conversation_id=? AND member_id=?').get(group.id, this.c.actor.id)
    const readSequence = Number(stored?.read_sequence ?? 0), self = this.human().id
    // Use the same live message projection as chatMessages; sequence gaps caused
    // by hidden model output never turn into observable unread counts.
    const unreadCount = this.db.prepare('SELECT id,document FROM chat_messages WHERE conversation_id=? AND sequence>? ORDER BY sequence').all(group.id, readSequence).filter(row => {
      const message = ChatMessage.parse(decode(row.document))
      if (message.origin === 'human' && message.senderContactId === self) return false
      try { this.projectedMessage(String(row.id)); return true } catch { return false }
    }).length
    return ConversationViewerState.parse({ readSequence, unreadCount, pinned: group.kind === 'personal' || stored?.pinned === 1, version: Number(stored?.version ?? 1) })
  }
  ensureViewerState(id: string) {
    this.db.prepare('INSERT INTO chat_viewer_states (conversation_id,member_id) VALUES (?,?) ON CONFLICT(conversation_id,member_id) DO NOTHING').run(id, this.c.actor.id)
  }
  saveConversation(value: Conversation) {
    const { viewerState: _viewerState, ...document } = value
    this.db.prepare('UPDATE chat_conversations SET document=? WHERE id=?').run(encode(document), value.id)
  }
  rawConversation(id: string): Conversation { return Conversation.parse(decode(this.db.prepare('SELECT document FROM chat_conversations WHERE id=?').get(id)!.document)) }
  newConversation(kind: Conversation['kind'], title: string, contactIds: string[], scope: string | null, taskIds: string[] = []) {
    if (scope) { const old = this.db.prepare('SELECT id FROM chat_conversations WHERE scope_key=?').get(scope); if (old) return this.conversation(String(old.id)) }
    const value = Conversation.parse({ id: randomUUID(), labId: this.c.actor.labId, kind, title, ownerMemberId: this.c.actor.id, version: 1, members: [], taskIds, lastSequence: 0, createdAt: instant(), updatedAt: instant(), allowedActions: [] })
    const { viewerState: _viewerState, ...document } = value
    this.db.prepare('INSERT INTO chat_conversations VALUES (?,?,?,?,?,?)').run(value.id, value.labId, value.ownerMemberId, kind, scope, encode(document))
    const self = this.human().id
    for (const contactId of new Set([self, ...contactIds])) {
      const contact = this.contact(contactId)
      if(kind==='group' && contact.labId!==this.c.actor.labId)fail('FORBIDDEN')
      const status = kind !== 'group' || contactId === self || contact.identity.kind === 'public_agent' ? 'joined' : 'invited'
      this.db.prepare('INSERT INTO chat_members VALUES (?,?,?,?,?)').run(value.id, contactId, status, 1, contactId === self ? 'owner' : 'member')
      if (status === 'invited') this.inviteDocument(value, contactId)
    }
    return this.conversation(value.id)
  }
  inviteDocument(group: Conversation, contactId: string) {
    const previous = this.db.prepare('SELECT document FROM chat_invitations WHERE conversation_id=? AND contact_id=?').get(group.id, contactId)
    const invitation = { id: previous ? decode(previous.document).id : randomUUID(), conversationId: group.id, title: group.title, invitedContactId: contactId, invitedByMemberId: this.c.actor.id, status: 'pending', version: previous ? decode(previous.document).version + 1 : 1 }
    this.db.prepare('INSERT INTO chat_invitations VALUES (?,?,?,?,?) ON CONFLICT(conversation_id,contact_id) DO UPDATE SET invited_by=excluded.invited_by,document=excluded.document').run(invitation.id, group.id, contactId, this.c.actor.id, encode(invitation))
  }
  invitation(id: string) {
    const row = this.db.prepare('SELECT i.* FROM chat_invitations i JOIN chat_conversations c ON c.id=i.conversation_id WHERE i.id=? AND c.lab_id=?').get(id, this.c.actor.labId)
    if (!row) fail('NOT_FOUND')
    const contact = this.contact(String(row.contact_id))
    if ((contact.identity.kind === 'human' && contact.identity.memberId !== this.c.actor.id) || (contact.identity.kind === 'personal_agent' && contact.identity.ownerMemberId !== this.c.actor.id) || contact.identity.kind === 'public_agent') fail('NOT_FOUND')
    return decode(row.document) as { id: string; conversationId: string; title: string; invitedContactId: string; invitedByMemberId: string; status: string; version: number }
  }
  joinedAgent(group: Conversation, contactId: string) {
    const contact = this.contact(contactId)
    if (!group.members.some(m => m.contactId === contactId && m.status === 'joined')) fail('NOT_FOUND')
    if (contact.identity.kind === 'human') fail('VALIDATION_ERROR')
    if (group.kind === 'personal' && (contact.identity.kind !== 'personal_agent'||contact.profile.role!=='coordinator'||contact.identity.ownerMemberId!==this.c.actor.id)) fail('FORBIDDEN')
    if (group.kind==='direct')this.directory.requireDirect(contact)
    if (contact.identity.kind === 'personal_agent'&&!contact.agentRuntime) contact.availability = this.availability()
    return contact
  }
  checkResource(ref: Resource, conversationId: string, exact = false, full = false) {
    const group = this.conversation(conversationId, false)
    let taskId: string | undefined, version: number
    switch (ref.kind) {
      case 'plan': { if (group.kind !== 'personal') fail('FORBIDDEN'); version = this.c.plan(ref.ref.id).version; break }
      case 'task': {
        const t = exact || full ? this.c.task(ref.ref.id) : this.c.taskRow(ref.ref.id)
        taskId = ref.ref.id; version = Number(t.version); if (t.status === 'cancelled') fail('INVALID_STATE'); break
      }
      case 'assignment': { const a = this.c.assignment(ref.ref.id).model; taskId = a.taskId; version = a.version; break }
      case 'deliverable': { const d = this.c.deliverable(ref.ref.id); taskId = d.taskId; version = d.version; break }
      case 'run': { const r = this.ai.projectedRun(ref.ref.id); taskId = r.taskId; version = r.version; break }
      case 'artifact': { const a = this.c.coordination.artifact(ref.ref.id).model; taskId = a.taskId; version = a.version; break }
    }
    if (group.kind === 'group' && taskId && !this.rawConversation(group.id).taskIds.includes(taskId)) fail('FORBIDDEN')
    if (group.kind === 'direct') fail('FORBIDDEN')
    if (exact) this.c.checkVersion(version, ref.ref.version)
  }
  checkTurnInput(turnId: string, exact = true) {
    const row = this.db.prepare('SELECT * FROM chat_turns WHERE id=?').get(turnId); if (!row) fail('NOT_FOUND')
    const input = decode(row.request_json) as TurnInput, turn = this.materializedTurn(row)
    const group = this.conversation(turn.conversationId, false); this.joinedAgent(group, turn.agentContactId)
    if(input.purpose==='create_agent') {
      const agent=this.contact(turn.agentContactId),message=this.projectedMessage(turn.inputMessageId)
      if(!input.dailyChat||group.kind!=='personal'||group.ownerMemberId!==this.c.actor.id||agent.identity.kind!=='personal_agent'||agent.identity.ownerMemberId!==this.c.actor.id||agent.profile.role!=='coordinator'||message.origin!=='human'||message.senderContactId!==this.human().id||!isAgentCreationCommand(currentTurnText(this,turnId)))fail('FORBIDDEN')
    }
    if(input.externalAgent){const connection=connectionRow(this,turn.agentContactId);if(!input.dailyChat||!input.externalConsent||group.kind!=='direct'||!connection?.configured||connection.version!==input.externalConnectionVersion)fail('FORBIDDEN')}
    if(input.personalMemoryFingerprint&&exact&&input.personalMemoryFingerprint!==personalMemoryContext(this,this.contact(turn.agentContactId),group,currentTurnText(this,turnId)).fingerprint)fail('VERSION_CONFLICT')
    if(input.assistantMode==='coordinate'&&exact&&input.assistantDirectoryFingerprint!==assistantDirectoryFingerprint(this))fail('VERSION_CONFLICT')
    if(input.assistantMode==='coordinate'&&(group.kind!=='personal'||group.ownerMemberId!==this.c.actor.id||this.contact(turn.agentContactId).profile.role!=='coordinator'||!personalWorkRequest(currentTurnText(this,turnId))))fail('FORBIDDEN')
    if(input.delegatedByTurnId){const parent=this.db.prepare('SELECT owner_id,status,request_json,document FROM chat_turns WHERE id=?').get(input.delegatedByTurnId);if(!parent||parent.owner_id!==this.c.actor.id||parent.status!=='succeeded'||JSON.parse(String(parent.request_json)).assistantMode!=='coordinate'||this.projectedMessage(turn.inputMessageId).text!==currentTurnText(this,input.delegatedByTurnId))fail('FORBIDDEN')}
    if(input.fileSource)this.fileDocument(input.fileSource.messageId,group.id)
    if (exact) this.c.checkVersion(group.version, input.conversationVersion)
    if(exact && input.modelSelectionFingerprint && input.modelSelectionFingerprint!==chatModelFingerprint(this,turn.agentContactId,personalModelRuntime(this.db,this.c.actor,this.config).fingerprint))fail('VERSION_CONFLICT')
    if (exact && !input.externalAgent && input.agentContextFingerprint && input.agentContextFingerprint!==this.directory.modelContext(turn.agentContactId,group.id).fingerprint)fail('VERSION_CONFLICT')
    for (const ref of input.context) this.checkResource(ref, group.id, exact, true)
    return { row, turn, input, group }
  }
  turn(id: string) {
    const row=this.db.prepare('SELECT * FROM chat_turns WHERE id=? AND owner_id=?').get(id,this.c.actor.id)
    if(!row)fail('NOT_FOUND')
    const turn=this.materializedTurn(row);this.conversation(turn.conversationId, false)
    if(turn.createdAgent){
      try{const contact=this.contact(turn.createdAgent.contactId),direct=this.conversation(turn.createdAgent.conversationId,false)
        if(turn.status!=='succeeded'||contact.identity.kind!=='personal_agent'||contact.identity.ownerMemberId!==this.c.actor.id||contact.profile.role!=='specialist'||direct.kind!=='direct'||direct.ownerMemberId!==this.c.actor.id||!direct.members.some(m=>m.contactId===contact.id&&m.status==='joined'))turn.createdAgent=null
        else turn.createdAgent.displayName=contact.displayName
      }catch{turn.createdAgent=null}
    }
    const root=decode(this.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(row.root_id!)!.request_json) as TurnInput
    if(turn.assistantReceipt?.kind==='delegate'){
      const receipt=turn.assistantReceipt
      try{const direct=this.conversation(receipt.conversationId,false),contact=this.contact(receipt.contactId),message=this.projectedMessage(receipt.messageId),child=this.db.prepare('SELECT id,root_id,owner_id,document FROM chat_turns WHERE id=?').get(message.turnId!)
        if(turn.status!=='succeeded'||direct.kind!=='direct'||direct.ownerMemberId!==this.c.actor.id||contact.identity.kind!=='personal_agent'||contact.identity.ownerMemberId!==this.c.actor.id||contact.agentRuntime||message.conversationId!==direct.id||!child||child.root_id!==row.root_id||child.owner_id!==this.c.actor.id||decode(child.document).agentContactId!==contact.id)delete turn.assistantReceipt
        else{receipt.turnId=String(child.id);receipt.displayName=contact.displayName}
      }catch{delete turn.assistantReceipt}
    }
    const attempts=this.db.prepare('SELECT turn_id,usage_json FROM chat_attempts WHERE root_id=?').all(row.root_id!)
    turn.budget=root.budget;turn.remainingBudget=null;turn.allowedActions=[]
    const unknown=attempts.some(r=>!r.usage_json||decode(r.usage_json).inputTokens===null||decode(r.usage_json).outputTokens===null)
    if(!unknown){
      const used=attempts.reduce<{tokens:number;seconds:number}>((v,r)=>{const u=decode(r.usage_json);return {tokens:v.tokens+u.inputTokens+u.outputTokens,seconds:v.seconds+u.elapsedMs/1000}},{tokens:0,seconds:0})
      const remaining={maxTokens:root.budget.maxTokens-used.tokens,maxSeconds:Math.floor(root.budget.maxSeconds-used.seconds)}
      if(remaining.maxTokens>0&&remaining.maxSeconds>0)turn.remainingBudget=remaining
    }
    const currentAttempt=attempts.find(r=>r.turn_id===turn.id);if(currentAttempt?.usage_json)turn.usage=decode(currentAttempt.usage_json)
    try{
      const {group}=this.checkTurnInput(id,true);turn.availability=this.joinedAgent(group,turn.agentContactId).availability
      if(['queued','running','waiting_input'].includes(turn.status))turn.allowedActions.push('cancel')
      const active=!!this.db.prepare("SELECT 1 FROM chat_turns WHERE root_id=? AND status IN ('queued','running','waiting_input')").get(row.root_id!)
      const latest=this.db.prepare('SELECT id FROM chat_turns WHERE root_id=? ORDER BY rowid DESC LIMIT 1').get(row.root_id!)
      if(!((decode(row.request_json) as TurnInput).continuous?.supersededBy)&&latest?.id===turn.id&&!active&&turn.availability.status==='available'&&turn.remainingBudget&&attempts.length<3&&['unavailable','failed','interrupted','cancelled'].includes(turn.status))turn.allowedActions.push('retry')
    }catch{/* Failure state is visible, but no operation may reuse lost context authority. */}
    // Status remains visible after source/agent revocation; output content has separate live ACL checks.
    return turn
  }
  materializedTurn(row:Record<string,unknown>):AgentTurn {
    const input=decode(row.request_json) as TurnInput
    return AgentTurn.parse({...decode(row.document),...(input.fileRead?{fileRead:input.fileRead}:{}),...(input.assistantReceipt?{assistantReceipt:input.assistantReceipt}:{}),...(input.assistantFailure?{failure:input.assistantFailure}:{}),...(input.memoryReceipt?{memoryReceipt:input.memoryReceipt}:{}),...(input.followupReceipt?{followupReceipt:input.followupReceipt}:{}),...(input.purpose==='create_agent'?{purpose:'create_agent',createdAgent:input.createdAgent??null,...(input.creationFailure?{failure:input.creationFailure}:{})}:{})})
  }
  saveTurn(turn: AgentTurn) {
    const input=decode(this.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(turn.id)!.request_json) as TurnInput
    if(turn.fileRead)input.fileRead=turn.fileRead
    if(turn.assistantReceipt)input.assistantReceipt=turn.assistantReceipt
    if(input.assistantMode==='coordinate')input.assistantFailure=turn.failure==='AGENT_LIMIT_REACHED'?'AGENT_LIMIT_REACHED':undefined
    if(turn.memoryReceipt)input.memoryReceipt=turn.memoryReceipt
    if(turn.followupReceipt)input.followupReceipt=turn.followupReceipt
    if(turn.purpose==='create_agent') {input.purpose='create_agent';input.createdAgent=turn.createdAgent??null;input.creationFailure=turn.failure==='AGENT_LIMIT_REACHED'?'AGENT_LIMIT_REACHED':undefined}
    this.db.prepare('UPDATE chat_turns SET status=?,document=?,request_json=? WHERE id=?').run(turn.status,encode(legacyTurnDocument(turn)),encode(input),turn.id)
  }
  message(groupId: string, value: Omit<ChatMessage, 'id' | 'conversationId' | 'sequence' | 'createdAt'>) {
    const group = this.rawConversation(groupId)
    const message = ChatMessage.parse({ ...value, id: randomUUID(), conversationId: groupId, sequence: group.lastSequence + 1, createdAt: instant() })
    this.db.prepare('INSERT INTO chat_messages VALUES (?,?,?,?)').run(message.id, groupId, message.sequence, encode(legacyChatMessage(message)))
    group.lastSequence++; group.updatedAt = message.createdAt; this.saveConversation(group)
    return message
  }
  projectedMessage(id: string): ChatMessage {
    const row = this.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(id); if (!row) fail('NOT_FOUND')
    const m = ChatMessage.parse(decode(row.document)); this.conversation(m.conversationId, false)
    if (m.origin === 'model' && m.turnId) this.checkTurnInput(m.turnId, false)
    if(m.origin==='human'){const source=this.fileDocumentForMessage(m.id,m.conversationId);if(source)m.files=[source.metadata]}
    m.resources = m.resources.filter(ref => { try { this.checkResource(ref, m.conversationId); return true } catch { return false } })
    m.actionIds = m.actionIds.filter(actionId => { try { this.action(actionId); return true } catch { return false } })
    return m
  }
  assertDailyConversation(id:string){
    const group=this.conversation(id,false),agents=group.members.filter(m=>m.status==='joined'&&this.contact(m.contactId).identity.kind!=='human')
    if(group.kind==='group'||agents.length!==1||!group.members.some(m=>m.contactId===this.human().id&&m.status==='joined'))fail('FORBIDDEN')
    this.joinedAgent(group,agents[0]!.contactId)
    return group
  }
  fileDocumentForMessage(messageId:string,conversationId:string):FileDocument|undefined{
    this.conversation(conversationId,false)
    const message=this.db.prepare('SELECT document FROM chat_messages WHERE id=? AND conversation_id=?').get(messageId,conversationId)
    if(!message)return undefined
    const raw=ChatMessage.parse(decode(message.document))
    if(raw.origin!=='human'||raw.senderContactId!==this.human().id)return undefined
    const rows=this.db.prepare("SELECT request_json FROM chat_turns WHERE json_extract(document,'$.inputMessageId')=? AND conversation_id=? AND owner_id=? ORDER BY rowid").all(messageId,conversationId,this.c.actor.id)
    for(const row of rows){const document=(decode(row.request_json) as TurnInput).fileDocument;if(document?.metadata.messageId===messageId)return document}
    return undefined
  }
  fileDocument(messageId:string,conversationId:string):FileDocument{
    const document=this.fileDocumentForMessage(messageId,conversationId);if(!document)fail('NOT_FOUND');return document
  }
  dailyFileSource(conversationId:string,selection?:AgentFileSelection):AgentFileSelection|undefined{
    if(selection){this.fileDocument(selection.messageId,conversationId);return selection}
    const rows=this.db.prepare('SELECT request_json FROM chat_turns WHERE conversation_id=? AND owner_id=? ORDER BY rowid DESC LIMIT 100').all(conversationId,this.c.actor.id)
    for(const row of rows){const input=decode(row.request_json) as TurnInput;if(input.fileDocument){this.fileDocument(input.fileDocument.metadata.messageId,conversationId);return {messageId:input.fileDocument.metadata.messageId}}}
    return undefined
  }
  action(id: string) {
    const row = this.db.prepare('SELECT * FROM chat_actions WHERE id=?').get(id); if (!row) fail('NOT_FOUND')
    this.checkTurnInput(String(row.turn_id), false)
    const action = ChatAction.parse(decode(row.document)); this.conversation(action.conversationId, false)
    // Owner-only proposals prevent sharing a private plan or model-derived source text.
    if (row.owner_id !== this.c.actor.id) fail('NOT_FOUND')
    action.allowedDecisions = []
    if (action.status === 'proposed' && action.expiresAt > instant()) {
      try { this.checkTurnInput(String(row.turn_id),true);this.validatePayload(action.payload, action.conversationId); action.allowedDecisions = ['confirm', 'dismiss'] } catch { action.status = 'stale' }
    }
    return action
  }
  validatePayload(payload: ChatAction['payload'], groupId: string) {
    const group = this.conversation(groupId, false)
    if (payload.kind === 'create_group') {
      if (group.kind !== 'personal') fail('FORBIDDEN')
      this.validateGroupInput(payload,groupId)
      return
    }
    if (group.kind !== 'group' || (payload.kind !== 'run_task' && group.ownerMemberId !== this.c.actor.id)) fail('FORBIDDEN')
    const contact = this.contact(payload.contactId)
    if(contact.labId!==this.c.actor.labId)fail('FORBIDDEN')
    if (payload.kind === 'invite_contact') return
    if (!group.members.some(m => m.contactId === contact.id && m.status === 'joined')) fail('NOT_FOUND')
    this.checkResource({ kind: 'task', ref: payload.task }, groupId, true)
    const task = this.c.task(payload.task.id)
    if (payload.kind === 'invite_task') {
      if (contact.identity.kind !== 'human' || task.initiatorId !== this.c.actor.id) fail('FORBIDDEN')
      this.c.validateInvitation(task, contact.identity.memberId, payload.schedule)
    } else {
      if (contact.identity.kind !== 'public_agent' || task.leadId !== this.c.actor.id) fail('FORBIDDEN')
      if (canonical(contact.identity.capability) !== canonical(payload.capability)) fail('CAPABILITY_UNAVAILABLE')
      for (const ref of payload.inputArtifactRefs) this.checkResource({ kind: 'artifact', ref }, groupId, true)
      this.ai.validateNewRun(task.id, { expectedVersion: payload.task.version, capability: payload.capability, budget: payload.budget, inputArtifactIds: payload.inputArtifactRefs.map(ref => ref.id), conclusionRefs: [] })
    }
  }
  validateGroupInput(payload:RequestFor<'imCreateGroup'>['body'],groupId:string) {
      if (new Set(payload.contactIds).size !== payload.contactIds.length) fail('VALIDATION_ERROR')
      for(const id of payload.contactIds)if(this.contact(id).labId!==this.c.actor.labId)fail('FORBIDDEN')
      if(payload.plan){
      const plan = this.c.plan(payload.plan.id); this.c.checkVersion(plan.version, payload.plan.version)
      if (plan.status !== 'draft' || !plan.proposedItems.length || plan.proposedItems.length > 20) fail('INVALID_STATE')
      const memberIds = new Set([this.c.actor.id])
      for (const contactId of payload.contactIds) { const contact = this.contact(contactId); if (contact.identity.kind === 'human') memberIds.add(contact.identity.memberId) }
      for (const item of plan.proposedItems) {
        // Canonical confirmPlan auto-dispatches public allocations: require a separate run confirmation in CHAT1.
        if (item.allocation.kind === 'public_agent' || item.inputArtifactIds.length) fail('FORBIDDEN')
        if (item.allocation.kind === 'invitation' && !memberIds.has(item.allocation.memberId)) fail('FORBIDDEN')
      }
      }
      for (const ref of payload.sharedContext.artifactRefs) {
        this.checkResource({ kind: 'artifact', ref }, groupId, true)
        const artifact = this.c.coordination.artifact(ref.id).model
        if (this.c.task(artifact.taskId).initiatorId !== this.c.actor.id) fail('FORBIDDEN')
      }
  }
  createGroup(payload:RequestFor<'imCreateGroup'>['body'],personalId:string) {
    this.validateGroupInput(payload,personalId)
    const taskIds=payload.plan?(this.c.handlers.confirmPlan({params:{id:payload.plan.id},query:{},headers:{},body:{expectedVersion:payload.plan.version}}) as {data:{taskIds:string[]}}).data.taskIds:[]
    const sharedTaskIds=payload.sharedContext.artifactRefs.map(ref=>this.c.coordination.artifact(ref.id).model.taskId)
    const group=this.newConversation('group',payload.title,payload.contactIds,null,[...new Set([...taskIds,...sharedTaskIds])])
    const resources:Resource[]=taskIds.map(id=>({kind:'task',ref:{id,version:this.c.task(id).version}}))
    for(const taskId of taskIds)for(const assignment of this.db.prepare("SELECT id,version FROM assignments WHERE task_id=? AND status='pending'").all(taskId))resources.push({kind:'assignment',ref:{id:String(assignment.id),version:Number(assignment.version)}})
    const shared:Resource[]=[...resources,...payload.sharedContext.artifactRefs.map(ref=>({kind:'artifact' as const,ref}))]
    for(let offset=0;offset<Math.max(shared.length,1);offset+=20)this.message(group.id,{senderContactId:null,origin:'service',text:offset===0?payload.sharedContext.selectedText:null,mentions:[],resources:shared.slice(offset,offset+20),actionIds:[],turnId:null})
    return {group:this.conversation(group.id),resources}
  }
  inviteContact(groupId:string,contactId:string) {
    const group=this.conversation(groupId,false)
    this.validatePayload({kind:'invite_contact',contactId},groupId)
    const contact=this.contact(contactId),existing=group.members.find(m=>m.contactId===contact.id)
    if(existing?.status==='joined'||existing?.status==='invited')fail('INVALID_STATE')
    const status=contact.identity.kind==='public_agent'?'joined':'invited'
    this.db.prepare('INSERT INTO chat_members VALUES (?,?,?,?,?) ON CONFLICT(conversation_id,contact_id) DO UPDATE SET status=excluded.status,version=chat_members.version+1').run(group.id,contact.id,status,1,'member')
    if(status==='invited')this.inviteDocument(group,contact.id)
    const raw=this.rawConversation(group.id);raw.version++;this.saveConversation(raw)
    return this.conversation(group.id)
  }
  addAction(turn: AgentTurn, messageId: string, payload: ChatAction['payload']) {
    this.validatePayload(payload, turn.conversationId)
    const value = ChatAction.parse({ id: randomUUID(), conversationId: turn.conversationId, sourceMessageId: messageId, payload, status: 'proposed', version: 1, createdAt: instant(), expiresAt: new Date(Date.now() + 86400000).toISOString(), allowedDecisions: [] })
    this.db.prepare('INSERT INTO chat_actions VALUES (?,?,?,?,?)').run(value.id, value.conversationId, this.c.actor.id, turn.id, encode(value))
    return value
  }
  newTurn(group: Conversation, message: ChatMessage, agentId: string, input: TurnInput, root?: string) {
    const agent = this.joinedAgent(group, agentId)
    if(input.assistantMode==='coordinate')input.assistantDirectoryFingerprint=assistantDirectoryFingerprint(this)
    const userMemory=personalMemoryContext(this,agent,group,message.text??'');if(userMemory.fingerprint)input.personalMemoryFingerprint=userMemory.fingerprint
    if(connectionRow(this,agentId)?.configured!==1)input.agentContextFingerprint=this.directory.modelContext(agentId,group.id).fingerprint
    input.modelSelectionFingerprint=chatModelFingerprint(this,agentId,personalModelRuntime(this.db,this.c.actor,this.config).fingerprint)
    const connection=connectionRow(this,agentId);if(connection?.configured===1){input.externalAgent=true;input.externalConnectionVersion=connection.version}
    if(root&&this.db.prepare("SELECT 1 FROM chat_turns WHERE root_id=? AND status IN ('queued','running','waiting_input')").get(root))fail('INVALID_STATE')
    if (Number(this.db.prepare("SELECT count(*) n FROM chat_turns WHERE owner_id=? AND status IN ('queued','running')").get(this.c.actor.id)!.n) >= 5) fail('RATE_LIMITED')
    const availability = agent.availability
    const turn = AgentTurn.parse({ id: randomUUID(), conversationId: group.id, inputMessageId: message.id, agentContactId: agentId, status: availability.status === 'available' ? 'queued' : 'unavailable', failure: availability.status === 'available' ? null : 'MODEL_UNAVAILABLE', availability, outputMessageId: null, usage: null, budget: input.budget, remainingBudget: input.budget, allowedActions: [], version: 1, createdAt: instant(), updatedAt: instant() })
    input.createdAgent=undefined;input.creationFailure=undefined;input.assistantFailure=undefined;input.assistantReceipt=undefined;input.memoryReceipt=undefined;input.followupReceipt=undefined
    this.db.prepare('INSERT INTO chat_turns(id,conversation_id,owner_id,root_id,status,request_json,document) VALUES (?,?,?,?,?,?,?)').run(turn.id, group.id, this.c.actor.id, root ?? turn.id, turn.status, encode(input), encode(legacyTurnDocument(turn)))
    return this.turn(turn.id)
  }
  // Persistent snapshot IDs keep signed cursors bounded while preserving sort keys across updates.
  page<T>(name: ChatCommand, query: Request['query'], candidates: string[], project: (id: string) => T) {
    const { cursor, ...filter } = query; const fingerprint = hash(canonical({ actor: { id: this.c.actor.id, labId: this.c.actor.labId }, name, filter }))
    let pageId: string, offset = 0, entries: string[]
    if (cursor) {
      const [id, rawOffset, mac, extra] = cursor.split('.')
      if (!id || !rawOffset || !mac || extra || !/^\d+$/.test(rawOffset) || this.cursorMac(`${id}.${rawOffset}`) !== mac) fail('CURSOR_EXPIRED')
      const row = this.db.prepare('SELECT * FROM chat_pages WHERE id=? AND owner_id=? AND fingerprint=? AND expires_at>?').get(id, this.c.actor.id, fingerprint, Date.now())
      if (!row) fail('CURSOR_EXPIRED'); pageId = id; offset = Number(rawOffset); entries = decode(row.entries)
    } else {
      this.db.prepare('DELETE FROM chat_pages WHERE expires_at<=?').run(Date.now())
      pageId = randomUUID(); entries = candidates.filter(id => { try { project(id); return true } catch { return false } })
      this.db.prepare('INSERT INTO chat_pages VALUES (?,?,?,?,?)').run(pageId, this.c.actor.id, fingerprint, Date.now() + 900000, encode(entries))
    }
    const values: T[] = [], limit = query.limit ?? 30
    while (offset < entries.length && values.length < limit) { const id = entries[offset++]!; try { values.push(project(id)) } catch { /* Current ACL wins over saved snapshot membership. */ } }
    const position = `${pageId}.${offset}`
    return { data: values, nextCursor: offset < entries.length ? `${position}.${this.cursorMac(position)}` : null }
  }
  cursorMac(value: string) { return createHmac('sha256', signingKey(this.db)).update(`chat:${value}`).digest('hex') }
  authorize(name: ChatCommand, req: Request) {
    if(personalCommands.includes(name)){if(req.params.id){if(name.toLowerCase().includes('followup'))followup(this,req.params.id);else memory(this,req.params.id)}return}
    if(this.directory.authorize(name,req))return
    const id = req.params.id
    if (name === 'chatTurn' || name === 'chatTurnProgress' || name === 'cancelChatTurn' || name === 'retryChatTurn') this.turn(id!)
    else if (name === 'decideChatAction') this.action(id!)
    else if (name === 'decideChatInvitation') this.invitation(id!)
    else if (id) {const group=this.conversation(id, false);if(name==='imInviteContact'&&(group.kind!=='group'||group.ownerMemberId!==this.c.actor.id))fail('FORBIDDEN')}
  }
  run(name: ChatCommand, req: Request, parsedFile?:ParsedAgentFile, onlyCached=false): unknown {
    this.ensureContacts(); this.authorize(name, req)
    if(name==='agentFileMessage'){const group=this.assertDailyConversation(req.params.id!);const agent=group.members.find(m=>m.status==='joined'&&this.contact(m.contactId).identity.kind!=='human')!;if(connectionRow(this,agent.contactId)?.configured===1)fail('EXTERNAL_FILES_UNSUPPORTED')}
    const route = routes[name], resource = req.params.id ?? this.c.actor.labId, key = req.headers['Idempotency-Key'], fingerprint = name==='updateAgentConnection'?createHmac('sha256',signingKey(this.db)).update(canonical(req)).digest('hex'):hash(canonical(req))
    const cached = route.idempotent ? this.db.prepare('SELECT request_hash,response_json FROM idempotency_results WHERE actor_id=? AND command=? AND resource_id=? AND key=?').get(this.c.actor.id, name, resource, key!) : null
    if (cached) {
      if (cached.request_hash !== fingerprint) fail('IDEMPOTENCY_CONFLICT')
      const previous = decode(cached.response_json)
      if(personalCommands.includes(name)){if(name==='updatePersonalMemorySettings')return route.response.parse({data:memorySettings(this)});return route.response.parse({data:name.toLowerCase().includes('followup')?followup(this,previous.data.id):memory(this,previous.data.id)})}
      if(['updateAgentConnection','disconnectAgentConnection'].includes(name))return route.response.parse({data:connectionStateForReplay(this,req.params.id!)})
      const directoryReplay=this.directory.replay(name,previous);if(directoryReplay)return route.response.parse(directoryReplay)
      if (name === 'sendChatMessage'||name==='agentChatMessage'||name==='agentFileMessage') {const message=this.projectedMessage(previous.data.message.id);return route.response.parse({ data: { message, turn: message.turnId ? this.turn(message.turnId) : null } })}
      if (name === 'personalConversation') return { data: { conversation: this.conversation(previous.data.conversation.id), agent: this.contact(previous.data.agent.id) } }
      if (name === 'createDirectConversation' || name === 'imCreateGroup' || name === 'imInviteContact') return { data: this.conversation(previous.data.id) }
      if (name === 'markChatRead' || name === 'updateChatPreferences') return { data: this.viewerState(this.conversation(req.params.id!, false)) }
      if (name === 'decideChatAction') { this.conversation(previous.data.conversationId); for (const r of previous.data.resources as Resource[]) this.checkResource(r, previous.data.conversationId) }
      if (name === 'retryChatTurn' || name === 'cancelChatTurn') return { data: this.turn(previous.data.id) }
      return route.response.parse(previous)
    }
    if(onlyCached)return null
    const response = route.response.parse(this.handle(name, req,parsedFile))
    if (route.idempotent) this.db.prepare('INSERT INTO idempotency_results VALUES (?,?,?,?,?,?,?,?)').run(this.c.actor.id, name, resource, key!, fingerprint, encode(response), route.status, instant())
    return response
  }
  handle(name: ChatCommand, req: Request, parsedFile?:ParsedAgentFile): unknown {
    const id = req.params.id!, b = req.body
    if(personalCommands.includes(name))return handleMemory(this,name,req)??handleFollowup(this,name,req)
    if((directoryCommands as readonly string[]).includes(name))return this.directory.handle(name,req)
    if(name==='imCreateGroup'){
      const personal=(this.handle('personalConversation',{params:{},query:{},headers:{},body:{}}) as {data:{conversation:Conversation}}).data.conversation
      return {data:this.createGroup(b as RequestFor<'imCreateGroup'>['body'],personal.id).group}
    }
    if(name==='imInviteContact'){
      const body=b as RequestFor<'imInviteContact'>['body'];this.c.checkVersion(this.conversation(id,false).version,body.expectedConversationVersion)
      return {data:this.inviteContact(id,body.contactId)}
    }
    if (name === 'chatContacts') {
      let discoveredOwner:string|null=null
      if(req.query.scope==='global'){
        if(!req.query.search?.trim())fail('VALIDATION_ERROR')
        const account=this.db.prepare('SELECT member_id FROM auth_accounts WHERE username=? AND disabled=0').get(req.query.search.trim())
        if(account){discoveredOwner=String(account.member_id);this.ensureMemberContacts(discoveredOwner)}
      }
      const project=(id:string)=>{
        const contact=this.contact(id)
        if(req.query.view==='mine'&&!['own','accepted'].includes(contact.relationship.status))fail('NOT_FOUND')
        if(req.query.scope==='global'){
          const owner=contact.identity.kind==='human'?contact.identity.memberId:contact.identity.ownerMemberId
          if(!discoveredOwner||owner!==discoveredOwner||contact.identity.kind==='public_agent')fail('NOT_FOUND')
        } else {
          if(req.query.view!=='mine'&&contact.labId!==this.c.actor.labId)fail('NOT_FOUND')
          if(![contact.username??'',contact.displayName,contact.profile.introduction,contact.profile.capabilityDescription].join(' ').toLocaleLowerCase().includes((req.query.search??'').toLocaleLowerCase()))fail('NOT_FOUND')
        }
        return contact
      }
      const entries=req.query.scope==='global'?discoveredOwner?this.db.prepare("SELECT id FROM chat_contacts WHERE owner_id=? AND kind IN ('human','personal_agent')").all(discoveredOwner).map(row=>String(row.id)):[]:req.query.view==='mine'?this.mineContactIds():this.db.prepare('SELECT id FROM chat_contacts WHERE lab_id=?').all(this.c.actor.labId).map(row=>String(row.id))
      const candidates=entries.filter(id=>{try{project(id);return true}catch{return false}}).sort((a,b)=>this.contact(a).displayName.localeCompare(this.contact(b).displayName)||a.localeCompare(b))
      return this.page(name,req.query,candidates,project)
    }
    if (name === 'personalConversation') {
      const agentId = String(this.db.prepare("SELECT id FROM chat_contacts WHERE lab_id=? AND kind='personal_agent' AND owner_id=? AND principal=owner_id").get(this.c.actor.labId, this.c.actor.id)!.id), agent = this.contact(agentId)
      return { data: { conversation: this.newConversation('personal', agent.displayName, [agentId], `personal:${this.c.actor.labId}:${this.c.actor.id}`), agent } }
    }
    if (name === 'createDirectConversation') {
      const contact = this.contact((b as RequestFor<'createDirectConversation'>['body']).contactId)
      this.directory.requireDirect(contact)
      if (contact.identity.kind === 'personal_agent' && contact.identity.ownerMemberId===this.c.actor.id && contact.profile.role==='coordinator') {
        return { data: (this.handle('personalConversation', { ...req, body: {} }) as { data: { conversation: Conversation } }).data.conversation }
      }
      if (contact.identity.kind === 'human') {
        if(contact.identity.memberId===this.c.actor.id)fail('FORBIDDEN')
        return { data: this.newConversation('direct', contact.displayName, [contact.id], `direct:${[this.c.actor.id, contact.identity.memberId].sort().join(':')}`) }
      }
      return {data:this.newConversation('direct',contact.displayName,[contact.id],`agentdirect:${this.c.actor.id}:${contact.id}`)}
    }
    if (name === 'chatConversation') return { data: this.conversation(id) }
    if (name === 'markChatRead') {
      const group = this.conversation(id, false), body = b as RequestFor<'markChatRead'>['body']
      if (body.throughSequence > group.lastSequence) fail('VALIDATION_ERROR')
      this.ensureViewerState(id)
      this.db.prepare('UPDATE chat_viewer_states SET read_sequence=max(read_sequence,?) WHERE conversation_id=? AND member_id=?').run(body.throughSequence, id, this.c.actor.id)
      return { data: this.viewerState(group) }
    }
    if (name === 'updateChatPreferences') {
      const group = this.conversation(id, false), body = b as RequestFor<'updateChatPreferences'>['body']
      if (group.kind === 'personal' && !body.pinned) fail('INVALID_STATE')
      this.ensureViewerState(id)
      const state = this.db.prepare('SELECT pinned,version FROM chat_viewer_states WHERE conversation_id=? AND member_id=?').get(id, this.c.actor.id)!
      this.c.checkVersion(Number(state.version), body.expectedVersion)
      if ((state.pinned === 1) !== body.pinned && group.kind !== 'personal') this.db.prepare('UPDATE chat_viewer_states SET pinned=?,version=version+1 WHERE conversation_id=? AND member_id=?').run(body.pinned ? 1 : 0, id, this.c.actor.id)
      return { data: this.viewerState(group) }
    }
    if (name === 'chatConversations') {
      // ACL before personalized sorting and page snapshots. State joins are scoped
      // to this actor and never reveal another member's read/pin preferences.
      const candidates = this.db.prepare("SELECT c.id,c.document,s.pinned FROM chat_conversations c JOIN chat_members mine ON mine.conversation_id=c.id AND mine.contact_id=? AND mine.status='joined' LEFT JOIN chat_viewer_states s ON s.conversation_id=c.id AND s.member_id=?").all(this.human().id, this.c.actor.id).flatMap(row => {
        try { return [{ value: this.conversation(String(row.id), false), pinned: row.pinned === 1 }] } catch { return [] }
      }).sort((a, b) => Number(b.value.kind === 'personal') - Number(a.value.kind === 'personal') || Number(b.pinned) - Number(a.pinned) || b.value.updatedAt.localeCompare(a.value.updatedAt) || b.value.id.localeCompare(a.value.id)).map(entry => entry.value.id)
      return this.page(name, req.query, candidates, id => this.conversation(id))
    }
    if (name === 'chatMessages') {
      if (req.query.cursor && req.query.afterSequence !== undefined) fail('VALIDATION_ERROR')
      return this.page(name, { ...req.query, search: id }, this.db.prepare('SELECT id FROM chat_messages WHERE conversation_id=? AND sequence>? ORDER BY sequence').all(id, req.query.afterSequence ?? 0).map(r => String(r.id)), id => this.projectedMessage(id))
    }
    if (name === 'sendChatMessage'||name==='agentChatMessage'||name==='agentFileMessage') {
      const group=this.conversation(id)
      const agents=group.members.filter(m=>m.status==='joined'&&this.contact(m.contactId).identity.kind!=='human')
      if(name!=='sendChatMessage'&&(group.kind==='group'||agents.length!==1))fail('FORBIDDEN')
      const input = SendChatMessage.parse(name!=='sendChatMessage'?{text:(b as {text?:string}).text??'请阅读这个附件，概括要点并说明阅读范围。',intent:'ask_agent',agentContactId:agents[0]!.contactId,budget:{maxTokens:4000,maxSeconds:90}}:b)
      if (!group.members.some(m => m.contactId === this.human().id && m.status === 'joined')) fail('FORBIDDEN')
      for (const mention of input.mentions) {
        const contact = this.contact(mention.contactId)
        if (!group.members.some(m => m.contactId === contact.id && m.status === 'joined') || input.text.slice(mention.start, mention.end) !== `@${contact.displayName}`) fail('VALIDATION_ERROR')
      }
      for (const resource of input.context) this.checkResource(resource, id, true)
      if (input.intent === 'ask_agent') this.joinedAgent(group, input.agentContactId!)
      const external=input.agentContactId&&connectionRow(this,input.agentContactId)?.configured===1
      if(external){if(name==='agentFileMessage'||(b as {fileSelection?:unknown}).fileSelection)fail('EXTERNAL_FILES_UNSUPPORTED');if(name!=='agentChatMessage'||group.kind!=='direct')fail('EXTERNAL_SCOPE_UNSUPPORTED');if((b as {externalConsent?:boolean}).externalConsent!==true)fail('EXTERNAL_CONSENT_REQUIRED');const contact=this.contact(input.agentContactId!);if(!contact.agentRuntime?.callerAllowed)fail('FORBIDDEN')}
      const continuous=name==='agentChatMessage'&&(b as {continuous?:boolean}).continuous===true
      const active=continuous?this.db.prepare("SELECT * FROM chat_turns WHERE owner_id=? AND conversation_id=? AND status IN ('queued','running','waiting_input') ORDER BY rowid DESC").all(this.c.actor.id,id):[]
      let pending=!external?active.find(row=>row.status==='queued'&&(decode(row.request_json) as TurnInput).continuous&&this.clock()<=(decode(row.request_json) as TurnInput).continuous!.dueAt&&(decode(row.request_json) as TurnInput).continuous!.messageIds.length<100):undefined
      for(const row of active)if(row!==pending)supersedeTurn(this,String(row.id))
      const message = this.message(id, { senderContactId: this.human().id, origin: 'human', text: input.text, mentions: input.mentions, resources: input.context, actionIds: [], turnId: null })
      const agent=input.agentContactId?this.contact(input.agentContactId):null
      const purpose=name==='agentChatMessage'&&!(b as {fileSelection?:AgentFileSelection}).fileSelection&&group.kind==='personal'&&group.ownerMemberId===this.c.actor.id&&agent?.identity.kind==='personal_agent'&&agent.identity.ownerMemberId===this.c.actor.id&&agent.profile.role==='coordinator'&&isAgentCreationCommand(input.text)?'create_agent' as const:undefined
      // A fresh explicit creation/work imperative after small talk is a new
      // request, not permission inferred from a quoted/older first sentence.
      if(pending){const old=decode(pending.request_json) as TurnInput;if(purpose&&old.purpose!=='create_agent'||!purpose&&!old.assistantMode&&!old.fileSource&&group.kind==='personal'&&agent?.profile.role==='coordinator'&&personalWorkRequest(input.text)){supersedeTurn(this,String(pending.id));pending=undefined}}
      const management=name==='agentChatMessage'&&!purpose&&!(b as {fileSelection?:unknown}).fileSelection&&agent&&ownLocalMemoryScope(this,agent,group)?{memory:memoryCommand(this,input.text,message),followup:followupCommand(this,input.text,message)}:null
      const limitation=name==='agentChatMessage'&&!purpose&&!(b as {fileSelection?:unknown}).fileSelection&&group.kind==='personal'&&agent?.profile.role==='coordinator'?unsupportedCollaboration(this,input.text):null
      if(management?.memory||management?.followup||limitation){if(pending)supersedeTurn(this,String(pending.id));const turn=this.newTurn(group,message,input.agentContactId!,{budget:input.budget!,context:[],conversationVersion:group.version,inputSequence:message.sequence,dailyChat:true,personalAssistant:true});const result=management?.memory??management?.followup;if(management?.memory)turn.memoryReceipt=management.memory.receipt;else if(management?.followup)turn.followupReceipt=management.followup.receipt;const response=this.message(group.id,{senderContactId:input.agentContactId!,origin:'service',text:result?.text??limitation!,mentions:[],resources:[],actionIds:[],turnId:turn.id});turn.status='succeeded';turn.failure=null;turn.outputMessageId=response.id;turn.version++;turn.updatedAt=instant();this.saveTurn(turn);message.turnId=turn.id;this.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(encode(legacyChatMessage(message)),message.id);return {data:{message:this.projectedMessage(message.id),turn:this.turn(turn.id)}}}
      let fileSource=name==='agentFileMessage'?{messageId:message.id}:name==='agentChatMessage'&&!purpose&&!external?this.dailyFileSource(group.id,(b as {fileSelection?:AgentFileSelection}).fileSelection):undefined
      const fileDocument=name==='agentFileMessage'&&parsedFile?{...parsedFile,metadata:{...parsedFile.metadata,messageId:message.id}}:undefined
      if(name==='agentFileMessage'&&!fileDocument)fail('INVALID_STATE')
      if(fileSource){const document=fileDocument??this.fileDocument(fileSource.messageId,group.id);const questionPages=pageNumbersFromQuestion(input.text);const numbers=fileSource.pageNumbers??(questionPages.length?[...new Set(questionPages)]:undefined);if(numbers?.some(n=>!document.pages.some(page=>page.pageNumber===n)))fail('FILE_PAGE_UNAVAILABLE');fileSource={...fileSource,...(numbers?{pageNumbers:numbers}:{} )}}
      const nextInput:TurnInput={budget:input.budget!,context:input.context,conversationVersion:group.version,inputSequence:message.sequence,dailyChat:name!=='sendChatMessage',...(external?{externalConsent:true}:{}),...(purpose?{purpose}:{}),...(name==='agentChatMessage'&&!purpose&&!fileSource&&group.kind==='personal'&&agent?.profile.role==='coordinator'&&personalWorkRequest(input.text)?{personalAssistant:true,assistantMode:'coordinate' as const}:{}),...(fileDocument?{fileDocument}:{}),...(fileSource?{fileSource,fileRead:fileReadMetadata(fileDocument??this.fileDocument(fileSource.messageId,group.id))}:{})}
      let turn:AgentTurn|null=null
      let merge=pending
      if(merge){try{this.checkTurnInput(String(merge.id))}catch{supersedeTurn(this,String(merge.id));merge=undefined}}
      if(merge){
        const previous=decode(merge.request_json) as TurnInput
        nextInput.continuous=extendContinuous(previous.continuous!,message.id,this.clock())
        // New current submissions can retract a pending instruction. Explicit
        // negation/correction wins over a creation/work imperative in this batch.
        const retracted=/^(?:先)?(?:别|不要|不用|停止|取消|算了)|^(?:先给|只要|只需|改为|改成)/.test(input.text.trim())
        if(retracted)nextInput.continuous.structuredSuppressed=true
        this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(encode(nextInput),merge.id!)
        const combined=currentTurnText(this,String(merge.id))
        nextInput.purpose=!nextInput.continuous.structuredSuppressed&&!fileSource&&group.kind==='personal'&&agent?.profile.role==='coordinator'&&isAgentCreationCommand(combined)?'create_agent':undefined
        nextInput.assistantMode=!nextInput.continuous.structuredSuppressed&&!nextInput.purpose&&!fileSource&&group.kind==='personal'&&agent?.profile.role==='coordinator'&&personalWorkRequest(combined)?'coordinate':undefined
        nextInput.personalAssistant=nextInput.assistantMode==='coordinate'||undefined
        nextInput.personalMemoryFingerprint=personalMemoryContext(this,agent!,group,combined).fingerprint||undefined
        nextInput.agentContextFingerprint=this.directory.modelContext(input.agentContactId!,group.id).fingerprint
        nextInput.modelSelectionFingerprint=chatModelFingerprint(this,input.agentContactId!,personalModelRuntime(this.db,this.c.actor,this.config).fingerprint)
        if(nextInput.assistantMode)nextInput.assistantDirectoryFingerprint=assistantDirectoryFingerprint(this)
        const value=this.materializedTurn(merge);delete value.purpose;delete value.createdAgent;value.inputMessageId=message.id;value.version++;value.updatedAt=instant()
        this.db.prepare('UPDATE chat_turns SET request_json=?,document=? WHERE id=?').run(encode(nextInput),encode(legacyTurnDocument(value)),merge.id!)
        turn=this.turn(String(merge.id))
      }else if(input.intent==='ask_agent'){
        if(continuous){nextInput.continuous=startContinuous(message.id,this.clock());if(external)nextInput.continuous.dueAt=this.clock()}
        turn=this.newTurn(group,message,input.agentContactId!,nextInput)
      }
      if(turn&&continuous)for(const row of active)if(String(row.id)!==turn.id){const old=decode(this.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(row.id!)!.request_json) as TurnInput;if(old.continuous){old.continuous.supersededBy=turn.id;old.continuous.revision++;old.continuous.text='';old.continuous.updatedAt=instant();this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(encode(old),row.id!)}}

      if (turn) { message.turnId = turn.id; this.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(encode(legacyChatMessage(message)), message.id) }
      return { data: { message:this.projectedMessage(message.id), turn } }
    }
    if (name === 'chatTurn') return { data: this.turn(id) }
    if(name==='chatTurnProgress')return {data:turnProgress(this,id)}
    if (name === 'cancelChatTurn') {
      const turn = this.turn(id); this.c.checkVersion(turn.version, (b as RequestFor<'cancelChatTurn'>['body']).expectedVersion)
      if (!['queued', 'running', 'waiting_input'].includes(turn.status)) fail('INVALID_STATE')
      abortChatCall(id);turn.status = 'cancelled'; turn.version++; turn.updatedAt = instant(); this.saveTurn(turn)
      this.db.prepare('UPDATE chat_turns SET fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE id=?').run(id)
      return { data: this.turn(turn.id) }
    }
    if (name === 'retryChatTurn') {
      const { row, turn, input, group } = this.checkTurnInput(id, false), body = b as RequestFor<'retryChatTurn'>['body']; this.c.checkVersion(turn.version, body.expectedVersion)
      if (!['unavailable', 'failed', 'interrupted', 'cancelled'].includes(turn.status)) fail('INVALID_STATE')
      const attempts = this.db.prepare('SELECT usage_json FROM chat_attempts WHERE root_id=?').all(row.root_id!)
      if (attempts.length >= 3 || attempts.some(r => !r.usage_json || decode(r.usage_json).inputTokens === null || decode(r.usage_json).outputTokens === null)) fail('INVALID_STATE')
      const original = decode(this.db.prepare('SELECT request_json FROM chat_turns WHERE id=?').get(row.root_id!)!.request_json) as TurnInput
      const used = attempts.reduce<{ tokens: number; seconds: number }>((sum, r) => { const u = decode(r.usage_json); return { tokens: sum.tokens + u.inputTokens + u.outputTokens, seconds: sum.seconds + u.elapsedMs / 1000 } }, { tokens: 0, seconds: 0 })
      if (body.budget.maxTokens > original.budget.maxTokens - used.tokens || body.budget.maxSeconds > original.budget.maxSeconds - used.seconds) fail('INVALID_STATE')
      // Current versions and memberships must be explicitly reauthorized; stale context requires a new user message.
      for (const ref of input.context) this.checkResource(ref, group.id, true)
      const projected=this.turn(id);if(!projected.allowedActions.includes('retry'))fail('INVALID_STATE')
      const message = this.projectedMessage(turn.inputMessageId)
      const retried=this.newTurn(group,message,turn.agentContactId,{...input,budget:body.budget,conversationVersion:group.version},String(row.root_id))
      message.turnId=retried.id;this.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(encode(legacyChatMessage(message)),message.id)
      return { data: retried }
    }
    if (name === 'chatActions') return this.page(name, { ...req.query, search: id }, this.db.prepare('SELECT id FROM chat_actions WHERE conversation_id=? ORDER BY rowid DESC').all(id).map(r => String(r.id)), id => this.action(id))
    if (name === 'chatInvitations') return this.page(name, req.query, this.db.prepare("SELECT i.id FROM chat_invitations i JOIN chat_contacts c ON c.id=i.contact_id WHERE c.owner_id=? AND c.kind IN ('human','personal_agent') ORDER BY i.rowid DESC").all(this.c.actor.id).map(r => String(r.id)), id => this.invitation(id))
    if (name === 'decideChatInvitation') {
      const invitation = this.invitation(id), body = b as RequestFor<'decideChatInvitation'>['body']; this.c.checkVersion(invitation.version, body.expectedVersion)
      if (invitation.status !== 'pending') fail('INVALID_STATE')
      invitation.status = body.decision === 'accept' ? 'accepted' : 'declined'; invitation.version++
      this.db.prepare('UPDATE chat_invitations SET document=? WHERE id=?').run(encode(invitation), id)
      this.db.prepare('UPDATE chat_members SET status=?,version=version+1 WHERE conversation_id=? AND contact_id=? AND status=\'invited\'').run(body.decision === 'accept' ? 'joined' : 'declined', invitation.conversationId, invitation.invitedContactId)
      const group = this.rawConversation(invitation.conversationId); group.version++; this.saveConversation(group)
      const member = this.db.prepare('SELECT * FROM chat_members WHERE conversation_id=? AND contact_id=?').get(group.id, invitation.invitedContactId)!
      return { data: { contactId: member.contact_id, role: member.role, status: member.status, version: member.version } }
    }
    if (name === 'revokeChatMember') {
      const group = this.conversation(id), body = b as RequestFor<'revokeChatMember'>['body']; if (group.kind !== 'group' || group.ownerMemberId !== this.c.actor.id) fail('FORBIDDEN')
      this.c.checkVersion(group.version, body.expectedConversationVersion)
      const member = group.members.find(m => m.contactId === req.params.contactId); if (!member) fail('NOT_FOUND')
      if (member.role === 'owner' || member.status === 'revoked') fail('INVALID_STATE'); this.c.checkVersion(member.version, body.expectedVersion)
      member.status = 'revoked'; member.version++
      this.db.prepare('UPDATE chat_members SET status=?,version=? WHERE conversation_id=? AND contact_id=?').run(member.status, member.version, id, member.contactId)
      const invitation = this.db.prepare('SELECT document FROM chat_invitations WHERE conversation_id=? AND contact_id=?').get(id, member.contactId)
      if (invitation) { const v = decode(invitation.document); v.status = 'revoked'; v.version++; this.db.prepare('UPDATE chat_invitations SET document=? WHERE id=?').run(encode(v), v.id) }
      const raw = this.rawConversation(id); raw.version++; this.saveConversation(raw)
      return { data: member }
    }
    if (name === 'decideChatAction') {
      const action = this.action(id), body = b as RequestFor<'decideChatAction'>['body'], group = this.conversation(action.conversationId)
      this.c.checkVersion(action.version, body.expectedVersion); this.c.checkVersion(group.version, body.expectedConversationVersion)
      if (action.status !== 'proposed' || action.expiresAt <= instant()) fail('INVALID_STATE')
      const resources: Resource[] = []; let conversationId = group.id
      if (body.decision === 'confirm') {
        this.validatePayload(action.payload, group.id)
        const payload = action.payload
        if (payload.kind === 'create_group') {
          const created=this.createGroup(payload,group.id)
          conversationId=created.group.id;resources.push(...created.resources)
        } else if (payload.kind === 'invite_contact') {
          this.inviteContact(group.id,payload.contactId)
        } else if (payload.kind === 'invite_task') {
          const contact = this.contact(payload.contactId); if (contact.identity.kind !== 'human') fail('FORBIDDEN')
          const result = this.c.handlers.invite({ params: { id: payload.task.id }, query: {}, headers: {}, body: { expectedVersion: payload.task.version, memberId: contact.identity.memberId, scope: payload.scope, schedule: payload.schedule } }) as { data: { id: string; version: number } }
          resources.push({ kind: 'assignment', ref: { id: result.data.id, version: result.data.version } })
          resources.push({kind:'task',ref:{id:payload.task.id,version:this.c.task(payload.task.id).version}})
        } else {
          const result = this.ai.handle('run', { params: { id: payload.task.id }, query: {}, headers: {}, body: { expectedVersion: payload.task.version, capability: payload.capability, budget: payload.budget, inputArtifactIds: payload.inputArtifactRefs.map(ref => ref.id), conclusionRefs: [] } }) as { data: { id: string; version: number } }
          resources.push({ kind: 'run', ref: { id: result.data.id, version: result.data.version } })
        }
      }
      action.status = body.decision === 'confirm' ? 'applied' : 'dismissed'; action.version++; action.allowedDecisions = []
      this.db.prepare('UPDATE chat_actions SET document=? WHERE id=?').run(encode(action), action.id)
      if (resources.length && action.payload.kind !== 'create_group') this.message(conversationId, { senderContactId: null, origin: 'service', text: null, mentions: [], resources, actionIds: [], turnId: null })
      return { data: { action, conversationId, resources } }
    }
    fail('NOT_IMPLEMENTED')
  }
}

export function legacyChatMessage(message:ChatMessage){const {files:_files,...document}=message;return document}
