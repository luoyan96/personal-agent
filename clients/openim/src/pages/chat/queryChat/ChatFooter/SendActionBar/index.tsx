import { MessageItem } from "@openim/wasm-client-sdk";
import { Popover, PopoverProps, Upload, UploadProps } from "antd";
import { TooltipPlacement } from "antd/es/tooltip";
import clsx from "clsx";
import i18n, { t } from "i18next";
import { memo, ReactNode, useState } from "react";
import React from "react";

import image from "@/assets/images/chatFooter/image.png";
import fileIcon from "@/assets/images/chatFooter/file.png";
import rtc from "@/assets/images/chatFooter/rtc.png";
import { useConversationStore } from "@/store";

import { SendMessageParams } from "../useSendMessage";
import CallPopContent from "./CallPopContent";
import VoiceRecorder from "./VoiceRecorder";
import { feedbackToast } from "@/utils/common";

type UploadRequestOption = Parameters<NonNullable<UploadProps["customRequest"]>>[0];

const sendActionList = [
  {
    title: "文件",
    icon: fileIcon,
    key: "file",
    accept: "*",
    comp: null,
    placement: undefined,
  },
  {
    title: t("placeholder.image"),
    icon: image,
    key: "image",
    accept: "image/*",
    comp: null,
    placement: undefined,
  },
  {
    title: t("placeholder.call"),
    icon: rtc,
    key: "rtc",
    accept: undefined,
    comp: <CallPopContent />,
    placement: "top",
  },
];

i18n.on("languageChanged", () => {
  sendActionList[1].title = t("placeholder.image");
  sendActionList[2].title = t("placeholder.call");
});

const SendActionBar = ({
  sendMessage,
  getImageMessage,
  getFileMessage,
  getSoundMessage,
}: {
  sendMessage: (params: SendMessageParams) => Promise<void>;
  getImageMessage: (file: File) => Promise<MessageItem>;
  getFileMessage: (file: File) => Promise<MessageItem>;
  getSoundMessage: (file: File, duration: number) => Promise<MessageItem>;
}) => {
  const [visibleState, setVisibleState] = useState(false);
  const isGroupSession = useConversationStore((state) =>
    Boolean(state.currentConversation?.groupID),
  );

  const closePop = () => setVisibleState(false);

  const fileHandle = (options: UploadRequestOption, kind: string) => {
    if (!(options.file instanceof File)) return;
    const file = options.file;
    const conversation = useConversationStore.getState().currentConversation;
    if (!conversation) { options.onError?.(new Error("请先选择会话")); return; }
    void (async () => {
      try {
        const message = await (kind === "image" ? getImageMessage(file) : getFileMessage(file));
        await sendMessage({ message, recvID: conversation.userID, groupID: conversation.groupID });
        options.onSuccess?.(message);
      } catch (error) { feedbackToast({ error, msg: "文件发送失败，请检查连接后重试" }); options.onError?.(error instanceof Error ? error : new Error("文件发送失败")); }
    })();
  };

  return (
    <div className="flex flex-wrap items-center px-4.5 pt-2">
      {sendActionList.map((action) => {
        if (action.key === "rtc" && isGroupSession) {
          return null;
        }
        const popProps: PopoverProps = {
          placement: action.placement as TooltipPlacement,
          content:
            action.comp &&
            React.cloneElement(action.comp as React.ReactElement, {
              closePop,
            }),
          title: null,
          arrow: false,
          trigger: "click",
          // @ts-ignore
          open: action.comp ? visibleState : false,
          onOpenChange: (visible) => setVisibleState(visible),
        };

        return (
          <ActionWrap
            popProps={popProps}
            key={action.key}
            accept={action.accept}
            fileHandle={options => fileHandle(options, action.key)}
          >
            <div
              className={clsx("flex cursor-pointer items-center last:mr-0", {
                "mr-5": !action.accept,
              })}
            >
              <img src={action.icon} width={20} alt={action.title} />
            </div>
          </ActionWrap>
        );
      })}
      <VoiceRecorder getSoundMessage={getSoundMessage} sendMessage={sendMessage} />
    </div>
  );
};

export default memo(SendActionBar);

const ActionWrap = ({
  accept,
  popProps,
  children,
  fileHandle,
}: {
  accept?: string;
  children: ReactNode;
  popProps?: PopoverProps;
  fileHandle: (options: UploadRequestOption) => void;
}) => {
  return accept ? (
    <Upload
      showUploadList={false}
      customRequest={fileHandle}
      accept={accept}
      multiple
      className="mr-5 flex"
    >
      {children}
    </Upload>
  ) : (
    <Popover {...popProps}>{children}</Popover>
  );
};
