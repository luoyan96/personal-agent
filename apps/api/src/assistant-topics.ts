import { randomUUID } from 'node:crypto'
import {
  AssistantTopic,
  AssistantTopicBody,
  AssistantTopicBodyInput,
  AssistantTopicHistory,
  AssistantTopicIndex,
  AssistantTopicInput,
  AssistantTopicUpdate,
  assistantTopicRoutes,
  type AssistantTopic as AssistantTopicValue,
} from '@research-agent-platform/contracts'
import type { ActorFacts } from '@research-agent-platform/constitution'
import { fail } from './errors.js'
import { assertAllowed } from './subjects.js'
import type { ChatService, ChatRequest } from './chat.js'

export const assistantTopicCommands = Object.keys(assistantTopicRoutes)

type Row = {
  id: string
  owner_id: string
  assistant_id: string
  title: string
  title_status: 'provisional' | 'final'
  summary: string
  body_json: string
  state: 'active' | 'paused' | 'closed'
  origin: 'curator' | 'owner'
  version: number
  created_at: string
  updated_at: string
  last_active_at: string
  next_decision_id: number
}

/** Curator writes through this shape; it never carries a caller-chosen version. */
export type AssistantTopicPatch = {
  topicId: string
  baseVersion?: number
  title?: string
  summary?: string
  body?: Partial<AssistantTopicBodyInput>
  /** Decision ids the patch retires. Unknown ids are reported, not written. */
  retire?: string[]
}

const now = () => new Date().toISOString()
const bodyBytes = (body: AssistantTopicBody) => Buffer.byteLength(JSON.stringify(body), 'utf8')
const bodyLimit = 4_000
const noteLimit = 10
const key = (text: string) => text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
/** A title that differs only in spacing, case or punctuation is not a rename. */
const titleKey = (text: string) => key(text).replace(/[\s\p{P}\p{S}]+/gu, '')
const sameTitle = (a: string, b: string) => titleKey(a) === titleKey(b)
const importanceRank = { low: 0, medium: 1, high: 2 } as const

export function agentOwner(s: ChatService, assistantId: string) {
  const contact = s.contact(assistantId)
  if (contact.identity.kind !== 'personal_agent' || contact.identity.ownerMemberId !== s.c.actor.id) fail('NOT_FOUND')
}

function row(s: ChatService, id: string): Row {
  const value = s.db.prepare('SELECT * FROM assistant_topics WHERE id=? AND owner_id=?').get(id, s.c.actor.id) as Row | undefined
  if (!value) fail('NOT_FOUND')
  agentOwner(s, value.assistant_id)
  return value
}

const bodyOf = (value: Row) => AssistantTopicBody.parse(JSON.parse(String(value.body_json)))

function view(value: Row): AssistantTopicValue {
  const state = value.state
  return AssistantTopic.parse({
    id: value.id,
    assistantId: value.assistant_id,
    title: value.title,
    titleStatus: value.title_status,
    summary: value.summary,
    body: bodyOf(value),
    state,
    origin: value.origin,
    version: value.version,
    lastActiveAt: value.last_active_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    allowedActions: state === 'closed' ? ['resume'] : state === 'paused' ? ['edit', 'close', 'resume'] : ['edit', 'close'],
  })
}

function indexView(value: Row): unknown {
  return AssistantTopicIndex.parse({
    id: value.id,
    assistantId: value.assistant_id,
    title: value.title,
    titleStatus: value.title_status,
    summary: value.summary,
    state: value.state,
    origin: value.origin,
    version: value.version,
    lastActiveAt: value.last_active_at,
    updatedAt: value.updated_at,
  })
}

function revision(s: ChatService, value: AssistantTopicValue) {
  s.db.prepare('INSERT INTO assistant_topic_revisions VALUES(?,?,?,?)').run(value.id, value.version, JSON.stringify({ ...value, allowedActions: [] }), value.updatedAt)
}

const uniqueTexts = (values: string[], limit: number) => {
  const seen = new Set<string>(), out: string[] = []
  for (const value of values) {
    const normalized = key(value)
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    out.push(value.trim())
    if (out.length === limit) break
  }
  return out
}

/** Decision ids are assigned by the service and never reused: a patch retires an
 * entry by id instead of matching its text, so rewording cannot leave a stale
 * conclusion behind. */
const decisionId = (value: number) => `d${value}`

