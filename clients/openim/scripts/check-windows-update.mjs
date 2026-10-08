// Read-only release gate. Run after build:win, before publishing all three assets.
import { createRequire } from "node:module";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(path.join(root, "package.json"));
const updaterRequire = createRequire(require.resolve("electron-updater"));
const runtimeRequire = createRequire(updaterRequire.resolve("builder-util-runtime"));
const { load } = runtimeRequire("js-yaml");
const version = JSON.parse(
  readFileSync(path.join(root, "package.json"), "utf8"),
).version;
const directory = path.join(root, "release", "Base", version);
const name = `AcceptCat_${version}.exe`;
const bytes = readFileSync(path.join(directory, name));
const manifest = load(readFileSync(path.join(directory, "latest.yml"), "utf8"));
const feed = load(
  readFileSync(
    path.join(directory, "win-unpacked", "resources", "app-update.yml"),
    "utf8",
  ),
);
const sha512 = createHash("sha512").update(bytes).digest("base64");
const need = (value, message) => {
  if (!value) throw Error(message);
};
need(/^\d+\.\d+\.\d+$/.test(version), "Stable semver required");
need(
  manifest.version === version && manifest.files?.length === 1,
  "Update manifest version/files mismatch",
);
need(
  manifest.files[0].url === name &&
    manifest.files[0].sha512 === sha512 &&
    manifest.files[0].size === bytes.length,
  "Update executable checksum/size/name mismatch",
);
need(
  manifest.path === name && manifest.sha512 === sha512,
  "Legacy manifest fields mismatch",
);
need(
  statSync(path.join(directory, name + ".blockmap")).isFile(),
  "Missing executable blockmap",
);
need(
  feed.provider === "github" &&
    feed.owner === "luoyan96" &&
    feed.repo === "personal-agent" &&
    !feed.private &&
    !feed.token,
  "Unexpected packaged feed or embedded credential",
);
const report = {
  status: "passed",
  version,
  provider: "public GitHub Releases",
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  sha512,
  assets: [name, name + ".blockmap", "latest.yml"],
};
console.log(JSON.stringify(report, null, 2));
