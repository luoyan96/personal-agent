import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type {
  TeamLibraryManifest,
  TeamLibraryEntry,
  TeamRepositoryBinding,
  TeamLibraryPath,
} from "@research-agent-platform/contracts";
const schemas =
  require("../main/localDshRuntime") as typeof import("@research-agent-platform/contracts");
import type {
  TeamLibrarySnapshot,
  TeamLibraryProposal,
} from "../../src/types/teamLibrary";

export type GitRun = (
  args: string[],
  options?: { input?: Buffer; index?: string; maxBytes?: number },
) => Promise<Buffer>;
const digest = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
const manifestPath = "acceptcat-library.json";
export const gitLibraryLimit = 20 * 1024 * 1024;

export function repositoryUrl(input: unknown): string {
  if (typeof input !== "string") throw Error("请粘贴 GitHub 仓库地址。");
  const value = input.trim().replace(/\/$/, "");
  if (!schemas.TeamRepositoryBinding.shape.url.safeParse(value).success)
    throw Error("请粘贴 GitHub 仓库地址，例如 https://github.com/团队/资料仓库。");
  return value.replace(/\.git$/i, "") + ".git";
}

async function readObject(
  run: GitRun,
  revision: string,
  relative: string,
  maxBytes: number,
) {
  if (!/^[a-f0-9]{40}$/.test(revision)) throw Error("资料版本无效。");
  schemas.TeamLibraryPath.parse(relative);
  const mode = (
    await run(["ls-tree", "-z", revision, "--", relative], { maxBytes: 2048 })
  ).toString();
  if (!mode.startsWith("100644 blob ") && !mode.startsWith("100755 blob "))
    throw Error(
      relative === manifestPath
        ? "仓库可以访问，但缺少有效的 acceptcat-library.json 资料清单；请由仓库维护者初始化后重试。"
        : "资料不存在或不是普通文件，不读取符号链接。",
    );
  return run(["show", `${revision}:${relative}`], { maxBytes });
}

/** Read-only discovery before saving a shared binding. Never initializes or pushes remote files. */
export async function discoverRepository(
  root: string,
  input: unknown,
  previous: TeamRepositoryBinding | null,
  runner: (directory: string) => GitRun = gitRunner,
) {
  const url = repositoryUrl(input);
  await fs.mkdir(root, { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, "connect-"));
  try {
    const run = runner(path.join(directory, "objects.git"));
    await run(["init", "--bare", path.join(directory, "objects.git")]);
    await run(["config", "remote.origin.url", url]);
    await run(["config", "remote.origin.promisor", "true"]);
    await run(["config", "remote.origin.partialclonefilter", "blob:none"]);
    // Preserve an explicitly configured publishing branch for the same repository.
    let branch =
      previous && repositoryUrl(previous.url).toLowerCase() === url.toLowerCase()
        ? previous.branch
        : undefined;
    if (!branch) {
      const head = (
        await run(["ls-remote", "--symref", "origin", "HEAD"], { maxBytes: 8192 })
      ).toString();
      branch = /^ref: refs\/heads\/([^\t\r\n]+)\tHEAD$/m.exec(head)?.[1];
      if (!branch)
        throw Error("仓库尚无默认分支或无法识别；请先在 GitHub 完成首次提交。");
    }
    // Reuse the existing branch boundary before constructing a refspec.
    schemas.TeamRepositoryBinding.shape.branch.parse(branch);
    await run([
      "fetch",
      "--depth=1",
      "--filter=blob:none",
      "--no-tags",
      "--no-recurse-submodules",
      "origin",
      `refs/heads/${branch}`,
    ]);
    const revision = (await run(["rev-parse", "FETCH_HEAD^{commit}"]))
      .toString()
      .trim();
    let manifest: TeamLibraryManifest;
    const bytes = await readObject(run, revision, manifestPath, 1024 * 1024);
    try {
      manifest = schemas.TeamLibraryManifest.parse(JSON.parse(bytes.toString("utf8")));
    } catch {
      throw Error(
        "仓库资料清单格式不正确，请由仓库维护者检查 acceptcat-library.json；原配置未更改。",
      );
    }
    if (previous && previous.workspaceId !== manifest.workspaceId)
      throw Error(
        "新仓库的资料空间与当前团队不一致。迁移时请保留原资料清单中的 workspaceId；原配置未更改。",
      );
    return { url, branch, workspaceId: manifest.workspaceId };
  } finally {
    // mkdtemp owns this directory; never delete a caller-supplied repository/folder.
    const resolved = path.resolve(directory),
      parent = path.resolve(root);
    if (
      path.dirname(resolved) !== parent ||
      !path.basename(resolved).startsWith("connect-")
    )
      throw Error("临时资料目录校验失败。");
    await fs.rm(resolved, { recursive: true, force: true });
  }
}

