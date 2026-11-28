import { randomBytes, randomUUID, createHash } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { readFile, readdir, realpath } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'
import { WorkContext } from '@research-agent-platform/contracts'

const cleanup: Array<() => unknown | Promise<unknown>> = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
const repo = fileURLToPath(new URL('../../../', import.meta.url))
const client = path.join(repo, 'clients/openim')
const loadDesktop = (name: string) => import(pathToFileURL(path.join(repo, 'integrations/deepseek-harness/desktop', name)).href)
const nativeRuntime: any = { WorkContext,
  ...await loadDesktop('task-workspace.ts'), ...await loadDesktop('work-memory.ts'),
  ...await loadDesktop('team-execution.ts'), ...await loadDesktop('native-task-context.ts'),
  ...await loadDesktop('native-task-context-plugin.ts'),
  ...await import(pathToFileURL(path.join(repo, 'packages/research-core/src/personal-preferences.ts')).href),
}
const require = createRequire(path.join(client, 'electron/main/taskDshManage.ts'))

// Exercise actual main-process handlers without loading Electron or installing
// client dev dependencies in Foundation CI. Only the OS host is controlled.
function nativeModule(file: string, dependencies: Record<string, unknown>, timers: ReturnType<typeof setInterval>[] = []) {
  const module = { exports: {} as any }
  const source = ts.transpileModule(readFileSync(path.join(client, 'electron/main', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  vm.runInNewContext(source, {
    module, exports: module.exports, process, Buffer, TextEncoder, URL, URLSearchParams, setTimeout, clearTimeout,
    setInterval: (fn: () => void, ms: number) => { const timer = setInterval(fn, ms); timers.push(timer); return timer }, clearInterval,
    require: (name: string) => name in dependencies ? dependencies[name] : require(name),
  })
  return module.exports
}

async function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'native-workbench-integration-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const master = path.join(root, 'synthetic-master.key')
  writeFileSync(master, randomBytes(32).toString('hex'), { mode: 0o600 })
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: path.join(root, 'platform.sqlite'), BLOB_ROOT: path.join(root, 'blobs'), APP_ORIGIN: 'http://127.0.0.1:4498', LAB_CREDENTIAL_KEY_FILE: master })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db); seed(db, 'test')
  const password = randomBytes(24).toString('hex')
  await provisionTestAccounts(db, 'test', ['A', 'B'].map(letter => ({ memberId: `member_${letter}`, username: `native_${letter}`, password })))
  const app = createServer(config)
  cleanup.push(() => app.close())
  const clients: Array<{ cookie: string; csrf: string }> = []
  for (const letter of ['A', 'B']) {
    const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: { origin: config.origin }, payload: { username: `native_${letter}`, password } })
    expect(login.statusCode, login.body).toBe(200)
    const cookie = String(login.headers['set-cookie']).split(';')[0]!
    const session = (await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })).json().data
    clients.push({ cookie, csrf: session.csrfToken })
  }
  const call = async (url: string, payload?: unknown, actor = 0) => app.inject({ method: payload === undefined ? 'GET' : 'POST', url: '/api/v1/' + url, headers: { origin: config.origin, cookie: clients[actor]!.cookie, 'x-csrf-token': clients[actor]!.csrf, 'idempotency-key': randomUUID(), 'x-acceptcat-work-rules': 'layers-v1' }, ...(payload === undefined ? {} : { payload: payload as any }) })
  const own = await call('chat/personal-conversation', {})
  expect(own.statusCode, own.body).toBe(200)
  const conversation = own.json().data.conversation
  const sent = await call(`chat/conversations/${conversation.id}/messages`, { text: 'SERVER VERIFIED TASK DISCUSSION', mentions: [], context: [], intent: 'chat' })
  expect(sent.statusCode, sent.body).toBe(201)
  const message = sent.json().data.message ?? sent.json().data
  const created = await call('work/tasks', { title: '合成方法比较', goal: '比较方法，汇报依据和限制', contactIds: [], agentContactId: null })
  expect(created.statusCode, created.body).toBe(201)
  const task = created.json().data
  const activated = await call(`work/tasks/${task.id}/activate`, { expectedVersion: task.version })
  expect(activated.statusCode, activated.body).toBe(200)
  // Seed the same immutable relation produced by assistant task creation. The
  // message and every subsequent read still pass actual API ACL and parsing.
  const row = db.prepare('SELECT document FROM personal_work_tasks WHERE id=?').get(task.id)!
  const doc = JSON.parse(String(row.document))
  doc.sourceConversationId = conversation.id; doc.sourceMessageId = message.id
  db.prepare('UPDATE personal_work_tasks SET document=? WHERE id=?').run(JSON.stringify(doc), task.id)
  expect((await call('me/memories', { topic: '汇报习惯', scope: 'general', content: 'PRIVATE APPLICABLE HABIT' })).statusCode).toBe(201)
  expect((await call('me/memories', { topic: ' unrelated-topic ', scope: 'topic', content: 'UNRELATED PRIVATE HABIT' })).statusCode).toBe(201)
  const target = { kind: 'personal', taskId: task.id }
  const handlers = new Map<string, (...args: any[]) => Promise<any>>()
  const sessions = new Set<string>(), events: any[] = [], rpcCalls: string[] = [], businessCalls: any[] = [], selected: string[] = [], timers: ReturnType<typeof setInterval>[] = []
  let route = `#/dsh?task=${task.id}&taskKind=personal`, running = false, valid = true, currentActor = 0
  const work = path.join(root, 'work'); mkdirSync(work)
  const material = path.join(root, 'selected-material.txt'); writeFileSync(material, 'VERIFIED MATERIAL CONTENT')
  let picker = [work]
  const request = (resolve: (body: string | undefined, headers: Record<string, string>) => Promise<{ status: number; body: string }> | { status: number; body: string }) => {
    const req = new EventEmitter() as any, headers: Record<string, string> = {}
    req.setHeader = (key: string, value: string) => { headers[key.toLowerCase()] = value }
    req.abort = () => {}
    req.end = (body: string | undefined) => { void Promise.resolve().then(async () => {
      try { const value = await resolve(body, headers), response = new EventEmitter() as any; response.statusCode = value.status; req.emit('response', response); response.emit('data', Buffer.from(value.body)); response.emit('end') }
      catch (error) { req.emit('error', error) }
    }) }
    return req
  }
  const account = {
    metadata: { memberId: 'member_A', protocol: 'openai-completions' }, identity: 'synthetic-authenticated-account', lease: 'synthetic-lease', csrf: clients[0]!.csrf,
    valid: async () => { if (!valid) throw Error('account expired') },
    request: (url: string, method = 'GET') => request(async (body, headers) => {
      businessCalls.push({ url, method, headers, body: body ? JSON.parse(body) : undefined })
      const response = await app.inject({ method: method as any, url, headers: { ...headers, cookie: clients[currentActor]!.cookie, origin: config.origin }, ...(body ? { payload: JSON.parse(body) } : {}) })
      return { status: response.statusCode, body: response.body }
    }),
  }
  const electron = {
    app: { getPath: () => root, getAppPath: () => client }, BrowserWindow: { fromWebContents: () => ({}) }, ipcMain: { handle: (name: string, fn: any) => handlers.set(name, fn) },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: picker }) }, shell: {},
    net: { request: () => request(body => {
      const { method, payload } = JSON.parse(body!), args = payload.args.request ?? payload.args._request; rpcCalls.push(method)
      let value: any = {}
      if (method === 'workspace/create') value = { workspace: { workspaceId: 'local_fixture' } }
      if (method === 'session/create') { sessions.add(args.sessionId); value = { sessionId: args.sessionId } }
      if (method === 'session/projections') value = sessions.has(args.sessionId) ? { kind: 'sequenced', asOfSeq: Math.max(0, ...events.map(event => event.seq)) } : null
      if (method === 'session/page') value = { records: events.filter(event => event.seq <= args.throughSeq).map(event => ({ event })), hasMore: false }
      if (method === 'session/list') value = { items: [...sessions].map(sessionId => ({ sessionId, running })) }
      return { status: 200, body: JSON.stringify({ result: { ok: true, value } }) }
    }) },
  }
  const bridge = nativeModule('taskDshManage.ts', {
    electron, './localDshRuntime': nativeRuntime, './localFolderManage': { authority: (event: any) => ({ contents: event.sender }) },
    './teamLibraryManage': { teamLibraryContext: () => { throw Error('No Git library requested') } },
    '../utils/localLibrary': { localLibraryPaths: async () => [], personalLibraryPaths: async () => [] },
  }, timers)
  const hooks = bridge.registerTaskDshBridge(async () => ({ account, session: {}, origin: 'http://127.0.0.1:9' }), async (id: string) => { selected.push(id) })
  cleanup.push(() => timers.forEach(clearInterval))
  const event = { sender: { getURL: () => 'http://renderer.invalid/' + route } }
  const ipc = (name: string, ...args: any[]) => handlers.get(name)!(event, target, ...args)
  const relayModule = nativeModule('localDshAccount.ts', {
    electron, './localDshRuntime': nativeRuntime, './localFolderManage': {}, './windowManage': {}, './desktopAccount': {}, '../utils/desktopServer': {},
  })
  const relay = await relayModule.createDshRelay(account, hooks)
  cleanup.push(() => relay.close())
  const listeners: Record<string, (...args: any[]) => any> = {}, registrations: any[] = [], plugin: any = {}, warnings: string[] = []
  vm.runInNewContext(nativeRuntime.nativeTaskContextPlugin.replace(/export const name/, 'const name').replace(/export function apply/, 'function apply') + '\nplugin.apply=apply;', { plugin, Map, Promise, AbortSignal, process: { env: { ACCEPTCAT_DSH_TOKEN: relay.secret } }, fetch })
  plugin.apply({ inject: (_names: unknown, callback: any) => callback({ effect: (fn: any) => fn(), systemPrompt: { context: (entry: any) => registrations.push(entry) } }), on: (name: string, fn: any) => { listeners[name] = fn }, effect: () => {}, logger: { warn: (text: string) => warnings.push(text) } }, { baseURL: relay.baseURL })
  const preStep = async (sessionId: string) => { await listeners['agent/pre-step']!({ agent: { session: { id: sessionId } } }, async () => ({ kind: 'continue' })); return registrations[0].text({ scope: { session: { id: sessionId } } }) as string }
  const feedback = async (sessionId: string, text: string, source = 'user') => {
    const event = { type: 'user/message', seq: events.length + 1, time: Date.now(), data: { id: 'native_' + randomUUID(), source: { kind: source }, content: [{ type: 'text', text }] } }
    events.push(event); listeners['session/event']!({ id: sessionId }, event)
    return preStep(sessionId)
  }
  return { root, db, call, target, account, ipc, hooks, relay, events, rpcCalls, businessCalls, selected, preStep, feedback, registrations, warnings, conversation, message, work, material,
    set: (value: { route?: string; running?: boolean; valid?: boolean; actor?: number; picker?: string[] }) => { if (value.route !== undefined) route = value.route; if (value.running !== undefined) running = value.running; if (value.valid !== undefined) valid = value.valid; if (value.actor !== undefined) currentActor = value.actor; if (value.picker) picker = value.picker },
  }
}

