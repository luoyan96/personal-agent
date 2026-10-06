import type { AgentTurn } from "@research-agent-platform/contracts";
import { serviceErrorMessage } from "./api-errors";

type Guidance = {
  title: string;
  nextStep: string;
  tone: "info" | "warning" | "error" | "success";
};

function modelGuidance(turn: AgentTurn, manager: boolean): Guidance {
  if (turn.availability.status === "available")
    return {
      title: "本次未能调用模型",
      nextStep:
        "这次请求记录为模型不可用；当前模型配置已可用。请核对剩余预算后决定是否明确重试，系统不会自动重试。",
      tone: "warning",
    };
  const settings = "请在模型设置中检查你的配置，处理后再明确发送。";
  switch (turn.availability.reason) {
    case "platform_disabled":
      return {
        title: "平台模型服务尚未启用",
        nextStep: "请联系平台管理员启用模型服务；仅修改实验室设置无法启用平台服务。",
        tone: "warning",
      };
    case "lab_disabled":
      return { title: "模型尚未启用", nextStep: settings, tone: "warning" };
    case "missing_credentials":
      return {
        title: "模型密钥未配置或暂不可用",
        nextStep: settings,
        tone: "warning",
      };
    case "capability_unavailable":
      return {
        title: "这个 AI 的能力当前不可用",
        nextStep: "请核对其能力状态，或选择已加入且可用的 AI。",
        tone: "warning",
      };
    case "owner_authorization_required":
      return {
        title: "这个 AI 尚需负责人授权",
        nextStep: "请先获得 AI 所属负责人的同意，再提交请求。",
        tone: "warning",
      };
    case "not_connected":
      return { title: "模型服务暂未连通", nextStep: settings, tone: "warning" };
    default:
      return { title: "模型服务暂不可用", nextStep: settings, tone: "warning" };
  }
}

/** Present only the actual turn state; never infer a reply or successful task. */
export function turnGuidance(turn: AgentTurn, manager = false): Guidance {
  if (turn.memoryReceipt?.operation === "clarify") return {
    title: "还需补充偏好信息", nextStep: turn.memoryReceipt.question || "请说明要保存、纠正或移除哪条偏好。", tone: "info",
  };
  if (turn.followupReceipt?.operation === "clarify") return {
    title: "提醒时间还需明确", nextStep: turn.followupReceipt.question || "请补充事项、日期、时间和时区。", tone: "info",
  };
  if (turn.failure?.startsWith("EXTERNAL_")) return {
    title: serviceErrorMessage(turn.failure, 0),
    nextStep: "请核对外部服务状态与记录。不会自动重试，也不会改用发送者的模型；重新发送仍需逐条授权。",
    tone: "warning",
  };
  if (
    turn.purpose === "create_agent" &&
    (turn.status === "queued" || turn.status === "running")
  )
    return {
      title: "正在创建 Agent",
      nextStep:
        turn.status === "queued"
          ? "创建请求已保存，正在等待处理；联系人尚未创建。"
          : "正在整理 Agent 档案；联系人尚未创建。",
      tone: "info",
    };
  if (turn.purpose === "create_agent" && turn.status === "waiting_input")
    return {
      title: "创建 Agent 需要补充信息",
      nextStep: "请查看助理的问题并补充后发送；本次尚未添加联系人。",
      tone: "info",
    };
  if (turn.status === "succeeded" && turn.createdAgent)
    return {
      title: turn.createdAgent.reused ? "已找到你的 Agent" : "Agent 已添加",
      nextStep: "联系人与私聊已保存，可以打开 Agent 聊天；没有自动发送消息。",
      tone: "success",
    };
  if (turn.status === "queued")
    return {
      title: "等待 AI 回复",
      nextStep: "请求已保存，正在等待处理。",
      tone: "info",
    };
  if (turn.status === "running")
    return {
      title: "AI 正在回复",
      nextStep: "正在处理本次请求；结果尚未返回。",
      tone: "info",
    };
  if (turn.status === "waiting_input")
    return {
      title: "AI 需要补充信息",
      nextStep: "请查看 AI 的问题，在输入框补充后发送。",
      tone: "info",
    };
  if (turn.status === "succeeded")
    return {
      title: "AI 已回复",
      nextStep: "请查看回复；其中的协作建议仍需明确确认。",
      tone: "success",
    };
  switch (turn.failure) {
    case "AGENT_LIMIT_REACHED":
      return {
        title: "你的 Agent 数量已达上限",
        nextStep:
          "本次没有创建新的联系人。可以从通讯录打开已有 Agent，或修改已有 Agent 的资料后使用。",
        tone: "warning",
      };
    case "MODEL_UNAVAILABLE":
      return modelGuidance(turn, manager);
    case "BUDGET_EXCEEDED": {
      const usage = turn.usage;
      const tokensExceeded =
        usage?.inputTokens != null &&
        usage.outputTokens != null &&
        usage.inputTokens + usage.outputTokens > turn.budget.maxTokens;
      const timeExceeded =
        usage != null && usage.elapsedMs > turn.budget.maxSeconds * 1000;
      return {
        title:
          tokensExceeded && timeExceeded
            ? "本次用量和耗时超出预算"
            : tokensExceeded
            ? "本次上下文与回复总量超出预算"
            : timeExceeded
            ? "本次处理耗时超出预算"
            : "本次上下文、回复或耗时超出限制",
        nextStep: turn.remainingBudget
          ? "本次没有可用回复。请缩短需求、减少所选材料，手动核对下一次请求的材料与预算后再发送；相同内容和预算重试可能再次超限。系统不会自动提高预算。"
          : "本次没有可用回复，本轮没有可用于重试的剩余预算。可以缩短需求、减少所选材料，核对材料与预算后明确发送新的请求。",
        tone: "error",
      };
    }
    case "INVALID_MODEL_OUTPUT":
      return {
        title: "AI 回复未通过校验",
        nextStep: "本次没有可用回复。请核对需求后再明确提交；协作建议未被执行。",
        tone: "error",
      };
    case "MODEL_FAILED":
      return {
        title: "模型调用失败",
        nextStep: "本次没有可用回复。请联系实验室负责人检查模型服务，确认后再提交。",
        tone: "error",
      };
    case "LEASE_EXPIRED_USAGE_UNCERTAIN":
      return {
        title: "AI 处理已中断，用量尚无法确认",
        nextStep:
          "请先核对模型服务与本次用量，再决定是否提交新的请求；系统不会自动重试。",
        tone: "warning",
      };
    case "AUTHORITY_CHANGED":
      return {
        title: "本次请求的授权已变化",
        nextStep: "请重新核对会话成员、AI 和材料权限后再提交。旧请求不会继续执行。",
        tone: "warning",
      };
    case "INPUT_CHANGED":
      return {
        title: "本次请求的材料或资料已变化",
        nextStep: "请重新选择当前版本的材料，核对 AI 档案和记忆后再提交。",
        tone: "warning",
      };
  }
  if (turn.status === "unavailable") return modelGuidance(turn, manager);
  if (turn.status === "cancelled")
    return {
      title: "AI 请求已取消",
      nextStep: "本次不会继续生成回复；如仍需要，请明确提交新的请求。",
      tone: "warning",
    };
  if (turn.status === "interrupted")
    return {
      title: "AI 处理已中断",
      nextStep: "请先核对处理状态和本次用量，再决定是否提交新的请求。",
      tone: "warning",
    };
  return {
    title: "AI 请求未完成",
    nextStep: "本次没有可用回复。请核对需求及服务状态后再提交。",
    tone: "error",
  };
}
