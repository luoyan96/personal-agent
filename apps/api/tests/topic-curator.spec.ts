import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate, seed, transaction } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { ChatService } from '../src/chat.js'
import { serviceFor, type ModelCall, type ModelResult } from '../src/execution-worker.js'
import { runPersonalModel } from '../src/personal-models.js'
import { queueTopicCuration, topicIndexWanted } from '../src/topic-curator-queue.js'
import { TopicCuratorWorker } from '../src/topic-curator-worker.js'

const cleanup: (() => void)[] = []
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn() })
const result = (value: unknown): ModelResult => ({ text: JSON.stringify(value), failure: null, inputTokens: 1, outputTokens: 1, elapsedMs: 1 })
// Shape-valid but over the 4 KB body cap: twelve 150-character Chinese entries.
const overLimitBody = {
  decisions: Array.from({ length: 3 }, (_, index) => ({ text: `${index}${'约'.repeat(149)}` })),
  constraints: Array.from({ length: 3 }, (_, index) => `${index}${'约'.repeat(149)}`),
  next: Array.from({ length: 3 }, (_, index) => `${index}${'约'.repeat(149)}`),
  openQuestions: Array.from({ length: 3 }, (_, index) => `${index}${'约'.repeat(149)}`),
}
async function fixture(enabled = true) {
  const root = mkdtempSync(join(tmpdir(), 'acceptcat-topic-curator-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const master = join(root, 'synthetic.key'); writeFileSync(master, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(root, 'db.sqlite'), BLOB_ROOT: join(root, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4173', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: master })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db); seed(db, 'test')
  await provisionTestAccounts(db, 'test', [{ memberId: 'member_A', username: 'synthetic-a', password: 'SyntheticPassword123!' }])
  const service = new ChatService(serviceFor(db, 'member_A', config).c, config)
  const call = (name: RouteName, body: unknown = null, id?: string) => transaction(db, () => service.run(name as never, routes[name].request.parse({ body, params: id ? { id } : {}, query: {}, headers: routes[name].method === 'GET' ? {} : { 'Idempotency-Key': randomUUID() } }) as never)) as { data: any }
  if (enabled) transaction(db, () => runPersonalModel(db, service.c.actor, 'createPersonalModel', { body: { name: 'Synthetic model', provider: 'deepseek', model: 'synthetic-model', enabled: true, apiKey: 'SYNTHETIC_API_KEY' }, params: {}, query: {}, headers: { 'Idempotency-Key': randomUUID() } } as never, config))
  const { agent, conversation } = call('personalConversation', {}).data
  const topic = call('createAssistantTopic', { assistantId: agent.id, title: '初始话题', summary: '初始摘要', body: { openQuestions: ['原来的问题'] } }).data
  const message = (text: string, origin: 'human' | 'model', turnId: string | null = null) => service.message(conversation.id, {
    senderContactId: origin === 'human' ? service.human().id : agent.id, origin, text, mentions: [], resources: [], actionIds: [], turnId,
  })
  const queue = () => {
    const turnId = `turn_${randomUUID()}`
    const input = message('上一轮合成问题', 'human', turnId)
    const output = message('上一轮合成回复', 'model')
    const document = JSON.stringify({ agentContactId: agent.id, inputMessageId: input.id, outputMessageId: output.id })
    db.prepare("INSERT INTO chat_turns(id,conversation_id,owner_id,root_id,status,fence,request_json,document) VALUES(?,?,?,?,'succeeded',0,'{}',?)").run(turnId, conversation.id, 'member_A', turnId, document)
    queueTopicCuration(db, 'member_A', agent.id, conversation.id, turnId)
    return turnId
  }
  const job = (turnId: string) => db.prepare('SELECT status,result_json,failure FROM assistant_topic_curator_jobs WHERE turn_id=?').get(turnId) as { status: string; result_json: string | null; failure: string | null }
  const current = () => db.prepare('SELECT version,title,summary,title_status,state FROM assistant_topics WHERE id=?').get(topic.id) as { version: number; title: string; summary: string; title_status: string; state: string }
  return { db, config, agent, conversation, topic, queue, job, current, call, message }
}

it('applies an update_topic patch and consumes one job', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  f.message('后续问题不能写进上一轮话题', 'human')
  let prompt = ''
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async input => {
    prompt = input.prompt
    expect(JSON.parse(input.prompt).currentTopic.id).toBe(f.topic.id)
    expect(JSON.parse(input.prompt).messages.map((message: { text: string }) => message.text)).toEqual(['上一轮合成问题', '上一轮合成回复'])
    return result({ action: 'update_topic', topicId: f.topic.id, baseVersion: 1, title: '新标题', summary: '新摘要', body: { next: ['下一步'], constraints: ['约束'] } })
  })
  expect(await worker.tick()).toBe(true)
  expect(f.job(turnId)).toMatchObject({ status: 'succeeded' })
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'update_topic', version: 2 })
  expect(f.current()).toMatchObject({ version: 2, title: '新标题', summary: '新摘要', title_status: 'provisional' })
  expect(f.call('assistantTopic', null, f.topic.id).data.body.openQuestions).toEqual(['原来的问题'])
  expect(prompt).toContain('上一轮合成回复')
})

it('keeps the topic chosen by the owner while curation is in flight', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => {
    f.call('closeAssistantTopic', { expectedVersion: 1 }, f.topic.id)
    f.call('createAssistantTopic', { assistantId: f.agent.id, title: '我选择的话题', summary: '保留这次选择' })
    return result({ action: 'new_topic', title: '过期模型结果', summary: '不应覆盖手动选择' })
  })
  expect(await worker.tick()).toBe(true)
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'stale' })
  expect(f.db.prepare("SELECT title FROM assistant_topics WHERE state='active'").get()?.title).toBe('我选择的话题')
})

