import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite"))("esbuild");
const compiled = await esbuild.build({
  entryPoints: [new URL("../electron/utils/dshPlugin.ts", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")],
  bundle: true, platform: "node", format: "cjs", write: false,
});

async function fixture(t, current, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "acceptcat-plugin-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const runtime = path.join(root, "runtime"), home = path.join(root, "home");
  const profile = path.join(home, "profiles", "web");
  const installed = path.join(profile, "node_modules", "dsh-research-workbench", "package.json");
  const tarball = path.join(root, "bundled.tgz");
  await mkdir(path.dirname(installed), { recursive: true });
  await writeFile(tarball, "synthetic tarball; spawn boundary is stubbed");
  const manifest = { dependencies: { "other-plugin": "1.0.0" }, dsh: { profile: {
    bundles: options.bundles ?? ["other-plugin", "dsh-research-workbench"], custom: "preserve",
  } } };
  const manifestPath = path.join(profile, "package.json");
  if (!options.missingProfile) await writeFile(manifestPath, JSON.stringify(manifest));
  if (current !== undefined) await writeFile(installed, JSON.stringify({ version: current }));
  const pnpm = path.join(runtime, "resources", "runtime", "primary-runtime", "dependencies", "pnpm", "bin", "pnpm.mjs");
  await mkdir(path.dirname(pnpm), { recursive: true });
  await writeFile(pnpm, "// synthetic boundary");
  const calls = [], module = { exports: {} };
  const spawn = (exe, args, spawnOptions) => {
    calls.push({ exe, args, options: spawnOptions });
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    void (async () => {
      await new Promise(resolve => setImmediate(resolve));
      if (options.fail) { child.emit("close", 1); return; }
      await writeFile(installed, JSON.stringify({ version: options.installVersion ?? "0.6.0" }));
      child.emit("close", 0);
    })().catch(error => child.emit("error", error));
    return child;
  };
  vm.runInNewContext(compiled.outputFiles[0].text, {
    module, exports: module.exports, process,
    require: name => name === "node:child_process" ? { spawn } : require(name),
  });
  return { run: () => module.exports.ensureResearchPlugin({ runtime, home, tarball }), calls,
    manifestPath, installed, profile, tarball, runtime };
}

test("fresh profile is left to DSH before the plugin bootstrap runs", async t => {
  const f = await fixture(t, undefined, { missingProfile: true });
  assert.equal((await f.run()).reason, "profile 尚未创建");
  assert.equal(f.calls.length, 0);
});

for (const current of [undefined, "0.3.3", "0.4.0", "0.5.1", "0.6.0-rc.1"]) {
  test(`missing/older plugin ${current} installs the pinned offline bundle and verifies the actual version`, async t => {
    const f = await fixture(t, current, { bundles: ["other-plugin"] });
    const r = await f.run();
    assert.equal(r.changed, true); assert.equal(r.version, "0.6.0");
    assert.equal(f.calls.length, 1);
    assert.deepEqual(Array.from(f.calls[0].args.slice(-4)), ["add", `dsh-research-workbench@file:${f.tarball}`, "--offline", "--ignore-scripts"]);
    assert.equal(f.calls[0].options.cwd, f.profile);
    assert.equal(f.calls[0].options.windowsHide, true);
    const manifest = JSON.parse(await readFile(f.manifestPath, "utf8"));
    assert.deepEqual(manifest.dependencies, { "other-plugin": "1.0.0" });
    assert.deepEqual(manifest.dsh.profile.bundles, ["other-plugin", "dsh-research-workbench"]);
    assert.equal(manifest.dsh.profile.custom, "preserve");
  });
}

for (const current of ["0.6.0", "0.6.0+local", "0.6.1", "0.10.0", "0.7.0-rc.1", "1.0.0"]) {
  test(`restart preserves independently installed ${current} without downgrading or rewriting its profile`, async t => {
    const f = await fixture(t, current);
    const before = await readFile(f.manifestPath, "utf8");
    const r = await f.run();
    assert.equal(r.changed, false); assert.equal(r.version, current);
    assert.equal(f.calls.length, 0);
    assert.equal(await readFile(f.manifestPath, "utf8"), before);
  });
}

test("a successful package-manager exit with stale node_modules is an installation failure", async t => {
  const f = await fixture(t, "0.3.3", { installVersion: "0.3.3" });
  await assert.rejects(f.run, /安装结果.*不一致/);
});

test("failed install leaves the original bundle registration intact", async t => {
  const f = await fixture(t, "0.3.3", { fail: true, bundles: ["other-plugin"] });
  const before = await readFile(f.manifestPath, "utf8");
  await assert.rejects(f.run, /退出码 1/);
  assert.equal(await readFile(f.manifestPath, "utf8"), before);
});

test("unknown or malformed installed versions are not replaced as missing plugins", async t => {
  const f = await fixture(t, "local-dev");
  await assert.rejects(f.run, /版本无法比较/);
  await writeFile(f.installed, "{broken");
  await assert.rejects(f.run, /无法核对/);
  assert.equal(f.calls.length, 0);
});
