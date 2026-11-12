import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const sharedPackages = [
  ['@research-agent-platform/contracts', 'packages/contracts'],
  ['@research-agent-platform/research-skills', 'packages/research-skills'],
];
export const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
export const workspaceFor = (client) => path.resolve(client, '../..');

// --dir alone retains the caller's pnpm version. Corepack selects the exact
// version even when this command starts in the other package manager's project.
export function runPnpm(directory, args) {
  const manager = readJson(path.join(directory, 'package.json')).packageManager;
  if (!/^pnpm@\d+\.\d+\.\d+$/.test(manager)) throw Error('Expected an exact pnpm packageManager');
  // Only fixed tokens reach cmd.exe. Paths use cwd, never shell interpolation.
  if (!args.every(arg => /^[A-Za-z0-9@/_.:=+-]+$/.test(arg))) throw Error('Unexpected build command argument');
  console.log(`> ${manager} ${args.join(' ')} (${directory})`);
  const windows = process.platform === 'win32';
  const command = windows ? ['corepack.cmd', manager, ...args].join(' ') : 'corepack';
  const result = spawnSync(command, windows ? [] : [manager, ...args], {
    cwd: directory, stdio: 'inherit', shell: process.platform === 'win32',
    env: { ...process.env, COREPACK_ENABLE_DOWNLOAD_PROMPT: '0' },
  });
  if (result.error || result.status !== 0) throw Error(`Build command failed (${result.status ?? 'not started'}): ${result.error?.message ?? manager}`);
}

function nonempty(file) {
  if (!existsSync(file) || !statSync(file).isFile() || statSync(file).size === 0) throw Error(`Missing build file: ${file}`);
}

export function verifyWorkspaceLinks(client) {
  const workspace = workspaceFor(client), manifest = readJson(path.join(client, 'package.json'));
  for (const [name, relative] of sharedPackages) {
    const expected = path.join(workspace, relative, 'package.json');
    const installed = path.join(client, 'node_modules', name, 'package.json');
    if (manifest.dependencies[name] !== `link:../../${relative}` || !existsSync(installed) || realpathSync(installed) !== realpathSync(expected))
      throw Error(`Stale/missing workspace dependency ${name}. Run "pnpm run desktop:prepare" from the repository root; do not use install --force.`);
  }
}

export function verifyWorkspaceOutputs(client) {
  const workspace = workspaceFor(client);
  for (const [, relative] of sharedPackages) {
    const source = path.join(workspace, relative, 'src');
    function visit(directory) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) visit(file);
        else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts'))
          nonempty(path.join(workspace, relative, 'dist', path.relative(source, file).replace(/\.ts$/, '.js')));
      }
    }
    visit(source);
  }
  nonempty(path.join(workspace, 'packages/research-skills/dist/import.cjs'));
  nonempty(path.join(workspace, 'packages/research-skills/dist/role-catalog.js'));
  nonempty(path.join(workspace, 'packages/research-skills/dist/builtin-methods.js'));
  const roleSource = path.join(workspace, 'agents/roles');
  function verifyRoles(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const source = path.join(directory, entry.name);
      if (entry.isDirectory()) verifyRoles(source);
      else {
        const built = path.join(workspace, 'packages/research-skills/dist/roles', path.relative(roleSource, source));
        nonempty(built);
        if (!readFileSync(source).equals(readFileSync(built))) throw Error(`Stale built role: ${path.relative(roleSource, source)}`);
      }
    }
  }
  verifyRoles(roleSource);
  const originals = path.join(workspace, 'agents/skills');
  for (const entry of readdirSync(originals, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const source = path.join(originals, entry.name, 'SKILL.md');
    const built = path.join(workspace, 'packages/research-skills/dist/skills', entry.name, 'SKILL.md');
    nonempty(built);
    if (!readFileSync(source).equals(readFileSync(built))) throw Error(`Stale built skill: ${entry.name}`);
  }
}

