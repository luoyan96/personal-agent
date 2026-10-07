import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { DesktopUpdates } from "../electron/utils/desktopUpdates.ts";
class Port extends EventEmitter {
  checks = 0;
  downloads = 0;
  installs = 0;
  async checkForUpdates() {
    this.checks++;
    this.emit("update-available", {
      version: "0.1.2",
      releaseNotes: "<p>合成更新</p>",
    });
  }
  async downloadUpdate() {
    this.downloads++;
    this.emit("download-progress", { percent: 42 });
    this.emit("update-downloaded", { version: "0.1.2" });
  }
  quitAndInstall(silent, run) {
    this.installs++;
    this.args = [silent, run];
  }
}
const create = (port = new Port()) => {
  const states = [];
  let prepared = 0,
    restored = 0;
  const updates = new DesktopUpdates(
    port,
    "0.1.1",
    (state) => states.push(state),
    () => prepared++,
    () => restored++,
  );
  return { port, updates, states, prepared: () => prepared, restored: () => restored };
};
test("detection does not download or install; explicit actions required and no install-on-quit", async () => {
  const x = create();
  await x.updates.check();
  assert.equal(x.updates.state.phase, "available");
  assert.equal(x.updates.state.notes, "合成更新");
  assert.equal(x.port.downloads, 0);
  assert.equal(x.port.installs, 0);
  for (const flag of [
    "autoDownload",
    "autoInstallOnAppQuit",
    "allowPrerelease",
    "allowDowngrade",
  ])
    assert.equal(x.port[flag], false);
  assert.equal(x.port.disableWebInstaller, true);
  await x.updates.download();
  assert.equal(x.updates.state.phase, "downloaded");
  assert.equal(x.port.installs, 0);
  assert.ok(x.states.some((s) => s.phase === "downloading" && s.percent === 42));
  x.updates.install();
  assert.equal(x.prepared(), 1);
  assert.equal(x.port.installs, 1);
  assert.deepEqual(x.port.args, [true, true]);
  assert.throws(() => x.updates.install());
});
test("simultaneous checks and downloads each contact updater once, preserving downloaded candidate", async () => {
  const x = create();
  await Promise.all([x.updates.check(), x.updates.check()]);
  assert.equal(x.port.checks, 1);
  await Promise.all([x.updates.download(), x.updates.download()]);
  assert.equal(x.port.downloads, 1);
  await x.updates.check();
  assert.equal(x.port.checks, 1);
  assert.equal(x.updates.state.phase, "downloaded");
});
test("failed check stays truthful, can retry, and cannot install or download", async () => {
  const p = new Port();
  p.checkForUpdates = async () => {
    throw Error("synthetic network failure");
  };
  const x = create(p);
  await x.updates.check();
  assert.equal(x.updates.state.error, "check");
  assert.throws(() => x.updates.install());
  await assert.rejects(() => x.updates.download());
  p.checkForUpdates = Port.prototype.checkForUpdates;
  await x.updates.check();
  assert.equal(x.updates.state.phase, "available");
});
test("download failure and late or mismatched completion never enable installation", async () => {
  const p = new Port();
  p.downloadUpdate = async () => {
    throw Error("synthetic checksum failure");
  };
  const x = create(p);
  await x.updates.check();
  await x.updates.download();
  assert.equal(x.updates.state.error, "download");
  p.emit("update-downloaded", { version: "0.1.2" });
  assert.throws(() => x.updates.install());
  await x.updates.check();
  p.downloadUpdate = async () => {
    p.emit("update-downloaded", { version: "0.1.3" });
  };
  await x.updates.download();
  assert.equal(x.updates.state.error, "download");
  assert.equal(p.installs, 0);
});
test("installer failure clears forced-quit flag; malformed metadata is not offered", async () => {
  const x = create();
  await x.updates.check();
  await x.updates.download();
  x.port.quitAndInstall = () => {
    throw Error("synthetic spawn failure");
  };
  x.updates.install();
  assert.equal(x.updates.state.error, "install");
  assert.equal(x.restored(), 1);
  const y = create();
  y.port.checkForUpdates = async () =>
    y.port.emit("update-available", { version: "not-a-version" });
  await y.updates.check();
  assert.equal(y.updates.state.error, "check");
  await assert.rejects(() => y.updates.download());
});
