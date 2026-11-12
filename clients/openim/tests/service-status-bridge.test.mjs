import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as fs from "node:fs";
import * as path from "node:path";
import * as url from "node:url";
import vm from "node:vm";
import ts from "typescript";
import * as contracts from "@research-agent-platform/contracts";
import { readContactStars, starStorageKey, writeContactStar } from "../src/research/contact-directory.ts";

async function load(file, imports, globals = {}) {
  const module = { exports: {} };
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    module, exports: module.exports, URL, Buffer,
    require: name => {
      if (!(name in imports)) throw Error("Unexpected import: " + name);
      return imports[name];
    }, ...globals,
  }, { filename: file });
  return module.exports;
}

// Execute the real main handler, preload API and renderer helper together.
// Only Electron and unrelated bridges are synthetic; no installed app/user data.
async function fixture() {
  const connectionPage = url.fileURLToPath(new URL("../dist/index.html", import.meta.url));
  const localUrl = url.pathToFileURL(connectionPage).href;
  const status = {
    connected: true, rendererOrigin: "http://127.0.0.1:34999",
    address: "https://lab.example.test/", error: "",
  };
  const frame = { url: status.rendererOrigin + "/#/contact?kind=people" };
  let documentUrl = frame.url;
  const contents = { mainFrame: frame, getURL: () => documentUrl };
  let event = { sender: contents, senderFrame: frame };
  const handlers = new Map(), configurations = [];
  const imports = {
    electron: { ipcMain: {
      handle: (name, fn) => { assert.ok(!handlers.has(name)); handlers.set(name, fn); },
      on() {},
    } },
    "node:url": url,
    "./windowManage": {
      getWebContents: () => contents, getResearchServiceStatus: () => ({ ...status }),
      connectResearchService: async address => { configurations.push(address); },
    },
    i18next: { t: text => text },
    "../constants": await load("../electron/constants/index.ts", {}),
    "./storeManage": { getStore: () => ({ get() {}, set() {} }) },
    "../i18n": {},
  };
  for (const [file, names] of [
    ["skillManage", ["registerSkillBridge"]],
    ["zoteroManage", ["registerZoteroBridge"]],
    ["localFolderManage", ["registerLocalFolderBridge"]],
    ["localLibraryManage", ["registerLocalLibraryBridge"]],
    ["teamLibraryManage", ["registerTeamLibraryBridge"]],
    ["chatHistoryManage", ["registerChatHistoryBridge"]],
    ["wechatImportManage", ["registerWeChatImportBridge"]],
    ["localDshManage", ["registerLocalDshBridge"]],
    ["peerLibraryManage", ["registerPeerLibraryBridge"]],
    ["imageClipboardManage", ["registerImageClipboardBridge"]],
    ["chatImageActionsManage", ["registerChatImageActionsBridge"]],
    ["chatScreenshotManage", ["registerChatScreenshotBridge"]],
    ["chatFileActionsManage", ["registerChatFileActionsBridge"]],
    ["desktopWorkManage", ["registerDesktopWorkBridge"]],
    ["updateManage", ["registerDesktopUpdateBridge"]],
    ["messageNotificationManage", ["registerMessageNotificationBridge"]],
    ["feishuManage", ["registerFeishuAuthorizationBridge", "registerFeishuLibraryBridge"]],
  ]) imports["./" + file] = Object.fromEntries(names.map(name => [name, () => {}]));
  const main = await load("../electron/main/ipcHandlerManage.ts", imports, {
    global: { pathConfig: { indexHtml: connectionPage } },
  });
  main.setIpcMainListener();
  const window = { location: { origin: status.rendererOrigin } };
  await load("../electron/preload/index.ts", {
    fs, path,
    electron: {
      contextBridge: { exposeInMainWorld: (name, api) => { window[name] = api; } },
      ipcRenderer: { invoke: async (name, ...args) => handlers.get(name)(event, ...args) },
    },
    "@openim/electron-client-sdk/lib/preload": {},
    "./wechatImportClient": { createWeChatImportClient: () => ({}) },
    "../utils/imagePasteLimits": { imagePasteLimits: { bytes: 10 * 1024 * 1024 } },
  }, { process: { platform: "win32", version: "vSynthetic", getSystemVersion() {} } });
  const card = await load("../src/research/contact-card.ts", {
    "@research-agent-platform/contracts": contracts,
  }, { window });
  return {
    window, card, status, frame, contents, configurations, localUrl,
    from: value => { event = value; },
    navigate: value => { frame.url = value; documentUrl = value; },
    document: value => { documentUrl = value; },
  };
}