/** Curator patches retire by id and append new decisions; the service owns ids. */
function curatorDecisions(current: AssistantTopicBody['decisions'], incoming: AssistantTopicBodyInput['decisions'], retire: string[], start: number) {
  const retired = new Set(retire)
  const unmatched = retire.filter(id => !current.some(entry => entry.id === id))
  const decisions = current.filter(entry => !retired.has(entry.id))
  const seen = new Set(decisions.map(entry => key(entry.text)))
  let next = start
  for (const entry of incoming) {
    const normalized = key(entry.text)
    if (seen.has(normalized)) continue
    seen.add(normalized)
    decisions.push({ id: decisionId(next), text: entry.text })
    next += 1
  }
  // Only the newest eight stay in the body; older ones remain in the revision trail.
  return { decisions: decisions.slice(-8), next, unmatched }
}

/** Owner edits replace the whole decisions list; ids they send back are kept. */
function ownerDecisions(current: AssistantTopicBody['decisions'], incoming: AssistantTopicBodyInput['decisions'], start: number) {
  const known = new Map(current.map(entry => [entry.id, entry]))
  const seenIds = new Set<string>()
  const seenTexts = new Set<string>()
  const decisions: AssistantTopicBody['decisions'] = []
  let next = start
  for (const entry of incoming) {
    if (entry.id !== undefined) {
      if (seenIds.has(entry.id)) fail('VALIDATION_ERROR')
      seenIds.add(entry.id)
    }
    const normalized = key(entry.text)
    if (seenTexts.has(normalized)) continue
    seenTexts.add(normalized)
    const prior = entry.id ? known.get(entry.id) : undefined
    decisions.push({ id: prior ? prior.id : decisionId(next), text: entry.text })
    if (!prior) next += 1
  }
  return { decisions: decisions.slice(0, 8), next }
}

/** Owner edits replace the sections they send; dedupe and caps still apply. */
function replaceBody(current: AssistantTopicBody, patch: Partial<AssistantTopicBodyInput>, start: number) {
  const decisions = ownerDecisions(current.decisions, patch.decisions ?? current.decisions, start)
  return {
    body: AssistantTopicBody.parse({
      decisions: decisions.decisions,
      openQuestions: patch.openQuestions ? uniqueTexts(patch.openQuestions, 10) : current.openQuestions,
      next: patch.next ? uniqueTexts(patch.next, 10) : current.next,
      constraints: patch.constraints ? uniqueTexts(patch.constraints, 10) : current.constraints,
      notes: patch.notes ? mergeNotes([], patch.notes) : current.notes,
    }),
    next: decisions.next,
  }
}

/** Curator patches retire by id and append; the three current-state sections are
 * replaced wholesale, so an evolving topic can shed stale items. */
function curatorBody(current: AssistantTopicBody, patch: Partial<AssistantTopicBodyInput>, retire: string[], start: number) {
  const decisions = curatorDecisions(current.decisions, patch.decisions ?? [], retire, start)
  return {
    body: AssistantTopicBody.parse({
      decisions: decisions.decisions,
      openQuestions: patch.openQuestions ? uniqueTexts(patch.openQuestions, 10) : current.openQuestions,
      next: patch.next ? uniqueTexts(patch.next, 10) : current.next,
      constraints: patch.constraints ? uniqueTexts(patch.constraints, 10) : current.constraints,
      notes: current.notes,
    }),
    next: decisions.next,
    unmatched: decisions.unmatched,
  }
}

/** Counts sections that changed. Ids make decisions comparable without text matching. */
function changedSections(before: AssistantTopicBody, after: AssistantTopicBody) {
  const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)
  return [
    same(before.decisions, after.decisions),
    same(before.openQuestions, after.openQuestions),
    same(before.next, after.next),
    same(before.constraints, after.constraints),
    same(before.notes, after.notes),
  ].filter(equal => !equal).length
}

function mergeNotes(current: AssistantTopicBody['notes'], incoming: AssistantTopicBody['notes']) {
  const merged = new Map(current.map(note => [key(note.text), { ...note }]))
  for (const note of incoming) {
    const normalized = key(note.text)
    const prior = merged.get(normalized)
    merged.set(normalized, prior ? { ...prior, kind: note.kind, importance: note.importance, status: note.status } : { ...note })
  }
  const values = [...merged.values()]
  if (values.length <= noteLimit) return values
  // Oldest obsolete entries leave the array first; their text stays in the revision.
  return values.filter(note => note.status !== 'obsolete').sort((a, b) => importanceRank[b.importance] - importanceRank[a.importance]).slice(0, noteLimit)
}

const hasSubstance = (body: AssistantTopicBody) => body.decisions.length > 0 || body.constraints.length > 0

function nextTitleStatus(current: Row, title: string | undefined, body: AssistantTopicBody) {
  if (title !== undefined && title !== current.title) return 'provisional' as const
  return hasSubstance(body) ? 'final' as const : current.title_status
}

