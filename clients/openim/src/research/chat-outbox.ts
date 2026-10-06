import { create } from "zustand";
import type { MessageItem } from "@openim/wasm-client-sdk";
import type { PreparedResearchSend } from "./ResearchComposer";
import { useResearchStore } from "./store";
import { routes } from "@research-agent-platform/contracts";

export type ChatSubmission = {
  id: string;
  generation: number;
  conversationID: string;
  recvID: string;
  groupID: string;
  html: string;
  text: string;
  request?: PreparedResearchSend;
  nativeMessage?: MessageItem;
  state: "queued" | "sending" | "failed" | "paused";
  error?: string;
};
// This tab's bounded sessionStorage restores unsent text as paused, never sends
// automatically, and is cleared at logout/account change. No credentials.
export const chatDrafts = new Map<string, string>();
export const useChatOutbox = create<{ items: ChatSubmission[]; notice: string }>(
  () => ({ items: [], notice: "" }),
);
export function updateSubmission(id: string, patch: Partial<ChatSubmission>) {
  useChatOutbox.setState((s) => ({
    items: s.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
  }));
}
export function removeSubmission(id: string) {
  useChatOutbox.setState((s) => ({ items: s.items.filter((item) => item.id !== id) }));
}
const storageKey = "research-chat-pending-v1",
  maxBytes = 512 * 1024,
  maxAge = 24 * 60 * 60 * 1000;
let hydratedActor: string | undefined;
const notice = (message: string) => useChatOutbox.setState({ notice: message });
function removeStored() {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* Storage can be disabled. */
  }
}
function persist(actor = useResearchStore.getState()) {
  if (
    !actor.actor ||
    actor.sessionActorId !== actor.actor.member.id ||
    hydratedActor !== actor.actor.member.id
  )
    return;
  try {
    const items = useChatOutbox
      .getState()
      .items.filter((item) => item.generation === actor.generation);
    const value = JSON.stringify({
      version: 1,
      memberId: hydratedActor,
      storedAt: Date.now(),
      items: items.map(({ generation: _generation, ...item }) => ({
        ...item,
        state: "paused",
      })),
      drafts: [...chatDrafts],
    });
    if (
      new TextEncoder().encode(value).byteLength > maxBytes ||
      items.length > 50 ||
      chatDrafts.size > 50
    )
      throw new Error("Storage limit");
    sessionStorage.setItem(storageKey, value);
  } catch {
    removeStored();
    notice("浏览器未能保存待发内容；目前仅在本页保留，请勿刷新，并先处理发送记录。");
  }
}
export function saveChatDraft(id: string, html: string) {
  if (html) chatDrafts.set(id, html);
  else chatDrafts.delete(id);
  persist();
}
function restore(actor: ReturnType<typeof useResearchStore.getState>) {
  const memberId = actor.actor?.member.id;
  if (!memberId || actor.sessionActorId !== memberId || hydratedActor === memberId)
    return;
  hydratedActor = memberId;
  let items: ChatSubmission[] = [];
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return;
    if (new TextEncoder().encode(raw).byteLength > maxBytes)
      throw new Error("Oversized storage");
    const stored = JSON.parse(raw);
    if (stored.memberId !== memberId) {
      removeStored();
      return;
    }
    if (
      stored.version !== 1 ||
      !Number.isFinite(stored.storedAt) ||
      Date.now() - stored.storedAt > maxAge ||
      stored.storedAt > Date.now() + 60000 ||
      !Array.isArray(stored.items) ||
      stored.items.length > 50 ||
      !Array.isArray(stored.drafts) ||
      stored.drafts.length > 50
    )
      throw new Error("Expired or invalid storage");
    const bounded = (v: unknown, limit: number) =>
      typeof v === "string" && v.length <= limit;
    const ids = new Set<string>();
    for (const item of stored.items) {
      if (
        !bounded(item.id, 128) ||
        !/^[a-zA-Z0-9_-]+$/.test(item.id) ||
        ids.has(item.id) ||
        !bounded(item.conversationID, 512) ||
        !item.conversationID ||
        !bounded(item.recvID, 512) ||
        !bounded(item.groupID, 512) ||
        !bounded(item.html, maxBytes) ||
        !bounded(item.text, maxBytes) ||
        !item.text
      )
        throw new Error("Invalid pending message");
      ids.add(item.id);
      if (
        item.request &&
        (!["agentChatMessage", "sendChatMessage"].includes(item.request.route) ||
          typeof item.request.conversationId !== "string" ||
          !routes[
            item.request.route as "agentChatMessage" | "sendChatMessage"
          ].request.shape.body.safeParse(item.request.body).success ||
          item.request.body.text !== item.text)
      )
        throw new Error("Invalid stored request");
      if (
        item.nativeMessage &&
        (item.nativeMessage.contentType !== 101 ||
          typeof item.nativeMessage.clientMsgID !== "string" ||
          item.nativeMessage.textElem?.content !== item.text)
      )
        throw new Error("Invalid native draft");
      items.push({
        ...item,
        generation: actor.generation,
        state: "paused",
        error: "刷新前的发送结果尚未确认；重试会核对原请求，不会自动发送。",
      });
    }
    for (const draft of stored.drafts) {
      if (
        !Array.isArray(draft) ||
        draft.length !== 2 ||
        !bounded(draft[0], 512) ||
        !bounded(draft[1], maxBytes)
      )
        throw new Error("Invalid draft");
    }
    for (const [id, html] of stored.drafts) chatDrafts.set(id, html);
    useChatOutbox.setState({ items });
  } catch {
    chatDrafts.clear();
    removeStored();
    useChatOutbox.setState({ items: [] });
    notice(
      "上次待发记录已过期、损坏或无法读取；请核对聊天记录后重新输入。已发送消息不受影响。",
    );
  }
}
useChatOutbox.subscribe((next, previous) => {
  if (next.items !== previous.items) persist();
});
useResearchStore.subscribe((next, previous) => {
  if (
    next.generation !== previous.generation ||
    next.actor?.member.id !== previous.actor?.member.id
  ) {
    const previousId = previous.actor?.member.id;
    if (previousId && previousId !== next.actor?.member.id) {
      removeStored();
      hydratedActor = undefined;
    }
    // Reconnect of the same actor may rebind generation but never auto-send.
    if (previousId && previousId === next.actor?.member.id) {
      persist(previous);
      hydratedActor = undefined;
    }
    chatDrafts.clear();
    useChatOutbox.setState({ items: [], notice: "" });
  }
  restore(next);
});
restore(useResearchStore.getState());
