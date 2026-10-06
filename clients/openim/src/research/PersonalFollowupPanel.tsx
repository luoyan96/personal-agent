import { Alert, App, Button, Checkbox, Input, Select, Space, Tag } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { PersonalFollowup } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import { personalDueInput, personalDueInstant, personalDueLabel } from "./personal-time";

export const followupDeliveryLabel: Record<PersonalFollowup["delivery"], string> = {
  scheduled: "等待到期", due: "已到期，等待服务处理", recorded: "已写入聊天，即时通信投递待确认",
  im_sent: "已交即时通信服务，未确认设备收到", im_uncertain: "即时通信投递状态待核对", im_denied: "即时通信投递未获准",
};
const states = { active: "进行中", paused: "已暂停", completed: "已完成", cancelled: "已取消" };
const actions = { pause: "暂停", resume: "恢复", complete: "完成", cancel: "取消跟进" };

export function PersonalFollowupPanel({ active }: { active: boolean }) {
  const { modal } = App.useApp();
  const operation = usePersonalOperation(active, "personal-followups");
  const [filter, setFilter] = useState<"all" | "active" | "paused" | "completed" | "cancelled">("active");
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const list = useResearchRead(() => researchApi("personalFollowups", { query: { status: filter, limit: 30, cursor } }), `personal-followups:${operation.scope}:${filter}:${cursor || ""}`, active);
  const settings = useResearchRead(() => researchApi("personalMemorySettings"), "personal-followup-settings", active);
  const [body, setBody] = useState(""), [due, setDue] = useState(""), [zone, setZone] = useState("");
  const [editing, setEditing] = useState<PersonalFollowup>();
  const [quiet, setQuiet] = useState(false), [start, setStart] = useState("22:00"), [end, setEnd] = useState("08:00");
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState(""), [saved, setSaved] = useState("");
  const inFlight = useRef(false);
  const initialized = useRef(false);
  useLayoutEffect(() => {
    setBody(""); setDue(""); setZone(""); setEditing(undefined); setQuiet(false);
    setFilter("active"); setPages([undefined]); initialized.current = false;
    setBusy(false); inFlight.current = false; setFailure(""); setSaved("");
  }, [operation.scope]);
  useLayoutEffect(() => {
    if (!active || !settings.data || initialized.current) return;
    initialized.current = true;
    setQuiet(!!settings.data.data.quietHours); setStart(settings.data.data.quietHours?.start || "22:00"); setEnd(settings.data.data.quietHours?.end || "08:00");
  }, [active, settings.data]);
  const ready = active && !!list.data && !!settings.data;
  const timeZone = zone || settings.data?.data.timeZone || "";
  const run = async (request: () => Promise<unknown>, clearForm = false) => {
    if (!ready || inFlight.current) return;
    const current = operation.capture(); inFlight.current = true; setBusy(true); setFailure(""); setSaved("");
    try {
      await request(); if (!current.isCurrent()) return;
      if (clearForm) { setBody(""); setDue(""); setZone(""); setEditing(undefined); setQuiet(!!settings.data?.data.quietHours); setStart(settings.data?.data.quietHours?.start || "22:00"); setEnd(settings.data?.data.quietHours?.end || "08:00"); }
      await list.refresh();
      if (current.isCurrent()) setSaved("跟进已更新。到期由服务端处理，不需要一直打开网页。");
    } catch (error) { if (current.isCurrent()) { setFailure(error instanceof Error ? error.message : "跟进未保存，请核对后重试。"); await list.refresh(); } }
    finally { if (current.isCurrent()) { inFlight.current = false; setBusy(false); } }
  };
  const stateChange = (item: PersonalFollowup, action: "pause" | "resume" | "complete" | "cancel") => {
    const current = operation.capture();
    const submit = () => current.isCurrent() ? run(() => researchApi("changePersonalFollowup", { params: { id: item.id }, body: { expectedVersion: item.version, action } })) : undefined;
    if (action === "complete" || action === "cancel") modal.confirm({ title: `${actions[action]}这条跟进？`, content: "此后不会再为该事项发出提醒；已有聊天记录保留。", okText: "确定", cancelText: "取消", onOk: submit });
    else void submit();
  };
  const save = () => void run(() => {
    const dueAt = personalDueInstant(due, timeZone);
    if (Date.parse(dueAt) <= Date.now()) throw new Error("请选择未来的提醒时间。");
    if (quiet && (!start || !end || start === end)) throw new Error("安静时段的开始和结束时间不能相同。");
    const fields = { title: body.trim().slice(0, 200), body, dueAt, timeZone, task: editing?.task || null, quietHours: quiet ? { start, end } : null };
    return editing ? researchApi("updatePersonalFollowup", { params: { id: editing.id }, body: { ...fields, expectedVersion: editing.version } }) : researchApi("createPersonalFollowup", { body: fields });
  }, true);
  return <section className="space-y-4" aria-label="我的跟进">
    <p className="text-sm leading-6 text-slate-600">提醒保存在服务端，到期写回个人助理聊天。网页关闭也会处理；写入聊天、即时通信投递和手机推送收到是不同状态。</p>
    {(list.error || settings.error || failure) && <Alert type="error" message={failure || list.error || settings.error} />}
    {!ready && !list.error && !settings.error && <p role="status">正在读取你的跟进…</p>}
    {saved && <p role="status" className="text-sm text-blue-700">{saved}</p>}
    <Select aria-label="跟进状态筛选" className="w-full" value={filter} disabled={busy} onChange={value => { setFilter(value); setPages([undefined]); }} options={[{ value: "active", label: "进行中的跟进" }, { value: "paused", label: "已暂停" }, { value: "completed", label: "已完成" }, { value: "cancelled", label: "已取消" }, { value: "all", label: "全部记录" }]} />
    <p className="text-xs text-slate-500">按安排投递时间从早到晚显示。</p>
    {list.data?.data.map(item => <article key={item.id} className="space-y-2 rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap gap-2"><strong className="break-words text-sm">{item.title}</strong><Tag className="!m-0">{states[item.status]}</Tag></div>
      {item.body !== item.title && <p className="whitespace-pre-wrap break-words text-sm">{item.body}</p>}
      <p className="text-sm">{personalDueLabel(item.dueAt, item.timeZone)}</p>
      <p className="text-xs text-slate-600">{followupDeliveryLabel[item.delivery]}</p>
      {item.nextDeliveryAt !== item.dueAt && <p className="text-xs text-slate-500">安排投递：{personalDueLabel(item.nextDeliveryAt, item.timeZone)}</p>}
      <Space wrap>
        {item.allowedActions.includes("edit") && <Button size="small" disabled={busy} onClick={() => { setEditing(item); setBody(item.body); setZone(item.timeZone); setDue(personalDueInput(item.dueAt, item.timeZone)); setQuiet(!!item.quietHours); setStart(item.quietHours?.start || "22:00"); setEnd(item.quietHours?.end || "08:00"); setSaved(""); }}>修改</Button>}
        {(["pause", "resume", "complete", "cancel"] as const).map(action => item.allowedActions.includes(action) && <Button key={action} size="small" danger={action === "cancel"} disabled={busy} onClick={() => stateChange(item, action)}>{actions[action]}</Button>)}
      </Space>
    </article>)}
    {list.data && !list.data.data.length && <p className="text-sm text-slate-500">此分类暂无跟进。可在聊天中明确说事项、日期和时间，或在下面填写。</p>}
    {(pages.length > 1 || list.data?.nextCursor) && <Space><Button size="small" disabled={busy || !list.data || pages.length <= 1} onClick={() => setPages(value => value.slice(0, -1))}>上一页</Button><Button size="small" disabled={busy || !list.data?.nextCursor} onClick={() => { if (list.data?.nextCursor) setPages(value => [...value, list.data!.nextCursor!]); }}>更多跟进</Button><span className="text-xs text-slate-500">第 {pages.length} 页</span></Space>}
    <div className="space-y-3 border-t pt-4">
      <h3 className="font-semibold">{editing ? "修改跟进" : "添加一次跟进"}</h3>
      <Input.TextArea aria-label="跟进事项" placeholder="要提醒自己做什么？" rows={2} maxLength={1000} value={body} disabled={!ready || busy} onChange={e => setBody(e.target.value)} />
      <label className="block text-sm">提醒时间<Input type="datetime-local" aria-label="提醒时间" value={due} disabled={!ready || busy} onChange={e => setDue(e.target.value)} /></label>
      <label className="block text-sm">时区<Input aria-label="提醒时区" placeholder="Asia/Shanghai" value={timeZone} disabled={!ready || busy} onChange={e => setZone(e.target.value)} /></label>
      <Checkbox checked={quiet} disabled={!ready || busy} onChange={e => setQuiet(e.target.checked)}>设置安静时段</Checkbox>
      {quiet && <div className="flex flex-wrap items-center gap-2"><Input className="!w-28" type="time" aria-label="安静时段开始" value={start} disabled={!ready || busy} onChange={e => setStart(e.target.value)} /><span>至</span><Input className="!w-28" type="time" aria-label="安静时段结束" value={end} disabled={!ready || busy} onChange={e => setEnd(e.target.value)} /></div>}
      <Space wrap><Button type="primary" loading={busy} disabled={!ready || !body.trim() || !due || !timeZone} onClick={save}>{editing ? "保存修改" : "添加跟进"}</Button>{editing && <Button disabled={busy} onClick={() => { setEditing(undefined); setBody(""); setDue(""); setZone(""); }}>取消修改</Button>}</Space>
    </div>
  </section>;
}
