import { useEffect, useRef, useState } from "react";
import { Button, Drawer, Input, Modal, Spin } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import type { ChatMessage } from "@research-agent-platform/contracts";
import { IMSDK } from "@/layout/MainContentWrap";
import { useConversationStore } from "@/store";
import { useResearchStore } from "@/research/store";
import { researchApi } from "@/research/api";
import {
  useAgentChatOperation,
  type AgentChatOperation,
} from "@/research/useAgentChatOperation";
import { withRequestDeadline } from "@/research/request-deadline";
import {
  readableMessage,
  selectChatReply,
  selectCanonicalChatReply,
} from "@/research/chat-reply";
import SafeMessageMarkdown from "@/research/SafeMessageMarkdown";
import type { MessageItem } from "@openim/wasm-client-sdk";
import { formatMessageTime } from "@/utils/imCommon";

type Result = {
  id: string;
  text: string;
  sender: string;
  time: number;
  native?: MessageItem;
};
export default function HistorySearch({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const conversation = useConversationStore((s) => s.currentConversation);
  const generation = useResearchStore((s) => s.generation);
  const mapping = useResearchStore((s) =>
    s.mappings.find((m) => m.imConversationID === conversation?.conversationID),
  );
  const contacts = useResearchStore((s) => s.contacts);
  const capture = useAgentChatOperation();
  const operation = useRef<AgentChatOperation>();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [cursor, setCursor] = useState<string | null>();
  const [page, setPage] = useState(1);
  const [localMore, setLocalMore] = useState(false);
  const [scanned, setScanned] = useState(0);
  const [selected, setSelected] = useState<Result>();
  const cursorRef = useRef<string | null>();
  const epoch = useRef(0);
  const busyRef = useRef(false);
  const visible = useRef(open);
  visible.current = open;
  const isScopeCurrent = () =>
    visible.current &&
    generation === useResearchStore.getState().generation &&
    conversation?.conversationID ===
      useConversationStore.getState().currentConversation?.conversationID;
  const close = () => {
    visible.current = false;
    epoch.current++;
    operation.current?.dispose();
    setSelected(undefined);
    onClose();
  };
  useEffect(() => {
    epoch.current++;
    operation.current?.dispose();
    busyRef.current = false;
    setQuery("");
    setSearched("");
    setResults([]);
    setErrors([]);
    setBusy(false);
    setSelected(undefined);
    setCursor(undefined);
    setPage(1);
    setScanned(0);
    setLocalMore(false);
    cursorRef.current = undefined;
    return () => {
      epoch.current++;
      operation.current?.dispose();
    };
  }, [open, conversation?.conversationID, mapping?.researchConversationId, generation]);
  const canonicalResult = (message: ChatMessage): Result => ({
    id: `canonical:${message.id}`,
    text: message.text || "",
    sender:
      contacts.find((c) => c.contact.id === message.senderContactId)?.contact
        .displayName ||
      (message.origin === "model"
        ? "Agent"
        : message.origin === "service"
        ? "系统"
        : "成员"),
    time: Date.parse(message.createdAt),
  });
  const search = async (more = false) => {
    const term = (more ? searched : query).trim();
    if (!isScopeCurrent() || !term || !conversation || busyRef.current) return;
    busyRef.current = true;
    operation.current?.dispose();
    const scoped = capture();
    operation.current = scoped;
    const requestEpoch = ++epoch.current;
    const current = () =>
      isScopeCurrent() && scoped.isCurrent() && requestEpoch === epoch.current;
    setBusy(true);
    setErrors([]);
    setSearched(term);
    if (!more) {
      setResults([]);
      setScanned(0);
      setSelected(undefined);
      cursorRef.current = undefined;
      setCursor(undefined);
    }
    const localPage = more ? page : 1;
    const found: Result[] = [];
    const failures: string[] = [];
    await Promise.allSettled([
      (async () => {
        if (more && !localMore) return;
        try {
          const response = await withRequestDeadline(
            () =>
              IMSDK.searchLocalMessages({
                conversationID: conversation.conversationID,
                keywordList: [term],
                pageIndex: localPage,
                count: 30,
              }),
            30000,
            scoped.signal,
          );
          if (!current()) return;
          const messages =
            response.data.searchResultItems?.flatMap((item) => item.messageList) || [];
          found.push(
            ...messages.flatMap((message) => {
              const text = readableMessage(message);
              return text.toLocaleLowerCase().includes(term.toLocaleLowerCase())
                ? [
                    {
                      id: `native:${message.clientMsgID}`,
                      text,
                      sender: message.senderNickname || "成员",
                      time: message.sendTime,
                      native: message,
                    },
                  ]
                : [];
            }),
          );
          setLocalMore(localPage * 30 < response.data.totalCount);
          setPage(localPage + 1);
        } catch {
          if (current()) failures.push("本机聊天记录暂无法搜索，请重试。");
        }
      })(),
      (async () => {
        if (!mapping || (more && cursorRef.current === null)) return;
        try {
          let next = more ? cursorRef.current : undefined;
          for (let batch = 0; batch < 5; batch++) {
            if (!current()) return;
            const response = await researchApi("chatMessages", {
              params: { id: mapping.researchConversationId },
              query: { limit: 100, ...(next ? { cursor: next } : {}) },
              signal: scoped.signal,
            });
            if (!current()) return;
            setScanned((previous) => previous + response.data.length);
            found.push(
              ...response.data
                .filter((message) =>
                  message.text?.toLocaleLowerCase().includes(term.toLocaleLowerCase()),
                )
                .map(canonicalResult),
            );
            next = response.nextCursor;
            cursorRef.current = next;
            setCursor(next);
            if (!next) break;
          }
          if (!current()) return;
          cursorRef.current = next;
          setCursor(next);
        } catch {
          if (current())
            failures.push("Agent / 协作历史暂无法读取，请重试。已找到的结果保留。");
        }
      })(),
    ]);
    if (current()) {
      setResults((previous) =>
        Array.from(
          new Map(
            [...(more ? previous : []), ...found].map((item) => [item.id, item]),
          ).values(),
        ).sort((a, b) => b.time - a.time),
      );
      setErrors(failures);
      setBusy(false);
      busyRef.current = false;
    }
    scoped.dispose();
  };
  return (
    <>
      <Drawer
        title="查找聊天内容"
        open={open}
        onClose={close}
        width={360}
        rootClassName="desktop-chat-drawer"
      >
        <Input.Search
          autoFocus
          placeholder="输入文字查找"
          aria-label="查找聊天内容"
          value={query}
          maxLength={200}
          onChange={(event) => setQuery(event.target.value)}
          onSearch={() => void search()}
          enterButton={<SearchOutlined />}
          loading={busy}
        />
        <p className="desktop-history-scope">
          搜索本机聊天记录
          {mapping ? `与已授权的 Agent / 协作历史（已检索 ${scanned} 条）` : ""}。
          {cursor || localMore ? "还有历史未检索，可继续搜索。" : ""}
        </p>
        {errors.map((error) => (
          <p key={error} role="alert" className="desktop-chat-error">
            {error}
          </p>
        ))}
        {!busy && searched && !results.length && !errors.length && (
          <p className="desktop-history-empty">本次已检索范围内没有匹配内容。</p>
        )}
        <div className="desktop-history-results">
          {results.map((result) => (
            <button
              type="button"
              key={result.id}
              onClick={() => {
                if (isScopeCurrent()) setSelected(result);
              }}
            >
              <div>
                <strong>{result.sender}</strong>
                <time>{formatMessageTime(result.time)}</time>
              </div>
              <p>{result.text}</p>
            </button>
          ))}
        </div>
        {busy && (
          <div className="desktop-history-empty">
            <Spin size="small" /> 正在查找…
          </div>
        )}
        {searched && (cursor || localMore || errors.length > 0) && (
          <Button
            disabled={busy}
            onClick={() => void search(errors.length ? false : true)}
          >
            {errors.length ? "重新搜索" : "继续搜索历史"}
          </Button>
        )}
      </Drawer>
      <Modal
        title={
          selected
            ? `${selected.sender} · ${formatMessageTime(selected.time)}`
            : "聊天内容"
        }
        open={!!selected}
        onCancel={() => setSelected(undefined)}
        footer={
          <Button
            type="primary"
            onClick={() => {
              if (!selected || !isScopeCurrent()) return;
              if (selected.native)
                selectChatReply(
                  selected.native,
                  selected.text,
                  conversation?.conversationID,
                  generation,
                );
              else
                selectCanonicalChatReply(
                  selected.text,
                  selected.sender,
                  conversation?.conversationID,
                  generation,
                );
              setSelected(undefined);
              close();
            }}
          >
            引用回复
          </Button>
        }
        className="desktop-history-message"
      >
        {selected && <SafeMessageMarkdown text={selected.text} />}
      </Modal>
    </>
  );
}
