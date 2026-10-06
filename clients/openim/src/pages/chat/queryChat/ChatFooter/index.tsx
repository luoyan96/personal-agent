import { useLatest } from "ahooks";
import { Button } from "antd";
import { t } from "i18next";
import { memo, useEffect, useRef, useState } from "react";
import type { MessageItem } from "@openim/wasm-client-sdk";
import { useResearchComposer } from "@/research/ResearchComposer";
import { useResearchStore } from "@/research/store";

import CKEditor, { type CKEditorRef } from "@/components/CKEditor";
import { getCleanText } from "@/components/CKEditor/utils";
import i18n from "@/i18n";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { feedbackToast } from "@/utils/common";

import SendActionBar from "./SendActionBar";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";
import { useAgentFileReading } from "@/research/useAgentFileReading";
import { useScopedFileSender } from "@/research/useScopedFileSender";
import { useAgentChatOperation } from "@/research/useAgentChatOperation";

const sendActions = [
  { label: t("placeholder.sendWithEnter"), key: "enter" },
  { label: t("placeholder.sendWithShiftEnter"), key: "enterwithshift" },
];

i18n.on("languageChanged", () => {
  sendActions[0].label = t("placeholder.sendWithEnter");
  sendActions[1].label = t("placeholder.sendWithShiftEnter");
});

const ChatFooter = () => {
  const imID = useConversationStore((s) => s.currentConversation?.conversationID || "");
  const actor = useResearchStore((s) => s.actor?.member.id);
  const drafts = useRef(new Map<string, string>());
  const editor = useRef<CKEditorRef>(null);
  const [html, setHtml] = useState("");
  const latestHtml = useLatest(html);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const retry = useRef<{ key: string; message: MessageItem }>();
  const composer = useResearchComposer();
  useEffect(() => {
    setHtml(drafts.current.get(imID) || "");
    retry.current = undefined;
  }, [imID]);
  useEffect(() => {
    drafts.current.clear();
    setHtml("");
    retry.current = undefined;
  }, [actor]);

  const { getImageMessage, getFileMessage, getSoundMessage } = useFileMessage();
  const { sendMessage } = useSendMessage();
  const fileReading = useAgentFileReading();
  const sendFile = useScopedFileSender({ getImageMessage, getFileMessage, sendMessage, onFileSent: fileReading.onFileSent });
  const captureFileDrop = useAgentChatOperation();

  const onChange = (value: string) => {
    drafts.current.set(imID, value);
    setHtml(value);
  };

  const enterToSend = async () => {
    if (busy.current) return;
    const cleanText = getCleanText(latestHtml.current);
    if (!cleanText) return;
    const conversation = useConversationStore.getState().currentConversation;
    if (!conversation) return;
    const original = latestHtml.current;
    busy.current = true;
    setPending(true);
    try {
      if (!(await composer.sendResearch(cleanText))) {
        const key = JSON.stringify([conversation.conversationID, cleanText]);
        const message =
          retry.current?.key === key
            ? retry.current.message
            : (await IMSDK.createTextMessage(cleanText)).data;
        retry.current = { key, message };
        await sendMessage({
          message,
          recvID: conversation.userID,
          groupID: conversation.groupID,
        });
        retry.current = undefined;
      }
      if (drafts.current.get(conversation.conversationID) === original)
        drafts.current.delete(conversation.conversationID);
      if (
        latestHtml.current === original &&
        useConversationStore.getState().currentConversation?.conversationID ===
          conversation.conversationID
      )
        setHtml("");
    } catch (error) {
      feedbackToast({ error, msg: "发送失败，输入已保留" });
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  const droppedFiles = async (files: File[]) => {
    const operation = captureFileDrop();
    try {
      for (const file of files) {
        if (!operation.isCurrent()) break;
        await sendFile(file, "auto", operation.isCurrent);
      }
    } finally { operation.dispose(); }
  };

  return (
    <footer
      className="relative h-full bg-white py-px"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDropCapture={(event) => {
        if (event.dataTransfer.files.length) {
          event.preventDefault();
          event.stopPropagation();
          void droppedFiles(Array.from(event.dataTransfer.files));
        }
      }}
    >
      <div className="flex h-full flex-col border-t border-t-[var(--gap-text)]">
        <SendActionBar
          sendMessage={sendMessage}
          sendFile={sendFile}
          getSoundMessage={getSoundMessage}
          insertEmoji={(emoji) => editor.current?.insertText(emoji)}
        />
        <div
          className="max-h-[40%] min-h-0 shrink overflow-y-auto"
          data-composer-controls
        >
          {composer.controls}
          {fileReading.controls}
          {composer.advanced && composer.isCoordinator && !html && (
            <div className="px-3 py-1 text-xs">
              <p className="mb-1 text-slate-600">目标 · 材料 · 交付 · 截止时间</p>
              <div className="flex flex-wrap gap-2">
                {["文献梳理", "数据分析", "论文修改"].map((label) => (
                  <Button
                    size="small"
                    key={label}
                    disabled={pending}
                    title="只填入草稿，请修改后发送"
                    onClick={() => {
                      if (!latestHtml.current && !drafts.current.get(imID))
                        onChange(
                          `我想完成${label}。目标：待补充；已有材料：待补充；希望交付：待补充；截止时间：待确认。请先帮我明确需求，再提出供我确认的协作安排。`,
                        );
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div
          className="relative flex min-h-[128px] flex-1 flex-col overflow-hidden"
          data-composer-editor
        >
          <CKEditor
            ref={editor}
            key={imID}
            value={html}
            placeholder="发送消息…"
            onEnter={() => void enterToSend()}
            onChange={onChange}
          />
          <div className="flex items-center justify-between px-3 py-2">
            <div>{composer.advancedToggle}</div>
            <Button
              className="w-fit px-6 py-1"
              type="primary"
              loading={pending}
              disabled={!getCleanText(html) || composer.invalid}
              onClick={() => void enterToSend()}
            >
              {t("placeholder.send")}
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(ChatFooter);
