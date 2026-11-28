import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { libraryFixture, libraryRuntime, sha } from "./helpers/team-library.mjs";

const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("vite"))("esbuild");
const client = fileURLToPath(new URL("../", import.meta.url));
const code = (await build({
  entryPoints: [path.join(client, "electron/main/dshWorkbenchMaterials.ts")],
  bundle: true, platform: "node", format: "cjs", write: false,
  external: ["electron", "./localDshRuntime"],
  plugins: [{ name: "isolated-team-session", setup(builder) {
    builder.onLoad({ filter: /teamLibraryManage\.ts$/ }, () => ({
      contents: "export const inContext = (_event, action) => globalThis.teamSession(action);", loader: "js",
    }));
  } }],
})).outputFiles[0].text;

async function fixture(t) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), "dsh-workbench-sources-"));
  t.after(() => fs.rm(userData, { recursive: true, force: true }));
  const git = await libraryFixture(t);
  const identity = "a".repeat(64);
  const own = path.join(userData, "personal-files", identity, "myfiles");
  const other = path.join(userData, "personal-files", "b".repeat(64), "myfiles");
  await fs.mkdir(own, { recursive: true });
  await fs.mkdir(other, { recursive: true });
  await fs.writeFile(path.join(other, "other-account.txt"), "separate account");
  await fs.writeFile(path.join(own, "personal-notes.txt"), "Selected personal notes.");
  await fs.writeFile(path.join(own, "template.pptx"), "Selected PPT template.");
  await fs.writeFile(path.join(own, "template.dotx"), "Selected Word template.");
  const big = await fs.open(path.join(own, "over-limit.pptx"), "w");
  try { await big.truncate(80 * 1024 * 1024 + 1); } finally { await big.close(); }
  await fs.symlink(other, path.join(own, "outside"), process.platform === "win32" ? "junction" : "dir");

  const libraryBytes = Buffer.from("%PDF-1.7 synthetic source for exact byte transfer");
  const createdAt = new Date().toISOString();
  const collection = { id: "library", ownerId: "member_A", labId: "lab_synthetic", name: "阅读资料", description: "", scope: "owner_private",
    taskIds: [], version: 1, status: "available", owned: true, fileCount: 1, createdAt, updatedAt: createdAt };
  const taskCollection = { ...collection, id: "task_only", scope: "task_scoped", taskIds: ["a_task"] };
  const paper = { id: "paper", collectionId: collection.id, status: "available", owned: true,
    version: 1, filename: "paper.pdf", mediaType: "application/pdf", byteLength: libraryBytes.length, sha256: sha(libraryBytes),
    extraction: "text_extracted", extractionReason: null, pageCount: 1, characterCount: 1, createdAt,
    metadata: { title: "Synthetic reference", authors: ["A. Example"], year: 2026, doi: "10.123/example", tags: ["test"], note: "登记的阅读笔记。" } };
  const routes = [], prompts = [], handlers = new Map(), contents = {};
  let approved = true, accountActive = true, requestCallback, promptCallback;
  const account = {
    identity, lease: "synthetic-account-lease", metadata: { memberId: "member_A" },
    request(url) {
      assert.match(url, /^\/api\/v1\/research-library\//);
      const request = new EventEmitter();
      request.setHeader = (name, value) => assert.deepEqual([name, value], ["X-AcceptCat-Originals", "chunked-v1"]);
      request.abort = () => {};
      request.end = () => queueMicrotask(() => {
        routes.push(url);
        const response = new EventEmitter();
        let body;
        if (url.includes("/collections?")) body = { data: [collection, taskCollection] };
        else if (url.endsWith("/collections/library/files?limit=100")) body = { data: [paper] };
        else if (url.endsWith("/files/paper")) body = { data: { file: paper } };
        else if (url.endsWith("/files/paper/content?version=1")) body = libraryBytes;
        response.statusCode = body ? 200 : 403;
        request.emit("response", response);
        if (body) response.emit("data", Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body)));
        requestCallback?.(url);
        response.emit("end");
      });
      return request;
    },
  };
  const valid = async () => { if (!accountActive) throw Error("DeepChat 登录已变化。"); };
  const mod = { exports: {} };
  vm.runInNewContext(code, {
    module: mod, exports: mod.exports, process, Buffer, URL, setTimeout, clearTimeout,
    require: (id) => {
      if (id === "./localDshRuntime") return libraryRuntime;
      if (id !== "electron") return require(id);
      return {
        app: { getPath: () => userData },
        BrowserWindow: { fromWebContents: () => ({ isDestroyed: () => false }) },
        ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
        dialog: { showMessageBox: async (_window, options) => {
          prompts.push(options);
          promptCallback?.(options);
          return { response: approved ? 1 : 0 };
        } },
      };
    },
    teamSession: (action) => action({ identity: "team_1", memberId: "member_A", store: git.store }),
  });
  const connection = async (event) => {
    await valid();
    return { account, hostEvent: { sender: {} }, contents: event.contents, valid };
  };
  const bridge = mod.exports.registerDshWorkbenchMaterialBridge(connection);
  const call = (method, input, view = contents) => handlers.get(`dsh-workbench-materials-${method}`)({ contents: view }, input);
  return { git, own, routes, prompts, paper, collection, call, libraryBytes,
    stage: async (target, source) => bridge.stageUseIn(await connection({ contents }), target, source),
    renewLease: () => { account.lease += "-new"; },
    approve: (value) => { approved = value; },
    expire: () => { accountActive = false; },
    onRequest: (callback) => { requestCallback = callback; },
    onPrompt: (callback) => { promptCallback = callback; },
  };
}

