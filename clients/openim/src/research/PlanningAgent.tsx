import { Alert, Button, Input, Popover, Spin } from "antd";
import {
  ArrowUpOutlined,
  ArrowLeftOutlined,
  CheckOutlined,
  HistoryOutlined,
  ExpandOutlined,
  PlusOutlined,
  RobotOutlined,
  StopOutlined,
  UpOutlined,
} from "@ant-design/icons";
import {
  agentStyleInstruction,
  type ResponseFor,
} from "@research-agent-platform/contracts";
import type { TextAreaRef } from "antd/es/input/TextArea";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { takeFeishuPlanning } from "./feishu-planning";
import { DependencyGraph } from "./DependencyGraph";
import taskDecompositionSkill from "@skills/task-decomposition/SKILL.md?raw";
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
  plannerTaskShape,
  planningPrompt,
  plannerReplyMessage,
  readPlannerHistory,
  stopPlannerRequest,
  plannerFailureText,
  canRetryPlannerReply,
  plannerRetryInput,
  isPlannerFailureReceipt,
} from "./planner-chat";
import type {
  ChatPlan,
  CreateIntent,
  PlannerHistory,
  PlannerThread,
  SendIntent,
} from "./planner-chat";
import "./planning-agent.scss";
import { prepareColleagueAgent, type ColleagueAgent } from "./agentStarterProfiles";
import { planningAgentStarter } from "./agentStarterProfiles";
import { useAgentStarterLinks } from "./useAgentStarterLinks";
import { AgentColleagueSettings } from "./AgentColleagueSettings";

