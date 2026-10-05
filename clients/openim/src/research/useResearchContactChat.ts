import { SessionType } from "@openim/wasm-client-sdk";
import { useConversationToggle } from "@/hooks/useConversationToggle";
import { useUserStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";

/** Shared by contact profiles and starters; only open a real, current SDK session. */
export function useResearchContactChat() {
  const { toSpecifiedConversation } = useConversationToggle();
  return async (contactId: string, isCurrent: () => boolean) => {
    if (!isCurrent()) return false;
    const canonical = await researchApi("createDirectConversation", {
      body: { contactId },
    });
    if (!isCurrent()) return false;
    const mapping = await researchApi("imSyncConversation", {
      params: { id: canonical.data.id },
      body: {},
    });
    if (!isCurrent()) return false;
    await useResearchStore.getState().refresh();
    if (!isCurrent()) return false;
    const state = useResearchStore.getState(),
      user = useUserStore.getState();
    if (
      mapping.data.transportStatus !== "ready" ||
      state.session?.status !== "available" ||
      state.sessionActorId !== state.actor?.member.id ||
      state.session.user?.userID !== user.selfInfo.userID ||
      !user.selfInfo.userID ||
      user.isLogining ||
      user.connectState !== "success" ||
      user.syncState !== "success"
    )
      throw new Error("私聊已保存；即时通信暂未连接，连接恢复后可再次点击开始聊天。");
    const target = state.contacts.find((entry) => entry.contact.id === contactId);
    if (!target) throw new Error("聊天目标尚未准备完成，请稍后重试。");
    return await toSpecifiedConversation({
      sourceID: target.userID,
      sessionType: SessionType.Single,
      isCurrent,
    });
  };
}
