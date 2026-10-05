import { SessionType } from "@openim/wasm-client-sdk";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

import { useConversationStore, useUserStore } from "@/store";
import { researchMode } from "./api";
import { ensureResearchConversation, initializeCoordinator } from "./bridge";
import { useResearchStore } from "./store";

export type ResearchChatEntry = {
  actorMatches: boolean;
  ready: boolean;
  pending: boolean;
  error: string;
  canOpenCoordinator: boolean;
  retry: () => void;
};

/** Select only real SDK conversations for the current authenticated actor. */
export function useResearchChatEntry(): ResearchChatEntry {
  const { conversationID } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const latestPath = useRef(location.pathname);
  latestPath.current = location.pathname;
  const generation = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const sessionActorId = useResearchStore((s) => s.sessionActorId);
  const session = useResearchStore((s) => s.session);
  const coordinator = useResearchStore((s) => s.coordinatorConversation);
  const mappings = useResearchStore((s) => s.mappings);
  const connectionError = useResearchStore((s) => s.error);
  const selfUserID = useUserStore((s) => s.selfInfo.userID);
  const sdkReady = useUserStore(
    (s) => !s.isLogining && s.connectState === "success" && s.syncState === "success",
  );
  const actorMatches = Boolean(
    selfUserID &&
      actorId &&
      actorId === sessionActorId &&
      session?.status === "available" &&
      session.user?.userID === selfUserID,
  );
  const actorReady = actorMatches && sdkReady;
  const mapping = conversationID
    ? mappings.find((m) => m.imConversationID === conversationID) ??
      (session?.coordinator?.imConversationID === conversationID
        ? session.coordinator
        : undefined)
    : session?.coordinator;
  const mappingKey = JSON.stringify(mapping);
  const canOpenCoordinator = Boolean(
    actorReady &&
      session?.coordinator?.kind === "personal" &&
      session.coordinator.transportStatus === "ready" &&
      coordinator &&
      coordinator.conversationID === session.coordinator.imConversationID &&
      coordinator.userID === session.coordinator.peerUserID &&
      coordinator.conversationType === SessionType.Single,
  );
  const automaticEntry = useRef<number>();
  const explicitEntry = useRef(false);
  const [retrySequence, setRetrySequence] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!researchMode) return;
    setError("");
    setPending(false);
    if (!actorReady) return;
    const path = location.pathname;
    const priorSelection =
      useConversationStore.getState().currentConversation?.conversationID;
    if (!conversationID) {
      // Preserve explicit choices and mobile navigation back to the list.
      if (
        (priorSelection || useConversationStore.getState().selectingConversationID) &&
        !explicitEntry.current
      ) {
        automaticEntry.current = generation;
        return;
      }
      if (automaticEntry.current === generation && !explicitEntry.current) return;
      if (!canOpenCoordinator || !coordinator || !session?.coordinator) return;
    } else automaticEntry.current = generation;

    let cancelled = false;
    const targetID = conversationID || session!.coordinator!.imConversationID;
    const isCurrent = () => {
      const state = useResearchStore.getState();
      const user = useUserStore.getState();
      const selected =
        useConversationStore.getState().currentConversation?.conversationID;
      return (
        !cancelled &&
        latestPath.current === path &&
        state.generation === generation &&
        state.actor?.member.id === actorId &&
        state.sessionActorId === actorId &&
        state.session?.user?.userID === selfUserID &&
        user.selfInfo.userID === selfUserID &&
        !user.isLogining &&
        user.connectState === "success" &&
        user.syncState === "success" &&
        (selected === priorSelection || selected === targetID)
      );
    };
    if (conversationID && priorSelection === conversationID) return;
    setPending(true);
    void (async () => {
      try {
        if (!mapping)
          throw new Error("当前没有这个会话的科研访问权限，请选择已有会话。");
        const conversation = !conversationID
          ? coordinator!
          : await ensureResearchConversation(mapping);
        if (!isCurrent()) return;
        // Group detail requests also honor the same route/actor guard before writing.
        const selection = useConversationStore
          .getState()
          .updateCurrentConversation({ ...conversation }, false, isCurrent);
        // Single-conversation selection commits synchronously. Navigate before
        // yielding, so StrictMode cleanup cannot strand our own selection on index.
        if (
          !conversationID &&
          isCurrent() &&
          useConversationStore.getState().currentConversation?.conversationID ===
            targetID
        ) {
          automaticEntry.current = generation;
          explicitEntry.current = false;
          navigate(`/chat/${conversation.conversationID}`, { replace: true });
        }
        await selection;
        if (
          !isCurrent() ||
          useConversationStore.getState().currentConversation?.conversationID !==
            targetID
        )
          return;
      } catch (cause) {
        if (isCurrent())
          setError(cause instanceof Error ? cause.message : "会话打开失败，请重试。");
      } finally {
        if (!cancelled) setPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The mapping key tracks actual ACL/transport changes, not identical polling objects.
    // Current selection is read at execution time; our own selection must not cancel navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    actorReady,
    actorId,
    sessionActorId,
    generation,
    selfUserID,
    location.pathname,
    conversationID,
    mappingKey,
    canOpenCoordinator,
    retrySequence,
  ]);

  return {
    actorMatches,
    ready: actorReady,
    pending,
    error: error || connectionError,
    canOpenCoordinator,
    retry: () => {
      explicitEntry.current = true;
      if (!conversationID && actorReady && !canOpenCoordinator) {
        const path = latestPath.current;
        const isCurrent = () =>
          useResearchStore.getState().generation === generation &&
          latestPath.current === path;
        setError("");
        setPending(true);
        void initializeCoordinator()
          .then(() => {
            if (isCurrent()) setRetrySequence((value) => value + 1);
          })
          .catch((cause) => {
            if (isCurrent())
              setError(
                cause instanceof Error ? cause.message : "需求入口准备失败，请重试。",
              );
          })
          .finally(() => {
            if (isCurrent()) setPending(false);
          });
        return;
      }
      setRetrySequence((value) => value + 1);
    },
  };
}
