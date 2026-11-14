import fs from "fs";
import path from "path";
import { DataPath, IElectronAPI } from "./../../src/types/globalExpose.d";
import { contextBridge, ipcRenderer, webUtils } from "electron";
import "@openim/electron-client-sdk/lib/preload";
import type { Platform } from "@openim/wasm-client-sdk";
import { imagePasteLimits } from "../utils/imagePasteLimits";

// Importing the browser SDK here starts its WASM worker before the page has
// a URL. The native bridge only needs these stable OpenIM platform IDs.
const getPlatform = (): Platform => {
  if (process.platform === "darwin") {
    return 4;
  }
  if (process.platform === "win32") {
    return 3;
  }
  return 7;
};

const getDataPath = (key: DataPath) => {
  switch (key) {
    case "public":
      return ipcRenderer.sendSync("getDataPath", "public");
    case "sdkResources":
      return ipcRenderer.sendSync("getDataPath", "sdkResources");
    case "logsPath":
      return ipcRenderer.sendSync("getDataPath", "logsPath");
    default:
      return "";
  }
};

const subscribe = (channel: string, callback: (...args: any[]) => void) => {
  const subscription = (_, ...args) => callback(...args);
  ipcRenderer.on(channel, subscription);
  return () => ipcRenderer.removeListener(channel, subscription);
};

const subscribeOnce = (channel: string, callback: (...args: any[]) => void) => {
  ipcRenderer.once(channel, (_, ...args) => callback(...args));
};

const unsubscribeAll = (channel: string) => {
  ipcRenderer.removeAllListeners(channel);
};

const ipcInvoke = (channel: string, ...arg: any) => {
  return ipcRenderer.invoke(channel, ...arg);
};

const ipcSendSync = (channel: string, ...arg: any) => {
  return ipcRenderer.sendSync(channel, ...arg);
};

const getUniqueSavePath = (originalPath: string) => {
  let counter = 0;
  let savePath = originalPath;
  let fileDir = path.dirname(originalPath);
  let fileName = path.basename(originalPath);
  let fileExt = path.extname(originalPath);
  let baseName = path.basename(fileName, fileExt);

  while (fs.existsSync(savePath)) {
    counter++;
    fileName = `${baseName}(${counter})${fileExt}`;
    savePath = path.join(fileDir, fileName);
  }

  return savePath;
};

const getFileByPath = async (filePath: string) => {
  try {
    const filename = path.basename(filePath);
    const data = await fs.promises.readFile(filePath);
    return new File([data], filename);
  } catch (error) {
    console.log(error);
    return null;
  }
};

const saveFileToDisk = async ({
  file,
  sync,
}: {
  file: File;
  sync?: boolean;
}): Promise<string> => {
  const arrayBuffer = await file.arrayBuffer();
  const saveDir = ipcRenderer.sendSync("getDataPath", "sdkResources");
  const savePath = path.join(saveDir, path.basename(file.name));
  const uniqueSavePath = getUniqueSavePath(savePath);
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  if (sync) {
    await fs.promises.writeFile(uniqueSavePath, Buffer.from(arrayBuffer));
  } else {
    fs.promises.writeFile(uniqueSavePath, Buffer.from(arrayBuffer));
  }
  return uniqueSavePath;
};

