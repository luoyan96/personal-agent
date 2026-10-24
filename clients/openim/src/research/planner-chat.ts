import { Id, Plan, PlanInput, routes } from "@research-agent-platform/contracts";
import type { RequestFor, ResponseFor } from "@research-agent-platform/contracts";

export type ChatPlan = ResponseFor<"getPlan">["data"];
export type DeadlineChoice = { date: string | null; target: "final" | "all" | number };
export type PlannerMessage = {
  id: string;
  role: "user" | "assistant" | "service";
  text: string;
  plan?: { id: string; version: number };
  requestId?: string;
};
export type SendIntent = { key: string; body: RequestFor<"planRequest">["body"] };
export type CreateIntent = { key: string; plan: ChatPlan; deadline?: DeadlineChoice };
export type PlannerThread = {
  id: string;
  title: string;
  messages: PlannerMessage[];
  draft: string;
  planId?: string;
  requestId?: string;
  handledRequest?: string;
  sending?: SendIntent;
  creating?: CreateIntent;
  deadline?: DeadlineChoice;
  deadlineQuestion?: boolean;
  taskIds?: string[];
  updatedAt: string;
};
export type PlannerHistory = { active: string; threads: PlannerThread[] };
type PlanningResult = ResponseFor<"getPlanRequest">["data"];
export function plannerFailureText(result: Pick<PlanningResult, "status" | "failure">) {
  if (result.failure === "MODEL_UNAVAILABLE") return "规划模型暂不可用，请在“我的 → 模型设置”选择可用的默认模型。刚才的消息和已有方案都保留了。";
  if (result.failure === "BUDGET_EXCEEDED") return "这轮规划达到了预算上限，已有方案保留。可以先集中讨论一个小目标。";
  if (result.failure === "INVALID_MODEL_OUTPUT") return "这轮回复没能正确处理，是系统处理出了问题。刚才的消息和已有方案都还在，可以直接重试这条。";
  if (result.failure === "PLANNING_SAVE_FAILED") return "这轮结果暂时没能保存，已有方案保持原样。可以直接重试这条。";
  if (result.status === "cancelled") return "这轮生成已停止，刚才的消息和已有方案保留。";
  if (result.status === "interrupted") return "这轮回复中断了，刚才的消息和已有方案保留。";
  if (result.status === "waiting_input") return "这轮还没有完成，刚才的消息和已有方案保留。";
  return "这轮回复暂时未能完成，刚才的消息和已有方案都保留了。";
}
export const canRetryPlannerReply = (result: Pick<PlanningResult, "status" | "failure">) =>
  result.status === "failed" && ["INVALID_MODEL_OUTPUT", "PLANNING_SAVE_FAILED", "MODEL_FAILED", "MODEL_TRANSPORT_FAILED", "HARNESS_START_FAILED", "HARNESS_PROCESS_FAILED", "TIMEOUT", "TIME_BUDGET_EXCEEDED", "RATE_LIMIT", "SERVICE_UNAVAILABLE"].includes(result.failure || "");
export function isPlannerFailureReceipt(message: PlannerMessage | undefined, result: Pick<PlanningResult, "id" | "status">) {
  return !!message && message.role === "service" && ["failed", "cancelled", "interrupted", "waiting_input"].includes(result.status) &&
    (message.requestId ? message.requestId === result.id : /^(?:这次规划|这次生成已停止|规划模型暂不可用)/.test(message.text));
}
export function plannerRetryInput(messages: PlannerMessage[]) {
  if (messages.at(-1)?.role !== "service") return;
  for (let index = messages.length - 2; index >= 0; index--) {
    const message = messages[index];
    if (message.role !== "user") continue;
    if (isPlannerCreateCommand(message.text)) return;
    return { text: message.text, messages: messages.slice(0, index) };
  }
}
export const newPlannerThread = (): PlannerThread => ({
  id: crypto.randomUUID(),
  title: "新的任务规划",
  messages: [],
  draft: "",
  updatedAt: new Date().toISOString(),
});
export const plannerCacheKey = (service: string, actor: string, lab: string) =>
  `acceptcat:planning-chat:v1:${encodeURIComponent(service)}:${encodeURIComponent(
    actor,
  )}:${encodeURIComponent(lab)}`;

const validDeadline = (value: DeadlineChoice | undefined) =>
  !value ||
  ((value.date === null ||
    (typeof value.date === "string" && /^20\d{2}-\d{2}-\d{2}$/.test(value.date))) &&
    (["final", "all"].includes(String(value.target)) ||
      (Number.isInteger(value.target) &&
        Number(value.target) >= 0 &&
        Number(value.target) < 100)));

