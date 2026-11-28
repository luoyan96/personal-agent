import { spawn, execFile, type ChildProcess } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
export { dshBrowserCompatibility } from "./browser-compat";
export { prepareAccountProfile } from "./account-profile";
export { DshTaskWorkspace, taskKey } from './task-workspace';
// Bundle the shared wire schemas into this CJS entry: Electron 22 cannot require the ESM contracts package.
export { LocalDshConfiguration, localDshPaths } from "../../../packages/contracts/src/local-dsh";
export { TeamRepositoryBinding, TeamLibraryManifest, TeamLibraryEntry, TeamLibraryPath } from "../../../packages/contracts/src/team-library";
export { ResearchCollection, ResearchFile } from "../../../packages/contracts/src/research-library";
export { LiteratureRecommendationFeed } from "../../../packages/contracts/src/assistant-literature";

export const supportedDshVersion = "0.2.1-rc.3";
export type LocalDshState = {
  phase: "stopped" | "starting" | "running" | "stopping" | "error";
  directory: string;
  home: string;
  version?: string;
  error?: string;
};

/** Only the documented CLI ready line can supply an entry URL. Never expose it over IPC. */
export function readyUrl(line: string): string | undefined {
  const match = line.trim().match(/^dsh web: (http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_%.-]+)$/);
  if (!match || match[1].length > 1024) return;
  let url: URL;
  try { url = new URL(match[1]); } catch { return; }
  if (Number(url.port) < 1 || Number(url.port) > 65535) return;
  return url.href;
}

export function runtimeEnvironment(home: string, source = process.env, toolsDir?: string) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "COMSPEC", "PATHEXT", "PROGRAMFILES", "PROGRAMFILES(X86)"]) {
    const actual = Object.keys(source).find((name) => name.toLowerCase() === key.toLowerCase());
    if (actual) env[actual] = source[actual];
  }
  // Bundled tools (tectonic) sit next to the runtime so plugins can call them by name.
  if (toolsDir) {
    const pathKey = Object.keys(env).find((name) => name.toLowerCase() === "path") ?? "PATH";
    env[pathKey] = [path.join(toolsDir, "tectonic"), env[pathKey]].filter(Boolean).join(path.delimiter);
  }
  return { ...env, ELECTRON_RUN_AS_NODE: "1", DSH_HOME: home };
}

export async function inspectInstallation(directory: string) {
  const executable = path.join(directory, "DeepSeek Harness.exe");
  const archive = path.join(directory, "resources", "app.asar");
  // Electron's fs reads ASAR metadata without extracting or executing application code.
  const metadata = JSON.parse(await fs.readFile(path.join(archive, "package.json"), "utf8"));
  if (metadata.name !== "@deepseek-ai/dsh-desktop" || metadata.version !== supportedDshVersion)
    throw Error(`本批仅验证 DSH ${supportedDshVersion}，请选择匹配的 Windows 安装目录。`);
  const entry = path.join(archive, "dsh/node_modules/@deepseek-ai/dsh-desktop-host/lib/cli.js");
  await Promise.all([fs.access(executable), fs.access(entry)]);
  return { executable, entry, version: metadata.version as string };
}

/** Owns only its child process and private DSH_HOME; never attaches to a user's running DSH. */
export class LocalDshRuntime {
  state: LocalDshState;
  private child?: ChildProcess;
  private pending?: Promise<string>;
  private stopping?: Promise<void>;
  private entryUrl?: string;
  private cancelStart?: () => void;

  constructor(directory: string, home: string, private changed: () => void = () => {}, private connection?: { patch: string; token: string }) {
    this.state = { phase: "stopped", directory, home };
  }

  configure(directory: string) {
    if (this.child || this.pending || this.stopping) throw Error("请先停止 DSH，再更换安装目录。");
    this.state = { ...this.state, directory, phase: "stopped", error: undefined, version: undefined };
    this.changed();
  }

