import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { EventEmitter } from "node:events";
import ts from "typescript";
import vm from "node:vm";

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(client, "package.json"));
const Zip = require("adm-zip");
const parser = require(path.join(
  client,
  "../../packages/research-skills/dist/import.cjs",
));
const source = await fs.readFile(
  path.join(client, "electron/utils/skillImport.ts"),
  "utf8",
);
function moduleFrom(text, dependency) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(text, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText,
    {
      exports,
      require: dependency,
      __filename: path.join(client, "package.json"),
      Buffer,
      TextDecoder,
      URL,
      setTimeout,
      clearTimeout,
      Date,
    },
  );
  return exports;
}
function importer(files = [{ name: "SKILL.md", type: "file" }]) {
  const requests = [];
  const download = (url, _options, response) => {
    requests.push(String(url));
    const req = new EventEmitter();
    req.destroy = () => {};
    req.end = () =>
      queueMicrotask(() => {
        const raw = String(url).includes("raw.githubusercontent.com");
        const res = new EventEmitter();
        res.statusCode = raw && !files.length ? 404 : 200;
        res.resume = () => {};
        response(res);
        res.emit(
          "data",
          Buffer.from(
            raw
              ? skill
              : JSON.stringify(
                  String(url).includes("/commits/") ? { sha: "a".repeat(40) } : files,
                ),
          ),
        );
        res.emit("end");
      });
    return req;
  };
  return {
    requests,
    ...moduleFrom(source, (name) =>
      name === "node:https"
        ? { request: download }
        : name === "@research-agent-platform/research-skills/import"
        ? parser
        : require(name),
    ),
  };
}
const skill =
  "---\nname: synthetic-workflow\ndescription: Review synthetic inputs only\n---\nUse references/context.md. Never execute scripts automatically.";
const archive = () => {
  const zip = new Zip();
  zip.addFile("repo-commit/LICENSE", Buffer.from("Synthetic root license"));
  zip.addFile("repo-commit/skills/NOTICE", Buffer.from("Synthetic parent notice"));
  zip.addFile("repo-commit/skills/chosen/SKILL.md", Buffer.from(skill));
  zip.addFile(
    "repo-commit/skills/chosen/references/context.md",
    Buffer.from("合成参考资料"),
  );
  zip.addFile(
    "repo-commit/skills/chosen/scripts/check.py",
    Buffer.from('raise Exception("MUST NOT EXECUTE")'),
  );
  zip.addFile("repo-commit/skills/other/SKILL.md", Buffer.from(skill));
  return zip;
};

test("pinned subdirectory source is reviewed at the supplied commit, without resolving HEAD", async () => {
  const imp = importer();
  const result = await imp.githubSkillOptions(
    "https://github.com/synthetic/repo/tree/" + "b".repeat(40) + "/skills/chosen",
  );
  assert.equal(imp.requests.length, 1);
  assert.equal(
    imp.requests[0],
    "https://raw.githubusercontent.com/synthetic/repo/" +
      "b".repeat(40) +
      "/skills/chosen/SKILL.md",
  );
  assert.equal(result.revision, "b".repeat(40));
  assert.equal(result.options[0].root, "skills/chosen");
  assert.equal(
    result.options[0].url,
    "https://codeload.github.com/synthetic/repo/zip/" + "b".repeat(40),
  );
  const root = importer();
  assert.equal(
    (await root.githubSkillOptions("https://github.com/synthetic/repo.git/")).repo,
    "synthetic/repo",
  );
  assert.equal(root.requests.length, 2);
});

test("reject unpinned, traversal, unsupported source and missing instruction before download", async () => {
  const imp = importer();
  for (const url of [
    "https://github.com/synthetic/repo/tree/main/skills/a",
    "https://github.com/synthetic/repo/tree/" + "b".repeat(40) + "/skills/%2e%2e/a",
    "https://github.com/synthetic/repo?token=x",
    "https://outside.invalid/repo",
    "https://github.com/synthetic/repo/tree/" + "b".repeat(40) + "/skills/%2fa",
  ])
    await assert.rejects(imp.githubSkillOptions(url));
  assert.equal(imp.requests.length, 0);
  await assert.rejects(
    importer([]).githubSkillOptions(
      "https://github.com/synthetic/repo/tree/" + "b".repeat(40) + "/skills/a",
    ),
    /404/,
  );
});

