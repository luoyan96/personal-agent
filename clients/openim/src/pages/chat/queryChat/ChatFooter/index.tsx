import { useLatest } from "ahooks";
import { Button } from "antd";
import { t } from "i18next";
import { memo, useEffect, useRef, useState } from "react";
import { MessageType } from "@openim/wasm-client-sdk";
import { ArrowUpOutlined, CloseOutlined } from "@ant-design/icons";
import { useChatReply, replyKey, clearChatReply } from "@/research/chat-reply";
import { useResearchComposer } from "@/research/ResearchComposer";
import { useResearchStore } from "@/research/store";

import CKEditor, { type CKEditorRef } from "@/components/CKEditor";
import { getCleanText } from "@/components/CKEditor/utils";
import i18n from "@/i18n";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { feedbackToast } from "@/utils/common";

import SendActionBar from "./SendActionBar";
import ImagePasteTray, { type ImagePasteTrayRef } from "@/research/ImagePasteTray";
import { useFileMessage } from "./SendActionBar/useFileMessage";
import { useSendMessage } from "./useSendMessage";
import { useAgentFileReading } from "@/research/useAgentFileReading";
import { useScopedFileSender } from "@/research/useScopedFileSender";
import { useAgentChatOperation } from "@/research/useAgentChatOperation";
import type { AgentChatOperation } from "@/research/useAgentChatOperation";
import { assertRequestActive, withRequestDeadline } from "@/research/request-deadline";
import emitter from "@/utils/events";
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
  const activeReplyKey = replyKey(generation, imID);
  const reply = useChatReply((s) => s.replies[activeReplyKey]);
  const drafts = useRef(chatDrafts);
  const editor = useRef<CKEditorRef>(null);
  const imageTray = useRef<ImagePasteTrayRef>(null);
  const [html, setHtml] = useState("");
  const latestHtml = useLatest(html);
  const outbox = useChatOutbox((s) => s.items);
  const storageNotice = useChatOutbox((s) => s.notice);
  const submissions = outbox.filter(
    (item) => item.generation === generation && item.conversationID === imID,
  );
  const pending = submissions.some((item) => item.state === "sending");
  const recovery = submissions.find(
    (item) => item.state === "failed" || item.state === "paused",
  );
  const sending = submissions.find((item) => item.state === "sending");
  const busy = useRef<number>();
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
    if (reply) editor.current?.focus();
  }, [reply]);
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
          (item.state === "queued" || item.state === "sending")
            ? {
                ...item,
                state: "paused" as const,
                error:
                  item.state === "sending"
                    ? "发送结果尚未确认，请重试原消息核对。"
                    : item.error,
              }
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
    const requestEpoch = epoch.current;
    if (busy.current === requestEpoch) return;
    busy.current = requestEpoch;
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
              tracked.operation.signal,
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
            await withRequestDeadline(
              async (signal) => {
                const message =
                  item.nativeMessage ||
                  (item.quoteMessage
                    ? (
                        await IMSDK.createQuoteMessage({
                          text: item.text,
                          message: JSON.stringify(item.quoteMessage),
                        })
                      ).data
                    : (await IMSDK.createTextMessage(item.text)).data);
                assertRequestActive(signal);
                updateSubmission(item.id, { nativeMessage: message });
                if (!tracked.operation.isCurrent())
                  throw new Error("会话已切换，这条消息尚未发送。");
                await sendMessage({
                  message,
                  recvID: item.recvID,
                  groupID: item.groupID,
                  isCurrent: () => tracked.operation.isCurrent() && !signal.aborted,
                });
                assertRequestActive(signal);
              },
              30000,
              tracked.operation.signal,
            );
          }
          if (operations.current.get(item.id) !== tracked) break;
          removeSubmission(item.id);
          tracked.operation.dispose();
          operations.current.delete(item.id);
        } catch (error) {
          if (operations.current.get(item.id) === tracked) {
            tracked.operation.dispose();
            updateSubmission(item.id, {
              state: "failed",
              error:
                error instanceof Error && error.name !== "AbortError"
                  ? error.message
                  : "已停止等待，发送结果尚未确认。请重试原消息核对。",
            });
          }
          break; // Never silently skip a failed earlier sentence.
        }
      }
    } finally {
      if (busy.current === requestEpoch) busy.current = undefined;
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
      let text = cleanText;
      let request = composer.prepareResearch(text);
      if (
        reply &&
        (request ||
          !reply.message ||
          reply.message.contentType === MessageType.CustomMessage)
      ) {
        // Preserve leading group addresses and their original mention offsets.
        // Quoted @ text is context, never a new addressee.
        text = `${cleanText}\n\n> 引用 ${reply.sender.replace(
          /[\r\n]/g,
          " ",
        )}：\n${reply.text
          .split("\n")
          .map((line) => `> ${line}`)
          .join("\n")}`;
        if (text.length > 8000)
          throw new Error("回复与引用内容过长，请缩短回复后再发送。");
        // Preserve the already accepted external consent and original request shape.
        if (request) request = { ...request, body: { ...request.body, text } };
      }
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
        text,
        request,
        quoteMessage:
          reply?.message &&
          !request &&
          reply.message.contentType !== MessageType.CustomMessage
            ? reply.message
            : undefined,
        state: "queued",
      };
      useChatOutbox.setState((s) => ({ items: [...s.items, item] }));
      clearChatReply(activeReplyKey);
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
    const images = files.filter(file => file.type.startsWith("image/"));
    if (images.length) imageTray.current?.stage(images);
    const operation = captureFileDrop();
    try {
      for (const file of files.filter(file => !file.type.startsWith("image/"))) {
        if (!operation.isCurrent()) break;
        await sendFile(file, "auto", operation.isCurrent);
      }
    } finally {
      operation.dispose();
    }
  };
  const latestDroppedFiles = useLatest(droppedFiles);
  useEffect(() => {
    const handleDrop = (request: {
      conversationID: string;
      generation: number;
      files: File[];
    }) => {
      if (
        request.conversationID === imID &&
        request.generation === generation &&
        imID === useConversationStore.getState().currentConversation?.conversationID &&
        generation === useResearchStore.getState().generation
      )
        void latestDroppedFiles.current(request.files);
    };
    emitter.on("CHAT_FILES_DROPPED", handleDrop);
    return () => emitter.off("CHAT_FILES_DROPPED", handleDrop);
  }, [imID, generation]);

  return (
    <footer
      onPasteCapture={(event) => imageTray.current?.paste(event)}
      className={`desktop-chat-footer relative bg-white py-px ${
        window.electronAPI ? "is-native-desktop" : ""
      }`}
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
      <div className="desktop-composer-surface flex h-full flex-col border-t border-t-[var(--gap-text)]">
        <SendActionBar
          sendMessage={sendMessage}
          sendFile={sendFile}
          getSoundMessage={getSoundMessage}
          insertEmoji={(emoji) => editor.current?.insertText(emoji)}
          stageImages={(files) => imageTray.current?.stage(files)}
          pasteImages={() => imageTray.current?.readClipboard()}
        />
        <ImagePasteTray key={scope} ref={imageTray} sendFile={sendFile} insertText={(text) => editor.current?.insertText(text)} />
        {reply && (
          <div className="desktop-composer-quote" data-chat-quote>
            <div>
              <strong>回复 {reply.sender}</strong>
              <p>{reply.text}</p>
            </div>
            <button
              type="button"
              aria-label="取消引用"
              onClick={() => clearChatReply(activeReplyKey)}
            >
              <CloseOutlined />
            </button>
          </div>
        )}
        {!!submissions.length && (
          <div
            className="desktop-send-record shrink-0"
            data-chat-outbox
            data-send-recovery={recovery ? "true" : undefined}
          >
            <p className="text-slate-500" role="status">
              {pending ? "正在发送；可以继续输入" : "发送记录已保留"} ·{" "}
              {submissions.length} 条
            </p>
            {sending && !recovery && (
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 truncate" title={sending.text}>
                  {sending.text}
                </p>
                <Button
                  size="small"
                  title="只停止等待回执，发送结果需核对"
                  onClick={() =>
                    operations.current.get(sending.id)?.operation.dispose()
                  }
                >
                  停止等待
                </Button>
              </div>
            )}
            {recovery && (
              <div>
                <p className="truncate" title={recovery.text}>
                  {recovery.text}
                </p>
                <p className="desktop-send-error text-red-700" role="alert">
                  {recovery.error || "离开会话后已暂停，请核对后继续。"}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  <Button
                    size="small"
                    disabled={pending}
                    onClick={() => retrySubmission(recovery)}
                  >
                    重试原消息
                  </Button>
                  <Button
                    size="small"
                    disabled={pending}
                    title="仅移除这条本地记录，不会撤回已到达服务器的消息"
                    onClick={() => {
                      operations.current.get(recovery.id)?.operation.dispose();
                      operations.current.delete(recovery.id);
                      removeSubmission(recovery.id);
                      void pump();
                    }}
                  >
                    移除此记录
                  </Button>
                  {submissions.length > 1 && (
                    <span className="text-slate-500">后续消息等待此条处理</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
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
          <div className="desktop-composer-bottom flex items-center justify-between px-3 py-2">
            <div>{composer.advancedToggle}</div>
            {window.electronAPI && (
              <span className="desktop-send-shortcut">
                Enter 发送 · Shift+Enter 换行
              </span>
            )}
            <Button
              className="w-fit px-6 py-1"
              type="primary"
              aria-label="发送消息"
              title="发送消息"
              disabled={!getCleanText(html) || composer.invalid}
              onClick={() => void enterToSend()}
            >
              {window.electronAPI ? <ArrowUpOutlined /> : t("placeholder.send")}
            </Button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default memo(ChatFooter);
