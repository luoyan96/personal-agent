#!/usr/bin/env node

import { builtinModules, createRequire } from "node:module";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagePath = path.join(repoRoot, "package.json");
const backupPath = path.join(repoRoot, ".electron-package.backup.json");
const electronOutputPath = path.join(repoRoot, "dist-electron");
const stagingRoot = path.resolve(repoRoot, ".electron-runtime");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const electronBuilderCommand = path.join(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "electron-builder.cmd" : "electron-builder",
);

const rawArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const dryRun = rawArgs.includes("--dry-run");
const buildAll = rawArgs.includes("--all");
const forwardedArgs = rawArgs.filter((arg) => arg !== "--dry-run" && arg !== "--all");

const run = (command, args) => {
  console.log(`> ${path.basename(command)} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    throw new Error(
      `${path.basename(command)} exited with code ${result.status ?? 1}: ${
        result.error?.message || ""
      }`,
    );
  }
};

const getJavaScriptFiles = (directory) => {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...getJavaScriptFiles(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entryPath);
    }
  }
  return files;
};

const builtinPackages = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
  "electron",
]);

const toPackageName = (specifier) =>
  specifier.startsWith("@")
    ? specifier.split("/").slice(0, 2).join("/")
    : specifier.split("/")[0];

const detectRuntimePackageNames = () => {
  if (!existsSync(electronOutputPath)) {
    throw new Error("dist-electron is missing; run pnpm build first");
  }

  const packageNames = new Set();
  const importPattern = /\b(?:require|import)\(\s*["']([^"']+)["']\s*\)/g;
  for (const filePath of getJavaScriptFiles(electronOutputPath)) {
    const source = readFileSync(filePath, "utf8");
    for (const match of source.matchAll(importPattern)) {
      const specifier = match[1];
      if (
        specifier.startsWith(".") ||
        specifier.startsWith("/") ||
        builtinPackages.has(specifier)
      ) {
        continue;
      }
      packageNames.add(toPackageName(specifier));
    }
  }
  return [...packageNames].sort();
};

const resolvePackageManifestPath = (packageName, requiringManifestPath) => {
  const packageRequire = createRequire(requiringManifestPath);
  try {
    return packageRequire.resolve(`${packageName}/package.json`);
  } catch (error) {
    if (error?.code !== "ERR_PACKAGE_PATH_NOT_EXPORTED") {
      throw error;
    }
  }

  let currentPath = path.dirname(packageRequire.resolve(packageName));
  while (true) {
    const manifestPath = path.join(currentPath, "package.json");
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (manifest.name === packageName) {
        return manifestPath;
      }
    }
    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) break;
    currentPath = parentPath;
  }
  throw new Error(`Unable to resolve package manifest for ${packageName}`);
};

const collectInstalledDependencyNames = (rootPackageNames) => {
  const dependencyNames = new Set();
  const visitedManifests = new Set();

  const visit = (packageName, requiringManifestPath, optional = false) => {
    let manifestPath;
    try {
      manifestPath = resolvePackageManifestPath(packageName, requiringManifestPath);
    } catch (error) {
      if (optional) return;
      throw new Error(
        `Unable to resolve runtime dependency ${packageName}: ${error.message}`,
      );
    }
    if (visitedManifests.has(manifestPath)) return;
    visitedManifests.add(manifestPath);

    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    dependencyNames.add(manifest.name ?? packageName);
    for (const dependencyName of Object.keys(manifest.dependencies ?? {})) {
      visit(dependencyName, manifestPath);
    }
    for (const dependencyName of Object.keys(manifest.optionalDependencies ?? {})) {
      // PDF text extraction never renders a canvas. Do not package/rebuild the
      // optional native renderer against Electron's separate Node ABI.
      if (manifest.name === "pdfjs-dist" && dependencyName === "canvas") continue;
      visit(dependencyName, manifestPath, true);
    }
  };

  for (const packageName of rootPackageNames) {
    visit(packageName, packagePath);
  }
  return dependencyNames;
};

const createRuntimeManifest = (rootPackage) => {
  const dependencies = {};
  const importedPackageNames = detectRuntimePackageNames();
  const installedDependencyNames =
    collectInstalledDependencyNames(importedPackageNames);
  const declaredDependencies = {
    ...rootPackage.dependencies,
    ...rootPackage.optionalDependencies,
  };
  const runtimePackageNames = new Set(importedPackageNames);

  // electron-builder 23 flattens pnpm's dependency tree. Promote any explicitly
  // declared dependency in the runtime closure so the intended version wins over
  // a conflicting development dependency hoisted at the workspace root.
  for (const packageName of Object.keys(declaredDependencies)) {
    if (installedDependencyNames.has(packageName)) {
      runtimePackageNames.add(packageName);
    }
  }
  for (const packageName of [...runtimePackageNames].sort()) {
    const version =
      rootPackage.dependencies?.[packageName] ??
      rootPackage.optionalDependencies?.[packageName];
    if (!version) {
      throw new Error(
        `Electron runtime dependency ${packageName} must be declared in package.json`,
      );
    }
    dependencies[packageName] = version;
  }

  const manifest = { dependencies };
  for (const key of [
    "name",
    "version",
    "main",
    "description",
    "author",
    "license",
    "homepage",
    "private",
    "build",
  ]) {
    if (rootPackage[key] !== undefined) {
      manifest[key] = rootPackage[key];
    }
  }
  return manifest;
};

const ensurePublishMode = (args) => {
  if (args.some((arg) => arg === "--publish" || arg.startsWith("--publish="))) {
    return args;
  }
  return [...args, "--publish", "never"];
};

const getBuilderCommands = () => {
  const extraArgs = ensurePublishMode(forwardedArgs);
  const commands = buildAll
    ? [
        ["--win", "--x64", ...extraArgs],
        ["--mac", "--x64", "--arm64", ...extraArgs],
        ["--linux", "--x64", ...extraArgs],
        ["--linux", "--arm64", ...extraArgs],
      ]
    : [extraArgs];
  for (const args of commands) {
    if (args.includes("--win") && args.includes("--arm64")) {
      throw new Error("Windows arm64 is not supported by the OpenIM native SDK");
    }
  }
  return commands;
};

const restoreStaleBackup = () => {
  if (!existsSync(backupPath)) return;
  console.warn("Restoring package.json left by an interrupted Electron build");
  copyFileSync(backupPath, packagePath);
  unlinkSync(backupPath);
};

restoreStaleBackup();
const builderCommands = getBuilderCommands();

if (!dryRun) {
  run(process.execPath, [
    path.join(repoRoot, "node_modules", "vite", "bin", "vite.js"),
    "build",
  ]);
}

const originalPackageText = readFileSync(packagePath, "utf8");
const rootPackage = JSON.parse(originalPackageText);
const runtimeManifest = createRuntimeManifest(rootPackage);

const prepareRuntimeDirectory = () => {
  // electron-builder 23 does not reliably follow pnpm's virtual-store tree.
  // Materialize the installed runtime closure and preserve conflicting versions
  // as nested dependencies. Never package the development node_modules tree.
  if (
    path.dirname(stagingRoot) !== repoRoot ||
    path.basename(stagingRoot) !== ".electron-runtime"
  )
    throw new Error("Unexpected Electron staging path");
  rmSync(stagingRoot, { recursive: true, force: true });
  mkdirSync(path.join(stagingRoot, "node_modules"), { recursive: true });
  cpSync(path.join(repoRoot, "dist"), path.join(stagingRoot, "dist"), {
    recursive: true,
  });
  cpSync(electronOutputPath, path.join(stagingRoot, "dist-electron"), {
    recursive: true,
  });
  writeFileSync(
    path.join(stagingRoot, "package.json"),
    JSON.stringify(runtimeManifest, null, 2),
  );
  const roots = new Map(),
    copied = new Set();
  const copyPackage = (name, fromManifest, parent = stagingRoot, optional = false) => {
    let sourceManifest;
    try {
      sourceManifest = resolvePackageManifestPath(name, fromManifest);
    } catch (error) {
      if (optional) return;
      throw error;
    }
    const manifest = JSON.parse(readFileSync(sourceManifest, "utf8"));
    const root = roots.get(name);
    const destination =
      root && root.version !== manifest.version
        ? path.join(parent, "node_modules", name)
        : path.join(stagingRoot, "node_modules", name);
    if (!root) roots.set(name, { version: manifest.version });
    if (copied.has(destination)) return;
    copied.add(destination);
    mkdirSync(path.dirname(destination), { recursive: true });
    cpSync(path.dirname(sourceManifest), destination, {
      recursive: true,
      dereference: true,
      filter: (entry) => path.basename(entry) !== "node_modules",
    });
    for (const dependency of Object.keys(manifest.dependencies || {}))
      copyPackage(dependency, sourceManifest, destination);
    for (const dependency of Object.keys(manifest.optionalDependencies || {})) {
      if (manifest.name === "pdfjs-dist" && dependency === "canvas") continue;
      copyPackage(dependency, sourceManifest, destination, true);
    }
  };
  // Reserve direct dependency versions before resolving transitive dependencies.
  for (const name of Object.keys(runtimeManifest.dependencies)) {
    const manifest = JSON.parse(
      readFileSync(resolvePackageManifestPath(name, packagePath), "utf8"),
    );
    roots.set(name, { version: manifest.version });
  }
  for (const name of Object.keys(runtimeManifest.dependencies))
    copyPackage(name, packagePath);
  console.log(`Materialized ${copied.size} installed runtime packages for Electron`);
};

console.log(
  `Electron runtime dependencies: ${Object.keys(runtimeManifest.dependencies).join(
    ", ",
  )}`,
);

if (dryRun) {
  for (const args of builderCommands) {
    console.log(`Would run: electron-builder ${args.join(" ")}`);
  }
  process.exit(0);
}

let exitCode = 0;
try {
  prepareRuntimeDirectory();
  const electronVersion = JSON.parse(
    readFileSync(resolvePackageManifestPath("electron", packagePath), "utf8"),
  ).version;
  for (const args of builderCommands) {
    run(process.execPath, [
      path.join(repoRoot, "node_modules", "electron-builder", "out", "cli", "cli.js"),
      "--projectDir",
      stagingRoot,
      "--config",
      path.join(repoRoot, "electron-builder.json5"),
      "--config.electronVersion",
      electronVersion,
      "--config.directories.output",
      path.join(repoRoot, "release", "Base", rootPackage.version),
      ...args,
    ]);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  exitCode = 1;
} finally {
  console.log("Development package.json remains unchanged");
}

process.exit(exitCode);
