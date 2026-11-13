import { app, ipcMain, net, shell, type IpcMainInvokeEvent } from "electron";
import { createHash } from "node:crypto";
import path from "node:path";
const { TeamRepositoryBinding } =
  require("./localDshRuntime") as typeof import("@research-agent-platform/contracts");
import { authority } from "./localFolderManage";
import { desktopSessionCookie } from "../utils/desktopServer";
import { getResearchServiceStatus } from "./windowManage";
import { TeamLibraryStore, gitRunner, discoverRepository } from "../utils/teamLibrary";
import type { TeamLibraryEntry } from "@research-agent-platform/contracts";
import type { TeamLibrarySelection } from "../../src/types/teamLibrary";

const stores = new Map<string, TeamLibraryStore>();
/** Account, team and repository are resolved from the current server session, never IPC ids. */
async function teamLibrarySession(event: IpcMainInvokeEvent) {
  const owner = authority(event),
    service = new URL(getResearchServiceStatus().address).origin;
  const origin = new URL(owner.contents.getURL()).origin;
  const name = origin === service ? "rap_session" : desktopSessionCookie(service);
  const cookie = async () =>
    (await owner.contents.session.cookies.get({ url: origin, name }))[0]?.value;
  const token = await cookie();
  if (!token || !/^[A-Za-z0-9_-]{16,256}$/.test(token))
    throw Error("请先登录 AcceptCat。");
  const valid = async () => {
    if (
      authority(event).owner !== owner.owner ||
      (await cookie()) !== token ||
      new URL(getResearchServiceStatus().address).origin !== service
    )
      throw Error("账号已变化，请重新打开资料。");
  };
  const request = (url: string) =>
    new Promise<any>((resolve, reject) => {
      const req = net.request({
        url: service + url,
        session: owner.contents.session,
        useSessionCookies: false,
        redirect: "error",
      });
      req.setHeader("Cookie", "rap_session=" + token);
      const timer = setTimeout(() => {
        req.abort();
        reject(Error("无法核对课题组权限，请检查连接后重试。"));
      }, 10000);
      const fail = () => {
        clearTimeout(timer);
        reject(Error("无法核对课题组权限，请检查连接后重试。"));
      };
      req.on("error", fail);
      req.on("response", (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("error", fail);
        res.on("data", (b) => {
          size += b.length;
          if (size > 1048576) {
            req.abort();
            fail();
          } else chunks.push(Buffer.from(b));
        });
        res.on("end", () => {
          clearTimeout(timer);
          try {
            if (res.statusCode !== 200) throw Error();
            resolve(JSON.parse(Buffer.concat(chunks).toString()).data);
          } catch {
            reject(Error("资料接口不可用或权限已变化；需要配套 0.44 后台。"));
          }
        });
      });
      req.end();
    });
  const member = await request("/api/v1/auth/session"),
    status = await request("/api/v1/library/repository");
  await valid();
  if (typeof member.member?.id !== "string") throw Error("无法核对资料账号。");
  return { member, status, service, valid, request };
}
export async function teamLibraryContext(event: IpcMainInvokeEvent) {
  const { member, status, service, valid, request } = await teamLibrarySession(event);
  const binding = TeamRepositoryBinding.parse(status.binding);
  const identity = createHash("sha256")
    .update(JSON.stringify([service, member.member.id, binding]))
    .digest("hex");
  // A runner is bound to this request's session lease, not a retained cookie.
  const root = path.join(app.getPath("userData"), "team-library", identity);
  let store = stores.get(identity);
  // Each operation gets a fresh fence; concurrent operations share the same store/queue.
  // No secrets are persisted in either cache or manifest.
  const guarded =
    (base: ReturnType<typeof gitRunner>) =>
    async (...args: Parameters<ReturnType<typeof gitRunner>>) => {
      await valid();
      if (args[0][0] === "push") {
        const current = await request("/api/v1/library/repository");
        if (JSON.stringify(current.binding) !== JSON.stringify(binding))
          throw Error("仓库配置已变化，请重新同步后提交。");
      }
      const value = await base(...args);
      await valid();
      return value;
    };
  if (!store) {
    store = new TeamLibraryStore(root, binding);
    stores.set(identity, store);
  }
  // Use a lease-specific facade while serializing access per identity below.
  const scoped = new TeamLibraryStore(
    root,
    binding,
    guarded(gitRunner(path.join(store.directory, "objects.git"))),
  );
  const current = async () => {
    await valid();
    const status = await request("/api/v1/library/repository");
    if (JSON.stringify(status.binding) !== JSON.stringify(binding))
      throw Error("课题组或仓库已变化，请重新打开资料。");
    await valid();
  };
  return {
    store: scoped,
    valid,
    current,
    request,
    binding,
    identity,
    memberId: member.member.id as string,
  };
}
const operations = new Map<string, Promise<unknown>>();
async function inContext<T>(
  event: IpcMainInvokeEvent,
  action: (c: Awaited<ReturnType<typeof teamLibraryContext>>) => Promise<T>,
) {
  const c = await teamLibraryContext(event),
    previous = operations.get(c.identity) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      await c.valid();
      const result = await action(c);
      await c.current();
      return result;
    });
  operations.set(c.identity, next);
  try {
    return await next;
  } finally {
    if (operations.get(c.identity) === next) operations.delete(c.identity);
  }
}
export function registerTeamLibraryBridge(discover = discoverRepository) {
  ipcMain.handle("team-library-discover", async (event, url: unknown) => {
    const c = await teamLibrarySession(event);
    if (!c.status.canConfigure) throw Error("只有课题组负责人可以连接团队仓库。");
    const previous = c.status.binding
      ? TeamRepositoryBinding.parse(c.status.binding)
      : null;
    const check = async () => {
      await c.valid();
      const status = await c.request("/api/v1/library/repository");
      const session = await c.request("/api/v1/auth/session");
      if (
        !status.canConfigure ||
        JSON.stringify(status.binding) !== JSON.stringify(c.status.binding) ||
        session.member?.id !== c.member.member.id ||
        session.member?.labId !== c.member.member.labId
      )
        throw Error("课题组、权限或仓库已变化，请重新连接。");
      await c.valid();
    };
    const root = path.join(app.getPath("userData"), "team-library-connect");
    const value = await discover(root, url, previous, (directory) => {
      const run = gitRunner(directory);
      return async (...args) => {
        await c.valid();
        const result = await run(...args);
        await c.valid();
        return result;
      };
    });
    await check();
    return value;
  });
  ipcMain.handle("team-library-cached", (e) => inContext(e, (c) => c.store.cached()));
  ipcMain.handle("team-library-sync", (e) =>
    inContext(e, async (c) => {
      try {
        return await c.store.sync();
      } catch (error) {
        const cached = await c.store.cached();
        if (!cached) throw error;
        return {
          ...cached,
          stale: true,
          warning: error instanceof Error ? error.message : "同步失败，保留上次版本。",
        };
      }
    }),
  );
  ipcMain.handle("team-library-preview", (e, s: TeamLibrarySelection) =>
    inContext(e, async (c) => {
      const { entry, bytes } = await c.store.read(s),
        ext = path
          .extname(entry.source.kind === "git" ? entry.source.path : "")
          .toLowerCase();
      if ([".md", ".txt", ".json", ".csv", ".bib"].includes(ext)) {
        const text = bytes.toString("utf8");
        return {
          kind: "text",
          text: text.slice(0, 200000),
          truncated: text.length > 200000,
        };
      }
      const type: Record<string, string> = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
      };
      if (type[ext])
        return {
          kind: "image",
          dataUrl: `data:${type[ext]};base64,${bytes.toString("base64")}`,
        };
      return { kind: "file", name: entry.name, size: bytes.length };
    }),
  );
  ipcMain.handle("team-library-open", (e, s: TeamLibrarySelection) =>
    inContext(e, async (c) => {
      const value = await c.store.materialize(s);
      // Reveal instead of launching untrusted executables/macros from a repository.
      await c.valid();
      shell.showItemInFolder(value.file);
    }),
  );
  ipcMain.handle(
    "team-library-propose",
    (e, revision: string, entry: TeamLibraryEntry, text?: string) =>
      inContext(e, async (c) => {
        if (entry?.source?.kind === "shared") {
          const selected = entry.source;
          const detail = await c.request(
            "/api/v1/research-library/files/" + encodeURIComponent(entry.source.fileId),
          );
          const collections = await c.request(
            "/api/v1/research-library/collections?scope=visible&limit=100",
          );
          if (
            !collections.some(
              (v: any) =>
                v.id === detail.file.collectionId &&
                ["lab_shared", "public"].includes(v.scope),
            ) ||
            detail.file.status !== "available" ||
            !detail.versions.some(
              (v: any) =>
                v.version === selected.version && v.sha256 === selected.sha256,
            )
          )
            throw Error("只能登记当前可访问且版本一致的团队共享原件。");
        }
        return c.store.propose(revision, entry, text);
      }),
  );
  ipcMain.handle("team-library-changes", (e) => inContext(e, (c) => c.store.changes()));
  ipcMain.handle(
    "team-library-project",
    (e, revision: string, project: { id: string; name: string; description: string }) =>
      inContext(e, (c) => c.store.proposeProject(revision, project)),
  );
}
