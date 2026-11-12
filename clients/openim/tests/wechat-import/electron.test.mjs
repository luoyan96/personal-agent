import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { registerWeChatImport, CHANNELS } from '../../electron/wechat-import/electron.mjs';
import { prepareWeChatDraft } from '../../electron/wechat-import/composer.mjs';
import { makeZip, text } from './fixtures.mjs';

async function setup(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'wechat-import-ipc-'));
  const file = path.join(root, '聊天记录.zip');
  await writeFile(file, makeZip([{ name: '聊天记录.txt', text }, { name: '资料.txt', text: 'data' }]));
  const handlers = new Map();
  let owner = 'account1:conversation1';
  const dialog = { showOpenDialog: async () => ({ canceled: false, filePaths: [file] }) };
  const dispose = registerWeChatImport({
    ipcMain: { handle: (name, fn) => handlers.set(name, fn), removeHandler: name => handlers.delete(name) },
    dialog,
    authorize: () => owner,
    getWindow: () => ({ isDestroyed: () => false }),
  });
  t.after(async () => { dispose(); await rm(root, { recursive: true, force: true }); });
  const client = {
    choose: scope => handlers.get(CHANNELS.choose)({}, scope),
    read: (scope, token, id) => handlers.get(CHANNELS.read)({}, scope, token, id),
    release: (scope, token) => handlers.get(CHANNELS.release)({}, scope, token),
  };
  return { client, dialog, switchOwner: value => { owner = value; } };
}

test('local preview becomes a draft with selected attachments, then releases its bytes', async t => {
  const { client } = await setup(t);
  const preview = await client.choose('conversation1');
  assert.equal(preview.originalBytes, undefined);
  const draft = await prepareWeChatDraft({ client, scope: 'conversation1', preview,
    attachmentIds: [preview.attachments[0].id], isCurrentScope: () => true });
  assert.equal(draft.text, text);
  assert.equal(await draft.files[0].text(), 'data');
  await client.release('conversation1', preview.token);
  await assert.rejects(() => client.read('conversation1', preview.token, 'original'));
});

test('switching accounts or conversations revokes access to staged bytes', async t => {
  const { client, switchOwner } = await setup(t);
  const preview = await client.choose('conversation1');
  switchOwner('account2:conversation2');
  await assert.rejects(() => client.read('conversation2', preview.token, 'original'));
});

test('a conversation change during the picker discards the import', async t => {
  const { client, dialog, switchOwner } = await setup(t);
  const original = dialog.showOpenDialog;
  dialog.showOpenDialog = async () => { switchOwner('other'); return original(); };
  await assert.rejects(client.choose('conversation1'), /会话已变化/);
});

test('a duplicate import replaces the old preview token', async t => {
  const { client } = await setup(t);
  const first = await client.choose('conversation1');
  const second = await client.choose('conversation1');
  assert.equal(first.sha256, second.sha256);
  await assert.rejects(() => client.read('conversation1', first.token, 'original'));
  assert.ok((await client.read('conversation1', second.token, 'original')).length);
});

test('changed renderer conversation cannot receive the prepared draft', async t => {
  const { client } = await setup(t);
  const preview = await client.choose('conversation1');
  let checks = 0;
  await assert.rejects(prepareWeChatDraft({ client, scope: 'conversation1', preview,
    attachmentIds: [preview.attachments[0].id], isCurrentScope: () => ++checks === 1 }), /会话已变化/);
});
