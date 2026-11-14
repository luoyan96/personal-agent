import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'
import { migrate, openDatabase, seed } from '../src/database.js'
import { provisionTestAccounts } from '../src/auth.js'
import { createServer } from '../src/server.js'

const cleanup: (() => unknown | Promise<unknown>)[] = []
afterEach(async () => {
  for (const f of cleanup.splice(0).reverse()) await f()
})

async function setup() {
  const root = mkdtempSync(join(tmpdir(), 'library-index-'))
  cleanup.push(() => rmSync(root, { recursive: true, force: true }))
  const config = readConfig({
    NODE_ENV: 'test',
    DATABASE_PATH: join(root, 'db'),
    BLOB_ROOT: join(root, 'blobs'),
    APP_ORIGIN: 'http://127.0.0.1:4498',
  })
  mkdirSync(config.blobRoot)
  const db = openDatabase(config.databasePath, true)
  cleanup.push(() => db.close())
  migrate(db)
  seed(db, 'test')
  const password = randomBytes(24).toString('hex')
  await provisionTestAccounts(
    db,
    'test',
    ['A', 'B', 'C'].map((x) => ({
      memberId: `member_${x}`,
      username: `index_${x}`,
      password,
    })),
  )
  db.prepare('INSERT INTO lab_managers VALUES(?,?,?,NULL)').run(
    'lab_synthetic',
    'member_A',
    new Date().toISOString(),
  )
  const app = createServer(config)
  cleanup.push(() => app.close())
  const people: { cookie: string; csrf: string }[] = []
  for (const x of ['A', 'B', 'C']) {
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      headers: { origin: config.origin },
      payload: { username: `index_${x}`, password },
    })
    expect(login.statusCode, login.body).toBe(200)
    const cookie = String(login.headers['set-cookie']).split(';')[0]!,
      session = (
        await app.inject({ url: '/api/v1/auth/session', headers: { cookie } })
      ).json().data
    people.push({ cookie, csrf: session.csrfToken })
  }
  const call = (path: string, body?: unknown, actor = 0, key = randomUUID()) =>
    app.inject({
      method: body === undefined ? 'GET' : 'POST',
      url: '/api/v1/' + path,
      headers: {
        origin: config.origin,
        cookie: people[actor]!.cookie,
        'x-csrf-token': people[actor]!.csrf,
        'idempotency-key': key,
      },
      ...(body === undefined ? {} : { payload: body as any }),
    })
  return { db, app, call }
}

const binding={url:'https://github.com/luoyan96/files.git',branch:'main',workspaceId:'acceptcat-demo',expectedVersion:0}
it('shares a lab binding, version-checks writes and rechecks manager authority before replay',async()=>{
 const s=await setup(), key=randomUUID()
 expect((await s.call('library/repository',binding,1)).statusCode).toBe(403)
 const saved=await s.call('library/repository',binding,0,key)
 expect(saved.statusCode,saved.body).toBe(200)
 expect(saved.json().data.binding.version).toBe(1)
 const visible=await s.call('library/repository',undefined,1)
 expect(visible.json().data.binding.url).toBe(binding.url)
 expect(visible.json().data.canConfigure).toBe(false)
 expect((await s.call('library/repository',binding,0,key)).json()).toEqual(saved.json())
 expect((await s.call('library/repository',binding,0)).statusCode).toBe(409)
 s.db.prepare('DELETE FROM lab_managers WHERE member_id=?').run('member_A')
 expect((await s.call('library/repository',binding,0,key)).statusCode).toBe(403)
})
it('rejects anonymous requests and credential-bearing or non-GitHub repository urls',async()=>{
 const s=await setup()
 expect((await s.app.inject({url:'/api/v1/library/repository'})).statusCode).toBe(401)
 for(const url of ['http://github.com/a/b','https://key@github.com/a/b','https://github.com/a/b?token=x','https://example.com/a/b','file:///C:/secret'])
   expect((await s.call('library/repository',{...binding,url})).statusCode).toBe(400)
})
it('keeps repository bindings isolated when the same account changes its selected lab',async()=>{
 const s=await setup();expect((await s.call('library/repository',binding)).statusCode).toBe(200)
 const created=await s.call('labs',{name:'Synthetic isolated lab'},1);expect(created.statusCode,created.body).toBe(201)
 const lab=created.json().data;expect((await s.call('me/lab-context',{labId:lab.id},1)).statusCode).toBe(200)
 const isolated=await s.call('library/repository',undefined,1);expect(isolated.statusCode,isolated.body).toBe(200);expect(isolated.json().data.binding).toBeNull()
 expect((await s.call('library/repository',{...binding,workspaceId:'other-space'},1)).statusCode).toBe(200)
 expect((await s.call('library/repository')).json().data.binding.workspaceId).toBe('acceptcat-demo')
})
it('upgrades an existing 032 database idempotently without changing existing records',async()=>{
 const s=await setup()
 s.db.exec('DROP VIEW IF EXISTS assistant_memory_index; DROP TABLE IF EXISTS assistant_memory_compression_jobs; DROP TABLE IF EXISTS assistant_memory_revisions; DROP TABLE IF EXISTS assistant_memories; DELETE FROM schema_migrations WHERE version>=37; DROP TABLE IF EXISTS assistant_feedback; DROP TABLE IF EXISTS group_dialogue_preferences; DELETE FROM schema_migrations WHERE version=36; DROP TABLE IF EXISTS group_notices; DROP TABLE IF EXISTS group_governance_events; DROP TABLE IF EXISTS group_retired_agents; DELETE FROM schema_migrations WHERE version=35; DROP TABLE IF EXISTS personal_work_rule_revisions; DROP TABLE IF EXISTS personal_work_rules; DELETE FROM schema_migrations WHERE version=34; DROP TABLE team_library_repositories; DELETE FROM schema_migrations WHERE version=33')
 const before=s.db.prepare('SELECT count(*) n FROM members').get()
 migrate(s.db);migrate(s.db)
 expect(s.db.prepare('SELECT count(*) n FROM schema_migrations').get()!.n).toBe(39)
 expect(s.db.prepare('SELECT count(*) n FROM members').get()).toEqual(before)
 expect(s.db.prepare('PRAGMA table_list').all().filter((r:any)=>r.name==='team_library_repositories')[0]!.strict).toBe(1)
 expect(s.db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
})
