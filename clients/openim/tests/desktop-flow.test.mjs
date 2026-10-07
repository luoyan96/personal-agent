import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { Writable, Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import ts from "typescript";

const require = createRequire(import.meta.url);
const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = path.resolve(client, "../../../.runtime/desktop-modernization-20261007/core-" + randomUUID().slice(0, 8));
await fs.mkdir(run, { recursive: true });
function load(name, substitutes = {}, globals = {}) {
  return fs.readFile(path.join(client, name), "utf8").then(source => {
    const code = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true,
    }}).outputText;
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports,
      require: name => Object.hasOwn(substitutes, name) ? substitutes[name] : require(name),
      Buffer, TextDecoder, URL, setTimeout, clearTimeout, DOMException, AbortController, Error, ...globals }, { filename: name });
    return module.exports;
  });
}

test("desktop bundled origin serves its own assets and isolates upstream sessions", async () => {
  const dist = path.join(run, "dist"); await fs.mkdir(dist);
  await fs.writeFile(path.join(dist, "index.html"), "<h1>Bundled Desktop</h1>");
  const captured = [];
  const request = (url, options, callback) => {
    const stream = new Writable({ write(chunk, _, next) { next(); } });
    stream.on("finish", () => {
      captured.push({ url: url.href, headers: options.headers });
      const reply = Readable.from([JSON.stringify({ data: { ok: true } })]);
      reply.statusCode = 200; reply.headers = { "content-type": "application/json",
        "set-cookie": ["rap_session=synthetic-token; Path=/; HttpOnly; Secure; SameSite=Lax; Domain=lab.example.invalid", "other=discard"] };
      callback(reply);
    });
    return stream;
  };
  const { startDesktopServer, desktopSessionCookie } = await load("electron/utils/desktopServer.ts", { "node:https": { request } });
  const service = "https://lab.example.invalid/", server = await startDesktopServer(dist, service);
  try {
    assert.match(await (await fetch(server.origin)).text(), /Bundled Desktop/);
    const cookie = desktopSessionCookie(service);
    const response = await fetch(server.origin + "/api/v1/session", { headers: { Cookie: `${cookie}=only-this-service; unrelated=never-forward` } });
    assert.equal(response.status, 200);
    assert.equal(captured[0].url, service + "api/v1/session");
    assert.equal(captured[0].headers.cookie, "rap_session=only-this-service");
    assert.equal(captured[0].headers.origin, new URL(service).origin);
    assert.equal(response.headers.getSetCookie().length, 1);
    assert.match(response.headers.getSetCookie()[0], new RegExp("^" + cookie + "="));
    assert.doesNotMatch(response.headers.getSetCookie()[0], /Secure|Domain=/);
    assert.equal((await fetch(server.origin + "/api/v1/login", { method: "POST", headers: { Origin: "https://untrusted.invalid" } })).status, 403);
    assert.equal((await fetch(server.origin + "/api/v1/login", { method: "POST" })).status, 403);
    assert.equal((await fetch(server.origin + "/api/v1/login", { method: "POST", headers: { Origin: server.origin } })).status, 200);
    assert.notEqual(desktopSessionCookie("https://other.example.invalid"), cookie);
    assert.equal((await fetch(server.origin + "/..%5cpackage.json")).status, 404);
  } finally { await server.close(); }
});

test("real selected folder → chunked model API steps → persisted report", async () => {
  const { LocalFolderStore } = await load("electron/utils/localFolder.ts");
  const { DesktopArtifactStore } = await load("electron/utils/desktopArtifacts.ts");
  const folder = path.join(run, "synthetic-notes"); await fs.mkdir(folder);
  const longText = "研究笔记：".repeat(8000) + "末尾依据：样本来自批次B，需复核。";
  await fs.writeFile(path.join(folder, "long-notes.md"), longText);
  await fs.writeFile(path.join(folder, "comparison.txt"), "对照资料：批次A和B的测量方法不同。");
  const reader = new LocalFolderStore(() => { throw new Error("Text fixture only"); });
  const grant = await reader.scan(folder, "test-owner");
  const files = [];
  for (const file of grant.files) {
    const result = await reader.read({ grantId: grant.grantId, fileIds: [file.id], mode: "workspace" }, "test-owner");
    files.push(result.files[0]);
  }
  assert.equal(files.find(f => f.relativePath === "long-notes.md").text, longText);
  const scope = { actorId: "synthetic-actor", conversationId: "synthetic-chat" };
  const state = { generation: 1, actor: { member: { id: scope.actorId } }, sessionActorId: scope.actorId,
    mappings: [{ imConversationID: "im-synthetic", researchConversationId: scope.conversationId, transportStatus: "ready" }] };
  const replies = new Map(), requests = []; let sequence = 0;
  const researchApi = async (name, options) => {
    assert.equal(options.params.id === scope.conversationId || replies.has(options.params.id), true);
    if (name === "agentFileMessage") {
      const id = `turn-${++sequence}`, text = Buffer.from(options.body.contentBase64, "base64").toString("utf8");
      requests.push(text);
      const reply = { id: `reply-${sequence}`, turnId: id, origin: "model", text: `**合成模型验收结果${sequence}**：保留资料差异，需复核批次。` };
      replies.set(id, reply);
      return { data: { message: { sequence }, turn: { id, status: "succeeded", outputMessageId: reply.id, fileRead: { partial: false } } } };
    }
    if (name === "chatMessages") return { data: [...replies.values()], nextCursor: null };
    throw new Error("Unexpected API route " + name);
  };
  class FileReader {
    readAsDataURL(blob) { blob.text().then(text => { this.result = "data:text/markdown;base64," + Buffer.from(text).toString("base64"); this.onload(); }); }
  }
  await fs.mkdir(path.join(run, "userData"));
  const artifacts = new DesktopArtifactStore(path.join(run, "userData"));
  const { runDesktopWork, useDesktopWork } = await load("src/research/desktop-work.ts", {
    "./api": { researchApi }, "./store": { useResearchStore: { getState: () => state, subscribe() {} } },
    "./agent-progress": { registerAgentProgress() {} },
  }, { crypto: { randomUUID }, Blob, FileReader, window: { electronAPI: { createDesktopReport: (...args) => artifacts.create(...args) } } });
  await runDesktopWork({ imID: "im-synthetic", scope, folderName: "synthetic-notes", task: "比较资料差异并给出复核建议", files });
  const job = useDesktopWork.getState().jobs[0];
  assert.equal(job.phase, "succeeded", job.error);
  assert.equal(job.completed, job.total, "Successful analysis includes the completed final summary step");
  assert.equal(job.completed, requests.length, "Completed steps match actual submitted analyses and summaries");
  assert.equal(requests.length, Math.ceil(longText.length / 12000) + 2);
  assert.ok(requests.some(text => text.includes("末尾依据：样本来自批次B")));
  const reportPath = await artifacts.htmlPath(scope, job.artifact.id);
  const report = await fs.readFile(reportPath, "utf8");
  assert.match(report, /<strong>合成模型验收结果/);
  assert.match(report, /long-notes\.md/);
  assert.equal(await fs.readFile(path.join(folder, "long-notes.md"), "utf8"), longText);
  assert.equal((await new DesktopArtifactStore(path.join(run, "userData")).list(scope)).length, 1);
  await fs.writeFile(path.join(run, "core-report.json"), JSON.stringify({ status: "passed", apiModel: "synthetic", sourceFiles: files.length, actualModelSteps: requests.length, finalReport: path.relative(run, reportPath), preservedSource: true }, null, 2));
  reader.release(grant.grantId, "test-owner");
});
