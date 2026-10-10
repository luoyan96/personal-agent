import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
import ts from "typescript";
import vm from "node:vm";

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  require = createRequire(path.join(client, "package.json"));
const runtime = path.resolve(
  client,
  "../../../.runtime/skill-bundle-20261010",
  randomUUID(),
);
await fs.mkdir(runtime, { recursive: true });
const skillModule = path.join(client, "../../packages/research-skills/dist/import.cjs");
for (const name of ["skillImport", "skillBundleStore"]) {
  const source = await fs.readFile(
    path.join(client, `electron/utils/${name}.ts`),
    "utf8",
  );
  let output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  output = output
    .replaceAll(
      'require("@research-agent-platform/research-skills/import")',
      `require(${JSON.stringify(skillModule)})`,
    )
    .replaceAll("__filename", JSON.stringify(path.join(client, "package.json")));
  await fs.writeFile(
    path.join(runtime, name + ".cjs"),
    output.replace('require("./skillImport")', 'require("./skillImport.cjs")'),
  );
}
const { importSkillZipBundle, importSkillFolderBundle } = require(path.join(
  runtime,
  "skillImport.cjs",
));
const { SkillBundleStore } = require(path.join(runtime, "skillBundleStore.cjs")),
  Zip = require("adm-zip");
const sha = (data) => createHash("sha256").update(data).digest("hex");
const skill =
  "---\nname: bundle-check\ndescription: Keep exact source bytes\n---\nRead references/check.md. Scripts require an external runtime.";
function zip() {
  const z = new Zip();
  z.addFile("bundle/SKILL.md", Buffer.from(skill));
  z.addFile("bundle/references/check.md", Buffer.from("中文参考原件\n"));
  z.addFile(
    "bundle/assets/image.png",
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 255, 128]),
  );
  z.addFile("bundle/scripts/unsafe.js", Buffer.from('throw Error("MUST NOT RUN")'));
  z.addFile("bundle/LICENSE", Buffer.from("synthetic license"));
  return z.toBuffer();
}
const locator = (data) => ({
  accountKey: "https://synthetic.invalid:member1",
  skillId: "synthetic-skill",
  revision: 1,
  digest: data.manifest.packageDigest,
});

test("round-trip every original byte, ZIP, manifest categories and bounded selected asset reads", async () => {
  const original = zip(),
    data = await importSkillZipBundle(original),
    store = new SkillBundleStore(path.join(runtime, "roundtrip")),
    at = locator(data);
  assert.equal(data.manifest.files.length, 5);
  assert.equal(
    data.manifest.files.find((f) => f.path === "scripts/unsafe.js").category,
    "script",
  );
  assert.equal(await store.manifest(at), null, "preview must not install anything");
  await store.commit(data, at);
  for (const file of data.manifest.files) {
    const restored = await store.read(at, file.path);
    assert.deepEqual(restored.bytes, data.contents.get(file.path));
    assert.equal(sha(restored.bytes), file.sha256);
  }
  assert.deepEqual((await store.read(at, "$original.zip")).bytes, original);
  await assert.rejects(store.read(at, "../secret"));
  await assert.rejects(store.read(at, "assets/image.png", 2), /限制/);
  assert.equal(await store.manifest({ ...at, revision: 2 }), null);
  assert.equal(await store.manifest({ ...at, accountKey: "other-account" }), null);
  await assert.rejects(store.commit(data, { ...at, digest: "a".repeat(64) }), /不匹配/);
  const changed = await importSkillZipBundle(zip());
  changed.manifest.bundleDigest = "b".repeat(64);
  await assert.rejects(store.commit(changed, at), /不能覆盖/);
  const restored = await store.manifest(at);
  assert.equal(restored.bundleDigest, data.manifest.bundleDigest);
  const revisedZip = new Zip(original);
  revisedZip.updateFile("bundle/assets/image.png", Buffer.from("revised image"));
  const revised = await importSkillZipBundle(revisedZip.toBuffer());
  assert.equal(
    revised.manifest.packageDigest,
    data.manifest.packageDigest,
    "same instruction digest does not merge distinct asset revisions",
  );
  assert.notEqual(revised.manifest.bundleDigest, data.manifest.bundleDigest);
  await store.commit(revised, { ...at, revision: 2 });
  assert.equal(
    (await store.read({ ...at, revision: 2 }, "assets/image.png")).bytes.toString(),
    "revised image",
  );
  assert.deepEqual(
    (await store.read(at, "assets/image.png")).bytes,
    data.contents.get("assets/image.png"),
  );
  const image = data.manifest.files.find((f) => f.path === "assets/image.png");
  const dirs = await fs.readdir(path.join(runtime, "roundtrip"));
  for (const dir of dirs)
    if (
      JSON.parse(
        await fs.readFile(
          path.join(runtime, "roundtrip", dir, "manifest.json"),
          "utf8",
        ),
      ).locator.revision === 1
    )
      await fs.writeFile(
        path.join(runtime, "roundtrip", dir, image.sha256),
        Buffer.alloc(image.size),
      );
  await assert.rejects(store.read(at, image.path), /校验失败/);
});

