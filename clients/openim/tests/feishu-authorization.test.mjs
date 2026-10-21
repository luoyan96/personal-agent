import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file, imports = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(await fs.readFile(new URL(`../${file}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, require: name => imports[name], URL, setTimeout, clearTimeout, ...globals });
  return module.exports;
}
const validation = await load("electron/utils/feishuAuthorization.ts");
function authorization() {
  const url = new URL("https://accounts.feishu.cn/open-apis/authen/v1/authorize");
  url.search = new URLSearchParams({ client_id: "cli_synthetic", response_type: "code", redirect_uri: "https://lab.example.test/api/v1/feishu/callback", state: "s".repeat(43), scope: "contact:user.base:readonly docx:document:readonly wiki:wiki:readonly", code_challenge: "c".repeat(43), code_challenge_method: "S256" }).toString();
  return url;
}
test("only the fixed read-only OAuth entry and current service callback can open", () => {
  const url = authorization().href;
  assert.equal(validation.validateFeishuAuthorizationUrl(url, "https://lab.example.test"), url);
  assert.throws(() => validation.validateFeishuAuthorizationUrl(url, "https://another.example.test"));
  for (const change of [u => u.protocol = "http:", u => u.hostname += ".evil.test", u => u.username = "attacker", u => u.pathname = "/unrelated", u => u.hash = "unexpected", u => u.searchParams.set("scope", "docx:document"), u => u.searchParams.set("code_challenge_method", "plain"), u => u.searchParams.set("state", "short"), u => u.searchParams.append("redirect_uri", "https://other.test"), u => u.searchParams.set("unexpected", "value")]) {
    const candidate = authorization(); change(candidate);
    assert.throws(() => validation.validateFeishuAuthorizationUrl(candidate.href));
  }
});
test("library authorization adds exactly the Bitable read-only scope, never write or messages",()=>{
  const url=authorization();url.searchParams.set('scope',url.searchParams.get('scope')+' bitable:app:readonly');
  assert.equal(validation.validateFeishuAuthorizationUrl(url.href,'https://lab.example.test'),url.href);
  for(const extra of ['bitable:app','im:message','base:record:create']){const bad=new URL(url);bad.searchParams.set('scope',bad.searchParams.get('scope')+' '+extra);assert.throws(()=>validation.validateFeishuAuthorizationUrl(bad.href));}
});
async function opener(window) {
  return (await load("src/research/feishu-authorization.ts", {}, { window })).openFeishuAuthorization;
}

test("renderer refuses navigation outside the fixed Feishu entry", async () => {
  let calls = 0;
  const open = await opener({ electronAPI: { openFeishuAuthorization: async () => { calls++; } } });
  for (const value of ["javascript:alert(1)", "https://accounts.feishu.cn.evil.test/open-apis/authen/v1/authorize", "https://accounts.feishu.cn/unrelated"]) {
    await assert.rejects(open(value), /链接无效/);
  }
  assert.equal(calls, 0);
});
test("desktop waits for the dedicated bridge acknowledgement", async () => {
  let seen;
  const open = await opener({ electronAPI: { openFeishuAuthorization: async url => { seen = url; } } });
  await open(authorization().href); assert.equal(seen, authorization().href);
});
test("native failure and old preload give an actionable fallback without IPC internals", async () => {
  const broken = await opener({ electronAPI: { openFeishuAuthorization: async () => { throw Error("Error invoking IPC, private details"); } } });
  await assert.rejects(broken(authorization().href), error => /复制授权链接/.test(error.message) && !/IPC|private/.test(error.message));
  await assert.rejects((await opener({ electronAPI: {} }))(authorization().href), /更新客户端/);
});
test("web opens from the gesture and clears opener before external navigation", async () => {
  const page = { opener: "parent", location: { replace(url) { assert.equal(page.opener, null); assert.equal(url, authorization().href); } } };
  let calls = 0;
  await (await opener({ open(url, target) { calls++; assert.equal(url, "about:blank"); assert.equal(target, "_blank"); return page; } }))(authorization().href);
  assert.equal(calls, 1);
  await assert.rejects((await opener({ open: () => null }))(authorization().href), /阻止.*复制授权链接/);
});
async function bridge(openExternal) {
  let handler;
  const contents = { mainFrame: { url: "http://127.0.0.1:4317/workbench" }, isDestroyed: () => false, isLoadingMainFrame: () => false, getURL: () => "http://127.0.0.1:4317/workbench" };
  const service = { connected: true, error: "", rendererOrigin: "http://127.0.0.1:4317", address: "https://lab.example.test" };
  const module = await load("electron/main/feishuManage.ts", {
    electron: { ipcMain: { handle(name, callback) { assert.equal(name, "open-feishu-authorization"); handler = callback; } }, shell: { openExternal } },
    "./windowManage": { getWebContents: () => contents, getResearchServiceStatus: () => service },
    "../utils/feishuAuthorization": validation,
  });
  module.registerFeishuAuthorizationBridge();
  return { invoke: (event = { sender: contents, senderFrame: contents.mainFrame }, url = authorization().href) => handler(event, url), contents, service };
}
test("native bridge rejects other frames, disconnected services and callback substitution", async () => {
  const calls = [];
  const b = await bridge(async url => { calls.push(url); });
  await assert.rejects(b.invoke({ sender: b.contents, senderFrame: { ...b.contents.mainFrame } }), /主窗口/);
  b.service.connected = false; await assert.rejects(b.invoke(), /主窗口/); b.service.connected = true;
  b.service.address = "https://another.example.test"; await assert.rejects(b.invoke(), /链接无效/); b.service.address = "https://lab.example.test";
  assert.equal(calls.length, 0); await b.invoke(); assert.deepEqual(calls, [authorization().href]);
});
test("native shell errors are caught and never repeat or expose the URL", async () => {
  let calls = 0;
  const b = await bridge(async () => { calls++; throw Error(authorization().href); });
  await assert.rejects(b.invoke(), error => /复制授权链接/.test(error.message) && !error.message.includes("state="));
  assert.equal(calls, 1);
});
