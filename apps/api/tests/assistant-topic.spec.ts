import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase } from '../src/database.js'
import { createServer } from '../src/server.js'
import { ChatService } from '../src/chat.js'
import { serviceFor } from '../src/execution-worker.js'
import { applyTopicPatch } from '../src/assistant-topics.js'
import { fitTopicIndex, topicReference } from '../src/topic-context.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

async function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'assistant-topic-'))
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
  type Session = { cookie: string; csrf: string; id: string }
  const call = async (name: RouteName, session: Session, body: unknown = null, params: Record<string, string> = {}, query = '') => {
    const route = routes[name]
    const response = await fetch(url + route.path.replace(/\{(\w+)\}/g, (_, id: string) => params[id]!) + query, { method: route.method, headers: { origin: config.origin, 'content-type': 'application/json', 'idempotency-key': randomUUID(), cookie: session.cookie, 'x-csrf-token': session.csrf }, ...(route.method === 'GET' ? {} : { body: JSON.stringify(body) }) })
    const text = await response.text()
    return { status: response.status, value: JSON.parse(text), text, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '' }
  }
  const member = async (label: string): Promise<Session & { agentId: string }> => {
    const username = `topic_${label}_${randomUUID().slice(0, 8)}`
    const session: Session = { cookie: '', csrf: '', id: '' }
    expect((await call('register', session, { username, password: '12345678', displayName: `Synthetic ${label}` })).status).toBe(201)
    const login = await call('login', session, { username, password: '12345678' })
    session.cookie = login.cookie
    session.csrf = (await call('session', session)).value.data.csrfToken
    session.id = login.value.data.id
    const agent = (await call('createPersonalAgent', session, { displayName: 'Synthetic agent', introduction: '合成助理', capabilityDescription: '整理合成话题', personality: '简洁' })).value.data
    return { ...session, agentId: agent.id }
  }
  return { db, config, call, member }
}

it('creates one active topic, versions edits and keeps closed topics readable', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner')
  const empty = { decisions: [], openQuestions: [], next: [], constraints: [], notes: [] }
  const created = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '实验讨论', summary: '讨论实验现象', body: empty })
  expect(created.status, created.text).toBe(201)
  const topic = created.value.data
  expect(topic).toMatchObject({ state: 'active', titleStatus: 'final', origin: 'owner', version: 1, allowedActions: ['edit', 'close'] })

  const duplicate = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '第二个话题', summary: '不应创建', body: empty })
  expect(duplicate.status, duplicate.text).toBe(409)
  expect(duplicate.value.error.code).toBe('INVALID_STATE')

  const listed = await s.call('assistantTopics', owner, null, {}, `?assistantId=${owner.agentId}&state=active`)
  expect(listed.value.data.map((entry: { id: string }) => entry.id)).toEqual([topic.id])
  expect(listed.value.data[0].body).toBeUndefined()

  const renamed = await s.call('updateAssistantTopic', owner, { expectedVersion: 1, title: '实验讨论 A' }, { id: topic.id })
  expect(renamed.status, renamed.text).toBe(200)
  expect(renamed.value.data).toMatchObject({ titleStatus: 'provisional', version: 2 })

  const decided = await s.call('updateAssistantTopic', owner, { expectedVersion: 2, body: { ...empty, decisions: [{ text: '采用方案 A' }] } }, { id: topic.id })
  expect(decided.value.data.titleStatus).toBe('final')

  const stale = await s.call('updateAssistantTopic', owner, { expectedVersion: 2, summary: '过期版本' }, { id: topic.id })
  expect(stale.status, stale.text).toBe(409)
  expect(stale.value.error.code).toBe('VERSION_CONFLICT')

  const oversized = await s.call('updateAssistantTopic', owner, { expectedVersion: 3, body: { ...empty, decisions: Array.from({ length: 8 }, (_, index) => ({ text: `${index}${'约'.repeat(149)}` })), constraints: ['约'.repeat(150), '约'.repeat(150), '约'.repeat(150)] } }, { id: topic.id })
  expect(oversized.status, oversized.text).toBe(413)
  expect(oversized.value.error.code).toBe('PAYLOAD_TOO_LARGE')

  const closed = await s.call('closeAssistantTopic', owner, { expectedVersion: 3 }, { id: topic.id })
  expect(closed.status, closed.text).toBe(200)
  expect(closed.value.data).toMatchObject({ state: 'closed', allowedActions: ['resume'] })
  expect((await s.call('assistantTopics', owner, null, {}, `?assistantId=${owner.agentId}&state=active`)).value.data).toEqual([])

  const editAfterClose = await s.call('updateAssistantTopic', owner, { expectedVersion: 4, summary: '关闭后不应可改' }, { id: topic.id })
  expect(editAfterClose.status, editAfterClose.text).toBe(409)
  expect(editAfterClose.value.error.code).toBe('INVALID_STATE')

  const history = await s.call('assistantTopicHistory', owner, null, { id: topic.id })
  expect(history.status, history.text).toBe(200)
  expect(history.value.data.topic.id).toBe(topic.id)
  expect(history.value.data.revisions.map((entry: { version: number }) => entry.version)).toEqual([1, 2, 3, 4])
})

