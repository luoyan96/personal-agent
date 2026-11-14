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

test("task delivery has one area and keeps server review history beside the files", async () => {
  const page = await read("../src/research/TaskWorkPage.tsx");
  const panel = await read("../src/research/TaskDeliveryPanel.tsx");
  assert.equal((page.match(/<TaskDeliveryPanel/g) || []).length, 1);
  assert.doesNotMatch(page, /title="成果与提交"|提交这些文件/);
  assert.match(page, /aria-label="交付成果"/);
  assert.match(page, /binding\.sources \|\| \[\]\)\.map/);
  assert.match(page, /binding\.localMaterials \|\| \[\]\)\.map/);
  assert.match(page, /latestAccepted/);
  assert.match(page, /personalResult\.summary/);
  const personal = await read("../src/research/PersonalWorkDetail.tsx");
  assert.match(personal, /task.result && !embedded/);
  assert.match(personal, /!embedded \|\| !window.electronAPI/);
  assert.match(page, /TaskDeliveryDownload/);
  assert.match(page, /delivery\.review\.comment/);
  assert.match(page, /taskRebase/);
  assert.match(panel, /setSelection\(names\)/);
  assert.doesNotMatch(panel, /if \(direct\) await submit/);
  assert.match(panel, /确认提交/);
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

// Execute the actual work page against returned service snapshots. Transport and
// the React host are controlled; no account data or desktop IPC is touched.
async function renderWorkPage({ kind = "research", status = "completed", deliveries = [], result } = {}) {
  const ts = (await import("typescript")).default;
  const vm = await import("node:vm");
  const source = await read("../src/research/TaskWorkPage.tsx");
  const task = { id: "synthetic_task", title: "Synthetic report", goal: "Compare the evidence", acceptanceCriteria: "Show source limitations", version: 3, status, allowedActions: [], ...(kind === "personal" ? { result } : {}) };
  const jsx = (type, props) => typeof type === "function" ? type(props) : { type, props };
  const dependencies = {
    react: { useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect() {} },
    "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
    "react-router-dom": { useNavigate: () => () => {}, Link: "Link" },
    antd: { Alert: "Alert", Button: "Button", Checkbox: "Checkbox", Input: { TextArea: "TextArea" }, Select: "Select" },
    "./api": { researchApi: async () => { throw Error("render must not write"); } },
    "./useResearchRead": { useResearchRead: (_read, key) => ({ data: key.startsWith("work-page:") ? { task, artifacts: [], deliverables: deliveries } : undefined, refresh: async () => {} }) },
    "./usePersonalOperation": { usePersonalOperation: () => ({ scope: "synthetic", capture: () => ({ isCurrent: () => true }) }) },
    "./task-dsh-events": { taskEventRows: () => [] },
    "./task-planning": { taskStateLabels: { completed: "已验收" } },
    "./workspace-labels": { workspaceStatusLabel: { completed: "已完成" } },
  };
  const module = { exports: {} };
  const context = { module, exports: module.exports, window: {}, require: name => dependencies[name] || new Proxy({}, { get: (_, key) => String(key) }) };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  return module.exports.TaskWorkPage({ taskId: task.id, kind, onChanged: async () => {}, children: () => "Arrangement controls" });
}
function renderText(node) {
  if (Array.isArray(node)) return node.map(renderText).join(" ");
  if (node && typeof node === "object") return [node.props?.text || "", renderText(node.props?.children)].join(" ");
  return typeof node === "string" || typeof node === "number" ? String(node) : "";
}
const delivery = (revision, decision) => ({ id: `delivery_${revision}`, revision, summary: `Report revision ${revision}`, artifactRefs: [], sources: [{ label: `report-v${revision}.pdf`, locator: "synthetic" }], review: { decision, comment: `Review ${revision}` } });
test("a completed task shows its reviewed delivery and keeps an empty work area collapsed", async () => {
  const text = renderText(await renderWorkPage({ deliveries: [delivery(1, "accepted")] }));
  assert.match(text, /已验收第\s+1\s+版\s+· report-v1.pdf/);
  assert.match(text, /Report revision 1/);
  assert.match(text, /Review 1/);
  assert.doesNotMatch(text, /开始任务后，这里会出现本机工作区/);
  assert.doesNotMatch(text, /暂无可查看的交付记录/);
});
test("an older accepted revision cannot certify the latest unaccepted delivery", async () => {
  const text = renderText(await renderWorkPage({ deliveries: [delivery(1, "accepted"), delivery(2, "changes_requested")] }));
  assert.match(text, /已结束 · 验收记录待核对/);
  assert.match(text, /要求修改/);
});
test("personal accepted text results stay visible in the single delivery area without a local receipt", async () => {
  const text = renderText(await renderWorkPage({ kind: "personal", result: { accepted: true, summary: "Synthetic accepted text" } }));
  assert.match(text, /已验收结果/);
  assert.match(text, /Synthetic accepted text/);
  assert.doesNotMatch(text, /暂无可查看的交付记录/);
  assert.doesNotMatch(text, /开始任务后，这里会出现本机工作区/);
});
