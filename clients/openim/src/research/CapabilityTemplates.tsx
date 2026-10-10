import { Alert, Button, Modal } from "antd";
import { ReadOutlined, EditOutlined, ExperimentOutlined, LineChartOutlined, CodeOutlined, ProfileOutlined } from "@ant-design/icons";
import { useRef, useState } from "react";
import { agentStarters, findOwnedStarter, type AgentStarter } from "./agentStarterProfiles";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchStore } from "./store";
import { capabilityCategory, type ResearchCategory } from "./capability-center";

export function CapabilityTemplates({ category, search, onChanged, onConfigure }: { category: ResearchCategory; search: string; onChanged: () => Promise<void>; onConfigure: (id: string) => void }) {
  const read = useResearchRead((signal) => researchApi("chatContacts", { query: { view: "mine", limit: 100 }, signal }), "capability-template-owned");
  const actorId = useResearchStore(s => s.actor?.member.id);
  const [selected, setSelected] = useState<AgentStarter>(), [busy, setBusy] = useState(false), [failure, setFailure] = useState("");
  const saved = useRef<Record<string, string>>({});
  const operation = usePersonalOperation(true, `capability-template:${selected?.id || ""}`);
  const add = async () => {
    if (!selected || !actorId || busy) return;
    const { isCurrent } = operation.capture(); setBusy(true); setFailure("");
    try {
      const owned = await researchApi("chatContacts", { query: { view: "mine", limit: 100 } }); if (!isCurrent()) return;
      let contactId = saved.current[selected.id] || findOwnedStarter(owned.data, selected, actorId)?.id;
      if (!contactId) { const created = await researchApi("createPersonalAgent", { body: selected.profile }); if (!isCurrent()) return; contactId = created.data.id; saved.current[selected.id] = contactId; }
      await Promise.all([read.refresh(), onChanged()]); if (isCurrent()) { setSelected(undefined); onConfigure(contactId); }
    } catch (error) { if (isCurrent()) setFailure(error instanceof Error ? error.message : "添加失败，配置已保留，请重试。"); }
    finally { if (isCurrent()) setBusy(false); }
  };
  const icons: Record<string, typeof ReadOutlined> = { "literature-reading": ReadOutlined, "paper-revision": EditOutlined, "research-planning": ExperimentOutlined, "figure-planning": LineChartOutlined, "data-reproduction": CodeOutlined, "lab-meeting": ProfileOutlined };
  const matching = agentStarters.filter(starter => (category === "全部" || capabilityCategory({ displayName: starter.profile.displayName, profile: { ...starter.profile, role: "specialist", version: 1 } }) === category) && `${starter.profile.displayName} ${starter.summary} ${starter.input}`.toLowerCase().includes(search.toLowerCase()));
  if (!matching.length) return null;
  return <section className="capability-templates" aria-label="配置模板">
    <div className="capability-template-heading"><h2>配置模板</h2><p>添加为你的私人 Agent，之后可继续调整。</p></div>
    {read.error && <Alert type="warning" message={read.error} action={<Button onClick={read.refresh}>重试</Button>} />}
    <div className="workspace-capability-grid">{matching.map(starter => {
      const Icon = icons[starter.id] || ProfileOutlined, existing = saved.current[starter.id] || findOwnedStarter(read.data?.data || [], starter, actorId || "")?.id;
      return <article className="capability-template-card" key={starter.id}><header><span className={`capability-template-icon template-${starter.id}`}><Icon /></span><h3>{starter.profile.displayName}</h3><span className="capability-template-label">配置模板</span></header><p>{starter.summary}</p><dl><div><dt>适用输入</dt><dd>{starter.input}</dd></div><div><dt>维护者</dt><dd>AcceptCat 内置配置</dd></div><div><dt>可用范围</dt><dd>文本与文字附件 · 不自动执行工具</dd></div></dl><Button type="primary" disabled={!read.data || !actorId} onClick={() => { if (existing) onConfigure(existing); else { setSelected(starter); setFailure(""); } }}>{existing ? "已添加 · 查看配置" : "添加为我的 Agent"}</Button></article>;
    })}</div>
    <Modal open={!!selected} title={selected?.profile.displayName} footer={null} onCancel={() => !busy && setSelected(undefined)} closable={!busy} maskClosable={!busy}>
      {selected && <div className="research-library-form"><p>{selected.summary}</p><dl><dt>适用输入</dt><dd>{selected.input}</dd><dt>能力边界</dt><dd>{selected.boundary}</dd></dl><p>添加为你拥有的私人文字 Agent。模板不授予资料、脚本或联网权限；回复使用当前获准的模型配置。</p>{failure && <Alert type="error" message={failure} />}<Button type="primary" loading={busy} onClick={() => void add()}>确认添加或复用</Button></div>}
    </Modal>
  </section>;
}
