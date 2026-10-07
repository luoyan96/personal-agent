import { join } from "node:path";
import { app, BrowserWindow, dialog, shell } from "electron";
import { isLinux, isMac, isWin } from "../utils";
import { destroyTray } from "./trayManage";
import { getIsForceQuit } from "./appManage";
import { registerShortcuts, unregisterShortcuts } from "./shortcutManage";
import { initIMSDK } from "../utils/imsdk";
import OpenIMSDKMain from "@openim/electron-client-sdk";
import { smokeResult, smokeProgress } from "../utils/smoke";
import { getStore } from "./storeManage";
import { validateResearchServiceUrl } from "../utils/researchService";
import { desktopSessionCookie, startDesktopServer } from "../utils/desktopServer";

const url = process.env.VITE_DEV_SERVER_URL;
let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;
let sdkInstance: OpenIMSDKMain | null = null;
let attemptedServiceAddress = "";
let serviceConnectionError = "";
let serviceConnected = false;
let rendererOrigin = "";
let desktopServer: Awaited<ReturnType<typeof startDesktopServer>> | undefined;

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    frame: false,
    width: 200,
    height: 200,
    resizable: false,
    transparent: true,
  });
  splashWindow.loadFile(global.pathConfig.splashHtml);
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

export function createMainWindow() {
  const smoke = process.env.OPENIM_SMOKE_TEST === "1";
  if (!smoke && process.env.OPENIM_HIDE_WINDOW !== "1") createSplashWindow();
  mainWindow = new BrowserWindow({
    title: "科研微信",
    icon: join(global.pathConfig.publicPath, "favicon.ico"),
    frame: false,
    show: false,
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 726,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: global.pathConfig.preload,
      // Warning: Enable nodeIntegration and disable contextIsolation is not secure in production
      // Consider using contextBridge.exposeInMainWorld
      // Read more on https://www.electronjs.org/docs/latest/tutorial/context-isolation
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      devTools: true,
      webSecurity: true,
    },
  });

  smokeProgress("native-sdk-loading");
  sdkInstance = initIMSDK(mainWindow.webContents);
  smokeProgress("native-sdk-created");
  if (smoke) {
    mainWindow.webContents.once("did-finish-load", async () => {
      smokeProgress("renderer-loaded");
      try {
        let ready = false;
        for (let attempt = 0; attempt < 40 && !ready; attempt++) {
          ready = await mainWindow!.webContents.executeJavaScript(
            "Boolean((document.querySelector('input') || document.querySelector('#chat-container') || document.querySelector('.ant-alert')) && window.electronAPI && typeof window.electronAPI.getPlatform === 'function')",
          );
          if (!ready) await new Promise((resolve) => setTimeout(resolve, 100));
        }
        if (!ready || !sdkInstance)
          throw new Error("Renderer or native SDK bridge did not initialize");
        smokeResult("ready");
      } catch (error) {
        smokeResult("failed", String(error));
        process.exitCode = 1;
        mainWindow?.destroy();
      }
    });
    mainWindow.webContents.on("did-fail-load", (_event, code, description) => {
      smokeResult("failed", `${code} ${description}`);
      process.exitCode = 1;
      mainWindow?.destroy();
    });
    mainWindow.webContents.on("render-process-gone", (_event, details) =>
      smokeResult("failed", `renderer ${details.reason}`),
    );
    mainWindow.webContents.on("console-message", (_event, level, text) => {
      if (level >= 3) smokeResult("failed", `renderer: ${text}`);
    });
  }

  const researchUrl =
    process.env.RESEARCH_APP_URL ||
    (getStore().get("researchServiceUrl") as string | undefined) ||
    (app.isPackaged ? "https://chat.acceptcat.com/" : undefined);
  if (researchUrl) {
    void connectResearchService(researchUrl).catch(() => {
      if (mainWindow && !mainWindow.webContents.getURL().startsWith("file:"))
        void mainWindow.loadFile(global.pathConfig.indexHtml);
    });
  } else if (process.env.VITE_DEV_SERVER_URL) {
    // Open devTool if the app is not packaged
    mainWindow.loadURL(url);
  } else {
    mainWindow.loadFile(global.pathConfig.indexHtml);
  }

  // Test actively push message to the Electron-Renderer
  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  // // Make all links open with the browser, not with the application
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https:") || url.startsWith("http:")) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, target) => {
    const current = mainWindow?.webContents.getURL();
    if (current && new URL(target).origin !== new URL(current).origin) {
      event.preventDefault();
      if (target.startsWith("https:") || target.startsWith("http:"))
        void shell.openExternal(target);
    }
  });

  mainWindow.on("focus", () => {
    mainWindow?.flashFrame(false);
    registerShortcuts();
  });

  mainWindow.on("blur", () => {
    unregisterShortcuts();
  });

  mainWindow.on("close", (e) => {
    if (getIsForceQuit() || !mainWindow.isVisible()) {
      mainWindow = null;
      destroyTray();
    } else {
      e.preventDefault();
      if (isMac && mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
      }
      mainWindow?.hide();
    }
  });
  return mainWindow;
}

