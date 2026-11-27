import type { Contact } from "@research-agent-platform/contracts";

export function isPersonalConsultationContact(contact: Contact) {
  return contact.identity.kind === "personal_agent" && !contact.groupConversationId;
}

export function isVisitingPersonalAgent(contact: Contact, actorId?: string) {
  return (
    !!actorId &&
    contact.identity.kind === "personal_agent" &&
    contact.identity.ownerMemberId !== actorId &&
    !contact.groupConversationId
  );
}
