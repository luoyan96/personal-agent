import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";
const require = createRequire(import.meta.url),
  client = path.resolve(
    path.dirname(new URL(import.meta.url).pathname.replace(/^\/(?:([A-Z]:))/, "$1")),
    "..",
  );
const output = path.resolve(client, "../../../.runtime/image-paste-20261009/unit");
await fs.mkdir(output, { recursive: true });
for (const name of ["clipboardFiles", "imageOcrLayout"]) {
  const source = await fs.readFile(
    path.join(client, "electron/utils", name + ".ts"),
    "utf8",
  );
  const code = ts
    .transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    })
    .outputText.replace(
      'require("koffi")',
      `require(${JSON.stringify(require.resolve("koffi"))})`,
    );
  await fs.writeFile(path.join(output, name + ".cjs"), code);
}
const { pathsFromDrop } = require(path.join(output, "clipboardFiles.cjs"));
const { imageTileOffsets, validateImageSize, mergeOcrLines } = require(path.join(
  output,
  "imageOcrLayout.cjs",
));
test(
  "Windows native DROPFILES preserves multiple Unicode image paths without touching system clipboard",
  { skip: process.platform !== "win32" },
  () => {
    const koffi = require("koffi"),
      kernel = koffi.load("kernel32.dll"),
      shell = koffi.load("shell32.dll");
    const alloc = kernel.func("void * __stdcall GlobalAlloc(uint flags, size_t size)"),
      lock = kernel.func("void * __stdcall GlobalLock(void *handle)"),
      unlock = kernel.func("bool __stdcall GlobalUnlock(void *handle)"),
      free = kernel.func("void * __stdcall GlobalFree(void *handle)");
    const query = shell.func(
      "uint __stdcall DragQueryFileW(void *drop, uint index, void *buffer, uint length)",
    );
    const fixture = ["C:\\合成图片\\截图一.png", "C:\\合成图片\\截图二.jpg"];
    const header = Buffer.alloc(20);
    header.writeUInt32LE(20, 0);
    header.writeUInt32LE(1, 16);
    const bytes = Buffer.concat([
      header,
      Buffer.from(fixture.join("\0") + "\0\0", "utf16le"),
    ]);
    const handle = alloc(0x42, bytes.length);
    try {
      const pointer = lock(handle);
      koffi.encode(pointer, koffi.array("uint8_t", bytes.length), bytes);
      unlock(handle);
      assert.deepEqual(pathsFromDrop(handle, query), fixture);
    } finally {
      free(handle);
    }
  },
);
test("Clipboard refuses excessive count and malformed paths before allocating", () => {
  assert.throws(() => pathsFromDrop(null, () => 21), /20/);
  assert.throws(
    () => pathsFromDrop(null, (_h, index) => (index === 0xffffffff ? 1 : 50000)),
    /路径/,
  );
});
test("Long-image tiles cover the full height and overlap across boundaries", () => {
  assert.deepEqual(imageTileOffsets(1000), [0]);
  assert.deepEqual(imageTileOffsets(5500), [0, 2000, 4000]);
  assert.deepEqual(imageTileOffsets(2200), [0]);
  assert.throws(() => validateImageSize(2000, 40000), /尺寸/);
  assert.throws(() => validateImageSize(0, 100), /读取/);
});
test("Overlap deduplication preserves repeated lines at different page positions and Latin spacing", () => {
  const line = (text, y) => ({ text, y, height: 30 });
  assert.equal(
    mergeOcrLines(
      [
        { lines: [line("中 文 识 别", 100), line("boundary text", 2080)] },
        { lines: [line("boundary text", 82), line("中 文 识 别", 1200)] },
      ],
      [0, 2000],
    ),
    "中文识别\nboundary text\n中文识别",
  );
});