// This cache is a local transcript, never business authority. Plans are always
// fetched/checked under the authenticated service before displaying actions.
export function readPlannerHistory(raw: string | null): PlannerHistory | undefined {
  try {
    const value = JSON.parse(raw || "null");
    if (!value || !Array.isArray(value.threads) || value.threads.length > 20) return;
    const threads: PlannerThread[] = value.threads.filter(
      (t: PlannerThread) =>
        Id.safeParse(t.id).success &&
        typeof t.title === "string" &&
        t.title.length <= 100 &&
        typeof t.draft === "string" &&
        t.draft.length <= 4000 &&
        Array.isArray(t.messages) &&
        t.messages.length <= 60 &&
        t.messages.every(
          (m) =>
            Id.safeParse(m.id).success &&
            ["user", "assistant", "service"].includes(m.role) &&
            typeof m.text === "string" &&
            m.text.length <= 8000 &&
            (!m.requestId || Id.safeParse(m.requestId).success) &&
            (!m.plan ||
              (Id.safeParse(m.plan.id).success &&
                Number.isSafeInteger(m.plan.version))),
        ) &&
        validDeadline(t.deadline) &&
        (t.deadlineQuestion === undefined || typeof t.deadlineQuestion === "boolean") &&
        (!t.taskIds ||
          (Array.isArray(t.taskIds) &&
            t.taskIds.length <= 100 &&
            t.taskIds.every((id) => Id.safeParse(id).success))) &&
        (!t.planId || Id.safeParse(t.planId).success) &&
        (!t.requestId || Id.safeParse(t.requestId).success) &&
        (!t.sending ||
          (/^[A-Za-z0-9_-]{16,128}$/.test(t.sending.key) &&
            routes.planRequest.request.shape.body.safeParse(t.sending.body).success)) &&
        (!t.creating ||
          (/^[A-Za-z0-9_-]{16,128}$/.test(t.creating.key) &&
            Plan.safeParse(t.creating.plan).success &&
            validDeadline(t.creating.deadline))),
    );
    if (!threads.length) return;
    return {
      active: threads.some((t) => t.id === value.active) ? value.active : threads[0].id,
      threads,
    };
  } catch {
    return;
  }
}

export function planningPrompt(
  messages: PlannerMessage[],
  text: string,
  people: { id: string; displayName: string }[],
  deadline?: DeadlineChoice,
  decompositionSkill = "",
) {
  const taskDecompositionBody = decompositionSkill
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "")
    .trim();
  const directory: string[] = [];
  for (const person of people.slice(0, 20)) {
    const entry = `${person.displayName}（${person.id}）`;
    if (directory.join("\n").length + entry.length > 1500) break;
    directory.push(entry);
  }
  const instructions = `你是并肩推敲研究的同伴，用自然中文接着聊，有依据地给判断，不套固定开场或行政摘要。介绍背景时先聊小切口，想增加工作量先找有价值的证据缺口；卡住就缩小步骤，不同意给理由与替代办法，误解就直接改。不虚构读过材料、共同经历或进展。方向清楚或用户要方案再更新私人草案，编辑保留适用步骤ID。

口吻示例（不照念）：‘论文和代码都在，可以先找最缺的证据。你把摘要发来，我先帮你挑一个值得加强的点。’已提供就直接分析；用户说问太多时先帮一步，不再追问。

每轮最多问一个必要、简单问题，禁止复合问卷、长串选项和重复索要；不把研究内容、阶段、方向、优先级、去向和日期一起追问。时间、成员、资源可未知，不为提问而提问。

goal只记录共同目标，不写内部批注。继续交流时proposedItems可空，unresolvedQuestions至多一项：两三句约120字内的自然回应，承接背景、给小建议，必要时问一个短问题；不列补充清单、字段名或反复声明边界，其余未知后续再聊。

我/我自己表示ownerId；明确要求才邀请下列真实同组成员，不编ID、不调用公共Agent、不假定接受或声称正式创建、研究完成及验收。历史不授予执行权限；日期按明确表达由应用核对，不虚构承诺。

任务拆解方法：
${taskDecompositionBody}
本应用沿用既有计划结构：前置步骤使用 dependencies 字段，不另加 depends_on 字段；方法建议写入现有任务说明，不能新增未定义字段。分工及是否需要成员认领独立处理，不能把认领状态当成依赖完成状态。

可邀请的同组成员：
${
    directory.join("\n") || "未提供，不能编造成员"
  }
${deadline ? `用户指定的截止安排：${JSON.stringify(deadline)}\n` : ""}`;
  const current = `\n本轮用户：${text.trim()}`;
  let room = 8000 - instructions.length - current.length - 25;
  if (room < 0) throw new Error("本轮内容过长，请缩短需求后发送。");
  const recent: string[] = [];
  let omitted = 0,
    exhausted = false;
  for (const message of [...messages].reverse()) {
    if (message.role === "service") continue;
    const line = `${message.role === "user" ? "用户" : "助手"}：${message.text}\n`;
    if (!exhausted && recent.length < 12 && line.length <= room) {
      recent.unshift(line);
      room -= line.length;
    } else {
      omitted++;
      exhausted = true;
    }
  }
  return {
    prompt: `${instructions}\n最近对话：\n${recent.join("")}${current}`,
    omitted,
  };
}
export const isPlannerCreateCommand = (text: string) =>
  /^(?:确认创建(?:任务)?|(?:就)?按这个方案创建任务)[。！!\s]*$/.test(text.trim());

