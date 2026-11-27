export const IpcMainToRender = {
  appResume: "appResume",
  windowMaximizedChanged: "windowMaximizedChanged",
};

export const IpcRenderToMain = {
  showMainWindow: "showMainWindow",
  clearSession: "clearSession",
  minimizeWindow: "minimizeWindow",
  maxmizeWindow: "maxmizeWindow",
  isWindowMaximized: "isWindowMaximized",
  closeWindow: "closeWindow",
  showMessageBox: "showMessageBox",
  setKeyStore: "setKeyStore",
  getKeyStore: "getKeyStore",
  getKeyStoreSync: "getKeyStoreSync",
  showInputContextMenu: "showInputContextMenu",
  getDataPath: "getDataPath",
};
