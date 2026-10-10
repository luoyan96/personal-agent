import type { Contact } from "@research-agent-platform/contracts";
export const researchCategories = ["全部", "文献与阅读", "写作与表达", "研究设计", "图表与可视化", "数据与代码", "课题协作"] as const;
export type ResearchCategory = typeof researchCategories[number];
export function capabilityCategory(contact: Pick<Contact, "displayName" | "profile">, tags: readonly string[] = []): ResearchCategory {
  const text = `${contact.displayName} ${tags.join(" ")} ${contact.profile.introduction} ${contact.profile.capabilityDescription}`;
  if (/图表|可视化|绘图|图注/.test(text)) return "图表与可视化";
  if (/论文修改|写作|表达|润色|翻译/.test(text)) return "写作与表达";
  if (/文献|阅读|检索|摘要/.test(text)) return "文献与阅读";
  if (/研究方案|研究设计|实验设计|研究问题/.test(text)) return "研究设计";
  if (/数据|代码|统计|编程|脚本/.test(text)) return "数据与代码";
  return "课题协作";
}
export function capabilityInput(contact: Pick<Contact, "profile">) {
  return /(?:适用输入|输入)[：:]\s*([^\n]+?)(?=输出[：:]|$)/m.exec(contact.profile.capabilityDescription)?.[1]?.trim() || "维护者尚未说明适用输入，请先查看配置。";
}
export function capabilityStatus(contact: Pick<Contact, "identity" | "availability" | "agentRuntime" | "allowedActions" | "relationship">) {
  if (contact.identity.kind === "human") return "本人能力名片";
  if (contact.availability.status !== "available") {
    const reasons: Record<string, string> = { missing_credentials: "模型未配置", owner_authorization_required: "需要主人授权", not_connected: "尚未连接", platform_disabled: "平台已停用", lab_disabled: "课题组已停用", capability_unavailable: "当前能力不可用" };
    return reasons[contact.availability.reason || ""] || "当前不可用";
  }
  if (contact.agentRuntime) return contact.agentRuntime.callerAllowed ? "外部文字服务 · 每次授权" : "外部服务 · 未获准调用";
  return contact.allowedActions.includes("chat") ? "站内文字对话可用" : "先申请添加";
}
