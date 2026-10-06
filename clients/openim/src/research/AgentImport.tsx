import { AgentProfileDocument } from "@research-agent-platform/contracts";
import { Alert, Button, Input } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchContactChat } from "./useResearchContactChat";

/** Portable public personality only; importing never transmits credentials. */
export function AgentImport({ onProfile, active = true }: { onProfile: (id: string) => void; active?: boolean }) {
  const [json, setJson] = useState("");
  const [target, setTarget] = useState<{ id: string; name: string; reused: boolean }>();
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState("");
  const generation = useResearchStore(s => s.generation), epoch = useRef(0);
  const openChat = useResearchContactChat();
  useLayoutEffect(() => {
    ++epoch.current; setTarget(undefined); setJson(""); setFailure(""); setBusy(false);
    return () => { ++epoch.current; };
  }, [generation]);
  useLayoutEffect(() => { ++epoch.current; setBusy(false); return () => { ++epoch.current; }; }, [active]);
  const run = async () => {
    if (busy || !active) return;
    const ticket = epoch.current, actor = useResearchStore.getState().actor?.member.id;
    const isCurrent = () => ticket === epoch.current && generation === useResearchStore.getState().generation && actor === useResearchStore.getState().actor?.member.id;
    setBusy(true); setFailure("");
    try {
      let id = target?.id;
      if (!id) {
        if (json.length > 20000) throw new Error("资料过长，请使用只含四个公开资料字段的 JSON。");
        let raw: unknown; try { raw = JSON.parse(json); } catch { throw new Error("JSON 格式不正确，请检查引号和逗号。"); }
        const profile = AgentProfileDocument.safeParse(raw);
        if (!profile.success) throw new Error("仅支持 research-agent-profile/v1：名称、介绍、能力描述和性格四项资料。不能包含 Key、记忆或工具配置。");
        const created = await researchApi("importAgentProfile", { body: profile.data });
        if (!isCurrent()) return;
        id = created.data.contact.id;
        setTarget({ id, name: created.data.contact.displayName, reused: created.data.reused });
        setJson("");
      }
      await useResearchStore.getState().refresh();
      if (isCurrent()) await openChat(id, isCurrent);
    } catch (error) { if (isCurrent()) setFailure(error instanceof Error ? error.message : "导入失败"); }
    finally { if (isCurrent()) setBusy(false); }
  };
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">导入公开人设会添加一个归你所有的 Agent，沿用你的模型。它不会接入原服务，也不会复制账号、API Key、记忆或工具。</p>
    <Input.TextArea aria-label="Agent 资料 JSON" rows={7} value={json} disabled={!!target || busy} placeholder={'{"format":"research-agent-profile/v1","profile":{"displayName":"名称","introduction":"介绍","capabilityDescription":"能力描述","personality":"性格"}}'} onChange={event => setJson(event.target.value)} />
    <label className="block text-sm text-slate-600">或选择资料 JSON
      <input className="mt-2 block max-w-full text-xs" type="file" accept=".json,application/json" disabled={!!target || busy} onChange={async event => {
        const file = event.currentTarget.files?.[0], ticket = epoch.current;
        event.currentTarget.value = ""; if (!file) return;
        if (file.size > 20000) { setFailure("资料文件过大；只需公开人设四项资料。"); return; }
        try { const value = await file.text(); if (ticket === epoch.current) { setJson(value); setFailure(""); } }
        catch { if (ticket === epoch.current) setFailure("资料文件无法读取。"); }
      }} />
    </label>
    {target && <Alert type="success" message={`${target.reused ? "已复用" : "已添加"} ${target.name}`} description="聊天暂未连接时可以重试打开，不会再创建。需要连接原外部服务，请在它的资料中选择「外部服务」。" />}
    {failure && <Alert type="warning" message={failure} />}
    <div className="flex flex-wrap gap-2"><Button type="primary" loading={busy} disabled={!target && !json.trim()} onClick={() => void run()}>{target ? "打开已有 Agent 聊天" : "导入并开始聊天"}</Button>
      {target && <Button onClick={() => onProfile(target.id)}>查看资料与接入外部服务</Button>}
    </div>
    <p className="text-xs text-slate-500">要添加别人已有的 Agent，请用「朋友与已有 Agent」查账号，或打开对方分享的名片链接；这会保留对方的稳定身份。</p>
  </div>;
}
