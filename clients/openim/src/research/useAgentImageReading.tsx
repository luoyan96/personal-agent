import { MessageStatus, type MessageItem } from "@openim/wasm-client-sdk";
import { Button } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useConversationStore, useUserStore } from "@/store";
import { researchMode } from "./api";
import { useResearchStore } from "./store";
import { useAgentChatOperation } from "./useAgentChatOperation";
import { useAgentFileReading } from "./useAgentFileReading";
import type { SentFileContext } from "./useScopedFileSender";
import { firstPartyFile } from "./firstPartyFile";
import { imagePasteLimits } from "@/types/imageClipboard";

// Shared across the composer and image bubbles; one SDK image cannot start two
// simultaneous OCR jobs. The API separately deduplicates by the original ID.
const inFlight = new Map<string, object>();
type ImageReading = {
  key: string;
  context: SentFileContext;
  phase: "downloading" | "recognizing" | "failed";
  error?: string;
  message?: MessageItem;
};

export function directImageAgent() {
  const current = useConversationStore.getState().currentConversation;
  const state = useResearchStore.getState();
  const mapping = state.mappings.find(
    (item) => item.imConversationID === current?.conversationID,
  );
  const peer = state.contacts.find((item) => item.userID === current?.userID)?.contact;
  return researchMode &&
    state.actor &&
    state.sessionActorId === state.actor.member.id &&
    state.session?.user?.userID === useUserStore.getState().selfInfo.userID &&
    current &&
    !current.groupID &&
    mapping &&
    mapping.kind !== "group" &&
    peer &&
    peer.identity.kind !== "human" &&
    !peer.agentRuntime &&
    peer.allowedActions.includes("chat")
    ? mapping.researchConversationId
    : undefined;
}

export function canReadSdkImage(message: MessageItem) {
  const current = useConversationStore.getState().currentConversation;
  return Boolean(
    directImageAgent() &&
      window.electronAPI?.recognizeChatImage &&
      message.pictureElem &&
      message.status === MessageStatus.Succeeded &&
      message.sendID === useUserStore.getState().selfInfo.userID &&
      message.recvID === current?.userID &&
      !message.groupID,
  );
}