function assertBody(body: AssistantTopicBody) {
  if (bodyBytes(body) > bodyLimit) fail('PAYLOAD_TOO_LARGE')
}

function write(s: ChatService, value: Row, patch: { title?: string; summary?: string; body?: AssistantTopicBody; state?: Row['state']; origin: Row['origin']; active?: boolean; nextDecisionId?: number }, at = now()) {
  const body = patch.body ?? bodyOf(value)
  assertBody(body)
  const title = patch.title ?? value.title
  const summary = patch.summary ?? value.summary
  const next = {
    title,
    title_status: patch.title !== undefined || patch.body !== undefined ? nextTitleStatus(value, patch.title, body) : value.title_status,
    summary,
    body_json: JSON.stringify(body),
    state: patch.state ?? value.state,
    origin: patch.origin,
    version: value.version + 1,
    updated_at: at,
    last_active_at: patch.active === false ? value.last_active_at : at,
    next_decision_id: patch.nextDecisionId ?? Number(value.next_decision_id),
  }
  s.db.prepare('UPDATE assistant_topics SET title=?,title_status=?,summary=?,body_json=?,state=?,origin=?,version=?,updated_at=?,last_active_at=?,next_decision_id=? WHERE id=? AND owner_id=? AND version=?')
    .run(next.title, next.title_status, next.summary, next.body_json, next.state, next.origin, next.version, next.updated_at, next.last_active_at, next.next_decision_id, value.id, s.c.actor.id, value.version)
  const updated = row(s, value.id)
  revision(s, view(updated))
  return updated
}

export function createTopic(s: ChatService, input: AssistantTopicInput, origin: Row['origin'], subject: ActorFacts, titleStatus: Row['title_status'] = 'final') {
  assertAllowed('personal', 'memory', subject, 'write')
  agentOwner(s, input.assistantId)
  const decisions = ownerDecisions([], input.body.decisions, 1)
  const body = AssistantTopicBody.parse({ ...input.body, decisions: decisions.decisions })
  assertBody(body)
  const existing = s.db.prepare("SELECT id FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND state='active'").get(s.c.actor.id, input.assistantId)
  if (existing) fail('INVALID_STATE')
  const id = randomUUID(), at = now()
  s.db.prepare('INSERT INTO assistant_topics(id,owner_id,assistant_id,title,title_status,summary,body_json,state,origin,version,created_at,updated_at,last_active_at,next_decision_id) VALUES(?,?,?,?,?,?,?,\'active\',?,1,?,?,?,?)')
    .run(id, s.c.actor.id, input.assistantId, input.title, titleStatus, input.summary, JSON.stringify(body), origin, at, at, at, decisions.next)
  const created = row(s, id)
  revision(s, view(created))
  return created
}

/** Curator-only merge path. It records origin='curator' and never trusts a caller
 * version. A patch with no substantive change is not written: version and revision
 * history stay put instead of recording an empty edit. */
export function applyTopicPatch(s: ChatService, patch: AssistantTopicPatch, subject: ActorFacts) {
  assertAllowed('personal', 'memory', subject, 'write')
  const current = row(s, patch.topicId)
  if (current.state === 'closed') fail('INVALID_STATE')
  if (patch.baseVersion !== undefined && current.version !== patch.baseVersion) fail('VERSION_CONFLICT')
  const before = bodyOf(current)
  const merged = curatorBody(before, patch.body ?? {}, patch.retire ?? [], Number(current.next_decision_id))
  const sections = changedSections(before, merged.body)
  const bytesBefore = bodyBytes(before), bytesAfter = bodyBytes(merged.body)
  // Title and summary converge only together with a body change; the server never
  // accepts a rename on its own.
  const title = sections && patch.title && !sameTitle(patch.title, current.title) ? patch.title : undefined
  const summary = sections && patch.summary !== undefined && patch.summary !== current.summary ? patch.summary : undefined
  if (!sections) return { value: current, changed: false, sections, bytesBefore, bytesAfter: bytesBefore, unmatched: merged.unmatched }
  const value = write(s, current, { title, summary, body: merged.body, origin: 'curator', nextDecisionId: merged.next })
  return { value, changed: true, sections, bytesBefore, bytesAfter, unmatched: merged.unmatched }
}

/** Curator switching topics pauses the old active one; closed topics are never injected. */
export function pauseActiveTopic(s: ChatService, assistantId: string, subject: ActorFacts, origin: Row['origin'] = 'curator') {
  assertAllowed('personal', 'memory', subject, 'write')
  agentOwner(s, assistantId)
  const current = s.db.prepare("SELECT * FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND state='active'").get(s.c.actor.id, assistantId) as Row | undefined
  if (!current) return undefined
  return write(s, current, { state: 'paused', origin, active: false })
}