it('automatic native attachment reaches the real pre-step hook with verified discussion, material path and applicable private habit', async () => {
  const f = await fixture(), opened = await f.ipc('task-dsh-open', true)
  f.set({ picker: [f.material] }); await f.ipc('task-dsh-add-local')
  const attached = await f.ipc('task-dsh-attach-context', { messages: [{ conversationId: f.conversation.id, messageId: f.message.id, text: 'SPOOFED RENDERER TEXT' }] })
  const text = await f.preStep(opened.binding.sessionId)
  expect(text).toContain('SERVER VERIFIED TASK DISCUSSION'); expect(text).not.toContain('SPOOFED RENDERER TEXT')
  expect(text).toContain('PRIVATE APPLICABLE HABIT'); expect(text).not.toContain('UNRELATED PRIVATE HABIT')
  const material = attached.binding.localMaterials.find((item: any) => item.filename === 'selected-material.txt')
  expect(material.sha256).toBe(createHash('sha256').update('VERIFIED MATERIAL CONTENT').digest('hex'))
  const entries = JSON.parse(text.split('\n')[1]!)
  const materialContext = JSON.parse(entries.find((entry: any) => entry.title === 'selected-material.txt').content)
  expect(materialContext.path).toBe(await realpath(path.join(f.work, material.localName)))
  expect(await readFile(path.join(f.work, material.localName), 'utf8')).toBe('VERIFIED MATERIAL CONTENT')
  expect(attached.binding.contextAttachment.path).toBe('session:' + opened.binding.sessionId)
  expect(f.selected).toEqual([opened.binding.sessionId]); expect(f.rpcCalls).not.toContain('session/prompt')
  expect(await readdir(f.work)).toEqual([material.localName])
  expect(await readFile(path.join(f.root, 'task-workspaces', f.account.identity, 'personal-' + f.target.taskId + '.json'), 'utf8')).not.toContain('PRIVATE APPLICABLE HABIT')
  expect(await f.preStep('acceptcat-unrelated')).toBe('')
})

