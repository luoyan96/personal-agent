import { promises as fs } from "node:fs";
import path from "node:path";
import { request } from "node:https";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import {
  parseImportedSkill,
  validateImportedSkillText,
  safeSkillPath,
  type SkillFile,
  type SkillBundleManifest,
  type SkillBundleFile,
} from "@research-agent-platform/research-skills/import";

const AdmZip = createRequire(__filename)("adm-zip");
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_FILES = 8000,
  MAX_BYTES = 100 * 1024 * 1024;
function readSkillText(relative: string, data: Buffer) {
  if (data.length > 400000)
    throw Error(`技能文字文件“${relative}”超过 400 KB，未导入，请先拆分文件。`);
  let text: string;
  try {
    text = decoder.decode(data);
  } catch {
    throw Error(`技能文字文件“${relative}”不是有效 UTF-8，请转换编码后重试。`);
  }
  if (relative !== "SKILL.md") validateImportedSkillText(relative, text);
  return text;
}
type Entry = { path: string; size: number; read: () => Promise<Buffer> };
// Follow only provided text documents. A link is never a download, a read
// outside this selected package, or permission to run the linked file.
function linkedTextPaths(file: SkillFile) {
  const prose = file.text.replace(
    /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*(?:\n|$)/gm,
    "",
  );
  const linkProse = prose.replace(/`+[^`\n]*`+/g, "");
  const links = [
    ...Array.from(
      linkProse.matchAll(/\]\(\s*(?:<([^>\n]+)>|([^\s)]+))/g),
      (m) => m[1] || m[2]!,
    ),
    ...Array.from(
      linkProse.matchAll(/^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|([^\s]+))/gm),
      (m) => m[1] || m[2]!,
    ),
    ...Array.from(prose.matchAll(/`([^`\n]+)`/g), (m) => m[1]!),
  ];
  return links.flatMap((link) => {
    try {
      if (/^(?:[a-z][a-z\d+.-]*:|\/|\\)/i.test(link)) return [];
      const raw = decodeURIComponent(link.split(/[?#]/, 1)[0]!);
      if (!raw || raw.startsWith("/") || /[\\\x00-\x1f:]/.test(raw)) return [];
      const target = path.posix.normalize(
        path.posix.join(path.posix.dirname(file.path), raw),
      );
      safeSkillPath(target);
      if (
        /^(?:scripts|_upstream-notices)\//.test(target) ||
        !/\.(?:md|txt|json|ya?ml|csv|tsv)$/i.test(target)
      )
        return [];
      return [target];
    } catch {
      return [];
    }
  });
}
export type SkillBundleData = {
  package: ReturnType<typeof parseImportedSkill>;
  manifest: SkillBundleManifest;
  contents: Map<string, Buffer>;
  originalZip?: Buffer;
};
const sha = (data: Buffer | string) => createHash("sha256").update(data).digest("hex");
export function skillMediaType(name: string) {
  return (
    (
      {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".svg": "image/svg+xml",
        ".pdf": "application/pdf",
        ".json": "application/json",
        ".md": "text/markdown",
        ".txt": "text/plain",
        ".csv": "text/csv",
        ".py": "text/x-python",
        ".js": "text/javascript",
        ".ts": "text/plain",
        ".yaml": "text/plain",
        ".yml": "text/plain",
      } as Record<string, string>
    )[path.extname(name).toLowerCase()] || "application/octet-stream"
  );
}
async function parsed(
  entries: Entry[],
  originalZip?: Buffer,
): Promise<SkillBundleData> {
  if (entries.length > MAX_FILES || entries.reduce((n, f) => n + f.size, 0) > MAX_BYTES)
    throw Error("技能包超过 8,000 个文件或 100 MB。");
  const seen = new Set<string>();
  let root: string | undefined;
  for (const e of entries) {
    safeSkillPath(e.path);
    if (!Number.isSafeInteger(e.size) || e.size < 0 || e.size > MAX_BYTES)
      throw Error("技能文件长度无效。");
    const lower = e.path.normalize("NFC").toLowerCase();
    if (seen.has(lower)) throw Error("技能包含重复路径。");
    seen.add(lower);
    if (e.path === "SKILL.md") root = "";
  }
  if (root === undefined) {
    const candidates = entries.filter((e) => e.path.endsWith("/SKILL.md"));
    if (candidates.length !== 1) throw Error("需要选择单个含 SKILL.md 的技能包。");
    root = candidates[0].path.slice(0, -8);
  }
  const scoped = entries
    .filter((e) => e.path.startsWith(root!))
    .map((e) => ({ ...e, path: e.path.slice(root!.length) }));
  const textual = scoped.filter(
    (e) =>
      e.path === "SKILL.md" ||
      (e.path.startsWith("references/") && /\.(md|txt|json|ya?ml)$/.test(e.path)),
  );
  if (textual.reduce((n, e) => n + e.size, 0) > 900000)
    throw Error("技能说明和参考文字超过 900 KB，未导入，请先拆分技能。");
  const files: SkillFile[] = [],
    contents = new Map<string, Buffer>(),
    manifestFiles: SkillBundleFile[] = [];
  let actualBytes = 0;
  const textPaths = new Set(textual.map((e) => e.path));
  for (const e of scoped) {
    if (textPaths.has(e.path) && e.size > 400000)
      throw Error(`技能文字文件“${e.path}”超过 400 KB，未导入，请先拆分文件。`);
    const data = await e.read();
    if (data.length !== e.size) throw Error("技能文件已变化或 ZIP 长度损坏。");
    actualBytes += data.length;
    if (actualBytes > MAX_BYTES) throw Error("技能包实际解压超过 100 MB。");
    if (textPaths.has(e.path)) files.push({ path: e.path, text: readSkillText(e.path, data) });
    contents.set(e.path, data);
    manifestFiles.push({
      path: e.path,
      category:
        e.path === "SKILL.md"
          ? "instruction"
          : e.path.startsWith("references/")
          ? "reference"
          : e.path.startsWith("scripts/")
          ? "script"
          : e.path.startsWith("assets/")
          ? "asset"
          : "other",
      mediaType: skillMediaType(e.path),
      size: data.length,
      sha256: sha(data),
    });
  }
  // Templates and method docs outside references/ were preserved as originals
  // but unavailable to chat. Include only text explicitly mentioned by the
  // instruction/reference graph; retain every original byte in the local bundle.
  let textBytes = textual.reduce((n, e) => n + e.size, 0);
  for (let i = 0; i < files.length; i++) {
    for (const target of linkedTextPaths(files[i]!)) {
      const data = contents.get(target);
      if (!data || textPaths.has(target)) continue;
      const text = readSkillText(target, data);
      if (textBytes + data.length > 900000)
        throw Error("技能说明和参考文字超过 900 KB，未导入，请先拆分技能。");
      files.push({ path: target, text });
      textPaths.add(target);
      textBytes += data.length;
      if (files.length > 300) throw Error("技能文字文件过多，请先拆分技能。");
    }
  }
  const pkg = parseImportedSkill(
    files,
    scoped.filter((e) => /^scripts\//.test(e.path)).length,
    scoped.filter((e) => /^assets\//.test(e.path)).length,
  );
  manifestFiles.sort((a, b) => a.path.localeCompare(b.path, "en"));
  return {
    package: pkg,
    contents,
    originalZip,
    manifest: {
      format: 1,
      packageDigest: sha(JSON.stringify(pkg)),
      bundleDigest: sha(JSON.stringify(manifestFiles)),
      files: manifestFiles,
      totalBytes: actualBytes,
      ...(originalZip
        ? { originalZip: { size: originalZip.length, sha256: sha(originalZip) } }
        : {}),
    },
  };
}
export async function importSkillZip(bytes: Buffer) {
  return (await importSkillZipBundle(bytes)).package;
}
export async function importSkillZipBundle(bytes: Buffer, selectedRoot?: string) {
  if (bytes.length > 32 * 1024 * 1024) throw Error("技能 ZIP 超过 32 MB。");
  const zip = new AdmZip(bytes),
    entries: Entry[] = [];
  const names = new Set<string>();
  for (const e of zip.getEntries()) {
    const name = e.entryName;
    safeSkillPath(name.endsWith("/") ? name.slice(0, -1) : name);
    const normalized = name.replace(/\/$/, "").normalize("NFC").toLowerCase();
    if (names.has(normalized)) throw Error("技能 ZIP 包含重复或歧义路径。");
    names.add(normalized);
    if (((e.header.attr >>> 16) & 0xf000) === 0xa000)
      throw Error("技能包不允许符号链接。");
    if (e.isDirectory) continue;
    entries.push({ path: name, size: e.header.size, read: async () => e.getData() });
  }
  // Selecting a folder must not bypass the limits on the complete archive.
  if (
    entries.length > MAX_FILES ||
    entries.some((e) => !Number.isSafeInteger(e.size) || e.size < 0) ||
    entries.reduce((total, e) => total + e.size, 0) > MAX_BYTES
  )
    throw Error("技能包超过 8,000 个文件或 100 MB。");
  if (selectedRoot !== undefined) {
    safeSkillPath(selectedRoot);
    const roots = new Set(entries.map((e) => e.path.split("/")[0]));
    if (roots.size !== 1) throw Error("GitHub 原包的根目录无法确认。");
    const archiveRoot = [...roots][0]!;
    const prefix = `${archiveRoot}/${selectedRoot}/`;
    const selected = entries
      .filter((e) => e.path.startsWith(prefix))
      .map((e) => ({ ...e, path: e.path.slice(prefix.length) }));
    if (!selected.some((e) => e.path === "SKILL.md"))
      throw Error("所选 GitHub 目录未找到 SKILL.md。");
    // Preserve applicable ancestor notices as original data, outside model references.
    const ancestors = [
      archiveRoot,
      ...selectedRoot
        .split("/")
        .map((_, i, parts) => `${archiveRoot}/${parts.slice(0, i + 1).join("/")}`),
    ];
    for (let i = 0; i < ancestors.length - 1; i++) {
      for (const file of entries.filter(
        (e) =>
          e.path.startsWith(`${ancestors[i]}/`) &&
          !e.path.slice(ancestors[i]!.length + 1).includes("/") &&
          /^(?:licen[cs]e|notice|copying)(?:\.[a-z0-9_-]+)?$/i.test(
            e.path.split("/").at(-1)!,
          ),
      )) {
        selected.push({
          ...file,
          path: `_upstream-notices/${i}/${file.path.split("/").at(-1)}`,
        });
      }
    }
    return parsed(selected, bytes);
  }
  return parsed(entries, bytes);
}
export async function importSkillFolder(folder: string) {
  return (await importSkillFolderBundle(folder)).package;
}
export async function importSkillFolderBundle(folder: string) {
  const selectedRoot = await fs.lstat(folder);
  if (selectedRoot.isSymbolicLink() || !selectedRoot.isDirectory())
    throw Error("请选择原始技能目录，不能使用链接。");
  const root = await fs.realpath(folder),
    entries: Entry[] = [];
  let visited = 0;
  async function walk(dir: string, depth: number) {
    if (depth > 20 || ++visited > MAX_FILES) throw Error("技能目录过大。");
    for (const child of await fs.readdir(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "__pycache__"].includes(child.name)) continue;
      const full = path.join(dir, child.name),
        stat = await fs.lstat(full);
      if (stat.isSymbolicLink() || (stat.isFile() && stat.nlink > 1))
        throw Error("技能目录不允许链接。");
      if (child.isDirectory()) await walk(full, depth + 1);
      else if (stat.isFile()) {
        if (entries.length >= MAX_FILES) throw Error("技能目录文件过多。");
        const relative = path.relative(root, full).split(path.sep).join("/");
        entries.push({
          path: relative,
          size: stat.size,
          read: async () => {
            const current = await fs.lstat(full);
            if (
              current.isSymbolicLink() ||
              current.size !== stat.size ||
              current.mtimeMs !== stat.mtimeMs ||
              (await fs.realpath(full)) !== full
            )
              throw Error("技能文件已变化。");
            const handle = await fs.open(full, "r");
            try {
              const opened = await handle.stat();
              if (
                opened.dev !== stat.dev ||
                opened.ino !== stat.ino ||
                opened.size !== stat.size ||
                opened.mtimeMs !== stat.mtimeMs ||
                opened.ctimeMs !== stat.ctimeMs
              )
                throw Error("技能文件已变化。");
              const data = await handle.readFile();
              const after = await handle.stat();
              if (
                after.size !== opened.size ||
                after.mtimeMs !== opened.mtimeMs ||
                after.ctimeMs !== opened.ctimeMs ||
                (await fs.realpath(full)) !== full
              )
                throw Error("技能文件已变化。");
              return data;
            } finally {
              await handle.close();
            }
          },
        });
      }
    }
  }
  await walk(root, 0);
  return parsed(entries);
}
export async function skillDownload(url: string, limit: number) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    !["api.github.com", "raw.githubusercontent.com", "codeload.github.com"].includes(
      u.hostname,
    )
  )
    throw Error("只支持 GitHub 官方下载地址。");
  return new Promise<Buffer>((resolve, reject) => {
    let done = false;
    const finish = (error?: Error, data?: Buffer) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        req.destroy();
        reject(error);
      } else resolve(data!);
    };
    const req = request(
      u,
      {
        headers: {
          "User-Agent": "Personal-Agent-Skill-Installer",
          Accept: "application/vnd.github+json",
        },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          finish(Error(`GitHub 下载失败（${res.statusCode}）。`));
          return;
        }
        let size = 0;
        const parts: Buffer[] = [];
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > limit) finish(Error("GitHub 文件超过大小限制。"));
          else parts.push(c);
        });
        res.on("end", () => finish(undefined, Buffer.concat(parts)));
        res.on("error", (e) => finish(e));
        res.on("aborted", () => finish(Error("GitHub 下载中断。")));
      },
    );
    const timer = setTimeout(() => finish(Error("GitHub 下载超时，请重试。")), 60000);
    req.on("error", (e) => finish(e));
    req.end();
  });
}
export async function githubSkillOptions(address: string) {
  const match =
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?(?:\/tree\/([a-f0-9]{40})\/(.+?))?\/?$/.exec(
      address,
    );
  if (
    !match ||
    match[1] === "." ||
    match[2] === "." ||
    match[1] === ".." ||
    match[2] === ".."
  )
    throw Error("请输入 GitHub 仓库地址，或 tree/完整40位提交/技能目录地址。");
  const repo = `${match[1]}/${match[2]}`;
  const root = match[4] ? safeSkillPath(decodeURIComponent(match[4])) : undefined;
  const commit = match[3]
    ? { sha: match[3] }
    : JSON.parse(
        (
          await skillDownload(
            `https://api.github.com/repos/${repo}/commits/HEAD`,
            2000000,
          )
        ).toString("utf8"),
      );
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw Error("GitHub 版本无法确认。");
  if (root) {
    // A caller-supplied immutable commit needs no API discovery. Use the public
    // raw instruction to avoid an unrelated unauthenticated API quota failure.
    await skillDownload(
      `https://raw.githubusercontent.com/${repo}/${commit.sha}/${root
        .split("/")
        .map(encodeURIComponent)
        .join("/")}/SKILL.md`,
      400000,
    );
    return {
      repo,
      revision: commit.sha,
      options: [
        {
          label: root,
          url: `https://codeload.github.com/${repo}/zip/${commit.sha}`,
          root,
        },
      ],
    };
  }
  const files = JSON.parse(
    (
      await skillDownload(
        `https://api.github.com/repos/${repo}/contents?ref=${commit.sha}`,
        2000000,
      )
    ).toString("utf8"),
  );
  if (!Array.isArray(files)) throw Error("GitHub 目录无法读取。");
  const options: { label: string; url: string; root?: string }[] = files
    .filter(
      (f) => f.type === "file" && /\.zip$/i.test(f.name) && f.size <= 32 * 1024 * 1024,
    )
    .map((f) => ({
      label: String(f.name),
      url: `https://raw.githubusercontent.com/${repo}/${
        commit.sha
      }/${encodeURIComponent(f.name)}`,
    }));
  if (files.some((f) => f.name === "SKILL.md"))
    options.unshift({
      label: "仓库中的 SKILL.md",
      url: `https://codeload.github.com/${repo}/zip/${commit.sha}`,
    });
  if (!options.length)
    throw Error("仓库根目录未找到 SKILL.md 或技能 ZIP，请选择本地技能文件夹。");
  return { repo, revision: commit.sha, options };
}
