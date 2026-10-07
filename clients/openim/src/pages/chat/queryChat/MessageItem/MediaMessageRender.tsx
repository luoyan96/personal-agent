import { MessageStatus } from "@openim/wasm-client-sdk";
import { Button, Image, Spin } from "antd";
import { FC, useEffect, useRef, useState } from "react";
import { DownloadOutlined } from "@ant-design/icons";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "@/research/useAgentChatOperation";
import { withRequestDeadline } from "@/research/request-deadline";
import { useConversationStore } from "@/store";
import { useResearchStore } from "@/research/store";

import { IMessageItemProps } from ".";

const min = (a: number, b: number) => (a > b ? b : a);

const MediaMessageRender: FC<IMessageItemProps> = ({ message }) => {
  const capture = useAgentChatOperation();
  const operation = useRef<AgentChatOperation>();
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");
  const generation = useResearchStore((s) => s.generation);
  const conversationID = useConversationStore(
    (s) => s.currentConversation?.conversationID,
  );
  useEffect(() => {
    setDownloading(false);
    setError("");
    return () => operation.current?.dispose();
  }, [message.clientMsgID, generation, conversationID]);
  const pictureElem = message.pictureElem;
  if (!pictureElem) throw new Error("Picture message is missing pictureElem");

  const imageHeight = pictureElem.sourcePicture.height;
  const imageWidth = pictureElem.sourcePicture.width;
  const snapshotMaxHeight = pictureElem.snapshotPicture?.height ?? imageHeight;
  const minHeight = min(200, imageWidth) * (imageHeight / imageWidth) + 2;
  const adaptedHight = min(minHeight, snapshotMaxHeight) + 10;
  const adaptedWidth = min(imageWidth, 200) + 10;

  const sourceUrl = pictureElem.snapshotPicture?.url || pictureElem.sourcePicture.url;
  const isSending = message.status === MessageStatus.Sending;
  const minStyle = { minHeight: `${adaptedHight}px`, minWidth: `${adaptedWidth}px` };
  const download = async () => {
    if (downloading) return;
    const scoped = capture();
    operation.current = scoped;
    setDownloading(true);
    setError("");
    try {
      const url = new URL(pictureElem.sourcePicture.url || sourceUrl);
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("图片下载地址不可用");
      const blob = await withRequestDeadline(
        async (signal) => {
          const response = await fetch(url.href, { signal });
          if (!response.ok) throw new Error(`图片下载失败（${response.status}）`);
          return response.blob();
        },
        30000,
        scoped.signal,
      );
      if (!scoped.isCurrent()) return;
      const local = URL.createObjectURL(blob),
        link = document.createElement("a");
      link.href = local;
      link.download = `图片-${message.clientMsgID.replace(/[^a-zA-Z0-9_-]/g, "_")}.${
        blob.type === "image/png"
          ? "png"
          : blob.type === "image/webp"
          ? "webp"
          : blob.type === "image/gif"
          ? "gif"
          : "jpg"
      }`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(local), 30000);
    } catch (cause) {
      if (scoped.isCurrent())
        setError(cause instanceof Error ? cause.message : "图片下载失败，请重试。");
    } finally {
      if (scoped.isCurrent()) setDownloading(false);
      scoped.dispose();
    }
  };

  return (
    <Spin spinning={isSending}>
      <div className="relative max-w-[200px]" style={minStyle}>
        <Image
          rootClassName="message-image cursor-pointer"
          className="max-w-[200px] rounded-md"
          src={sourceUrl}
          preview={{ src: pictureElem.sourcePicture.url || sourceUrl }}
          placeholder={
            <div style={minStyle} className="flex items-center justify-center">
              <Spin />
            </div>
          }
        />
        <Button
          type="text"
          size="small"
          icon={<DownloadOutlined />}
          loading={downloading}
          disabled={isSending}
          onClick={() => void download()}
          aria-label="下载图片"
          title="下载原图"
          className="desktop-image-download"
        />
        {error && (
          <p role="alert" className="text-xs text-red-700">
            {error}
          </p>
        )}
      </div>
    </Spin>
  );
};

export default MediaMessageRender;
