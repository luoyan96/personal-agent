import { create } from "zustand";
import type { MessageItem } from "@openim/wasm-client-sdk";
import type { PreparedResearchSend } from "./ResearchComposer";
import { useResearchStore } from "./store";
import { routes, ChatMessage, AgentTurn } from "@research-agent-platform/contracts";
import type { ComposerImage } from "./chat-image-submission";

export type ChatSubmission = {
  id: string;
  generation: number;
  conversationID: string;
  recvID: string;
  groupID: string;
  html: string;
  text: string;
  request?: PreparedResearchSend;
  images?: ComposerImage[];
  files?: (ComposerImage & { processed?: boolean })[];
  imageAgentConversationId?: string;
  nativeMessage?: MessageItem;
  quoteMessage?: MessageItem;
  state: "queued" | "sending" | "failed" | "paused" | "acknowledged";
  receipt?: { message: ChatMessage; turns: AgentTurn[] };
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
export function pendingSubmissions(items: ChatSubmission[], generation: number, conversationID?: string) {
  return items.filter(item => item.generation === generation && (conversationID === undefined || item.conversationID === conversationID) && item.state !== "acknowledged");
}
/** Server-persisted receipts never consume the capacity reserved for unsent work. */
export function assertSubmissionCapacity(items: ChatSubmission[], generation: number, conversationID: string) {
  const pending = pendingSubmissions(items, generation);
  if (pending.length >= 50 || pending.filter(item => item.conversationID === conversationID).length >= 20)
    throw new Error("还有较多消息未发送，请先处理发送记录。");
}
/** A real SDK pointer replaces its API receipt; text equality never deduplicates sends. */
export function reconcileAcknowledgedMessages(generation: number, conversationID: string, messageIds: Set<string>) {
  if (generation !== useResearchStore.getState().generation) return;
  const items = useChatOutbox.getState().items;
  const next = items.filter(item => !(item.generation === generation && item.conversationID === conversationID && item.state === "acknowledged" && item.receipt && messageIds.has(item.receipt.message.id)));
  if (next.length !== items.length) useChatOutbox.setState({ items: next });
}
const storageKey = "research-chat-pending-v1",
  maxBytes = 512 * 1024,
  maxAge = 24 * 60 * 60 * 1000;
let hydratedActor: string | undefined;
let pruningReceipts = false;
const receiptNotice = "较早的已保存回执已收起；同步后可在聊天记录中查看。待发内容保留。";
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
    let items = useChatOutbox
      .getState()
      .items.filter((item) => item.generation === actor.generation);
    const serialize = () => JSON.stringify({
      version: 1,
      memberId: hydratedActor,
      storedAt: Date.now(),
      items: items.map(({ generation: _generation, images, files, ...item }) => ({
        ...item,
        ...(images
          ? { images: images.map(({ file: _file, ocrText: _ocr, ...image }) => image) }
          : {}),
        ...(files ? { files: files.map(({ file: _file, ...entry }) => entry) } : {}),
        state: item.state === "acknowledged" ? "acknowledged" : "paused",
      })),
      drafts: [...chatDrafts],
    });
    // Only temporary HTTP success receipts may be discarded. Original pending
    // requests, their idempotency keys and drafts always take precedence.
    const dropped = new Set<string>();
    const dropOldestReceipt = () => {
      const oldest = items.find(item => item.state === "acknowledged");
      if (!oldest) return false;
      dropped.add(oldest.id);
      items = items.filter(item => item !== oldest);
      return true;
    };
    while (items.filter(item => item.state === "acknowledged").length > 50)
      dropOldestReceipt();
    let value = serialize();
    while (new TextEncoder().encode(value).byteLength > maxBytes && dropOldestReceipt())
      value = serialize();
    const publishPrunedReceipts = () => {
      if (!dropped.size) return;
      pruningReceipts = true;
      try {
        useChatOutbox.setState(s => ({
          items: s.items.filter(item => !dropped.has(item.id)),
          notice: receiptNotice,
        }));
      } finally {
        pruningReceipts = false;
      }
    };
    publishPrunedReceipts();
    if (
      new TextEncoder().encode(value).byteLength > maxBytes ||
      items.filter(item => item.state !== "acknowledged").length > 50 ||
      chatDrafts.size > 50
    )
      throw new Error("Storage limit");
    // Browser quota may be lower than our byte bound. Retry without success
    // receipts before reporting that pending content cannot be persisted.
    for (;;) {
      try {
        sessionStorage.setItem(storageKey, value);
        break;
      } catch (error) {
        if (!dropOldestReceipt()) throw error;
        value = serialize();
        publishPrunedReceipts();
      }
    }
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
      stored.items.length > 100 ||
      stored.items.filter((item: ChatSubmission) => item?.state === "acknowledged").length > 50 ||
      stored.items.filter((item: ChatSubmission) => item?.state !== "acknowledged").length > 50 ||
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
        (!item.text && !item.images?.length && !item.files?.length)
      )
        throw new Error("Invalid pending message");
      ids.add(item.id);
      if (item.state === "acknowledged") {
        const message = ChatMessage.parse(item.receipt?.message);
        const turns = AgentTurn.array().max(5).parse(item.receipt?.turns);
        if (
          !item.request || message.origin !== "human" || message.conversationId !== item.request.conversationId ||
          // A replayed continuous-batch receipt keeps the original message but
          // returns the shared turn's latest inputMessageId, not necessarily this one.
          turns.some(turn => turn.conversationId !== message.conversationId)
        ) throw new Error("Invalid acknowledged message");
      } else if (item.receipt) throw new Error("Unexpected message receipt");
      if (
        item.request &&
        (!["agentChatMessage", "sendChatMessage", "agentFileMessage"].includes(
          item.request.route,
        ) ||
          typeof item.request.conversationId !== "string" ||
          !routes[
            item.request.route as
              | "agentChatMessage"
              | "sendChatMessage"
              | "agentFileMessage"
          ].request.shape.body.safeParse(item.request.body).success ||
          (item.request.route !== "agentFileMessage" &&
            item.request.body.text !== item.text))
      )
        throw new Error("Invalid stored request");
      if (
        item.images &&
        (!Array.isArray(item.images) ||
          !item.images.length ||
          item.images.length > 20 ||
          item.images.some(
            (image: ComposerImage) =>
              !bounded(image.id, 512) ||
              !bounded(image.name, 512) ||
              !Number.isSafeInteger(image.size) ||
              image.size <= 0 ||
              image.size > 10 * 1024 * 1024 ||
              !bounded(image.mediaType, 128) ||
              !image.mediaType.startsWith("image/") ||
              image.file !== undefined ||
              (image.sent !== undefined && typeof image.sent !== "boolean") ||
              (image.message &&
                (image.message.contentType !== 102 ||
                  !bounded(image.message.clientMsgID, 512))),
          ))
      )
        throw new Error("Invalid stored image submission");
      if (
        item.files &&
        (!Array.isArray(item.files) ||
          item.files.length > 20 ||
          item.files.some(
            (f: ComposerImage & { processed?: boolean }) =>
              !bounded(f.id, 512) ||
              !bounded(f.name, 512) ||
              !bounded(f.mediaType, 128) ||
              !Number.isSafeInteger(f.size) ||
              f.size <= 0 ||
              f.file !== undefined ||
              (f.sent !== undefined && typeof f.sent !== "boolean") ||
              (f.processed !== undefined && typeof f.processed !== "boolean") ||
              (f.message &&
                (f.message.contentType !== 105 ||
                  !bounded(f.message.clientMsgID, 512))),
          ))
      )
        throw new Error("Invalid stored file submission");
      if (
        item.imageAgentConversationId &&
        (!item.images ||
          !bounded(item.imageAgentConversationId, 512) ||
          item.request?.conversationId !== item.imageAgentConversationId)
      )
        throw new Error("Invalid image target");
      if (
        item.quoteMessage &&
        (typeof item.quoteMessage.clientMsgID !== "string" ||
          JSON.stringify(item.quoteMessage).length > 64000)
      )
        throw new Error("Invalid quote source");
      if (
        item.nativeMessage &&
        (![101, 114].includes(item.nativeMessage.contentType) ||
          typeof item.nativeMessage.clientMsgID !== "string" ||
          (item.nativeMessage.contentType === 114
            ? !item.quoteMessage ||
              item.nativeMessage.quoteElem?.text !== item.text ||
              item.nativeMessage.quoteElem?.quoteMessage?.clientMsgID !==
                item.quoteMessage.clientMsgID
            : item.nativeMessage.textElem?.content !== item.text))
      )
        throw new Error("Invalid native draft");
      items.push({
        ...item,
        generation: actor.generation,
        state: item.state === "acknowledged" ? "acknowledged" : "paused",
        error: item.state === "acknowledged" ? undefined : "刷新前的发送结果尚未确认；重试会核对原请求，不会自动发送。",
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
  if (!pruningReceipts && next.items !== previous.items) persist();
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
