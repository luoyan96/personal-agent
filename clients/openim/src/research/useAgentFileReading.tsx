import { Button } from "antd";
import { MessageStatus, type MessageItem } from "@openim/wasm-client-sdk";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { RequestFor, ResponseFor } from "@research-agent-platform/contracts";
import { useConversationStore, useUserStore } from "@/store";
import { researchApi, researchMode, ResearchApiError } from "./api";
import { useResearchStore } from "./store";
import { useAgentChatOperation } from "./useAgentChatOperation";
import { useResearchRead } from "./useResearchRead";
import { ResearchTurnStatus } from "./ResearchTurnStatus";
import type { SentFileContext } from "./useScopedFileSender";
import { FileFetchError, firstPartyFile, maxAgentFileBytes } from "./firstPartyFile";

type ReadBody = RequestFor<"agentFileMessage">["body"];
type ReadResult = ResponseFor<"agentFileMessage">["data"];
type Reading = {
  id: string;
  filename: string;
  conversationId: string;
  idempotencyKey: string;
  phase: "downloading" | "reading" | "accepted" | "failed";
  body?: ReadBody;
  result?: ReadResult;
  error?: string;
  canRetry?: boolean;
  existingFile?: NonNullable<MessageItem["fileElem"]>;
};
const mediaTypes: Record<string, ReadBody["mediaType"]> = {
  pdf: "application/pdf", txt: "text/plain", md: "text/markdown", csv: "text/csv",
};
const fileFailures: Record<string, string> = {
  FILE_UNSUPPORTED: "目前只支持含文字的 PDF、TXT、Markdown 和 CSV；图片与语音不会自动交给 Agent 理解。",
  FILE_TOO_LARGE: "文件超过 10 MiB，请拆分或减小文件后重新发送。",
  FILE_INVALID_ENCODING: "文字文件不是有效的 UTF-8 编码，请另存为 UTF-8 后重新发送。",
  FILE_ENCRYPTED: "PDF 已加密，请使用你有权阅读的未加密版本。",
  FILE_NO_TEXT: "文件没有可提取文字；扫描 PDF 暂不支持，请使用可复制文字的 PDF 或粘贴相关文字。",
  FILE_PARSE_FAILED: "无法解析此文件，请检查文件是否损坏，或改为文字文件。",
  FILE_PARSE_TIMEOUT: "文件解析超时，请稍后重试阅读，或拆分成较小文件。",
  FILE_EXTRACTION_LIMIT: "文件页数或文字量超过读取限制，请拆分后重新发送。",
  FILE_PAGE_UNAVAILABLE: "指定页码不在附件中，请核对附件页数后再询问。",
};
function failureMessage(error: unknown) {
  if (error instanceof ResearchApiError) return fileFailures[error.code] || error.message;
  return error instanceof Error ? error.message : "阅读未完成，请稍后重试。";
}
function isRetryable(error: unknown) {
  if (error instanceof FileFetchError) return error.retryable;
  return error instanceof ResearchApiError && (
    ["NETWORK_ERROR", "SERVICE_UNAVAILABLE", "INTERNAL_ERROR", "FILE_PARSE_TIMEOUT"].includes(error.code) ||
    error.status >= 500
  );
}
async function fileKey(clientMsgID?: string) {
  if (!clientMsgID) return crypto.randomUUID();
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientMsgID));
  return `agent-file-sdk-${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}
export function canReadSdkFile(message: MessageItem) {
  const conversation = useConversationStore.getState().currentConversation;
  const research = useResearchStore.getState();
  const mapping = research.mappings.find(item => item.imConversationID === conversation?.conversationID);
  const peer = research.contacts.find(item => item.userID === conversation?.userID)?.contact;
  return Boolean(researchMode && research.actor && research.sessionActorId === research.actor.member.id &&
    research.session?.user?.userID === useUserStore.getState().selfInfo.userID && conversation && mapping && mapping.kind !== "group" && peer &&
    peer.identity.kind !== "human" && !peer.agentRuntime && peer.allowedActions.includes("chat") &&
    message.status === MessageStatus.Succeeded && message.sendID === useUserStore.getState().selfInfo.userID &&
    message.recvID === conversation.userID && !message.groupID &&
    message.fileElem && mediaTypes[message.fileElem.fileName.split(".").at(-1)?.toLowerCase() || ""]);
}
function base64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("本地文件无法读取，请重新选择文件。"));
    reader.onabort = () => reject(new Error("本地文件读取已中止，请重新选择文件。"));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string" || !value.includes(","))
        reject(new Error("本地文件无法读取，请重新选择文件。"));
      else resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function useAgentFileReading() {
  const capture = useAgentChatOperation();
  const imID = useConversationStore((state) => state.currentConversation?.conversationID);
  const generation = useResearchStore((state) => state.generation);
  const actorId = useResearchStore((state) => state.actor?.member.id);
  const path = useLocation().pathname;
  const [readings, setReadings] = useState<Reading[]>([]);
  const inFlight = useRef(new Map<string, object>());
  useLayoutEffect(() => { setReadings([]); inFlight.current.clear(); }, [imID, generation, actorId, path]);
  const begin = (key: string) => {
    if (inFlight.current.has(key)) return;
    const ticket = {}; inFlight.current.set(key, ticket); return ticket;
  };
  const finish = (key: string, ticket: object) => {
    if (inFlight.current.get(key) === ticket) inFlight.current.delete(key);
  };
  const put = (entry: Reading) => setReadings(previous => [entry, ...previous.filter(item => item.idempotencyKey !== entry.idempotencyKey)].slice(0, 3));
  const update = (entry: Reading, isCurrent: () => boolean) => {
    if (isCurrent()) setReadings((previous) => previous.map((item) => item.id === entry.id ? entry : item));
  };
  const submit = async (entry: Reading, isCurrent: () => boolean) => {
    if (!entry.body || !isCurrent()) return;
    update({ ...entry, phase: "reading", error: undefined, canRetry: false }, isCurrent);
    try {
      const response = await researchApi("agentFileMessage", {
        params: { id: entry.conversationId },
        body: entry.body,
        idempotencyKey: entry.idempotencyKey,
      });
      // The canonical outbox alone publishes the attachment request/reply.
      update({ ...entry, phase: "accepted", body: undefined, result: response.data, error: undefined, canRetry: false }, isCurrent);
    } catch (error) {
      update({ ...entry, phase: "failed", error: failureMessage(error), canRetry: isRetryable(error) }, isCurrent);
    }
  };
  const readFile = async (file: File, entry: Reading, isCurrent: () => boolean) => {
    const mediaType = mediaTypes[file.name.split(".").at(-1)?.toLowerCase() || ""];
    if (!mediaType || file.size > maxAgentFileBytes) {
      update({ ...entry, phase: "failed", error: fileFailures[mediaType ? "FILE_TOO_LARGE" : "FILE_UNSUPPORTED"], canRetry: false }, isCurrent);
      return;
    }
    update({ ...entry, phase: "reading" }, isCurrent);
    try {
      const contentBase64 = await base64(file);
      if (!isCurrent()) return;
      await submit({ ...entry, body: { filename: file.name, mediaType, contentBase64 } }, isCurrent);
    } catch (error) {
      update({ ...entry, phase: "failed", error: failureMessage(error), canRetry: false }, isCurrent);
    }
  };
  const onFileSent = async ({ file, agentConversationId, isCurrent, sdkClientMsgID }: SentFileContext) => {
    if (!agentConversationId || !isCurrent()) return;
    const idempotencyKey = await fileKey(sdkClientMsgID);
    if (!isCurrent()) return;
    const entry: Reading = { id: crypto.randomUUID(), filename: file.name, conversationId: agentConversationId, idempotencyKey, phase: "reading" };
    const ticket = begin(entry.idempotencyKey); if (!ticket) return;
    put(entry);
    try { await readFile(file, entry, isCurrent); }
    finally { finish(entry.idempotencyKey, ticket); }
  };
  const downloadAndRead = async (entry: Reading, isCurrent: () => boolean) => {
    const source = entry.existingFile!;
    update({ ...entry, phase: "downloading", error: undefined, canRetry: false }, isCurrent);
    try {
      const file = await firstPartyFile({ sourceUrl: source.sourceUrl, filename: source.fileName,
        mediaType: mediaTypes[source.fileName.split(".").at(-1)?.toLowerCase() || ""], expectedBytes: source.fileSize, isCurrent });
      if (!isCurrent()) return;
      await readFile(file, entry, isCurrent);
    } catch (error) {
      update({ ...entry, phase: "failed", error: failureMessage(error), canRetry: isRetryable(error) }, isCurrent);
    }
  };
  const readExisting = async (message: MessageItem, localFile?: File, selectionIsCurrent = () => true) => {
    if (!canReadSdkFile(message) || !selectionIsCurrent()) return;
    const mapping = useResearchStore.getState().mappings.find(item => item.imConversationID === imID)!;
    const operation = capture();
    const isCurrent = () => operation.isCurrent() && selectionIsCurrent() && canReadSdkFile(message);
    const idempotencyKey = await fileKey(message.clientMsgID);
    if (!isCurrent()) { operation.dispose(); return; }
    const entry: Reading = { id: crypto.randomUUID(), filename: message.fileElem!.fileName,
      conversationId: mapping.researchConversationId, idempotencyKey,
      existingFile: message.fileElem!, phase: localFile ? "reading" : "downloading" };
    const ticket = begin(entry.idempotencyKey);
    if (!ticket) { operation.dispose(); return; }
    put(entry);
    try {
      if (localFile) {
        if (localFile.name !== message.fileElem!.fileName || localFile.size !== message.fileElem!.fileSize)
          update({ ...entry, phase: "failed", error: "请选择与这条附件名称、大小相同的原文件；其他文件请从输入区发送。", canRetry: false }, isCurrent);
        else await readFile(localFile, entry, isCurrent);
      } else await downloadAndRead(entry, isCurrent);
    } finally { operation.dispose(); finish(entry.idempotencyKey, ticket); }
  };
  const retry = async (entry: Reading) => {
    if (!entry.canRetry || entry.phase !== "failed" || (!entry.body && !entry.existingFile)) return;
    const ticket = begin(entry.idempotencyKey); if (!ticket) return;
    const operation = capture();
    try { if (entry.body) await submit(entry, operation.isCurrent); else await downloadAndRead(entry, operation.isCurrent); }
    finally { operation.dispose(); finish(entry.idempotencyKey, ticket); }
  };
  return {
    onFileSent,
    readExisting,
    busy: readings.some(entry => entry.phase === "reading" || entry.phase === "downloading"),
    controls: readings.map((entry) => <AgentFileReadingStatus key={entry.id} entry={entry}
      onRetry={() => void retry(entry)}
      onCompleted={() => setReadings(previous => previous.filter(item => item.id !== entry.id))} />),
  };
}

function AgentFileReadingStatus({ entry, onRetry, onCompleted }: {
  entry: Reading; onRetry: () => void; onCompleted: () => void;
}) {
  const imID = useConversationStore((state) => state.currentConversation?.conversationID);
  const turnId = entry.result?.turn?.id;
  const turnRead = useResearchRead(
    () => researchApi("chatTurn", { params: { id: turnId! } }),
    `${imID}:file:${entry.id}:${turnId || ""}`,
    entry.phase === "accepted" && !!turnId,
  );
  const turn = turnRead.data?.data || entry.result?.turn;
  const completed = entry.phase === "accepted" && turn?.status === "succeeded" && !turnRead.error;
  // The durable chat message owns the reading receipt. Remove its temporary
  // composer state after success, also unmounting the read-only status poller.
  useEffect(() => {
    if (completed) onCompleted();
  }, [completed, onCompleted]);
  if (completed) return null;
  return (
    <div className="mx-3 mt-1 min-w-0 text-xs leading-5" data-agent-file-status>
      {entry.phase === "reading" && <p className="truncate" role="status" title={entry.filename}>正在读取文件：{entry.filename}</p>}
      {entry.phase === "downloading" && <p className="truncate" role="status" title={entry.filename}>正在取回文件：{entry.filename}</p>}
      {entry.phase === "failed" && (
        <div>
          <p className="truncate font-medium" title={entry.filename}>{entry.filename}</p>
          <p className="text-amber-800" role="alert">文件已发送，但 Agent 读取失败：{entry.error}</p>
          {entry.canRetry && <Button size="small" onClick={onRetry}>重试阅读（不重复发送文件）</Button>}
        </div>
      )}
      {entry.phase === "accepted" && turn && (
        <>
          <p className="truncate text-slate-500" title={entry.filename}>{entry.filename}</p>
          <ResearchTurnStatus turn={turn} compact />
        </>
      )}
      {entry.phase === "accepted" && !turn && <p>文字已保存，本次未创建 AI 回复请求。</p>}
      {turnRead.error && <p className="text-amber-800">AI 回复状态暂时无法读取：{turnRead.error}</p>}
    </div>
  );
}
