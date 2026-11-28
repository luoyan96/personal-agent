import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, rm, realpath, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import vm from "node:vm";
import ts from "typescript";

const realRequire = createRequire(import.meta.url);

async function load(file, dependencies = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        // Default imports of node builtins need the interop helper in this realm.
        esModuleInterop: true,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => dependencies[name] ?? realRequire(name),
      Buffer, URL, setTimeout, clearTimeout,
    },
    { filename: file },
  );
  return module.exports;
}

const library = await load("../electron/utils/localLibrary.ts");
const { insideRoot, resolveInRoot, libraryFileName, scanLibrary } = library;

test("a relative path can never escape the registered folder", () => {
  const root = path.resolve("/data/lab");
  assert.equal(insideRoot(root, path.join(root, "模板/母版.pptx")), true);
  assert.equal(insideRoot(root, path.resolve("/data/other/x.pptx")), false);
  assert.equal(insideRoot(root, root), false);
  assert.equal(resolveInRoot(root, "模板/母版.pptx"), path.join(root, "模板/母版.pptx"));
  assert.throws(() => resolveInRoot(root, "../secret.pptx"), /不在登记/);
});

test("only the file name is shown, never the absolute path", () => {
  assert.equal(libraryFileName("模板/组会母版.pptx"), "组会母版.pptx");
  assert.equal(libraryFileName("组会母版.pptx"), "组会母版.pptx");
});

