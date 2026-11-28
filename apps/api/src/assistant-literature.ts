import { createHmac } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import {
  assistantLiteratureRoutes, LiteratureRecommendationItem, ResearchDirection,
  ResearchDirections, type LiteratureRecommendationFeed, type RequestFor,
} from '@research-agent-platform/contracts'
import { hash, signingKey, type Actor } from './auth.js'
import { fail } from './errors.js'
import { hasLabMembership, selectedLab } from './lab-access.js'

export type AssistantLiteratureCommand = keyof typeof assistantLiteratureRoutes
export const assistantLiteratureCommands = new Set<string>(Object.keys(assistantLiteratureRoutes))

type DirectionContext = Pick<LiteratureRecommendationFeed, 'source' | 'directions'> & { scopeKey: string }
const BatchItems = LiteratureRecommendationItem.array().max(10)
const feedLimit = 50
const recentBatchLimit = 20

function uniqueDirections(directions: string[]) {
  return [...new Map(directions.map(direction => [direction.toLowerCase(), direction])).values()]
}

function legacyPersonalDirections(db: DatabaseSync, actor: Actor) {
  const profile = db.prepare(`SELECT p.capability_description FROM chat_contact_profiles p
    JOIN chat_contacts c ON c.id=p.contact_id
    WHERE c.kind='human' AND c.lab_id=? AND c.owner_id=? AND c.principal=c.owner_id AND p.role='human'`)
    .get(actor.labId, actor.id)
  // This older profile field also contains free-form skills. Only explicit labels qualify.
  const labels = String(profile?.capability_description ?? '')
    .split(/[\r\n;；]+/)
    .flatMap(line => (/^\s*(?:研究方向|研究领域|research (?:directions?|areas?|interests?))\s*[:：]\s*(.+)$/i.exec(line)?.[1] ?? '').split(/[,，、]/))
    .map(label => ResearchDirection.safeParse(label))
    .flatMap(label => label.success ? [label.data] : [])
  return uniqueDirections(labels).slice(0, 10)
}

function readPersonalDirections(db: DatabaseSync, actor: Actor) {
  const row = db.prepare('SELECT directions,version FROM personal_research_directions WHERE member_id=?').get(actor.id)
  return row
    ? { directions: ResearchDirections.parse(JSON.parse(String(row.directions))), version: Number(row.version) }
    : { directions: legacyPersonalDirections(db, actor), version: 1 }
}

function readLabDirections(db: DatabaseSync, labId: string) {
  const row = db.prepare('SELECT directions,version FROM lab_research_directions WHERE lab_id=?').get(labId)
  return row
    ? { directions: ResearchDirections.parse(JSON.parse(String(row.directions))), version: Number(row.version) }
    : { directions: [], version: 1 }
}

function canReadLabDirections(db: DatabaseSync, actor: Actor, labId: string) {
  return hasLabMembership(db, actor.id, labId) &&
    !db.prepare('SELECT 1 FROM personal_spaces WHERE lab_id=?').get(labId)
}

export function resolveLiteratureDirections(db: DatabaseSync, actor: Actor): DirectionContext {
  const personal = readPersonalDirections(db, actor)
  if (personal.directions.length) {
    return {
      source: 'personal', directions: personal.directions,
      scopeKey: hash(JSON.stringify(['personal', actor.id, personal.version, personal.directions])),
    }
  }
  // Resolve selection again here, including at worker writeback after network I/O.
  const currentLab = selectedLab(db, actor.id, actor.labId)
  if (canReadLabDirections(db, actor, currentLab)) {
    const team = readLabDirections(db, currentLab)
    if (team.directions.length) {
      const membership = db.prepare('SELECT version FROM lab_memberships WHERE lab_id=? AND member_id=?').get(currentLab, actor.id)
      return {
        source: 'team', directions: team.directions,
        scopeKey: hash(JSON.stringify(['team', currentLab, team.version, membership?.version ?? 0])),
      }
    }
  }
  return { source: 'none', directions: [], scopeKey: '' }
}

export function literatureRecommendationBatchId(turnId: string) {
  return `literature_${hash(turnId).slice(0, 40)}`
}

function arxivBaseId(id: string) {
  return id.replace(/v\d+$/, '')
}

/** Call inside the transaction that saves the assistant response and completes the turn. */
export function recordLiteratureRecommendations(db: DatabaseSync, actor: Actor, input: {
  context: DirectionContext
  turnId: string
  messageId: string
  items: LiteratureRecommendationItem[]
}): { batchId: string; items: LiteratureRecommendationItem[] } | null {
  const context = resolveLiteratureDirections(db, actor)
  if (context.source === 'none' || context.scopeKey !== input.context.scopeKey) return null
  const batchId = literatureRecommendationBatchId(input.turnId)
  const message = db.prepare(`SELECT m.id,source.id AS input_id,json_extract(m.document,'$.createdAt') AS created_at
    FROM chat_turns t JOIN chat_conversations c ON c.id=t.conversation_id AND c.kind='personal' AND c.owner_id=t.owner_id
    JOIN chat_messages m ON m.id=json_extract(t.document,'$.outputMessageId') AND m.conversation_id=c.id
    JOIN chat_contacts sender ON sender.id=json_extract(m.document,'$.senderContactId') AND sender.id=json_extract(t.document,'$.agentContactId')
      AND sender.kind='personal_agent' AND sender.owner_id=t.owner_id AND sender.principal=sender.owner_id
    JOIN chat_messages source ON source.id=json_extract(t.document,'$.inputMessageId') AND source.conversation_id=c.id
    JOIN chat_contacts human ON human.id=json_extract(source.document,'$.senderContactId')
      AND human.kind='human' AND human.owner_id=t.owner_id AND human.principal=human.owner_id
    JOIN auth_accounts account ON account.member_id=t.owner_id AND account.disabled=0
    WHERE t.id=? AND t.owner_id=? AND t.status='succeeded' AND m.id=?
      AND json_extract(m.document,'$.origin')='service'
      AND json_extract(m.document,'$.turnId')=t.id AND json_extract(source.document,'$.origin')='human'
      AND NOT EXISTS (SELECT 1 FROM chat_message_retractions WHERE message_id IN (m.id,source.id))`)
    .get(input.turnId, actor.id, input.messageId)
  if (!message) return null

  const items = new Map<string, LiteratureRecommendationItem>()
  for (const item of BatchItems.parse(input.items)) {
    const key = arxivBaseId(item.id)
    if (!items.has(key)) items.set(key, item)
  }
  db.prepare(`INSERT INTO assistant_literature_batches (id,owner_id,scope_key,turn_id,message_id,input_message_id,items,created_at)
    VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(turn_id) DO NOTHING`)
    .run(batchId, actor.id, context.scopeKey, input.turnId, input.messageId, message.input_id!, JSON.stringify([...items.values()]), message.created_at!)
  const saved = db.prepare('SELECT items FROM assistant_literature_batches WHERE id=? AND owner_id=? AND scope_key=? AND message_id=?')
    .get(batchId, actor.id, context.scopeKey, input.messageId)
  return saved ? { batchId, items: BatchItems.parse(JSON.parse(String(saved.items))) } : null
}

