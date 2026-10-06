import { Modal, Tabs } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useConversationStore } from "@/store";
import { useResearchStore } from "./store";
import { PersonalMemoryPanel } from "./PersonalMemoryPanel";
import { PersonalFollowupPanel } from "./PersonalFollowupPanel";

export function PersonalAssistantPanel({ open, onClose, initialTab = "memory" }: {
  open: boolean; onClose: () => void; initialTab?: "memory" | "followups";
}) {
  const [tab, setTab] = useState(initialTab);
  const generation = useResearchStore(s => s.generation);
  const actorId = useResearchStore(s => s.actor?.member.id);
  const imID = useConversationStore(s => s.currentConversation?.conversationID);
  const path = useLocation().pathname;
  const scope = `${generation}:${actorId}:${imID}:${path}`;
  const previous = useRef(scope);
  useLayoutEffect(() => {
    if (previous.current !== scope) { previous.current = scope; onClose(); }
  }, [scope, onClose]);
  useLayoutEffect(() => { setTab(initialTab); }, [open, initialTab, generation]);
  return <Modal title="关于我 · 记忆与跟进" width={680} centered open={open && !!actorId}
    onCancel={onClose} footer={null} destroyOnClose
    style={{ maxWidth: "calc(100vw - 24px)" }}
    styles={{ body: { maxHeight: "calc(100dvh - 160px)", overflowY: "auto", paddingRight: 4 } }}>
    <Tabs activeKey={tab} onChange={value => setTab(value as "memory" | "followups")}
      items={[{ key: "memory", label: "我的长期记忆", children: <PersonalMemoryPanel active={open && tab === "memory"} /> },
        { key: "followups", label: "跟进与提醒", children: <PersonalFollowupPanel active={open && tab === "followups"} /> }]} />
  </Modal>;
}
