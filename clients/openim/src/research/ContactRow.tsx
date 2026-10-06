import { Tag } from "antd";
import type { Contact } from "@research-agent-platform/contracts";
import OIMAvatar from "@/components/OIMAvatar";

export function ContactRow({ contact, actorId, onOpen }: {
  contact: Contact;
  actorId?: string;
  onOpen: () => void;
}) {
  const human = contact.identity.kind === "human";
  const own = !human && contact.identity.kind !== "human" && contact.identity.ownerMemberId === actorId;
  return <button type="button" onClick={onOpen} className="flex w-full min-w-0 items-center gap-3 rounded-lg p-3 text-left hover:bg-slate-50 focus-visible:outline focus-visible:outline-blue-500">
    <OIMAvatar text={contact.displayName.slice(0, 2)} />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2"><strong className="break-words text-sm">{contact.displayName}</strong><Tag className="!m-0 text-xs">{human ? "真人" : own ? "我的 Agent" : "Agent"}</Tag></div>
      {contact.username && <p className="truncate text-xs text-slate-500">@{contact.username}</p>}
      <p className="line-clamp-1 text-xs leading-5 text-slate-600">{contact.profile.introduction || "尚未填写介绍"}</p>
    </div>
    <span className="shrink-0 text-xs text-slate-500">{contact.relationship.status === "pending_outbound" ? "申请中" : contact.relationship.status === "pending_inbound" ? "待同意" : contact.allowedActions.includes("chat") ? "查看 · 聊天" : "查看"}</span>
  </button>;
}
