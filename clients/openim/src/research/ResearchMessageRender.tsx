import { Alert, Tag } from "antd";
import { OpenImResearchPointer } from "@research-agent-platform/contracts";
import { IMessageItemProps } from "@/pages/chat/queryChat/MessageItem";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { ResearchActionCard } from "./ResearchActionCard";
import { ResearchTurnStatus } from "./ResearchTurnStatus";
import { useResearchStore } from "./store";
import { useConversationStore } from "@/store";
import { useState } from "react";
import type { AgentTurn } from "@research-agent-platform/contracts";

export default function ResearchMessageRender({ message }: IMessageItemProps) {
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
      if (!fact) throw new Error("当前权限下无法读取这条科研消息");
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
  return (
    <div className="max-w-[620px] rounded border bg-white p-3 text-sm">
      <Tag color="blue">科研回执 · 当前授权</Tag>
      {!pointer && <Alert type="warning" message="这条消息不含可读取的科研回执" />}
      {read.error && (
        <Alert type="warning" message="科研消息当前不可读取" description={read.error} />
      )}
      {pointer && !read.data && !read.error && <p>正在核对权限…</p>}
      {read.data && (
        <>
          <p className="whitespace-pre-wrap break-words">{read.data.fact.text}</p>
          {read.data.fact.resources.map((resource) => (
            <p
              key={`${resource.kind}:${resource.ref.id}`}
              className="text-xs text-slate-600"
            >
              {resource.kind} · {resource.ref.id} / 版本 {resource.ref.version}
            </p>
          ))}
          {read.data.actions.map((action) => (
            <ResearchActionCard
              key={action.id + ":" + action.version + ":" + action.status}
              action={action}
            />
          ))}
        </>
      )}
      {(turn.data?.data || currentRetry) && (
        <ResearchTurnStatus
          turn={turn.data?.data || currentRetry!}
          manager={manager}
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
    </div>
  );
}