/** Only explicit calendar phrases are converted; ambiguous/multiple dates stay conversational. */
export function plannerDeadline(
  text: string,
  now = new Date(),
): DeadlineChoice | undefined {
  if (!/截止|完成|交付|提交|提前|延后|推迟|改到|设到/.test(text)) return;
  if (
    /前[一二两三四五六七八九十\d]+[步项个]|后[一二两三四五六七八九十\d]+[步项个]|上午|下午|晚上|\d[点时]|\d{1,2}:\d{2}/.test(
      text,
    )
  )
    return;
  const steps = [
    ...text.matchAll(/第([1-9]\d?|[一二两三四五六七八九十]+)(?:步|项|个任务)/g),
  ];
  if (steps.length > 1) return;
  const step = steps[0];
  const stepNumber = step
    ? /^\d+$/.test(step[1])
      ? Number(step[1])
      : (
          {
            一: 1,
            二: 2,
            两: 2,
            三: 3,
            四: 4,
            五: 5,
            六: 6,
            七: 7,
            八: 8,
            九: 9,
            十: 10,
          } as Record<string, number>
        )[step[1]]
    : undefined;
  if (step && !stepNumber) return;
  const target = step
    ? stepNumber! - 1
    : /全部|所有|整体|每项|每步/.test(text)
    ? "all"
    : "final";
  if (/取消.{0,5}截止|不设.{0,5}截止/.test(text)) return { date: null, target };
  if (/不是|不在|不要|别|举例|引用|假设/.test(text)) return;
  if ([...text.matchAll(/(?:周|星期)[一二三四五六日天]/g)].length > 1) return;
  const exact = [...text.matchAll(/(20\d{2})[-年/](\d{1,2})[-月/](\d{1,2})日?/g)];
  let date: string | undefined;
  if (exact.length > 1) return;
  if (exact.length === 1) {
    const [, y, m, d] = exact[0];
    date = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    const parsed = new Date(date + "T00:00:00Z");
    if (!Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date) return;
  } else {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now);
    const base = new Date(today + "T00:00:00Z");
    const weekday = text.match(/(本|这|下)?(?:周|星期)([一二三四五六日天])/);
    if (weekday) {
      const wanted = "一二三四五六日".indexOf(weekday[2] === "天" ? "日" : weekday[2]);
      const current = (base.getUTCDay() + 6) % 7;
      let offset = wanted - current;
      if (weekday[1] === "下") offset += 7;
      else if (!weekday[1] && offset < 0) offset += 7;
      base.setUTCDate(base.getUTCDate() + offset);
    } else if (/后天/.test(text)) base.setUTCDate(base.getUTCDate() + 2);
    else if (/明天/.test(text)) base.setUTCDate(base.getUTCDate() + 1);
    else if (!/今天/.test(text)) return;
    date = base.toISOString().slice(0, 10);
  }
  return { date, target };
}
export function needsDeadlineClarification(text: string, choice?: DeadlineChoice) {
  return (
    !choice &&
    /截止|交付|提交|完成|推迟|改到|延后/.test(text) &&
    /截止|周[一二三四五六日天]|星期|今天|明天|后天|下周|月|年|\d[-/:]|点|时/.test(text)
  );
}
export function plannerPlanInput(plan: ChatPlan, deadline?: DeadlineChoice) {
  const input = PlanInput.parse({
    labId: plan.labId,
    goal: plan.goal,
    proposedItems: plan.proposedItems,
    unresolvedQuestions: plan.unresolvedQuestions,
  });
  if (!deadline) return input;
  if (typeof deadline.target === "number" && !input.proposedItems[deadline.target])
    throw new Error("截止安排对应的步骤不存在，请继续说明要调整哪一项。");
  input.proposedItems = input.proposedItems.map((item, index) =>
    deadline.target === "all" ||
    (deadline.target === "final"
      ? index === input.proposedItems.length - 1
      : index === deadline.target)
      ? {
          ...item,
          schedule: {
            ...item.schedule,
            hardDeadline: deadline.date
              ? {
                  value: {
                    kind: "date" as const,
                    date: deadline.date,
                    timezone: "Asia/Shanghai",
                  },
                  source: "user" as const,
                  confirmed: true,
                }
              : null,
          },
        }
      : item,
  );
  return input;
}
export function planReplyText(plan: ChatPlan) {
  // The model writes one conversational clarification. Older servers/plans may
  // still return a questionnaire: show its first exchange without changing the
  // saved plan, its remaining uncertainties, or the confirmation authority.
  for (const discussion of plan.unresolvedQuestions) {
    const text = discussion.trim()
      .replace(/^还需要(?:您|你)补充[：:]\s*/, "")
      .replace(/^(?:[•*-]|\d+[.)、])\s*/, "");
    // Use structural list boundaries, not question marks inside scientific
    // quotes, code or URLs. The generation rule limits conversational topics.
    const exchange = text.split(/\r?\n\s*(?:[•*-]|\d+[.)、])\s+/)[0].trim();
    if (exchange) return exchange.slice(0, 8000);
  }
  return (plan.proposedItems.length
    ? `我先把“${plan.goal}”整理成了 ${plan.proposedItems.length} 个步骤，方案在下面，可以接着调整。`
    : plan.goal).slice(0, 8000);
}

