import type { Contact, InstalledSkill } from "@research-agent-platform/contracts";
import type { CommunityResearchEntry } from "./community-research-catalog";

/** Source metadata locates an installation; actual current grants and owned contacts authorize use. */
export function communityAgentBindings(
  entry: CommunityResearchEntry,
  skills: readonly InstalledSkill[],
  contacts: readonly Contact[],
  actorId: string,
) {
  if (!entry.installable || !actorId) return [];
  const ids = new Set<string>();
  for (const skill of skills) {
    const source = /^(https:\/\/github\.com\/[^/\s]+\/[^/\s]+) · (.+)$/.exec(
      skill.source.label,
    );
    if (
      !skill.owned ||
      skill.ownerId !== actorId ||
      !skill.enabled ||
      !skill.canCall ||
      !skill.settings?.enabled ||
      skill.source.kind !== "github" ||
      !/^[a-f0-9]{40}$/.test(skill.source.revision || "") ||
      !source ||
      source[1].toLowerCase() !== entry.repository.replace(/\/$/, "").toLowerCase() ||
      source[2] !== entry.sourcePath
    )
      continue;
    for (const id of skill.settings.boundAgentIds) ids.add(id);
  }
  return contacts.filter(
    (contact) =>
      ids.has(contact.id) &&
      contact.identity.kind === "personal_agent" &&
      contact.identity.ownerMemberId === actorId &&
      contact.relationship.status === "own" &&
      contact.profile.role === "specialist" &&
      !contact.agentRuntime,
  );
}
