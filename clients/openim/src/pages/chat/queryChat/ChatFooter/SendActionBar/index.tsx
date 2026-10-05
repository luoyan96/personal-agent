import { AudioOutlined, CloseOutlined, PlusOutlined } from "@ant-design/icons";
import { MessageItem } from "@openim/wasm-client-sdk";
import { Button, Popover } from "antd";
import clsx from "clsx";
import { t } from "i18next";
import { memo, useId, useLayoutEffect, useRef, useState } from "react";

import image from "@/assets/images/chatFooter/image.png";
import fileIcon from "@/assets/images/chatFooter/file.png";
import rtc from "@/assets/images/chatFooter/rtc.png";
import { researchMode } from "@/research/api";
import { useConversationStore } from "@/store";
import { feedbackToast } from "@/utils/common";
import { useAgentChatOperation, type AgentChatOperation } from "@/research/useAgentChatOperation";
import type { SelectedFileKind } from "@/research/useScopedFileSender";

import { SendMessageParams } from "../useSendMessage";
import CallPopContent from "./CallPopContent";
import VoiceRecorder from "./VoiceRecorder";

const mediaActions = [
  { key: "image", title: "图片", icon: image, accept: "image/*" },
  { key: "file", title: "文件", icon: fileIcon, accept: "*" },
] as const;
const actionClass = "flex h-20 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";

const SendActionBar = ({
  sendMessage,
  sendFile,
  getSoundMessage,
}: {
  sendMessage: (params: SendMessageParams) => Promise<void>;
  sendFile: (file: File, kind: SelectedFileKind, isCurrent?: () => boolean) => Promise<boolean>;
  getSoundMessage: (file: File, duration: number) => Promise<MessageItem>;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const panelId = useId();
  const mediaEpoch = useRef(0);
  const fileIntent = useRef<{ conversationID: string; epoch: number; operation: AgentChatOperation }>();
  const captureOperation = useAgentChatOperation();
  const fileInputs = useRef<Partial<Record<"image" | "file", HTMLInputElement>>>({});
  const conversationID = useConversationStore((s) => s.currentConversation?.conversationID);
  const isGroupSession = useConversationStore((s) => Boolean(s.currentConversation?.groupID));

  useLayoutEffect(() => {
    mediaEpoch.current++;
    setExpanded(false);
    setVoiceVisible(false);
    fileIntent.current?.operation.dispose();
    fileIntent.current = undefined;
    return () => { mediaEpoch.current++; fileIntent.current?.operation.dispose(); };
  }, [conversationID]);

  const fileHandle = (files: File[], kind: "image" | "file") => {
    const conversation = useConversationStore.getState().currentConversation;
    const intent = fileIntent.current;
    if (!conversation || !intent || !intent.operation.isCurrent() || intent.conversationID !== conversation.conversationID || intent.epoch !== mediaEpoch.current) {
      const error = new Error("会话已切换，请在当前会话重新选择文件");
      feedbackToast({ error, msg: error.message });
      return;
    }
    void (async () => {
      try {
        for (const file of files) {
          if (!intent.operation.isCurrent()) break;
          await sendFile(file, kind, intent.operation.isCurrent);
        }
      } finally { intent.operation.dispose(); }
    })();
  };

  return (
    <div className="px-4.5 pt-2">
      <Button
        type="text"
        className="!flex !h-9 !w-9 !items-center !justify-center !rounded-full !border !border-slate-300 !text-xl"
        aria-label="更多聊天功能"
        aria-expanded={expanded}
        aria-controls={panelId}
        icon={expanded ? <CloseOutlined /> : <PlusOutlined />}
        onClick={() => setExpanded((value) => !value)}
      />
      <div
        id={panelId}
        role="group"
        aria-label="聊天扩展功能"
        className={clsx("my-2 max-w-[360px] grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3", expanded ? "grid" : "hidden")}
      >
        {mediaActions.map((action) => (
          <div key={action.key}>
            <button
              type="button"
              aria-label={`发送${action.title}`}
              className={actionClass}
              onClick={() => {
                const current = useConversationStore.getState().currentConversation;
                fileIntent.current?.operation.dispose();
                fileIntent.current = current ? { conversationID: current.conversationID, epoch: mediaEpoch.current, operation: captureOperation() } : undefined;
                setExpanded(false);
                fileInputs.current[action.key]?.click();
              }}
            >
              <img src={action.icon} width={24} alt="" />
              <span>{action.title}</span>
            </button>
            <input
              ref={(element) => {
                if (element) fileInputs.current[action.key] = element;
                else delete fileInputs.current[action.key];
              }}
              type="file"
              className="hidden"
              accept={action.accept}
              multiple
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = "";
                fileHandle(files, action.key);
              }}
            />
          </div>
        ))}
        <button
          type="button"
          aria-label="打开语音面板"
          className={actionClass}
          onClick={() => { setExpanded(false); setVoiceVisible(true); }}
        >
          <AudioOutlined className="text-2xl" />
          <span>语音</span>
        </button>
        {!researchMode && !isGroupSession && (
          <Popover content={<CallPopContent closeAllPop={() => setExpanded(false)} />} trigger="click" arrow={false} placement="top">
            <button type="button" className={actionClass} aria-label={t("placeholder.call")}>
              <img src={rtc} width={24} alt="" />
              <span>{t("placeholder.call")}</span>
            </button>
          </Popover>
        )}
      </div>
      {voiceVisible && (
        <div className="my-2 flex flex-wrap items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2" role="group" aria-label="语音消息">
          <VoiceRecorder getSoundMessage={getSoundMessage} sendMessage={sendMessage} />
          <Button type="text" size="small" icon={<CloseOutlined />} aria-label="关闭语音面板" onClick={() => setVoiceVisible(false)} />
        </div>
      )}
    </div>
  );
};

export default memo(SendActionBar);
