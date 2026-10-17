import { useMemo, useState } from "react";
import {
  readStarterLinks,
  writeStarterLinks,
  type StarterLinks,
} from "./agent-starter-links";

/** Local provenance is a hint; findOwnedStarter must revalidate it against actual contacts. */
export function useAgentStarterLinks(actorId: string | undefined) {
  const persisted = useMemo(() => readStarterLinks(actorId || ""), [actorId]);
  const [saved, setSaved] = useState<{ actorId: string; links: StarterLinks }>();
  const links = saved && saved.actorId === actorId ? saved.links : persisted;
  const remember = (starterId: string, contactId: string) => {
    if (!actorId) return;
    const next = { ...links, [starterId]: contactId };
    writeStarterLinks(actorId, next);
    setSaved({ actorId, links: next });
  };
  return { links, remember };
}