export async function connectResearchService(address: unknown) {
  const target = validateResearchServiceUrl(address);
  attemptedServiceAddress = target;
  serviceConnected = false;
  if (!mainWindow) throw new Error("桌面窗口尚未就绪");
  try {
    await desktopServer?.close();
    rendererOrigin = "";
    desktopServer = await startDesktopServer(global.pathConfig.distPath, target);
    rendererOrigin = desktopServer.origin;
    await mainWindow.loadURL(rendererOrigin);
    getStore().set("researchServiceUrl", target);
    serviceConnectionError = "";
    serviceConnected = true;
    // Chromium initializes its cookie service with the first navigation. Load
    // the bundled UI before attempting a migration on an empty new profile.
    const cookies = mainWindow.webContents.session.cookies;
    const cookieName = desktopSessionCookie(target);
    const existing = await cookies.get({ url: rendererOrigin, name: cookieName });
    if (!existing.length) {
      // Carry forward this service's own signed session after updating the desktop.
      // The token stays inside Electron's cookie store and is never sent to the UI.
      const previous = (await cookies.get({ url: target, name: "rap_session" }))[0];
      if (previous) {
        await cookies.set({ url: rendererOrigin, name: cookieName, value: previous.value,
          httpOnly: true, secure: false, path: "/", sameSite: "lax",
          ...(previous.expirationDate ? { expirationDate: previous.expirationDate } : {}) });
        mainWindow.reload();
      }
    }
  } catch {
    serviceConnectionError = "连接失败，请核对地址和网络，再重新连接。";
    rendererOrigin = "";
    await desktopServer?.close();
    desktopServer = undefined;
    await mainWindow.loadFile(global.pathConfig.indexHtml);
    throw new Error("连接失败，请核对服务地址和网络");
  }
}
export function getResearchServiceStatus() {
  return {
    connected: serviceConnected,
    rendererOrigin,
    address:
      attemptedServiceAddress || String(getStore().get("researchServiceUrl", "")),
    error: serviceConnectionError,
  };
}

export function splashEnd() {
  splashWindow?.close();
  if (process.env.OPENIM_SMOKE_TEST !== "1" && process.env.OPENIM_HIDE_WINDOW !== "1")
    mainWindow?.show();
}

// utils
export const isExistMainWindow = (): boolean =>
  !!mainWindow && !mainWindow?.isDestroyed();
export const isShowMainWindow = (): boolean => {
  if (!mainWindow) return false;
  return mainWindow.isVisible() && (isWin ? true : mainWindow.isFocused());
};

export const closeWindow = () => {
  if (!mainWindow) return;
  mainWindow.close();
};

export const hotReload = () => {
  if (!mainWindow) return;
  mainWindow.reload();
};

export const sendEvent = (name: string, ...args: any[]) => {
  if (!mainWindow) return;
  mainWindow.webContents.send(name, ...args);
};

export const showSelectDialog = async (options: Electron.OpenDialogOptions) => {
  if (!mainWindow) throw new Error("main window is undefined");
  return await dialog.showOpenDialog(mainWindow, options);
};
export const showDialog = ({
  type,
  message,
  detail,
}: Electron.MessageBoxSyncOptions) => {
  if (!mainWindow) return;
  dialog.showMessageBoxSync(mainWindow, {
    type,
    message,
    detail,
  });
};
export const showSaveDialog = async (options: Electron.SaveDialogOptions) => {
  if (!mainWindow) throw new Error("main window is undefined");
  return await dialog.showSaveDialog(mainWindow, options);
};
export const minimize = () => {
  if (!mainWindow) return;
  mainWindow.minimize();
};
export const updateMaximize = () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
};
export const toggleHide = () => {
  if (!mainWindow) return;
  mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
};
export const toggleMinimize = () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    if (!mainWindow.isVisible()) {
      mainWindow.show();
    }
    mainWindow.restore();
    mainWindow.focus();
  } else {
    mainWindow.minimize();
  }
};
export const showWindow = () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (mainWindow.isVisible()) {
    mainWindow.focus();
  } else {
    mainWindow.show();
  }
};
export const hideWindow = () => {
  if (!mainWindow) return;
  mainWindow.hide();
};
export const toggleWindowVisible = (visible: boolean) => {
  if (!mainWindow) return;
  const opacity = mainWindow.getOpacity() ? 0 : 1;
  if (Boolean(opacity) !== visible) return;
  mainWindow.setOpacity(opacity);
};
export const setProgressBar = (
  progress: number,
  options?: Electron.ProgressBarOptions,
) => {
  if (!mainWindow) return;
  mainWindow.setProgressBar(progress, options);
};
export const taskFlicker = () => {
  if (
    isMac ||
    (mainWindow.isVisible() && mainWindow.isFocused() && !isExistMainWindow())
  )
    return;
  mainWindow?.flashFrame(true);
};
export const setIgnoreMouseEvents = (
  ignore: boolean,
  options?: Electron.IgnoreMouseEventsOptions,
) => {
  if (!mainWindow) return;
  mainWindow.setIgnoreMouseEvents(ignore, options);
};
export const toggleDevTools = () => {
  if (!mainWindow) return;
  if (mainWindow.webContents.isDevToolsOpened()) {
    mainWindow.webContents.closeDevTools();
  } else {
    mainWindow.webContents.openDevTools({
      mode: "detach",
    });
  }
};

export const setFullScreen = (isFullscreen: boolean): boolean => {
  if (!mainWindow) return false;
  if (isLinux) {
    // linux It needs to be resizable before it can be full screen
    if (isFullscreen) {
      mainWindow.setResizable(isFullscreen);
      mainWindow.setFullScreen(isFullscreen);
    } else {
      mainWindow.setFullScreen(isFullscreen);
      mainWindow.setResizable(isFullscreen);
    }
  } else {
    mainWindow.setFullScreen(isFullscreen);
  }
  return isFullscreen;
};

export const clearCache = async () => {
  if (!mainWindow) throw new Error("main window is undefined");
  await mainWindow.webContents.session.clearCache();
  await mainWindow.webContents.session.clearStorageData();
};

export const getCacheSize = async () => {
  if (!mainWindow) throw new Error("main window is undefined");
  return await mainWindow.webContents.session.getCacheSize();
};

export const getWebContents = (): Electron.WebContents => {
  if (!mainWindow) throw new Error("main window is undefined");
  return mainWindow.webContents;
};