  start(): Promise<string> {
    if (this.stopping) return Promise.reject(Error("DSH 正在停止，请稍后重试。"));
    if (this.entryUrl && this.child) return Promise.resolve(this.entryUrl);
    if (this.pending) return this.pending;
    this.pending = this.launch().finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async launch(): Promise<string> {
    this.state = { ...this.state, phase: "starting", error: undefined };
    this.changed();
    try {
      const installation = await inspectInstallation(this.state.directory);
      await fs.mkdir(this.state.home, { recursive: true });
      if (this.state.phase !== "starting") throw Error("DSH 启动已取消。");
      this.state.version = installation.version;
      const child = spawn(installation.executable, [
        "--expose-internals", installation.entry,
        "--profile", "web", ...(this.connection ? ["--patch", this.connection.patch] : []), "--no-open", "--host", "127.0.0.1", "--port", "0",
      ], {
        cwd: this.state.home,
        env: {
          ...runtimeEnvironment(this.state.home, process.env, path.resolve(this.state.directory, "..", "tools")),
          ...(this.connection ? { ACCEPTCAT_DSH_TOKEN: this.connection.token } : {}),
        },
        windowsHide: true, shell: false, stdio: ["ignore", "pipe", "pipe"],
      });
      this.child = child;
      return await new Promise<string>((resolve, reject) => {
        let settled = false, buffer = "";
        const finish = (error?: Error, url?: string) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          this.cancelStart = undefined;
          if (error) reject(error); else resolve(url!);
        };
        this.cancelStart = () => finish(Error("DSH 启动已取消。"));
        const timer = setTimeout(() => finish(Error("DSH 启动超过 90 秒，请检查安装后重试。")), 90000);
        child.stdout!.on("data", (chunk: Buffer) => {
          buffer = (buffer + chunk.toString("utf8")).slice(-8192);
          const lines = buffer.split(/\r?\n/);
          buffer = lines.pop() || "";
          for (const line of lines) {
            const url = readyUrl(line);
            if (!url || settled) continue;
            this.entryUrl = url;
            this.state = { ...this.state, phase: "running" };
            this.changed();
            finish(undefined, url);
          }
        });
        // Drain output without logging URLs, authentication tokens or user data.
        child.stderr!.resume();
        child.once("error", () => finish(Error("无法启动 DSH，请检查安装目录和运行权限。")));
        child.once("exit", (code) => {
          if (this.child !== child) return;
          this.child = undefined;
          this.entryUrl = undefined;
          finish(Error(`DSH 启动退出（${code ?? "未知"}），请检查安装后重试。`));
          if (this.state.phase !== "stopping") {
            this.state = { ...this.state, phase: "error", error: "本地 DSH 已退出。可以重新启动，历史记录仍保存在本机。" };
            this.changed();
          }
        });
      });
    } catch (error) {
      const message = error instanceof Error && !('code' in error) ? error.message : "无法读取 DSH 安装目录，请重新选择。";
      await this.killChild();
      this.state = { ...this.state, phase: "error", error: message };
      this.changed();
      throw Error(message);
    }
  }

  private async killChild() {
    const child = this.child;
    if (!child?.pid) return;
    if (process.platform === "win32") {
      await new Promise<void>((resolve, reject) => {
        execFile(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "taskkill.exe"),
          ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, timeout: 15000 },
          async (error) => {
            // taskkill may report an already-exiting tree before Node delivers the exit event.
            // Wait for this owned child only; a still-running process remains an actual error.
            if (error && child.exitCode === null && child.signalCode === null) {
              await new Promise<void>(done => {
                const finish = () => { clearTimeout(timer); child.removeListener('exit', finish); done(); };
                const timer = setTimeout(finish, 1000);
                child.once('exit', finish);
              });
            }
            if (error && child.exitCode === null && child.signalCode === null) reject(Error("DSH 停止失败，请稍后重试。"));
            else resolve();
          });
      });
    } else child.kill();
    this.child = undefined;
    this.entryUrl = undefined;
  }

  stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    this.stopping = (async () => {
      this.state = { ...this.state, phase: "stopping" };
      this.changed();
      this.cancelStart?.();
      // A start may still be inspecting the installation. Wait before terminating its child.
      await this.pending?.catch(() => {});
      await this.killChild();
      this.state = { ...this.state, phase: "stopped", error: undefined };
      this.changed();
    })().catch((error) => {
      this.state = { ...this.state, phase: this.child ? "running" : "error", error: "DSH 停止失败，请重试停止后再退出。" };
      this.changed();
      throw error;
    }).finally(() => { this.stopping = undefined; });
    return this.stopping;
  }
}

export * from './work-memory';

// Bundle the canonical schema for Electron 22 CommonJS; the package exposes ESM only.
export { WorkContext } from "../../../packages/contracts/src/work-context";

export { TeamExecution } from './team-execution';
export { verifiedTaskDiscussion, nativePreferenceInput } from './native-task-context';
export { effectivePersonalPreferences } from '../../../packages/research-core/src/personal-preferences';
export { nativeTaskContextPlugin } from './native-task-context-plugin';
