import { contextBridge, ipcRenderer, webUtils } from "electron";
import type { WorkbenchMaterialBridge } from "../../src/types/dshWorkbenchMaterials";

// Match DSH rc.3's desktop extension points. Keep this preload separate from
// DeepChat's application preload: the DSH document receives no app IPC or Node API.
if (process.isMainFrame && location.protocol === "http:" && location.hostname === "127.0.0.1") {
  contextBridge.exposeInMainWorld("__DSH_HOST_PATHS__", {
    // Use the same native File resolver as DSH Desktop. Synthetic browser Files
    // have no host path and retain DSH's attachment upload (as do images).
    pathFor: (file: File) => file instanceof File ? webUtils.getPathForFile(file) : "",
  });
  contextBridge.exposeInMainWorld("__DSH_DIRECTORY_PICKER__", {
    pick: () => ipcRenderer.invoke("local-dsh-pick-directory"),
  });
  const fromUser = <T>(read: () => Promise<T>) => navigator.userActivation?.isActive
    ? read()
    : Promise.reject(new Error("请从工作台中手动选择资料。"));
  const materials: WorkbenchMaterialBridge = {
    list: ({ kind, extensions }) => fromUser(() => ipcRenderer.invoke("dsh-workbench-materials-list", { kind, extensions })),
    read: ({ kind, id }) => fromUser(() => ipcRenderer.invoke("dsh-workbench-materials-read", { kind, id })),
    readMany: ({ selections }) => fromUser(() => ipcRenderer.invoke("dsh-workbench-materials-read-many", { selections })),
    pendingUseIn: () => ipcRenderer.invoke("dsh-workbench-materials-pending-use-in"),
    readUseIn: ({ id, selectionIds, selections }) => fromUser(() => ipcRenderer.invoke("dsh-workbench-materials-read-use-in", { id, selectionIds, selections })),
    clearUseIn: ({ id }) => ipcRenderer.invoke("dsh-workbench-materials-clear-use-in", { id }),
  };
  contextBridge.exposeInMainWorld("__DSH_WORKBENCH_MATERIALS__", materials);
}
