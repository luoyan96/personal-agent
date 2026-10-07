import { useLatest } from "ahooks";
import { Button } from "antd";
import { t } from "i18next";
import { memo, useEffect, useRef, useState } from "react";
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
import type { AgentChatOperation } from "@/research/useAgentChatOperation";
import "./desktop-chat.scss";
import {
  chatDrafts,
  saveChatDraft,
  useChatOutbox,
  updateSubmission,
  removeSubmission,
  type ChatSubmission,
} from "@/research/chat-outbox";

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
  const generation = useResearchStore((s) => s.generation);
  const drafts = useRef(chatDrafts);
  const editor = useRef<CKEditorRef>(null);
  const [html, setHtml] = useState("");
  const latestHtml = useLatest(html);
  const outbox = useChatOutbox((s) => s.items);
  const storageNotice = useChatOutbox((s) => s.notice);
  const submissions = outbox.filter(
    (item) => item.generation === generation && item.conversationID === imID,
  );
  const pending = submissions.some((item) => item.state === "sending");
  const busy = useRef(false);
  const mounted = useRef(false);
  const epoch = useRef(0);
  const wake = useRef<() => Promise<void>>();
  const operations = useRef(
    new Map<string, { operation: AgentChatOperation; intent: number }>(),
  );
  const scope = `${generation}:${actor}:${imID}`;
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const captureSend = useAgentChatOperation();
  const composer = useResearchComposer();
  useEffect(() => {
    setHtml(drafts.current.get(imID) || "");
  }, [imID, generation]);
  useEffect(() => {
    epoch.current++;
    mounted.current = true;
    return () => {
      epoch.current++;
      mounted.current = false;
      for (const { operation } of operations.current.values()) operation.dispose();
      operations.current.clear();
      useChatOutbox.setState((s) => ({
        items: s.items.map((item) =>
          item.generation === generation &&
          item.conversationID === imID &&
          item.state === "queued"
            ? { ...item, state: "paused" as const }
            : item,
        ),
      }));
    };
  }, [scope]);

  const { getImageMessage, getFileMessage, getSoundMessage } = useFileMessage();
  const { sendMessage } = useSendMessage();
  const fileReading = useAgentFileReading();
  const sendFile = useScopedFileSender({
    getImageMessage,
    getFileMessage,
    sendMessage,
    onFileSent: fileReading.onFileSent,
  });
  const captureFileDrop = useAgentChatOperation();

  const onChange = (value: string) => {
    if (
      generation !== useResearchStore.getState().generation ||
      imID !== useConversationStore.getState().currentConversation?.conversationID
    )
      return;
    saveChatDraft(imID, value);
    setHtml(value);
  };

  const pump = async () => {
    if (busy.current) return;
    busy.current = true;
    const requestEpoch = epoch.current;
    try {
      while (
        mounted.current &&
        requestEpoch === epoch.current &&
        currentScope.current === scope
      ) {
        const item = useChatOutbox
          .getState()
          .items.find(
            (item) => item.generation === generation && item.conversationID === imID,
          );
        if (!item || item.state !== "queued") break;
        const tracked = operations.current.get(item.id);
        if (!tracked?.operation.isCurrent()) {
          updateSubmission(item.id, { state: "paused" });
          break;
        }
        updateSubmission(item.id, { state: "sending", error: undefined });
        try {
          if (item.request)
            await composer.sendPrepared(
              item.request,
              item.id,
              tracked.operation.isCurrent,
              tracked.intent,
            );
          else {
            const current = useConversationStore.getState().currentConversation;
            if (
              current?.conversationID !== item.conversationID ||
              current.userID !== item.recvID ||
              current.groupID !== item.groupID
            )
              throw new Error(
                "原发送对象已变化，请核对后重新输入；不会转发到其他联系人。",
              );
            const message =
              item.nativeMessage || (await IMSDK.createTextMessage(item.text)).data;
            updateSubmission(item.id, { nativeMessage: message });
            if (!tracked.operation.isCurrent())
              throw new Error("会话已切换，这条消息尚未发送。");
            await sendMessage({
              message,
              recvID: item.recvID,
              groupID: item.groupID,
              isCurrent: tracked.operation.isCurrent,
            });
          }
          removeSubmission(item.id);
          tracked.operation.dispose();
          operations.current.delete(item.id);
        } catch (error) {
          updateSubmission(item.id, {
            state: "failed",
            error: error instanceof Error ? error.message : "发送失败，请核对后重试。",
          });
          break; // Never silently skip a failed earlier sentence.
        }
      }
    } finally {
      busy.current = false;
      const next = useChatOutbox
        .getState()
        .items.find(
          (item) =>
            item.generation === useResearchStore.getState().generation &&
            item.conversationID ===
              useConversationStore.getState().currentConversation?.conversationID,
        );
      if (
        mounted.current &&
        next?.state === "queued" &&
        operations.current.get(next.id)?.operation.isCurrent()
      )
        void wake.current?.();
    }
  };
  wake.current = pump;
  const enterToSend = () => {
    const cleanText = getCleanText(latestHtml.current);
    if (!cleanText) return;
    const conversation = useConversationStore.getState().currentConversation;
    if (
      !conversation ||
      conversation.conversationID !== imID ||
      generation !== useResearchStore.getState().generation
    )
      return;
    const original = latestHtml.current;
    try {
      if (submissions.length >= 20 || useChatOutbox.getState().items.length >= 50)
        throw new Error("还有较多消息未发送，请先处理发送记录。");
      const request = composer.prepareResearch(cleanText);
      const id = crypto.randomUUID(),
        operation = captureSend(),
        intent = composer.acceptSendIntent();
      operations.current.set(id, { operation, intent });
      const item: ChatSubmission = {
        id,
        generation,
        conversationID: conversation.conversationID,
        recvID: conversation.userID,
        groupID: conversation.groupID,
        html: original,
        text: cleanText,
        request,
        state: "queued",
      };
      useChatOutbox.setState((s) => ({ items: [...s.items, item] }));
      saveChatDraft(conversation.conversationID, "");
      latestHtml.current = "";
      setHtml("");
      void pump();
    } catch (error) {
      feedbackToast({ error, msg: "发送失败，输入已保留" });
    }
  };
  const retrySubmission = (item: ChatSubmission) => {
    if (
      item.generation !== useResearchStore.getState().generation ||
      item.conversationID !==
        useConversationStore.getState().currentConversation?.conversationID
    )
      return;
    operations.current.get(item.id)?.operation.dispose();
    operations.current.set(item.id, {
      operation: captureSend(),
      intent: composer.acceptSendIntent(),
    });
    updateSubmission(item.id, { state: "queued", error: undefined });
    void pump();
  };

  const droppedFiles = async (files: File[]) => {
    const operation = captureFileDrop();
    try {
      for (const file of files) {
        if (!operation.isCurrent()) break;
        await sendFile(file, "auto", operation.isCurrent);
      }
    } finally {
      operation.dispose();
    }
  };

  return (
    <footer
      className={`desktop-chat-footer relative h-full bg-white py-px ${window.electronAPI ? "is-native-desktop" : ""}`}
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
          {storageNotice && (
            <p className="px-3 py-1 text-xs text-amber-700">
              {storageNotice}
              <button
                className="ml-2"
                onClick={() => useChatOutbox.setState({ notice: "" })}
              >
                知道了
              </button>
            </p>
          )}
          {!!submissions.length && (
            <div className="px-3 py-1 text-xs" data-chat-outbox>
              <p className="text-slate-500">
                {pending ? "正在发送；可以继续输入" : "未发送内容已保留"} ·{" "}
                {submissions.length} 条
              </p>
              {submissions
                .filter((item) => item.state === "failed" || item.state === "paused")
                .slice(0, 1)
                .map((item) => (
                  <div key={item.id}>
                    <p className="truncate" title={item.text}>
                      {item.text}
                    </p>
                    <p className="text-red-700">
                      {item.error || "离开会话后暂停，尚未继续发送。"}{" "}
                      后续消息也已暂停。
                    </p>
                    <Button size="small" onClick={() => retrySubmission(item)}>
                      重试此条
                    </Button>
                    <Button
                      size="small"
                      onClick={() => {
                        operations.current.get(item.id)?.operation.dispose();
                        operations.current.delete(item.id);
                        removeSubmission(item.id);
                        void pump();
                      }}
                    >
                      不发送此条，继续
                    </Button>
                    <Button
                      size="small"
                      disabled={!!html}
                      onClick={() => onChange(item.html)}
                    >
                      复制回输入框
                    </Button>
                  </div>
                ))}
            </div>
          )}
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
