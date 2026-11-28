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
import { ChatWorker } from '../src/chat-worker.js'
import { relationshipReminder } from '../src/assistant-relationship-memory.js'

const cleanup: (() => void)[] = []
afterEach(() => { for (const fn of cleanup.splice(0).reverse()) fn() })
const result = (value: unknown): ModelResult => ({ text: JSON.stringify(value), failure: null, inputTokens: 1, outputTokens: 1, elapsedMs: 1 })
async function fixture(enabled = true) {
  const root = mkdtempSync(join(tmpdir(), 'acceptcat-topic-curator-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const master = join(root, 'synthetic.key'); writeFileSync(master, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(root, 'db.sqlite'), BLOB_ROOT: join(root, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4173', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: master })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db); seed(db, 'test')
  await provisionTestAccounts(db, 'test', [{ memberId: 'member_A', username: 'synthetic-a', password: 'SyntheticPassword123!' }])
  const service = new ChatService(serviceFor(db, 'member_A', config).c, config)
  const call = (name: RouteName, body: unknown = null, id?: string, key = randomUUID()) => transaction(db, () => service.run(name as never, routes[name].request.parse({ body, params: id ? { id } : {}, query: {}, headers: routes[name].method === 'GET' ? {} : { 'Idempotency-Key': key } }) as never)) as { data: any }
  if (enabled) transaction(db, () => runPersonalModel(db, service.c.actor, 'createPersonalModel', { body: { name: 'Synthetic model', provider: 'deepseek', model: 'synthetic-model', enabled: true, apiKey: 'SYNTHETIC_API_KEY' }, params: {}, query: {}, headers: { 'Idempotency-Key': randomUUID() } } as never, config))
  const { agent, conversation } = call('personalConversation', {}).data
  const topic = call('createAssistantTopic', { assistantId: agent.id, title: '初始话题', summary: '初始摘要', body: { context: '原来的背景' } }).data
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
  return { db, config, service, agent, conversation, topic, queue, job, current, call, message }
}

const threadSubject = '离子凝胶的对照实验'
const threadQuote = `我的${threadSubject}还没有做，之后想和你讨论。`
const noteSubject = '拉曼光谱外审'
const noteQuote = `上周的${noteSubject}第一次通过，指导老师指出我整理的图表解释很清楚。`
const sendDaily = async (f: Awaited<ReturnType<typeof fixture>>, text: string, observe?: (input: Record<string, any>) => void) => {
  const sent = f.call('agentChatMessage', { text }, f.conversation.id).data
  const worker = new ChatWorker(f.db, f.config, async input => { observe?.(JSON.parse(input.prompt)); return { ...result({}), text: '收到，我们可以接着讨论。' } })
  expect(await worker.tick()).toBe(true)
  expect(f.call('chatTurn', null, sent.turn.id).data.status).toBe('succeeded')
  return sent
}

function enableLearning(f: Awaited<ReturnType<typeof fixture>>) {
  const settings = f.call('assistantProactiveSettings').data
  f.call('updateAssistantProactiveSettings', { expectedVersion: settings.version, mode: settings.mode, learnFromChat: true })
}