/** Bare object storage: no checkout, smudge filters, hooks, submodule or repo scripts. */
export function gitRunner(directory: string): GitRun {
  return (args, options = {}) =>
    new Promise((resolve, reject) => {
      const env = { ...process.env };
      for (const key of Object.keys(env))
        if (
          /^GIT_(DIR|WORK_TREE|INDEX_FILE|OBJECT_DIRECTORY|ALTERNATE_OBJECT_DIRECTORIES|CONFIG_PARAMETERS|CONFIG_COUNT|CONFIG_KEY_\d+|CONFIG_VALUE_\d+)$/i.test(
            key,
          )
        )
          delete env[key];
      Object.assign(env, {
        GIT_TERMINAL_PROMPT: "0",
        GCM_INTERACTIVE: "never",
        GIT_LFS_SKIP_SMUDGE: "1",
        ...(options.index ? { GIT_INDEX_FILE: options.index } : {}),
      });
      const child = spawn(
        "git",
        [
          "-c",
          "core.hooksPath=" + path.join(directory, "disabled-hooks"),
          "-c",
          "core.fsmonitor=false",
          "-c",
          "protocol.file.allow=never",
          "-c",
          "protocol.ext.allow=never",
          "-c",
          "gc.auto=0",
          "--git-dir=" + directory,
          ...args,
        ],
        { env, windowsHide: true, shell: false, stdio: ["pipe", "pipe", "pipe"] },
      );
      const chunks: Buffer[] = [];
      let size = 0,
        failed = false;
      const timer = setTimeout(() => {
        failed = true;
        child.kill();
        reject(Error("Git操作超时；已保留原资料版本，请稍后重试。"));
      }, 120000);
      child.stdout.on("data", (b) => {
        size += b.length;
        if (size > (options.maxBytes ?? gitLibraryLimit)) {
          failed = true;
          child.kill();
          reject(Error("此文件应通过共享原件服务取用，不直接放入Git正文。"));
        } else chunks.push(b);
      });
      // Git/helper diagnostics may contain credentials or URLs. Keep them out of UI/logs.
      child.stderr.on("data", () => {});
      child.on("error", () => {
        clearTimeout(timer);
        if (!failed) reject(Error("未找到Git，请安装Git for Windows后重试。"));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (!failed)
          code === 0
            ? resolve(Buffer.concat(chunks))
            : reject(
                Error(
                  "Git操作未完成，请检查仓库地址、网络和本机Git访问权限；没有覆盖已发布资料。",
                ),
              );
      });
      child.stdin.on("error", () => {});
      child.stdin.end(options.input);
    });
}

