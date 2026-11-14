import { Alert, Button, Drawer, Input, Segmented, Select } from "antd";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import {
  isFullTask,
  teamDeadline,
  teamNextStep,
  teamTaskStatus,
} from "./research-team";
import { workspaceStatusLabel } from "./workspace-labels";
import { ResearchTeamAccountHint } from "./ResearchTeamAccountHint";
import { collectTeamWorkspace, teamDirections } from "./team-progress";
import {
  TaskWorkspace,
  TaskListRow,
  TaskReadNotice,
  WorkspaceTaskDetail,
} from "./TaskWorkspace";
import { transientReadFailure } from "./read-errors";

type Filter = "all" | "review" | "deadline";

export function ResearchTeamWorkbench({
  onPlan,
  refresh,
  selectedTask,
  onSelectTask,
}: {
  onPlan: () => void;
  refresh?: number;
  selectedTask?: string;
  onSelectTask: (id: string) => void;
}) {
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const laboratory = actor?.spaceKind === "laboratory";
  const [scope, setScope] = useState<"lab" | "mine">("lab");
  const [filter, setFilter] = useState<Filter>("all");
  const [stage, setStage] = useState("all");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<string>();
  const [page, setPage] = useState(1);
  const [membersOpen, setMembersOpen] = useState(false);
  const read = useResearchRead(
    (signal) =>
      collectTeamWorkspace(
        (query, signal) =>
          researchApi("researchWorkspace", {
            params: { id: actor!.member.labId },
            query: { scope, ...query },
            signal,
          }),
        signal,
      ),
    `team-progress:${actor?.member.labId}:${scope}`,
    laboratory,
    { timeoutMs: 10000, keepDataOnError: transientReadFailure },
  );
  const members = useResearchRead(
    (signal) =>
      researchApi("members", {
        params: { id: actor!.member.labId },
        query: { limit: 100 },
        signal,
      }),
    `team-progress-members:${actor?.member.labId}`,
    laboratory,
    { timeoutMs: 10000 },
  );
  useEffect(() => {
    if (refresh) void read.refresh();
  }, [refresh, read.refresh]);
  useLayoutEffect(() => {
    setScope("lab");
    setFilter("all");
    setStage("all");
    setSearch("");
    setDirection(undefined);
    setPage(1);
    setMembersOpen(false);
  }, [generation]);
  const people = Object.fromEntries(
    (members.data?.data || []).map((m) => [m.id, m.displayName]),
  );
  const name = (id: string | null) =>
    id ? people[id] || "成员姓名待读取" : "未指定成员";
  const rows = read.data?.data || [];
  const directions = useMemo(() => teamDirections(rows), [read.data]);
  const assignments = useMemo(() => {
    const counts = new Map<
      string,
      { working: number; review: number; invited: number }
    >();
    const add = (
      id: string | null | undefined,
      key: "working" | "review" | "invited",
    ) => {
      if (!id) return;
      const count = counts.get(id) || { working: 0, review: 0, invited: 0 };
      count[key]++;
      counts.set(id, count);
    };
    for (const row of rows) {
      const status = teamTaskStatus(row.task);
      if (["completed", "cancelled"].includes(status)) continue;
      add(row.acceptedAssignment?.memberId, "working");
      if (isFullTask(row.task) && status === "in_review")
        add(row.task.reviewerId, "review");
      add(
        row.pendingInvitation?.memberId ||
          (!isFullTask(row.task) && row.task.pendingInvitation
            ? actor?.member.id
            : undefined),
        "invited",
      );
    }
    return counts;
  }, [read.data, actor?.member.id]);
  const query = search.trim().toLocaleLowerCase();
  const visible = directions.flatMap((group) => {
    if (direction && direction !== group.id) return [];
    if (stage !== "all" && stage !== group.stage) return [];
    const matches = group.rows.filter((row) => {
      const status = teamTaskStatus(row.task),
        deadline = teamDeadline(row.task);
      return (
        (filter === "all" ||
          (filter === "review" && status === "in_review") ||
          (filter === "deadline" && (row.overdue || deadline.soon))) &&
        (!query ||
          [
            group.title,
            row.task.title,
            isFullTask(row.task) ? row.task.goal : row.task.summary,
            row.latestDeliverable?.summary || "",
          ]
            .join(" ")
            .toLocaleLowerCase()
            .includes(query))
      );
    });
    return matches.length ? [{ ...group, matches }] : [];
  });
  const displayTask = selectedTask || visible[0]?.matches[0]?.task.id;
  useEffect(() => {
    if (!selectedTask && displayTask) onSelectTask(displayTask);
  }, [selectedTask, displayTask, onSelectTask]);
  const pageCount = Math.max(1, Math.ceil(visible.length / 8)),
    currentPage = Math.min(page, pageCount);
  if (!actor) return <p role="status">正在确认课题组身份…</p>;
  if (!laboratory)
    return (
      <div className="workspace-empty">
        <h2>你还没有加入课题组</h2>
        <p>加入后，在这里查看课题组的任务、分工和成果进度。</p>
        <ResearchTeamAccountHint />
      </div>
    );
  return (
    <TaskWorkspace
      list={
        <>
          <div className="workspace-task-list-tools">
            <div>
              <strong>团队任务</strong>
              <Button
                size="small"
                loading={read.loading}
                onClick={() => void read.refresh()}
              >
                刷新
              </Button>
            </div>
            <Segmented
              block
              aria-label="科研任务范围"
              value={scope}
              options={[
                { label: "课题组可见", value: "lab" },
                { label: "我参与的", value: "mine" },
              ]}
              onChange={(v) => {
                setScope(v as "lab" | "mine");
                setPage(1);
                setDirection(undefined);
              }}
            />
            <Input.Search
              aria-label="查找课题组任务"
              placeholder="搜索目标、任务或成果"
              allowClear
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            <details className="workspace-task-filters">
              <summary>
                更多筛选
                {stage !== "all" || direction || filter !== "all" ? " · 已启用" : ""}
              </summary>
              <Select
                aria-label="计划阶段"
                value={stage}
                options={[
                  { value: "all", label: "全部阶段" },
                  { value: "active", label: "正在推进" },
                  { value: "planned", label: "准备开展" },
                  { value: "closed", label: "已结束" },
                ]}
                onChange={(value) => {
                  setStage(value);
                  setPage(1);
                }}
              />
              <Select
                aria-label="按计划筛选"
                placeholder="全部计划"
                value={direction}
                allowClear
                onChange={(id) => {
                  setDirection(id);
                  setPage(1);
                }}
                options={directions.map((group) => ({
                  value: group.id,
                  label: group.title,
                }))}
              />
              <Segmented
                block
                aria-label="进度筛选"
                value={filter}
                options={[
                  { label: "全部", value: "all" },
                  { label: "待审", value: "review" },
                  { label: "临近截止", value: "deadline" },
                ]}
                onChange={(v) => {
                  setFilter(v as Filter);
                  setPage(1);
                }}
              />
            </details>
            {read.data && (
              <div className="workspace-task-statistics" aria-label="课题组任务统计">
                <span>
                  {read.data.summary.total} 项任务 · {read.data.summary.awaitingReview}{" "}
                  项待审 · {read.data.summary.accepted} 项已验收
                </span>
                <Button type="link" size="small" onClick={() => setMembersOpen(true)}>
                  分工
                </Button>
              </div>
            )}
          </div>
          <TaskReadNotice
            error={read.error}
            stale={!!read.data}
            loading={read.loading}
            onRetry={read.refresh}
          />
          {!read.data && !read.error && (
            <p className="workspace-task-list-note" role="status">
              正在读取课题组任务…
            </p>
          )}
          {read.data?.truncated && (
            <Alert
              type="warning"
              message={`任务较多，当前仅读取 ${rows.length} / ${read.data.summary.total} 项；分组与进度仅统计已读取任务。`}
            />
          )}
          {members.error && (
            <Alert
              type="warning"
              message="成员姓名暂不可用"
              action={<Button onClick={members.refresh}>重试</Button>}
            />
          )}
          {visible.slice((currentPage - 1) * 8, currentPage * 8).map((group) => (
            <details className="workspace-task-plan" key={group.id} open>
              <summary>
                <strong>{group.title}</strong>
                <small>
                  {group.matches.length} 项任务 ·{" "}
                  {group.progressVisible
                    ? `已验收 ${group.accepted}/${group.total} 项`
                    : "进度按权限查看"}
                </small>
              </summary>
              {group.matches.map((row) => {
                const task = row.task,
                  status = teamTaskStatus(task),
                  deadline = teamDeadline(task);
                const claimable = task.allowedActions.includes("claim");
                const owner = row.acceptedAssignment
                  ? name(row.acceptedAssignment.memberId)
                  : row.pendingInvitation
                  ? name(row.pendingInvitation.memberId) + " · 待接受"
                  : !isFullTask(task) && task.pendingInvitation
                  ? "待我接受"
                  : claimable
                  ? "待认领"
                  : "待分工";
                return (
                  <TaskListRow
                    key={task.id}
                    title={task.title}
                    status={
                      claimable
                        ? "待认领"
                        : status === "ready"
                        ? "待开始"
                        : workspaceStatusLabel[status] || status
                    }
                    meta={`${owner} · ${deadline.label}`}
                    hint={teamNextStep(task, actor.member.id)}
                    selected={displayTask === task.id}
                    onSelect={() => onSelectTask(task.id)}
                  />
                );
              })}
            </details>
          ))}
          {read.data && !visible.length && (
            <div className="workspace-task-list-note">
              <p>
                {rows.length
                  ? "没有符合当前筛选的任务"
                  : scope === "mine"
                  ? "还没有你参与的课题组任务"
                  : "还没有课题组任务"}
              </p>
              {!rows.length && (
                <Button onClick={scope === "mine" ? () => setScope("lab") : onPlan}>
                  {scope === "mine" ? "查看课题组可见任务" : "新建课题组任务"}
                </Button>
              )}
            </div>
          )}
          {pageCount > 1 && (
            <div className="workspace-pages">
              <span>
                第 {currentPage}/{pageCount} 页
              </span>
              <Button
                size="small"
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                上一页
              </Button>
              <Button
                size="small"
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                下一页
              </Button>
            </div>
          )}
        </>
      }
    >
      <>
        {displayTask ? (
          <WorkspaceTaskDetail
            key={`${generation}:research:${displayTask}`}
            taskId={displayTask}
            kind="research"
            onChanged={read.refresh}
          />
        ) : (
          <div className="workspace-empty">
            <h2>选择一项团队任务</h2>
            <p>
              左侧按计划整理课题组可见任务。选择后查看目标、分工、验收和成果；任务操作与「我的待办」保持一致。
            </p>
          </div>
        )}
        <Drawer
          title="成员分工"
          open={membersOpen}
          width={420}
          onClose={() => setMembersOpen(false)}
        >
          <p className="workspace-muted">根据当前范围内已读取的任务统计。</p>
          {read.data?.truncated && (
            <Alert type="warning" message="当前仅统计已读取任务，不能代表全部分工。" />
          )}
          {members.error && (
            <Alert type="warning" message="成员姓名暂不可用，可刷新后查看。" />
          )}
          {Array.from(assignments, ([id, count]) => (
            <section className="workspace-task-member" key={id}>
              <strong>{name(id)}</strong>
              <p>
                已承接 {count.working} 项 · 待审阅 {count.review} 项 · 邀请待接受{" "}
                {count.invited} 项
              </p>
            </section>
          ))}
          {!assignments.size && <p>当前没有已承接、待审阅或待接受的分工。</p>}
        </Drawer>
      </>
    </TaskWorkspace>
  );
}
