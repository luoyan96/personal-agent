import {
  MessageItem,
  MessageStatus,
  SendMessageParams as SdkSendMessageParams,
} from "@openim/wasm-client-sdk";
import { useCallback } from "react";

import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore, useUserStore } from "@/store";
import { emit } from "@/utils/events";

import { pushNewMessage, updateOneMessage } from "../useHistoryMessageList";

export type SendMessageParams = Partial<Omit<SdkSendMessageParams, "message">> & {
  message: MessageItem;
  needPush?: boolean;
  isCurrent?: () => boolean;
};

export function useSendMessage() {
  const sendMessage = useCallback(
    async ({
      recvID,
      groupID,
      message,
      needPush,
      isCurrent = () => true,
    }: SendMessageParams) => {
      if (!isCurrent()) throw new Error("会话已切换，请返回原会话核对后发送");
      const actor = useUserStore.getState().selfInfo.userID;
      if (!actor || message.sendID !== actor)
        throw new Error("发送身份已变化，请重新选择文件或录音后发送");
      const currentConversation = useConversationStore.getState().currentConversation;
      const sourceID = recvID || groupID;
      const inCurrentConversation =
        currentConversation?.userID === sourceID ||
        currentConversation?.groupID === sourceID ||
        !sourceID;
      needPush = needPush ?? inCurrentConversation;

      if (needPush) {
        pushNewMessage(message);
        updateOneMessage({ ...message, status: MessageStatus.Sending });
        emit("CHAT_LIST_SCROLL_TO_BOTTOM");
      }

      const options = {
        recvID: recvID ?? currentConversation?.userID ?? "",
        groupID: groupID ?? currentConversation?.groupID ?? "",
        message,
      };

      try {
        const { data: successMessage } = await IMSDK.sendMessage(options);
        if (isCurrent()) updateOneMessage(successMessage);
      } catch (error) {
        if (isCurrent())
          updateOneMessage({
            ...message,
            status: MessageStatus.Failed,
          });
        throw error;
      }
    },
    [],
  );

  return {
    sendMessage,
  };
}
