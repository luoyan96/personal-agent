import { app } from "electron";
import { join } from "node:path";
import { createMainWindow } from "./windowManage";
import { createTray } from "./trayManage";
import { setIpcMainListener } from "./ipcHandlerManage";
import { setAppGlobalData, setAppListener, setSingleInstance } from "./appManage";
import createAppMenu from "./menuManage";
import { isLinux } from "../utils";
import { getLogger } from "../utils/log";
import { initI18n } from "../i18n";
import { smokeProgress } from "../utils/smoke";

export const logger = getLogger(join(app.getPath("userData"), `/OpenIMData/logs`));

const init = () => {
  smokeProgress("app-ready");
  initI18n();
  createMainWindow();
  if (process.env.OPENIM_SMOKE_TEST !== "1" && process.env.OPENIM_HIDE_WINDOW !== "1") {
    createAppMenu();
    createTray();
  }
};

setAppGlobalData();
setIpcMainListener();
setSingleInstance();
setAppListener(init);

app.whenReady().then(() => {
  isLinux ? setTimeout(init, 300) : init();
});
