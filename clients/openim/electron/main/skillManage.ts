import { app, dialog, ipcMain, type IpcMainInvokeEvent } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { getWebContents, getResearchServiceStatus } from "./windowManage";
import {
  githubSkillOptions,
  importSkillFolderBundle,
  importSkillZipBundle,
  skillDownload,
  type SkillBundleData,
} from "../utils/skillImport";
import { SkillBundleStore } from "../utils/skillBundleStore";
import type { SkillBundleLocator } from "@research-agent-platform/research-skills/import";
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
  // The main process supplies the stable service origin. The renderer supplies
  // only the current member's local storage namespace, never a server address.
  const scopedLocator = (locator: SkillBundleLocator): SkillBundleLocator => {
    if (
      !locator ||
      typeof locator.accountKey !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(locator.accountKey)
    )
      throw Error("本机素材账号标识无效。");
    return {
      ...locator,
      accountKey: `${new URL(getResearchServiceStatus().address).origin}:${
        locator.accountKey
      }`,
    };
  };
  const store = new SkillBundleStore(
    path.join(app.getPath("userData"), "private-skill-bundles"),
  );
  const pending = new Map<
    string,
    { owner: string; expires: number; data: SkillBundleData }
  >();
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
        pending.clear();
        let bundle, source;
        if (kind === "github") {
          const option =
            typeof selection === "string" ? selections.get(selection) : undefined;
          if (!option || option.owner !== owner || option.expires < Date.now())
            throw Error("请重新检查 GitHub 版本。");
          bundle = await importSkillZipBundle(
            await skillDownload(option.url, 32 * 1024 * 1024),
          );
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
          if (kind === "folder") bundle = await importSkillFolderBundle(file);
          else {
            const stat = await fs.stat(file);
            if (stat.size > 32 * 1024 * 1024) throw Error("技能 ZIP 超过 32 MB。");
            bundle = await importSkillZipBundle(await fs.readFile(file));
          }
          source = { kind, label: path.basename(file), revision: null };
        }
        if (authority(e) !== owner) throw Error("页面已变化，未提交技能。");
        const token = randomUUID();
        pending.set(token, {
          owner,
          expires: Date.now() + 30 * 60 * 1000,
          data: bundle,
        });
        setTimeout(() => pending.delete(token), 30 * 60 * 1000).unref();
        return {
          package: bundle.package,
          source,
          localBundle: { token, manifest: bundle.manifest },
        };
      } finally {
        busy = false;
      }
    },
  );
  ipcMain.handle("discard-skill-bundle", (e, token: unknown) => {
    const owner = authority(e),
      value = typeof token === "string" ? pending.get(token) : undefined;
    if (value?.owner === owner) pending.delete(token as string);
  });
  ipcMain.handle(
    "commit-skill-bundle",
    async (e, token: unknown, locator: SkillBundleLocator) => {
      const owner = authority(e),
        value = typeof token === "string" ? pending.get(token) : undefined;
      if (busy || !value || value.owner !== owner || value.expires < Date.now())
        throw Error("本机素材预览已失效，请重新选择技能包。");
      busy = true;
      try {
        const manifest = await store.commit(value.data, scopedLocator(locator));
        if (authority(e) !== owner) throw Error("页面已变化。");
        pending.delete(token as string);
        return manifest;
      } finally {
        busy = false;
      }
    },
  );
  ipcMain.handle("skill-bundle-manifest", async (e, locator: SkillBundleLocator) => {
    const owner = authority(e),
      manifest = await store.manifest(scopedLocator(locator));
    if (authority(e) !== owner) throw Error("页面已变化。");
    return manifest;
  });
  ipcMain.handle(
    "read-skill-bundle-asset",
    async (e, locator: SkillBundleLocator, relative: string) => {
      const owner = authority(e),
        result = await store.read(scopedLocator(locator), relative);
      if (authority(e) !== owner) throw Error("页面已变化。");
      return { ...result.file, base64: result.bytes.toString("base64") };
    },
  );
  ipcMain.handle(
    "save-skill-bundle-asset",
    async (e, locator: SkillBundleLocator, relative: string) => {
      const owner = authority(e);
      if (busy) throw Error("素材操作正在处理。");
      busy = true;
      try {
        const result = await store.read(
          scopedLocator(locator),
          relative,
          100 * 1024 * 1024,
        );
        const picked = await dialog.showSaveDialog({
          title: "另存技能原件",
          defaultPath:
            relative === "$original.zip"
              ? "original-skill.zip"
              : path.basename(result.file.path),
        });
        if (picked.canceled || !picked.filePath) return { saved: false };
        if (authority(e) !== owner) throw Error("页面已变化，未保存素材。");
        await fs.writeFile(picked.filePath, result.bytes);
        return { saved: true };
      } finally {
        busy = false;
      }
    },
  );
}
