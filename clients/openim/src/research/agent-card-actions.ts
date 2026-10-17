import type { Contact } from "@research-agent-platform/contracts";

export function isAddedAgent(contact?: Contact) {
  return (
    !!contact &&
    contact.identity.kind !== "human" &&
    (contact.relationship.status === "own" ||
      contact.relationship.status === "accepted")
  );
}