it('drops a stale patch and keeps the newer topic', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({ action: 'update_topic', topicId: f.topic.id, baseVersion: 0, summary: '过期摘要', body: { next: ['过期'] } }))
  expect(await worker.tick()).toBe(true)
  expect(f.job(turnId)).toMatchObject({ status: 'succeeded' })
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'stale' })
  expect(f.current()).toMatchObject({ version: 1, summary: '初始摘要' })
})

it('skips the write when a patch changes nothing', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({ action: 'update_topic', topicId: f.topic.id, baseVersion: 1, body: { openQuestions: ['原来的问题'] } }))
  expect(await worker.tick()).toBe(true)
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'no_change', reason: 'duplicate', sections: 0 })
  expect(f.current()).toMatchObject({ version: 1 })
})

it('reports unknown retire ids instead of writing them', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({ action: 'update_topic', topicId: f.topic.id, baseVersion: 1, retire: ['d9'] }))
  expect(await worker.tick()).toBe(true)
  expect(JSON.parse(f.job(turnId).result_json!)).toMatchObject({ action: 'no_change', unmatched: ['d9'] })
  expect(f.current()).toMatchObject({ version: 1 })
})

it('fails invalid model output and unavailable models without touching the topic', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  expect(await new TopicCuratorWorker(f.db, f.config, Date.now, async () => ({ text: 'not json', failure: null, inputTokens: 1, outputTokens: 1, elapsedMs: 1 })).tick()).toBe(true)
  expect(f.job(turnId).failure).toBe('INVALID_MODEL_OUTPUT')
  expect(f.current()).toMatchObject({ version: 1, summary: '初始摘要' })
  const g = await fixture(false), otherTurn = g.queue()
  expect(await new TopicCuratorWorker(g.db, g.config).tick()).toBe(true)
  expect(g.job(otherTurn).failure).toBe('MODEL_UNAVAILABLE')
})

it('shapes over-long output instead of rejecting the patch', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({
    action: 'update_topic', topicId: f.topic.id, baseVersion: 1,
    title: 't'.repeat(70), summary: 's'.repeat(700),
    body: { decisions: Array.from({ length: 6 }, (_, index) => ({ text: `${index}${'d'.repeat(199)}` })) },
  }))
  expect(await worker.tick()).toBe(true)
  expect(f.job(turnId)).toMatchObject({ status: 'succeeded' })
  const saved = f.call('assistantTopic', null, f.topic.id).data
  expect(saved.title.length).toBe(60)
  expect(saved.summary.length).toBe(600)
  expect(saved.body.decisions.length).toBe(3)
  expect(saved.body.decisions[0].text.length).toBe(150)
  expect(JSON.parse(f.job(turnId).result_json!).shaped.trimmed).toBeGreaterThan(0)
})

it('records an over-cap body and passes the split signal to the next turn', { timeout: 30000 }, async () => {
  const f = await fixture(), first = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({
    action: 'update_topic', topicId: f.topic.id, baseVersion: 1,
    body: { ...overLimitBody },
  }))
  expect(await worker.tick()).toBe(true)
  expect(f.job(first)).toMatchObject({ status: 'failed', failure: 'PAYLOAD_TOO_LARGE' })
  expect(JSON.parse(f.job(first).result_json!).action).toBe('over_limit')
  expect(f.current()).toMatchObject({ version: 1 })
  const second = f.queue()
  let prompt = ''
  const next = new TopicCuratorWorker(f.db, f.config, Date.now, async input => {
    prompt = input.prompt
    return result({ action: 'no_change', reason: 'no_increment' })
  })
  expect(await next.tick()).toBe(true)
  expect(JSON.parse(prompt).previousFailure).toBe('over_limit')
  expect(f.job(second)).toMatchObject({ status: 'succeeded' })
})

it('rolls back the active topic and its history when a new topic is too large', { timeout: 30000 }, async () => {
  const f = await fixture(), turnId = f.queue()
  const before = f.call('assistantTopicHistory', null, f.topic.id).data
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({
    action: 'new_topic', title: '另一个话题', summary: '新的话题摘要',
    body: { ...overLimitBody },
  }))
  expect(await worker.tick()).toBe(true)
  const job = f.job(turnId)
  expect(job).toMatchObject({ status: 'failed', failure: 'PAYLOAD_TOO_LARGE' })
  const failure = JSON.parse(job.result_json!)
  expect(failure.action).toBe('over_limit')
  expect(failure.bytes).toBeGreaterThan(4000)
  expect(f.call('assistantTopicHistory', null, f.topic.id).data).toEqual(before)
  expect(f.db.prepare('SELECT id,state FROM assistant_topics').all()).toEqual([{ id: f.topic.id, state: 'active' }])
})

it('asks for the topic index only after a no-change curation', { timeout: 30000 }, async () => {
  const f = await fixture()
  const settle = (turnId: string, action: string) => f.db.prepare("UPDATE assistant_topic_curator_jobs SET status='succeeded',result_json=? WHERE turn_id=?").run(JSON.stringify({ action }), turnId)
  const first = f.queue()
  settle(first, 'update_topic')
  expect(topicIndexWanted(f.db, f.conversation.id)).toBe(false)
  const second = f.queue()
  settle(second, 'no_change')
  expect(topicIndexWanted(f.db, f.conversation.id)).toBe(true)
  f.queue()
  expect(topicIndexWanted(f.db, f.conversation.id)).toBe(true)
})
