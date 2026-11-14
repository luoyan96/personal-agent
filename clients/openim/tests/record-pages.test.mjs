import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import * as contracts from "@research-agent-platform/contracts";

// Execute the actual page handlers. Only transport, React host and native shell
// are controlled here; rendered interactions are checked separately in IAB.
async function fixture(file) {
  const f = {
    states: [],
    cursor: 0,
    params: new URLSearchParams("panel=standards"),
    writes: [],
    current: true,
    fail: false,
    canPublish: true,
    opened: [],
    requests: 0,
  };
  const record = (
    id,
    status = "active",
    allowedActions = ["revise", "confirm", "revoke"],
  ) => ({
    id,
    scope: "lab",
    scopeId: "lab_demo",
    kind: "rule",
    title: id,
    content: "Original content",
    status,
    version: 4,
    authorName: "Demo author",
    sourceTaskId: null,
    updatedAt: "2026-11-11T09:00:00Z",
    allowedActions,
  });
  f.records = [record("active_rule"), record("candidate_rule", "candidate")];
  f.plan = {
    id: "plan_demo",
    goal: "Prepare a research report",
    status: "draft",
    version: 2,
    createdAt: "2026-11-11T09:00:00Z",
    proposedItems: [
      {
        id: "step_demo",
        title: "Review evidence",
        goal: "Compare the source material",
      },
    ],
    unresolvedQuestions: ["Who is the audience?"],
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    "@research-agent-platform/contracts": contracts,
    react: {
      useState(value) {
        const i = f.cursor++;
        if (!(i in f.states)) f.states[i] = value;
        return [
          f.states[i],
          (next) => {
            f.states[i] = typeof next === "function" ? next(f.states[i]) : next;
          },
        ];
      },
      useEffect() {},
      useLayoutEffect() {},
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    antd: Object.fromEntries(
      ["Alert", "Button", "Dropdown", "Modal", "Segmented", "Select"].map((k) => [
        k,
        k,
      ]),
    ),
    "@ant-design/icons": new Proxy({}, { get: (_, name) => String(name) }),
    "react-router-dom": {
      useSearchParams: () => [
        f.params,
        (next) => {
          f.params = new URLSearchParams(next);
        },
      ],
      useNavigate: () => (path) => f.opened.push(path),
    },
    "./RecordWorkspace": { RecordWorkspace: "RecordWorkspace" },
    "./LocalLibraryPicker": { LocalLibraryPicker: "LocalLibraryPicker" },
    "./WorkspaceUnavailable": { WorkspaceUnavailable: "WorkspaceUnavailable" },
    "./useWorkspaceAvailability": {
      useWorkspaceAvailability: () => ({ supports: () => true }),
    },
    "./usePersonalOperation": {
      usePersonalOperation: () => ({
        scope: "demo",
        capture: () => ({ isCurrent: () => f.current }),
      }),
    },
    "./store": {
      useResearchStore: (selector) =>
        selector({
          actor: { member: { id: "member_demo", labId: "lab_demo" } },
          generation: 1,
        }),
    },
    "./api": {
      researchApi: async (name, options) => {
        f.writes.push({ name, options });
        if (f.fail) throw Error("Save failed");
        return { data: { ...f.records[0], id: options?.body?.recordId || "new_rule" } };
      },
    },
    "./useResearchRead": {
      useResearchRead: (_read, id, enabled) => ({
        loading: false,
        error: "",
        refresh: async () => {
          f.requests++;
        },
        data: !enabled
          ? undefined
          : id === "lab-work-rules"
          ? {
              data: {
                canPublish: f.canPublish,
                records: f.records,
                platform: { version: "2", content: "Read-only policy" },
              },
            }
          : id === "lab-standards-collections"
          ? { data: [] }
          : id.startsWith("chat-plan-history")
          ? { data: [{ ...f.plan }], nextCursor: null }
          : id.startsWith("history-plan-tasks")
          ? { data: { steps: [{ itemId: "step_demo", taskId: null, task: null }] } }
          : id.startsWith("history-plan:")
          ? { data: f.plan }
          : id === "chat-planning-request-history"
          ? { data: [] }
          : undefined,
      }),
    },
  };
  imports.antd.Input = Object.assign("Input", { TextArea: "TextArea" });
  const load = async (name) => {
    const module = { exports: {} };
    vm.runInNewContext(
      ts.transpileModule(
        await readFile(new URL("../src/research/" + name, import.meta.url), "utf8"),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
            jsx: ts.JsxEmit.ReactJSX,
          },
        },
      ).outputText,
      {
        module,
        exports: module.exports,
        require: (name) => {
          assert(Object.hasOwn(imports, name), name);
          return imports[name];
        },
        URLSearchParams,
        Error,
        window: {},
      },
    );
    return module.exports;
  };
  imports["./ppt-template"] = await load("ppt-template.ts");
  imports["./workbench-links"] = await load("workbench-links.ts");
  imports["./workbench-view"] = await load("workbench-view.ts");
  imports["./task-planning"] = { requestStateLabels: {} };
  const exports = await load(file);
  f.render = (props = {}) => {
    f.cursor = 0;
    return Object.values(exports)[0](props);
  };
  return f;
}
const nodes = (n) =>
  !n || typeof n !== "object"
    ? []
    : Array.isArray(n)
    ? n.flatMap(nodes)
    : [
        n,
        ...nodes(n.props?.children),
        ...nodes(n.props?.list),
        ...nodes(n.props?.footer),
      ];
const text = (n) =>
  n == null
    ? ""
    : Array.isArray(n)
    ? n.map(text).join("")
    : typeof n === "object"
    ? text(n.props?.children)
    : String(n);
const button = (tree, label) =>
  nodes(tree).find((n) => n.type === "Button" && text(n) === label);

