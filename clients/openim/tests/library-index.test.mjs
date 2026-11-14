import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(file, import.meta.url), "utf8");

test("the index tab only appears once the server has the routes", async () => {
  const page = await read("../src/research/LibraryWorkspace.tsx");
  assert.match(page, /label: "资料索引"/);
  assert.match(page, /const indexReady = availability\.supports\(41\)/);
  assert.match(page, /=== "index" && indexReady/);
});

test("the index page keeps pointers, not files", async () => {
  const page = await read("../src/research/LibraryIndexPage.tsx");
  assert.match(page, /researchApi\("libraryIndex"\)/);
  assert.match(page, /researchApi\("saveLibraryIndexEntry"/);
  // The page says out loud that originals stay on disk.
  assert.match(page, /原件保留在本机/);
  // Recommended is one per project and purpose, and is visible in the list.
  assert.match(page, /推荐使用/);
  assert.match(page, /同一项目、同一用途里推荐用这份/);
  // Local presence and version checks are shown per entry.
  assert.match(page, /校验本地版本/);
  assert.match(page, /本地版本不同/);
  assert.match(page, /bridge\.hash\(entry\.relPath\)/);
  // Picking a file fills the relative path and records its hash.
  assert.match(page, /onPick=\{async \(rels\)/);
  assert.match(page, /sha256,/);
});

test("the local library hook rescans when the page opens", async () => {
  const hook = await read("../src/research/useLocalLibrary.ts");
  assert.match(hook, /await bridge\.scan\(\)/);
  assert.match(hook, /Entering the page always rescans/);
});
