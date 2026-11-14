import { Alert, Button, Dropdown, Input, Modal, Segmented, Select } from "antd";
import { DownOutlined } from "@ant-design/icons";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import type { WorkbenchCard } from "@research-agent-platform/contracts";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { researchApi } from "./api";
import { workspaceApi, useWorkspaceConversation } from "./workspace-api";
import { workspaceMemberLabel, workspaceStatusLabel } from "./workspace-labels";
import {
  TaskWorkspace,
  TaskListRow,
  TaskReadNotice,
  WorkspaceTaskDetail,
} from "./TaskWorkspace";
import { transientReadFailure } from "./read-errors";
import { collectTaskInbox , workbenchNextAction } from "./task-inbox";
import { collectTeamWorkspace } from "./team-progress";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import "./workspace.scss";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";

import { ResearchTeamWorkbench } from "./ResearchTeamWorkbench";
import { relocatedWorkspace } from "./workspace-navigation";
import { PlanningHistory } from "./PlanningHistory";
import { workbenchTaskPath, workbenchTaskTarget } from "./workbench-links";
import { workbenchView, personalTaskTitle, type WorkbenchTab } from "./workbench-view";
import { PlanningAgent } from "./PlanningAgent";
function WorkbenchOverview({ card }: { card: WorkbenchCard }) {
  const operation = usePersonalOperation(true, `workspace-overview:${card.id}`),
    openConversation = useWorkspaceConversation();
  const [failure, setFailure] = useState<{ scope: string; message: string }>();
  return (
    <section className="workspace-task-detail" aria-label="任务概览">
      <header>
        <span className="workspace-eyebrow">
          {card.source === "research_task"
            ? "科研协作"
            : card.source === "followup"
            ? "定时安排"
            : "个人协作"}
        </span>
        <h2>{card.title}</h2>
        <span className="workspace-status">
          {workspaceStatusLabel[card.status] || card.progress.label || "查看状态"}
        </span>
      </header>
      <div className="workspace-task-goal">
        {card.goal ? (
          <SafeMessageMarkdown text={card.goal} />
        ) : (
          <p className="workspace-muted">
            当前只获准查看任务摘要，接受邀请后可查看具体目标。
          </p>
        )}
      </div>
      <h3>负责人和成员</h3>
      <div className="workspace-member-list">
        <p>
          <strong>{card.owner.displayName}</strong>
          <span className="workspace-kind">负责人</span>
        </p>
        {card.participants
          .filter((p) => p.contactId !== card.owner.contactId)
          .map((p) => (
            <p key={p.contactId}>
              {p.displayName}
              <span
                className={`workspace-kind ${p.kind === "agent" ? "agent" : "human"}`}
              >
                {p.kind === "agent" ? "Agent" : "个人"}
              </span>
              <small>{workspaceMemberLabel[p.status]}</small>
            </p>
          ))}
      </div>
      <section className="workspace-task-progress">
        <h3>进展</h3>
        <p>
          {workspaceStatusLabel[card.progress.label] ||
            card.progress.label ||
            "当前进展尚未提供"}
        </p>
        {card.progress.total > 0 && (
          <p className="workspace-muted">
            已完成 {card.progress.completed} / {card.progress.total} 项
          </p>
        )}
      </section>
      {card.result && (
        <section className="workspace-result">
          <h3>{card.result.accepted ? "已验收结果" : "当前结果 · 待核对"}</h3>
          <SafeMessageMarkdown text={card.result.summary} />
        </section>
      )}
      {failure?.scope === operation.scope && (
        <Alert type="warning" message={failure.message} />
      )}
      <div className="workspace-card-actions">
        {card.conversationId && !card.summaryOnly && (
          <Button
            onClick={async () => {
              const { isCurrent } = operation.capture();
              try {
                await openConversation(card.conversationId!, isCurrent);
              } catch (e) {
                if (isCurrent())
                  setFailure({
                    scope: operation.scope,
                    message: e instanceof Error ? e.message : "聊天暂不可用。",
                  });
              }
            }}
          >
            返回聊天
          </Button>
        )}
      </div>
    </section>
  );
}