const persistedBytes = (result) => Buffer.from(new Uint8Array(result.bytes));
const find = (listing, name) => listing.items.find((item) => item.name === name);

test("lists only scoped material metadata on approval and accepts a single mixed template and references transfer", async (t) => {
  const f = await fixture(t);
  f.approve(false);
  await assert.rejects(f.call("list", { kind: "reference" }), /已取消/);
  assert.equal(f.git.commands.length, 0);
  assert.equal(f.routes.length, 0);
  f.approve(true);
  await assert.rejects(f.call("list", { kind: "template", extensions: [".exe"] }), /格式无效/);
  const templates = await f.call("list", { kind: "template", extensions: [".pptx", ".potx"] });
  const ppt = find(templates, "template.pptx");
  assert.ok(ppt);
  assert.equal(find(templates, "template.dotx"), undefined);
  assert.equal(find(templates, "over-limit.pptx"), undefined);
  assert.ok(templates.warnings.some((warning) => warning.includes("80 MiB")));
  const refs = await f.call("list", { kind: "reference" });
  const note = find(refs, "personal-notes.txt");
  const git = find(refs, "项目要求.md");
  const paper = find(refs, "paper.pdf");
  const metadata = find(refs, "Synthetic reference");
  assert.equal(note.availability, "text");
  assert.equal(git.source, "team");
  assert.equal(git.provenance.kind, "team-git");
  assert.equal(git.provenance.path.split("/").at(-1), "项目要求.md");
  assert.match(git.provenance.repository, /^github\.com\/[^/]+\/[^/]+$/);
  assert.match(git.provenance.revision, /^[a-f0-9]{40}$/);
  assert.equal(paper.availability, "file");
  assert.equal(metadata.availability, "metadata");
  assert.ok(refs.items.every((item) => !("bytes" in item) && !item.path?.includes(f.own)));
  assert.equal(find(refs, "other-account.txt"), undefined);
  assert.ok(f.routes.every((route) => !/task_only|\/content/.test(route)));
  assert.equal(find(await f.call("list", { kind: "reference" }), "personal-notes.txt").id, note.id);

  const mixed = { selections: [
    { kind: "template", id: ppt.id }, { kind: "reference", id: note.id },
    { kind: "reference", id: git.id }, { kind: "reference", id: paper.id }, { kind: "reference", id: metadata.id },
  ] };
  await assert.rejects(f.call("read-many", mixed, {}), /选择已失效/);
  await assert.rejects(f.call("read", { kind: "template", id: git.id }), /选择已失效/);
  await assert.rejects(f.call("read", { kind: "reference", id: f.own }), /选择无效/);
  f.approve(false);
  await assert.rejects(f.call("read-many", mixed), /已取消/);
  assert.ok(f.routes.every((route) => !route.includes("/content")));
  f.approve(true);
  const before = f.prompts.length;
  const output = await f.call("read-many", mixed);
  assert.equal(f.prompts.length, before + 1);
  assert.match(f.prompts.at(-1).detail, /template\.pptx[\s\S]+personal-notes\.txt[\s\S]+项目要求\.md[\s\S]+paper\.pdf/);
  assert.deepEqual(JSON.parse(JSON.stringify(output.map(({ kind, id }) => ({ kind, id })))), mixed.selections);
  assert.equal(persistedBytes(output[0]).toString(), "Selected PPT template.");
  assert.equal(persistedBytes(output[1]).toString(), "Selected personal notes.");
  assert.equal(persistedBytes(output[2]).toString(), f.git.text);
  assert.deepEqual(persistedBytes(output[3]), f.libraryBytes);
  assert.equal(output[4].name, "paper-资料记录.md");
  assert.match(persistedBytes(output[4]).toString(), /书目信息[\s\S]+10\.123\/example[\s\S]+登记的阅读笔记/);
  const word = find(await f.call("list", { kind: "template", extensions: [".docx", ".dotx"] }), "template.dotx");
  assert.equal(persistedBytes(await f.call("read", { kind: "template", id: word.id })).toString(), "Selected Word template.");
});

