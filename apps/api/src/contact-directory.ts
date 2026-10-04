import { randomUUID } from 'node:crypto'
import { Contact, ContactProfile, ContactRequest, ChatMemory } from '@research-agent-platform/contracts'
import type { RequestFor } from '@research-agent-platform/contracts'
import type { ChatService, ChatCommand, ChatRequest } from './chat.js'
import { canonical, instant } from './ai.js'
import { hash } from './auth.js'
import { fail } from './errors.js'
import { isLabManager } from './invite-management.js'

export const directoryCommands = ['chatContact','updateContactProfile','createPersonalAgent','requestContact','contactRequests','decideContactRequest','revokeContact','revokeContactRequest','chatMemories','createChatMemory','reviseChatMemory','revokeChatMemory','chatMemoryHistory'] as const
export class ContactDirectory {
  constructor(readonly chat: ChatService) {}
  get db() { return this.chat.db }
  get actor() { return this.chat.c.actor }
  profile(id: string): ContactProfile & {displayName:string|null} {
    const row = this.db.prepare('SELECT * FROM chat_contacts WHERE id=? AND lab_id=?').get(id, this.actor.labId)
    if (!row) fail('NOT_FOUND')
    const role = row.kind === 'human' ? 'human' : row.kind === 'public_agent' ? 'public_capability' : row.principal === row.owner_id ? 'coordinator' : 'specialist'
    this.db.prepare('INSERT INTO chat_contact_profiles(contact_id,role) VALUES (?,?) ON CONFLICT(contact_id) DO NOTHING').run(id, role)
    const p = this.db.prepare('SELECT * FROM chat_contact_profiles WHERE contact_id=?').get(id)!
    return { ...ContactProfile.parse({ role:p.role, introduction:p.introduction, capabilityDescription:p.capability_description, personality:p.personality, version:p.version }), displayName: p.display_name as string|null }
  }
  relationKey(contact: Contact) {
    if (contact.identity.kind === 'human') return `human:${this.actor.labId}:${[this.actor.id,contact.identity.memberId].sort().join(':')}`
    return `agent:${this.actor.labId}:${this.actor.id}:${contact.id}`
  }
  relationRow(contact: Contact) { return this.db.prepare('SELECT * FROM chat_contact_requests WHERE relation_key=?').get(this.relationKey(contact)) }
  owns(contact: Contact) { return contact.identity.kind === 'human' ? contact.identity.memberId === this.actor.id : contact.identity.kind === 'personal_agent' && contact.identity.ownerMemberId === this.actor.id }
  mayEdit(contact: Contact) { return this.owns(contact) || (contact.identity.kind === 'public_agent' && isLabManager(this.db,this.actor)) }
  contact(id: string): Contact {
    const value = this.chat.baseContact(id), p = this.profile(id), { displayName, ...profile } = p
    value.profile = profile; if (displayName) value.displayName = displayName
    const own = this.owns(value), relation = own ? undefined : this.relationRow(value)
    value.relationship = own ? {status:'own',requestId:null,version:0} : relation ? { status: relation.status==='pending' ? relation.requester_id===this.actor.id?'pending_outbound':'pending_inbound' : relation.status as 'accepted'|'declined'|'revoked', requestId:String(relation.id),version:Number(relation.version) } : {status:'none',requestId:null,version:0}
    value.allowedActions=[]
    if ((own && value.identity.kind!=='human') || relation?.status==='accepted') value.allowedActions.push('chat')
    if (!own && (!relation || ['declined','revoked'].includes(String(relation.status)))) value.allowedActions.push('request')
    if (!own && relation && ['pending','accepted'].includes(String(relation.status))) value.allowedActions.push('remove')
    if (this.mayEdit(value)) value.allowedActions.push('edit_profile')
    if (value.identity.kind==='personal_agent' && own) value.allowedActions.push('manage_private_memory')
    if (value.identity.kind==='personal_agent' && relation?.status==='accepted') value.availability=this.chat.availability()
    return Contact.parse(value)
  }
  requireDirect(contact: Contact) { if (!contact.allowedActions.includes('chat')) fail('FORBIDDEN') }
  request(id: string): ContactRequest {
    const row=this.db.prepare('SELECT * FROM chat_contact_requests WHERE id=? AND lab_id=?').get(id,this.actor.labId)
    if(!row || (row.requester_id!==this.actor.id && row.decider_id!==this.actor.id))fail('NOT_FOUND')
    this.chat.baseContact(String(row.target_contact_id)); const requester=this.chat.human(String(row.requester_id))
    return ContactRequest.parse({id:row.id,requesterMemberId:row.requester_id,requesterContactId:requester.id,targetContactId:row.target_contact_id,deciderMemberId:row.decider_id,status:row.status,version:row.version,createdAt:row.created_at,updatedAt:row.updated_at,allowedDecisions:row.decider_id===this.actor.id&&row.status==='pending'?['accept','decline']:[]})
  }
  revokeRequest(id:string, expectedVersion:number) {
    const request=this.request(id); this.chat.c.checkVersion(request.version,expectedVersion)
    if(!['pending','accepted'].includes(request.status))fail('INVALID_STATE')
    this.db.prepare("UPDATE chat_contact_requests SET status='revoked',version=version+1,updated_at=? WHERE id=?").run(instant(),id)
    return this.request(id)
  }
  memoryScope(scope: ChatMemory['scope'],scopeId:string, write=false) {
    if(scope==='private_agent') {
      const contact=this.contact(scopeId)
      if(contact.identity.kind!=='personal_agent'||contact.identity.ownerMemberId!==this.actor.id)fail('NOT_FOUND')
    } else {
      const conversation=this.chat.conversation(scopeId,false)
      if(write && conversation.ownerMemberId!==this.actor.id)fail('FORBIDDEN')
    }
  }
  memory(id:string,write=false):ChatMemory {
    const row=this.db.prepare('SELECT * FROM chat_memories WHERE id=? AND lab_id=?').get(id,this.actor.labId)
    if(!row)fail('NOT_FOUND')
    this.memoryScope(row.scope as ChatMemory['scope'],String(row.scope_id),write)
    let mayWrite=true;try{this.memoryScope(row.scope as ChatMemory['scope'],String(row.scope_id),true)}catch{mayWrite=false}
    return ChatMemory.parse({id,scope:row.scope,scopeId:row.scope_id,content:row.content,source:row.source,status:row.status,version:row.version,createdByMemberId:row.created_by,createdAt:row.created_at,updatedAt:row.updated_at,allowedActions:mayWrite&&row.status==='active'?['edit','revoke']:[]})
  }
  saveMemory(value:ChatMemory) {
    const {allowedActions:_allowed,...revision}=value
    this.db.prepare('INSERT INTO chat_memory_revisions VALUES (?,?,?)').run(value.id,value.version,JSON.stringify({...revision,allowedActions:[]}))
  }
  modelContext(agentId:string,conversationId:string) {
    const agent=this.contact(agentId), conversation=this.chat.conversation(conversationId,false)
    const privateAllowed=agent.identity.kind==='personal_agent' && agent.identity.ownerMemberId===this.actor.id && (conversation.kind==='personal'||conversation.kind==='direct')
    const rows=this.db.prepare("SELECT id FROM chat_memories WHERE lab_id=? AND status='active' AND ((scope='conversation' AND scope_id=?) OR (scope='private_agent' AND scope_id=?)) ORDER BY id").all(this.actor.labId,conversationId,privateAllowed?agentId:'')
    const memories=rows.map(row=>this.memory(String(row.id)))
    const relation=this.relationRow(agent)
    // Coordinator recommendations depend on the bounded public roster. A changed
    // candidate profile cannot leave an older matching proposal publishable.
    const roster=agent.profile.role==='coordinator'&&conversation.kind==='personal'?this.db.prepare('SELECT id FROM chat_contacts WHERE lab_id=? ORDER BY id').all(this.actor.labId).flatMap(row=>{try{const c=this.contact(String(row.id));return [{id:c.id,version:c.version,profileVersion:c.profile.version}]}catch{return []}}).slice(0,100):null
    const fingerprint=hash(canonical({agentId,agentVersion:agent.version,profileVersion:agent.profile.version,roster,relation:conversation.kind==='direct'?{id:relation?.id??null,version:relation?.version??0,status:relation?.status??'own'}:null,memories:memories.map(m=>({id:m.id,version:m.version}))}))
    return {agent, memories:memories.map(({allowedActions:_allowed,...memory})=>memory), fingerprint}
  }
  authorize(name:ChatCommand,req:ChatRequest) {
    if(!(directoryCommands as readonly string[]).includes(name))return false
    const id=req.params.id!
    if(['chatContact','requestContact','revokeContact','updateContactProfile'].includes(name)) {
      const contact=this.contact(id); if(name==='updateContactProfile'&&!this.mayEdit(contact))fail('FORBIDDEN')
    } else if(['decideContactRequest','revokeContactRequest'].includes(name)) {
      const request=this.request(id); if(name==='decideContactRequest'&&request.deciderMemberId!==this.actor.id)fail('FORBIDDEN')
    } else if(name==='chatMemories') this.memoryScope(req.query.scope as ChatMemory['scope'],req.query.scopeId!)
    else if(name==='createChatMemory') {const b=req.body as RequestFor<'createChatMemory'>['body'];this.memoryScope(b.scope,b.scopeId,true)}
    else if(['reviseChatMemory','revokeChatMemory','chatMemoryHistory'].includes(name))this.memory(id,name!=='chatMemoryHistory')
    return true
  }
  replay(name:ChatCommand,previous:any) {
    if(['chatContact','requestContact','revokeContact','updateContactProfile','createPersonalAgent'].includes(name)) return {data:this.contact(previous.data.id)}
    if(['decideContactRequest','revokeContactRequest'].includes(name))return {data:this.request(previous.data.id)}
    if(['createChatMemory','reviseChatMemory','revokeChatMemory'].includes(name))return {data:this.memory(previous.data.id,true)}
    return undefined
  }
  handle(name:ChatCommand,req:ChatRequest):unknown {
    const id=req.params.id!,b=req.body
    if(name==='chatContact')return {data:this.contact(id)}
    if(name==='updateContactProfile') {
      const contact=this.contact(id),body=b as RequestFor<'updateContactProfile'>['body'];this.chat.c.checkVersion(contact.profile.version,body.expectedVersion)
      if(contact.identity.kind==='human')this.db.prepare('UPDATE members SET display_name=?,version=version+1 WHERE id=?').run(body.displayName,this.actor.id)
      this.db.prepare('UPDATE chat_contact_profiles SET display_name=?,introduction=?,capability_description=?,personality=?,version=version+1 WHERE contact_id=?').run(contact.identity.kind==='human'?null:body.displayName,body.introduction,body.capabilityDescription,body.personality,id)
      return {data:this.contact(id)}
    }
    if(name==='createPersonalAgent') {
      if(Number(this.db.prepare("SELECT count(*) n FROM chat_contacts WHERE lab_id=? AND kind='personal_agent' AND owner_id=? AND principal<>owner_id").get(this.actor.labId,this.actor.id)!.n)>=20)fail('RATE_LIMITED')
      const body=b as RequestFor<'createPersonalAgent'>['body'],contactId=randomUUID()
      this.db.prepare("INSERT INTO chat_contacts VALUES (?,?,'personal_agent',?,?)").run(contactId,this.actor.labId,this.actor.id,randomUUID())
      this.db.prepare("INSERT INTO chat_contact_profiles VALUES (?,?,'specialist',?,?,?,1)").run(contactId,body.displayName,body.introduction,body.capabilityDescription,body.personality)
      return {data:this.contact(contactId)}
    }
    if(name==='requestContact') {
      const contact=this.contact(id);if(this.owns(contact))return {data:contact}
      const old=this.relationRow(contact);if(old&&['pending','accepted'].includes(String(old.status)))return {data:contact}
      if(contact.identity.kind==='public_agent'&&this.chat.ai.capability()?.status!=='available')fail('CAPABILITY_UNAVAILABLE')
      const now=instant(),status=contact.identity.kind==='public_agent'?'accepted':'pending',owner=contact.identity.kind==='human'?contact.identity.memberId:contact.identity.ownerMemberId
      if(old)this.db.prepare('UPDATE chat_contact_requests SET requester_id=?,target_contact_id=?,decider_id=?,status=?,version=version+1,created_at=?,updated_at=? WHERE id=?').run(this.actor.id,id,owner,status,now,now,old.id!)
      else this.db.prepare('INSERT INTO chat_contact_requests VALUES (?,?,?,?,?,?,?,1,?,?)').run(randomUUID(),this.actor.labId,this.actor.id,id,owner,this.relationKey(contact),status,now,now)
      return {data:this.contact(id)}
    }
    if(name==='contactRequests') {
      const rows=this.db.prepare('SELECT id FROM chat_contact_requests WHERE lab_id=? AND (requester_id=? OR decider_id=?) ORDER BY created_at DESC,id DESC').all(this.actor.labId,this.actor.id,this.actor.id).map(row=>String(row.id))
      const project=(id:string)=>{const r=this.request(id);if((req.query.status!=='all'&&r.status!=='pending')||(req.query.direction!=='all'&&(req.query.direction==='incoming'?r.deciderMemberId!==this.actor.id:r.requesterMemberId!==this.actor.id)))fail('NOT_FOUND');return r}
      return this.chat.page(name,req.query,rows,project)
    }
    if(name==='decideContactRequest') {
      const request=this.request(id),body=b as RequestFor<'decideContactRequest'>['body'];this.chat.c.checkVersion(request.version,body.expectedVersion)
      if(request.status!=='pending')fail('INVALID_STATE')
      this.db.prepare('UPDATE chat_contact_requests SET status=?,version=version+1,updated_at=? WHERE id=?').run(body.decision==='accept'?'accepted':'declined',instant(),id)
      return {data:this.request(id)}
    }
    if(name==='revokeContactRequest')return {data:this.revokeRequest(id,(b as RequestFor<'revokeContactRequest'>['body']).expectedVersion)}
    if(name==='revokeContact') {
      const contact=this.contact(id),row=this.relationRow(contact);if(!row)fail('NOT_FOUND')
      this.revokeRequest(String(row.id),(b as RequestFor<'revokeContact'>['body']).expectedVersion);return {data:this.contact(id)}
    }
    if(name==='chatMemories')return this.chat.page(name,req.query,this.db.prepare("SELECT id FROM chat_memories WHERE lab_id=? AND scope=? AND scope_id=? AND status='active' ORDER BY created_at DESC,id DESC").all(this.actor.labId,req.query.scope!,req.query.scopeId!).map(row=>String(row.id)),id=>{const memory=this.memory(id);if(memory.status!=='active')fail('NOT_FOUND');return memory})
    if(name==='createChatMemory') {
      const body=b as RequestFor<'createChatMemory'>['body'];if(Number(this.db.prepare("SELECT count(*) n FROM chat_memories WHERE scope=? AND scope_id=? AND status='active'").get(body.scope,body.scopeId)!.n)>=10)fail('RATE_LIMITED')
      const now=instant(),memoryId=randomUUID();this.db.prepare("INSERT INTO chat_memories VALUES (?,?,?,?,?,'active',1,?,?,?,?)").run(memoryId,this.actor.labId,body.scope,body.scopeId,this.actor.id,body.content,body.source,now,now)
      const value=this.memory(memoryId,true);this.saveMemory(value);return {data:value}
    }
    if(name==='reviseChatMemory'||name==='revokeChatMemory') {
      const memory=this.memory(id,true),body=b as RequestFor<'reviseChatMemory'>['body'];this.chat.c.checkVersion(memory.version,body.expectedVersion)
      if(memory.status!=='active')fail('INVALID_STATE');if(memory.version>=100)fail('RATE_LIMITED')
      this.db.prepare('UPDATE chat_memories SET content=?,source=?,status=?,version=version+1,updated_at=? WHERE id=?').run(name==='reviseChatMemory'?body.content:memory.content,name==='reviseChatMemory'?body.source:memory.source,name==='revokeChatMemory'?'revoked':'active',instant(),id)
      const value=this.memory(id,true);this.saveMemory(value);return {data:value}
    }
    if(name==='chatMemoryHistory') {
      const memory=this.memory(id),revisions=this.db.prepare('SELECT document FROM chat_memory_revisions WHERE memory_id=? ORDER BY version').all(id).map(row=>ChatMemory.parse({...JSON.parse(String(row.document)),allowedActions:[]}))
      return {data:{memory,revisions}}
    }
    fail('NOT_IMPLEMENTED')
  }
}
