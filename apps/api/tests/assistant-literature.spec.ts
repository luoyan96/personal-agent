import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { routes, type LiteratureRecommendationItem, type RouteName } from '@research-agent-platform/contracts'
import {
  literatureRecommendationBatchId, recordLiteratureRecommendations, resolveLiteratureDirections,
} from '../src/assistant-literature.js'
import { authenticate, hash } from '../src/auth.js'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, transaction } from '../src/database.js'
import { createServer } from '../src/server.js'

const cleanup: (() => void | Promise<void>)[] = []
afterEach(async () => { for (const release of cleanup.splice(0).reverse()) await release() })

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'assistant-literature-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const config = readConfig({
    NODE_ENV: 'test', DATABASE_PATH: join(dir, 'library.sqlite'), BLOB_ROOT: join(dir, 'blobs'),
    APP_ORIGIN: 'http://127.0.0.1:4311',
  })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)

  const at = new Date().toISOString()
  const credentials = new Map<string, { token: string; csrf: string }>()
  for (const id of ['a', 'b', 'c']) {
    const home = `home_${id}`
    db.prepare('INSERT INTO labs VALUES (?,?)').run(home, `Personal ${id}`)
    db.prepare('INSERT INTO members(id,lab_id,display_name) VALUES (?,?,?)').run(id, home, `Synthetic ${id}`)
    db.prepare('INSERT INTO auth_accounts VALUES (?,?,?,0)').run(id, `synthetic_${id}`, 'unused_in_session_fixture')
    db.prepare('INSERT INTO personal_spaces VALUES (?,?)').run(home, id)
    for (const [kind, contact] of [['human', `human_${id}`], ['personal_agent', `assistant_${id}`]]) {
      db.prepare('INSERT INTO chat_contacts VALUES (?,?,?,?,?)').run(contact!, home, kind!, id, id)
    }
    db.prepare(`INSERT INTO chat_contact_profiles(contact_id,role,capability_description) VALUES (?,'human','熟悉 Python 和排版')`).run(`human_${id}`)
    db.prepare(`INSERT INTO chat_conversations VALUES (?,?,?,'personal',?,?)`).run(`personal_${id}`, home, id, `personal:${home}:${id}`, '{}')
    const token = randomBytes(32).toString('hex')
    const csrf = randomBytes(32).toString('hex')
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?,?,NULL)').run(hash(token), id, hash(csrf), at, new Date(Date.now() + 3600_000).toISOString())
    credentials.set(id, { token, csrf })
  }
  for (const [team, manager] of [['team_one', 'a'], ['team_two', 'c']] as const) {
    db.prepare('INSERT INTO labs VALUES (?,?)').run(team, team)
    for (const id of [manager, 'b']) db.prepare("INSERT INTO lab_memberships VALUES (?,?,'active',?,1)").run(team, id, at)
    db.prepare('INSERT INTO lab_managers VALUES (?,?,?,NULL)').run(team, manager, at)
  }
  for (const id of ['a', 'b']) db.prepare("INSERT INTO member_lab_contexts VALUES (?,'team_one',1)").run(id)

  const app = createServer(config)
  cleanup.push(() => app.close())
  function call(name: RouteName, account: string | null = 'a', body?: object, labId?: string, key = randomUUID()) {
    const route = routes[name]
    const session = account ? credentials.get(account) : undefined
    return app.inject({
      method: route.method, url: route.path.replace('{id}', labId ?? ''),
      headers: { origin: config.origin, ...(session ? { cookie: `rap_session=${session.token}`, 'x-csrf-token': session.csrf } : {}), 'idempotency-key': key },
      ...(body ? { payload: body } : {}),
    })
  }
  const actor = (account: string) => authenticate(db, credentials.get(account)!.token)
  const feed = async (account = 'a') => {
    const res = await call('assistantLiteratureRecommendations', account)
    expect(res.statusCode, res.body).toBe(200)
    return routes.assistantLiteratureRecommendations.response.parse(res.json()).data
  }

  let serial = 0
  function reply(account: string, items: LiteratureRecommendationItem[], captured = resolveLiteratureDirections(db, actor(account))) {
    const turnId = `turn_${++serial}`
    const inputMessageId = `request_${serial}`
    const messageId = `assistant_reply_${serial}`
    const conversationId = `personal_${account}`
    const agentContactId = `assistant_${account}`
    const createdAt = new Date(Date.now() + serial).toISOString()
    const result = transaction(db, () => {
      db.prepare('INSERT INTO chat_messages VALUES (?,?,?,?)').run(inputMessageId, conversationId, serial * 2 - 1,
        JSON.stringify({ senderContactId: `human_${account}`, origin: 'human' }))
      db.prepare('INSERT INTO chat_messages VALUES (?,?,?,?)').run(messageId, conversationId, serial * 2,
        JSON.stringify({ senderContactId: agentContactId, origin: 'service', turnId, createdAt }))
      db.prepare("INSERT INTO chat_turns(id,conversation_id,owner_id,root_id,status,request_json,document) VALUES (?,?,?,?,'succeeded','{}',?)")
        .run(turnId, conversationId, account, turnId, JSON.stringify({ agentContactId, inputMessageId, outputMessageId: messageId }))
      return recordLiteratureRecommendations(db, actor(account), { turnId, messageId, items, context: captured })
    })
    return { turnId, inputMessageId, messageId, createdAt, result }
  }
  return { db, call, actor, feed, reply }
}

