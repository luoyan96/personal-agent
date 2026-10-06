import { AgentConnectionInput } from "@research-agent-platform/contracts";
import { Alert, Button, Input } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchContactChat } from "./useResearchContactChat";
import { AgentConnectionPanel } from "./AgentConnectionPanel";

export function ExternalAgentSetup({ active, onProfile }: { active: boolean; onProfile: (id: string) => void }) {
  const generation = useResearchStore(s => s.generation), epoch = useRef(0);
  const [form, setForm] = useState({ displayName: "", endpoint: "", model: "", apiKey: "" });
  const [target, setTarget] = useState<string>(), [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState("");
  const openChat = useResearchContactChat();
  useLayoutEffect(() => { ++epoch.current; setBusy(false); if (!active) setForm(s => ({ ...s, apiKey: "" })); return () => { ++epoch.current; }; }, [active]);
  useLayoutEffect(() => { ++epoch.current; setTarget(undefined); setConfigured(false); setForm({ displayName: "", endpoint: "", model: "", apiKey: "" }); setFailure(""); }, [generation]);
  const run = async (openOnly = false) => {
    if (busy || !active) return;
    const ticket = epoch.current, actorId = useResearchStore.getState().actor?.member.id;
    const current = () => ticket === epoch.current && generation === useResearchStore.getState().generation && actorId === useResearchStore.getState().actor?.member.id;
    setBusy(true); setFailure("");
    try {
      let id = target;
      if (!openOnly) {
        const body = { expectedVersion: 0, protocol: "chat_completions" as const, endpoint: form.endpoint.trim(), model: form.model.trim(), enabled: true, allowAcceptedContacts: false, apiKey: form.apiKey };
        if (!form.displayName.trim() || !AgentConnectionInput.safeParse(body).success) throw new Error("请填写名称、完整 HTTPS chat/completions 接口、模型及至少 8 字符的 Key。");
        if (!id) {
          const created = await researchApi("importAgentProfile", { body: { format: "research-agent-profile/v1", profile: { displayName: form.displayName.trim(), introduction: "", capabilityDescription: "", personality: "" } } });
          if (!current()) return;
          id = created.data.contact.id;
          setTarget(id);
        }
        const state = await researchApi("agentConnection", { params: { id } });
        if (!current()) return;
        await researchApi("updateAgentConnection", { params: { id }, body: { ...body, expectedVersion: state.data.version } });
        if (!current()) return;
        setConfigured(true); setForm(s => ({ ...s, apiKey: "" }));
      }
      if (!id || !current()) return;
      await useResearchStore.getState().refresh();
      if (!current()) return;
      if (openOnly) await openChat(id, current);
    } catch (error) { if (current()) setFailure(error instanceof Error ? error.message : "接入未完成"); }
    finally { if (current()) setBusy(false); }
  };
  return <div className="space-y-3">
    <p className="text-sm leading-6 text-slate-600">连接已有的 HTTPS 文字接口。只发本条逐次授权的文字，不发送历史、记忆或文件；由你连接的外部账号付费。首次保存默认仅你本人可调用，不自动测试或发送聊天。</p>
    {!configured && <>{([["displayName", "名称"], ["endpoint", "完整接口地址"], ["model", "模型"]] as const).map(([key, label]) => <label className="block" key={key}>{label}<Input aria-label={`接入${label}`} value={form[key]} disabled={busy || (key === "displayName" && !!target)} placeholder={key === "endpoint" ? "https://服务域名/v1/chat/completions" : ""} onChange={e => setForm(s => ({ ...s, [key]: e.target.value }))} /></label>)}
      <label className="block">API Key<Input.Password aria-label="接入 API Key" autoComplete="new-password" value={form.apiKey} disabled={busy} onChange={e => setForm(s => ({ ...s, apiKey: e.target.value }))} /></label>
      <Button type="primary" loading={busy} onClick={() => void run()}>{target ? "重试保存已有 Agent 的连接" : "添加并保存连接"}</Button>
    </>}
    {target && <Alert type={configured ? "info" : "warning"} message={configured ? "外部连接已配置，尚未验证" : "Agent 已保存，连接尚未完成"} description="后续操作复用此联系人，不会重复创建。启用配置不代表服务可用；连接测试需要你明确确认。" />}
    {failure && <Alert type="warning" message={failure} />}
    {configured && target && <>
      <div className="flex flex-wrap gap-2"><Button type="primary" loading={busy} onClick={() => void run(true)}>打开 Agent 聊天</Button><Button onClick={() => onProfile(target)}>查看资料</Button></div>
      <AgentConnectionPanel active={active} contactId={target} onChanged={async () => {}} />
    </>}
  </div>;
}
