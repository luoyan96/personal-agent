import { Alert, Button, Input, Modal, Segmented } from "antd";
import { useLayoutEffect, useState } from "react";
import type { ResearchWorkspaceRow } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchTaskPanel } from "./ResearchTaskPanel";
import {
  isFullTask,
  teamDeadline,
  teamNextStep,
  teamTaskStatus,
} from "./research-team";
import { taskStateLabels } from "./task-planning";
import { ResearchTeamAccountHint } from "./ResearchTeamAccountHint";
import "./research-team.scss";

type Filter = "all" | "review" | "blocked" | "deadline";
type Page = { cursor?: string; snapshot?: string };

export function ResearchTeamWorkbench({ onPlan }: { onPlan: () => void }) {
  const actor = useResearchStore((s) => s.actor);
  const generation = useResearchStore((s) => s.generation);
  const [scope, setScope] = useState<"lab" | "mine">("lab");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<Page[]>([{}]);
  const [selected, setSelected] = useState<string>();
  const page = pages[pages.length - 1];
  const read = useResearchRead(
    (signal) =>
      researchApi("researchWorkspace", {
        params: { id: actor!.member.labId },
        query: { scope, limit: 30, ...page },
        signal,
      }),
    `team-workbench:${actor?.member.labId}:${scope}:${page.cursor || ""}:${
      page.snapshot || ""
    }`,
    !!actor,
  );
  const members = useResearchRead(
    (signal) =>
      researchApi("members", {
        params: { id: actor!.member.labId },
        query: { limit: 100 },
        signal,
      }),
    `team-workbench-members:${actor?.member.labId}`,
    !!actor,
  );
  useLayoutEffect(() => {
    setPages([{}]);
    setSelected(undefined);
    setSearch("");
    setFilter("all");
  }, [generation]);
  const people = Object.fromEntries(
    (members.data?.data || []).map((m) => [m.id, m.displayName]),
  );
  const name = (id: string | null) => (id ? people[id] || id : "待分工");
  const summary = read.data?.summary;
  const rows = read.data?.data || [];
  const query = search.trim().toLocaleLowerCase();
  const visible = rows.filter((row) => {
    const status = teamTaskStatus(row.task);
    const date = teamDeadline(row.task);
    const matches =
      filter === "all" ||
      (filter === "review" && status === "in_review") ||
      (filter === "blocked" && status === "blocked") ||
      (filter === "deadline" && (row.overdue || date.soon));
    return (
      matches &&
      (!query ||
        [
          row.task.title,
          row.planGoal || "",
          isFullTask(row.task) ? row.task.goal : row.task.summary,
          row.latestDeliverable?.summary || "",
        ]
          .join(" ")
          .toLocaleLowerCase()
          .includes(query))
    );
  });
  const memberNext = new Map<string, ResearchWorkspaceRow[]>();
  for (const row of rows) {
    if (!isFullTask(row.task) || ["completed", "cancelled"].includes(row.task.status))
      continue;
    const memberId =
      row.task.status === "in_review"
        ? row.task.reviewerId
        : row.acceptedAssignment?.memberId;
    if (!memberId) continue;
    memberNext.set(memberId, [...(memberNext.get(memberId) || []), row]);
  }
  const reset = () => {
    if (pages.length === 1) void read.refresh();
    else setPages([{}]);
  };
  return (
    <div className="research-team-workbench" aria-label="科研团队总览">
      <div className="research-team-controls">
        <Segmented
          aria-label="总览范围"
          value={scope}
          onChange={(value) => {
            setPages([{}]);
            setSelected(undefined);
            setSearch("");
            setFilter("all");
            setScope(value as "lab" | "mine");
          }}
          options={[
            {
              label: actor?.spaceKind === "personal" ? "可见科研任务" : "团队可见任务",
              value: "lab",
            },
            { label: "我参与的", value: "mine" },
          ]}
        />
        <Button onClick={reset} loading={read.loading}>
          刷新总览
        </Button>
      </div>
      <p className="research-team-scope">
        统计覆盖当前范围内全部获准科研任务；私人计划目标仅本人可见。
        {read.data
          ? ` 更新于 ${new Date(read.data.snapshot.at).toLocaleTimeString("zh-CN")}`
          : ""}
      </p>
      <ResearchTeamAccountHint />
      {read.error ? (
        <Alert
          type="error"
          message={read.error}
          action={<Button onClick={reset}>从第一页重新读取</Button>}
        />
      ) : null}
      {!read.data && !read.error ? (
        <p role="status">正在读取真实计划、承接与交付…</p>
      ) : null}
      {summary ? (
        <div className="research-team-stats" aria-label="获准范围统计">
          <div>
            <span>科研任务</span>
            <strong>{summary.total}</strong>
            <small>
              {summary.unassigned} 待分工 · {summary.awaitingAcceptance} 待承接
            </small>
          </div>
          <div>
            <span>成果待审</span>
            <strong>{summary.awaitingReview}</strong>
            <small>{summary.pendingMyReview} 项待我审阅</small>
          </div>
          <div>
            <span>需要支持</span>
            <strong>{summary.blocked}</strong>
            <small>{summary.overdue} 项已过截止或承诺时间</small>
          </div>
          <div>
            <span>已验收成果</span>
            <strong>{summary.accepted}</strong>
            <small>以当前成果的实际审阅记录为准</small>
          </div>
        </div>
      ) : null}
      {summary?.pendingMyInvitation ? (
        <Alert
          type="info"
          message={`有 ${summary.pendingMyInvitation} 项邀请待你确认，接受后才计为已承接。`}
        />
      ) : null}
      <div className="research-team-columns">
        <section className="research-team-projects">
          <div className="research-team-section-title">
            <h2>任务与阶段成果</h2>
            <span>
              第 {pages.length} 页 · 本页 {rows.length} 项
            </span>
          </div>
          <div className="research-team-filters">
            <Segmented
              aria-label="本页事项筛选"
              value={filter}
              onChange={(value) => setFilter(value as Filter)}
              options={[
                { label: "全部", value: "all" },
                { label: "待审", value: "review" },
                { label: "受阻", value: "blocked" },
                { label: "临近截止", value: "deadline" },
              ]}
            />
            <Input
              aria-label="查找本页科研任务"
              placeholder="查找本页目标、任务、成果"
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <p className="research-team-scope">
            筛选与搜索仅查本页；临近截止含已逾期和未来 7 天内的已确认截止 / 承诺。
          </p>
          {visible.map((row) => {
            const task = row.task,
              status = teamTaskStatus(task),
              deadline = teamDeadline(task);
            return (
              <article className="research-team-task" key={task.id}>
                <div className="research-team-task-heading">
                  <h3>{task.title}</h3>
                  <span className={`research-team-status status-${status}`}>
                    {status === "completed" &&
                    row.latestDeliverable?.review?.decision !== "accepted"
                      ? "已结束 · 验收记录待核对"
                      : taskStateLabels[status] || "状态待读取"}
                  </span>
                </div>
                {row.planGoal ? (
                  <p className="research-team-plan">项目目标：{row.planGoal}</p>
                ) : null}
                <p className="research-team-goal">
                  {isFullTask(task) ? task.goal : task.summary}
                </p>
                <div className="research-team-task-meta">
                  <span>
                    {row.acceptedAssignment
                      ? `已承接：${
                          row.acceptedAssignment.memberId
                            ? name(row.acceptedAssignment.memberId)
                            : `公共 Agent ${
                                row.acceptedAssignment.capability?.id || ""
                              }`
                        }`
                      : row.pendingInvitation || status === "awaiting_acceptance"
                      ? "已邀请 · 待本人接受"
                      : "尚无已承接成员"}
                  </span>
                  <span className={row.overdue ? "is-overdue" : ""}>
                    {deadline.label}
                    {row.overdue ? " · 已逾期" : ""}
                  </span>
                </div>
                {row.latestDeliverable ? (
                  <div className="research-team-delivery">
                    <strong>阶段成果 · 第 {row.latestDeliverable.revision} 版</strong>
                    <p>{row.latestDeliverable.summary}</p>
                    {row.latestDeliverable.review ? (
                      <p className="research-team-feedback">
                        {row.latestDeliverable.review.decision === "accepted"
                          ? "已验收"
                          : "需修订"}
                        ：{row.latestDeliverable.review.comment}
                      </p>
                    ) : (
                      <span>已提交，等待人工审阅</span>
                    )}
                  </div>
                ) : (
                  <p className="research-team-scope">
                    {isFullTask(task) ? "尚未提交阶段成果" : "接受后可查看获准成果"}
                  </p>
                )}
                {isFullTask(task) && task.blocker ? (
                  <div className="research-team-blocker">
                    <strong>阻碍：{task.blocker.reason}</strong>
                    <p>
                      需要
                      {task.blocker.requestedMemberId
                        ? ` ${name(task.blocker.requestedMemberId)} `
                        : ""}
                      {task.blocker.requestedAction}
                    </p>
                  </div>
                ) : null}
                <footer>
                  <span>下一步：{teamNextStep(task)}</span>
                  <Button size="small" onClick={() => setSelected(task.id)}>
                    {row.nextActions.includes("review")
                      ? "审阅成果"
                      : row.nextActions.includes("decide")
                      ? "确认承接"
                      : "任务与交付"}
                  </Button>
                </footer>
              </article>
            );
          })}
          {read.data && !visible.length ? (
            <div className="research-team-empty">
              <h3>{rows.length ? "本页没有符合条件的事项" : "从一个真实课题开始"}</h3>
              <p>
                {rows.length
                  ? "调整本页筛选，或翻页继续查看。"
                  : "写下目标，选择科研模板，明确分工、交付和验收要求。"}
              </p>
              {!rows.length && pages.length === 1 ? (
                <Button type="primary" onClick={onPlan}>
                  创建科研计划
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="research-team-pages">
            <Button
              disabled={pages.length === 1 || read.loading}
              onClick={() => setPages((p) => p.slice(0, -1))}
            >
              上一页
            </Button>
            <span>每页最多 30 项</span>
            <Button
              disabled={!read.data?.nextCursor || read.loading}
              onClick={() => {
                if (read.data?.nextCursor)
                  setPages((p) => [
                    ...p,
                    {
                      cursor: read.data!.nextCursor!,
                      snapshot: read.data!.snapshot.token,
                    },
                  ]);
              }}
            >
              下一页
            </Button>
          </div>
        </section>
        <aside className="research-team-members" aria-label="本页成员下一步">
          <div className="research-team-section-title">
            <h2>成员下一步</h2>
          </div>
          <p className="research-team-scope">
            依据本页实际承接与审阅责任；邀请待接受不计入。
          </p>
          {Array.from(memberNext, ([id, tasks]) => (
            <section key={id}>
              <h3>{name(id)}</h3>
              {tasks.map((row) => (
                <button key={row.task.id} onClick={() => setSelected(row.task.id)}>
                  <strong>{row.task.title}</strong>
                  <span>{teamNextStep(row.task)}</span>
                </button>
              ))}
            </section>
          ))}
          {read.data && !memberNext.size ? (
            <p className="research-team-scope">本页暂无已承接任务或待审阅成果。</p>
          ) : null}
          {members.error ? (
            <Alert
              type="warning"
              message="成员姓名读取失败，暂显示成员标识。"
              action={
                <Button size="small" onClick={members.refresh}>
                  重试
                </Button>
              }
            />
          ) : null}
        </aside>
      </div>
      <Modal
        title="任务、交付与审阅"
        open={!!selected}
        footer={null}
        width={800}
        destroyOnClose
        onCancel={() => {
          setSelected(undefined);
          void read.refresh();
        }}
      >
        {selected ? (
          <ResearchTaskPanel
            key={selected}
            taskId={selected}
            onChanged={read.refresh}
          />
        ) : null}
      </Modal>
    </div>
  );
}
