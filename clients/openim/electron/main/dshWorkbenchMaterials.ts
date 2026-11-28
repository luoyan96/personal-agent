import { app, BrowserWindow, dialog, ipcMain, type IpcMainInvokeEvent, type WebContents } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import path from "node:path";
import type { ResearchCollection, ResearchFile } from "@research-agent-platform/contracts";
import type { WorkbenchMaterial, WorkbenchMaterialKind } from "../../src/types/dshWorkbenchMaterials";
import { ensurePersonalLibrary, resolveLibraryFile, scanLibrary } from "../utils/localLibrary";
import type { dshAccount } from "./localDshAccount";
import { inContext } from "./teamLibraryManage";

const schemas = require("./localDshRuntime") as typeof import("@research-agent-platform/contracts");
const limits = { template: 80 * 1024 * 1024, reference: 25 * 1024 * 1024 };
const maxReferenceBytes = 80 * 1024 * 1024;
const maxItemsPerSource = 500;
const extensions = {
  template: new Set([".docx", ".dotx", ".pptx", ".potx"]),
  reference: new Set([
    ".bib", ".csv", ".docx", ".dotx", ".gif", ".jpg", ".jpeg", ".json", ".md", ".pdf", ".png",
    ".potx", ".pptx", ".tex", ".tsv", ".txt", ".webp", ".xlsx",
  ]),
};
const textExtensions = new Set([".bib", ".csv", ".json", ".md", ".tex", ".tsv", ".txt"]);

type Connection = {
  account: Awaited<ReturnType<typeof dshAccount>>;
  hostEvent: IpcMainInvokeEvent;
  contents: WebContents;
  valid: () => Promise<void>;
};
type Item = Omit<WorkbenchMaterial, "id">;
type Material = {
  item: Item;
  key: unknown[];
  read: (connection: Connection) => Promise<{ name: string; bytes: Buffer }>;
};
type Source = { materials: Material[]; warnings: string[] };
type Filter = { kind: WorkbenchMaterialKind; allowed: ReadonlySet<string> };

const validName = (name: string, kind: WorkbenchMaterialKind) =>
  name.length <= 160 && !/[\\/<>:"|?*\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/.test(name) &&
  !name.startsWith(".") && !/[. ]$/.test(name) &&
  !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])\s*\./i.test(name) &&
  extensions[kind].has(path.extname(name).toLowerCase());
const availability = (name: string) => textExtensions.has(path.extname(name).toLowerCase()) ? "text" : "file";
const usableSize = (size: number, kind: WorkbenchMaterialKind) => Number.isSafeInteger(size) && size >= 1 && size <= limits[kind];
const safeDisplay = (label: string) => label.replace(/[\x00-\x1f\x7f\u202a-\u202e\u2066-\u2069]/g, " ").trim();
const matchesFilter = (name: string, { kind, allowed }: Filter) =>
  validName(name, kind) && allowed.has(path.extname(name).toLowerCase());

