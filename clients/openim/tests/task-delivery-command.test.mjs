import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");
const result = await esbuild.build({ entryPoints: [fileURLToPath(new URL("../src/research/task-delivery-command.ts", import.meta.url))], bundle: true, write: false, format: "esm", platform: "node" });
const { prepareTaskDelivery, deliveryReceiptLabel } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
const files = ["delivery-a/报告.pdf", "delivery-b/实验图.png"];
test("submission matching never silently drops an explicitly missing file", () => {
  assert.deepEqual(prepareTaskDelivery("把报告.pdf和不存在.pdf提交到这项任务", "组会", files, []).names, []);
  assert.deepEqual(prepareTaskDelivery("把不存在.pdf提交", "组会", [files[0]], []).names, []);
  assert.deepEqual(prepareTaskDelivery("把报告.pdf和实验图.png提交", "组会", files, []).names, files);
});
test("cancellation and another task cannot produce a confirmation", () => {
  assert.deepEqual(prepareTaskDelivery("不要提交报告.pdf", "组会", files, []).names, []);
  assert.deepEqual(prepareTaskDelivery("把报告.pdf交到论文任务", "组会", files, []).names, []);
  assert.deepEqual(prepareTaskDelivery("报告.pdf在哪里", "组会", files, []).names, []);
});
test("attached snapshots survive a generic instruction, same-name versions need a choice", () => {
  assert.deepEqual(prepareTaskDelivery("帮我交一下", "组会", [], [files[0]]).names, [files[0]]);
  assert.deepEqual(prepareTaskDelivery("提交报告.pdf", "组会", [files[0], "delivery-c/报告.pdf"], []).names, []);
});
test("a saved submission receipt follows the actual service review status", () => {
  assert.equal(deliveryReceiptLabel("in_review"), "已提交，等待验收");
  assert.equal(deliveryReceiptLabel("awaiting_review"), "已提交，等待验收");
  assert.equal(deliveryReceiptLabel("completed"), "成果已验收");
  assert.equal(deliveryReceiptLabel("changes_requested"), "上版已退回，请修改后再提交");
  assert.equal(deliveryReceiptLabel("running"), "上次提交记录");
  assert.equal(deliveryReceiptLabel(""), "上次提交记录");
});

// Run the actual component and delivery matching code with a controlled React
// host. Only the DOM components and the caller's IPC callbacks are substituted.
const panelBuild = await esbuild.build({
  entryPoints: [fileURLToPath(new URL("../src/research/TaskDeliveryPanel.tsx", import.meta.url))],
  bundle: true, write: false, format: "cjs", platform: "node", jsx: "automatic",
  external: ["react", "react/jsx-runtime", "antd", "@ant-design/icons"],
});
function panelHost(overrides = {}) {
  const slots = [];
  let cursor = 0;
  const jsx = (type, props) => ({ type, props });
  const dependencies = {
    react: {
      useState(initial) {
        const at = cursor++;
        if (!(at in slots)) slots[at] = initial;
        return [slots[at], value => { slots[at] = typeof value === "function" ? value(slots[at]) : value; }];
      },
      useRef(initial) {
        const at = cursor++;
        if (!(at in slots)) slots[at] = { current: initial };
        return slots[at];
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    antd: { Alert: "Alert", Button: "Button", Input: { TextArea: "TextArea", Search: "Search" } },
    "@ant-design/icons": { CloudUploadOutlined: "UploadIcon", MessageOutlined: "MessageIcon", PaperClipOutlined: "AttachIcon" },
  };
  const module = { exports: {} };
  vm.runInNewContext(panelBuild.outputFiles[0].text, { module, exports: module.exports, Error, require: name => {
    assert.ok(name in dependencies, `Unexpected component dependency: ${name}`);
    return dependencies[name];
  } });
  const props = {
    target: { kind: "research", taskId: "synthetic_task" }, title: "Synthetic task",
    outputs: [{ name: "report.pdf", size: 123 }], disabled: false, canSubmit: true,
    stage: async () => { throw Error("Unexpected file selection"); },
    submit: async () => { throw Error("Unexpected new submission"); },
    retry: async () => { throw Error("Unexpected pending replay"); },
    ...overrides,
  };
  const render = () => { cursor = 0; return module.exports.TaskDeliveryPanel(props); };
  return { props, render };
}
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children), ...nodes(tree.props?.action)];
}
function button(tree, name) {
  return nodes(tree).find(node => node.type === "Button" && node.props.children === name);
}
const settle = () => new Promise(resolve => setImmediate(resolve));
const plain = value => JSON.parse(JSON.stringify(value));