const paper = (id: string, title = 'Synthetic imaging result') => ({ id, title, authors: ['Synthetic Author'] })

it('prioritizes explicit personal directions, falls back to the selected team, and authorizes settings before replays', async () => {
  const s = setup()
  expect((await s.call('assistantLiteratureRecommendations', null)).statusCode).toBe(401)
  expect(await s.feed()).toEqual({ source: 'none', directions: [], items: [] })

  const update = { directions: ['  Team imaging  ', 'Team imaging', 'Photonics'], expectedVersion: 1 }
  const key = randomUUID()
  const saved = await s.call('updateLabResearchDirections', 'a', update, 'team_one', key)
  expect(saved.statusCode, saved.body).toBe(200)
  expect(saved.json().data).toEqual({ directions: ['Team imaging', 'Photonics'], canEdit: true, version: 2 })
  expect((await s.call('updateLabResearchDirections', 'a', update, 'team_one', key)).json()).toEqual(saved.json())
  expect((await s.call('updateLabResearchDirections', 'a', { ...update, directions: [] }, 'team_one', key)).json().error.code).toBe('IDEMPOTENCY_CONFLICT')
  expect((await s.call('updateLabResearchDirections', 'a', update, 'team_one')).json().error.code).toBe('VERSION_CONFLICT')
  expect((await s.call('labResearchDirections', 'b', undefined, 'team_one')).json().data).toEqual({ ...saved.json().data, canEdit: false })
  expect((await s.call('updateLabResearchDirections', 'b', update, 'team_one', key)).statusCode).toBe(403)
  expect((await s.call('labResearchDirections', 'c', undefined, 'team_one')).statusCode).toBe(404)
  expect((await s.call('labResearchDirections', 'a', undefined, 'home_a')).statusCode).toBe(404)
  expect(await s.feed()).toEqual({ source: 'team', directions: ['Team imaging', 'Photonics'], items: [] })

  s.db.prepare("UPDATE chat_contact_profiles SET capability_description=? WHERE contact_id='human_a'")
    .run('熟悉 Python\n研究方向：Synthetic optics、Magnetism')
  expect((await s.call('myResearchDirections')).json().data).toEqual({ directions: ['Synthetic optics', 'Magnetism'], canEdit: true, version: 1 })
  expect(await s.feed()).toEqual({ source: 'personal', directions: ['Synthetic optics', 'Magnetism'], items: [] })
  expect((await s.call('updateMyResearchDirections', 'a', { directions: ['Microscopy'], expectedVersion: 1 })).statusCode).toBe(200)
  expect(await s.feed()).toEqual({ source: 'personal', directions: ['Microscopy'], items: [] })
  expect((await s.call('updateMyResearchDirections', 'a', { directions: [], expectedVersion: 2 })).statusCode).toBe(200)
  expect(await s.feed()).toEqual({ source: 'team', directions: ['Team imaging', 'Photonics'], items: [] })
  expect(await s.feed('c')).toEqual({ source: 'none', directions: [], items: [] })
})

