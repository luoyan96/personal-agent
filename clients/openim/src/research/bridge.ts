import { SessionType } from "@openim/wasm-client-sdk";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";

export async function ensureResearchConversation(
  mapping: ResponseFor<"imSyncConversation">["data"],
) {
  const synchronized =
    mapping.transportStatus === "ready"
      ? mapping
      : (
          await researchApi("imSyncConversation", {
            params: { id: mapping.researchConversationId },
            body: {},
          })
        ).data;
  if (synchronized.transportStatus !== "ready")
    throw new Error(`即时通信尚未接通（${synchronized.reason || "同步待完成"}）`);
  const sourceID =
    synchronized.kind === "group" ? synchronized.groupID : synchronized.peerUserID;
  if (!sourceID) throw new Error("服务器未返回可用会话目标");
  const conversation = (
    await IMSDK.getOneConversation({
      sourceID,
      sessionType:
        synchronized.kind === "group" ? SessionType.Group : SessionType.Single,
    })
  ).data;
  if (conversation.conversationID !== synchronized.imConversationID)
    throw new Error("OpenIM 返回的会话与科研映射不一致");
  return conversation;
}
let coordinatorInitialization: { generation: number; promise: Promise<void> } | undefined;

export function initializeCoordinator() {
  const generation = useResearchStore.getState().generation;
  if (coordinatorInitialization?.generation === generation)
    return coordinatorInitialization.promise;
  const promise: Promise<void> = initializeCoordinatorForGeneration(generation).finally(() => {
    if (coordinatorInitialization?.promise === promise) coordinatorInitialization = undefined;
  });
  coordinatorInitialization = { generation, promise };
  return promise;
}

async function initializeCoordinatorForGeneration(generation: number) {
  const state = useResearchStore.getState(),
    actorGeneration = state.generation;
  if (generation !== actorGeneration) return;
  const mapping = state.session?.coordinator;
  if (!mapping) return;
  const conversation = await ensureResearchConversation(mapping);
  if (generation !== useResearchStore.getState().generation) return;
  useResearchStore.setState({ coordinatorConversation: conversation });
  await useConversationStore.getState().getConversationListByReq();
  if (generation !== useResearchStore.getState().generation) return;
  const local = useConversationStore.getState().conversationList.find(
    item => item.conversationID === conversation.conversationID,
  );
  // RAP already fixes this entry first and the backend synchronizes server pin.
  // A freshly returned SDK conversation may not yet exist in its local SQL DB.
  // Native pin is auxiliary synchronization: a failure must not log out a user
  // whose real SDK login succeeded or trigger another token exchange.
  if (!local) {
    useResearchStore.setState({ coordinatorPinPending: true });
    return;
  }
  useResearchStore.setState({ coordinatorConversation: local });
  if (!local.isPinned) {
    try {
      await IMSDK.setConversation({
        conversationID: local.conversationID,
        isPinned: true,
      });
      if (generation !== useResearchStore.getState().generation) return;
      useResearchStore.setState({ coordinatorPinPending: false });
    } catch (error) {
      if (generation !== useResearchStore.getState().generation) return;
      useResearchStore.setState({ coordinatorPinPending: true });
      console.warn("需求入口的即时通信置顶同步尚未完成", error);
    }
  } else useResearchStore.setState({ coordinatorPinPending: false });
  if (!local.isPinned) await useConversationStore.getState().getConversationListByReq();
}
