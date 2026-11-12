import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("the task page leads with goal and acceptance, not a next-step banner", async () => {
  const page = await read("../src/research/TaskWorkPage.tsx");
  assert.doesNotMatch(page, /task-work-next/);
  assert.doesNotMatch(page, />\s*下一步\s*</);
  assert.match(page, /验收标准/);
  assert.match(page, /逐条对照，全部满足才算完成/);
  assert.match(page, /checklist/);
  // Only a real blocker keeps an action row, and it is not called a next step.
  assert.match(page, /className="task-work-start"/);
  assert.match(page, /开始这一步/);
});

test("submitting is one button over the produced files, not a form", async () => {
  const page = await read("../src/research/TaskWorkPage.tsx");
  assert.match(page, /提交这些文件/);
  // Inputs are excluded: sources and local materials are not deliverables.
  assert.match(page, /binding\.sources \|\| \[\]\)\.map/);
  assert.match(page, /binding\.localMaterials \|\| \[\]\)\.map/);
  assert.match(page, /const outputs = /);
  // The reviewer sees what was submitted instead of a second form.
  assert.match(page, /已提交，等待验收/);
  assert.match(page, /submitted\.names\.map/);
  assert.doesNotMatch(page, /勾选要归档或提交的成果/);
  assert.doesNotMatch(page, /aria-label="成果摘要"/);
  // Optional material and archiving sit behind one collapsed row each.
  assert.match(page, /取用共享资料（可选）/);
  assert.match(page, /归档到资料（可选）/);
});

test("the schedule section no longer repeats acceptance and shows labelled dates", async () => {
  const page = await read("../src/research/TaskWorkPage.tsx");
  assert.match(page, /title="安排"/);
  assert.doesNotMatch(page, /title="安排与验收"/);
  const panel = await read("../src/research/ResearchTaskPanel.tsx");
  // A labelled schedule replaces the unlabelled line.
  assert.match(panel, /research-task-schedule/);
  assert.match(panel, /label: "建议"/);
  assert.match(panel, /label: "承诺"/);
  assert.match(panel, /label: "截止"/);
  // Uploading and submitting happen once, in 成果与提交, not twice.
  assert.match(panel, /allowed\("upload"\) && !embedded/);
  assert.match(panel, /allowed\("submit"\) && !embedded/);
});

test("rules are summarised instead of asking for more input", async () => {
  const panel = await read("../src/research/TaskKnowledgePanel.tsx");
  assert.match(panel, /当前可用：平台规则/);
  assert.match(panel, /上轮实际带入/);
  assert.match(panel, /看具体规则/);
  // No more search box, no add/edit editor, no rule history in this panel.
  assert.doesNotMatch(panel, /搜索规则、记忆/);
  assert.doesNotMatch(panel, /新增规则或记忆/);
  assert.doesNotMatch(panel, /aria-label="规则标题"/);
  assert.doesNotMatch(panel, /管理我的记忆/);
});