it('resumes a closed topic and keeps a single active topic', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner')
  const first = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '旧话题', summary: '已经关闭的话题', body: {} })
  expect(first.status, first.text).toBe(201)
  const closed = await s.call('closeAssistantTopic', owner, { expectedVersion: 1 }, { id: first.value.data.id })
  expect(closed.value.data).toMatchObject({ state: 'closed', allowedActions: ['resume'] })

  const second = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '新话题', summary: '当前活跃的话题', body: {} })
  expect(second.status, second.text).toBe(201)

  const resumed = await s.call('resumeAssistantTopic', owner, { expectedVersion: 2 }, { id: first.value.data.id })
  expect(resumed.status, resumed.text).toBe(200)
  expect(resumed.value.data).toMatchObject({ state: 'active', version: 3, allowedActions: ['edit', 'close'] })

  const paused = await s.call('assistantTopic', owner, null, { id: second.value.data.id })
  expect(paused.value.data).toMatchObject({ state: 'paused', allowedActions: ['edit', 'close', 'resume'] })

  const active = await s.call('resumeAssistantTopic', owner, { expectedVersion: 3 }, { id: first.value.data.id })
  expect(active.status, active.text).toBe(409)
  expect(active.value.error.code).toBe('INVALID_STATE')

  const back = await s.call('resumeAssistantTopic', owner, { expectedVersion: 2 }, { id: second.value.data.id })
  expect(back.status, back.text).toBe(200)
  expect(back.value.data).toMatchObject({ state: 'active', version: 3 })

  const history = await s.call('assistantTopicHistory', owner, null, { id: first.value.data.id })
  expect(history.value.data.revisions.map((entry: { state: string }) => entry.state)).toEqual(['active', 'closed', 'active', 'paused'])
  expect(history.value.data.revisions.map((entry: { version: number }) => entry.version)).toEqual([1, 2, 3, 4])
})

it('hides another member topic and rejects unknown agents', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner'), other = await s.member('other')
  const created = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '私有话题', summary: '只给本人', body: {} })
  expect(created.status, created.text).toBe(201)
  const id = created.value.data.id
  expect((await s.call('assistantTopic', other, null, { id })).status).toBe(404)
  expect((await s.call('updateAssistantTopic', other, { expectedVersion: 1, summary: '越权修改' }, { id })).status).toBe(404)
  expect((await s.call('assistantTopics', other, null, {}, `?assistantId=${owner.agentId}`)).status).toBe(404)
  expect((await s.call('createAssistantTopic', owner, { assistantId: 'missing_agent', title: '无效', summary: '无效', body: {} })).status).toBe(404)
})

it('exposes the fresh active topic and only asks for an index when requested', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner')
  const created = await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '实验讨论', summary: '结晶条件', body: { next: ['补充对照组'], openQuestions: ['温度上限'] } })
  expect(created.status, created.text).toBe(201)
  const service = new ChatService(serviceFor(s.db, owner.id, s.config).c, s.config)
  const reference = topicReference(service, owner.agentId, 'personal')
  expect(reference?.topic).toMatchObject({ id: created.value.data.id, next: ['补充对照组'], openQuestions: ['温度上限'] })
  expect(reference?.index).toBeUndefined()
  expect(topicReference(service, owner.agentId, 'group')).toBeUndefined()
  await s.call('closeAssistantTopic', owner, { expectedVersion: 1 }, { id: created.value.data.id })
  expect(topicReference(service, owner.agentId, 'personal', { includeIndex: true })).toBeUndefined()
})

it('drops the body after a day and excludes closed topics from the index', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner')
  const older = (await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '旧话题', summary: '旧摘要', body: {} })).value.data
  await s.call('closeAssistantTopic', owner, { expectedVersion: 1 }, { id: older.id })
  const current = (await s.call('createAssistantTopic', owner, { assistantId: owner.agentId, title: '当前话题', summary: '当前摘要', body: { next: ['下一步'] } })).value.data
  const service = new ChatService(serviceFor(s.db, owner.id, s.config).c, s.config)
  const now = Date.now()
  s.db.prepare('UPDATE assistant_topics SET last_active_at=? WHERE id=?').run(new Date(now - 25 * 60 * 60 * 1000).toISOString(), current.id)
  s.db.prepare('UPDATE assistant_topics SET last_active_at=? WHERE id=?').run(new Date(now - 30 * 60 * 60 * 1000).toISOString(), older.id)
  expect(topicReference(service, owner.agentId, 'personal', { now })).toBeUndefined()
  const index = topicReference(service, owner.agentId, 'personal', { now, includeIndex: true })?.index
  expect(index?.entries).toEqual([{ id: current.id, title: '当前话题', summary: '当前摘要', state: 'active' }])
  expect(index?.omitted).toBe(0)
  const listed = await s.call('assistantTopics', owner, null, {}, `?assistantId=${owner.agentId}&state=all`)
  expect(listed.status).toBe(200)
  const closed = listed.value.data.find((entry: { id: string }) => entry.id === older.id)
  expect(closed).toMatchObject({ id: older.id, state: 'closed' })
  expect(closed).not.toHaveProperty('allowedActions')
  expect(closed).not.toHaveProperty('body')
})

