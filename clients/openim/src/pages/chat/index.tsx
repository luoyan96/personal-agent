import { Layout } from "antd";
import { Outlet } from "react-router-dom";

import ConversationSider from "./ConversationSider";
import { useResearchChatEntry } from "@/research/useResearchChatEntry";

export const Chat = () => {
  const entry = useResearchChatEntry();
  return (
    <Layout className="desktop-chat-layout flex-row">
      <ConversationSider />
      <Outlet context={entry} />
    </Layout>
  );
};
