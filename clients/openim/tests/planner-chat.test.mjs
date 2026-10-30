import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  newPlannerThread,
  plannerCacheKey,
  readPlannerHistory,
  planningPrompt,
  planReplyText,
  plannerReplyMessage,
  plannerDeadline,
  needsDeadlineClarification,
  plannerPlanInput,
  plannerTaskShape,
  isPlannerCreateCommand,
  createPlannerTasks,
  stopPlannerRequest,
  plannerFailureText,
  canRetryPlannerReply,
  plannerRetryInput,
  isPlannerFailureReceipt,
} from "../src/research/planner-chat.ts";
const schedule = () => ({
  suggested: null,
  hardDeadline: null,
  committed: null,
  checkpoint: null,
  estimatedHumanHours: null,
});
const makePlan = () => ({
  id: "plan_qa",
  labId: "lab_qa",
  ownerId: "actor_qa",
  version: 1,
  status: "draft",
  createdAt: "2026-10-19T00:00:00Z",
  goal: "合成课题",
  unresolvedQuestions: [],
  proposedItems: [1, 2].map((n) => ({
    id: "step_" + n,
    title: "任务" + n,
    goal: "目标" + n,
    deliverable: "材料" + n,
    acceptanceCriteria: "可复核",
    allocation: { kind: "self" },
    dependencies: [],
    schedule: schedule(),
    inputArtifactIds: [],
    budget: null,
  })),
});

test("a conversational reply with no plan is visible and keeps scientific text intact", () => {
  const text =
    "We can compare “what if?” with https://example.org/paper?view=abstract .\nThen inspect the evidence.";
  const result = { status: "ready", reply: { message: text, plan: null } };
  assert.deepEqual(plannerReplyMessage(result), { text });
  assert.equal(
    plannerReplyMessage({ status: "failed", reply: { message: text, plan: null } }),
    undefined,
  );
  assert.equal(plannerReplyMessage({ status: "ready", reply: null }), undefined);
});

