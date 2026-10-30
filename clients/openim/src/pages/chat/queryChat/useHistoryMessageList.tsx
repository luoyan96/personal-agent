import { MessageItem, MessageViewType } from "@openim/wasm-client-sdk";
import { useLatest, useRequest } from "ahooks";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

import { IMSDK } from "@/layout/MainContentWrap";
import { matchesLocator, type MessageLocator } from "@/research/chat-timeline";
import { withRequestDeadline } from "@/research/request-deadline";
import { useResearchStore } from "@/research/store";
import { useConversationStore, useUserStore } from "@/store";
import emitter, { emit } from "@/utils/events";

import { readCachedHistory, saveCachedHistory } from "./chat-history-cache";
import type { HistorySource } from "./history-notice";

const START_INDEX = 10000;
const SPLIT_COUNT = 20;
/** Retry gaps for a read that never landed; the last entry ends the budget. */
const RETRY_DELAYS = [0, 2000, 5000, 12000];
const INITIAL_LOAD_STATE = {
  initLoading: true,
  hasMoreOld: true,
  messageList: [] as MessageItem[],
  firstItemIndex: START_INDEX,
};

export function useHistoryMessageList() {
  const { conversationID } = useParams();
  const [loadState, setLoadState] = useState(INITIAL_LOAD_STATE);
  const latestLoadState = useLatest(loadState);
  const latestConversationID = useLatest(conversationID);
  const mounted = useRef(true);
  const loadGeneration = useRef(0);
  const loadingPage = useRef(false);
  const [historyError, setHistoryError] = useState("");
  /** Where the visible transcript came from: the local cache, or nothing yet. */
  const [historySource, setHistorySource] = useState<HistorySource>("");
  const sdkReady = useUserStore(
    (state) =>
      !state.isLogining &&
      state.connectState === "success" &&
      state.syncState === "success" &&
      Boolean(state.selfInfo.userID),
  );
  const latestSdkReady = useLatest(sdkReady);
  /**
   * Logged in, which is all a history page needs. `sdkReady` also waits for
   * connect and sync to report success through one-shot SDK events; a single
   * missed event would leave it false forever and the transcript empty with no
   * way out, so reading is gated on this and the retry below instead. The
   * research session carries the same OpenIM user, so it can stand in while
   * `selfInfo` is still being fetched.
   */
  const selfUserID = useUserStore((state) => state.selfInfo.userID);
  const isLogining = useUserStore((state) => state.isLogining);
  const sessionUserID = useResearchStore((state) => state.session?.user?.userID);
  const canRead = !isLogining && Boolean(selfUserID || sessionUserID);
  const latestCanRead = useLatest(canRead);
  /** Set once a conversation answered for real, so an empty chat is not retried. */
  const verifiedFor = useRef("");
  /** Failed read attempts for the conversation on screen. */
  const retryAttempt = useRef(0);
  const actorGeneration = useResearchStore((state) => state.generation);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      loadGeneration.current++;
    };
  }, []);

  const { loading: moreOldLoading, runAsync: getMoreOldMessages } = useRequest(
    async (loadMore = true) => {
      if (!conversationID || !latestCanRead.current) return;
      if (loadingPage.current) return;
      loadingPage.current = true;
      const reqConversationID = conversationID;
      const generation = useResearchStore.getState().generation;
      const historyGeneration = loadGeneration.current;
      const userID = useUserStore.getState().selfInfo.userID;
      const isCurrent = () =>
        mounted.current &&
        latestCanRead.current &&
        latestConversationID.current === reqConversationID &&
        historyGeneration === loadGeneration.current &&
        generation === useResearchStore.getState().generation &&
        userID === useUserStore.getState().selfInfo.userID;
      try {
        // The anchor is captured before the request so the cache can be told
        // exactly which page was verified.
        const anchor = loadMore
          ? latestLoadState.current.messageList[0]?.clientMsgID || ""
          : "";
        const { data } = await withRequestDeadline(
          () =>
            IMSDK.getAdvancedHistoryMessageList({
              count: SPLIT_COUNT,
              startClientMsgID: anchor,
              conversationID: reqConversationID,
              viewType: MessageViewType.History,
            }),
          30000,
        );
        if (!isCurrent()) return;
        setHistoryError("");
        const preState = latestLoadState.current;
        const nextState = (() => {
          // SDK live events can arrive before the history promise settles.
          // Keep them, and merge overlapping locators exactly once.
          const existing = new Set(preState.messageList.map((m) => m.clientMsgID));
          const merged = new Map(
            [...data.messageList, ...preState.messageList].map((m) => [
              m.clientMsgID,
              m,
            ]),
          );
          return {
            ...preState,
            initLoading: false,
            hasMoreOld: !data.isEnd,
            messageList: [...merged.values()].sort(
              (a, b) => a.sendTime - b.sendTime || (a.seq || 0) - (b.seq || 0),
            ),
            firstItemIndex:
              preState.firstItemIndex -
              data.messageList.filter((m) => !existing.has(m.clientMsgID)).length,
          };
        })();
        latestLoadState.current = nextState;
        setLoadState(nextState);
        setHistorySource("");
        verifiedFor.current = reqConversationID;
        // Only this verified page may teach the cache about continuity, and
        // "the beginning was reached" is only trusted after a full sync: a page
        // read during sync can end early without meaning the history is over.
        void saveCachedHistory(reqConversationID, data.messageList, {
          before: anchor || undefined,
          reachedStart: data.isEnd && latestSdkReady.current,
        });
      } catch (error) {
        // A route reload can mount this hook before SDK login. Also consume
        // failures of requests that belonged to a closed route or prior actor.
        if (!isCurrent()) return;
        setLoadState((previous) => ({ ...previous, initLoading: false }));
        // A cached transcript is already on screen, so a failed verification is
        // not a read failure. A failed page further back still is.
        setHistoryError(
          !loadMore && latestLoadState.current.messageList.length
            ? ""
            : "历史消息读取失败，可以重试；已加载内容保留。",
        );
        // Only a machine that is really offline gets to say so; anything else
        // is a failed read, which the notice above already reports.
        if (!latestLoadState.current.messageList.length)
          setHistorySource(navigator.onLine === false ? "offline" : "");
      } finally {
        if (historyGeneration === loadGeneration.current) loadingPage.current = false;
      }
    },
    { manual: true },
  );

  /**
   * Paints the local transcript without waiting for login, connection or
   * server round-trips. The cache is a read cache: it never claims the history
   * is complete, and a page that stops early is reported as incomplete.
   */
  const hydrateFromCache = useCallback(
    async (generation: number) => {
      if (!conversationID) return;
      const cached = await readCachedHistory(conversationID, SPLIT_COUNT);
      if (!mounted.current || generation !== loadGeneration.current) return;
      if (!cached?.messages.length) {
        // Nothing cached. A slow login is not an outage, so say only what is
        // true: offline only when the machine really is, "connecting" otherwise.
        if (!latestCanRead.current)
          setLoadState((previous) => ({ ...previous, initLoading: false }));
        setHistorySource(navigator.onLine === false ? "offline" : "connecting");
        return;
      }
      const preState = latestLoadState.current;
      const existing = new Set(preState.messageList.map((m) => m.clientMsgID));
      const merged = new Map(
        [...cached.messages, ...preState.messageList].map((m) => [m.clientMsgID, m]),
      );
      const nextState = {
        ...preState,
        initLoading: false,
        // Only a verified page may claim the history ends; a cache that merely
        // ran out of rows must not stop older messages from loading.
        hasMoreOld: preState.messageList.length
          ? preState.hasMoreOld
          : !cached.reachedStart,
        messageList: [...merged.values()].sort(
          (a, b) => a.sendTime - b.sendTime || (a.seq || 0) - (b.seq || 0),
        ),
        firstItemIndex:
          preState.firstItemIndex -
          cached.messages.filter((m) => !existing.has(m.clientMsgID)).length,
      };
      latestLoadState.current = nextState;
      setLoadState(nextState);
      setHistorySource("cache");
    },
    [conversationID],
  );

  const loadHistoryMessages = useCallback(() => {
    loadGeneration.current++;
    loadingPage.current = false;
    verifiedFor.current = "";
    retryAttempt.current = 0;
    setHistoryError("");
    setHistorySource("");
    latestLoadState.current = INITIAL_LOAD_STATE;
    setLoadState(INITIAL_LOAD_STATE);
    void hydrateFromCache(loadGeneration.current);
  }, [hydrateFromCache]);

  /**
   * Verification is the one call the cache cannot make: read the newest page
   * from the server and let it repair the cache. It is not claimed once and
   * forgotten - an attempt that never lands leaves an empty transcript, so the
   * effect below retries until a page really answers.
   */
  const verifyHistory = useCallback(() => {
    if (!conversationID || !latestCanRead.current) return;
    void getMoreOldMessages(false);
  }, [conversationID, getMoreOldMessages]);

  useEffect(() => {
    if (!conversationID) return;
    loadHistoryMessages();
    verifyHistory();
  }, [conversationID, actorGeneration, loadHistoryMessages, verifyHistory]);

  // Login, connection and sync can finish after the page is already readable.
  useEffect(() => {
    verifyHistory();
  }, [canRead, sdkReady, verifyHistory]);

  /**
   * A read that never lands must not leave the transcript blank forever. Retry
   * a few times with a widening gap while nothing is on screen; a conversation
   * that answered - even with no messages - is never retried.
   */
  useEffect(() => {
    if (!conversationID || !canRead) return;
    if (loadState.messageList.length || moreOldLoading) return;
    if (verifiedFor.current === conversationID) return;
    const delay = RETRY_DELAYS[retryAttempt.current];
    if (delay === undefined) return;
    const timer = setTimeout(() => {
      retryAttempt.current += 1;
      verifyHistory();
    }, delay);
    return () => clearTimeout(timer);
  }, [
    conversationID,
    canRead,
    loadState.messageList.length,
    moreOldLoading,
    verifyHistory,
  ]);

  // Coming back online is a fresh reason to try, not a continuation of the old
  // failure budget.
  useEffect(() => {
    const onOnline = () => {
      retryAttempt.current = 0;
      verifyHistory();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [verifyHistory]);

  useEffect(() => {
    const pushNewMessage = (message: MessageItem) => {
      const current = useConversationStore.getState().currentConversation;
      if (
        current?.conversationID !== conversationID ||
        (current?.groupID
          ? message.groupID !== current.groupID
          : Boolean(message.groupID) ||
            ![message.sendID, message.recvID].includes(current?.userID || ""))
      )
        return;
      setLoadState((preState) =>
        preState.messageList.some((item) => item.clientMsgID === message.clientMsgID)
          ? preState
          : {
              ...preState,
              messageList: [...preState.messageList, message],
            },
      );
    };
    const updateOneMessage = (message: MessageItem) => {
      setLoadState((preState) => {
        const tmpList = [...preState.messageList];
        const idx = tmpList.findIndex((msg) => msg.clientMsgID === message.clientMsgID);
        if (idx < 0) {
          return preState;
        }

        tmpList[idx] = { ...tmpList[idx], ...message };
        return {
          ...preState,
          messageList: tmpList,
        };
      });
    };
    emitter.on("PUSH_NEW_MSG", pushNewMessage);
    emitter.on("UPDATE_ONE_MSG", updateOneMessage);
    return () => {
      emitter.off("PUSH_NEW_MSG", pushNewMessage);
      emitter.off("UPDATE_ONE_MSG", updateOneMessage);
    };
  }, [latestLoadState, conversationID]);

  const seekMessage = async (locator: MessageLocator) => {
    const epoch = loadGeneration.current;
    for (let page = 0; page < 100; page++) {
      if (epoch !== loadGeneration.current || !mounted.current) return undefined;
      const found = latestLoadState.current.messageList.find((m) =>
        matchesLocator(m, locator),
      );
      if (found) return found;
      if (!latestLoadState.current.hasMoreOld || loadingPage.current) break;
      const before = latestLoadState.current.messageList.length;
      await getMoreOldMessages(true);
      if (before === latestLoadState.current.messageList.length) break;
    }
    return undefined;
  };

  return {
    SPLIT_COUNT,
    loadState,
    latestLoadState,
    conversationID,
    moreOldLoading,
    getMoreOldMessages,
    seekMessage,
    historyError,
    historySource,
  };
}

export const pushNewMessage = (message: MessageItem) => emit("PUSH_NEW_MSG", message);
export const updateOneMessage = (message: MessageItem) =>
  emit("UPDATE_ONE_MSG", message);
