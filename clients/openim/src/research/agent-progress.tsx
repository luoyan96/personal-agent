import { createContext, useContext, useEffect, useRef } from "react";
import { create } from "zustand";
import type { AgentTurn, AgentTurnProgress } from "@research-agent-platform/contracts";
import { useConversationStore } from "@/store";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import OIMAvatar from "@/research/ResearchAvatar";
import DesktopWorkCard from "./DesktopWorkCard";
import { useGroupChatRoster, groupContactDescription } from "./GroupChatRoster";
import { useChatOutbox, reconcileAcknowledgedMessages } from "./chat-outbox";
import { progressNeedsRead } from "./agent-progress-state";
import { useResearchRead } from "./useResearchRead";
import { ResearchTurnStatus } from "./ResearchTurnStatus";

type Entry = {
  generation: number;
  imID: string;
  conversationId: string;
  turnId: string;
  agentContactId?: string;
  displayName?: string;
  inputText?: string;
  progress?: AgentTurnProgress;
  error?: string;
  canonicalSeen?: string;
  checkedAt?: number;
  validation?: string;
};
const useProgress = create<{ entries: Entry[] }>(() => ({ entries: [] }));
export const AgentProgressHistory = createContext<{
  messageIds: Set<string>;
  latestOwnId?: string;
}>({ messageIds: new Set() });
export function registerAgentProgress(
  generation: number,
  imID: string,
  turn: Pick<AgentTurn, "id" | "conversationId"> & Partial<Pick<AgentTurn, "agentContactId">>,
  presentation?: { displayName?: string; inputText?: string },
) {
  const actor = useResearchStore.getState();
  if (
    generation !== actor.generation ||
    actor.mappings.find((m) => m.imConversationID === imID)?.researchConversationId !==
      turn.conversationId
  )
    return;
  useProgress.setState((s) => {
    const entry = s.entries.find(e => e.generation === generation && e.imID === imID && e.turnId === turn.id);
    const agentContactId = turn.agentContactId || entry?.agentContactId;
    const displayName = presentation?.displayName || entry?.displayName;
    const inputText = presentation?.inputText?.slice(0, 180) || entry?.inputText;
    if (entry) {
      if (entry.agentContactId === agentContactId && entry.displayName === displayName && entry.inputText === inputText) return s;
      return { entries: s.entries.map(e => e === entry ? { ...e, agentContactId, displayName, inputText } : e) };
    }
    return { entries: [...s.entries, { generation, imID, conversationId: turn.conversationId, turnId: turn.id, agentContactId, displayName, inputText }].slice(-100) };
  });
}
export function acknowledgeAgentReply(
  generation: number,
  imID: string,
  turnId: string,
  messageId: string,
) {
  useProgress.setState((s) => ({
    entries: s.entries.map((e) =>
      e.generation === generation && e.imID === imID && e.turnId === turnId
        ? { ...e, canonicalSeen: messageId }
        : e,
    ),
  }));
}
useResearchStore.subscribe((next, previous) => {
  if (next.generation !== previous.generation) useProgress.setState({ entries: [] });
});

function StoppedReplyRecovery({ entry }: { entry: Entry }) {
  const read = useResearchRead(
    signal => researchApi("chatTurn", { params: { id: entry.turnId }, signal }),
    `${entry.generation}:${entry.imID}:${entry.turnId}`,
    true,
    { poll: false },
  );
  const turn = read.data?.data;
  if (read.error) return <p className="desktop-chat-error" role="alert">回复详情暂时无法读取。<button onClick={() => void read.refresh()}>重新读取</button></p>;
  if (!turn || turn.id !== entry.turnId || turn.conversationId !== entry.conversationId)
    return <p role="status" className="text-xs text-slate-500">正在核对回复详情…</p>;
  return <ResearchTurnStatus turn={turn} compact onRetried={next => {
    registerAgentProgress(entry.generation, entry.imID, next, { displayName: entry.displayName, inputText: entry.inputText });
    if (next.id !== entry.turnId) useProgress.setState(s => ({ entries: s.entries.map(e => e.turnId === entry.turnId && e.imID === entry.imID && e.generation === entry.generation ? { ...e, progress: e.progress ? { ...e.progress, phase: "superseded", supersededByTurnId: next.id } : e.progress } : e) }));
    else void read.refresh();
  }} />;
}

