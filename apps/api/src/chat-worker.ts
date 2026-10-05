import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { AgentTurn, ChatActionPayload, PlanInput, Title, Text, Id, SharedContext, ModelUsage } from '@research-agent-platform/contracts'
import { ChatService } from './chat.js'
import { transaction } from './database.js'
import { serviceFor, callHarness } from './execution-worker.js'
import type { ModelCall, ModelResult } from './execution-worker.js'
import { personalModelKey, personalModelRuntime } from './personal-models.js'
import { instant } from './ai.js'
import type { Config } from './config.js'
import { ApiError } from './errors.js'
import { chatModelSystem, chatInputTokenBound } from './chat-model-input.js'

// Local model protocol: validated JSON, no model-side tools or business authority.
export const ChatModelOutput = z.strictObject({
  answer: Text, waitingInput: z.boolean(),
  group: z.strictObject({ title: Title, plan: PlanInput, contactIds: z.array(Id).min(1).max(99), sharedContext: SharedContext }).nullable(),
  actions: z.array(ChatActionPayload).max(5),
})
function service(db: DatabaseSync, owner: string, config: Config) { return new ChatService(serviceFor(db, owner, config).c, config) }
export function reconcileChat(db: DatabaseSync, config: Config) {
  for (const row of db.prepare("SELECT * FROM chat_turns WHERE status IN ('queued','running')").all()) {
    const turn = AgentTurn.parse(JSON.parse(String(row.document)))
    let failure: AgentTurn['failure'] = null
    try {
      const s = service(db, String(row.owner_id), config)
      const { group } = s.checkTurnInput(turn.id)
      if (s.joinedAgent(group,turn.agentContactId).availability.status !== 'available') failure = 'MODEL_UNAVAILABLE'
    } catch (error) { failure = error instanceof ApiError && error.code==='VERSION_CONFLICT' ? 'INPUT_CHANGED' : 'AUTHORITY_CHANGED' }
    if (!failure && row.status === 'running' && Number(row.lease_until) <= Date.now()) failure = 'LEASE_EXPIRED_USAGE_UNCERTAIN'
    if (failure) {
      turn.status = failure === 'MODEL_UNAVAILABLE' ? 'unavailable' : failure === 'LEASE_EXPIRED_USAGE_UNCERTAIN' ? 'interrupted' : 'cancelled'
      turn.failure = failure; turn.version++; turn.updatedAt = instant()
      db.prepare('UPDATE chat_turns SET status=?,document=?,fence=fence+1,lease_owner=NULL,lease_until=NULL WHERE id=?').run(turn.status, JSON.stringify(turn), turn.id)
    }
  }
}
export class ChatWorker {
  readonly owner = randomUUID()
  constructor(readonly db: DatabaseSync, readonly config: Config, readonly call: ModelCall = callHarness) {}
  async tick() {
    const job = transaction(this.db, () => {
      reconcileChat(this.db, this.config)
      const row = this.db.prepare("SELECT * FROM chat_turns WHERE status='queued' ORDER BY rowid LIMIT 1").get()
      if (!row) return null
      const s = service(this.db, String(row.owner_id), this.config), { turn, input, group } = s.checkTurnInput(String(row.id))
      // Snapshot the context and bounded message window; normal chat never creates a job.
      let remainingText=32000
      const messages = this.db.prepare('SELECT id FROM chat_messages WHERE conversation_id=? AND sequence<=? ORDER BY sequence DESC LIMIT 20').all(group.id, input.inputSequence).flatMap(r => {
        try { const m = s.projectedMessage(String(r.id));if((m.text?.length??0)>remainingText)return [];remainingText-=m.text?.length??0;return [{ origin: m.origin, text: m.text, senderContactId: m.senderContactId,mentions:m.mentions,resources:m.resources }] } catch { return [] }
      }).reverse()
      let context: unknown[]
      try { context = input.context.map(ref => {
        s.checkResource(ref, group.id, true)
        if (ref.kind === 'task') return { ...ref, data: s.c.task(ref.ref.id) }
        if (ref.kind === 'plan') return { ...ref, data: s.c.plan(ref.ref.id) }
        if (ref.kind === 'artifact') return { ...ref, data: s.ai.readTexts(s.ai.inputRefs([ref.ref.id]))[0] }
        if (ref.kind === 'run') return { ...ref, data: s.ai.projectedRun(ref.ref.id) }
        if (ref.kind === 'deliverable') return { ...ref, data: s.c.deliverable(ref.ref.id) }
        return { ...ref, data: s.c.assignment(ref.ref.id).model }
      }) } catch {
        turn.status='failed';turn.failure='INPUT_CHANGED';turn.version++;turn.updatedAt=instant();s.saveTurn(turn);return null
      }
      // Human-authored profile facts stay intact. Versions remain in the server
      // fingerprint, not repeated as readonly metadata in the model directory.
      const publicContact = (contact:ReturnType<typeof s.contact>) => ({id:contact.id,displayName:contact.displayName,identity:contact.identity,availability:{status:contact.availability.status,...(contact.availability.reason?{reason:contact.availability.reason}:{})},profile:Object.fromEntries(Object.entries(contact.profile).filter(([key,value])=>key!=='version'&&value!==''))})
      const candidates=input.dailyChat?group.members.map(m=>m.contactId).filter(id=>id!==turn.agentContactId):this.db.prepare('SELECT id FROM chat_contacts WHERE lab_id=? AND id<>? ORDER BY id').all(s.c.actor.labId,turn.agentContactId).map(r=>String(r.id))
      const contacts = candidates.flatMap(id => { try { return [publicContact(s.contact(id))] } catch { return [] } }).slice(0, 100)
      const agentContext=s.directory.modelContext(turn.agentContactId,group.id),requestedAgent=publicContact(agentContext.agent)
      input.agentContextFingerprint=agentContext.fingerprint
      this.db.prepare('UPDATE chat_turns SET request_json=? WHERE id=?').run(JSON.stringify(input),turn.id)
      // Column tables and the sender dictionary losslessly encode the existing
      // authorized 20-message window; text is never shortened to fit the budget.
      const senderIds=[...new Set([...group.members.map(m=>m.contactId),...messages.map(m=>m.senderContactId).filter((id):id is string=>id!==null)])]
      const conversation={kind:group.kind,title:group.title,memberColumns:['sender','role','status'],members:group.members.map(m=>[senderIds.indexOf(m.contactId),m.role,m.status]),...(group.taskIds.length?{taskIds:group.taskIds}:{})}
      const contactColumns=['id','displayName','identity','availability','profile']
      const messageColumns=['origin','sender','text',...(messages.some(m=>m.mentions.length)?['mentions']:[]),...(messages.some(m=>m.resources.length)?['resources']:[])]
      const messageRows=messages.map(m=>messageColumns.map(key=>key==='sender'?m.senderContactId===null?null:senderIds.indexOf(m.senderContactId):m[key as keyof typeof m]))
      const selectedTasks=input.context.filter(ref=>ref.kind==='task').map(ref=>s.c.task(ref.ref.id))
      const system=input.dailyChat?'You are the requested personal Agent in a natural private conversation. Follow its user-authored capability and personality when compatible with permissions. Read authorized conversation history and memories as context. Answer the current user naturally; do not turn ordinary conversation into task planning, invitations, execution or onboarding. No tools, no external action. Return only your natural-language reply, no JSON envelope or business action payload. Reply must be nonempty and at most8000 characters. Never invent completed external actions. The tables have explicit columns; sender indexes expand through senderIds to stable Contact IDs.':chatModelSystem({group:group.kind==='personal'&&agentContext.agent.profile.role==='coordinator',inviteContact:group.kind==='group'&&group.ownerMemberId===s.c.actor.id,inviteTask:group.kind==='group'&&group.ownerMemberId===s.c.actor.id&&selectedTasks.some(task=>task.initiatorId===s.c.actor.id),runTask:group.kind==='group'&&selectedTasks.some(task=>task.leadId===s.c.actor.id)})
      const prompt=JSON.stringify({ownerId:s.c.actor.id,labId:s.c.actor.labId,requestedAgent,conversation,contactColumns,contacts:contacts.map(c=>contactColumns.map(key=>c[key as keyof typeof c])),senderIds,messageColumns,messages:messageRows,...(agentContext.memories.length?{memories:agentContext.memories}:{}),...(context.length?{context}:{})})
      const remainingOutput=input.budget.maxTokens-chatInputTokenBound(system,prompt)
      if (prompt.length > 100000 || remainingOutput<64) {
        turn.status = 'failed'; turn.failure = 'BUDGET_EXCEEDED'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn); return null
      }
      let apiKey: string
      try { apiKey = personalModelKey(this.db, s.c.actor, this.config) } catch {
        turn.status = 'unavailable'; turn.failure = 'MODEL_UNAVAILABLE'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn); return null
      }
      const fence = Number(row.fence) + 1
      turn.status = 'running'; turn.version++; turn.updatedAt = instant(); s.saveTurn(turn)
      this.db.prepare('UPDATE chat_turns SET fence=?,lease_owner=?,lease_until=? WHERE id=?').run(fence, this.owner, Date.now() + 15000, turn.id)
      this.db.prepare('INSERT INTO chat_attempts VALUES (?,?,?,NULL)').run(turn.id, row.root_id!, instant())
      const selected=personalModelRuntime(this.db,s.c.actor,this.config)
      return { id: turn.id, ownerId: String(row.owner_id), fence, input, modelInput: { provider:selected.provider,system, prompt, model:selected.model, maxTokens: Math.min(4096,remainingOutput), timeoutMs: input.budget.maxSeconds * 1000 }, credential: { apiKey } }
    })
    if (!job) return false
    const controller = new AbortController(), started = Date.now()
    const lease = setInterval(() => {
      try { transaction(this.db, () => { reconcileChat(this.db, this.config); const row = this.db.prepare('SELECT status,fence FROM chat_turns WHERE id=?').get(job.id)!; if (row.status !== 'running' || row.fence !== job.fence) controller.abort(); else this.db.prepare('UPDATE chat_turns SET lease_until=? WHERE id=?').run(Date.now() + 15000, job.id) }) } catch { controller.abort() }
    }, 3000)
    let timeout: ReturnType<typeof setTimeout> | undefined
    const expired = new Promise<ModelResult>(resolve => { timeout = setTimeout(() => { controller.abort(); resolve({ text: '', failure: 'TIMEOUT', inputTokens: null, outputTokens: null, elapsedMs: Date.now() - started }) }, job.modelInput.timeoutMs) })
    let result: ModelResult
    try { result = await Promise.race([this.call(job.modelInput, controller.signal, job.credential), expired]) } catch { result = { text: '', failure: 'MODEL_FAILED', inputTokens: null, outputTokens: null, elapsedMs: Date.now() - started } }
    finally { clearInterval(lease); if (timeout) clearTimeout(timeout) }
    transaction(this.db, () => {
      const usage = ModelUsage.parse({ inputTokens: result.inputTokens, outputTokens: result.outputTokens, elapsedMs: result.elapsedMs, cost: null, currency: null })
      // Actual returned usage survives cancellation even when output is fenced.
      this.db.prepare('UPDATE chat_attempts SET usage_json=? WHERE turn_id=?').run(JSON.stringify(usage), job.id)
      reconcileChat(this.db, this.config)
      const row = this.db.prepare('SELECT * FROM chat_turns WHERE id=?').get(job.id)!
      if (row.status !== 'running' || row.fence !== job.fence || row.lease_owner !== this.owner) return
      const s = service(this.db, job.ownerId, this.config), { turn, group } = s.checkTurnInput(job.id)
      turn.usage = usage
      if (result.failure) { turn.status = 'failed'; turn.failure = 'MODEL_FAILED' }
      else if (result.inputTokens===null||result.outputTokens===null) { turn.status='failed';turn.failure='MODEL_FAILED' }
      else if (result.inputTokens + result.outputTokens > job.input.budget.maxTokens || result.outputTokens>job.modelInput.maxTokens || result.elapsedMs > job.input.budget.maxSeconds * 1000) { turn.status = 'failed'; turn.failure = 'BUDGET_EXCEEDED' }
      else {
        // Savepoint guarantees invalid output cannot leave partial plans/actions/messages.
        this.db.exec('SAVEPOINT chat_model_output')
        try {
          const output = job.input.dailyChat?{answer:Text.parse(result.text),waitingInput:false,group:null,actions:[]}:ChatModelOutput.parse(JSON.parse(result.text))
          if(job.input.dailyChat&&!output.answer.trim())throw new Error('INVALID_MODEL_OUTPUT')
          if (output.waitingInput && (output.group || output.actions.length)) throw new Error('INVALID_MODEL_OUTPUT')
          const payloads = [...output.actions]
          for (const payload of payloads) {
            if (payload.kind === 'create_group') throw new Error('INVALID_MODEL_OUTPUT')
            if ('task' in payload && !job.input.context.some(r => r.kind === 'task' && r.ref.id === payload.task.id && r.ref.version === payload.task.version)) throw new Error('INVALID_MODEL_OUTPUT')
            if (payload.kind === 'run_task' && payload.inputArtifactRefs.some(ref => !job.input.context.some(r => r.kind === 'artifact' && r.ref.id === ref.id && r.ref.version === ref.version))) throw new Error('INVALID_MODEL_OUTPUT')
          }
          if (output.group) {
            if (group.kind !== 'personal' || s.contact(turn.agentContactId).profile.role!=='coordinator' || output.group.plan.labId !== s.c.actor.labId) throw new Error('INVALID_MODEL_OUTPUT')
            for (const ref of output.group.sharedContext.artifactRefs) if (!job.input.context.some(r => r.kind === 'artifact' && r.ref.id === ref.id && r.ref.version === ref.version)) throw new Error('INVALID_MODEL_OUTPUT')
            const created = s.c.handlers.createPlan({ params: {}, query: {}, headers: {}, body: output.group.plan }) as { data: { id: string; version: number } }
            this.db.prepare('INSERT INTO chat_plan_sources VALUES (?,?)').run(created.data.id,turn.id)
            payloads.push({ kind: 'create_group', title: output.group.title, plan: { id: created.data.id, version: created.data.version }, contactIds: output.group.contactIds, sharedContext: output.group.sharedContext })
          }
          for (const payload of payloads) s.validatePayload(payload, group.id)
          const message = s.message(group.id, { senderContactId: turn.agentContactId, origin: 'model', text: output.answer, mentions: [], resources: [], actionIds: [], turnId: turn.id })
          const actions = payloads.map(payload => s.addAction(turn, message.id, payload)); message.actionIds = actions.map(a => a.id)
          this.db.prepare('UPDATE chat_messages SET document=? WHERE id=?').run(JSON.stringify(message), message.id)
          turn.status = output.waitingInput ? 'waiting_input' : 'succeeded'; turn.outputMessageId = message.id; turn.failure = null
          this.db.exec('RELEASE chat_model_output')
        } catch { this.db.exec('ROLLBACK TO chat_model_output; RELEASE chat_model_output'); turn.status = 'failed'; turn.failure = 'INVALID_MODEL_OUTPUT'; turn.outputMessageId = null }
      }
      turn.version++; turn.updatedAt = instant(); s.saveTurn(turn)
      this.db.prepare('UPDATE chat_turns SET lease_owner=NULL,lease_until=NULL WHERE id=?').run(turn.id)
    })
    return true
  }
}
