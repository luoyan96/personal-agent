import { Alert, Button, Input, Modal, Select, Segmented } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Id } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import { ResearchTaskPanel } from "./ResearchTaskPanel";
import {
  newPlanStep,
  planDate,
  planProblems,
  planningTemplate,
  requestStateLabels,
  taskStateLabels,
} from "./task-planning";
import { isFullTask, teamTaskStatus } from "./research-team";
import type { PlanDraft, PlanStep, SavedPlan } from "./task-planning";
import "./task-planning.scss";
import { ResearchTeamAccountHint } from "./ResearchTeamAccountHint";
import { readResearchTeamAvailability } from "./workspace-availability";

const time = (value: string) =>
  new Date(value).toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
const activeRequest = (status?: string) =>
  !!status && ["queued", "running", "waiting_input", "interrupted"].includes(status);
const blank = (labId: string): PlanDraft => ({
  labId,
  goal: "",
  proposedItems: [newPlanStep()],
  unresolvedQuestions: [],
});
const requestFailure = (value: string | null) =>
  value === "BUDGET_EXCEEDED"
    ? "本次规划超出预算，没有创建任务。可以缩小范围后重新生成，或手工填写步骤。"
    : value === "MODEL_UNAVAILABLE"
    ? "规划模型暂不可用。可以保留需求，使用科研模板或手工填写步骤。"
    : "本次生成没有得到有效草案，原有计划未被修改。可以调整需求后重新生成。";

