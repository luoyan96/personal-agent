import { app, BrowserWindow, dialog, ipcMain, powerMonitor, shell, type IpcMainInvokeEvent } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import { DesktopUpdates } from "../utils/desktopUpdates";
import { getWebContents, getResearchServiceStatus, showWindow } from "./windowManage";
import type { DesktopUpdateSnapshot } from "../../src/types/desktopUpdates";

const releasePage = "https://github.com/luoyan96/personal-agent/releases/latest";
let updates: DesktopUpdates | undefined;
let promptBusy = false;
let starting = false;
function mainWindow() {
  const contents = getWebContents();
  return contents && !contents.isDestroyed()
    ? BrowserWindow.fromWebContents(contents)
    : null;
}
function installedWindows() {
  return (
    process.platform === "win32" &&
    app.isPackaged &&
    fs.existsSync(
      path.join(path.dirname(app.getPath("exe")), "Uninstall ResearchWeChat.exe"),
    )
  );
}
function snapshot(): DesktopUpdateSnapshot {
  return {
    ...(updates?.state || { phase: "idle", currentVersion: app.getVersion() }),
    supported: installedWindows(),
  };
}

// Only the bundled main-frame UI can observe or act on the fixed release feed.
function authority(event: IpcMainInvokeEvent, action = false) {
  const contents = getWebContents();
  const expected = getResearchServiceStatus().rendererOrigin;
  if (
    !expected || contents.isDestroyed() || event.sender !== contents ||
    event.senderFrame !== contents.mainFrame || (action && contents.isLoadingMainFrame())
  ) throw new Error("仅桌面主窗口可管理更新");
  const url = new URL(event.senderFrame.url);
  if (url.origin !== expected || new URL(contents.getURL()).origin !== expected)
    throw new Error("仅桌面主窗口可管理更新");
  return `${contents.id}:${event.senderFrame.processId}:${event.senderFrame.routingId}`;
}

export function registerDesktopUpdateBridge() {
  ipcMain.handle("desktop-update-state", (event) => {
    authority(event);
    return snapshot();
  });
  ipcMain.handle("desktop-update-action", async (event, action: unknown, version: unknown) => {
    const owner = authority(event, true);
    if (!installedWindows() || !updates) throw new Error("更新需要 Windows 安装版");
    if (action === "check") {
      await updates.check();
    } else if (action === "download") {
      if (updates.state.phase !== "available" || version !== updates.state.version)
        return snapshot();
      await updates.download();
    } else if (action === "install") {
      if (updates.state.phase !== "downloaded" || version !== updates.state.version)
        return snapshot();
      // Keep the native confirmation so a web script cannot silently restart the app.
      await present(() => authority(event, true) === owner);
    } else throw new Error("不支持此更新操作");
    if (authority(event, true) !== owner) throw new Error("桌面窗口已改变，请重试");
    return snapshot();
  });
}
async function message(options: Electron.MessageBoxOptions) {
  const win = mainWindow();
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}
async function present(stillAllowed: () => boolean = () => true) {
  if (!updates || promptBusy) return;
  const state = { ...updates.state };
  promptBusy = true;
  try {
    if (state.phase === "available") {
      const result = await message({
        type: "info",
        title: "发现新版本",
        message: `科研微信 ${state.version} 可以更新了`,
        detail: `当前版本：${state.currentVersion}\n${
          state.notes || "改进与修复见项目发布说明。"
        }\n\n点击后开始下载。下载完成后可选择安装并重启，请先发送或保存未完成的内容。`,
        buttons: ["下载更新", "稍后"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      promptBusy = false;
      if (
        result.response !== 0 ||
        updates.state.phase !== "available" ||
        updates.state.version !== state.version
      )
        return;
      await updates.download();
      await present();
      return;
    }
    if (state.phase === "downloaded") {
      const result = await message({
        type: "info",
        title: "更新已准备好",
        message: `科研微信 ${state.version} 已下载并校验`,
        detail:
          "安装会关闭并重新打开科研微信。请先发送或保存未完成的内容。选择稍后不会在退出软件时自动安装。",
        buttons: ["安装并重启", "稍后"],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (
        result.response === 0 &&
        stillAllowed() &&
        updates.state.phase === "downloaded" &&
        updates.state.version === state.version
      )
        updates.install();
      return;
    }
    const detail =
      state.phase === "current"
        ? "当前已是最新版本。"
        : state.phase === "downloading"
        ? `正在下载更新：${Math.floor(
            state.percent || 0,
          )}%。下载进度也会显示在任务栏图标上。`
        : state.phase === "installing"
        ? "正在启动安装程序。"
        : state.phase === "error"
        ? "更新暂时失败，当前软件可以继续使用。请检查网络后重新选择“检查更新”，或从项目发布页下载安装包。"
        : "正在检查更新，请稍候。";
    await message({
      type: state.phase === "error" ? "warning" : "info",
      title: "软件更新",
      message: `科研微信 ${state.currentVersion}`,
      detail,
      buttons: ["知道了"],
      noLink: true,
    });
  } finally {
    promptBusy = false;
  }
}
async function performDesktopUpdateCheck(manual: boolean) {
  if (!installedWindows()) {
    if (!manual) return;
    const result = await message({
      type: "info",
      title: "软件更新",
      message: `科研微信 ${app.getVersion()}`,
      detail:
        "自动更新适用于 Windows 安装版。请先下载安装版，并从桌面快捷方式启动；免安装文件夹不会被自动替换。",
      buttons: ["打开安装包下载页", "关闭"],
      defaultId: 0,
      cancelId: 1,
      noLink: true,
    });
    if (result.response === 0) await shell.openExternal(releasePage);
    return;
  }
  if (!updates) return;
  if (manual) showWindow();
  await updates.check();
  if (manual) await present();
}
export async function checkDesktopUpdates(manual = true) {
  try {
    await performDesktopUpdateCheck(manual);
  } catch {
    /* A closed window or unavailable OS dialog must not terminate chat. */
  }
}
export function initDesktopUpdates() {
  if (starting || process.env.OPENIM_SMOKE_TEST === "1") return;
  if (!installedWindows()) return;
  starting = true;
  // The renderer can request only fixed actions for the verified current candidate;
  // it cannot choose a feed URL, executable path, GitHub token or TLS policy.
  updates = new DesktopUpdates(
    autoUpdater,
    app.getVersion(),
    (state) => {
      const win = mainWindow();
      win?.setProgressBar(
        state.phase === "downloading" ? (state.percent || 0) / 100 : -1,
      );
      const contents = win?.webContents;
      if (contents && !contents.isDestroyed())
        contents.send("desktop-update-state-changed", snapshot());
    },
    () => {
      global.forceQuit = true;
    },
    () => {
      global.forceQuit = false;
    },
  );
  const first = setTimeout(() => void checkDesktopUpdates(false), 15000);
  const periodic = setInterval(
    () => void checkDesktopUpdates(false),
    6 * 60 * 60 * 1000,
  );
  first.unref();
  periodic.unref();
  powerMonitor.on("resume", () => void checkDesktopUpdates(false));
  app.once("before-quit", () => {
    clearTimeout(first);
    clearInterval(periodic);
  });
}
