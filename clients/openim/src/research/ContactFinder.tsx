import { Alert, Button, Input } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { ContactRow } from "./ContactRow";
import { AcceptCatAccountNumber } from "./AcceptCatAccountNumber";
import type { Contact } from "@research-agent-platform/contracts";
import { contactDirectoryKind, type DirectoryKind } from './contact-directory';
import { isPersonalConsultationContact } from "./agent-consultation";
import {
  parseContactLookup,
  readContactServiceOrigin,
  assertContactCardService,
} from "./contact-card";

export function ContactFinder({
  onOpen,
  active = true,
  kind,
}: {
  onOpen: (id: string) => void;
  active?: boolean;
  kind: DirectoryKind;
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
    async (signal): Promise<{ data: Contact[]; fromCard?: boolean }> => {
      const lookup = parseContactLookup(query);
      if (lookup.kind === "card") {
        const origin = await readContactServiceOrigin();
        if (signal.aborted) throw new DOMException("Aborted", "AbortError");
        assertContactCardService(lookup, origin);
        const found = await researchApi("chatContact", {
          params: { id: lookup.contactId },
          signal,
        });
        return { data: [found.data], fromCard: true };
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
  const contacts = data?.data.filter(
    (contact) =>
      (data?.fromCard && kind === "people" && isPersonalConsultationContact(contact)) ||
      (contact.profile.role !== "coordinator" && contactDirectoryKind(contact) === kind),
  );
  return (
    <div className="space-y-3">
      <AcceptCatAccountNumber username={own?.username} isSelf active={active} />
      <p className="text-sm leading-6 text-slate-600">
        {kind === 'agents' ? '输入所属账号的 DeepChat 号，或粘贴智能体名片。' : '输入 DeepChat 号，或粘贴联系人名片。'}
      </p>
      <div className="flex items-start gap-2">
        <Input.TextArea
          aria-label="查找 DeepChat 号或名片"
          placeholder="输入 DeepChat 号，或粘贴联系人名片"
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
      {contacts?.map((contact) => (
        <ContactRow
          key={contact.id}
          contact={contact}
          actorId={actorId}
          onOpen={() => onOpen(contact.id)}
        />
      ))}
      {contacts && !contacts.length && (
        <p className="py-3 text-sm text-slate-500">
          {kind === 'agents' ? '没有找到智能体' : '没有找到可添加的联系人'}，请核对 DeepChat 号或名片。
        </p>
      )}
    </div>
  );
}
