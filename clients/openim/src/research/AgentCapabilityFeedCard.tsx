import type { ComponentProps } from "react";
import { useLayoutEffect, useRef, useState } from "react";
import type { Contact } from "@research-agent-platform/contracts";
import { CapabilityFeedCard } from "./CapabilityFeedCard";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchContactChat } from "./useResearchContactChat";
import { isAddedAgent } from "./agent-card-actions";

/** Contact relationships decide the actions; installing a Skill alone is not a chat Agent. */
export function AgentCapabilityFeedCard({
  contact,
  onConfigure,
  operationScope = "",
  ...props
}: Omit<ComponentProps<typeof CapabilityFeedCard>, "actions"> & {
  contact?: Contact;
  onConfigure: (id: string) => void;
  operationScope?: string;
}) {
  const operation = usePersonalOperation(
    true,
    `capability-card:${contact?.id || "template"}:${operationScope}`,
  );
  const openChat = useResearchContactChat();
  const inFlight = useRef(false);
  const [action, setAction] = useState<{
    scope: string;
    busy: boolean;
    error: string;
  }>();
  const current = action?.scope === operation.scope ? action : undefined;
  useLayoutEffect(() => {
    inFlight.current = false;
  }, [operation.scope]);
  const chat = async () => {
    if (
      !contact ||
      !isAddedAgent(contact) ||
      !contact.allowedActions.includes("chat") ||
      inFlight.current
    )
      return;
    const { isCurrent } = operation.capture();
    inFlight.current = true;
    setAction({ scope: operation.scope, busy: true, error: "" });
    try {
      await openChat(contact.id, isCurrent);
      if (isCurrent()) setAction({ scope: operation.scope, busy: false, error: "" });
    } catch (error) {
      if (isCurrent())
        setAction({
          scope: operation.scope,
          busy: false,
          error: error instanceof Error ? error.message : "聊天暂未打开，请重试。",
        });
    } finally {
      if (isCurrent()) inFlight.current = false;
    }
  };
  return (
    <CapabilityFeedCard
      {...props}
      actions={
        isAddedAgent(contact)
          ? {
              onConfigure: () => onConfigure(contact!.id),
              onChat: () => void chat(),
              canChat: contact!.allowedActions.includes("chat"),
              busy: current?.busy,
              error: current?.error,
            }
          : undefined
      }
    />
  );
}
