import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
const client = path.resolve(import.meta.dirname, ".."),
  require = createRequire(client + "/package.json"),
  Zip = require("adm-zip");
const exports = {};
vm.runInNewContext(
  ts.transpileModule(
    await fs.readFile(client + "/electron/utils/skillImport.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    },
  ).outputText,
  {
    exports,
    Buffer,
    TextDecoder,
    URL,
    setTimeout,
    clearTimeout,
    __filename: client + "/package.json",
    require: (n) =>
      n === "@research-agent-platform/research-skills/import"
        ? require(client + "/../../packages/research-skills/dist/import.cjs")
        : require(n),
  },
);
const skill = (body) =>
  "---\nname: linked-method\ndescription: Synthetic research workflow\n---\n" + body;
function bundle(body, files = {}) {
  const zip = new Zip();
  zip.addFile("repo/skills/chosen/SKILL.md", Buffer.from(skill(body)));
  for (const [p, data] of Object.entries(files))
    zip.addFile("repo/skills/chosen/" + p, Buffer.from(data));
  return zip.toBuffer();
}
const read = (bytes) => exports.importSkillZipBundle(bytes, "skills/chosen");
test("bundled linked templates become selectable complete text, including relative recursive references", async () => {
  const bytes = bundle(
    "Read [method](docs/method.md#rules), fill `assets/intake.json`, and use [table][rows].\n[rows]: <templates/data.csv>\n",
    {
      "docs/method.md": "Use [notes](../notes.txt) and [root](../SKILL.md).",
      "notes.txt": "中文方法依据",
      "assets/intake.json": '{"scope":"synthetic"}',
      "templates/data.csv": "id,value\nS1,12\n",
      "assets/unrelated.json": '{"notSelected":true}',
    },
  );
  const value = await read(bytes),
    refs = value.package.references;
  assert.deepEqual(Array.from(refs, (f) => f.path).sort(), [
    "assets/intake.json",
    "docs/method.md",
    "notes.txt",
    "templates/data.csv",
  ]);
  assert.equal(refs.find((f) => f.path === "notes.txt").text, "中文方法依据");
  for (const f of refs)
    assert.equal(f.text, value.contents.get(f.path).toString("utf8"));
  assert.deepEqual(value.originalZip, bytes);
  assert.equal(value.contents.has("assets/unrelated.json"), true);
  assert.equal(value.package.scriptCount, 0);
});
test("reference following stays inside selected package and ignores remote, example and executable targets", async () => {
  const value = await read(
    bundle(
      "Read [local](templates/real%20check.md). `scripts/run.py` [remote](https://outside.invalid/leak.md) [escape](../../secret.md) [absolute](/private.md) [Windows](C:/private.md).\n```md\n[example](examples/never.md)\n```\n",
      {
        "templates/real check.md": "Complete method",
        "examples/never.md": "Example only",
        "scripts/run.py": 'raise Exception("MUST NOT EXECUTE")',
      },
    ),
  );
  assert.deepEqual(
    Array.from(value.package.references, (f) => f.path),
    ["templates/real check.md"],
  );
  assert.deepEqual(value.package.requirements, ["脚本执行"]);
});
test("newly included text preserves size, encoding and aggregate limits before any installation", async () => {
  await assert.rejects(
    read(bundle("`templates/big.md`", { "templates/big.md": "x".repeat(400001) })),
    /400 KB/,
  );
  await assert.rejects(
    read(bundle("`templates/long.md`", { "templates/long.md": "x".repeat(120001) })),
    /120,000/,
  );
  await assert.rejects(
    read(
      bundle(
        "`templates/a.md` `templates/b.md` `templates/c.md`",
        Object.fromEntries(
          ["a", "b", "c"].map((k) => ["templates/" + k + ".md", "中".repeat(110000)]),
        ),
      ),
    ),
    /900 KB/,
  );
  await assert.rejects(
    read(
      bundle("`templates/bad.txt`", {
        "templates/bad.txt": Buffer.from([255, 254, 255]),
      }),
    ),
  );
  const untouched = await read(
    bundle("No template selected.", {
      "templates/bad.txt": Buffer.from([255, 254, 255]),
    }),
  );
  assert.equal(untouched.package.references.length, 0);
});

test("ordinary and linked reference text report the same API limit and exact path", async () => {
  for (const relative of ["references/protocol.md", "assets/template.json"])
    for (const character of ["x", "中"])
      await assert.rejects(
        read(bundle(`Read \`${relative}\`.`, { [relative]: character.repeat(120001) })),
        (error) => error.message.includes(relative) && error.message.includes("120,000"),
      );
});

test("malformed UTF-8 in either reference route identifies the original file", async () => {
  for (const relative of ["references/bad.md", "assets/bad.json"])
    await assert.rejects(
      read(bundle(`Read \`${relative}\`.`, { [relative]: Buffer.from([255, 254, 255]) })),
      (error) => error.message.includes(relative) && error.message.includes("UTF-8"),
    );
});

test("exact-limit Chinese instructions and references preserve complete original ZIP bytes", async () => {
  const body = "中".repeat(120000),
    text = "文".repeat(120000),
    bytes = bundle(body, { "references/protocol.md": text }),
    value = await read(bytes);
  assert.equal(value.package.instructions, body);
  assert.equal(value.package.references[0].text, text);
  assert.equal(value.contents.get("references/protocol.md").toString("utf8"), text);
  assert.deepEqual(value.originalZip, bytes);
});

test("folder import rejects excessive reference text before producing an install preview", async () => {
  const directory = await fs.mkdtemp(path.resolve(client, "../../../.runtime/skill-text-limit-folder-"));
  await fs.mkdir(path.join(directory, "references"));
  await fs.writeFile(path.join(directory, "SKILL.md"), skill("Use the supplied protocol."));
  const relative = "references/protocol.md";
  await fs.writeFile(path.join(directory, relative), "x".repeat(120001));
  await assert.rejects(exports.importSkillFolderBundle(directory),
    (error) => error.message.includes(relative) && error.message.includes("120,000"));
  const text = "中".repeat(120000);
  await fs.writeFile(path.join(directory, relative), text);
  const value = await exports.importSkillFolderBundle(directory);
  assert.equal(value.package.references[0].text, text);
  assert.equal(value.contents.get(relative).toString("utf8"), text);
});
