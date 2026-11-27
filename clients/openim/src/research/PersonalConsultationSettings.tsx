import { Alert, Button } from "antd";
import type { Contact } from "@research-agent-platform/contracts";
import { AgentConsultation } from "./AgentConsultation";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";

function isOwnAssistant(contact: Contact, actorId?: string) {
  return (
    !!actorId &&
    contact.identity.kind === "personal_agent" &&
    contact.identity.ownerMemberId === actorId &&
    contact.profile.role === "coordinator" &&
    !contact.groupConversationId
  );
}

export function PersonalConsultationSettings() {
  const actorId = useResearchStore((state) => state.actor?.member.id);
  const assistant = useResearchStore(
    (state) =>
      state.contacts.find(({ contact }) => isOwnAssistant(contact, actorId))?.contact,
  );
  const read = useResearchRead(
    async (signal) => {
      const { data } = await researchApi("imContacts", { signal });
      return (
        data.contacts.find(({ contact }) => isOwnAssistant(contact, actorId))
          ?.contact ?? null
      );
    },
    `my-consultation:${actorId}`,
    !!actorId && !assistant,
    { poll: false },
  );
  const contact = assistant ?? read.data;
  return (
    <section aria-label="个人助理咨询">
      <header className="my-section-heading">
        <div>
          <h2>助理咨询</h2>
          {contact && <p>{contact.displayName}</p>}
        </div>
      </header>
      {contact ? (
        <AgentConsultation contactId={contact.id} />
      ) : read.error ? (
        <Alert
          type="warning"
          message={read.error}
          action={<Button onClick={read.refresh}>重试读取</Button>}
        />
      ) : (
        <p role="status">
          {contact === null ? "暂未找到你的个人助理。" : "正在读取个人助理…"}
        </p>
      )}
    </section>
  );
}