test("connected directory can read its service through real preload/main IPC and persist isolated stars", async () => {
  const f = await fixture();
  const service = await f.card.readContactServiceOrigin();
  assert.equal(service, "https://lab.example.test");
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const key = starStorageKey(service, "member_synthetic_A");
  assert.deepEqual(readContactStars(storage, key), []);
  writeContactStar(storage, key, "contact_synthetic_B", true);
  f.status.rendererOrigin = "http://127.0.0.1:35001";
  f.navigate(f.status.rendererOrigin + "/#/contact?kind=agents");
  assert.equal(starStorageKey(await f.card.readContactServiceOrigin(), "member_synthetic_A"), key);
  assert.deepEqual(readContactStars(storage, key), ["contact_synthetic_B"]);
  assert.deepEqual(readContactStars(storage, starStorageKey(service, "member_synthetic_C")), []);
  assert.deepEqual(readContactStars(storage, starStorageKey("https://other.example.test", "member_synthetic_A")), []);
  assert.doesNotMatch(key, /127\.0\.0\.1|34999|35001/);
  writeContactStar(storage, key, "contact_synthetic_B", false);
  assert.deepEqual(readContactStars(storage, key), []);
});

test("bundled connection page can read disconnected status and configure the service", async () => {
  const f = await fixture();
  f.status.connected = false;
  f.status.rendererOrigin = "";
  f.navigate(f.localUrl + "#/login");
  const status = await f.window.electronAPI.getResearchServiceStatus();
  assert.equal(status.connected, false);
  assert.equal(status.address, f.status.address);
  await f.window.electronAPI.configureResearchService("https://new.example.test");
  assert.deepEqual(f.configurations, ["https://new.example.test"]);
});

test("status IPC rejects foreign windows, child frames and mismatched current documents", async () => {
  const f = await fixture();
  f.from({ sender: { mainFrame: f.frame }, senderFrame: f.frame });
  await assert.rejects(f.window.electronAPI.getResearchServiceStatus());
  f.from({ sender: f.contents, senderFrame: { url: f.frame.url } });
  await assert.rejects(f.window.electronAPI.getResearchServiceStatus());
  f.from({ sender: f.contents, senderFrame: f.frame });
  for (const address of ["https://foreign.example.test/", "http://127.0.0.1:35000/", "about:blank", "not-a-url"]) {
    f.navigate(address);
    await assert.rejects(f.window.electronAPI.getResearchServiceStatus());
  }
  f.navigate(f.status.rendererOrigin + "/#/contact");
  f.document("https://foreign.example.test/");
  await assert.rejects(f.window.electronAPI.getResearchServiceStatus());
});

test("disconnected/stale application pages fail without falling back to a temporary origin", async () => {
  const f = await fixture();
  f.status.connected = false;
  await assert.rejects(f.card.readContactServiceOrigin());
  f.status.connected = true;
  f.status.rendererOrigin = "";
  await assert.rejects(f.card.readContactServiceOrigin());
  f.status.rendererOrigin = "http://127.0.0.1:35000";
  await assert.rejects(f.card.readContactServiceOrigin());
});

test("read access never lets a connected app, foreign window or child frame configure a service", async () => {
  const f = await fixture();
  await assert.rejects(f.window.electronAPI.configureResearchService("https://other.example.test"));
  f.navigate(f.localUrl);
  f.from({ sender: { mainFrame: f.frame }, senderFrame: f.frame });
  await assert.rejects(f.window.electronAPI.configureResearchService("https://other.example.test"));
  await assert.rejects(f.window.electronAPI.getResearchServiceStatus());
  f.from({ sender: f.contents, senderFrame: { url: f.localUrl } });
  await assert.rejects(f.window.electronAPI.configureResearchService("https://other.example.test"));
  assert.deepEqual(f.configurations, []);
});
