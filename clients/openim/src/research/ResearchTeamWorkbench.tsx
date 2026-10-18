import { Alert, Button, Input, Modal, Segmented, Select } from "antd";
import {
  ArrowRightOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
} from "@ant-design/icons";
import { useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { workbenchTaskPath } from "./workbench-links";
import { WorkbenchTaskInbox } from "./WorkbenchTaskInbox";
import { WorkbenchStart } from "./WorkbenchStart";
import type { PlanningPreset } from "./WorkbenchStart";
import "./research-team.scss";
import "./workbench-home.scss";

type Filter = "all" | "review" | "blocked" | "deadline";
type Page = { cursor?: string; snapshot?: string };

export function ResearchTeamWorkbench({
  onPlan,
}: {
  onPlan: (preset?: PlanningPreset) => void;
}) {
  const navigate = useNavigate();
  const actor = useResearchStore((s) => s.actor);
  const generation = useResearchStore((s) => s.generation);
  const [scope, setScope] = useState<"lab" | "mine">("lab");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<Page[]>([{}]);
  const [selected, setSelected] = useState<string>();
  const list = useRef<HTMLElement>(null);
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
    setScope("lab");
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
  const hasTasks = !!summary?.total;
  const query = search.trim().toLocaleLowerCase();
  const visible = rows.filter((row) => {
    const status = teamTaskStatus(row.task),
      date = teamDeadline(row.task);
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
    if (memberId) memberNext.set(memberId, [...(memberNext.get(memberId) || []), row]);
  }
  const reset = () => (pages.length === 1 ? void read.refresh() : setPages([{}]));
  const changeScope = (value: "lab" | "mine") => {
    setScope(value);
    setPages([{}]);
    setSelected(undefined);
    setSearch("");
    setFilter("all");
  };
  const openTask = (id: string) => navigate(workbenchTaskPath(id, "research"));
  const showList = hasTasks || scope === "mine" || pages.length > 1;
  return (
    <div className="research-team-workbench workbench-home" aria-label="科研团队总览">
      <WorkbenchStart hasTasks={hasTasks} onPlan={onPlan} />
      <div className="workbench-focus-grid">
        <WorkbenchTaskInbox presentation="overview" />
        <section className="workbench-research-progress" aria-label="研究进展">
          <h2>研究进展</h2>
          {read.error ? (
            <Alert
              type="warning"
              message={read.error}
              action={<Button onClick={reset}>重新读取进展</Button>}
            />
          ) : !summary ? (
            <p role="status" className="workbench-progress-loading">
              正在读取研究进展…
            </p>
          ) : !hasTasks ? (
            <div className="workbench-focus-empty">
              <FileTextOutlined aria-hidden="true" />
              <h3>
                {scope === "mine" ? "当前没有你参与的科研任务" : "还没有科研任务"}
              </h3>
              <p>
                {scope === "mine"
                  ? "可以切换范围，查看团队可见的任务。"
                  : "创建计划并确认后，在这里跟进执行与成果。"}
              </p>
              {scope === "mine" && (
                <Button type="link" onClick={() => changeScope("lab")}>
                  查看可见科研任务 <ArrowRightOutlined />
                </Button>
              )}
            </div>
          ) : (
            <>
              <dl className="workbench-progress-stats" aria-label="获准范围统计">
                <div>
                  <dt>科研任务</dt>
                  <dd>{summary.total}</dd>
                  <small>
                    {summary.unassigned} 待分工 · {summary.awaitingAcceptance} 待承接
                  </small>
                </div>
                <div>
                  <dt>成果待审</dt>
                  <dd>{summary.awaitingReview}</dd>
                  <small>{summary.pendingMyReview} 项待我审阅</small>
                </div>
                <div>
                  <dt>需要支持</dt>
                  <dd>{summary.blocked}</dd>
                  <small>{summary.overdue} 项已过截止或承诺时间</small>
                </div>
                <div>
                  <dt>已验收成果</dt>
                  <dd>{summary.accepted}</dd>
                  <small>以实际验收记录为准</small>
                </div>
              </dl>
              <Button
                type="link"
                className="workbench-progress-link"
                onClick={() => {
                  list.current?.scrollIntoView({
                    block: "start",
                    behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
                      .matches
                      ? "auto"
                      : "smooth",
                  });
                  list.current?.focus({ preventScroll: true });
                }}
              >
                查看科研任务 <ArrowRightOutlined />
              </Button>
            </>
          )}
          {!!summary?.pendingMyInvitation && (
            <p className="workbench-invitation-note">
              有 {summary.pendingMyInvitation} 项科研邀请待你确认，接受后才计为已承接。
            </p>
          )}
        </section>
      </div>
      {showList && (
        <section
          className="workbench-research-list"
          aria-label="科研任务与成果"
          ref={list}
          tabIndex={-1}
        >
          <header className="workbench-list-heading">
            <h2>科研任务与成果</h2>
            <div>
              <Select
                aria-label="总览范围"
                value={scope}
                onChange={changeScope}
                options={[
                  {
                    value: "lab",
                    label:
                      actor?.spaceKind === "personal" ? "可见科研任务" : "团队可见任务",
                  },
                  { value: "mine", label: "我参与的" },
                ]}
              />
              <Button
                aria-label="刷新总览"
                title="刷新总览"
                icon={<ReloadOutlined />}
                loading={read.loading}
                onClick={reset}
              />
            </div>
          </header>
          <div className="workbench-list-controls">
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
              placeholder="查找本页任务"
              prefix={<SearchOutlined />}
              allowClear
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {read.data && !visible.length ? (
            <div className="workbench-list-empty" role="status">
              <h3>{rows.length ? "本页没有符合条件的事项" : "当前范围暂无科研任务"}</h3>
              <p>
                {rows.length
                  ? "调整本页筛选，或翻页继续查看。"
                  : "切换范围查看，或新建一项科研计划。"}
              </p>
            </div>
          ) : (
            <div className="workbench-table-scroll">
              <table className="workbench-task-table">
                <caption className="sr-only">
                  本页获准查看的科研任务，打开任务查看完整交付与审阅。
                </caption>
                <thead>
                  <tr>
                    <th>任务名称</th>
                    <th>状态</th>
                    <th>承接人</th>
                    <th>下一步</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => {
                    const task = row.task,
                      status = teamTaskStatus(task),
                      deadline = teamDeadline(task);
                    const action = row.nextActions.includes("review")
                      ? "审阅成果"
                      : row.nextActions.includes("decide")
                      ? "确认承接"
                      : "查看任务";
                    return (
                      <tr key={task.id}>
                        <td>
                          <button
                            className="workbench-task-title"
                            onClick={() => openTask(task.id)}
                          >
                            {task.title}
                          </button>
                          {row.planGoal && (
                            <span
                              className="workbench-task-subtext"
                              title={row.planGoal}
                            >
                              {row.planGoal}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`research-team-status status-${status}`}>
                            {status === "completed" &&
                            row.latestDeliverable?.review?.decision !== "accepted"
                              ? "已结束 · 验收待核对"
                              : taskStateLabels[status] || "状态待读取"}
                          </span>
                          <span
                            className={`workbench-task-subtext ${
                              row.overdue ? "is-overdue" : ""
                            }`}
                          >
                            {deadline.label}
                            {row.overdue ? " · 已逾期" : ""}
                          </span>
                        </td>
                        <td>
                          {row.acceptedAssignment
                            ? row.acceptedAssignment.memberId
                              ? name(row.acceptedAssignment.memberId)
                              : "公共 Agent"
                            : row.pendingInvitation || status === "awaiting_acceptance"
                            ? "邀请待接受"
                            : "待安排"}
                        </td>
                        <td>
                          <span>{teamNextStep(task)}</span>
                          {row.latestDeliverable && (
                            <span className="workbench-task-subtext">
                              阶段成果 · 第 {row.latestDeliverable.revision} 版
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="workbench-task-actions">
                            <Button
                              type={
                                row.nextActions.includes("review")
                                  ? "primary"
                                  : "default"
                              }
                              size="small"
                              onClick={() => openTask(task.id)}
                            >
                              {action}
                            </Button>
                            <Button
                              type="link"
                              size="small"
                              onClick={() => setSelected(task.id)}
                            >
                              快速查看
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {members.error && (
            <Alert
              type="warning"
              message="成员姓名读取失败，暂显示成员标识。"
              action={
                <Button size="small" onClick={members.refresh}>
                  重试
                </Button>
              }
            />
          )}
          {read.data && (
            <div className="workbench-list-footnote">
              <span>
                第 {pages.length} 页 · 本页 {rows.length} 项 · 筛选与搜索仅查本页
              </span>
              {(pages.length > 1 || read.data.nextCursor) && (
                <div className="research-team-pages">
                  <Button
                    disabled={pages.length === 1 || read.loading}
                    onClick={() => setPages((p) => p.slice(0, -1))}
                  >
                    上一页
                  </Button>
                  <Button
                    disabled={!read.data.nextCursor || read.loading}
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
              )}
            </div>
          )}
          {!!memberNext.size && (
            <details className="workbench-members-disclosure">
              <summary>成员下一步 · 本页实际承接与审阅责任</summary>
              <div className="workbench-member-rows">
                {Array.from(memberNext, ([id, tasks]) => (
                  <section key={id}>
                    <h3>{name(id)}</h3>
                    {tasks.map((row) => (
                      <button key={row.task.id} onClick={() => openTask(row.task.id)}>
                        <strong>{row.task.title}</strong>
                        <span>{teamNextStep(row.task)}</span>
                        <ArrowRightOutlined />
                      </button>
                    ))}
                  </section>
                ))}
              </div>
            </details>
          )}
        </section>
      )}
      <details className="workbench-scope-guide">
        <summary>范围与协作说明</summary>
        <p>
          这里只展示你有权查看的科研任务。私人计划目标仅本人可见；邀请待接受不计为已承接。
        </p>
        <p>
          先写目标并保存计划，确认后才创建实际任务；阶段成果提交后，由有权限的成员明确审阅与验收。
        </p>
        <p>
          临近截止含已逾期和未来7天内的已确认截止或承诺。筛选仅针对当前页；统计覆盖当前范围的全部获准任务。
          {read.data
            ? ` 进展更新于 ${new Date(read.data.snapshot.at).toLocaleTimeString(
                "zh-CN",
              )}`
            : ""}
        </p>
        <ResearchTeamAccountHint />
      </details>
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
        {selected && (
          <ResearchTaskPanel
            key={selected}
            taskId={selected}
            onChanged={read.refresh}
          />
        )}
      </Modal>
    </div>
  );
}
