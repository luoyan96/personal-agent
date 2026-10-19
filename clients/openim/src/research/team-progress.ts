import type {
  ResearchWorkspaceRow,
  ResponseFor,
} from "@research-agent-platform/contracts";
import { isFullTask, teamTaskStatus } from "./research-team";

type WorkspacePage = ResponseFor<"researchWorkspace">;
type PageQuery = { cursor?: string; snapshot?: string; limit: number };

// Read one revision atomically. Never present a partial/repeated page as a whole
// team's progress, and let the owning hook cancel account/scope changes.
export async function collectTeamWorkspace(
  read: (query: PageQuery, signal: AbortSignal) => Promise<WorkspacePage>,
  signal: AbortSignal,
) {
  const rows: ResearchWorkspaceRow[] = [],
    cursors = new Set<string>(),
    ids = new Set<string>();
  let first: WorkspacePage | undefined, cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    signal.throwIfAborted();
    const result = await read(
      { limit: 100, cursor, snapshot: first?.snapshot.token },
      signal,
    );
    signal.throwIfAborted();
    if (first && result.snapshot.token !== first.snapshot.token)
      throw new Error("任务在读取期间发生变化，请重新读取进度。");
    first ??= result;
    for (const row of result.data) {
      if (ids.has(row.task.id)) throw new Error("任务分页重复，请重新读取进度。");
      ids.add(row.task.id);
      rows.push(row);
    }
    if (!result.nextCursor)
      return { ...first, data: rows, nextCursor: null, truncated: false };
    if (cursors.has(result.nextCursor))
      throw new Error("任务分页重复，请重新读取进度。");
    cursors.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  return { ...first!, data: rows, nextCursor: cursor, truncated: true };
}

export function isAcceptedResult(row: ResearchWorkspaceRow) {
  return (
    teamTaskStatus(row.task) === "completed" &&
    row.latestDeliverable?.review?.decision === "accepted"
  );
}

export type TeamDirection = {
  id: string;
  title: string;
  ownGoal: boolean;
  progressVisible: boolean;
  rows: ResearchWorkspaceRow[];
  stage: "planned" | "active" | "closed";
  accepted: number;
  total: number;
  cancelled: number;
};

function orderedRows(rows: ResearchWorkspaceRow[]) {
  const byId = new Map(rows.map((row) => [row.task.id, row]));
  const visited = new Set<string>(),
    ordered: ResearchWorkspaceRow[] = [];
  const visit = (row: ResearchWorkspaceRow) => {
    if (visited.has(row.task.id)) return;
    visited.add(row.task.id);
    if (isFullTask(row.task))
      for (const dependency of row.task.dependencies) {
        const before = byId.get(dependency.taskId);
        if (before) visit(before);
      }
    ordered.push(row);
  };
  for (const row of rows) visit(row);
  return ordered;
}

export function teamDirections(rows: ResearchWorkspaceRow[]): TeamDirection[] {
  const groups = new Map<string, ResearchWorkspaceRow[]>();
  for (const row of rows) {
    // A claim/invitation summary has no plan ID. Do not infer its private plan
    // from matching titles, people, or nearby items.
    const id = isFullTask(row.task) ? `plan:${row.task.planId}` : `task:${row.task.id}`;
    groups.set(id, [...(groups.get(id) || []), row]);
  }
  return Array.from(groups, ([id, grouped]) => {
    grouped = orderedRows(grouped);
    const ownGoal = grouped.find((r) => r.planGoal)?.planGoal;
    const cancelled = grouped.filter(
      (r) => teamTaskStatus(r.task) === "cancelled",
    ).length;
    const statuses = grouped.map((r) => teamTaskStatus(r.task));
    return {
      id,
      title:
        ownGoal ||
        `${grouped[0].task.title}${
          grouped.length > 1 ? `等 ${grouped.length} 项任务` : ""
        }`,
      ownGoal: !!ownGoal,
      progressVisible: grouped.every((row) => isFullTask(row.task)),
      rows: grouped,
      stage: statuses.every((s) => s === "completed" || s === "cancelled")
        ? "closed"
        : statuses.every((s) =>
            ["unassigned", "awaiting_acceptance", "ready", "cancelled"].includes(s),
          )
        ? "planned"
        : "active",
      accepted: grouped.filter(isAcceptedResult).length,
      total: grouped.length - cancelled,
      cancelled,
    };
  });
}
