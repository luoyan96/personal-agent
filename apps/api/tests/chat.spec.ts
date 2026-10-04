import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { routes } from '@research-agent-platform/contracts'
import type { RouteName, Contact, ChatAction, Conversation } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { openDatabase, migrate, seed, transaction } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'
import { ChatWorker, reconcileChat } from '../src/chat-worker.js'
import { ExecutionWorker } from '../src/execution-worker.js'
import type { ModelCall } from '../src/execution-worker.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
const schedule = { suggested: null, hardDeadline: null, committed: null, estimatedHumanHours: null, checkpoint: null }
const budget = { maxTokens: 5000, maxSeconds: 30 }
const model = (value: unknown): ModelCall => async () => ({ text: JSON.stringify(value), failure: null, inputTokens: 100, outputTokens: 200, elapsedMs: 20 })
const reply = (answer = '这是合成模型的普通问答。', actions: unknown[] = []) => ({ answer, waitingInput: false, group: null, actions })
async function setup(enabled = true) {
  const dir = mkdtempSync(join(tmpdir(), 'rap-chat-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const credential = join(dir, 'synthetic.key'); writeFileSync(credential, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'chat.sqlite'), BLOB_ROOT: join(dir, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4173', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: credential })
  mkdirSync(config.blobRoot); const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db); seed(db, 'test')
  const accounts = ['A', 'B', 'C'].map(letter => ({ memberId: `member_${letter}`, username: `chat_${letter}`, password: randomBytes(24).toString('hex') }))
  await provisionTestAccounts(db, 'test', accounts)
  db.prepare('INSERT INTO lab_managers(lab_id,member_id,granted_at) VALUES (?,?,?)').run('lab_synthetic', 'member_A', new Date().toISOString())
  db.prepare("INSERT INTO public_capabilities VALUES (?,?,1,1,'member_A')").run('lab_synthetic', 'text-evidence-checklist')
  const app = createServer(config); cleanup.push(() => app.close())
  const clients: { cookie: string; csrf: string }[] = []
  for (const a of accounts) {
    const r = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: config.origin }, payload: { username: a.username, password: a.password } })
    expect(r.statusCode).toBe(200); const cookie = String(r.headers['set-cookie']).split(';')[0]!
    const session = await app.inject({ url: '/api/v1/auth/session', headers: { cookie } }); clients.push({ cookie, csrf: session.json().data.csrfToken })
  }
  async function call(name: RouteName, body: unknown = null, params: Record<string, string> = {}, actor = 0, query = '', key = randomUUID()) {
    const r = routes[name], client = clients[actor]!, url = r.path.replace(/\{(\w+)\}/g, (_, k: string) => params[k]!) + query
    const result = await app.inject({ method: r.method, url, headers: { origin: config.origin, cookie: client.cookie, 'x-csrf-token': client.csrf, 'idempotency-key': key }, ...(r.method !== 'GET' ? { payload: body as Record<string, unknown> } : {}) })
    return { status: result.statusCode, value: result.json(), raw: result.body }
  }
  if (enabled) expect((await call('updateLabAiSettings', { expectedVersion: 0, enabled: true, model: 'deepseek-flash', apiKey: 'sk-synthetic-chat-only-not-a-real-key' }, { id: 'lab_synthetic' })).status).toBe(200)
  const contacts = (await call('chatContacts')).value.data as Contact[]
  const human = (member: string) => contacts.find(c => c.identity.kind === 'human' && c.identity.memberId === member)!
  const agent = (member: string) => contacts.find(c => c.identity.kind === 'personal_agent' && c.identity.ownerMemberId === member)!
  const publicAgent = contacts.find(c => c.identity.kind === 'public_agent')!
  const personal = (await call('personalConversation', {})).value.data.conversation as Conversation
  async function ask(conversationId = personal.id, agentId = agent('member_A').id, context: unknown[] = [], text = '合成普通问题', actor = 0) {
    const r = await call('sendChatMessage', { text, intent: 'ask_agent', agentContactId: agentId, budget, context }, { id: conversationId }, actor)
    expect(r.status, r.raw).toBe(201); return r.value.data
  }
  async function groupProposal(contactIds = [human('member_B').id, publicAgent.id], initiallyInvite = false, context:unknown[] = []) {
    const sent = await ask(personal.id,agent('member_A').id,context)
    const output = { ...reply('建议审核两项合成工作。'), group: { title: '合成任务群', contactIds, sharedContext: { selectedText: '只分享这段合成目标。', artifactRefs: [] }, plan: { labId: 'lab_synthetic', goal: '合成目标', proposedItems: [
      { id: 'human_item', title: '待邀请工作', goal: '整理文字', deliverable: '文字清单', acceptanceCriteria: '可检查', allocation: initiallyInvite ? {kind:'invitation',memberId:'member_B'} : { kind: 'claim', audience: 'lab_members', summary: '合成待承接工作' }, dependencies: [], schedule, inputArtifactIds: [], budget: null },
      { id: 'ai_item', title: '本人负责工作', goal: '检查合成文字', deliverable: '证据清单', acceptanceCriteria: '引文可追溯', allocation: { kind: 'self' }, dependencies: [], schedule, inputArtifactIds: [], budget: null },
    ], unresolvedQuestions: [] } } }
    expect(await new ChatWorker(db, config, model(output)).tick()).toBe(true)
    const turn = await call('chatTurn', null, { id: sent.turn.id }); expect(turn.value.data.status, turn.raw).toBe('succeeded')
    const actions = await call('chatActions', null, { id: personal.id }); const action = actions.value.data[0] as ChatAction; expect(action.payload.kind).toBe('create_group')
    const command = { expectedVersion: action.version, expectedConversationVersion: personal.version, decision: 'confirm' }, key = randomUUID()
    const created = await call('decideChatAction', command, { id: action.id }, 0, '', key); expect(created.status, created.raw).toBe(200)
    const group = (await call('chatConversation', null, { id: created.value.data.conversationId })).value.data as Conversation
    return { group, action, command, key, receipt: created, tasks: created.value.data.resources.map((r: { ref: { id: string } }) => r.ref.id) as string[] }
  }
  async function proposeAction(group: Conversation, action: unknown, context: unknown[]) {
    await ask(group.id, publicAgent.id, context)
    await new ChatWorker(db, config, model(reply('请确认这项受控动作。', [action]))).tick()
    const actions = await call('chatActions', null, { id: group.id }); const value = actions.value.data[0] as ChatAction
    expect(value?.payload, actions.raw).toEqual(action)
    return value
  }
  return { dir, db, config, app, clients, accounts, call, contacts, human, agent, publicAgent, personal, ask, groupProposal, proposeAction }
}

