import { Alert, Button } from "antd";
import clsx from "clsx";
import { ChatSourceQuote } from "./ChatSourceQuote";
import {GroupNoticeCard} from './GroupNoticeCard';
import { AssistantStickerExtension, assistantStickerFallback, OpenImResearchPointer, type AssistantStickerId } from "@research-agent-platform/contracts";
import { IMessageItemProps } from "@/pages/chat/queryChat/MessageItem";
import { researchApi, supportsTranscriptSync } from "./api";
import { useResearchRead } from "./useResearchRead";
import { ResearchActionCard } from "./ResearchActionCard";
import { LegacyTaskInviteCard, ResearchTaskCard } from "./ResearchTaskCard";
import {
  isTaskNotice,
  legacyTaskInvitation,
  serviceNoticePreview,
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
  useStoppedReplyInTimeline,
} from "./agent-progress";
import { isPendingAgentReply } from "./agent-progress-state";
import type { AgentTurn } from "@research-agent-platform/contracts";
import styles from "@/pages/chat/queryChat/MessageItem/message-item.module.scss";
import { CreatedAgentChatButton } from "./CreatedAgentChatButton";
import { AgentFileReadSummary, agentFileReadCoverage } from "./AgentFileReadSummary";
import { PersonalReceiptCard } from "./PersonalReceiptCard";
import { ChatProjectDelivery } from "./ChatProjectDelivery";
import { canonicalChatText, coordinatorChatText, isCoordinatorChatContact } from "./chat-reply";
import { createProjectNoticeReader, isProjectNoticeCandidate } from './project-message-notice';
import { ContinueAgentFileReadingButton } from "./ContinueAgentFileReadingButton";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { ResearchReadSummary } from "./ResearchReadSummary";
import { GroupMessageStatuses } from "./GroupMessageStatuses";
import { readChatMessage, readChatTurn, activeChatTurn } from "./chat-message-read";
import { useChatRecordChanges } from './useChatRecordChanges';
import { watchTranscriptMessage } from './chat-transcript-sync';
import { locateMessage, researchPointer, timelineScope } from "./chat-timeline";
import ChatSticker, { getChatSticker, getPersonalStickerId } from "./ChatSticker";

const readProjectNotice=createProjectNoticeReader(async(conversationId,messageId)=>
  (await researchApi('chatProjectNotice',{params:{id:conversationId,messageId}})).data,
);

