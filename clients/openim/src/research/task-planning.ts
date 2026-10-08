import { PlanInput } from "@research-agent-platform/contracts";
import type { RequestFor, ResponseFor } from "@research-agent-platform/contracts";

export type PlanDraft = RequestFor<"createPlan">["body"];
export type PlanStep = PlanDraft["proposedItems"][number];
export type SavedPlan = ResponseFor<"getPlan">["data"];
export const emptySchedule = () => ({
  suggested: null,
  hardDeadline: null,
  committed: null,
  estimatedHumanHours: null,
  checkpoint: null,
});
export function newPlanStep(): PlanStep {
  return {
    id: crypto.randomUUID(),
    title: "",
    goal: "",
    deliverable: "",
    acceptanceCriteria: "",
    allocation: { kind: "self" },
    dependencies: [],
    schedule: emptySchedule(),
    inputArtifactIds: [],
    budget: null,
  };
}

const templateSteps = {
  reading: [
    [
      "阅读与整理",
      "阅读提供的论文，整理研究问题、方法与实验。",
      "带原文依据的结构化阅读笔记",
      "区分原文事实与推断；列出未提供或未核实的信息。",
    ],
    [
      "提炼研究框架",
      "基于阅读笔记，解释关键模块及其关系。",
      "研究框架说明与模块关系",
      "每个模块对应论文依据；说明输入、处理过程和输出。",
    ],
    [
      "复核与汇总",
      "核对论据、方法与结论，汇总疑问。",
      "可复用的论文梳理报告",
      "覆盖研究问题、方法、实验结果与局限；疑问单独列出。",
    ],
  ],
  experiment: [
    [
      "明确实验问题",
      "确定假设、变量、对照组及评价指标。",
      "实验方案与待确认事项",
      "变量和评价方法可操作；未知条件明确标出。",
    ],
    [
      "执行与记录",
      "按确认后的方案执行实验并记录过程。",
      "原始记录、数据与异常说明",
      "记录数据来源、条件、时间和异常；不得编造缺失数据。",
    ],
    [
      "分析与复核",
      "分析实验结果，核对假设与局限。",
      "分析报告与下一轮建议",
      "结论可追溯至原始数据；未验证的解释标为假设。",
    ],
  ],
  writing: [
    [
      "组织论点与证据",
      "明确读者、目标和已有材料，组织论文大纲。",
      "大纲与证据清单",
      "各节目标明确；每个主要论点有依据或待补材料。",
    ],
    [
      "完成初稿",
      "依据大纲和获准材料完成初稿。",
      "可审阅的论文初稿",
      "不编造引用与实验；待补的证据和段落明确标注。",
    ],
    [
      "反馈与修订",
      "根据导师反馈逐项修订。",
      "修订稿与反馈响应表",
      "逐条说明修改及其位置；保留未解决的意见。",
    ],
  ],
} as const;
export function planningTemplate(
  kind: keyof typeof templateSteps,
  labId: string,
  goal: string,
): PlanDraft {
  const proposedItems: PlanStep[] = [];
  for (const [title, stepGoal, deliverable, acceptanceCriteria] of templateSteps[
    kind
  ]) {
    const previous = proposedItems[proposedItems.length - 1];
    proposedItems.push({
      ...newPlanStep(),
      title,
      goal: stepGoal,
      deliverable,
      acceptanceCriteria,
      dependencies: previous ? [previous.id] : [],
    });
  }
  return { labId, goal, proposedItems, unresolvedQuestions: [] };
}

/** Validate before sending, while the service remains authoritative for permissions and versions. */
export function planProblems(draft: PlanDraft): string[] {
  const problems: string[] = [];
  if (!draft.goal.trim()) problems.push("请填写这份计划要达成的目标。");
  if (!draft.proposedItems.length) problems.push("至少添加一个步骤。");
  const ids = new Set(draft.proposedItems.map((s) => s.id));
  if (ids.size !== draft.proposedItems.length)
    problems.push("步骤标识重复，请重新添加重复步骤。");
  if (
    new Set(draft.proposedItems.map((s) => s.title.trim())).size !==
    draft.proposedItems.length
  )
    problems.push("请给每个步骤设置不同的名称，便于确认后对应进展。");
  const visited = new Set<string>(),
    stack = new Set<string>();
  const visit = (id: string): boolean => {
    if (stack.has(id)) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    stack.add(id);
    const cycle =
      draft.proposedItems.find((s) => s.id === id)?.dependencies.some(visit) ?? false;
    stack.delete(id);
    return cycle;
  };
  draft.proposedItems.forEach((s, i) => {
    const missing = [
      !s.title.trim() && "名称",
      !s.goal.trim() && "目标",
      !s.deliverable.trim() && "交付物",
      !s.acceptanceCriteria.trim() && "验收标准",
    ].filter(Boolean);
    if (missing.length) problems.push(`第 ${i + 1} 步缺少${missing.join("、")}。`);
    if (s.dependencies.some((id) => !ids.has(id)))
      problems.push(`第 ${i + 1} 步依赖了不存在的步骤。`);
    if (s.allocation.kind === "public_agent" && !s.allocation.capability)
      problems.push(`第 ${i + 1} 步尚未选择可用的公共 Agent 能力。`);
  });
  if (draft.proposedItems.some((s) => visit(s.id)))
    problems.push("步骤依赖形成了循环，请调整先后关系。");
  if (!PlanInput.safeParse(draft).success && !problems.length)
    problems.push("计划内容或日期格式不符合要求，请核对后再保存。");
  return problems;
}
export function planDate(value: PlanStep["schedule"]["hardDeadline"]): string {
  if (!value) return "";
  return value.value.kind === "date"
    ? value.value.date
    : new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Shanghai",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date(value.value.at));
}
export const taskStateLabels: Record<string, string> = {
  unassigned: "待分工",
  awaiting_acceptance: "等待成员接受",
  ready: "可以开始",
  in_progress: "进行中",
  blocked: "遇到阻碍",
  in_review: "待验收",
  changes_requested: "待修订",
  completed: "已验收",
  cancelled: "已取消",
};
export const requestStateLabels: Record<string, string> = {
  queued: "等待生成",
  running: "正在规划",
  draft: "草案已生成",
  ready: "已返回",
  waiting_input: "需要补充信息",
  interrupted: "生成中断",
  failed: "生成失败",
  cancelled: "已取消",
};