async function personalMaterials(connection: Connection, filter: Filter): Promise<Source> {
  const { kind } = filter;
  const root = await ensurePersonalLibrary(app.getPath("userData"), connection.account.identity);
  const manifest = await scanLibrary(root, { allFiles: true });
  const materials: Material[] = [];
  let oversized = false;
  for (const file of manifest.files) {
    if (!matchesFilter(file.name, filter)) continue;
    if (!usableSize(file.size, kind)) { oversized ||= file.size > limits[kind]; continue; }
    materials.push({
      item: { name: file.name, source: "personal", path: file.rel, size: file.size, availability: availability(file.name) },
      key: ["myfiles", file.rel, file.size, file.updatedAt],
      async read({ account }) {
        const changed = () => Error("个人资料文件已变化，请刷新后重新选择。");
        const userData = app.getPath("userData");
        const activeRoot = await ensurePersonalLibrary(userData, account.identity);
        if (activeRoot !== root) throw changed();
        const { file: absolute, info } = await resolveLibraryFile(activeRoot, file.rel);
        if (info.size !== file.size || info.mtime.toISOString() !== file.updatedAt) throw changed();
        const handle = await open(absolute, "r");
        try {
          const opened = await handle.stat();
          if (!opened.isFile() || opened.dev !== info.dev || opened.ino !== info.ino ||
              opened.size !== info.size || opened.mtimeMs !== info.mtimeMs) throw changed();
          // An open file can grow after fstat. Stop at the size the user was shown.
          const bytes = Buffer.allocUnsafe(file.size);
          let offset = 0;
          while (offset < bytes.length) {
            const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
            if (!bytesRead) throw changed();
            offset += bytesRead;
          }
          const after = await handle.stat();
          const stableRoot = await ensurePersonalLibrary(userData, account.identity);
          if (stableRoot !== activeRoot) throw changed();
          const onDisk = await resolveLibraryFile(stableRoot, file.rel);
          if (after.size !== opened.size || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs ||
              onDisk.info.dev !== opened.dev || onDisk.info.ino !== opened.ino ||
              onDisk.info.mtimeMs !== opened.mtimeMs || onDisk.info.size !== opened.size) throw changed();
          return { name: file.name, bytes };
        } finally { await handle.close(); }
      },
    });
  }
  const warnings = [];
  if (manifest.truncated || materials.length > maxItemsPerSource) warnings.push("个人资料过多，当前仅列出部分文件。");
  if (oversized) warnings.push(`个人资料中超过单份 ${limits[kind] / 1024 / 1024} MiB 的文件未列出。`);
  return { materials: materials.slice(0, maxItemsPerSource), warnings };
}

async function teamMaterials(connection: Connection, filter: Filter): Promise<Source> {
  return inContext(connection.hostEvent, async (team) => {
    if (team.memberId !== connection.account.metadata.memberId) throw Error("资料与工作台账号不一致。");
    // Fetch before listing so an old cached checkout cannot confer Git access.
    const snapshot = await team.store.sync();
    const files = new Map((snapshot.tree ?? []).filter((item) => item.kind === "file").map((item) => [item.path, item]));
    const catalog = new Map(snapshot.manifest.entries.flatMap((entry) =>
      entry.source.kind === "git" && files.has(entry.source.path) ? [[entry.source.path, entry] as const] : [],
    ));
    const materials: Material[] = [];
    for (const file of files.values()) {
      const name = path.posix.basename(file.path);
      if (file.path === "acceptcat-library.json" || !matchesFilter(name, filter) ||
          file.path.split("/").some((part) => part.startsWith("."))) continue;
      const entry = catalog.get(file.path);
      materials.push({
        item: {
          name, source: "team", path: file.path, availability: availability(name),
          description: entry ? safeDisplay(entry.summary).slice(0, 300) : undefined,
        },
        key: ["git", team.identity, snapshot.revision, file.path],
        read: (current) => inContext(current.hostEvent, async (activeTeam) => {
          if (activeTeam.identity !== team.identity || activeTeam.memberId !== current.account.metadata.memberId)
            throw Error("课题组仓库已变化，请刷新后重新选择资料。");
          await activeTeam.store.verifyPublishedRevision(snapshot.revision);
          const selection = { revision: snapshot.revision, path: file.path };
          const { bytes } = entry
            ? await activeTeam.store.read({ revision: snapshot.revision, entryId: entry.id })
            : await activeTeam.store.readPath(selection);
          return { name, bytes };
        }),
      });
    }
    const warnings = [];
    if (materials.length > maxItemsPerSource) warnings.push("团队 Git 资料过多，当前仅列出部分文件。");
    if (materials.length) warnings.push("团队 Git 单份直读上限为 20 MiB，Git LFS 原件需通过其他已授权来源选用。");
    return { materials: materials.slice(0, maxItemsPerSource), warnings };
  });
}

function researchBytes(account: Connection["account"], endpoint: string, limit: number, timeout = 10000): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = account.request(`/api/v1/research-library${endpoint}`);
    req.setHeader("X-AcceptCat-Originals", "chunked-v1");
    const chunks: Buffer[] = [];
    let size = 0;
    const fail = () => {
      clearTimeout(timer);
      reject(Error("研究资料当前不可访问，请检查连接与资料权限。"));
      req.abort();
    };
    const timer = setTimeout(fail, timeout);
    req.on("error", () => {
      clearTimeout(timer);
      reject(Error("研究资料连接中断。"));
    });
    req.on("response", (response) => {
      if (response.statusCode !== 200) { fail(); return; }
      response.on("error", fail);
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > limit) fail();
        else chunks.push(chunk);
      });
      response.on("end", () => {
        clearTimeout(timer);
        resolve(Buffer.concat(chunks));
      });
    });
    req.end();
  });
}

