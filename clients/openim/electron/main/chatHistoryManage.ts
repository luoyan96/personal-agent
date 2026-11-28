import { app, ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { authority } from "./localFolderManage";
import { getResearchServiceStatus } from "./windowManage";
import { desktopCredentials, desktopSessionMemberId, type DesktopCredentials } from "./desktopAccount";
import { ChatHistoryDatabase } from "../utils/chatHistory";
import { knownMember, rememberIdentity } from "../utils/chatHistoryIdentity";
import type { ChatHistoryBridge } from "../../src/types/chatHistory";

type Lease = DesktopCredentials & { db: ChatHistoryDatabase };

export function registerChatHistoryBridge() {
  const leases = new Map<string, Lease>();
  const operations = new Map<string, Promise<unknown>>();
  const dispose = (key: string) => {
    leases.get(key)?.db.close();
    leases.delete(key);
  };
  const reset = () => {
    for (const key of [...leases.keys()]) dispose(key);
  };
  app.on("before-quit", reset);

  async function authorize(event: IpcMainInvokeEvent, key: string) {
    const lease = leases.get(key);
    if (!lease) throw new Error("本机聊天记录已关闭，请重新打开会话。");
    const current = await desktopCredentials(event);
    if (
      !current ||
      lease.owner !== current.owner ||
      lease.token !== current.token ||
      lease.service !== current.service
    ) {
      dispose(key);
      throw new Error("聊天账号已变化，请重新打开会话。");
    }
    return lease;
  }

  ipcMain.handle("chat-history-open", async (event) => {
    // No verified session means no cache: the caller falls back to the server
    // path it already had, rather than showing another account's transcript.
    if (!getResearchServiceStatus().connected) return null;
    let current: DesktopCredentials | null;
    try {
      current = await desktopCredentials(event);
    } catch {
      return null;
    }
    if (!current) return null;
    const identity = path.join(
      app.getPath("userData"),
      "chat-history",
      "identity.json",
    );
    // A cookie that was already verified as some member is proof enough to open
    // that member's file, even with no network. A new login issues a new token,
    // so a matching hash cannot be a different account.
    let memberId = knownMember(identity, current.service, current.token);
    if (memberId) {
      void desktopSessionMemberId(current)
        .then((actual) => {
          if (actual === memberId)
            rememberIdentity(identity, current!.service, current!.token, actual);
          // The account behind an unchanged cookie cannot change; a mismatch
          // only means the stored file was tampered with, so stop trusting it.
          else reset();
        })
        .catch(() => {
          // Offline: the previously verified identity still stands.
        });
    } else {
      try {
        memberId = await desktopSessionMemberId(current);
      } catch {
        return null;
      }
      rememberIdentity(identity, current.service, current.token, memberId);
    }
    const verified = await desktopCredentials(event);
    if (
      !verified ||
      verified.owner !== current.owner ||
      verified.token !== current.token ||
      verified.service !== current.service
    )
      return null;
    reset();
    const lease = randomUUID();
    leases.set(lease, {
      ...verified,
      db: new ChatHistoryDatabase(
        path.join(app.getPath("userData"), "chat-history"),
        verified.service,
        memberId,
      ),
    });
    return { lease, memberId };
  });

  ipcMain.handle("chat-history-close", (event, lease: string) => {
    if (leases.get(lease)?.owner === authority(event).owner) dispose(lease);
  });

  type Method = Exclude<keyof ChatHistoryBridge, "open" | "close">;
  const methods: Method[] = [
    "page",
    "savePage",
    "revoke",
    "remove",
    "forget",
    "readRecord",
    "saveRecord",
    "removeRecord",
  ];
  for (const method of methods)
    ipcMain.handle(
      `chat-history-${method}`,
      async (event, lease: string, ...args: unknown[]) => {
        // Credential reads are async. Preserve IPC arrival order so an old
        // snapshot cannot land after a newer tombstone or local deletion.
        const operation = (operations.get(lease) ?? Promise.resolve()).catch(() => {}).then(async () => {
          const current = await authorize(event, lease);
          return (current.db[method] as unknown as (...values: unknown[]) => unknown).apply(current.db, args);
        });
        operations.set(lease, operation);
        try { return await operation; } finally { if (operations.get(lease) === operation) operations.delete(lease); }
      },
    );
}
