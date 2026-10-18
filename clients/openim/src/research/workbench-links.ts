import { Id } from "@research-agent-platform/contracts";
import type { researchApi } from "./api";

export type WorkbenchTaskKind = "personal" | "research";

export function workbenchTaskPath(id: string, kind: WorkbenchTaskKind = "personal") {
  if (!Id.safeParse(id).success) throw new Error("任务链接无效。");
  return `/workbench?${new URLSearchParams({
    view: "tasks",
    task: id,
    taskKind: kind,
  })}`;
}

export function workbenchTaskTarget(params: URLSearchParams) {
  const id = params.get("task"),
    kind = params.get("taskKind") || "personal";
  return {
    id,
    kind,
    valid: !!id && Id.safeParse(id).success && ["personal", "research"].includes(kind),
  };
}

/** Older servers already persist delegated work; match its exact turn, never an Agent name. */
export async function findAssistantWorkTask(
  receipt: { conversationId: string; turnId: string },
  read: typeof researchApi,
  signal: AbortSignal,
) {
  let cursor: string | undefined;
  const seen = new Set<string>();
  for (let page = 0; page < 10; page++) {
    signal.throwIfAborted();
    const cards = await read("workbench", {
      query: { category: "all", limit: 100, cursor },
      signal,
    });
    signal.throwIfAborted();
    for (const card of cards.data) {
      if (
        card.source !== "personal_task" ||
        !card.taskId ||
        card.summaryOnly ||
        card.conversationId !== receipt.conversationId
      )
        continue;
      try {
        const { data: task } = await read("personalWorkTask", {
          params: { id: card.taskId },
          signal,
        });
        signal.throwIfAborted();
        if (
          !task.summaryOnly &&
          task.turnId === receipt.turnId &&
          task.conversationId === receipt.conversationId
        )
          return task.id;
      } catch (error) {
        signal.throwIfAborted();
        if ((error as { status?: number }).status !== 404) throw error;
      }
    }
    cursor = cards.nextCursor || undefined;
    if (!cursor) return undefined;
    if (seen.has(cursor)) break;
    seen.add(cursor);
  }
  throw new Error("已读取最近 1000 项记录，尚未定位这次安排。请在工作台继续查找。");
}
