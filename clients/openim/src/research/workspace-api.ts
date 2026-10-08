import { SessionType } from "@openim/wasm-client-sdk";
import { useConversationToggle } from "@/hooks/useConversationToggle";
import { useUserStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";

export const workspaceApi = {
  tasks: (
    category: "all" | "ongoing" | "awaiting_me" | "completed" | "scheduled",
    cursor?: string,
  ) => researchApi("workbench", { query: { category, cursor, limit: 30 } }),
  task: (id: string) => researchApi("personalWorkTask", { params: { id } }),
  square: (
    view: "public" | "mine",
    kind: "all" | "human" | "agent",
    search: string,
    cursor?: string,
  ) =>
    researchApi("capabilityPublications", {
      query: { view, kind, search, cursor, limit: 30 },
    }),
};

/** Opening a workspace item still requires current canonical membership and a real SDK mapping. */
export function useWorkspaceConversation() {
  const { toSpecifiedConversation } = useConversationToggle();
  return async (conversationId: string, isCurrent: () => boolean) => {
    if (!isCurrent()) return false;
    const authorized = await researchApi("chatConversation", {
      params: { id: conversationId },
    });
    if (!isCurrent()) return false;
    const mapping = await researchApi("imSyncConversation", {
      params: { id: conversationId },
      body: {},
    });
    if (!isCurrent()) return false;
    await useResearchStore.getState().refresh();
    if (!isCurrent()) return false;
    const state = useResearchStore.getState(),
      user = useUserStore.getState();
    if (mapping.data.researchConversationId !== authorized.data.id)
      throw new Error("聊天信息已变化，请刷新工作台后重新打开。");
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
      throw new Error("任务已保存，即时通信尚未连接。连接恢复后可以再次打开聊天。");
    const sourceID =
      mapping.data.kind === "group" ? mapping.data.groupID : mapping.data.peerUserID;
    if (!sourceID) throw new Error("聊天目标暂不可用，请稍后重试。");
    return toSpecifiedConversation({
      sourceID,
      sessionType:
        mapping.data.kind === "group" ? SessionType.WorkingGroup : SessionType.Single,
      isCurrent,
    });
  };
}