test("draft messages use the actual answer, retain the plan version, and remain compatible with old replies", () => {
  const plan = makePlan();
  assert.deepEqual(
    plannerReplyMessage({
      status: "draft",
      reply: { message: "Synthetic research judgment.", plan },
    }),
    {
      text: "Synthetic research judgment.",
      plan: { id: plan.id, version: plan.version },
    },
  );
  assert.deepEqual(plannerReplyMessage({ status: "draft", reply: { plan } }), {
    text: planReplyText(plan),
    plan: { id: plan.id, version: plan.version },
  });
});
test("a failed model reply explains the system failure and offers only a deliberate safe retry", () => {
  const result = { status: "failed", failure: "INVALID_MODEL_OUTPUT" };
  assert.match(plannerFailureText(result), /系统处理/);
  assert.doesNotMatch(plannerFailureText(result), /继续说明|补充信息|缩小需求/);
  assert.equal(canRetryPlannerReply(result), true);
  assert.equal(
    canRetryPlannerReply({ ...result, failure: "PLANNING_SAVE_FAILED" }),
    true,
  );
  for (const value of [
    { status: "running", failure: null },
    { status: "cancelled", failure: "INVALID_MODEL_OUTPUT" },
    { status: "failed", failure: "BUDGET_EXCEEDED" },
    { status: "failed", failure: "MODEL_UNAVAILABLE" },
  ])
    assert.equal(canRetryPlannerReply(value), false);
});
test("retry keeps the earlier conversation and the original follow-up exactly once, including old cached failures", () => {
  const messages = [
    { id: "one", role: "user", text: "Synthetic existing work" },
    { id: "two", role: "assistant", text: "Synthetic first response" },
    { id: "three", role: "user", text: "SYNTHETIC_FOLLOWUP" },
    {
      id: "four",
      role: "service",
      text: "这次规划未能完成。您可以继续说明后重新规划，已有任务没有因此改变。",
    },
  ];
  const restored = readPlannerHistory(
    JSON.stringify({
      active: "thread",
      threads: [
        {
          ...newPlannerThread(),
          id: "thread",
          messages,
          draft: "Unsent independent draft",
        },
      ],
    }),
  ).threads[0];
  const retry = plannerRetryInput(restored.messages);
  assert.equal(retry.text, "SYNTHETIC_FOLLOWUP");
  assert.deepEqual(retry.messages, messages.slice(0, 2));
  const prompt = planningPrompt(retry.messages, retry.text, []).prompt;
  assert.equal(prompt.split("SYNTHETIC_FOLLOWUP").length - 1, 1);
  assert.match(prompt, /Synthetic first response/);
  assert.equal(restored.draft, "Unsent independent draft");
  assert.deepEqual(restored.messages, messages);
});
test("retry cannot resubmit a creation command or a message still waiting for an assistant response", () => {
  assert.equal(
    plannerRetryInput([
      { id: "one", role: "user", text: "确认创建任务" },
      { id: "two", role: "service", text: "failed" },
    ]),
    undefined,
  );
  assert.equal(
    plannerRetryInput([{ id: "one", role: "user", text: "Synthetic follow-up" }]),
    undefined,
  );
});
test("an old failed request never relabels a later task creation receipt or another request", () => {
  const result = { id: "failed_job", status: "failed" };
  assert.equal(
    isPlannerFailureReceipt(
      { id: "one", role: "service", text: "这份计划已建立 2 项任务。" },
      result,
    ),
    false,
  );
  assert.equal(
    isPlannerFailureReceipt(
      { id: "one", role: "service", text: "这次规划未能完成。" },
      result,
    ),
    true,
  );
  assert.equal(
    isPlannerFailureReceipt(
      { id: "one", role: "service", text: "System issue", requestId: "other_job" },
      result,
    ),
    false,
  );
  assert.equal(
    isPlannerFailureReceipt(
      { id: "one", role: "service", text: "System issue", requestId: result.id },
      result,
    ),
    true,
  );
});
function fake(initial = makePlan(), failure) {
  let value = structuredClone(initial),
    calls = [];
  return {
    get value() {
      return value;
    },
    calls,
    async call(name, args) {
      calls.push({ name, args });
      if (name === "getPlan") return { data: structuredClone(value) };
      if (name === "editPlan") {
        assert.equal(args.body.expectedVersion, value.version);
        const { expectedVersion, ...body } = args.body;
        value = { ...value, ...body, version: value.version + 1 };
        if (failure === "edit") {
          failure = null;
          throw new Error("reply lost");
        }
        return { data: structuredClone(value) };
      }
      if (name === "confirmPlan") {
        assert.equal(args.body.expectedVersion, value.version);
        value = { ...value, status: "confirmed", version: value.version + 1 };
        if (failure === "confirm") {
          failure = null;
          throw new Error("reply lost");
        }
        return {
          data: {
            plan: structuredClone(value),
            taskIds: value.proposedItems.map((_, i) => `task_${i + 1}`),
          },
        };
      }
      if (name === "planTasks")
        return {
          data: {
            steps: value.proposedItems.map((_, i) => ({ taskId: `task_${i + 1}` })),
          },
        };
      throw new Error(name);
    },
  };
}
test("automatic sizing is the default; object counts, complaints and quotes do not force multiple tasks", () => {
  for (const text of [
    "完善论文和实验",
    "比较3个模型并写报告",
    "为什么给我创建了7个任务",
    "上次让我创建7个任务太多了",
    "他说创建7个任务",
    "请创建7个任务？",
    "请创建“7个任务”",
    "不要拆分任务",
    "不要创建多个任务",
    "合并成一个任务",
    "我只要一个任务",
    "改为小王负责",
    "继续修改说明",
  ])
    assert.equal(plannerTaskShape(text), "auto");
  for (const text of [
    "拆成两个任务",
    "请帮我创建3项任务",
    "分别创建多个任务",
    "改成3项任务",
  ])
    assert.equal(plannerTaskShape(text), "multiple");
});
test("task input treats a stated goal as a draft and keeps task count outside editable personality", () => {
  const automatic = planningPrompt([], "完善现有论文", []).prompt;
  assert(automatic.includes("普通目标默认一项"));
  assert(automatic.includes("独立分工、分别交付和跟踪"));
  assert(automatic.includes("不要求用户选择模式"));
  assert(automatic.includes("不凭‘难’‘重要’"));
  assert(automatic.includes("用户明确说合成一项或分开安排时按其意图重写完整草案"));
  assert(automatic.includes("人设和方法建议不能改变"));
  const split = planningPrompt([], "分别安排", [], undefined, "", "multiple").prompt;
  assert(split.includes("用户这轮明确要分开安排"));
  assert(split.includes("不强行凑数"));
  assert(!split.includes("普通目标默认一项"));
});
test("a stated deadline edits the reviewed draft in place and keeps its task count", async () => {
  for (const failure of [undefined, "edit", "confirm"]) {
    const plan = makePlan(),
      f = fake(plan, failure),
      intent = {
        key: "deadline_task_confirmation",
        plan,
        deadline: { date: "2026-11-01", target: "final" },
      };
    if (failure)
      await assert.rejects(
        createPlannerTasks(f.call, intent, () => true),
        /reply lost/,
      );
    const result = await createPlannerTasks(f.call, intent, () => true);
    assert.equal(result.taskIds.length, plan.proposedItems.length);
    assert.equal(result.plan.proposedItems.length, plan.proposedItems.length);
    assert.equal(
      result.plan.proposedItems.at(-1).schedule.hardDeadline.value.date,
      "2026-11-01",
    );
    assert.equal(result.plan.proposedItems[0].schedule.committed, null);
    assert.equal(f.calls.filter((call) => call.name === "editPlan").length, 1);
    assert.equal(f.calls.filter((call) => call.name === "confirmPlan").length, 1);
    assert.equal(result.plan.version, 3);
  }
});
test("a pending write without a shape confirms the reviewed count and reconciles created links", async () => {
  const plan = makePlan(),
    f = fake(plan),
    legacy = { key: "legacy_confirmation", plan };
  const result = await createPlannerTasks(f.call, legacy, () => true);
  assert.equal(result.taskIds.length, 2);
  const completed = fake(plan, "confirm");
  await assert.rejects(
    createPlannerTasks(completed.call, legacy, () => true),
    /reply lost/,
  );
  const reconciled = await createPlannerTasks(completed.call, legacy, () => true);
  assert.equal(reconciled.taskIds.length, 2);
  assert.equal(completed.calls.filter((call) => call.name === "confirmPlan").length, 1);
});
test("old transcripts keep their conversation but drop a pending one-task merge write", () => {
  const thread = { ...newPlannerThread(), id: "thread_legacy" };
  const raw = (creating, shape) =>
    JSON.stringify({
      active: thread.id,
      threads: [{ ...thread, ...(shape ? { taskShape: shape } : {}), creating }],
    });
  const merged = readPlannerHistory(
    raw(
      { key: "synthetic_confirmation", plan: makePlan(), taskShape: "single" },
      "single",
    ),
  ).threads[0];
  assert.equal(merged.creating, undefined);
  assert.equal("taskShape" in merged, false);
  const reviewed = readPlannerHistory(
    raw(
      { key: "synthetic_confirmation", plan: makePlan(), taskShape: "multiple" },
      "multiple",
    ),
  ).threads[0];
  assert.equal(reviewed.creating.plan.proposedItems.length, 2);
  assert.equal("taskShape" in reviewed.creating, false);
});
test("a reviewed snapshot survives in its account-scoped transcript, while an invalid one is dropped", () => {
  const thread = { ...newPlannerThread(), id: "thread_snapshot" };
  thread.creating = { key: "synthetic_confirmation", plan: makePlan() };
  const restore = (creating) =>
    readPlannerHistory(
      JSON.stringify({ active: thread.id, threads: [{ ...thread, creating }] }),
    );
  assert.equal(
    restore(thread.creating).threads[0].creating.key,
    "synthetic_confirmation",
  );
  assert.equal(restore({ ...thread.creating, key: "short" }), undefined);
});
test("new requests carry no stored shape, and explicit merge or split wording is left to the model", () => {
  const thread = { ...newPlannerThread(), id: "thread_shape" };
  const restore = () =>
    readPlannerHistory(JSON.stringify({ active: thread.id, threads: [thread] }))
      .threads[0];
  assert.equal("taskShape" in restore(), false);
  assert.equal(plannerTaskShape("继续完善安排"), "auto");
  thread.messages = [{ id: "user_split", role: "user", text: "拆成三个任务" }];
  assert.equal(plannerTaskShape(thread.messages.at(-1).text), "multiple");
  thread.messages.push({ id: "user_combine", role: "user", text: "合并成一个任务" });
  assert.equal(plannerTaskShape(thread.messages.at(-1).text), "auto");
  assert.equal(plannerTaskShape("这次分开安排好些"), "auto"); // Let the model read natural corrections in context.
});
test("automatic sizing previews and confirms the exact model draft count, with no silent merge or extra task", async () => {
  for (const count of [1, 3]) {
    const plan = makePlan();
    plan.proposedItems = Array.from({ length: count }, (_, i) => ({
      ...structuredClone(plan.proposedItems[0]),
      id: `step_${i + 1}`,
      title: `独立交付${i + 1}`,
    }));
    const preview = plannerPlanInput(plan, undefined);
    assert.deepEqual(preview.proposedItems, plan.proposedItems);
    const f = fake(plan, "confirm"),
      intent = { key: "auto_confirmation_key", plan };
    await assert.rejects(
      createPlannerTasks(f.call, intent, () => true),
      /reply lost/,
    );
    const recovered = await createPlannerTasks(f.call, intent, () => true);
    assert.equal(recovered.taskIds.length, count);
    assert.deepEqual(recovered.plan.proposedItems, preview.proposedItems);
    assert.equal(f.calls.filter((c) => c.name === "editPlan").length, 0);
    assert.equal(f.calls.filter((c) => c.name === "confirmPlan").length, 1);
  }
});
test("planner has no manual sizing switch and no client-side merge of a reviewed draft", () => {
  const source = readFileSync(
    new URL("../src/research/PlanningAgent.tsx", import.meta.url),
    "utf8",
  );
  const core = readFileSync(
    new URL("../src/research/planner-chat.ts", import.meta.url),
    "utf8",
  );
  assert(!source.includes("planning-task-shape"));
  assert(!source.includes("合为一项任务"));
  assert(!source.includes("改为多项任务"));
  assert(!core.includes("plannerTaskInput"));
  assert(core.includes('export type PlannerTaskShape = "auto" | "multiple"'));
  assert(source.includes("const taskShape = plannerTaskShape(text);"));
  assert(!source.includes("plannerTaskShape(text, thread.taskShape)"));
});
test("transcript keys isolate service, actor and laboratory, restored pending writes remain explicit", () => {
  assert.notEqual(
    plannerCacheKey("https://one", "a", "lab"),
    plannerCacheKey("https://two", "a", "lab"),
  );
  assert.notEqual(
    plannerCacheKey("https://one", "a", "lab"),
    plannerCacheKey("https://one", "b", "lab"),
  );
  assert.notEqual(
    plannerCacheKey("https://one", "a", "lab"),
    plannerCacheKey("https://one", "a", "other"),
  );
  const t = newPlannerThread();
  t.creating = { key: "idempotency_key_1234", plan: makePlan() };
  assert.equal(
    readPlannerHistory(JSON.stringify({ active: t.id, threads: [t] })).threads[0]
      .creating.plan.id,
    "plan_qa",
  );
  assert.equal(
    readPlannerHistory(
      JSON.stringify({ active: t.id, threads: [{ ...t, taskIds: "bad" }] }),
    ),
    undefined,
  );
  assert.equal(readPlannerHistory("{invalid"), undefined);
});
test("conversation context stays bounded, keeps the latest request intact, and reports omitted history", () => {
  const messages = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    role: "user",
    text: "旧条件" + i + "长".repeat(1000),
  }));
  const text = "当前明确需求" + "文".repeat(3500);
  const result = planningPrompt(messages, text, [
    { id: "member_b", displayName: "同学乙" },
  ]);
  assert(result.prompt.length <= 8000);
  assert(result.prompt.endsWith(text));
  assert(result.prompt.includes("同学乙（member_b）"));
  assert(result.omitted > 0);
  assert(!result.prompt.includes("旧条件0长"));
});