it('replaces current sections, keeps decisions and ignores punctuation-only renames', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner')
  const created = (await s.call('createAssistantTopic', owner, {
    assistantId: owner.agentId, title: '蛋炒饭', summary: '蛋炒饭的做法',
    body: { constraints: ['少油'], next: ['先炒蛋'], decisions: [{ text: '用隔夜饭' }] },
  })).value.data
  const service = new ChatService(serviceFor(s.db, owner.id, s.config).c, s.config)
  const curate = (body: Record<string, unknown>, extra: Record<string, unknown>) =>
    applyTopicPatch(service, { topicId: created.id, baseVersion: 1, body, ...extra } as never, { agent: 'assistant' })
  curate({ constraints: ['控糖'], next: ['先备菜'] }, { baseVersion: 1, title: '健康午餐', summary: '午餐流程' })
  let topic = (await s.call('assistantTopic', owner, null, { id: created.id })).value.data
  expect(topic.body.constraints).toEqual(['控糖'])
  expect(topic.body.next).toEqual(['先备菜'])
  expect(topic.body.decisions.map((entry: { text: string }) => entry.text)).toEqual(['用隔夜饭'])
  expect(topic).toMatchObject({ title: '健康午餐', titleStatus: 'provisional' })
  curate({ decisions: [{ text: '用杂粮饭' }] }, { baseVersion: 2, retire: ['d1'] })
  topic = (await s.call('assistantTopic', owner, null, { id: created.id })).value.data
  expect(topic.body.decisions).toMatchObject([{ id: 'd2', text: '用杂粮饭' }])
  expect(topicReference(service, owner.agentId, 'personal')?.topic?.decisions).toEqual(['用杂粮饭'])
  curate({ next: ['先备菜', '按人份定量'] }, { baseVersion: 3, title: '健康午餐。' })
  topic = (await s.call('assistantTopic', owner, null, { id: created.id })).value.data
  expect(topic.title).toBe('健康午餐')
  expect(topic.titleStatus).toBe('final')
})

it('rejects duplicate decision ids and retires only the targeted decision', { timeout: 30000 }, async () => {
  const s = await fixture(), owner = await s.member('owner')
  const created = await s.call('createAssistantTopic', owner, {
    assistantId: owner.agentId, title: '实验讨论', summary: '确定实验条件',
    body: { decisions: [{ text: '采用方案 A' }, { text: '保留对照组' }] },
  })
  expect(created.status, created.text).toBe(201)
  const topic = created.value.data
  const decisions = [{ id: 'd1', text: '采用方案 A' }, { id: 'd2', text: '保留对照组' }]
  expect(topic.body.decisions).toEqual(decisions)

  const duplicate = await s.call('updateAssistantTopic', owner, {
    expectedVersion: 1,
    body: { decisions: [decisions[0], { ...decisions[1], id: 'd1' }] },
  }, { id: topic.id })
  expect(duplicate.status, duplicate.text).toBe(400)
  expect(duplicate.value.error.code).toBe('VALIDATION_ERROR')

  const service = new ChatService(serviceFor(s.db, owner.id, s.config).c, s.config)
  const retired = applyTopicPatch(service, { topicId: topic.id, baseVersion: 1, retire: ['d1'] }, { agent: 'assistant' })
  expect(retired).toMatchObject({ changed: true, unmatched: [] })

  const history = await s.call('assistantTopicHistory', owner, null, { id: topic.id })
  expect(history.status, history.text).toBe(200)
  expect(history.value.data.topic).toMatchObject({ version: 2, body: { decisions: [decisions[1]] } })
  expect(history.value.data.revisions).toMatchObject([
    { version: 1, body: { decisions } },
    { version: 2, body: { decisions: [decisions[1]] } },
  ])
})

it('fits the topic index under its own budget and the reply reserve', { timeout: 30000 }, async () => {
  const prompt = JSON.stringify({ currentRequest: { messageIds: ['m1'] } })
  const entries = Array.from({ length: 20 }, (_, index) => ({ id: `topic_${index}`, title: `话题${index}`, summary: '摘'.repeat(40), state: 'active' as const }))
  const fitted = fitTopicIndex('system', prompt, { entries, omitted: 0 }, 16000)
  expect(fitted).toBeDefined()
  expect(fitted!.entries.length).toBeLessThan(entries.length)
  expect(fitted!.omitted).toBeGreaterThan(0)
  expect(JSON.parse(fitted!.prompt).topicIndex.length).toBe(fitted!.entries.length)
  expect(JSON.parse(fitted!.prompt).currentRequest).toEqual({ messageIds: ['m1'] })
  expect(fitTopicIndex('system', prompt, { entries, omitted: 0 }, 300)).toBeUndefined()
})