test("active rules never offer confirm again, candidate confirms its exact id/version", async () => {
  const f = await fixture("LabStandards.tsx");
  let tree = f.render();
  assert.equal(button(tree, "确认生效"), undefined);
  const row = nodes(tree).find(
    (n) => n.type === "button" && text(n).includes("candidate_rule"),
  );
  row.props.onClick();
  tree = f.render();
  await button(tree, "确认生效").props.onClick();
  const body = f.writes[0].options.body;
  assert.equal(body.recordId, "candidate_rule");
  assert.equal(body.expectedVersion, 4);
  assert.equal(body.action, "confirm");
  assert.equal(body.scope, "lab");
});
test("readonly members see records without edit, publish, confirm or revoke affordances", async () => {
  const f = await fixture("LabStandards.tsx");
  f.canPublish = false;
  f.records = f.records.map((r) => ({ ...r, allowedActions: [] }));
  const tree = f.render();
  assert.equal(button(tree, "新增规则"), undefined);
  assert.equal(button(tree, "编辑规则"), undefined);
  assert.equal(button(tree, "确认生效"), undefined);
  const dropdown = nodes(tree).find((n) => n.type === "Dropdown");
  assert.deepEqual(
    Array.from(dropdown.props.menu.items, (x) => x.key),
    ["version"],
  );
});
test("failed edits preserve the draft; successful edits keep expectedVersion and current API shape", async () => {
  const f = await fixture("LabStandards.tsx");
  let tree = f.render();
  button(tree, "编辑规则").props.onClick();
  tree = f.render();
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "规则正文")
    .props.onChange({ target: { value: "Revised rule" } });
  f.fail = true;
  tree = f.render();
  await button(tree, "保存").props.onClick();
  await new Promise(setImmediate);
  tree = f.render();
  assert.equal(
    nodes(tree).find((n) => n.props?.["aria-label"] === "规则正文").props.value,
    "Revised rule",
  );
  assert(
    nodes(tree).some((n) => n.type === "Alert" && n.props.message === "Save failed"),
    JSON.stringify({
      states: f.states,
      alerts: nodes(tree)
        .filter((n) => n.type === "Alert")
        .map((n) => n.props),
      writes: f.writes,
    }),
  );
  f.fail = false;
  await button(tree, "保存").props.onClick();
  await new Promise(setImmediate);
  const body = f.writes.at(-1).options.body;
  assert.equal(body.recordId, "active_rule");
  assert.equal(body.expectedVersion, 4);
  assert.equal(body.content, "Revised rule");
  assert.equal(body.kind, "rule");
  assert.equal(
    nodes(f.render()).find(
      (n) => n.type === "Modal" && n.props.className === "record-editor",
    ).props.open,
    false,
  );
});
test("platform rules remain readonly and separate from local files and methods", async () => {
  const f = await fixture("LabStandards.tsx");
  f.params = new URLSearchParams("panel=standards&section=platform");
  const tree = f.render();
  assert(text(tree).includes("Read-only policy"));
  assert.equal(button(tree, "编辑规则"), undefined);
  assert.equal(button(tree, "新增规则"), undefined);
  assert.equal(
    nodes(tree).some((n) => n.props?.onClick && text(n) === "选择文件夹"),
    false,
  );
});
test("plan history shows records immediately and resumes the exact selected plan without creating tasks", async () => {
  const f = await fixture("PlanningHistory.tsx");
  let target;
  const tree = f.render({
    onOpen: (value) => {
      target = value;
    },
  });
  assert.equal(
    nodes(tree).some((n) => n.type === "details"),
    false,
  );
  assert(
    nodes(tree).some(
      (n) => n.type === "button" && text(n).includes("Prepare a research report"),
    ),
  );
  button(tree, "继续讨论").props.onClick();
  assert.equal(target.plan, "plan_demo");
  assert.equal(f.writes.length, 0);
  assert(text(tree).includes("Who is the audience?"));
  assert.equal(button(tree, "创建任务"), undefined);
});
test("search clears hidden plan details; confirmed plans cannot manufacture task links", async () => {
  const f = await fixture("PlanningHistory.tsx");
  let tree = f.render();
  nodes(tree)
    .find((n) => n.props?.["aria-label"] === "搜索本页计划")
    .props.onChange({ target: { value: "not present" } });
  tree = f.render();
  assert.equal(button(tree, "继续讨论"), undefined);
  f.states = [];
  f.plan.status = "confirmed";
  tree = f.render();
  assert(text(tree).includes("此步骤暂无可访问的任务。"));
  assert.equal(f.writes.length, 0);
});

test("library standards navigation keeps each section's heading and only related tabs", async () => {
  const f = await fixture("LabStandards.tsx");
  for (const [section, heading, tabs] of [
    ["templates", "PPT 工作模板", ["PPT 模板", "可复用方法"]],
    ["methods", "可复用方法", ["PPT 模板", "可复用方法"]],
    ["platform", "平台基本规则", ["课题组规则", "平台基本规则"]],
  ]) {
    f.params.set("section", section);
    const tree = f.render();
    assert.equal(
      nodes(tree).find((node) => node.type === "header").props.children[0].props
        .children[0].props.children,
      heading,
    );
    const navigation = nodes(tree).find(
      (node) => node.type === "nav" && node.props["aria-label"] === "规范分类",
    );
    assert.deepEqual(
      nodes(navigation)
        .filter((node) => node.type === "button")
        .map(text),
      tabs,
    );
    assert.equal(button(tree, "返回资料"), undefined);
  }
  const details = nodes(f.render()).find((node) => node.type === "details");
  assert.match(text(details), /Read-only policy/);
  assert.equal(f.writes.length, 0);
});
