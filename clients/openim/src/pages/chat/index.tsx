import { Layout } from "antd";
import { Outlet } from "react-router-dom";

import ConversationSider from "./ConversationSider";
import { useResearchChatEntry } from "@/research/useResearchChatEntry";
import { useDesktopUI } from "@/layout/desktop-ui";

export const Chat = () => {
  const entry = useResearchChatEntry();
  const collapsed = useDesktopUI((s) => s.chatsCollapsed);
  return (
    <Layout className={`desktop-chat-layout flex-row ${collapsed ? "chats-collapsed" : ""}`}>
      <ConversationSider />
      <Outlet context={entry} />
    </Layout>
  );
};
