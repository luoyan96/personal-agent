import { randomUUID } from "node:crypto";
import { promises as fs, constants, type Stats } from "node:fs";
import path from "node:path";
import type {
  LocalFolderErrorCode,
  LocalFolderFile,
  LocalFolderFileKind,
  LocalFolderManifest,
  LocalFolderReadRequest,
  LocalFolderSelection,
} from "../../src/types/localFolder";

const messages: Record<LocalFolderErrorCode, string> = {
  LOCAL_FOLDER_FORBIDDEN: "此页面没有本地文件夹访问权限。",
  LOCAL_FOLDER_REVOKED: "文件夹授权已失效，请重新选择。",
  LOCAL_FOLDER_CHANGED: "文件或文件夹已经变化，请重新选择。",
  LOCAL_FOLDER_INVALID_SELECTION: "请选择授权列表中的1至10个文件。",
  LOCAL_FOLDER_TOO_LARGE: "文件内容超过读取上限，请减少选择或使用更小的文件。",
  LOCAL_FOLDER_BINARY: "文件不是可读取的UTF-8文本。",
  LOCAL_FOLDER_PARSE_FAILED: "文件无法解析，可能损坏或格式不支持。",
  LOCAL_FOLDER_NO_TEXT: "文件没有可提取的文字，不支持扫描OCR。",
  LOCAL_FOLDER_ENCRYPTED: "文件已加密，请先在本机解密。",
  LOCAL_FOLDER_TIMEOUT: "读取超时，请选择更小的文件。",
};
export function localFolderFail(code: LocalFolderErrorCode): never {
  throw new Error(`${code}: ${messages[code]}`);
}
export const localFolderLimits = {
  maxSelectedFiles: 10,
  maxMergedBytes: 52000,
  maxFiles: 200,
  maxEntries: 10000,
  maxDepth: 12,
  scanMs: 3000,
  textBytes: 2097152,
  pdfBytes: 10485760,
} as const;
const codeExtensions = new Set([
  ".txt",
  ".md",
  ".csv",
  ".json",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".r",
  ".rb",
  ".go",
  ".rs",
  ".java",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cs",
  ".sh",
  ".sql",
  ".yaml",
  ".yml",
  ".toml",
  ".html",
  ".css",
  ".scss",
  ".xml",
]);
export function localFolderKind(name: string): LocalFolderFileKind | undefined {
  const extension = path.extname(name).toLowerCase();
  return extension === ".pdf"
    ? "pdf"
    : extension === ".docx"
    ? "docx"
    : codeExtensions.has(extension)
    ? "text"
    : undefined;
}
export function excludedLocalName(name: string) {
  return (
    name.startsWith(".") ||
    ["node_modules", "vendor", "dist", "build", "release", "coverage"].includes(
      name.toLowerCase(),
    ) ||
    /(?:^|[._-])(?:credentials?|secrets?|passwords?|tokens?|private[-_]?key|id_rsa|id_ed25519|api[-_]?key|accounts?)(?:[._-]|$)/i.test(
      name,
    )
  );
}
const inside = (root: string, file: string) => {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    !relative.startsWith(".." + path.sep) &&
    relative !== ".." &&
    !path.isAbsolute(relative)
  );
};
const sameFile = (a: Stats, b: Stats) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs;
type Entry = { file: LocalFolderFile; stat: Stats; absolute: string };
type Grant = {
  id: string;
  owner: string;
  root: string;
  stat: Stats;
  abort: AbortController;
  files: Map<string, Entry>;
};
export type LocalDocumentParser = (
  bytes: Uint8Array,
  kind: "pdf" | "docx",
  signal: AbortSignal,
) => Promise<{ text: string; pageCount?: number }>;
export class LocalFolderStore {
  private grants = new Map<string, Grant>();
  private parser: LocalDocumentParser;
  constructor(parser: LocalDocumentParser) {
    this.parser = parser;
  }
  releaseAll(owner?: string) {
    for (const [id, grant] of this.grants)
      if (owner === undefined || grant.owner === owner) {
        grant.abort.abort();
        this.grants.delete(id);
      }
  }
  release(id: unknown, owner: string) {
    if (typeof id !== "string" || id.length > 100)
      localFolderFail("LOCAL_FOLDER_INVALID_SELECTION");
    const grant = this.grants.get(id);
    if (grant && grant.owner !== owner) localFolderFail("LOCAL_FOLDER_FORBIDDEN");
    if (grant) {
      grant.abort.abort();
      this.grants.delete(id);
    }
  }
  private valid(grant: Grant, owner: string) {
    if (grant.owner !== owner) localFolderFail("LOCAL_FOLDER_FORBIDDEN");
    if (this.grants.get(grant.id) !== grant || grant.abort.signal.aborted)
      localFolderFail("LOCAL_FOLDER_REVOKED");
  }
  private async safePath(grant: Grant, file: string) {
    this.valid(grant, grant.owner);
    const root = await fs.lstat(grant.root);
    if (
      !root.isDirectory() ||
      root.isSymbolicLink() ||
      root.dev !== grant.stat.dev ||
      root.ino !== grant.stat.ino ||
      (await fs.realpath(grant.root)) !== grant.root
    )
      localFolderFail("LOCAL_FOLDER_CHANGED");
    if (!inside(grant.root, file)) localFolderFail("LOCAL_FOLDER_FORBIDDEN");
    const parts = path.relative(grant.root, file).split(path.sep);
    let current = grant.root;
    for (const part of parts) {
      if (!part || part === "." || part === ".." || excludedLocalName(part))
        localFolderFail("LOCAL_FOLDER_FORBIDDEN");
      current = path.join(current, part);
      if ((await fs.lstat(current)).isSymbolicLink())
        localFolderFail("LOCAL_FOLDER_CHANGED");
    }
    const real = await fs.realpath(file);
    if (!inside(grant.root, real) || real !== file)
      localFolderFail("LOCAL_FOLDER_CHANGED");
  }
  async scan(chosenPath: string, owner: string): Promise<LocalFolderManifest> {
    const first = await fs.lstat(chosenPath);
    if (!first.isDirectory() || first.isSymbolicLink())
      localFolderFail("LOCAL_FOLDER_FORBIDDEN");
    const root = await fs.realpath(chosenPath),
      stat = await fs.lstat(root),
      id = randomUUID(),
      grant: Grant = {
        id,
        owner,
        root,
        stat,
        abort: new AbortController(),
        files: new Map(),
      };
    if (excludedLocalName(path.basename(root)))
      localFolderFail("LOCAL_FOLDER_FORBIDDEN");
    this.releaseAll(owner);
    this.grants.set(id, grant);
    const manifest: LocalFolderManifest = {
      grantId: id,
      folderName: path.basename(root),
      files: [],
      scan: { visitedEntries: 0, excludedEntries: 0, truncated: false },
      limits: { maxSelectedFiles: 10, maxMergedBytes: 52000 },
    };
    const started = Date.now(),
      directories = [{ absolute: root, depth: 0 }];
    try {
      while (directories.length) {
        this.valid(grant, owner);
        if (
          Date.now() - started > localFolderLimits.scanMs ||
          manifest.scan.visitedEntries >= localFolderLimits.maxEntries ||
          manifest.files.length >= localFolderLimits.maxFiles
        ) {
          manifest.scan.truncated = true;
          break;
        }
        const directory = directories.pop()!;
        if (directory.absolute !== root) await this.safePath(grant, directory.absolute);
        let handle;
        try {
          handle = await fs.opendir(directory.absolute);
        } catch {
          manifest.scan.excludedEntries++;
          continue;
        }
        try {
          for await (const entry of handle) {
            this.valid(grant, owner);
            manifest.scan.visitedEntries++;
            if (
              Date.now() - started > localFolderLimits.scanMs ||
              manifest.scan.visitedEntries > localFolderLimits.maxEntries ||
              manifest.files.length >= localFolderLimits.maxFiles
            ) {
              manifest.scan.truncated = true;
              break;
            }
            if (excludedLocalName(entry.name)) {
              manifest.scan.excludedEntries++;
              continue;
            }
            const absolute = path.join(directory.absolute, entry.name);
            let item: Stats;
            try {
              await this.safePath(grant, absolute);
              item = await fs.lstat(absolute);
            } catch {
              manifest.scan.excludedEntries++;
              continue;
            }
            if (item.isDirectory()) {
              if (directory.depth < localFolderLimits.maxDepth)
                directories.push({ absolute, depth: directory.depth + 1 });
              else {
                manifest.scan.excludedEntries++;
                manifest.scan.truncated = true;
              }
              continue;
            }
            const kind = localFolderKind(entry.name),
              limit =
                kind === "text"
                  ? localFolderLimits.textBytes
                  : localFolderLimits.pdfBytes;
            if (!item.isFile() || !kind || item.size < 1 || item.size > limit) {
              manifest.scan.excludedEntries++;
              continue;
            }
            const file: LocalFolderFile = {
              id: randomUUID(),
              relativePath: path.relative(root, absolute).split(path.sep).join("/"),
              byteLength: item.size,
              kind,
            };
            grant.files.set(file.id, { file, stat: item, absolute });
            manifest.files.push(file);
          }
        } finally {
          try {
            await handle.close();
          } catch {
            /* for-await already closed */
          }
        }
      }
      this.valid(grant, owner);
      manifest.files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
      return manifest;
    } catch (error) {
      this.release(id, owner);
      if (error instanceof Error && error.message.startsWith("LOCAL_FOLDER_"))
        throw error;
      localFolderFail("LOCAL_FOLDER_CHANGED");
    }
  }
  async read(
    request: LocalFolderReadRequest,
    owner: string,
  ): Promise<LocalFolderSelection> {
    if (
      !request ||
      typeof request !== "object" ||
      Object.keys(request).some((key) => !["grantId", "fileIds", "mode"].includes(key)) ||
      (request.mode !== undefined && request.mode !== "workspace") ||
      typeof request.grantId !== "string" ||
      !Array.isArray(request.fileIds) ||
      request.fileIds.length < 1 ||
      request.fileIds.length > 10 ||
      request.fileIds.some((id) => typeof id !== "string" || id.length > 100) ||
      new Set(request.fileIds).size !== request.fileIds.length ||
      (request.mode === "workspace" && request.fileIds.length !== 1)
    )
      localFolderFail("LOCAL_FOLDER_INVALID_SELECTION");
    const grant = this.grants.get(request.grantId);
    if (!grant) localFolderFail("LOCAL_FOLDER_REVOKED");
    this.valid(grant, owner);
    const selected: LocalFolderSelection["files"] = [];
    const started = Date.now();
    try {
      for (const id of request.fileIds) {
        this.valid(grant, owner);
        if (Date.now() - started > 30000) localFolderFail("LOCAL_FOLDER_TIMEOUT");
        const entry = grant.files.get(id);
        if (!entry) localFolderFail("LOCAL_FOLDER_INVALID_SELECTION");
        await this.safePath(grant, entry.absolute);
        const handle = await fs.open(
          entry.absolute,
          constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
        );
        let bytes: Buffer;
        try {
          const before = await handle.stat();
          if (!before.isFile() || !sameFile(before, entry.stat))
            localFolderFail("LOCAL_FOLDER_CHANGED");
          await this.safePath(grant, entry.absolute);
          bytes = Buffer.alloc(entry.stat.size);
          let offset = 0;
          while (offset < bytes.length) {
            this.valid(grant, owner);
            const part = await handle.read(
              bytes,
              offset,
              Math.min(65536, bytes.length - offset),
              offset,
            );
            if (!part.bytesRead) localFolderFail("LOCAL_FOLDER_CHANGED");
            offset += part.bytesRead;
          }
          const extra = await handle.read(Buffer.alloc(1), 0, 1, bytes.length);
          if (extra.bytesRead || !sameFile(await handle.stat(), entry.stat))
            localFolderFail("LOCAL_FOLDER_CHANGED");
        } finally {
          await handle.close();
        }
        await this.safePath(grant, entry.absolute);
        this.valid(grant, owner);
        let content: { text: string; pageCount?: number };
        if (entry.file.kind === "text") {
          let text: string;
          try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          } catch {
            localFolderFail("LOCAL_FOLDER_BINARY");
          }
          if (text.includes("\0") || /[\x01-\x08\x0b\x0e-\x1f]/.test(text))
            localFolderFail("LOCAL_FOLDER_BINARY");
          content = { text };
        } else {
          try {
            content = await this.parser(bytes, entry.file.kind, grant.abort.signal);
          } catch (error) {
            if (error instanceof Error && error.message.startsWith("LOCAL_FOLDER_"))
              throw error;
            localFolderFail("LOCAL_FOLDER_PARSE_FAILED");
          }
        }
        this.valid(grant, owner);
        if (!content.text.trim()) localFolderFail("LOCAL_FOLDER_NO_TEXT");
        selected.push({ ...entry.file, ...content });
        // All source text and path headers count; no file or tail is silently cut.
        if ((request.mode === "workspace" && content.text.length > 200000) ||
          Buffer.byteLength(JSON.stringify(this.markdown(selected)), "utf8") >
            (request.mode === "workspace" ? 512000 : 52000))
          localFolderFail("LOCAL_FOLDER_TOO_LARGE");
      }
      // Recheck the whole selection after slower PDF extraction, not just the last
      // file, so a changed/revoked earlier file cannot be silently submitted.
      for (const file of selected) {
        const entry = grant.files.get(file.id)!;
        await this.safePath(grant, entry.absolute);
        if (!sameFile(await fs.lstat(entry.absolute), entry.stat))
          localFolderFail("LOCAL_FOLDER_CHANGED");
      }
      this.valid(grant, owner);
      const markdown = this.markdown(selected);
      return {
        grantId: grant.id,
        files: selected,
        markdown,
        utf8Bytes: Buffer.byteLength(markdown, "utf8"),
      };
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("LOCAL_FOLDER_"))
        throw error;
      localFolderFail("LOCAL_FOLDER_CHANGED");
    }
  }
  private markdown(files: LocalFolderSelection["files"]) {
    return files
      .map((file) => `## ${JSON.stringify(file.relativePath)}\n\n${file.text}\n`)
      .join("\n");
  }
}