const Api: IElectronAPI = {
  getFilePath: (file: File) => file instanceof File ? webUtils.getPathForFile(file) : '',
  openFeishuLibrary: (url) => ipcRenderer.invoke("open-feishu-library", url),
  openFeishuAuthorization: (url) => ipcRenderer.invoke("open-feishu-authorization", url),
  connectLocalZotero: () => ipcRenderer.invoke("connect-local-zotero"),
  readLocalZotero: (id, request) => ipcRenderer.invoke("read-local-zotero", id, request),
  releaseLocalZotero: (id) => ipcRenderer.invoke("release-local-zotero", id),
  saveImageBytesToDisk: async (filename, bytes) => {
    if (
      !(bytes instanceof Uint8Array) ||
      !bytes.length ||
      bytes.length > imagePasteLimits.bytes
    )
      throw new Error("图片数据无效或超过 10 MB。");
    const saveDir = getDataPath("sdkResources");
    await fs.promises.mkdir(saveDir, { recursive: true });
    const name = path.basename(filename || "粘贴图片.png");
    if (name === "." || name === "..") throw new Error("图片名称无效。");
    const savePath = getUniqueSavePath(path.join(saveDir, name));
    await fs.promises.writeFile(savePath, Buffer.from(bytes), { flag: "wx" });
    return savePath;
  },
  readChatClipboardImages: () => ipcRenderer.invoke("read-chat-clipboard-images"),
  editChatScreenshot: () => ipcRenderer.invoke("edit-chat-screenshot"),
  cancelChatScreenshot: () => ipcRenderer.invoke("cancel-chat-screenshot"),
  captureChatScreens: () => ipcRenderer.invoke("capture-chat-screens"),
  saveChatFile: (filename: string, bytes: Uint8Array) => ipcRenderer.invoke("save-chat-file", filename, bytes),
  revealChatFile: (token: string) => ipcRenderer.invoke("reveal-chat-file", token),
  copyChatImage: (bytes) => ipcRenderer.invoke("copy-chat-image", bytes),
  saveChatImage: (filename, bytes) => ipcRenderer.invoke("save-chat-image", filename, bytes),
  recognizeChatImage: (id, bytes) =>
    ipcRenderer.invoke("recognize-chat-image", { id, bytes }),
  cancelChatImageOcr: (id) => ipcRenderer.invoke("cancel-chat-image-ocr", id),
  saveChatImageText: (text, original) =>
    ipcRenderer.invoke("save-chat-image-text", text, original),
  inspectSkillGithub: (address) => ipcRenderer.invoke("inspect-skill-github", address),
  importPrivateSkill: (kind, selection) =>
    ipcRenderer.invoke("import-private-skill", kind, selection),
  commitSkillBundle: (token, locator) => ipcRenderer.invoke("commit-skill-bundle", token, locator),
  discardSkillBundle: (token) => ipcRenderer.invoke("discard-skill-bundle", token),
  skillBundleManifest: (locator) => ipcRenderer.invoke("skill-bundle-manifest", locator),
  readSkillBundleAsset: (locator, path) => ipcRenderer.invoke("read-skill-bundle-asset", locator, path),
  saveSkillBundleAsset: (locator, path) => ipcRenderer.invoke("save-skill-bundle-asset", locator, path),
  getDesktopUpdateState: () => ipcRenderer.invoke("desktop-update-state"),
  onDesktopUpdateState: (callback) =>
    subscribe("desktop-update-state-changed", callback),
  desktopUpdateAction: (action, version) =>
    ipcRenderer.invoke("desktop-update-action", action, version),
  createDesktopReport: (scope, title, markdown, sources) =>
    ipcRenderer.invoke("create-desktop-report", scope, title, markdown, sources),
  listDesktopReports: (scope) => ipcRenderer.invoke("list-desktop-reports", scope),
  openDesktopReport: (scope, id) =>
    ipcRenderer.invoke("open-desktop-report", scope, id),
  revealDesktopReport: (scope, id) =>
    ipcRenderer.invoke("reveal-desktop-report", scope, id),
  peerLibrary: {
    folder: (scope) => ipcRenderer.invoke("peer-library-folder", scope),
    configure: (scope, automatic) => ipcRenderer.invoke("peer-library-configure", scope, automatic),
    revoke: (scope) => ipcRenderer.invoke("peer-library-revoke", scope),
    search: (scope, request) => ipcRenderer.invoke("peer-library-search", scope, request),
    read: (scope, requestId, fileId) => ipcRenderer.invoke("peer-library-read", scope, requestId, fileId),
    save: (scope, request, file, bytes) => ipcRenderer.invoke("peer-library-save", scope, request, file, bytes),
    received: (scope) => ipcRenderer.invoke("peer-library-received", scope),
    open: (scope, id) => ipcRenderer.invoke("peer-library-open", scope, id),
  },
  pickLocalFolder: () => ipcRenderer.invoke("pick-local-folder"),
  readLocalFolderSelection: (request) =>
    ipcRenderer.invoke("read-local-folder-selection", request),
  releaseLocalFolder: (grantId) => ipcRenderer.invoke("release-local-folder", grantId),
  getResearchServiceStatus: () => ipcRenderer.invoke("research-service-status"),
  configureResearchService: (address) =>
    ipcRenderer.invoke("configure-research-service", address),
  getDataPath,
  getVersion: () => process.version,
  getPlatform,
  teamLibrary: {
    discover: url => ipcRenderer.invoke('team-library-discover', url),
    sync: () => ipcRenderer.invoke('team-library-sync'),
    cached: () => ipcRenderer.invoke('team-library-cached'),
    preview: selected => ipcRenderer.invoke('team-library-preview', selected),
    open: selected => ipcRenderer.invoke('team-library-open', selected),
    propose: (revision, entry, text, fileBytes) => ipcRenderer.invoke('team-library-propose', revision, entry, text, fileBytes),
    changes: () => ipcRenderer.invoke('team-library-changes'),
    proposeProject: (revision,project) => ipcRenderer.invoke('team-library-project',revision,project),
  },
  localLibrary: {
    status: () => ipcRenderer.invoke("local-library-status"),
    pick: () => ipcRenderer.invoke("local-library-pick"),
    scan: () => ipcRenderer.invoke("local-library-scan"),
    hash: (rel) => ipcRenderer.invoke("local-library-hash", rel),
  },
  localDsh: {
      taskAddLocal: target => ipcRenderer.invoke('task-dsh-add-local', target),
      taskImportLibrary: (target, rels) => ipcRenderer.invoke('task-dsh-import-library', target, rels),
      taskImportTeamLibrary: (target, selection) => ipcRenderer.invoke('task-dsh-import-team-library', target, selection),
      taskReveal: (target, name) => ipcRenderer.invoke('task-dsh-reveal', target, name),
      taskArchive: (target, selection, rebase) => ipcRenderer.invoke('task-dsh-archive', target, selection, rebase),
      taskOpen: (target, pick) => ipcRenderer.invoke('task-dsh-open', target, pick),
      taskStatus: (target) => ipcRenderer.invoke('task-dsh-status', target),
      taskAbandonPending: target => ipcRenderer.invoke('task-dsh-abandon-pending',target),
      taskKnowledge: target => ipcRenderer.invoke('task-dsh-knowledge',target),
      taskPreferences: (target,value) => ipcRenderer.invoke('task-dsh-preferences',target,value),
      taskCheckpoint: (target,value,version) => ipcRenderer.invoke('task-dsh-checkpoint',target,value,version),
      taskNewSession: target => ipcRenderer.invoke('task-dsh-new-session',target),
      taskPrompt: (target, text, requestId) => ipcRenderer.invoke('task-dsh-prompt', target, text, requestId),
      taskNote: (target, note) => ipcRenderer.invoke('task-dsh-note', target, note),
      taskStageDelivery: (target, paths) => ipcRenderer.invoke("task-dsh-stage-delivery", target, paths),
      taskDownloadDelivery: (target, locator) => ipcRenderer.invoke("task-dsh-download-delivery", target, locator),
      taskSubmit: (target, summary, names) => ipcRenderer.invoke('task-dsh-submit', target, summary, names),
      taskCancel: target => ipcRenderer.invoke('task-dsh-cancel', target),
      taskRebase: target => ipcRenderer.invoke('task-dsh-rebase', target),
      taskImport: (target, source) => ipcRenderer.invoke('task-dsh-import', target, source),
      taskOutput: (target, name) => ipcRenderer.invoke('task-dsh-output', target, name),
    status: () => ipcRenderer.invoke("local-dsh-status"),
    connect: () => ipcRenderer.invoke("local-dsh-connect"),
    disconnect: () => ipcRenderer.invoke("local-dsh-disconnect"),
    start: () => ipcRenderer.invoke("local-dsh-start"),
    stop: () => ipcRenderer.invoke("local-dsh-stop"),
    show: (bounds) => ipcRenderer.invoke("local-dsh-show", bounds),
  },
  chatHistory: {
    open: () => ipcRenderer.invoke("chat-history-open"),
    close: (lease) => ipcRenderer.invoke("chat-history-close", lease),
    page: (lease, conversation, before, count) =>
      ipcRenderer.invoke("chat-history-page", lease, conversation, before, count),
    savePage: (lease, conversation, messages, options) =>
      ipcRenderer.invoke("chat-history-savePage", lease, conversation, messages, options),
    revoke: (lease, messageId, patch) =>
      ipcRenderer.invoke("chat-history-revoke", lease, messageId, patch),
    remove: (lease, messageIds) =>
      ipcRenderer.invoke("chat-history-remove", lease, messageIds),
    forget: (lease, conversation) =>
      ipcRenderer.invoke("chat-history-forget", lease, conversation),
    readRecord: (lease, conversation, kind, id) =>
      ipcRenderer.invoke("chat-history-readRecord", lease, conversation, kind, id),
    saveRecord: (lease, conversation, kind, id, value) =>
      ipcRenderer.invoke("chat-history-saveRecord", lease, conversation, kind, id, value),
    removeRecord: (lease, conversation, kind, id) =>
      ipcRenderer.invoke("chat-history-removeRecord", lease, conversation, kind, id),
  },
  setMessageUnreadCount: (count) => ipcRenderer.invoke("set-message-unread-count", count),
  getSystemVersion: process.getSystemVersion,
  subscribe,
  subscribeOnce,
  unsubscribeAll,
  ipcInvoke,
  ipcSendSync,
  getFileByPath,
  saveFileToDisk,
};

contextBridge.exposeInMainWorld("electronAPI", Api);
