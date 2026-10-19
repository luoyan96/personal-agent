export type PlanningPreset = "reading" | "experiment" | "writing";
export const planningPrompts: Record<PlanningPreset, string> = {
  reading: "梳理一篇论文的研究框架",
  experiment: "设计并完成一轮实验",
  writing: "完成论文初稿与修订",
};
