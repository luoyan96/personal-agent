import { Alert, Button, Input, Popover, Select, Spin } from "antd";
import {
  ArrowUpOutlined,
  DownOutlined,
  ReadOutlined,
  StopOutlined,
  UpOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type {
  AgentTurn,
  Contact,
  ResponseFor,
} from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { findOwnedStarter, libraryAgentStarter } from "./agentStarterProfiles";
import type { LibraryAgentBindings } from "./library-agent";
import {
  readLibraryIntent,
  sendLibraryMessage,
  type LibrarySendIntent,
} from "./library-chat";
import { researchScopeLabels } from "./research-library-api";
import { useResearchStore } from "./store";
import { useAgentStarterLinks } from "./useAgentStarterLinks";
import { useAgentChatOperation } from "./useAgentChatOperation";
import { useResearchRead } from "./useResearchRead";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { ResearchReadSummary } from "./ResearchReadSummary";
import { ResearchTurnStatus } from "./ResearchTurnStatus";
import "./library-agent.scss";

const inProgress = (turn?: AgentTurn) =>
  !!turn && ["queued", "running"].includes(turn.status);
export function LibraryAgent() {
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const [service, setService] = useState<{ generation: number; origin: string }>();
  useEffect(() => {
    let active = true;
    void (async () => {
      const status = await window.electronAPI?.getResearchServiceStatus();
      if (active)
        setService({ generation, origin: status?.address || window.location.origin });
    })().catch(() => {
      if (active) setService({ generation, origin: window.location.origin });
    });
    return () => {
      active = false;
    };
  }, [generation]);
  if (!actor || service?.generation !== generation) return null;
  const storageKey = `acceptcat:library-chat:v1:${encodeURIComponent(service.origin)}:${
    actor.member.id
  }:${actor.member.labId}`;
  return (
    <LibraryChat
      key={`${generation}:${storageKey}`}
      actorId={actor.member.id}
      storageKey={storageKey}
    />
  );
}

function LibraryChat({ actorId, storageKey }: { actorId: string; storageKey: string }) {
  const { links, remember } = useAgentStarterLinks(actorId),
    remembered = useRef(links[libraryAgentStarter.id]);
  const capture = useAgentChatOperation(),
    navigate = useNavigate();
  const [agent, setAgent] = useState<Contact>(),
    [bindings, setBindings] = useState<LibraryAgentBindings>();
  const [collections, setCollections] = useState<
    ResponseFor<"researchCollections">["data"]
  >([]);
  const [selected, setSelected] = useState<string[]>([]),
    [conversationId, setConversationId] = useState("");
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [expanded, setExpanded] = useState(false);
  const [failure, setFailure] = useState(""),
    [reload, setReload] = useState(0),
    [scopeOpen, setScopeOpen] = useState(false),
    [draft, setDraft] = useState("");
  const [pending, setPending] = useState<LibrarySendIntent | undefined>(() => {
    try {
      return readLibraryIntent(localStorage.getItem(storageKey));
    } catch {
      return undefined;
    }
  });
  const [sent, setSent] = useState<AgentTurn>();
  const lock = useRef(false),
    bottom = useRef<HTMLDivElement>(null);
  const checkpoint = (intent: LibrarySendIntent) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(intent));
    } catch {
      throw new Error(
        "待确认消息无法保存在本机，本次未继续发送。请检查本机存储后重试。",
      );
    }
    setPending(intent);
  };
  useEffect(() => {
    const operation = capture();
    setReady(false);
    setFailure("");
    void (async () => {
      try {
        const [owned, visible] = await Promise.all([
          researchApi("chatContacts", {
            query: { view: "mine", scope: "local", limit: 100 },
            signal: operation.signal,
          }),
          researchApi("researchCollections", {
            query: { scope: "visible", limit: 100 },
            signal: operation.signal,
          }),
        ]);
        if (!operation.isCurrent()) return;
        const found = findOwnedStarter(
          owned.data,
          libraryAgentStarter,
          actorId,
          remembered.current,
        );
        if (found?.agentRuntime)
          throw new Error("资料 Agent 已改为外部服务，请在我的 Agent 核对配置。");
        const current = found
          ? (
              await researchApi("agentResearchCollections", {
                params: { id: found.id },
                signal: operation.signal,
              })
            ).data
          : undefined;
        if (!operation.isCurrent()) return;
        setAgent(found);
        setBindings(current);
        setSelected(current?.collectionIds || []);
        setCollections([
          ...new Map(
            [...visible.data, ...(current?.collections || [])].map((c) => [c.id, c]),
          ).values(),
        ]);
        if (found) {
          const direct = await researchApi("createDirectConversation", {
            body: { contactId: found.id },
            signal: operation.signal,
          });
          if (!operation.isCurrent()) return;
          setConversationId(direct.data.id);
        }
        setReady(true);
      } catch (error) {
        if (operation.isCurrent())
          setFailure(
            error instanceof Error ? error.message : "资料配置暂未读到，请重试。",
          );
      } finally {
        operation.dispose();
      }
    })();
    return operation.dispose;
  }, [actorId, reload]);
  const history = useResearchRead(
    async (signal) => {
      const conversation = (
        await researchApi("chatConversation", {
          params: { id: conversationId },
          signal,
        })
      ).data;
      const page = await researchApi("chatMessages", {
        params: { id: conversationId },
        query: {
          afterSequence: Math.max(0, conversation.lastSequence - 80),
          limit: 100,
        },
        signal,
      });
      const id = [...page.data].reverse().find((m) => m.turnId)?.turnId;
      const turn = id
        ? (await researchApi("chatTurn", { params: { id }, signal })).data
        : undefined;
      return { messages: page.data, turn, earlier: conversation.lastSequence > 80 };
    },
    `library-chat-history:${conversationId}`,
    !!conversationId,
  );
  const current = history.data?.turn;
  const latest =
    current &&
    (!sent ||
      current.createdAt > sent.createdAt ||
      (current.id === sent.id && current.version >= sent.version))
      ? current
      : sent;
  const reply = useLibraryReply(latest, conversationId, history.refresh),
    activeTurn = reply.turn || latest;
  const generating = inProgress(activeTurn);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [history.data?.messages.length, reply.text, expanded]);
  const dispatch = async (retry?: LibrarySendIntent) => {
    if (lock.current || !ready || generating || (!retry && (pending || !draft.trim())))
      return;
    lock.current = true;
    setBusy(true);
    setFailure("");
    setExpanded(true);
    const operation = capture();
    const intent = retry || {
      key: crypto.randomUUID(),
      text: draft.trim(),
      collectionIds: [...selected],
      ...(agent ? { agentId: agent.id, bindingVersion: bindings?.version } : {}),
    };
    try {
      checkpoint(intent);
      const result = await sendLibraryMessage({
        api: researchApi,
        actorId,
        agent,
        rememberedId: remembered.current,
        intent,
        signal: operation.signal,
        isCurrent: operation.isCurrent,
        checkpoint,
        onPrepared: (contact, scope) => {
          setAgent(contact);
          setBindings(scope);
          remembered.current = contact.id;
          remember(libraryAgentStarter.id, contact.id);
        },
      });
      if (!result || !operation.isCurrent()) return;
      try {
        localStorage.removeItem(storageKey);
      } catch {
        setFailure("消息已保存，但本机恢复记录未清理。重新打开时可核对原消息。");
      }
      setPending(undefined);
      setDraft("");
      setConversationId(result.conversationId);
      setSent(result.turn || undefined);
      await history.refresh();
    } catch (error) {
      if (operation.isCurrent())
        setFailure(
          error instanceof Error ? error.message : "消息未确认，请核对原消息。",
        );
    } finally {
      if (operation.isCurrent()) setBusy(false);
      lock.current = false;
      operation.dispose();
    }
  };
  const stop = async () => {
    if (!activeTurn || busy || lock.current) return;
    const operation = capture();
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      const current = (
        await researchApi("chatTurn", {
          params: { id: activeTurn.id },
          signal: operation.signal,
        })
      ).data;
      if (!operation.isCurrent()) return;
      const stopped = current.allowedActions.includes("cancel")
        ? (
            await researchApi("cancelChatTurn", {
              params: { id: current.id },
              body: { expectedVersion: current.version },
              signal: operation.signal,
            })
          ).data
        : current;
      if (!operation.isCurrent()) return;
      setSent(stopped);
      await history.refresh();
    } catch (error) {
      if (operation.isCurrent())
        setFailure(
          error instanceof Error ? error.message : "停止结果未确认，请读取最新状态。",
        );
    } finally {
      if (operation.isCurrent()) setBusy(false);
      lock.current = false;
      operation.dispose();
    }
  };
  return (
    <section
      className={`library-agent-dock ${expanded ? "is-expanded" : ""}`}
      aria-label="资料 Agent 聊天"
    >
      <header className="library-agent-heading">
        <div>
          <ReadOutlined />
          <strong>资料 Agent</strong>
          <span>{generating ? "正在结合资料回复…" : "围绕资料，直接聊"}</span>
        </div>
        <nav>
          <Popover
            trigger="click"
            placement="topRight"
            open={scopeOpen}
            onOpenChange={setScopeOpen}
            content={
              <div className="library-agent-scope">
                <strong>本次使用的资料集合</strong>
                <p>仅使用你当前获准的集合，选择不会改变共享范围。发送时保存。</p>
                <Select
                  aria-label="资料 Agent 使用的集合"
                  mode="multiple"
                  value={selected}
                  disabled={!ready || busy || generating || !!pending}
                  placeholder="选择集合（最多 20 个）"
                  onChange={(v) => {
                    if (v.length <= 20) setSelected(v);
                  }}
                  optionFilterProp="label"
                  options={collections
                    .filter((c) => c.status === "available")
                    .map((c) => ({
                      value: c.id,
                      label: `${c.name} · ${researchScopeLabels[c.scope]}`,
                      disabled: selected.length >= 20 && !selected.includes(c.id),
                    }))}
                />
                {!collections.length && (
                  <p>暂无可用集合，可先在上方新建或连接飞书资料。</p>
                )}
                {collections.length >= 100 && (
                  <p>显示最近100个获准集合及已绑定集合。</p>
                )}
                <p>
                  未选择时仅使用聊天内容。飞书副本不自动同步；PPT、图片和代码原件需自行查看。
                </p>
                <Button size="small" onClick={() => setScopeOpen(false)}>
                  完成选择
                </Button>
              </div>
            }
          >
            <Button type="text" disabled={busy} aria-label="选择资料范围">
              资料范围{selected.length ? ` · ${selected.length}` : ""}
            </Button>
          </Popover>
          <Button
            type="text"
            icon={expanded ? <DownOutlined /> : <UpOutlined />}
            aria-label={expanded ? "收起资料对话" : "展开资料对话"}
            onClick={() => setExpanded((v) => !v)}
          />
        </nav>
      </header>
      {expanded && (
        <div
          className="library-agent-messages"
          aria-label="资料对话记录"
          aria-live="polite"
        >
          {history.data?.earlier && (
            <p className="library-chat-note">
              这里显示最近的对话，完整记录仍保留在该 Agent 私聊中。
            </p>
          )}
          {!history.data?.messages.length && !history.loading && (
            <div className="library-agent-welcome">
              <strong>想从资料里找到什么？</strong>
              <p>
                可以问一份申请书的写法，也可以比较论文中的方法。回答会说明实际读取的片段。
              </p>
              <button
                onClick={() => setDraft("查找项目申请书中关于研究基础的内容，标明出处")}
              >
                查找研究基础，核对出处
              </button>
            </div>
          )}
          {history.data?.messages.map((m) => (
            <article className={`library-chat-message role-${m.origin}`} key={m.id}>
              <span>{m.origin === "human" ? "我" : "资料 Agent"}</span>
              {m.text && <SafeMessageMarkdown text={m.text} />}
              {m.turnId && m.origin !== "human" && (
                <LibraryMessageFacts turnId={m.turnId} messageId={m.id} />
              )}
            </article>
          ))}
          {generating && (
            <div className="library-chat-message role-model">
              {reply.text ? (
                <>
                  <SafeMessageMarkdown text={reply.text} />
                  <small>正在生成，最终回答与来源以完成后的回执为准。</small>
                </>
              ) : (
                <p role="status">
                  <Spin size="small" /> 正在读取获准片段并准备回复…
                </p>
              )}
            </div>
          )}
          {activeTurn &&
            !generating &&
            !history.data?.messages.some(
              (m) => m.id === activeTurn.outputMessageId,
            ) && <ResearchTurnStatus turn={activeTurn} compact onRetried={setSent} />}
          <div ref={bottom} />
        </div>
      )}
      {(failure || history.error || reply.error) && (
        <Alert
          type="warning"
          message={failure || history.error || reply.error}
          action={
            <Button
              size="small"
              disabled={busy}
              onClick={() => {
                if (!ready) setReload((n) => n + 1);
                else void history.refresh();
              }}
            >
              重新读取
            </Button>
          }
        />
      )}
      {pending && !busy && (
        <div className="library-chat-recovery">
          <span>有一条消息结果尚未确认，先核对原消息。</span>
          <Button
            size="small"
            disabled={!ready || generating}
            onClick={() => void dispatch(pending)}
          >
            核对原消息
          </Button>
          {!pending.conversationId && (
            <Button
              size="small"
              onClick={() => {
                try {
                  localStorage.removeItem(storageKey);
                  setDraft(pending.text);
                  setPending(undefined);
                  setFailure("");
                } catch {
                  setFailure("本机待确认记录无法更新，请重试。");
                }
              }}
            >
              返回修改
            </Button>
          )}
        </div>
      )}
      <div className="library-agent-composer">
        <Input.TextArea
          aria-label="与资料 Agent 对话"
          placeholder="问问资料 Agent：查找申请书、比较论文方法，或接着追问…"
          value={draft}
          maxLength={8000}
          autoSize={{ minRows: 1, maxRows: 3 }}
          disabled={busy || !!pending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void dispatch();
            }
          }}
        />
        <footer>
          <span>
            {!ready
              ? "正在读取资料配置…"
              : selected.length
              ? `已选 ${selected.length} 个集合`
              : "未选择集合，仅使用聊天内容"}{" "}
            · Enter 发送 · Shift+Enter 换行
          </span>
          <Button type="text" onClick={() => navigate("/me?view=models")}>
            模型设置
          </Button>
          {generating ? (
            <Button
              aria-label="停止资料回复"
              icon={<StopOutlined />}
              loading={busy}
              onClick={() => void stop()}
            >
              停止
            </Button>
          ) : (
            <Button
              type="primary"
              shape="circle"
              icon={<ArrowUpOutlined />}
              aria-label="发送资料消息"
              loading={busy}
              disabled={!ready || !draft.trim() || !!pending}
              onClick={() => void dispatch()}
            />
          )}
        </footer>
      </div>
    </section>
  );
}

