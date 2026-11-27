/** The last known cache or synchronization state of the transcript. */
export type HistorySource = "" | "cache" | "offline" | "sync-failed";

/**
 * Show a notice for an offline machine or a failed sync. Online cache reads
 * and pending history requests are part of normal loading.
 */
export function historyNotice(source: HistorySource, online: boolean): string {
  // Local reads are the normal path, not a warning or evidence of an outage.
  if (source === "cache")
    return online ? "" : "当前离线，已保存的聊天记录可继续阅读。";
  if (source === "sync-failed")
    return online
      ? "最新消息暂未同步，已保存的聊天记录可继续阅读。"
      : "当前离线，已保存的聊天记录可继续阅读。";
  if (source === "offline" && !online) return "当前无法联网，这段会话本机还没有缓存。";
  return "";
}
