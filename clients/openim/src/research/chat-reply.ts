import { create } from "zustand";
import { MessageType, type MessageItem } from "@openim/wasm-client-sdk";
import { assistantReplyText, type ChatMessage } from "@research-agent-platform/contracts";
import { useConversationStore } from "@/store";
import { useResearchStore } from "./store";

type CoordinatorDirectory = Pick<ReturnType<typeof useResearchStore.getState>, "session" | "contacts">;

function isCoordinatorSdkSender(sendID: string | undefined, { session, contacts }: CoordinatorDirectory) {
  return !!sendID && (session?.coordinator?.peerUserID === sendID ||
    contacts.some(({ userID, contact }) => userID === sendID && contact.profile.role === "coordinator"));
}

export function useCoordinatorSdkSender(sendID?: string) {
  return useResearchStore((state) => isCoordinatorSdkSender(sendID, state));
}

export function isCoordinatorChatContact(senderContactId: string | null | undefined, { contacts }: CoordinatorDirectory) {
  return !!senderContactId && contacts.some(({ contact }) =>
    contact.id === senderContactId && contact.profile.role === "coordinator",
  );
}

export function canonicalChatText(
  message: Pick<ChatMessage, "text" | "origin" | "senderContactId">,
  coordinator?: boolean,
) {
  const text = message.text || "";
  return message.origin === "model"
    ? coordinatorChatText(text, message.senderContactId, coordinator)
    : text;
}

export function coordinatorChatText(text: string, senderContactId?: string | null, coordinator?: boolean) {
  return (coordinator ?? isCoordinatorChatContact(senderContactId, useResearchStore.getState()))
    ? assistantReplyText(text)
    : text;
}

export function readableMessage(message: MessageItem, coordinator?: boolean): string {
  let text: string | undefined;
  if (message.contentType === MessageType.TextMessage || message.contentType === MessageType.AtTextMessage)
    text = message.textElem?.content ?? message.atTextElem?.text;
  if (message.contentType === MessageType.QuoteMessage) text = message.quoteElem?.text;
  if (text !== undefined)
    return (coordinator ?? isCoordinatorSdkSender(message.sendID, useResearchStore.getState()))
      ? assistantReplyText(text)
      : text;
  if (message.contentType === MessageType.FileMessage)
    return `[文件] ${message.fileElem?.fileName || "文件"}`;
  if (message.contentType === MessageType.PictureMessage) return "[图片]";
  if (message.contentType === MessageType.FaceMessage) return "[贴纸]";
  if (message.contentType === MessageType.VoiceMessage) return "[语音]";
  return "";
}
export type ReplyAgent = { contactId: string; displayName: string };
export type ChatReply = {
  message?: MessageItem;
  text: string;
  sender: string;
  agent?: ReplyAgent;
  canonicalId?: string;
};
export const useChatReply = create<{
  replies: Record<string, ChatReply>;
  notice: string;
}>(() => ({
  replies: {},
  notice: "",
}));
export const replyKey = (generation: number, id: string) => `${generation}:${id}`;
export function selectChatReply(
  message: MessageItem,
  text = readableMessage(message),
  expectedID?: string,
  expectedGeneration?: number,
  agent?: ReplyAgent,
) {
  const id = useConversationStore.getState().currentConversation?.conversationID;
  if (
    !id ||
    !text ||
    (expectedID !== undefined && expectedID !== id) ||
    (expectedGeneration !== undefined &&
      expectedGeneration !== useResearchStore.getState().generation)
  )
    return;
  const key = replyKey(useResearchStore.getState().generation, id);
  // Retain the real SDK source, including a quoted source's original content.
  // Oversized sources use explicit readable context instead of an invalid SDK quote.
  let source: MessageItem | undefined;
  try {
    if (JSON.stringify(message).length <= 64000)
      source = JSON.parse(JSON.stringify(message));
  } catch {
    /* Fall back to readable text. */
  }
  useChatReply.setState((s) => ({
    replies: {
      ...s.replies,
      [key]: {
        message: source,
        text: excerpt(text),
        sender: message.senderNickname || "成员",
        agent,
      },
    },
  }));
}
export function clearChatReplyAgent(key: string) {
  useChatReply.setState((s) =>
    s.replies[key]
      ? { replies: { ...s.replies, [key]: { ...s.replies[key], agent: undefined } } }
      : s,
  );
}
export function clearChatReply(key: string) {
  useChatReply.setState((s) => {
    const replies = { ...s.replies };
    delete replies[key];
    return { replies };
  });
}
export function selectCanonicalChatReply(
  text: string,
  sender: string,
  expectedID?: string,
  expectedGeneration?: number,
  canonicalId?: string,
  agent?: ReplyAgent,
) {
  const id = useConversationStore.getState().currentConversation?.conversationID;
  if (
    !id ||
    !text ||
    (expectedID !== undefined && expectedID !== id) ||
    (expectedGeneration !== undefined &&
      expectedGeneration !== useResearchStore.getState().generation)
  )
    return;
  const key = replyKey(useResearchStore.getState().generation, id);
  useChatReply.setState((s) => ({
    replies: {
      ...s.replies,
      [key]: { text: excerpt(text), sender, canonicalId, agent },
    },
  }));
}
const excerpt = (text: string) =>
  text.length > 2000 ? `${text.slice(0, 2000)}\n…（引用节选）` : text;
