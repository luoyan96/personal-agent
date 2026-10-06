import type { MessageItem } from "@openim/wasm-client-sdk";
import type { ConversationItem } from "@openim/wasm-client-sdk/lib/types/entity";
import { useConversationStore } from "@/store";
import type { SendMessageParams } from "@/pages/chat/queryChat/ChatFooter/useSendMessage";
import { feedbackToast } from "@/utils/common";
import { researchMode } from "./api";
import { useResearchStore } from "./store";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "./useAgentChatOperation";

export type SelectedFileKind = "image" | "file" | "auto";
export type SentFileContext = {
  file: File;
  conversation: ConversationItem;
  operation: AgentChatOperation;
  isCurrent: () => boolean;
  agentConversationId?: string;
  sdkClientMsgID?: string;
};

/** Menu and drop send the same original File to the captured SDK conversation. */
export function useScopedFileSender({
  getImageMessage,
  getFileMessage,
  sendMessage,
  onFileSent,
}: {
  getImageMessage: (file: File) => Promise<MessageItem>;
  getFileMessage: (file: File) => Promise<MessageItem>;
  sendMessage: (params: SendMessageParams) => Promise<void>;
  onFileSent: (context: SentFileContext) => Promise<void>;
}) {
  const capture = useAgentChatOperation();
  return async (
    file: File,
    kind: SelectedFileKind = "auto",
    selectionIsCurrent: () => boolean = () => true,
  ) => {
    const conversation = useConversationStore.getState().currentConversation;
    if (!conversation || !selectionIsCurrent()) return false;
    const operation = capture();
    const isCurrent = () => operation.isCurrent() && selectionIsCurrent();
    const research = useResearchStore.getState();
    const mapping = research.mappings.find(
      (item) => item.imConversationID === conversation.conversationID,
    );
    const peer = research.contacts.find((item) => item.userID === conversation.userID)?.contact;
    const agentConversationId =
      researchMode && mapping && mapping.kind !== "group" && peer &&
      peer.identity.kind !== "human" && !peer.agentRuntime && peer.allowedActions.includes("chat")
        ? mapping.researchConversationId
        : undefined;
    const image = kind === "image" || (kind === "auto" && file.type.startsWith("image/"));
    try {
      const message = await (image ? getImageMessage(file) : getFileMessage(file));
      if (!isCurrent()) return false;
      if (peer?.agentRuntime) feedbackToast({ msg: "文件已发送；本站外部接入只转发逐条授权的文字，不会读取或转发本站的图片、语音或附件。" });
      await sendMessage({
        message,
        recvID: conversation.userID,
        groupID: conversation.groupID,
      });
      if (!isCurrent()) return false;
      if (!image)
        await onFileSent({ file, conversation, operation, isCurrent, agentConversationId, sdkClientMsgID: message.clientMsgID });
      return true;
    } catch (error) {
      if (isCurrent())
        feedbackToast({ error, msg: "文件发送失败，请检查连接后重试" });
      return false;
    } finally {
      operation.dispose();
    }
  };
}