test("rechecks live Git, source revisions, collection scope, and the account lease before disclosing bytes", async (t) => {
  const f = await fixture(t);
  const refs = await f.call("list", { kind: "reference" });
  const read = (name) => f.call("read", { kind: "reference", id: find(refs, name).id });
  await fs.writeFile(path.join(f.own, "personal-notes.txt"), "Different revision and different length.");
  await assert.rejects(read("personal-notes.txt"), /权限、文件版本或大小/);
  f.git.offline(true);
  await assert.rejects(read("项目要求.md"), /权限、文件版本或大小/);
  f.git.offline(false);
  f.onRequest((url) => {
    if (url.endsWith("/content?version=1")) {
      f.collection.scope = "task_scoped";
      f.collection.taskIds = ["some_task"];
    }
  });
  await assert.rejects(read("paper.pdf"), /权限、文件版本或大小/);
  await assert.rejects(read("Synthetic reference"), /权限、文件版本或大小/);
  f.onPrompt(() => f.expire());
  const requestCount = f.routes.length;
  await assert.rejects(read("paper.pdf"), /登录已变化/);
  assert.equal(f.routes.length, requestCount);
});

test("stages only selected workbench references and combines a master and references in one authorized transfer", async (t) => {
  const f = await fixture(t);
  const templates = await f.call("list", { kind: "template", extensions: [".pptx"] });
  const master = find(templates, "template.pptx");
  const git = find(await f.call("list", { kind: "reference" }), "项目要求.md");
  await assert.rejects(f.stage("group-meeting", { source: "team-git", revision: "0".repeat(40), paths: [git.path] }), /版本已变化/);
  await f.stage("group-meeting", { source: "team-git", revision: git.provenance.revision, paths: [git.path] });
  const pending = await f.call("pending-use-in");
  assert.equal(pending.target, "group-meeting");
  assert.equal(pending.items[0].provenance.path, git.provenance.path);
  assert.equal(await f.call("pending-use-in", null, {}), null);
  await assert.rejects(f.call("read-use-in", { id: pending.id, selectionIds: [git.id] }), /资料选择无效/);
  const request = { id: pending.id, selectionIds: [pending.items[0].id], selections: [{ kind: "template", id: master.id }] };
  f.approve(false);
  await assert.rejects(f.call("read-use-in", request), /已取消/);
  assert.equal((await f.call("pending-use-in")).id, pending.id);
  f.approve(true);
  const before = f.prompts.length;
  const output = await f.call("read-use-in", request);
  assert.equal(f.prompts.length, before + 1);
  assert.equal(persistedBytes(output[0]).toString(), "Selected PPT template.");
  assert.equal(persistedBytes(output[1]).toString(), f.git.text);
  await f.call("clear-use-in", { id: pending.id });
  assert.equal(await f.call("pending-use-in"), null);

  await fs.mkdir(path.join(f.own, "folder"));
  const file = path.join(f.own, "folder", "notes.txt");
  await fs.writeFile(file, "Private notes.");
  const stat = await fs.stat(file);
  const selected = { source: "personal", files: [{ rel: path.relative(f.own, file), size: stat.size, updatedAt: stat.mtime.toISOString() }] };
  await f.stage("existing-document", selected);
  assert.equal((await f.call("pending-use-in")).items[0].name, "notes.txt");
  f.renewLease();
  assert.equal(await f.call("pending-use-in"), null);
});