test("selected ZIP imports only selected workflow, preserves ancestor notices and complete original archive", async () => {
  const zip = archive().toBuffer();
  const result = await importer().importSkillZipBundle(zip, "skills/chosen");
  assert.equal(result.package.name, "synthetic-workflow");
  assert.equal(result.package.scriptCount, 1);
  assert.equal(result.package.references.length, 1);
  assert.deepEqual(result.originalZip, zip);
  assert.deepEqual([...result.contents.keys()].sort(), [
    "SKILL.md",
    "_upstream-notices/0/LICENSE",
    "_upstream-notices/1/NOTICE",
    "references/context.md",
    "scripts/check.py",
  ]);
  assert.equal(
    result.contents.get("_upstream-notices/0/LICENSE").toString(),
    "Synthetic root license",
  );
  await assert.rejects(importer().importSkillZipBundle(zip), /单个/);
});

test("subdirectory selection preserves full-archive size/path/link guards and rejects wrong folder", async () => {
  const imp = importer();
  await assert.rejects(
    imp.importSkillZipBundle(archive().toBuffer(), "skills/missing"),
    /SKILL.md/,
  );
  await assert.rejects(
    imp.importSkillZipBundle(archive().toBuffer(), "skills/../chosen"),
  );
  const huge = archive();
  huge.addFile("repo-commit/ignored.bin", Buffer.alloc(1));
  const bytes = huge.toBuffer();
  const marker = Buffer.from([0x50, 0x4b, 0x01, 0x02]);
  for (let at = bytes.indexOf(marker); at >= 0; at = bytes.indexOf(marker, at + 4)) {
    const name = bytes
      .subarray(at + 46, at + 46 + bytes.readUInt16LE(at + 28))
      .toString();
    if (name === "repo-commit/ignored.bin")
      bytes.writeUInt32LE(101 * 1024 * 1024, at + 24);
  }
  await assert.rejects(imp.importSkillZipBundle(bytes, "skills/chosen"), /100 MB/);
  const linked = archive().toBuffer();
  for (let at = linked.indexOf(marker); at >= 0; at = linked.indexOf(marker, at + 4)) {
    const name = linked
      .subarray(at + 46, at + 46 + linked.readUInt16LE(at + 28))
      .toString();
    if (name === "repo-commit/skills/other/SKILL.md")
      linked.writeUInt32LE(0xa0000000, at + 38);
  }
  await assert.rejects(imp.importSkillZipBundle(linked, "skills/chosen"), /符号链接/);
  const many = archive();
  many.addFile("other-root/x", Buffer.from("x"));
  await assert.rejects(
    imp.importSkillZipBundle(many.toBuffer(), "skills/chosen"),
    /根目录/,
  );
});