async function researchJson(account: Connection["account"], endpoint: string): Promise<unknown> {
  const bytes = await researchBytes(account, endpoint, 4 * 1024 * 1024);
  return JSON.parse(bytes.toString("utf8")).data;
}

async function researchCollections(account: Connection["account"]) {
  return schemas.ResearchCollection.array().max(100).parse(await researchJson(account, "/collections?scope=visible&limit=100"));
}

const eligibleCollection = (collection: ResearchCollection) =>
  collection.status === "available" && collection.scope !== "task_scoped" &&
  (collection.scope !== "owner_private" || collection.owned) && !collection.externalSource;

async function verifyResearchFile(account: Connection["account"], file: ResearchFile, collection: ResearchCollection) {
  const { file: raw } = await researchJson(account, `/files/${file.id}`) as { file?: unknown };
  const active = schemas.ResearchFile.parse(raw);
  const current = (await researchCollections(account)).find((c) => c.id === collection.id);
  if (!current || !eligibleCollection(current) || current.scope !== collection.scope ||
      active.id !== file.id || active.collectionId !== collection.id || active.status !== "available" ||
      active.version !== file.version || active.sha256 !== file.sha256)
    throw Error("研究资料已更新或权限已变化，请刷新后重新选择。");
  return active;
}

function metadataDocument(file: ResearchFile, collection: ResearchCollection) {
  const { title, authors, year, doi, tags, note } = file.metadata;
  const fields = [
    "# 研究资料记录", "", "范围：书目信息和登记笔记。", "",
    `- 资料库：${safeDisplay(collection.name)}`, `- 文件：${safeDisplay(file.filename)}`,
    `- 资料编号：${file.id}`, `- 版本：${file.version}`, `- SHA-256：${file.sha256}`,
  ];
  if (title) fields.push(`- 题名：${safeDisplay(title)}`);
  if (authors.length) fields.push(`- 作者：${authors.map(safeDisplay).join("、")}`);
  if (year) fields.push(`- 年份：${year}`);
  if (doi) fields.push(`- DOI：${safeDisplay(doi)}`);
  if (tags.length) fields.push(`- 标签：${tags.map(safeDisplay).join("、")}`);
  if (note.trim()) fields.push("", "## 登记笔记", "", note);
  return Buffer.from([...fields, ""].join("\n"), "utf8");
}

function researchFileMaterials(file: ResearchFile, collection: ResearchCollection, filter: Filter): Material[] {
  const { kind } = filter;
  if (file.collectionId !== collection.id || file.status !== "available") return [];
  const source = collection.scope === "owner_private" ? "personal" : "team";
  const item = { source, path: `${safeDisplay(collection.name)} / ${safeDisplay(file.filename)}` } as const;
  const materials: Material[] = [];
  if (matchesFilter(file.filename, filter) && usableSize(file.byteLength, kind)) {
    materials.push({
      item: { ...item, name: file.filename, size: file.byteLength, availability: availability(file.filename),
        description: file.metadata.title ? safeDisplay(file.metadata.title).slice(0, 300) : undefined },
      key: ["research-original", file.id, file.version, file.sha256],
      async read({ account, valid }) {
        await verifyResearchFile(account, file, collection);
        await valid();
        const bytes = await researchBytes(account, `/files/${file.id}/content?version=${file.version}`, file.byteLength, 30000);
        const digest = createHash("sha256").update(bytes).digest("hex");
        if (bytes.length !== file.byteLength || digest !== file.sha256) throw Error("研究资料原件校验失败。");
        await verifyResearchFile(account, file, collection);
        return { name: file.filename, bytes };
      },
    });
  }
  const { title, authors, year, doi, tags, note } = file.metadata;
  if (kind === "reference" && (title || authors.length || year || doi || tags.length || note.trim())) {
    materials.push({
      item: { ...item, name: (safeDisplay(title) || safeDisplay(file.filename) || file.id).slice(0, 160), availability: "metadata",
        description: note.trim() ? "书目信息与登记笔记" : "书目信息" },
      key: ["research-metadata", file.id, file.version, file.sha256],
      async read({ account }) {
        const active = await verifyResearchFile(account, file, collection);
        return { name: `${file.id}-资料记录.md`, bytes: metadataDocument(active, collection) };
      },
    });
  }
  return materials;
}

