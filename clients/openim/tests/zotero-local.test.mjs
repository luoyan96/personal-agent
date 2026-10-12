import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer, request } from "node:http";
import { once } from "node:events";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const load = async (relative, dependency = require, globals = {}) => {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(await fs.readFile(new URL(relative, import.meta.url), "utf8"), {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: dependency,
      Buffer,
      URL,
      URLSearchParams,
      AbortController,
      Date,
      setTimeout,
      clearTimeout,
      ...globals,
    },
  );
  return exports;
};
const local = await load("../electron/utils/zoteroLocal.ts");
const document = await load("../src/research/zotero-document.ts");
const item = (key = "ABCD1234", data = {}) => ({
  key,
  version: 7,
  data: {
    itemType: "journalArticle",
    title: "合成研究·方法对比",
    creators: [{ firstName: "Yan", lastName: "Luo", creatorType: "author" }],
    date: "2026",
    DOI: "10.0000/synthetic-only",
    abstractNote: "合成摘要：末尾证据标记 ZOTERO_END",
    ...data,
  },
});

test("fixed personal library paths, escaped queries and bounded pagination; no arbitrary origin, groups, write or attachment request", () => {
  const path = local.zoteroReadPath({
    kind: "items",
    start: 25,
    query: "中文 / ?#&",
    collectionKey: "ABCDEFG1",
  }).path;
  assert.ok(path.startsWith("/api/users/0/collections/ABCDEFG1/items/top?"));
  const parsed = new URL(path, "http://127.0.0.1:23119");
  assert.equal(parsed.searchParams.get("q"), "中文 / ?#&");
  assert.equal(parsed.searchParams.get("limit"), "25");
  assert.equal(parsed.searchParams.get("start"), "25");
  assert.equal(parsed.searchParams.get("qmode"), "titleCreatorYear");
  for (const bad of [
    null,
    { kind: "collections", start: 1 },
    { kind: "items", start: -25, query: "", collectionKey: "" },
    { kind: "collections", start: 5025 },
    { kind: "collections", start: 0, url: "https://example.com" },
    { kind: "items", start: 0, query: "x".repeat(201), collectionKey: "" },
    { kind: "items", start: 0, query: "", collectionKey: "../files" },
    { kind: "delete", start: 0 },
    { kind: "items", start: 0, query: "", collectionKey: "A2345678", group: 1 },
  ])
    assert.throws(() => local.zoteroReadPath(bad));
});
test("valid empty page is distinct from malformed data; notes and attachments never reach selected research document", () => {
  const req = { kind: "items", start: 0, collectionKey: "", query: "" };
  const result = local.zoteroPage(
    [
      item(),
      item("ABCD1235", { itemType: "attachment", path: "C:/private.pdf" }),
      item("ABCD1236", { itemType: "note", note: "private note" }),
    ],
    req,
    26,
  );
  assert.equal(result.items.length, 1);
  assert.equal(result.hasMore, true);
  assert.equal(result.items[0].authors[0], "Yan Luo");
  assert.deepEqual(JSON.parse(JSON.stringify(local.zoteroPage([], req, 0))), {
    items: [],
    start: 0,
    hasMore: false,
  });
  for (const bad of [
    { error: "failed" },
    [item(), item()],
    [item("../escape")],
    [item("ABCD1234", { abstractNote: "a".repeat(50001) })],
    [item("ABCD1234", { creators: {} })],
    [{ ...item(), version: "7" }],
  ])
    assert.throws(() => local.zoteroPage(bad, req, 1));
});

