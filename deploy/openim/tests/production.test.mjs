import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, lstatSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { prepareProduction } from '../prepare-production.mjs';
import { beforeCallbacks, afterCallbacks } from '../runtime-config.mjs';

const origin = 'https://chat.synthetic.test';
const options = runtime => ({ runtime, origin, fileOrigin: 'https://files.chat.synthetic.test' });
const repository = resolve(import.meta.dirname, '../../..');

test('production preparation refuses existing/synthetic data and preserves independent secrets on retry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rap-im-production-'));
  try {
    const used = join(dir, 'used'); mkdirSync(used); writeFileSync(join(used, 'platform.sqlite'), 'do not touch');
    assert.throws(() => prepareProduction(options(used)), /NONEMPTY_RUNTIME_REFUSED/);
    assert.equal(readFileSync(join(used, 'platform.sqlite'), 'utf8'), 'do not touch');
    const runtime = join(dir, 'fresh');
    assert.throws(() => prepareProduction({ ...options(runtime), origin: 'http://chat.synthetic.test' }), /INVALID_PUBLIC_ADDRESS/);
    prepareProduction(options(runtime));
    const names = ['im-admin.secret', 'im-callback.key', 'lab-credentials.key', 'mongo.secret', 'redis.secret', 'minio.secret'];
    const first = names.map(name => readFileSync(join(runtime, name), 'utf8'));
    assert.equal(new Set(first).size, names.length);
    prepareProduction(options(runtime));
    assert.deepEqual(names.map(name => readFileSync(join(runtime, name), 'utf8')), first);
    if (process.platform !== 'win32') {
      assert.equal(lstatSync(runtime).mode & 0o077, 0);
      for (const name of [...names, 'production.json', 'compose.env', 'webhooks.yml']) assert.equal(lstatSync(join(runtime, name)).mode & 0o077, 0);
    }
    const hooks = readFileSync(join(runtime, 'webhooks.yml'), 'utf8');
    for (const name of beforeCallbacks) assert.ok(hooks.includes(`${name}:\n  enable: true\n  timeout: 5\n  failedContinue: false`));
    for (const name of afterCallbacks) assert.ok(hooks.includes(`${name}:\n  enable: true`));
    assert.throws(() => prepareProduction({ ...options(runtime), fileOrigin: 'https://changed.synthetic.test' }), /CONFIGURATION_CONFLICT/);
    unlinkSync(join(runtime, 'lab-credentials.key'));
    assert.throws(() => prepareProduction(options(runtime)), /MISSING_EXISTING_PRODUCTION_SECRET/);
    writeFileSync(join(runtime, 'lab-credentials.key'), first[2], { mode: 0o600 });
    writeFileSync(join(runtime, 'research/accounts.json'), '[]');
    assert.throws(() => prepareProduction(options(runtime)), /SYNTHETIC_RUNTIME_REFUSED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('real production CLI and HTTP: explicit 017 migration, private bootstrap, one-use manager, Origin/CSRF, restart and IM unavailable', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'rap-im-production-cli-'));
  let child;
  try {
    prepareProduction(options(dir));
    const databasePath = join(dir, 'research/platform.sqlite');
    const env = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '0',
      APP_ORIGIN: origin, DATABASE_PATH: databasePath, BLOB_ROOT: join(dir, 'research/blobs'),
      LAB_CREDENTIAL_KEY_FILE: join(dir, 'lab-credentials.key'),
      OPENIM_SECRET_FILE: join(dir, 'im-admin.secret'), OPENIM_CALLBACK_KEY_FILE: join(dir, 'im-callback.key'),
      OPENIM_API_URL: 'http://127.0.0.1:1', OPENIM_PUBLIC_API_URL: `${origin}/im-api`,
      OPENIM_PUBLIC_WS_URL: 'wss://chat.synthetic.test/im-ws', OPENIM_POLICY_ENFORCED: '1',
      RAP_PRIVATE_SECRET_DIR: join(dir, 'private-secrets'), OPERATOR_ID: 'production_synthetic_qa', B3_AI_ENABLED: '1' };
    const entry = resolve(repository, 'deploy/openim/run-production.mjs');
    const run = (command, extra = {}) => spawnSync(process.execPath, [entry, command], {
      cwd: repository, env: { ...env, ...extra }, encoding: 'utf8', windowsHide: true,
    });
    assert.equal(run('api', { NODE_ENV: 'test' }).status, 1);
    assert.equal(run('migrate').status, 0); assert.equal(run('migrate').status, 0);
    let db = new DatabaseSync(databasePath);
    assert.equal(db.prepare('SELECT max(version) v FROM schema_migrations').get().v, 17);
    assert.equal(db.prepare('SELECT count(*) n FROM members').get().n, 0);
    assert.equal(db.prepare('SELECT count(*) n FROM labs').get().n, 0); db.close();
    const first = run('bootstrap'); assert.equal(first.status, 0, first.stderr);
    const inviteFile = join(dir, 'research/bootstrap/lab_ifrc.json');
    const record = JSON.parse(readFileSync(inviteFile, 'utf8'));
    assert.ok(!first.stdout.includes(record.inviteCode)); assert.ok(!first.stderr.includes(record.inviteCode));
    assert.equal(run('bootstrap').status, 0);
    assert.equal(readFileSync(inviteFile, 'utf8').includes(record.inviteCode), true);
    if (process.platform !== 'win32') assert.equal(lstatSync(inviteFile).mode & 0o077, 0);
    const qa = run('bootstrap', { BOOTSTRAP_LAB_ID: 'lab_qa', BOOTSTRAP_LAB_NAME: 'Synthetic release QA' });
    assert.equal(qa.status, 0, qa.stderr);
    const qaRecord = JSON.parse(readFileSync(join(dir, 'research/bootstrap/lab_qa.json'), 'utf8'));
    assert.notEqual(qaRecord.inviteCode, record.inviteCode);
    const probe = run('check'); assert.equal(probe.status, 0, probe.stderr);
    const checked = JSON.parse(probe.stdout); assert.equal(checked.imTransport, 'not_verified'); assert.equal(checked.harness, 'not_verified');
    async function start() {
      child = spawn(process.execPath, [entry, 'api'], { cwd: repository, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      return await new Promise((resolveAddress, reject) => {
        let out = ''; const timer = setTimeout(() => reject(new Error('API start timeout')), 10000);
        child.stdout.on('data', chunk => { out += chunk; const match = out.match(/API listening (http:\/\/127\.0\.0\.1:\d+);/);
          if (match) { clearTimeout(timer); resolveAddress(match[1]); } });
        child.once('error', error => { clearTimeout(timer); reject(error); });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`API exited ${code}`)); });
      });
    }
    async function stop() {
      if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
      child = undefined;
    }
    let address = await start();
    assert.equal((await fetch(`${address}/api/v1/health/ready`)).status, 200);
    const post = (url, body, headers = {}) => fetch(`${address}${url}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });
    const password = 'NinePass9';
    const registration = { inviteCode: record.inviteCode, username: 'synthetic_manager', password, displayName: 'Synthetic manager' };
    assert.equal((await post('/api/v1/auth/register', registration, { origin: 'https://wrong.test', 'idempotency-key': randomUUID() })).status, 403);
    assert.equal((await post('/api/v1/auth/register', registration, { 'idempotency-key': randomUUID() })).status, 201);
    assert.equal((await post('/api/v1/auth/register', { ...registration, username: 'second' }, { 'idempotency-key': randomUUID() })).status, 400);
    const login = await post('/api/v1/auth/login', { username: registration.username, password });
    assert.equal(login.status, 200); const cookie = login.headers.get('set-cookie').split(';')[0];
    assert.ok(login.headers.get('set-cookie').includes('Secure'));
    const session = await fetch(`${address}/api/v1/auth/session`, { headers: { cookie } });
    assert.equal(session.status, 200); const actor = (await session.json()).data;
    assert.equal(actor.isLabManager, true); assert.equal(actor.member.labId, 'lab_ifrc');
    assert.equal((await post('/api/v1/im/session', { platformID: 5 }, { cookie })).status, 403);
    const unavailable = await post('/api/v1/im/session', { platformID: 5 }, { cookie, 'x-csrf-token': actor.csrfToken });
    assert.equal(unavailable.status, 200); const im = (await unavailable.json()).data;
    assert.equal(im.status, 'unavailable'); assert.equal(im.user, null); assert.equal(im.reason, 'backend_unreachable');
    const qaSettings = await fetch(`${address}/api/v1/labs/lab_qa/ai-settings`, { headers: { cookie } });
    assert.equal(qaSettings.status, 404);
    await stop();
    const afterUse = run('bootstrap'); assert.equal(afterUse.status, 0, afterUse.stderr); assert.ok(afterUse.stdout.includes('used'));
    address = await start();
    assert.equal((await fetch(`${address}/api/v1/auth/session`, { headers: { cookie } })).status, 200);
    await stop();
    db = new DatabaseSync(databasePath);
    assert.equal(db.prepare('SELECT count(*) n FROM members').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) n FROM auth_accounts').get().n, 1);
    assert.equal(db.prepare('SELECT bootstrap_manager,max_uses,used_count FROM registration_invites WHERE id=?').get(record.inviteId).used_count, 1);
    const stored = JSON.stringify({ invites: db.prepare('SELECT * FROM registration_invites').all(), audit: db.prepare('SELECT * FROM maintenance_audit').all(), auth: db.prepare('SELECT * FROM auth_accounts').all() });
    assert.ok(!stored.includes(record.inviteCode)); assert.ok(!stored.includes(password)); db.close();
  } finally {
    if (child?.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
    rmSync(dir, { recursive: true, force: true });
  }
});
