import { Alert, Button, Input } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { ContactRow } from "./ContactRow";
import { AcceptCatAccountNumber } from "./AcceptCatAccountNumber";
import type { Contact } from "@research-agent-platform/contracts";
import {
  parseContactLookup,
  readContactServiceOrigin,
  assertContactCardService,
} from "./contact-card";

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
  const { data, error, loading, refresh } = useResearchRead(
    async (signal): Promise<{ data: Contact[] }> => {
      const lookup = parseContactLookup(query);
      if (lookup.kind === "card") {
        const origin = await readContactServiceOrigin();
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        assertContactCardService(lookup, origin);
        const found = await researchApi("chatContact", {
          params: { id: lookup.contactId },
          signal,
        });
        return { data: [found.data] };
      }
      return researchApi("chatContacts", {
        query: {
          scope: "global",
          view: "directory",
          search: lookup.username,
          limit: 100,
        },
        signal,
      });
    },
    `find-account:${query}`,
    active && !!query && query === draft.trim(),
  );
  const submit = () => {
    const next = draft.trim();
    if (query === next) void refresh();
    else setQuery(next);
  };
  return (
    <div className="space-y-3">
      <AcceptCatAccountNumber username={own?.username} isSelf active={active} />
      <p className="text-sm leading-6 text-slate-600">
        通过 AcceptCat 号或名片添加联系人
      </p>
      <p className="text-xs leading-6 text-slate-500">
        AcceptCat 号是注册时设置的用户名，区分大小写。也可以粘贴真人或 Agent
        的完整名片，查看实际资料后发送申请；私人 Agent 由主人单独同意。
      </p>
      <div className="flex items-start gap-2">
        <Input.TextArea
          aria-label="查找 AcceptCat 号或名片"
          placeholder="输入 AcceptCat 号，或粘贴联系人名片"
          autoSize={{ minRows: 2, maxRows: 5 }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onPressEnter={(event) => {
            if (!event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <Button type="primary" loading={loading} onClick={submit}>
          查找
        </Button>
      </div>
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