/** Only authorized server progress; no simulated typing or native SDK messages. */
export function AgentReplyProgress({ onResize }: { onResize?: () => void }) {
  const history = useContext(AgentProgressHistory);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!container.current || !onResize) return;
    const observer = new ResizeObserver(onResize);
    observer.observe(container.current);
    return () => observer.disconnect();
  }, [onResize]);
  const generation = useResearchStore((s) => s.generation);
  const imID = useConversationStore((s) => s.currentConversation?.conversationID || "");
  const conversation = useConversationStore((s) => s.currentConversation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const mapping = useResearchStore((s) => s.mappings.find(m => m.imConversationID === imID));
  const entries = useProgress((s) => s.entries);
  const submissions = useChatOutbox(s => s.items);
  const receipts = submissions.filter(item => item.generation === generation && item.conversationID === imID && item.state === "acknowledged" && item.receipt?.message.conversationId === mapping?.researchConversationId);
  useEffect(() => {
    for (const item of receipts) for (const turn of item.receipt!.turns)
      registerAgentProgress(generation, imID, turn, { inputText: item.receipt!.message.text || item.text });
    reconcileAcknowledgedMessages(generation, imID, history.messageIds);
  }, [generation, imID, mapping?.researchConversationId, submissions, history.messageIds]);
  const contacts = useResearchStore(s => s.contacts);
  const roster = useGroupChatRoster();
  const scope = `${generation}:${imID}`;
  const validation = useRef({ scope, token: crypto.randomUUID() });
  if (validation.current.scope !== scope)
    validation.current = { scope, token: crypto.randomUUID() };
  const token = validation.current.token;
  const epoch = useRef(0);
  useEffect(() => {
    const current = ++epoch.current;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const read = async () => {
      if (document.visibilityState === "visible") {
        const pending = useProgress
          .getState()
          .entries.filter(
            (e) =>
              e.generation === generation &&
              e.imID === imID &&
              progressNeedsRead(e, token),
          )
          .slice(-8);
        await Promise.all(
          pending.map(async (entry) => {
            try {
              const { data } = await researchApi("chatTurnProgress", {
                params: { id: entry.turnId },
                signal: abort.signal,
              });
              if (
                abort.signal.aborted ||
                epoch.current !== current ||
                generation !== useResearchStore.getState().generation ||
                useConversationStore.getState().currentConversation?.conversationID !==
                  imID
              )
                return;
              if (
                data.turnId !== entry.turnId ||
                data.conversationId !== entry.conversationId
              )
                throw new Error("回复进度与当前会话不一致。");
              useProgress.setState((s) => ({
                entries: s.entries.map((e) =>
                  e === entry ||
                  (e.turnId === entry.turnId &&
                    e.generation === generation &&
                    e.imID === imID)
                    ? {
                        ...e,
                        progress:
                          !e.progress || data.revision >= e.progress.revision
                            ? data
                            : e.progress,
                        error: undefined,
                        checkedAt: Date.now(),
                        validation: token,
                      }
                    : e,
                ),
              }));
              if (data.phase === "superseded" && data.supersededByTurnId)
                registerAgentProgress(generation, imID, {
                  id: data.supersededByTurnId,
                  conversationId: data.conversationId,
                });
            } catch (error) {
              if (!abort.signal.aborted && epoch.current === current)
                useProgress.setState((s) => ({
                  entries: s.entries.map((e) =>
                    e.turnId === entry.turnId &&
                    e.imID === imID &&
                    e.generation === generation
                      ? {
                          ...e,
                          progress: undefined,
                          error:
                            error instanceof Error ? error.message : "进度暂无法读取",
                          checkedAt: Date.now(),
                          validation: token,
                        }
                      : e,
                  ),
                }));
            }
          }),
        );
      }
      if (!abort.signal.aborted && epoch.current === current)
        timer = setTimeout(read, 500);
    };
    const resume = () => {
      if (document.visibilityState === "visible")
        useProgress.setState((s) => ({
          entries: s.entries.map((e) =>
            e.generation === generation &&
            e.imID === imID &&
            !e.canonicalSeen &&
            e.progress?.phase !== "superseded" &&
            e.progress?.phase !== "stopped"
              ? { ...e, validation: undefined, checkedAt: undefined }
              : e,
          ),
        }));
    };
    document.addEventListener("visibilitychange", resume);
    void read();
    return () => {
      epoch.current++;
      abort.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [scope, generation, imID, token]);
  const visible = entries
    .filter(
      (e) =>
        e.generation === generation &&
        e.imID === imID &&
        e.conversationId === mapping?.researchConversationId &&
        !e.canonicalSeen &&
        !history.messageIds.has(e.progress?.finalMessageId || "") &&
        (e.validation === token || e.progress?.phase === "stopped") &&
        (e.error || (e.progress && e.progress.phase !== "superseded")),
    )
    .slice(-8);
  return (
    <div ref={container} data-agent-progress className="desktop-agent-progress space-y-2 px-5 pb-4">
      {receipts.filter(item => !history.messageIds.has(item.receipt!.message.id)).map(item => <div key={item.id} className="chat-acknowledged-input" data-acknowledged-message={item.receipt!.message.id}>
        <div>{item.receipt!.message.text || item.text}</div>
        <span role="status">请求已保存 · 等待聊天记录同步</span>
      </div>)}
      {visible.map(entry => {
        const { turnId, progress: p, error, agentContactId, displayName, inputText } = entry;
        const contact = contacts.find(c => c.contact.id === agentContactId);
        const groupContact = roster.data?.data.find(c => c.id === agentContactId);
        const name = groupContact?.displayName || displayName || contact?.contact.displayName || (mapping?.kind === "group" ? "助手" : conversation?.showName);
        return (
        <div
          key={turnId}
          data-progress-turn={turnId}
          className="desktop-streaming-row text-sm"
        >
          <OIMAvatar contact={groupContact || contact?.contact} userID={mapping?.kind === "group" ? contact?.userID : conversation?.userID} size={36} src={mapping?.kind === "group" ? undefined : conversation?.faceURL} text={name} />
          <div className="desktop-streaming-content">
          <div className="chat-agent-identity"><strong>{name}</strong><span>{groupContact ? groupContactDescription(groupContact, roster.data?.data || [], actorId) : "助手"}</span></div>
          {mapping?.kind === "group" && inputText && <p className="chat-agent-question" title={inputText}>回复：{inputText}</p>}
          {error ? (
            <div className="text-xs text-slate-600">
              回复状态暂时无法读取。
              <button
                className="ml-2 text-blue-600"
                onClick={() =>
                  useProgress.setState((s) => ({
                    entries: s.entries.map((e) =>
                      e.turnId === turnId &&
                      e.imID === imID &&
                      e.generation === generation
                        ? { ...e, checkedAt: undefined }
                        : e,
                    ),
                  }))
                }
              >
                重新读取
              </button>
            </div>
          ) : (
            <>
              <p className="desktop-streaming-status mb-1 text-xs text-slate-500" role="status">
                {p!.phase === "queued"
                  ? "等待回复"
                  : p!.phase === "streaming"
                  ? "正在回复 · 尚未结束"
                  : p!.phase === "final"
                  ? "回复已生成 · 等待消息同步"
                  : "本次回复已停止"}
              </p>
              {p!.text && <SafeMessageMarkdown text={p!.text} />}
              {p!.phase === "stopped" && <StoppedReplyRecovery entry={entry} />}
            </>
          )}
          </div>
        </div>
      ); })}
      {window.electronAPI && actorId && mapping && typeof window.electronAPI.listDesktopReports === "function" && <div className="desktop-work-in-chat"><DesktopWorkCard key={`${generation}:${mapping.researchConversationId}`} scope={{ actorId, conversationId: mapping.researchConversationId }} variant="chat" /></div>}
    </div>
  );
}
