import type { AgentTurn, AgentTurnProgress } from "@research-agent-platform/contracts";

export function isPendingAgentReply(status: AgentTurn["status"] | undefined) {
  return status === "queued" || status === "running";
}

export type ProgressReadState = {
  canonicalSeen?: string;
  progress?: AgentTurnProgress;
  error?: string;
  validation?: string;
  checkedAt?: number;
};

/** Terminal progress still needs one authorized read after remount/navigation. */
export function progressNeedsRead(entry: ProgressReadState, token: string, now = Date.now()) {
  if (entry.canonicalSeen) return false;
  if (entry.validation !== token) return true;
  if (!entry.error && (entry.progress?.phase === "superseded" || entry.progress?.phase === "stopped")) return false;
  return !((entry.error || entry.progress?.phase === "final") && now - (entry.checkedAt || 0) < 5000);
}
