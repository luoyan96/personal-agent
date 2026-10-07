import { app, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { getWebContents, getResearchServiceStatus } from "./windowManage";
import { DesktopArtifactStore, desktopReportFail } from "../utils/desktopArtifacts";
import type { DesktopReportScope } from "../../src/types/desktopWork";

function authority(event: IpcMainInvokeEvent) {
  const contents = getWebContents(),
    status = getResearchServiceStatus();
  if (
    contents.isDestroyed() ||
    event.sender !== contents ||
    event.senderFrame !== contents.mainFrame ||
    !status.connected ||
    status.error ||
    contents.isLoadingMainFrame()
  )
    desktopReportFail("DESKTOP_REPORT_FORBIDDEN");
  try {
    const expected = status.rendererOrigin;
    if (
      expected === "null" ||
      new URL(event.senderFrame.url).origin !== expected ||
      new URL(contents.getURL()).origin !== expected
    )
      desktopReportFail("DESKTOP_REPORT_FORBIDDEN");
  } catch {
    desktopReportFail("DESKTOP_REPORT_FORBIDDEN");
  }
  return `${contents.id}:${event.senderFrame.processId}:${event.senderFrame.routingId}:${event.senderFrame.url}`;
}

export function registerDesktopWorkBridge() {
  const store = new DesktopArtifactStore(app.getPath("userData"));
  ipcMain.handle(
    "create-desktop-report",
    async (
      event,
      scope: DesktopReportScope,
      title: string,
      markdown: string,
      sources: string[],
    ) => {
      const owner = authority(event),
        artifact = await store.create(scope, title, markdown, sources);
      if (authority(event) !== owner) desktopReportFail("DESKTOP_REPORT_FORBIDDEN");
      return artifact;
    },
  );
  ipcMain.handle("list-desktop-reports", async (event, scope: DesktopReportScope) => {
    const owner = authority(event),
      artifacts = await store.list(scope);
    if (authority(event) !== owner) desktopReportFail("DESKTOP_REPORT_FORBIDDEN");
    return artifacts;
  });
  ipcMain.handle(
    "open-desktop-report",
    async (event, scope: DesktopReportScope, id: string) => {
      const owner = authority(event),
        report = await store.htmlPath(scope, id);
      if (authority(event) !== owner) desktopReportFail("DESKTOP_REPORT_FORBIDDEN");
      try {
        if (await shell.openPath(report))
          desktopReportFail("DESKTOP_REPORT_OPEN_FAILED");
      } catch {
        desktopReportFail("DESKTOP_REPORT_OPEN_FAILED");
      }
    },
  );
  ipcMain.handle(
    "reveal-desktop-report",
    async (event, scope: DesktopReportScope, id: string) => {
      const owner = authority(event),
        report = await store.htmlPath(scope, id);
      if (authority(event) !== owner) desktopReportFail("DESKTOP_REPORT_FORBIDDEN");
      try {
        shell.showItemInFolder(report);
      } catch {
        desktopReportFail("DESKTOP_REPORT_OPEN_FAILED");
      }
    },
  );
}
