import type { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { AssistantTopicBody } from '@research-agent-platform/contracts'
import type { Config } from './config.js'
import { transaction } from './database.js'
import { ChatService, type TurnInput } from './chat.js'
import { isMessageRetracted } from './chat-message-actions.js'
import { callHarness, serviceFor, type ModelCall } from './execution-worker.js'
import { ApiError } from './errors.js'
import { applyTopicPatch, createTopic, pauseActiveTopic } from './assistant-topics.js'
import { personalModelKey, personalModelRuntime } from './personal-models.js'
import { curatorSystem } from './topic-curator-prompt.js'
import { applyRelationshipCuration, expireRelationshipMemories, privateRelationshipMessage, relationshipCuratorInput, relationshipCuratorSystem, topicRelationshipSourcesCurrent, trackTopicRelationshipSources } from './assistant-relationship-memory.js'
import { waitForWorkerDatabase } from './worker-database.js'

type Job = { id: string; owner_id: string; assistant_id: string; conversation_id: string; turn_id: string; attempts: number }

const BodyPatch = z.strictObject({
  context: AssistantTopicBody.shape.context.removeDefault().optional(),
  decisions: AssistantTopicBody.shape.decisions.removeDefault().optional(),
  openQuestions: AssistantTopicBody.shape.openQuestions.removeDefault().optional(),
  next: AssistantTopicBody.shape.next.removeDefault().optional(),
  constraints: AssistantTopicBody.shape.constraints.removeDefault().optional(),
})
const CuratorOutput = z.strictObject({
  action: z.enum(['update_topic', 'new_topic', 'no_change']),
  topicId: z.string().min(1).max(96).optional(),
  baseVersion: z.number().int().nonnegative().optional(),
  title: z.string().trim().min(1).max(60).optional(),
  summary: z.string().trim().min(1).max(300).optional(),
  body: BodyPatch.optional(),
  reason: z.enum(['smalltalk', 'duplicate', 'no_increment']).optional(),
  hint: z.literal('preference').optional(),
})
type CuratorOutput = z.infer<typeof CuratorOutput>
type Result = { action: string; topicId?: string; version?: number; reason?: string; hint?: string; shaped?: ShapeCounts; bytes?: number }
type ShapeCounts = { trimmed: number; dropped: number }

const leaseMs = 60_000
const maxTokens = 2000

/** Parse the first JSON object from a model reply; anything outside braces is ignored. */
function parseJson(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('INVALID_MODEL_OUTPUT')
  try { return JSON.parse(text.slice(start, end + 1)) } catch { throw new Error('INVALID_MODEL_OUTPUT') }
}

const textKey = (text: string) => text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim()

/** Curator output is shaped before strict validation: over-long text is clipped and
 * over-cap lists are trimmed so a shape violation does not discard the whole patch. */
function clip(value: unknown, limit: number) {
  if (typeof value !== 'string') return undefined
  const chars = Array.from(value.trim())
  return chars.length ? chars.slice(0, limit).join('') : undefined
}

function existingTexts(body: unknown, name: string) {
  const source = body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined
  if (!Array.isArray(source)) return new Set<string>()
  return new Set(source.flatMap(entry => {
    const text = typeof entry === 'string' ? entry : entry && typeof entry === 'object' ? (entry as { text?: unknown }).text : undefined
    return typeof text === 'string' ? [textKey(text)] : []
  }))
}

function shapeList(value: unknown, limit: number, existing: Set<string> | null, counts: ShapeCounts) {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>(), out: string[] = []
  let fresh = 0
  for (const entry of value) {
    const text = clip(entry, 300)
    const key = text ? textKey(text) : ''
    const added = existing !== null && !existing.has(key)
    if (!text || seen.has(key) || (added && fresh >= 3)) { counts.dropped += 1; continue }
    if (added) fresh += 1
    seen.add(key); out.push(text)
  }
  if (out.length > limit) { counts.dropped += out.length - limit; return out.slice(-limit) }
  return out
}

function shapeDecisions(value: unknown, existing: Set<string> | null, counts: ShapeCounts) {
  if (!Array.isArray(value)) return undefined
  const seen = new Set<string>(), out: { text: string; status: 'confirmed' | 'superseded' }[] = []
  let fresh = 0
  for (const entry of value) {
    const record: { text?: unknown; status?: unknown } = entry && typeof entry === 'object' ? entry as { text?: unknown; status?: unknown } : {}
    const text = clip(record.text, 300)
    const status = record.status === 'superseded' ? 'superseded' as const : record.status === 'confirmed' || record.status === undefined ? 'confirmed' as const : undefined
    const key = text ? textKey(text) : ''
    const added = existing !== null && !existing.has(key)
    if (!text || !status || seen.has(key) || (added && fresh >= 3)) { counts.dropped += 1; continue }
    if (added) fresh += 1
    seen.add(key); out.push({ text, status })
  }
  // Over the cap, superseded entries leave first; the rest drop oldest first.
  while (out.length > 20) {
    const at = out.findIndex(entry => entry.status === 'superseded')
    out.splice(at < 0 ? 0 : at, 1); counts.dropped += 1
  }
  return out
}

function shapeTopic(value: unknown, body: unknown, capNew: boolean) {
  const counts: ShapeCounts = { trimmed: 0, dropped: 0 }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { value, counts }
  const output = { ...(value as Record<string, unknown>) }
  for (const [name, limit] of [['title', 60], ['summary', 300]] as const) {
    if (output[name] === undefined) continue
    const next = clip(output[name], limit)
    if (next === undefined) { delete output[name]; counts.dropped += 1; continue }
    if (next !== output[name]) counts.trimmed += 1
    output[name] = next
  }
  const patch = output.body
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { value: output, counts }
  const section = { ...(patch as Record<string, unknown>) }
  if (typeof section.context === 'string') {
    const next = Array.from(section.context).slice(0, 1000).join('')
    if (next !== section.context) { section.context = next; counts.trimmed += 1 }
  }
  if (section.decisions !== undefined) {
    const decisions = shapeDecisions(section.decisions, capNew ? existingTexts(body, 'decisions') : null, counts)
    if (decisions) section.decisions = decisions
    else { delete section.decisions; counts.dropped += 1 }
  }
  for (const name of ['openQuestions', 'next', 'constraints'] as const) {
    if (section[name] === undefined) continue
    const list = shapeList(section[name], 10, capNew ? existingTexts(body, name) : null, counts)
    if (list) section[name] = list
    else { delete section[name]; counts.dropped += 1 }
  }
  if (section.notes !== undefined) { delete section.notes; counts.dropped += 1 }
  output.body = section
  return { value: output, counts }
}

/** Asynchronous topic curator. It never runs inside a chat turn and never blocks replies. */
export class TopicCuratorWorker {
  private nextExpirySweep = 0
  constructor(readonly db: DatabaseSync, readonly config: Config,
    readonly clock: () => number = Date.now, readonly call: ModelCall = callHarness, readonly modelTimeoutMs = 20_000) {}

  private owns(job: Job) {
    return !!this.db.prepare("SELECT 1 FROM assistant_topic_curator_jobs WHERE id=? AND status='running' AND attempts=? AND lease_until>?").get(job.id, job.attempts, this.clock())
  }

  private service(job: Job) {
    return new ChatService(serviceFor(this.db, job.owner_id, this.config).c, this.config)
  }

  private input(service: ChatService, job: Job) {
    const saved = service.db.prepare("SELECT document,request_json FROM chat_turns WHERE id=? AND owner_id=? AND conversation_id=? AND status='succeeded'")
      .get(job.turn_id, job.owner_id, job.conversation_id)
    if (!saved) return
    const turn = JSON.parse(String(saved.document)) as { agentContactId: string; inputMessageId: string; outputMessageId: string }
    const conversation = service.conversation(job.conversation_id, false)
    if (conversation.kind !== 'personal' || conversation.ownerMemberId !== job.owner_id || turn.agentContactId !== job.assistant_id || !turn.outputMessageId) return
    const input = service.projectedMessage(turn.inputMessageId), reply = service.projectedMessage(turn.outputMessageId)
    const humanId = service.human().id
    if (input.conversationId !== conversation.id || reply.conversationId !== conversation.id ||
      input.origin !== 'human' || input.senderContactId !== humanId ||
      reply.origin !== 'model' || reply.senderContactId !== job.assistant_id ||
      isMessageRetracted(service, input.id) || isMessageRetracted(service, reply.id)) return

    const topic = service.db.prepare("SELECT id,version,title,summary,body_json FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND state='active'").get(job.owner_id, job.assistant_id) as
      { id: string; version: number; title: string; summary: string; body_json: string } | undefined
    const currentTopic = topic && topicRelationshipSourcesCurrent(service, topic.id) ? { id: topic.id, version: topic.version, title: topic.title, summary: topic.summary, body: JSON.parse(topic.body_json) as unknown } : null
    const request = JSON.parse(String(saved.request_json)) as TurnInput
    const currentIds = (request.continuous?.messageIds ?? [input.id]).slice(-9)
    const ids = service.db.prepare('SELECT id FROM chat_messages WHERE conversation_id=? AND sequence<? ORDER BY sequence DESC LIMIT ?')
      .all(job.conversation_id, input.sequence, Math.max(0, 9 - currentIds.length)).map(value => String(value.id)).reverse()
    ids.push(...currentIds)
    ids.push(reply.id)
    const messages = ids.flatMap(id => {
      try {
        if (isMessageRetracted(service, id)) return []
        const message = service.projectedMessage(id)
        const ownInput = message.origin === 'human' && message.senderContactId === humanId
        const ownReply = message.origin === 'model' && message.senderContactId === job.assistant_id
        return message.conversationId === conversation.id && message.text && (ownInput || ownReply) && privateRelationshipMessage(service, message)
          ? [{ id: message.id, role: ownInput ? 'user' : 'assistant', text: message.text.slice(0, 1500) }]
          : []
      } catch { return [] }
    })
    const evidence = messages.filter(message => message.role === 'user' && currentIds.includes(message.id))
    if (!evidence.length) return
    const relationship = relationshipCuratorInput(service, conversation, job.assistant_id, request, evidence, this.clock())
    // A body that overflowed last time is a split signal for the next patch, not a
    // reason to retry the same patch.
    const previous = service.db.prepare("SELECT failure FROM assistant_topic_curator_jobs WHERE owner_id=? AND assistant_id=? AND conversation_id=? AND turn_id<>? AND status IN ('succeeded','failed') ORDER BY created_at DESC,rowid DESC LIMIT 1")
      .get(job.owner_id, job.assistant_id, job.conversation_id, job.turn_id) as { failure: string | null } | undefined
    return { currentTopic, messages, ...(relationship ? { relationship } : {}), ...(previous?.failure === 'PAYLOAD_TOO_LARGE' ? { previousFailure: 'over_limit' as const } : {}) }
  }

  private async complete(prepared: { prompt: string; system: string; runtime: ReturnType<typeof personalModelRuntime>; apiKey: string | undefined }, signal: AbortSignal) {
    let deadline: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    try {
      const call = this.call({ provider: prepared.runtime.provider, ...(prepared.runtime.provider === 'deepseek' ? { reasoningEffort: 'off' as const } : {}), system: prepared.system, prompt: prepared.prompt,
        model: prepared.runtime.model, maxTokens, timeoutMs: this.modelTimeoutMs }, signal, { apiKey: prepared.apiKey! })
      const stopped = new Promise<undefined>(resolve => {
        abort = () => resolve(undefined)
        deadline = setTimeout(abort, this.modelTimeoutMs)
        if (signal.aborted) abort()
        else signal.addEventListener('abort', abort, { once: true })
      })
      const result = await Promise.race([call, stopped])
      if (!result || result.failure || !result.text) return undefined
      return result.text
    } finally {
      clearTimeout(deadline)
      if (abort) signal.removeEventListener('abort', abort)
    }
  }

  private apply(service: ChatService, job: Job, output: CuratorOutput): Result {
    if (output.action === 'no_change') return { action: 'no_change', reason: output.reason ?? 'no_increment', ...(output.hint ? { hint: output.hint } : {}) }
    if (output.action === 'update_topic') {
      if (!output.topicId || output.baseVersion === undefined) throw new Error('INVALID_MODEL_OUTPUT')
      const topic = service.db.prepare('SELECT version,state FROM assistant_topics WHERE id=? AND owner_id=? AND assistant_id=?').get(output.topicId, job.owner_id, job.assistant_id) as
        { version: number; state: string } | undefined
      if (!topic || topic.state === 'closed') return { action: 'stale', topicId: output.topicId }
      // A newer patch already won; the model output is dropped rather than replayed.
      if (Number(topic.version) !== output.baseVersion) return { action: 'stale', topicId: output.topicId }
      const value = applyTopicPatch(service, { topicId: output.topicId, baseVersion: output.baseVersion, title: output.title, summary: output.summary, body: output.body }, { agent: 'assistant' })
      return { action: 'update_topic', topicId: value.id, version: value.version }
    }
    if (!output.title || !output.summary) throw new Error('INVALID_MODEL_OUTPUT')
    pauseActiveTopic(service, job.assistant_id, { agent: 'assistant' })
    const created = createTopic(service, {
      assistantId: job.assistant_id, title: output.title, summary: output.summary,
      body: AssistantTopicBody.parse(output.body ?? {}),
    }, 'curator', { agent: 'assistant' }, 'provisional')
    return { action: 'new_topic', topicId: created.id, version: created.version }
  }

  private finish(job: Job, result: Result) {
    const at = new Date(this.clock()).toISOString()
    this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='succeeded',lease_until=NULL,result_json=?,failure=NULL,updated_at=? WHERE id=? AND status='running' AND attempts=? AND lease_until>?")
      .run(JSON.stringify(result), at, job.id, job.attempts, this.clock())
  }

  private fail(job: Job, failure: string, result?: Result) {
    const at = new Date(this.clock()).toISOString()
    this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='failed',lease_until=NULL,failure=?,result_json=?,updated_at=? WHERE id=? AND status='running' AND attempts=? AND lease_until>?")
      .run(failure, result ? JSON.stringify(result) : null, at, job.id, job.attempts, this.clock())
  }

  async tick(): Promise<boolean> {
    if (this.clock() >= this.nextExpirySweep) {
      await waitForWorkerDatabase(() => expireRelationshipMemories(this.db, this.clock()))
      this.nextExpirySweep = this.clock() + 60 * 60_000
    }
    const job = await waitForWorkerDatabase(() => transaction(this.db, () => {
      const at = new Date(this.clock()).toISOString()
      this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='failed',lease_until=NULL,failure='LEASE_EXPIRED',updated_at=? WHERE status='running' AND COALESCE(lease_until,0)<=? AND attempts>=3").run(at, this.clock())
      this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='queued',lease_until=NULL,failure=NULL,updated_at=? WHERE status='running' AND COALESCE(lease_until,0)<=? AND attempts<3").run(at, this.clock())
      const next = this.db.prepare("SELECT id,owner_id,assistant_id,conversation_id,turn_id,attempts FROM assistant_topic_curator_jobs WHERE status='queued' ORDER BY created_at,id LIMIT 1").get() as Job | undefined
      if (!next) return
      const claimed = this.db.prepare("UPDATE assistant_topic_curator_jobs SET status='running',attempts=attempts+1,lease_until=?,updated_at=? WHERE id=? AND status='queued' AND attempts=?").run(this.clock() + leaseMs, at, next.id, next.attempts)
      return claimed.changes === 1 ? { ...next, attempts: next.attempts + 1 } : undefined
    }))
    if (!job) return false
    const controller = new AbortController()
    let heartbeatFlight: Promise<void> | undefined
    const heartbeat = setInterval(() => {
      if (heartbeatFlight) return
      heartbeatFlight = waitForWorkerDatabase(() => {
        const at = this.clock()
        const renewed = this.db.prepare('UPDATE assistant_topic_curator_jobs SET lease_until=?,updated_at=? WHERE id=? AND status=\'running\' AND attempts=? AND lease_until>?').run(at + leaseMs, new Date(at).toISOString(), job.id, job.attempts, at)
        if (renewed.changes !== 1) controller.abort()
      }).catch(() => controller.abort()).finally(() => { heartbeatFlight = undefined })
    }, 10_000)
    let phase: 'model' | 'apply' = 'model'
    try {
      const prepared = await waitForWorkerDatabase(() => transaction(this.db, () => {
        if (!this.owns(job)) return { owned: false as const }
        const service = this.service(job), runtime = personalModelRuntime(this.db, service.c.actor, this.config)
        if (!runtime.enabled || runtime.source !== 'personal') return { owned: true as const, enabled: false as const }
        const input = this.input(service, job)
        return { owned: true as const, enabled: true as const, runtime, input, prompt: JSON.stringify(input),
          system: input?.relationship ? curatorSystem + '\n' + relationshipCuratorSystem : curatorSystem,
          apiKey: input ? personalModelKey(this.db, service.c.actor, this.config) : undefined }
      }))
      if (!prepared.owned) return true
      if (!prepared.enabled) { await waitForWorkerDatabase(() => this.fail(job, 'MODEL_UNAVAILABLE')); return true }
      if (!prepared.input) { await waitForWorkerDatabase(() => this.finish(job, { action: 'stale' })); return true }
      const text = await this.complete(prepared, controller.signal)
      if (!text) { await waitForWorkerDatabase(() => this.fail(job, 'MODEL_UNAVAILABLE')); return true }
      const raw = parseJson(text)
      const action = raw && typeof raw === 'object' ? (raw as { action?: unknown }).action : undefined
      // Keep the optional relationship result out of strict topic validation.
      const { relationship, ...topicOutput } = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
      // Only an update counts new entries against the three-item patch cap; a new
      // topic carries its own first body.
      const shaped = shapeTopic(topicOutput, prepared.input.currentTopic?.body ?? null, action === 'update_topic')
      const parsed = CuratorOutput.safeParse(shaped.value)
      if (!parsed.success) throw new Error('INVALID_MODEL_OUTPUT')
      const output = parsed.data
      phase = 'apply'
      await waitForWorkerDatabase(() => transaction(this.db, () => {
        if (!this.owns(job)) return
        const service = this.service(job)
        const activeId = prepared.input?.currentTopic?.id
        const runtime = personalModelRuntime(this.db, service.c.actor, this.config)
        const stale = JSON.stringify(this.input(service, job)) !== prepared.prompt ||
          !runtime.enabled || runtime.fingerprint !== prepared.runtime.fingerprint ||
          (output.action === 'update_topic' && output.topicId !== activeId)
        if (stale) { this.finish(job, { action: 'stale' }); return }
        const result = this.apply(service, job, output)
        if (result.topicId && result.version) trackTopicRelationshipSources(service, result.topicId, prepared.input!.messages.map(message => message.id))
        if (prepared.input!.relationship) {
          const conversation = service.conversation(job.conversation_id, false)
          applyRelationshipCuration(service, conversation, job.assistant_id,
            prepared.input!.messages.filter(message => message.role === 'user'), prepared.input!.relationship, relationship, this.clock())
        }
        this.finish(job, shaped.counts.trimmed || shaped.counts.dropped ? { ...result, shaped: shaped.counts } : result)
      })).catch(error => {
        if (!(error instanceof ApiError) || error.code !== 'PAYLOAD_TOO_LARGE') throw error
        // The transaction has rolled back topic and revision writes. Record the split signal separately.
        const bytes = Buffer.byteLength(JSON.stringify(output.body ?? {}), 'utf8')
        return waitForWorkerDatabase(() => this.fail(job, 'PAYLOAD_TOO_LARGE', { action: 'over_limit', bytes }))
      })
    } catch {
      await waitForWorkerDatabase(() => this.fail(job, phase === 'apply' ? 'CURATOR_APPLY_FAILED' : 'INVALID_MODEL_OUTPUT'))
    } finally {
      clearInterval(heartbeat); controller.abort(); await heartbeatFlight
    }
    return true
  }
}