it('native DSH corrections pass authenticated feedback and preserve separate habits while revising the same topic', async () => {
  const f = await fixture(), opened = await f.ipc('task-dsh-open', true)
  await f.ipc('task-dsh-attach-context')
  const first = await f.feedback(opened.binding.sessionId, '以后汇报先给结论')
  expect(first).toContain('以后汇报先给结论')
  const initial = (await f.call('me/memories?status=all&limit=100')).json().data.find((item: any) => item.topic === '工作台 · 汇报')
  expect(initial.version).toBe(1)
  const next = await f.feedback(opened.binding.sessionId, '以后汇报先列证据')
  expect(next).toContain('以后汇报先列证据'); expect(next).not.toContain('以后汇报先给结论')
  await f.feedback(opened.binding.sessionId, '以后比较论文时按实验设置逐项对照')
  const memories = (await f.call('me/memories?status=all&limit=100')).json().data
  const corrected = memories.find((item: any) => item.topic === initial.topic)
  expect(corrected.id).toBe(initial.id); expect(corrected.version).toBe(2)
  expect(memories.some((item: any) => item.topic === '工作台 · 比较论文' && item.content === '以后比较论文时按实验设置逐项对照')).toBe(true)
  const writes = f.businessCalls.filter(item => item.url === '/api/v1/me/memories' && item.method === 'POST')
  expect(writes).toHaveLength(3); expect(writes.every(item => item.headers['x-csrf-token'] === f.account.csrf && /^[a-f0-9]{64}$/.test(item.headers['idempotency-key']))).toBe(true)
  expect((await f.call('me/memories?status=all&limit=100', undefined, 1)).json().data).toEqual([])
  const count = writes.length
  await f.feedback(opened.binding.sessionId, '以后汇报先用表格', 'tool')
  await f.feedback(opened.binding.sessionId, '这次先列结果')
  expect(f.businessCalls.filter(item => item.url === '/api/v1/me/memories' && item.method === 'POST')).toHaveLength(count)
  const original = f.events[0]
  await expect(f.hooks.taskFeedback({ sessionId: opened.binding.sessionId, seq: original.seq, messageId: original.data.id, text: '以后汇报先伪造改写' })).rejects.toThrow(/原始会话不一致/)
})