describe('CHAT1 real service with synthetic ModelCall', {timeout:15000}, () => {
  it('upgrades a populated migration 012 chat database without rewriting existing conversations or messages', async () => {
    const s = await setup(false)
    await s.call('sendChatMessage', { text: '保留旧聊天记录' }, { id: s.personal.id })
    const previous = s.db.prepare('SELECT document FROM chat_conversations WHERE id=?').get(s.personal.id)!.document
    const message = s.db.prepare('SELECT document FROM chat_messages WHERE conversation_id=?').get(s.personal.id)!.document
    // Reconstruct the exact 012 shape by removing only the new 013 table/history.
    // Existing applied checksums and all chat rows remain untouched.
    s.db.exec('DROP TABLE chat_viewer_states; DELETE FROM schema_migrations WHERE version=13')
    migrate(s.db); migrate(s.db)
    expect(s.db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(13)
    expect(s.db.prepare('SELECT document FROM chat_conversations WHERE id=?').get(s.personal.id)!.document).toBe(previous)
    expect(s.db.prepare('SELECT document FROM chat_messages WHERE conversation_id=?').get(s.personal.id)!.document).toBe(message)
    expect((await s.call('chatConversation', null, { id: s.personal.id })).value.data.viewerState).toEqual({ readSequence: 0, unreadCount: 0, pinned: true, version: 1 })
  })

  it('persists actor read and pin state over two real HTTP browser sessions, logout and server restart', async () => {
    const s = await setup(false), direct = (await s.call('createDirectConversation', { contactId: s.human('member_B').id })).value.data as Conversation
    const url = await s.app.listen({ port: 0, host: '127.0.0.1' })
    async function loginHttp(actor = 1, base = url) {
      const account = s.accounts[actor]!, login = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { origin: s.config.origin, 'content-type': 'application/json' }, body: JSON.stringify({ username: account.username, password: account.password }) })
      expect(login.status).toBe(200)
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!, session = await fetch(`${base}/api/v1/auth/session`, { headers: { cookie } })
      return { cookie, csrf: (await session.json()).data.csrfToken as string }
    }
    async function http(client: {cookie:string;csrf:string}, operation: 'read' | 'preferences', body: unknown, key = randomUUID(), base = url) {
      const response = await fetch(`${base}/api/v1/chat/conversations/${direct.id}/${operation}`, { method: 'POST', headers: { origin: s.config.origin, cookie: client.cookie, 'x-csrf-token': client.csrf, 'idempotency-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      return { status: response.status, value: await response.json() }
    }
    const browserOne = await loginHttp(), browserTwo = await loginHttp(), readKey = randomUUID()
    await s.call('sendChatMessage', { text: '发给 B 的第一条' }, { id: direct.id })
    await s.call('sendChatMessage', { text: 'B 自己发出的消息' }, { id: direct.id }, 1)
    await s.call('sendChatMessage', { text: '发给 B 的第二条' }, { id: direct.id })
    expect((await s.call('chatConversation', null, { id: direct.id }, 1)).value.data.viewerState).toEqual({ readSequence: 0, unreadCount: 2, pinned: false, version: 1 })
    // HTTP read does not itself mark history seen, and the viewer state is isolated.
    expect((await s.call('chatMessages', null, { id: direct.id }, 1)).value.data).toHaveLength(3)
    expect((await http(browserOne, 'read', { throughSequence: 1 }, readKey)).value.data).toMatchObject({ readSequence: 1, unreadCount: 1, version: 1 })
    const pin = await http(browserOne, 'preferences', { expectedVersion: 1, pinned: true })
    expect(pin.value.data).toMatchObject({ pinned: true, version: 2 })
    const reads = await Promise.all([http(browserTwo, 'read', { throughSequence: 3 }), http(browserOne, 'read', { throughSequence: 2 })])
    expect(reads.every(response => response.status === 200)).toBe(true)
    const replay = await http(browserOne, 'read', { throughSequence: 1 }, readKey)
    expect(replay.value.data).toEqual({ readSequence: 3, unreadCount: 0, pinned: true, version: 2 })
    expect((await http(browserOne, 'read', { throughSequence: 2 }, readKey)).value.error.code).toBe('IDEMPOTENCY_CONFLICT')
    expect((await http(browserTwo, 'read', { throughSequence: 4 })).value.error.code).toBe('VALIDATION_ERROR')
    expect((await s.call('chatConversation', null, { id: direct.id })).value.data.viewerState).toEqual({ readSequence: 0, unreadCount: 1, pinned: false, version: 1 })
    const logout = await fetch(`${url}/api/v1/auth/logout`, { method: 'POST', headers: { origin: s.config.origin, cookie: browserOne.cookie, 'x-csrf-token': browserOne.csrf, 'content-type': 'application/json' }, body: '{}' })
    expect(logout.status).toBe(200)
    expect((await http(browserOne, 'read', { throughSequence: 3 })).status).toBe(401)
    await s.app.close()
    const restarted = createServer(s.config); cleanup.push(() => restarted.close()); const nextUrl = await restarted.listen({ port: 0, host: '127.0.0.1' })
    const relogged = await loginHttp(1, nextUrl), restored = await fetch(`${nextUrl}/api/v1/chat/conversations/${direct.id}`, { headers: { cookie: relogged.cookie } })
    expect(restored.status).toBe(200)
    expect((await restored.json()).data.viewerState).toEqual({ readSequence: 3, unreadCount: 0, pinned: true, version: 2 })
    expect(s.db.prepare('SELECT document FROM chat_conversations WHERE id=?').get(direct.id)!.document).not.toContain('viewerState')
  })

  it('projects the opposite direct participant, preserves personal-first sorting and rejects stale pin changes', async () => {
    const s = await setup(false), pinKey = randomUUID(), aDirect = (await s.call('createDirectConversation', { contactId: s.human('member_B').id })).value.data as Conversation
    const bDirect = (await s.call('createDirectConversation', { contactId: s.human('member_A').id }, {}, 1)).value.data as Conversation
    expect(aDirect.id).toBe(bDirect.id); expect(aDirect.title).toBe('Synthetic B'); expect(bDirect.title).toBe('Synthetic A')
    s.db.prepare("UPDATE members SET display_name='Synthetic A updated',version=version+1 WHERE id='member_A'").run()
    expect((await s.call('chatConversation', null, { id: aDirect.id }, 1)).value.data.title).toBe('Synthetic A updated')
    expect(JSON.parse(String(s.db.prepare('SELECT document FROM chat_conversations WHERE id=?').get(aDirect.id)!.document)).title).toBe('Synthetic B')
    const cDirect = (await s.call('createDirectConversation', { contactId: s.human('member_C').id })).value.data as Conversation
    await s.call('sendChatMessage', { text: '更新较新的会话' }, { id: cDirect.id })
    expect((await s.call('updateChatPreferences', { expectedVersion: 1, pinned: true }, { id: aDirect.id }, 0, '', pinKey)).value.data).toMatchObject({ pinned: true, version: 2 })
    expect((await s.call('chatConversations')).value.data.map((conversation:Conversation)=>conversation.id)).toEqual([s.personal.id, aDirect.id, cDirect.id])
    expect((await s.call('updateChatPreferences', { expectedVersion: 1, pinned: false }, { id: aDirect.id })).value.error.code).toBe('VERSION_CONFLICT')
    expect((await s.call('updateChatPreferences', { expectedVersion: 2, pinned: false }, { id: aDirect.id })).value.data).toMatchObject({ pinned: false, version: 3 })
    // Exact retry cannot restore an old preference after a newer user decision.
    expect((await s.call('updateChatPreferences', { expectedVersion: 1, pinned: true }, { id: aDirect.id }, 0, '', pinKey)).value.data).toMatchObject({ pinned: false, version: 3 })
    expect((await s.call('updateChatPreferences', { expectedVersion: 3, pinned: true }, { id: aDirect.id }, 0, '', pinKey)).value.error.code).toBe('IDEMPOTENCY_CONFLICT')
    expect((await s.call('updateChatPreferences', { expectedVersion: 1, pinned: false }, { id: s.personal.id })).value.error.code).toBe('INVALID_STATE')
    expect((await s.call('updateChatPreferences', { expectedVersion: 1, pinned: true }, { id: s.personal.id })).value.data).toMatchObject({ pinned: true, version: 1 })
    expect((await s.call('chatConversation', null, { id: aDirect.id })).value.data.version).toBe(aDirect.version)
    expect((await s.call('chatConversation', null, { id: aDirect.id }, 2)).status).toBe(404)
  })

  it('counts only authorized incoming group messages and hides state/cached receipts immediately after revoke', async () => {
    const s = await setup(), created = await s.groupProposal(), groupId = created.group.id
    const invitation = (await s.call('chatInvitations', null, {}, 1)).value.data[0]
    expect((await s.call('markChatRead', { throughSequence: 0 }, { id: groupId }, 1)).status).toBe(404)
    await s.call('decideChatInvitation', { expectedVersion: invitation.version, decision: 'accept' }, { id: invitation.id }, 1)
    const joined = (await s.call('chatConversation', null, { id: groupId }, 1)).value.data as Conversation
    await s.call('markChatRead', { throughSequence: joined.lastSequence }, { id: groupId }, 1)
    await s.call('sendChatMessage', { text: 'B 自己的群消息' }, { id: groupId }, 1)
    expect((await s.call('chatConversation', null, { id: groupId }, 1)).value.data.viewerState.unreadCount).toBe(0)
    const task = (await s.call('task', null, { id: created.tasks[1]! })).value.data.task
    await s.ask(groupId, s.publicAgent.id, [{ kind: 'task', ref: { id: task.id, version: task.version } }], '本人任务的合成问答')
    await new ChatWorker(s.db, s.config, model(reply('MODEL_PRIVATE_CONTEXT_SENTINEL'))).tick()
    const messages = (await s.call('chatMessages', null, { id: groupId }, 1)).value.data
    expect(messages.some((message:{text:string})=>message.text === 'MODEL_PRIVATE_CONTEXT_SENTINEL')).toBe(false)
    // The authorized human prompt is incoming, but its hidden model reply is not.
    expect((await s.call('chatConversation', null, { id: groupId }, 1)).value.data.viewerState.unreadCount).toBe(1)
    const readKey = randomUUID(), pinKey = randomUUID(), current = (await s.call('chatConversation', null, { id: groupId }, 1)).value.data as Conversation
    const readBody = { throughSequence: current.lastSequence }, pinBody = { expectedVersion: 1, pinned: true }
    await s.call('markChatRead', readBody, { id: groupId }, 1, '', readKey)
    await s.call('updateChatPreferences', pinBody, { id: groupId }, 1, '', pinKey)
    const group = (await s.call('chatConversation', null, { id: groupId })).value.data as Conversation, member = group.members.find(member=>member.contactId===s.human('member_B').id)!
    await s.call('revokeChatMember', { expectedVersion: member.version, expectedConversationVersion: group.version, reason: '合成退出' }, { id: groupId, contactId: member.contactId })
    expect((await s.call('markChatRead', readBody, { id: groupId }, 1, '', readKey)).status).toBe(404)
    expect((await s.call('updateChatPreferences', pinBody, { id: groupId }, 1, '', pinKey)).status).toBe(404)
    expect((await s.call('chatConversations', null, {}, 1)).value.data.some((conversation:Conversation)=>conversation.id===groupId)).toBe(false)
  })

  it('counts personal model replies without counting user prompts or unavailable turns', async () => {
    const s = await setup(), sent = await s.ask()
    expect((await s.call('chatConversation', null, { id: s.personal.id })).value.data.viewerState).toMatchObject({ unreadCount: 0, pinned: true })
    await new ChatWorker(s.db, s.config, model(reply())).tick()
    const state = (await s.call('chatConversation', null, { id: s.personal.id })).value.data
    expect(state.viewerState.unreadCount).toBe(1)
    expect((await s.call('markChatRead', { throughSequence: sent.message.sequence }, { id: s.personal.id })).value.data.unreadCount).toBe(1)
    expect((await s.call('markChatRead', { throughSequence: state.lastSequence }, { id: s.personal.id })).value.data.unreadCount).toBe(0)
    expect(s.db.prepare('SELECT document FROM chat_conversations WHERE id=?').get(s.personal.id)!.document).not.toContain('viewerState')
  })

  it('persists missing-config messages, deduplicates, isolates private histories and leaves ordinary chat undispatched', async () => {
    const s = await setup(false), key = randomUUID()
    const body = { text: '保留这条消息', intent: 'ask_agent', agentContactId: s.agent('member_A').id, budget }
    const first = await s.call('sendChatMessage', body, { id: s.personal.id }, 0, '', key)
    expect(first.value.data.turn).toMatchObject({ status: 'unavailable', failure: 'MODEL_UNAVAILABLE' })
    expect((await s.call('sendChatMessage', body, { id: s.personal.id }, 0, '', key)).value.data.message.id).toBe(first.value.data.message.id)
    expect((await s.call('sendChatMessage', { ...body, text: '更改' }, { id: s.personal.id }, 0, '', key)).value.error.code).toBe('IDEMPOTENCY_CONFLICT')
    const ordinary = await s.call('sendChatMessage', { text: '普通聊天' }, { id: s.personal.id }); expect(ordinary.value.data.turn).toBeNull()
    expect(s.db.prepare('SELECT count(*) n FROM chat_turns').get()!.n).toBe(1)
    expect((await s.call('chatMessages', null, { id: s.personal.id }, 1)).status).toBe(404)
    const b = (await s.call('personalConversation', {}, {}, 1)).value.data.conversation
    expect(b.id).not.toBe(s.personal.id)
    expect((await s.call('chatMessages', null, { id: b.id }, 1)).value.data).toEqual([])
    expect((await s.call('personalConversation', {})).value.data.conversation.id).toBe(s.personal.id)
    const restarted = createServer(s.config); cleanup.push(() => restarted.close())
    const recovered=await restarted.inject({url:`/api/v1/chat/conversations/${s.personal.id}/messages`,headers:{cookie:s.clients[0]!.cookie}})
    expect(recovered.statusCode).toBe(200);expect(recovered.json().data.map((m:{text:string})=>m.text)).toEqual(['保留这条消息','普通聊天'])
    expect(await new ChatWorker(s.db, s.config, model(reply())).tick()).toBe(false)
  })

  it('answers ordinary questions through the injected model and preserves clarification and invalid-output states', async () => {
    const s = await setup(), sent = await s.ask(); let seen = false
    await new ChatWorker(s.db, s.config, async (input, _signal, credential) => { seen = true; expect(input.system).toContain('JSON only'); expect(credential.apiKey).toContain('synthetic'); return model(reply('合成模型提供的回答'))(input, _signal, credential) }).tick()
    expect(seen).toBe(true); const turn = (await s.call('chatTurn', null, { id: sent.turn.id })).value.data
    expect(turn).toMatchObject({ status: 'succeeded', usage: { inputTokens: 100, outputTokens: 200 } })
    expect((await s.call('chatMessages', null, { id: s.personal.id })).value.data[1]).toMatchObject({ origin: 'model', text: '合成模型提供的回答' })
    const clarify = await s.ask(); await new ChatWorker(s.db, s.config, model({ ...reply('需要补充哪些资料？'), waitingInput: true })).tick()
    expect((await s.call('chatTurn', null, { id: clarify.turn.id })).value.data.status).toBe('waiting_input')
    const invalid = await s.ask(); await new ChatWorker(s.db, s.config, model({ answer: '伪造', shell: 'bad' })).tick()
    expect((await s.call('chatTurn', null, { id: invalid.turn.id })).value.data).toMatchObject({ status: 'failed', failure: 'INVALID_MODEL_OUTPUT', outputMessageId: null })
  })

  it('atomically creates a group, separates human join from commitment, and executes canonical public text through candidate delivery', async () => {
    const s = await setup(); await s.call('sendChatMessage', { text: '私聊敏感合成片段不进群' }, { id: s.personal.id })
    const created = await s.groupProposal(), groupId = created.group.id
    expect((await s.call('decideChatAction', created.command, { id: created.action.id }, 0, '', created.key)).value.data.conversationId).toBe(groupId)
    expect(s.db.prepare("SELECT count(*) n FROM chat_conversations WHERE kind='group'").get()!.n).toBe(1)
    expect((await s.call('chatMessages', null, { id: groupId })).raw).not.toContain('私聊敏感')
    expect((await s.call('chatMessages', null, { id: groupId })).value.data.flatMap((m:{resources:unknown[]})=>m.resources)).toEqual(expect.arrayContaining(created.tasks.map(id=>({kind:'task',ref:{id,version:1}}))))
    expect((await s.call('chatMessages', null, { id: groupId }, 1)).status).toBe(404)
    const invite = (await s.call('chatInvitations', null, {}, 1)).value.data[0]
    expect((await s.call('decideChatInvitation', { expectedVersion: invite.version, decision: 'accept' }, { id: invite.id }, 2)).status).toBe(404)
    expect((await s.call('decideChatInvitation', { expectedVersion: invite.version, decision: 'accept' }, { id: invite.id }, 1)).status).toBe(200)
    let group = (await s.call('chatConversation', null, { id: groupId })).value.data as Conversation
    const task = (await s.call('task', null, { id: created.tasks[0]! })).value.data.task
    const mentionText = `@${s.human('member_B').displayName} 请查看`
    const ordinary = await s.call('sendChatMessage', { text: mentionText, mentions: [{ contactId: s.human('member_B').id, start: 0, end: s.human('member_B').displayName.length + 1 }] }, { id: groupId })
    expect(ordinary.status, ordinary.raw).toBe(201)
    expect(ordinary.value.data.turn).toBeNull()
    const action = await s.proposeAction(group, { kind: 'invite_task', contactId: s.human('member_B').id, task: { id: task.id, version: task.version }, scope: '整理合成材料', schedule }, [{ kind: 'task', ref: { id: task.id, version: task.version } }])
    const invited = await s.call('decideChatAction', { expectedVersion: action.version, expectedConversationVersion: group.version, decision: 'confirm' }, { id: action.id })
    expect(invited.status, invited.raw).toBe(200)
    const assignment = s.db.prepare('SELECT document FROM assignments WHERE id=?').get(invited.value.data.resources[0].ref.id)!
    expect(JSON.parse(String(assignment.document))).toMatchObject({ status: 'pending', commitment: null })
    const bMessages=(await s.call('chatMessages',null,{id:groupId},1)).value.data.flatMap((m:{resources:{kind:string;ref:{id:string}}[]})=>m.resources)
    expect(bMessages).toEqual(expect.arrayContaining([expect.objectContaining({kind:'assignment',ref:expect.objectContaining({id:invited.value.data.resources[0].ref.id})})]))
    expect(bMessages.some((r:{ref:{id:string}})=>r.ref.id===created.tasks[1])).toBe(false)
    const humanTask = (await s.call('task', null, { id: task.id }, 1)).value.data
    expect((await s.call('invitationDecision', { expectedVersion: humanTask.pendingInvitation.version, expectedTaskVersion: humanTask.version, decision: 'accepted', comment: null }, { id: humanTask.pendingInvitation.id }, 1)).status).toBe(200)
    const aiTask = (await s.call('task', null, { id: created.tasks[1]! })).value.data.task
    const uploaded = await s.call('upload', { taskId: aiTask.id, expectedVersion: aiTask.version, filename: 'synthetic.txt', mediaType: 'text/plain', contentBase64: Buffer.from('Synthetic evidence is supplied.').toString('base64') })
    expect(uploaded.status, uploaded.raw).toBe(201)
    const currentTask = (await s.call('task', null, { id: aiTask.id })).value.data.task, artifact = uploaded.value.data
    group = (await s.call('chatConversation', null, { id: groupId })).value.data
    const cap = s.publicAgent.identity.kind === 'public_agent' ? s.publicAgent.identity.capability : null
    const runPayload = { kind: 'run_task', contactId: s.publicAgent.id, task: { id: currentTask.id, version: currentTask.version }, capability: cap, budget, inputArtifactRefs: [{ id: artifact.id, version: artifact.version }] }
    const runAction = await s.proposeAction(group, runPayload, [{ kind: 'task', ref: runPayload.task }, { kind: 'artifact', ref: runPayload.inputArtifactRefs[0] }])
    const key = randomUUID(), command = { expectedVersion: runAction.version, expectedConversationVersion: group.version, decision: 'confirm' }
    const ran = await s.call('decideChatAction', command, { id: runAction.id }, 0, '', key); expect(ran.status, ran.raw).toBe(200)
    expect((await s.call('decideChatAction', command, { id: runAction.id }, 0, '', key)).value.data.resources[0].ref.id).toBe(ran.value.data.resources[0].ref.id)
    const runId = ran.value.data.resources[0].ref.id
    // Existing public worker validates quotations against authorized artifact text.
    const result = { title: 'Synthetic evidence', items: [{ requirement: 'Evidence supplied', assessment: 'supported_by_input', citations: [{ artifactId: artifact.id, quote: 'Synthetic evidence is supplied.' }], gap: null }], limitations: ['Synthetic input only.'] }
    await new ExecutionWorker(s.db, s.config, model(result)).tick()
    const execution = (await s.call('getRun', null, { id: runId })).value.data
    expect(execution.status, JSON.stringify(execution)).toBe('succeeded')
    expect(execution.candidateDeliverableId).toBeNull()
    const delivered = await s.call('submitCandidate', { expectedVersion: execution.version, expectedTaskVersion: execution.taskVersion }, { id: runId })
    expect(delivered.status, delivered.raw).toBe(201)
    expect(delivered.value.data.review).toBeNull()
    expect((await s.call('chatMessages', null, { id: groupId })).raw).toContain(runId)
  })

  it('requires agent-owner acceptance, excludes private owner history, and fences revoked agents late output', async () => {
    const s = await setup(), bPersonal = (await s.call('personalConversation', {}, {}, 1)).value.data.conversation
    await s.call('sendChatMessage', { text: 'B_OWNER_PRIVATE_SENTINEL' }, { id: bPersonal.id }, 1)
    expect(s.agent('member_B').availability.reason).toBe('owner_authorization_required')
    const created = await s.groupProposal([s.human('member_B').id, s.agent('member_B').id, s.publicAgent.id]), groupId = created.group.id
    const before = await s.call('sendChatMessage', { text: '请回答', intent: 'ask_agent', agentContactId: s.agent('member_B').id, budget }, { id: groupId }); expect(before.status).toBe(404)
    const invitations = (await s.call('chatInvitations', null, {}, 1)).value.data
    const agentInvite = invitations.find((v: { invitedContactId: string }) => v.invitedContactId === s.agent('member_B').id)
    expect((await s.call('decideChatInvitation', { expectedVersion: agentInvite.version, decision: 'accept' }, { id: agentInvite.id })).status).toBe(404)
    expect((await s.call('decideChatInvitation', { expectedVersion: agentInvite.version, decision: 'accept' }, { id: agentInvite.id }, 1)).status).toBe(200)
    expect((await s.call('chatConversation',null,{id:groupId},1)).status).toBe(404)
    expect((await s.call('chatMessages',null,{id:groupId},1)).status).toBe(404)
    expect((await s.call('markChatRead',{throughSequence:0},{id:groupId},1)).status).toBe(404)
    expect((await s.call('updateChatPreferences',{expectedVersion:1,pinned:true},{id:groupId},1)).status).toBe(404)
    expect((await s.call('chatConversations',null,{},1)).value.data.some((group:Conversation)=>group.id===groupId)).toBe(false)
    expect((await s.call('sendChatMessage',{text:'仅agent加入不能真人发送'},{id:groupId},1)).status).toBe(404)
    const asked = await s.ask(groupId, s.agent('member_B').id)
    let inspected = false
    await new ChatWorker(s.db, s.config, async (input, signal, credential) => { inspected = true; expect(input.prompt).not.toContain('B_OWNER_PRIVATE_SENTINEL'); expect(input.prompt).not.toContain(bPersonal.id); return model(reply('群内受限回答'))(input, signal, credential) }).tick()
    expect(inspected).toBe(true); expect((await s.call('chatTurn', null, { id: asked.turn.id })).value.data.status).toBe('succeeded')
    const late = await s.ask(groupId, s.agent('member_B').id)
    let started!: () => void, finish!: (r: Awaited<ReturnType<ModelCall>>) => void
    const began = new Promise<void>(r => { started = r }), pending = new Promise<Awaited<ReturnType<ModelCall>>>(r => { finish = r })
    const running = new ChatWorker(s.db, s.config, async () => { started(); return pending }).tick(); await began
    const group = (await s.call('chatConversation', null, { id: groupId })).value.data as Conversation, member = group.members.find(m => m.contactId === s.agent('member_B').id)!
    expect((await s.call('revokeChatMember', { expectedVersion: member.version, expectedConversationVersion: group.version, reason: '合成撤权' }, { id: groupId, contactId: member.contactId })).status).toBe(200)
    finish({ text: JSON.stringify(reply('LATE_OUTPUT_SENTINEL')), failure: null, inputTokens: 10, outputTokens: 10, elapsedMs: 20 }); await running
    expect(JSON.parse(String(s.db.prepare('SELECT document FROM chat_turns WHERE id=?').get(late.turn.id)!.document)).status).toBe('cancelled')
    expect((await s.call('chatMessages', null, { id: groupId })).raw).not.toContain('LATE_OUTPUT_SENTINEL')
    expect((await s.call('chatMessages', null, { id: bPersonal.id })).status).toBe(404)
  })

  it('binds cursor to account and filter, preserves high water and denies old pages after revocation', async () => {
    const s = await setup(), created = await s.groupProposal(), groupId = created.group.id
    const invitation = (await s.call('chatInvitations', null, {}, 1)).value.data[0]
    await s.call('decideChatInvitation', { expectedVersion: invitation.version, decision: 'accept' }, { id: invitation.id }, 1)
    for (let i = 0; i < 3; i++) await s.call('sendChatMessage', { text: `合成消息${i}` }, { id: groupId })
    const first = await s.call('chatMessages', null, { id: groupId }, 1, '?limit=1'), cursor = first.value.nextCursor
    expect(cursor).toBeTruthy()
    await s.call('sendChatMessage', { text: 'NEW_HIGH_WATER_SENTINEL' }, { id: groupId })
    expect((await s.call('chatMessages', null, { id: groupId }, 0, `?limit=1&cursor=${cursor}`)).value.error.code).toBe('CURSOR_EXPIRED')
    expect((await s.call('chatMessages', null, { id: groupId }, 1, `?limit=2&cursor=${cursor}`)).value.error.code).toBe('CURSOR_EXPIRED')
    const next = await s.call('chatMessages', null, { id: groupId }, 1, `?limit=1&cursor=${cursor}`); expect(next.raw).not.toContain('NEW_HIGH_WATER')
    expect((await s.call('chatMessages', null, { id: groupId }, 1, '?afterSequence=1')).status).toBe(200)
    const group = (await s.call('chatConversation', null, { id: groupId })).value.data as Conversation, member = group.members.find(m => m.contactId === s.human('member_B').id)!
    await s.call('revokeChatMember', { expectedVersion: member.version, expectedConversationVersion: group.version, reason: '移除' }, { id: groupId, contactId: member.contactId })
    expect((await s.call('chatMessages', null, { id: groupId }, 1, `?limit=1&cursor=${cursor}`)).status).toBe(404)
  })

  it('recovers expired leases without publishing late output and fences cancellation', async () => {
    const s = await setup(), queued = await s.ask()
    const doc = { ...queued.turn, status: 'running' }
    s.db.prepare('UPDATE chat_turns SET status=?,lease_owner=?,lease_until=?,document=? WHERE id=?').run('running', 'dead_worker', Date.now() - 1, JSON.stringify(doc), queued.turn.id)
    s.db.prepare('INSERT INTO chat_attempts VALUES (?,?,?,NULL)').run(queued.turn.id,queued.turn.id,new Date().toISOString())
    transaction(s.db, () => reconcileChat(s.db, s.config))
    expect((await s.call('chatTurn', null, { id: queued.turn.id })).value.data).toMatchObject({ status: 'interrupted', failure: 'LEASE_EXPIRED_USAGE_UNCERTAIN',remainingBudget:null,allowedActions:[] })
    const sent = await s.ask(); const cancelled = await s.call('cancelChatTurn', { expectedVersion: sent.turn.version }, { id: sent.turn.id }); expect(cancelled.value.data.status).toBe('cancelled')
    expect(await new ChatWorker(s.db, s.config, model(reply('不得写入'))).tick()).toBe(false)
    expect((await s.call('chatMessages', null, { id: s.personal.id })).raw).not.toContain('不得写入')
  })

  it('publishes canonical pending invitation references when group creation already proposes a human assignment',async()=>{
    const s=await setup(),created=await s.groupProposal(undefined,true),groupId=created.group.id
    const invitation=(await s.call('chatInvitations',null,{},1)).value.data[0]
    await s.call('decideChatInvitation',{expectedVersion:invitation.version,decision:'accept'},{id:invitation.id},1)
    const messages=(await s.call('chatMessages',null,{id:groupId},1)).value.data
    const refs=messages.flatMap((m:{resources:{kind:string;ref:{id:string}}[]})=>m.resources)
    expect(refs.some((r:{kind:string;ref:{id:string}})=>r.kind==='task'&&r.ref.id===created.tasks[0])).toBe(true)
    expect(refs.some((r:{kind:string})=>r.kind==='assignment')).toBe(true)
    expect(refs.some((r:{ref:{id:string}})=>r.ref.id===created.tasks[1])).toBe(false)
    const summary=(await s.call('task',null,{id:created.tasks[0]!},1)).value.data
    expect(summary.projection).toBe('claim_summary');expect(summary.pendingInvitation).toBeTruthy()
  })

  it('fences task-version changes, protects private context outside group, and rolls back invalid group proposals',async()=>{
    const s=await setup(),created=await s.groupProposal(),groupId=created.group.id
    const task=(await s.call('task',null,{id:created.tasks[1]!})).value.data.task
    const sent=await s.ask(s.personal.id,s.agent('member_A').id,[{kind:'task',ref:{id:task.id,version:task.version}}])
    expect((await s.call('start',{expectedVersion:task.version},{id:task.id})).status).toBe(200)
    expect(await new ChatWorker(s.db,s.config,model(reply('STALE_TASK_SENTINEL'))).tick()).toBe(false)
    expect((await s.call('chatTurn',null,{id:sent.turn.id})).value.data).toMatchObject({status:'cancelled',failure:'INPUT_CHANGED'})
    const other=(await s.call('createPlan',{labId:'lab_synthetic',goal:'Private',proposedItems:[],unresolvedQuestions:[]})).value.data
    const forbidden=await s.call('sendChatMessage',{text:'请读取私人方案',intent:'ask_agent',agentContactId:s.publicAgent.id,budget,context:[{kind:'plan',ref:{id:other.id,version:other.version}}]},{id:groupId})
    expect(forbidden.status).toBe(403)
    const invalid=await s.ask();const before=s.db.prepare('SELECT count(*) n FROM plans').get()!.n
    await new ChatWorker(s.db,s.config,model({...reply(),group:{title:'Invalid',contactIds:['unknown_contact'],sharedContext:{selectedText:null,artifactRefs:[]},plan:{labId:'lab_synthetic',goal:'invalid',proposedItems:[],unresolvedQuestions:[]}}})).tick()
    expect((await s.call('chatTurn',null,{id:invalid.turn.id})).value.data.failure).toBe('INVALID_MODEL_OUTPUT')
    expect(s.db.prepare('SELECT count(*) n FROM plans').get()!.n).toBe(before)
  })

  it('projects cumulative retry budget, atomically rebinds input and prevents duplicate root jobs',async()=>{
    const s=await setup(),sent=await s.ask()
    await new ChatWorker(s.db,s.config,async()=>({text:'',failure:'synthetic_failure',inputTokens:100,outputTokens:200,elapsedMs:20})).tick()
    const old=(await s.call('chatTurn',null,{id:sent.turn.id})).value.data
    expect(old).toMatchObject({status:'failed',budget,remainingBudget:{maxTokens:4700,maxSeconds:29},allowedActions:['retry']})
    const key=randomUUID(),body={expectedVersion:old.version,budget:old.remainingBudget}
    const retry=await s.call('retryChatTurn',body,{id:old.id},0,'',key);expect(retry.status,retry.raw).toBe(202)
    expect(retry.value.data.id).not.toBe(old.id)
    expect((await s.call('retryChatTurn',body,{id:old.id},0,'',key)).value.data.id).toBe(retry.value.data.id)
    expect((await s.call('retryChatTurn',body,{id:old.id})).status).toBe(409)
    const messages=(await s.call('chatMessages',null,{id:s.personal.id})).value.data
    expect(messages.find((m:{id:string})=>m.id===sent.message.id).turnId).toBe(retry.value.data.id)
    await new ChatWorker(s.db,s.config,model(reply('重试后的真实模型替身回答'))).tick()
    const finished=(await s.call('chatTurn',null,{id:retry.value.data.id})).value.data
    expect(finished).toMatchObject({status:'succeeded',budget,remainingBudget:{maxTokens:4400,maxSeconds:29}})
    expect((await s.call('chatTurn',null,{id:old.id})).value.data.id).toBe(old.id)
    expect((await s.call('chatMessages',null,{id:s.personal.id})).raw).toContain('重试后的真实模型替身回答')
    const uncertain=await s.ask();await new ChatWorker(s.db,s.config,async()=>({text:'',failure:'network_unknown',inputTokens:null,outputTokens:null,elapsedMs:10})).tick()
    const unknown=(await s.call('chatTurn',null,{id:uncertain.turn.id})).value.data
    expect(unknown.remainingBudget).toBeNull();expect(unknown.allowedActions).not.toContain('retry')
    expect((await s.call('retryChatTurn',{expectedVersion:unknown.version,budget},{id:unknown.id})).status).toBe(409)
  })

  it('passes stable same-name mention IDs and requested-agent identity without substituting names',async()=>{
    const s=await setup();s.db.prepare("UPDATE members SET display_name='同名成员' WHERE id IN ('member_B','member_C')").run()
    const created=await s.groupProposal([s.human('member_B').id,s.human('member_C').id,s.agent('member_B').id,s.publicAgent.id]),groupId=created.group.id
    for(const actor of [1,2]){
      const invitations=(await s.call('chatInvitations',null,{},actor)).value.data
      for(const invite of invitations)await s.call('decideChatInvitation',{expectedVersion:invite.version,decision:'accept'},{id:invite.id},actor)
    }
    const text='@同名成员 请核对',mention={contactId:s.human('member_B').id,start:0,end:5}
    const sent=await s.call('sendChatMessage',{text,mentions:[mention],intent:'ask_agent',agentContactId:s.agent('member_B').id,budget},{id:groupId})
    expect(sent.status,sent.raw).toBe(201)
    await new ChatWorker(s.db,s.config,async(input,signal,credential)=>{
      const prompt=JSON.parse(input.prompt)
      expect(prompt.requestedAgent).toMatchObject({id:s.agent('member_B').id,identity:{kind:'personal_agent',ownerMemberId:'member_B'}})
      expect(prompt.messages.at(-1).mentions).toEqual([mention])
      expect(prompt.messages.at(-1).resources).toEqual([])
      expect(prompt.requestedAgent.id).not.toBe(s.publicAgent.id)
      return model(reply())(input,signal,credential)
    }).tick()
    expect((await s.call('chatTurn',null,{id:sent.value.data.turn.id})).value.data.status).toBe('succeeded')
  })

  it('withdraws derived draft and pending assignment projections after source authority changes',async()=>{
    const s=await setup(),source=await s.groupProposal(),sourceTask=(await s.call('task',null,{id:source.tasks[1]!})).value.data.task
    const derived=await s.groupProposal(undefined,true,[{kind:'task',ref:{id:sourceTask.id,version:sourceTask.version}}])
    const invitation=(await s.call('chatInvitations',null,{},1)).value.data.find((v:{conversationId:string})=>v.conversationId===derived.group.id)
    await s.call('decideChatInvitation',{expectedVersion:invitation.version,decision:'accept'},{id:invitation.id},1)
    const initial=(await s.call('chatMessages',null,{id:derived.group.id},1)).value.data
    expect(initial.flatMap((m:{resources:{kind:string}[]})=>m.resources).some((r:{kind:string})=>r.kind==='assignment')).toBe(true)
    await s.call('start',{expectedVersion:sourceTask.version},{id:sourceTask.id})
    expect((await s.call('getPlan',null,{id:derived.action.payload.kind==='create_group'?derived.action.payload.plan.id:''})).status).toBe(404)
    expect((await s.call('task',null,{id:derived.tasks[0]!},1)).status).toBe(404)
    const messages=(await s.call('chatMessages',null,{id:derived.group.id},1)).value.data
    expect(messages.flatMap((m:{resources:{kind:string}[]})=>m.resources)).toEqual([])
  })
})
