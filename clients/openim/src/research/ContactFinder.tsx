import { Alert, Input } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { ContactRow } from "./ContactRow";

export function ContactFinder({ onOpen }: { onOpen: (id: string) => void }) {
  const [draft, setDraft] = useState(""), [query, setQuery] = useState("");
  const actorId = useResearchStore(s => s.actor?.member.id);
  const { data, error } = useResearchRead(() => researchApi("chatContacts", { query: { scope: "global", view: "directory", search: query, limit: 100 } }), `find-account:${query}`, !!query);
  return <div className="space-y-3">
    <p className="text-sm leading-6 text-slate-600">输入朋友的完整用户名，查看本人和可公开的 Agent 名片。添加后需对方同意；名片不会共享私人记忆或模型密钥。</p>
    <Input.Search aria-label="查找账号" placeholder="朋友的完整用户名" value={draft} onChange={e => setDraft(e.target.value)} onSearch={value => setQuery(value.trim())} enterButton="查找" />
    {error && <Alert type="error" message={error} />}
    {data?.data.map(contact => <ContactRow key={contact.id} contact={contact} actorId={actorId} onOpen={() => onOpen(contact.id)} />)}
    {data && !data.data.length && <p className="py-3 text-sm text-slate-500">没有找到这个账号，请检查完整用户名。</p>}
  </div>;
}