/** One account/lab/binding gets its own owned bare cache. Never resets user folders. */
export class TeamLibraryStore {
  readonly directory: string;
  private run: GitRun;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    readonly root: string,
    readonly binding: TeamRepositoryBinding,
    runner?: GitRun,
  ) {
    schemas.TeamRepositoryBinding.parse(binding);
    this.directory = path.join(
      root,
      digest(
        JSON.stringify([
          binding.labId,
          binding.url,
          binding.branch,
          binding.workspaceId,
          binding.version,
        ]),
      ),
    );
    this.run = runner ?? gitRunner(path.join(this.directory, "objects.git"));
  }
  private serial<T>(action: () => Promise<T>): Promise<T> {
    const next = this.pending.then(action, action);
    this.pending = next.catch(() => {});
    return next;
  }
  private async init() {
    await fs.mkdir(this.directory, { recursive: true });
    await this.run(["init", "--bare", path.join(this.directory, "objects.git")]);
    await this.run(["config", "remote.origin.url", this.binding.url]);
    await this.run(["config", "remote.origin.promisor", "true"]);
    await this.run(["config", "remote.origin.partialclonefilter", "blob:none"]);
  }
  private async object(revision: string, relative: string, maxBytes = gitLibraryLimit) {
    const bytes = await readObject(this.run, revision, relative, maxBytes);
    if (
      bytes
        .subarray(0, 100)
        .toString()
        .startsWith("version https://git-lfs.github.com/spec/v1")
    )
      throw Error(
        "此原件存于Git LFS，本版请改用共享原件入口登记，不能把LFS指针当成文件。",
      );
    return bytes;
  }
  async cached(): Promise<TeamLibrarySnapshot | null> {
    try {
      const value = JSON.parse(
        await fs.readFile(path.join(this.directory, "snapshot.json"), "utf8"),
      );
      const manifest = schemas.TeamLibraryManifest.parse(value.manifest);
      if (
        !/^[a-f0-9]{40}$/.test(value.revision) ||
        manifest.workspaceId !== this.binding.workspaceId ||
        typeof value.syncedAt !== "string"
      )
        return null;
      return {
        binding: this.binding,
        revision: value.revision,
        syncedAt: value.syncedAt,
        manifest,
      };
    } catch {
      return null;
    }
  }
  sync(): Promise<TeamLibrarySnapshot> {
    return this.serial(async () => {
      await this.init();
      await this.run([
        "fetch",
        "--depth=20",
        "--filter=blob:none",
        "--no-tags",
        "--no-recurse-submodules",
        "origin",
        `+refs/heads/${this.binding.branch}:refs/remotes/origin/published`,
      ]);
      const revision = (
        await this.run(["rev-parse", "refs/remotes/origin/published^{commit}"])
      )
        .toString()
        .trim();
      const manifest = schemas.TeamLibraryManifest.parse(
        JSON.parse(
          (await this.object(revision, manifestPath, 1024 * 1024)).toString("utf8"),
        ),
      );
      if (manifest.workspaceId !== this.binding.workspaceId)
        throw Error("仓库资料空间ID不匹配；保留旧版本，请核对绑定。");
      const snapshot = {
        binding: this.binding,
        revision,
        manifest,
        syncedAt: new Date().toISOString(),
      };
      const temporary = path.join(this.directory, `snapshot-${randomUUID()}.tmp`);
      await fs.writeFile(temporary, JSON.stringify(snapshot));
      await fs.rename(temporary, path.join(this.directory, "snapshot.json"));
      return snapshot;
    });
  }
  async entry(selected: {
    revision: string;
    entryId: string;
  }): Promise<{ entry: TeamLibraryEntry; manifest: TeamLibraryManifest }> {
    // Only published revisions this cache has explicitly accepted are readable.
    const snapshot = await this.cached();
    if (!snapshot || snapshot.revision !== selected.revision)
      throw Error("资料版本已变化，请刷新后重新选择；原任务中的副本保持。");
    const entry = snapshot.manifest.entries.find((e) => e.id === selected.entryId);
    if (!entry) throw Error("资料已移除或无权访问。");
    return { entry, manifest: snapshot.manifest };
  }
  async read(selected: { revision: string; entryId: string }) {
    const { entry } = await this.entry(selected);
    if (entry.source.kind !== "git")
      throw Error("此条目需要取用共享原件或登记本地文件。");
    const bytes = await this.object(selected.revision, entry.source.path);
    if (digest(bytes) !== entry.source.sha256)
      throw Error("资料校验失败，没有将文件交给工作台。");
    return { entry, bytes };
  }
  async materialize(selected: { revision: string; entryId: string }) {
    const { entry, bytes } = await this.read(selected);
    const folder = path.join(this.directory, "originals", selected.revision, entry.id);
    await fs.mkdir(folder, { recursive: true });
    const name = path.basename(
        entry.source.kind === "git" ? entry.source.path : entry.name,
      ),
      file = path.join(folder, name);
    // Never follow an existing file/link while materializing an immutable version.
    // Canonicalize the owned root first: Windows may alias its parent TEMP drive.
    // Links introduced beneath this root must still fail the containment check.
    const expectedFolder = path.join(
      await fs.realpath(this.directory),
      "originals",
      selected.revision,
      entry.id,
    );
    const actualFolder = await fs.realpath(folder);
    const comparable = (value: string) =>
      process.platform === "win32" ? value.toLowerCase() : value;
    if (comparable(actualFolder) !== comparable(expectedFolder))
      throw Error("资料缓存路径发生变化，请重新同步。");
    try {
      await fs.writeFile(file, bytes, { flag: "wx" });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const stat = await fs.lstat(file);
      if (
        !stat.isFile() ||
        stat.isSymbolicLink() ||
        digest(await fs.readFile(file)) !== digest(bytes)
      )
        throw Error("本机资料副本校验失败。");
    }
    return { entry, file, sha256: digest(bytes), size: bytes.length };
  }
  propose(
    revision: string,
    input: TeamLibraryEntry,
    text?: string,
  ): Promise<TeamLibraryProposal> {
    return this.serial(async () => {
      if (text !== undefined && typeof text !== "string")
        throw Error("资料正文格式无效。");
      const entry = schemas.TeamLibraryEntry.parse(input),
        snapshot = await this.cached();
      if (!snapshot || snapshot.revision !== revision)
        throw Error("资料版本已变化，请同步后再提交更新。");
      const proposalPath = path.join(
        this.directory,
        "proposal-" + digest(JSON.stringify([revision, input, text])) + ".json",
      );
      const previous = await fs
        .readFile(proposalPath, "utf8")
        .then(JSON.parse)
        .catch(() => null);
      if (previous) {
        if (
          !/^[a-f0-9]{40}$/.test(previous.commit) ||
          !/^acceptcat\/library-[a-f0-9-]+$/.test(previous.branch)
        )
          throw Error("更新草案记录无效。");
        await this.run([
          "push",
          "origin",
          `${previous.commit}:refs/heads/${previous.branch}`,
        ]);
        return previous;
      }
      if (!snapshot.manifest.projects.some((p) => p.id === entry.projectId))
        throw Error("项目不存在。");
      const old = snapshot.manifest.entries.find((e) => e.id === entry.id);
      const manifest = {
        ...snapshot.manifest,
        entries: snapshot.manifest.entries.filter((e) => e.id !== entry.id),
      };
      const index = path.join(this.directory, "proposal-" + randomUUID() + ".index"),
        branch = "acceptcat/library-" + randomUUID();
      await this.run(["read-tree", revision], { index });
      try {
        if (text !== undefined) {
          if (
            entry.source.kind !== "git" ||
            !entry.source.path.endsWith(".md") ||
            Buffer.byteLength(text) > 1024 * 1024
          )
            throw Error("此编辑器只更新Markdown正文，其他原件请走导入文件。");
          if (old?.source.kind === "git" && old.source.path !== entry.source.path)
            throw Error("不能通过正文编辑改写其他资料路径。");
          if (
            manifest.entries.some(
              (e) =>
                e.source.kind === "git" &&
                entry.source.kind === "git" &&
                e.source.path === entry.source.path,
            )
          )
            throw Error("此文件路径已被其他条目使用。");
          if (
            !old &&
            (await this.run(["ls-tree", "-z", revision, "--", entry.source.path]))
              .length
          )
            throw Error("此路径已有文件，请登记已有原件或换一个名称。");
          const bytes = Buffer.from(text);
          entry.source.sha256 = digest(bytes);
          const blob = (
            await this.run(["hash-object", "-w", "--stdin"], { input: bytes })
          )
            .toString()
            .trim();
          await this.run(
            [
              "update-index",
              "--add",
              "--cacheinfo",
              `100644,${blob},${entry.source.path}`,
            ],
            { index },
          );
        } else if (entry.source.kind === "git") {
          const bytes = await this.object(revision, entry.source.path);
          if (digest(bytes) !== entry.source.sha256)
            throw Error("Git原件校验值不匹配。");
        }
        manifest.entries.push(entry);
        schemas.TeamLibraryManifest.parse(manifest);
        const blob = (
          await this.run(["hash-object", "-w", "--stdin"], {
            input: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
          })
        )
          .toString()
          .trim();
        await this.run(
          ["update-index", "--add", "--cacheinfo", `100644,${blob},${manifestPath}`],
          { index },
        );
        const tree = (await this.run(["write-tree"], { index })).toString().trim();
        const commit = (
          await this.run(
            [
              "-c",
              "user.name=AcceptCat",
              "-c",
              "user.email=acceptcat@users.noreply.github.com",
              "commit-tree",
              tree,
              "-p",
              revision,
            ],
            { input: Buffer.from(`更新团队资料：${entry.name}\n`) },
          )
        )
          .toString()
          .trim();
        const u = new URL(this.binding.url);
        const repo = u.pathname.replace(/\.git$/, "");
        const proposal = {
          branch,
          commit,
          entry,
          reviewUrl: `https://github.com${repo}/compare/${encodeURIComponent(
            this.binding.branch,
          )}...${encodeURIComponent(branch)}?expand=1`,
        };
        await fs.writeFile(proposalPath, JSON.stringify(proposal), { flag: "wx" });
        await this.run(["push", "origin", `${commit}:refs/heads/${branch}`]);
        return proposal;
      } finally {
        await fs.unlink(index).catch(() => {});
      }
    });
  }
  async changes() {
    const snapshot = await this.cached();
    if (!snapshot) return [];
    const raw = (
      await this.run(["log", "-8", "--format=%H%x00%s%x00%cI", snapshot.revision])
    ).toString();
    return raw
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [revision, title, date] = line.split("\0");
        return { revision, title, date };
      });
  }
  proposeProject(
    revision: string,
    project: { id: string; name: string; description: string },
  ): Promise<TeamLibraryProposal> {
    return this.serial(async () => {
      const snapshot = await this.cached();
      if (!snapshot || snapshot.revision !== revision)
        throw Error("资料版本已变化，请同步后重新提交项目。");
      const manifest = schemas.TeamLibraryManifest.parse({
        ...snapshot.manifest,
        projects: [...snapshot.manifest.projects, project],
      });
      const receiptPath = path.join(
        this.directory,
        "project-" + digest(JSON.stringify([revision, project])) + ".json",
      );
      const saved = await fs
        .readFile(receiptPath, "utf8")
        .then(JSON.parse)
        .catch(() => null);
      if (saved) {
        if (
          !/^[a-f0-9]{40}$/.test(saved.commit) ||
          !/^acceptcat\/library-[a-f0-9-]+$/.test(saved.branch)
        )
          throw Error("项目草案记录无效。");
        await this.run([
          "push",
          "origin",
          `${saved.commit}:refs/heads/${saved.branch}`,
        ]);
        return saved;
      }
      const index = path.join(this.directory, randomUUID() + ".index"),
        branch = "acceptcat/library-" + randomUUID();
      try {
        await this.run(["read-tree", revision], { index });
        const blob = (
          await this.run(["hash-object", "-w", "--stdin"], {
            input: Buffer.from(JSON.stringify(manifest, null, 2) + "\n"),
          })
        )
          .toString()
          .trim();
        await this.run(
          ["update-index", "--add", "--cacheinfo", `100644,${blob},${manifestPath}`],
          { index },
        );
        const tree = (await this.run(["write-tree"], { index })).toString().trim();
        const commit = (
          await this.run(
            [
              "-c",
              "user.name=AcceptCat",
              "-c",
              "user.email=acceptcat@users.noreply.github.com",
              "commit-tree",
              tree,
              "-p",
              revision,
            ],
            { input: Buffer.from(`新增资料项目：${project.name}\n`) },
          )
        )
          .toString()
          .trim();
        const proposal = {
          branch,
          commit,
          entry: null,
          reviewUrl: `https://github.com${new URL(this.binding.url).pathname.replace(
            /\.git$/,
            "",
          )}/compare/${encodeURIComponent(this.binding.branch)}...${encodeURIComponent(
            branch,
          )}?expand=1`,
        };
        await fs.writeFile(receiptPath, JSON.stringify(proposal), { flag: "wx" });
        await this.run(["push", "origin", `${commit}:refs/heads/${branch}`]);
        return proposal;
      } finally {
        await fs.unlink(index).catch(() => {});
      }
    });
  }
}
