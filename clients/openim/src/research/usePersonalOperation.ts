import { useLayoutEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useConversationStore } from "@/store";
import { useResearchStore } from "./store";

/** Personal settings belong to the current actor and one visible panel lifecycle. */
export function usePersonalOperation(active: boolean, panel: string) {
  const generation = useResearchStore(s => s.generation);
  const actorId = useResearchStore(s => s.actor?.member.id);
  const conversationId = useConversationStore(s => s.currentConversation?.conversationID);
  const location = useLocation();
  const scope = `${generation}:${actorId}:${conversationId}:${location.pathname}:${panel}:${active}`;
  const visible = useRef({ scope, active });
  visible.current = { scope, active };
  const epoch = useRef(0);
  useLayoutEffect(() => {
    ++epoch.current;
    return () => { ++epoch.current; };
  }, [scope]);
  const capture = () => {
    const ticket = epoch.current;
    const isCurrent = () => active && !!actorId &&
      visible.current.active && visible.current.scope === scope &&
      ticket === epoch.current &&
      useResearchStore.getState().generation === generation &&
      useResearchStore.getState().actor?.member.id === actorId &&
      useConversationStore.getState().currentConversation?.conversationID === conversationId;
    return { isCurrent };
  };
  return { capture, scope, actorId, generation };
}
