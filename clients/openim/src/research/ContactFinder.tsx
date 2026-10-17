import { Alert, Input } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { ContactRow } from "./ContactRow";
import { AcceptCatAccountNumber } from "./AcceptCatAccountNumber";

export function ContactFinder({
  onOpen,
  active = true,
}: {
  onOpen: (id: string) => void;
  active?: boolean;
}) {
  const [draft, setDraft] = useState(""),
    [query, setQuery] = useState("");
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const own = useResearchStore(
    (s) =>
      s.contacts.find(
        (entry) =>
          entry.contact.identity.kind === "human" &&
          entry.contact.identity.memberId === s.actor?.member.id,
      )?.contact,
  );
  const { data, error, loading } = useResearchRead(
    (signal) =>
      researchApi("chatContacts", {
        query: { scope: "global", view: "directory", search: query, limit: 100 },
        signal,
      }),
    `find-account:${query}`,
    active && !!query,
  );
  return (
    <div className="space-y-3">
      <AcceptCatAccountNumber username={own?.username} isSelf active={active} />
      <p className="text-sm leading-6 text-slate-600">通过 AcceptCat 号添加联系人</p>
      <p className="text-xs leading-6 text-slate-500">
        AcceptCat
        号是注册时设置的用户名，区分大小写。输入对方完整号码，查看名片后发送申请；对方同意后即可聊天。
      </p>
      <Input.Search
        aria-label="查找 AcceptCat 号"
        placeholder="输入对方的 AcceptCat 号"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onSearch={(value) => setQuery(value.trim())}
        enterButton="查找"
        loading={loading}
      />
      {error && <Alert type="error" message={error} />}
      {data?.data.map((contact) => (
        <ContactRow
          key={contact.id}
          contact={contact}
          actorId={actorId}
          onOpen={() => onOpen(contact.id)}
        />
      ))}
      {data && !data.data.length && (
        <p className="py-3 text-sm text-slate-500">
          没有找到这个 AcceptCat 号，请核对完整号码及大小写。
        </p>
      )}
    </div>
  );
}
