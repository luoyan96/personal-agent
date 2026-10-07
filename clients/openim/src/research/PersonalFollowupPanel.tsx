import { Alert, App, Button, Checkbox, Input, InputNumber, Select, Space, Tag } from "antd";
import { ClockCircleOutlined, PlusOutlined } from "@ant-design/icons";
import { useLayoutEffect, useRef, useState } from "react";
import type { PersonalFollowup, PersonalFollowupRun } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchStore } from "./store";
import { useResearchContactChat } from "./useResearchContactChat";
import { personalDueInput, personalDueInstant, personalDueLabel } from "./personal-time";

export const followupDeliveryLabel: Record<PersonalFollowup["delivery"], string> = {
  scheduled: "等待到期", due: "等待服务处理", recorded: "已写入聊天", im_sent: "已交即时通信服务",
  im_uncertain: "投递待核对", im_denied: "已停止投递",
};
const states = { active: "进行中", paused: "已暂停", completed: "已结束", cancelled: "已取消" };
const actions = { pause: "暂停", resume: "恢复", complete: "结束", cancel: "取消任务" };
const runStates: Record<PersonalFollowupRun["status"], string> = { recorded: "提醒已发出", queued: "等待执行", running: "正在执行", waiting_input: "需要补充信息", succeeded: "已回复", unavailable: "模型不可用", failed: "执行失败", interrupted: "已中断", cancelled: "已停止", skipped: "本次未执行" };
const reasons: Record<string, string> = { MODEL_UNAVAILABLE: "请在模型设置中启用可用模型", AGENT_BUSY: "Agent 正在处理其他消息，本次跳过", BUDGET_EXCEEDED: "本次任务超过预算", MODEL_FAILED: "模型请求失败", TIMEOUT: "模型回复超时", AUTHORITY_CHANGED: "授权已变化", INPUT_CHANGED: "输入或设置已变化", LEASE_EXPIRED_USAGE_UNCERTAIN: "执行中断，用量待核对" };
const weekOptions = [1, 2, 3, 4, 5, 6, 7].map(value => ({ value, label: `周${"一二三四五六日"[value - 1]}` }));
function weekday(due: string) { return due ? new Date(`${due.slice(0, 10)}T00:00:00Z`).getUTCDay() || 7 : 1; }
export function followupRepeatLabel(item: PersonalFollowup) { return !item.recurrence ? "仅一次" : item.recurrence.frequency === "daily" ? "每天" : `每周${item.recurrence.weekdays.map(n => "一二三四五六日"[n - 1]).join("、")}`; }

