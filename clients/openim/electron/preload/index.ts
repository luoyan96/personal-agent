import fs from "fs";
import path from "path";
import { DataPath, IElectronAPI } from "./../../src/types/globalExpose.d";
import { contextBridge, ipcRenderer } from "electron";
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
  saveImageBytesToDisk: async (filename, bytes) => {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > imagePasteLimits.bytes) throw new Error("图片数据无效或超过 10 MB。");
    const saveDir = getDataPath("sdkResources");
    await fs.promises.mkdir(saveDir, { recursive: true });
    const name = path.basename(filename || "粘贴图片.png");
    if (name === "." || name === "..") throw new Error("图片名称无效。");
    const savePath = getUniqueSavePath(path.join(saveDir, name));
    await fs.promises.writeFile(savePath, Buffer.from(bytes), { flag: "wx" });
    return savePath;
  },
  readChatClipboardImages: () => ipcRenderer.invoke("read-chat-clipboard-images"),
  recognizeChatImage: (id, bytes) => ipcRenderer.invoke("recognize-chat-image", { id, bytes }),
  cancelChatImageOcr: (id) => ipcRenderer.invoke("cancel-chat-image-ocr", id),
  inspectSkillGithub: (address) => ipcRenderer.invoke("inspect-skill-github", address),
  importPrivateSkill: (kind, selection) => ipcRenderer.invoke("import-private-skill", kind, selection),
  getDesktopUpdateState: () => ipcRenderer.invoke("desktop-update-state"),
  onDesktopUpdateState: (callback) => subscribe("desktop-update-state-changed", callback),
  desktopUpdateAction: (action, version) => ipcRenderer.invoke("desktop-update-action", action, version),
  createDesktopReport: (scope, title, markdown, sources) => ipcRenderer.invoke("create-desktop-report", scope, title, markdown, sources),
  listDesktopReports: (scope) => ipcRenderer.invoke("list-desktop-reports", scope),
  openDesktopReport: (scope, id) => ipcRenderer.invoke("open-desktop-report", scope, id),
  revealDesktopReport: (scope, id) => ipcRenderer.invoke("reveal-desktop-report", scope, id),
  pickLocalFolder: () => ipcRenderer.invoke("pick-local-folder"),
  readLocalFolderSelection: (request) => ipcRenderer.invoke("read-local-folder-selection", request),
  releaseLocalFolder: (grantId) => ipcRenderer.invoke("release-local-folder", grantId),
  getResearchServiceStatus: () => ipcRenderer.invoke("research-service-status"),
  configureResearchService: (address) =>
    ipcRenderer.invoke("configure-research-service", address),
  getDataPath,
  getVersion: () => process.version,
  getPlatform,
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