it('learns sourced episodes through ordinary private turns and recalls only relevant entries', { timeout: 30000 }, async () => {
  const f = await fixture()
  // Matching old and current messages is insufficient without the owner's policy.
  const before = await sendDaily(f, threadQuote)
  enableLearning(f)
  expect(await new TopicCuratorWorker(f.db, f.config, Date.now, async input => {
    const model = JSON.parse(input.prompt)
    expect(model.relationship).toBeUndefined()
    return result({ action: 'no_change', relationship: { remember: [{ kind: 'open_thread', messageId: before.message.id, subject: threadSubject, quote: threadQuote }] } })
  }).tick()).toBe(true)
  expect(f.call('assistantRelationshipMemories').data).toEqual([])
  const episode = await sendDaily(f, noteQuote)
  expect(await new TopicCuratorWorker(f.db, f.config, Date.now, async input => {
    const model = JSON.parse(input.prompt)
    expect(model.relationship.sourceMessageIds).toEqual([episode.message.id])
    return result({ action: 'no_change', relationship: { remember: [
      { kind: 'open_thread', messageId: before.message.id, subject: threadSubject, quote: threadQuote },
      { kind: 'experience', messageId: episode.message.id, subject: noteSubject, quote: noteQuote },
    ] } })
  }).tick()).toBe(true)
  const opened = await sendDaily(f, threadQuote)
  expect(await new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({ action: 'no_change', relationship: { remember: [
    { kind: 'open_thread', messageId: opened.message.id, subject: threadSubject, quote: threadQuote },
    { kind: 'experience', messageId: opened.message.id, subject: '合成假消息', quote: '合成的虚假实验数据' },
  ] } })).tick()).toBe(true)

  // A separate account session/device reads the same owner-scoped server records.
  const sameOwner = new ChatService(serviceFor(f.db, 'member_A', f.config).c, f.config)
  await provisionTestAccounts(f.db, 'test', [{ memberId: 'member_B', username: 'synthetic-b', password: 'SyntheticPassword123!' }])
  const otherOwner = new ChatService(serviceFor(f.db, 'member_B', f.config).c, f.config)
  const listReq = routes.assistantRelationshipMemories.request.parse({ params: {}, body: null, headers: {}, query: {} })
  const owned = sameOwner.run('assistantRelationshipMemories', listReq) as { data: { id: string; kind: string }[] }
  expect(owned.data).toMatchObject([
    { kind: 'open_thread', subject: threadSubject, status: 'active', source: { conversationId: f.conversation.id, messageId: opened.message.id } },
    { kind: 'experience', subject: noteSubject, text: noteQuote, source: { messageId: episode.message.id } },
  ])
  expect(otherOwner.run('assistantRelationshipMemories', listReq)).toMatchObject({ data: [] })
  const update = routes.updateAssistantRelationshipMemory.request.parse({ params: { id: owned.data[0]!.id }, body: { operation: 'forget', expectedVersion: 1 }, headers: { 'Idempotency-Key': randomUUID() }, query: {} })
  expect(() => otherOwner.run('updateAssistantRelationshipMemory', update)).toThrow('NOT_FOUND')
  const recall = await sendDaily(f, `${threadSubject}可以怎么安排？`, prompt => {
    expect(prompt.relationshipMemories).toEqual([expect.objectContaining({ subject: threadSubject, sourceMessageId: opened.message.id })])
  })
  await sendDaily(f, '帮我翻译词语 ethernet。', prompt => expect(prompt.relationshipMemories).toBeUndefined())
  expect(f.job(recall.turn.id).status).toBe('queued')
  expect(relationshipReminder(f.service, f.conversation, f.agent.id, Date.now(), () => false)).toMatchObject({ subject: threadSubject, sourceMessageId: opened.message.id })
})

it('drops an in-flight episode if the owner changes learning policy', { timeout: 30000 }, async () => {
  const f = await fixture(); enableLearning(f)
  const episode = await sendDaily(f, noteQuote)
  const curator = new TopicCuratorWorker(f.db, f.config, Date.now, async input => {
    expect(JSON.parse(input.prompt).relationship.sourceMessageIds).toEqual([episode.message.id])
    const policy = f.call('assistantProactiveSettings').data
    f.call('updateAssistantProactiveSettings', { expectedVersion: policy.version, mode: policy.mode, learnFromChat: false })
    f.call('updateAssistantProactiveSettings', { expectedVersion: policy.version + 1, mode: policy.mode, learnFromChat: true })
    return result({ action: 'no_change', relationship: { remember: [{ kind: 'experience', messageId: episode.message.id, subject: noteSubject, quote: noteQuote }] } })
  })
  expect(await curator.tick()).toBe(true)
  expect(JSON.parse(f.job(episode.turn.id).result_json!)).toMatchObject({ action: 'stale' })
  expect(f.call('assistantRelationshipMemories').data).toEqual([])
})

it('rechecks correction, forgetting, and dependent topic summaries before reuse', { timeout: 30000 }, async () => {
  const f = await fixture(); enableLearning(f)
  const first = await sendDaily(f, threadQuote)
  const curator = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({
    action: 'update_topic', topicId: f.topic.id, baseVersion: 1, title: threadSubject, summary: threadQuote,
    body: { openQuestions: [threadQuote] }, relationship: { remember: [{ kind: 'open_thread', messageId: first.message.id, subject: threadSubject, quote: threadQuote }] },
  }))
  expect(await curator.tick()).toBe(true)
  const memory = f.call('assistantRelationshipMemories').data[0]
  expect(memory).toMatchObject({ subject: threadSubject, text: threadQuote, version: 1 })
  const editKey = randomUUID()
  const edit = { operation: 'edit', expectedVersion: 1, subject: threadSubject, text: `关于${threadSubject}，安排改在下个月。` }
  expect(f.call('updateAssistantRelationshipMemory', edit, memory.id, editKey).data).toMatchObject({ status: 'active', version: 2 })
  expect(() => f.call('updateAssistantRelationshipMemory', { operation: 'forget', expectedVersion: 1 }, memory.id)).toThrow('VERSION_CONFLICT')
  expect(relationshipReminder(f.service, f.conversation, f.agent.id, Date.now(), () => false)).toBeUndefined()
  const pending = f.call('agentChatMessage', { text: `说一下${threadSubject}。` }, f.conversation.id).data
  const forget = { operation: 'forget', expectedVersion: 2 }
  const worker = new ChatWorker(f.db, f.config, async input => {
    const prompt = JSON.parse(input.prompt)
    expect(input.prompt).not.toContain(threadQuote)
    expect(prompt.currentTopic).toBeUndefined()
    expect(prompt.relationshipMemories).toMatchObject([{ text: edit.text }])
    expect(f.call('updateAssistantRelationshipMemory', forget, memory.id).data).toMatchObject({ status: 'forgotten', version: 3 })
    return { ...result({}), text: 'This model response is stale.' }
  })
  expect(await worker.tick()).toBe(true)
  expect(f.call('chatTurn', null, pending.turn.id).data).toMatchObject({ status: 'cancelled', outputMessageId: null })
  expect(f.call('assistantRelationshipMemories').data).toEqual([])
  expect(f.call('updateAssistantRelationshipMemory', edit, memory.id, editKey).data).toMatchObject({ status: 'forgotten', version: 3 })
  expect(f.db.prepare('SELECT subject,text FROM assistant_relationship_memories WHERE id=?').get(memory.id)).toEqual({ subject: null, text: null })
  expect(f.service.projectedMessage(first.message.id).text).toBe(threadQuote)
  await sendDaily(f, `还记得${threadSubject}吗？`, prompt => {
    expect(prompt.relationshipMemories).toBeUndefined()
    expect(prompt.currentTopic).toBeUndefined()
    expect(JSON.stringify(prompt)).not.toContain(threadQuote)
  })
  expect(await curator.tick()).toBe(true)
  expect(f.call('assistantRelationshipMemories').data).toEqual([])
})

