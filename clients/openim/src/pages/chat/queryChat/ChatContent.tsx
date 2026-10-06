import { Layout, Spin } from "antd";
import clsx from "clsx";
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { SystemMessageTypes } from "@/constants/im";
import { useConversationStore, useUserStore } from "@/store";
import { useResearchStore } from "@/research/store";
import { AgentReplyProgress, AgentProgressHistory } from "@/research/agent-progress";
import { OpenImResearchPointer } from "@research-agent-platform/contracts";
import emitter from "@/utils/events";

import MessageItem from "./MessageItem";
import NotificationMessage from "./NotificationMessage";
import { useHistoryMessageList } from "./useHistoryMessageList";

const ChatContent = () => {
  const virtuoso = useRef<VirtuosoHandle>(null);
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const actorGeneration = useResearchStore((state) => state.generation);
  const { conversationID, loadState, moreOldLoading, getMoreOldMessages } =
    useHistoryMessageList();
  const scope = JSON.stringify([actorGeneration, selfUserID, conversationID]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const followLatest = useRef(true);
  const frame = useRef<number>();
  const touchY = useRef<number>();
  const pointerHistory = useMemo(() => {
    const messageIds = new Set<string>();
    let sequence = 0,
      latestOwnId: string | undefined;
    for (const message of loadState.messageList) {
      try {
        const pointer = OpenImResearchPointer.safeParse(
          JSON.parse(message.customElem?.data || "null"),
        );
        if (!pointer.success) continue;
        messageIds.add(pointer.data.messageId);
        if (message.sendID === selfUserID && pointer.data.sequence > sequence) {
          sequence = pointer.data.sequence;
          latestOwnId = pointer.data.messageId;
        }
      } catch {
        /* Ordinary SDK messages have no research locator. */
      }
    }
    return { messageIds, latestOwnId };
  }, [loadState.messageList, selfUserID]);

  const stopFollowing = useCallback(() => {
    followLatest.current = false;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  }, []);
  const scrollToBottom = useCallback(() => {
    if (!followLatest.current || frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      if (
        followLatest.current &&
        currentScope.current === scope &&
        useResearchStore.getState().generation === actorGeneration &&
        useUserStore.getState().selfInfo.userID === selfUserID &&
        useConversationStore.getState().currentConversation?.conversationID ===
          conversationID
      )
        virtuoso.current?.scrollToIndex({
          index: "LAST",
          align: "end",
          behavior: "auto",
        });
    });
  }, [scope, actorGeneration, selfUserID, conversationID]);

  useLayoutEffect(() => {
    followLatest.current = true;
    touchY.current = undefined;
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
      followLatest.current = false;
    };
  }, [scope]);

  useEffect(() => {
    const followOwnSend = (
      request: void | {
        conversationID: string;
        actorGeneration: number;
        selfUserID: string;
      },
    ) => {
      if (
        request &&
        (request.conversationID !== conversationID ||
          request.actorGeneration !== actorGeneration ||
          request.selfUserID !== selfUserID)
      )
        return;
      followLatest.current = true;
      scrollToBottom();
    };
    emitter.on("CHAT_LIST_SCROLL_TO_BOTTOM", followOwnSend);
    return () => {
      emitter.off("CHAT_LIST_SCROLL_TO_BOTTOM", followOwnSend);
    };
  }, [conversationID, actorGeneration, selfUserID, scrollToBottom]);

  const components = useMemo(
    () => ({
      Footer: () => <AgentReplyProgress onResize={scrollToBottom} />,
      Header: () =>
        loadState.hasMoreOld ? (
          <div
            className={clsx(
              "flex justify-center py-2 opacity-0",
              moreOldLoading && "opacity-100",
            )}
          >
            <Spin />
          </div>
        ) : null,
    }),
    [loadState.hasMoreOld, moreOldLoading, scrollToBottom],
  );

  const loadMoreMessage = () => {
    if (!loadState.hasMoreOld || moreOldLoading) return;

    getMoreOldMessages();
  };

  return (
    <Layout.Content
      className="relative flex h-full overflow-hidden !bg-white"
      id="chat-main"
      onWheelCapture={(event) => {
        if (event.deltaY < 0) stopFollowing();
      }}
      onTouchStartCapture={(event) => {
        touchY.current = event.touches[0]?.clientY;
      }}
      onTouchMoveCapture={(event) => {
        const nextY = event.touches[0]?.clientY;
        if (
          nextY !== undefined &&
          touchY.current !== undefined &&
          nextY > touchY.current
        )
          stopFollowing();
        touchY.current = nextY;
      }}
      onKeyDownCapture={(event) => {
        if (["Home", "PageUp", "ArrowUp"].includes(event.key)) stopFollowing();
        if (event.key === "End") {
          followLatest.current = true;
          scrollToBottom();
        }
      }}
      onPointerDownCapture={(event) => {
        // Native scrollbar dragging is also an explicit history-reading action.
        const scroller = document.getElementById("chat-list");
        if (event.target === scroller) stopFollowing();
      }}
    >
      {loadState.initLoading ? (
        <div className="flex h-full w-full items-center justify-center bg-white pt-1">
          <Spin spinning />
        </div>
      ) : (
        <AgentProgressHistory.Provider value={pointerHistory}>
          <Virtuoso
            key={scope}
            id="chat-list"
            tabIndex={0}
            className="w-full overflow-x-hidden"
            followOutput={() => (followLatest.current ? "auto" : false)}
            atBottomThreshold={4}
            atBottomStateChange={(atBottom) => {
              if (atBottom) followLatest.current = true;
            }}
            // Authorized facts and turn cards hydrate later than Virtuoso's
            // short resize trap. Follow their actual measured height while the
            // user is waiting at the latest message, never while reading history.
            totalListHeightChanged={scrollToBottom}
            firstItemIndex={loadState.firstItemIndex}
            initialTopMostItemIndex={{ index: "LAST", align: "end" }}
            startReached={loadMoreMessage}
            ref={virtuoso}
            data={loadState.messageList}
            components={components}
            computeItemKey={(_, item) => item.clientMsgID}
            itemContent={(_, message) => {
              if (SystemMessageTypes.includes(message.contentType)) {
                return (
                  <NotificationMessage key={message.clientMsgID} message={message} />
                );
              }
              const isSender = selfUserID === message.sendID;
              return (
                <MessageItem
                  key={message.clientMsgID}
                  conversationID={conversationID}
                  message={message}
                  messageUpdateFlag={`${message.senderNickname ?? ""}${
                    message.senderFaceUrl ?? ""
                  }`}
                  isSender={isSender}
                />
              );
            }}
          />
        </AgentProgressHistory.Provider>
      )}
    </Layout.Content>
  );
};

export default memo(ChatContent);
