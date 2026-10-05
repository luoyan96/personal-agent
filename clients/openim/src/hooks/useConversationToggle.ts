import type { SessionType } from "@openim/wasm-client-sdk";
import { ConversationItem } from "@openim/wasm-client-sdk/lib/types/entity";
import { useCallback, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { researchApi, researchMode } from "@/research/api";
import { useResearchStore } from "@/research/store";
import { ensureResearchConversation } from "@/research/bridge";

export type ToSpecifiedConversationParams = {
  sourceID: string;
  sessionType: SessionType;
  isJump?: boolean;
  isChildWindow?: boolean;
};

const getConversation = async ({
  sourceID,
  sessionType,
}: {
  sourceID: string;
  sessionType: SessionType;
}): Promise<ConversationItem | undefined> => {
  let conversation = useConversationStore
    .getState()
    .conversationList.find(
      (item) => item.userID === sourceID || item.groupID === sourceID,
    );
  if (!conversation) {
    try {
      conversation = (
        await IMSDK.getOneConversation({
          sourceID,
          sessionType,
        })
      ).data;
    } catch (error) {
      feedbackToast({ error });
    }
  }
  return conversation;
};

export function useConversationToggle() {
  const navigate = useNavigate();
  const location = useLocation();
  const route = useRef(location.pathname);
  route.current = location.pathname;
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );

  const toSpecifiedConversation = useCallback(
    async (params: ToSpecifiedConversationParams) => {
      const { sourceID, sessionType, isJump } = params;
      const generation = useResearchStore.getState().generation;
      const actorId = useResearchStore.getState().actor?.member.id;
      const previousID =
        useConversationStore.getState().currentConversation?.conversationID;
      const previousRoute = route.current;
      const isCurrent = () =>
        !researchMode ||
        (useResearchStore.getState().generation === generation &&
          useResearchStore.getState().actor?.member.id === actorId &&
          route.current === previousRoute &&
          useConversationStore.getState().currentConversation?.conversationID ===
            previousID);
      let conversation;
      if (researchMode) {
        if (sessionType === 1) {
          await useResearchStore.getState().refresh();
          if (!isCurrent()) return;
          const contact = useResearchStore
            .getState()
            .contacts.find((c) => c.userID === sourceID)?.contact;
          if (!contact?.allowedActions.includes("chat"))
            throw new Error("请先添加联系人并获得同意，才能私聊");
          const canonical = (
            await researchApi("createDirectConversation", {
              body: { contactId: contact.id },
            })
          ).data;
          if (!isCurrent()) return;
          const mapping = (
            await researchApi("imSyncConversation", {
              params: { id: canonical.id },
              body: {},
            })
          ).data;
          if (!isCurrent()) return;
          await useResearchStore.getState().refresh();
          if (!isCurrent()) return;
          conversation = await ensureResearchConversation(mapping);
        } else {
          const mapping = useResearchStore
            .getState()
            .mappings.find((item) => item.groupID === sourceID);
          if (!mapping) throw new Error("当前没有这个群的科研访问权限");
          conversation = await ensureResearchConversation(mapping);
        }
      } else conversation = await getConversation({ sourceID, sessionType });
      if (
        !isCurrent() ||
        !conversation ||
        useConversationStore.getState().currentConversation?.conversationID ===
          conversation.conversationID
      )
        return;
      await updateCurrentConversation({ ...conversation }, isJump, isCurrent);
      if (
        researchMode &&
        (route.current !== previousRoute ||
          useResearchStore.getState().generation !== generation ||
          useResearchStore.getState().actor?.member.id !== actorId ||
          useConversationStore.getState().currentConversation?.conversationID !==
            conversation.conversationID)
      )
        return;
      navigate(`/chat/${conversation.conversationID}`);
    },
    [navigate, updateCurrentConversation],
  );

  return {
    toSpecifiedConversation,
  };
}