it('resolves only explicit owner updates and erases expired or withdrawn memory contents', { timeout: 30000 }, async () => {
  const f = await fixture(); enableLearning(f)
  const first = await sendDaily(f, threadQuote)
  expect(await new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({ action: 'no_change', relationship: { remember: [{ kind: 'open_thread', messageId: first.message.id, subject: threadSubject, quote: threadQuote }] } })).tick()).toBe(true)
  const [memory] = f.call('assistantRelationshipMemories').data
  const complete = `${threadSubject}已经完成，结果等我自己核对。`
  const updated = await sendDaily(f, complete)
  expect(await new TopicCuratorWorker(f.db, f.config, Date.now, async input => {
    expect(JSON.parse(input.prompt).relationship.openThreads).toContainEqual({ id: memory.id, version: 1, subject: threadSubject })
    return result({ action: 'no_change', relationship: { resolve: [{ id: memory.id, messageId: updated.message.id, quote: complete }] } })
  }).tick()).toBe(true)
  expect(f.call('assistantRelationshipMemories').data).toMatchObject([{ id: memory.id, status: 'resolved', version: 2 }])
  expect(relationshipReminder(f.service, f.conversation, f.agent.id, Date.now(), () => false)).toBeUndefined()
  const episode = await sendDaily(f, noteQuote)
  expect(await new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({ action: 'no_change', relationship: { remember: [{ kind: 'experience', messageId: episode.message.id, subject: noteSubject, quote: noteQuote }] } })).tick()).toBe(true)
  transaction(f.db, () => f.service.run('withdrawChatMessage', { params: { id: f.conversation.id, messageId: episode.message.id }, body: { expectedVersion: 1 }, query: {}, headers: { 'Idempotency-Key': randomUUID() } }))
  expect(f.call('assistantRelationshipMemories').data).toMatchObject([{ id: memory.id }])
  expect(await new TopicCuratorWorker(f.db, f.config, () => Date.now() + 15 * 86400_000).tick()).toBe(false)
  expect(f.call('assistantRelationshipMemories').data).toEqual([])
  expect(f.db.prepare('SELECT status,subject,text FROM assistant_relationship_memories ORDER BY status').all()).toEqual([
    { status: 'expired', subject: null, text: null }, { status: 'forgotten', subject: null, text: null },
  ])
})

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
  expect(f.call('assistantTopic', null, f.topic.id).data.body.context).toBe('原来的背景')
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
    title: 't'.repeat(70), summary: 's'.repeat(320),
    body: { context: 'c'.repeat(1200), decisions: Array.from({ length: 6 }, (_, index) => ({ text: `${index}`.padEnd(320, 'd'), status: 'confirmed' })) },
  }))
  expect(await worker.tick()).toBe(true)
  expect(f.job(turnId)).toMatchObject({ status: 'succeeded' })
  const saved = f.call('assistantTopic', null, f.topic.id).data
  expect(saved.title.length).toBe(60)
  expect(saved.summary.length).toBe(300)
  expect(saved.body.context.length).toBe(1000)
  expect(saved.body.decisions.length).toBe(3)
  expect(JSON.parse(f.job(turnId).result_json!).shaped.trimmed).toBeGreaterThan(0)
})

it('records an over-cap body and passes the split signal to the next turn', { timeout: 30000 }, async () => {
  const f = await fixture(), first = f.queue()
  const worker = new TopicCuratorWorker(f.db, f.config, Date.now, async () => result({
    action: 'update_topic', topicId: f.topic.id, baseVersion: 1,
    body: { context: '背景'.repeat(500), constraints: Array.from({ length: 5 }, (_, index) => `${index}`.padEnd(300, '约')) },
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
    body: { context: '背景'.repeat(500), constraints: Array.from({ length: 5 }, (_, index) => `${index}`.padEnd(300, '约')) },
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
