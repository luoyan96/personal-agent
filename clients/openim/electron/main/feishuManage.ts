import { ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { getWebContents, getResearchServiceStatus } from "./windowManage";
import { validateFeishuAuthorizationUrl } from "../utils/feishuAuthorization";

export function registerFeishuAuthorizationBridge() {
  ipcMain.handle(
    "open-feishu-authorization",
    async (event: IpcMainInvokeEvent, value: unknown) => {
      const contents = getWebContents(),
        service = getResearchServiceStatus();
      if (
        !service.connected ||
        service.error ||
        !service.rendererOrigin ||
        contents.isDestroyed() ||
        contents.isLoadingMainFrame() ||
        event.sender !== contents ||
        event.senderFrame !== contents.mainFrame ||
        new URL(event.senderFrame.url).origin !== service.rendererOrigin ||
        new URL(contents.getURL()).origin !== service.rendererOrigin
      ) {
        throw new Error("请从当前 AcceptCat 主窗口连接飞书。");
      }
      const url = validateFeishuAuthorizationUrl(value, service.address);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          shell.openExternal(url),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error()), 5000);
          }),
        ]);
      } catch {
        throw new Error(
          "未能打开系统浏览器。请复制授权链接，在 Edge 或其他浏览器中打开。",
        );
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
  );
}
