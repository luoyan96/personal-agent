import { Button } from "antd";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import type { CreatedAgentReceipt } from "@research-agent-platform/contracts";
import { useConversationStore } from "@/store";
import { useResearchStore } from "./store";
import { useAgentChatOperation } from "./useAgentChatOperation";
import { useResearchContactChat } from "./useResearchContactChat";

/** Historical receipts only expose an explicit action; mounting never opens chat. */
export function CreatedAgentChatButton({
  created,
  initialFailure = "",
  delegated = false,
}: {
  created: CreatedAgentReceipt;
  initialFailure?: string;
  delegated?: boolean;
}) {
  const generation = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  const path = useLocation().pathname;
  const capture = useAgentChatOperation();
  const openChat = useResearchContactChat();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState(initialFailure);
  useEffect(() => {
    setBusy(false);
    setFailure(initialFailure);
  }, [generation, actorId, imID, path, created.contactId, initialFailure]);
  return (
    <div className="min-w-0 text-xs">
      <Button
        size="small"
        loading={busy}
        onClick={async () => {
          if (busy) return;
          const operation = capture();
          setBusy(true);
          setFailure("");
          try {
            await openChat(created.contactId, operation.isCurrent, {
              expectedConversationId: created.conversationId,
              onTarget: operation.allowTarget,
            });
          } catch (error) {
            if (operation.isCurrent())
              setFailure(
                error instanceof Error ? error.message : "聊天暂未打开，请稍后重试。",
              );
          } finally {
            if (operation.isCurrent()) setBusy(false);
            operation.dispose();
          }
        }}
      >
        打开 Agent 聊天
      </Button>
      {failure && (
        <p className="mt-1 break-words text-amber-800" role="alert">
          {delegated ? "已安排给" : "已添加"} {created.displayName}。{failure}
        </p>
      )}
    </div>
  );
}
