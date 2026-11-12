import { randomUUID } from 'node:crypto';
import { archivePreview, readWeChatArchive } from './archive.mjs';
import { CHANNELS } from './channels.mjs';
export { CHANNELS } from './channels.mjs';

/** authorize must check the trusted main frame, account and conversation, returning a stable owner key. */
export function registerWeChatImport({ ipcMain, dialog, authorize, getWindow, selectArchive }) {
  const staged = new Map();
  const busy = new Set();
  let disposed = false;
  const ttl = 15 * 60 * 1000;
  async function ownerFor(event, scope) {
    if (disposed) throw new Error('导入服务已关闭。');
    const owner = await authorize(event, scope);
    if (typeof owner !== 'string' || !owner) throw new Error('当前会话无导入权限。');
    return owner;
  }
  function prune() {
    for (const [token, entry] of staged) if (entry.expires <= Date.now()) staged.delete(token);
  }
  const timer = setInterval(prune, 60000);
  timer.unref();
  ipcMain.handle(CHANNELS.choose, async (event, scope, batchId) => {
    const owner = await ownerFor(event, scope);
    if (busy.has(owner)) throw new Error('正在导入，请稍候。');
    busy.add(owner);
    try {
      const window = getWindow(event);
      if (!window || window.isDestroyed()) throw new Error('聊天窗口已关闭。');
      const selected = selectArchive ? await selectArchive(event, scope, batchId, window) : await dialog.showOpenDialog(window, {
        title: '导入微信分享包',
        filters: [{ name: '微信聊天分享包', extensions: ['zip'] }],
        properties: ['openFile'],
      });
      if (await ownerFor(event, scope) !== owner) throw new Error('会话已变化，请重新导入。');
      if (selected.canceled || selected.filePaths.length !== 1) return null;
      const archive = await readWeChatArchive(selected.filePaths[0]);
      if (selected.displayName) archive.archiveName = selected.displayName;
      if (await ownerFor(event, scope) !== owner) throw new Error('会话已变化，请重新导入。');
      prune();
      const others = [...staged.values()].filter(entry => entry.owner !== owner);
      if (others.length >= 4) throw new Error('待处理导入过多，请先关闭其他导入预览。');
      const retainedBytes = value => value.originalBytes.length +
        value.attachments.reduce((total, item) => total + item.bytes.length, 0) +
        (value.rawText?.length ?? 0) * 4;
      const totalBytes = others.reduce((total, entry) => total + retainedBytes(entry.archive), 0);
      if (totalBytes + retainedBytes(archive) > 256 * 1024 * 1024) {
        throw new Error('待处理材料占用过多内存，请先关闭其他导入预览。');
      }
      for (const [token, entry] of staged) if (entry.owner === owner) staged.delete(token);
      const token = randomUUID();
      staged.set(token, { owner, archive, expires: Date.now() + ttl });
      return { token, ...archivePreview(archive) };
    } finally {
      busy.delete(owner);
    }
  });
  ipcMain.handle(CHANNELS.read, async (event, scope, token, id) => {
    const owner = await ownerFor(event, scope);
    prune();
    const entry = staged.get(token);
    if (!entry || entry.owner !== owner) throw new Error('导入预览已失效，请重新选择文件。');
    if (id === 'original') return Uint8Array.from(entry.archive.originalBytes);
    const attachment = entry.archive.attachments.find(item => item.id === id);
    if (!attachment) throw new Error('附件不存在。');
    return Uint8Array.from(attachment.bytes);
  });
  ipcMain.handle(CHANNELS.release, async (event, scope, token) => {
    const owner = await ownerFor(event, scope);
    if (staged.get(token)?.owner === owner) staged.delete(token);
  });
  const dispose = () => {
    disposed = true;
    clearInterval(timer);
    staged.clear();
    for (const channel of Object.values(CHANNELS)) ipcMain.removeHandler(channel);
  };
  dispose.clear = () => staged.clear();
  return dispose;
}
