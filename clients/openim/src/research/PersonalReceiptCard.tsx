import { Button, Modal } from "antd";
import { useLayoutEffect, useState } from "react";
import type { AgentTurn, PersonalAssistantReceipt } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import { PersonalAssistantPanel } from "./PersonalAssistantPanel";
import { personalDueLabel } from "./personal-time";
import { CreatedAgentChatButton } from "./CreatedAgentChatButton";

function DelegateCard({ receipt }: { receipt: Extract<PersonalAssistantReceipt, { kind: "delegate" }> }) {
  const read = useResearchRead(() => researchApi("chatTurn", { params: { id: receipt.turnId } }), `delegated:${receipt.conversationId}:${receipt.turnId}`);
  const turn = read.data?.data;
  const verified = turn?.conversationId === receipt.conversationId && turn.inputMessageId === receipt.messageId;
  const status = verified && turn ? ({ queued: "等待 Agent 回复", running: "Agent 正在回复", succeeded: "Agent 已回复", waiting_input: "还需补充信息", unavailable: "回复服务暂不可用", failed: "本次回复失败", interrupted: "本次回复已中断", cancelled: "本次回复已取消" }[turn.status]) : receipt.status === "unavailable" ? "回复服务暂不可用" : "已安排，等待回复";
  return <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
    <p>已将本次需求安排给 <strong>{receipt.displayName}</strong>。</p>
    <p className="text-xs text-slate-600">{status}。安排不等于工作已经完成。</p>
    {read.error && <p className="text-xs text-amber-800">当前回复状态未能核对：{read.error}</p>}
    <CreatedAgentChatButton created={receipt} delegated />
    <details className="text-xs text-slate-500"><summary>安排详情</summary><p>当前需求已保存到该 Agent 的稳定私聊。此安排最多使用剩余 {receipt.budget.maxTokens} Token / {receipt.budget.maxSeconds} 秒，不另增本轮预算。</p></details>
  </div>;
}

export function PersonalReceiptCard({ turn, compact = false }: { turn: AgentTurn; compact?: boolean }) {
  const scope = usePersonalOperation(true, `receipt:${turn.id}`);
  const [panel, setPanel] = useState<"memory" | "followups">(), [details, setDetails] = useState(false);
  useLayoutEffect(() => { setPanel(undefined); setDetails(false); }, [scope.scope]);
  const memory = turn.memoryReceipt, followup = turn.followupReceipt, arrangement = turn.assistantReceipt;
  if (!memory && !followup && !arrangement) return null;
  const memoryTitle = memory && ({ saved: "偏好已保存", corrected: "偏好已纠正", forgotten: "偏好已移除", candidate: "有一条记忆候选等待你确认", clarify: "请补充偏好信息" }[memory.operation]);
  const title = arrangement ? arrangement.kind === "delegate" ? `已安排给 ${arrangement.displayName}` : "协作建议已保存，等待确认" : memoryTitle || (followup?.operation === "created" ? "跟进已安排" : "请补充提醒时间");
  const content = <div className="space-y-3 text-sm">
    {memory && <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <strong>{memoryTitle}</strong>{memory.topic && <p className="break-words">{memory.topic}</p>}
      <p className="text-xs text-slate-600">{memory.operation === "candidate" ? "只有你确认后才会用于后续聊天；确认后替代同主题的旧记忆。" : memory.operation === "forgotten" ? "之后的聊天不再使用这条偏好；来源记录仍保留。" : memory.operation === "clarify" ? memory.question : "已保存，仅用于你自己的站内 Agent 私聊；群聊、他人的 Agent、接入的外部 Agent 不使用。"}</p>
      {memory.memoryId && <Button size="small" onClick={() => setPanel("memory")}>查看我的记忆</Button>}
    </div>}
    {followup && <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <strong>{followup.operation === "created" ? "跟进已安排" : "请补充提醒时间"}</strong>
      {followup.dueAt && followup.timeZone && <p>{personalDueLabel(followup.dueAt, followup.timeZone)}</p>}
      <p className="text-xs text-slate-600">{followup.operation === "clarify" ? followup.question : "到期由服务端处理并写回聊天；当前不表示设备已收到通知。"}</p>
      {followup.followupId && <Button size="small" onClick={() => setPanel("followups")}>查看跟进</Button>}
    </div>}
    {arrangement?.kind === "delegate" && <DelegateCard receipt={arrangement} />}
    {arrangement?.kind === "collaborate" && <p className="rounded-lg border p-3">已保存协作建议。请查看本条消息的协作建议并确认；成员加入、任务承接和执行仍需分别完成。</p>}
  </div>;
  return <>
    {compact ? <div className="flex min-w-0 items-center justify-between gap-2 text-xs"><span className="truncate text-slate-600">{title}</span><Button type="link" size="small" onClick={() => setDetails(true)}>查看</Button></div> : content}
    <Modal title="本次个人助理回执" open={details} footer={null} onCancel={() => setDetails(false)} centered styles={{ body: { maxHeight: "calc(100dvh - 180px)", overflowY: "auto" } }}>{content}</Modal>
    <PersonalAssistantPanel open={!!panel} initialTab={panel} onClose={() => setPanel(undefined)} />
  </>;
}
