import { BrowserWindow, Menu, app, dialog, ipcMain } from "electron";
import { pathToFileURL } from "node:url";
import {
  clearCache,
  closeWindow,
  minimize,
  showWindow,
  splashEnd,
  updateMaximize,
  connectResearchService,
  getResearchServiceStatus,
} from "./windowManage";
import { t } from "i18next";
import { IpcRenderToMain } from "../constants";
import { getStore } from "./storeManage";
import { changeLanguage } from "../i18n";
import { registerLocalFolderBridge } from "./localFolderManage";
import { registerDesktopWorkBridge } from "./desktopWorkManage";
import { registerDesktopUpdateBridge } from "./updateManage";

const store = getStore();
const assertLocalConnectionPage = (event: Electron.IpcMainInvokeEvent) => {
  if (
    event.senderFrame !== event.sender.mainFrame ||
    event.senderFrame.url.split("#")[0] !==
      pathToFileURL(global.pathConfig.indexHtml).href
  )
    throw new Error("仅本机连接页面可管理科研服务入口");
};
const readPreference = (key: unknown) => {
  if (key !== "closeAction" && key !== "language")
    throw new Error("不允许读取此桌面设置");
  return store.get(key);
};

export const setIpcMainListener = () => {
  registerLocalFolderBridge();
  registerDesktopWorkBridge();
  registerDesktopUpdateBridge();
  ipcMain.handle("research-service-status", (event) => {
    assertLocalConnectionPage(event);
    return getResearchServiceStatus();
  });
  ipcMain.handle("configure-research-service", (event, address) => {
    assertLocalConnectionPage(event);
    return connectResearchService(address);
  });
  ipcMain.handle(IpcRenderToMain.clearSession, () => {
    clearCache();
  });

  // window manage
  ipcMain.handle("changeLanguage", (_, locale) => {
    store.set("language", locale);
    changeLanguage(locale).then(() => {
      app.relaunch();
      app.exit(0);
    });
  });
  ipcMain.handle("main-win-ready", () => {
    splashEnd();
  });
  ipcMain.handle(IpcRenderToMain.showMainWindow, () => {
    showWindow();
  });
  ipcMain.handle(IpcRenderToMain.minimizeWindow, () => {
    minimize();
  });
  ipcMain.handle(IpcRenderToMain.maxmizeWindow, () => {
    updateMaximize();
  });
  ipcMain.handle(IpcRenderToMain.closeWindow, () => {
    closeWindow();
  });
  ipcMain.handle(IpcRenderToMain.showMessageBox, (_, options) => {
    return dialog
      .showMessageBox(BrowserWindow.getFocusedWindow(), options)
      .then((res) => res.response);
  });

  // data transfer
  ipcMain.handle(IpcRenderToMain.setKeyStore, (_, { key, data }) => {
    if (key !== "closeAction" || !["miniSize", "quit"].includes(data))
      throw new Error("不允许修改此桌面设置");
    store.set(key, data);
  });
  ipcMain.handle(IpcRenderToMain.getKeyStore, (_, { key }) => {
    return readPreference(key);
  });
  ipcMain.on(IpcRenderToMain.getKeyStoreSync, (e, { key }) => {
    try {
      e.returnValue = readPreference(key);
    } catch {
      e.returnValue = null;
    }
  });
  ipcMain.handle(IpcRenderToMain.showInputContextMenu, () => {
    const menu = Menu.buildFromTemplate([
      {
        label: t("system.copy"),
        type: "normal",
        role: "copy",
        accelerator: "CommandOrControl+c",
      },
      {
        label: t("system.paste"),
        type: "normal",
        role: "paste",
        accelerator: "CommandOrControl+v",
      },
      {
        label: t("system.selectAll"),
        type: "normal",
        role: "selectAll",
        accelerator: "CommandOrControl+a",
      },
    ]);
    menu.popup({
      window: BrowserWindow.getFocusedWindow()!,
    });
  });
  ipcMain.on(IpcRenderToMain.getDataPath, (e, key: string) => {
    switch (key) {
      case "public":
        e.returnValue = global.pathConfig.publicPath;
        break;
      case "sdkResources":
        e.returnValue = global.pathConfig.sdkResourcesPath;
        break;
      case "logsPath":
        e.returnValue = global.pathConfig.logsPath;
        break;
      default:
        e.returnValue = global.pathConfig.publicPath;
        break;
    }
  });
};
