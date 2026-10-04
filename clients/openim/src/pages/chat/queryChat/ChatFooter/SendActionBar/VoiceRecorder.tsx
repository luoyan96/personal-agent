import { MessageItem } from "@openim/wasm-client-sdk";
import { Button } from "antd";
import { useEffect, useRef, useState } from "react";

import { useConversationStore } from "@/store";
import { SendMessageParams } from "../useSendMessage";

export default function VoiceRecorder({
  getSoundMessage,
  sendMessage,
}: {
  getSoundMessage: (file: File, duration: number) => Promise<MessageItem>;
  sendMessage: (params: SendMessageParams) => Promise<void>;
}) {
  const conversationID = useConversationStore(
    (s) => s.currentConversation?.conversationID,
  );
  const [state, setState] = useState<
    "idle" | "acquiring" | "recording" | "ready" | "sending"
  >("idle");
  const [error, setError] = useState("");
  const [recording, setRecording] = useState<{
    file: File;
    duration: number;
    url: string;
  }>();
  const [seconds, setSeconds] = useState(0);
  const recorder = useRef<MediaRecorder>();
  const stream = useRef<MediaStream>();
  const generation = useRef(0);
  const recordingRef = useRef<typeof recording>();
  const messageRef = useRef<MessageItem>();
  const stopTracks = () => {
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = undefined;
  };
  const discard = () => {
    generation.current++;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stopTracks();
    recorder.current = undefined;
    if (recordingRef.current) URL.revokeObjectURL(recordingRef.current.url);
    recordingRef.current = undefined;
    messageRef.current = undefined;
    setRecording(undefined);
    setSeconds(0);
    setState("idle");
  };
  useEffect(() => {
    discard();
    return () => {
      generation.current++;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopTracks();
      if (recordingRef.current) URL.revokeObjectURL(recordingRef.current.url);
    };
  }, [conversationID]);
  useEffect(() => {
    if (state !== "recording") return;
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [state]);
  const start = async () => {
    setError("");
    setState("acquiring");
    const current = ++generation.current;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined")
        throw new Error("当前浏览器不支持录音；请在 HTTPS 或本机安全连接中打开");
      const input = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation.current !== current) {
        input.getTracks().forEach((track) => track.stop());
        return;
      }
      stream.current = input;
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((type) =>
        MediaRecorder.isTypeSupported(type),
      );
      const media = new MediaRecorder(input, mime ? { mimeType: mime } : undefined);
      const chunks: BlobPart[] = [],
        began = performance.now();
      recorder.current = media;
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      media.onerror = () => {
        if (current === generation.current) {
          setError("录音中断，请检查麦克风后重试");
          discard();
        }
      };
      media.onstop = () => {
        input.getTracks().forEach((track) => track.stop());
        if (stream.current === input) stream.current = undefined;
        if (current !== generation.current) return;
        const type = media.mimeType || "audio/webm",
          file = new File(
            chunks,
            `voice-${Date.now()}.${type.includes("mp4") ? "m4a" : "webm"}`,
            { type },
          );
        if (!file.size) {
          setError("没有录到声音，请重新录音");
          setState("idle");
          return;
        }
        const value = {
          file,
          duration: Math.max(1, Math.ceil((performance.now() - began) / 1000)),
          url: URL.createObjectURL(file),
        };
        recordingRef.current = value;
        setRecording(value);
        setState("ready");
      };
      media.start();
      setSeconds(0);
      setState("recording");
    } catch (err) {
      if (current !== generation.current) return;
      stopTracks();
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "麦克风权限未获准。请在浏览器或系统设置允许麦克风后重试。"
          : err instanceof Error
          ? err.message
          : "无法打开麦克风",
      );
      setState("idle");
    }
  };
  const send = async () => {
    if (!recording || state !== "ready") return;
    const current = generation.current;
    setState("sending");
    setError("");
    const conversation = useConversationStore.getState().currentConversation;
    if (!conversation) {
      setState("ready");
      setError("请先选择会话");
      return;
    }
    try {
      const message =
        messageRef.current ??
        (await getSoundMessage(recording.file, recording.duration));
      if (current !== generation.current) return;
      messageRef.current = message;
      await sendMessage({
        message,
        recvID: conversation.userID,
        groupID: conversation.groupID,
      });
      if (current === generation.current) discard();
    } catch (err) {
      if (current === generation.current) {
        setError(err instanceof Error ? err.message : "语音发送失败，可重试或取消");
        setState("ready");
      }
    }
  };
  return (
    <div className="ml-2" data-voice-recorder>
      {state === "idle" ? (
        <Button type="text" aria-label="录制语音" onClick={() => void start()}>
          语音
        </Button>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded border bg-white p-2">
          {state === "acquiring" && <span role="status">正在请求麦克风权限…</span>}
          {state === "recording" && (
            <>
              <span role="status">录音中 {seconds} 秒</span>
              <Button onClick={() => recorder.current?.stop()}>停止录音</Button>
            </>
          )}
          {recording && (
            <>
              <audio
                controls
                src={recording.url}
                aria-label="发送前试听录音"
                className="h-8 max-w-[220px]"
              />
              <Button
                type="primary"
                loading={state === "sending"}
                onClick={() => void send()}
              >
                发送语音
              </Button>
            </>
          )}
          <Button disabled={state === "sending"} onClick={discard}>
            取消录音
          </Button>
        </div>
      )}
      {error && (
        <span role="alert" className="block max-w-[280px] text-xs text-red-700">
          {error}
        </span>
      )}
    </div>
  );
}
