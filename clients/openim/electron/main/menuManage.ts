import { app, BrowserWindow, Menu } from "electron";
import { t } from "i18next";
import { isMac } from "../utils";
import { editingMenu, inputContextMenu, type EditingLabels } from "../utils/editingMenu";

const labels = (): EditingLabels => ({
  undo: t("system.undo"), redo: t("system.redo"), cut: t("system.cut"),
  copy: t("system.copy"), paste: t("system.paste"), delete: t("system.delete"),
  selectAll: t("system.selectAll"),
});
let inputMenusRegistered = false;

function registerInputMenus() {
  if (inputMenusRegistered) return;
  inputMenusRegistered = true;
  // Install before windows/views are created: settings, dialogs and embedded DSH
  // all receive standard editing without per-field clipboard IPC or handlers.
  app.on("web-contents-created", (_event, contents) => {
    contents.on("context-menu", (_event, params) => {
      const template = inputContextMenu(params, labels());
      if (!template.length || contents.isDestroyed()) return;
      const window = BrowserWindow.fromWebContents(contents);
      Menu.buildFromTemplate(template).popup({ ...(window ? { window } : {}) });
    });
  });
}

const createAppMenu = () => {
  registerInputMenus();
  const edit = { label: t("system.edit"), submenu: editingMenu(labels()) };
  if (isMac) {
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: app.getName(),
        submenu: [
          { label: t("system.about"), role: "about" },
          { type: "separator" },
          { label: t("system.hide"), role: "hide" },
          { type: "separator" },
          {
            label: t("system.quit"),
            click: () => {
              global.forceQuit = true;
              app.quit();
            },
          },
        ],
      },
      edit,
      {
        label: t("system.window"),
        role: "window",
        submenu: [
          { label: t("system.minimize"), role: "minimize", accelerator: "CmdOrCtrl+W" },
          { label: t("system.close"), role: "close" },
        ],
      },
    ];

    Menu.setApplicationMenu(Menu.buildFromTemplate(template));
  } else {
    // Keep explicit native editing roles/accelerators instead of relying only
    // on Chromium defaults. Hide the bar rather than removing these actions.
    Menu.setApplicationMenu(Menu.buildFromTemplate([edit]));
  }
};

export default createAppMenu;
