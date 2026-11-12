import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readWeChatArchive, parseTranscript, archivePreview, LIMITS } from '../../electron/wechat-import/archive.mjs';
import { makeZip, text } from './fixtures.mjs';

async function archive(t, files) {
  const root = await mkdtemp(path.join(tmpdir(), 'wechat-import-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const file = path.join(root, '聊天记录.zip');
  await writeFile(file, makeZip(files));
  return file;
}

test('preserves original bytes and exported message order without guessing timezone or identities', async t => {
  const body = '\uFEFF' + text.replace(/\n/g, '\r\n') + '·同学\r\n2026年11月12日 16:29\r\n收到\r\n';
  const file = await archive(t, [{ name: '聊天记录.txt', text: body }, { name: '附件/说明.txt', text: '资料正文' }]);
  const result = await readWeChatArchive(file);
  assert.equal(result.rawText, body.slice(1));
  assert.deepEqual(result.messages.map(item => item.sender), ['我', '同学']);
  assert.equal(result.messages[0].exportedTime, '2026年11月12日 16:30');
  assert.equal(result.attachments[0].bytes.toString(), '资料正文');
  assert.equal(result.attachments[0].name, '附件/说明.txt');
  assert.equal(archivePreview(result).attachments[0].bytes, undefined);
  assert.equal(result.sha256.length, 64);
});

test('future transcript and attachment-only archives remain readable', async t => {
  const result = await readWeChatArchive(await archive(t, [{ name: '聊天记录.txt', text: '未来版本\n正文' }]));
  assert.equal(result.messages, null);
  assert.equal(result.rawText, '未来版本\n正文');
  const onlyAttachment = await readWeChatArchive(await archive(t, [{ name: '照片.png', text: 'sample' }]));
  assert.equal(onlyAttachment.rawText, null);
  assert.equal(onlyAttachment.attachments.length, 1);
});

test('ambiguous transcripts stay as separate files', async t => {
  const result = await readWeChatArchive(await archive(t, [
    { name: 'a/聊天记录.txt', text }, { name: 'b/聊天记录.txt', text },
  ]));
  assert.equal(result.rawText, null);
  assert.equal(result.attachments.length, 2);
});

test('invalid exported dates do not become invented message timestamps', () => {
  assert.equal(parseTranscript(text.replace('11月12日', '2月30日')), null);
  assert.equal(parseTranscript(text.replace('16:30', '24:30')), null);
  assert.equal(parseTranscript('preamble\n' + text), null);
});

for (const [name, files] of Object.entries({
  traversal: [{ name: '../other.txt', text }],
  windowsPath: [{ name: 'C:\\other.txt', text }],
  duplicate: [{ name: 'A.txt', text }, { name: 'a.txt', text }],
  symlink: [{ name: 'link.txt', text, attributes: 0xa0000000 }],
  encrypted: [{ name: '聊天记录.txt', text, flags: 0x801 }],
  crc: [{ name: '聊天记录.txt', text, crc: 123 }],
  inflatedSize: [{ name: '聊天记录.txt', text, size: 1 }],
  oversized: [{ name: '聊天记录.txt', text, size: LIMITS.entryBytes + 1 }],
  empty: [],
})) {
  test(`rejects ${name} archive atomically`, async t => {
    await assert.rejects(readWeChatArchive(await archive(t, files)));
  });
}
