import { dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getWebContents, getResearchServiceStatus } from "./windowManage";
import {
  githubSkillOptions,
  importSkillFolder,
  importSkillZip,
  skillDownload,
} from "../utils/skillImport";
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
    throw Error("当前页面不能安装技能。");
  return `${c.id}:${c.mainFrame.processId}:${c.mainFrame.routingId}:${c.getURL()}`;
}
export function registerSkillBridge() {
  const selections = new Map<
    string,
    { owner: string; url: string; label: string; revision: string; expires: number }
  >();
  let busy = false;
  ipcMain.handle("inspect-skill-github", async (e, address: unknown) => {
    const owner = authority(e);
    if (busy || typeof address !== "string" || address.length > 500)
      throw Error("技能安装正在处理或地址无效。");
    busy = true;
    try {
      const result = await githubSkillOptions(address);
      if (authority(e) !== owner) throw Error("页面已变化。");
      selections.clear();
      return result.options.map((option) => {
        const id = randomUUID();
        selections.set(id, {
          owner,
          url: option.url,
          label: `https://github.com/${result.repo} · ${option.label}`,
          revision: result.revision,
          expires: Date.now() + 300000,
        });
        return { id, label: option.label, revision: result.revision };
      });
    } finally {
      busy = false;
    }
  });
  ipcMain.handle(
    "import-private-skill",
    async (e, kind: unknown, selection: unknown) => {
      const owner = authority(e);
      if (busy || !["folder", "zip", "github"].includes(String(kind)))
        throw Error("技能安装正在处理或来源无效。");
      busy = true;
      try {
        let pkg, source;
        if (kind === "github") {
          const option =
            typeof selection === "string" ? selections.get(selection) : undefined;
          if (!option || option.owner !== owner || option.expires < Date.now())
            throw Error("请重新检查 GitHub 版本。");
          pkg = await importSkillZip(await skillDownload(option.url, 32 * 1024 * 1024));
          source = { kind: "github", label: option.label, revision: option.revision };
        } else {
          const picked = await dialog.showOpenDialog({
            title: kind === "folder" ? "选择私人技能文件夹" : "选择技能 ZIP",
            properties: [kind === "folder" ? "openDirectory" : "openFile"],
            ...(kind === "zip"
              ? { filters: [{ name: "Skill ZIP", extensions: ["zip"] }] }
              : {}),
          });
          if (picked.canceled) return null;
          if (authority(e) !== owner) throw Error("页面已变化。");
          const file = picked.filePaths[0];
          if (!file) throw Error("未选择技能。");
          if (kind === "folder") pkg = await importSkillFolder(file);
          else {
            const stat = await fs.stat(file);
            if (stat.size > 32 * 1024 * 1024) throw Error("技能 ZIP 超过 32 MB。");
            pkg = await importSkillZip(await fs.readFile(file));
          }
          source = { kind, label: path.basename(file), revision: null };
        }
        if (authority(e) !== owner) throw Error("页面已变化，未提交技能。");
        return { package: pkg, source };
      } finally {
        busy = false;
      }
    },
  );
}
