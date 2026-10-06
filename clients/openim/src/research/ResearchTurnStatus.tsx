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
  compact = false,
  onRetried,
}: {
  turn: AgentTurn;
  manager?: boolean;
  compact?: boolean;
  onRetried?: (turn: AgentTurn) => void;
}) {
  const guidance = turnGuidance(turn, manager);
  const actorGeneration = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  const peerID = useConversationStore(s => s.currentConversation?.userID);
  const external = useResearchStore(s => !!s.contacts.find(c => c.userID === peerID)?.contact.agentRuntime);
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
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<{ scope: string; message: string }>();
  useEffect(() => {
    setConfirmation(undefined);
    setDetailsOpen(false);
    setFailure(undefined);
    setBusy(false);
  }, [scope]);
  const retryAllowed = Boolean(
    onRetried && !external &&
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
  const alert = (
    <>
      <Alert
        type={guidance.tone}
        showIcon
        message={guidance.title}
        description={guidance.nextStep}
      />
      {failure?.scope === scope && (
        <p className="mt-1 text-red-700">{failure.message}</p>
      )}
    </>
  );
  const statusLabels: Record<AgentTurn["status"], string> = {
    queued: "等待回复", running: "正在回复", waiting_input: "需要补充信息",
    succeeded: "已回复", unavailable: "当时未能调用模型", failed: "回复失败",
    interrupted: "回复已中断", cancelled: "已取消",
  };
  const read = turn.fileRead;
  const readPages = [...new Set(read?.ranges.map(range => range.pageNumber) || [])];
  const facts = (
        <div className="space-y-2 pt-2 text-slate-700" data-ai-turn-facts>
          <p>请求状态：{statusLabels[turn.status]}</p>
          {turn.failure && <p className="break-all">失败代码：{turn.failure}</p>}
          <p>
            本次预算：上下文与回复合计 {turn.budget.maxTokens} Token，最多{" "}
            {turn.budget.maxSeconds} 秒。
          </p>
          {turn.usage ? (
            <p>
              实际用量：输入 {turn.usage.inputTokens ?? "未确认"} Token，回复{" "}
              {turn.usage.outputTokens ?? "未确认"} Token；耗时{" "}
              {(turn.usage.elapsedMs / 1000).toFixed(1)} 秒。
            </p>
          ) : <p>实际用量：尚未确认。</p>}
          {read && (
            <div className="space-y-1 rounded-md bg-slate-50 p-2" data-ai-file-read-details>
              <p className="break-all">附件：{read.filename}</p>
              <p>可提取文字：{read.pageCount} 页 · {read.characterCount} 字符。</p>
              <p>本次读取：{readPages.length ? `第 ${readPages.join("、")} 页` : "尚未确认读取片段"}。</p>
              {read.partial && <p>本次未使用完整文件；回答依据列出的页码与范围。</p>}
              {!!read.ranges.length && <details><summary className="cursor-pointer">每页读取范围</summary>
                {read.ranges.map((range, index) => <p key={index}>第 {range.pageNumber} 页：字符 {range.start}–{range.end}</p>)}
              </details>}
            </div>
          )}
          <p className="break-all">
            请求编号：{turn.id} · 版本 {turn.version}
          </p>
          <p className="break-all">
            技术状态：{turn.status}
            {turn.failure ? ` · ${turn.failure}` : ""}
          </p>
        </div>
  );
  const feedback = (
    <>
      {alert}
      <details className="mt-1 text-slate-600">
        <summary className="cursor-pointer">请求详情</summary>
        {facts}
      </details>
    </>
  );
  const retryButton = retryAllowed ? (
    <Button
      className="shrink-0"
      size="small"
      onClick={() => {
        setDetailsOpen(false);
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
  ) : null;
  return (
    <div className="min-w-0 break-words text-xs" role="status" data-ai-turn-status>
      {compact ? (
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`min-w-0 flex-1 truncate ${
              guidance.tone === "error"
                ? "text-red-700"
                : guidance.tone === "warning"
                ? "text-amber-700"
                : guidance.tone === "success"
                ? "text-green-700"
                : "text-slate-600"
            }`}
            title={guidance.title}
          >
            {turn.failure === "BUDGET_EXCEEDED" ? "本次请求超出预算" : guidance.title}
          </span>
          <Button
            className="shrink-0"
            size="small"
            type="text"
            onClick={() => setDetailsOpen(true)}
          >
            查看详情
          </Button>
        </div>
      ) : (
        <>
          {feedback}
          <div className="mt-1">{retryButton}</div>
        </>
      )}
      <Modal
        title="AI 请求详情"
        open={compact && detailsOpen}
        onCancel={() => setDetailsOpen(false)}
        footer={
          <div className="flex items-center justify-end gap-2">
            {retryButton}
            <Button onClick={() => setDetailsOpen(false)}>关闭</Button>
          </div>
        }
        destroyOnClose
      >
        <div className="max-h-[60dvh] min-w-0 overflow-y-auto break-words">{alert}{facts}</div>
      </Modal>
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
