import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  copyPersonalFiles,
  ensurePersonalLibrary,
  hashLibraryFile,
  registeredLibraryFolder,
  registeredLibraryRoot,
  resolveLibraryFile,
  scanLibrary,
  sharedLibraryFolder,
  type LocalLibraryManifest,
} from "../utils/localLibrary";
import { desktopCredentials, desktopSessionMemberId } from "./desktopAccount";

const userData = () => app.getPath("userData");

function senderWindow(event: Electron.IpcMainInvokeEvent) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window || window.isDestroyed())
    throw new Error("本地资料文件夹只能在这个窗口里使用。");
  return window;
}

const verifiedAccounts = new WeakMap<Electron.Session, {
  service: string;
  token: string;
  memberId: Promise<string>;
}>();

async function personalFolder(event: Electron.IpcMainInvokeEvent) {
  const current = await desktopCredentials(event);
  if (!current) throw new Error("请登录 DeepChat 后打开我的资料。");

  const valid = async () => {
    const next = await desktopCredentials(event);
    if (!next || next.owner !== current.owner || next.service !== current.service ||
        next.token !== current.token || next.session !== current.session)
      throw new Error("登录已变化，请重新打开我的资料。");
  };

  // Once verified, this exact login can use local files during a network outage.
  let verified = verifiedAccounts.get(current.session);
  if (verified?.service !== current.service || verified.token !== current.token) {
    const lookup = desktopSessionMemberId(current);
    verified = { service: current.service, token: current.token, memberId: lookup };
    verifiedAccounts.set(current.session, verified);
    void lookup.catch(() => {
      if (verifiedAccounts.get(current.session)?.memberId === lookup)
        verifiedAccounts.delete(current.session);
    });
  }
  const memberId = await verified.memberId;
  await valid();
  const identity = createHash("sha256")
    .update(JSON.stringify([current.service, memberId]))
    .digest("hex");
  const root = await ensurePersonalLibrary(userData(), identity);
  await valid();
  return { root, valid };
}

export function registerLocalLibraryBridge() {
  ipcMain.handle("local-library-status", async (event) => {
    senderWindow(event);
    const directory = userData();
    const root = await registeredLibraryRoot(directory);
    if (!root) return { registered: false as const };
    const available = await sharedLibraryFolder(directory, root).then(() => true, () => false);
    return {
      registered: true as const,
      available,
      root,
      name: path.basename(root),
    };
  });
  ipcMain.handle(
    "local-library-pick",
    async (event): Promise<LocalLibraryManifest | null> => {
      const window = senderWindow(event);
      const result = await dialog.showOpenDialog(window, {
        title: "选择课题组原件所在的本地文件夹",
        properties: ["openDirectory", "dontAddToRecent"],
      });
      if (result.canceled || result.filePaths.length !== 1) return null;
      const directory = userData();
      const { root, excludedRoot } = await sharedLibraryFolder(directory, result.filePaths[0]!);
      const manifest = await scanLibrary(root, { excludedRoot });
      await fs.writeFile(path.join(directory, "local-library.json"), JSON.stringify({ root }), "utf8");
      return manifest;
    },
  );
  ipcMain.handle("local-library-hash", async (event, rel: string) => {
    senderWindow(event);
    const { root, excludedRoot } = await registeredLibraryFolder(userData());
    return hashLibraryFile(root, rel, excludedRoot);
  });
  ipcMain.handle("local-library-scan", async (event): Promise<LocalLibraryManifest> => {
    senderWindow(event);
    const { root, excludedRoot } = await registeredLibraryFolder(userData());
    return scanLibrary(root, { excludedRoot });
  });
  ipcMain.handle("personal-library-status", async (event) => {
    const { root } = await personalFolder(event);
    return { registered: true as const, available: true, root, name: path.basename(root) };
  });
  ipcMain.handle("personal-library-scan", async (event): Promise<LocalLibraryManifest> => {
    const { root, valid } = await personalFolder(event);
    const manifest = await scanLibrary(root, { allFiles: true });
    await valid();
    return manifest;
  });
  ipcMain.handle("personal-library-open-folder", async (event) => {
    const { root } = await personalFolder(event);
    if (await shell.openPath(root)) throw new Error("无法打开我的资料文件夹。");
  });
  ipcMain.handle("personal-library-reveal-file", async (event, rel: string) => {
    const { root, valid } = await personalFolder(event);
    const { file } = await resolveLibraryFile(root, rel);
    await valid();
    shell.showItemInFolder(file);
  });
  ipcMain.handle("personal-library-add-files", async (event): Promise<LocalLibraryManifest | null> => {
    const { root, valid } = await personalFolder(event);
    const result = await dialog.showOpenDialog(senderWindow(event), {
      title: "添加文件到我的资料",
      properties: ["openFile", "multiSelections", "dontAddToRecent"],
    });
    await valid();
    if (result.canceled || !result.filePaths.length) return null;
    if (result.filePaths.length > 100) throw new Error("每次最多添加 100 个文件。");
    return copyPersonalFiles(root, result.filePaths, valid);
  });
}
