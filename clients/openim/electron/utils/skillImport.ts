import { promises as fs } from "node:fs";
import path from "node:path";
import { request } from "node:https";
import { createRequire } from "node:module";
import {
  parseImportedSkill,
  safeSkillPath,
  type SkillFile,
} from "@research-agent-platform/research-skills/import";

const AdmZip = createRequire(__filename)("adm-zip");
const decoder = new TextDecoder("utf-8", { fatal: true });
const MAX_FILES = 8000,
  MAX_BYTES = 100 * 1024 * 1024;
type Entry = { path: string; size: number; read: () => Promise<Buffer> };
async function parsed(entries: Entry[]) {
  if (entries.length > MAX_FILES || entries.reduce((n, f) => n + f.size, 0) > MAX_BYTES)
    throw Error("技能包超过 8,000 个文件或 100 MB。");
  const seen = new Set<string>();
  let root: string | undefined;
  for (const e of entries) {
    safeSkillPath(e.path);
    const lower = e.path.toLowerCase();
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
  const files: SkillFile[] = [];
  for (const e of textual) {
    if (e.size > 400000) throw Error("单个说明文件超过 400 KB。");
    const data = await e.read();
    if (data.length !== e.size) throw Error("技能文件已变化或 ZIP 长度损坏。");
    files.push({ path: e.path, text: decoder.decode(data) });
  }
  return parseImportedSkill(
    files,
    scoped.filter((e) => /^scripts\//.test(e.path)).length,
    scoped.filter((e) => /^assets\//.test(e.path)).length,
  );
}
export async function importSkillZip(bytes: Buffer) {
  if (bytes.length > 32 * 1024 * 1024) throw Error("技能 ZIP 超过 32 MB。");
  const zip = new AdmZip(bytes),
    entries: Entry[] = [];
  for (const e of zip.getEntries()) {
    const name = e.entryName;
    safeSkillPath(name.endsWith("/") ? name.slice(0, -1) : name);
    if (((e.header.fileAttr >>> 16) & 0xf000) === 0xa000)
      throw Error("技能包不允许符号链接。");
    if (e.isDirectory) continue;
    entries.push({ path: name, size: e.header.size, read: async () => e.getData() });
  }
  return parsed(entries);
}
export async function importSkillFolder(folder: string) {
  const root = await fs.realpath(folder),
    entries: Entry[] = [];
  let visited = 0;
  async function walk(dir: string, depth: number) {
    if (depth > 20 || ++visited > MAX_FILES) throw Error("技能目录过大。");
    for (const child of await fs.readdir(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "__pycache__"].includes(child.name)) continue;
      const full = path.join(dir, child.name),
        stat = await fs.lstat(full);
      if (stat.isSymbolicLink()) throw Error("技能目录不允许链接。");
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
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(
      address,
    );
  if (
    !match ||
    match[1] === "." ||
    match[2] === "." ||
    match[1] === ".." ||
    match[2] === ".."
  )
    throw Error("请输入 GitHub 仓库地址，例如 https://github.com/作者/仓库。");
  const repo = `${match[1]}/${match[2]}`,
    commit = JSON.parse(
      (
        await skillDownload(
          `https://api.github.com/repos/${repo}/commits/HEAD`,
          2000000,
        )
      ).toString("utf8"),
    );
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw Error("GitHub 版本无法确认。");
  const files = JSON.parse(
    (
      await skillDownload(
        `https://api.github.com/repos/${repo}/contents?ref=${commit.sha}`,
        2000000,
      )
    ).toString("utf8"),
  );
  if (!Array.isArray(files)) throw Error("GitHub 目录无法读取。");
  const options = files
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
