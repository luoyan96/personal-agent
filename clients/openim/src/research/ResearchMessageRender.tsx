import { Alert } from "antd";
import { OpenImResearchPointer } from "@research-agent-platform/contracts";
import { IMessageItemProps } from "@/pages/chat/queryChat/MessageItem";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { ResearchActionCard } from "./ResearchActionCard";
import { ResearchTurnStatus } from "./ResearchTurnStatus";
import { useResearchStore } from "./store";
import { useConversationStore } from "@/store";
import { useContext, useEffect, useState } from "react";
import {
  registerAgentProgress,
  acknowledgeAgentReply,
  AgentProgressHistory,
} from "./agent-progress";
import type { AgentTurn } from "@research-agent-platform/contracts";
import styles from "@/pages/chat/queryChat/MessageItem/message-item.module.scss";
import { CreatedAgentChatButton } from "./CreatedAgentChatButton";
import { AgentFileReadSummary, agentFileReadCoverage } from "./AgentFileReadSummary";
import { PersonalReceiptCard } from "./PersonalReceiptCard";
import { ContinueAgentFileReadingButton } from "./ContinueAgentFileReadingButton";
import SafeMessageMarkdown from "./SafeMessageMarkdown";

export default function ResearchMessageRender({ message }: IMessageItemProps) {
  const history = useContext(AgentProgressHistory);
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  const manager = useResearchStore((s) => s.actor?.isLabManager || false);
  const actorGeneration = useResearchStore((s) => s.generation);
  const [retried, setRetried] = useState<{
    generation: number;
    imID?: string;
    messageID: string;
    sourceTurnId: string;
    turn: AgentTurn;
  }>();
  let parsed: ReturnType<typeof OpenImResearchPointer.safeParse>;
  try {
    parsed = OpenImResearchPointer.safeParse(
      JSON.parse(message.customElem?.data || "{}"),
    );
  } catch {
    parsed = OpenImResearchPointer.safeParse(null);
  }
  const pointer = parsed.success ? parsed.data : null;
  const read = useResearchRead(
    async () => {
      if (!pointer) throw new Error("该自定义消息不是可读取的科研回执");
      const [messages, actions] = await Promise.all([
        researchApi("chatMessages", {
          params: { id: pointer.conversationId },
          query: { afterSequence: pointer.sequence - 1, limit: 1 },
        }),
        researchApi("chatActions", {
          params: { id: pointer.conversationId },
          query: { limit: 100 },
        }),
      ]);
      const fact = messages.data.find(
        (m) => m.id === pointer.messageId && m.sequence === pointer.sequence,
      );
      if (!fact) throw new Error("暂未找到这条消息，请稍后重试。");
      return {
        fact,
        actions: actions.data.filter((a) => fact.actionIds.includes(a.id)),
      };
    },
    `${imID}:${
      pointer ? `${pointer.conversationId}:${pointer.messageId}` : message.clientMsgID
    }`,
    !!pointer && !!imID,
  );
  const currentRetry =
    retried?.generation === actorGeneration &&
    retried.imID === imID &&
    retried.messageID === pointer?.messageId &&
    (read.data?.fact.turnId === retried.sourceTurnId ||
      read.data?.fact.turnId === retried.turn.id)
      ? retried.turn
      : undefined;
  const turnId = currentRetry?.id || read.data?.fact.turnId;
  const turn = useResearchRead(
    () => researchApi("chatTurn", { params: { id: turnId || "" } }),
    `${imID}:${turnId || ""}`,
    !!turnId,
  );
  const currentTurn = turn.data?.data || currentRetry;
  const fileRead = currentTurn?.fileRead;
  const fileCoverage = fileRead ? agentFileReadCoverage(fileRead) : undefined;
  const canContinueFileReading =
    !!fileRead &&
    !turn.error &&
    currentTurn?.conversationId === read.data?.fact.conversationId &&
    ((currentTurn.status === "succeeded" &&
      read.data?.fact.origin === "model" &&
      currentTurn.outputMessageId === read.data.fact.id &&
      (fileRead.partial ||
        (!!fileCoverage?.ranges.length && !fileCoverage.complete))) ||
      (["failed", "unavailable", "cancelled", "interrupted"].includes(
        currentTurn.status,
      ) &&
        !currentTurn.outputMessageId &&
        read.data?.fact.origin === "human" &&
        currentTurn.inputMessageId === read.data.fact.id));
  useEffect(() => {
    if (!imID || !read.data?.fact.turnId) return;
    // Restore only active work from history; old terminal receipts must not
    // manufacture a fresh temporary reply at the bottom of the conversation.
    if (
      currentTurn &&
      (["queued", "running"].includes(currentTurn.status) ||
        (read.data.fact.origin === "human" &&
          read.data.fact.id === history.latestOwnId &&
          currentTurn.outputMessageId &&
          !history.messageIds.has(currentTurn.outputMessageId)))
    )
      registerAgentProgress(actorGeneration, imID, {
        id: read.data.fact.turnId,
        conversationId: read.data.fact.conversationId,
      });
    if (currentTurn?.outputMessageId === read.data.fact.id)
      acknowledgeAgentReply(actorGeneration, imID, currentTurn.id, read.data.fact.id);
  }, [
    actorGeneration,
    imID,
    read.data?.fact,
    currentTurn?.id,
    currentTurn?.status,
    currentTurn?.outputMessageId,
    history,
  ]);
  return (
    <div
      data-canonical-message={read.data?.fact.id}
      className={styles.bubble}
    >
      {!pointer && <Alert type="warning" message="这条消息暂无法显示" />}
      {read.error && (
        <Alert type="warning" message="这条消息当前无法读取" description={read.error} />
      )}
      {pointer && !read.data && !read.error && (
        <p className="text-slate-500">正在加载消息…</p>
      )}
      {read.data && (
        <>
          {read.data.fact.text && <SafeMessageMarkdown text={read.data.fact.text} />}
          {read.data.fact.files?.map((file) => (
            <AgentFileReadSummary
              key={file.messageId}
              file={file}
              read={fileRead}
              status={currentTurn?.status}
            />
          ))}
          {fileRead &&
            !read.data.fact.files?.some(
              (file) => file.messageId === fileRead.messageId,
            ) && <AgentFileReadSummary read={fileRead} status={currentTurn?.status} />}
          {canContinueFileReading && fileRead && (
            <ContinueAgentFileReadingButton
              conversationId={read.data.fact.conversationId}
              messageId={fileRead.messageId}
            />
          )}
          {!!read.data.fact.resources.length && (
            <details className="mt-2 text-xs">
              <summary>相关材料</summary>
              {read.data.fact.resources.map((resource) => (
                <p
                  key={`${resource.kind}:${resource.ref.id}`}
                  className="text-xs text-slate-600"
                >
                  {resource.kind} · {resource.ref.id} / 版本 {resource.ref.version}
                </p>
              ))}
            </details>
          )}
          {!!read.data.actions.length && (
            <details className="mt-2">
              <summary>协作建议（{read.data.actions.length}）</summary>
              {read.data.actions.map((action) => (
                <ResearchActionCard
                  key={action.id + ":" + action.version + ":" + action.status}
                  action={action}
                />
              ))}
            </details>
          )}
        </>
      )}
      {(turn.data?.data || currentRetry) &&
        (turn.data?.data || currentRetry)?.status !== "succeeded" && (
          <ResearchTurnStatus
            turn={turn.data?.data || currentRetry!}
            manager={manager}
            compact
            onRetried={
              turn.data && !turn.error
                ? (next) => {
                    setRetried({
                      generation: actorGeneration,
                      imID,
                      messageID: pointer!.messageId,
                      sourceTurnId: turnId!,
                      turn: next,
                    });
                    void read.refresh();
                  }
                : undefined
            }
          />
        )}
      {turn.error && (
        <p className="text-xs text-red-700">AI 请求状态暂时无法读取：{turn.error}</p>
      )}
      {currentTurn && currentTurn.outputMessageId === read.data?.fact.id && (
        <div className="mt-2">
          <PersonalReceiptCard
            turn={currentTurn}
            compact={!!currentTurn.memoryReceipt || !!currentTurn.followupReceipt}
          />
        </div>
      )}
      {read.data?.fact.origin === "service" &&
        turn.data?.data.purpose === "create_agent" &&
        turn.data?.data.status === "succeeded" &&
        turn.data.data.createdAgent && (
          <div className="mt-2">
            <CreatedAgentChatButton created={turn.data.data.createdAgent} />
          </div>
        )}
    </div>
  );
}
