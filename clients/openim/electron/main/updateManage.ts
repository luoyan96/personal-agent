import { app, BrowserWindow, dialog, powerMonitor, shell } from "electron";
import { autoUpdater } from "electron-updater";
import fs from "node:fs";
import path from "node:path";
import { DesktopUpdates } from "../utils/desktopUpdates";
import { getWebContents, showWindow } from "./windowManage";

const releasePage = "https://github.com/luoyan96/personal-agent/releases/latest";
let updates: DesktopUpdates | undefined;
let promptBusy = false;
let lastPromptVersion = "";
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
async function message(options: Electron.MessageBoxOptions) {
  const win = mainWindow();
  return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
}
async function present(manual: boolean) {
  if (!updates || promptBusy) return;
  const state = { ...updates.state };
  const win = mainWindow();
  if (!manual && (!win?.isVisible() || !win.isFocused())) return;
  if (!manual && state.version === lastPromptVersion) return;
  if (!manual && !["available", "downloaded"].includes(state.phase)) return;
  promptBusy = true;
  try {
    if (state.phase === "available") {
      lastPromptVersion = state.version!;
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
      await present(true);
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
  await present(manual);
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
  // Public release feed is fixed by app-update.yml; never accept a renderer URL,
  // renderer download/install IPC, GitHub token or a relaxed certificate check.
  updates = new DesktopUpdates(
    autoUpdater,
    app.getVersion(),
    (state) => {
      const win = mainWindow();
      win?.setProgressBar(
        state.phase === "downloading" ? (state.percent || 0) / 100 : -1,
      );
    },
    () => {
      global.forceQuit = true;
    },
    () => {
      global.forceQuit = false;
    },
  );
  mainWindow()?.on("focus", () => {
    void present(false).catch(() => {});
  });
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
