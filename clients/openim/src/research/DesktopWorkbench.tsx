import { Alert, Button, Input, Modal, Segmented, Select } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Id, type WorkbenchCard } from "@research-agent-platform/contracts";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { researchApi } from "./api";
import { workspaceApi, useWorkspaceConversation } from "./workspace-api";
import { PersonalFollowupPanel } from "./PersonalFollowupPanel";
import { WorkspaceReports } from "./WorkspaceReports";
import {
  PersonalWorkDetail,
  workspaceMemberLabel,
  workspaceStatusLabel,
} from "./PersonalWorkDetail";
import { ResearchTaskPanel } from "./ResearchTaskPanel";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import "./workspace.scss";
import { readWorkspaceAvailability } from "./workspace-availability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";

type Category = "ongoing" | "awaiting_me" | "completed";
function WorkbenchOverview({
  card,
  onTask,
}: {
  card: WorkbenchCard;
  onTask: () => void;
}) {
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
        <p>{card.progress.label || "当前进展尚未提供"}</p>
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
        {card.taskId && card.source !== "followup" && (
          <Button type="primary" onClick={onTask}>
            {card.category === "awaiting_me" ? "查看并处理" : "任务详情与操作"}
          </Button>
        )}
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
  const tab =
    params.get("view") === "scheduled" || params.get("tab") === "scheduled"
      ? "scheduled"
      : params.get("view") === "reports"
      ? "reports"
      : "tasks";
  const requestedTask = params.get("task");
  const requestedValid = !!requestedTask && Id.safeParse(requestedTask).success;
  const [category, setCategory] = useState<Category>("ongoing"),
    [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const availability = useResearchRead(
    readWorkspaceAvailability,
    "workspace-availability",
    tab !== "reports",
  );
  const supported = availability.data?.available === true;
  const read = useResearchRead(
    () => workspaceApi.tasks(category, cursor),
    `workbench:${category}:${cursor || ""}`,
    tab === "tasks" && supported,
  );
  const [selected, setSelected] = useState<WorkbenchCard>(),
    [details, setDetails] = useState(false);
  const generation = useResearchStore((s) => s.generation),
    actor = useResearchStore((s) => s.actor),
    contacts = useResearchStore((s) => s.contacts);
  const [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  const [form, setForm] = useState({
    title: "",
    goal: "",
    contactIds: [] as string[],
    agentContactId: null as string | null,
  });
  const operation = usePersonalOperation(
      creating && supported,
      "create-workspace-task",
    ),
    inFlight = useRef(false);
  useLayoutEffect(() => {
    if (!supported) setCreating(false);
  }, [supported]);
  useLayoutEffect(() => {
    setSelected(undefined);
    setDetails(false);
    setCreating(false);
    setPages([undefined]);
    setFailure("");
    setBusy(false);
    inFlight.current = false;
    setForm({ title: "", goal: "", contactIds: [], agentContactId: null });
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
  const setTab = (value: string) => {
    setSelected(undefined);
    setDetails(false);
    const next = new URLSearchParams(params);
    next.delete("task");
    next.delete("tab");
    if (value === "tasks") next.delete("view");
    else next.set("view", value);
    setParams(next);
  };
  const select = (card: WorkbenchCard) => {
    setSelected(card);
    setDetails(false);
    const next = new URLSearchParams(params);
    next.delete("task");
    setParams(next, { replace: true });
  };
  const create = async () => {
    if (!supported || inFlight.current || !form.title.trim() || !form.goal.trim())
      return;
    const { isCurrent } = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      const created = await researchApi("createPersonalWorkTask", {
        body: { ...form, title: form.title.trim(), goal: form.goal.trim() },
      });
      if (!isCurrent()) return;
      setCreating(false);
      setForm({ title: "", goal: "", contactIds: [], agentContactId: null });
      const next = new URLSearchParams(params);
      next.delete("view");
      next.set("task", created.data.id);
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
  return (
    <div className="social-workspace workspace-workbench">
      <header className="workspace-heading">
        <div>
          <h1>工作台</h1>
          <p>任务、定时安排和本机报告，都有实际进展可查。</p>
        </div>
        <Button
          type="primary"
          disabled={!supported}
          onClick={() => {
            setCreating(true);
            setFailure("");
            setBusy(false);
          }}
        >
          新建任务
        </Button>
      </header>
      <div className="workspace-toolbar">
        <Segmented
          aria-label="工作台栏目"
          value={tab}
          onChange={(value) => setTab(String(value))}
          options={[
            { label: "我的任务", value: "tasks" },
            { label: "定时任务", value: "scheduled" },
            { label: "本机报告", value: "reports" },
          ]}
        />
        {tab === "tasks" && (
          <Segmented
            aria-label="任务分类"
            value={category}
            onChange={(value) => {
              setCategory(value as Category);
              setPages([undefined]);
              setSelected(undefined);
              setDetails(false);
            }}
            options={[
              { label: "进行中", value: "ongoing" },
              { label: "待我处理", value: "awaiting_me" },
              { label: "已完成", value: "completed" },
            ]}
          />
        )}
      </div>
      {tab !== "reports" && !supported ? (
        <WorkspaceUnavailable
          feature="工作台"
          pending={!availability.data && !availability.error}
          error={availability.error}
          onRetry={availability.refresh}
        />
      ) : tab === "scheduled" ? (
        <div className="workspace-full-panel">
          <PersonalFollowupPanel active />
        </div>
      ) : tab === "reports" ? (
        <div className="workspace-full-panel">
          <WorkspaceReports active />
        </div>
      ) : (
        <div className="workspace-task-body">
          <aside className="workspace-task-list">
            {read.error && (
              <Alert
                type="error"
                message={read.error}
                action={<Button onClick={read.refresh}>重试</Button>}
              />
            )}
            {!read.data && !read.error && (
              <p role="status" className="p-5">
                正在读取任务…
              </p>
            )}
            {read.data?.data.map((card) => (
              <button
                className="workspace-task-row"
                key={`${card.source}:${card.id}`}
                aria-pressed={!requestedTask && activeCard?.id === card.id}
                onClick={() => select(card)}
              >
                <span className="workspace-task-row-title">{card.title}</span>
                <span className="workspace-status">
                  {workspaceStatusLabel[card.status] ||
                    card.progress.label ||
                    "查看状态"}
                </span>
                <p>{card.goal || "接受后可查看获准目标"}</p>
                <footer>
                  {card.owner.displayName}
                  <span>{card.progress.label}</span>
                </footer>
              </button>
            ))}
            {read.data && !read.data.data.length && (
              <div className="workspace-empty">
                <h2>
                  {category === "awaiting_me"
                    ? "暂时没有待你处理的任务"
                    : category === "completed"
                    ? "还没有已完成的任务"
                    : "暂时没有进行中的任务"}
                </h2>
                <p>聊天中的协作建议会在这里确认，也可以手工建立一项任务。</p>
              </div>
            )}
            {(pages.length > 1 || read.data?.nextCursor) && (
              <div className="workspace-pages">
                <Button
                  size="small"
                  disabled={pages.length === 1}
                  onClick={() => setPages((v) => v.slice(0, -1))}
                >
                  上一页
                </Button>
                <Button
                  size="small"
                  disabled={!read.data?.nextCursor}
                  onClick={() => {
                    const nextCursor = read.data?.nextCursor;
                    if (nextCursor) setPages((v) => [...v, nextCursor]);
                  }}
                >
                  更多任务
                </Button>
              </div>
            )}
          </aside>
          <main className="workspace-detail-pane">
            {requestedTask ? (
              requestedValid ? (
                <PersonalWorkDetail
                  key={requestedTask}
                  taskId={requestedTask}
                  onChanged={read.refresh}
                />
              ) : (
                <Alert type="warning" message="任务链接无效，请从列表重新选择。" />
              )
            ) : activeCard ? (
              details && activeCard.taskId ? (
                activeCard.source === "personal_task" ? (
                  <PersonalWorkDetail
                    key={activeCard.taskId}
                    taskId={activeCard.taskId}
                    onChanged={read.refresh}
                  />
                ) : (
                  <div className="workspace-task-detail">
                    <ResearchTaskPanel
                      key={activeCard.taskId}
                      taskId={activeCard.taskId}
                    />
                  </div>
                )
              ) : (
                <WorkbenchOverview
                  key={`${activeCard.source}:${activeCard.id}`}
                  card={activeCard}
                  onTask={() => setDetails(true)}
                />
              )
            ) : (
              <div className="workspace-empty">
                <h2>把事情交代清楚，一起推进</h2>
                <p>
                  选择任务查看目标、实际成员和结果。只有明确验收后，任务才会标为完成。
                </p>
              </div>
            )}
          </main>
        </div>
      )}
      <Modal
        title="新建一项任务"
        open={creating}
        onCancel={() => setCreating(false)}
        footer={null}
        destroyOnClose
        className="workspace-add-dialog"
      >
        <div className="workspace-task-form">
          <label>
            任务名称
            <Input
              aria-label="任务名称"
              maxLength={200}
              value={form.title}
              disabled={busy}
              onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
            />
          </label>
          <label>
            希望完成什么
            <Input.TextArea
              aria-label="任务目标"
              rows={4}
              maxLength={8000}
              value={form.goal}
              disabled={busy}
              onChange={(e) => setForm((s) => ({ ...s, goal: e.target.value }))}
            />
          </label>
          <label>
            一起参与的联系人
            <Select
              aria-label="任务成员"
              mode="multiple"
              value={form.contactIds}
              disabled={busy}
              options={eligible.map((c) => ({
                value: c.id,
                label: `${c.displayName}${
                  c.identity.kind === "human" ? "" : " · Agent"
                }`,
              }))}
              onChange={(contactIds) => setForm((s) => ({ ...s, contactIds }))}
            />
          </label>
          <details>
            <summary>预选一个处理任务的 Agent（可选）</summary>
            <Select
              aria-label="任务预选 Agent"
              allowClear
              value={form.agentContactId || undefined}
              disabled={busy}
              options={eligible
                .filter((c) => c.identity.kind !== "human" && !c.agentRuntime)
                .map((c) => ({ value: c.id, label: c.displayName }))}
              onChange={(id) => setForm((s) => ({ ...s, agentContactId: id || null }))}
            />
          </details>
          <p className="workspace-muted">
            先保存草案，再确认建群和独立邀请；不会自动开始模型处理。
          </p>
          {failure && <Alert type="error" message={failure} />}
          <Button
            type="primary"
            loading={busy}
            disabled={!form.title.trim() || !form.goal.trim()}
            onClick={() => void create()}
          >
            保存任务草案
          </Button>
        </div>
      </Modal>
    </div>
  );
}
