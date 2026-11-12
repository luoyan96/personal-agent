import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { authority } from "./localFolderManage";
import { credentials, sessionMemberId } from "./chatHistoryManage";
import { getWebContents } from "./windowManage";
import { WeChatShareInbox } from "../utils/wechatShareInbox";

const { registerWeChatImport } = require("./wechatImportRuntime");
const inbox = () =>
  new WeChatShareInbox(
    path.join(
      process.env.LOCALAPPDATA || app.getPath("userData"),
      "AcceptCat",
      "ShareInbox",
    ),
  );
let shareInbox: WeChatShareInbox | undefined;
function shares() {
  return (shareInbox ??= inbox());
}

export async function receiveWindowsShare(argv: string[]) {
  const arg = argv.find((value) => /^--acceptcat-share=[a-f0-9]{32}$/.test(value));
  if (!arg) return;
  await shares().accept(arg.slice("--acceptcat-share=".length));
  try {
    getWebContents().send("wechat-share-arrived");
  } catch {
    /* Cold start is read through pending(). */
  }
}

export function registerWeChatImportBridge() {
  let revision = 0;
  let current:
    | {
        scope: string;
        owner: string;
        credentials: NonNullable<Awaited<ReturnType<typeof credentials>>>;
      }
    | undefined;
  const authorize = async (event: Electron.IpcMainInvokeEvent, scope: string) => {
    const lease = current;
    if (
      !lease ||
      scope !== lease.scope ||
      authority(event).owner !== lease.credentials.owner
    )
      throw Error("会话已变化，请重新导入。");
    const now = await credentials(event);
    if (
      current !== lease ||
      !now ||
      now.token !== lease.credentials.token ||
      now.service !== lease.credentials.service ||
      now.owner !== lease.credentials.owner
    )
      throw Error("账号或会话已变化，请重新导入。");
    return lease.owner;
  };
  const dispose = registerWeChatImport({
    ipcMain,
    dialog,
    authorize,
    getWindow: (event: Electron.IpcMainInvokeEvent) =>
      BrowserWindow.fromWebContents(event.sender),
    selectArchive: async (
      _event: Electron.IpcMainInvokeEvent,
      _scope: string,
      id: unknown,
      window: BrowserWindow,
    ) => {
      if (id !== undefined) {
        if (typeof id !== "string") throw Error("分享批次无效。");
        const batch = await shares().selected(id);
        return { canceled: false, filePaths: [batch.file], displayName: batch.name };
      }
      return dialog.showOpenDialog(window, {
        title: "导入微信分享包",
        filters: [{ name: "微信分享包", extensions: ["zip"] }],
        properties: ["openFile"],
      });
    },
  });
  ipcMain.handle("wechat-import-context", async (event, value) => {
    authority(event);
    const version = ++revision;
    current = undefined;
    dispose.clear();
    if (value === null) return null;
    if (
      !value ||
      typeof value.conversationID !== "string" ||
      !value.conversationID ||
      value.conversationID.length > 256 ||
      typeof value.memberId !== "string" ||
      typeof value.visit !== "string" ||
      !/^[a-f0-9-]{36}$/.test(value.visit)
    )
      throw Error("请先打开已登录的聊天会话。");
    const auth = await credentials(event);
    if (!auth || (await sessionMemberId(auth)) !== value.memberId)
      throw Error("请重新登录后导入。");
    const verified = await credentials(event);
    if (
      version !== revision ||
      !verified ||
      verified.token !== auth.token ||
      verified.owner !== auth.owner ||
      verified.service !== auth.service
    )
      throw Error("会话已变化，请重新导入。");
    const scope = randomUUID();
    current = {
      scope,
      credentials: verified,
      owner: JSON.stringify([
        auth.owner,
        value.memberId,
        value.conversationID,
        version,
        scope,
      ]),
    };
    return scope;
  });
  ipcMain.handle("wechat-import-pending", async (event, scope: string) => {
    await authorize(event, scope);
    return shares().pending();
  });
  ipcMain.handle("wechat-import-registration", async (event, scope: string) => {
    await authorize(event, scope);
    if (process.platform !== "win32" || !app.isPackaged) return false;
    return new Promise<boolean>((resolve) => {
      execFile(
        path.join(process.resourcesPath, "windows-share", "AcceptCat.ShareTarget.exe"),
        ["--registration-check"],
        { windowsHide: true, timeout: 5000 },
        (error) => resolve(!error),
      );
    });
  });
  ipcMain.handle(
    "wechat-import-acknowledge",
    async (event, scope: string, id: string) => {
      await authorize(event, scope);
      await shares().acknowledge(id);
    },
  );
  app.once("before-quit", () => {
    current = undefined;
    revision++;
    dispose();
  });
}
