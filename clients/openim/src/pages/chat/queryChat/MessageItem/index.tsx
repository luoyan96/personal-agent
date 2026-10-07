import { MessageItem as MessageItemType, MessageType, SessionType } from "@openim/wasm-client-sdk";
import clsx from "clsx";
import { FC, memo, useRef } from "react";

import OIMAvatar from "@/components/OIMAvatar";
import { formatMessageTime } from "@/utils/imCommon";

import CatchMessageRender from "./CatchMsgRenderer";
import MediaMessageRender from "./MediaMessageRender";
import styles from "./message-item.module.scss";
import MessageItemErrorBoundary from "./MessageItemErrorBoundary";
import MessageSuffix from "./MessageSuffix";
import TextMessageRender from "./TextMessageRender";
import FileMessageRender from "./FileMessageRender";
import SoundMessageRender from "./SoundMessageRender";
import ResearchMessageRender from "@/research/ResearchMessageRender";
import { useConversationStore } from "@/store";

export interface IMessageItemProps {
  message: MessageItemType;
  isSender: boolean;
  disabled?: boolean;
  conversationID?: string;
  messageUpdateFlag?: string;
}

const components: Record<number, FC<IMessageItemProps>> = {
  [MessageType.TextMessage]: TextMessageRender,
  [MessageType.PictureMessage]: MediaMessageRender,
  [MessageType.FileMessage]: FileMessageRender,
  [MessageType.VoiceMessage]: SoundMessageRender,
  [MessageType.CustomMessage]: ResearchMessageRender,
};

const MessageItem: FC<IMessageItemProps> = ({
  message,
  disabled,
  isSender,
  conversationID,
}) => {
  const messageWrapRef = useRef<HTMLDivElement>(null);
  const isDirectChat = useConversationStore(s => s.currentConversation?.conversationType === SessionType.Single);
  const MessageRenderComponent = components[message.contentType] || CatchMessageRender;

  return (
    <>
      <div
        id={`chat_${message.clientMsgID}`}
        className={clsx("desktop-message-row relative flex select-text px-5 py-3", isSender && "desktop-message-row-sender", isDirectChat && "desktop-message-row-direct")}
      >
        <div
          className={clsx(
            styles["message-container"],
            isSender && styles["message-container-sender"],
          )}
        >
          <OIMAvatar
            size={36}
            src={message.senderFaceUrl}
            text={message.senderNickname}
          />

          <div className={styles["message-wrap"]} ref={messageWrapRef}>
            <div className={styles["message-profile"]}>
              <div
                title={message.senderNickname}
                className={clsx(
                  "max-w-[30%] truncate text-[var(--sub-text)]",
                  isSender ? "ml-2" : "mr-2",
                )}
              >
                {message.senderNickname}
              </div>
              <div className="text-[var(--sub-text)]">
                {formatMessageTime(message.sendTime)}
              </div>
            </div>

            <div className={styles["menu-wrap"]}>
              <MessageItemErrorBoundary message={message}>
                <MessageRenderComponent
                  message={message}
                  isSender={isSender}
                  disabled={disabled}
                />
              </MessageItemErrorBoundary>

              <MessageSuffix
                message={message}
                isSender={isSender}
                disabled={false}
                conversationID={conversationID}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default memo(MessageItem);