export function DesktopWorkbench() {
  const [params, setParams] = useSearchParams();
  const relocated = relocatedWorkspace(params);
  // Saved planning links still open the assistant; history itself is a full page.
  const { tab, planning, planId, requestId, draft, filter } = workbenchView(params);
  const [planningLaunch, setPlanningLaunch] = useState(0);
  const [taskLaunch, setTaskLaunch] = useState(0);
  const [planningExpanded, setPlanningExpanded] = useState(false);
  const [workbenchRevision, setWorkbenchRevision] = useState(0);
  const {
    id: requestedTask,
    kind: requestedKind,
    valid: requestedValid,
  } = workbenchTaskTarget(params);
  const [taskSearch, setTaskSearch] = useState("");
  const [quickRequest, setQuickRequest] = useState("");
  const [quickDraft, setQuickDraft] = useState<string>();
  const expandedChanged = useCallback((value: boolean) => {
    setPlanningExpanded(value);
    if (value) setQuickDraft(undefined);
  }, []);
  const generation = useResearchStore((s) => s.generation),
    actor = useResearchStore((s) => s.actor),
    contacts = useResearchStore((s) => s.contacts);
  const availability = useWorkspaceAvailability(!relocated);
  const supported = availability.supports(21);
  const read = useResearchRead(
    (signal) =>
      collectTaskInbox(
        (cursor, signal) =>
          researchApi("workbench", {
            query: { category: filter, cursor, limit: 100 },
            signal,
          }),
        actor?.spaceKind === "laboratory" && availability.supports(23)
          ? (signal) =>
              collectTeamWorkspace(
                (query, signal) =>
                  researchApi("researchWorkspace", {
                    params: { id: actor.member.labId },
                    query: { scope: "mine", ...query },
                    signal,
                  }),
                signal,
              )
          : undefined,
        signal,
      ),
    `workbench:${filter}:${actor?.member.labId}:${availability.supports(23)}`,
    tab === "tasks" && supported && !!actor,
    { timeoutMs: 10000, keepDataOnError: transientReadFailure },
  );
  const [selected, setSelected] = useState<WorkbenchCard>();
  const [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  // A personal task needs one sentence, not a form: the name comes from it and
  // an Agent is chosen later in the task itself.
  const [form, setForm] = useState({ goal: "", contactIds: [] as string[] });
  const operation = usePersonalOperation(
      !!creating && supported,
      "create-workspace-task",
    ),
    inFlight = useRef(false);
  useLayoutEffect(() => {
    if (!supported) setCreating(false);
  }, [supported]);
  useLayoutEffect(() => {
    setSelected(undefined);
    setCreating(false);
    setTaskSearch("");
    setFailure("");
    setBusy(false);
    inFlight.current = false;
    setForm({ goal: "", contactIds: [] });
  }, [generation]);
  const activeCard =
    selected &&
    read.data?.data.find(
      (card) => card.id === selected.id && card.source === selected.source,
    );
  const eligible = contacts
    .map((e) => e.contact)
    .filter(
      (c) =>
        c.allowedActions.includes("chat") &&
        !(c.identity.kind === "human" && c.identity.memberId === actor?.member.id),
    );
  const setTab = (value: WorkbenchTab) => {
    setPlanningLaunch(0);
    setSelected(undefined);
    setParams(
      new URLSearchParams({
        view: value,
        ...(value === "history" ? { returnTo: tab === "team" ? "team" : "tasks" } : {}),
      }),
    );
  };
  // A saved plan or planning link is a request to keep working on it, so the
  // assistant opens with that thread instead of a separate page being shown.
  useEffect(() => {
    if (planning) setPlanningLaunch((value) => value + 1);
  }, [planning, planId, requestId]);
  const select = (card: WorkbenchCard) => {
    if (card.taskId && card.source !== "followup") {
      const next = new URLSearchParams(
        workbenchTaskPath(
          card.taskId,
          card.source === "research_task" ? "research" : "personal",
        ).split("?")[1],
      );
      if (filter === "completed") next.set("category", "completed");
      setParams(next);
      return;
    }
    setSelected(card);
    const next = new URLSearchParams(params);
    next.delete("task");
    setParams(next, { replace: true });
  };
  const create = async () => {
    if (!supported || inFlight.current || !form.goal.trim()) return;
    const { isCurrent } = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      const goal = form.goal.trim();
      const created = await researchApi("createPersonalWorkTask", {
        body: {
          title: personalTaskTitle(goal),
          goal,
          contactIds: form.contactIds,
          agentContactId: null,
        },
      });
      if (!isCurrent()) return;
      setCreating(false);
      setForm({ goal: "", contactIds: [] });
      const next = new URLSearchParams(
        workbenchTaskPath(created.data.id).split("?")[1],
      );
      setParams(next);
      await read.refresh();
    } catch (e) {
      if (isCurrent())
        setFailure(e instanceof Error ? e.message : "任务草案未保存，填写内容已保留。");
    } finally {
      if (isCurrent()) setBusy(false);
      inFlight.current = false;
    }
  };
  if (relocated) return <Navigate to={relocated} replace />;
  // A task detail is read-and-act, not a place to start a new plan: the assistant
  // bar stays on the list so the detail screen keeps a single next action.
  const detailOpen = !!requestedTask && requestedValid;
  const assistantBar = !!actor && !detailOpen && tab !== "history";
  // The assistant writes the task; the old form survives only where it cannot run.
  const assistantReady =
    Boolean(actor) &&
    supported &&
    availability.supports(23) &&
    availability.supports(32);
  const startTask = () => {
    if (!assistantReady) return;
    // Drop any plan link so the assistant opens a fresh thread, not the last one.
    if (requestedTask || planId || requestId || params.get("view") === "planning")
      setParams(new URLSearchParams({ view: tab }));
    setTaskLaunch((value) => value + 1);
    setPlanningLaunch((value) => value + 1);
  };
  // Personal tasks have no group and no materials: one sentence and, at most,
  // the people who should see it.
  const startPersonalTask = () => {
    setCreating(true);
    setFailure("");
    setBusy(false);
  };
  return (
    <div
      className={`social-workspace workspace-workbench ${
        planningExpanded && assistantBar ? "is-planning-expanded" : ""
      }`}
    >
      <header className="workspace-heading">
        <div>
          <h1>任务</h1>
        </div>
        <div className="workspace-heading-actions">
          <Segmented
            aria-label="任务视图"
            value={tab}
            onChange={(value) => setTab(value as WorkbenchTab)}
            options={[
              { label: "我的待办", value: "tasks" },
              { label: "团队任务", value: "team" },
              { label: "计划记录", value: "history" },
            ]}
          />
          {tab !== "history" && (
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "personal", label: "新建个人任务", disabled: !supported },
                  {
                    key: "research",
                    label: <span title={assistantReady ? undefined : "这台服务器还没有任务助手，暂时只能建个人任务"}>新建课题组任务</span>,
                    disabled: !assistantReady,
                  },
                ],
                onClick: ({ key }) => key === "personal" ? startPersonalTask() : startTask(),
              }}
            >
              <Button type="primary" disabled={!supported}>新建任务 <DownOutlined /></Button>
            </Dropdown>
          )}
        </div>
      </header>
      <div className="workbench-content">
        {!supported ? (
          <WorkspaceUnavailable
            feature="工作台"
            pending={!availability.data && !availability.error}
            error={availability.error}
            onRetry={availability.refresh}
          />
        ) : tab === "history" ? (
          <PlanningHistory
            onBack={() => setTab(params.get("returnTo") === "team" ? "team" : "tasks")}
            onOpen={(target) => {
              if (target.task) {
                setParams(
                  new URLSearchParams(
                    workbenchTaskPath(target.task, "research").split("?")[1],
                  ),
                );
                return;
              }
              const next = new URLSearchParams({ view: "tasks" });
              if (target.plan) next.set("plan", target.plan);
              if (target.request) next.set("planning", target.request);
              setParams(next);
            }}
          />
        ) : tab === "team" ? (
          availability.supports(23) ? (
            <ResearchTeamWorkbench
              refresh={workbenchRevision}
              onPlan={startTask}
              selectedTask={
                requestedKind === "research" && requestedValid
                  ? requestedTask || undefined
                  : undefined
              }
              onSelectTask={(id) => {
                const next = new URLSearchParams(
                  workbenchTaskPath(id, "research").split("?")[1],
                );
                next.set("view", "team");
                setParams(next);
              }}
            />
          ) : (
            <section className="workspace-empty workspace-unavailable" role="status">
              <h2>科研团队服务待升级</h2>
              <p>
                科研团队总览需要服务器契约 0.23
                或以上。已有任务、计划与聊天可以继续访问。
              </p>
              <div className="workspace-card-actions">
                <Button onClick={availability.refresh}>重新检查</Button>
                <Button type="primary" onClick={() => setTab("tasks")}>
                  查看已有任务
                </Button>
              </div>
            </section>
          )
        ) : (
          <TaskWorkspace
            list={
              <>
                <div className="workspace-task-list-tools">
                  <div>
                    <strong>
                      {availability.supports(23) ? "我的待办" : "任务列表"}
                    </strong>
                    <Button
                      size="small"
                      loading={read.loading}
                      onClick={() => void read.refresh()}
                    >
                      刷新
                    </Button>
                  </div>
                  <Input.Search
                    aria-label="查找我的任务"
                    placeholder="搜索任务"
                    allowClear
                    value={taskSearch}
                    onChange={(e) => setTaskSearch(e.target.value)}
                  />
                  <p>我发起、参与或需要我处理的事项</p>
                </div>
                {read.data?.truncated && (
                  <Alert
                    type="warning"
                    message="任务较多，当前列表仅包含已读取的事项。请从团队任务继续查找。"
                  />
                )}
                <TaskReadNotice
                  error={read.error}
                  stale={!!read.data}
                  loading={read.loading}
                  onRetry={read.refresh}
                />
                {!read.data && !read.error && (
                  <p role="status" className="p-5">
                    正在读取任务…
                  </p>
                )}
                {(() => {
                  const cards = (read.data?.data || []).filter(
                      (card) =>
                        !taskSearch.trim() ||
                        [card.title, card.goal || "", card.owner.displayName]
                          .join(" ")
                          .toLocaleLowerCase()
                          .includes(taskSearch.trim().toLocaleLowerCase()),
                    ),
                    partial = !!read.data?.truncated,
                    groups = [
                      { key: "awaiting_me", label: "需要你动手" },
                      { key: "ongoing", label: "进行中" },
                      { key: "scheduled", label: "定时安排" },
                      { key: "completed", label: "已完成" },
                    ]
                      .map((group) => ({
                        ...group,
                        items: cards.filter((card) => card.category === group.key),
                      }))
                      .filter((group) => group.items.length);
                  return groups.map((group) => (
                    <section
                      className="workspace-task-group"
                      key={group.key}
                      aria-label={group.label}
                    >
                      <h2 className="workspace-task-group-label">
                        {group.label}
                        {partial ? "" : ` · ${group.items.length}`}
                      </h2>
                      {group.items.map((card) => {
                        // One status per row: the footer only adds the progress step
                        // when it says something the badge does not.
                        const badge =
                            workspaceStatusLabel[card.status] ||
                            card.progress.label ||
                            "查看状态",
                          step = workbenchNextAction(card);
                        return (
                          <TaskListRow
                            key={`${card.source}:${card.id}`}
                            title={card.title}
                            status={badge}
                            meta={card.owner.displayName}
                            hint={step && step !== badge ? step : undefined}
                            selected={
                              requestedTask
                                ? card.taskId === requestedTask &&
                                  (card.source === "research_task"
                                    ? "research"
                                    : "personal") === requestedKind
                                : activeCard?.id === card.id
                            }
                            onSelect={() => select(card)}
                          />
                        );
                      })}
                    </section>
                  ));
                })()}
                {read.data && !read.data.data.length && (
                  <div className="workspace-empty">
                    <h2>
                      {filter === "completed"
                        ? "还没有已完成的任务"
                        : "暂时没有要推进的任务"}
                    </h2>
                    <p>
                      聊天中的协作建议会在这里确认；新建课题组任务跟下面的助手说一句，只给自己的点「新建个人任务」。
                    </p>
                  </div>
                )}
                {read.data && read.data.data.length > 0 && (
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      setParams(
                        filter === "completed"
                          ? { view: "tasks" }
                          : { view: "tasks", category: "completed" },
                      );
                      setTaskSearch("");
                      setSelected(undefined);
                    }}
                  >
                    {filter === "completed" ? "返回待办" : "查看已完成"}
                  </Button>
                )}
                {read.data &&
                  taskSearch.trim() &&
                  !read.data.data.some((card) =>
                    [card.title, card.goal || "", card.owner.displayName]
                      .join(" ")
                      .toLocaleLowerCase()
                      .includes(taskSearch.trim().toLocaleLowerCase()),
                  ) && (
                    <p className="workspace-task-list-note">没有符合搜索条件的任务。</p>
                  )}
              </>
            }
          >
            {requestedTask ? (
              requestedValid ? (
                <WorkspaceTaskDetail
                  key={`${generation}:${requestedKind}:${requestedTask}`}
                  taskId={requestedTask}
                  kind={requestedKind === "research" ? "research" : "personal"}
                  onChanged={read.refresh}
                />
              ) : (
                <Alert type="warning" message="任务链接无效，请从列表重新选择。" />
              )
            ) : activeCard ? (
              <WorkbenchOverview
                key={`${activeCard.source}:${activeCard.id}`}
                card={activeCard}
              />
            ) : (
              <div className="workspace-empty">
                <h2>有什么事要安排？</h2>
                <p>说一句，先看安排，再确认发出。</p>
                <form
                  className="workspace-quick-task"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!quickRequest.trim() || !assistantReady) return;
                    setQuickDraft(quickRequest.trim());
                    setPlanningLaunch((value) => value + 1);
                    setQuickRequest("");
                  }}
                >
                  <Input.TextArea
                    aria-label="一句话安排任务"
                    placeholder="例如：下周五组会，请小陈汇报这周的实验进展，交一份报告"
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    value={quickRequest}
                    maxLength={4000}
                    disabled={!assistantReady}
                    onChange={(event) => setQuickRequest(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                  <Button
                    htmlType="submit"
                    type="primary"
                    disabled={!assistantReady || !quickRequest.trim()}
                  >
                    整理成任务
                  </Button>
                </form>
              </div>
            )}
          </TaskWorkspace>
        )}
      </div>
      {!!actor && (
        <PlanningAgent
          view={tab}
          hidden={detailOpen || tab === "history" || (tab === "tasks" && !activeCard && !planningExpanded)}
          available={supported && availability.supports(23)}
          conversationAvailable={availability.supports(32)}
          focus={planningLaunch}
          fresh={taskLaunch}
          onExpandedChange={expandedChanged}
          planId={planId}
          requestId={requestId}
          draft={quickDraft || draft}
          submitDraft={!!quickDraft}
          onCreated={() => {
            setWorkbenchRevision((value) => value + 1);
            void read.refresh();
          }}
          onTeam={() => setTab("team")}
        />
      )}
      <Modal
        title="新建个人任务"
        open={creating}
        onCancel={() => setCreating(false)}
        footer={null}
        destroyOnClose
        className="workspace-add-dialog"
      >
        <div className="workspace-task-form">
          <label>
            要做什么
            <Input.TextArea
              aria-label="任务目标"
              rows={3}
              maxLength={8000}
              placeholder="一句话说清，比如：把上周的实验数据整理成一张表"
              value={form.goal}
              disabled={busy}
              onChange={(e) => setForm((s) => ({ ...s, goal: e.target.value }))}
            />
          </label>
          <label>
            一起参与的联系人（可留空）
            <Select
              aria-label="任务成员"
              mode="multiple"
              allowClear
              value={form.contactIds}
              disabled={busy}
              placeholder="只给自己做就不用选"
              options={eligible.map((c) => ({
                value: c.id,
                label: `${c.displayName}${
                  c.identity.kind === "human" ? "" : " · Agent"
                }`,
              }))}
              onChange={(contactIds) => setForm((s) => ({ ...s, contactIds }))}
            />
          </label>
          <p className="workspace-muted">
            只给自己或朋友安排：不建课题组群，也不占课题组资料；要请 Agent
            处理时在任务里选。
          </p>
          {failure && <Alert type="error" message={failure} />}
          <div className="workspace-task-form-actions">
            <Button disabled={busy} onClick={() => setCreating(false)}>取消</Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!form.goal.trim()}
            onClick={() => void create()}
          >
            建好任务
          </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
