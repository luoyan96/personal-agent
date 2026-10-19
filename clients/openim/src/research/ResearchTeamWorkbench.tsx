import { Alert, Button, Input, Modal, Progress, Segmented } from "antd";
import { ArrowRightOutlined, ReloadOutlined, SearchOutlined } from "@ant-design/icons";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { collectTeamWorkspace, teamDirections } from "./team-progress";
import "./research-team.scss";
import "./workbench-home.scss";

type Filter = "all" | "review" | "blocked" | "deadline";
const stageLabels = { active: "正在推进", planned: "准备开展", closed: "已结束" };

export function ResearchTeamWorkbench({
  onPlan,
  refresh,
}: {
  onPlan: () => void;
  refresh?: number;
}) {
  const navigate = useNavigate();
  const actor = useResearchStore((s) => s.actor);
  const generation = useResearchStore((s) => s.generation);
  const laboratory = actor?.spaceKind === "laboratory";
  const [scope, setScope] = useState<"lab" | "mine">("lab");
  const [stage, setStage] = useState<keyof typeof stageLabels | "all">("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<string>();
  const [selected, setSelected] = useState<string>();
  const [page, setPage] = useState(1);
  const progress = useRef<HTMLElement>(null);
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
  );
  useEffect(() => {
    if (refresh) {
      setDirection(undefined);
      setFilter("all");
      setSearch("");
      setStage("all");
      setPage(1);
      void read.refresh();
    }
  }, [refresh]);
  const members = useResearchRead(
    (signal) =>
      researchApi("members", {
        params: { id: actor!.member.labId },
        query: { limit: 100 },
        signal,
      }),
    `team-progress-members:${actor?.member.labId}`,
    laboratory,
  );
  useLayoutEffect(() => {
    setScope("lab");
    setStage("all");
    setFilter("all");
    setSearch("");
    setDirection(undefined);
    setSelected(undefined);
    setPage(1);
  }, [generation]);
  const people = Object.fromEntries(
    (members.data?.data || []).map((m) => [m.id, m.displayName]),
  );
  const name = (id: string) => people[id] || id;
  const rows = read.data?.data || [];
  const directions = useMemo(() => teamDirections(rows), [read.data]);
  const query = search.trim().toLocaleLowerCase();
  const matches = (row: ResearchWorkspaceRow) => {
    const status = teamTaskStatus(row.task),
      deadline = teamDeadline(row.task);
    return (
      (filter === "all" ||
        (filter === "review" && status === "in_review") ||
        (filter === "blocked" && status === "blocked") ||
        (filter === "deadline" && (row.overdue || deadline.soon))) &&
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
  };
  const visible = directions.filter(
    (g) =>
      (stage === "all" || g.stage === stage) &&
      (!direction || g.id === direction) &&
      g.rows.some(matches),
  );
  const pageCount = Math.max(1, Math.ceil(visible.length / 8));
  const currentPage = Math.min(page, pageCount);
  const currentGroups = visible.slice((currentPage - 1) * 8, currentPage * 8);
  const staged = directions.filter((g) => stage === "all" || g.stage === stage);
  const assignments = new Map<
    string,
    { working: number; review: number; invited: number }
  >();
  for (const row of rows) {
    const status = teamTaskStatus(row.task);
    if (["completed", "cancelled"].includes(status)) continue;
    const count = (id: string, key: "working" | "review" | "invited") => {
      const value = assignments.get(id) || { working: 0, review: 0, invited: 0 };
      value[key]++;
      assignments.set(id, value);
    };
    if (row.acceptedAssignment?.memberId)
      count(row.acceptedAssignment.memberId, "working");
    if (isFullTask(row.task) && status === "in_review")
      count(row.task.reviewerId, "review");
    if (row.pendingInvitation?.memberId)
      count(row.pendingInvitation.memberId, "invited");
    else if (!isFullTask(row.task) && row.task.pendingInvitation && actor)
      count(actor.member.id, "invited");
  }
  const openTask = (id: string) => navigate(workbenchTaskPath(id, "research"));
  const selectDirection = (id?: string) => {
    setDirection(id);
    setFilter("all");
    setSearch("");
    setPage(1);
    progress.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (!actor)
    return (
      <p className="workspace-muted" role="status">
        正在确认课题组身份…
      </p>
    );
  if (!laboratory)
    return (
      <section className="lab-tasks-empty">
        <h2>你还没有加入课题组</h2>
        <p>加入后，在这里查看课题组的任务、分工和成果进度。</p>
        <ResearchTeamAccountHint />
        <Button type="primary" onClick={() => navigate("/workbench?view=tasks")}>
          查看我的任务
        </Button>
      </section>
    );
  return (
    <div className="research-team-workbench lab-tasks-home" aria-label="课题组任务">
      <section className="lab-directions" aria-labelledby="lab-directions-title">
        <header className="lab-section-heading">
          <div>
            <h2 id="lab-directions-title">研究方向与任务</h2>
            <p>课题组正在做什么，接下来准备做什么。</p>
          </div>
          <Button
            icon={<ReloadOutlined />}
            loading={read.loading}
            onClick={read.refresh}
          >
            刷新
          </Button>
        </header>
        <Segmented
          aria-label="方向状态"
          value={stage}
          onChange={(v) => {
            setStage(v as typeof stage);
            setDirection(undefined);
            setPage(1);
          }}
          options={[
            { value: "all", label: "全部方向" },
            ...Object.entries(stageLabels).map(([value, label]) => ({
              value,
              label: `${label}${
                read.data
                  ? ` ${directions.filter((g) => g.stage === value).length}`
                  : ""
              }`,
            })),
          ]}
        />
        {read.error ? (
          <Alert
            type="warning"
            message={read.error}
            action={<Button onClick={read.refresh}>重新读取任务</Button>}
          />
        ) : !read.data ? (
          <p className="lab-reading" role="status">
            正在读取课题组任务…
          </p>
        ) : !rows.length ? (
          <div className="lab-empty">
            <h3>
              {scope === "mine" ? "还没有你参与的课题组任务" : "还没有课题组任务"}
            </h3>
            <p>
              {scope === "mine"
                ? "切换到课题组可见，查看你有权访问的其他任务。"
                : "在下方告诉任务规划 Agent 您的目标，任务建立后在这里跟进分工和成果。"}
            </p>
            <Button
              type="primary"
              onClick={scope === "mine" ? () => setScope("lab") : onPlan}
            >
              {scope === "mine" ? "查看课题组可见任务" : "和规划 Agent 聊聊"}
            </Button>
          </div>
        ) : (
          <>
            <div className="lab-direction-grid">
              {staged.slice(0, 3).map((group) => (
                <button
                  key={group.id}
                  className="lab-direction-card"
                  aria-pressed={direction === group.id}
                  onClick={() => selectDirection(group.id)}
                >
                  <span className={`lab-direction-stage stage-${group.stage}`}>
                    {stageLabels[group.stage]}
                  </span>
                  <h3>{group.title}</h3>
                  <p>
                    {group.rows.length} 项任务 ·{" "}
                    {group.progressVisible ? `已验收 ${group.accepted} 项` : "摘要可见"}
                  </p>
                  <span className="lab-direction-link">
                    查看任务与分工 <ArrowRightOutlined />
                  </span>
                </button>
              ))}
            </div>
            {!staged.length && (
              <p className="lab-reading">
                当前没有{stage === "all" ? "全部方向" : stageLabels[stage]}
                的任务方向，可切换其他状态。
              </p>
            )}
            {staged.length > 3 && (
              <p className="lab-note">
                此处展示前 3 个方向，下方可查看全部 {directions.length} 组任务。
              </p>
            )}
          </>
        )}
      </section>
      {read.data?.truncated && (
        <Alert
          type="warning"
          message={`任务较多，当前已读取 ${rows.length} / ${read.data.summary.total} 项。下方归组和进度仅统计已读取任务。`}
        />
      )}
      {read.data && !!rows.length && (
        <section
          className="lab-progress"
          ref={progress}
          aria-labelledby="lab-progress-title"
        >
          <header className="lab-section-heading">
            <div>
              <h2 id="lab-progress-title">目标与任务进度</h2>
              <p>按计划归组，逐项查看分工、下一步和成果验收。</p>
            </div>
            <Segmented
              aria-label="科研任务范围"
              value={scope}
              options={[
                { label: "课题组可见", value: "lab" },
                { label: "我参与的", value: "mine" },
              ]}
              onChange={(v) => {
                setScope(v as "lab" | "mine");
                setDirection(undefined);
                setPage(1);
              }}
            />
          </header>
          <div className="lab-progress-summary" aria-label="课题组任务统计">
            <span>
              科研任务 <strong>{read.data.summary.total}</strong>
            </span>
            <span>
              成果待审 <strong>{read.data.summary.awaitingReview}</strong>
            </span>
            <span>
              需要支持 <strong>{read.data.summary.blocked}</strong>
            </span>
            <span>
              已验收 <strong>{read.data.summary.accepted}</strong>
            </span>
          </div>
          <div className="lab-progress-filters">
            <Segmented
              aria-label="进度筛选"
              value={filter}
              onChange={(v) => {
                setFilter(v as Filter);
                setPage(1);
              }}
              options={[
                { label: "全部", value: "all" },
                { label: "待审", value: "review" },
                { label: "受阻", value: "blocked" },
                { label: "临近截止", value: "deadline" },
              ]}
            />
            <Input
              prefix={<SearchOutlined />}
              placeholder="查找目标、任务或成果"
              aria-label="查找课题组任务"
              allowClear
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
            {direction && (
              <Button
                onClick={() => {
                  setDirection(undefined);
                  setPage(1);
                }}
              >
                显示全部方向
              </Button>
            )}
          </div>
          {members.error && (
            <Alert
              type="warning"
              message="成员姓名读取失败，暂显示成员标识。"
              action={<Button onClick={members.refresh}>重试</Button>}
            />
          )}
          {currentGroups.map((group) => (
            <article className="lab-objective" key={group.id}>
              <header className="lab-objective-heading">
                <div>
                  <span className="lab-objective-label">
                    {group.ownGoal ? "我的计划目标" : "任务目标"}
                  </span>
                  <h3>{group.title}</h3>
                  <p>
                    {group.ownGoal ? "计划原始目标仅本人可见" : "依据获准任务归组"}
                    {group.cancelled ? ` · ${group.cancelled} 项已取消` : ""}
                  </p>
                </div>
                <div className="lab-objective-progress">
                  {!group.progressVisible ? (
                    <>
                      <strong>当前仅能查看任务摘要</strong>
                      <small>进度详情按任务权限查看</small>
                    </>
                  ) : !group.total ? (
                    <strong>本组任务均已取消</strong>
                  ) : (
                    <>
                      <strong>
                        已验收 {group.accepted} / {group.total} 项
                      </strong>
                      <Progress
                        percent={Math.round((group.accepted / group.total) * 100)}
                        showInfo={false}
                        strokeColor="#75b8e5"
                      />
                      <small>按当前成果验收计</small>
                    </>
                  )}
                </div>
              </header>
              <div
                className="lab-task-table"
                role="table"
                aria-label={`${group.title}的任务与分工`}
              >
                <div className="lab-task-table-head" role="row">
                  <span role="columnheader">任务 / 阶段成果</span>
                  <span role="columnheader">负责人</span>
                  <span role="columnheader">当前进展</span>
                  <span role="columnheader">截止与下一步</span>
                  <span role="columnheader">操作</span>
                </div>
                {group.rows.filter(matches).map((row) => {
                  const status = teamTaskStatus(row.task),
                    deadline = teamDeadline(row.task);
                  const claimable =
                    !row.acceptedAssignment &&
                    !row.pendingInvitation &&
                    (isFullTask(row.task)
                      ? row.task.access.visibility === "lab_summary"
                      : row.task.allowedActions.includes("claim"));
                  return (
                    <div className="lab-task-table-row" role="row" key={row.task.id}>
                      <div role="cell" className="lab-task-title">
                        <span className="lab-kr">
                          任务 {group.rows.indexOf(row) + 1}
                        </span>
                        <button onClick={() => openTask(row.task.id)}>
                          {row.task.title}
                        </button>
                        <p>
                          {isFullTask(row.task)
                            ? row.task.acceptanceCriteria
                            : row.task.deliverable}
                        </p>
                        {row.latestDeliverable && (
                          <small>最新成果：{row.latestDeliverable.summary}</small>
                        )}
                      </div>
                      <div role="cell">
                        <strong>
                          {row.acceptedAssignment?.memberId
                            ? name(row.acceptedAssignment.memberId)
                            : row.pendingInvitation
                            ? "待承接"
                            : !isFullTask(row.task) && row.task.pendingInvitation
                            ? "待我接受"
                            : claimable
                            ? "待认领"
                            : "待分工"}
                        </strong>
                        {row.pendingInvitation?.memberId && (
                          <small>
                            {name(row.pendingInvitation.memberId)} · 邀请待接受
                          </small>
                        )}
                        {isFullTask(row.task) && (
                          <small>审阅：{name(row.task.reviewerId)}</small>
                        )}
                        {!isFullTask(row.task) && <small>接受后可查看详细分工</small>}
                      </div>
                      <div role="cell">
                        <span className={`research-team-status status-${status}`}>
                          {claimable
                            ? "待认领"
                            : status === "ready"
                            ? "待开始"
                            : taskStateLabels[status] || status}
                        </span>
                        {isFullTask(row.task) && row.task.blocker && (
                          <small className="lab-blocker">
                            {row.task.blocker.reason}
                          </small>
                        )}
                      </div>
                      <div role="cell">
                        <small className={row.overdue ? "is-overdue" : ""}>
                          {deadline.label}
                        </small>
                        <p>
                          {isFullTask(row.task) &&
                          status === "ready" &&
                          row.task.dependencies.length
                            ? "先核对前置成果与依赖，再开始任务"
                            : claimable
                            ? "同组成员认领并确认范围与时间"
                            : teamNextStep(row.task)}
                        </p>
                      </div>
                      <div role="cell">
                        <Button type="link" onClick={() => setSelected(row.task.id)}>
                          查看详情
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
          {!visible.length && <p className="lab-empty">没有符合当前筛选的任务。</p>}
          {pageCount > 1 && (
            <div className="research-team-pages">
              <span>
                第 {currentPage} / {pageCount} 页 · 共 {visible.length} 组
              </span>
              <Button
                disabled={currentPage <= 1}
                onClick={() => setPage(currentPage - 1)}
              >
                上一页
              </Button>
              <Button
                disabled={currentPage >= pageCount}
                onClick={() => setPage(currentPage + 1)}
              >
                下一页
              </Button>
            </div>
          )}
          {!!assignments.size && (
            <section className="lab-member-section">
              <h3>成员分工</h3>
              <div className="lab-member-grid">
                {Array.from(assignments, ([id, count]) => (
                  <div key={id}>
                    <strong>{name(id)}</strong>
                    <span>
                      已承接 {count.working} 项
                      {count.review ? ` · 待审阅 ${count.review} 项` : ""}
                    </span>
                    {!!count.invited && (
                      <small>另有 {count.invited} 项邀请待接受</small>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
      )}
      <details className="lab-scope-guide">
        <summary>任务范围与进度说明</summary>
        <p>
          按同一计划的获准任务归组；未确认的私人草案保留在“我的任务 →
          研究计划”。其他人的私人计划目标不会在这里公开。
        </p>
        <p>
          进度按当前成果的明确验收计，已取消项不计入分母；邀请待接受不计为已承接。任务数量不代表研究质量或目标已达成。筛选与搜索覆盖本次已读取任务。
        </p>
        <ResearchTeamAccountHint />
        {read.data && (
          <p>更新于 {new Date(read.data.snapshot.at).toLocaleTimeString("zh-CN")}</p>
        )}
      </details>
      <Modal
        title="任务、交付与审阅"
        open={!!selected}
        footer={null}
        width={860}
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