export function useAgentImageReading() {
  const capture = useAgentChatOperation();
  const fileReading = useAgentFileReading();
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  const generation = useResearchStore((s) => s.generation);
  const actor = useResearchStore((s) => s.actor?.member.id);
  const path = useLocation().pathname;
  const [entries, setEntries] = useState<ImageReading[]>([]);
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current++;
    setEntries([]);
    return () => {
      epoch.current++;
    };
  }, [generation, actor, imID, path]);
  const run = async (context: SentFileContext, message?: MessageItem) => {
    if (!context.agentConversationId || !context.isCurrent()) return;
    const requestEpoch = epoch.current;
    const current = () =>
      requestEpoch === epoch.current &&
      context.isCurrent() &&
      directImageAgent() === context.agentConversationId &&
      (!message || canReadSdkImage(message));
    const key = `${generation}:${actor}:${context.agentConversationId}:${context.sdkClientMsgID}`;
    if (!current() || inFlight.has(key)) return;
    const ticket = {},
      id = crypto.randomUUID();
    inFlight.set(key, ticket);
    const put = (entry: ImageReading) => {
      if (current())
        setEntries((previous) =>
          [entry, ...previous.filter((item) => item.key !== key)].slice(0, 20),
        );
    };
    const cancel = () => {
      void window.electronAPI?.cancelChatImageOcr(id).catch(() => {});
    };
    context.operation.signal.addEventListener("abort", cancel, { once: true });
    try {
      let file = context.file;
      if (message && !file.size) {
        put({ key, context, message, phase: "downloading" });
        const source = message.pictureElem!.sourcePicture;
        file = await firstPartyFile({
          sourceUrl: source.url,
          filename: file.name,
          mediaType: "image/png",
          expectedBytes: source.size || 0,
          isCurrent: current,
        });
      }
      if (!current()) return;
      put({ key, context: { ...context, file }, message, phase: "recognizing" });
      if (!window.electronAPI?.recognizeChatImage)
        throw new Error(
          "自动图片识字需要新版 Windows 桌面端；可先识别文字，再发送给 Agent。",
        );
      if (!file.size || file.size > imagePasteLimits.bytes)
        throw new Error("请选择有效的原图，每张图片不能超过 10 MB。");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!current()) return;
      const result = await window.electronAPI.recognizeChatImage(id, bytes);
      if (!current()) return;
      if (!result.text.trim())
        throw new Error(
          "没有识别到文字，请换清晰原图。当前处理图片中的文字，尚不能理解纯图表或物体。",
        );
      // Send the full OCR text through the existing authorized document route.
      // Do not resend the image, use its thumbnail, or truncate to a chat limit.
      // A recovered original may have a different local/download filename. Keep
      // the canonical body stable when replaying the same SDK image receipt.
      const name = `图片-${context.sdkClientMsgID || id}`
        .replace(/[^a-zA-Z0-9_\-\u4e00-\u9fff]/g, "_")
        .slice(0, 180);
      const textFile = new File([result.text], `${name}.识别文字.txt`, {
        type: "text/plain",
      });
      await fileReading.onFileSent({
        ...context,
        file: textFile,
        isCurrent: current,
        sdkClientMsgID: `${context.sdkClientMsgID}:image-ocr`,
        agentFileText:
          context.agentFileText ||
          "这是用户发送图片后在 Windows 本机识别出的文字。请整理识别文字并简要解释内容，保留段落，不擅自补齐；明确可能的识字错误。你收到的是 OCR 文字，未看到原图，不要声称查看了图表、排版或图像细节。",
      });
      if (current())
        setEntries((previous) => previous.filter((item) => item.key !== key));
    } catch (error) {
      put({
        key,
        context,
        message,
        phase: "failed",
        error: error instanceof Error ? error.message : "图片识别失败，请重试。",
      });
    } finally {
      context.operation.signal.removeEventListener("abort", cancel);
      if (inFlight.get(key) === ticket) inFlight.delete(key);
    }
  };
  const readExisting = async (
    message: MessageItem,
    file?: File,
    selectionIsCurrent = () => true,
  ) => {
    if (!canReadSdkImage(message) || !selectionIsCurrent()) return;
    const operation = capture();
    const current = () =>
      operation.isCurrent() && selectionIsCurrent() && canReadSdkImage(message);
    try {
      const source = message.pictureElem!.sourcePicture;
      if (file && source.size > 0 && file.size !== source.size) {
        throw new Error(
          "请选择这条图片消息对应的原图，大小与原附件不一致；其他图片请从输入区发送。",
        );
      }
      const conversation = useConversationStore.getState().currentConversation!;
      await run(
        {
          file:
            file ||
            new File([], `图片-${message.clientMsgID}.png`, { type: "image/png" }),
          conversation,
          operation,
          isCurrent: current,
          agentConversationId: directImageAgent(),
          sdkClientMsgID: message.clientMsgID,
        },
        message,
      );
    } finally {
      operation.dispose();
    }
  };
  const retry = async (entry: ImageReading) => {
    const operation = capture();
    try {
      await run(
        { ...entry.context, operation, isCurrent: operation.isCurrent },
        entry.message,
      );
    } finally {
      operation.dispose();
    }
  };
  return {
    onImageSent: (context: SentFileContext) => run(context),
    readExisting,
    busy: entries.some((entry) => entry.phase !== "failed") || fileReading.busy,
    controls: (
      <>
        {entries.map((entry) => (
          <div
            key={entry.key}
            className="mx-3 mt-1 text-xs leading-5"
            data-agent-image-status
          >
            {entry.phase !== "failed" ? (
              <p role="status">
                {entry.phase === "downloading" ? "正在取回原图" : "正在识别图片文字"}：
                {entry.context.file.name}
              </p>
            ) : (
              <div>
                <p role="alert" className="text-amber-800">
                  图片已发送，但本次识别未完成：{entry.error}
                </p>
                <Button size="small" onClick={() => void retry(entry)}>
                  重试识别（不重复发送图片）
                </Button>
              </div>
            )}
          </div>
        ))}
        {fileReading.controls}
      </>
    ),
  };
}
