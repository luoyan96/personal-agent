import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => {
        throw Error("Unexpected import: " + name);
      },
    },
    { filename: file },
  );
  return module.exports;
}

const { workbenchView } = await load("../src/research/workbench-view.ts");

test("the workbench has two front doors and defaults to the task list", () => {
  const initial = workbenchView(new URLSearchParams());
  // Fields are compared one by one: the module is evaluated in another context,
  // so its objects do not share this realm's prototype.
  assert.equal(initial.tab, "tasks");
  assert.equal(initial.planning, false);
  assert.equal(initial.planId, undefined);
  assert.equal(initial.requestId, undefined);
  assert.equal(initial.filter, "all");
  assert.equal(workbenchView(new URLSearchParams("view=team")).tab, "team");
  assert.equal(
    workbenchView(new URLSearchParams("view=tasks&category=completed")).filter,
    "completed",
  );
});

test("saved planning links open the assistant instead of a third tab", () => {
  // The old planning tab and its deep links all land on the task list.
  const planning = workbenchView(new URLSearchParams("view=planning"));
  assert.equal(planning.tab, "tasks");
  assert.equal(planning.planning, true);

  const plan = workbenchView(new URLSearchParams("view=tasks&plan=plan_abc123"));
  assert.equal(plan.planning, true);
  assert.equal(plan.planId, "plan_abc123");

  const request = workbenchView(
    new URLSearchParams("view=tasks&planning=request_xyz789"),
  );
  assert.equal(request.planning, true);
  assert.equal(request.requestId, "request_xyz789");
});

test("a team view never opens the assistant, and junk ids are ignored", () => {
  const team = workbenchView(new URLSearchParams("view=team&plan=plan_abc123"));
  assert.equal(team.tab, "team");
  assert.equal(team.planning, false);
  assert.equal(team.planId, "plan_abc123");

  const junk = workbenchView(new URLSearchParams("view=tasks&plan=not an id"));
  assert.equal(junk.planId, undefined);
  assert.equal(junk.planning, false);
});

test("the page keeps only the two tabs and writes tasks through the assistant", async () => {
  const page = await readFile(
    new URL("../src/research/DesktopWorkbench.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /label: "待办"/);
  assert.match(page, /label: "团队"/);
  assert.doesNotMatch(page, /label: "计划"/);
  assert.doesNotMatch(page, /label: "定时"/);
  // 新建任务 expands the assistant; the form is only a fallback.
  assert.match(page, /setPlanningLaunch\(\(value\) => value \+ 1\)/);
  assert.match(page, /if \(!assistantReady\)/);
});
