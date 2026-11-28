import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const client = fileURLToPath(new URL("../", import.meta.url));
const esbuild = createRequire(require.resolve("vite"))("esbuild");
const compiled = await esbuild.build({ entryPoints: [path.join(client, "electron/utils/dshPlugin.ts")],
  bundle: true, platform: "node", format: "cjs", write: false });
const runtime = path.join(client, ".dsh-runtime");
const tarball = path.join(client, "tools/plugins/dsh-research-workbench-0.6.0.tgz");
const name = "dsh-research-workbench";
const oldRef = "https://codeload.github.com/luoyan96/dsh-research-workbench/tar.gz/3d2805c87676505a635cbdc619bf85c95ee40bc4";

for (const incomplete of [false, true]) {
  test(`real bundled pnpm replaces legacy GitHub lock offline (${incomplete ? "previous failed upgrade" : "installed 0.3.1"})`,
    { skip: process.platform !== "win32", timeout: 60000 }, async t => {
      assert(existsSync(path.join(runtime, "DeepSeek Harness.exe")), "stage the pinned DSH before running upgrade checks");
      assert(existsSync(tarball), "stage the pinned plugin before running upgrade checks");
      const root = await mkdtemp(path.join(os.tmpdir(), "acceptcat-plugin-upgrade-"));
      const home = path.join(root, "home"), profile = path.join(home, "profiles/web");
      const other = path.join(root, "other-plugin"), otherSpec = "link:" + other.replaceAll("\\", "/");
      const children = [], output = [];
      t.after(async () => {
        for (const child of children) if (child.exitCode === null && child.signalCode === null) child.kill();
        assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
        assert(path.basename(root).startsWith("acceptcat-plugin-upgrade-"));
        await rm(root, { recursive: true, force: true });
      });
      await mkdir(profile, { recursive: true }); await mkdir(other, { recursive: true });
      await writeFile(path.join(other, "package.json"), JSON.stringify({ name: "synthetic-other-plugin", version: "1.2.3" }));
      const bundles = ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app", "synthetic-other-plugin", name];
      await writeFile(path.join(profile, "package.json"), JSON.stringify({ name: "synthetic-legacy-profile", private: true,
        dependencies: { [name]: "github:luoyan96/dsh-research-workbench", "synthetic-other-plugin": otherSpec },
        dsh: { profile: { bundles, retainedSetting: "synthetic preference" } } }));
      // Public old dependency metadata, never copied from a person's profile.
      const oldModule = path.join(profile, "node_modules", ...(incomplete ? [".ignored"] : []), name);
      await mkdir(oldModule, { recursive: true });
      await writeFile(path.join(oldModule, "package.json"), JSON.stringify({ name, version: "0.3.1" }));
      await writeFile(path.join(profile, "pnpm-lock.yaml"), `lockfileVersion: '9.0'\nsettings:\n  autoInstallPeers: false\n  excludeLinksFromLockfile: false\nimporters:\n  .:\n    dependencies:\n      ${name}:\n        specifier: github:luoyan96/dsh-research-workbench\n        version: ${oldRef}\n      synthetic-other-plugin:\n        specifier: ${JSON.stringify(otherSpec)}\n        version: ${JSON.stringify(otherSpec)}\npackages:\n  ${name}@${oldRef}:\n    resolution: {tarball: ${oldRef}}\n    version: 0.3.1\nsnapshots:\n  ${name}@${oldRef}: {}\n`);
      const sentinels = [path.join(profile, "cordis.patch.yml"), path.join(home, "session-history.json"), path.join(root, "research-original.docx")];
      for (const file of sentinels) await writeFile(file, "synthetic retained bytes: " + path.basename(file));
      const before = await Promise.all(sentinels.map(file => readFile(file)));
      const env = { npm_config_store_dir: path.join(root, "empty-store") };
      for (const key of ["PATH", "SystemRoot", "WINDIR", "TEMP", "TMP", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "COMSPEC", "PATHEXT"]) {
        const actual = Object.keys(process.env).find(n => n.toLowerCase() === key.toLowerCase());
        if (actual) env[actual] = process.env[actual];
      }
      const module = { exports: {} };
      vm.runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, process: { env },
        require: id => id === "node:child_process" ? { spawn: (...args) => {
          const child = require(id).spawn(...args); children.push(child);
          child.stdout.on("data", b => output.push(b.toString())); child.stderr.on("data", b => output.push(b.toString()));
          return child;
        } } : require(id) });
      const result = await module.exports.ensureResearchPlugin({ runtime, home, tarball });
      assert.equal(result.changed, true); assert.equal(result.version, "0.6.0");
      const manifest = JSON.parse(await readFile(path.join(profile, "package.json"), "utf8"));
      assert.match(manifest.dependencies[name], /^file:/); assert.equal(manifest.dependencies["synthetic-other-plugin"], otherSpec);
      assert.deepEqual(manifest.dsh.profile, { bundles, retainedSetting: "synthetic preference" });
      assert.equal(JSON.parse(await readFile(path.join(profile, "node_modules", name, "package.json"), "utf8")).version, "0.6.0");
      assert.equal(JSON.parse(await readFile(path.join(profile, "node_modules/synthetic-other-plugin/package.json"), "utf8")).version, "1.2.3");
      assert(!(await readFile(path.join(profile, "pnpm-lock.yaml"), "utf8")).includes(oldRef));
      const after = await Promise.all(sentinels.map(file => readFile(file)));
      after.forEach((bytes, i) => assert(bytes.equals(before[i])));
      const repeat = await module.exports.ensureResearchPlugin({ runtime, home, tarball });
      assert.equal(repeat.changed, false); assert.equal(children.length, 1);
      t.diagnostic("Real bundled pnpm; isolated empty store; --offline; existing GitHub lock replaced; other plugin/config/session/material sentinels preserved.");
    });
}
