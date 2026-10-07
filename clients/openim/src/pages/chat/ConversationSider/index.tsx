import clsx from "clsx";
import { t } from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { Virtuoso, VirtuosoHandle } from "react-virtuoso";

import sync from "@/assets/images/common/sync.png";
import sync_error from "@/assets/images/common/sync_error.png";
import FlexibleSider from "@/components/FlexibleSider";
import { useConversationStore, useUserStore } from "@/store";

import ConversationItemComp from "./ConversationItem";
import styles from "./index.module.scss";
import { useResearchStore } from "@/research/store";
import NewConversationButton from "@/layout/TopSearchBar/NewConversationButton";

const ConnectBar = () => {
  const userStore = useUserStore();
  const showLoading =
    userStore.syncState === "loading" || userStore.connectState === "loading";
  const showFailed =
    userStore.syncState === "failed" || userStore.connectState === "failed";

  const loadingTip =
    userStore.syncState === "loading" ? t("connect.syncing") : t("connect.connecting");

  const errorTip =
    userStore.syncState === "failed"
      ? t("connect.syncFailed")
      : t("connect.connectFailed");

  if (userStore.reinstall) {
    return null;
  }

  return (
    <>
      {showLoading && (
        <div className="flex h-6 items-center justify-center bg-[#0089FF] bg-opacity-10">
          <img
            src={sync}
            alt="sync"
            className={clsx("mr-1 h-3 w-3 ", styles.loading)}
          />
          <span className=" text-xs text-[#0089FF]">{loadingTip}</span>
        </div>
      )}
      {showFailed && (
        <div className="flex h-6 items-center justify-center bg-[#FF381F] bg-opacity-15">
          <img src={sync_error} alt="sync" className="mr-1 h-3 w-3" />
          <span className=" text-xs text-[#FF381F]">{errorTip}</span>
        </div>
      )}
    </>
  );
};

const ConversationSider = () => {
  const { conversationID } = useParams();
  const conversationList = useConversationStore((state) => state.conversationList);
  const coordinator = useResearchStore(state => state.session?.coordinator?.imConversationID);
  const nativeCoordinator = useResearchStore(state => state.coordinatorConversation);
  const contacts = useResearchStore(state => state.contacts);
  const generation = useResearchStore(state => state.generation);
  const [search, setSearch] = useState("");
  useEffect(() => { setSearch(""); }, [generation]);
  const visibleConversations = nativeCoordinator && nativeCoordinator.conversationID === coordinator &&
    !conversationList.some(item => item.conversationID === coordinator)
    ? [nativeCoordinator, ...conversationList] : conversationList;
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const names = new Map(contacts.map(item => [item.userID, item.contact.displayName]));
    return visibleConversations.filter(item => !query || `${item.showName} ${names.get(item.userID) || ""}`.toLocaleLowerCase().includes(query))
      .sort((a, b) => Number(b.conversationID === coordinator) - Number(a.conversationID === coordinator));
  }, [visibleConversations, contacts, search, coordinator]);
  const getConversationListByReq = useConversationStore(
    (state) => state.getConversationListByReq,
  );
  const virtuoso = useRef<VirtuosoHandle>(null);
  const hasmore = useRef(true);
  const loading = useRef(false);

  const endReached = async () => {
    if (!hasmore.current || loading.current) return;
    loading.current = true;
    hasmore.current = await getConversationListByReq(true);
    loading.current = false;
  };

  return (
    <div className={clsx("desktop-conversation-column flex min-h-0 flex-col", {
      "max-[600px]:hidden": Boolean(conversationID),
      "max-[600px]:w-full": !conversationID,
    })}>
      <ConnectBar />
      <FlexibleSider
        needHidden={Boolean(conversationID)}
        siderClassName="min-h-0 flex-1"
        wrapClassName="desktop-conversation-list left-2 right-2 top-1.5 flex flex-col"
      >
        {window.electronAPI && <div className="desktop-conversation-heading">
          <div className="desktop-conversation-title"><h1>消息</h1><NewConversationButton /></div>
          <Input prefix={<SearchOutlined />} placeholder="搜索聊天" aria-label="搜索聊天" allowClear value={search} onChange={event => setSearch(event.target.value)} />
        </div>}
        {window.electronAPI && !filtered.length && <p className="desktop-conversation-empty">{search ? "没有匹配的聊天" : "聊天会显示在这里"}</p>}
        <Virtuoso
          className="flex-1"
          data={filtered}
          ref={virtuoso}
          endReached={() => void endReached()}
          computeItemKey={(_, item) => item.conversationID}
          itemContent={(_, conversation) => (
            <ConversationItemComp
              isActive={conversationID === conversation.conversationID}
              conversation={conversation}
            />
          )}
        />
      </FlexibleSider>
    </div>
  );
};

export default ConversationSider;
