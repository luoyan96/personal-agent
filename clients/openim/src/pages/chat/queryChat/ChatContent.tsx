import { Alert, Button, Layout, Spin } from "antd";
import {
  useChatTimeline,
  openTimeline,
  timelineScope,
  chatPosition,
  saveChatPosition,
  positionKey,
} from "@/research/chat-timeline";
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
import { historyNotice } from "./history-notice";
import { useHistoryMessageList } from "./useHistoryMessageList";

const ChatContent = () => {
  const virtuoso = useRef<VirtuosoHandle>(null);
  const [dragging, setDragging] = useState(false);
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const actorGeneration = useResearchStore((state) => state.generation);
  const {
    conversationID,
    loadState,
    moreOldLoading,
    getMoreOldMessages,
    seekMessage,
    historyError,
    historySource,
  } = useHistoryMessageList();
  const actorId = useResearchStore((s) => s.actor?.member.id || "");
  const viewScope = timelineScope(actorGeneration, conversationID || "");
  const savedKey = positionKey(actorId || selfUserID, conversationID || "");
  const hidden = useChatTimeline((s) => s.hidden);
  const jump = useChatTimeline((s) => s.jump);
  const navigationError = useChatTimeline((s) => s.error);
  const [locating, setLocating] = useState(false);
  const [restoreReady, setRestoreReady] = useState(false);
  const [initialAnchor, setInitialAnchor] = useState<string>();
  const [paused, setPaused] = useState(false);
  const restored = useRef("");
  const initialPosition = useRef(chatPosition(savedKey));
  const visibleAnchor = useRef<string>();
  const seek = useRef(seekMessage);
  seek.current = seekMessage;
  const messages = useMemo(
    () => loadState.messageList.filter((m) => !hidden.includes(m.clientMsgID)),
    [loadState.messageList, hidden],
  );
  const latestMessages = useRef(messages);
  latestMessages.current = messages;
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
    setPaused(true);
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
    openTimeline(viewScope);
    const saved = chatPosition(savedKey);
    initialPosition.current = saved;
    setLocating(false);
    setRestoreReady(false);
    setInitialAnchor(undefined);
    useChatTimeline.setState({ hidden: saved.hidden });
    restored.current = "";
    visibleAnchor.current = saved.anchor;
    setDragging(false);
    historyPaused.current = !saved.atBottom;
    setPaused(!saved.atBottom);
    touchY.current = undefined;
    downwardIntentUntil.current = 0;
    pointerScrolling.current = false;
    lastScrollTop.current = 0;
    return () => {
      saveChatPosition(savedKey, {
        anchor: visibleAnchor.current,
        atBottom: !historyPaused.current,
      });
      if (frame.current !== undefined) cancelAnimationFrame(frame.current);
      frame.current = undefined;
      historyPaused.current = true;
    };
  }, [scope]);

  useEffect(() => {
    if (loadState.initLoading || locating) return;
    const saved = initialPosition.current;
    const initial = restored.current !== scope;
    const target =
      jump ||
      (initial && !saved.atBottom && saved.anchor
        ? { clientMsgID: saved.anchor }
        : undefined);
    restored.current = scope;
    if (!target) {
      setRestoreReady(true);
      return;
    }
    const activeScope = scope;
    stopFollowing();
    setLocating(true);
    void seek
      .current(target)
      .then((found) => {
        if (currentScope.current !== activeScope) return;
        if (!found) {
          useChatTimeline.setState({
            jump: undefined,
            error:
              "本次未定位到消息：它可能尚未同步、已删除或不在已加载范围。可继续查找或重试。",
          });
          return;
        }
        const hiddenIds = useChatTimeline
          .getState()
          .hidden.filter((id) => id !== found.clientMsgID);
        useChatTimeline.setState({
          hidden: hiddenIds,
          jump: undefined,
          highlighted: found.clientMsgID,
          error: undefined,
        });
        saveChatPosition(savedKey, {
          hidden: hiddenIds,
          anchor: found.clientMsgID,
          atBottom: false,
        });
        visibleAnchor.current = found.clientMsgID;
        if (initial) setInitialAnchor(found.clientMsgID);
        else
          requestAnimationFrame(() => {
            if (currentScope.current === activeScope) {
              const index = latestMessages.current.findIndex(
                (m) => m.clientMsgID === found.clientMsgID,
              );
              if (index >= 0)
                virtuoso.current?.scrollToIndex({
                  index,
                  align: "center",
                  behavior: "auto",
                });
            }
          });
      })
      .catch(() => {
        if (currentScope.current === activeScope)
          useChatTimeline.setState({ jump: undefined, error: "定位失败，请重试。" });
      })
      .finally(() => {
        if (currentScope.current === activeScope) {
          setLocating(false);
          setRestoreReady(true);
        }
      });
  }, [jump, loadState.initLoading, scope, locating]);

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
      setPaused(false);
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
    ) {
      historyPaused.current = false;
      setPaused(false);
    }
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
      className="relative flex h-full flex-col overflow-hidden !bg-white"
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
          setPaused(false);
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
          setPaused(false);
          downwardIntentUntil.current = 0;
          scrollToBottom();
        }
      }}
    >
      {historySource && !historyError && (
        <p className="chat-history-source" role="status">
          {historyNotice(historySource, navigator.onLine)}
        </p>
      )}
      {(historyError || navigationError) && (
        <Alert
          type="warning"
          message={historyError || navigationError}
          closable
          onClose={() => useChatTimeline.setState({ error: undefined })}
          action={
            <Button size="small" onClick={() => void getMoreOldMessages()}>
              重新读取
            </Button>
          }
        />
      )}
      {locating && (
        <div role="status" className="chat-navigation-status">
          <Spin size="small" /> 正在定位聊天记录…
        </div>
      )}
      {loadState.initLoading || !restoreReady ? (
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
            rangeChanged={(range) => {
              if (restored.current !== scope || locating) return;
              const index = Math.max(0, range.startIndex - loadState.firstItemIndex);
              visibleAnchor.current = messages[index]?.clientMsgID;
              saveChatPosition(savedKey, {
                anchor: visibleAnchor.current,
                atBottom: !historyPaused.current,
              });
            }}
            initialTopMostItemIndex={
              initialAnchor
                ? {
                    index: Math.max(
                      0,
                      messages.findIndex((m) => m.clientMsgID === initialAnchor),
                    ),
                    align: "start",
                  }
                : { index: "LAST", align: "end" }
            }
            startReached={loadMoreMessage}
            ref={virtuoso}
            data={messages}
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
      {paused && (
        <Button
          className="chat-return-latest"
          onClick={() => {
            historyPaused.current = false;
            setPaused(false);
            useChatTimeline.setState({ highlighted: undefined });
            scrollToBottom();
          }}
        >
          回到最新消息
        </Button>
      )}
    </Layout.Content>
  );
};

export default memo(ChatContent);
