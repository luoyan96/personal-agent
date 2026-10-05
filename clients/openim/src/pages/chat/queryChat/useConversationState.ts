import { useLatest, useUpdateEffect } from "ahooks";
import { useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";

import { IMSDK } from "@/layout/MainContentWrap";
import { useResearchStore } from "@/research/store";
import { useConversationStore, useUserStore } from "@/store";
import { feedbackToast } from "@/utils/common";

export default function useConversationState() {
  const { conversationID } = useParams();
  const latestRouteID = useLatest(conversationID);
  const sdkReady = useUserStore(
    (state) =>
      !state.isLogining &&
      state.connectState === "success" &&
      state.syncState === "success" &&
      Boolean(state.selfInfo.userID),
  );
  const latestSdkReady = useLatest(sdkReady);
  const mounted = useRef(true);
  const currentConversation = useConversationStore(
    (state) => state.currentConversation,
  );
  const latestCurrentConversation = useLatest(currentConversation);
  const throttleTimer = useRef<ReturnType<typeof setTimeout>>();

  const checkConversationState = useCallback(() => {
    const conversation = latestCurrentConversation.current;
    if (
      !conversation ||
      conversation.conversationID !== latestRouteID.current ||
      !latestSdkReady.current
    )
      return;

    if (conversation.unreadCount > 0) {
      const generation = useResearchStore.getState().generation;
      const userID = useUserStore.getState().selfInfo.userID;
      void IMSDK.markConversationMessageAsRead(conversation.conversationID).catch(
        (error) => {
          if (
            !mounted.current ||
            !latestSdkReady.current ||
            latestCurrentConversation.current?.conversationID !==
              conversation.conversationID ||
            generation !== useResearchStore.getState().generation ||
            userID !== useUserStore.getState().selfInfo.userID
          )
            return;
          feedbackToast({ error, msg: "已读状态同步失败，将在会话更新后重试" });
        },
      );
    }
  }, [latestCurrentConversation, latestSdkReady, latestRouteID]);

  const throttleCheckConversationState = useCallback(() => {
    clearTimeout(throttleTimer.current);
    throttleTimer.current = setTimeout(checkConversationState, 2000);
  }, [checkConversationState]);

  useUpdateEffect(() => {
    if (sdkReady) {
      checkConversationState();
    }
  }, [checkConversationState, sdkReady]);

  useUpdateEffect(() => {
    throttleCheckConversationState();
  }, [currentConversation?.unreadCount, throttleCheckConversationState]);

  useEffect(() => {
    checkConversationState();
  }, [checkConversationState, currentConversation?.conversationID]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(throttleTimer.current);
    };
  }, []);

  return {
    currentConversation,
  };
}
