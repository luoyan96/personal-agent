import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const run = path.resolve(
  client,
  "../../../.runtime/desktop-modernization-20261007/backend/run-" +
    randomUUID().slice(0, 8),
);
await fs.mkdir(run, { recursive: true });
const source = await fs.readFile(
  path.join(client, "electron/utils/desktopArtifacts.ts"),
  "utf8",
);
await fs.writeFile(
  path.join(run, "desktopArtifacts.cjs"),
  ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText,
);
const { DesktopArtifactStore } = createRequire(import.meta.url)(
  path.join(run, "desktopArtifacts.cjs"),
);

test("desktop reports persist, isolate scopes, escape HTML, and reject traversal or altered files", async () => {
  const userData = path.join(run, "synthetic-userData");
  await fs.mkdir(userData);
  const scope = {
    actorId: "synthetic_actor_a",
    conversationId: "synthetic_conversation_a",
  };
  const otherActor = { ...scope, actorId: "synthetic_actor_b" },
    otherChat = { ...scope, conversationId: "synthetic_conversation_b" };
  const store = new DesktopArtifactStore(userData),
    markdown =
      "# 真实合成结果\n\n## 步骤\n- **读取文本**\n- 使用 `notes.md`\n\n### 代码\n```html\n<script>only code</script>\n```\n\n步骤一：读取文本。\n<script>alert('x')</script> & <img src='file:///private'>\n![远程图片](https://example.invalid/image.png)";
  const artifact = await store.create(scope, "<报告> & 结论", markdown, [
    "资料/notes.md",
  ]);
  assert.deepEqual(Object.keys(artifact).sort(), ["createdAt", "id", "title"]);
  const reopened = new DesktopArtifactStore(userData);
  assert.deepEqual(await reopened.list(scope), [artifact]);
  assert.deepEqual(await reopened.list(otherActor), []);
  assert.deepEqual(await reopened.list(otherChat), []);
  await assert.rejects(
    reopened.htmlPath(otherActor, artifact.id),
    /DESKTOP_REPORT_NOT_FOUND/,
  );
  await assert.rejects(
    reopened.htmlPath(otherChat, artifact.id),
    /DESKTOP_REPORT_NOT_FOUND/,
  );
  const htmlPath = await reopened.htmlPath(scope, artifact.id),
    html = await fs.readFile(htmlPath, "utf8");
  assert.ok(htmlPath.startsWith(path.join(userData, "desktop-reports") + path.sep));
  assert.match(html, /&lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.match(html, /&lt;报告&gt; &amp; 结论/);
  assert.ok(!html.includes("<script>") && !html.includes("<img "));
  assert.match(html, /default-src 'none'/);
  assert.match(html, /<h1>真实合成结果<\/h1>/);
  assert.match(html, /<h2>步骤<\/h2>/);
  assert.match(html, /<h3>代码<\/h3>/);
  assert.match(html, /<li><strong>读取文本<\/strong><\/li>/);
  assert.match(html, /<code>notes.md<\/code>/);
  assert.match(
    html,
    /<pre><code>&lt;script&gt;only code&lt;\/script&gt;<\/code><\/pre>/,
  );
  assert.equal(
    await fs.readFile(path.join(path.dirname(htmlPath), "report.md"), "utf8"),
    markdown,
  );
  await assert.rejects(
    store.create({ ...scope, actorId: "../escape" }, "x", "x", []),
    /DESKTOP_REPORT_INVALID/,
  );
  for (const sourcePath of [
    "../private.txt",
    "C:/private.txt",
    "/private.txt",
    "safe/../../private.txt",
    "\\\\server\\share\\private.txt",
    "safe.txt:secret",
  ])
    await assert.rejects(
      store.create(scope, "x", "x", [sourcePath]),
      /DESKTOP_REPORT_INVALID/,
    );
  await assert.rejects(
    store.htmlPath(scope, "../../private.html"),
    /DESKTOP_REPORT_INVALID/,
  );
  await assert.rejects(
    store.create(scope, "x", "x".repeat(1048577), []),
    /DESKTOP_REPORT_TOO_LARGE/,
  );
  const second = await store.create(scope, "第二份", "不会覆盖原文件", []);
  assert.notEqual(second.id, artifact.id);
  assert.equal(
    await fs.readFile(path.join(path.dirname(htmlPath), "report.md"), "utf8"),
    markdown,
  );
  // Replacing HTML and its hash together must not bypass the escaped template.
  const metadataPath = path.join(path.dirname(htmlPath), "metadata.json"),
    metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
  const dangerous = "<script>throw new Error('must not open')</script>";
  await fs.writeFile(htmlPath, dangerous);
  metadata.htmlSha256 = createHash("sha256").update(dangerous).digest("hex");
  await fs.writeFile(metadataPath, JSON.stringify(metadata));
  await assert.rejects(reopened.htmlPath(scope, artifact.id), /DESKTOP_REPORT_CORRUPT/);
  await fs.writeFile(metadataPath, "broken JSON");
  assert.deepEqual(await reopened.list(scope), [second]);
  const goodPath = await reopened.htmlPath(scope, second.id),
    outside = path.join(run, "outside.html");
  await fs.writeFile(outside, "MUST_NOT_OPEN");
  await fs.rename(goodPath, goodPath + ".original");
  if (process.platform !== "win32") {
    await fs.symlink(outside, goodPath);
    await assert.rejects(reopened.htmlPath(scope, second.id), /DESKTOP_REPORT_CORRUPT/);
  } else {
    const goodDirectory = path.dirname(goodPath),
      replacement = goodDirectory + "-original";
    await fs.rename(goodDirectory, replacement);
    await fs.symlink(run, goodDirectory, "junction");
    await assert.rejects(reopened.htmlPath(scope, second.id), /DESKTOP_REPORT_CORRUPT/);
  }
  await fs.writeFile(
    path.join(run, "report.json"),
    JSON.stringify(
      {
        passed: 1,
        realFilesystem: true,
        nativeElectron: false,
        models: false,
        coverage: [
          "persist across store instances",
          "actor/conversation isolation",
          "HTML escaping and template integrity",
          "bounded writes and no overwrite",
          "relative path and junction rejection",
          "damaged report recovery",
        ],
      },
      null,
      2,
    ),
  );
  console.log("Evidence: " + run);
});