type Props = {
  available: boolean;
  conversationAvailable: boolean;
  full: boolean;
  /** Hidden keeps the session and the draft alive while another view is in front. */
  hidden?: boolean;
  focus: number;
  planId?: string;
  requestId?: string;
  onExpandedChange: (expanded: boolean) => void;
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
  conversationAvailable,
  full,
  hidden,
  focus,
  planId: adoptPlan,
  requestId: adoptRequest,
  onExpandedChange,
  onCreated,
  onTeam,
  storageKey,
}: Props & { storageKey: string }) {
  const actor = useResearchStore((s) => s.actor)!;
  const navigate = useNavigate();
  const location = useLocation();
  const generation = useResearchStore((s) => s.generation);
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
  const [colleague, setColleague] = useState<ColleagueAgent>();
  const { links, remember } = useAgentStarterLinks(actor.member.id);
  const remembered = useRef(links[planningAgentStarter.id]);
  const creationKey = useRef(crypto.randomUUID());
  const input = useRef<TextAreaRef>(null),
    messages = useRef<HTMLDivElement>(null),
    locked = useRef(false);
  const latest = useRef(history);
  latest.current = history;
  const thread = history.threads.find((t) => t.id === history.active)!;
  const operation = usePersonalOperation(available, `planning-chat:${thread.id}`);
  const prepareColleague = async (isCurrent: () => boolean, create = true) => {
    const result = await prepareColleagueAgent({
      api: researchApi,
      actorId: actor.member.id,
      starter: planningAgentStarter,
      rememberedId: remembered.current,
      creationKey: creationKey.current,
      isCurrent,
      create,
    });
    if (result && isCurrent()) {
      remembered.current = result.agent.id;
      remember(planningAgentStarter.id, result.agent.id);
      setColleague(result);
    }
    return result;
  };
  useEffect(() => {
    const captured = operation.capture();
    void prepareColleague(captured.isCurrent, false).catch(() => {
      /* Sending or opening settings reports current errors. */
    });
  }, []);
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
    const nonce = (location.state as { feishuMaterialNonce?: unknown } | null)
      ?.feishuMaterialNonce;
    if (!nonce) return;
    const material = takeFeishuPlanning(nonce, actor.member.id, generation);
    navigate(location.pathname + location.search, { replace: true, state: null });
    if (!material) return;
    const next = { ...newPlannerThread(), title: "参考飞书资料规划", draft: material };
    setHistory((h) => ({ active: next.id, threads: [...h.threads.slice(-19), next] }));
    setExpanded(true);
  }, [location.state, actor.member.id, generation]);
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
    // Leaving the bar behind another view closes it, so returning starts from the list.
    if (hidden) setExpanded(false);
  }, [hidden]);
  useLayoutEffect(() => {
    onExpandedChange(expanded && !full);
    return () => onExpandedChange(false);
  }, [expanded, full, onExpandedChange]);
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
  const latestFailure =
    !!result &&
    thread.handledRequest === result.id &&
    isPlannerFailureReceipt(thread.messages.at(-1), result);
  useEffect(() => {
    if (
      !result ||
      thread.handledRequest === result.id ||
      ["queued", "running"].includes(result.status)
    )
      return;
    const generated = result.status === "draft" ? result.reply?.plan : null;
    const message = plannerReplyMessage(result);
    if (generated && thread.planId === generated.id) void plan.refresh();
    if (message)
      update((t) => ({
        ...t,
        handledRequest: result.id,
        planId: generated?.id || t.planId,
        messages: [
          ...t.messages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            ...message,
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
            text: plannerFailureText(result),
            requestId: result.id,
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
      preview = plannerPlanInput(
        current,
        current.status === "draft" ? thread.deadline : undefined,
      );
      problems = planProblems(preview);
      if (thread.deadlineQuestion)
        problems.push(
          "交付日期还没确定。可以说一个完整日期（如“2026-11-02 交付”），暂时不定就说“取消截止”。",
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
  const submit = async (intent: SendIntent, isCurrent: () => boolean) => {
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
  };
  const dispatch = (intent: SendIntent) =>
    void run((isCurrent) => submit(intent, isCurrent));
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
            text:
              created.taskIds.length === 1
                ? `已创建任务“${created.plan.proposedItems[0].title}”。执行步骤、交付与验收要求保存在这项任务里。`
                : `已按确认的方案建立 ${created.taskIds.length} 项任务。后续交付与验收记录在各项任务中。`,
          },
        ],
      }));
      await plan.refresh();
      if (isCurrent()) onCreated();
    });
  };
  const send = (retrying = false) => {
    const retry =
      retrying && result && canRetryPlannerReply(result)
        ? plannerRetryInput(thread.messages)
        : undefined;
    if (retrying && !retry) return;
    const text = retry ? retry.text : thread.draft.trim();
    if (!text || busy || frozen || !available) return;
    if (thread.messages.length >= 56) {
      setFailure("这段对话已较长，请新建对话继续；原有方案仍保留。");
      return;
    }
    if (agentStyleInstruction(text)) {
      void run(async (isCurrent) => {
        const mate = await prepareColleague(isCurrent);
        if (!mate || !isCurrent()) return;
        const receipt = (
          await researchApi("agentChatMessage", {
            params: { id: mate.conversationId },
            body: { text },
            idempotencyKey: crypto.randomUUID(),
          })
        ).data;
        if (!isCurrent()) return;
        if (receipt.turn?.status !== "succeeded" || !receipt.turn.outputMessageId)
          throw new Error(
            "交流偏好暂未确认，请在助手设置的私人记忆里核对，原话已保留。",
          );
        const page = await researchApi("chatMessages", {
          params: { id: mate.conversationId },
          query: { afterSequence: receipt.message.sequence, limit: 20 },
        });
        if (!isCurrent()) return;
        const reply = page.data.find(
          (message) =>
            message.id === receipt.turn!.outputMessageId &&
            message.origin === "service",
        );
        if (!reply?.text)
          throw new Error("偏好保存回执暂未读到，请在私人记忆里核对，原话已保留。");
        update((t) => ({
          ...t,
          draft: t.draft.trim() === text ? "" : t.draft,
          messages: [
            ...t.messages,
            { id: receipt.message.id, role: "user", text },
            { id: reply.id, role: "service", text: reply.text! },
          ],
        }));
        setExpanded(true);
      });
      return;
    }
    if (isPlannerCreateCommand(text)) {
      if (!current || current.status !== "draft" || problems.length || processing) {
        setFailure(
          processing
            ? "这轮还在回复，稍等方案出来就能创建。"
            : problems[0] || "我们还在讨论思路，等有具体步骤后就能创建任务。",
        );
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
    if (!conversationAvailable) {
      setFailure(
        "后台还未支持这位助手的连续聊天回复。请先升级后台，当前消息、已有方案和任务都保留。",
      );
      return;
    }
    const statedDeadline = plannerDeadline(text);
    const deadline = statedDeadline || thread.deadline;
    const deadlineQuestion = statedDeadline
      ? false
      : needsDeadlineClarification(text) || !!thread.deadlineQuestion;
    const taskShape = plannerTaskShape(text);
    void run(async (isCurrent) => {
      const context = planningPrompt(
        retry ? retry.messages : thread.messages,
        text,
        members.data?.data || [],
        deadline,
        taskDecompositionSkill,
        taskShape,
      );
      const mate = await prepareColleague(isCurrent);
      if (!mate || !isCurrent()) return;
      setOmitted(context.omitted);
      const intent: SendIntent = {
        key: crypto.randomUUID(),
        body: {
          labId: actor.member.labId,
          colleague: { contactId: mate.agent.id, conversationId: mate.conversationId },
          replyMode: "conversation",
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
        draft: retry || t.draft.trim() !== text ? t.draft : "",
        sending: intent,
        deadline,
        deadlineQuestion,
        messages: retry
          ? t.messages.slice(0, -1)
          : [...t.messages, { id: crypto.randomUUID(), role: "user", text }],
      }));
      setExpanded(true);
      await submit(intent, isCurrent);
    });
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
      } ${hidden ? "is-hidden" : ""}`}
      aria-label="任务规划 Agent"
      aria-hidden={hidden || undefined}
    >
      <header className="planning-agent-heading">
        <div>
          <RobotOutlined />
          <strong>
            {colleague?.agent.displayName || planningAgentStarter.profile.displayName}
          </strong>
          {inProgress && <span role="status">正在回复…</span>}
        </div>
        <nav>
          <AgentColleagueSettings
            contactId={colleague?.agent.id}
            prepare={async (isCurrent) => (await prepareColleague(isCurrent))?.agent}
            onChanged={() => {
              const captured = operation.capture();
              void prepareColleague(captured.isCurrent, false).catch(() => {});
            }}
          />
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
              type="default"
              className="planning-agent-toggle"
              icon={expanded ? <ArrowLeftOutlined /> : <UpOutlined />}
              aria-label={expanded ? "返回工作台" : "展开规划对话"}
              aria-expanded={expanded}
              title={expanded ? "收起对话，返回工作台" : "展开对话"}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "返回工作台" : "展开对话"}
            </Button>
          )}
        </nav>
      </header>
      {(expanded || full) && (
        <div className="planning-agent-messages" ref={messages} aria-live="polite">
          {!thread.messages.length && !thread.planId && !thread.requestId && (
            <div className="planning-agent-welcome">
              <h2>说说你要安排的任务</h2>
              <p>说一件要做的事，我会整理成一项任务，执行步骤放在任务里。</p>
              <div>
                {[
                  "完善我现有的论文和实验，安排成一项任务",
                  "准备一份下次组会要讨论的研究报告",
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
                  ? colleague?.agent.displayName ||
                    planningAgentStarter.profile.displayName
                  : "系统提示"}
              </span>
              <SafeMessageMarkdown
                text={
                  index === thread.messages.length - 1 && latestFailure && result
                    ? plannerFailureText(result)
                    : message.text
                }
              />
              {index === thread.messages.length - 1 &&
                latestFailure &&
                result &&
                !thread.taskIds?.length &&
                canRetryPlannerReply(result) &&
                plannerRetryInput(thread.messages) && (
                  <Button
                    size="small"
                    loading={busy}
                    disabled={frozen || !available}
                    onClick={() => send(true)}
                  >
                    重试这条
                  </Button>
                )}
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
                  {current.status === "confirmed" ? "已建立任务的计划" : "待创建的任务"}
                </span>
                <strong>{current.goal}</strong>
                <small>
                  版本 {current.version}
                  {current.status === "draft"
                    ? " · 还可继续用对话调整"
                    : " · 任务已保存到工作台"}
                </small>
              </header>
              {preview.proposedItems.length > 1 && (
                <DependencyGraph
                  items={preview.proposedItems.map((step) => ({
                    id: step.id,
                    title: step.title,
                    dependencies: step.dependencies,
                    needsClaim: step.allocation.kind === "claim",
                  }))}
                />
              )}
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
                    {preview!.proposedItems.length > 1 && (
                      <p>交付：{step.deliverable}</p>
                    )}
                    <details className="planning-step-details">
                      <summary>查看任务说明与完成要求</summary>
                      <SafeMessageMarkdown text={step.goal} />
                      <p>交付要求：</p>
                      <SafeMessageMarkdown text={step.deliverable} />
                      <p>验收标准：</p>
                      <SafeMessageMarkdown text={step.acceptanceCriteria} />
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
                <p>我们可以先把思路聊清楚，再决定怎样安排。</p>
              )}
              {!!preview.unresolvedQuestions.length && (
                <details>
                  <summary>方案中暂未确定的信息</summary>
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
                    {preview.proposedItems.length === 1
                      ? "创建这项任务"
                      : `创建这 ${preview.proposedItems.length} 项任务`}
                  </Button>
                </footer>
              )}
              {!!problems.length && (
                <div className="planning-agent-note">
                  <p>{problems[0]}</p>
                  {problems.length > 1 && (
                    <details>
                      <summary>其余 {problems.length - 1} 项待核对内容</summary>
                      {problems.slice(1).map((problem, index) => (
                        <p key={index}>{problem}</p>
                      ))}
                    </details>
                  )}
                </div>
              )}
              {current.status === "confirmed" && (
                <div className="planning-created-actions">
                  <CheckOutlined />
                  <span>
                    已建立 {taskIds.length || preview.proposedItems.length} 项任务
                  </span>
                  <Button
                    onClick={() => {
                      setExpanded(false);
                      onTeam();
                    }}
                  >
                    查看课题组任务
                  </Button>
                  {taskIds.map((id, i) => (
                    <Button
                      key={id}
                      type="link"
                      onClick={() => {
                        setExpanded(false);
                        navigate(workbenchTaskPath(id, "research"));
                      }}
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
            <Alert
              type="warning"
              message={problems[0]}
              description={
                problems.length > 1 ? (
                  <details>
                    <summary>查看其他待核对内容</summary>
                    {problems.slice(1).map((problem, index) => (
                      <p key={index}>{problem}</p>
                    ))}
                  </details>
                ) : undefined
              }
            />
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
      {!conversationAvailable && (
        <p className="planning-agent-note">
          后台升级后，这位助手可以正常接着聊，再按需要更新方案。已有方案与任务仍可查看。
        </p>
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
          placeholder="说说你要做的任务，或接着修改任务安排…"
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
          <Button
            type="primary"
            shape="circle"
            aria-label="发送规划消息"
            icon={inProgress ? <StopOutlined /> : <ArrowUpOutlined />}
            disabled={
              !available || busy || (!inProgress && (!thread.draft.trim() || frozen))
            }
            onClick={inProgress ? stop : () => send()}
          />
        </div>
      </div>
      {!available && (
        <p className="planning-agent-note">连接恢复后可继续发送，填写内容会保留。</p>
      )}
    </section>
  );
}