function useLibraryReply(
  initial: AgentTurn | undefined,
  conversationId: string,
  refresh: () => Promise<void>,
) {
  const [state, setState] = useState<{
    id: string;
    turn: AgentTurn;
    text: string;
    error?: string;
  }>();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => {
    if (!initial || !inProgress(initial)) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const [turn, progress] = await Promise.all([
          researchApi("chatTurn", {
            params: { id: initial.id },
            signal: controller.signal,
          }),
          researchApi("chatTurnProgress", {
            params: { id: initial.id },
            signal: controller.signal,
          }),
        ]);
        if (controller.signal.aborted) return;
        if (
          turn.data.conversationId !== conversationId ||
          progress.data.conversationId !== conversationId
        )
          throw new Error("回复与当前资料对话不一致。");
        setState({
          id: initial.id,
          turn: turn.data,
          text:
            inProgress(turn.data) && progress.data.phase === "streaming"
              ? progress.data.text
              : "",
        });
        if (!inProgress(turn.data)) {
          await refreshRef.current();
          return;
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setState({
          id: initial.id,
          turn: initial,
          text: "",
          error: error instanceof Error ? error.message : "回复进度读取失败",
        });
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, 700);
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [initial?.id, initial?.status, conversationId]);
  const selected = state?.id === initial?.id ? state : undefined;
  return {
    turn:
      selected && (!initial || selected.turn.version >= initial.version)
        ? selected.turn
        : initial,
    text: selected?.text || "",
    error: selected?.error,
  };
}

function LibraryMessageFacts({
  turnId,
  messageId,
}: {
  turnId: string;
  messageId: string;
}) {
  const [open, setOpen] = useState(false);
  const read = useResearchRead(
    (signal) => researchApi("chatTurn", { params: { id: turnId }, signal }),
    `library-message-turn:${turnId}`,
    open,
  );
  const turn = read.data?.data;
  return (
    <details
      className="library-message-facts"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary>来源与回复状态</summary>
      {read.error && <p role="status">{read.error}</p>}
      {turn && (
        <>
          {turn.outputMessageId === messageId && turn.libraryRead && (
            <ResearchReadSummary read={turn.libraryRead} />
          )}
          <ResearchTurnStatus turn={turn} compact />
        </>
      )}
    </details>
  );
}
