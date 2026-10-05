import { Alert, Button, InputNumber, Modal, Select, Space } from "antd";
import { useEffect, useState } from "react";
import type { AgentTurn, RequestFor } from "@research-agent-platform/contracts";
type ChatResource = NonNullable<
  RequestFor<"sendChatMessage">["body"]["context"]
>[number];
import { useConversationStore } from "@/store";
import { researchApi, researchMode } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchTurnStatus } from "./ResearchTurnStatus";

export function useResearchComposer() {
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
  const [mode, setMode] = useState<"chat" | "ask_agent">("chat"),
    [agentId, setAgentId] = useState(""),
    [maxTokens, setTokens] = useState(4000),
    [maxSeconds, setSeconds] = useState(90),
    [turnSnapshot, setTurn] = useState<{
      generation: number;
      imID?: string;
      turn: AgentTurn;
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
  const turn =
    turnSnapshot?.generation === actorGeneration && turnSnapshot.imID === imID
      ? turnSnapshot.turn
      : undefined;
  const turnRead = useResearchRead(
    () => researchApi("chatTurn", { params: { id: turn?.id || "" } }),
    `${imID}:${turn?.id || ""}`,
    !!turn && turn.conversationId === mapping?.researchConversationId,
  );
  useEffect(() => {
    setContext([]);
    setOpen(false);
    setTurn(undefined);
    const peer = contacts.find((c) => c.userID === conversation?.userID)?.contact;
    setAgentId(peer && peer.identity.kind !== "human" ? peer.id : "");
    setMode(peer && peer.identity.kind !== "human" ? "ask_agent" : "chat");
  }, [imID, actorGeneration]);
  const sendResearch = async (text: string) => {
    if (!researchMode || mode !== "ask_agent") return false;
    if (
      !mapping ||
      !canonical.data?.data.allowedActions.includes("send") ||
      !agents.some((a) => a.id === agentId)
    )
      throw new Error("请确认当前会话权限，并选择实际已加入的 AI");
    const generation = useResearchStore.getState().generation;
    const memberId = useResearchStore.getState().actor?.member.id;
    const result = await researchApi("sendChatMessage", {
      params: { id: mapping.researchConversationId },
      body: {
        text,
        intent: "ask_agent",
        agentContactId: agentId,
        budget: { maxTokens, maxSeconds },
        mentions: [],
        context,
      },
    });
    if (
      useResearchStore.getState().generation === generation &&
      useResearchStore.getState().actor?.member.id === memberId &&
      useConversationStore.getState().currentConversation?.conversationID === imID
    )
      setTurn(
        result.data.turn ? { generation, imID, turn: result.data.turn } : undefined,
      );
    // Only the canonical backend outbox publishes the research pointer.
    return true;
  };
  const controls =
    researchMode && mapping ? (
      <>
        <div className="flex flex-wrap items-center gap-2 px-3 text-xs">
          <Select
            size="small"
            aria-label="发送方式"
            value={mode}
            onChange={setMode}
            options={[
              { value: "chat", label: "普通聊天" },
              { value: "ask_agent", label: "请 AI 回复或提出安排" },
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
        {canonical.error && <Alert type="error" message={canonical.error} />}
        {(turnRead.data?.data || turn) &&
          turn?.conversationId === mapping.researchConversationId && (
            <div className="mx-3 mt-1 max-h-32 overflow-y-auto">
              {turnRead.error && (
                <p className="text-red-700">
                  当前状态无法确认，以下为上次记录。{turnRead.error}
                </p>
              )}
              <ResearchTurnStatus
                turn={turnRead.data?.data || turn!}
                manager={manager}
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
    sendResearch,
    controls,
    isCoordinator: mapping?.kind === "personal",
    invalid:
      researchMode &&
      mode === "ask_agent" &&
      (!agents.some((a) => a.id === agentId) || !canonical.data),
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