test("catalog keeps original pinned sources distinct from callable abilities and private content", async () => {
  const feedCopy = moduleFrom(
    await fs.readFile(
      path.join(client, "src/research/capability-feed-copy.ts"),
      "utf8",
    ),
    require,
  );
  const catalog = moduleFrom(
    await fs.readFile(
      path.join(client, "src/research/community-research-catalog.ts"),
      "utf8",
    ),
    (name) => (name === "./capability-feed-copy" ? feedCopy : require(name)),
  );
  const entries = moduleFrom(
    await fs.readFile(
      path.join(client, "../../apps/api/src/community-catalog-seed.ts"),
      "utf8",
    ),
    require,
  ).communityCatalogSeed;
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  for (const entry of entries) {
    assert.match(entry.revision, /^[a-f0-9]{40}$/);
    assert.match(
      catalog.communitySourceUrl(entry),
      /^https:\/\/github.com\/[^/]+\/[^/]+\/tree\/[a-f0-9]{40}\//,
    );
    assert(
      entry.validation &&
        entry.limitations &&
        entry.costs &&
        entry.materials &&
        entry.license,
    );
    assert(!("instructions" in entry));
  }
  assert.equal(entries.find((e) => e.id === "zotero-mcp").installable, false);
  assert.equal(entries.find((e) => e.id === "peer-review").installable, true);
  assert.equal(entries.find((e) => e.id === "paperqa2").installable, false);
  assert.equal(entries.find((e) => e.id === "paperqa2").status, "needs_connector");
  const critical = entries.find((e) => e.id === "scientific-critical-thinking");
  assert.equal(critical.installable, true);
  assert.equal(critical.status, "offline_reviewed");
  assert.equal(critical.category, "研究设计");
  assert.match(critical.limitations, /统计计算/);
  const toolkit = entries.find((e) => e.id === "research-toolkit");
  assert.equal(toolkit.installable, false);
  assert.equal(toolkit.status, "needs_connector");
  assert.match(toolkit.prerequisites, /嵌套 SKILL.md/);
  assert.equal(
    entries.find((e) => e.id === "unknown"),
    undefined,
  );
  assert.equal(
    catalog.matchingCommunityEntries(entries, "全部", "  ZOTERO  ").length,
    1,
  );
  assert.equal(
    catalog.matchingCommunityEntries(entries, "文献与阅读", "科研稿件").length,
    0,
  );
  assert.equal(
    catalog.matchingCommunityEntries(entries, "文献与阅读", "  PAPERQA2  ").length,
    1,
  );
  assert.equal(
    catalog.matchingCommunityEntries(entries, "写作与表达", "主张").length,
    3,
  );
  assert.equal(
    catalog.matchingCommunityEntries(entries, "全部", "投稿")[0].id,
    "scientific-writing",
  );
});

test("main process retains selected root; renderer cannot forge a URL, selection or frame", async () => {
  const handlers = new Map(),
    imported = [],
    sha = "b".repeat(40);
  const frame = { processId: 1, routingId: 2, url: "https://synthetic.invalid/" };
  const content = {
    id: 1,
    mainFrame: frame,
    isDestroyed: () => false,
    isLoadingMainFrame: () => false,
    getURL: () => frame.url,
  };
  const event = { sender: content, senderFrame: frame };
  const bridge = moduleFrom(
    await fs.readFile(path.join(client, "electron/main/skillManage.ts"), "utf8"),
    (name) =>
      name === "electron"
        ? {
            app: { getPath: () => "unused-synthetic" },
            dialog: {},
            ipcMain: { handle: (name, fn) => handlers.set(name, fn) },
          }
        : name === "./windowManage"
        ? {
            getWebContents: () => content,
            getResearchServiceStatus: () => ({
              connected: true,
              rendererOrigin: "https://synthetic.invalid",
              address: "https://synthetic.invalid/",
            }),
          }
        : name === "../utils/skillBundleStore"
        ? { SkillBundleStore: class {} }
        : name === "../utils/skillImport"
        ? {
            githubSkillOptions: async () => ({
              repo: "synthetic/repo",
              revision: sha,
              options: [
                {
                  label: "skills/chosen",
                  url: "https://codeload.github.com/synthetic/repo/zip/" + sha,
                  root: "skills/chosen",
                },
              ],
            }),
            skillDownload: async (url) => {
              assert.equal(
                url,
                "https://codeload.github.com/synthetic/repo/zip/" + sha,
              );
              return Buffer.from("archive");
            },
            importSkillZipBundle: async (bytes, root) => {
              imported.push(root);
              return { package: {}, manifest: {}, contents: new Map() };
            },
          }
        : require(name),
  );
  bridge.registerSkillBridge();
  const options = await handlers.get("inspect-skill-github")(event, "synthetic");
  assert.equal("root" in options[0], false);
  await assert.rejects(
    handlers.get("import-private-skill")(event, "github", "https://outside.invalid"),
    /检查/,
  );
  await assert.rejects(
    handlers.get("import-private-skill")(
      { ...event, senderFrame: { ...frame } },
      "github",
      options[0].id,
    ),
    /当前页面/,
  );
  const result = await handlers.get("import-private-skill")(
    event,
    "github",
    options[0].id,
  );
  assert.equal(imported.join(), "skills/chosen");
  assert.equal(result.source.revision, sha);
  await handlers.get("discard-skill-bundle")(event, result.localBundle.token);
});
