import type { AgentTurnProgress } from "@research-agent-platform/contracts";

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
