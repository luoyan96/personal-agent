/** Where the visible transcript came from, as far as the reader can tell. */
export type HistorySource = "" | "cache" | "connecting" | "offline";

/**
 * The one line above the transcript. It may only claim what is known: an
 * offline machine, a transcript read from this machine, or a connection still
 * being established. "Not loaded yet" is not an outage, and telling people it
 * is sends them chasing a network problem that does not exist.
 */
export function historyNotice(source: HistorySource, online: boolean): string {
  if (source === "cache") return "正在显示本机缓存，联网后会自动核对。";
  if (source === "offline" && !online) return "当前无法联网，这段会话本机还没有缓存。";
  if (source === "offline" || source === "connecting") return "正在连接服务器…";
  return "";
}
