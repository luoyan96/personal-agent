import { createHash, randomUUID } from "node:crypto";
import { promises as fs, constants } from "node:fs";
import path from "node:path";
import type {
  DesktopReportArtifact,
  DesktopReportErrorCode,
  DesktopReportScope,
} from "../../src/types/desktopWork";

export const desktopReportLimits = {
  markdownBytes: 1048576,
  htmlBytes: 4194304,
  sources: 100,
  reports: 1000,
} as const;
const messages: Record<DesktopReportErrorCode, string> = {
  DESKTOP_REPORT_FORBIDDEN: "此页面没有桌面报告访问权限。",
  DESKTOP_REPORT_INVALID: "报告信息无效，请使用当前账号和聊天中的真实结果。",
  DESKTOP_REPORT_TOO_LARGE: "报告超过保存上限，请减少内容或来源文件。",
  DESKTOP_REPORT_NOT_FOUND: "没有找到此聊天的本地报告。",
  DESKTOP_REPORT_CORRUPT: "本地报告已损坏或被修改，请从原聊天重新保存。",
  DESKTOP_REPORT_IO_FAILED: "无法保存或读取本地报告，请检查磁盘和文件权限。",
  DESKTOP_REPORT_OPEN_FAILED: "系统未能打开报告，请检查默认浏览器设置。",
};
export function desktopReportFail(code: DesktopReportErrorCode): never {
  throw new Error(`${code}: ${messages[code]}`);
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const digest = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (value) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[value]!),
  );
function renderHtml(
  artifact: DesktopReportArtifact,
  markdown: string,
  sources: string[],
): string {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(
    artifact.title,
  )}</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:960px;margin:40px auto;padding:0 24px;color:#20252c;background:#fafafa}h1{font-size:26px}h2{font-size:21px}h3{font-size:18px}.report{background:white;padding:24px;border:1px solid #e5e7eb;border-radius:12px;overflow-wrap:anywhere}.report>:first-child{margin-top:0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f1f5f9;padding:16px;border-radius:8px}code{font:14px/1.6 ui-monospace,Consolas,monospace;background:#f1f5f9;padding:2px 4px;border-radius:4px}pre code{padding:0}.meta{color:#64748b;font-size:13px}</style></head><body><h1>${escapeHtml(
    artifact.title,
  )}</h1><p class="meta">${escapeHtml(
    artifact.createdAt,
  )} · 本机保存的聊天结果</p><main class="report">${renderMarkdown(
    markdown,
  )}</main><h2>来源文件</h2><ul>${sources
    .map((source) => `<li>${escapeHtml(source)}</li>`)
    .join("")}</ul></body></html>`;
}
/** Escape first; only this small set of formatting tags can be introduced. */
function renderMarkdown(markdown: string): string {
  const inlineCode = (value: string) =>
    value.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  const inline = (value: string) => {
    const matcher = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
    let output = "",
      offset = 0;
    for (const match of value.matchAll(matcher)) {
      output +=
        value.slice(offset, match.index) +
        (match[1] !== undefined
          ? `<code>${match[1]}</code>`
          : `<strong>${inlineCode(match[2]!)}</strong>`);
      offset = match.index! + match[0].length;
    }
    return output + value.slice(offset);
  };
  const output: string[] = [],
    paragraph: string[] = [],
    list: string[] = [],
    code: string[] = [];
  let inCode = false;
  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${inline(paragraph.join("\n"))}</p>`);
      paragraph.length = 0;
    }
  };
  const flushList = () => {
    if (list.length) {
      output.push(
        `<ul>${list.map((item) => `<li>${inline(item)}</li>`).join("")}</ul>`,
      );
      list.length = 0;
    }
  };
  const flushCode = () => {
    output.push(`<pre><code>${code.join("\n")}</code></pre>`);
    code.length = 0;
  };
  for (const line of escapeHtml(markdown).split(/\r?\n/)) {
    if (inCode) {
      if (/^\s{0,3}```\s*$/.test(line)) {
        flushCode();
        inCode = false;
      } else code.push(line);
      continue;
    }
    if (/^\s{0,3}```/.test(line)) {
      flushParagraph();
      flushList();
      inCode = true;
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line),
      item = /^\s*[-*]\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1]!.length;
      output.push(`<h${level}>${inline(heading[2]!)}</h${level}>`);
    } else if (item) {
      flushParagraph();
      list.push(item[1]!);
    } else if (!line.trim()) {
      flushParagraph();
      flushList();
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  if (inCode) flushCode();
  flushParagraph();
  flushList();
  return output.join("\n");
}
function scopeValue(value: unknown): DesktopReportScope {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2
  )
    desktopReportFail("DESKTOP_REPORT_INVALID");
  const scope = value as DesktopReportScope;
  if (
    ![scope.actorId, scope.conversationId].every(
      (id) => typeof id === "string" && /^[A-Za-z0-9_-]{1,160}$/.test(id),
    )
  )
    desktopReportFail("DESKTOP_REPORT_INVALID");
  return { actorId: scope.actorId, conversationId: scope.conversationId };
}
function sourceValues(value: unknown): string[] {
  if (!Array.isArray(value)) desktopReportFail("DESKTOP_REPORT_INVALID");
  if (value.length > desktopReportLimits.sources)
    desktopReportFail("DESKTOP_REPORT_TOO_LARGE");
  return value.map((source) => {
    if (
      typeof source !== "string" ||
      source.length < 1 ||
      source.length > 512 ||
      /[\x00-\x1f:]/.test(source) ||
      path.posix.isAbsolute(source) ||
      path.win32.isAbsolute(source)
    )
      desktopReportFail("DESKTOP_REPORT_INVALID");
    const normalized = source.replace(/\\/g, "/");
    if (normalized.split("/").some((part) => !part || part === "." || part === ".."))
      desktopReportFail("DESKTOP_REPORT_INVALID");
    return normalized;
  });
}
interface StoredReport {
  format: 1;
  scope: DesktopReportScope;
  artifact: DesktopReportArtifact;
  sources: string[];
  markdownSha256: string;
  htmlSha256: string;
}

