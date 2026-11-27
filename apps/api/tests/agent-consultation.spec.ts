import { randomBytes, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { routes, type Contact, type RouteName } from '@research-agent-platform/contracts'
import { authenticate, hash } from '../src/auth.js'
import { ChatWorker } from '../src/chat-worker.js'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase } from '../src/database.js'
import { personalModelRuntime } from '../src/personal-models.js'
import { OpenImBridge } from '../src/openim-bridge.js'
import { OpenImCallbacks } from '../src/openim-callback.js'
import { createServer } from '../src/server.js'

const cleanup: (() => unknown)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'rap-consultation-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const master = join(root, 'master.key')
  writeFileSync(master, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({
    NODE_ENV: 'test', DATABASE_PATH: join(root, 'db.sqlite'), BLOB_ROOT: join(root, 'blobs'),
    APP_ORIGIN: 'http://127.0.0.1:4317', B3_AI_ENABLED: '1', LAB_CREDENTIAL_KEY_FILE: master,
  })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)
  db.prepare('INSERT INTO labs VALUES (?,?)').run('consultation_lab', 'Consultation fixture')
  const bootstrapCode = 'synthetic_consultation_bootstrap_0001', inviteCode = 'synthetic_consultation_invite_0001'
  const insertInvite = db.prepare('INSERT INTO registration_invites(id,lab_id,code_hash,expires_at,max_uses,created_at,bootstrap_manager) VALUES (?,?,?,?,?,?,?)')
  const expiresAt = new Date(Date.now()+3600000).toISOString(), now = new Date().toISOString()
  insertInvite.run('invite_consultation_bootstrap', 'consultation_lab', hash(bootstrapCode), expiresAt, 1, now, 1)
  insertInvite.run('invite_consultation', 'consultation_lab', hash(inviteCode), expiresAt, 2, now, 0)
  const app = createServer(config)
  cleanup.push(() => app.close())
  const users: { id: string; cookie: string; csrf: string }[] = []
  const call = async (name: RouteName, body: unknown = null, params: Record<string, string> = {}, viewer = 0, query = '', idempotencyKey = randomUUID()) => {
    const route = routes[name], user = users[viewer]
    const response = await app.inject({
      method: route.method, url: route.path.replace(/\{(\w+)\}/g, (_, key: string) => params[key]!) + query,
      headers: {
        origin: config.origin, 'idempotency-key': idempotencyKey,
        ...(route.method !== 'GET' ? { 'content-type': 'application/json' } : {}),
        ...(user ? { cookie: user.cookie, 'x-csrf-token': user.csrf } : {}),
      },
      ...(route.method !== 'GET' ? { payload: JSON.stringify(body) } : {}),
    })
    return { status: response.statusCode, body: response.json(), cookie: String(response.headers['set-cookie'] ?? '').split(';')[0]! }
  }
  for (const [viewer, username] of ['consult_owner', 'consult_visitor', 'consult_other'].entries()) {
    const password = 'synthetic-password'
    expect((await call('register', { username, displayName: username, password, inviteCode: viewer === 0 ? bootstrapCode : inviteCode }, {}, viewer)).status).toBe(201)
    const login = await call('login', { username, password }, {}, viewer)
    expect(login.status).toBe(200)
    users.push({ id: login.body.data.id, cookie: login.cookie, csrf: '' })
    users[viewer]!.csrf = (await call('session', null, {}, viewer)).body.data.csrfToken
  }
  const actor = (viewer: number) => authenticate(db, users[viewer]!.cookie.slice('rap_session='.length))
  const owner = (await call('personalConversation', {})).body.data.agent as Contact
  const specialist = (await call('createPersonalAgent', {
    displayName: '公开方法 Agent', introduction: '咨询说明', capabilityDescription: '讨论公开方法', personality: '简洁',
  })).body.data as Contact
  const update = (contactId: string, mode: 'free' | 'closed', expectedVersion: number) =>
    call('updateAgentConsultation', { expectedVersion, mode }, { id: contactId })
  return { db, config, call, actor, owner, specialist, users, update }
}

