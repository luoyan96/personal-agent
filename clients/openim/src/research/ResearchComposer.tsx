import { Alert, Button, Checkbox, InputNumber, Modal, Select, Space } from "antd";
import { useEffect, useRef, useState } from "react";
import type { AgentTurn, RequestFor } from "@research-agent-platform/contracts";
type ChatResource = NonNullable<
  RequestFor<"sendChatMessage">["body"]["context"]
>[number];
import { useConversationStore, useUserStore } from "@/store";
import { emit } from "@/utils/events";
import { researchApi, researchMode, ResearchApiError } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchTurnStatus } from "./ResearchTurnStatus";
import { DownOutlined, UpOutlined } from "@ant-design/icons";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "./useAgentChatOperation";
import { useResearchContactChat } from "./useResearchContactChat";
import { CreatedAgentChatButton } from "./CreatedAgentChatButton";
import { PersonalReceiptCard } from "./PersonalReceiptCard";
import { registerAgentProgress } from "./agent-progress";

export type PreparedResearchSend =
  | {
      route: "agentChatMessage";
      conversationId: string;
      body: RequestFor<"agentChatMessage">["body"];
    }
  | {
      route: "sendChatMessage";
      conversationId: string;
      body: RequestFor<"sendChatMessage">["body"];
    };

