import type { Contact, ResponseFor } from "@research-agent-platform/contracts";
import type { researchApi } from "./api";
import { findOwnedStarter, libraryAgentStarter } from "./agentStarterProfiles";

export type LibraryAgentBindings = ResponseFor<"agentResearchCollections">["data"];
export const sameCollectionIds = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length &&
  new Set(a).size === a.length &&
  a.every((id) => b.includes(id));

/** Reuse only a freshly authorized owned Agent. A retry never replaces a newer scope. */
export async function prepareLibraryAgent(options: {
  api: typeof researchApi;
  actorId: string;
  rememberedId?: string;
  agent?: Contact;
  bindings?: LibraryAgentBindings;
  collectionIds: string[];
  signal: AbortSignal;
  isCurrent: () => boolean;
  onPrepared: (agent: Contact, bindings: LibraryAgentBindings) => void;
  creationKey?: string;
}) {
  const { api, actorId, signal, isCurrent, onPrepared, collectionIds } = options;
  if (!isCurrent()) return;
  const owned = await api("chatContacts", {
    query: { view: "mine", scope: "local", limit: 100 },
    signal,
  });
  if (!isCurrent()) return;
  let agent = findOwnedStarter(
    owned.data,
    libraryAgentStarter,
    actorId,
    options.agent?.id || options.rememberedId,
  );
  if (agent?.agentRuntime || (options.agent && agent?.id !== options.agent.id))
    throw new Error("资料 Agent 状态已变化，请重新读取后核对。");
  if (!agent) {
    agent = (
      await api("createPersonalAgent", {
        body: libraryAgentStarter.profile,
        signal,
        idempotencyKey: options.creationKey,
      })
    ).data;
    if (!isCurrent()) return;
  }
  const current = (
    await api("agentResearchCollections", { params: { id: agent.id }, signal })
  ).data;
  if (!isCurrent()) return;
  if (sameCollectionIds(current.collectionIds, collectionIds)) {
    onPrepared(agent, current);
    return { agent, bindings: current };
  }
  const expected = options.bindings;
  if (
    expected
      ? expected.agentId !== agent.id || expected.version !== current.version
      : current.collectionIds.length > 0
  )
    throw new Error("资料范围已在其他地方更新。请重新读取、核对选择后再保存。");
  // Remember an acknowledged creation even if binding or opening chat later fails.
  // A conflict must keep the old expected version until the user explicitly reloads.
  onPrepared(agent, current);
  const saved = await api("bindAgentResearchCollections", {
    params: { id: agent.id },
    body: { expectedVersion: current.version, collectionIds },
    signal,
  });
  if (!isCurrent()) return;
  onPrepared(agent, saved.data);
  return { agent, bindings: saved.data };
}
