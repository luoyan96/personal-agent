import { Dropdown } from "antd";
import { StarFilled } from "@ant-design/icons";
import { useRef, useState } from "react";
import type { Contact } from "@research-agent-platform/contracts";
import OIMAvatar from "./ResearchAvatar";
import { useContactRemoval } from "./useContactRemoval";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchContactChat } from "./useResearchContactChat";
import { feedbackToast } from "@/utils/common";
import { useResearchStore } from "./store";

export function ContactDirectoryRow({
  contact,
  selected,
  starred,
  onSelect,
  onDetails,
  onStar,
  onRemoved,
}: {
  contact: Contact;
  selected: boolean;
  starred: boolean;
  onSelect: () => void;
  onDetails: () => void;
  onStar: () => Promise<void>;
  onRemoved: () => Promise<void>;
}) {
  const operation = usePersonalOperation(true, `directory-row:${contact.id}`);
  const removal = useContactRemoval(contact, true, onRemoved);
  const openChat = useResearchContactChat();
  const actorId = useResearchStore((state) => state.actor?.member.id);
  const contacts = useResearchStore((state) => state.contacts);
  const ownerId =
    contact.identity.kind === "human" ? undefined : contact.identity.ownerMemberId;
  const owner = contacts.find(
    (item) =>
      item.contact.identity.kind === "human" &&
      item.contact.identity.memberId === ownerId,
  )?.contact;
  const source =
    contact.identity.kind === "human"
      ? undefined
      : contact.identity.ownerMemberId === actorId
      ? "我的助理"
      : owner
      ? `${owner.displayName}的助理`
      : "课题组助理";
  const busy = useRef(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const items = [
    {
      key: "chat",
      label: "发消息",
      disabled: !contact.allowedActions.includes("chat"),
    },
    { key: "details", label: "查看资料" },
    {
      key: "star",
      label: starred ? "取消星标" : "设为星标",
      title: "星标保存在当前账号的本机通讯录",
    },
    ...(removal.action
      ? [
          { type: "divider" as const },
          { key: "remove", label: removal.action.label, danger: true },
        ]
      : []),
  ];
  const act = async (key: string) => {
    setMenuOpen(false);
    if (key === "details") {
      onDetails();
      return;
    }
    if (key === "remove") {
      removal.confirm();
      return;
    }
    if (busy.current) return;
    const ticket = operation.capture();
    busy.current = true;
    try {
      if (key === "chat") await openChat(contact.id, ticket.isCurrent);
      else if (key === "star" && ticket.isCurrent()) await onStar();
    } catch (error) {
      if (ticket.isCurrent())
        feedbackToast({
          error,
          msg: error instanceof Error ? error.message : "操作未完成，请重试。",
        });
    } finally {
      busy.current = false;
    }
  };
  return (
    <Dropdown
      trigger={["contextMenu"]}
      open={menuOpen}
      onOpenChange={(open) => {
        setMenuOpen(open);
        if (open) onSelect();
      }}
      menu={{
        items,
        onClick: ({ key }) => {
          void act(key);
        },
      }}
    >
      <button
        type="button"
        className="workspace-person-row"
        aria-pressed={selected}
        onClick={onSelect}
        aria-label={`${contact.displayName}${starred ? "，已星标" : ""}`}
        title="右键或按 Shift+F10 打开菜单"
        onKeyDown={(event) => {
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            setMenuOpen(true);
            onSelect();
          }
        }}
      >
        <OIMAvatar contact={contact} text={contact.displayName} />
        <div>
          <strong>{contact.displayName}</strong>
          {starred && <StarFilled className="directory-star" aria-label="已星标" />}
          {source && <small className="directory-contact-source">{source}</small>}
          <p>
            {contact.profile.introduction ||
              (contact.identity.kind === "human" && contact.username
                ? `AcceptCat 号：${contact.username}`
                : contact.profile.capabilityDescription)}
          </p>
        </div>
      </button>
    </Dropdown>
  );
}