export default function ResearchMessageRender({
  message,
  previousMessage,
  onReadableText,
  onReplyAgent,
  onDetails,
}: IMessageItemProps) {
  const history = useContext(AgentProgressHistory);
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  const manager = useResearchStore((s) => s.actor?.isLabManager || false);
  const actorGeneration = useResearchStore((s) => s.generation);
  const mapping = useResearchStore(
    (s) => s.mappings.find((m) => m.imConversationID === imID),
  );
  const isGroup = mapping?.kind === "group";
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
  useEffect(() => pointer ? watchTranscriptMessage(pointer.conversationId, pointer.messageId) : undefined, [pointer?.conversationId, pointer?.messageId, actorGeneration]);
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
    { poll: false, keepDataOnError: true },
  );
  useChatRecordChanges(pointer?.conversationId, 'message', pointer?.messageId, read.refresh, read.invalidate);
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
    { poll: false },
  );
  const readableActions =
    actions.data?.data.filter((action) => actionIds.includes(action.id)) || [];
  const pendingActions = readableActions.filter((action) => action.allowedDecisions.length);
  const pastActions = readableActions.filter((action) => !action.allowedDecisions.length);
  const { tasks: taskResources, others: otherResources } = splitTaskResources(
    read.data?.fact.resources || [],
  );
  const taskNotice = isTaskNotice(read.data?.fact);
  const coordinatorSender = useResearchStore((state) =>
    isCoordinatorChatContact(read.data?.fact.senderContactId, state),
  );
  const ownAssistantSide = useResearchStore(({ session }) => {
    const coordinator = session?.coordinator;
    if (!coordinator || coordinator.imConversationID !== imID ||
      coordinator.researchConversationId !== pointer?.conversationId) return;
    if (coordinator.peerUserID === message.sendID) return "assistant";
    if (session?.user?.userID === message.sendID) return "owner";
  });
  const ownAssistantMessage = ownAssistantSide === "assistant";
  const projectNotice=useResearchRead(
    ()=>readProjectNotice(actorGeneration,pointer!.conversationId,pointer!.messageId),
    `project-message:${pointer?.conversationId}:${pointer?.messageId}`,
    !!pointer && isProjectNoticeCandidate(read.data?.fact, read.data?.details?.replyTo, coordinatorSender),
    {poll:false},
  );
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
  const text = read.data ? canonicalChatText(read.data.fact, coordinatorSender) : "";
  useEffect(() => {
    onReadableText?.(text);
  }, [text, onReadableText]);
  useEffect(() => onDetails?.(read.data?.details), [read.data?.details, onDetails]);
  useEffect(() => {
    const fact = read.data?.fact;
    onReplyAgent?.(
      (fact?.origin === "model" || !!projectNotice.data) && fact?.senderContactId
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
    projectNotice.data,
    message.senderNickname,
    onReplyAgent,
  ]);
  const turnId = currentRetry?.id || read.data?.fact.turnId;
  const turn = useResearchRead(
    () => readChatTurn(pointer!.conversationId, turnId || ''),
    `${imID}:${turnId || ""}`,
    !!turnId,
    { poll: value => !supportsTranscriptSync() && activeChatTurn(value), keepDataOnError: true },
  );
  useChatRecordChanges(pointer?.conversationId, 'turn', turnId ?? undefined, turn.refresh, turn.invalidate);
  const currentTurn = turn.data?.data || currentRetry;
  const stoppedReplyInTimeline = useStoppedReplyInTimeline(actorGeneration, imID, currentTurn);
  const ownReceipt = currentTurn && currentTurn.outputMessageId === read.data?.fact.id
    ? currentTurn : undefined;
  const hasTaskReceipt = ownReceipt?.assistantReceipt?.kind === "work_task";
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
      (isPendingAgentReply(currentTurn.status) ||
        (read.data.fact.origin === "human" &&
          read.data.fact.id === history.latestOwnId &&
          currentTurn.outputMessageId &&
          !history.messageIds.has(currentTurn.outputMessageId)))
    )
      registerAgentProgress(
        actorGeneration,
        imID,
        currentTurn,
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
  const source = read.data?.details?.replyTo;
  const sourceCoordinator = useResearchStore((state) =>
    isCoordinatorChatContact(source?.senderContactId, state),
  );
  const taskReceipt = ownReceipt?.assistantReceipt;
  const plainTaskReceipt = taskReceipt?.kind === "work_task" &&
    ownReceipt?.status === "succeeded" && !turn.error &&
    !taskNotice && !taskResources.length && !otherResources.length && !actionIds.length &&
    !read.data?.fact.noticeId && !read.data?.fact.files?.length && !fileRead &&
    !ownReceipt.libraryRead && !ownReceipt.memoryReceipt && !ownReceipt.followupReceipt;
  const taskId = projectNotice.data?.taskId || (plainTaskReceipt ? taskReceipt.taskId : undefined);
  if (taskId && read.data && !read.error && !read.data.details?.withdrawn) {
    const { fact } = read.data;
    return (
      <div
        data-canonical-message={fact.id}
        className={`${styles.bubble} chat-project-delivery-bubble`}
      >
        <ChatProjectDelivery
          taskId={taskId}
          messageId={fact.id}
          kind={projectNotice.data?.kind || "receipt"}
          text={text}
          source={source || undefined}
          onLocateSource={(locator) =>
            locateMessage(timelineScope(actorGeneration, imID || ""), locator)
          }
        />
      </div>
    );
  }
  const fact = read.data?.fact;
  const withdrawn = !!read.data?.details?.withdrawn;
  const ownerStickerId = ownAssistantSide === "owner" && fact?.origin === "human" && !withdrawn
    ? getPersonalStickerId(fact.text) : undefined;
  let assistantStickerId: AssistantStickerId | undefined;
  if (ownAssistantMessage && fact?.origin === "model" && !withdrawn) {
    try {
      const sticker = AssistantStickerExtension.safeParse(JSON.parse(message.customElem?.extension || "null"));
      if (sticker.success && getChatSticker(sticker.data.id)) assistantStickerId = sticker.data.id;
    } catch {
      // Legacy and unknown extensions keep the authorized text readable.
    }
  }
  const stickerId = ownerStickerId ?? assistantStickerId;
  const stickerOnly = !!ownerStickerId || (assistantStickerId !== undefined && text === assistantStickerFallback(assistantStickerId));
  const serviceNoticeSummary = fact?.origin === "service" && fact.text &&
    !fact.resources.length && !fact.actionIds.length && !fact.turnId && !projectNotice.data
    ? serviceNoticePreview(fact.text)
    : undefined;
  // Greetings already stored by 1.0.0 have no separate title or notice ID.
  // A disclosure is useful when there is a distinct title or an attached context.
  const plainAssistantMessage = !!serviceNoticeSummary && serviceNoticeSummary === text &&
    !!fact?.senderContactId && !fact.noticeId && !fact.files?.length && !source &&
    (ownAssistantMessage || (mapping?.kind === "personal" &&
      mapping.researchConversationId === fact.conversationId && coordinatorSender));
  const plainMessage = (fact?.origin !== "service" || plainAssistantMessage) && !!text &&
    !hasTaskReceipt && !taskNotice && !taskResources.length && !otherResources.length &&
    !actionIds.length && !fact?.files?.length && !fileRead && !ownReceipt?.libraryRead;
  const plainAssistantReply = plainMessage && !isGroup &&
    (fact?.origin === "model" || plainAssistantMessage);
  const previousPointer = source && plainAssistantReply && previousMessage
    ? researchPointer(previousMessage)
    : undefined;
  const adjacentSource = !!previousPointer && source?.messageId === previousPointer.messageId &&
    source.sequence === previousPointer.sequence &&
    source.sequence + 1 === read.data?.fact.sequence &&
    previousPointer.conversationId === read.data.fact.conversationId;
  return (
    <div
      data-canonical-message={read.data?.fact.id}
      className={clsx(!stickerOnly && styles.bubble, !stickerOnly && plainMessage && "chat-plain-message", !stickerOnly && plainAssistantReply && "chat-assistant-reply")}
    >
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
          {pendingActions.length > 0 && (
            <section aria-label="待处理的协作建议" className="chat-message-actions">
              {pendingActions.map((action) => (
                <ResearchActionCard
                  key={action.id + ":" + action.version + ":" + action.status}
                  action={action}
                />
              ))}
            </section>
          )}
          {hasTaskReceipt && ownReceipt && (
            <div className="chat-message-actions">
              <PersonalReceiptCard turn={ownReceipt} />
            </div>
          )}
          {!taskNotice && (
            <>
              {!!taskResources.length && (
                <div className="space-y-2">
                  {taskResources.map((resource) => (
                    <ResearchTaskCard
                      key={`${resource.kind}:${resource.ref.id}`}
                      resource={resource}
                      source={{ conversationId: read.data!.fact.conversationId, messageId: read.data!.fact.id }}
                    />
                  ))}
                </div>
              )}
            </>
          )}
          {taskNotice && read.data.fact.resources[0] ? (
            <ResearchTaskCard
              resource={read.data.fact.resources[0]}
              text={read.data.fact.text || undefined}
              source={{ conversationId: read.data.fact.conversationId, messageId: read.data.fact.id }}
            />
          ) : (
            <>
              {read.data.fact.noticeId ? <GroupNoticeCard id={read.data.fact.noticeId}/> : legacyInvite && read.data.fact.text ? (
                <LegacyTaskInviteCard text={read.data.fact.text} />
              ) : (
                stickerId ? (
                  <div className="flex flex-col items-start gap-2">
                    {!stickerOnly && <SafeMessageMarkdown text={text} />}
                    <ChatSticker stickerId={stickerId} />
                  </div>
                ) : read.data.fact.text && (
                  serviceNoticeSummary && !plainAssistantMessage ? (
                    <details className="chat-system-notice">
                      <summary title={serviceNoticeSummary}>{serviceNoticeSummary}</summary>
                      <SafeMessageMarkdown text={read.data.fact.text} />
                    </details>
                  ) : <SafeMessageMarkdown text={text} />
                )
              )}
            </>
          )}
          {source && !source.withdrawn && !adjacentSource && (
            <ChatSourceQuote
              key={source.messageId}
              label={read.data.fact.origin === "human" ? "引用" : "回复的问题"}
              text={coordinatorChatText(source.text, source.senderContactId, sourceCoordinator)}
              onLocate={() =>
                locateMessage(timelineScope(actorGeneration, imID || ""), {
                  messageId: source.messageId,
                  sequence: source.sequence,
                })
              }
            />
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
          {pastActions.length > 0 && (
            <details className="mt-2">
              <summary>协作建议记录（{pastActions.length}）</summary>
              {pastActions.map((action) => (
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
        currentTurn &&
        currentTurn.status !== "succeeded" &&
        !stoppedReplyInTimeline &&
        !isPendingAgentReply(currentTurn.status) && (
          <ResearchTurnStatus
            turn={currentTurn}
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
      {isGroup && imID && read.data?.fact.origin === "human" && !read.data.details?.withdrawn && (
        <GroupMessageStatuses
          conversationId={read.data.fact.conversationId}
          messageId={read.data.fact.id}
          imID={imID}
          own={!!read.data.fact.turnId}
          inputText={read.data.fact.text || ""}
        />
      )}
      {ownReceipt && !hasTaskReceipt && (
        <div className="mt-2">
          <PersonalReceiptCard
            turn={ownReceipt}
            compact={!!ownReceipt.memoryReceipt || !!ownReceipt.followupReceipt}
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
