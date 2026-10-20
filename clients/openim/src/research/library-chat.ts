import type { Contact } from "@research-agent-platform/contracts";
import type { researchApi } from "./api";
import { prepareLibraryAgent, type LibraryAgentBindings } from "./library-agent";
import { readLibraryFile, type LibraryFile } from "./feishu-chat";

export type LibrarySendIntent = {
  key: string;
  text: string;
  collectionIds: string[];
  agentId?: string;
  bindingVersion?: number;
  conversationId?: string;
  file?: LibraryFile;
  fileSelection?: { messageId: string };
};

export function readLibraryIntent(raw: string | null): LibrarySendIntent | undefined {
  if (!raw || raw.length > 700000) return;
  try {
    const v = JSON.parse(raw);
    const id = (value: unknown) =>
      typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value);
    if (
      !v ||
      typeof v !== "object" ||
      !id(v.key) ||
      v.key.length < 16 ||
      v.key.length > 96 ||
      typeof v.text !== "string" ||
      !v.text.trim() ||
      v.text.length > 8000 ||
      !Array.isArray(v.collectionIds) ||
      v.collectionIds.length > 20 ||
      !v.collectionIds.every(id) ||
      new Set(v.collectionIds).size !== v.collectionIds.length ||
      (v.agentId !== undefined && !id(v.agentId)) ||
      (v.conversationId !== undefined && (!id(v.conversationId) || !id(v.agentId))) ||
      (v.bindingVersion !== undefined &&
        (!Number.isSafeInteger(v.bindingVersion) || v.bindingVersion < 1)) ||
      (v.file !== undefined && !readLibraryFile(v.file)) ||
      (v.fileSelection !== undefined && !id(v.fileSelection?.messageId)) ||
      (v.file !== undefined && v.fileSelection !== undefined)
    )
      return;
    return {
      key: v.key,
      text: v.text,
      collectionIds: v.collectionIds,
      ...(v.agentId ? { agentId: v.agentId } : {}),
      ...(v.bindingVersion ? { bindingVersion: v.bindingVersion } : {}),
      ...(v.conversationId ? { conversationId: v.conversationId } : {}),
      ...(v.file ? { file: readLibraryFile(v.file)! } : {}),
      ...(v.fileSelection
        ? { fileSelection: { messageId: v.fileSelection.messageId } }
        : {}),
    };
  } catch {
    return;
  }
}

/** Retries keep the exact message and key, and never rebind collections after dispatch. */
export async function sendLibraryMessage(options: {
  api: typeof researchApi;
  actorId: string;
  intent: LibrarySendIntent;
  agent?: Contact;
  rememberedId?: string;
  signal: AbortSignal;
  isCurrent: () => boolean;
  checkpoint: (intent: LibrarySendIntent) => void;
  onPrepared: (agent: Contact, bindings: LibraryAgentBindings) => void;
}) {
  const { api, actorId, isCurrent, signal, checkpoint } = options;
  let intent = { ...options.intent };
  if (!isCurrent()) return;
  if (!intent.conversationId) {
    const expected = intent.agentId
      ? ({ ...options.agent, id: intent.agentId } as Contact)
      : undefined;
    const prepared = await prepareLibraryAgent({
      api,
      actorId,
      agent: expected,
      rememberedId: options.rememberedId,
      creationKey: `library-agent-${intent.key}`,
      bindings:
        intent.agentId && intent.bindingVersion
          ? {
              agentId: intent.agentId,
              version: intent.bindingVersion,
              collectionIds: [],
              collections: [],
            }
          : undefined,
      collectionIds: intent.collectionIds,
      signal,
      isCurrent,
      onPrepared: (agent, bindings) => {
        intent = { ...intent, agentId: agent.id, bindingVersion: bindings.version };
        checkpoint(intent);
        options.onPrepared(agent, bindings);
      },
    });
    if (!prepared || !isCurrent()) return;
    const direct = await api("createDirectConversation", {
      body: { contactId: prepared.agent.id },
      signal,
    });
    if (!isCurrent()) return;
    intent = { ...intent, conversationId: direct.data.id };
    checkpoint(intent);
  }
  const owned = await api("chatContacts", {
    query: { view: "mine", scope: "local", limit: 100 },
    signal,
  });
  if (!isCurrent()) return;
  const agent = owned.data.find(
    (c) =>
      c.id === intent.agentId &&
      c.identity.kind === "personal_agent" &&
      c.identity.ownerMemberId === actorId &&
      c.relationship.status === "own" &&
      c.profile.role === "specialist" &&
      !c.agentRuntime,
  );
  if (!agent)
    throw new Error("资料 Agent 已不可用，请核对我的 Agent 配置。原消息尚未确认。");
  const conversation = (
    await api("chatConversation", { params: { id: intent.conversationId! }, signal })
  ).data;
  if (!isCurrent()) return;
  if (
    conversation.kind !== "direct" ||
    conversation.ownerMemberId !== actorId ||
    !conversation.members.some((m) => m.contactId === agent.id && m.status === "joined")
  )
    throw new Error("资料对话与当前助手不一致，原消息尚未确认。");
  const request = {
    params: { id: intent.conversationId! },
    idempotencyKey: intent.key,
    signal,
  };
  const result = intent.file
    ? await api("agentFileMessage", {
        ...request,
        body: { ...intent.file, text: intent.text },
      })
    : await api("agentChatMessage", {
        ...request,
        body: {
          text: intent.text,
          continuous: true,
          ...(intent.fileSelection ? { fileSelection: intent.fileSelection } : {}),
        },
      });
  if (!isCurrent()) return;
  if (
    result.data.message.conversationId !== intent.conversationId ||
    (result.data.turn &&
      (result.data.turn.conversationId !== intent.conversationId ||
        result.data.turn.agentContactId !== agent.id))
  )
    throw new Error("发送回执与资料对话不一致，请核对原消息。");
  return { ...result.data, conversationId: intent.conversationId! };
}
