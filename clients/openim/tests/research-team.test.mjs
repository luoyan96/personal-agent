import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import {
  teamDeadline,
  teamNextStep,
  teamTaskStatus,
} from "../src/research/research-team.ts";

const task = (
  date,
  status = "in_progress",
  confirmed = true,
  timezone = "Asia/Shanghai",
) => ({
  planId: "plan_synthetic",
  status,
  schedule: {
    hardDeadline: {
      value: { kind: "date", date, timezone },
      confirmed,
      source: "user",
    },
  },
});
test("calendar deadlines respect the declared timezone and allow the entire deadline day", () => {
  const now = new Date("2026-10-10T16:30:00Z");
  assert.equal(teamDeadline(task("2026-10-10"), now).overdue, true);
  assert.equal(
    teamDeadline(task("2026-10-10", "in_progress", true, "America/Los_Angeles"), now)
      .overdue,
    false,
  );
  assert.equal(teamDeadline(task("2026-10-11"), now).overdue, false);
});
test("suggestions and finished tasks never become overdue work", () => {
  const now = new Date("2026-10-10T00:00:00Z");
  assert.equal(
    teamDeadline(task("2026-10-01", "in_progress", false), now).overdue,
    false,
  );
  assert.equal(teamDeadline(task("2026-10-01", "completed"), now).overdue, false);
  assert.equal(teamDeadline(task("2026-10-01", "cancelled"), now).overdue, false);
  assert.match(
    teamDeadline(task("2026-10-11", "in_progress", false), now).label,
    /待确认/,
  );
});
test("confirmed commitments supply deadline attention when the hard deadline is only a suggestion", () => {
  const value = task("2026-10-01", "in_progress", false);
  value.schedule.committed = {
    value: { kind: "instant", at: "2026-10-10T10:00:00Z" },
    confirmed: true,
  };
  assert.equal(teamDeadline(value, new Date("2026-10-10T11:00:00Z")).overdue, true);
  assert.match(teamDeadline(value).label, /承诺/);
});
test("an invitation stays unaccepted and an unreviewed result points to human review", () => {
  const summary = { visibleStatus: "awaiting_acceptance" };
  assert.equal(teamTaskStatus(summary), "awaiting_acceptance");
  assert.match(teamNextStep(summary), /确认任务范围/);
  assert.match(teamNextStep({ planId: "plan", status: "in_review" }), /审阅实际交付/);
  assert.match(teamNextStep({ planId: "plan", status: "changes_requested" }), /修订/);
  assert.equal(
    teamNextStep({
      planId: "plan",
      status: "blocked",
      blocker: { requestedAction: "补充原始数据" },
    }),
    "补充原始数据",
  );
});
test("either real commitment may become overdue even when the hard deadline is later", () => {
  const value = task("2026-10-20");
  value.schedule.committed = {
    value: { kind: "date", date: "2026-10-09", timezone: "Asia/Shanghai" },
    confirmed: true,
    source: "member",
  };
  const date = teamDeadline(value, new Date("2026-10-10T00:00:00Z"));
  assert.equal(date.overdue, true);
  assert.match(date.label, /承诺 2026-10-09/);
});
test("a suggestion source is never deadline attention even when marked confirmed", () => {
  const value = task("2026-10-01");
  value.schedule.hardDeadline.source = "suggestion";
  assert.equal(teamDeadline(value, new Date("2026-10-10T00:00:00Z")).overdue, false);
  value.schedule.hardDeadline.value.date = "2026-10-11";
  assert.equal(teamDeadline(value, new Date("2026-10-10T00:00:00Z")).soon, false);
  assert.match(teamDeadline(value).label, /待确认/);
});
test("old workbench and new research team have independent healthy-service gates", async () => {
  const source = await readFile(
    new URL("../src/research/workspace-availability.ts", import.meta.url),
    "utf8",
  );
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
      .outputText,
    {
      module,
      exports: module.exports,
      require: () => ({ withRequestDeadline: (run) => run() }),
    },
  );
  const { workspaceAvailability } = module.exports;
  const health = (version) => ({ data: { status: "ok", contractVersion: version } });
  assert.equal(workspaceAvailability(health("0.22.0")).available, true);
  assert.equal(workspaceAvailability(health("0.22.0"), 23).available, false);
  assert.equal(workspaceAvailability(health("0.23.0"), 23).available, true);
  assert.throws(() => workspaceAvailability(health("unknown"), 23));
});
