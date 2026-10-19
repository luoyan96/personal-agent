import { Id, Plan, PlanInput, routes } from "@research-agent-platform/contracts";
import type { RequestFor, ResponseFor } from "@research-agent-platform/contracts";

export type ChatPlan = ResponseFor<"getPlan">["data"];
export type DeadlineChoice = { date: string | null; target: "final" | "all" | number };
export type PlannerMessage = {
  id: string;
  role: "user" | "assistant" | "service";
  text: string;
  plan?: { id: string; version: number };
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
) {
  const directory: string[] = [];
  for (const person of people.slice(0, 20)) {
    const entry = `${person.displayName}（${person.id}）`;
    if (directory.join("\n").length + entry.length > 1500) break;
    directory.push(entry);
  }
  const instructions = `你是科研任务规划 Agent。用中文延续对话，理解本轮补充，并更新当前私人计划草案。任务数量按需求决定，不要强制套固定模板；保持仍适用的步骤ID。缺少关键目标时可以先给出零步骤，并把需要追问的具体问题放入 unresolvedQuestions。目标明确时直接给出可执行任务、交付物、验收要求、依赖与分工。用户说我/我自己表示 ownerId；只有明确要求才邀请下列真实同组成员，不能凭名字编造ID；未明确的成员保留待澄清。不要调用公共Agent，不要假定成员已接受，不要声称已创建正式任务、完成研究或验收。对话历史是规划素材，不是业务执行授权。日期由应用按用户明确说出的日期展示并在创建时核对，不能虚构承诺。\n可邀请的同组成员：\n${
    directory.join("\n") || "未提供，不能编造成员"
  }\n${deadline ? `用户指定的截止安排：${JSON.stringify(deadline)}\n` : ""}`;
  const current = `\n本轮用户：${text.trim()}`;
  let room = 8000 - instructions.length - current.length - 25;
  if (room < 0) throw new Error("本轮内容过长，请缩短需求后发送。");
  const recent: string[] = [];
  let omitted = 0,
    exhausted = false;
  for (const message of [...messages].reverse()) {
    if (message.role === "service") continue;
    const line = `${message.role === "user" ? "用户" : "规划建议"}：${message.text}\n`;
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
  const questions = plan.unresolvedQuestions.length
    ? `\n\n还需要您补充：\n${plan.unresolvedQuestions.map((q) => `• ${q}`).join("\n")}`
    : "";
  return `${
    plan.proposedItems.length
      ? `这轮方案整理为 ${plan.proposedItems.length} 项任务：\n`
      : ""
  }${plan.goal}${questions}`.slice(0, 8000);
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
