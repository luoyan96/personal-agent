import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("the library shows 课题组规范 only when the server can answer for it", async () => {
  const page = await read("../src/research/LibraryWorkspace.tsx");
  assert.match(page, /label: "课题组规范"/);
  // An older server keeps the three-tab library instead of a dead tab.
  assert.match(page, /const standardsReady = availability\.supports\(40\)/);
  assert.match(page, /\.\.\.\(standardsReady\s*\?/);
  assert.match(page, /=== "standards" && standardsReady/);
});

test("the standards page reads and writes lab rules and points templates at the library", async () => {
  const page = await read("../src/research/LabStandards.tsx");
  assert.match(page, /researchApi\("labWorkRules"/);
  assert.match(page, /researchApi\("saveLabWorkRule"/);
  assert.match(page, /availability\.supports\(40\)/);
  // What a task actually carries is spelled out, not left to guesswork.
  assert.match(page, /平台基本规则/);
  assert.match(page, /个人任务只带平台规则/);
  // Templates are materials, and the page says so before linking to the library.
  assert.match(page, /模板与范文/);
  assert.match(page, /这些是资料，不是规则/);
  assert.match(page, /navigate\("\/library"\)/);
  // Members stage candidates; only the manager publishes.
  assert.match(page, /待负责人确认/);
  assert.match(page, /data\.canPublish/);
});
