import { create } from "zustand";
import { MessageType, type MessageItem } from "@openim/wasm-client-sdk";
import { useConversationStore } from "@/store";
import { useResearchStore } from "./store";

export function readableMessage(message: MessageItem): string {
  if (message.contentType === MessageType.TextMessage)
    return message.textElem?.content || "";
  if (message.contentType === MessageType.AtTextMessage)
    return message.atTextElem?.text || "";
  if (message.contentType === MessageType.QuoteMessage)
    return message.quoteElem?.text || "";
  if (message.contentType === MessageType.FileMessage)
    return `[文件] ${message.fileElem?.fileName || "文件"}`;
  if (message.contentType === MessageType.PictureMessage) return "[图片]";
  if (message.contentType === MessageType.VoiceMessage) return "[语音]";
  return "";
}
export type ChatReply = { message?: MessageItem; text: string; sender: string };
export const useChatReply = create<{ replies: Record<string, ChatReply> }>(() => ({
  replies: {},
}));
export const replyKey = (generation: number, id: string) => `${generation}:${id}`;
export function selectChatReply(
  message: MessageItem,
  text = readableMessage(message),
  expectedID?: string,
  expectedGeneration?: number,
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
      },
    },
  }));
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
    replies: { ...s.replies, [key]: { text: excerpt(text), sender } },
  }));
}
const excerpt = (text: string) =>
  text.length > 2000 ? `${text.slice(0, 2000)}\n…（引用节选）` : text;
useResearchStore.subscribe((next, previous) => {
  if (next.generation !== previous.generation) useChatReply.setState({ replies: {} });
});