export function useResearchComposer() {
  const captureOperation = useAgentChatOperation();
  const openAgentChat = useResearchContactChat();
  const freshCreation = useRef<{
    turnId?: string;
    operation: AgentChatOperation;
    attempted: boolean;
  }>();
  const sendIntent = useRef(0);
  const [creationFailure, setCreationFailure] = useState<{
    turnId: string;
    message: string;
  }>();
  const conversation = useConversationStore((s) => s.currentConversation);
  const imID = conversation?.conversationID;
  const mapping = useResearchStore((s) =>
    s.mappings.find((m) => m.imConversationID === imID),
  );
  const contacts = useResearchStore((s) => s.contacts);
  const actorGeneration = useResearchStore((s) => s.generation);
  const manager = useResearchStore((s) => s.actor?.isLabManager || false);
  const canonical = useResearchRead(
    () =>
      researchApi("chatConversation", {
        params: { id: mapping?.researchConversationId || "" },
      }),
    mapping?.researchConversationId || "",
    researchMode && !!mapping,
  );
  const [advanced, setAdvanced] = useState(false);
  const [externalConsent, setExternalConsent] = useState(false);
  const [mode, setMode] = useState<"chat" | "ask_agent">("chat"),
    [agentId, setAgentId] = useState(""),
    [maxTokens, setTokens] = useState(4000),
    [maxSeconds, setSeconds] = useState(90),
    [turnSnapshot, setTurn] = useState<{
      generation: number;
      imID?: string;
      turn: AgentTurn;
      continuous?: boolean;
    }>(),
    [context, setContext] = useState<ChatResource[]>([]),
    [open, setOpen] = useState(false);
  const agents =
    canonical.data?.data.members
      .filter((m) => m.status === "joined")
      .flatMap((m) => {
        const contact = contacts.find((c) => c.contact.id === m.contactId)?.contact;
        return contact && contact.identity.kind !== "human" ? [contact] : [];
      }) || [];
  const peer = contacts.find((c) => c.userID === conversation?.userID)?.contact;
  const isDirectAgent =
    !!mapping && mapping.kind !== "group" && !!peer && peer.identity.kind !== "human";
  const external = isDirectAgent ? peer?.agentRuntime : undefined;
  const externalReady = !!external && peer?.availability.status === "available";
  const externalScope = `${imID}:${actorGeneration}:${external?.serviceOrigin}:${external?.callerAllowed}`;
  const consentAvailable = useRef(externalConsent);
  consentAvailable.current = externalConsent;
  useEffect(() => {
    setExternalConsent(false);
    setAdvanced(false);
  }, [externalScope]);
  const turn =
    turnSnapshot?.generation === actorGeneration && turnSnapshot.imID === imID
      ? turnSnapshot.turn
      : undefined;
  const turnRead = useResearchRead(
    () => researchApi("chatTurn", { params: { id: turn?.id || "" } }),
    `${imID}:${turn?.id || ""}`,
    !!turn && turn.conversationId === mapping?.researchConversationId,
  );
  const currentTurn = turnRead.data?.data || turn;
  useEffect(() => {
    const fresh = freshCreation.current;
    if (
      !fresh ||
      fresh.attempted ||
      !currentTurn ||
      fresh.turnId !== currentTurn.id ||
      currentTurn.conversationId !== mapping?.researchConversationId ||
      !fresh.operation.isCurrent()
    )
      return;
    if (
      ["failed", "unavailable", "cancelled", "interrupted", "waiting_input"].includes(
        currentTurn.status,
      )
    ) {
      fresh.operation.dispose();
      freshCreation.current = undefined;
      return;
    }
    if (currentTurn.status !== "succeeded") return;
    const delegated =
      currentTurn.assistantReceipt?.kind === "delegate"
        ? currentTurn.assistantReceipt
        : undefined;
    const created =
      currentTurn.purpose === "create_agent" ? currentTurn.createdAgent : delegated;
    if (!created) {
      fresh.operation.dispose();
      freshCreation.current = undefined;
      return;
    }
    fresh.attempted = true;
    void openAgentChat(created.contactId, fresh.operation.isCurrent, {
      expectedConversationId: created.conversationId,
      onTarget: fresh.operation.allowTarget,
      requireOwnLocal: !!delegated,
    })
      .catch((error) => {
        if (fresh.operation.isCurrent())
          setCreationFailure({
            turnId: currentTurn.id,
            message:
              error instanceof Error ? error.message : "聊天暂未打开，请稍后重试。",
          });
      })
      .finally(() => fresh.operation.dispose());
  }, [currentTurn, mapping?.researchConversationId, openAgentChat]);
  useEffect(() => {
    setContext([]);
    setOpen(false);
    setTurn(undefined);
    setAdvanced(false);
    const peer = contacts.find((c) => c.userID === conversation?.userID)?.contact;
    setAgentId(peer && peer.identity.kind !== "human" ? peer.id : "");
    setMode("chat");
    setCreationFailure(undefined);
  }, [imID, actorGeneration]);
  const prepareResearch = (text: string): PreparedResearchSend | undefined => {
    const advancedRequest = advanced && mode === "ask_agent";
    if (external && (!external.callerAllowed || !consentAvailable.current))
      throw new Error(
        external.callerAllowed
          ? "请先明确授权将本条文字发送到外部服务。"
          : "主人未授权当前账号调用该外部服务。",
      );
    if (external && !externalReady)
      throw new Error(
        "此 Agent 的外部连接当前不可用，请主人核对连接配置；不会改用个人模型。",
      );
    if (external && advancedRequest)
      throw new Error("本站外部接入只转发本条文字，不转发本站的协作、记忆或附件。");
    if (!researchMode || (!isDirectAgent && !advancedRequest)) return undefined;
    if (
      !mapping ||
      !canonical.data?.data.allowedActions.includes("send") ||
      (advancedRequest ? !agents.some((a) => a.id === agentId) : agents.length !== 1)
    )
      throw new Error("请确认当前会话权限，并选择实际已加入的 AI");
    // Consume the external permission at the click, never for the next queued text.
    if (external) {
      consentAvailable.current = false;
      setExternalConsent(false);
    }
    return advancedRequest
      ? {
          route: "sendChatMessage",
          conversationId: mapping.researchConversationId,
          body: {
            text,
            intent: "ask_agent",
            agentContactId: agentId,
            budget: { maxTokens, maxSeconds },
            mentions: [],
            context: [...context],
          },
        }
      : {
          route: "agentChatMessage",
          conversationId: mapping.researchConversationId,
          body: {
            text,
            ...(external ? { externalConsent: true } : { continuous: true }),
          },
        };
  };
  const acceptSendIntent = () => {
    freshCreation.current?.operation.dispose();
    freshCreation.current = undefined;
    setCreationFailure(undefined);
    return ++sendIntent.current;
  };
  const sendPrepared = async (
    prepared: PreparedResearchSend,
    idempotencyKey: string,
    isCurrent: () => boolean,
    intent: number,
  ) => {
    if (!isCurrent())
      throw new Error("会话已切换，这条消息尚未发送，请返回原会话核对。");
    if (mapping?.researchConversationId !== prepared.conversationId)
      throw new Error("原会话映射已变化，请先核对原发送记录；不会转发到其他会话。");
    const generation = useResearchStore.getState().generation;
    const memberId = useResearchStore.getState().actor?.member.id;
    const selfUserID = useUserStore.getState().selfInfo.userID;
    const operation = captureOperation();
    const fresh = {
      operation,
      attempted: false,
      turnId: undefined as string | undefined,
    };
    if (intent === sendIntent.current) freshCreation.current = fresh;
    let result;
    try {
      result =
        prepared.route === "sendChatMessage"
          ? await researchApi("sendChatMessage", {
              params: { id: prepared.conversationId },
              body: prepared.body,
              idempotencyKey,
            })
          : await researchApi("agentChatMessage", {
              params: { id: prepared.conversationId },
              body: prepared.body,
              idempotencyKey,
            });
    } catch (error) {
      operation.dispose();
      if (freshCreation.current === fresh) freshCreation.current = undefined;
      if (
        external &&
        error instanceof ResearchApiError &&
        error.code === "MODEL_UNAVAILABLE"
      )
        throw new Error(
          "此 Agent 的外部连接当前不可用，请主人核对连接配置；不会改用个人模型。",
        );
      throw error;
    }
    if (
      isCurrent() &&
      operation.isCurrent() &&
      useResearchStore.getState().generation === generation &&
      useResearchStore.getState().actor?.member.id === memberId &&
      useConversationStore.getState().currentConversation?.conversationID === imID &&
      useUserStore.getState().selfInfo.userID === selfUserID
    ) {
      if (result.data.turn)
        registerAgentProgress(generation, imID || "", result.data.turn);
      if (intent === sendIntent.current)
        setTurn(
          result.data.turn
            ? {
                generation,
                imID,
                turn: result.data.turn,
                continuous:
                  prepared.route === "agentChatMessage" &&
                  prepared.body.continuous === true,
              }
            : undefined,
        );
      if (
        intent === sendIntent.current &&
        result.data.turn &&
        (result.data.turn.purpose === "create_agent" ||
          (mapping?.kind === "personal" && !external))
      )
        fresh.turnId = result.data.turn.id;
      else {
        operation.dispose();
        if (freshCreation.current === fresh) freshCreation.current = undefined;
      }
      // The pointer still arrives through the canonical outbox and real SDK.
      // Only successful persistence authorizes the UI to follow this request.
      if (imID)
        emit("CHAT_LIST_SCROLL_TO_BOTTOM", {
          conversationID: imID,
          actorGeneration: generation,
          selfUserID,
        });
    } else operation.dispose();
    // Only the canonical backend outbox publishes the research pointer.
    return true;
  };
  const controls =
    researchMode && mapping ? (
      <>
        {external && (
          <div className="px-3 py-2 text-xs leading-5 text-slate-600">
            <p className="truncate" title={external.serviceOrigin}>
              外部服务：{external.serviceOrigin} · 费用由主人连接的外部账号承担
            </p>
            {external.callerAllowed ? (
              externalReady ? (
                <Checkbox
                  checked={externalConsent}
                  onChange={(e) => setExternalConsent(e.target.checked)}
                >
                  授权发送本条文字（不含历史、记忆与附件）
                </Checkbox>
              ) : (
                <p className="text-amber-700">
                  {peer?.availability.status === "disabled"
                    ? "外部连接已停用，请主人启用。"
                    : "外部连接当前不可用，请主人核对连接配置。"}
                </p>
              )
            ) : (
              <p className="text-amber-700">主人尚未允许当前账号调用，请先联系主人。</p>
            )}
          </div>
        )}
        {currentTurn && (
          <div className="mx-3">
            <PersonalReceiptCard turn={currentTurn} compact />
          </div>
        )}
        {advanced && (
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
            <strong>需求与协作</strong>
            <Select
              size="small"
              aria-label="发送方式"
              value={mode}
              onChange={setMode}
              options={[
                { value: "chat", label: "普通聊天" },
                { value: "ask_agent", label: "提出协作需求" },
              ]}
            />
            {mode === "ask_agent" && (
              <>
                <Select
                  size="small"
                  aria-label="请求的 AI"
                  value={agentId || undefined}
                  placeholder="选择已加入 AI"
                  onChange={setAgentId}
                  options={agents.map((agent) => ({
                    value: agent.id,
                    label: agent.displayName,
                  }))}
                />
                <Button size="small" onClick={() => setOpen(true)}>
                  材料与预算 ({context.length})
                </Button>
              </>
            )}
            <span className="text-slate-500">
              @ 不自动执行；建群、邀请和运行须明确确认。
            </span>
          </div>
        )}
        {canonical.error && <Alert type="error" message={canonical.error} />}
        {currentTurn?.assistantReceipt?.kind === "delegate" &&
          creationFailure?.turnId === currentTurn.id && (
            <div className="mx-3 mt-1">
              <CreatedAgentChatButton
                created={currentTurn.assistantReceipt}
                delegated
                initialFailure={creationFailure.message}
              />
            </div>
          )}
        {currentTurn?.purpose === "create_agent" &&
          currentTurn.status === "succeeded" &&
          currentTurn.createdAgent &&
          currentTurn.conversationId === mapping.researchConversationId && (
            <div className="mx-3 mt-1 flex min-w-0 items-start gap-2">
              <span
                className="min-w-0 flex-1 truncate text-xs text-slate-600"
                title={currentTurn.createdAgent.displayName}
              >
                {currentTurn.createdAgent.reused ? "已找到" : "已添加"}{" "}
                {currentTurn.createdAgent.displayName}
              </span>
              <CreatedAgentChatButton
                created={currentTurn.createdAgent}
                initialFailure={
                  creationFailure?.turnId === currentTurn.id
                    ? creationFailure.message
                    : ""
                }
              />
            </div>
          )}
        {(turnRead.data?.data || turn) &&
          (advanced || (turnRead.data?.data || turn)?.status !== "succeeded") &&
          !(
            turnSnapshot?.continuous &&
            !advanced &&
            currentTurn?.purpose !== "create_agent" &&
            (currentTurn?.status === "queued" || currentTurn?.status === "running")
          ) &&
          turn?.conversationId === mapping.researchConversationId && (
            <div className="mx-3 mt-1">
              {turnRead.error && (
                <p className="text-red-700">
                  当前状态无法确认，以下为上次记录。{turnRead.error}
                </p>
              )}
              <ResearchTurnStatus
                turn={turnRead.data?.data || turn!}
                manager={manager}
                compact
                onRetried={
                  turnRead.data && !turnRead.error
                    ? (next) =>
                        setTurn({ generation: actorGeneration, imID, turn: next })
                    : undefined
                }
              />
            </div>
          )}
        <Modal
          title="本次 AI 请求的范围"
          open={open}
          onCancel={() => setOpen(false)}
          footer={<Button onClick={() => setOpen(false)}>保存选择</Button>}
        >
          <div className="space-y-3">
            <p>
              仅把明确选择且当前可读取的任务和材料用于本次请求；普通 IM
              附件不会自动导入科研材料。
            </p>
            <Space wrap>
              tokens 上限
              <InputNumber
                min={1}
                max={1000000}
                value={maxTokens}
                onChange={(v) => setTokens(v || 4000)}
              />
              秒数上限
              <InputNumber
                min={1}
                max={86400}
                value={maxSeconds}
                onChange={(v) => setSeconds(v || 90)}
              />
            </Space>
            {canonical.data?.data.taskIds.map((id) => (
              <ContextTask
                key={id}
                taskId={id}
                selected={context}
                onChange={setContext}
              />
            ))}
            {!canonical.data?.data.taskIds.length && (
              <p>暂无可读取的关联任务或材料；本次请求只提交输入文字和当前获准记忆。</p>
            )}
          </div>
        </Modal>
      </>
    ) : null;
  return {
    prepareResearch,
    sendPrepared,
    acceptSendIntent,
    controls,
    isCoordinator: mapping?.kind === "personal",
    advanced,
    advancedToggle:
      researchMode && mapping && agents.length && !external ? (
        <Button
          type="text"
          size="small"
          onClick={() => setAdvanced(!advanced)}
          icon={
            advanced ? <UpOutlined rev={undefined} /> : <DownOutlined rev={undefined} />
          }
        >
          可选协作
        </Button>
      ) : null,
    invalid:
      researchMode &&
      ((advanced && mode === "ask_agent") || isDirectAgent) &&
      ((!!external &&
        (!external.callerAllowed || !externalReady || !externalConsent)) ||
        !canonical.data?.data.allowedActions.includes("send") ||
        (advanced && mode === "ask_agent"
          ? !agents.some((a) => a.id === agentId)
          : agents.length !== 1)),
  };
}
function ContextTask({
  taskId,
  selected,
  onChange,
}: {
  taskId: string;
  selected: ChatResource[];
  onChange: (refs: ChatResource[]) => void;
}) {
  const { data, error } = useResearchRead(
    () => researchApi("task", { params: { id: taskId } }),
    taskId,
  );
  if (!data) return <p>{error || "读取任务材料…"}</p>;
  if (!("task" in data.data))
    return <p>{data.data.title}：接受任务后可选择获准材料。</p>;
  const { task, artifacts } = data.data;
  const refs: { label: string; value: ChatResource }[] = [
    {
      label: `任务：${task.title} / 版本 ${task.version}`,
      value: { kind: "task", ref: { id: task.id, version: task.version } },
    },
    ...(artifacts || [])
      .filter((a) => a.accessStatus !== "revoked")
      .map((a) => ({
        label: `材料：${a.filename} / 版本 ${a.version}`,
        value: { kind: "artifact" as const, ref: { id: a.id, version: a.version } },
      })),
  ];
  return (
    <div>
      {refs.map(({ label, value }) => {
        const checked = selected.some(
          (ref) =>
            ref.kind === value.kind &&
            ref.ref.id === value.ref.id &&
            ref.ref.version === value.ref.version,
        );
        return (
          <label key={value.ref.id} className="my-2 block">
            <input
              type="checkbox"
              checked={checked}
              disabled={!checked && selected.length >= 20}
              onChange={() =>
                onChange(
                  checked
                    ? selected.filter(
                        (ref) =>
                          !(ref.kind === value.kind && ref.ref.id === value.ref.id),
                      )
                    : [
                        ...selected.filter(
                          (ref) =>
                            !(ref.kind === value.kind && ref.ref.id === value.ref.id),
                        ),
                        value,
                      ],
                )
              }
            />{" "}
            {label}
          </label>
        );
      })}
    </div>
  );
}
