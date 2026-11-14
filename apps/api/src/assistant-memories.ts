import { randomUUID } from 'node:crypto'
import {
  AssistantMemory,
  AssistantMemoryHistory,
  AssistantMemoryInput,
  AssistantMemorySettings,
  AssistantMemoryUpdate,
  assistantMemoryRoutes,
  type AssistantMemoryCompressionJob,
} from '@research-agent-platform/contracts'
import { fail } from './errors.js'
import { memorySettings } from './personal-memories.js'
import type { ChatService, ChatRequest } from './chat.js'

export const assistantMemoryCommands = Object.keys(assistantMemoryRoutes)
type Row = {
  id: string
  owner_id: string
  scope: 'personal' | 'agent'
  subject_id: string | null
  topic: string
  type: 'preference' | 'decision' | 'commitment' | 'note'
  status: 'candidate' | 'confirmed' | 'revoked'
  conflict: number
  origin: 'explicit' | 'feedback' | 'inferred'
  source_kind: 'manual' | 'message' | 'task' | 'conversation'
  source_id: string | null
  source_version: number | null
  source_label: string | null
  summary: string
  detail: string | null
  payload_json: string
  version: number
  created_at: string
  updated_at: string
}
type JobRow = {
  id: string
  owner_id: string
  subject_id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  attempts: number
  lease_until: number | null
  result_json: string | null
  failure: string | null
  created_at: string
  updated_at: string
}
const now = () => new Date().toISOString()
const jobView = (row: JobRow): AssistantMemoryCompressionJob => ({
  id: row.id,
  status: row.status,
  result: row.result_json ? JSON.parse(String(row.result_json)) : null,
  failure: row.failure,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})