describe('Agent consultation access', { timeout: 20000 }, () => {
  it('keeps policies owner-only, versioned, and independent for coordinator and specialist', async () => {
    const s = await setup(), id = s.owner.id
    expect((await s.call('agentConsultation', null, { id })).body.data).toEqual({ contactId: id, mode: 'closed', version: 0, canEdit: true, canChat: false })
    expect((await s.call('agentConsultation', null, { id }, 1)).body.data).toMatchObject({ canEdit: false, canChat: false })
    expect((await s.call('requestContact', {}, { id }, 1)).status).toBe(403)
    expect((await s.call('updateAgentConsultation', { expectedVersion: 0, mode: 'free' }, { id }, 1)).status).toBe(403)
    expect((await s.call('updateAgentConsultation', { expectedVersion: 0, mode: 'paid' }, { id })).status).toBe(400)
    expect((await s.call('createDirectConversation', { contactId: id }, {}, 1)).status).toBe(403)
    expect((await s.update(id, 'free', 0)).body.data.version).toBe(1)
    expect((await s.update(id, 'closed', 0)).status).toBe(409)
    expect((await s.call('agentConsultation', null, { id: s.specialist.id }, 1)).body.data.mode).toBe('closed')

    const discovered = await s.call('chatContacts', null, {}, 1, '?scope=global&search=consult_owner')
    const ownerHuman = (discovered.body.data as Contact[]).find(contact => contact.identity.kind === 'human')!
    expect((await s.call('agentConsultation', null, { id: ownerHuman.id }, 1)).status).toBe(404)
    const contact = (discovered.body.data as Contact[]).find(contact => contact.id === id)
    expect(contact).toMatchObject({ relationship: { status: 'none' }, allowedActions: ['chat'] })
    const key = randomUUID(), direct = await s.call('createDirectConversation', { contactId: id }, {}, 1, '', key)
    expect(direct.status).toBe(200)
    expect(direct.body.data).toMatchObject({ kind: 'direct', ownerMemberId: s.users[1]!.id })
    expect((await s.call('chatConversation', null, { id: direct.body.data.id })).status).toBe(404)
    expect((await s.call('chatConversation', null, { id: direct.body.data.id }, 2)).status).toBe(404)
    expect((await s.call('chatContacts', null, {}, 1, '?view=mine')).body.data).not.toEqual(expect.arrayContaining([expect.objectContaining({ id })]))
    const friend = await s.call('requestContact', {}, { id: ownerHuman.id }, 1)
    expect(friend.body.data.relationship.status).toBe('pending_outbound')
    expect((await s.call('decideContactRequest', { decision: 'accept', expectedVersion: friend.body.data.relationship.version }, { id: friend.body.data.relationship.requestId })).body.data.status).toBe('accepted')
    expect((await s.call('createDirectConversation', { contactId: ownerHuman.id }, {}, 1)).status).toBe(200)
    expect((await s.update(id, 'closed', 1)).body.data.version).toBe(2)
    expect((await s.call('createDirectConversation', { contactId: id }, {}, 1, '', key)).status).toBe(403)
    expect((await s.call('chatConversation', null, { id: direct.body.data.id }, 1)).body.data.allowedActions).toEqual([])
  })

  it('requires the visitor’s own model and rejects native friend, native message and extra context paths', async () => {
    const s = await setup(), contactId = s.specialist.id
    const labSettings = await s.call('updateLabAiSettings', {
      expectedVersion: 0, enabled: true, model: 'deepseek-flash', apiKey: 'sk-synthetic-lab-key',
    }, { id: s.actor(1).labId })
    expect(labSettings.status).toBe(200)
    expect(personalModelRuntime(s.db, s.actor(1), s.config)).toMatchObject({ source: 'legacy_lab', enabled: true })
    expect((await s.update(contactId, 'free', 0)).status).toBe(200)
    const direct = await s.call('createDirectConversation', { contactId }, {}, 1)
    expect(direct.status).toBe(200)
    const id = direct.body.data.id
    const sent = await s.call('agentChatMessage', { text: '缺少本人的模型密钥' }, { id }, 1)
    expect(sent.status).toBe(201)
    expect(sent.body.data.turn).toMatchObject({ status: 'unavailable', failure: 'MODEL_UNAVAILABLE' })
    let called = false
    expect(await new ChatWorker(s.db, s.config, async () => { called = true; throw new Error('must not call the lab model') }).tick()).toBe(false)
    expect(called).toBe(false)
    expect((await s.call('sendChatMessage', { text: 'native fallback' }, { id }, 1)).status).toBe(403)
    expect((await s.call('agentChatMessage', { text: 'consult', skill: { id: 'unrelated_skill', version: 1, referencePaths: [], acceptLimitations: true } }, { id }, 1)).status).toBe(403)
    expect((await s.call('agentFileMessage', { filename: 'synthetic.txt', mediaType: 'text/plain', contentBase64: 'eA==' }, { id }, 1)).status).toBe(403)
    expect((await s.call('createChatMemory', { scope: 'conversation', scopeId: id, content: 'persistent text', source: null }, {}, 1)).status).toBe(403)

    const bridge = new OpenImBridge(s.db, s.config), chat = bridge.chat(s.actor(1))
    const self = bridge.identity(chat, chat.human().id), peer = bridge.identity(chat, contactId)
    const otherChat = bridge.chat(s.actor(2)), other = bridge.identity(otherChat, otherChat.human().id)
    s.db.prepare("INSERT INTO im_token_leases VALUES (?,3,?,?,'ready',NULL,NULL)")
      .run(s.users[1]!.id, hash(s.users[1]!.cookie.slice('rap_session='.length)), new Date(Date.now()+3600000).toISOString())
    const callback = new OpenImCallbacks(bridge)
    const user = { userID: self.userID, platform: 'Windows', policy: 'rap-auth-v1', operationID: 'native_synthetic', admin: false }
    const admin = { userID: s.config.openIm.adminID, platform: 'Admin', policy: 'rap-auth-v1', operationID: 'pointer_synthetic', admin: true }
    expect(() => callback.before('callbackBeforeImportFriendsCommand', { ownerUserID: self.userID, friendUserIDs: [peer.userID] }, admin)).toThrow()
    expect(() => callback.before('callbackBeforeSendSingleMsgCommand', {
      sendID: self.userID, recvID: peer.userID, msgFrom: 100, senderPlatformID: 3, contentType: 101,
    }, user)).toThrow()
    const message = sent.body.data.message
    s.db.prepare("UPDATE im_message_outbox SET status='sending',operation_id=? WHERE message_id=?").run(admin.operationID, message.id)
    const pointer = {
      sendID: self.userID, recvID: peer.userID, msgFrom: 200, senderPlatformID: 10, contentType: 110, operationID: admin.operationID,
      content: { data: JSON.stringify({ type: 'research_message', bridgeVersion: '1.0.0', conversationId: id, messageId: message.id, sequence: message.sequence }) },
    }
    expect(() => callback.before('callbackBeforeSendSingleMsgCommand', pointer, admin)).not.toThrow()
    expect(() => callback.before('callbackBeforeSendSingleMsgCommand', { ...pointer, recvID: other.userID }, admin)).toThrow()
  })

  it('migrates old Agent relationships without granting consultation or removing visitor history', async () => {
    const s = await setup(), contactId = s.specialist.id
    await s.update(contactId, 'free', 0)
    const direct = await s.call('createDirectConversation', { contactId }, {}, 1)
    const id = direct.body.data.id
    expect((await s.call('agentChatMessage', { text: '原有咨询历史' }, { id }, 1)).status).toBe(201)
    const discovered = await s.call('chatContacts', null, {}, 1, '?scope=global&search=consult_owner')
    const humanId = (discovered.body.data as Contact[]).find(c => c.identity.kind === 'human')!.id
    const human = (await s.call('requestContact', {}, { id: humanId }, 1)).body.data.relationship
    await s.call('decideContactRequest', { decision: 'accept', expectedVersion: human.version }, { id: human.requestId })
    s.db.exec('DROP TABLE agent_consultations')
    s.db.prepare('DELETE FROM schema_migrations WHERE version=43').run()
    const now = new Date().toISOString()
    for (const [viewer, status] of [[1, 'accepted'], [2, 'pending']] as const) {
      const requester = s.users[viewer]!.id
      s.db.prepare('INSERT INTO chat_contact_requests VALUES (?,?,?,?,?,?,?,1,?,?)')
        .run('historic_agent_' + viewer, s.actor(viewer).labId, requester, contactId, s.users[0]!.id, 'agent:' + requester + ':' + contactId, status, now, now)
    }
    migrate(s.db)
    migrate(s.db)
    expect(s.db.prepare("SELECT status,version FROM chat_contact_requests WHERE id LIKE 'historic_agent_%' ORDER BY id").all()).toEqual([
      { status: 'revoked', version: 2 }, { status: 'revoked', version: 2 },
    ])
    expect(s.db.prepare('SELECT status,version FROM chat_contact_requests WHERE id=?').get(human.requestId)).toMatchObject({ status: 'accepted', version: 2 })
    expect((await s.call('contactRequests', null, {}, 0, '?status=all')).body.data).toEqual([expect.objectContaining({ id: human.requestId })])
    expect((await s.call('agentConsultation', null, { id: contactId }, 1)).body.data.mode).toBe('closed')
    expect((await s.call('agentChatMessage', { text: '重新发起' }, { id }, 1)).status).toBe(403)
    expect((await s.call('chatMessages', null, { id }, 1)).body.data).toEqual([expect.objectContaining({ text: '原有咨询历史' })])
  })
})