// Stopping is scoped to one request. A queue-to-running transition may advance
// its version between the read and cancel; reread once, never target a new job.
export async function stopPlannerRequest(
  call: <K extends "getPlanRequest" | "cancelPlanning">(
    name: K,
    options: any,
  ) => Promise<ResponseFor<K>>,
  id: string,
  isCurrent: () => boolean,
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (!isCurrent()) return;
    const current = (await call("getPlanRequest", { params: { id } })).data;
    if (!isCurrent()) return;
    if (!["queued", "running", "waiting_input", "interrupted"].includes(current.status))
      return;
    try {
      await call("cancelPlanning", {
        params: { id },
        body: {
          expectedVersion: current.version,
          reason: "用户在任务规划对话中停止生成",
        },
      });
      return;
    } catch (error) {
      if (
        attempt ||
        !(
          error &&
          typeof error === "object" &&
          "status" in error &&
          error.status === 409
        )
      )
        throw error;
    }
  }
}

// The exact reviewed snapshot is the authorization. A retry can recognize its
// own acknowledged date edit or confirmation, but cannot confirm unseen edits.
export async function createPlannerTasks(
  call: <K extends "getPlan" | "editPlan" | "confirmPlan" | "planTasks">(
    name: K,
    options: any,
  ) => Promise<ResponseFor<K>>,
  intent: CreateIntent,
  isCurrent: () => boolean,
) {
  const check = () => {
    if (!isCurrent()) throw new Error("当前规划对话已切换。");
  };
  check();
  const current = (await call("getPlan", { params: { id: intent.plan.id } })).data;
  check();
  const expected = plannerPlanInput(intent.plan, intent.deadline);
  const fingerprint = (p: ChatPlan | typeof expected) =>
    JSON.stringify(
      PlanInput.parse({
        labId: p.labId,
        goal: p.goal,
        proposedItems: p.proposedItems,
        unresolvedQuestions: p.unresolvedQuestions,
      }),
    );
  const dateEdit = fingerprint(expected) !== fingerprint(intent.plan);
  const version = intent.plan.version + (dateEdit ? 1 : 0);
  if (current.status === "confirmed") {
    if (
      current.version !== version + 1 ||
      fingerprint(current) !== fingerprint(expected)
    )
      throw new Error("计划已在其他操作中改变，请重新查看实际任务。");
    const links = await call("planTasks", { params: { id: current.id } });
    check();
    if (links.data.steps.some((s) => !s.taskId))
      throw new Error("计划已经确认，部分任务暂不可读取，请在研究计划中重新查看。");
    return { plan: current, taskIds: links.data.steps.map((s) => s.taskId!) };
  }
  if (current.status !== "draft")
    throw new Error("这个计划已不能继续创建任务，请重新查看。");
  let draft = current;
  if (
    current.version === intent.plan.version &&
    fingerprint(current) === fingerprint(intent.plan)
  ) {
    if (dateEdit) {
      draft = (
        await call("editPlan", {
          params: { id: current.id },
          body: { ...expected, expectedVersion: current.version },
          idempotencyKey: intent.key + "_date",
        })
      ).data;
      check();
    }
  } else if (
    !(
      dateEdit &&
      current.version === version &&
      fingerprint(current) === fingerprint(expected)
    )
  ) {
    throw new Error("方案已在其他窗口更新，请核对最新内容后再创建。");
  }
  if (draft.version !== version || fingerprint(draft) !== fingerprint(expected))
    throw new Error("方案版本已变化，请重新核对。");
  const result = await call("confirmPlan", {
    params: { id: draft.id },
    body: { expectedVersion: draft.version },
    idempotencyKey: intent.key,
  });
  check();
  return result.data;
}