test("folder/ZIP have same scoped digest; links, reserved names and case ambiguity rejected", async () => {
  const data = await importSkillZipBundle(zip()),
    folder = path.join(runtime, "folder");
  await fs.mkdir(folder);
  for (const [relative, bytes] of data.contents) {
    await fs.mkdir(path.dirname(path.join(folder, relative)), { recursive: true });
    await fs.writeFile(path.join(folder, relative), bytes);
  }
  const folderData = await importSkillFolderBundle(folder);
  assert.equal(folderData.manifest.bundleDigest, data.manifest.bundleDigest);
  await fs.symlink(
    runtime,
    path.join(folder, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(importSkillFolderBundle(folder), /链接/);
  for (const unsafe of [
    "../secret",
    "NUL.txt",
    "a./image.png",
    "x /a.txt",
    "A/../SKILL.md",
  ]) {
    const z = new Zip();
    z.addFile("SKILL.md", Buffer.from(skill));
    z.addFile("placeholder", Buffer.from("x"));
    z.getEntry("placeholder").entryName = unsafe;
    await assert.rejects(importSkillZipBundle(z.toBuffer()));
  }
  const duplicate = new Zip();
  duplicate.addFile("SKILL.md", Buffer.from(skill));
  duplicate.addFile("assets/A.png", Buffer.from("a"));
  duplicate.addFile("assets/a.png", Buffer.from("b"));
  await assert.rejects(importSkillZipBundle(duplicate.toBuffer()), /重复/);
});

test("fixed published upstream original archive round-trip preserves all actual assets and script bytes", async (t) => {
  const upstream =
    "D:/deepseek-agent/.runtime/private-skills-20261008/figure-skill.zip";
  try {
    await fs.access(upstream);
  } catch {
    t.skip(
      "Fixed public upstream fixture is stored outside Git; local verification only.",
    );
    return;
  }
  const proof = JSON.parse(
    await fs.readFile(
      "D:/deepseek-agent/.runtime/private-skills-20261008/github-import-proof.json",
      "utf8",
    ),
  );
  assert.equal(proof.revision, "77557418b4ca8c24fa8961206bf9b8f7f6d030e1");
  const bytes = await fs.readFile(upstream),
    data = await importSkillZipBundle(bytes),
    store = new SkillBundleStore(path.join(runtime, "upstream")),
    at = { ...locator(data), skillId: "fixed-public-upstream" };
  assert.equal(data.package.scriptCount, 33);
  assert.equal(data.package.assetCount, 3987);
  assert.equal(data.package.references.length, 120);
  await store.commit(data, at);
  for (const file of data.manifest.files)
    assert.equal(
      sha((await store.read(at, file.path, 100 * 1024 * 1024)).bytes),
      file.sha256,
    );
  assert.equal(sha((await store.read(at, "$original.zip")).bytes), sha(bytes));
  await fs.writeFile(
    path.join(runtime, "upstream-proof.json"),
    JSON.stringify(
      {
        sourceRevision: proof.revision,
        files: data.manifest.files.length,
        assets: data.package.assetCount,
        scripts: data.package.scriptCount,
        archiveSha256: sha(bytes),
        bundleDigest: data.manifest.bundleDigest,
        allFilesRoundTrip: true,
        executed: false,
      },
      null,
      2,
    ),
  );
});

test("native bridge rejects foreign frames, cancel/discard never persist, install and original save recheck page identity", async () => {
  const handlers = new Map(),
    userData = path.join(runtime, "native-user-data");
  await fs.mkdir(userData);
  const frame = { processId: 1, routingId: 2, url: "https://synthetic.invalid/app" };
  let currentUrl = frame.url,
    canceled = true,
    folder = path.join(runtime, "native-selected");
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, "SKILL.md"), skill);
  const content = {
    id: 17,
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    getURL: () => currentUrl,
  };
  const event = { sender: content, senderFrame: frame };
  const raw = await fs.readFile(
    path.join(client, "electron/main/skillManage.ts"),
    "utf8",
  );
  const output = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
  const exports = {};
  const electron = {
    app: { getPath: () => userData },
    ipcMain: { handle: (name, callback) => handlers.set(name, callback) },
    dialog: {
      showOpenDialog: async () => ({ canceled, filePaths: [folder] }),
      showSaveDialog: async () => {
        currentUrl = "https://foreign.invalid";
        return { canceled: false, filePath: path.join(runtime, "must-not-save") };
      },
    },
  };
  vm.runInNewContext(output, {
    exports,
    setTimeout,
    Date,
    Buffer,
    URL,
    require: (name) =>
      name === "electron"
        ? electron
        : name === "./windowManage"
        ? {
            getWebContents: () => content,
            getResearchServiceStatus: () => ({
              connected: true,
              error: "",
              rendererOrigin: "https://synthetic.invalid",
              address: "https://synthetic.invalid/",
            }),
          }
        : name === "../utils/skillImport"
        ? require(path.join(runtime, "skillImport.cjs"))
        : name === "../utils/skillBundleStore"
        ? { SkillBundleStore }
        : require(name),
  });
  exports.registerSkillBridge();
  for (const name of handlers.keys())
    await assert.rejects(
      Promise.resolve().then(() =>
        handlers.get(name)({ sender: {}, senderFrame: frame }, "folder"),
      ),
      /当前页面/,
    );
  assert.equal(await handlers.get("import-private-skill")(event, "folder"), null);
  await assert.rejects(fs.access(path.join(userData, "private-skill-bundles")));
  canceled = false;
  const draft = await handlers.get("import-private-skill")(event, "folder"),
    at = {
      accountKey: "synthetic-account",
      skillId: "native-skill",
      revision: 1,
      digest: draft.localBundle.manifest.packageDigest,
    };
  await handlers.get("discard-skill-bundle")(event, draft.localBundle.token);
  await assert.rejects(
    handlers.get("commit-skill-bundle")(event, draft.localBundle.token, at),
    /失效/,
  );
  await assert.rejects(fs.access(path.join(userData, "private-skill-bundles")));
  const next = await handlers.get("import-private-skill")(event, "folder");
  await assert.rejects(
    handlers.get("commit-skill-bundle")(event, next.localBundle.token, {
      ...at,
      accountKey: "https://forged.invalid:synthetic-account",
    }),
    /账号标识/,
  );
  await handlers.get("commit-skill-bundle")(event, next.localBundle.token, at);
  const persistedDirectory = (
    await fs.readdir(path.join(userData, "private-skill-bundles"))
  ).find((name) => /^[a-f0-9]{64}$/.test(name));
  const persisted = JSON.parse(
    await fs.readFile(
      path.join(userData, "private-skill-bundles", persistedDirectory, "manifest.json"),
      "utf8",
    ),
  );
  assert.equal(
    persisted.locator.accountKey,
    "https://synthetic.invalid:synthetic-account",
    "service origin comes from the main process, not renderer configuration IPC",
  );
  assert.equal(
    (await handlers.get("skill-bundle-manifest")(event, at)).files.length,
    1,
  );
  assert.equal(
    Buffer.from(
      (await handlers.get("read-skill-bundle-asset")(event, at, "SKILL.md")).base64,
      "base64",
    ).toString(),
    skill,
  );
  await assert.rejects(
    handlers.get("save-skill-bundle-asset")(event, at, "SKILL.md"),
    /当前页面/,
  );
  await assert.rejects(fs.access(path.join(runtime, "must-not-save")));
});
