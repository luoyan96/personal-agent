import type { ChatMessage } from "@research-agent-platform/contracts";
import { Button } from "antd";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { researchApi } from "./api";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { taskStatusLabel } from "./task-notice";
import { workbenchTaskPath } from "./workbench-links";

type ChatResource = ChatMessage["resources"][number];

// A task reference on a message is only an id and a version. The reader may be
// the invitee who has no task access yet, so the card never claims a title it
// could not read: it falls back to the task inbox instead of guessing.
type TaskFacts =
  | { kind: "research" | "personal"; title: string; status: string }
  | { kind: "unknown" };

const factsCache = new Map<string, TaskFacts>();
const factsInFlight = new Map<string, Promise<TaskFacts>>();

async function readTaskFacts(id: string): Promise<TaskFacts> {
  const cached = factsCache.get(id);
  if (cached) return cached;
  const running = factsInFlight.get(id);
  if (running) return running;
  const job = (async (): Promise<TaskFacts> => {
    try {
      const response = await researchApi("task", { params: { id } });
      const data = response.data as {
        task?: { title?: string; status?: string; visibleStatus?: string };
        title?: string;
        status?: string;
        visibleStatus?: string;
      };
      const task = data.task || data;
      const facts: TaskFacts = {
        kind: "research",
        title: task.title || "科研任务",
        status: task.visibleStatus || task.status || "",
      };
      factsCache.set(id, facts);
      return facts;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    try {
      const response = await researchApi("personalWorkTask", {
        params: { id },
      });
      const task = response.data as {
        title?: string;
        status?: string;
        summaryOnly?: boolean;
      };
      const facts: TaskFacts = {
        kind: "personal",
        title: task.summaryOnly ? "协作任务" : task.title || "协作任务",
        status: task.summaryOnly ? "" : task.status || "",
      };
      factsCache.set(id, facts);
      return facts;
    } catch (error) {
      if ((error as { status?: number }).status !== 404) throw error;
    }
    return { kind: "unknown" };
  })();
  factsInFlight.set(id, job);
  try {
    return await job;
  } finally {
    factsInFlight.delete(id);
  }
}

function useTaskFacts(resource: ChatResource) {
  const id = resource.ref.id;
  const [facts, setFacts] = useState<TaskFacts | undefined>(() => factsCache.get(id));
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    setFacts(factsCache.get(id));
    setFailed(false);
    void readTaskFacts(id).then(
      (value) => {
        if (active) setFacts(value);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [id, resource.ref.version]);
  return { facts, failed };
}

function TaskCardBody({ resource }: { resource: ChatResource }) {
  const navigate = useNavigate();
  const { facts, failed } = useTaskFacts(resource);
  const known = facts && facts.kind !== "unknown" ? facts : undefined;
  const unreadable = facts?.kind === "unknown";
  const title =
    known?.title ||
    (unreadable
      ? "任务详情需在待办中查看"
      : failed
      ? "任务暂时无法读取"
      : "正在读取任务…");
  const status = known ? taskStatusLabel(known.status) : "";
  const open = () =>
    known
      ? navigate(workbenchTaskPath(resource.ref.id, known.kind))
      : navigate("/workbench?view=tasks");
  return (
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{title}</p>
        {status && <p className="text-xs text-slate-500">{status}</p>}
      </div>
      <Button size="small" onClick={open}>
        {known ? "查看任务" : "去任务待办"}
      </Button>
    </div>
  );
}

/**
 * Renders a task reference as one clickable card. When the whole service
 * message is the invitation, the sentence and the action stay in a single card
 * instead of repeating the task title twice.
 */
export function ResearchTaskCard({
  resource,
  text,
}: {
  resource: ChatResource;
  text?: string;
}) {
  if (text)
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] font-medium text-slate-500">任务邀请</p>
        <SafeMessageMarkdown text={text} />
        <div className="border-t border-slate-200 pt-2">
          <TaskCardBody resource={resource} />
        </div>
      </div>
    );
  return (
    <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <TaskCardBody resource={resource} />
    </div>
  );
}

/**
 * A server that predates task references on notices still sends the invitation
 * as text. Keep it one card with a way into the inbox rather than a dead
 * sentence, and say plainly that the exact task is opened there.
 */
export function LegacyTaskInviteCard({ text }: { text: string }) {
  const navigate = useNavigate();
  return (
    <div className="mt-2 space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-medium text-slate-500">任务邀请</p>
      <SafeMessageMarkdown text={text} />
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
        <p className="min-w-0 text-xs text-slate-500">具体范围与时间在任务待办中查看</p>
        <Button size="small" onClick={() => navigate("/workbench?view=tasks")}>
          去任务待办
        </Button>
      </div>
    </div>
  );
}