test("scanning lists documents and images, skips noise and stays relative", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "local-library-"));
  try {
    await writeFile(path.join(root, "组会母版.pptx"), "x");
    await writeFile(path.join(root, "notes.md"), "y");
    await writeFile(path.join(root, "tool.exe"), "z");
    await mkdir(path.join(root, "图"));
    await writeFile(path.join(root, "图", "技术路线.png"), "w");
    await mkdir(path.join(root, ".git"));
    await writeFile(path.join(root, ".git", "config.md"), "hidden");
    const manifest = await scanLibrary(root);
    const rels = manifest.files.map((file) => file.rel).sort();
    assert.deepEqual(JSON.parse(JSON.stringify(rels)), [
      "notes.md",
      path.join("图", "技术路线.png"),
      "组会母版.pptx",
    ]);
    assert.equal(manifest.truncated, false);
    assert.equal(manifest.name, path.basename(root));
    // Every entry is relative, so a template stays portable between machines.
    for (const file of manifest.files) assert.equal(path.isAbsolute(file.rel), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function desktop(t) {
  const profile = await mkdtemp(path.join(tmpdir(), "myfiles-profile-"));
  t.after(() => rm(profile, { recursive: true, force: true }));
  const userData = await realpath(profile);
  const appPath = path.join(userData, "packaged", "resources", "app.asar");
  const handlers = new Map();
  const opened = [], revealed = [];
  let service = "https://fixture.example", token, network = true, lookups = 0;
  let pick = () => ({ canceled: true, filePaths: [] });
  const members = new Map([
    ["token_for_alice_1", "member_A"],
    ["token_for_alice_2", "member_A"],
    ["token_for_bob___1", "member_B"],
  ]);
  const auth = {
    owner: "trusted-main-frame",
    contents: {
      getURL: () => "http://127.0.0.1:4321",
      session: { cookies: { get: async ({ name }) => token ? [{ name, value: token, httpOnly: true }] : [] } },
    },
  };
  const trusted = {};
  const electron = {
    app: { isPackaged: true, getPath: () => userData, getAppPath: () => appPath },
    BrowserWindow: { fromWebContents: () => ({ isDestroyed: () => false }) },
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    dialog: { showOpenDialog: () => pick() },
    shell: {
      openPath: async (root) => { opened.push(root); return ""; },
      showItemInFolder: (file) => revealed.push(file),
    },
    net: { request: ({ url }) => {
      assert.equal(url, service + "/api/v1/auth/session");
      lookups++;
      const request = new EventEmitter();
      let account;
      request.setHeader = (name, value) => {
        if (name === "Cookie") account = members.get(value.replace(/^rap_session=/, ""));
      };
      request.abort = () => {};
      request.end = () => queueMicrotask(() => {
        if (!network) { request.emit("error", new Error("offline")); return; }
        const response = new EventEmitter();
        response.statusCode = account ? 200 : 401;
        request.emit("response", response);
        response.emit("data", Buffer.from(JSON.stringify({ data: { member: { id: account } } })));
        response.emit("end");
      });
      return request;
    } },
  };
  const account = await load("../electron/main/desktopAccount.ts", {
    electron,
    "../utils/desktopServer": { desktopSessionCookie: () => "fixture_cookie" },
    "./localFolderManage": { authority: (event) => {
      if (event !== trusted) throw Error("forbidden frame");
      return auth;
    } },
    "./windowManage": { getResearchServiceStatus: () => ({ address: service }) },
  });
  const { registerLocalLibraryBridge } = await load("../electron/main/localLibraryManage.ts", {
    electron,
    "../utils/localLibrary": library,
    "./desktopAccount": account,
  });
  registerLocalLibraryBridge();
  return {
    userData, appPath, opened, revealed,
    lookups: () => lookups,
    login: (value) => { token = value; },
    changeService: (address) => { service = address; },
    setNetwork: (online) => { network = online; },
    setPicker: (run) => { pick = run; },
    call: (name, ...args) => handlers.get(name)(trusted, ...args),
    foreign: (name) => handlers.get(name)({}),
  };
}

test("a verified desktop account gets a writable myfiles folder and can use it offline", async (t) => {
  const f = await desktop(t);
  await assert.rejects(f.foreign("personal-library-status"), /forbidden frame/);
  await assert.rejects(f.call("personal-library-status"), /请登录/);
  f.login("token_for_alice_1");
  const [status, manifest] = await Promise.all([
    f.call("personal-library-status"), f.call("personal-library-scan"),
  ]);
  const alice = status.root;
  assert.equal(status.available, true);
  assert.equal(path.basename(alice), "myfiles");
  assert.equal(path.dirname(path.dirname(alice)), path.join(f.userData, "personal-files"));
  assert.equal(alice.startsWith(f.appPath), false);
  assert.equal(manifest.root, alice);
  assert.equal(manifest.files.length, 0);
  assert.equal(f.lookups(), 1);

  await writeFile(path.join(alice, "saved.zip"), "synthetic archived bytes");
  await writeFile(path.join(alice, "empty.R"), "");
  f.setNetwork(false);
  assert.deepEqual(Array.from((await f.call("personal-library-scan")).files, ({ name }) => name).sort(), ["empty.R", "saved.zip"]);
  await f.call("personal-library-open-folder");
  await f.call("personal-library-reveal-file", "saved.zip");
  assert.deepEqual(f.opened, [alice]);
  assert.deepEqual(f.revealed, [path.join(alice, "saved.zip")]);
  assert.equal(f.lookups(), 1);

  f.login(undefined);
  await assert.rejects(f.call("personal-library-scan"), /请登录/);
  f.login("token_for_bob___1");
  await assert.rejects(f.call("personal-library-scan"), /账号/);
  f.setNetwork(true);
  const bob = await f.call("personal-library-scan");
  assert.notEqual(bob.root, alice);
  assert.equal(bob.files.length, 0);
  await assert.rejects(f.call("personal-library-reveal-file", path.relative(bob.root, path.join(alice, "saved.zip"))), /不在登记/);
  f.login("token_for_alice_2");
  assert.equal((await f.call("personal-library-status")).root, alice);
  f.changeService("https://other.example");
  assert.notEqual((await f.call("personal-library-status")).root, alice);
});

test("native Add Files copies regular files without overwriting and fences a changed login", async (t) => {
  const f = await desktop(t);
  f.login("token_for_alice_1");
  const { root } = await f.call("personal-library-status");
  const source = path.join(f.userData, "data.ipynb");
  const empty = path.join(f.userData, "empty.csv");
  await writeFile(source, "new bytes");
  await writeFile(empty, "");
  await writeFile(path.join(root, "data.ipynb"), "previous bytes");
  assert.equal(await f.call("personal-library-add-files"), null);
  f.setPicker(() => ({ canceled: false, filePaths: [source, empty] }));
  const manifest = await f.call("personal-library-add-files");
  assert.equal(manifest.files.length, 3);
  assert.equal(await readFile(path.join(root, "data.ipynb"), "utf8"), "previous bytes");
  assert.equal(await readFile(path.join(root, "data (2).ipynb"), "utf8"), "new bytes");
  assert.equal(await readFile(path.join(root, "empty.csv"), "utf8"), "");

  const extra = path.join(f.userData, "private.txt");
  await writeFile(extra, "synthetic private record");
  f.setPicker(() => ({ canceled: false, filePaths: [extra, f.userData] }));
  await assert.rejects(f.call("personal-library-add-files"), /请选择普通文件/);
  await assert.rejects(readFile(path.join(root, "private.txt")), { code: "ENOENT" });

  f.setPicker(() => {
    f.login("token_for_bob___1");
    return { canceled: false, filePaths: [extra] };
  });
  await assert.rejects(f.call("personal-library-add-files"), /登录已变化/);
  await assert.rejects(readFile(path.join(root, "private.txt")), { code: "ENOENT" });
  assert.equal((await f.call("personal-library-scan")).files.length, 0);
});

test("existing team folders retain their files while private paths and links stay out", async (t) => {
  const f = await desktop(t);
  const settings = path.join(f.userData, "local-library.json");
  const original = path.join(f.userData, "team.pdf");
  await writeFile(settings, JSON.stringify({ root: f.userData }));
  await writeFile(original, "synthetic team original");
  f.login("token_for_alice_1");
  const { root } = await f.call("personal-library-status");
  const privateFile = path.join(root, "personal.pdf");
  await writeFile(privateFile, "synthetic private original");
  await symlink(f.userData, path.join(root, "escape"), "junction");
  assert.equal((await f.call("local-library-status")).root, f.userData);
  assert.deepEqual(Array.from((await f.call("local-library-scan")).files, ({ name }) => name), ["team.pdf"]);
  assert.equal((await f.call("personal-library-scan")).files.length, 1);
  await assert.rejects(f.call("local-library-hash", path.relative(f.userData, privateFile)), /位于个人资料/);
  await assert.rejects(f.call("personal-library-reveal-file", path.join("escape", "team.pdf")), /不能通过链接/);
  assert.deepEqual(f.revealed, []);
  f.setPicker(() => ({ canceled: false, filePaths: [root] }));
  await assert.rejects(f.call("local-library-pick"), /课题组资料/);
  assert.equal(JSON.parse(await readFile(settings, "utf8")).root, f.userData);
  assert.equal(await readFile(original, "utf8"), "synthetic team original");
});
