import {
  BrowserWindow,
  dialog,
  ipcMain,
  utilityProcess,
  type IpcMainInvokeEvent,
  type WebContents,
} from "electron";
import path from "node:path";
import { getWebContents, getResearchServiceStatus } from "./windowManage";
import { LocalFolderStore, localFolderFail } from "../utils/localFolder";
import type {
  LocalFolderErrorCode,
  LocalFolderReadRequest,
} from "../../src/types/localFolder";

const store = new LocalFolderStore(
  (bytes, kind, signal) =>
    new Promise((resolve, reject) => {
      if (signal.aborted) {
        reject(new Error("LOCAL_FOLDER_REVOKED: 文件夹授权已失效，请重新选择。"));
        return;
      }
      const env = Object.fromEntries(
        ["PATH", "SystemRoot", "TEMP", "TMP"].flatMap((key) =>
          process.env[key] ? [[key, process.env[key]!]] : [],
        ),
      );
      const child = utilityProcess.fork(
        path.join(__dirname, "../utils/localFolderParser.js"),
        [],
        {
          env,
          execArgv: ["--max-old-space-size=128", "--max-semi-space-size=8"],
          stdio: "ignore",
          serviceName: "research-local-document",
        },
      );
      let done = false;
      const finish = (
        code?: LocalFolderErrorCode,
        value?: { text: string; pageCount?: number },
      ) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        child.kill();
        if (code) {
          try {
            localFolderFail(code);
          } catch (error) {
            reject(error);
          }
        } else resolve(value!);
      };
      const abort = () => finish("LOCAL_FOLDER_REVOKED"),
        timeout = setTimeout(() => finish("LOCAL_FOLDER_TIMEOUT"), 8000);
      signal.addEventListener("abort", abort, { once: true });
      child.once("exit", () => finish("LOCAL_FOLDER_PARSE_FAILED"));
      child.once("message", (value) => {
        if (
          value?.ok === true &&
          typeof value.text === "string" &&
          value.text.length <= 200000 &&
          Buffer.byteLength(JSON.stringify(value.text), "utf8") <= 512000 &&
          (value.pageCount === undefined ||
            (Number.isInteger(value.pageCount) &&
              value.pageCount >= 1 &&
              value.pageCount <= 200))
        )
          finish(undefined, {
            text: value.text,
            ...(value.pageCount ? { pageCount: value.pageCount } : {}),
          });
        else {
          const allowed: LocalFolderErrorCode[] = [
            "LOCAL_FOLDER_TOO_LARGE",
            "LOCAL_FOLDER_PARSE_FAILED",
            "LOCAL_FOLDER_NO_TEXT",
            "LOCAL_FOLDER_ENCRYPTED",
          ];
          finish(
            allowed.includes(value?.code) ? value.code : "LOCAL_FOLDER_PARSE_FAILED",
          );
        }
      });
      child.postMessage({ bytes, kind });
    }),
);
const observed = new WeakSet<WebContents>(),
  epochs = new WeakMap<WebContents, number>();
function observe(contents: WebContents) {
  if (observed.has(contents)) return;
  observed.add(contents);
  epochs.set(contents, 0);
  const revoke = () => {
    store.releaseAll();
    epochs.set(contents, (epochs.get(contents) ?? 0) + 1);
  };
  contents.on("did-start-navigation", (_event, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) revoke();
  });
  contents.on("destroyed", revoke);
  contents.on("render-process-gone", revoke);
}
function authority(event: IpcMainInvokeEvent) {
  const contents = getWebContents(),
    status = getResearchServiceStatus();
  observe(contents);
  if (
    !status.connected ||
    status.error ||
    event.sender !== contents ||
    event.senderFrame !== contents.mainFrame ||
    contents.isDestroyed()
  )
    localFolderFail("LOCAL_FOLDER_FORBIDDEN");
  let origin: string;
  try {
    origin = status.rendererOrigin || new URL(status.address).origin;
    if (
      origin === "null" ||
      new URL(event.senderFrame.url).origin !== origin ||
      new URL(contents.getURL()).origin !== origin
    )
      localFolderFail("LOCAL_FOLDER_FORBIDDEN");
  } catch {
    localFolderFail("LOCAL_FOLDER_FORBIDDEN");
  }
  return {
    contents,
    owner: `${contents.id}:${event.senderFrame.processId}:${
      event.senderFrame.routingId
    }:${epochs.get(contents) ?? 0}:${origin!}`,
  };
}
export function registerLocalFolderBridge() {
  let busy = 0;
  ipcMain.handle("pick-local-folder", async (event) => {
    const auth = authority(event);
    store.releaseAll(auth.owner);
    const window = BrowserWindow.fromWebContents(auth.contents);
    if (!window) localFolderFail("LOCAL_FOLDER_FORBIDDEN");
    const result = await dialog.showOpenDialog(window, {
      title: "选择要读取的本地文件夹",
      properties: ["openDirectory", "dontAddToRecent"],
    });
    if (authority(event).owner !== auth.owner) localFolderFail("LOCAL_FOLDER_REVOKED");
    if (result.canceled || result.filePaths.length !== 1) {
      store.releaseAll(auth.owner);
      return null;
    }
    const manifest = await store.scan(result.filePaths[0]!, auth.owner);
    if (authority(event).owner !== auth.owner) {
      store.release(manifest.grantId, auth.owner);
      localFolderFail("LOCAL_FOLDER_REVOKED");
    }
    return manifest;
  });
  ipcMain.handle(
    "read-local-folder-selection",
    async (event, request: LocalFolderReadRequest) => {
      const auth = authority(event);
      if (busy >= 2) localFolderFail("LOCAL_FOLDER_INVALID_SELECTION");
      busy++;
      try {
        const result = await store.read(request, auth.owner);
        if (authority(event).owner !== auth.owner)
          localFolderFail("LOCAL_FOLDER_REVOKED");
        return result;
      } finally {
        busy--;
      }
    },
  );
  ipcMain.handle("release-local-folder", (event, grantId: string) => {
    const auth = authority(event);
    store.release(grantId, auth.owner);
  });
}