export function prepareWorkspaceForBuild(client) {
  verifyWorkspaceLinks(client);
  runPnpm(workspaceFor(client), ['run', 'build:desktop-deps']);
  verifyWorkspaceOutputs(client);
}

export function verifyBuilderToolchain(client) {
  const require = createRequire(path.join(client, 'package.json'));
  const project = readJson(path.join(client, 'package.json'));
  const builderFile = require.resolve('electron-builder/package.json');
  const builder = readJson(builderFile);
  if (builder.version !== project.devDependencies['electron-builder']) throw Error('electron-builder differs from the exact pinned version');
  const visited = new Set();
  function check(file) {
    if (visited.has(file)) return;
    visited.add(file);
    const manifest = readJson(file), local = createRequire(file);
    for (const [name, expected] of Object.entries(manifest.dependencies ?? {})) {
      if (!/^(?:app-builder-lib|builder-util|builder-util-runtime|dmg-builder|electron-publish)$/.test(name) || !/^\d+\.\d+\.\d+$/.test(expected)) continue;
      const dependency = local.resolve(`${name}/package.json`), actual = readJson(dependency).version;
      if (actual !== expected) throw Error(`Mixed electron-builder toolchain: ${name} ${actual}, expected ${expected}`);
      check(dependency);
    }
  }
  check(builderFile);
  const electron = readJson(require.resolve('electron/package.json'));
  if (electron.version !== project.devDependencies.electron) throw Error('Electron differs from the exact pinned version');
  console.log(`Verified Electron ${electron.version}, electron-builder ${builder.version} and ${visited.size} matching builder components`);
}

export function runtimeEntryFiles(staging) {
  const require = createRequire(path.join(staging, 'package.json'));
  const paths = [path.join(staging, 'dist/index.html'), path.join(staging, 'dist-electron/main/bootstrap.js'), require.resolve('@research-agent-platform/research-skills/import')];
  if (!paths[2].endsWith('.cjs')) throw Error('Skill import must resolve to its CommonJS entry');
  paths.push(createRequire(path.join(staging, 'node_modules/@research-agent-platform/research-skills/package.json')).resolve('yaml'));
  paths.push(path.join(staging, 'dist-electron/main/localDshRuntime.js'));
  paths.push(path.join(staging, 'dist-electron/preload/localDsh.js'));
  paths.push(path.join(staging, 'dist-electron/preload/screenshotEditor.js'));
  paths.push(path.join(staging, 'dist-electron/main/screenshotEditorManage.js'));
  paths.push(path.join(staging, 'dist-electron/utils/screenshotEditorHtml.js'));
  paths.push(path.join(staging, 'dist-electron/main/teamLibraryManage.js'));
  paths.push(path.join(staging, 'dist-electron/utils/teamLibrary.js'));
  paths.push(path.join(staging, 'dist-electron/main/wechatImportRuntime.js'));
  paths.push(path.join(staging, 'dist-electron/preload/wechatImportClient.js'));
  for (const file of paths) {
    nonempty(file);
    const relative = path.relative(realpathSync(staging), realpathSync(file));
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error('Runtime entry escaped staging');
  }
  return paths.map(file => path.relative(staging, file).split(path.sep).join('/'));
}

export function verifyArchiveEntries(archive, entries, asar) {
  for (const entry of entries) {
    let info;
    try {
      // asar 3 uses the host path separator internally, including on Windows.
      info = asar.statFile(archive, path.normalize(entry));
    } catch (error) {
      throw Error(`Missing packaged runtime entry: ${entry}`, { cause: error });
    }
    if (!info || info.size <= 0 || info.link) throw Error(`Missing/invalid packaged runtime entry: ${entry}`);
  }
  console.log(`Verified ${entries.length} required entries in ${archive}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const client = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  verifyWorkspaceLinks(client);
  verifyWorkspaceOutputs(client);
  verifyBuilderToolchain(client);
}
