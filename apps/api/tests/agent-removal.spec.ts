import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate } from '../src/database.js'
import { createServer } from '../src/server.js'
import { ChatWorker } from '../src/chat-worker.js'
import { PersonalFollowupWorker } from '../src/personal-followups.js'
import type { ModelResult } from '../src/execution-worker.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const profile = { displayName: '可删除的合成助手', introduction: '只讨论提供的合成文字', capabilityDescription: '整理材料', personality: '直接说明判断' }
async function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'rap-agent-removal-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const key = join(dir, 'synthetic.key'); writeFileSync(key, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'platform.sqlite'), BLOB_ROOT: join(dir, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4383', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: key })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db)
  const app = createServer(config)
  const url = await app.listen({ host: '127.0.0.1', port: 0 }); cleanup.push(() => app.close())
  const clients: { id: string; username: string; cookie: string; csrf: string }[] = []
  const call = async (name: RouteName, body: unknown = null, params: Record<string, string> = {}, actor = 0, query: Record<string, string> = {}, key = randomUUID()) => {
    const route = routes[name], path = route.path.replace(/\{(\w+)\}/g, (_, k: string) => params[k]!)
    const response = await fetch(url + path + (Object.keys(query).length ? '?' + new URLSearchParams(query) : ''), {
      method: route.method, headers: { origin: config.origin, 'content-type': 'application/json', 'idempotency-key': key,
        ...(clients[actor] ? { cookie: clients[actor]!.cookie, 'x-csrf-token': clients[actor]!.csrf } : {}) },
      ...(route.method === 'GET' ? {} : { body: JSON.stringify(body) }),
    })
    const text = await response.text()
    return { status: response.status, value: JSON.parse(text), text, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }
  const ok = async (...args: Parameters<typeof call>) => {
    const result = await call(...args); expect(result.status, result.text).toBeLessThan(300); expect(result.status).toBeGreaterThanOrEqual(200)
    routes[args[0]].response.parse(result.value); return result.value.data
  }
  for (const actor of [0, 1]) {
    const username = `removal_${actor}_${randomUUID().slice(0, 8)}`, password = '12345678'
    await ok('register', { username, password, displayName: `合成用户${actor}` }, {}, actor)
    const login = await call('login', { username, password }, {}, actor)
    clients[actor] = { id: login.value.data.id, username, cookie: login.cookie, csrf: '' }
    clients[actor]!.csrf = (await ok('session', null, {}, actor)).csrfToken
  }
  const create = async (fields = profile) => ok('importAgentProfile', { format: 'research-agent-profile/v1', profile: fields })
  return { dir, db, config, call, ok, clients, create }
}

