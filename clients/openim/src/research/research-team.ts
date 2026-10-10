import type { TaskModel, TaskSummaryModel } from "@research-agent-platform/contracts";

export type TeamTask = TaskModel | TaskSummaryModel;
export const isFullTask = (task: TeamTask): task is TaskModel => "planId" in task;
export const teamTaskStatus = (task: TeamTask) =>
  isFullTask(task) ? task.status : task.visibleStatus || "awaiting_acceptance";

/** Calendar deadlines use their declared timezone; suggestions never become overdue facts. */
export function teamDeadline(task: TeamTask, now = new Date()) {
  const dates = [
    { kind: "截止", dated: task.schedule.hardDeadline },
    { kind: "承诺", dated: task.schedule.committed },
  ].flatMap(({ kind, dated }) => {
    if (!dated) return [];
    const value = dated.value;
    let days: number, label: string;
    if (value.kind === "date") {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: value.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const part = (type: string) => parts.find((p) => p.type === type)?.value;
      const today = `${part("year")}-${part("month")}-${part("day")}`;
      days = (Date.parse(value.date) - Date.parse(today)) / 86400000;
      label = `${value.date} · ${value.timezone}`;
    } else {
      days = (Date.parse(value.at) - now.getTime()) / 86400000;
      label = new Date(value.at).toLocaleString("zh-CN");
    }
    return [
      {
        kind,
        label,
        days,
        confirmed: dated.confirmed && dated.source !== "suggestion",
      },
    ];
  });
  if (!dates.length) return { label: "未设置截止", overdue: false, soon: false };
  const confirmed = dates
    .filter((date) => date.confirmed)
    .sort((a, b) => a.days - b.days);
  const next = confirmed[0] || dates[0];
  const active = !["completed", "cancelled"].includes(teamTaskStatus(task));
  return {
    label: `${next.kind} ${next.label}${next.confirmed ? "" : "（待确认）"}`,
    overdue: active && confirmed.some((date) => date.days < 0),
    soon: active && confirmed.some((date) => date.days >= 0 && date.days <= 7),
  };
}

export function teamNextStep(task: TeamTask): string {
  const status = teamTaskStatus(task);
  if (status === "completed") return "查看当前成果与实际审阅记录";
  if (status === "cancelled") return "已取消，可查看历史记录";
  if (status === "blocked" && isFullTask(task))
    return task.blocker?.requestedAction || "说明阻碍，协调所需支持";
  if (status === "in_review") return "审阅实际交付，给出通过或修改意见";
  if (status === "changes_requested") return "依据审阅意见修订，再提交成果";
  if (status === "awaiting_acceptance") return "受邀成员确认任务范围与时间";
  if (status === "unassigned") return "明确交付要求，邀请或认领负责人";
  if (status === "ready") return "核对材料与前置成果，开始任务";
  return "推进当前任务，记录结果或说明阻碍";
}
