import { Button } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { RequestFor, ResponseFor } from "@research-agent-platform/contracts";
import { useConversationStore, useUserStore } from "@/store";
import { researchApi, researchMode } from "./api";
import { useResearchStore } from "./store";
import { useAgentChatOperation } from "./useAgentChatOperation";
import { registerAgentProgress } from "./agent-progress";
import { emit } from "@/utils/events";

type ReadingRequest = {
  scope: string;
  key: string;
  body: RequestFor<"agentChatMessage">["body"];
  result?: ResponseFor<"agentChatMessage">["data"];
  error?: string;
};

/** A new, explicit request for an already parsed source; never fetch or resend IM. */
export function ContinueAgentFileReadingButton({
  conversationId,
  messageId,
}: {
  conversationId: string;
  messageId: string;
}) {
  const generation = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const imID = useConversationStore((s) => s.currentConversation?.conversationID);
  useResearchStore((s) => s.contacts);
  useResearchStore((s) => s.mappings);
  useResearchStore((s) => s.session);
  useUserStore((s) => s.selfInfo.userID);
  const path = useLocation().pathname;
  const scope = `${generation}:${actorId}:${imID}:${path}:${conversationId}:${messageId}`;
  const capture = useAgentChatOperation();
  const [request, setRequest] = useState<ReadingRequest>();
  const [busy, setBusy] = useState(false);
  const working = useRef(false);
  const latestScope = useRef(scope);
  latestScope.current = scope;
  useLayoutEffect(() => {
    working.current = false;
    setBusy(false);
    setRequest(undefined);
  }, [scope]);

  const target = () => {
    const state = useResearchStore.getState();
    const user = useUserStore.getState();
    const selected = useConversationStore.getState().currentConversation;
    const mapping = state.mappings.find(
      (m) => m.imConversationID === selected?.conversationID,
    );
    const peer = state.contacts.find((c) => c.userID === selected?.userID)?.contact;
    if (
      !researchMode ||
      !state.actor ||
      state.generation !== generation ||
      state.actor.member.id !== actorId ||
      state.sessionActorId !== actorId ||
      state.session?.status !== "available" ||
      state.session.user?.userID !== user.selfInfo.userID ||
      !user.selfInfo.userID ||
      !selected ||
      selected.conversationID !== imID ||
      path !== `/chat/${imID}` ||
      !mapping ||
      mapping.researchConversationId !== conversationId ||
      mapping.kind === "group" ||
      mapping.transportStatus !== "ready" ||
      !peer ||
      peer.identity.kind === "human" ||
      peer.agentRuntime ||
      !peer.allowedActions.includes("chat")
    )
      return undefined;
    return peer;
  };
  const current = request?.scope === scope ? request : undefined;

  const submit = async (previous?: ReadingRequest) => {
    const peer = target();
    if (
      !peer ||
      working.current ||
      current?.result ||
      (previous && previous.scope !== scope)
    )
      return;
    const operation = capture();
    const isCurrent = () =>
      operation.isCurrent() && latestScope.current === scope && !!target();
    const next: ReadingRequest = previous || {
      scope,
      key: crypto.randomUUID(),
      body: {
        text: "请阅读全文，概括这份附件的主要内容，并明确说明本次是否使用了全部可提取文字。不要根据未读取的内容推断。",
        fileSelection: { messageId },
        continuous: true,
      },
    };
    working.current = true;
    setBusy(true);
    setRequest({ ...next, error: undefined });
    try {
      // Recheck both identity and canonical membership before a mutation. This
      // also initializes CSRF so an internal auth await cannot outlive our scope.
      const [session, canonical] = await Promise.all([
        researchApi("session"),
        researchApi("chatConversation", { params: { id: conversationId } }),
      ]);
      if (!isCurrent()) return;
      if (
        session.data.member.id !== actorId ||
        canonical.data.id !== conversationId ||
        canonical.data.kind === "group" ||
        !canonical.data.allowedActions.includes("send") ||
        !canonical.data.members.some(
          (m) => m.contactId === peer.id && m.status === "joined",
        )
      )
        throw new Error("当前没有此附件所在 Agent 私聊的发送权限，请重新核对会话。");
      const response = await researchApi("agentChatMessage", {
        params: { id: conversationId },
        body: next.body,
        idempotencyKey: next.key,
      });
      if (!isCurrent()) return;
      const result = response.data;
      if (
        result.message.conversationId !== conversationId ||
        (result.turn &&
          (result.turn.conversationId !== conversationId ||
            result.turn.inputMessageId !== result.message.id ||
            result.turn.agentContactId !== peer.id ||
            (result.turn.fileRead && result.turn.fileRead.messageId !== messageId)))
      )
        throw new Error("阅读响应与这份附件不一致，请刷新核对；不要重复发送文件。");
      setRequest({ ...next, result });
      if (result.turn && imID) registerAgentProgress(generation, imID, result.turn);
      if (imID)
        emit("CHAT_LIST_SCROLL_TO_BOTTOM", {
          conversationID: imID,
          actorGeneration: generation,
          selfUserID: useUserStore.getState().selfInfo.userID,
        });
    } catch (error) {
      if (isCurrent())
        setRequest({
          ...next,
          error: error instanceof Error ? error.message : "本次全文阅读未确认提交。",
        });
    } finally {
      if (isCurrent()) {
        working.current = false;
        setBusy(false);
      }
      operation.dispose();
    }
  };
  if (!target()) return null;
  return (
    <div className="mt-2 min-w-0 text-xs" data-continue-file-reading>
      <Button
        size="small"
        loading={busy}
        disabled={busy || !!current?.result}
        onClick={() => void submit(current?.error ? current : undefined)}
      >
        {current?.error
          ? "重试本次全文阅读"
          : current?.result
          ? "全文阅读已提交"
          : "继续阅读全文"}
      </Button>
      {busy && (
        <p role="status" className="mt-1 text-slate-600">
          正在提交新的全文阅读请求…
        </p>
      )}
      {!busy && current?.error && (
        <p role="alert" className="mt-1 break-words text-amber-800">
          本次全文阅读未确认完成：{current.error} 可手动重试原请求，不会重新发送文件。
        </p>
      )}
      {!busy && current?.result && (
        <p role="status" className="mt-1 text-slate-600">
          已提交新的全文阅读请求；实际阅读范围请查看这次的新回复。
        </p>
      )}
    </div>
  );
}