test("the shipped decomposition method uses existing plan fields and leaves the latest request intact", () => {
  const skill = readFileSync(
    new URL("../../../agents/skills/task-decomposition/SKILL.md", import.meta.url),
    "utf8",
  );
  const text = "请比较三种合成模型并整理组会报告";
  const result = planningPrompt([], text, [], undefined, skill);
  assert(result.prompt.includes("按产出倒推"));
  assert(result.prompt.includes("依赖无环"));
  assert(result.prompt.includes("dependencies 字段"));
  assert(!result.prompt.includes("name: task-decomposition"));
  assert(result.prompt.endsWith(text));
  assert(result.prompt.length <= 8000);
});

test("a conversational clarification is shown as the reply without an internal goal heading or questionnaire", () => {
  const plan = makePlan();
  plan.goal = "继续已有研究（内部草案目标）";
  plan.proposedItems = [];
  plan.unresolvedQuestions = [
    "可以，我们从已有工作继续。先说说这项研究主要想解决什么问题？",
  ];
  assert.equal(planReplyText(plan), plan.unresolvedQuestions[0]);
  assert(!planReplyText(plan).includes(plan.goal));
  assert(!planReplyText(plan).includes("还需要您补充"));
});

test("legacy multi-question plans present one exchange while preserving every saved uncertainty", () => {
  const plan = makePlan();
  plan.unresolvedQuestions = ["研究重点是什么？", "何时交付？", "谁来参与？"];
  const original = structuredClone(plan);
  assert.equal(planReplyText(plan), "研究重点是什么？");
  assert.deepEqual(plan, original);
  plan.unresolvedQuestions = ["还需要您补充：\n1. 研究重点是什么？\n2. 何时交付？"];
  assert.equal(planReplyText(plan), "研究重点是什么？");
  plan.unresolvedQuestions = ["还需要您补充：", "研究重点是什么？"];
  assert.equal(planReplyText(plan), "研究重点是什么？");
});

