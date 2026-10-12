import { dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { randomUUID } from "node:crypto";
import { getWebContents, getResearchServiceStatus } from "./windowManage";
import { readZoteroJson, zoteroPage, zoteroReadPath } from "../utils/zoteroLocal";
import type { ZoteroReadRequest } from "../../src/types/zotero";

function authority(e: IpcMainInvokeEvent) {
  const c = getWebContents(),
    s = getResearchServiceStatus();
  if (
    c.isDestroyed() ||
    e.sender !== c ||
    e.senderFrame !== c.mainFrame ||
    !s.connected ||
    s.error ||
    c.isLoadingMainFrame() ||
    new URL(c.getURL()).origin !== s.rendererOrigin ||
    new URL(e.senderFrame.url).origin !== s.rendererOrigin
  )
    throw Error("当前页面不能读取本机 Zotero。");
  return `${c.id}:${c.mainFrame.processId}:${c.mainFrame.routingId}:${c.getURL()}`;
}
export function registerZoteroBridge() {
  const grants = new Map<
    string,
    {
      owner: string;
      expiresAt: number;
      serverId: string | null;
      controller?: AbortController;
    }
  >();
  let connecting = false;
  const remove = (id: string) => {
    grants.get(id)?.controller?.abort();
    grants.delete(id);
  };
  ipcMain.handle("connect-local-zotero", async (e) => {
    const owner = authority(e);
    if (connecting) throw Error("正在连接 Zotero，请稍候。");
    connecting = true;
    try {
      const confirmation = await dialog.showMessageBox({
        type: "question",
        title: "读取本机 Zotero",
        buttons: ["允许本次读取", "取消"],
        defaultId: 1,
        cancelId: 1,
        message: "允许 AcceptCat 在本窗口读取 Zotero 个人库的集合、标题、作者与摘要？",
        detail:
          "只访问本机 127.0.0.1:23119，许可持续 15 分钟。不会修改 Zotero、读取 PDF 或自动上传；导入选中的资料到 AcceptCat 仍需你确认。",
      });
      if (authority(e) !== owner) throw Error("页面已变化，请重新连接。");
      if (confirmation.response !== 0) return null;
      const probe = await readZoteroJson(
        "/api/users/0/collections?format=json&limit=1",
        new AbortController().signal,
      );
      if (authority(e) !== owner) throw Error("页面已变化，请重新连接。");
      if (!Array.isArray(probe.value)) throw Error("Zotero 本机 API 响应无效。");
      for (const [id, grant] of grants)
        if (grant.owner === owner || grant.expiresAt < Date.now()) remove(id);
      const id = randomUUID(),
        expiresAt = Date.now() + 900000;
      grants.set(id, { owner, expiresAt, serverId: probe.serverId });
      setTimeout(() => remove(id), 900000).unref();
      return { id, expiresAt, serverId: probe.serverId };
    } finally {
      connecting = false;
    }
  });
  ipcMain.handle("read-local-zotero", async (e, id: unknown, input: unknown) => {
    const owner = authority(e),
      grant = typeof id === "string" ? grants.get(id) : undefined;
    if (!grant || grant.owner !== owner || grant.expiresAt <= Date.now())
      throw Error("Zotero 本次许可已失效，请重新连接。");
    if (grant.controller) throw Error("Zotero 正在读取，请稍候。");
    const route = zoteroReadPath(input),
      controller = new AbortController();
    grant.controller = controller;
    try {
      const response = await readZoteroJson(
        route.path,
        controller.signal,
        grant.serverId,
      );
      if (
        authority(e) !== owner ||
        grants.get(String(id)) !== grant ||
        grant.expiresAt <= Date.now()
      )
        throw Error("页面或许可已变化，未返回 Zotero 资料。");
      if (grant.serverId !== response.serverId) {
        remove(String(id));
        throw Error("Zotero 文献库已变化，请重新连接。");
      }
      return zoteroPage(response.value, input as ZoteroReadRequest, response.total);
    } finally {
      grant.controller = undefined;
    }
  });
  ipcMain.handle("release-local-zotero", (e, id: unknown) => {
    const owner = authority(e);
    if (typeof id === "string" && grants.get(id)?.owner === owner) remove(id);
  });
}