const jobRow = (s: ChatService, id: string) => {
  const value = s.db.prepare('SELECT * FROM assistant_memory_compression_jobs WHERE id=? AND owner_id=?').get(id, s.c.actor.id) as JobRow | undefined
  if (!value) fail('NOT_FOUND')
  // Ownership is fixed at enqueue time; a later agent deletion must not hide
  // the owner's own job receipt.
  return value
}
const agentOwner = (s: ChatService, subjectId: string) => {
  const contact = s.contact(subjectId)
  if (contact.identity.kind !== 'personal_agent' || contact.identity.ownerMemberId !== s.c.actor.id) fail('NOT_FOUND')
}
function row(s: ChatService, id: string): Row {
  const value = s.db.prepare('SELECT * FROM assistant_memories WHERE id=? AND owner_id=?').get(id, s.c.actor.id) as Row | undefined
  if (!value) fail('NOT_FOUND')
  if (value.scope === 'agent') agentOwner(s, value.subject_id!)
  return value
}
function view(row: Row): AssistantMemory {
  const status = row.status
  return AssistantMemory.parse({
    id: row.id,
    scope: row.scope,
    subjectId: row.subject_id,
    topic: row.topic,
    type: row.type,
    conflict: row.conflict === 1,
    summary: row.summary,
    detail: row.detail,
    payload: JSON.parse(String(row.payload_json)),
    source: { kind: row.source_kind, id: row.source_id, version: row.source_version, label: row.source_label },
    status,
    origin: row.origin,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    allowedActions: status === 'revoked' ? [] : status === 'candidate' ? ['edit', 'confirm', 'revoke'] : ['edit', 'revoke'],
  })
}
function revision(s: ChatService, value: AssistantMemory) {
  s.db.prepare('INSERT INTO assistant_memory_revisions VALUES(?,?,?,?)').run(value.id, value.version, JSON.stringify({ ...value, allowedActions: [] }), value.updatedAt)
}
function settings(s: ChatService): AssistantMemorySettings {
  return AssistantMemorySettings.parse(memorySettings(s))
}
function scopeInput(body: { scope?: 'personal' | 'agent'; subjectId?: string | null }) {
  if (body.scope === 'agent' && !body.subjectId) fail('VALIDATION_ERROR')
  if (body.scope !== 'agent' && body.subjectId) fail('VALIDATION_ERROR')
}
const normalizeTopic = (value: string) => value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
const detailBytes = (rows: Row[]) => rows.reduce((sum, row) => sum + Buffer.byteLength(String(row.detail ?? ''), 'utf8'), 0)
const agentDetailBudget = 8_000
const agentRecordLimit = 20
export function compressAgent(s: ChatService, subjectId: string) {
  agentOwner(s, subjectId)
  const rows = s.db.prepare("SELECT * FROM assistant_memories WHERE owner_id=? AND scope='agent' AND subject_id=? AND status='confirmed' ORDER BY updated_at DESC,id DESC").all(s.c.actor.id, subjectId) as Row[]
  let merged = 0, archived = 0, conflicts = 0
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    if (row.type !== 'note') continue
    const key = normalizeTopic(row.topic)
    groups.set(key, [...(groups.get(key) ?? []), row])
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const originals = group.map(row => String(row.detail || (JSON.parse(row.payload_json) as {text:string}).text))
    const lines = originals.map(content => content.split(/\r?\n/).filter(Boolean))
    const largest = [...lines].sort((a, b) => b.length - a.length)[0] ?? []
    const compatible = lines.every(sequence => {
      let cursor = 0
      for (const line of sequence) {
        const index = largest.indexOf(line, cursor)
        if (index < 0) return false
        cursor = index + 1
      }
      return true
    })
    if (!compatible) {
      for (const entry of group) if (entry.conflict !== 1) {
        s.db.prepare('UPDATE assistant_memories SET conflict=1,version=version+1,updated_at=? WHERE id=?').run(now(), entry.id)
        revision(s, view(row(s, entry.id)))
      }
      conflicts += group.length
      continue
    }
    const target = group[0]!, content = originals[lines.findIndex(lines => lines === largest)]!
    if (!content || content.length > 2000) continue
    s.db.prepare("UPDATE assistant_memories SET detail=?,payload_json=?,conflict=0,version=version+1,updated_at=? WHERE id=?").run(content, JSON.stringify({ type: 'note', text: content }), now(), target.id)
    revision(s, view(row(s, target.id)))
    merged += group.length - 1
    for (const extra of group.slice(1)) {
      s.db.prepare("UPDATE assistant_memories SET status='revoked',version=version+1,updated_at=? WHERE id=?").run(now(), extra.id)
      revision(s, view(row(s, extra.id)))
    }
  }
  let current = s.db.prepare("SELECT * FROM assistant_memories WHERE owner_id=? AND scope='agent' AND subject_id=? AND status='confirmed' AND type='note' ORDER BY updated_at ASC,id ASC").all(s.c.actor.id, subjectId) as Row[]
  while (current.length > agentRecordLimit || detailBytes(current) > agentDetailBudget) {
    const oldest = current[0]
    if (!oldest) break
    s.db.prepare("UPDATE assistant_memories SET status='revoked',version=version+1,updated_at=? WHERE id=?").run(now(), oldest.id)
    revision(s, view(row(s, oldest.id)))
    archived += 1
    current = current.slice(1)
  }
  return { scope: 'agent' as const, subjectId, merged, archived, conflicts, detailBytes: detailBytes(current) }
}
export type CompressionSnapshot = { id: string; version: number; topic: string; summary: string; type: string }[]
export function compressionSnapshot(s: ChatService, subjectId: string): CompressionSnapshot {
  agentOwner(s, subjectId)
  return s.db.prepare("SELECT id,version,topic,summary,type FROM assistant_memories WHERE owner_id=? AND scope='agent' AND subject_id=? AND status='confirmed' ORDER BY id").all(s.c.actor.id, subjectId) as CompressionSnapshot
}
export function regroupAgentNotes(s: ChatService, subjectId: string, snapshot: CompressionSnapshot, groups: { topic: string; ids: string[] }[]) {
  agentOwner(s, subjectId)
  const byId = new Map(snapshot.filter(note => note.type === 'note').map(note => [note.id, note]))
  const used = new Set<string>()
  for (const group of groups) {
    if (new Set(group.ids).size !== group.ids.length || group.ids.some(id => !byId.has(id) || used.has(id))) continue
    for (const id of group.ids) {
      used.add(id)
      const prior = byId.get(id)!
      if (prior.topic === group.topic) continue
      const changed = s.db.prepare("UPDATE assistant_memories SET topic=?,version=version+1,updated_at=? WHERE id=? AND owner_id=? AND scope='agent' AND subject_id=? AND status='confirmed' AND type='note' AND version=?").run(group.topic, now(), id, s.c.actor.id, subjectId, prior.version)
      if (changed.changes === 1) revision(s, view(row(s, id)))
    }
  }
}
export function queueAgentCompression(s: ChatService, subjectId: string) {
  agentOwner(s, subjectId)
  const id = randomUUID(), at = now()
  s.db.prepare("INSERT INTO assistant_memory_compression_jobs(id,owner_id,subject_id,status,created_at,updated_at) VALUES(?,?,?,'queued',?,?) ON CONFLICT DO NOTHING").run(id, s.c.actor.id, subjectId, at, at)
  const active = s.db.prepare("SELECT * FROM assistant_memory_compression_jobs WHERE owner_id=? AND subject_id=? AND status IN ('queued','running') ORDER BY created_at LIMIT 1").get(s.c.actor.id, subjectId) as JobRow
  return jobView(active)
}
function maybeCompress(s: ChatService, subjectId: string) {
  const rows = s.db.prepare("SELECT * FROM assistant_memories WHERE owner_id=? AND scope='agent' AND subject_id=? AND status='confirmed' AND type='note'").all(s.c.actor.id, subjectId) as Row[]
  if (rows.length > agentRecordLimit || detailBytes(rows) > agentDetailBudget) queueAgentCompression(s, subjectId)
}
export function authorizeAssistantMemory(s: ChatService, name: string, req: ChatRequest) {
  if (name === 'assistantMemoryCompressionJob') { jobRow(s, req.params.id!); return }
  if (req.params.id) { row(s, req.params.id); return }
  if (name === 'compressAssistantMemories') {
    agentOwner(s, String((req.body as { subjectId?: string }).subjectId))
    return
  }
  if (name === 'createAssistantMemory') {
    const body = req.body as { scope?: 'personal' | 'agent'; subjectId?: string | null }
    scopeInput(body)
    if (body.scope === 'agent') agentOwner(s, body.subjectId!)
  }
  if (name === 'assistantMemories') {
    const query = req.query as { scope?: 'personal' | 'agent'; subjectId?: string }
    if (query.scope === 'agent') { if (!query.subjectId) fail('VALIDATION_ERROR'); agentOwner(s, query.subjectId) }
  }
}
export function handleAssistantMemory(s: ChatService, name: string, req: ChatRequest): unknown {
  if (name === 'assistantMemorySettings') return { data: settings(s) }
  if (name === 'updateAssistantMemorySettings') {
    const current = settings(s), b = req.body as AssistantMemorySettings & { expectedVersion: number }
    s.c.checkVersion(current.version, b.expectedVersion)
    s.db.prepare('UPDATE personal_memory_settings SET candidate_learning=?,time_zone=?,quiet_hours_json=?,version=version+1 WHERE member_id=?').run(b.candidateLearning ? 1 : 0, b.timeZone, b.quietHours ? JSON.stringify(b.quietHours) : null, s.c.actor.id)
    return { data: settings(s) }
  }
  if (name === 'assistantMemories') {
    const query = req.query as { scope?: 'personal' | 'agent'; subjectId?: string; status?: string }
    const scope = query.scope ?? 'personal', subject = query.subjectId ?? null
    const ids = s.db.prepare("SELECT id FROM assistant_memories WHERE owner_id=? AND scope=? AND (? IS NULL OR subject_id=?) AND (?='all' OR status=?) ORDER BY updated_at DESC,id").all(s.c.actor.id, scope, subject, subject, query.status ?? 'all', query.status ?? 'all').map(r => String(r.id))
    return s.page(name as keyof typeof assistantMemoryRoutes, req.query, ids, id => view(row(s, id)))
  }
  if (name === 'assistantMemory') return { data: view(row(s, req.params.id!)) }
  if (name === 'createAssistantMemory') {
    const body = AssistantMemoryInput.parse(req.body), created = now()
    scopeInput(body)
    if (body.scope === 'agent') agentOwner(s, body.subjectId!)
    if (body.scope === 'personal' && body.type === 'preference') {
      const prior = s.db.prepare("SELECT id FROM assistant_memories WHERE owner_id=? AND scope='personal' AND type='preference' AND topic=? AND status='confirmed'").get(s.c.actor.id, body.topic)
      if (prior) {
        const id = String(prior.id)
        s.db.prepare("UPDATE assistant_memories SET summary=?,detail=?,payload_json=?,origin='explicit',source_kind=?,source_id=?,source_version=?,source_label=?,conflict=0,version=version+1,updated_at=? WHERE id=?").run(body.summary, body.detail, JSON.stringify(body.payload), body.source.kind, body.source.id, body.source.version, body.source.label, created, id)
        const value = view(row(s, id))
        revision(s, value)
        return { data: value }
      }
    }
    const id = randomUUID(), at = now()
    s.db.prepare("INSERT INTO assistant_memories(id,owner_id,lab_id,scope,subject_id,type,topic,status,origin,source_kind,source_id,source_version,source_label,summary,detail,payload_json,schema_version,version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'confirmed','explicit',?,?,?,?,?,?,?,1,1,?,?)").run(id, s.c.actor.id, body.scope === 'agent' ? s.c.actor.labId : null, body.scope, body.subjectId, body.type, body.topic, body.source.kind, body.source.id, body.source.version, body.source.label, body.summary, body.detail, JSON.stringify(body.payload), created, at)
    const value = view(row(s, id)); revision(s, value)
    if (body.scope === 'agent') maybeCompress(s, body.subjectId!)
    return { data: value }
  }
  if (name === 'updateAssistantMemory') {
    const current = view(row(s, req.params.id!)), body = AssistantMemoryUpdate.parse(req.body)
    if (current.status === 'revoked') fail('INVALID_STATE')
    s.c.checkVersion(current.version, body.expectedVersion)
    s.db.prepare('UPDATE assistant_memories SET type=?,topic=?,summary=?,detail=?,payload_json=?,source_kind=?,source_id=?,source_version=?,source_label=?,conflict=0,version=version+1,updated_at=? WHERE id=?').run(body.type, body.topic, body.summary, body.detail, JSON.stringify(body.payload), body.source.kind, body.source.id, body.source.version, body.source.label, now(), current.id)
    const value = view(row(s, current.id)); revision(s, value)
    if (value.scope === 'agent') maybeCompress(s, value.subjectId!)
    return { data: value }
  }
  if (name === 'decideAssistantMemory') {
    const current = view(row(s, req.params.id!)), b = req.body as { expectedVersion: number; decision: 'confirm' | 'revoke' }
    s.c.checkVersion(current.version, b.expectedVersion)
    if (b.decision === 'revoke' && current.status === 'revoked') fail('INVALID_STATE')
    if (b.decision === 'confirm' && current.status !== 'candidate') fail('INVALID_STATE')
    s.db.prepare('UPDATE assistant_memories SET status=?,version=version+1,updated_at=? WHERE id=?').run(b.decision === 'confirm' ? 'confirmed' : 'revoked', now(), current.id)
    const value = view(row(s, current.id)); revision(s, value)
    if (value.scope === 'agent') maybeCompress(s, value.subjectId!)
    return { data: value }
  }
  if (name === 'compressAssistantMemories') {
    const body = req.body as { subjectId: string }
    return { data: queueAgentCompression(s, body.subjectId) }
  }
  if (name === 'assistantMemoryCompressionJob') return { data: jobView(jobRow(s, req.params.id!)) }
  if (name === 'assistantMemoryHistory') {
    const memory = view(row(s, req.params.id!))
    const revisions = s.db.prepare('SELECT document FROM assistant_memory_revisions WHERE memory_id=? ORDER BY version DESC LIMIT 100').all(memory.id).reverse().flatMap(r => {
      const parsed = AssistantMemory.safeParse(JSON.parse(String(r.document)))
      return parsed.success ? [{ ...parsed.data, allowedActions: [] }] : []
    })
    return { data: AssistantMemoryHistory.parse({ memory, revisions }) }
  }
  fail('NOT_IMPLEMENTED')
}
export function assistantMemoryReplay(s: ChatService, name: string, previous: unknown): unknown {
  if (name === 'assistantMemorySettings' || name === 'updateAssistantMemorySettings') return { data: settings(s) }
  const value = previous as { data?: { id?: string } }
  if ((name === 'compressAssistantMemories' || name === 'assistantMemoryCompressionJob') && value.data?.id) return { data: jobView(jobRow(s, value.data.id)) }
  if (value.data?.id) return { data: view(row(s, String(value.data.id))) }
  return previous
}