test("scientific quotations, question marks and URLs in one exchange are not sliced into broken text", () => {
  const plan = makePlan();
  plan.unresolvedQuestions = [
    "我们先看“what if?”的对照思路，参考 https://example.org/paper?view=abstract 。你最想验证哪个解释？",
  ];
  assert.equal(planReplyText(plan), plan.unresolvedQuestions[0]);
});

test("a reply with no uncertainty does not invent questions, dates, participants or completed work", () => {
  const plan = makePlan();
  const text = planReplyText(plan);
  assert(text.includes("2 个步骤"));
  assert(!/[？?]/.test(text));
  assert(!/已创建|已完成|已接受|截止/.test(text));
  plan.proposedItems = [];
  assert.equal(planReplyText(plan), plan.goal);
});

test("the full shipped method and the latest 4000-character request fit with a large team and prior conversation", () => {
  const skill = readFileSync(
    new URL("../../../agents/skills/task-decomposition/SKILL.md", import.meta.url),
    "utf8",
  );
  const text = "本轮明确补充" + "文".repeat(3994);
  const people = Array.from({ length: 20 }, (_, i) => ({
    id: `member_${i}`,
    displayName: "成员" + "长".repeat(75),
  }));
  const history = [
    {
      id: "earlier",
      role: "user",
      text: "已有一份研究稿，希望沿现有工作继续；暂时没有明确日期。",
    },
  ];
  const result = planningPrompt(history, text, people, undefined, skill);
  assert(result.prompt.endsWith(text));
  assert(result.prompt.length <= 8000);
  assert(
    result.prompt.includes(skill.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "").trim()),
  );
});
test("only explicit create commands authorize confirmation; questions, quotes and negations cannot", () => {
  for (const v of ["确认创建任务", "确认创建", "就按这个方案创建任务！"])
    assert(isPlannerCreateCommand(v));
  for (const v of [
    "不要确认创建任务",
    "确认创建任务吗？",
    "他说“确认创建任务”",
    "确认创建任务，然后再讨论",
    "好",
    '"确认创建任务"',
  ])
    assert.equal(isPlannerCreateCommand(v), false);
});
test("Chinese weekdays and calendar dates are resolved against Beijing date, ambiguity stays unresolved", () => {
  const now = new Date("2026-10-19T00:00:00Z");
  assert.deepEqual(plannerDeadline("周五交付报告", now), {
    date: "2026-10-23",
    target: "final",
  });
  assert.deepEqual(plannerDeadline("所有任务截止下周五", now), {
    date: "2026-10-30",
    target: "all",
  });
  assert.deepEqual(plannerDeadline("第2步改到2026年10月25日", now), {
    date: "2026-10-25",
    target: 1,
  });
  assert.equal(plannerDeadline("不要周五截止", now), undefined);
  assert.equal(plannerDeadline("周三完成A，周五完成B", now), undefined);
  assert.equal(plannerDeadline("截止2026-02-30", now), undefined);
  assert.deepEqual(plannerDeadline("取消整体截止日期", now), {
    date: null,
    target: "all",
  });
});
test("deadline proposals change only the explicitly selected steps and do not mutate the current plan", () => {
  const p = makePlan(),
    result = plannerPlanInput(p, { date: "2026-10-23", target: "final" });
  assert.equal(p.proposedItems[1].schedule.hardDeadline, null);
  assert.equal(result.proposedItems[0].schedule.hardDeadline, null);
  assert.equal(result.proposedItems[1].schedule.hardDeadline.value.date, "2026-10-23");
  assert.throws(() => plannerPlanInput(p, { date: "2026-10-23", target: 4 }), /不存在/);
});
test("creation rechecks the exact reviewed version and uses one stable confirmation key", async () => {
  const p = makePlan(),
    f = fake(p);
  const out = await createPlannerTasks(
    f.call,
    { key: "stable_confirmation_123", plan: p },
    () => true,
  );
  assert.deepEqual(out.taskIds, ["task_1", "task_2"]);
  assert.equal(f.calls.filter((c) => c.name === "confirmPlan").length, 1);
  assert.equal(
    f.calls.find((c) => c.name === "confirmPlan").args.idempotencyKey,
    "stable_confirmation_123",
  );
});
test("a stale reviewed version cannot confirm unseen changes", async () => {
  const p = makePlan(),
    changed = { ...p, version: 2, goal: "其他窗口的修改" },
    f = fake(changed);
  await assert.rejects(
    createPlannerTasks(
      f.call,
      { key: "stable_confirmation_123", plan: p },
      () => true,
    ),
    /其他窗口/,
  );
  assert.equal(f.calls.filter((c) => c.name === "confirmPlan").length, 0);
});
test("uncertain confirmation is reconciled to real task links without a second confirmation", async () => {
  const p = makePlan(),
    f = fake(p, "confirm"),
    intent = { key: "stable_confirmation_123", plan: p };
  await assert.rejects(
    createPlannerTasks(f.call, intent, () => true),
    /reply lost/,
  );
  const out = await createPlannerTasks(f.call, intent, () => true);
  assert.deepEqual(out.taskIds, ["task_1", "task_2"]);
  assert.equal(f.calls.filter((c) => c.name === "confirmPlan").length, 1);
});
test("an acknowledged date edit with a lost reply is resumed once and confirmed under its exact new version", async () => {
  const p = makePlan(),
    f = fake(p, "edit"),
    intent = {
      key: "stable_confirmation_123",
      plan: p,
      deadline: { date: "2026-10-23", target: "final" },
    };
  await assert.rejects(
    createPlannerTasks(f.call, intent, () => true),
    /reply lost/,
  );
  const out = await createPlannerTasks(f.call, intent, () => true);
  assert.equal(f.calls.filter((c) => c.name === "editPlan").length, 1);
  assert.equal(out.plan.version, 3);
  assert.equal(
    out.plan.proposedItems[1].schedule.hardDeadline.value.date,
    "2026-10-23",
  );
});
test("account or thread cancellation after a read prevents all mutations", async () => {
  const p = makePlan(),
    f = fake(p);
  let active = true;
  const api = async (name, args) => {
    const v = await f.call(name, args);
    active = false;
    return v;
  };
  await assert.rejects(
    createPlannerTasks(
      api,
      { key: "stable_confirmation_123", plan: p },
      () => active,
    ),
    /已切换/,
  );
  assert.equal(f.calls.length, 1);
});

