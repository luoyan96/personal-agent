import { SessionType } from "@openim/wasm-client-sdk";
import { useConversationToggle } from "@/hooks/useConversationToggle";
import { useUserStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";

/** Shared by contact profiles and starters; only open a real, current SDK session. */
export function useResearchContactChat() {
  const { toSpecifiedConversation } = useConversationToggle();
  return async (
    contactId: string,
    isCurrent: () => boolean,
    options?: { expectedConversationId?: string; onTarget?: (imID: string) => void; requireOwnLocal?: boolean },
  ) => {
    if (!isCurrent()) return false;
    const canonical = await researchApi("createDirectConversation", {
      body: { contactId },
    });
    if (!isCurrent()) return false;
    if (
      options?.expectedConversationId &&
      canonical.data.id !== options.expectedConversationId
    )
      throw new Error("当前私聊与创建结果不一致，请重新查看联系人资料。");
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
    if (mapping.data.researchConversationId !== canonical.data.id)
      throw new Error("聊天映射与当前私聊不一致，请稍后重试。");
    const target = state.contacts.find((entry) => entry.contact.id === contactId);
    if (!target) throw new Error("聊天目标尚未准备完成，请稍后重试。");
    if (options?.requireOwnLocal && (target.contact.identity.kind !== "personal_agent" ||
      target.contact.identity.ownerMemberId !== state.actor?.member.id ||
      target.contact.profile.role !== "specialist" || target.contact.agentRuntime))
      throw new Error("本次安排的本地 Agent 状态已变化，请从联系人资料核对后打开聊天。");
    if (
      !target.contact.allowedActions.includes("chat") ||
      target.userID !== mapping.data.peerUserID
    )
      throw new Error("当前没有这个 Agent 的聊天权限，请重新查看联系人资料。");
    options?.onTarget?.(mapping.data.imConversationID);
    return await toSpecifiedConversation({
      sourceID: target.userID,
      sessionType: SessionType.Single,
      isCurrent,
    });
  };
}
