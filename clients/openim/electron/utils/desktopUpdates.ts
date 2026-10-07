import type { UpdateState } from "../../src/types/desktopUpdates";
export type { UpdateState, UpdatePhase } from "../../src/types/desktopUpdates";
export interface UpdatePort {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowDowngrade: boolean;
  allowPrerelease: boolean;
  disableWebInstaller: boolean;
  on(event: string, listener: (...args: any[]) => void): unknown;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  quitAndInstall(silent?: boolean, runAfter?: boolean): void;
}
const releaseNotes = (value: unknown): string => {
  const text =
    typeof value === "string"
      ? value
      : Array.isArray(value)
      ? value
          .map((item) => (typeof item?.note === "string" ? item.note : ""))
          .join("\n")
      : "";
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[\x00-\x08\x0b-\x1f]/g, "")
    .slice(0, 1200);
};

// The updater owns version comparison, TLS, checksum validation and its installer cache.
// This controller requires explicit actions for download and installation.
export class DesktopUpdates {
  state: UpdateState;
  private checking?: Promise<void>;
  private downloading?: Promise<void>;
  private readonly port: UpdatePort;
  private readonly changed: (state: UpdateState) => void;
  private readonly beforeInstall: () => void;
  private readonly installFailed: () => void;
  constructor(
    port: UpdatePort,
    version: string,
    changed: (state: UpdateState) => void,
    beforeInstall: () => void,
    installFailed: () => void,
  ) {
    this.port = port;
    this.changed = changed;
    this.beforeInstall = beforeInstall;
    this.installFailed = installFailed;
    this.state = { phase: "idle", currentVersion: version };
    port.autoDownload = false;
    port.autoInstallOnAppQuit = false;
    port.allowDowngrade = false;
    port.allowPrerelease = false;
    port.disableWebInstaller = true;
    port.on("checking-for-update", () => this.set({ phase: "checking" }));
    port.on("update-not-available", () => this.set({ phase: "current" }));
    port.on("update-available", (info) => {
      if (typeof info?.version !== "string" || !/^\d+\.\d+\.\d+$/.test(info.version)) {
        this.fail("check");
        return;
      }
      this.set({
        phase: "available",
        version: info.version,
        notes: releaseNotes(info.releaseNotes),
      });
    });
    port.on("download-progress", (progress) => {
      if (this.state.phase !== "downloading" || !Number.isFinite(progress?.percent))
        return;
      this.set({
        ...this.state,
        percent: Math.min(100, Math.max(0, progress.percent)),
      });
    });
    port.on("update-downloaded", (info) => {
      if (this.state.phase !== "downloading" || info?.version !== this.state.version)
        return;
      this.set({ ...this.state, phase: "downloaded", percent: 100 });
    });
    port.on("error", () =>
      this.fail(
        this.state.phase === "downloading"
          ? "download"
          : this.state.phase === "installing"
          ? "install"
          : "check",
      ),
    );
  }
  private set(value: Omit<UpdateState, "currentVersion">) {
    this.state = { ...value, currentVersion: this.state.currentVersion };
    this.changed({ ...this.state });
  }
  private fail(error: UpdateState["error"]) {
    if (error === "install") this.installFailed();
    this.set({ phase: "error", error });
  }
  async check() {
    if (["downloading", "downloaded", "installing"].includes(this.state.phase)) return;
    if (this.checking) return this.checking;
    this.set({ phase: "checking" });
    this.checking = Promise.resolve()
      .then(() => this.port.checkForUpdates())
      .then(() => {
        if (this.state.phase === "checking") this.fail("check");
      })
      .catch(() => this.fail("check"))
      .finally(() => {
        this.checking = undefined;
      });
    return this.checking;
  }
  async download() {
    if (this.downloading) return this.downloading;
    if (this.state.phase !== "available")
      throw new Error("No verified update available");
    this.set({ ...this.state, phase: "downloading", percent: 0 });
    this.downloading = Promise.resolve()
      .then(() => this.port.downloadUpdate())
      .then(() => {
        if (this.state.phase !== "downloaded") this.fail("download");
      })
      .catch(() => this.fail("download"))
      .finally(() => {
        this.downloading = undefined;
      });
    return this.downloading;
  }
  install() {
    if (this.state.phase !== "downloaded")
      throw new Error("Update has not finished downloading");
    this.set({ ...this.state, phase: "installing" });
    try {
      this.beforeInstall();
      this.port.quitAndInstall(true, true);
    } catch {
      this.fail("install");
    }
  }
}
