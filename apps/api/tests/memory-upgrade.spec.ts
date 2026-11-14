import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { checkDatabase, migrate, openDatabase, seed } from '../src/database.js'
import { currentHabit, preferenceTopic } from '../src/feedback-queue.js'

it('upgrades the deployed 036 schema twice without losing habits, revocations, owners, learning settings or queued feedback', () => {
  const folder = mkdtempSync(join(tmpdir(), 'assistant-upgrade-036-'))
  const filename = join(folder, 'research.sqlite')
  let db = openDatabase(filename, true)
  try {
    db.exec('PRAGMA foreign_keys=OFF; CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL) STRICT')
    const migrationRoot = new URL('../migrations/', import.meta.url)
    const oldFiles = readdirSync(migrationRoot).filter(name => /^\d{3}-/.test(name) && Number(name.slice(0, 3)) <= 36).sort()
    expect(oldFiles).toHaveLength(36)
    for (const name of oldFiles) {
      const sql = readFileSync(new URL(name, migrationRoot), 'utf8')
      const checksum = createHash('sha256').update(sql).digest('hex')
      db.exec(sql)
      db.prepare('INSERT INTO schema_migrations VALUES(?,?,?)').run(Number(name.slice(0, 3)), checksum, '2026-11-14T01:07:26Z')
    }
    expect(db.prepare('SELECT checksum FROM schema_migrations WHERE version=36').get()!.checksum).toBe('d79a7e934d65e7ee3f32c547e8c5d0886f6f331b72a582abbe912af310a73eda')
    db.exec('PRAGMA foreign_keys=ON')
    seed(db, 'test')
    const at = '2026-11-14T02:00:00Z'
    db.prepare('INSERT INTO runtime_meta VALUES (?,?)').run('signing_key', Buffer.alloc(32, 7).toString('hex'))
    db.prepare('INSERT INTO personal_memory_settings VALUES(?,?,?,?,?)').run('member_A', 1, 'Asia/Shanghai', '{"start":"23:00","end":"07:00"}', 7)
    db.prepare('INSERT INTO personal_memory_settings VALUES(?,?,?,?,?)').run('member_B', 0, 'UTC', null, 3)
    for (const [id, owner, status, content] of [['habit_A', 'member_A', 'confirmed', '先列证据，再讲判断。'], ['habit_B', 'member_B', 'revoked', '已撤回的习惯不能重新生成。']] as const) {
      db.prepare('INSERT INTO personal_memories VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, owner, preferenceTopic, 'general', status, 'feedback', null, content, 4, at, at)
      db.prepare('INSERT INTO personal_memory_revisions VALUES(?,?,?,?)').run(id, 4, JSON.stringify({ id, owner, status, content, version: 4 }), at)
    }
    db.prepare('INSERT INTO chat_contacts VALUES(?,?,?,?,?)').run('agent_old', 'lab_synthetic', 'personal_agent', 'member_A', 'old_assistant')
    for (const [id, status, content] of [['agent_active', 'active', '本助理回复先给结论。'], ['agent_revoked', 'revoked', '这条私人习惯已被撤回。']] as const) {
      db.prepare('INSERT INTO chat_memories VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, 'lab_synthetic', 'private_agent', 'agent_old', 'member_A', status, 3, content, '聊天中形成的习惯：合成证据', at, at)
      db.prepare('INSERT INTO chat_memory_revisions VALUES(?,?,?)').run(id, 3, JSON.stringify({ id, scopeId: 'agent_old', status, content, version: 3 }))
    }
    db.prepare('INSERT INTO chat_conversations VALUES(?,?,?,?,?,?)').run('group_old', 'lab_synthetic', 'member_A', 'group', null, '{"id":"group_old"}')
    db.prepare('INSERT INTO group_dialogue_preferences VALUES(?,?,?)').run('member_A', 'group_old', '组内讨论先列取舍。')
    db.prepare('INSERT INTO assistant_feedback(member_id,lab_id,scope,kind,source_id,available_at,attempts) VALUES(?,?,?,?,?,?,?)').run('member_A', 'lab_synthetic', '', 'planning', 'planning_old', 123456, 2)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT IN ('schema_migrations') AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(row => String(row.name))
    const snapshot = () => Object.fromEntries(tables.map(name => [name, createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM "${name}" ORDER BY rowid`).all())).digest('hex')]))
    const before = snapshot()
    const history = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all()
    migrate(db)
    migrate(db)
    checkDatabase(db)
    expect(snapshot()).toEqual(before)
    expect(db.prepare('SELECT * FROM schema_migrations WHERE version<=36 ORDER BY version').all()).toEqual(history)
    expect(db.prepare('SELECT max(version) version FROM schema_migrations').get()!.version).toBe(39)
    expect(db.prepare('SELECT count(*) n FROM assistant_memories').get()!.n).toBe(0)
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name='assistant_memory_settings'").get()).toBeUndefined()
    expect(currentHabit(db, 'member_A')).toMatchObject({ content: '先列证据，再讲判断。', revoked: false, version: 4 })
    expect(currentHabit(db, 'member_B')).toMatchObject({ content: '', revoked: true, version: 4 })
    expect(currentHabit(db, 'member_A', 'group_old').content).toBe('组内讨论先列取舍。')
    expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([])
    expect(db.prepare('PRAGMA foreign_keys').get()!.foreign_keys).toBe(1)
    db.close()
    db = openDatabase(filename)
    expect(snapshot()).toEqual(before)
    checkDatabase(db)
  } finally {
    db.close()
    rmSync(folder, { recursive: true, force: true })
  }
}, 20000)