function readRecommendations(db: DatabaseSync, actor: Actor): LiteratureRecommendationFeed {
  const { source, directions, scopeKey } = resolveLiteratureDirections(db, actor)
  const items = new Map<string, LiteratureRecommendationFeed['items'][number]>()
  if (source === 'none') return { source, directions, items: [] }
  const batches = db.prepare(`SELECT b.id,b.message_id,b.created_at,b.items FROM assistant_literature_batches b
    WHERE b.owner_id=? AND b.scope_key=?
    AND NOT EXISTS (SELECT 1 FROM chat_message_retractions WHERE message_id IN (b.message_id,b.input_message_id))
    ORDER BY b.created_at DESC,b.rowid DESC LIMIT ?`).all(actor.id, scopeKey, recentBatchLimit)
  for (const batch of batches) {
    const batchId = String(batch.id)
    const messageId = String(batch.message_id)
    const batchItems = BatchItems.parse(JSON.parse(String(batch.items)))
    // A completed no-match search is an empty result for the current scope.
    // Provider failures write no batch and do not erase the last result.
    if (!batchItems.length) break
    for (const item of batchItems) {
      const key = arxivBaseId(item.id)
      if (items.size < feedLimit && !items.has(key)) items.set(key, { ...item, batchId, messageId })
    }
    if (items.size >= feedLimit) break
  }
  const latest = batches[0]
  return {
    source, directions, items: [...items.values()],
    ...(latest ? { updatedAt: String(latest.created_at), batchId: String(latest.id), messageId: String(latest.message_id) } : {}),
  }
}

export function runAssistantLiterature(
  db: DatabaseSync, actor: Actor, name: AssistantLiteratureCommand, request: RequestFor<AssistantLiteratureCommand>,
) {
  if (name === 'assistantLiteratureRecommendations') return { data: readRecommendations(db, actor) }

  const labId = 'id' in request.params ? request.params.id : null
  if (labId && !canReadLabDirections(db, actor, labId)) fail('NOT_FOUND')
  const settings = labId ? readLabDirections(db, labId) : readPersonalDirections(db, actor)
  const canEdit = !labId || !!db.prepare('SELECT 1 FROM lab_managers WHERE lab_id=? AND member_id=?').get(labId, actor.id)
  if (request.body === null) return { data: { ...settings, canEdit } }
  if (!canEdit) fail('FORBIDDEN')

  const key = request.headers['Idempotency-Key']!
  const resource = labId ?? '*'
  const fingerprint = createHmac('sha256', signingKey(db)).update(JSON.stringify(request.body)).digest('hex')
  const previous = db.prepare(`SELECT request_hash,response_json FROM idempotency_results
    WHERE actor_id=? AND command=? AND resource_id=? AND key=?`).get(actor.id, name, resource, key)
  if (previous) {
    if (previous.request_hash !== fingerprint) fail('IDEMPOTENCY_CONFLICT')
    return JSON.parse(String(previous.response_json)) as unknown
  }
  if (settings.version !== request.body.expectedVersion) fail('VERSION_CONFLICT')
  const directions = uniqueDirections(request.body.directions)
  // The first explicit save (even of []) takes precedence over future legacy profile changes.
  const same = settings.version > 1 && JSON.stringify(settings.directions) === JSON.stringify(directions)
  const version = same ? settings.version : settings.version + 1
  if (!same) {
    if (labId) {
      db.prepare(`INSERT INTO lab_research_directions(lab_id,directions,version) VALUES (?,?,?)
        ON CONFLICT(lab_id) DO UPDATE SET directions=excluded.directions,version=excluded.version`)
        .run(labId, JSON.stringify(directions), version)
    } else {
      db.prepare(`INSERT INTO personal_research_directions(member_id,directions,version) VALUES (?,?,?)
        ON CONFLICT(member_id) DO UPDATE SET directions=excluded.directions,version=excluded.version`)
        .run(actor.id, JSON.stringify(directions), version)
    }
  }
  const response = { data: { directions, version, canEdit } }
  db.prepare('INSERT INTO idempotency_results VALUES (?,?,?,?,?,?,?,?)')
    .run(actor.id, name, resource, key, fingerprint, JSON.stringify(response), 200, new Date().toISOString())
  return response
}