async function researchMaterials(connection: Connection, filter: Filter): Promise<Source> {
  const { kind } = filter;
  const { account } = connection;
  const collections = await researchCollections(account);
  const readable = collections.filter((c) => eligibleCollection(c) && c.fileCount > 0);
  const materials: Material[] = [];
  let partial = collections.length === 100;
  let oversized = false;
  for (let start = 0; start < readable.length; start += 4) {
    await connection.valid();
    const batch = await Promise.allSettled(readable.slice(start, start + 4).map(async (collection) => {
      const raw = await researchJson(account, `/collections/${collection.id}/files?limit=100`);
      const files = schemas.ResearchFile.array().max(100).parse(raw);
      if (collection.fileCount > files.length) partial = true;
      oversized ||= files.some((file) => matchesFilter(file.filename, filter) && file.byteLength > limits[kind]);
      return files.flatMap((file) => researchFileMaterials(file, collection, filter));
    }));
    for (const source of batch) {
      if (source.status === "fulfilled") materials.push(...source.value);
      else partial = true;
    }
    if (materials.length > maxItemsPerSource || batch.every((source) => source.status === "rejected")) {
      partial = true;
      break;
    }
  }
  return {
    materials: materials.slice(0, maxItemsPerSource),
    warnings: [
      ...(partial ? ["研究资料仅显示当前读取到的部分条目。"] : []),
      ...(oversized ? [`研究资料中超过单份 ${limits[kind] / 1024 / 1024} MiB 的原件未列出。`] : []),
    ],
  };
}

function selectionKind(value: unknown): WorkbenchMaterialKind {
  const kind = (value as { kind?: unknown } | undefined)?.kind;
  if (kind !== "template" && kind !== "reference") throw Error("资料选择无效。");
  return kind;
}

function listFilter(value: unknown): Filter {
  const kind = selectionKind(value);
  const requested = (value as { extensions?: unknown }).extensions;
  if (requested === undefined) return { kind, allowed: extensions[kind] };
  if (kind !== "template" || !Array.isArray(requested) || !requested.length || requested.length > extensions.template.size ||
      requested.some((extension) => typeof extension !== "string" || !extensions.template.has(extension)))
    throw Error("模板格式无效。");
  return { kind, allowed: new Set<string>(requested) };
}

