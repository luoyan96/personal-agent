import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

/**
 * The research plugin ships inside the installer and is installed through DSH's
 * own package manager, so the profile stays DSH's: pnpm writes the manifest and
 * lockfile, and we only add the bundle name DSH needs to load it.
 */
export const researchPlugin = { name: "dsh-research-workbench", version: "0.7.1" };

type EnsureResult = { changed: boolean; version?: string; reason?: string };

function runPnpm(runtime: string, profile: string, args: string[]) {
  const pnpm = path.join(runtime, "resources", "runtime", "primary-runtime", "dependencies", "pnpm", "bin", "pnpm.mjs");
  if (!existsSync(pnpm)) return Promise.reject(Error("这个 DSH 版本没有内置 pnpm，暂时无法安装插件。"));
  return new Promise<void>((resolve, reject) => {
    // DSH runs pnpm through its own Electron binary; reuse that instead of
    // requiring a system Node or pnpm.
    const child = spawn(path.join(runtime, "DeepSeek Harness.exe"), ["--expose-internals", pnpm, ...args], {
      cwd: profile,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => (output += String(chunk)));
    child.stderr.on("data", (chunk) => (output += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(Error(`pnpm 退出码 ${code}：${output.trim().slice(-400)}`)),
    );
  });
}

async function installedVersion(profile: string) {
  try {
    const manifest = JSON.parse(await readFile(path.join(profile, "node_modules", researchPlugin.name, "package.json"), "utf8"));
    if (typeof manifest.version !== "string") throw Error("已安装科研插件缺少版本号。");
    return manifest.version;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw Error("无法核对已安装科研插件的版本，已保留现有插件，请在插件管理中检查。");
  }
}

// Compare against our stable bundled release. A newer independently installed
// release (including a newer prerelease) must survive a DeepChat restart.
function olderThanBundled(current: string, bundled: string) {
  const parsed = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(current);
  if (!parsed) throw Error("科研插件版本无法比较，已保留现有插件，请在插件管理中检查。");
  const target = bundled.split(".").map(BigInt);
  for (let i = 0; i < 3; i++) {
    const value = BigInt(parsed[i + 1]);
    if (value !== target[i]) return value < target[i];
  }
  return parsed[4] !== undefined;
}

/**
 * Installs the bundled plugin when it is missing or older, then makes sure the
 * profile lists it as a bundle. A profile that DSH has not created yet is left
 * alone: DSH writes it on first start and we try again afterwards.
 */
export async function ensureResearchPlugin(input: {
  runtime: string;
  home: string;
  tarball: string;
}): Promise<EnsureResult> {
  const profile = path.join(input.home, "profiles", "web");
  const manifestPath = path.join(profile, "package.json");
  if (!existsSync(manifestPath)) return { changed: false, reason: "profile 尚未创建" };
  if (!existsSync(input.tarball)) return { changed: false, reason: "安装包内没有插件文件" };
  const current = await installedVersion(profile);
  const bundled = researchPlugin.version;
  let changed = false;
  if (current === undefined || olderThanBundled(current, bundled)) {
    // Name the dependency explicitly: a bare file: argument makes pnpm 11 try
    // to restore an existing GitHub dependency before replacing it, which fails
    // offline even though the replacement tarball is already in the installer.
    await runPnpm(input.runtime, profile, ["add", `${researchPlugin.name}@file:${input.tarball}`, "--offline", "--ignore-scripts"]);
    if (await installedVersion(profile) !== bundled)
      throw Error(`科研插件安装结果与内置 ${bundled} 不一致，请重试或在插件管理中检查。`);
    changed = true;
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const bundles: string[] = manifest?.dsh?.profile?.bundles ?? [];
  if (!Array.isArray(bundles) || bundles.some((bundle) => typeof bundle !== "string"))
    throw Error("科研插件列表格式异常，已保留原配置，请在插件管理中检查。");
  if (!bundles.includes(researchPlugin.name)) {
    manifest.dsh = { ...manifest.dsh, profile: { ...manifest.dsh?.profile, bundles: [...bundles, researchPlugin.name] } };
    await mkdir(profile, { recursive: true });
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    changed = true;
  }
  return { changed, version: await installedVersion(profile) };
}

/** App-owned connection extension uses DSH's package manager and launch
 * overlay; no profile source or research plugin is overwritten. */
export async function ensureTaskContextPlugin(input:{runtime:string;home:string}):Promise<EnsureResult>{
  const profile=path.join(input.home,'profiles','web');
  if(!existsSync(path.join(profile,'package.json')))return {changed:false,reason:'profile 尚未创建'};
  const directory=path.join(input.home,'acceptcat-task-context');
  const source=JSON.parse(await readFile(path.join(directory,'package.json'),'utf8'));
  let installed;
  try{installed=JSON.parse(await readFile(path.join(profile,'node_modules','acceptcat-task-context','package.json'),'utf8'));}
  catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  if(installed?.version===source.version)return {changed:false,version:source.version};
  await runPnpm(input.runtime,profile,['add',`acceptcat-task-context@file:${directory}`,'--offline','--ignore-scripts']);
  const actual=JSON.parse(await readFile(path.join(profile,'node_modules','acceptcat-task-context','package.json'),'utf8'));
  if(actual.version!==source.version)throw Error('工作台连接扩展版本未能核验，请重试连接。');
  return {changed:true,version:actual.version};
}