/** All filesystem names derive from validated scope hashes and random IDs. */
export class DesktopArtifactStore {
  constructor(private readonly userData: string) {}

  private async directory(directory: string): Promise<void> {
    const stat = await fs.lstat(directory);
    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink() ||
      (await fs.realpath(directory)) !== directory
    )
      desktopReportFail("DESKTOP_REPORT_CORRUPT");
  }

  private async scopeDirectory(
    scope: DesktopReportScope,
    create: boolean,
  ): Promise<string | null> {
    const userData = await fs.realpath(this.userData);
    const base = path.join(userData, "desktop-reports");
    try {
      await fs.mkdir(base, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await this.directory(base);
    const directory = path.join(
      base,
      digest(JSON.stringify([scope.actorId, scope.conversationId])),
    );
    if (create) {
      try {
        await fs.mkdir(directory, { mode: 0o700 });
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    try {
      await this.directory(directory);
    } catch (error) {
      if (!create && (error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
    return directory;
  }

  private async readBounded(file: string, limit: number): Promise<Buffer> {
    const before = await fs.lstat(file);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.size < 1 ||
      before.size > limit
    )
      desktopReportFail("DESKTOP_REPORT_CORRUPT");
    const handle = await fs.open(
      file,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const opened = await handle.stat();
      if (
        opened.dev !== before.dev ||
        opened.ino !== before.ino ||
        opened.size !== before.size
      )
        desktopReportFail("DESKTOP_REPORT_CORRUPT");
      const bytes = Buffer.alloc(before.size);
      let offset = 0;
      while (offset < bytes.length) {
        const part = await handle.read(bytes, offset, bytes.length - offset, offset);
        if (!part.bytesRead) desktopReportFail("DESKTOP_REPORT_CORRUPT");
        offset += part.bytesRead;
      }
      const extra = await handle.read(Buffer.alloc(1), 0, 1, bytes.length);
      const after = await handle.stat();
      if (
        extra.bytesRead ||
        after.size !== before.size ||
        after.mtimeMs !== before.mtimeMs ||
        after.ctimeMs !== before.ctimeMs
      )
        desktopReportFail("DESKTOP_REPORT_CORRUPT");
      return bytes;
    } finally {
      await handle.close();
    }
  }

  private async stored(
    directory: string,
    scope: DesktopReportScope,
    id: string,
  ): Promise<StoredReport> {
    await this.directory(directory);
    let record: StoredReport;
    try {
      record = JSON.parse(
        (
          await this.readBounded(path.join(directory, "metadata.json"), 131072)
        ).toString("utf8"),
      );
    } catch {
      desktopReportFail("DESKTOP_REPORT_CORRUPT");
    }
    if (
      record.format !== 1 ||
      record.scope?.actorId !== scope.actorId ||
      record.scope?.conversationId !== scope.conversationId ||
      record.artifact?.id !== id ||
      typeof record.artifact.title !== "string" ||
      !record.artifact.title.trim() ||
      record.artifact.title.length > 200 ||
      typeof record.artifact.createdAt !== "string" ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(record.artifact.createdAt) ||
      !Number.isFinite(Date.parse(record.artifact.createdAt)) ||
      !/^[a-f0-9]{64}$/.test(record.markdownSha256) ||
      !/^[a-f0-9]{64}$/.test(record.htmlSha256)
    )
      desktopReportFail("DESKTOP_REPORT_CORRUPT");
    try {
      sourceValues(record.sources);
    } catch {
      desktopReportFail("DESKTOP_REPORT_CORRUPT");
    }
    record.artifact = {
      id,
      title: record.artifact.title,
      createdAt: record.artifact.createdAt,
    };
    return record;
  }

  async create(
    scopeInput: DesktopReportScope,
    titleInput: string,
    markdown: string,
    sourcesInput: string[],
  ): Promise<DesktopReportArtifact> {
    const scope = scopeValue(scopeInput),
      sources = sourceValues(sourcesInput);
    if (
      typeof titleInput !== "string" ||
      !titleInput.trim() ||
      titleInput.trim().length > 200 ||
      typeof markdown !== "string" ||
      !markdown.trim()
    )
      desktopReportFail("DESKTOP_REPORT_INVALID");
    if (Buffer.byteLength(markdown, "utf8") > desktopReportLimits.markdownBytes)
      desktopReportFail("DESKTOP_REPORT_TOO_LARGE");
    const artifact: DesktopReportArtifact = {
      id: randomUUID(),
      title: titleInput.trim(),
      createdAt: new Date().toISOString(),
    };
    const html = renderHtml(artifact, markdown, sources);
    if (Buffer.byteLength(html, "utf8") > desktopReportLimits.htmlBytes)
      desktopReportFail("DESKTOP_REPORT_TOO_LARGE");
    try {
      const scopeDirectory = (await this.scopeDirectory(scope, true))!;
      if ((await fs.readdir(scopeDirectory)).length >= desktopReportLimits.reports)
        desktopReportFail("DESKTOP_REPORT_TOO_LARGE");
      const directory = path.join(scopeDirectory, artifact.id);
      await fs.mkdir(directory, { mode: 0o700 });
      await this.directory(scopeDirectory);
      await this.directory(directory);
      await fs.writeFile(path.join(directory, "report.md"), markdown, {
        flag: "wx",
        mode: 0o600,
      });
      await this.directory(directory);
      await fs.writeFile(path.join(directory, "report.html"), html, {
        flag: "wx",
        mode: 0o600,
      });
      await this.directory(directory);
      const metadata: StoredReport = {
        format: 1,
        scope,
        artifact,
        sources,
        markdownSha256: digest(markdown),
        htmlSha256: digest(html),
      };
      // Publishing metadata last keeps interrupted writes out of the report list.
      await fs.writeFile(
        path.join(directory, "metadata.json"),
        JSON.stringify(metadata),
        { flag: "wx", mode: 0o600 },
      );
      return artifact;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("DESKTOP_REPORT_"))
        throw error;
      desktopReportFail("DESKTOP_REPORT_IO_FAILED");
    }
  }

  async list(scopeInput: DesktopReportScope): Promise<DesktopReportArtifact[]> {
    const scope = scopeValue(scopeInput);
    try {
      const directory = await this.scopeDirectory(scope, false);
      if (!directory) return [];
      const entries = await fs.readdir(directory, { withFileTypes: true });
      if (entries.length > desktopReportLimits.reports)
        desktopReportFail("DESKTOP_REPORT_TOO_LARGE");
      const artifacts: DesktopReportArtifact[] = [];
      for (const entry of entries)
        if (uuid.test(entry.name) && entry.isDirectory() && !entry.isSymbolicLink()) {
          try {
            artifacts.push(
              (await this.stored(path.join(directory, entry.name), scope, entry.name))
                .artifact,
            );
          } catch {
            /* An interrupted or damaged report never breaks the remaining list. */
          }
        }
      return artifacts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("DESKTOP_REPORT_"))
        throw error;
      desktopReportFail("DESKTOP_REPORT_IO_FAILED");
    }
  }

  async htmlPath(scopeInput: DesktopReportScope, id: string): Promise<string> {
    const scope = scopeValue(scopeInput);
    if (typeof id !== "string" || !uuid.test(id))
      desktopReportFail("DESKTOP_REPORT_INVALID");
    try {
      const scoped = await this.scopeDirectory(scope, false);
      if (!scoped) desktopReportFail("DESKTOP_REPORT_NOT_FOUND");
      const directory = path.join(scoped, id);
      const metadata = await this.stored(directory, scope, id);
      const htmlPath = path.join(directory, "report.html"),
        html = await this.readBounded(htmlPath, desktopReportLimits.htmlBytes),
        markdown = await this.readBounded(
          path.join(directory, "report.md"),
          desktopReportLimits.markdownBytes,
        );
      if (
        digest(html) !== metadata.htmlSha256 ||
        digest(markdown) !== metadata.markdownSha256
      )
        desktopReportFail("DESKTOP_REPORT_CORRUPT");
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(markdown);
      } catch {
        desktopReportFail("DESKTOP_REPORT_CORRUPT");
      }
      // Even an edited checksum file cannot turn the exported report into an
      // arbitrary HTML program: it must match our escaped template exactly.
      if (
        digest(renderHtml(metadata.artifact, text, sourceValues(metadata.sources))) !==
        digest(html)
      )
        desktopReportFail("DESKTOP_REPORT_CORRUPT");
      await this.directory(scoped);
      await this.directory(directory);
      return htmlPath;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        desktopReportFail("DESKTOP_REPORT_NOT_FOUND");
      if (error instanceof Error && error.message.startsWith("DESKTOP_REPORT_"))
        throw error;
      desktopReportFail("DESKTOP_REPORT_CORRUPT");
    }
  }
}
