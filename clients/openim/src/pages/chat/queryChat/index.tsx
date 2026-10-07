import { useUnmount } from "ahooks";
import { Alert, Button, Layout, Spin } from "antd";
import { useOutletContext, useParams } from "react-router-dom";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import { useConversationStore } from "@/store";

import ChatContent from "./ChatContent";
import ChatFooter from "./ChatFooter";
import ChatHeader from "./ChatHeader";
import useConversationState from "./useConversationState";
import { researchMode } from "@/research/api";
import { ResearchConversationPanel } from "@/research/ResearchConversationPanel";
import type { ResearchChatEntry } from "@/research/useResearchChatEntry";
import { useResearchStore } from "@/research/store";

export const QueryChat = () => {
  const entry = useOutletContext<ResearchChatEntry>();
  const { conversationID } = useParams();
  const currentID = useConversationStore((s) => s.currentConversation?.conversationID);
  const mapping = useResearchStore((s) =>
    s.mappings.find((c) => c.imConversationID === currentID),
  );
  const updateCurrentConversation = useConversationStore(
    (state) => state.updateCurrentConversation,
  );

  useConversationState();

  useUnmount(() => {
    updateCurrentConversation();
  });

  if (researchMode && (!entry.actorMatches || currentID !== conversationID))
    return (
      <Layout id="chat-container" className="items-center justify-center bg-white px-4">
        {entry.error ? (
          <Alert
            type="error"
            showIcon
            message={entry.error}
            action={<Button onClick={entry.retry}>重试</Button>}
          />
        ) : (
          <Spin tip="正在恢复此会话…" spinning>
            <div className="h-16 w-48" />
          </Spin>
        )}
      </Layout>
    );

  return (
    <Layout id="chat-container" className="relative overflow-hidden">
      {researchMode && !entry.ready && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
          <Spin tip="正在同步当前会话…" spinning>
            <div className="h-16 w-48" />
          </Spin>
        </div>
      )}
      <div
        className={`flex min-h-0 flex-1 flex-col ${
          researchMode && !entry.ready ? "invisible" : ""
        }`}
        aria-hidden={researchMode && !entry.ready}
      >
        <ChatHeader />
        {researchMode && entry.error && (
          <Alert
            type="error"
            showIcon
            message={entry.error}
            action={
              <Button size="small" onClick={entry.retry}>
                重试
              </Button>
            }
          />
        )}
        {researchMode && mapping?.kind === "group" && <ResearchConversationPanel />}
        <PanelGroup direction="vertical">
          <Panel id="chat-main" order={0}>
            <ChatContent />
          </Panel>
          <PanelResizeHandle />
          <Panel
            id="chat-footer"
            order={1}
            defaultSize={window.electronAPI ? 24 : 25}
            maxSize={60}
            className={researchMode ? "min-h-[280px]" : "min-h-[200px]"}
          >
            <ChatFooter />
          </Panel>
        </PanelGroup>
      </div>
    </Layout>
  );
};
