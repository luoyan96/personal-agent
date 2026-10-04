import { SessionType } from "@openim/wasm-client-sdk";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";

export async function ensureResearchConversation(mapping: ResponseFor<"imSyncConversation">["data"]) {
  const synchronized = mapping.transportStatus === "ready" ? mapping : (await researchApi("imSyncConversation", {params:{id:mapping.researchConversationId},body:{}})).data;
  if (synchronized.transportStatus !== "ready") throw new Error(`即时通信尚未接通（${synchronized.reason || "同步待完成"}）`);
  const sourceID = synchronized.kind === "group" ? synchronized.groupID : synchronized.peerUserID;
  if (!sourceID) throw new Error("服务器未返回可用会话目标");
  const conversation = (await IMSDK.getOneConversation({sourceID,sessionType:synchronized.kind === "group" ? SessionType.Group : SessionType.Single})).data;
  if (conversation.conversationID !== synchronized.imConversationID) throw new Error("OpenIM 返回的会话与科研映射不一致");
  return conversation;
}
export async function initializeCoordinator() {
  const state = useResearchStore.getState(), generation = state.generation;
  const mapping = state.session?.coordinator;
  if (!mapping) return;
  const conversation = await ensureResearchConversation(mapping);
  if (generation !== useResearchStore.getState().generation) return;
  if (!conversation.isPinned) await IMSDK.setConversation({conversationID:conversation.conversationID,isPinned:true});
  await useConversationStore.getState().getConversationListByReq();
}