test("real isolated HTTP exercises fixed loopback GET, response limits, version, errors and no redirects", async () => {
  let mode = "normal";
  const seen = [];
  const server = createServer((req, res) => {
    seen.push({ method: req.method, path: req.url, headers: req.headers });
    res.setHeader("Zotero-API-Version", mode === "version" ? "4" : "3");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Zotero-Server-ID", mode === "changed" ? "other-db" : "synthetic-db");
    if (mode === "error") res.statusCode = 503;
    if (mode === "forbidden") res.statusCode = 403;
    if (mode === "redirect") {
      res.statusCode = 302;
      res.setHeader("Location", "https://example.com/private");
    }
    res.end(
      mode === "malformed"
        ? "not-json"
        : mode === "oversize"
        ? "x".repeat(2097153)
        : "[]",
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = server.address().port;
    const api = await load("../electron/utils/zoteroLocal.ts", (name) =>
      name === "node:http"
        ? {
            request: (opts, fn) => {
              assert.equal(opts.hostname, "127.0.0.1");
              assert.equal(opts.port, 23119);
              assert.equal(opts.method, "GET");
              assert.equal(opts.headers["Zotero-API-Key"], undefined);
              assert.equal(opts.headers.Cookie, undefined);
              return request({ ...opts, port }, fn);
            },
          }
        : require(name),
    );
    const path = local.zoteroReadPath({ kind: "collections", start: 0 }).path;
    assert.equal(
      (await api.readZoteroJson(path, new AbortController().signal)).serverId,
      "synthetic-db",
    );
    for (mode of [
      "error",
      "forbidden",
      "redirect",
      "version",
      "malformed",
      "changed",
      "oversize",
    ])
      await assert.rejects(
        api.readZoteroJson(path, new AbortController().signal, "synthetic-db"),
      );
    assert.equal(seen.length, 8);
    assert.ok(seen.every((v) => v.method === "GET" && v.path === path));
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("in-flight native HTTP cancellation and timeout are errors, not empty results", async () => {
  const server = createServer((_req, _res) => {});
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const api = await load(
      "../electron/utils/zoteroLocal.ts",
      (name) =>
        name === "node:http"
          ? {
              request: (opts, fn) =>
                request({ ...opts, port: server.address().port }, fn),
            }
          : require(name),
      { setTimeout: (fn, delay) => setTimeout(fn, delay === 10000 ? 40 : delay) },
    );
    const controller = new AbortController(),
      promise = api.readZoteroJson("/api/users/0/items/top", controller.signal);
    controller.abort();
    await assert.rejects(promise, /停止/);
    await assert.rejects(
      api.readZoteroJson("/api/users/0/items/top", new AbortController().signal),
      /10 秒/,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

async function bridge() {
  const handlers = new Map(),
    frame = { url: "https://chat.synthetic.test/", processId: 1, routingId: 1 };
  const contents = {
    id: 1,
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    getURL: () => frame.url,
  };
  const event = { sender: contents, senderFrame: frame };
  let response = 0,
    calls = 0,
    deferred,
    time = Date.now();
  const exports = await load(
    "../electron/main/zoteroManage.ts",
    (name) =>
      name === "electron"
        ? {
            ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
            dialog: { showMessageBox: async () => ({ response }) },
          }
        : name === "./windowManage"
        ? {
            getWebContents: () => contents,
            getResearchServiceStatus: () => ({
              connected: true,
              rendererOrigin: "https://chat.synthetic.test",
              error: "",
            }),
          }
        : name === "../utils/zoteroLocal"
        ? {
            ...local,
            readZoteroJson: async (_path, signal) => {
              ++calls;
              if (deferred) return await deferred(signal);
              return { value: [], serverId: "synthetic-db", total: 0 };
            },
          }
        : require(name),
    { Date: { now: () => time }, setTimeout: () => ({ unref() {} }) },
  );
  exports.registerZoteroBridge();
  return {
    event,
    frame,
    call: (key, ...args) => handlers.get(key)(event, ...args),
    handlers,
    cancel: () => {
      response = 1;
    },
    allow: () => {
      response = 0;
    },
    advance: (n) => {
      time += n;
    },
    setDeferred: (fn) => {
      deferred = fn;
    },
    calls: () => calls,
  };
}
test("native permission cancel reads nothing; rejected frames and expired/forged/replaced grants cannot read", async () => {
  const b = await bridge();
  b.cancel();
  assert.equal(await b.call("connect-local-zotero"), null);
  assert.equal(b.calls(), 0);
  await assert.rejects(
    b.handlers.get("connect-local-zotero")({ ...b.event, senderFrame: { ...b.frame } }),
    /当前页面/,
  );
  b.allow();
  const grant = await b.call("connect-local-zotero");
  await assert.rejects(
    b.call("read-local-zotero", "forged", { kind: "collections", start: 0 }),
    /失效/,
  );
  const next = await b.call("connect-local-zotero");
  await assert.rejects(
    b.call("read-local-zotero", grant.id, { kind: "collections", start: 0 }),
    /失效/,
  );
  b.advance(900001);
  await assert.rejects(
    b.call("read-local-zotero", next.id, { kind: "collections", start: 0 }),
    /失效/,
  );
});
test("release aborts reads; concurrent reads and late frame results are refused", async () => {
  const b = await bridge(),
    grant = await b.call("connect-local-zotero");
  let finish;
  b.setDeferred(
    (signal) =>
      new Promise((resolve, reject) => {
        finish = resolve;
        signal.addEventListener("abort", () => reject(Error("stopped")), {
          once: true,
        });
      }),
  );
  const pending = b.call("read-local-zotero", grant.id, {
    kind: "collections",
    start: 0,
  });
  await assert.rejects(
    b.call("read-local-zotero", grant.id, { kind: "collections", start: 0 }),
    /正在读取/,
  );
  b.call("release-local-zotero", grant.id);
  await assert.rejects(pending, /stopped/);
  b.setDeferred(undefined);
  const again = await b.call("connect-local-zotero");
  b.setDeferred(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const late = b.call("read-local-zotero", again.id, { kind: "collections", start: 0 });
  b.frame.url = "https://chat.synthetic.test/workbench";
  finish({ value: [], serverId: "synthetic-db", total: 0 });
  await assert.rejects(late, /页面或许可/);
});
test("selected plain text preserves abstract ending/version/source, labels no full text and excludes private raw fields", () => {
  const values = local.zoteroPage(
    [
      item("ABCD1234", {
        path: "C:/secret.pdf",
        API_KEY: "synthetic-forbidden",
        note: "private note",
      }),
      item("ABCD1235", { abstractNote: "" }),
    ],
    { kind: "items", start: 0 },
    2,
  ).items;
  const text = document.zoteroDocument(values, "synthetic-db");
  assert.match(text, /ZOTERO_END/);
  assert.match(text, /原始版本 7/);
  assert.match(text, /未读取 PDF/);
  assert.match(text, /未提供摘要/);
  assert.doesNotMatch(text, /secret\.pdf|synthetic-forbidden|private note/);
  assert.throws(() => document.zoteroDocument([], null));
  assert.throws(() => document.zoteroDocument([values[0], values[0]], null));
});
