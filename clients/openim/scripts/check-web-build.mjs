import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const hash = (data) => createHash("sha256").update(data).digest("hex");
const required = ["openIM.wasm", "sql-wasm.wasm", "wasm_exec.js", "emojis.json"];
for (const file of required) {
  const output = path.join(dist, file),
    source = path.join(root, "public", file);
  if (!existsSync(output) || statSync(output).size === 0)
    throw new Error(`Missing non-empty web SDK resource: ${file}`);
  if (hash(readFileSync(output)) !== hash(readFileSync(source)))
    throw new Error(`Web SDK resource differs from pinned public source: ${file}`);
}
for (const directory of ["assets", "font", "icons"])
  if (!existsSync(path.join(dist, directory)))
    throw new Error(`Missing web resource directory: ${directory}`);
const html = readFileSync(path.join(dist, "index.html"), "utf8");
if (!html.includes("<title>AcceptCat</title>"))
  throw new Error("Wrong research client HTML title");
for (const match of html.matchAll(/(?:src|href)="\.\/(assets\/[^"?#]+)"/g))
  if (!existsSync(path.join(dist, match[1])))
    throw new Error(`Missing referenced asset: ${match[1]}`);
console.log(
  `Verified complete web dist, ${required.length} pinned SDK resources, assets/font/icons and HTML references`,
);
