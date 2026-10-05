import { Alert, Button, Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { AgentTurn } from "@research-agent-platform/contracts";
import { useConversationStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { turnGuidance } from "./turn-guidance";

type RetryConfirmation = {
  turnId: string;
  version: number;
  budget: NonNullable<AgentTurn["remainingBudget"]>;
  key: string;
};

export function ResearchTurnStatus({
  turn,
  manager = false,
  onRetried,
}: {
  turn: AgentTurn;
  manager?: boolean;
  onRetried?: (turn: AgentTurn) => void;
}) {
  const guidance = turnGuidance(turn, manager);
  const actorGeneration = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  const location = useLocation();
  const scope = `${actorGeneration}:${actorId}:${imID}:${location.pathname}:${turn.id}`;
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [confirmation, setConfirmation] = useState<RetryConfirmation>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ scope: string; message: string }>();
  useEffect(() => {
    setConfirmation(undefined);
    setFailure(undefined);
    setBusy(false);
  }, [scope]);
  const retryAllowed = Boolean(
    onRetried &&
      turn.failure !== "BUDGET_EXCEEDED" &&
      turn.allowedActions.includes("retry") &&
      turn.remainingBudget,
  );
  const confirmationCurrent =
    confirmation?.turnId === turn.id &&
    confirmation.version === turn.version &&
    retryAllowed;
  const retry = async () => {
    if (!confirmation || !confirmationCurrent || busy) return;
    const isCurrent = () =>
      mounted.current &&
      latestScope.current === scope &&
      useResearchStore.getState().generation === actorGeneration &&
      useResearchStore.getState().actor?.member.id === actorId &&
      useConversationStore.getState().currentConversation?.conversationID === imID;
    setBusy(true);
    setFailure(undefined);
    try {
      const result = await researchApi("retryChatTurn", {
        params: { id: confirmation.turnId },
        body: { expectedVersion: confirmation.version, budget: confirmation.budget },
        idempotencyKey: confirmation.key,
      });
      if (
        result.data.conversationId !== turn.conversationId ||
        result.data.inputMessageId !== turn.inputMessageId ||
        result.data.agentContactId !== turn.agentContactId
      )
        throw new Error("重试响应与当前请求不一致，请刷新后核对。");
      if (isCurrent()) {
        setConfirmation(undefined);
        onRetried?.(result.data);
      }
    } catch (error) {
      if (isCurrent())
        setFailure({
          scope,
          message:
            error instanceof Error ? error.message : "重试未提交，请核对状态后再试。",
        });
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  return (
    <div className="min-w-0 break-words text-xs" role="status" data-ai-turn-status>
      <Alert
        type={guidance.tone}
        showIcon
        message={guidance.title}
        description={guidance.nextStep}
      />
      {retryAllowed && (
        <Button
          className="mt-1"
          size="small"
          onClick={() => {
            setFailure(undefined);
            setConfirmation({
              turnId: turn.id,
              version: turn.version,
              budget: { ...turn.remainingBudget! },
              key: crypto.randomUUID(),
            });
          }}
        >
          核对并重试
        </Button>
      )}
      {failure?.scope === scope && (
        <p className="mt-1 text-red-700">{failure.message}</p>
      )}
      <details className="mt-1 text-slate-600">
        <summary className="cursor-pointer">请求详情</summary>
        <div className="space-y-1 pt-1">
          <p>
            本次预算：上下文与回复合计 {turn.budget.maxTokens} Token，最多{" "}
            {turn.budget.maxSeconds} 秒。
          </p>
          {turn.usage && (
            <p>
              实际用量：输入 {turn.usage.inputTokens ?? "未确认"} Token，回复{" "}
              {turn.usage.outputTokens ?? "未确认"} Token；耗时{" "}
              {(turn.usage.elapsedMs / 1000).toFixed(1)} 秒。
            </p>
          )}
          <p className="break-all">
            请求编号：{turn.id} · 版本 {turn.version}
          </p>
          <p className="break-all">
            技术状态：{turn.status}
            {turn.failure ? ` · ${turn.failure}` : ""}
          </p>
        </div>
      </details>
      <Modal
        title="使用本轮剩余预算重试？"
        open={!!confirmation}
        onCancel={() => !busy && setConfirmation(undefined)}
        onOk={() => void retry()}
        okText="确认重试"
        cancelText="取消"
        confirmLoading={busy}
        okButtonProps={{ disabled: !confirmationCurrent }}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={!busy}
        destroyOnClose
      >
        <div className="space-y-2">
          <p>
            重新处理已保存的需求，并按当前授权核对资料、AI
            档案和记忆。不会增加本轮预算，也不会执行未经确认的协作建议。
          </p>
          <p>
            本轮剩余预算：上下文与回复合计最多 {confirmation?.budget.maxTokens}{" "}
            Token，最多 {confirmation?.budget.maxSeconds} 秒。
          </p>
          <p>请求版本：{confirmation?.version}。点击确认后才提交新的 AI 请求。</p>
          {!confirmationCurrent && (
            <Alert type="warning" message="请求状态已变化，请关闭后重新核对。" />
          )}
          {failure?.scope === scope && <Alert type="error" message={failure.message} />}
        </div>
      </Modal>
    </div>
  );
}
