import type {
  ConversationItem as ConversationItemType,
  MessageItem,
} from "@openim/wasm-client-sdk/lib/types/entity";
import { Badge } from "antd";
import { PushpinOutlined } from "@ant-design/icons";
import clsx from "clsx";
import { t } from "i18next";
import { memo, useMemo } from "react";
import { useNavigate } from "react-router-dom";

import OIMAvatar from "@/components/OIMAvatar";
import { useConversationStore } from "@/store";
import { formatConversionTime, getConversationContent } from "@/utils/imCommon";

import styles from "./conversation-item.module.scss";
import { useResearchStore } from "@/research/store";

interface IConversationProps {
  isActive: boolean;
  conversation: ConversationItemType;
}

const ConversationItem = ({ isActive, conversation }: IConversationProps) => {
  const navigate = useNavigate();
  const coordinator = useResearchStore((s) => s.session?.coordinator);
  const contact = useResearchStore(
    (s) => s.contacts.find((c) => c.userID === conversation.userID)?.contact,
  );
  const isCoordinator = coordinator?.imConversationID === conversation.conversationID;
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );
  const toSpecifiedConversation = async () => {
    if (isActive) {
      return;
    }
    await updateCurrentConversation({ ...conversation });
    navigate(`/chat/${conversation.conversationID}`);
  };

  const latestMessageContent = useMemo(() => {
    let content = "";
    if (!conversation.latestMsg) {
      return "";
    }
    try {
      content = getConversationContent(
        JSON.parse(conversation.latestMsg) as MessageItem,
      );
    } catch (error) {
      content = t("messageDescription.catchMessage");
    }
    return content;
  }, [conversation.latestMsg]);

  const latestMessageTime = formatConversionTime(conversation.latestMsgSendTime);

  return (
    <button
      type="button"
      aria-current={isActive ? "true" : undefined}
      className={clsx(
        styles["conversation-item"],
        "desktop-conversation-row w-full border border-transparent text-left",
        isActive && `bg-[var(--primary-active)]`,
      )}
      onClick={() => void toSpecifiedConversation()}
    >
      <Badge size="small" count={conversation.unreadCount}>
        <OIMAvatar
          src={conversation.faceURL}
          isgroup={Boolean(conversation.groupID)}
          text={conversation.showName}
          size={window.electronAPI ? 40 : 42}
        />
      </Badge>

      <div className="ml-3 flex h-11 flex-1 flex-col justify-between overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex-1 truncate font-medium">
            {contact?.displayName || conversation.showName}
            {contact && contact.identity.kind !== "human" && (
              <span className="desktop-agent-label ml-1 text-xs text-blue-600">AI</span>
            )}
          </div>
          <div className="desktop-conversation-time ml-2 text-xs text-[var(--sub-text)]">{latestMessageTime}</div>
        </div>

        <div className="flex items-center">
          <div className="flex min-h-[16px] flex-1 items-center overflow-hidden text-xs">
            <div className="truncate text-[rgba(81,94,112,0.5)]">
              {latestMessageContent ||
                (isCoordinator ? contact?.displayName || conversation.showName : "")}
            </div>
          </div>
          {(isCoordinator || conversation.isPinned) && <PushpinOutlined className="desktop-conversation-pin" aria-label={isCoordinator ? "个人助理置顶" : "聊天置顶"} />}
        </div>
      </div>
    </button>
  );
};

export default memo(ConversationItem);
