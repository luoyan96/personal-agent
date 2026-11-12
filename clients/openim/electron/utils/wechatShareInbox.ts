import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

const batchId = /^[a-f0-9]{32}$/;
/** Only batches durably staged by this application's share helper can be opened. */
export class WeChatShareInbox {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(readonly root: string) {}
  private async ids(): Promise<string[]> {
    try {
      const queuePath = path.join(this.root, "activations.json");
      const info = await lstat(queuePath);
      if (!info.isFile() || info.isSymbolicLink() || info.size > 8192)
        throw Error("分享待处理记录损坏。");
      const bytes = await readFile(queuePath);
      if (bytes.length > 8192) throw Error("分享待处理记录损坏。");
      const value = JSON.parse(bytes.toString());
      if (
        !Array.isArray(value) ||
        value.length > 32 ||
        value.some((id) => typeof id !== "string" || !batchId.test(id))
      )
        throw Error("分享待处理记录损坏。");
      return value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
  async batch(id: string) {
    if (!batchId.test(id)) throw Error("分享批次无效。");
    const root = await realpath(this.root);
    const directory = path.join(root, id);
    if (
      (await lstat(directory)).isSymbolicLink() ||
      (await realpath(directory)) !== directory
    )
      throw Error("分享批次路径无效。");
    const file = path.join(directory, "source.zip");
    const info = await lstat(file);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      !info.size ||
      info.size > 64 * 1024 * 1024
    )
      throw Error("分享包须为不超过 64 MiB 的 ZIP 文件。");
    const metadataPath = path.join(directory, "metadata.json");
    const metadataInfo = await lstat(metadataPath);
    if (
      !metadataInfo.isFile() ||
      metadataInfo.isSymbolicLink() ||
      metadataInfo.size > 4096
    )
      throw Error("分享批次元数据无效。");
    const bytes = await readFile(metadataPath);
    if (bytes.length > 4096) throw Error("分享批次元数据无效。");
    const metadata = JSON.parse(bytes.toString());
    if (
      metadata.id !== id ||
      typeof metadata.name !== "string" ||
      metadata.name.length > 255 ||
      /[\\/\x00-\x1f]/.test(metadata.name) ||
      !/\.zip$/i.test(metadata.name)
    )
      throw Error("分享包名称无效。");
    return { id, name: metadata.name, size: info.size, file };
  }
  private change(update: (ids: string[]) => Promise<string[]>) {
    const next = this.queue
      .catch(() => {})
      .then(async () => {
        const ids = await update(await this.ids());
        await mkdir(this.root, { recursive: true });
        const temporary = path.join(this.root, `${randomUUID()}.tmp`);
        await writeFile(temporary, JSON.stringify(ids), { mode: 0o600 });
        await rename(temporary, path.join(this.root, "activations.json"));
      });
    this.queue = next;
    return next;
  }
  async accept(id: string) {
    await this.batch(id);
    await this.change(async (ids) => {
      if (ids.includes(id)) return ids;
      if (ids.length >= 32) throw Error("待处理分享较多，请先处理已有分享。");
      return [...ids, id];
    });
  }
  async pending() {
    const result = [];
    for (const id of await this.ids()) {
      try {
        const { file, ...item } = await this.batch(id);
        result.push(item);
      } catch {
        /* Missing or corrupt staging files never become a renderer path. */
      }
    }
    return result;
  }
  async selected(id: string) {
    if (!(await this.ids()).includes(id))
      throw Error("这条分享已处理或不在待处理列表中。");
    return this.batch(id);
  }
  async acknowledge(id: string) {
    const batch = await this.selected(id);
    await this.change(async (ids) => ids.filter((value) => value !== id));
    // This is our temporary copy, never the file supplied by the sharing app.
    await rm(path.dirname(batch.file), { recursive: true, force: true });
  }
}