function RunHistory({ item, active }: { item: PersonalFollowup; active: boolean }) {
  const [expanded, setExpanded] = useState(false), [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const read = useResearchRead(() => researchApi("personalFollowupRuns", { params: { id: item.id }, query: { limit: 10, cursor } }), `schedule-runs:${item.id}:${cursor || ""}`, active && expanded);
  return <div>
    <Button size="small" type="text" onClick={() => setExpanded(value => !value)}>{expanded ? "收起记录" : "运行记录"}</Button>
    {expanded && <div className="mt-2 space-y-2 rounded-lg bg-slate-50 p-3" aria-label="运行记录">
      {read.error && <Alert type="error" message={read.error} />}
      {!read.data && !read.error && <p role="status">正在读取记录…</p>}
      {read.data?.data.map(run => <div key={run.id} className="border-b border-slate-200 pb-2 text-xs last:border-0">
        <p>{personalDueLabel(run.scheduledAt, item.timeZone)} · {runStates[run.status]}</p>
        {run.failure && <p className="mt-1 text-amber-800">{reasons[run.failure] || `本次未完成（${run.failure}）`}</p>}
        {run.messageId && <p className="mt-1 text-slate-500">{followupDeliveryLabel[run.delivery]}</p>}
      </div>)}
      {read.data && !read.data.data.length && <p className="text-xs text-slate-500">首次到期后会在这里留下记录。</p>}
      {(pages.length > 1 || read.data?.nextCursor) && <Space><Button size="small" disabled={pages.length <= 1} onClick={() => setPages(v => v.slice(0, -1))}>上一页</Button><Button size="small" disabled={!read.data?.nextCursor} onClick={() => { if (read.data?.nextCursor) setPages(v => [...v, read.data!.nextCursor!]); }}>更多记录</Button></Space>}
    </div>}
  </div>;
}

export function PersonalFollowupPanel({ active }: { active: boolean }) {
  const { modal } = App.useApp();
  const operation = usePersonalOperation(active, "personal-followups"), openChat = useResearchContactChat();
  const contacts = useResearchStore(s => s.contacts), actorId = useResearchStore(s => s.actor?.member.id);
  const agents = contacts.map(entry => entry.contact).filter(contact => contact.identity.kind === "personal_agent" && contact.identity.ownerMemberId === actorId && !contact.agentRuntime);
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "completed" | "cancelled">("active");
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const list = useResearchRead(() => researchApi("personalFollowups", { query: { status: filter, limit: 30, cursor } }), `personal-followups:${operation.scope}:${filter}:${cursor || ""}`, active);
  const settings = useResearchRead(() => researchApi("personalMemorySettings"), "personal-followup-settings", active);
  const [body, setBody] = useState(""), [due, setDue] = useState(""), [zone, setZone] = useState("");
  const [editing, setEditing] = useState<PersonalFollowup>();
  const [formOpen, setFormOpen] = useState(false), [frequency, setFrequency] = useState<"once" | "daily" | "weekly">("once");
  const [weekdays, setWeekdays] = useState<number[]>([1]), [mode, setMode] = useState<"remind" | "agent">("remind"), [contactId, setContactId] = useState("");
  const [tokens, setTokens] = useState(4000), [seconds, setSeconds] = useState(90);
  const [quiet, setQuiet] = useState(false), [start, setStart] = useState("22:00"), [end, setEnd] = useState("08:00");
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(""), [saved, setSaved] = useState("");
  const inFlight = useRef(false), initialized = useRef(false);
  const clearForm = () => {
    setBody(""); setDue(""); setZone(""); setEditing(undefined); setFormOpen(false); setFrequency("once"); setMode("remind"); setContactId(""); setTokens(4000); setSeconds(90);
    setQuiet(!!settings.data?.data.quietHours); setStart(settings.data?.data.quietHours?.start || "22:00"); setEnd(settings.data?.data.quietHours?.end || "08:00");
  };
  useLayoutEffect(() => { clearForm(); setFilter("active"); setPages([undefined]); initialized.current = false; setBusy(false); inFlight.current = false; setFailure(""); setSaved(""); }, [operation.scope]);
  useLayoutEffect(() => {
    if (!active || !settings.data || initialized.current) return;
    initialized.current = true; setQuiet(!!settings.data.data.quietHours); setStart(settings.data.data.quietHours?.start || "22:00"); setEnd(settings.data.data.quietHours?.end || "08:00");
  }, [active, settings.data]);
  const ready = active && !!list.data && !!settings.data;
  const timeZone = zone || settings.data?.data.timeZone || "";
  const run = async (request: () => Promise<unknown>, reset = false, success = "安排已保存。你可以关闭客户端，到期结果会发回聊天。") => {
    if (!ready || inFlight.current) return;
    const current = operation.capture(); inFlight.current = true; setBusy(true); setFailure(""); setSaved("");
    try {
      await request(); if (!current.isCurrent()) return;
      if (reset) clearForm();
      await list.refresh(); if (current.isCurrent()) setSaved(success);
    } catch (error) { if (current.isCurrent()) { setFailure(error instanceof Error ? error.message : "未保存，请稍后重试。"); await list.refresh(); } }
    finally { if (current.isCurrent()) { inFlight.current = false; setBusy(false); } }
  };
  const stateChange = (item: PersonalFollowup, action: "pause" | "resume" | "complete" | "cancel") => {
    const current = operation.capture();
    const submit = () => current.isCurrent() ? run(() => researchApi("changePersonalFollowup", { params: { id: item.id }, body: { expectedVersion: item.version, action } }), false, `已${actions[action]}。`) : undefined;
    if (action === "complete" || action === "cancel") modal.confirm({ title: `${actions[action]}？`, content: "将停止后续安排和正在执行的定时任务，已有聊天与运行记录保留。", okText: "确定", cancelText: "返回", onOk: submit });
    else void submit();
  };
  const save = () => void run(() => {
    const dueAt = personalDueInstant(due, timeZone);
    if (Date.parse(dueAt) <= Date.now()) throw new Error("请选择未来的首次运行时间。");
    if (frequency === "weekly" && (!weekdays.length || !weekdays.includes(weekday(due)))) throw new Error("首次运行日期必须是已选择的星期，请调整日期或重复星期。");
    if (quiet && (!start || !end || start === end)) throw new Error("安静时段的开始和结束时间不能相同。");
    const selectedContact = contactId || agents.find(agent => agent.profile.role === "coordinator")?.id;
    if (mode === "agent" && !agents.some(agent => agent.id === selectedContact)) throw new Error("请选择你自己的站内 Agent。");
    const fields = { title: body.trim().slice(0, 200), body, dueAt, timeZone, task: editing?.task || null, quietHours: quiet ? { start, end } : null,
      recurrence: frequency === "once" ? null : frequency === "daily" ? { frequency: "daily" as const } : { frequency: "weekly" as const, weekdays: [...weekdays].sort((a, b) => a - b) },
      execution: mode === "agent" ? { kind: "agent" as const, contactId: selectedContact!, budget: { maxTokens: tokens, maxSeconds: seconds } } : null };
    return editing ? researchApi("updatePersonalFollowup", { params: { id: editing.id }, body: { ...fields, expectedVersion: editing.version } }) : researchApi("createPersonalFollowup", { body: fields });
  }, true);
  return <section className="space-y-4" aria-label="定时任务与提醒">
    <div className="flex items-start justify-between gap-3">
      <div><h3 className="m-0 text-lg font-semibold">让助理到点帮你做事</h3><p className="mt-1 text-sm text-slate-500">一次、每天或每周。结果回到聊天，随时可以暂停。</p></div>
      <Button type="primary" aria-label="新建定时任务" icon={<PlusOutlined />} disabled={!ready || busy} onClick={() => { clearForm(); setFormOpen(true); }}>新建</Button>
    </div>
    <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-600">也可以直接说：“每天上午九点提醒我整理待办”或“每周五下午六点帮我总结最近的聊天”。</p>
    {(list.error || settings.error || failure) && <Alert type="error" message={failure || list.error || settings.error} />}
    {!ready && !list.error && !settings.error && <p role="status">正在读取定时任务…</p>}
    {saved && <p role="status" className="text-sm text-blue-700">{saved}</p>}
    {formOpen && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/30 p-4" aria-label="设置定时任务">
      <h3 className="font-semibold">{editing ? "修改安排" : "新建安排"}</h3>
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">到点做什么<Select aria-label="到点做什么" className="mt-1 w-full" value={mode} disabled={busy} onChange={setMode} options={[{ value: "remind", label: "提醒我" }, { value: "agent", label: "让 Agent 执行" }]} /></label>
      <label className="text-sm">重复<Select aria-label="重复频率" className="mt-1 w-full" value={frequency} disabled={busy} onChange={value => { setFrequency(value); if (value === "weekly") setWeekdays([weekday(due)]); }} options={[{ value: "once", label: "仅一次" }, { value: "daily", label: "每天" }, { value: "weekly", label: "每周" }]} /></label></div>
      {frequency === "weekly" && <Checkbox.Group aria-label="重复星期" options={weekOptions} value={weekdays} disabled={busy} onChange={value => setWeekdays(value.map(Number))} />}
      {mode === "agent" && <label className="block text-sm">执行的 Agent<Select aria-label="执行的 Agent" className="mt-1 w-full" value={contactId || agents.find(agent => agent.profile.role === "coordinator")?.id} disabled={busy} onChange={setContactId} options={agents.map(agent => ({ value: agent.id, label: agent.displayName }))} /></label>}
      <Input.TextArea aria-label="定时事项" placeholder={mode === "agent" ? "例如：根据最近的聊天整理待办，列出下一步" : "例如：整理今天的待办"} rows={3} maxLength={1000} showCount value={body} disabled={busy} onChange={e => setBody(e.target.value)} />
      <div className="grid grid-cols-2 gap-3"><label className="text-sm">首次运行<Input type="datetime-local" aria-label="首次运行" className="mt-1" value={due} disabled={busy} onChange={e => setDue(e.target.value)} /></label>
      <label className="text-sm">时区<Input aria-label="运行时区" className="mt-1" placeholder="Asia/Shanghai" value={timeZone} disabled={busy} onChange={e => setZone(e.target.value)} /></label></div>
      {mode === "agent" && <div className="space-y-2 rounded-lg bg-white p-3 text-xs text-slate-600">
        <p>使用当前模型设置，按指定 Agent 聊天中已有的文字生成结果。暂不支持联网查询或在后台读取本地文件夹。</p>
        <Space wrap><label>每次预算 <InputNumber aria-label="每次 Token 预算" min={1000} max={16000} step={1000} value={tokens} disabled={busy} onChange={value => setTokens(value || 4000)} /> Token</label><label><InputNumber aria-label="每次时间预算" min={10} max={120} value={seconds} disabled={busy} onChange={value => setSeconds(value || 90)} /> 秒</label></Space>
      </div>}
      <Checkbox checked={quiet} disabled={busy} onChange={e => setQuiet(e.target.checked)}>安静时段内延后处理</Checkbox>
      {quiet && <div className="flex flex-wrap items-center gap-2"><Input className="!w-28" type="time" aria-label="安静时段开始" value={start} disabled={busy} onChange={e => setStart(e.target.value)} /><span>至</span><Input className="!w-28" type="time" aria-label="安静时段结束" value={end} disabled={busy} onChange={e => setEnd(e.target.value)} /></div>}
      <Space><Button type="primary" loading={busy} disabled={!body.trim() || !due || !timeZone} onClick={save}>{editing ? "保存修改" : "保存安排"}</Button><Button disabled={busy} onClick={clearForm}>返回</Button></Space>
    </div>}
    <Select aria-label="任务状态筛选" className="w-full" value={filter} disabled={busy} onChange={value => { setFilter(value); setPages([undefined]); }} options={[{ value: "active", label: "进行中" }, { value: "paused", label: "已暂停" }, { value: "completed", label: "已结束" }, { value: "cancelled", label: "已取消" }, { value: "all", label: "全部安排" }]} />
    {list.data?.data.map(item => <article key={item.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
      <div className="flex items-start gap-2"><ClockCircleOutlined className="mt-1 text-blue-500" /><div className="min-w-0 flex-1"><strong className="break-words text-sm">{item.title}</strong><div className="mt-2 flex flex-wrap gap-1"><Tag className="!m-0" color={item.execution ? "blue" : undefined}>{item.execution ? "Agent 任务" : "提醒"}</Tag><Tag className="!m-0">{followupRepeatLabel(item)}</Tag><Tag className="!m-0">{states[item.status]}</Tag></div></div></div>
      {item.body !== item.title && <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>}
      <p className="text-sm text-slate-600">{item.status === "active" && (item.recurrence || !item.messageId) ? "下次：" : "安排时间："}{personalDueLabel(item.nextDeliveryAt, item.timeZone)}</p>
      {item.lastRun && <p className="text-xs text-slate-500">最近一次：{runStates[item.lastRun.status]}{item.lastRun.failure ? ` · ${reasons[item.lastRun.failure] || item.lastRun.failure}` : ""}</p>}
      {!item.lastRun && item.messageId && <p className="text-xs text-slate-500">{followupDeliveryLabel[item.delivery]}</p>}
      <Space wrap>
        {item.allowedActions.includes("edit") && <Button size="small" disabled={busy} onClick={() => { setEditing(item); setFormOpen(true); setBody(item.body); setZone(item.timeZone); setDue(personalDueInput(item.dueAt, item.timeZone)); setFrequency(item.recurrence?.frequency || "once"); setWeekdays(item.recurrence?.frequency === "weekly" ? item.recurrence.weekdays : [weekday(personalDueInput(item.dueAt, item.timeZone))]); setMode(item.execution ? "agent" : "remind"); setContactId(item.execution?.contactId || ""); setTokens(item.execution?.budget.maxTokens || 4000); setSeconds(item.execution?.budget.maxSeconds || 90); setQuiet(!!item.quietHours); setStart(item.quietHours?.start || "22:00"); setEnd(item.quietHours?.end || "08:00"); setSaved(""); }}>修改</Button>}
        {(["pause", "resume", "complete", "cancel"] as const).map(action => item.allowedActions.includes(action) && <Button key={action} size="small" danger={action === "cancel"} disabled={busy} onClick={() => stateChange(item, action)}>{actions[action]}</Button>)}
        {item.execution && <Button size="small" disabled={busy} onClick={() => { const current = operation.capture(); void run(() => openChat(item.execution!.contactId, current.isCurrent), false, ""); }}>打开聊天</Button>}
      </Space>
      <RunHistory item={item} active={active} />
    </article>)}
    {list.data && !list.data.data.length && <div className="py-6 text-center text-slate-500"><ClockCircleOutlined className="text-2xl" /><p className="mt-3 text-sm">这里还没有{filter === "active" ? "进行中的" : "这类"}安排</p><p className="mt-1 text-xs">在聊天里告诉助理，或点击“新建”。</p></div>}
    {(pages.length > 1 || list.data?.nextCursor) && <Space><Button size="small" disabled={busy || !list.data || pages.length <= 1} onClick={() => setPages(value => value.slice(0, -1))}>上一页</Button><Button size="small" disabled={busy || !list.data?.nextCursor} onClick={() => { if (list.data?.nextCursor) setPages(value => [...value, list.data!.nextCursor!]); }}>更多安排</Button><span className="text-xs text-slate-500">第 {pages.length} 页</span></Space>}
  </section>;
}
