import { open } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import yauzl from 'yauzl';
import crc32 from 'buffer-crc32';

export const LIMITS = Object.freeze({
  archiveBytes: 64 * 1024 * 1024,
  expandedBytes: 128 * 1024 * 1024,
  entryBytes: 32 * 1024 * 1024,
  textBytes: 16 * 1024 * 1024,
  entries: 2000,
});

/** Preserve exported wall-clock time. The ZIP provides no timezone or stable sender ID. */
export function parseTranscript(rawText) {
  const text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const header = /^·([^\n]+)\n(\d{4})年(\d{1,2})月(\d{1,2})日 (\d{2}):(\d{2})\n/gm;
  const matches = [...text.matchAll(header)];
  if (!matches.length || matches[0].index !== 0) return null;
  const messages = [];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const [year, month, day, hour, minute] = match.slice(2).map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(hour, minute, 0, 0);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute) {
      return null;
    }
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    messages.push({
      index,
      sender: match[1],
      exportedTime: match[0].split('\n')[1],
      text: text.slice(start, end).replace(/\n+$/, ''),
    });
  }
  return messages;
}

function validatePath(name, externalAttributes) {
  const parts = name.replace(/\/$/, '').split('/');
  if (!name || /[\\:\x00-\x1f\x7f]/.test(name) || parts.some(part =>
    !part || part === '.' || part === '..' || /[ .]$/.test(part) ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new Error('分享包包含无效文件路径。');
  }
  const type = (externalAttributes >>> 16) & 0xf000;
  const expectedType = name.endsWith('/') ? 0x4000 : 0x8000;
  if (type !== 0 && type !== expectedType) throw new Error('分享包包含链接或特殊文件。');
}

async function readEntry(zip, entry) {
  const stream = await new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, value) => error ? reject(error) : resolve(value));
  });
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.length;
    if (size > entry.uncompressedSize || size > LIMITS.entryBytes) {
      stream.destroy();
      throw new Error('分享包解压大小超过上限。');
    }
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  if (size !== entry.uncompressedSize || crc32.unsigned(bytes) !== entry.crc32) {
    throw new Error('分享包校验失败，文件可能损坏。');
  }
  return bytes;
}

async function readEntries(bytes) {
  const zip = await new Promise((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true },
      (error, value) => error ? reject(error) : resolve(value));
  });
  try {
    const entries = [];
    let total = 0;
    const paths = new Map();
    // Attach error handling before asking the lazy reader for any entries.
    await new Promise((resolve, reject) => {
      zip.on('error', reject);
      zip.on('end', resolve);
      zip.on('entry', entry => {
        (async () => {
          if (entries.length >= LIMITS.entries || entry.uncompressedSize > LIMITS.entryBytes ||
              ![0, 8].includes(entry.compressionMethod) || (entry.generalPurposeBitFlag & 1)) {
            throw new Error('分享包包含过多、过大、加密或不支持的文件。');
          }
          validatePath(entry.fileName, entry.externalFileAttributes);
          if (entry.fileName.endsWith('/') && entry.uncompressedSize !== 0) {
            throw new Error('分享包目录包含异常数据。');
          }
          const key = entry.fileName.replace(/\/$/, '').normalize('NFC').toLowerCase();
          if (paths.has(key)) throw new Error('分享包包含重复文件路径。');
          paths.set(key, entry.fileName.endsWith('/'));
          total += entry.uncompressedSize;
          if (total > LIMITS.expandedBytes) throw new Error('分享包解压总量超过上限。');
          const data = await readEntry(zip, entry);
          entries.push({ id: String(entries.length), name: entry.fileName, bytes: data });
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
    return entries.filter(entry => !entry.name.endsWith('/'));
  } finally {
    zip.close();
  }
}

async function snapshot(filePath) {
  const handle = await open(filePath, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > LIMITS.archiveBytes) throw new Error('请选择64 MiB以内的微信ZIP分享包。');
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const result = await handle.read(bytes, length, bytes.length - length, length);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    const after = await handle.stat();
    if (length !== info.size || after.size !== info.size || after.mtimeMs !== info.mtimeMs) {
      throw new Error('分享包读取时发生变化，请重新导入。');
    }
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

/** Read only the explicitly selected file. Never extract, upload or follow links. */
export async function readWeChatArchive(filePath) {
  if (typeof filePath !== 'string' || path.extname(filePath).toLowerCase() !== '.zip') {
    throw new Error('请选择微信导出的ZIP分享包。');
  }
  const originalBytes = await snapshot(filePath);
  const entries = await readEntries(originalBytes);
  if (!entries.length) throw new Error('分享包为空。');
  const texts = [];
  for (const entry of entries) {
    if (!/\.txt$/i.test(entry.name) || entry.bytes.length > LIMITS.textBytes) continue;
    try {
      const rawText = new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes);
      texts.push({ entry, rawText, messages: parseTranscript(rawText) });
    } catch {
      // A non-UTF-8 attachment stays available as its original bytes.
    }
  }
  const named = texts.filter(text => path.posix.basename(text.entry.name) === '聊天记录.txt');
  const recognized = texts.filter(text => text.messages);
  const candidates = named.length ? named : recognized;
  const transcript = candidates.length === 1 ? candidates[0] : null;
  const warnings = [];
  if (!transcript) warnings.push('未能确定唯一聊天正文，请预览附件或原始ZIP。');
  if (transcript && !transcript.messages) warnings.push('正文格式暂未识别，已保留原文。');
  if (transcript?.messages) warnings.push('发言人和时间按导出文本解析，原文已保留供核对。');
  const attachments = entries.filter(entry => entry !== transcript?.entry);
  return {
    source: 'wechat-share',
    sha256: createHash('sha256').update(originalBytes).digest('hex'),
    archiveName: path.basename(filePath),
    originalBytes,
    transcriptName: transcript?.entry.name ?? null,
    rawText: transcript?.rawText ?? null,
    messages: transcript?.messages ?? null,
    attachments,
    warnings,
  };
}

export function archivePreview(archive) {
  return {
    source: archive.source,
    sha256: archive.sha256,
    archiveName: archive.archiveName,
    originalSize: archive.originalBytes.length,
    transcriptName: archive.transcriptName,
    rawText: archive.rawText,
    messages: archive.messages,
    attachments: archive.attachments.map(({ id, name, bytes }) => ({ id, name, size: bytes.length })),
    warnings: archive.warnings,
  };
}