export function ensureActiveTopic(s: ChatService, assistantId: string, title: string, summary: string, subject: ActorFacts) {
  assertAllowed('personal', 'memory', subject, 'write')
  agentOwner(s, assistantId)
  const existing = s.db.prepare("SELECT * FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND state='active'").get(s.c.actor.id, assistantId) as Row | undefined
  if (existing) return existing
  return createTopic(s, { assistantId, title, summary, body: AssistantTopicBody.parse({}) }, 'curator', subject)
}

export function authorizeAssistantTopic(s: ChatService, name: string, req: ChatRequest) {
  if (req.params.id) { row(s, req.params.id); return }
  const body = (req.body ?? {}) as { assistantId?: string }
  const query = (req.query ?? {}) as { assistantId?: string }
  const assistantId = body.assistantId ?? query.assistantId
  if (!assistantId) fail('VALIDATION_ERROR')
  agentOwner(s, assistantId)
  if (name === 'createAssistantTopic') assertAllowed('personal', 'memory', { owner: true }, 'write')
}

export function handleAssistantTopic(s: ChatService, name: string, req: ChatRequest): unknown {
  if (name === 'assistantTopics') {
    const query = req.query as { assistantId: string; state?: string }
    const ids = s.db.prepare("SELECT id FROM assistant_topics WHERE owner_id=? AND assistant_id=? AND (?='all' OR state=?) ORDER BY CASE state WHEN 'active' THEN 0 WHEN 'paused' THEN 1 ELSE 2 END,last_active_at DESC,id DESC")
      .all(s.c.actor.id, query.assistantId, query.state ?? 'all', query.state ?? 'all').map(value => String(value.id))
    return s.page(name as keyof typeof assistantTopicRoutes, req.query, ids, id => indexView(row(s, id)))
  }
  if (name === 'assistantTopic') return { data: view(row(s, req.params.id!)) }
  if (name === 'createAssistantTopic') {
    const input = AssistantTopicInput.parse(req.body)
    return { data: view(createTopic(s, input, 'owner', { owner: true })) }
  }
  if (name === 'updateAssistantTopic') {
    const current = row(s, req.params.id!), input = AssistantTopicUpdate.parse(req.body)
    if (current.state === 'closed') fail('INVALID_STATE')
    s.c.checkVersion(current.version, input.expectedVersion)
    const replacement = replaceBody(bodyOf(current), input.body ?? {}, Number(current.next_decision_id))
    return { data: view(write(s, current, { title: input.title, summary: input.summary, body: replacement.body, origin: 'owner', nextDecisionId: replacement.next })) }
  }
  if (name === 'closeAssistantTopic') {
    const current = row(s, req.params.id!), input = req.body as { expectedVersion: number }
    if (current.state === 'closed') fail('INVALID_STATE')
    s.c.checkVersion(current.version, input.expectedVersion)
    return { data: view(write(s, current, { state: 'closed', origin: 'owner', active: false })) }
  }
  if (name === 'resumeAssistantTopic') {
    const current = row(s, req.params.id!), input = req.body as { expectedVersion: number }
    // A closed topic is finished, not deleted. Resume puts it back into the single
    // active slot, so a closed topic never stays active alongside another one.
    if (current.state !== 'paused' && current.state !== 'closed') fail('INVALID_STATE')
    s.c.checkVersion(current.version, input.expectedVersion)
    pauseActiveTopic(s, current.assistant_id, { owner: true }, 'owner')
    return { data: view(write(s, current, { state: 'active', origin: 'owner' })) }
  }
  if (name === 'assistantTopicHistory') {
    const topic = view(row(s, req.params.id!))
    const revisions = s.db.prepare('SELECT document FROM assistant_topic_revisions WHERE topic_id=? ORDER BY version DESC LIMIT 100').all(topic.id).reverse().flatMap(entry => {
      const parsed = AssistantTopic.safeParse(JSON.parse(String(entry.document)))
      return parsed.success ? [{ ...parsed.data, allowedActions: [] }] : []
    })
    return { data: AssistantTopicHistory.parse({ topic, revisions }) }
  }
  fail('NOT_IMPLEMENTED')
}

export function assistantTopicReplay(s: ChatService, name: string, previous: unknown): unknown {
  const value = previous as { data?: { id?: string } }
  if (!value.data?.id) return previous
  if (name === 'assistantTopicHistory') return handleAssistantTopic(s, name, { params: { id: value.data.id } } as ChatRequest)
  return { data: view(row(s, value.data.id)) }
}
