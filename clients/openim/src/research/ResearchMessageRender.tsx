import { Alert, Button } from "antd";
import { OpenImResearchPointer } from "@research-agent-platform/contracts";
import { IMessageItemProps } from "@/pages/chat/queryChat/MessageItem";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { ResearchActionCard } from "./ResearchActionCard";
import { LegacyTaskInviteCard, ResearchTaskCard } from "./ResearchTaskCard";
import {
  isTaskNotice,
  legacyTaskInvitation,
  splitTaskResources,
} from "./task-notice";
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
import { ResearchReadSummary } from "./ResearchReadSummary";
import { GroupMessageStatuses } from "./GroupMessageStatuses";
import { readChatMessage } from "./chat-message-read";
import { locateMessage, timelineScope } from "./chat-timeline";

export default function ResearchMessageRender({
  message,
  onReadableText,
  onReplyAgent,
  onDetails,
}: IMessageItemProps) {
  const history = useContext(AgentProgressHistory);
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  const manager = useResearchStore((s) => s.actor?.isLabManager || false);
  const actorGeneration = useResearchStore((s) => s.generation);
  const isGroup = useResearchStore(
    (s) => s.mappings.find((m) => m.imConversationID === imID)?.kind === "group",
  );
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
    async (signal) => {
      if (!pointer) throw new Error("该自定义消息不是可读取的科研回执");
      return readChatMessage(
        pointer.conversationId,
        pointer.messageId,
        pointer.sequence,
        signal,
      );
    },
    `${imID}:${
      pointer
        ? `${pointer.conversationId}:${pointer.messageId}:${pointer.sequence}`
        : message.clientMsgID
    }`,
    !!pointer && !!imID,
  );
  // Most everyday messages have no collaboration suggestions. Read the body
  // first; an optional suggestion error must not hide an authorized message.
  const actionIds = read.data?.fact.actionIds || [];
  const actions = useResearchRead(
    (signal) =>
      researchApi("chatActions", {
        params: { id: pointer?.conversationId || "" },
        query: { limit: 100 },
        signal,
      }),
    `${imID}:actions:${pointer?.conversationId}:${actionIds.join(",")}`,
    !!read.data && actionIds.length > 0 && !!imID,
  );
  const readableActions =
    actions.data?.data.filter((action) => actionIds.includes(action.id)) || [];
  const { tasks: taskResources, others: otherResources } = splitTaskResources(
    read.data?.fact.resources || [],
  );
  const taskNotice = isTaskNotice(read.data?.fact);
  // A server that predates task references still sends the invitation as text.
  const legacyInvite =
    !taskNotice && read.data?.fact.origin === "service"
      ? legacyTaskInvitation(read.data.fact.text)
      : undefined;
  const currentRetry =
    retried?.generation === actorGeneration &&
    retried.imID === imID &&
    retried.messageID === pointer?.messageId &&
    (read.data?.fact.turnId === retried.sourceTurnId ||
      read.data?.fact.turnId === retried.turn.id)
      ? retried.turn
      : undefined;
  useEffect(() => {
    onReadableText?.(read.data?.fact.text || "");
  }, [read.data?.fact.text, onReadableText]);
  useEffect(() => onDetails?.(read.data?.details), [read.data?.details, onDetails]);
  useEffect(() => {
    const fact = read.data?.fact;
    onReplyAgent?.(
      fact?.origin === "model" && fact.senderContactId
        ? {
            contactId: fact.senderContactId,
            displayName: message.senderNickname || "助手",
          }
        : undefined,
    );
  }, [
    isGroup,
    read.data?.fact.senderContactId,
    read.data?.fact.origin,
    message.senderNickname,
    onReplyAgent,
  ]);
  const turnId = currentRetry?.id || read.data?.fact.turnId;
  const turn = useResearchRead(
    (signal) => researchApi("chatTurn", { params: { id: turnId || "" }, signal }),
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
      registerAgentProgress(
        actorGeneration,
        imID,
        {
          id: read.data.fact.turnId,
          conversationId: read.data.fact.conversationId,
          agentContactId: currentTurn.agentContactId,
        },
        {
          inputText:
            read.data.fact.origin === "human"
              ? read.data.fact.text || undefined
              : undefined,
        },
      );
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
    <div data-canonical-message={read.data?.fact.id} className={styles.bubble}>
      {!pointer && <Alert type="warning" message="这条消息暂无法显示" />}
      {read.error && (
        <Alert
          type="warning"
          message="这条消息当前无法读取"
          description={read.error}
          action={
            <Button
              size="small"
              loading={read.loading}
              onClick={() => void read.refresh()}
            >
              重试读取消息
            </Button>
          }
        />
      )}
      {pointer && !read.data && !read.error && (
        <p className="text-slate-500">正在加载消息…</p>
      )}
      {read.data && (
        <>
          {read.data.details?.replyTo && (
            <button
              type="button"
              className="chat-source-link"
              onClick={() =>
                locateMessage(timelineScope(actorGeneration, imID || ""), {
                  messageId: read.data!.details!.replyTo!.messageId,
                  sequence: read.data!.details!.replyTo!.sequence,
                })
              }
            >
              <span>{read.data.fact.origin === "human" ? "引用" : "回复的问题"}</span>
              <p>{read.data.details.replyTo.text}</p>
            </button>
          )}
          {taskNotice && read.data.fact.resources[0] ? (
            <ResearchTaskCard
              resource={read.data.fact.resources[0]}
              text={read.data.fact.text || undefined}
            />
          ) : (
            <>
              {legacyInvite && read.data.fact.text ? (
                <LegacyTaskInviteCard text={read.data.fact.text} />
              ) : (
                read.data.fact.text && (
                  <SafeMessageMarkdown text={read.data.fact.text} />
                )
              )}
              {!!taskResources.length && (
                <div className="space-y-2">
                  {taskResources.map((resource) => (
                    <ResearchTaskCard
                      key={`${resource.kind}:${resource.ref.id}`}
                      resource={resource}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          {currentTurn?.libraryRead &&
            currentTurn.outputMessageId === read.data.fact.id && (
              <ResearchReadSummary read={currentTurn.libraryRead} />
            )}
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
          {!!otherResources.length && (
            <details className="mt-2 text-xs">
              <summary>相关材料</summary>
              {otherResources.map((resource) => (
                <p
                  key={`${resource.kind}:${resource.ref.id}`}
                  className="text-xs text-slate-600"
                >
                  {resource.kind} · {resource.ref.id} / 版本 {resource.ref.version}
                </p>
              ))}
            </details>
          )}
          {actions.error && (
            <div className="mt-2 text-xs text-slate-600">
              协作建议暂时无法读取：{actions.error}
              <Button
                size="small"
                loading={actions.loading}
                onClick={() => void actions.refresh()}
              >
                重试读取建议
              </Button>
            </div>
          )}
          {!!readableActions.length && (
            <details className="mt-2">
              <summary>协作建议（{readableActions.length}）</summary>
              {readableActions.map((action) => (
                <ResearchActionCard
                  key={action.id + ":" + action.version + ":" + action.status}
                  action={action}
                />
              ))}
            </details>
          )}
        </>
      )}
      {!isGroup &&
        (turn.data?.data || currentRetry) &&
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
      {!isGroup && turn.error && (
        <p className="text-xs text-red-700">AI 请求状态暂时无法读取：{turn.error}</p>
      )}
      {isGroup && imID && read.data?.fact.origin === "human" && (
        <GroupMessageStatuses
          conversationId={read.data.fact.conversationId}
          messageId={read.data.fact.id}
          imID={imID}
          own={!!read.data.fact.turnId}
          inputText={read.data.fact.text || ""}
        />
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
