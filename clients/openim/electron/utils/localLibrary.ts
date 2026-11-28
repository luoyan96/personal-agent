import { createHash } from "node:crypto";
import { constants, promises as fs } from "node:fs";
import path from "node:path";

export type LocalLibraryFile = {
  /** Path relative to the registered folder; templates store this, not an absolute path. */
  rel: string;
  name: string;
  size: number;
  updatedAt: string;
};

export type LocalLibraryManifest = {
  root: string;
  name: string;
  files: LocalLibraryFile[];
  truncated: boolean;
};

/** Only documents and images are listed; a work folder full of code stays out of the way. */
const allowedExtensions = new Set([
  ".pptx",
  ".ppt",
  ".potx",
  ".docx",
  ".doc",
  ".pdf",
  ".xlsx",
  ".xls",
  ".csv",
  ".tsv",
  ".md",
  ".txt",
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".drawio",
]);

const skippedDirectories = new Set([
  "node_modules",
  ".git",
  ".svn",
  "$RECYCLE.BIN",
  "System Volume Information",
]);

export const localLibraryLimits = {
  maxFiles: 2000,
  maxDepth: 6,
  scanMs: 6000,
} as const;

/** A relative path must stay inside the registered folder; `..` never escapes. */
export function insideRoot(root: string, candidate: string) {
  const rel = path.relative(root, candidate);
  return !!rel && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

export function resolveInRoot(root: string, rel: string) {
  const resolved = path.resolve(root, rel);
  if (path.parse(rel).root || !insideRoot(root, resolved))
    throw new Error("这个文件不在登记的本地资料文件夹里。");
  return resolved;
}

export function libraryFileName(rel: string) {
  return rel.split(/[\\/]/).pop() || rel;
}

function inDirectory(root: string, candidate: string) {
  return !path.relative(root, candidate) || insideRoot(root, candidate);
}

export async function scanLibrary(
  root: string,
  { excludedRoot, allFiles = false }: { excludedRoot?: string; allFiles?: boolean } = {},
): Promise<LocalLibraryManifest> {
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("登记的本地资料路径不是文件夹。");
  const canonicalRoot = await fs.realpath(root);
  const files: LocalLibraryFile[] = [];
  const started = Date.now();
  let truncated = false;
  const directories: { absolute: string; depth: number }[] = [
    { absolute: canonicalRoot, depth: 0 },
  ];
  while (directories.length) {
    if (
      Date.now() - started > localLibraryLimits.scanMs ||
      files.length >= localLibraryLimits.maxFiles
    ) {
      truncated = true;
      break;
    }
    const directory = directories.shift()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(directory.absolute, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absolute = path.join(directory.absolute, entry.name);
      if (entry.isSymbolicLink() || (excludedRoot && inDirectory(excludedRoot, absolute)))
        continue;
      if (entry.isDirectory()) {
        if (!allFiles && (entry.name.startsWith(".") || skippedDirectories.has(entry.name))) continue;
        if (directory.depth + 1 > localLibraryLimits.maxDepth) continue;
        directories.push({ absolute, depth: directory.depth + 1 });
        continue;
      }
      if (!entry.isFile()) continue;
      if (!allFiles && !allowedExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      let info: import("node:fs").Stats;
      try {
        info = await fs.lstat(absolute);
      } catch {
        continue;
      }
      if (!info.isFile() || (!allFiles && info.size < 1)) continue;
      files.push({
        rel: path.relative(canonicalRoot, absolute),
        name: entry.name,
        size: info.size,
        updatedAt: info.mtime.toISOString(),
      });
      if (files.length >= localLibraryLimits.maxFiles) {
        truncated = true;
        break;
      }
    }
  }
  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { root, name: path.basename(root), files, truncated };
}

export async function resolveLibraryFile(root: string, rel: string, excludedRoot?: string) {
  if (typeof rel !== "string" || !rel) throw new Error("请指定资料文件。");
  const canonicalRoot = await fs.realpath(root);
  const file = resolveInRoot(canonicalRoot, rel);
  if (excludedRoot && inDirectory(excludedRoot, file))
    throw new Error("这份文件位于个人资料文件夹。");
  const actual = await fs.realpath(file);
  if (path.relative(actual, file)) throw new Error("资料文件不能通过链接访问。");
  const info = await fs.lstat(file);
  if (!info.isFile() || info.isSymbolicLink())
    throw new Error("这个路径不是普通文件。");
  return { file, info };
}

/** Used to tell "same file" from "same name" when a project has several copies. */
export async function hashLibraryFile(root: string, rel: string, excludedRoot?: string) {
  const { file, info } = await resolveLibraryFile(root, rel, excludedRoot);
  if (info.size > 200 * 1024 * 1024) throw new Error("文件超过 200MB，暂不校验版本。");
  const hash = createHash("sha256");
  hash.update(await fs.readFile(file));
  return { sha256: hash.digest("hex"), size: info.size };
}

async function personalLibraryHome(userData: string) {
  return path.join(await fs.realpath(userData), "personal-files");
}

export async function sharedLibraryFolder(userData: string, root: string) {
  const info = await fs.lstat(root);
  if (!info.isDirectory() || info.isSymbolicLink())
    throw new Error("登记的本地资料路径不是文件夹。");
  const excludedRoot = await personalLibraryHome(userData);
  if (inDirectory(excludedRoot, await fs.realpath(root)))
    throw new Error("请选择课题组资料所在的文件夹。");
  return { root, excludedRoot };
}

export async function registeredLibraryRoot(userData: string): Promise<string | undefined> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(userData, "local-library.json"), "utf8"));
    return typeof value?.root === "string" && value.root.length < 4096 && value.root
      ? value.root
      : undefined;
  } catch {
    return undefined;
  }
}

