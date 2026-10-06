import { MessageStatus } from "@openim/wasm-client-sdk";
import { Button } from "antd";
import { useEffect, useRef, useState } from "react";

import fileIcon from "@/assets/images/messageItem/file_icon.png";
import { bytesToSize } from "@/utils/common";
import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";
import { canReadSdkFile, useAgentFileReading } from "@/research/useAgentFileReading";
import { useAgentChatOperation, type AgentChatOperation } from "@/research/useAgentChatOperation";
import { useConversationStore, useUserStore } from "@/store";
import { useResearchStore } from "@/research/store";

export default function FileMessageRender({ message }: IMessageItemProps) {
  const [downloading, setDownloading] = useState(false), [error, setError] = useState("");
  const file = message.fileElem;
  const reading = useAgentFileReading();
  const capture = useAgentChatOperation();
  const input = useRef<HTMLInputElement>(null);
  const intent = useRef<AgentChatOperation>();
  const generation = useResearchStore(s => s.generation);
  const currentID = useConversationStore(s => s.currentConversation?.conversationID);
  useUserStore(s => s.selfInfo.userID);
  useResearchStore(s => s.contacts);
  useResearchStore(s => s.mappings);
  useEffect(() => { return () => intent.current?.dispose(); }, [generation, currentID]);
  if (!file) throw new Error("文件消息缺少 fileElem");
  const download = async () => {
    if (!file.sourceUrl || downloading) return;
    setDownloading(true); setError("");
    try {
      const url = new URL(file.sourceUrl); if (!["http:", "https:"].includes(url.protocol)) throw new Error("下载地址不可用");
      const response = await fetch(url.href); if (!response.ok) throw new Error(`下载失败（${response.status}）`);
      const blob = await response.blob(), local = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = local; link.download = file.fileName.replace(/[\\/]/g, "_"); document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(local), 30000);
    } catch (err) { setError(err instanceof Error ? err.message : "文件下载失败"); } finally { setDownloading(false); }
  };
  return <div className={`${styles.bubble} max-w-[290px]`} data-file-message>
    <div className="flex items-center gap-3"><img src={fileIcon} alt="" width={38} /><div className="min-w-0"><strong className="block break-all">{file.fileName}</strong><small>{bytesToSize(file.fileSize)}</small></div></div>
    <Button type="link" loading={downloading} disabled={message.status === MessageStatus.Sending || !file.sourceUrl} onClick={() => void download()} aria-label={`下载 ${file.fileName}`}>下载文件</Button>
    {canReadSdkFile(message) && <div>
      <Button type="link" loading={reading.busy} disabled={reading.busy || !file.sourceUrl} onClick={() => {
        void reading.readExisting(message);
      }}>让 Agent 阅读</Button>
      <Button type="link" disabled={reading.busy} onClick={() => {
        intent.current?.dispose(); intent.current = capture(); input.current?.click();
      }}>从本机选择阅读</Button>
      <input ref={input} type="file" className="hidden" accept=".pdf,.txt,.md,.csv" onChange={event => {
        const selected = event.currentTarget.files?.[0], operation = intent.current;
        event.currentTarget.value = "";
        if (!selected || !operation?.isCurrent()) return;
        void reading.readExisting(message, selected, operation.isCurrent).finally(() => operation.dispose());
      }} />
      {reading.controls}
    </div>}
    {error && <div role="alert" className="text-xs text-red-700">本次下载未完成：{error}。如已有解析或回复回执，可从回执继续阅读全文。</div>}
  </div>;
}
