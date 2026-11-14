import { Alert, Button, Input, Popconfirm, Space } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { PersonalMemory } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
import {
  generalHabits,
  MemoryText,
  memoryOrigins,
} from "./memory-presentation";
import "./personal-memory.scss";
export function AssistantPreferences({
  contactId,
  showPrivate = true,
}: {
  contactId: string;
  showPrivate?: boolean;
}) {
  const personal = useResearchRead(
    (signal) =>
      researchApi("personalMemories", {
        query: { status: "confirmed", limit: 100 },
        signal,
      }),
    contactId,
    true,
    { poll: false }
  );
  const agent = useResearchRead(
    (signal) =>
      researchApi("chatMemories", {
        query: { scope: "private_agent", scopeId: contactId, limit: 100 },
        signal,
      }),
    contactId,
    showPrivate,
    { poll: false }
  );
  const operation = usePersonalOperation(true, "assistant-habits:" + contactId);
  const lock = useRef(false);
  const saveEpoch = useRef(0);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [editing, setEditing] = useState<PersonalMemory>();
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  useLayoutEffect(() => {
    saveEpoch.current++;
    setEditing(undefined);
    setDraft("");
    setSearch("");
    setFailure("");
    setBusy(false);
    lock.current = false;
  }, [operation.scope]);
  const save = async (memory: PersonalMemory, forget: boolean) => {
    const op = operation.capture();
    if (lock.current || !op.isCurrent()) return;
    const ticket = ++saveEpoch.current;
    lock.current = true;
    setBusy(true);
    setFailure("");
    try {
      if (forget) {
        await researchApi("decidePersonalMemory", {
          params: { id: memory.id },
          body: { expectedVersion: memory.version, decision: "revoke" },
        });
      } else {
        await researchApi("updatePersonalMemory", {
          params: { id: memory.id },
          body: {
            expectedVersion: memory.version,
            topic: memory.topic,
            scope: memory.scope,
            content: draft.trim(),
          },
        });
      }
      if (op.isCurrent()) {
        setEditing(undefined);
        await personal.refreshChecked();
      }
    } catch (error) {
      if (op.isCurrent()) {
        setFailure(
          error instanceof Error
            ? error.message
            : "习惯未能更新，请刷新后再试。"
        );
        await personal.refresh();
      }
    } finally {
      if (ticket === saveEpoch.current) lock.current = false;
      if (op.isCurrent()) setBusy(false);
    }
  };
  const matches = (text: string) =>
    text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
  const habits = generalHabits(personal.data?.data ?? []).filter((memory) =>
    matches(`${memory.topic} ${memory.content}`)
  );
  const privateMemories = (agent.data?.data ?? []).filter(
    (memory) =>
      memory.status === "active" &&
      matches(`${memory.content} ${memory.source || ""}`)
  );
  return (
    <section className="assistant-preferences" aria-label="助理使用的习惯">
      <header>
        <h3>我的通用习惯</h3>
        <p>用于你自己的本站助理私聊，与这位助理的专属记忆分别保存。</p>
      </header>
      <Input
        aria-label="搜索助理使用的习惯"
        placeholder="搜索习惯"
        value={search}
        allowClear
        onChange={(event) => setSearch(event.target.value)}
      />
      {habits.map((m) => (
        <article className="assistant-habit-row" key={m.id}>
          <strong>{m.topic}</strong>
          {editing?.id === m.id ? (
            <>
              <Input.TextArea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                aria-label="修改习惯"
                autoFocus
                maxLength={1000}
                autoSize
              />
              <Space>
                <Button
                  type="primary"
                  size="small"
                  loading={busy}
                  disabled={!draft.trim()}
                  onClick={() => void save(editing, false)}
                >
                  保存
                </Button>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() => setEditing(undefined)}
                >
                  取消
                </Button>
              </Space>
            </>
          ) : (
            <>
              <MemoryText text={m.content} />
              <p className="habit-row-meta">
                {memoryOrigins[m.origin]} ·{" "}
                {new Date(m.updatedAt).toLocaleDateString("zh-CN")}
              </p>
              {m.allowedActions.includes("edit") && (
                <Button
                  type="link"
                  size="small"
                  disabled={busy}
                  onClick={() => {
                    setEditing(m);
                    setDraft(m.content);
                    setFailure("");
                  }}
                >
                  修改
                </Button>
              )}
              {m.allowedActions.includes("revoke") && (
                <Popconfirm
                  title="忘记这条习惯？"
                  okText="忘记"
                  cancelText="取消"
                  onConfirm={() => save(m, true)}
                >
                  <Button type="text" size="small" disabled={busy}>
                    忘记
                  </Button>
                </Popconfirm>
              )}
            </>
          )}
        </article>
      ))}
      {personal.data && !habits.length && (
        <p className="habit-row-meta">
          {search.trim() ? "没有匹配的通用习惯。" : "尚无已保存的通用习惯。"}
        </p>
      )}
      {showPrivate && (
        <section
          className="assistant-private-habits"
          aria-label="这位助理的专属记忆"
        >
          <h3>仅这位助理</h3>
          <p className="habit-row-meta">只在你与这位助理的私人交流中使用。</p>
          {privateMemories.map((memory) => (
            <article className="assistant-habit-row" key={memory.id}>
              <MemoryText text={memory.content} />
              <p className="habit-row-meta">
                {memory.source || "未填写来源"} ·{" "}
                {new Date(memory.updatedAt).toLocaleDateString("zh-CN")}
              </p>
            </article>
          ))}
          {agent.data && !privateMemories.length && (
            <p className="habit-row-meta">
              {search.trim()
                ? "没有匹配的专属记忆。"
                : "这位助理尚未单独保存记忆；上方通用习惯仍可按范围使用。"}
            </p>
          )}
        </section>
      )}
      {failure && <Alert type="error" message={failure} />}
      {(agent.error || personal.error) && (
        <p role="status">
          部分习惯暂时无法读取。
          <Button
            type="link"
            onClick={() => {
              void personal.refresh();
              if (showPrivate) void agent.refresh();
            }}
          >
            重试
          </Button>
        </p>
      )}
      {!personal.data && !personal.error && (
        <p role="status" className="habit-row-meta">
          正在读取通用习惯…
        </p>
      )}
    </section>
  );
}