function ConfirmedPlan({
  plan,
  people,
  onTasks,
}: {
  plan: SavedPlan;
  people: Record<string, string>;
  onTasks: () => void;
}) {
  const [taskId, setTaskId] = useState<string>();
  const availability = useResearchRead(
    readResearchTeamAvailability,
    "plan-task-links-availability",
  );
  const facts = useResearchRead(
    async (signal) => {
      const result = await researchApi("planTasks", {
        params: { id: plan.id },
        signal,
      });
      const links = new Map(result.data.steps.map((link) => [link.itemId, link]));
      const rows = plan.proposedItems.map((step) => {
        const linked = links.get(step.id)?.task;
        return {
          step,
          task: linked && isFullTask(linked) ? linked : undefined,
          linked,
        };
      });
      return { rows, incomplete: rows.some((row) => !row.task) };
    },
    `confirmed-plan:${plan.id}:${plan.version}`,
    availability.data?.available === true,
  );
  const tasks = facts.data?.rows.map((r) => r.task) ?? [];
  const next = tasks.find(
    (t) =>
      t &&
      t.status !== "completed" &&
      t.status !== "cancelled" &&
      t.dependencies.every((dep) =>
        tasks.some((p) => p?.id === dep.taskId && p.status === "completed"),
      ),
  );
  if (!availability.data?.available)
    return (
      <div className="planner-confirmed">
        <h2>{plan.goal}</h2>
        <Alert
          type={availability.error ? "error" : "info"}
          message={
            availability.error ||
            (availability.data
              ? "稳定步骤进展需要科研团队服务升级至契约 0.23。已有任务仍可查看和操作。"
              : "正在检查步骤进展服务…")
          }
          action={<Button onClick={availability.refresh}>重新检查</Button>}
        />
        <Button onClick={onTasks}>查看已有任务</Button>
      </div>
    );
  return (
    <div className="planner-confirmed">
      <div className="planner-section-heading">
        <div>
          <span className="planner-label">已确认的计划</span>
          <h2>{plan.goal}</h2>
        </div>
        <span>
          {facts.data
            ? `${tasks.filter((t) => t?.status === "completed").length} / ${
                plan.proposedItems.length
              } 步已结束`
            : "正在读取进展…"}
        </span>
      </div>
      {facts.error && (
        <Alert
          type="error"
          message={facts.error}
          action={<Button onClick={facts.refresh}>重新读取</Button>}
        />
      )}
      {!facts.data && !facts.error && <p role="status">正在读取步骤进展…</p>}
      {facts.data?.incomplete && (
        <Alert
          type="warning"
          message="部分步骤尚无可读的完整任务，可能需要承接或权限已变化；进展只统计已读取任务。"
        />
      )}
      {next && (
        <div className="planner-next">
          <div>
            <span className="planner-label">下一步</span>
            <strong>{next.title}</strong>
            <p>
              {next.status === "in_review"
                ? "查看实际交付，再决定通过或退回修改。"
                : next.status === "blocked"
                ? next.blocker?.requestedAction
                : next.status === "awaiting_acceptance"
                ? "等待受邀成员确认承接。"
                : "打开步骤，查看材料与当前可执行的操作。"}
            </p>
          </div>
          <Button onClick={() => setTaskId(next.id)}>处理这一步</Button>
        </div>
      )}
      <ol className="planner-timeline">
        {plan.proposedItems.map((step, i) => {
          const task = tasks[i];
          return (
            <li key={step.id}>
              <span
                className={`planner-number ${
                  task?.status === "completed" ? "done" : ""
                }`}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="planner-step-summary">
                <div>
                  <h3>{step.title}</h3>
                  <span>
                    {facts.data?.rows[i]?.linked
                      ? teamTaskStatus(facts.data.rows[i].linked!) === "completed"
                        ? "已结束 · 查看审阅记录"
                        : taskStateLabels[teamTaskStatus(facts.data.rows[i].linked!)]
                      : "任务不可用或尚未读取"}
                  </span>
                </div>
                <p>交付物：{step.deliverable}</p>
                <p>验收标准：{task?.acceptanceCriteria || step.acceptanceCriteria}</p>
                <p>
                  负责人：
                  {task?.leadId ? people[task.leadId] || "已承接成员" : "尚未承接"}
                  {task?.schedule.hardDeadline
                    ? ` · 截止 ${planDate(task.schedule.hardDeadline)}${
                        task.schedule.hardDeadline.confirmed ? "" : "（待确认）"
                      }`
                    : ""}
                </p>
                {step.dependencies.length > 0 && (
                  <p>
                    前置步骤：
                    {step.dependencies
                      .map(
                        (id) =>
                          plan.proposedItems.find((s) => s.id === id)?.title ||
                          "未找到步骤",
                      )
                      .join("、")}
                  </p>
                )}
                <Button
                  disabled={!facts.data?.rows[i]?.linked}
                  onClick={() => setTaskId(facts.data!.rows[i].linked!.id)}
                >
                  查看任务与交付
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <Modal
        title="步骤与交付"
        open={!!taskId}
        onCancel={() => {
          setTaskId(undefined);
          void facts.refresh();
        }}
        footer={null}
        width={760}
        destroyOnClose
      >
        {taskId && (
          <ResearchTaskPanel key={taskId} taskId={taskId} onChanged={facts.refresh} />
        )}
      </Modal>
    </div>
  );
}

export function TaskPlanning({
  launch,
  onTasks,
}: {
  launch: number;
  onTasks: () => void;
}) {
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const [params, setParams] = useSearchParams();
  const selected = params.get("plan") || undefined,
    requestId = params.get("planning") || undefined;
  const validPlan = !selected || Id.safeParse(selected).success,
    validRequest = !requestId || Id.safeParse(requestId).success;
  const [status, setStatus] = useState<"draft" | "confirmed">("draft");
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [requestCursors, setRequestCursors] = useState<(string | undefined)[]>([
    undefined,
  ]);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<PlanDraft>(() => blank(actor?.member.labId || ""));
  const [base, setBase] = useState<SavedPlan>();
  const [expanded, setExpanded] = useState(0);
  const [composing, setComposing] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState("");
  const inFlight = useRef(false),
    dirty = useRef(false),
    loaded = useRef<string>();
  const operation = usePersonalOperation(
    true,
    `research-task-planning:${selected || "new"}:${requestId || "none"}`,
  );
  const dialogs = useRef<ReturnType<typeof Modal.confirm>[]>([]);
  const confirm = (options: Parameters<typeof Modal.confirm>[0]) => {
    const { isCurrent } = operation.capture();
    dialogs.current.push(
      Modal.confirm({
        ...options,
        onOk: (...args) => (isCurrent() ? options.onOk?.(...args) : undefined),
      }),
    );
  };
  useLayoutEffect(
    () => () => {
      dialogs.current.forEach((dialog) => dialog.destroy());
      dialogs.current = [];
    },
    [operation.scope],
  );
  useLayoutEffect(() => {
    inFlight.current = false;
    setBusy(false);
    if (selected && base?.id !== selected) {
      loaded.current = undefined;
      setBase(undefined);
    }
  }, [operation.scope]);
  const list = useResearchRead(
    (signal) =>
      researchApi("plans", {
        query: { status, limit: 30, cursor: cursors[cursors.length - 1] },
        signal,
      }),
    `planner-list:${status}:${cursors.join()}`,
  );
  const requests = useResearchRead(
    (signal) =>
      researchApi("planningRequests", {
        query: { limit: 10, cursor: requestCursors[requestCursors.length - 1] },
        signal,
      }),
    `planner-requests:${requestCursors.join()}`,
  );
  const read = useResearchRead(
    (signal) => researchApi("getPlan", { params: { id: selected! }, signal }),
    `planner:${selected}`,
    !!selected && validPlan,
  );
  const request = useResearchRead(
    (signal) => researchApi("getPlanRequest", { params: { id: requestId! }, signal }),
    `planner-request:${requestId}`,
    !!requestId && validRequest,
  );
  const members = useResearchRead(
    (signal) =>
      researchApi("members", {
        params: { id: actor!.member.labId },
        query: { limit: 100 },
        signal,
      }),
    `planner-members:${actor?.member.labId}`,
    !!actor,
  );
  const capabilities = useResearchRead(
    (signal) => researchApi("publicCapabilities", { signal }),
    "planner-capabilities",
  );
  const availableCapabilities =
    capabilities.data?.data.filter((c) => c.status === "available") ?? [];

  const select = (id?: string, planning?: string) => {
    const go = () => {
      dirty.current = false;
      loaded.current = undefined;
      setBase(undefined);
      setFailure("");
      setNotice("");
      setExpanded(0);
      const next = new URLSearchParams(params);
      next.set("view", "planning");
      next.delete("task");
      next.delete("plan");
      next.delete("planning");
      if (id) next.set("plan", id);
      if (planning) next.set("planning", planning);
      setParams(next);
    };
    if (dirty.current)
      confirm({
        title: "离开尚未保存的草案？",
        content: "当前修改尚未保存。保存草案后可以在其他窗口继续规划。",
        okText: "离开",
        cancelText: "继续编辑",
        onOk: go,
      });
    else go();
  };
  useEffect(() => {
    if (!read.data || loaded.current === read.data.data.id) return;
    const p = read.data.data;
    loaded.current = p.id;
    dirty.current = false;
    setBase(p);
    setDraft({
      labId: p.labId,
      goal: p.goal,
      proposedItems: p.proposedItems,
      unresolvedQuestions: p.unresolvedQuestions,
    });
  }, [read.data]);
  useEffect(() => {
    const planId = request.data?.data.planId;
    if (request.data?.data.status === "draft" && planId && !selected && !dirty.current)
      select(planId, requestId);
  }, [request.data?.data.status, request.data?.data.planId, selected]);
  useEffect(() => {
    setBase(undefined);
    setDraft(blank(actor?.member.labId || ""));
    setPrompt("");
    setDeliverable("");
    setDeadline("");
    setFailure("");
    setNotice("");
    setBusy(false);
    setComposing(false);
    setCursors([undefined]);
    setRequestCursors([undefined]);
    inFlight.current = false;
    loaded.current = undefined;
    dirty.current = false;
  }, [generation]);
  useEffect(() => {
    if (launch) {
      setFailure("");
      setComposing(true);
    }
  }, [launch]);

  const edit = (next: PlanDraft) => {
    dirty.current = true;
    setDraft(next);
    setNotice("");
  };
  const stepEdit = (i: number, patch: Partial<PlanStep>) =>
    edit({
      ...draft,
      proposedItems: draft.proposedItems.map((s, n) =>
        n === i ? { ...s, ...patch } : s,
      ),
    });
  async function perform(job: () => Promise<void>) {
    if (inFlight.current) return;
    const current = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      await job();
    } catch (error) {
      if (current.isCurrent())
        setFailure(
          error instanceof Error ? error.message : "操作失败，填写内容已保留。",
        );
    } finally {
      if (current.isCurrent()) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  }
  const save = async (confirm = false) => {
    const errors = planProblems(draft);
    if (errors.length) {
      setFailure(errors.join(" "));
      return;
    }
    const current = operation.capture();
    await perform(async () => {
      const body = {
        ...draft,
        goal: draft.goal.trim(),
        proposedItems: draft.proposedItems.map((step) => ({
          ...step,
          title: step.title.trim(),
          goal: step.goal.trim(),
          deliverable: step.deliverable.trim(),
          acceptanceCriteria: step.acceptanceCriteria.trim(),
        })),
      };
      const value = base
        ? await researchApi("editPlan", {
            params: { id: base.id },
            body: { ...body, expectedVersion: base.version },
          })
        : await researchApi("createPlan", { body });
      if (!current.isCurrent()) return;
      const p = value.data;
      setBase(p);
      dirty.current = false;
      loaded.current = p.id;
      if (confirm) {
        // The exact saved version is confirmed. A failed confirm still leaves a recoverable server draft.
        const result = await researchApi("confirmPlan", {
          params: { id: p.id },
          body: { expectedVersion: p.version },
        });
        if (!current.isCurrent()) return;
        setBase(result.data.plan);
        setStatus("confirmed");
        setCursors([undefined]);
        setNotice(
          `已创建 ${result.data.taskIds.length} 个步骤任务；邀请等待成员接受，执行与验收在任务中进行。`,
        );
      } else setNotice("草案已保存，下次可以从左侧继续。");
      const next = new URLSearchParams(params);
      next.set("view", "planning");
      next.set("plan", p.id);
      next.delete("planning");
      setParams(next);
      void list.refresh();
      void read.refresh();
    });
  };
  const generate = () => {
    if (!actor || !prompt.trim()) return;
    const current = operation.capture();
    void perform(async () => {
      const instructions = `${prompt.trim()}${
        deliverable.trim() ? `\n最终交付物：${deliverable.trim()}` : ""
      }${
        deadline
          ? `\n用户提供的最终截止日期：${deadline}，时区 Asia/Shanghai；保留为待确认的建议。`
          : ""
      }\n请用中文给出可执行的科研计划，拆成3至6个步骤，写清交付物、验收标准与依赖。不要臆造资料、能力、进度或成员已接受任务；重要的未知事项放入待澄清问题。默认由我负责，只有明确要求时才建议邀请列出的成员。`;
      const result = await researchApi("planRequest", {
        body: {
          labId: actor.member.labId,
          prompt: instructions,
          intent: "draft",
          plan: null,
          taskIds: [],
          inputArtifactIds: [],
          conclusionRefs: [],
          budget: { maxTokens: 100000, maxSeconds: 120 },
        },
      });
      if (!current.isCurrent()) return;
      setComposing(false);
      select(undefined, result.data.id);
      void requests.refresh();
    });
  };
  const useTemplate = (kind?: "reading" | "experiment" | "writing") => {
    const go = () => {
      const seed = kind
        ? planningTemplate(kind, actor!.member.labId, prompt.trim())
        : { ...blank(actor!.member.labId), goal: prompt.trim() };
      const last = seed.proposedItems[seed.proposedItems.length - 1];
      if (deliverable.trim()) last.deliverable = deliverable.trim();
      if (deadline)
        last.schedule.hardDeadline = {
          value: { kind: "date", date: deadline, timezone: "Asia/Shanghai" },
          source: "user",
          confirmed: true,
        };
      dirty.current = true;
      loaded.current = undefined;
      setBase(undefined);
      setDraft(seed);
      setExpanded(0);
      setComposing(false);
      setFailure("");
      setNotice(
        kind
          ? "已采用科研模板，请按实际项目调整步骤与分工。"
          : "请填写每一步的目标、交付物与验收标准。",
      );
      const next = new URLSearchParams(params);
      next.set("view", "planning");
      next.delete("plan");
      next.delete("planning");
      setParams(next);
    };
    if (dirty.current)
      confirm({
        title: "用新计划替换未保存的编辑？",
        okText: "开始新计划",
        cancelText: "保留编辑",
        onOk: go,
      });
    else go();
  };
  const reload = () =>
    confirm({
      title: "采用服务端最新草案？",
      content: "这会替换尚未保存的编辑。请先复制需要保留的内容。",
      okText: "读取最新草案",
      cancelText: "保留编辑",
      onOk: async () => {
        dirty.current = false;
        loaded.current = undefined;
        await read.refresh();
      },
    });
  const setAllocation = (i: number, value: string) => {
    if (value === "self") stepEdit(i, { allocation: { kind: "self" }, budget: null });
    else if (value.startsWith("member:"))
      stepEdit(i, {
        allocation: { kind: "invitation", memberId: value.slice(7) },
        budget: null,
      });
    else {
      const cap = availableCapabilities.find((c) => c.id === value.slice(6));
      if (cap)
        stepEdit(i, {
          allocation: {
            kind: "public_agent",
            capability: { id: cap.id, version: cap.version, visibility: "lab_public" },
            humanLeadId: actor!.member.id,
            missingReason: null,
          },
          budget: { maxTokens: 100000, maxSeconds: 120 },
        });
    }
  };

  return (
    <div className="task-planning">
      <aside className="planner-sidebar">
        <h2 className="planner-sidebar-title">我的计划</h2>
        <Segmented
          aria-label="计划分类"
          value={status}
          options={[
            { label: "草案", value: "draft" },
            { label: "已确认", value: "confirmed" },
          ]}
          onChange={(value) => {
            setStatus(value as typeof status);
            setCursors([undefined]);
          }}
        />
        <Input
          aria-label="查找当前页计划"
          placeholder="查找当前页计划"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          allowClear
        />
        <div className="planner-list">
          {list.error && (
            <Alert
              type="error"
              message={list.error}
              action={<Button onClick={list.refresh}>重试</Button>}
            />
          )}
          {!list.data && !list.error && <p role="status">正在读取计划…</p>}
          {list.data?.data
            .filter((p) => p.goal.toLowerCase().includes(search.toLowerCase()))
            .map((p) => (
              <button
                key={p.id}
                className="planner-plan-row"
                aria-pressed={selected === p.id}
                onClick={() => select(p.id)}
              >
                <strong>{p.goal}</strong>
                <span>
                  {p.status === "draft" ? "草案" : "已确认"} · {time(p.createdAt)}
                </span>
              </button>
            ))}
          {list.data && !list.data.data.length && (
            <p className="planner-list-empty">
              {status === "draft"
                ? "还没有计划草案。先写下你想完成的事。"
                : "确认草案后，计划和步骤进展会显示在这里。"}
            </p>
          )}
          {list.data && (
            <div className="planner-pagination">
              <Button
                size="small"
                disabled={cursors.length < 2}
                onClick={() => setCursors((v) => v.slice(0, -1))}
              >
                上一页
              </Button>
              <Button
                size="small"
                disabled={!list.data.nextCursor}
                onClick={() => setCursors((v) => [...v, list.data!.nextCursor!])}
              >
                下一页
              </Button>
            </div>
          )}
        </div>
        <details className="planner-request-history">
          <summary>AI 生成记录 · 关闭后可找回</summary>
          {requests.error && (
            <Alert
              type="error"
              message={requests.error}
              action={<Button onClick={requests.refresh}>重试</Button>}
            />
          )}
          {requests.data?.data.map((r) => (
            <button
              key={r.id}
              aria-pressed={requestId === r.id}
              onClick={() => select(undefined, r.id)}
            >
              <strong>{requestStateLabels[r.status]}</strong>
              <span>{time(r.createdAt)}</span>
            </button>
          ))}
          {requests.data && !requests.data.data.length && <p>还没有生成请求。</p>}
          <div className="planner-pagination">
            <Button
              size="small"
              disabled={requestCursors.length < 2}
              onClick={() => setRequestCursors((v) => v.slice(0, -1))}
            >
              上一页
            </Button>
            <Button
              size="small"
              disabled={!requests.data?.nextCursor}
              onClick={() =>
                setRequestCursors((v) => [...v, requests.data!.nextCursor!])
              }
            >
              下一页
            </Button>
          </div>
        </details>
      </aside>
      <main className="planner-canvas">
        {notice && (
          <Alert
            type="success"
            message={notice}
            closable
            onClose={() => setNotice("")}
          />
        )}
        {failure && (
          <Alert
            type="error"
            message={failure}
            action={
              base ? (
                <Button disabled={busy} onClick={reload}>
                  读取最新草案
                </Button>
              ) : undefined
            }
          />
        )}
        {(!validPlan || !validRequest) && (
          <Alert type="error" message="计划链接无效，请从左侧重新选择。" />
        )}
        {read.error && (
          <Alert
            type="error"
            message={read.error}
            action={<Button onClick={read.refresh}>重试读取</Button>}
          />
        )}
        {requestId && (
          <div className="planner-request">
            <div>
              <span className="planner-label">AI 规划</span>
              <h2>
                {request.data
                  ? requestStateLabels[request.data.data.status]
                  : "读取生成进度…"}
              </h2>
              <p>
                {activeRequest(request.data?.data.status)
                  ? "可以继续使用其他功能。生成记录保存在服务端，回来后可继续查看。"
                  : request.data?.data.status === "failed"
                  ? requestFailure(request.data.data.failure)
                  : "生成结果是一份待你确认的计划草案。"}
              </p>
            </div>
            {request.error && (
              <Alert
                type="error"
                message={request.error}
                action={<Button onClick={request.refresh}>重试读取</Button>}
              />
            )}
            {request.data && activeRequest(request.data.data.status) && (
              <Button
                disabled={busy}
                onClick={() => {
                  const current = operation.capture();
                  void perform(async () => {
                    await researchApi("cancelPlanning", {
                      params: { id: requestId },
                      body: {
                        expectedVersion: request.data!.data.version,
                        reason: "用户在工作台停止生成",
                      },
                    });
                    if (current.isCurrent()) {
                      void request.refresh();
                      void requests.refresh();
                    }
                  });
                }}
              >
                停止生成
              </Button>
            )}
            {request.data?.data.planId && request.data.data.status === "draft" && (
              <Button onClick={() => select(request.data!.data.planId!, requestId)}>
                打开草案
              </Button>
            )}
          </div>
        )}
        {selected && read.error ? null : base?.status === "superseded" ? (
          <Alert
            type="warning"
            message="这份计划已被替代，请从左侧选择当前草案，或规划一项新任务。"
          />
        ) : base?.status === "confirmed" ? (
          <>
            <ConfirmedPlan
              onTasks={onTasks}
              key={base.id}
              plan={base}
              people={Object.fromEntries(
                (members.data?.data || []).map((m) => [m.id, m.displayName]),
              )}
            />
            <Button className="planner-all-tasks" onClick={onTasks}>
              查看工作台全部任务
            </Button>
          </>
        ) : selected && !base ? (
          !read.error && <p role="status">正在读取草案…</p>
        ) : !selected && !dirty.current && !requestId ? (
          <div className="planner-intro">
            <span className="planner-intro-icon" aria-hidden="true">
              01
            </span>
            <h2>先说目标，再一起拆解</h2>
            <p>
              把科研需求整理成步骤，明确谁来做、交付什么、怎样验收。可以先用模板开始，再逐步补齐。
            </p>
            <Button type="primary" onClick={() => setComposing(true)}>
              规划我的第一个任务
            </Button>
            <div className="planner-template-links">
              <Button
                onClick={() => {
                  setPrompt("梳理一篇论文的研究框架");
                  setComposing(true);
                }}
              >
                论文阅读
              </Button>
              <Button
                onClick={() => {
                  setPrompt("设计并完成一轮实验");
                  setComposing(true);
                }}
              >
                实验推进
              </Button>
              <Button
                onClick={() => {
                  setPrompt("完成论文初稿与修订");
                  setComposing(true);
                }}
              >
                论文写作
              </Button>
            </div>
          </div>
        ) : (
          (base || dirty.current) && (
            <>
              <div className="planner-section-heading">
                <div>
                  <span className="planner-label">计划草案</span>
                  <h2>{draft.goal || "新的科研计划"}</h2>
                  <p>确认目标与分工后，再开始推进。</p>
                </div>
                <div className="planner-actions">
                  <Button disabled={busy} loading={busy} onClick={() => void save()}>
                    保存草案
                  </Button>
                  <Button
                    type="primary"
                    disabled={busy}
                    onClick={() =>
                      confirm({
                        title: `确认并创建 ${draft.proposedItems.length} 个步骤任务？`,
                        content:
                          "会保存这份草案并创建真实任务。受邀成员需要自行接受；选用公共 Agent 的步骤会建立执行请求，没有材料时等待输入。每个结果仍需要验收。",
                        okText: "确认并创建任务",
                        cancelText: "继续调整",
                        onOk: () => save(true),
                      })
                    }
                  >
                    确认并创建任务
                  </Button>
                </div>
              </div>
              {base && read.data && read.data.data.version !== base.version && (
                <Alert
                  type="warning"
                  message="其他窗口已更新这份草案。你的编辑已保留，请先读取最新版本。"
                  action={<Button onClick={reload}>读取最新草案</Button>}
                />
              )}
              <label className="planner-goal">
                计划目标
                <Input.TextArea
                  aria-label="计划目标"
                  rows={2}
                  maxLength={8000}
                  disabled={busy}
                  value={draft.goal}
                  onChange={(e) => edit({ ...draft, goal: e.target.value })}
                />
              </label>
              <ResearchTeamAccountHint />
              <ol className="planner-timeline">
                {draft.proposedItems.map((step, i) => (
                  <li key={step.id}>
                    <span
                      className={`planner-number ${expanded === i ? "active" : ""}`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div
                      className={`planner-step-editor ${
                        expanded === i ? "expanded" : ""
                      }`}
                    >
                      <div className="planner-step-heading">
                        {expanded === i ? (
                          <Input
                            className="planner-inline-title"
                            aria-label={`第${i + 1}步名称`}
                            placeholder="步骤名称"
                            value={step.title}
                            maxLength={200}
                            disabled={busy}
                            onChange={(e) => stepEdit(i, { title: e.target.value })}
                          />
                        ) : (
                          <button
                            className="planner-step-toggle"
                            aria-expanded={false}
                            onClick={() => setExpanded(i)}
                          >
                            {step.title || `第 ${i + 1} 步 · 填写步骤名称`}
                          </button>
                        )}
                        <Select
                          aria-label={`第${i + 1}步负责人`}
                          disabled={busy}
                          value={
                            step.allocation.kind === "self"
                              ? "self"
                              : step.allocation.kind === "invitation"
                              ? `member:${step.allocation.memberId}`
                              : step.allocation.kind === "public_agent"
                              ? `agent:${step.allocation.capability?.id || ""}`
                              : "claim"
                          }
                          options={[
                            { value: "self", label: "我来负责" },
                            ...(members.data?.data
                              .filter((m) => m.id !== actor?.member.id)
                              .map((m) => ({
                                value: `member:${m.id}`,
                                label: `邀请 ${m.displayName}`,
                              })) ?? []),
                            ...availableCapabilities.map((c) => ({
                              value: `agent:${c.id}`,
                              label: `Agent · ${c.name}`,
                            })),
                          ]}
                          onChange={(v) => setAllocation(i, v)}
                        />
                        <button
                          className="planner-collapse"
                          aria-label={
                            expanded === i ? `收起第${i + 1}步` : `展开第${i + 1}步`
                          }
                          onClick={() => setExpanded(expanded === i ? -1 : i)}
                        >
                          {expanded === i ? "收起" : "展开"}
                        </button>
                      </div>
                      {expanded === i ? (
                        <div className="planner-fields">
                          <label>
                            步骤目标
                            <Input.TextArea
                              aria-label={`第${i + 1}步目标`}
                              autoSize={{ minRows: 1, maxRows: 3 }}
                              value={step.goal}
                              maxLength={8000}
                              disabled={busy}
                              onChange={(e) => stepEdit(i, { goal: e.target.value })}
                            />
                          </label>
                          <label>
                            交付物
                            <Input
                              aria-label={`第${i + 1}步交付物`}
                              value={step.deliverable}
                              maxLength={8000}
                              disabled={busy}
                              onChange={(e) =>
                                stepEdit(i, { deliverable: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            验收标准
                            <Input.TextArea
                              aria-label={`第${i + 1}步验收标准`}
                              autoSize={{ minRows: 1, maxRows: 3 }}
                              value={step.acceptanceCriteria}
                              maxLength={8000}
                              disabled={busy}
                              onChange={(e) =>
                                stepEdit(i, { acceptanceCriteria: e.target.value })
                              }
                            />
                          </label>
                          <label>
                            前置步骤
                            <Select
                              aria-label={`第${i + 1}步依赖`}
                              mode="multiple"
                              disabled={busy}
                              value={step.dependencies}
                              placeholder="无前置步骤"
                              options={draft.proposedItems
                                .filter((s) => s.id !== step.id)
                                .map((s) => ({
                                  value: s.id,
                                  label: s.title || "未命名步骤",
                                }))}
                              onChange={(dependencies) => stepEdit(i, { dependencies })}
                            />
                          </label>
                          <label>
                            截止日期
                            <div className="planner-date-field">
                              <input
                                aria-label={`第${i + 1}步截止日期`}
                                type="date"
                                value={planDate(step.schedule.hardDeadline)}
                                disabled={busy}
                                onChange={(e) =>
                                  stepEdit(i, {
                                    schedule: {
                                      ...step.schedule,
                                      hardDeadline: e.target.value
                                        ? {
                                            value: {
                                              kind: "date",
                                              date: e.target.value,
                                              timezone: "Asia/Shanghai",
                                            },
                                            source: "user",
                                            confirmed: true,
                                          }
                                        : null,
                                    },
                                  })
                                }
                              />
                              <span>可选 · 北京时间</span>
                            </div>
                          </label>
                          {step.schedule.suggested && (
                            <p>
                              建议时间：{planDate(step.schedule.suggested)} ·{" "}
                              {step.schedule.suggested.confirmed
                                ? "已确认"
                                : "尚未确认"}
                            </p>
                          )}
                          {step.allocation.kind === "public_agent" && (
                            <p className="planner-permission-note">
                              使用已发布的公共能力，你负责检查交付。确认会建立执行请求；没有材料时等待输入。
                              {step.budget
                                ? `本步骤预算上限 ${step.budget.maxTokens.toLocaleString()} tokens / ${
                                    step.budget.maxSeconds
                                  } 秒。`
                                : "请在任务中核对执行预算。"}
                            </p>
                          )}
                          {step.allocation.kind === "invitation" && (
                            <p className="planner-permission-note">
                              确认后发出任务邀请；对方接受后才成为承接者。
                            </p>
                          )}
                          <div className="planner-step-tools">
                            <Button
                              size="small"
                              disabled={busy || i === 0}
                              onClick={() => {
                                const steps = [...draft.proposedItems];
                                [steps[i - 1], steps[i]] = [steps[i], steps[i - 1]];
                                edit({ ...draft, proposedItems: steps });
                                setExpanded(i - 1);
                              }}
                            >
                              上移
                            </Button>
                            <Button
                              size="small"
                              disabled={busy || i === draft.proposedItems.length - 1}
                              onClick={() => {
                                const steps = [...draft.proposedItems];
                                [steps[i + 1], steps[i]] = [steps[i], steps[i + 1]];
                                edit({ ...draft, proposedItems: steps });
                                setExpanded(i + 1);
                              }}
                            >
                              下移
                            </Button>
                            <Button
                              size="small"
                              danger
                              disabled={busy || draft.proposedItems.length < 2}
                              onClick={() =>
                                confirm({
                                  title: "删除这个步骤？",
                                  content: "其他步骤对它的依赖也会一并移除。",
                                  okText: "删除步骤",
                                  cancelText: "保留",
                                  onOk: () => {
                                    edit({
                                      ...draft,
                                      proposedItems: draft.proposedItems
                                        .filter((s) => s.id !== step.id)
                                        .map((s) => ({
                                          ...s,
                                          dependencies: s.dependencies.filter(
                                            (id) => id !== step.id,
                                          ),
                                        })),
                                    });
                                    setExpanded(0);
                                  },
                                })
                              }
                            >
                              删除
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <p className="planner-step-preview">
                          {step.dependencies.length
                            ? `依赖：${step.dependencies
                                .map(
                                  (id) =>
                                    draft.proposedItems.find((s) => s.id === id)
                                      ?.title || "未命名步骤",
                                )
                                .join("、")}`
                            : `交付物：${step.deliverable || "待填写"}`}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
              <Button
                className="planner-add-step"
                disabled={busy || draft.proposedItems.length >= 100}
                onClick={() => {
                  edit({
                    ...draft,
                    proposedItems: [...draft.proposedItems, newPlanStep()],
                  });
                  setExpanded(draft.proposedItems.length);
                }}
              >
                添加步骤
              </Button>
              <label className="planner-questions">
                待澄清的问题
                <Input.TextArea
                  aria-label="待澄清的问题"
                  rows={2}
                  maxLength={8000}
                  disabled={busy}
                  placeholder="每行一条；未知条件先列出来"
                  value={draft.unresolvedQuestions.join("\n")}
                  onChange={(e) =>
                    edit({
                      ...draft,
                      unresolvedQuestions: e.target.value
                        .split("\n")
                        .filter((line) => line.trim()),
                    })
                  }
                />
              </label>
              {(members.error || capabilities.error) && (
                <Alert
                  type="warning"
                  message="部分可选分工未能读取，已有编辑保留。请重新读取后再分配。"
                  action={
                    <Button
                      onClick={() => {
                        void members.refresh();
                        void capabilities.refresh();
                      }}
                    >
                      重试
                    </Button>
                  }
                />
              )}
            </>
          )
        )}
      </main>
      <Modal
        title="规划一项科研任务"
        open={composing}
        onCancel={() => {
          if (!busy) setComposing(false);
        }}
        footer={null}
        width={680}
        destroyOnClose
        className="planner-composer"
      >
        <p>先交代目标。交付形式和截止时间可以稍后补齐。</p>
        <p className="workspace-muted">
          AI
          规划使用你的个人默认模型；实验室管理员可沿用尚未迁移的实验室配置。可在设置的模型管理中调整。
        </p>
        <label>
          你想完成什么
          <Input.TextArea
            aria-label="科研需求"
            rows={5}
            value={prompt}
            maxLength={6500}
            disabled={busy}
            placeholder="例如：帮我和学生梳理这篇论文的方法，下周组会讨论可复现的实验方案。"
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <div className="planner-composer-extra">
          <label>
            最终交付物
            <Input
              aria-label="最终交付物"
              value={deliverable}
              maxLength={500}
              disabled={busy}
              placeholder="可选，如阅读报告、实验方案"
              onChange={(e) => setDeliverable(e.target.value)}
            />
          </label>
          <label>
            期望截止日期
            <input
              aria-label="期望截止日期"
              type="date"
              value={deadline}
              disabled={busy}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </label>
        </div>
        {failure && <Alert type="error" message={failure} />}
        <div className="planner-composer-actions">
          <Button
            type="primary"
            loading={busy}
            disabled={!prompt.trim() || busy}
            onClick={generate}
          >
            让 AI 拆成步骤
          </Button>
          <Button disabled={busy} onClick={() => useTemplate()}>
            手工规划
          </Button>
        </div>
        <div className="planner-template-section">
          <span>也可以从科研模板开始</span>
          <div>
            <Button disabled={busy} onClick={() => useTemplate("reading")}>
              论文阅读
            </Button>
            <Button disabled={busy} onClick={() => useTemplate("experiment")}>
              实验推进
            </Button>
            <Button disabled={busy} onClick={() => useTemplate("writing")}>
              论文写作
            </Button>
          </div>
          <p>模板和 AI 草案都需要按实际项目调整；确认后才创建任务。</p>
        </div>
      </Modal>
    </div>
  );
}