test("personal tasks with local outputs expose only the exact text submission", async () => {
  const calls = [];
  const host = panelHost({ target: { kind: "personal", taskId: "synthetic_personal" }, submit: async (...args) => calls.push(plain(args)) });
  let tree = host.render();
  assert.equal(nodes(tree).some(node => node.props?.className === "task-delivery-output-options"), false);
  assert.equal(button(tree, "确认提交"), undefined);
  assert.equal(button(tree, "选择文件"), undefined);
  assert.equal(button(tree, "让助理帮我交"), undefined);
  nodes(tree).find(node => node.type === "TextArea").props.onChange({ target: { value: "  Exact personal result\nwith evidence.  " } });
  tree = host.render();
  assert.equal(button(tree, "提交成果").props.disabled, false);
  button(tree, "提交成果").props.onClick();
  await settle();
  assert.deepEqual(calls, [[[], "Exact personal result\nwith evidence."]]);
  assert.equal(nodes(host.render()).find(node => node.type === "TextArea").props.value, "");
});

test("personal rendering cannot confirm a previously selected research file", async () => {
  const host = panelHost();
  button(host.render(), "选择全部产出").props.onClick();
  assert.ok(button(host.render(), "确认提交"));
  host.props.target = { kind: "personal", taskId: "synthetic_personal" };
  assert.equal(button(host.render(), "确认提交"), undefined);
});

test("research file staging requires an explicit confirmation and retains selection on failure", async () => {
  const calls = [];
  let fail = true;
  const host = panelHost({
    stage: async () => ["delivery-snapshot/report.pdf"],
    submit: async names => { calls.push(plain(names)); if (fail) throw Error("Synthetic lost connection"); },
  });
  button(host.render(), "选择文件").props.onClick();
  await settle();
  assert.deepEqual(calls, []);
  button(host.render(), "确认提交").props.onClick();
  await settle();
  let tree = host.render();
  assert.ok(button(tree, "确认提交"));
  assert.ok(nodes(tree).some(node => node.type === "Alert" && node.props.message === "Synthetic lost connection"));
  fail = false;
  button(tree, "确认提交").props.onClick();
  await settle();
  assert.deepEqual(calls, [["delivery-snapshot/report.pdf"], ["delivery-snapshot/report.pdf"]]);
  assert.equal(button(host.render(), "确认提交"), undefined);
});

test("a pending lost acknowledgement replays exactly once without a new submit grant", async () => {
  const original = { summary: "Original recorded result", names: ["delivery-snapshot/report.pdf"] };
  const calls = [];
  let finish;
  const host = panelHost({
    pending: true, disabled: true, canSubmit: false, currentStatus: "in_review",
    retry: async () => { calls.push(plain(original)); await new Promise(resolve => { finish = resolve; }); },
  });
  let tree = host.render();
  const retry = button(tree, "核对并重试");
  assert.equal(retry.props.disabled, false);
  assert.equal(button(tree, "确认提交"), undefined);
  assert.equal(button(tree, "选择文件"), undefined);
  retry.props.onClick();
  retry.props.onClick();
  assert.deepEqual(calls, [original]);
  tree = host.render();
  assert.equal(button(tree, "核对并重试").props.disabled, true);
  button(tree, "核对并重试").props.onClick();
  assert.deepEqual(calls, [original]);
  finish();
  await settle();
  assert.equal(button(host.render(), "核对并重试").props.loading, false);
});

test("new research submissions still require permission and respect the disabled guard", async () => {
  let stages = 0, submissions = 0;
  const host = panelHost({ stage: async () => { stages++; return ["report.pdf"]; }, submit: async () => { submissions++; } });
  button(host.render(), "选择全部产出").props.onClick();
  host.props.disabled = true;
  let tree = host.render();
  assert.equal(button(tree, "确认提交").props.disabled, true);
  button(tree, "确认提交").props.onClick();
  button(tree, "选择文件").props.onClick();
  await settle();
  assert.equal(stages, 0);
  assert.equal(submissions, 0);
  host.props.disabled = false;
  host.props.canSubmit = false;
  tree = host.render();
  assert.equal(button(tree, "确认提交"), undefined);
  assert.equal(button(tree, "选择文件"), undefined);
  assert.equal(button(tree, "核对并重试"), undefined);
  assert.equal(submissions, 0);
});
