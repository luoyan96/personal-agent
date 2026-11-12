import { CHANNELS } from './channels.mjs';

/** Bundle into the host's isolated preload. This module imports no filesystem APIs. */
export function createWeChatImportClient(ipcRenderer) {
  return Object.freeze({
    choose: (scope, batchId) => ipcRenderer.invoke(CHANNELS.choose, scope, batchId),
    read: (scope, token, id) => ipcRenderer.invoke(CHANNELS.read, scope, token, id),
    release: (scope, token) => ipcRenderer.invoke(CHANNELS.release, scope, token),
  });
}