export function registerDshWorkbenchMaterialBridge(connect: (event: IpcMainInvokeEvent) => Promise<Connection>) {
  type Selection = { kind: WorkbenchMaterialKind; material: Material };
  type LiveSelections = { items: Map<string, Selection>; busy: boolean };
  const selections = new WeakMap<WebContents, LiveSelections>();

  async function confirm(current: Connection, message: string, detail: string, button: string) {
    const window = BrowserWindow.fromWebContents(current.hostEvent.sender);
    if (!window || window.isDestroyed()) throw Error("DeepChat 窗口已关闭。");
    const { response } = await dialog.showMessageBox(window, {
      type: "question", title: "DeepChat 科研资料", message, detail,
      buttons: ["取消", button], defaultId: 0, cancelId: 0, noLink: true,
    });
    await current.valid();
    if (response !== 1) throw Error("资料选择已取消。");
  }

  ipcMain.handle("dsh-workbench-materials-list", async (event, value: unknown) => {
    const filter = listFilter(value);
    const { kind } = filter;
    const current = await connect(event);
    let live = selections.get(current.contents);
    if (!live) {
      live = { items: new Map(), busy: false };
      selections.set(current.contents, live);
    }
    if (live.busy) throw Error("正在处理另一项资料操作，请稍后重试。");
    live.busy = true;
    try {
      await confirm(current, kind === "template" ? "允许工作台查看可用模板？" : "允许工作台查看可用参考资料？",
        "工作台将查看个人资料、团队 Git 和有权访问的研究资料库中的文件名、路径及说明。复制所选资料时会再次确认。",
        "查看资料");
      const sources = [
        [personalMaterials, "个人资料当前无法打开。"],
        [teamMaterials, "团队 Git 资料当前不可用，请检查仓库绑定和 Git 访问权限。"],
        [researchMaterials, "研究资料库当前无法打开。"],
      ] as const;
      const results = await Promise.allSettled(sources.map(([load]) => load(current, filter)));
      await current.valid();
      const items: WorkbenchMaterial[] = [], warnings: string[] = [], previous = new Map<string, string>();
      for (const [id, selected] of live.items) {
        if (selected.kind === kind) {
          previous.set(JSON.stringify(selected.material.key), id);
          live.items.delete(id);
        }
      }
      for (const [index, result] of results.entries()) {
        if (result.status === "rejected") { warnings.push(sources[index][1]); continue; }
        warnings.push(...result.value.warnings);
        for (const material of result.value.materials) {
          const id = previous.get(JSON.stringify(material.key)) ?? randomUUID();
          live.items.set(id, { kind, material });
          items.push({ ...material.item, id });
        }
      }
      return { items, warnings };
    } finally { live.busy = false; }
  });

  async function readMaterials(event: IpcMainInvokeEvent, requested: unknown) {
    if (!Array.isArray(requested) || !requested.length || requested.length > 11) throw Error("资料选择无效。");
    const selectionsToRead = requested.map((value) => {
      const kind = selectionKind(value);
      const id = (value as { id?: unknown }).id;
      if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) throw Error("资料选择无效。");
      return { kind, id };
    });
    const templateCount = selectionsToRead.filter((item) => item.kind === "template").length;
    if (templateCount > 1 || selectionsToRead.length - templateCount > 10 ||
        new Set(selectionsToRead.map((item) => item.id)).size !== selectionsToRead.length) throw Error("资料选择无效。");
    const current = await connect(event);
    const live = selections.get(current.contents);
    if (!live) throw Error("资料选择已失效，请刷新后重新选择。");
    const selectionsForTransfer = selectionsToRead.map(({ kind, id }) => {
      const selected = live.items.get(id);
      if (!selected || selected.kind !== kind) throw Error("资料选择已失效，请刷新后重新选择。");
      return { kind, id, material: selected.material };
    });
    if (live.busy) throw Error("正在处理另一项资料操作，请稍后重试。");
    live.busy = true;
    try {
      const display = selectionsForTransfer.map(({ material: { item } }) =>
        `${item.source === "personal" ? "个人资料" : "团队或共享资料"} · ${safeDisplay(item.name)}${
          item.availability === "metadata" ? "（书目信息与登记记录）" : ""}${item.path ? `\n${safeDisplay(item.path).slice(0, 240)}` : ""}`);
      await confirm(current, "将所选资料复制到科研工作台？", display.join("\n\n"), "复制所选资料");
      const output: { kind: WorkbenchMaterialKind; id: string; name: string; bytes: ArrayBuffer }[] = [];
      let referenceBytes = 0;
      for (const { kind, id, material } of selectionsForTransfer) {
        let file;
        try { file = await material.read(current); }
        catch {
          await current.valid();
          throw Error(`无法取用「${safeDisplay(material.item.name)}」。请核对权限、文件版本或大小，再刷新后重试。`);
        }
        await current.valid();
        if (!live.items.has(id) || !validName(file.name, kind) || !usableSize(file.bytes.length, kind))
          throw Error("资料已变化或超过单份大小限制，请重新选择。");
        if (kind === "reference") referenceBytes += file.bytes.length;
        if (referenceBytes > maxReferenceBytes) throw Error("参考资料合计超过 80 MiB，请分批取用。");
        output.push({ kind, id, name: file.name, bytes: Uint8Array.from(file.bytes).buffer });
      }
      return output;
    } finally { live.busy = false; }
  }

  ipcMain.handle("dsh-workbench-materials-read", async (event, value: unknown) => {
    const [file] = await readMaterials(event, [value]);
    return { name: file.name, bytes: file.bytes };
  });
  ipcMain.handle("dsh-workbench-materials-read-many", (event, value: unknown) =>
    readMaterials(event, (value as { selections?: unknown })?.selections));
}
