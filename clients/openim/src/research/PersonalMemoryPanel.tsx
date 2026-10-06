import { Alert, Button, Checkbox, Input, Modal, Select, Space, Tag } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { PersonalMemory } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";

const origins = { explicit: "你明确保存", feedback: "来自你的纠正", inferred: "助理提出的候选" };
const statuses = { confirmed: "已确认", candidate: "待你确认", revoked: "已移除" };

export function PersonalMemoryPanel({ active }: { active: boolean }) {
  const operation = usePersonalOperation(active, "personal-memory");
  const list = useResearchRead(() => researchApi("personalMemories", { query: { status: "all", limit: 100 } }), "personal-memory", active);
  const settings = useResearchRead(() => researchApi("personalMemorySettings"), "personal-memory-settings", active);
  const [topic, setTopic] = useState(""), [content, setContent] = useState("");
  const [memoryScope, setMemoryScope] = useState<"general" | "topic">("general");
  const [editing, setEditing] = useState<PersonalMemory>();
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(""), [saved, setSaved] = useState("");
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    setTopic(""); setContent(""); setMemoryScope("general"); setEditing(undefined);
    setBusy(false); inFlight.current = false; setFailure(""); setSaved("");
  }, [operation.scope]);
  const run = async (request: () => Promise<unknown>, clearForm = false) => {
    if (inFlight.current || !active || !list.data || !settings.data) return;
    const current = operation.capture(); inFlight.current = true; setBusy(true); setFailure(""); setSaved("");
    try {
      await request(); if (!current.isCurrent()) return;
      if (clearForm) { setTopic(""); setContent(""); setEditing(undefined); }
      await Promise.all([list.refresh(), settings.refresh()]);
      if (current.isCurrent()) setSaved("已更新，后续聊天以当前已确认的记忆为准。");
    } catch (error) {
      if (current.isCurrent()) { setFailure(error instanceof Error ? error.message : "操作未完成，请稍后重试。"); await list.refresh(); }
    } finally { if (current.isCurrent()) { inFlight.current = false; setBusy(false); } }
  };
  const decision = (memory: PersonalMemory, value: "confirm" | "revoke") => {
    const current = operation.capture();
    const submit = () => current.isCurrent() ? run(() => researchApi("decidePersonalMemory", {
      params: { id: memory.id }, body: { expectedVersion: memory.version, decision: value },
    })) : undefined;
    if (value === "revoke") Modal.confirm({ title: "移除这条长期记忆？", content: "历史记录保留；之后的聊天不再使用这条偏好。", onOk: submit });
    else void submit();
  };
  const ready = !!list.data && !!settings.data && active;
  return <section className="space-y-4" aria-label="我的长期记忆">
    <p className="text-sm leading-6 text-slate-600">这些偏好属于你，用于你自己的本地 Agent 聊天，与单个 Agent 的私有记忆分开。不会转发给外部文字服务。候选只有经你确认才使用。</p>
    {(list.error || settings.error || failure) && <Alert type="error" message={failure || list.error || settings.error} />}
    {!ready && !list.error && !settings.error && <p role="status">正在读取你的记忆…</p>}
    {saved && <p role="status" className="text-sm text-blue-700">{saved}</p>}
    <Checkbox disabled={!ready || busy} checked={settings.data?.data.candidateLearning || false} onChange={event => {
      const value = settings.data?.data; if (!value) return;
      void run(() => researchApi("updatePersonalMemorySettings", { body: { expectedVersion: value.version, candidateLearning: event.target.checked, timeZone: value.timeZone, quietHours: value.quietHours } }));
    }}>允许助理提出记忆候选</Checkbox>
    <p className="text-xs text-slate-500">默认关闭；开启后仍需你逐条确认，不会自动分析或保存你的性格。</p>
    {list.data?.data.map(memory => <article key={memory.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2"><strong className="break-words text-sm">{memory.topic}</strong><Tag className="!m-0">{statuses[memory.status]}</Tag></div>
      <p className="whitespace-pre-wrap break-words text-sm leading-6">{memory.content}</p>
      <p className="text-xs text-slate-500">{origins[memory.origin]} · {memory.scope === "general" ? "通用偏好" : "相关主题"}</p>
      <Space wrap>
        {memory.allowedActions.includes("confirm") && <Button size="small" disabled={busy} onClick={() => decision(memory, "confirm")}>确认这条偏好</Button>}
        {memory.allowedActions.includes("edit") && <Button size="small" disabled={busy} onClick={() => { setEditing(memory); setTopic(memory.topic); setContent(memory.content); setMemoryScope(memory.scope); setSaved(""); }}>修改</Button>}
        {memory.allowedActions.includes("revoke") && <Button size="small" danger disabled={busy} onClick={() => decision(memory, "revoke")}>移除</Button>}
      </Space>
      <details className="text-xs text-slate-500"><summary>来源详情</summary><p>来源：{origins[memory.origin]}；更新于 {new Date(memory.updatedAt).toLocaleString()}；版本 {memory.version}。</p>{memory.sourceMessageId && <p className="break-all">来源消息：{memory.sourceMessageId}</p>}</details>
    </article>)}
    {list.data && !list.data.data.length && <p className="text-sm text-slate-500">还没有长期记忆。可以说“记住，我喜欢先看结论”，或在下面明确保存。</p>}
    {list.data?.nextCursor && <p className="text-xs text-slate-500">当前显示最近 100 条记录；更早记录仍保留。</p>}
    <div className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">{editing ? "修改偏好" : "明确保存一条偏好"}</h3>
      <Input aria-label="偏好主题" placeholder="主题，例如回答方式" maxLength={80} value={topic} disabled={!ready || busy} onChange={e => setTopic(e.target.value)} />
      <Input.TextArea aria-label="长期偏好内容" placeholder="例如：回答时先给结论，再给必要依据。" maxLength={1000} rows={3} value={content} disabled={!ready || busy} onChange={e => setContent(e.target.value)} />
      <Select aria-label="偏好应用范围" className="w-full" value={memoryScope} disabled={!ready || busy} onChange={setMemoryScope} options={[{ value: "general", label: "通用偏好" }, { value: "topic", label: "仅相关主题" }]} />
      <Space wrap><Button type="primary" loading={busy} disabled={!ready || !topic.trim() || !content.trim()} onClick={() => void run(() => editing ? researchApi("updatePersonalMemory", { params: { id: editing.id }, body: { expectedVersion: editing.version, topic, content, scope: memoryScope } }) : researchApi("createPersonalMemory", { body: { topic, content, scope: memoryScope } }), true)}>{editing ? "保存修改" : "保存偏好"}</Button>
        {editing && <Button disabled={busy} onClick={() => { setEditing(undefined); setTopic(""); setContent(""); }}>取消修改</Button>}
      </Space>
    </div>
  </section>;
}
