import { agentStarters } from "./agentStarterProfiles";

type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;
export type StarterLinks = Record<string, string>;
const key = (actorId: string) =>
  `acceptcat:agent-starters:v1:${encodeURIComponent(actorId)}`;
export function readStarterLinks(actorId: string, storage?: Storage): StarterLinks {
  if (!actorId) return {};
  try {
    const value: unknown = JSON.parse(
      (storage || window.localStorage).getItem(key(actorId)) || "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      agentStarters.flatMap(({ id }) => {
        const contactId = (value as StarterLinks)[id];
        return typeof contactId === "string" &&
          contactId.length > 0 &&
          contactId.length <= 200
          ? [[id, contactId]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}
export function writeStarterLinks(
  actorId: string,
  links: StarterLinks,
  storage?: Storage,
) {
  if (!actorId) return;
  try {
    (storage || window.localStorage).setItem(key(actorId), JSON.stringify(links));
  } catch {
    /* Current session still remembers the link. */
  }
}
