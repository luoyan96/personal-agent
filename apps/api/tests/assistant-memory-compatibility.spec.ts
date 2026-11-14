import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase } from '../src/database.js'
import { createServer } from '../src/server.js'
import { personalPreferencesFingerprint } from '../src/personal-preferences.js'
import { currentHabit } from '../src/feedback-queue.js'
import { ChatWorker } from '../src/chat-worker.js'
import { FeedbackWorker } from '../src/feedback-worker.js'
import { MemoryCompressionWorker } from '../src/memory-compression-worker.js'
import type { ModelCall, ModelResult } from '../src/execution-worker.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const result = (text: string): ModelResult => ({ text, failure: null, inputTokens: 100, outputTokens: 100, elapsedMs: 1 })
async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'assistant-memory-compat-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const key = join(dir, 'synthetic.key')
  writeFileSync(key, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'test.sqlite'), BLOB_ROOT: join(dir, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4317', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: key })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)
  const app = createServer(config), url = await app.listen({ host: '127.0.0.1', port: 0 })
  cleanup.push(() => app.close())
  let cookie = '', csrf = ''
  const call = async (name: RouteName, body: unknown = null, params: Record<string, string> = {}, query = '') => {
    const route = routes[name]
    const response = await fetch(url + route.path.replace(/\{(\w+)\}/g, (_, id: string) => params[id]!) + query, { method: route.method, headers: { origin: config.origin, 'content-type': 'application/json', 'idempotency-key': randomUUID(), cookie, 'x-csrf-token': csrf }, ...(route.method === 'GET' ? {} : { body: JSON.stringify(body) }) })
    const text = await response.text()
    return { status: response.status, value: JSON.parse(text), text, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }
  const username = `compat_${randomUUID().slice(0, 8)}`
  expect((await call('register', { username, password: '12345678', displayName: 'Synthetic owner' })).status).toBe(201)
  const login = await call('login', { username, password: '12345678' })
  cookie = login.cookie
  csrf = (await call('session')).value.data.csrfToken
  expect((await call('createPersonalModel', { name: 'Synthetic model', provider: 'deepseek', model: 'deepseek-flash', enabled: true, apiKey: 'synthetic-no-network' })).status).toBe(201)
  const own = (await call('personalConversation', {})).value.data
  const send = async (text: string) => {
    const response = await call('agentChatMessage', { text }, { id: own.conversation.id })
    expect(response.status, response.text).toBe(201)
    return response.value.data
  }
  const tick = (model: ModelCall) => new ChatWorker(db, config, model).tick()
  return { db, config, call, own, send, tick, url, owner: login.value.data.id }
}

it('keeps old memory routes and revisions authoritative alongside compressed agent notes, and drops revoked-note dialogue', { timeout: 30000 }, async () => {
  const s = await fixture()
  const preference = await s.call('createPersonalMemory', { topic: '交流与工作习惯', content: 'LEGACY_HABIT', scope: 'general' })
  expect(preference.status, preference.text).toBe(201)
  const settings = (await s.call('personalMemorySettings')).value.data
  expect((await s.call('updatePersonalMemorySettings', { expectedVersion: settings.version, quietHours: settings.quietHours, timeZone: 'Europe/London', candidateLearning: true })).status).toBe(200)
  const legacy = await s.call('createChatMemory', { scope: 'private_agent', scopeId: s.own.agent.id, content: 'LEGACY_PRIVATE_NOTE', source: 'Synthetic legacy' })
  expect(legacy.status, legacy.text).toBe(201)
  const note = { scope: 'agent', subjectId: s.own.agent.id, topic: '引用格式', type: 'note', summary: '摘要', detail: 'NEW_COMPRESSED_NOTE', payload: { type: 'note', text: 'NEW_COMPRESSED_NOTE' } }
  for (let index = 0; index < 2; index++) expect((await s.call('createAssistantMemory', note)).status).toBe(201)
  const queued = await s.call('compressAssistantMemories', { subjectId: s.own.agent.id })
  expect(queued.status, queued.text).toBe(202)
  expect(await new MemoryCompressionWorker(s.db, s.config, Date.now, async () => result('{"groups":[]}')).tick()).toBe(true)
  expect(s.db.prepare("SELECT count(*) n FROM assistant_memories WHERE status='confirmed'").get()!.n).toBe(1)
  const active = s.db.prepare("SELECT id,version FROM assistant_memories WHERE status='confirmed'").get()!
  const legacyList = await s.call('chatMemories', null, {}, `?scope=private_agent&scopeId=${s.own.agent.id}`)
  expect(legacyList.value.data.map((memory: { id: string }) => memory.id)).toEqual([legacy.value.data.id])
  expect((await s.call('chatMemoryHistory', null, { id: legacy.value.data.id })).value.data.revisions).toHaveLength(1)
  expect((await s.call('personalMemorySettings')).value.data).toMatchObject({ timeZone: 'Europe/London', candidateLearning: true, version: 2 })
  await s.send('一起讨论这组实验')
  await s.tick(async input => {
    expect(input.prompt).toContain('LEGACY_HABIT')
    expect(input.prompt).toContain('LEGACY_PRIVATE_NOTE')
    expect(input.prompt).toContain('NEW_COMPRESSED_NOTE')
    return result('MODEL_USING_NEW_NOTE')
  })
  const firstSources = JSON.parse(String(s.db.prepare("SELECT request_json FROM chat_turns ORDER BY rowid DESC LIMIT 1").get()!.request_json)).memoryContextSources
  expect(firstSources).toContainEqual({ id: active.id, version: active.version, kind: 'assistant' })
  let enter!: () => void, release!: (value: ModelResult) => void
  const entered = new Promise<void>(resolve => { enter = resolve })
  const late = await s.send('继续比较数据')
  const pending = s.tick(async () => { enter(); return new Promise<ModelResult>(resolve => { release = resolve }) })
  await entered
  expect((await s.call('decideAssistantMemory', { expectedVersion: active.version, decision: 'revoke' }, { id: String(active.id) })).status).toBe(200)
  release(result('STALE_MEMORY_REPLY'))
  await pending
  expect((await s.call('chatTurn', null, { id: late.turn.id })).value.data).toMatchObject({ status: 'cancelled', failure: 'INPUT_CHANGED' })
  await s.send('接着看看结论')
  await s.tick(async input => {
    expect(input.prompt).toContain('LEGACY_HABIT')
    expect(input.prompt).toContain('LEGACY_PRIVATE_NOTE')
    expect(input.prompt).not.toContain('NEW_COMPRESSED_NOTE')
    expect(input.prompt).not.toContain('MODEL_USING_NEW_NOTE')
    return result('根据当前可用内容继续。')
  })
  expect(s.db.prepare('SELECT count(*) n FROM personal_memory_revisions').get()!.n).toBe(1)
})

it('uses the latest confirmed preference or revocation across both domains, while candidates and other owners stay private', { timeout: 30000 }, async () => {
  const s = await fixture()
  const stamp = (table: string, id: string, order: number) => s.db.prepare(`UPDATE ${table} SET updated_at=? WHERE id=?`).run(`2020-01-01T00:00:0${order}.000Z`, id)
  const legacy = (await s.call('createPersonalMemory', { topic: '回复方式', content: 'OLD_CONFIRMED', scope: 'general' })).value.data
  stamp('personal_memories', legacy.id, 1)
  const oldFingerprint = s.db.prepare('SELECT id,version,status FROM personal_memories WHERE member_id=? ORDER BY id').all(s.owner)
  const { createHash } = await import('node:crypto')
  expect(personalPreferencesFingerprint(s.db, s.owner, 1)).toBe(createHash('sha256').update(JSON.stringify({ settings: 1, all: oldFingerprint })).digest('hex'))
  const body = (value: string) => ({ scope: 'personal', subjectId: null, topic: '回答方式', type: 'preference', summary: value, detail: null, payload: { type: 'preference', value, appliesTo: 'general' } })
  const added = await s.call('createAssistantMemory', body('NEW_CONFIRMED'))
  expect(added.status, added.text).toBe(201)
  let newer = added.value.data
  stamp('assistant_memories', newer.id, 2)
  const check = async (included: string[], excluded: string[]) => {
    await s.send('接着讨论这个问题')
    await s.tick(async input => {
      const memories = JSON.stringify(JSON.parse(input.prompt).personalMemories ?? [])
      for (const text of included) expect(memories).toContain(text)
      for (const text of excluded) {
        expect(memories).not.toContain(text)
        expect(input.prompt).not.toContain('MODEL_WITH_' + text)
      }
      return result('MODEL_WITH_' + (included[0] ?? 'NONE'))
    })
  }
  await check(['NEW_CONFIRMED'], ['OLD_CONFIRMED'])
  let corrected = await s.call('updatePersonalMemory', { topic: '回复方式', content: 'OLD_CORRECTION', scope: 'general', expectedVersion: legacy.version }, { id: legacy.id })
  expect(corrected.status, corrected.text).toBe(200)
  stamp('personal_memories', legacy.id, 3)
  await check(['OLD_CORRECTION'], ['NEW_CONFIRMED'])
  const update = await s.call('updateAssistantMemory', { ...body('NEW_CORRECTION'), scope: undefined, subjectId: undefined, expectedVersion: newer.version }, { id: newer.id })
  expect(update.status, update.text).toBe(200)
  newer = update.value.data
  stamp('assistant_memories', newer.id, 4)
  await check(['NEW_CORRECTION'], ['OLD_CORRECTION'])
  const revokedNew = await s.call('decideAssistantMemory', { expectedVersion: newer.version, decision: 'revoke' }, { id: newer.id })
  expect(revokedNew.status, revokedNew.text).toBe(200)
  newer = revokedNew.value.data
  stamp('assistant_memories', newer.id, 5)
  await check([], ['NEW_CORRECTION', 'OLD_CORRECTION'])
  corrected = await s.call('updatePersonalMemory', { topic: '回复方式', content: 'OLD_RESUMED', scope: 'general', expectedVersion: corrected.value.data.version }, { id: legacy.id })
  expect(corrected.status, corrected.text).toBe(200)
  stamp('personal_memories', legacy.id, 6)
  await check(['OLD_RESUMED'], ['NEW_CORRECTION'])
  expect((await s.call('decidePersonalMemory', { expectedVersion: corrected.value.data.version, decision: 'revoke' }, { id: legacy.id })).status).toBe(200)
  stamp('personal_memories', legacy.id, 7)
  await check([], ['NEW_CORRECTION', 'OLD_CORRECTION'])
  const candidate = await s.call('createAssistantMemory', body('NEW_CANDIDATE'))
  expect(candidate.status, candidate.text).toBe(201)
  newer = candidate.value.data
  s.db.prepare("UPDATE assistant_memories SET status='candidate' WHERE id=?").run(newer.id)
  stamp('assistant_memories', newer.id, 8)
  await check([], ['NEW_CANDIDATE', 'NEW_CORRECTION', 'OLD_RESUMED'])
  expect((await s.call('decideAssistantMemory', { expectedVersion: newer.version, decision: 'confirm' }, { id: newer.id })).status).toBe(200)
  stamp('assistant_memories', newer.id, 9)
  await check(['NEW_CANDIDATE'], ['OLD_CORRECTION', 'OLD_RESUMED'])
  const habit = await s.call('createAssistantMemory', { ...body('NEW_SHARED_HABIT'), topic: '交流与工作习惯' })
  expect(habit.status, habit.text).toBe(201)
  expect(currentHabit(s.db, s.owner).content).toBe('NEW_SHARED_HABIT')
  s.db.prepare('DELETE FROM assistant_feedback').run()
  const feedback = '对比方法时，这样先列证据的写法更清楚。'
  await s.send(feedback)
  await s.tick(async () => result('继续按证据比较。'))
  await new FeedbackWorker(s.db, s.config, async input => {
    expect(JSON.parse(input.prompt).previous).toBe('NEW_SHARED_HABIT')
    return result(JSON.stringify({ evidence: feedback, summary: 'UPDATED_SHARED_HABIT' }))
  }).tick()
  expect(currentHabit(s.db, s.owner).content).toBe('UPDATED_SHARED_HABIT')
  expect(s.db.prepare('SELECT version FROM assistant_memories WHERE id=?').get(habit.value.data.id)!.version).toBe(1)
  const otherName = `other_${randomUUID().slice(0, 8)}`
  expect((await s.call('register', { username: otherName, password: '12345678', displayName: 'Other owner' })).status).toBe(201)
  const login = await s.call('login', { username: otherName, password: '12345678' })
  const other = await fetch(s.url + routes.assistantMemory.path.replace('{id}', newer.id), { headers: { cookie: login.cookie } })
  expect(other.status).toBe(404)
  expect(personalPreferencesFingerprint(s.db, login.value.data.id, 1)).toBe(createHash('sha256').update(JSON.stringify({ settings: 1, all: [] })).digest('hex'))
})