describe('owner Agent deletion and contact removal: actual HTTP/SQLite, synthetic only', { timeout: 30000 }, () => {
  it('migrates populated schema026 twice with every existing row, blob and checksum intact', async () => {
    const s = await setup(); await s.create()
    const blob = join(s.config.blobRoot, 'synthetic-retained.blob'); writeFileSync(blob, 'retained synthetic material')
    s.db.exec('DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE IF EXISTS team_library_repositories; DELETE FROM schema_migrations WHERE version=33; DROP TABLE IF EXISTS library_index_entries; DELETE FROM schema_migrations WHERE version=32; DROP TABLE task_handoffs; DELETE FROM schema_migrations WHERE version=31; DROP TABLE team_work; DROP TABLE work_executions; DROP TABLE work_devices; DELETE FROM schema_migrations WHERE version=30; DROP TABLE work_context_revisions; DROP TABLE work_context_records; DELETE FROM schema_migrations WHERE version=29; DROP TABLE chat_message_retractions; DROP TABLE chat_message_relations; DELETE FROM schema_migrations WHERE version=28; DROP TABLE deleted_personal_agents; DELETE FROM schema_migrations WHERE version=27')
    const tables = s.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => String(row.name))
    const snapshot = () => Object.fromEntries(tables.map(table => [table, createHash('sha256').update(JSON.stringify(s.db.prepare('SELECT * FROM "' + table + '" ORDER BY rowid').all())).digest('hex')]))
    const before = snapshot(); migrate(s.db); migrate(s.db)
    const after = snapshot(); expect(after.schema_migrations).not.toEqual(before.schema_migrations)
    delete after.schema_migrations; delete before.schema_migrations; expect(after).toEqual(before)
    expect(readFileSync(blob, 'utf8')).toBe('retained synthetic material')
    expect(s.db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(39)
    expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
  })
  it('requires owner and exact reviewed version, rejects human/system deletion and reauthorizes cached receipts', async () => {
    const s = await setup(), created = await s.create(), id = created.contact.id
    expect((await s.call('deletePersonalAgent', { expectedVersion: 1 }, { id }, 1)).status).toBe(404)
    const system = await s.ok('personalConversation', {})
    expect((await s.call('deletePersonalAgent', { expectedVersion: 1 }, { id: system.agent.id })).status).toBe(403)
    const human = s.db.prepare("SELECT id FROM chat_contacts WHERE kind='human' AND owner_id=?").get(s.clients[0]!.id)!
    expect((await s.call('deletePersonalAgent', { expectedVersion: 1 }, { id: String(human.id) })).status).toBe(403)
    await s.ok('updateContactProfile', { expectedVersion: 1, ...profile, personality: '本人新修改' }, { id })
    expect((await s.call('deletePersonalAgent', { expectedVersion: 1 }, { id })).status).toBe(409)
    expect(s.db.prepare('SELECT * FROM deleted_personal_agents').all()).toEqual([])
    const key = randomUUID(), receipt = await s.ok('deletePersonalAgent', { expectedVersion: 2 }, { id }, 0, {}, key)
    expect(await s.ok('deletePersonalAgent', { expectedVersion: 2 }, { id }, 0, {}, key)).toEqual(receipt)
    expect((await s.call('deletePersonalAgent', { expectedVersion: 2 }, { id }, 1, {}, key)).status).toBe(404)
    expect(s.db.prepare('SELECT * FROM deleted_personal_agents').all()).toHaveLength(1)
  })
  it('removes discovery/reuse, cancels its schedules and clears its key while keeping history, other Agents and private data', async () => {
    const s = await setup(), created = await s.create(), id = created.contact.id, other = await s.create({ ...profile, displayName: '仍使用的助手' })
    const note = await s.ok('sendChatMessage', { text: '应保留的历史文字', intent: 'chat' }, { id: created.conversation.id })
    await s.ok('createChatMemory', { scope: 'private_agent', scopeId: id, content: '只属于本人的合成偏好', source: null })
    const scheduled = await s.ok('createPersonalFollowup', { title: '合成定时任务', body: '整理合成文字', dueAt: new Date(Date.now() + 3600000).toISOString(), timeZone: 'Asia/Shanghai', execution: { kind: 'agent', contactId: id }, recurrence: { frequency: 'daily' } })
    await s.ok('updateAgentConnection', { expectedVersion: 0, protocol: 'chat_completions', endpoint: 'https://synthetic-agent.example/v1/chat/completions', model: 'synthetic', enabled: true, allowAcceptedContacts: false, apiKey: 'SYNTHETIC_PRIVATE_KEY' }, { id })
    await s.ok('deletePersonalAgent', { expectedVersion: 1 }, { id })
    const contact = await s.ok('chatContact', null, { id }); expect(contact.allowedActions).toEqual([]); expect(contact.displayName).toContain('已删除')
    expect((await s.ok('chatContacts', null, {}, 0, { view: 'mine', limit: '100' })).some((c: { id: string }) => c.id === id)).toBe(false)
    expect((await s.ok('chatConversation', null, { id: created.conversation.id })).allowedActions).toEqual([])
    expect((await s.call('agentChatMessage', { text: '不能继续调用' }, { id: created.conversation.id })).status).toBe(403)
    expect((await s.call('createDirectConversation', { contactId: id })).status).toBe(403)
    expect((await s.call('updateContactProfile', { expectedVersion: 2, ...profile }, { id })).status).toBe(409)
    expect(s.db.prepare('SELECT * FROM agent_connections WHERE contact_id=?').get(id)).toMatchObject({ configured: 0, enabled: 0, encrypted_api_key: null })
    expect((await s.ok('personalFollowup', null, { id: scheduled.id })).status).toBe('cancelled')
    expect(s.db.prepare('SELECT document FROM chat_messages WHERE id=?').get(note.message.id)).toBeTruthy()
    expect(s.db.prepare('SELECT content FROM chat_memories WHERE scope_id=?').get(id)!.content).toBe('只属于本人的合成偏好')
    expect((await s.ok('chatContact', null, { id: other.contact.id })).allowedActions).toContain('chat')
    const replacement = await s.create(); expect(replacement.reused).toBe(false); expect(replacement.contact.id).not.toBe(id)
  })
  it('unbinds only the deleted Agent while preserving Skill content, versions and other bindings', async () => {
    const s = await setup(), created = await s.create(), other = await s.create({ ...profile, displayName: '保留绑定' })
    const skill = await s.ok('installSkill', { package: { name: 'synthetic-removal-binding', description: '合成 Skill', release: '1', instructions: '仅整理提供的合成文字', references: [], requirements: [], scriptCount: 0, assetCount: 0 }, source: { kind: 'copy', label: 'synthetic', revision: null } })
    const bound = await s.ok('updateSkillSettings', { ...skill.settings, boundAgentIds: [created.contact.id, other.contact.id], expectedVersion: skill.version }, { id: skill.id })
    const versions = s.db.prepare('SELECT * FROM installed_skill_versions WHERE skill_id=?').all(skill.id)
    await s.ok('deletePersonalAgent', { expectedVersion: 1 }, { id: created.contact.id })
    const after = await s.ok('skillSource', null, { id: skill.id })
    expect(after.skill.settings).toEqual({ ...bound.settings, boundAgentIds: [other.contact.id] })
    expect(after.skill.version).toBe(bound.version + 1); expect(after.skill.revision).toBe(bound.revision)
    expect(s.db.prepare('SELECT * FROM installed_skill_versions WHERE skill_id=?').all(skill.id)).toEqual(versions)
    await s.ok('updateSkillSettings', { ...after.skill.settings, listed: true, expectedVersion: after.skill.version }, { id: skill.id })
    expect((await s.call('updateSkillSettings', { ...after.skill.settings, boundAgentIds: [created.contact.id], expectedVersion: after.skill.version + 1 }, { id: skill.id })).status).toBe(409)
  })
  it('denies unsent recurring reminders without withdrawing sent records or stopping another Agent', async () => {
    const s = await setup(), created = await s.create(), other = await s.create({ ...profile, displayName: '独立定时工作' })
    const due = Date.now() + 3600000
    const input = { title: '合成周期工作', body: '合成内容', dueAt: new Date(due).toISOString(), timeZone: 'Asia/Shanghai', quietHours: null, recurrence: { frequency: 'daily' }, execution: { kind: 'agent' } }
    const followup = await s.ok('createPersonalFollowup', { ...input, execution: { ...input.execution, contactId: created.contact.id } })
    const kept = await s.ok('createPersonalFollowup', { ...input, execution: { ...input.execution, contactId: other.contact.id } })
    const worker = new PersonalFollowupWorker(s.db, s.config, () => due + 1000)
    await worker.tick(); await worker.tick()
    const first = s.db.prepare('SELECT * FROM personal_followup_runs WHERE followup_id=?').get(followup.id)!
    const independent = s.db.prepare('SELECT * FROM personal_followup_runs WHERE followup_id=?').get(kept.id)!
    s.db.prepare("UPDATE im_message_outbox SET status='sent' WHERE message_id=?").run(first.message_id!)
    const nextWorker = new PersonalFollowupWorker(s.db, s.config, () => due + 86400000 + 1000)
    await nextWorker.tick(); await nextWorker.tick()
    const later = s.db.prepare('SELECT * FROM personal_followup_runs WHERE followup_id=? ORDER BY scheduled_at DESC LIMIT 1').get(followup.id)!
    expect(later.id).not.toBe(first.id)
    await s.ok('deletePersonalAgent', { expectedVersion: 1 }, { id: created.contact.id })
    expect((await s.ok('personalFollowup', null, { id: followup.id })).status).toBe('cancelled')
    expect((await s.ok('personalFollowup', null, { id: kept.id })).status).toBe('active')
    expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(first.message_id!)!.status).toBe('sent')
    expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(later.message_id!)!.status).toBe('denied')
    expect(s.db.prepare('SELECT status FROM im_message_outbox WHERE message_id=?').get(independent.message_id!)!.status).toBe('pending')
    expect(s.db.prepare('SELECT * FROM personal_followup_runs WHERE followup_id=?').all(followup.id)).toHaveLength(2)
  })
  it('fences an in-flight reply, retains actual returned usage and never publishes late content', async () => {
    const s = await setup(), created = await s.create(), id = created.contact.id
    await s.ok('createPersonalModel', { name: '合成模型', provider: 'deepseek', model: 'deepseek-flash', enabled: true, apiKey: 'SYNTHETIC_MODEL_KEY' })
    const sent = await s.ok('agentChatMessage', { text: '合成问题' }, { id: created.conversation.id })
    let entered!: () => void, release!: (value: ModelResult) => void
    const entering = new Promise<void>(resolve => { entered = resolve })
    const pending = new ChatWorker(s.db, s.config, async () => { entered(); return new Promise<ModelResult>(resolve => { release = resolve }) }).tick()
    await entering
    await s.ok('deletePersonalAgent', { expectedVersion: 1 }, { id })
    release({ text: 'LATE_DELETED_AGENT_MUST_NOT_PUBLISH', failure: null, inputTokens: 17, outputTokens: 9, elapsedMs: 10 }); await pending
    const turn = await s.ok('chatTurn', null, { id: sent.turn.id })
    expect(turn).toMatchObject({ status: 'cancelled', failure: 'AUTHORITY_CHANGED', outputMessageId: null, usage: { inputTokens: 17, outputTokens: 9 } })
    expect(turn.allowedActions).not.toContain('retry')
    expect(s.db.prepare("SELECT count(*) n FROM chat_messages WHERE document LIKE '%LATE_DELETED_AGENT_MUST_NOT_PUBLISH%'").get()!.n).toBe(0)
  })
  it('cancels bound planning without changing an existing plan or task and rejects future binding', async () => {
    const s = await setup(), created = await s.create(), id = created.contact.id
    await s.ok('createPersonalModel', { name: '合成规划模型', provider: 'deepseek', model: 'deepseek-flash', enabled: true, apiKey: 'SYNTHETIC_MODEL_KEY' })
    const plan = await s.ok('createPlan', { labId: created.conversation.labId, goal: '删除助手不能改变的原有科研任务', proposedItems: [{ id: 'original', title: '保留任务', goal: '保留原任务', deliverable: '合成结果', acceptanceCriteria: '保留任务与结果', allocation: { kind: 'self' }, dependencies: [], schedule: { suggested: null, hardDeadline: null, committed: null, estimatedHumanHours: null, checkpoint: null }, inputArtifactIds: [], budget: null }], unresolvedQuestions: [] })
    const confirmed = await s.ok('confirmPlan', { expectedVersion: 1 }, { id: plan.id }); expect(confirmed.taskIds).toHaveLength(1)
    const request = { labId: created.conversation.labId, colleague: { contactId: id, conversationId: created.conversation.id }, replyMode: 'conversation', prompt: '完善提供的合成课题', inputArtifactIds: [], budget: { maxTokens: 4000, maxSeconds: 90 } }
    const job = await s.ok('planRequest', request)
    const priorFence = Number(s.db.prepare('SELECT fence FROM execution_jobs WHERE id=?').get(job.id)!.fence)
    expect(JSON.parse(String(s.db.prepare('SELECT request_json FROM execution_jobs WHERE id=?').get(job.id)!.request_json)).colleagueBinding.contactId).toBe(id)
    const before = JSON.stringify(s.db.prepare('SELECT * FROM plans').all()) + JSON.stringify(s.db.prepare('SELECT * FROM tasks').all())
    await s.ok('deletePersonalAgent', { expectedVersion: 1 }, { id })
    expect(s.db.prepare('SELECT status,fence FROM execution_jobs WHERE id=?').get(job.id)).toMatchObject({ status: 'cancelled', fence: priorFence + 1 })
    expect(JSON.stringify(s.db.prepare('SELECT * FROM plans').all()) + JSON.stringify(s.db.prepare('SELECT * FROM tasks').all())).toBe(before)
    expect((await s.call('planRequest', request)).status).toBeGreaterThanOrEqual(400)
  })
  it('releases the active Agent quota while preserving deleted identities and refusing to reuse them', async () => {
    const s = await setup(), first = await s.create()
    for (let n = 1; n < 20; n++) await s.create({ ...profile, displayName: '合成助手' + n })
    expect((await s.call('createPersonalAgent', { ...profile, displayName: '超过额度' })).status).toBe(429)
    await s.ok('deletePersonalAgent', { expectedVersion: 1 }, { id: first.contact.id })
    const replacement = await s.create()
    expect(replacement.reused).toBe(false); expect(replacement.contact.id).not.toBe(first.contact.id)
    expect(s.db.prepare("SELECT count(*) n FROM chat_contacts WHERE owner_id=? AND kind='personal_agent' AND principal<>owner_id").get(s.clients[0]!.id)!.n).toBe(21)
    expect(s.db.prepare('SELECT * FROM deleted_personal_agents').all()).toHaveLength(1)
  })
  it('deletes only the human relationship, retains the other account and permits explicit re-adding', async () => {
    const s = await setup()
    const targets = await s.ok('chatContacts', null, {}, 0, { scope: 'global', search: s.clients[1]!.username })
    const human = targets.find((c: { identity: { kind: string } }) => c.identity.kind === 'human')
    const requested = await s.ok('requestContact', {}, { id: human.id })
    await s.ok('decideContactRequest', { decision: 'accept', expectedVersion: requested.relationship.version }, { id: requested.relationship.requestId }, 1)
    const accepted = await s.ok('chatContact', null, { id: human.id })
    await s.ok('revokeContact', { expectedVersion: accepted.relationship.version }, { id: human.id })
    expect((await s.ok('chatContacts', null, {}, 0, { view: 'mine', limit: '100' })).some((c: { id: string }) => c.id === human.id)).toBe(false)
    expect(s.db.prepare('SELECT disabled FROM auth_accounts WHERE member_id=?').get(s.clients[1]!.id)!.disabled).toBe(0)
    expect((await s.ok('requestContact', {}, { id: human.id })).relationship.status).toBe('pending_outbound')
  })
})
