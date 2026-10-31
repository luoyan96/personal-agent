import type { ChatMessage } from "@research-agent-platform/contracts";

type ChatResource = ChatMessage["resources"][number];

/**
 * A service notice whose only payload is one task reference is the invitation
 * itself: the sentence and the action belong in one card, not in a sentence
 * plus a repeated task title. Anything else (model replies, group creation with
 * shared material, multi-task decisions) keeps the plain message body.
 */
export function isTaskNotice(
  fact: Pick<ChatMessage, "origin" | "turnId" | "resources"> | undefined,
) {
  if (!fact || fact.origin !== "service" || fact.turnId) return false;
  return fact.resources.length === 1 && fact.resources[0]?.kind === "task";
}

/** Task references become cards; everything else stays in the material list. */
export function splitTaskResources(resources: ChatResource[]) {
  return {
    tasks: resources.filter((resource) => resource.kind === "task"),
    others: resources.filter((resource) => resource.kind !== "task"),
  };
}

const statusLabels: Record<string, string> = {
  proposed: "待确认安排",
  ready: "等待成员参与",
  awaiting_acceptance: "待承接",
  in_progress: "进行中",
  running: "正在处理",
  blocked: "需要处理问题",
  awaiting_review: "结果待确认",
  completed: "已完成",
  cancelled: "已结束",
};

/** Unknown statuses stay silent instead of showing a raw enum to the reader. */
export function taskStatusLabel(status: string | undefined) {
  return status ? statusLabels[status] || "" : "";
}

const legacyInvitation = /邀请你承接任务「([^」]+)」/;

/**
 * Older servers sent the invitation as plain text with no task reference. That
 * template is fixed, so the reader still gets one card with a way into the task
 * inbox instead of a sentence that cannot be clicked.
 */
export function legacyTaskInvitation(text: string | null | undefined) {
  if (!text) return undefined;
  const match = legacyInvitation.exec(text);
  return match?.[1] || undefined;
}