test("stop uses the latest version of the same job and rereads a single queue race", async () => {
  const calls = [];
  let reads = 0;
  await stopPlannerRequest(
    async (name, args) => {
      calls.push([name, args]);
      if (name === "getPlanRequest")
        return { data: { id: "job_one", status: "running", version: ++reads + 1 } };
      if (reads === 1)
        throw Object.assign(new Error("queue advanced"), { status: 409 });
      return { data: { status: "cancelled" } };
    },
    "job_one",
    () => true,
  );
  assert.deepEqual(
    calls.map(([n]) => n),
    ["getPlanRequest", "cancelPlanning", "getPlanRequest", "cancelPlanning"],
  );
  assert.ok(calls.every(([, a]) => a.params.id === "job_one"));
  assert.equal(calls[3][1].body.expectedVersion, 3);
});

test("stop never cancels a completed request or a changed account", async () => {
  let writes = 0,
    active = true;
  await stopPlannerRequest(
    async (name) => {
      if (name === "cancelPlanning") writes++;
      return { data: { status: "draft", version: 3 } };
    },
    "job_one",
    () => active,
  );
  await stopPlannerRequest(
    async (name) => {
      if (name === "cancelPlanning") writes++;
      active = false;
      return { data: { status: "running", version: 2 } };
    },
    "job_one",
    () => active,
  );
  assert.equal(writes, 0);
});

test("unsupported or ambiguous deadlines require clarification instead of silently replacing dates", () => {
  assert.equal(plannerDeadline("第二项周五截止").target, 1);
  for (const text of [
    "不是周五截止，改成周一",
    "前两项周五交付",
    "周五下午三点交付",
    "2026-02-30 交付",
  ]) {
    assert.equal(plannerDeadline(text), undefined);
    assert.equal(needsDeadlineClarification(text), true);
  }
  assert.equal(needsDeadlineClarification("改由我负责"), false);
  assert.equal(
    needsDeadlineClarification("2026-10-23 交付", plannerDeadline("2026-10-23 交付")),
    false,
  );
});
