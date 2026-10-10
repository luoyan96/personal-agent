import { test } from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { PlanInput } from "@research-agent-platform/contracts";
import {
  planningTemplate,
  planProblems,
  planDate,
} from "../src/research/task-planning.ts";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

test("research templates produce valid drafts with separate IDs and explicit dependencies", () => {
  for (const kind of ["reading", "experiment", "writing"]) {
    const plan = planningTemplate(kind, "lab_synthetic", "整理研究方案");
    assert.equal(PlanInput.safeParse(plan).success, true);
    assert.deepEqual(planProblems(plan), []);
    assert.equal(new Set(plan.proposedItems.map((s) => s.id)).size, 3);
    assert.deepEqual(plan.proposedItems[1].dependencies, [plan.proposedItems[0].id]);
    assert(
      plan.proposedItems.every(
        (s) =>
          s.allocation.kind === "self" &&
          s.schedule.hardDeadline === null &&
          s.inputArtifactIds.length === 0,
      ),
    );
  }
});
test("a cycle or dangling dependency is refused before confirmation", () => {
  const plan = planningTemplate("reading", "lab_synthetic", "阅读论文");
  plan.proposedItems[0].dependencies = [plan.proposedItems[2].id];
  assert(planProblems(plan).some((p) => p.includes("循环")));
  plan.proposedItems[0].dependencies = ["missing"];
  assert(planProblems(plan).some((p) => p.includes("不存在")));
});
test("incomplete or ambiguous steps cannot be presented as a confirmable plan", () => {
  const plan = planningTemplate("experiment", "lab_synthetic", "运行实验");
  plan.proposedItems[1].acceptanceCriteria = "  ";
  plan.proposedItems[1].title = plan.proposedItems[0].title;
  assert(planProblems(plan).some((p) => p.includes("验收标准")));
  plan.proposedItems[1].acceptanceCriteria = "按证据审阅";
  assert.deepEqual(planProblems(plan), []); // Stable item IDs permit repeated titles.
});
test("unknown deadlines stay unknown and explicit invalid calendar dates are rejected", () => {
  const plan = planningTemplate("writing", "lab_synthetic", "完成写作");
  assert.equal(planDate(plan.proposedItems[0].schedule.hardDeadline), "");
  plan.proposedItems[0].schedule.hardDeadline = {
    value: { kind: "date", date: "2026-02-30", timezone: "Asia/Shanghai" },
    source: "user",
    confirmed: true,
  };
  assert(planProblems(plan).length > 0);
});
