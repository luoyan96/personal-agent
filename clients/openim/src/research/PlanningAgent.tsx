import { Alert, Button, Input, Popover, Spin } from "antd";
import {
  ArrowUpOutlined,
  CheckOutlined,
  DownOutlined,
  HistoryOutlined,
  ExpandOutlined,
  PlusOutlined,
  RobotOutlined,
  StopOutlined,
  UpOutlined,
} from "@ant-design/icons";
import type { ResponseFor } from "@research-agent-platform/contracts";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { researchApi, ResearchApiError } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { planDate, planProblems, requestStateLabels } from "./task-planning";
import { workbenchTaskPath } from "./workbench-links";
import {
  createPlannerTasks,
  isPlannerCreateCommand,
  newPlannerThread,
  needsDeadlineClarification,
  plannerCacheKey,
  plannerDeadline,
  plannerPlanInput,
  planningPrompt,
  planReplyText,
  readPlannerHistory,
  stopPlannerRequest,
} from "./planner-chat";
import type {
  ChatPlan,
  CreateIntent,
  PlannerHistory,
  PlannerThread,
  SendIntent,
} from "./planner-chat";
import "./planning-agent.scss";

type Props = {
  available: boolean;
  full: boolean;
  focus: number;
  planId?: string;
  requestId?: string;
  onCreated: () => void;
  onTeam: () => void;
};
export function PlanningAgent(props: Props) {
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const [service, setService] = useState<{ generation: number; address: string }>();
  useEffect(() => {
    let current = true;
    void (async () => {
      const status = await window.electronAPI?.getResearchServiceStatus();
      const url = new URL(status?.address || window.location.origin);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("服务地址不可用");
      if (current)
        setService({
          generation,
          address: url.origin + url.pathname.replace(/\/$/, ""),
        });
    })().catch(() => {
      if (current) setService({ generation, address: window.location.origin });
    });
    return () => {
      current = false;
    };
  }, [generation]);
  if (!actor || !service || service.generation !== generation) return null;
  const scope = plannerCacheKey(service.address, actor.member.id, actor.member.labId);
  return (
    <PlanningAgentSession
      key={`${generation}:${scope}`}
      {...props}
      storageKey={scope}
    />
  );
}
function PlanningAgentSession({
  available,
  full,
  focus,
  planId: adoptPlan,
  requestId: adoptRequest,
  onCreated,
  onTeam,
  storageKey,
}: Props & { storageKey: string }) {
  const actor = useResearchStore((s) => s.actor)!;
  const navigate = useNavigate();
  const [history, setHistory] = useState<PlannerHistory>(() => {
    let value: PlannerHistory | undefined;
    try {
      value = readPlannerHistory(localStorage.getItem(storageKey));
    } catch {
      /* Preserve an in-memory conversation if local storage is unavailable. */
    }
    const thread = newPlannerThread();
    return value || { active: thread.id, threads: [thread] };
  });
  const [failure, setFailure] = useState("");
  const [storageFailure, setStorageFailure] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [omitted, setOmitted] = useState(0);
  const input = useRef<TextAreaRef>(null),
    messages = useRef<HTMLDivElement>(null),
    locked = useRef(false);
  const latest = useRef(history);
  latest.current = history;
  const thread = history.threads.find((t) => t.id === history.active)!;
  const operation = usePersonalOperation(available, `planning-chat:${thread.id}`);
  const update = (change: (value: PlannerThread) => PlannerThread) =>
    setHistory((h) => ({
      ...h,
      threads: h.threads.map((t) =>
        t.id === thread.id ? { ...change(t), updatedAt: new Date().toISOString() } : t,
      ),
    }));
  const persist = (value: PlannerHistory) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      setStorageFailure(true);
    }
  };
  useEffect(() => {
    const timer = setTimeout(() => persist(history), 200);
    return () => clearTimeout(timer);
  }, [history]);
  useEffect(
    () => () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(latest.current));
      } catch {
        /* The visible storage warning already explains this boundary. */
      }
    },
    [storageKey],
  );
  useLayoutEffect(() => {
    locked.current = false;
    setBusy(false);
    setFailure("");
    setOmitted(0);
  }, [operation.scope]);
  useEffect(() => {
    if (focus) {
      setExpanded(true);
      input.current?.focus();
    }
  }, [focus]);
  useEffect(() => {
    if (full) setExpanded(true);
  }, [full]);
  useEffect(() => {
    messages.current?.scrollTo({
      top: messages.current.scrollHeight,
      behavior: "smooth",
    });
  }, [thread.messages.length, expanded, thread.requestId]);
  const adopt = (id?: string, requestId?: string) => {
    if (!id && !requestId) return;
    if (
      (id && !/^[A-Za-z0-9_-]{1,96}$/.test(id)) ||
      (requestId && !/^[A-Za-z0-9_-]{1,96}$/.test(requestId))
    ) {
      setFailure("规划链接无效，请从计划记录重新选择。");
      return;
    }
    setHistory((h) => {
      const found = h.threads.find((t) =>
        id ? t.planId === id : t.requestId === requestId,
      );
      if (found) return { ...h, active: found.id };
      if (h.threads.length >= 20) {
        setFailure("本机规划对话已达20个，已有计划仍可在研究计划中查看。");
        return h;
      }
      const next = {
        ...newPlannerThread(),
        planId: id,
        requestId,
        messages: [
          {
            id: crypto.randomUUID(),
            role: "service" as const,
            text: id
              ? "已接入这个服务端计划，可以继续查看或用对话调整未确认的方案。"
              : "正在读取这次 AI 规划的实际状态。",
          },
        ],
      };
      return { active: next.id, threads: [next, ...h.threads] };
    });
    setExpanded(true);
  };
  useEffect(() => {
    adopt(adoptPlan, adoptRequest);
  }, [adoptPlan, adoptRequest]);
  const request = useResearchRead(
    (signal) =>
      researchApi("getPlanRequest", { params: { id: thread.requestId! }, signal }),
    `planner-chat-request:${thread.id}:${thread.requestId}`,
    available && !!thread.requestId,
  );
  const plan = useResearchRead(
    (signal) => researchApi("getPlan", { params: { id: thread.planId! }, signal }),
    `planner-chat-plan:${thread.id}:${thread.planId}`,
    available && !!thread.planId,
  );
  const members = useResearchRead(
    (signal) =>
      researchApi("members", {
        params: { id: actor.member.labId },
        query: { limit: 100 },
        signal,
      }),
    `planner-chat-members:${actor.member.labId}`,
    available,
  );
  const linked = useResearchRead(
    (signal) => researchApi("planTasks", { params: { id: thread.planId! }, signal }),
    `planner-chat-links:${thread.id}:${thread.planId}`,
    available && plan.data?.data.status === "confirmed",
  );
  const people = Object.fromEntries(
    (members.data?.data || []).map((m) => [m.id, m.displayName]),
  );
  people[actor.member.id] = actor.member.displayName;
  const processing =
    !!thread.requestId &&
    (!request.data ||
      ["queued", "running", "waiting_input", "interrupted"].includes(
        request.data.data.status,
      ));
  const inProgress =
    !!thread.requestId &&
    !!request.data &&
    ["queued", "running"].includes(request.data.data.status);
  const result = request.data?.data;
  useEffect(() => {
    if (
      !result ||
      thread.handledRequest === result.id ||
      ["queued", "running"].includes(result.status)
    )
      return;
    const generated = result.status === "draft" ? result.reply?.plan : null;
    if (generated && thread.planId === generated.id) void plan.refresh();
    if (generated)
      update((t) => ({
        ...t,
        handledRequest: result.id,
        planId: generated.id,
        messages: [
          ...t.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            text: planReplyText(generated),
            plan: { id: generated.id, version: generated.version },
          },
        ],
      }));
    else if (
      result.status === "failed" ||
      result.status === "cancelled" ||
      result.status === "interrupted" ||
      result.status === "waiting_input"
    )
      update((t) => ({
        ...t,
        handledRequest: result.id,
        messages: [
          ...t.messages,
          {
            id: crypto.randomUUID(),
            role: "service",
            text:
              result.status === "cancelled"
                ? "这次生成已停止。已有方案保留，您可以继续补充。"
                : result.failure === "MODEL_UNAVAILABLE"
                ? "规划模型暂不可用，请在“我的 → 模型设置”配置默认模型后重新发送。没有创建正式任务。"
                : result.failure === "BUDGET_EXCEEDED"
                ? "这次规划超出预算，请缩小需求后再发送。已有方案没有确认成任务。"
                : `这次规划${
                    result.status === "waiting_input"
                      ? "需要补充信息"
                      : result.status === "interrupted"
                      ? "已中断"
                      : "未能完成"
                  }。您可以继续说明后重新规划，已有任务没有因此改变。`,
          },
        ],
      }));
  }, [result?.id, result?.version, result?.status, thread.handledRequest]);
  const current = plan.data?.data;
  useEffect(() => {
    messages.current?.scrollTo({
      top: messages.current.scrollHeight,
      behavior: "smooth",
    });
  }, [current?.id, current?.version]);
  const newerReply =
    result?.status === "draft" &&
    result.reply?.plan?.id === current?.id &&
    (result.reply?.plan?.version || 0) > (current?.version || 0);
  let preview: ReturnType<typeof plannerPlanInput> | undefined,
    problems: string[] = [];
  if (current) {
    try {
      preview = plannerPlanInput(current, thread.deadline);
      problems = planProblems(preview);
      if (thread.deadlineQuestion)
        problems.push(
          "这轮时间安排还需要明确。请用完整日期说明最终交付时间（如“2026-10-23 交付”），或说“取消截止”。",
        );
    } catch (e) {
      problems = [e instanceof Error ? e.message : "方案暂不可确认"];
    }
  }
  const frozen =
    !!thread.sending ||
    !!thread.creating ||
    inProgress ||
    newerReply ||
    (!!thread.requestId && !request.data && !thread.handledRequest);
  const run = async (action: (isCurrent: () => boolean) => Promise<void>) => {
    if (locked.current || !available) return;
    const captured = operation.capture();
    locked.current = true;
    setBusy(true);
    setFailure("");
    try {
      await action(captured.isCurrent);
    } catch (e) {
      if (captured.isCurrent())
        setFailure(e instanceof Error ? e.message : "操作未能确认，请重试核对。");
    } finally {
      if (captured.isCurrent()) {
        locked.current = false;
        setBusy(false);
      }
    }
  };
  const dispatch = (intent: SendIntent) =>
    void run(async (isCurrent) => {
      let response: ResponseFor<"planRequest">;
      try {
        if (intent.body.labId !== actor.member.labId)
          throw new Error("原消息不属于当前空间，请新建规划对话。");
        response = await researchApi("planRequest", {
          body: intent.body,
          idempotencyKey: intent.key,
        });
      } catch (error) {
        if (
          isCurrent() &&
          error instanceof ResearchApiError &&
          ([400, 403, 404, 409, 422].includes(error.status) ||
            ["VALIDATION_ERROR", "MODEL_UNAVAILABLE"].includes(error.code))
        ) {
          update((t) => ({
            ...t,
            sending: undefined,
            draft:
              t.draft || t.messages.filter((m) => m.role === "user").at(-1)?.text || "",
            messages: [
              ...t.messages,
              {
                id: crypto.randomUUID(),
                role: "service",
                text: "这条消息未能提交，原文仍在对话中。核对最新方案或调整需求后可以重新发送。",
              },
            ],
          }));
          void plan.refresh();
        }
        throw error;
      }
      if (!isCurrent()) return;
      update((t) => ({
        ...t,
        sending: undefined,
        requestId: response.data.id,
        handledRequest: undefined,
      }));
      setExpanded(true);
    });
  const confirm = (intent?: CreateIntent) => {
    if (
      !intent &&
      (!current ||
        current.status !== "draft" ||
        !!thread.taskIds?.length ||
        problems.length ||
        processing ||
        thread.sending)
    )
      return;
    const chosen = intent || {
      key: crypto.randomUUID(),
      plan: current!,
      deadline: thread.deadline,
    };
    if (!intent) update((t) => ({ ...t, creating: chosen }));
    void run(async (isCurrent) => {
      const created = await createPlannerTasks(researchApi, chosen, isCurrent);
      if (!isCurrent()) return;
      update((t) => ({
        ...t,
        creating: undefined,
        deadline: undefined,
        taskIds: created.taskIds,
        messages: [
          ...t.messages,
          {
            id: crypto.randomUUID(),
            role: "service",
            text: `这份计划已建立 ${created.taskIds.length} 项任务。成员邀请等待本人接受，后续交付与验收记录在任务中。`,
          },
        ],
      }));
      await plan.refresh();
      if (isCurrent()) onCreated();
    });
  };
  const send = () => {
    const text = thread.draft.trim();
    if (!text || busy || frozen || !available) return;
    if (thread.messages.length >= 56) {
      setFailure("这段对话已较长，请新建对话继续；原有方案仍保留。");
      return;
    }
    if (isPlannerCreateCommand(text)) {
      if (!current || current.status !== "draft" || problems.length || processing) {
        setFailure("请先等当前方案生成并补齐必要信息，再说“确认创建任务”。");
        return;
      }
      update((t) => ({
        ...t,
        draft: "",
        messages: [...t.messages, { id: crypto.randomUUID(), role: "user", text }],
      }));
      confirm();
      return;
    }
    if (current?.status === "confirmed" || thread.taskIds?.length) {
      setFailure(
        "这份计划的任务已建立。可打开任务跟进或修改；另一个研究目标请新建规划对话。",
      );
      return;
    }
    if (thread.planId && !current) {
      setFailure("当前方案还没有核对成功，请先重新读取，避免覆盖未查看的方案。");
      return;
    }
    const statedDeadline = plannerDeadline(text);
    const deadline = statedDeadline || thread.deadline;
    const deadlineQuestion = statedDeadline
      ? false
      : needsDeadlineClarification(text) || !!thread.deadlineQuestion;
    try {
      const context = planningPrompt(
        thread.messages,
        text,
        members.data?.data || [],
        deadline,
      );
      setOmitted(context.omitted);
      const intent: SendIntent = {
        key: crypto.randomUUID(),
        body: {
          labId: actor.member.labId,
          prompt: context.prompt,
          intent: "draft",
          plan: current ? { id: current.id, version: current.version } : null,
          taskIds: [],
          inputArtifactIds: [],
          conclusionRefs: [],
          budget: { maxTokens: 100000, maxSeconds: 120 },
        },
      };
      update((t) => ({
        ...t,
        title: t.messages.some((m) => m.role === "user") ? t.title : text.slice(0, 38),
        draft: "",
        sending: intent,
        deadline,
        deadlineQuestion,
        messages: [...t.messages, { id: crypto.randomUUID(), role: "user", text }],
      }));
      setExpanded(true);
      dispatch(intent);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "需求未能发送，内容已保留。");
    }
  };
  const reviewLatest = () => {
    update((t) => ({ ...t, creating: undefined }));
    void plan.refresh();
  };
  const stop = () => {
    if (
      !result ||
      !["queued", "running", "waiting_input", "interrupted"].includes(result.status)
    )
      return;
    void run(async (isCurrent) => {
      await stopPlannerRequest(researchApi, result.id, isCurrent);
      if (isCurrent()) await request.refresh();
    });
  };
  const newChat = () => {
    if (history.threads.length >= 20) {
      setFailure("本机规划对话已达20个，已有计划仍保留在研究计划中。");
      return;
    }
    const next = newPlannerThread();
    setHistory((h) => ({ active: next.id, threads: [next, ...h.threads] }));
    setExpanded(true);
    input.current?.focus();
  };
  const taskIds =
    thread.taskIds ||
    linked.data?.data.steps.flatMap((s) => (s.taskId ? [s.taskId] : [])) ||
    [];
  return (
    <section
      className={`planning-agent ${expanded || full ? "is-expanded" : ""} ${
        full ? "is-full" : ""
      }`}
      aria-label="任务规划 Agent"
    >
      <header className="planning-agent-heading">
        <div>
          <RobotOutlined />
          <strong>任务规划 Agent</strong>
          <span>{inProgress ? "正在整理方案…" : "说说目标，一起把任务安排好"}</span>
        </div>
        <nav>
          <Popover
            trigger="click"
            placement="topRight"
            content={
              <div className="planning-chat-history">
                <p>本机规划对话</p>
                {history.threads.map((t) => (
                  <button
                    key={t.id}
                    aria-pressed={t.id === thread.id}
                    onClick={() => {
                      setHistory((h) => ({ ...h, active: t.id }));
                      setExpanded(true);
                    }}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
            }
          >
            <Button type="text" icon={<HistoryOutlined />} aria-label="规划对话记录" />
          </Popover>
          <Button type="text" icon={<PlusOutlined />} onClick={newChat}>
            新对话
          </Button>
          {!full && expanded && (
            <Button
              type="text"
              icon={<ExpandOutlined />}
              aria-label="专注任务规划"
              onClick={() => navigate("/workbench?view=planning")}
            />
          )}
          {!full && (
            <Button
              type="text"
              icon={expanded ? <DownOutlined /> : <UpOutlined />}
              aria-label={expanded ? "收起规划对话" : "展开规划对话"}
              onClick={() => setExpanded((v) => !v)}
            />
          )}
        </nav>
      </header>
      {(expanded || full) && (
        <div className="planning-agent-messages" ref={messages} aria-live="polite">
          {!thread.messages.length && !thread.planId && !thread.requestId && (
            <div className="planning-agent-welcome">
              <h2>直接说说，您想安排什么？</h2>
              <p>
                可以先说一个想法，也可以直接交代目标、人员和时间。我会整理任务方案，再和您一起调整。
              </p>
              <div>
                {[
                  "帮我安排这周的文献阅读，周五交付一份对比报告",
                  "把一个实验目标拆成可分工、可验收的任务",
                ].map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      update((t) => ({ ...t, draft: s }));
                      input.current?.focus();
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {thread.messages.map((message, index) => (
            <div
              key={message.id}
              className={`planning-chat-message role-${message.role}`}
            >
              <span>
                {message.role === "user"
                  ? "我"
                  : message.role === "assistant"
                  ? "任务规划 Agent"
                  : "安排记录"}
              </span>
              <SafeMessageMarkdown text={message.text} />
              {message.plan && index < thread.messages.length - 1 && (
                <small>
                  方案版本 {message.plan.version} · 当前方案以下方实际读取为准
                </small>
              )}
            </div>
          ))}
          {request.error && (
            <Alert
              type="warning"
              message={request.error}
              action={<Button onClick={request.refresh}>重读生成状态</Button>}
            />
          )}
          {inProgress && (
            <div className="planning-agent-thinking" role="status">
              <Spin size="small" />
              <span>
                {requestStateLabels[result!.status]}，正在结合前面的信息整理任务…
              </span>
              <Button size="small" onClick={stop} loading={busy}>
                停止生成
              </Button>
            </div>
          )}
          {plan.error && (
            <Alert
              type="warning"
              message={plan.error}
              action={<Button onClick={plan.refresh}>重新读取方案</Button>}
            />
          )}
          {thread.planId && !current && !plan.error && (
            <p role="status">正在读取当前方案…</p>
          )}
          {current && preview && !!preview.proposedItems.length && (
            <article className="planning-chat-plan" aria-label="当前任务方案">
              <header>
                <span>
                  {current.status === "confirmed" ? "已建立任务的计划" : "当前任务方案"}
                </span>
                <strong>{current.goal}</strong>
                <small>
                  版本 {current.version}
                  {current.status === "draft"
                    ? " · 还可继续用对话调整"
                    : " · 任务已保存到工作台"}
                </small>
              </header>
              <ol>
                {preview.proposedItems.map((step, index) => (
                  <li key={step.id}>
                    <div>
                      <b>{index + 1}</b>
                      <strong>{step.title}</strong>
                      <span>
                        {step.allocation.kind === "self"
                          ? "我来负责"
                          : step.allocation.kind === "invitation"
                          ? `邀请 ${
                              people[step.allocation.memberId] ||
                              step.allocation.memberId
                            }`
                          : step.allocation.kind === "claim"
                          ? "课题组成员认领"
                          : "公共 Agent 安排"}
                      </span>
                    </div>
                    <p>交付：{step.deliverable}</p>
                    <details className="planning-step-details">
                      <summary>验收与依赖</summary>
                      <p>验收：{step.acceptanceCriteria}</p>
                      {step.dependencies.length > 0 && (
                        <small>
                          前置：
                          {step.dependencies
                            .map(
                              (id) =>
                                preview!.proposedItems.find((s) => s.id === id)
                                  ?.title || "待核对步骤",
                            )
                            .join("、")}
                        </small>
                      )}
                    </details>
                    {step.schedule.hardDeadline && (
                      <small>
                        截止：{planDate(step.schedule.hardDeadline)} ·{" "}
                        {step.schedule.hardDeadline.value.kind === "date"
                          ? step.schedule.hardDeadline.value.timezone
                          : "北京时间"}
                      </small>
                    )}
                  </li>
                ))}
              </ol>
              {!preview.proposedItems.length && (
                <p>目标还需要补充。请直接回复上面的具体问题，再整理任务。</p>
              )}
              {!!preview.unresolvedQuestions.length && (
                <details>
                  <summary>还有 {preview.unresolvedQuestions.length} 项待明确</summary>
                  {preview.unresolvedQuestions.map((q, i) => (
                    <p key={i}>{q}</p>
                  ))}
                </details>
              )}
              {current.status === "draft" && !thread.taskIds?.length && (
                <footer>
                  <span>核对后可回复“确认创建任务”，或继续说修改意见。</span>
                  <Button
                    type="primary"
                    disabled={
                      !available ||
                      busy ||
                      frozen ||
                      processing ||
                      plan.loading ||
                      !!problems.length
                    }
                    onClick={() => confirm()}
                  >
                    创建这 {preview.proposedItems.length} 项任务
                  </Button>
                </footer>
              )}
              {!!problems.length && (
                <p className="planning-agent-note">{problems.join(" ")}</p>
              )}
              {current.status === "confirmed" && (
                <div className="planning-created-actions">
                  <CheckOutlined />
                  <span>
                    已建立 {taskIds.length || preview.proposedItems.length} 项任务
                  </span>
                  <Button onClick={onTeam}>查看课题组任务</Button>
                  {taskIds.map((id, i) => (
                    <Button
                      key={id}
                      type="link"
                      onClick={() => navigate(workbenchTaskPath(id, "research"))}
                    >
                      任务 {i + 1}
                    </Button>
                  ))}
                  {linked.error && (
                    <p>
                      {linked.error}
                      <Button onClick={linked.refresh}>重新核对任务链接</Button>
                    </p>
                  )}
                </div>
              )}
            </article>
          )}
          {current && !preview && !!problems.length && (
            <Alert type="warning" message={problems.join(" ")} />
          )}
          {thread.sending && !busy && (
            <Alert
              type="warning"
              message="本条消息的发送结果尚未确认。重试将核对原来的发送，不会另起一份方案。"
              action={
                <Button onClick={() => dispatch(thread.sending!)}>核对原消息</Button>
              }
            />
          )}
          {thread.creating && !busy && (
            <Alert
              type="warning"
              message="创建结果尚未确认。请先核对原操作，避免重复安排。"
              action={
                <div>
                  <Button onClick={() => confirm(thread.creating)}>核对创建结果</Button>
                  <Button type="link" onClick={reviewLatest}>
                    读取最新方案
                  </Button>
                </div>
              }
            />
          )}
          {!!omitted && (
            <p className="planning-agent-note">
              这轮使用当前方案和最近的对话；更早的 {omitted} 条消息仍保留在本机记录中。
            </p>
          )}
        </div>
      )}
      {failure && (
        <Alert
          type="warning"
          closable
          onClose={() => setFailure("")}
          message={failure}
        />
      )}
      {members.error && (
        <p className="planning-agent-note">
          {members.error}
          <Button type="link" onClick={members.refresh}>
            重读成员
          </Button>
        </p>
      )}
      {storageFailure && (
        <p className="planning-agent-note">
          本机对话记录未能保存，当前对话仍可继续；服务端计划可在研究计划中找回。
        </p>
      )}
      <div className="planning-agent-composer">
        <Input.TextArea
          ref={input}
          aria-label="与任务规划 Agent 对话"
          placeholder="告诉我想完成什么，也可以接着说怎么调整…"
          value={thread.draft}
          maxLength={4000}
          autoSize={{ minRows: 1, maxRows: 4 }}
          disabled={!available}
          onChange={(e) => update((t) => ({ ...t, draft: e.target.value }))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div>
          <Popover content="使用您的个人默认模型。对话记录保存在本机；方案与任务保存在当前服务。未确认前不会给成员发出任务邀请。">
            <span>Enter 发送 · Shift+Enter 换行</span>
          </Popover>
          <Button type="text" onClick={() => navigate("/me?view=models")}>
            模型设置
          </Button>
          <Button
            type="primary"
            shape="circle"
            aria-label="发送规划消息"
            icon={inProgress ? <StopOutlined /> : <ArrowUpOutlined />}
            disabled={
              !available || busy || (!inProgress && (!thread.draft.trim() || frozen))
            }
            onClick={inProgress ? stop : send}
          />
        </div>
      </div>
      {!available && (
        <p className="planning-agent-note">连接恢复后可继续发送，填写内容会保留。</p>
      )}
    </section>
  );
}