it('reads account-owned chat batches with deduplicated arXiv versions, empty search and withdrawal behavior', async () => {
  const s = setup()
  expect((await s.call('updateLabResearchDirections', 'a', { directions: ['Team imaging'], expectedVersion: 1 }, 'team_one')).statusCode).toBe(200)
  const first = s.reply('a', [paper('2611.12345v1'), paper('quant-ph/0700123v2')])
  const second = s.reply('a', [paper('2611.12345v2', 'Newest imaging result')])
  const differentAccount = s.reply('b', [paper('2611.99999', 'Other account result')])
  const feed = await s.feed()
  expect(feed).toMatchObject({ batchId: literatureRecommendationBatchId(second.turnId), messageId: second.messageId, updatedAt: second.createdAt })
  expect(feed.items).toEqual([
    { ...paper('2611.12345v2', 'Newest imaging result'), batchId: second.result!.batchId, messageId: second.messageId },
    { ...paper('quant-ph/0700123v2'), batchId: first.result!.batchId, messageId: first.messageId },
  ])
  expect((await s.feed('b')).items.map(item => item.messageId)).toEqual([differentAccount.messageId])
  expect((await s.feed('c')).items).toEqual([])
  const context = resolveLiteratureDirections(s.db, s.actor('a'))
  expect(transaction(s.db, () => recordLiteratureRecommendations(s.db, s.actor('a'), { ...second, context, items: [paper('2611.99999')] }))).toEqual(second.result)
  expect(transaction(s.db, () => recordLiteratureRecommendations(s.db, s.actor('a'), { ...differentAccount, context, items: [] }))).toBeNull()

  const empty = s.reply('a', [])
  expect(await s.feed()).toMatchObject({ batchId: empty.result!.batchId, items: [] })
  s.db.prepare('INSERT INTO chat_message_retractions VALUES (?,?,?)').run(empty.inputMessageId, 'a', empty.createdAt)
  expect((await s.feed()).items.map(item => item.id)).toEqual(['2611.12345v2', 'quant-ph/0700123v2'])
})

it('fences writes across group switches and hides former team batches after membership changes', async () => {
  const s = setup()
  expect((await s.call('updateLabResearchDirections', 'a', { directions: ['Optics'], expectedVersion: 1 }, 'team_one')).statusCode).toBe(200)
  expect((await s.call('updateLabResearchDirections', 'c', { directions: ['Optics'], expectedVersion: 1 }, 'team_two')).statusCode).toBe(200)
  const teamOne = resolveLiteratureDirections(s.db, s.actor('b'))
  expect(s.reply('b', [paper('2611.12000')]).result).toBeTruthy()
  expect((await s.call('selectLab', 'b', { labId: 'team_two' })).statusCode).toBe(200)
  expect(s.reply('b', [paper('2611.12001')], teamOne).result).toBeNull()
  expect(await s.feed('b')).toEqual({ source: 'team', directions: ['Optics'], items: [] })
  expect((await s.call('selectLab', 'b', { labId: 'team_one' })).statusCode).toBe(200)
  expect((await s.feed('b')).items.map(item => item.id)).toEqual(['2611.12000'])
  expect((await s.call('leaveLab', 'b', {}, 'team_one')).statusCode).toBe(200)
  expect(await s.feed('b')).toEqual({ source: 'none', directions: [], items: [] })
  s.db.prepare("UPDATE lab_memberships SET status='active',version=version+1 WHERE member_id='b' AND lab_id='team_one'").run()
  expect((await s.call('selectLab', 'b', { labId: 'team_one' })).statusCode).toBe(200)
  expect(await s.feed('b')).toEqual({ source: 'team', directions: ['Optics'], items: [] })
  expect(s.reply('b', [paper('2611.12002')], teamOne).result).toBeNull()
})
