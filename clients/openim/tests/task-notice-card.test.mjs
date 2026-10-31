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

const { isTaskNotice, splitTaskResources, taskStatusLabel, legacyTaskInvitation } =
  await load("../src/research/task-notice.ts");

const task = (id, version = 1) => ({ kind: "task", ref: { id, version } });
const artifact = (id) => ({ kind: "artifact", ref: { id, version: 1 } });

test("only a service notice that carries one task reference becomes a card", () => {
  assert.equal(
    isTaskNotice({ origin: "service", turnId: null, resources: [task("task_a")] }),
    true,
  );
  // A model reply may quote a task but stays a normal message.
  assert.equal(
    isTaskNotice({ origin: "model", turnId: null, resources: [task("task_a")] }),
    false,
  );
  // A group-creation or decision receipt can carry several resources; the
  // sentence is the message there, not an invitation.
  assert.equal(
    isTaskNotice({
      origin: "service",
      turnId: null,
      resources: [task("task_a"), artifact("artifact_a")],
    }),
    false,
  );
  assert.equal(
    isTaskNotice({ origin: "service", turnId: null, resources: [artifact("a")] }),
    false,
  );
  // A service receipt that answers a turn is a reply, not an invitation.
  assert.equal(
    isTaskNotice({ origin: "service", turnId: "turn_a", resources: [task("t")] }),
    false,
  );
  assert.equal(isTaskNotice(undefined), false);
  assert.equal(isTaskNotice({ origin: "service", turnId: null, resources: [] }), false);
});

test("task references leave the material list and keep their order", () => {
  const { tasks, others } = splitTaskResources([
    artifact("artifact_a"),
    task("task_a"),
    task("task_b"),
  ]);
  assert.deepEqual(
    tasks.map((resource) => resource.ref.id),
    ["task_a", "task_b"],
  );
  assert.deepEqual(
    others.map((resource) => resource.ref.id),
    ["artifact_a"],
  );
});

test("status labels are reader-facing and never leak raw enums", () => {
  assert.equal(taskStatusLabel("awaiting_acceptance"), "待承接");
  assert.equal(taskStatusLabel("in_progress"), "进行中");
  assert.equal(taskStatusLabel("completed"), "已完成");
  assert.equal(taskStatusLabel("some_new_state"), "");
  assert.equal(taskStatusLabel(undefined), "");
});

test("an older text-only invitation is still recognised as one", () => {
  assert.equal(
    legacyTaskInvitation("吴繁理邀请你承接任务「汇总可评审方案」。请在任务待办中查看详情并决定是否接受。"),
    "汇总可评审方案",
  );
  // Nothing else becomes an invitation card.
  assert.equal(legacyTaskInvitation("吴繁理需要你帮忙：核对实验条件。"), undefined);
  assert.equal(legacyTaskInvitation(""), undefined);
  assert.equal(legacyTaskInvitation(null), undefined);
});

test("the message renderer shows the card instead of a duplicated sentence", async () => {
  const source = await readFile(
    new URL("../src/research/ResearchMessageRender.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /isTaskNotice\(read\.data\?\.fact\)/);
  assert.match(source, /<ResearchTaskCard[\s\S]*?text=\{read\.data\.fact\.text \|\| undefined\}/);
  assert.match(source, /<LegacyTaskInviteCard text=\{read\.data\.fact\.text\}/);
  assert.match(source, /splitTaskResources\(/);
  assert.match(source, /otherResources\.map/);
});
