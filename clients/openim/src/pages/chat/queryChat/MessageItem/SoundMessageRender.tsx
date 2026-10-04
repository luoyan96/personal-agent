import { MessageStatus } from "@openim/wasm-client-sdk";
import { useState } from "react";

import { IMessageItemProps } from ".";
import styles from "./message-item.module.scss";

export default function SoundMessageRender({ message }: IMessageItemProps) {
  const [error, setError] = useState("");
  const sound = message.soundElem;
  if (!sound) throw new Error("语音消息缺少 soundElem");
  const sending = message.status === MessageStatus.Sending;
  return <div className={styles.bubble} data-sound-message>
    <div className="mb-1 text-xs">语音 · {sound.duration} 秒{sending ? " · 正在上传…" : ""}</div>
    {sound.sourceUrl && !sending ? <audio controls preload="metadata" src={sound.sourceUrl} aria-label="播放语音消息" onError={() => setError("语音加载失败，请检查连接后重试")} className="h-9 max-w-[250px]" /> : <span className="text-xs">{sending ? "发送后可播放" : "语音地址暂不可用"}</span>}
    {error && <div role="alert" className="text-xs text-red-700">{error}</div>}
  </div>;
}
