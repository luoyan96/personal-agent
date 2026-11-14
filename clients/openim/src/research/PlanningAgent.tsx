import { Alert, Button, Input, Modal, Popover, Select, Spin } from "antd";
import {
  ArrowUpOutlined,
  ArrowLeftOutlined,
  CheckOutlined,
  HistoryOutlined,
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
import { PlanningDiscussion } from "./PlanningDiscussion";
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
  isDiscussionPlan,
  planQuestionText,
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
  /** Hidden keeps the session and the draft alive while another view is in front. */
  hidden?: boolean;
  view?: string;
  focus: number;
  /** Bumped by "新建任务": open a clean thread instead of the last one. */
  fresh?: number;
  /** A work template hands over a prepared message instead of retyping it. */
  draft?: string;
  submitDraft?: boolean;
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
  hidden,
  view,
  focus,
  fresh,
  draft,
  submitDraft,
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
  const previousView = useRef(view);
  useEffect(() => {
    if (previousView.current !== view) {
      previousView.current = view;
      setExpanded(false);
    }
  }, [view]);
  const [editing, setEditing] = useState<{
    plan: ChatPlan;
    stepId: string;
    title: string;
    deliverable: string;
    owner: string;
    date: string;
    dateChanged: boolean;
  }>();
  const [busy, setBusy] = useState(false);
  const [omitted, setOmitted] = useState(0);
  const [colleague, setColleague] = useState<ColleagueAgent>();
  const { links, remember } = useAgentStarterLinks(actor.member.id);
  const remembered = useRef(links[planningAgentStarter.id]);
  const creationKey = useRef(crypto.randomUUID());
  const input = useRef<TextAreaRef>(null),
    messages = useRef<HTMLDivElement>(null),
    locked = useRef(false);
  const appliedDraft = useRef<string>();
  const draftToSend = useRef<string>();
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
    setEditing(undefined);
  }, [operation.scope]);
  useEffect(() => {
    if (focus) {
      setExpanded(true);
      input.current?.focus();
    }
  }, [focus]);
  useEffect(() => {
    const text = draft?.trim();
    if (!text) {
      appliedDraft.current = undefined;
      return;
    }
    if (appliedDraft.current === text) return;
    appliedDraft.current = text;
    if (submitDraft) draftToSend.current = text;
    setExpanded(true);
    setHistory((h) => {
      const active = h.threads.find((t) => t.id === h.active);
      // An untouched thread takes the text; anything already said gets a new one.
      if (active && !active.messages.length && !active.planId && !active.requestId)
        return {
          ...h,
          threads: h.threads.map((t) =>
            t.id === h.active ? { ...t, draft: text } : t,
          ),
        };
      const next = { ...newPlannerThread(), draft: text };
      return { active: next.id, threads: [next, ...h.threads].slice(0, 20) };
    });
    window.requestAnimationFrame(() => input.current?.focus());
  }, [draft]);
  useEffect(() => {
    if (!fresh) return;
    setExpanded(true);
    const active = latest.current.threads.find((t) => t.id === latest.current.active);
    // An untouched thread stays; anything already said belongs to the old task.
    if (active?.messages.length || active?.planId || active?.requestId) {
      const next = newPlannerThread();
      setHistory((h) => ({
        active: next.id,
        threads: [next, ...h.threads].slice(0, 20),
      }));
    }
    window.requestAnimationFrame(() => input.current?.focus());
  }, [fresh]);
  useEffect(() => {
    // Leaving the bar behind another view closes it, so returning starts from the list.
    if (hidden) setExpanded(false);
  }, [hidden]);
  useLayoutEffect(() => {
    onExpandedChange(expanded);
    return () => onExpandedChange(false);
  }, [expanded, onExpandedChange]);
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
  // 只有草案阶段才可能进讨论态；已确认的方案按拆分态照实显示。
  const discussion =
    !!preview && current?.status === "draft" && isDiscussionPlan(preview.proposedItems);
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
        discussion ||
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
  const send = (retrying = false, suppliedText?: string) => {
    const retry =
      retrying && result && canRetryPlannerReply(result)
        ? plannerRetryInput(thread.messages)
        : undefined;
    if (retrying && !retry) return;
    const text = retry ? retry.text : (suppliedText ?? thread.draft).trim();
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
      if (!current || current.status !== "draft" || problems.length || processing || discussion) {
        setFailure(
          processing
            ? "这轮还在回复，稍等方案出来就能创建。"
            : discussion ? "方案仍在讨论中，请先核对待澄清问题；未标注状态的旧方案可以按新版规则重新梳理。" : problems[0] || "我们还在讨论思路，等有具体步骤后就能创建任务。",
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
    void run(async (isCurrent) => {
      const context = planningPrompt(
        retry ? retry.messages : thread.messages,
        text,
        members.data?.data || [],
        deadline,
        taskDecompositionSkill,
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
  useEffect(() => {
    const text = draftToSend.current;
    if (!text || thread.draft !== text || busy || frozen || !available) return;
    draftToSend.current = undefined;
    send(false, text);
  }, [thread.id, thread.draft, busy, frozen, available]);
  const saveArrangement = () => {
    if (!editing || !current || current.ownerId !== actor.member.id || !preview || frozen || discussion) return;
    const reviewed = editing;
    void run(async (isCurrent) => {
      if (current.id !== reviewed.plan.id || current.version !== reviewed.plan.version)
        throw new Error("方案已更新，请关闭后重新核对安排。");
      const input = plannerPlanInput(reviewed.plan, thread.deadline);
      input.proposedItems = input.proposedItems.map((step) => {
        if (step.id !== reviewed.stepId) return step;
        const allocation =
          reviewed.owner === "keep"
            ? step.allocation
            : reviewed.owner === actor.member.id
            ? { kind: "self" as const }
            : { kind: "invitation" as const, memberId: reviewed.owner };
        return {
          ...step,
          title: reviewed.title.trim(),
          deliverable: reviewed.deliverable.trim(),
          allocation,
          schedule: {
            ...step.schedule,
            hardDeadline: reviewed.dateChanged
              ? reviewed.date
                ? {
                    value: {
                      kind: "date" as const,
                      date: reviewed.date,
                      timezone: "Asia/Shanghai",
                    },
                    source: "user" as const,
                    confirmed: true,
                  }
                : null
              : step.schedule.hardDeadline,
          },
        };
      });
      try {
        await researchApi("editPlan", {
          params: { id: reviewed.plan.id },
          body: { ...input, expectedVersion: reviewed.plan.version },
          idempotencyKey: crypto.randomUUID(),
        });
      } catch (error) {
        if (isCurrent()) await plan.refresh();
        throw error;
      }
      if (!isCurrent()) return;
      update((t) => ({
        ...t,
        deadline: undefined,
        deadlineQuestion: reviewed.dateChanged ? false : t.deadlineQuestion,
      }));
      setEditing(undefined);
      await plan.refresh();
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
  const name = colleague?.agent.displayName || planningAgentStarter.profile.displayName;
  // Collapsed the bar is only an entry: the input box would otherwise take a
  // slice of every list and detail screen it sits under.
  if (!expanded)
    return (
      <section
        className={`planning-agent is-collapsed ${hidden ? "is-hidden" : ""}`}
        aria-label="任务助手"
        aria-hidden={hidden || undefined}
      >
        <button
          type="button"
          className="planning-agent-entry"
          aria-expanded={false}
          onClick={() => {
            setExpanded(true);
            window.requestAnimationFrame(() => input.current?.focus());
          }}
        >
          <RobotOutlined />
          <strong>{name}</strong>
          <span>
            {thread.messages.length
              ? thread.title || "接着上次的对话"
              : "说一件要做的事，我会整理成任务"}
          </span>
          {inProgress && <em role="status">正在回复…</em>}
          <UpOutlined />
        </button>
      </section>
    );
  return (
    <section
      className={`planning-agent is-expanded ${hidden ? "is-hidden" : ""}`}
      aria-label="任务规划 Agent"
      aria-hidden={hidden || undefined}
    >
      <header className="planning-agent-heading">
        <div>
          <RobotOutlined />
          <strong>{name}</strong>
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
          <Button
            type="default"
            className="planning-agent-toggle"
            icon={<ArrowLeftOutlined />}
            aria-label="返回任务"
            aria-expanded
            title="收起对话，返回任务列表"
            onClick={() => setExpanded(false)}
          >
            返回任务
          </Button>
        </nav>
      </header>
      <div className="planning-agent-messages" ref={messages} aria-live="polite">
        {!thread.messages.length && !thread.planId && !thread.requestId && (
          <div className="planning-agent-welcome">
            <h2>说说你要安排的任务</h2>
            <p>说清要做什么、交给谁、什么时候要。先给你看安排，确认后再发出。</p>
            <div>
              {[
                "完善我现有的论文和实验，安排成一项任务",
                "下周五组会，请同事汇报这周的实验进展，交一份报告",
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
          discussion ? (
            <PlanningDiscussion
              plan={preview}
              version={current.version}
              disabled={!available || !conversationAvailable || busy || frozen || processing || plan.loading}
              onOption={(option) => update((t) => ({ ...t, draft: option }))}
              onReassess={() => send(false, "请保留当前计划的目标和已有内容，按两态规划重新核对：信息充分就给可确认方案；确有关键缺项时给粗骨架，并只提出一个需要我回答的问题和候选回答。不要创建任务。")}
            />
          ) : (
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
                    {preview!.proposedItems.length > 1 && <b>{index + 1}</b>}
                    <strong>{step.title}</strong>
                  </div>
                  <dl className="planning-review-fields">
                    <div>
                      <dt>负责人</dt>
                      <dd>
                        {step.allocation.kind === "self"
                          ? actor.member.displayName
                          : step.allocation.kind === "invitation"
                          ? people[step.allocation.memberId] || "已选成员"
                          : step.allocation.kind === "claim"
                          ? "成员认领"
                          : "公共 Agent"}
                      </dd>
                    </div>
                    <div>
                      <dt>交付日期</dt>
                      <dd>
                        {step.schedule.hardDeadline
                          ? planDate(step.schedule.hardDeadline)
                          : "未设截止"}
                      </dd>
                    </div>
                    <div className="review-deliverable">
                      <dt>交什么</dt>
                      <dd>{step.deliverable}</dd>
                    </div>
                  </dl>
                  {current.status === "draft" && current.ownerId === actor.member.id && (
                    <Button
                      size="small"
                      disabled={
                        !available || busy || frozen || processing || plan.loading
                      }
                      onClick={() =>
                        setEditing({
                          plan: current,
                          stepId: step.id,
                          title: step.title,
                          deliverable: step.deliverable,
                          owner:
                            step.allocation.kind === "self"
                              ? actor.member.id
                              : step.allocation.kind === "invitation"
                              ? step.allocation.memberId
                              : "keep",
                          date: planDate(step.schedule.hardDeadline),
                          dateChanged: false,
                        })
                      }
                    >
                      修改安排
                    </Button>
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
                              preview!.proposedItems.find((s) => s.id === id)?.title ||
                              "待核对步骤",
                          )
                          .join("、")}
                      </small>
                    )}
                  </details>
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
                  <p key={i}>{planQuestionText(q)}</p>
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
          )
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
      <Modal
        title="修改任务安排"
        open={!!editing}
        onCancel={() => !busy && setEditing(undefined)}
        onOk={saveArrangement}
        okText="保存安排"
        cancelText="取消"
        confirmLoading={busy}
        okButtonProps={{
          disabled: frozen || !editing?.title.trim() || !editing?.deliverable.trim(),
        }}
        cancelButtonProps={{ disabled: busy }}
        destroyOnClose
      >
        {editing && (
          <div className="planning-arrangement-form">
            <label>
              任务名称
              <Input
                aria-label="任务名称"
                value={editing.title}
                maxLength={200}
                disabled={busy}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>
            <label>
              负责人
              <Select
                aria-label="负责人"
                value={editing.owner}
                disabled={busy || frozen}
                options={[
                  ...(editing.owner === "keep"
                    ? [{ value: "keep", label: "保留当前安排" }]
                    : []),
                  {
                    value: actor.member.id,
                    label: `${actor.member.displayName}（我）`,
                  },
                  ...(members.data?.data || [])
                    .filter((member) => member.id !== actor.member.id)
                    .map((member) => ({ value: member.id, label: member.displayName })),
                  ...(editing.owner !== "keep" && !people[editing.owner]
                    ? [{ value: editing.owner, label: "原方案所选成员" }]
                    : []),
                ]}
                onChange={(owner) => setEditing({ ...editing, owner })}
              />
            </label>
            <label>
              交付日期
              <Input
                aria-label="交付日期"
                type="date"
                value={editing.date}
                disabled={busy}
                onChange={(e) =>
                  setEditing({ ...editing, date: e.target.value, dateChanged: true })
                }
              />
            </label>
            <label>
              交付内容
              <Input.TextArea
                aria-label="交付内容"
                value={editing.deliverable}
                rows={3}
                maxLength={8000}
                disabled={busy}
                onChange={(e) =>
                  setEditing({ ...editing, deliverable: e.target.value })
                }
              />
            </label>
            {failure && <Alert type="warning" message={failure} />}
          </div>
        )}
      </Modal>
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
