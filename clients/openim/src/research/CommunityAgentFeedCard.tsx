import { Select } from "antd";
import { useState, type ComponentProps } from "react";
import type { Contact } from "@research-agent-platform/contracts";
import { AgentCapabilityFeedCard } from "./AgentCapabilityFeedCard";

export function CommunityAgentFeedCard({
  agents,
  ...props
}: Omit<ComponentProps<typeof AgentCapabilityFeedCard>, "contact"> & {
  agents: readonly Contact[];
}) {
  const [chosenId, setChosenId] = useState<string>();
  const contact = agents.find((agent) => agent.id === chosenId) || agents[0];
  return (
    <AgentCapabilityFeedCard
      {...props}
      contact={contact}
      status={contact ? `已添加 · 绑定 ${contact.displayName}` : props.status}
      metadata={
        <>
          {props.metadata}
          {agents.length > 1 && (
            <Select
              aria-label={`选择${props.name}的聊天 Agent`}
              value={contact.id}
              options={agents.map((agent) => ({
                value: agent.id,
                label: agent.displayName,
              }))}
              onChange={setChosenId}
              style={{ width: "100%", marginTop: 10 }}
            />
          )}
        </>
      }
    />
  );
}
