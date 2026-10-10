import { Alert, Button, Select } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
import { researchScopeLabels } from "./research-library-api";

/** Owned Agent bindings are separate from its public profile and never grant access. */
export function AgentResearchCollections({ agentId }: { agentId: string }) {
  const read = useResearchRead((signal) => researchApi("agentResearchCollections", { params: { id: agentId }, signal }), `agent-library:${agentId}`);
  const collections = useResearchRead((signal) => researchApi("researchCollections", { query: { scope: "visible", limit: 100 }, signal }), `agent-library-options:${agentId}`);
  const [draft, setDraft] = useState<string[]>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const operation = usePersonalOperation(true, `agent-library:${agentId}`);
  const value = draft ?? read.data?.data.collectionIds ?? [];
  const save = async () => {
    if (!read.data || busy) return;
    const { isCurrent } = operation.capture();
    setBusy(true); setFailure(""); setNotice("");
    try {
      await researchApi("bindAgentResearchCollections", { params: { id: agentId }, body: { expectedVersion: read.data.data.version, collectionIds: value } });
      if (!isCurrent()) return;
      setDraft(undefined); await read.refresh();
      if (isCurrent()) setNotice("资料集合已保存，使用时仍会核对当前权限。");
    } catch (error) {
      if (isCurrent()) { setFailure(error instanceof Error ? error.message : "保存失败，选择已保留。"); await read.refresh(); }
    } finally { if (isCurrent()) setBusy(false); }
  };
  return <section className="research-agent-library" aria-label="Agent 资料配置">
    <h3>获准资料集合</h3>
    <p>只选择你当前可读的集合。本人私人 Agent 聊天会按当前问题检索实际片段；群聊、他人的 Agent 和外部服务不传私人资料。公开 Agent 不会公开私人资料，绑定也不会授予他人权限。</p>
    {(read.error || collections.error || failure) && <Alert type="warning" message={failure || read.error || collections.error} action={<Button size="small" onClick={() => { void read.refresh(); void collections.refresh(); }}>重新读取</Button>} />}
    <Select aria-label="Agent 获准资料集合" mode="multiple" value={value} disabled={!read.data || !collections.data || busy} placeholder="选择资料集合" onChange={setDraft} options={collections.data?.data.filter(c => c.status === "available").map(c => ({ value: c.id, label: `${c.name} · ${researchScopeLabels[c.scope]}` }))} />
    {notice && <p role="status">{notice}</p>}
    <Button type="primary" disabled={!read.data || !collections.data || draft === undefined} loading={busy} onClick={() => void save()}>保存资料配置</Button>
  </section>;
}