it('running native sessions reauthorize background metadata without rotating or prompting their native session', async () => {
  const f = await fixture(), opened = await f.ipc('task-dsh-open', true)
  await f.ipc('task-dsh-attach-context')
  f.set({ running: true })
  expect(await f.preStep(opened.binding.sessionId)).toContain('PRIVATE APPLICABLE HABIT')
  const attached = await f.ipc('task-dsh-attach-context')
  expect(attached.binding.sessionId).toBe(opened.binding.sessionId)
  expect(attached.binding.contextAttachment.path).toBe('session:' + opened.binding.sessionId)
  expect((await f.ipc('task-dsh-status')).phase).toBe('running')
  expect(f.rpcCalls).not.toContain('session/prompt')
  expect(f.rpcCalls.filter(method => method === 'session/create')).toHaveLength(1)
  f.set({ running: false }); expect((await f.ipc('task-dsh-attach-context')).binding.sessionId).toBe(opened.binding.sessionId)
})

it('a task becoming shared drops private habits and rejects preference writes; revoked login clears the native prompt', async () => {
  const f = await fixture(), opened = await f.ipc('task-dsh-open', true)
  await f.ipc('task-dsh-attach-context')
  expect(await f.preStep(opened.binding.sessionId)).toContain('PRIVATE APPLICABLE HABIT')
  const peer = f.db.prepare("SELECT id FROM chat_contacts WHERE kind='human' AND owner_id='member_B'").get()!
  f.db.prepare("INSERT INTO personal_work_participants(task_id,contact_id,status) VALUES(?,?,'invited')").run(f.target.taskId, peer.id!)
  const text = await f.preStep(opened.binding.sessionId)
  expect(text).not.toContain('PRIVATE APPLICABLE HABIT'); expect(text).not.toContain('UNRELATED PRIVATE HABIT')
  await f.feedback(opened.binding.sessionId, '以后汇报先用证据表')
  expect(f.businessCalls.filter(item => item.url === '/api/v1/me/memories' && item.method === 'POST')).toEqual([])
  f.set({ valid: false })
  await expect(f.preStep(opened.binding.sessionId)).rejects.toThrow(/任务背景当前不可核验/)
  expect(f.registrations[0].text({ scope: { session: { id: opened.binding.sessionId } } })).toBe('')
})
