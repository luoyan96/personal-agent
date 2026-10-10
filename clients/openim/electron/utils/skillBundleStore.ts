import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import {
  safeSkillPath,
  type SkillBundleLocator,
  type SkillBundleManifest,
} from "@research-agent-platform/research-skills/import";
import type { SkillBundleData } from "./skillImport";

const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const SKILL_ASSET_READ_LIMIT = 20 * 1024 * 1024;
/** Private local copies only. Namespace is a storage key, never server authorization. */
export class SkillBundleStore {
  constructor(private readonly root: string) {}
  private key(locator: SkillBundleLocator) {
    if (
      !locator ||
      typeof locator.accountKey !== "string" ||
      !locator.accountKey ||
      locator.accountKey.length > 600 ||
      typeof locator.skillId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(locator.skillId) ||
      !Number.isSafeInteger(locator.revision) ||
      locator.revision < 1 ||
      !/^[a-f0-9]{64}$/.test(locator.digest)
    )
      throw Error("本机技能版本标识无效。");
    return hash(
      JSON.stringify([
        locator.accountKey,
        locator.skillId,
        locator.revision,
        locator.digest,
      ]),
    );
  }
  private async directory(dir: string, create = false) {
    const resolvedRoot = path.resolve(this.root),
      resolved = path.resolve(dir);
    if (resolved !== resolvedRoot && !resolved.startsWith(resolvedRoot + path.sep))
      throw Error("素材路径越界。");
    const parts = path
      .relative(path.parse(resolvedRoot).root, resolved)
      .split(path.sep);
    let current = path.parse(resolvedRoot).root;
    for (const part of parts) {
      current = path.join(current, part);
      try {
        const stat = await fs.lstat(current);
        if (stat.isSymbolicLink() || !stat.isDirectory())
          throw Error("本机素材目录不允许链接。");
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== "ENOENT" ||
          !create ||
          (current !== resolvedRoot && !current.startsWith(resolvedRoot + path.sep))
        )
          throw error;
        await fs.mkdir(current);
      }
    }
  }
  async manifest(locator: SkillBundleLocator): Promise<SkillBundleManifest | null> {
    const dir = path.join(this.root, this.key(locator));
    try {
      await this.directory(dir);
      const stat = await fs.lstat(path.join(dir, "manifest.json"));
      if (
        stat.isSymbolicLink() ||
        stat.nlink > 1 ||
        !stat.isFile() ||
        stat.size > 4 * 1024 * 1024
      )
        throw Error("素材清单损坏。");
      const saved = JSON.parse(
        await fs.readFile(path.join(dir, "manifest.json"), "utf8"),
      );
      if (
        this.key(saved.locator) !== this.key(locator) ||
        saved.manifest?.format !== 1 ||
        saved.manifest.packageDigest !== locator.digest ||
        !Array.isArray(saved.manifest.files) ||
        saved.manifest.files.length > 8000
      )
        throw Error("素材版本不匹配。");
      const files = saved.manifest.files as SkillBundleManifest["files"];
      let total = 0;
      const seen = new Set<string>();
      for (const file of files) {
        safeSkillPath(file.path);
        const normalized = file.path.normalize("NFC").toLowerCase();
        if (
          seen.has(normalized) ||
          !Number.isSafeInteger(file.size) ||
          file.size < 0 ||
          !/^[a-f0-9]{64}$/.test(file.sha256) ||
          typeof file.mediaType !== "string" ||
          !["instruction", "reference", "script", "asset", "other"].includes(
            file.category,
          )
        )
          throw Error("素材清单损坏。");
        seen.add(normalized);
        total += file.size;
      }
      if (
        total !== saved.manifest.totalBytes ||
        total > 100 * 1024 * 1024 ||
        hash(JSON.stringify(files)) !== saved.manifest.bundleDigest
      )
        throw Error("素材清单校验失败。");
      if (
        saved.manifest.originalZip &&
        (!Number.isSafeInteger(saved.manifest.originalZip.size) ||
          saved.manifest.originalZip.size < 0 ||
          saved.manifest.originalZip.size > 32 * 1024 * 1024 ||
          !/^[a-f0-9]{64}$/.test(saved.manifest.originalZip.sha256))
      )
        throw Error("原包清单损坏。");
      return saved.manifest;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  async commit(data: SkillBundleData, locator: SkillBundleLocator) {
    const key = this.key(locator);
    if (locator.digest !== data.manifest.packageDigest)
      throw Error("账号技能说明与本机素材版本不匹配，未关联素材。");
    const existing = await this.manifest(locator);
    if (existing) {
      if (
        existing.bundleDigest !== data.manifest.bundleDigest ||
        existing.originalZip?.sha256 !== data.manifest.originalZip?.sha256
      )
        throw Error("此技能修订已关联另一份素材，不能覆盖。");
      return existing;
    }
    await this.directory(this.root, true);
    let used = 0,
      count = 0;
    for (const name of await fs.readdir(this.root)) {
      if (!/^[a-f0-9]{64}$/.test(name)) continue;
      await this.directory(path.join(this.root, name));
      const summaryPath = path.join(this.root, name, "manifest.json");
      const summaryStat = await fs.lstat(summaryPath);
      if (
        summaryStat.isSymbolicLink() ||
        summaryStat.nlink > 1 ||
        !summaryStat.isFile() ||
        summaryStat.size > 4 * 1024 * 1024
      )
        throw Error("本机素材清单损坏或包含链接。");
      const saved = JSON.parse(await fs.readFile(summaryPath, "utf8"));
      if (
        this.key(saved.locator) !== name ||
        !Number.isSafeInteger(saved.manifest?.totalBytes) ||
        saved.manifest.totalBytes < 0 ||
        saved.manifest.totalBytes > 100 * 1024 * 1024 ||
        !Number.isSafeInteger(saved.manifest.originalZip?.size ?? 0) ||
        (saved.manifest.originalZip?.size ?? 0) < 0 ||
        (saved.manifest.originalZip?.size ?? 0) > 32 * 1024 * 1024
      )
        throw Error("本机素材清单损坏。");
      used += saved.manifest.totalBytes + (saved.manifest.originalZip?.size || 0);
      count++;
    }
    if (
      count >= 200 ||
      used + data.manifest.totalBytes + (data.originalZip?.length || 0) >
        1024 * 1024 * 1024
    )
      throw Error("本机技能素材已达 200 份修订或 1 GiB 上限，请先另存需要的素材。");
    const temporary = path.join(this.root, ".pending-" + randomUUID());
    await this.directory(temporary, true);
    try {
      for (const file of data.manifest.files) {
        const bytes = data.contents.get(file.path);
        if (!bytes || hash(bytes) !== file.sha256 || bytes.length !== file.size)
          throw Error("待保存素材校验失败。");
        await fs.writeFile(path.join(temporary, file.sha256), bytes);
      }
      if (data.originalZip)
        await fs.writeFile(path.join(temporary, "original.zip"), data.originalZip);
      await fs.writeFile(
        path.join(temporary, "manifest.json"),
        JSON.stringify({ locator, manifest: data.manifest }),
      );
      await fs.rename(temporary, path.join(this.root, key));
      return data.manifest;
    } finally {
      // The random staging path is validated as a child of the fixed store root.
      if (path.dirname(temporary) === path.resolve(this.root))
        await fs.rm(temporary, { recursive: true, force: true });
    }
  }
  async read(
    locator: SkillBundleLocator,
    relative: string,
    limit = SKILL_ASSET_READ_LIMIT,
  ) {
    const manifest = await this.manifest(locator);
    if (!manifest) throw Error("此修订没有本机素材，请重新导入完整技能包。");
    const archive = relative === "$original.zip";
    if (!archive) safeSkillPath(relative);
    const file =
      archive && manifest.originalZip
        ? {
            path: "$original.zip",
            mediaType: "application/zip",
            ...manifest.originalZip,
          }
        : manifest.files.find((file) => file.path === relative);
    if (!file || file.size > limit || !/^[a-f0-9]{64}$/.test(file.sha256))
      throw Error(
        "所选素材不存在或超过 20 MiB 预览 / 加入资料库限制，可使用另存原件。",
      );
    const full = path.join(
      this.root,
      this.key(locator),
      archive ? "original.zip" : file.sha256,
    );
    const stat = await fs.lstat(full);
    if (
      stat.isSymbolicLink() ||
      stat.nlink > 1 ||
      !stat.isFile() ||
      stat.size !== file.size
    )
      throw Error("本机素材损坏或包含链接。");
    const bytes = await fs.readFile(full);
    if (hash(bytes) !== file.sha256) throw Error("本机素材校验失败。");
    return { file, bytes };
  }
}
