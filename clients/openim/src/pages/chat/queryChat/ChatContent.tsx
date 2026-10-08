import { Layout, Spin } from "antd";
import clsx from "clsx";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import { SystemMessageTypes } from "@/constants/im";
import { useConversationStore, useUserStore } from "@/store";
import { useResearchStore } from "@/research/store";
import { AgentReplyProgress, AgentProgressHistory } from "@/research/agent-progress";
import { OpenImResearchPointer } from "@research-agent-platform/contracts";
import emitter from "@/utils/events";
import { formatMessageTime } from "@/utils/imCommon";

import MessageItem from "./MessageItem";
import NotificationMessage from "./NotificationMessage";
import { useHistoryMessageList } from "./useHistoryMessageList";

const ChatContent = () => {
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [dragging, setDragging] = useState(false);
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const actorGeneration = useResearchStore((state) => state.generation);
  const { conversationID, loadState, moreOldLoading, getMoreOldMessages } =
    useHistoryMessageList();
  const scope = JSON.stringify([actorGeneration, selfUserID, conversationID]);
  const currentScope = useRef(scope);
  currentScope.current = scope;
  // User intent is a latch. A short loading row or viewport resize must not
  // turn history reading back into following merely because geometry is bottom.
  const historyPaused = useRef(false);
  const frame = useRef<number>();
  const touchY = useRef<number>();
  const downwardIntentUntil = useRef(0);
  const pointerScrolling = useRef(false);
  const lastScrollTop = useRef(0);
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
  const timestampMessages = useMemo(
    () =>
      new Set(
        loadState.messageList
          .filter(
            (message, index, list) =>
              !list[index - 1] || message.sendTime - list[index - 1].sendTime > 300000,
          )
          .map((message) => message.clientMsgID),
      ),
    [loadState.messageList],
  );

  const stopFollowing = useCallback(() => {
    historyPaused.current = true;
    downwardIntentUntil.current = 0;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  }, []);
  const scrollToBottom = useCallback(() => {
    if (historyPaused.current || frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      if (
        !historyPaused.current &&
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
    setDragging(false);
    historyPaused.current = false;
    touchY.current = undefined;
    downwardIntentUntil.current = 0;
    pointerScrolling.current = false;
    lastScrollTop.current = 0;
    return () => {
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
      historyPaused.current = true;
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
      historyPaused.current = false;
      downwardIntentUntil.current = 0;
      scrollToBottom();
    };
    emitter.on("CHAT_LIST_SCROLL_TO_BOTTOM", followOwnSend);
    return () => {
      emitter.off("CHAT_LIST_SCROLL_TO_BOTTOM", followOwnSend);
    };
  }, [conversationID, actorGeneration, selfUserID, scrollToBottom]);

  useEffect(() => {
    const finishPointerScroll = () => {
      pointerScrolling.current = false;
    };
    window.addEventListener("pointerup", finishPointerScroll);
    window.addEventListener("pointercancel", finishPointerScroll);
    return () => {
      window.removeEventListener("pointerup", finishPointerScroll);
      window.removeEventListener("pointercancel", finishPointerScroll);
    };
  }, []);

  const markDownwardIntent = () => {
    downwardIntentUntil.current = performance.now() + 500;
    const scroller = document.getElementById("chat-list");
    if (
      scroller &&
      scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 4
    )
      historyPaused.current = false;
  };

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
      data-files-dragging={dragging ? "true" : undefined}
      onDragEnterCapture={(event) => {
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDropCapture={(event) => {
        setDragging(false);
        if (!event.dataTransfer.files.length || !conversationID) return;
        event.preventDefault();
        event.stopPropagation();
        emitter.emit("CHAT_FILES_DROPPED", {
          conversationID,
          generation: actorGeneration,
          files: Array.from(event.dataTransfer.files),
        });
      }}
      onWheelCapture={(event) => {
        if (event.deltaY < 0) stopFollowing();
        else if (event.deltaY > 0) markDownwardIntent();
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
        else if (
          nextY !== undefined &&
          touchY.current !== undefined &&
          nextY < touchY.current
        )
          markDownwardIntent();
        touchY.current = nextY;
      }}
      onKeyDownCapture={(event) => {
        if (["Home", "PageUp", "ArrowUp"].includes(event.key)) stopFollowing();
        if (event.key === "End") {
          historyPaused.current = false;
          downwardIntentUntil.current = 0;
          scrollToBottom();
        } else if (["PageDown", "ArrowDown"].includes(event.key)) markDownwardIntent();
      }}
      onPointerDownCapture={(event) => {
        // Native scrollbar dragging is also an explicit history-reading action.
        const scroller = document.getElementById("chat-list");
        if (event.target === scroller) {
          stopFollowing();
          pointerScrolling.current = true;
          lastScrollTop.current = scroller.scrollTop;
        }
      }}
      onScrollCapture={(event) => {
        const scroller = document.getElementById("chat-list");
        if (!scroller || event.target !== scroller) return;
        const previousTop = lastScrollTop.current;
        lastScrollTop.current = scroller.scrollTop;
        if (pointerScrolling.current && scroller.scrollTop < previousTop)
          stopFollowing();
        if (
          historyPaused.current &&
          scroller.scrollTop > previousTop &&
          (pointerScrolling.current ||
            performance.now() < downwardIntentUntil.current) &&
          scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= 4
        ) {
          historyPaused.current = false;
          downwardIntentUntil.current = 0;
          scrollToBottom();
        }
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
            // A function prop remains truthy in Virtuoso's internal resize
            // traps even when it returns false. Only our scoped intent follows.
            followOutput={false}
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
              const showTime =
                window.electronAPI && timestampMessages.has(message.clientMsgID);
              return (
                <>
                  {showTime && (
                    <div className="desktop-message-time">
                      {formatMessageTime(message.sendTime)}
                    </div>
                  )}
                  <MessageItem
                    key={message.clientMsgID}
                    conversationID={conversationID}
                    message={message}
                    messageUpdateFlag={`${message.senderNickname ?? ""}${
                      message.senderFaceUrl ?? ""
                    }`}
                    isSender={isSender}
                  />
                </>
              );
            }}
          />
        </AgentProgressHistory.Provider>
      )}
    </Layout.Content>
  );
};

export default memo(ChatContent);
