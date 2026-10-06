import { Alert, App, Button, Checkbox, Input, Select, Space, Tag } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { PersonalMemory, PersonalMemorySettings } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";

const origins = { explicit: "你明确保存", feedback: "来自你的纠正", inferred: "助理提出的候选" };
const statuses = { confirmed: "已确认", candidate: "待你确认", revoked: "已移除" };

export function PersonalMemoryPanel({ active }: { active: boolean }) {
  const { modal } = App.useApp();
  const operation = usePersonalOperation(active, "personal-memory");
  const [filter, setFilter] = useState<"all" | "confirmed" | "candidate" | "revoked">("confirmed");
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const list = useResearchRead(() => researchApi("personalMemories", { query: { status: filter, limit: 30, cursor } }), `personal-memory:${operation.scope}:${filter}:${cursor || ""}`, active);
  const settings = useResearchRead(() => researchApi("personalMemorySettings"), "personal-memory-settings", active);
  const [policy, setPolicy] = useState<PersonalMemorySettings>();
  const [topic, setTopic] = useState(""), [content, setContent] = useState("");
  const [memoryScope, setMemoryScope] = useState<"general" | "topic">("general");
  const [editing, setEditing] = useState<PersonalMemory>();
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(""), [saved, setSaved] = useState("");
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    setTopic(""); setContent(""); setMemoryScope("general"); setEditing(undefined);
    setFilter("confirmed"); setPages([undefined]); setPolicy(undefined);
    setBusy(false); inFlight.current = false; setFailure(""); setSaved("");
  }, [operation.scope]);
  useLayoutEffect(() => { if (active && settings.data && !policy) setPolicy(settings.data.data); }, [active, settings.data, policy]);
  const run = async (request: () => Promise<unknown>, clearForm = false, success = "已更新，后续聊天以当前已确认的记忆为准。") => {
    if (inFlight.current || !active || !list.data || !settings.data) return;
    const current = operation.capture(); inFlight.current = true; setBusy(true); setFailure(""); setSaved("");
    try {
      await request(); if (!current.isCurrent()) return;
      if (clearForm) { setTopic(""); setContent(""); setEditing(undefined); }
      await Promise.all([list.refresh(), settings.refresh()]);
      if (current.isCurrent()) setSaved(success);
    } catch (error) {
      if (current.isCurrent()) { setFailure(error instanceof Error ? error.message : "操作未完成，请稍后重试。"); await list.refresh(); }
    } finally { if (current.isCurrent()) { inFlight.current = false; setBusy(false); } }
  };
  const decision = (memory: PersonalMemory, value: "confirm" | "revoke") => {
    const current = operation.capture();
    const submit = () => current.isCurrent() ? run(() => researchApi("decidePersonalMemory", {
      params: { id: memory.id }, body: { expectedVersion: memory.version, decision: value },
    })) : undefined;
    modal.confirm(value === "revoke" ? { title: "移除这条长期记忆？", content: "历史记录保留；之后的聊天不再使用这条偏好。", okText: "确定", cancelText: "取消", onOk: submit } : {
      title: "确认这条偏好？", content: `确认“${memory.topic}”后，将替代同主题的旧记忆。请先核对内容；不会同时保留两条冲突偏好用于回答。`, okText: "确定", cancelText: "取消", onOk: submit,
    });
  };
  const ready = !!list.data && !!settings.data && active;
  return <section className="space-y-4" aria-label="我的长期记忆">
    <p className="text-sm leading-6 text-slate-600">这些偏好属于你，与单个 Agent 的私有记忆分开。仅用于你自己的站内 Agent 私聊；群聊、他人的 Agent、接入的外部 Agent 不使用这些记忆。候选只有经你确认才使用。</p>
    {(list.error || settings.error || failure) && <Alert type="error" message={failure || list.error || settings.error} />}
    {!ready && !list.error && !settings.error && <p role="status">正在读取你的记忆…</p>}
    {saved && <p role="status" className="text-sm text-blue-700">{saved}</p>}
    <details className="space-y-3 rounded-lg border border-slate-200 p-3">
      <summary className="cursor-pointer text-sm font-semibold">记忆与提醒设置</summary>
      <Checkbox disabled={!ready || !policy || busy} checked={policy?.candidateLearning || false} onChange={event => setPolicy(value => value && ({ ...value, candidateLearning: event.target.checked }))}>允许助理提出记忆候选</Checkbox>
      <p className="text-xs text-slate-500">默认关闭；开启后仍需你逐条确认，不会自动分析或保存你的性格。</p>
      <label className="block text-sm">默认提醒时区<Input aria-label="默认提醒时区" placeholder="Asia/Shanghai" value={policy?.timeZone || ""} disabled={!ready || !policy || busy} onChange={e => setPolicy(value => value && ({ ...value, timeZone: e.target.value }))} /></label>
      <p className="text-xs text-slate-500">在聊天中说“明天九点”时使用这个时区。手工跟进可以另选时区。</p>
      <Checkbox disabled={!ready || !policy || busy} checked={!!policy?.quietHours} onChange={e => setPolicy(value => value && ({ ...value, quietHours: e.target.checked ? { start: "22:00", end: "08:00" } : null }))}>默认安静时段</Checkbox>
      {policy?.quietHours && <div className="flex flex-wrap items-center gap-2"><Input className="!w-28" type="time" aria-label="默认安静时段开始" value={policy.quietHours.start} disabled={busy} onChange={e => setPolicy(value => value?.quietHours ? ({ ...value, quietHours: { ...value.quietHours, start: e.target.value } }) : value)} /><span>至</span><Input className="!w-28" type="time" aria-label="默认安静时段结束" value={policy.quietHours.end} disabled={busy} onChange={e => setPolicy(value => value?.quietHours ? ({ ...value, quietHours: { ...value.quietHours, end: e.target.value } }) : value)} /></div>}
      <Space wrap><Button size="small" disabled={!ready || !policy || busy} onClick={() => {
        if (!policy) return;
        const current = operation.capture();
        void run(async () => {
          try { new Intl.DateTimeFormat("zh-CN", { timeZone: policy.timeZone }).format(); } catch { throw new Error("请填写有效时区，例如 Asia/Shanghai。"); }
          if (policy.quietHours && (!policy.quietHours.start || !policy.quietHours.end || policy.quietHours.start === policy.quietHours.end)) throw new Error("安静时段的开始和结束时间不能相同。");
          const response = await researchApi("updatePersonalMemorySettings", { body: { expectedVersion: policy.version, candidateLearning: policy.candidateLearning, timeZone: policy.timeZone, quietHours: policy.quietHours } });
          if (current.isCurrent()) setPolicy(response.data);
        }, false, "设置已保存，之后的自然提醒使用默认时区和安静时段。");
      }}>保存设置</Button><Button size="small" disabled={!ready || busy} onClick={() => {
        const current = operation.capture();
        void run(async () => { const response = await researchApi("personalMemorySettings"); if (current.isCurrent()) setPolicy(response.data); }, false, "已重新读取当前设置。");
      }}>重新读取设置</Button></Space>
    </details>
    <Select aria-label="记忆状态筛选" className="w-full" value={filter} disabled={busy} onChange={value => { setFilter(value); setPages([undefined]); }} options={[{ value: "confirmed", label: "已确认的偏好" }, { value: "candidate", label: "待确认的候选" }, { value: "revoked", label: "已移除的记录" }, { value: "all", label: "全部记录" }]} />
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
    {list.data && !list.data.data.length && <p className="text-sm text-slate-500">此分类暂无记录。可以说“记住，我喜欢先看结论”，或在下面明确保存。</p>}
    {(pages.length > 1 || list.data?.nextCursor) && <Space><Button size="small" disabled={busy || !list.data || pages.length <= 1} onClick={() => setPages(value => value.slice(0, -1))}>上一页</Button><Button size="small" disabled={busy || !list.data?.nextCursor} onClick={() => { if (list.data?.nextCursor) setPages(value => [...value, list.data!.nextCursor!]); }}>更多记忆</Button><span className="text-xs text-slate-500">第 {pages.length} 页</span></Space>}
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
