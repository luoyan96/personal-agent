import { AudioOutlined, CloseOutlined, FileOutlined, PictureOutlined, PlusOutlined, SmileOutlined } from "@ant-design/icons";
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
import { useResearchStore } from "@/research/store";
import type { SelectedFileKind } from "@/research/useScopedFileSender";

import { SendMessageParams } from "../useSendMessage";
import CallPopContent from "./CallPopContent";
import VoiceRecorder from "./VoiceRecorder";

const mediaActions = [
  { key: "image", title: "图片", icon: image, accept: "image/*" },
  { key: "file", title: "文件", icon: fileIcon, accept: "*" },
] as const;
const actionClass = "flex h-20 w-full flex-col items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 hover:border-blue-300 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";
const toolbarClass = "flex h-8 w-8 items-center justify-center rounded text-lg text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500";
const emojis = ["🙂", "😊", "👍", "👏", "🙏", "🤝", "💡", "✅", "🎉", "❤️", "🤔", "👀", "📚", "📝", "🔬", "🌱"];

const SendActionBar = ({
  sendMessage,
  sendFile,
  getSoundMessage,
  insertEmoji,
}: {
  sendMessage: (params: SendMessageParams) => Promise<void>;
  sendFile: (file: File, kind: SelectedFileKind, isCurrent?: () => boolean) => Promise<boolean>;
  getSoundMessage: (file: File, duration: number) => Promise<MessageItem>;
  insertEmoji: (emoji: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);
  const [emojiMode, setEmojiMode] = useState<"desktop" | "mobile">();
  const panelId = useId();
  const mediaEpoch = useRef(0);
  const fileIntent = useRef<{ conversationID: string; epoch: number; operation: AgentChatOperation }>();
  const captureOperation = useAgentChatOperation();
  const fileInputs = useRef<Partial<Record<"image" | "file", HTMLInputElement>>>({});
  const conversationID = useConversationStore((s) => s.currentConversation?.conversationID);
  const actorGeneration = useResearchStore((s) => s.generation);
  const isGroupSession = useConversationStore((s) => Boolean(s.currentConversation?.groupID));

  useLayoutEffect(() => {
    mediaEpoch.current++;
    setExpanded(false);
    setVoiceVisible(false);
    setEmojiMode(undefined);
    fileIntent.current?.operation.dispose();
    fileIntent.current = undefined;
    return () => { mediaEpoch.current++; fileIntent.current?.operation.dispose(); };
  }, [conversationID, actorGeneration]);

  const chooseFile = (kind: "image" | "file") => {
    const current = useConversationStore.getState().currentConversation;
    fileIntent.current?.operation.dispose();
    fileIntent.current = current ? { conversationID: current.conversationID, epoch: mediaEpoch.current, operation: captureOperation() } : undefined;
    setExpanded(false);
    setEmojiMode(undefined);
    fileInputs.current[kind]?.click();
  };
  const emojiContent = <div className="grid grid-cols-4 gap-1" role="group" aria-label="选择表情">
    {emojis.map(emoji => <button key={emoji} type="button" className="h-9 w-10 rounded text-xl hover:bg-slate-100 focus-visible:outline focus-visible:outline-blue-500" aria-label={`插入表情 ${emoji}`} onClick={() => {
      const operation = captureOperation();
      if (operation.isCurrent()) insertEmoji(emoji);
      operation.dispose(); setEmojiMode(undefined); setExpanded(false);
    }}>{emoji}</button>)}
  </div>;

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
    <div className="px-3 pt-1">
      <div className="hidden items-center gap-1 min-[601px]:flex" role="toolbar" aria-label="聊天工具栏">
        <Popover content={emojiContent} open={emojiMode === "desktop"} placement="topLeft" onOpenChange={open => setEmojiMode(open ? "desktop" : undefined)} trigger="click">
          <button type="button" className={toolbarClass} aria-label="表情" title="表情"><SmileOutlined /></button>
        </Popover>
        <button type="button" className={toolbarClass} aria-label="发送图片" title="图片" onClick={() => chooseFile("image")}><PictureOutlined /></button>
        <button type="button" className={toolbarClass} aria-label="发送文件" title="文件" onClick={() => chooseFile("file")}><FileOutlined /></button>
        <button type="button" className={toolbarClass} aria-label="打开语音面板" title="语音消息" onClick={() => { setEmojiMode(undefined); setVoiceVisible(true); }}><AudioOutlined /></button>
      </div>
      <Button
        type="text"
        className="!flex !h-9 !w-9 !items-center !justify-center !rounded-full !border !border-slate-300 !text-xl min-[601px]:!hidden"
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
        className={clsx("my-2 max-w-[360px] grid-cols-4 gap-2 rounded-xl bg-slate-50 p-2 min-[601px]:!hidden", expanded ? "grid" : "hidden")}
      >
        <Popover content={emojiContent} open={emojiMode === "mobile"} placement="topLeft" onOpenChange={open => setEmojiMode(open ? "mobile" : undefined)} trigger="click">
          <button type="button" aria-label="表情" className={actionClass}><SmileOutlined className="text-2xl" /><span>表情</span></button>
        </Popover>
        {mediaActions.map((action) => (
          <div key={action.key}>
            <button
              type="button"
              aria-label={`发送${action.title}`}
              className={actionClass}
              onClick={() => chooseFile(action.key)}
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
