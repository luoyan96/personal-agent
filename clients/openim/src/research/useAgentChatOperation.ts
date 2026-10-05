import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useConversationStore, useUserStore } from "@/store";
import { useResearchStore } from "./store";

export type AgentChatOperation = {
  isCurrent: () => boolean;
  allowTarget: (conversationID: string) => void;
  dispose: () => void;
};

/** A user selection away and back still cancels an old automatic operation. */
export function useAgentChatOperation() {
  const generation = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const path = useLocation().pathname;
  const scope = `${generation}:${actorId}:${path}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const epoch = useRef(0);
  const mounted = useRef(false);
  const active = useRef(new Set<AgentChatOperation>());
  useLayoutEffect(() => {
    epoch.current++;
    mounted.current = true;
    return () => {
      epoch.current++;
      mounted.current = false;
      for (const operation of active.current) operation.dispose();
    };
  }, [scope]);
  return (): AgentChatOperation => {
    const requestEpoch = epoch.current;
    const originScope = currentScope.current;
    const research = useResearchStore.getState();
    const originID =
      useConversationStore.getState().currentConversation?.conversationID;
    const selfID = useUserStore.getState().selfInfo.userID;
    let targetID: string | undefined;
    let cancelled = false;
    const unsubscribe = useConversationStore.subscribe((next, previous) => {
      const nextID = next.currentConversation?.conversationID;
      if (
        (nextID !== previous.currentConversation?.conversationID &&
          !(targetID && nextID === targetID)) ||
        (next.selectingConversationID !== previous.selectingConversationID &&
          next.selectingConversationID &&
          next.selectingConversationID !== targetID)
      )
        cancelled = true;
    });
    const operation: AgentChatOperation = {
      isCurrent: () => {
        const state = useResearchStore.getState();
        const selectedID =
          useConversationStore.getState().currentConversation?.conversationID;
        return (
          !cancelled &&
          mounted.current &&
          requestEpoch === epoch.current &&
          currentScope.current === originScope &&
          state.generation === research.generation &&
          state.actor?.member.id === research.actor?.member.id &&
          useUserStore.getState().selfInfo.userID === selfID &&
          (selectedID === originID || (!!targetID && selectedID === targetID))
        );
      },
      // Only a freshly authorized bridge mapping may permit our own selection.
      allowTarget: (id) => {
        if (!cancelled) targetID = id;
      },
      dispose: () => {
        cancelled = true;
        unsubscribe();
        active.current.delete(operation);
      },
    };
    active.current.add(operation);
    return operation;
  };
}