// Unsent quoted drafts share the text draft's tab-only lifetime. No auto-send.
const quoteStorage = "acceptcat-chat-quotes-v1";
let restoring = false,
  hydratedActor: string | undefined;
function forgetQuotes() {
  try {
    sessionStorage.removeItem(quoteStorage);
  } catch {
    /* Optional storage. */
  }
}
function persistQuotes(actor = useResearchStore.getState()) {
  if (
    restoring ||
    !actor.actor ||
    actor.sessionActorId !== actor.actor.member.id ||
    hydratedActor !== actor.actor.member.id
  )
    return;
  try {
    const prefix = `${actor.generation}:`;
    const replies = Object.entries(useChatReply.getState().replies)
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, value]) => [key.slice(prefix.length), value]);
    const raw = JSON.stringify({
      memberId: actor.actor.member.id,
      at: Date.now(),
      replies,
    });
    if (replies.length > 50 || raw.length > 256000)
      throw new Error("quote storage limit");
    sessionStorage.setItem(quoteStorage, raw);
  } catch {
    forgetQuotes();
    useChatReply.setState({
      notice: "引用草稿暂未保存，请勿刷新；发送后可从聊天记录重新引用。",
    });
  }
}
function restoreQuotes(actor = useResearchStore.getState()) {
  const memberId = actor.actor?.member.id;
  if (!memberId || actor.sessionActorId !== memberId || hydratedActor === memberId)
    return;
  hydratedActor = memberId;
  restoring = true;
  try {
    const raw = sessionStorage.getItem(quoteStorage);
    if (!raw) return;
    if (raw.length > 256000) throw new Error("oversized quote storage");
    const value = JSON.parse(raw);
    if (value.memberId !== memberId) {
      forgetQuotes();
      return;
    }
    if (
      !Number.isFinite(value.at) ||
      value.at > Date.now() + 60000 ||
      Date.now() - value.at > 86400000 ||
      !Array.isArray(value.replies) ||
      value.replies.length > 50
    )
      throw new Error("invalid quote storage");
    const replies: Record<string, ChatReply> = {};
    const bounded = (v: unknown, n: number) =>
      typeof v === "string" && v.length > 0 && v.length <= n;
    for (const entry of value.replies) {
      if (!Array.isArray(entry) || entry.length !== 2 || !bounded(entry[0], 512))
        throw new Error("invalid quote key");
      const q = entry[1];
      if (
        !q ||
        !bounded(q.text, 2100) ||
        !bounded(q.sender, 512) ||
        (q.canonicalId && !bounded(q.canonicalId, 512)) ||
        (q.agent &&
          (!bounded(q.agent.contactId, 512) || !bounded(q.agent.displayName, 512))) ||
        (q.message &&
          (!bounded(q.message.clientMsgID, 512) ||
            !Number.isInteger(q.message.contentType) ||
            JSON.stringify(q.message).length > 64000))
      )
        throw new Error("invalid quote");
      replies[replyKey(actor.generation, entry[0])] = {
        text: q.text,
        sender: q.sender,
        message: q.message,
        canonicalId: q.canonicalId,
        agent: q.agent,
      };
    }
    useChatReply.setState({ replies, notice: "" });
  } catch {
    forgetQuotes();
    useChatReply.setState({
      notice: "上次引用草稿已过期或无法读取，请重新引用原消息。",
    });
  } finally {
    restoring = false;
  }
}
useChatReply.subscribe((next, previous) => {
  if (next.replies !== previous.replies) persistQuotes();
});
useResearchStore.subscribe((next, previous) => {
  if (
    next.generation !== previous.generation ||
    next.actor?.member.id !== previous.actor?.member.id
  ) {
    persistQuotes(previous);
    if (previous.actor?.member.id && previous.actor.member.id !== next.actor?.member.id)
      forgetQuotes();
    restoring = true;
    useChatReply.setState({ replies: {}, notice: "" });
    restoring = false;
    hydratedActor = undefined;
  }
  restoreQuotes(next);
});
restoreQuotes();
