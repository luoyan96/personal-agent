import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MobileApi, type SessionStorage, type Transport, type WireRequest, type WireResponse } from '../src/api';
import { ChatController } from '../src/chat';
import { readConfig } from '../../../apps/api/src/config';
import { openDatabase, migrate, seed } from '../../../apps/api/src/database';
import { provisionTestAccounts } from '../../../apps/api/src/auth';
import { createServer } from '../../../apps/api/src/server';
import { ChatWorker } from '../../../apps/api/src/chat-worker';

const cleanup: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
const origin = 'https://mobile.synthetic.test';
const password = ' synthetic-password-with-spaces ';
function memoryStorage() {
  let value: string | null = null;
  const storage: SessionStorage = { read: async () => value, write: async v => { value = v; }, clear: async () => { value = null; } };
  return storage;
}
async function setup(enabled = true) {
  const dir = mkdtempSync(join(tmpdir(), 'acceptcat-mobile-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const credential = join(dir, 'synthetic.key'); writeFileSync(credential, randomBytes(32).toString('hex'), { mode: 0o600 });
  const config = readConfig({ NODE_ENV: 'test', DATABASE_PATH: join(dir, 'api.sqlite'), BLOB_ROOT: join(dir, 'blobs'),
    APP_ORIGIN: origin, B3_AI_ENABLED: enabled ? '1' : '0', LAB_CREDENTIAL_KEY_FILE: credential, PORT: '0' });
  mkdirSync(config.blobRoot);
  const db = openDatabase(config.databasePath, true); cleanup.push(() => db.close()); migrate(db); seed(db, 'test');
  await provisionTestAccounts(db, 'test', [{ memberId: 'member_A', username: 'mobile_A', password }, { memberId: 'member_B', username: 'mobile_B', password }]);
  db.prepare("INSERT INTO lab_managers(lab_id,member_id,granted_at) VALUES ('lab_synthetic','member_A',?)").run(new Date().toISOString());
  const app = createServer(config); cleanup.push(() => app.close());
  // Real local HTTP/socket + SQLite + production handlers. Only transport TLS
  // terminates in this test adapter; no test URL/provider is in the native app.
  const address = await app.listen({ host: '127.0.0.1', port: 0 });
  const requests: WireRequest[] = [];
  let dropNextSend = false;
  const transport: Transport = { async request(req, signal) {
    requests.push(req);
    const response = await fetch(address + new URL(req.url).pathname + new URL(req.url).search, {
      method: req.method, headers: req.headers, body: req.body, signal, redirect: 'manual',
    });
    const result = { status: response.status, body: await response.text(), cookies: response.headers.getSetCookie() };
    if (dropNextSend && req.url.endsWith('/agent-messages')) { dropNextSend = false; throw new Error('synthetic lost acknowledgement'); }
    return result;
  } };
  const storage = memoryStorage(), api = new MobileApi(origin, transport, storage, randomUUID);
  const actor = await api.login(' mobile_A ', password);
  if (enabled) await api.call('updateLabAiSettings', { params: { id: 'lab_synthetic' }, key: randomUUID(),
    body: { expectedVersion: 0, enabled: true, model: 'deepseek-flash', apiKey: 'sk-synthetic-mobile-not-a-real-key' } });
  const controller = new ChatController(api, randomUUID); cleanup.push(() => controller.dispose());
  await controller.open();
  return { db, config, api, actor, transport, storage, controller, requests, drop: () => { dropNextSend = true; } };
}
const syntheticReply = async () => ({ text: JSON.stringify({ answer: '这是一条明确标注的合成模型回复。', waitingInput: false, group: null, actions: [] }), failure: null, inputTokens: 20, outputTokens: 30, elapsedMs: 5 });

describe('mobile adapter against real AcceptCat HTTP handlers (synthetic accounts/models only)', () => {
  it('preserves password bytes, sends Cookie/Origin/CSRF, restores and revokes the session', async () => {
    const t = await setup();
    expect(t.actor.member.id).toBe('member_A');
    const restored = new MobileApi(origin, t.transport, t.storage, randomUUID);
    expect((await restored.restore())?.member.id).toBe('member_A');
    const request = t.requests.find(r => r.url.endsWith('/chat/personal-conversation'))!;
    expect(request.headers.Cookie).toMatch(/^rap_session=[a-f0-9]{64}$/);
    expect(request.headers.Origin).toBe(origin);
    expect(request.headers['X-CSRF-Token']).toMatch(/^[a-f0-9]{64}$/);
    expect(request.headers.Authorization).toBeUndefined();
    const retiredStorage = memoryStorage(); await retiredStorage.write((await t.storage.read())!);
    const retired = new MobileApi(origin, t.transport, retiredStorage, randomUUID);
    expect(await t.api.logout()).toBe(true);
    expect(await t.storage.read()).toBeNull();
    expect(await retired.restore()).toBeNull();
    expect(await retiredStorage.read()).toBeNull();
  });
  it('rotates the previous mobile cookie on another login without affecting other sessions', async () => {
    const t = await setup(), retiredStorage = memoryStorage(); await retiredStorage.write((await t.storage.read())!);
    const separateStorage = memoryStorage(), separate = new MobileApi(origin, t.transport, separateStorage, randomUUID);
    await separate.login('mobile_A', password);
    await t.api.login('mobile_B', password);
    const retired = new MobileApi(origin, t.transport, retiredStorage, randomUUID);
    expect(await retired.restore()).toBeNull();
    expect((await separate.call('session')).data.member.id).toBe('member_A');
    expect((await t.api.call('session')).data.member.id).toBe('member_B');
  });
  it('persists a send before a lost response and exact retry does not duplicate message or model turn', async () => {
    const t = await setup(); t.drop();
    await t.controller.send('合成测试问题');
    expect(t.controller.getSnapshot().intent?.error).toBeTruthy();
    const key = t.controller.getSnapshot().intent?.key;
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM chat_turns').get()?.n).toBe(1);
    await t.controller.send();
    expect(t.controller.getSnapshot().intent).toBeUndefined();
    expect(t.controller.getSnapshot().messages.filter(m => m.origin === 'human')).toHaveLength(1);
    expect(t.requests.filter(r => r.url.endsWith('/agent-messages')).map(r => r.headers['Idempotency-Key'])).toEqual([key, key]);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM chat_turns').get()?.n).toBe(1);
  });
  it('receives the canonical reply, follows up and finds the same personal conversation after restart', async () => {
    const t = await setup();
    await t.controller.send('合成普通问题');
    expect(Object.values(t.controller.getSnapshot().turns)[0]?.status).toBe('queued');
    expect(await new ChatWorker(t.db, t.config, syntheticReply).tick()).toBe(true);
    await t.controller.refresh();
    expect(t.controller.getSnapshot().messages.some(m => m.origin === 'model' && m.text?.includes('合成模型回复'))).toBe(true);
    expect(Object.values(t.controller.getSnapshot().turns)[0]?.status).toBe('succeeded');
    await t.controller.send('合成追问');
    await new ChatWorker(t.db, t.config, syntheticReply).tick(); await t.controller.refresh();
    const restarted = new ChatController(t.api, randomUUID); cleanup.push(() => restarted.dispose()); await restarted.open();
    expect(restarted.getSnapshot().conversation?.id).toBe(t.controller.getSnapshot().conversation?.id);
    expect(restarted.getSnapshot().messages.filter(m => m.origin === 'model')).toHaveLength(2);
  });
  it('reports real model-unavailable state and does not fabricate an answer', async () => {
    const t = await setup(false); await t.controller.send('合成无模型请求');
    expect(Object.values(t.controller.getSnapshot().turns)[0]?.status).toBe('unavailable');
    expect(t.controller.getSnapshot().messages.every(m => m.origin !== 'model')).toBe(true);
  });
  it('clears an expired session and cannot read another account conversation', async () => {
    const t = await setup(); const conversation = t.controller.getSnapshot().conversation!.id;
    await t.api.logout(); await t.api.login('mobile_B', password);
    await expect(t.api.call('chatMessages', { params: { id: conversation } })).rejects.toMatchObject({ status: 404 });
    let expired = false; t.api.onExpired = () => { expired = true; };
    t.db.prepare("UPDATE sessions SET revoked_at=?").run(new Date().toISOString());
    await expect(t.api.call('session')).rejects.toMatchObject({ status: 401 });
    expect(expired).toBe(true); expect(await t.storage.read()).toBeNull();
  });
  it('requires explicit model retry and uses only the remaining server budget', async () => {
    const t = await setup(); await t.controller.send('合成普通问题');
    await new ChatWorker(t.db, t.config, async () => ({ text: '', failure: 'MODEL_FAILED', inputTokens: 20, outputTokens: 0, elapsedMs: 5 })).tick();
    await t.controller.refresh();
    const turn = Object.values(t.controller.getSnapshot().turns)[0]!;
    expect(turn.status).toBe('failed'); expect(turn.allowedActions).toContain('retry');
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM chat_turns').get()?.n).toBe(1);
    await t.controller.retryTurn(turn);
    expect(t.db.prepare('SELECT COUNT(*) AS n FROM chat_turns').get()?.n).toBe(2);
    const req = t.requests.find(r => r.url.endsWith('/retry'))!;
    expect(JSON.parse(req.body!).budget).toEqual(turn.remainingBudget);
  });
  it('loads the latest history window, older messages and a backlog larger than one page', async () => {
    const t = await setup(false), id = t.controller.getSnapshot().conversation!.id;
    for (let i = 0; i < 105; i++) await t.api.call('agentChatMessage', { params: { id }, body: { text: `合成历史 ${i}` }, key: randomUUID() });
    await t.controller.refresh();
    expect(t.controller.getSnapshot().messages).toHaveLength(105);
    const restarted = new ChatController(t.api, randomUUID); cleanup.push(() => restarted.dispose()); await restarted.open();
    expect(restarted.getSnapshot().messages).toHaveLength(100);
    expect(restarted.getSnapshot().messages[0]?.sequence).toBe(6);
    await restarted.refresh(false, true);
    expect(restarted.getSnapshot().messages).toHaveLength(105);
    expect(restarted.getSnapshot().messages[0]?.sequence).toBe(1);
  }, 15000);
});

describe('session concurrency and transport boundaries', () => {
  it('rejects non-HTTPS and credential-bearing service origins', () => {
    const transport: Transport = { request: async () => { throw new Error(); } };
    for (const value of ['http://example.test', 'https://user:password@example.test', 'https://example.test/path'])
      expect(() => new MobileApi(value, transport, memoryStorage(), randomUUID)).toThrow();
  });
  it('does not persist a delayed login after sign-out, even when native cancellation arrives late', async () => {
    const t = await setup();
    let release!: () => void, reached!: () => void;
    const gate = new Promise<void>(r => { release = r; }), entered = new Promise<void>(r => { reached = r; });
    const delayed: Transport = { async request(req) {
      const result = await t.transport.request(req, new AbortController().signal);
      if (req.url.endsWith('/auth/login')) { reached(); await gate; }
      return result;
    } };
    const storage = memoryStorage(), api = new MobileApi(origin, delayed, storage, randomUUID);
    const login = api.login('mobile_A', password); const assertion = expect(login).rejects.toMatchObject({ code: 'STALE_SESSION' });
    await entered; await api.logout(); release(); await assertion;
    expect(await storage.read()).toBeNull();
  });
  it('keeps a saved session on network failure and refuses a saved session for a different origin', async () => {
    const t = await setup(), saved = await t.storage.read();
    const offline = new MobileApi(origin, { request: async () => { throw new Error('offline'); } }, t.storage, randomUUID);
    await expect(offline.restore()).rejects.toMatchObject({ code: 'NETWORK_ERROR' }); expect(await t.storage.read()).toBe(saved);
    const other = new MobileApi('https://other.synthetic.test', t.transport, t.storage, randomUUID);
    expect(await other.restore()).toBeNull(); expect(await t.storage.read()).toBeNull();
  });
  it('blocks stale chat results after disposal', async () => {
    const t = await setup();
    let release!: (v: WireResponse) => void, reached!: () => void;
    const entered = new Promise<void>(r => { reached = r; });
    const transport: Transport = { async request(req, signal) {
      const result = await t.transport.request(req, signal);
      if (req.url.endsWith('/agent-messages')) { reached(); return new Promise(r => { release = r; }).then(() => result); }
      return result;
    } };
    const api = new MobileApi(origin, transport, t.storage, randomUUID); await api.restore();
    const chat = new ChatController(api, randomUUID); await chat.open();
    const send = chat.send('合成迟到响应'); await entered; chat.dispose(); const before = chat.getSnapshot();
    release({ status: 200, body: '{}', cookies: [] }); await send;
    expect(chat.getSnapshot()).toBe(before);
  });
});