export async function registeredLibraryFolder(userData: string) {
  const root = await registeredLibraryRoot(userData);
  if (!root) throw new Error("还没有登记课题组资料文件夹。");
  return sharedLibraryFolder(userData, root);
}

export async function localLibraryPaths(userData: string, rels: string[]) {
  const { root, excludedRoot } = await registeredLibraryFolder(userData);
  return Promise.all(rels.slice(0, 20).map(async (rel) => (
    await resolveLibraryFile(root, rel, excludedRoot)
  ).file));
}

export async function ensurePersonalLibrary(userData: string, identity: string) {
  if (!/^[a-f0-9]{64}$/.test(identity)) throw new Error("无法核对资料账号。");
  const home = await personalLibraryHome(userData);
  const account = path.join(home, identity);
  const root = path.join(account, "myfiles");
  for (const directory of [home, account, root]) {
    await fs.mkdir(directory, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const info = await fs.lstat(directory);
    if (!info.isDirectory() || info.isSymbolicLink())
      throw new Error("个人资料路径必须是普通文件夹。");
  }
  if (path.relative(root, await fs.realpath(root)))
    throw new Error("个人资料路径必须是普通文件夹。");
  await fs.access(root, constants.R_OK | constants.W_OK);
  return root;
}

export async function personalLibraryPaths(userData: string, identity: string, rels: string[]) {
  const root = await ensurePersonalLibrary(userData, identity);
  return Promise.all(rels.slice(0, 20).map(async (rel) => (
    await resolveLibraryFile(root, rel)
  ).file));
}

export async function copyPersonalFiles(
  root: string,
  sources: string[],
  valid: () => Promise<void>,
) {
  const created: string[] = [];
  try {
    for (const source of sources) {
      const name = path.basename(source);
      const ext = path.extname(name);
      const info = await fs.lstat(source);
      if (!info.isFile() || info.isSymbolicLink())
        throw new Error(`无法添加“${name}”，请选择普通文件。`);
      // A file picked inside this folder already has a list entry.
      if (insideRoot(root, await fs.realpath(source))) continue;
      for (let index = 1; ; index++) {
        const destination = path.join(root, index === 1 ? name : `${path.basename(name, ext)} (${index})${ext}`);
        await valid();
        try {
          await fs.copyFile(source, destination, constants.COPYFILE_EXCL);
          created.push(destination);
          break;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
      }
    }
    const manifest = await scanLibrary(root, { allFiles: true });
    await valid();
    return manifest;
  } catch (error) {
    await Promise.allSettled(created.map((file) => fs.unlink(file)));
    throw error;
  }
}
