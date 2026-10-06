import { AgentConnectionInput } from "@research-agent-platform/contracts";
import { Alert, Button, Checkbox, Input, Modal, Tag } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { researchApi } from "./api";
import { serviceErrorMessage } from "./api-errors";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";

export function AgentConnectionPanel({ contactId, onChanged, active = true }: { contactId: string; onChanged: () => Promise<void>; active?: boolean }) {
  const generation = useResearchStore(s => s.generation), epoch = useRef(0);
  const read = useResearchRead(() => researchApi("agentConnection", { params: { id: contactId } }), contactId, active);
  const [form, setForm] = useState({ endpoint: "", model: "", apiKey: "", enabled: true, allowAcceptedContacts: false, removeApiKey: false });
  const [version, setVersion] = useState(0), [initialized, setInitialized] = useState(false);
  const [dirty, setDirty] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState(""), [saved, setSaved] = useState("");
  useLayoutEffect(() => {
    ++epoch.current; setForm({ endpoint: "", model: "", apiKey: "", enabled: true, allowAcceptedContacts: false, removeApiKey: false });
    setInitialized(false); setVersion(0); setDirty(false); setBusy(false); setFailure(""); setSaved("");
    return () => { ++epoch.current; };
  }, [contactId, generation, active]);
  useLayoutEffect(() => {
    if (!read.data || initialized) return;
    const c = read.data.data.connection;
    setForm({ endpoint: c?.endpoint || "", model: c?.model || "", apiKey: "", enabled: c?.enabled ?? true, allowAcceptedContacts: c?.allowAcceptedContacts ?? false, removeApiKey: false });
    setVersion(read.data.data.version); setInitialized(true);
  }, [read.data, initialized]);
  const change = (patch: Partial<typeof form>) => { setForm(s => ({ ...s, ...patch })); setDirty(true); setSaved(""); };
  const command = async (action: "save" | "probe" | "disconnect") => {
    if (busy || !initialized || !active) return;
    const ticket = epoch.current, actorId = useResearchStore.getState().actor?.member.id;
    const current = () => ticket === epoch.current && useResearchStore.getState().generation === generation && useResearchStore.getState().actor?.member.id === actorId;
    setBusy(true); setFailure(""); setSaved("");
    try {
      if (action === "save") {
        const existing = read.data?.data.connection;
        if (existing && existing.endpoint !== form.endpoint && !form.apiKey && !form.removeApiKey) throw new Error("更换接口地址需要新的 API Key，或明确移除旧 Key。");
        const body = { expectedVersion: version, protocol: "chat_completions" as const, endpoint: form.endpoint.trim(), model: form.model.trim(), enabled: form.enabled, allowAcceptedContacts: form.allowAcceptedContacts, ...(form.apiKey ? { apiKey: form.apiKey } : {}), ...(form.removeApiKey ? { removeApiKey: true } : {}) };
        if (!AgentConnectionInput.safeParse(body).success) throw new Error("请填写完整 HTTPS chat/completions 接口地址与模型；API Key 至少 8 个字符。移除 Key 时请先停用。");
        const result = await researchApi("updateAgentConnection", { params: { id: contactId }, body });
        if (!current()) return;
        setVersion(result.data.version); setForm(s => ({ ...s, apiKey: "", removeApiKey: false })); setDirty(false); setSaved("配置已保存；尚未验证连接。可主动测试，或进入聊天逐条授权。");
      } else if (action === "probe") {
        const result = await researchApi("probeAgentConnection", { params: { id: contactId }, body: { expectedVersion: version } });
        if (!current()) return;
        setSaved(result.data.status === "passed" ? "本次连接测试通过。仅代表此时文字接口可用，不代表工具或研究结果已验证。" : result.data.status === "uncertain" ? "测试结果未能确认；不会自动重复请求。请先核对外部服务记录。" : "连接测试失败，请核对接口、模型和 Key。");
      } else {
        const result = await researchApi("disconnectAgentConnection", { params: { id: contactId }, body: { expectedVersion: version } });
        if (!current()) return;
        setVersion(result.data.version); setDirty(false); setForm({ endpoint: "", model: "", apiKey: "", enabled: true, allowAcceptedContacts: false, removeApiKey: false }); setSaved("外部连接已移除；以后的普通文字聊天使用发送者的模型。");
      }
      await read.refresh(); if (!current()) return;
      await useResearchStore.getState().refresh(); if (!current()) return;
      await onChanged();
    } catch (error) { if (current()) setFailure(error instanceof Error ? error.message : "操作失败"); }
    finally { if (current()) setBusy(false); }
  };
  const state = read.data?.data, probe = state?.lastProbe;
  const formDisabled = busy || !initialized || !active;
  const confirm = (action: "probe" | "disconnect") => {
    const ticket = epoch.current;
    Modal.confirm({ title: action === "probe" ? "测试外部文字接口？" : "移除外部连接？", content: action === "probe" ? "会向已保存的接口发送一条合成测试文字，可能消耗你在该服务的额度。不发送聊天历史、记忆或文件。" : "移除加密 Key 和接口绑定；资料与聊天仍保留。以后使用发送者的模型。",
      onOk: () => ticket === epoch.current ? command(action) : undefined });
  };
  return <section className="space-y-3 border-t pt-4" aria-label="外部服务配置">
    <h3 className="text-base font-semibold">外部文字服务</h3>
    <p className="text-xs leading-5 text-slate-600">仅转发本条授权文字，不发送历史、记忆、附件或任务。费用由你连接的外部账号承担；失败不会改用本人的模型。</p>
    {(read.error || failure) && <Alert type="error" message={failure || read.error} />}
    {saved && <Alert type="info" message={saved} />}
    {state?.connection && <div className="flex flex-wrap gap-2 text-xs"><Tag>{state.connection.enabled ? "已配置，待逐条授权" : "连接已停用"}</Tag>{probe && probe.version === version && <span>最近测试：{probe.status === "passed" ? "通过" : probe.status === "failed" ? "失败" : "结果不确定"}{probe.failure ? ` · ${serviceErrorMessage(probe.failure, 0)}` : ""}</span>}</div>}
    <label className="block">完整接口地址<Input aria-label="外部接口地址" placeholder="https://服务域名/v1/chat/completions" value={form.endpoint} disabled={formDisabled} onChange={e => change({ endpoint: e.target.value })} /></label>
    <label className="block">模型<Input aria-label="外部模型" value={form.model} disabled={formDisabled} onChange={e => change({ model: e.target.value })} /></label>
    <label className="block">API Key {state?.connection?.hasApiKey && <Tag>已保存</Tag>}<Input.Password aria-label="外部 API Key" autoComplete="new-password" value={form.apiKey} disabled={formDisabled || form.removeApiKey} placeholder={state?.connection?.hasApiKey ? "留空保留，不会回显" : "填写此服务的 Key"} onChange={e => change({ apiKey: e.target.value })} /></label>
    <Checkbox checked={form.enabled} disabled={formDisabled || form.removeApiKey} onChange={e => change({ enabled: e.target.checked })}>启用外部文字聊天</Checkbox>
    <Checkbox checked={form.allowAcceptedContacts} disabled={formDisabled} onChange={e => change({ allowAcceptedContacts: e.target.checked })}>允许已添加的联系人调用（消耗我的外部账号额度）</Checkbox>
    {state?.connection?.hasApiKey && <Checkbox checked={form.removeApiKey} disabled={formDisabled} onChange={e => change({ removeApiKey: e.target.checked, ...(e.target.checked ? { enabled: false, apiKey: "" } : {}) })}>明确移除已保存的 Key</Checkbox>}
    <div className="flex flex-wrap gap-2"><Button type="primary" loading={busy} disabled={!initialized} onClick={() => void command("save")}>保存连接配置</Button>
      <Button disabled={busy || dirty || !state?.connection?.hasApiKey || !state.connection.enabled} onClick={() => confirm("probe")}>测试连接</Button>
      {state?.connection && <Button danger disabled={busy || dirty} onClick={() => confirm("disconnect")}>移除连接</Button>}
    </div>
  </section>;
}
