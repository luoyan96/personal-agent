import { app, ipcMain, net, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { authority } from "./localFolderManage";
import { getResearchServiceStatus } from "./windowManage";
import { desktopSessionCookie } from "../utils/desktopServer";
import { ChatHistoryDatabase } from "../utils/chatHistory";
import { knownMember, rememberIdentity } from "../utils/chatHistoryIdentity";
import type { ChatHistoryBridge } from "../../src/types/chatHistory";

type Credentials = { owner: string; service: string; token: string; session: Electron.Session };
type Lease = Credentials & { db: ChatHistoryDatabase };

/**
 * Reads the session cookie this machine already holds. The desktop build keeps
 * it under a hashed name on the local origin; a build served from the service
 * origin keeps `rap_session` directly.
 */
async function credentials(event: IpcMainInvokeEvent): Promise<Credentials | null> {
  const auth = authority(event);
  const service = new URL(getResearchServiceStatus().address).origin;
  const origin = new URL(auth.contents.getURL()).origin;
  const name = origin === service ? "rap_session" : desktopSessionCookie(service);
  const token = (
    await auth.contents.session.cookies.get({ url: origin, name })
  )[0]?.value;
  if (!token || !/^[A-Za-z0-9_-]{16,256}$/.test(token)) return null;
  // A closed or replaced window must not keep a lease alive.
  if (authority(event).owner !== auth.owner) return null;
  return { owner: auth.owner, service, token, session: auth.contents.session };
}

/**
 * The account is decided by the server, not by the renderer: the cookie is
 * exchanged for the member it belongs to. A page cannot ask for someone
 * else's transcript by passing a different id.
 */
function sessionMemberId(current: Credentials) {
  return new Promise<string>((resolve, reject) => {
    const request = net.request({
      url: current.service + "/api/v1/auth/session",
      session: current.session,
      useSessionCookies: false,
      redirect: "error",
    });
    request.setHeader("Cookie", "rap_session=" + current.token);
    const timer = setTimeout(() => {
      request.abort();
      reject(new Error("账号核对超时。"));
    }, 10000);
    request.on("error", () => {
      clearTimeout(timer);
      reject(new Error("无法核对聊天账号。"));
    });
    request.on("response", (response) => {
      const chunks: Buffer[] = [];
      let bytes = 0;
      response.on("error", () => {
        clearTimeout(timer);
        reject(new Error("无法核对聊天账号。"));
      });
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes > 1048576) request.abort();
        else chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => {
        clearTimeout(timer);
        try {
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (response.statusCode !== 200 || typeof body.data?.member?.id !== "string")
            throw new Error();
          resolve(body.data.member.id as string);
        } catch {
          reject(new Error("聊天登录已失效。"));
        }
      });
    });
    request.end();
  });
}

export function registerChatHistoryBridge() {
  const leases = new Map<string, Lease>();
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
    const current = await credentials(event);
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
    let current: Credentials | null;
    try {
      current = await credentials(event);
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
      void sessionMemberId(current)
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
        memberId = await sessionMemberId(current);
      } catch {
        return null;
      }
      rememberIdentity(identity, current.service, current.token, memberId);
    }
    const verified = await credentials(event);
    if (
      !verified ||
      verified.owner !== current.owner ||
      verified.token !== current.token
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
  ];
  for (const method of methods)
    ipcMain.handle(
      `chat-history-${method}`,
      async (event, lease: string, ...args: unknown[]) => {
        const current = await authorize(event, lease);
        return (
          current.db[method] as unknown as (...values: unknown[]) => unknown
        ).apply(current.db, args);
      },
    );
}
