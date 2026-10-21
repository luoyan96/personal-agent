import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { routes, type RouteName } from '@research-agent-platform/contracts'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'
import { FeishuClient, feishuLink, type FeishuTransport } from '../src/integrations/feishu-client.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => {
  for (const fn of cleanup.splice(0).reverse()) await fn()
})
const sourceUrl = 'https://synthetic.feishu.cn/docx/SyntheticDocument123'
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
it('classifies real HTTP400 scope and token errors without exposing upstream text',async()=>{
  for(const code of [99991679,99991663]){
    const client=new FeishuClient(async()=>new Response(JSON.stringify({code,msg:'synthetic-secret-must-not-escape'}),{status:400}))
    await expect(client.document(sourceUrl,'synthetic_token')).rejects.toThrow(/^FEISHU_REAUTHORIZE$/)
  }
  const unavailable=new FeishuClient(async()=>new Response(JSON.stringify({code:0,data:{}}),{status:400}))
  await expect(unavailable.document(sourceUrl,'synthetic_token')).rejects.toThrow(/^FEISHU_UNAVAILABLE$/)
})
async function setup(configured = true) {
  const dir = mkdtempSync(join(tmpdir(), 'acceptcat-feishu-'))
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }))
  const secret = 'synthetic_app_secret_only',
    access = 'synthetic_feishu_user_token_only',
    key = join(dir, 'key'),
    secretFile = join(dir, 'feishu-secret')
  writeFileSync(key, randomBytes(32).toString('hex'), { mode: 0o600 })
  writeFileSync(secretFile, secret, { mode: 0o600 })
  const config = readConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: join(dir, 'db.sqlite'),
    BLOB_ROOT: join(dir, 'blobs'),
    APP_ORIGIN: 'http://127.0.0.1:4496',
    LAB_CREDENTIAL_KEY_FILE: key,
    ...(configured ? { FEISHU_APP_ID: 'cli_synthetic', FEISHU_APP_SECRET_FILE: secretFile } : {})
  })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  migrate(db)
  seed(db, 'test')
  cleanup.push(() => db.close())
  const accounts = ['A', 'B'].map((letter) => ({
    memberId: `member_${letter}`,
    username: `feishu_${letter}`,
    password: randomBytes(24).toString('hex')
  }))
  await provisionTestAccounts(db, 'test', accounts)
  const requests: { url: string; init: RequestInit }[] = []
  const remote = {
    revision: 7,
    content: 'SYNTHETIC_RESEARCH_MARKER 申请书研究目标：验证材料方法，阶段成果为对照报告。',
    type: 'docx',
    denied: false,
    expired: false,
    changed: false,
    afterRead: undefined as undefined | (() => void),
    afterExchange: undefined as undefined | (() => void)
  }
  const transport: FeishuTransport = async (input, init) => {
    const url = String(input)
    requests.push({ url, init: init ?? {} })
    expect(url.startsWith('https://open.feishu.cn/open-apis/')).toBe(true)
    expect(init?.redirect).toBe('error')
    if (url.endsWith('/oauth/token')) {
      const body = JSON.parse(String(init?.body))
      expect(body.client_secret).toBe(secret)
      expect(body.grant_type).toBe('authorization_code')
      expect(body.code_verifier.length).toBeGreaterThan(40)
      remote.afterExchange?.()
      return json({ code: 0, access_token: access, token_type: 'Bearer', expires_in: 7200 })
    }
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${access}`)
    if (url.endsWith('/user_info'))
      return json({
        code: 0,
        data: { open_id: 'synthetic_open_A', tenant_key: 'synthetic_tenant', name: '合成飞书用户' }
      })
    if (remote.expired) return json({ code: 99991663, msg: access })
    if (remote.denied) return json({ code: 99991672, msg: secret + access })
    if (url.includes('/get_node?'))
      return json({ code: 0, data: { node: { obj_type: remote.type, obj_token: 'SyntheticDocument123' } } })
    if (url.endsWith('/raw_content')) {
      remote.afterRead?.()
      if (remote.changed) remote.revision++
      return json({ code: 0, data: { content: remote.content } })
    }
    return json({
      code: 0,
      data: {
        document: { document_id: 'SyntheticDocument123', revision_id: remote.revision, title: '合成申请书' }
      }
    })
  }
  const app = createServer(config, { feishuTransport: transport })
  const url = await app.listen({ host: '127.0.0.1', port: 0 })
  cleanup.push(() => app.close())
  const clients: { cookie: string; csrf: string }[] = []
  async function call(
    name: RouteName,
    body: unknown = null,
    actor = 0,
    key = randomUUID(),
    extra: Record<string, string> = {}
  ) {
    const route = routes[name],
      response = await fetch(url + route.path, {
        method: route.method,
        headers: {
          origin: config.origin,
          'content-type': 'application/json',
          'idempotency-key': key,
          ...(clients[actor] ? { cookie: clients[actor].cookie, 'x-csrf-token': clients[actor].csrf } : {}),
          ...extra
        },
        ...(route.method !== 'GET' ? { body: JSON.stringify(body) } : {})
      })
    const text = await response.text(),
      value = JSON.parse(text)
    if (response.ok) route.response.parse(value)
    return { status: response.status, value, text, headers: response.headers }
  }
  async function ok(name: RouteName, body: unknown = null, actor = 0, key = randomUUID()) {
    const r = await call(name, body, actor, key)
    expect(r.status, r.text).toBeLessThan(300)
    return r.value.data
  }
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i]!,
      login = await call('login', { username: a.username, password: a.password }, i)
    clients[i] = { cookie: login.headers.get('set-cookie')!.split(';')[0]!, csrf: '' }
    clients[i]!.csrf = (await ok('session', null, i)).csrfToken
  }
  const callback = async (authorizationUrl: string) => {
    const state = new URL(authorizationUrl).searchParams.get('state')!
    const r = await fetch(`${url}/api/v1/feishu/callback?state=${state}&code=synthetic_code`)
    return { status: r.status, text: await r.text(), headers: r.headers }
  }
  const connect = async () => {
    const auth = await ok('connectFeishu', {}),
      done = await callback(auth.authorizationUrl)
    expect(done.status, done.text).toBe(200)
    return auth
  }
  const collection = async (scope = 'owner_private') =>
    ok('createResearchCollection', { name: '合成资料集合', scope, taskIds: [] })
  const preview = async (value = sourceUrl) => ok('previewFeishuDocument', { url: value })
  return {
    db,
    config,
    url,
    clients,
    requests,
    remote,
    secret,
    access,
    call,
    ok,
    callback,
    connect,
    collection,
    preview,
    app
  }
}
describe('Feishu read-only selected documents, synthetic HTTP provider', { timeout: 30000 }, () => {
  it('honestly gates missing configuration, sessions, CSRF, origin and malformed URLs', async () => {
    const s = await setup(false)
    expect((await s.ok('feishuStatus')).state).toBe('unconfigured')
    expect((await s.call('connectFeishu', {})).status).toBe(503)
    expect((await s.call('feishuStatus', null, 9)).status).toBe(401)
    expect((await s.call('connectFeishu', {}, 0, randomUUID(), { 'x-csrf-token': '' })).status).toBe(403)
    expect(
      (await s.call('connectFeishu', {}, 0, randomUUID(), { origin: 'https://untrusted.example' })).status
    ).toBe(403)
    for (const url of [
      'http://a.feishu.cn/docx/abcdefgh',
      'https://feishu.cn.evil.test/docx/abcdefgh',
      'https://a.feishu.cn@127.0.0.1/docx/abcdefgh',
      'https://127.0.0.1/docx/abcdefgh',
      'https://a.feishu.cn:8443/docx/abcdefgh',
      'https://a.feishu.cn/sheets/abcdefgh',
      'https://a.feishu.cn/docx/a%2Fb',
      'file:///secret'
    ])
      expect((await s.call('previewFeishuDocument', { url })).value.error.code).toBe('FEISHU_LINK_INVALID')
    expect(s.requests).toEqual([])
  })
  it('uses single-use PKCE state bound to the initiating live session; never returns secrets', async () => {
    const s = await setup(),
      auth = await s.ok('connectFeishu', {}),
      link = new URL(auth.authorizationUrl)
    expect(link.origin).toBe('https://accounts.feishu.cn')
    expect(link.searchParams.get('code_challenge_method')).toBe('S256')
    expect(link.searchParams.get('scope')).not.toContain('offline_access')
    expect(link.searchParams.get('scope')).not.toContain('docx:document ')
    expect((await s.callback(auth.authorizationUrl)).status).toBe(200)
    expect((await s.callback(auth.authorizationUrl)).status).toBe(400)
    expect((await s.ok('feishuStatus')).state).toBe('connected')
    expect((await s.ok('feishuStatus', null, 1)).state).toBe('disconnected')
    const row = s.db.prepare('SELECT * FROM feishu_connections').get()!
    expect(row.encrypted_token).not.toContain(s.access)
    const second = await s.ok('connectFeishu', {})
    await s.ok('logout', {})
    expect((await s.callback(second.authorizationUrl)).status).toBe(400)
    expect(JSON.stringify(auth)).not.toContain(s.secret)
    expect(JSON.stringify(row)).not.toContain(s.access)
  })
  it('rejects expired or superseded OAuth state and a late exchange after disconnect', async () => {
    const s = await setup(),
      first = await s.ok('connectFeishu', {}),
      second = await s.ok('connectFeishu', {})
    expect((await s.callback(first.authorizationUrl)).status).toBe(400)
    s.db.prepare("UPDATE feishu_oauth_states SET expires_at='2000-01-01T00:00:00.000Z'").run()
    expect((await s.callback(second.authorizationUrl)).status).toBe(400)
    const third = await s.ok('connectFeishu', {})
    s.remote.afterExchange = () => s.db.prepare('DELETE FROM feishu_oauth_states').run()
    expect((await s.callback(third.authorizationUrl)).status).toBe(400)
    expect(s.db.prepare('SELECT count(*) n FROM feishu_connections').get()!.n).toBe(0)
  })
  it('previews only a selected docx or wiki/docx, strips tracking params and fences revision changes', async () => {
    const s = await setup()
    await s.connect()
    const p = await s.preview(sourceUrl + '?from=share#tracking')
    expect(p.sourceUrl).toBe(sourceUrl)
    expect(p.content).toContain('SYNTHETIC_RESEARCH_MARKER')
    expect(p.revision).toBe(7)
    expect(p.limitation).toContain('未读取图片')
    expect((await s.ok('researchCollections')).length).toBe(0)
    expect((await s.preview('https://synthetic.feishu.cn/wiki/SyntheticWiki123')).documentId).toBe(
      'SyntheticDocument123'
    )
    s.remote.type = 'sheet'
    expect(
      (await s.call('previewFeishuDocument', { url: 'https://synthetic.feishu.cn/wiki/SyntheticWiki123' }))
        .value.error.code
    ).toBe('FEISHU_LINK_INVALID')
    s.remote.changed = true
    expect((await s.call('previewFeishuDocument', { url: sourceUrl })).value.error.code).toBe(
      'VERSION_CONFLICT'
    )
    s.remote.changed = false
    s.remote.content = 'x'.repeat(100001)
    expect((await s.call('previewFeishuDocument', { url: sourceUrl })).status).toBe(422)
  })
  it('imports a private immutable copy with provenance and precise Agent citations; retries create one file', async () => {
    const s = await setup()
    await s.connect()
    const c = await s.collection(),
      p = await s.preview(),
      key = randomUUID()
    const body = {
      previewId: p.id,
      collectionId: c.id,
      expectedCollectionVersion: c.version,
      confirmPrivateSnapshot: true
    }
    const file = await s.ok('importFeishuSnapshot', body, 0, key),
      replay = await s.ok('importFeishuSnapshot', body, 0, key)
    expect(file.id).toBe(replay.id)
    expect(s.db.prepare('SELECT count(*) n FROM research_files').get()!.n).toBe(1)
    expect(file.metadata.note).toContain(sourceUrl)
    expect(file.metadata.note).toContain(p.sha256)
    const hidden = await fetch(s.url + '/api/v1/research-library/search?q=SYNTHETIC_RESEARCH_MARKER', {
      headers: { cookie: s.clients[1]!.cookie }
    })
    expect(await hidden.json()).toEqual({ data: [] })
    const agent = await s.ok('personalConversation', {}),
      agentId = agent.agent.id
    const route = routes.bindAgentResearchCollections
    const response = await fetch(s.url + route.path.replace('{id}', agentId), {
      method: 'POST',
      headers: {
        cookie: s.clients[0]!.cookie,
        origin: s.config.origin,
        'content-type': 'application/json',
        'x-csrf-token': s.clients[0]!.csrf,
        'idempotency-key': randomUUID()
      },
      body: JSON.stringify({ expectedVersion: 1, collectionIds: [c.id] })
    })
    expect(response.status).toBe(200)
    const context = await fetch(s.url + routes.agentResearchContext.path.replace('{id}', agentId), {
      method: 'POST',
      headers: {
        cookie: s.clients[0]!.cookie,
        origin: s.config.origin,
        'content-type': 'application/json',
        'x-csrf-token': s.clients[0]!.csrf,
        'idempotency-key': randomUUID()
      },
      body: JSON.stringify({ query: 'SYNTHETIC_RESEARCH_MARKER' })
    })
    const result = (await context.json()) as any
    expect(context.status).toBe(200)
    expect(result.data.excerpts[0].citation.sourceId).toBe(file.id)
    const doc = s.db
        .prepare('SELECT document,blob_key FROM research_file_versions WHERE file_id=?')
        .get(file.id)!,
      original = readFileSync(join(s.config.blobRoot, String(doc.blob_key)), 'utf8')
    expect(original).toContain(p.content)
    expect(createHash('sha256').update(original).digest('hex')).toBe(file.sha256)
    await s.ok('disconnectFeishu', {})
    expect((await s.ok('importFeishuSnapshot', body, 0, key)).id).toBe(file.id)
    const foreign = await s.call('importFeishuSnapshot', body, 1, key)
    expect(foreign.status).toBe(404)
    expect(foreign.text).not.toContain(p.content)
  })
  it('requires private owner, confirmation, unchanged collection, document and live authorization', async () => {
    const s = await setup()
    await s.connect()
    const c = await s.collection(),
      shared = await s.collection('lab_shared'),
      p = await s.preview(),
      body = {
        previewId: p.id,
        collectionId: c.id,
        expectedCollectionVersion: 1,
        confirmPrivateSnapshot: true
      }
    expect((await s.call('importFeishuSnapshot', { ...body, confirmPrivateSnapshot: false })).status).toBe(
      400
    )
    expect((await s.call('importFeishuSnapshot', { ...body, collectionId: shared.id })).status).toBe(403)
    expect((await s.call('importFeishuSnapshot', body, 1)).status).toBe(404)
    s.remote.revision++
    expect((await s.call('importFeishuSnapshot', body)).status).toBe(409)
    s.remote.revision--
    s.remote.denied = true
    const denied = await s.call('importFeishuSnapshot', body)
    expect(denied.status).toBe(403)
    expect(denied.text).not.toContain(s.secret)
    expect(denied.text).not.toContain(s.access)
    s.remote.denied = false
    s.remote.afterRead = () => s.db.prepare('DELETE FROM feishu_connections').run()
    expect((await s.call('importFeishuSnapshot', body)).status).toBe(409)
    expect(s.db.prepare('SELECT count(*) n FROM research_files').get()!.n).toBe(0)
  })
  it('fences logout and expired preview; clears revoked user credentials and limits stored previews', async () => {
    const s = await setup()
    await s.connect()
    for (let i = 0; i < 7; i++) await s.preview()
    expect(s.db.prepare('SELECT count(*) n FROM feishu_previews').get()!.n).toBe(5)
    const c = await s.collection(),
      p = await s.preview()
    s.db.prepare("UPDATE feishu_previews SET expires_at='2000-01-01T00:00:00.000Z'").run()
    expect(
      (
        await s.call('importFeishuSnapshot', {
          previewId: p.id,
          collectionId: c.id,
          expectedCollectionVersion: 1,
          confirmPrivateSnapshot: true
        })
      ).status
    ).toBe(404)
    s.remote.expired = true
    expect((await s.call('previewFeishuDocument', { url: sourceUrl })).status).toBe(409)
    expect((await s.ok('feishuStatus')).state).toBe('disconnected')
    s.remote.expired = false
    await s.connect()
    s.remote.afterRead = () =>
      s.db
        .prepare("UPDATE sessions SET revoked_at='2026-01-01T00:00:00.000Z' WHERE member_id='member_A'")
        .run()
    expect((await s.call('previewFeishuDocument', { url: sourceUrl })).status).toBe(401)
  })
  it('rejects redirect responses, oversized provider responses and transport exceptions without leaking errors', async () => {
    expect(feishuLink(sourceUrl).id).toBe('SyntheticDocument123')
    for (const transport of [
      async () => new Response('', { status: 302, headers: { location: 'http://127.0.0.1/secret' } }),
      async () => json({ data: { content: 'x'.repeat(1024 * 1024 + 1) } }),
      async () => {
        throw new Error('SYNTHETIC_SECRET_FROM_REMOTE')
      }
    ]) {
      await expect(
        new FeishuClient(transport as FeishuTransport).document(sourceUrl, 'synthetic')
      ).rejects.toThrow(/FEISHU_UNAVAILABLE|FILE_EXTRACTION_LIMIT/)
    }
  })
})
