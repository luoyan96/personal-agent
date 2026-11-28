import { ipcMain, type IpcMainInvokeEvent } from "electron";
import type { WorkbenchLiteratureFeed } from "../../src/types/dshWorkbenchLiterature";
import type { dshAccount } from "./localDshAccount";

const { LiteratureRecommendationFeed } = require("./localDshRuntime") as typeof import("@research-agent-platform/contracts");
const unavailable: WorkbenchLiteratureFeed = { source: "unavailable", directions: [], items: [] };

type Connection = {
  account: Awaited<ReturnType<typeof dshAccount>>;
  valid: () => Promise<void>;
  revoke: () => void;
  signal: AbortSignal;
};

function readFeed({ account, signal }: Connection) {
  signal.throwIfAborted();
  return new Promise<{ revoked: boolean; data?: unknown }>((resolve) => {
    const request = account.request("/api/v1/me/literature/recommendations");
    request.setHeader("Accept", "application/json");
    request.setHeader("Cache-Control", "no-cache");
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = (result: { revoked: boolean; data?: unknown }) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", fail);
      resolve(result);
    };
    const fail = () => {
      finish({ revoked: false });
      request.abort();
    };
    const timer = setTimeout(fail, 10000);
    signal.addEventListener("abort", fail, { once: true });
    request.on("error", fail);
    request.on("response", (response) => {
      if (response.statusCode !== 200) {
        finish({ revoked: response.statusCode === 401 || response.statusCode === 403 });
        request.abort();
        return;
      }
      response.on("error", fail);
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 12 * 1024 * 1024) fail();
        else chunks.push(chunk);
      });
      response.on("end", () => {
        try {
          finish({ revoked: false, data: JSON.parse(Buffer.concat(chunks).toString("utf8"))?.data });
        } catch { fail(); }
      });
    });
    request.end();
  });
}

export function registerDshWorkbenchLiteratureBridge(connect: (event: IpcMainInvokeEvent) => Promise<Connection>) {
  ipcMain.handle("dsh-workbench-literature-recommendations", async (event): Promise<WorkbenchLiteratureFeed> => {
    try {
      const connection = await connect(event);
      const response = await readFeed(connection);
      await connection.valid();
      if (response.revoked) { connection.revoke(); return unavailable; }
      const feed = LiteratureRecommendationFeed.safeParse(response.data);
      if (!feed.success) return unavailable;
      const { source, directions, items, updatedAt } = feed.data;
      return {
        source, directions,
        items: items.map(({ id, title, authors, reason, summary, published }) => ({
          id, title, authors,
          ...(reason !== undefined && { reason }),
          ...(summary !== undefined && { summary }),
          ...(published !== undefined && { published }),
        })),
        ...(updatedAt !== undefined && { updatedAt }),
      };
    } catch {
      return unavailable;
    }
  });
}
