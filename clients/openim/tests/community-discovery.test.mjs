import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const run = await mkdtemp(path.join(tmpdir(), "community-discovery-"));
await esbuild.build({
  entryPoints: [
    fileURLToPath(new URL("../src/research/community-discovery.ts", import.meta.url)),
  ],
  outfile: path.join(run, "discovery.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
});
const {
  rankCommunityDiscovery: rank,
  readDiscoveryPreferences: load,
  saveDiscoveryPreferences: save,
  normalizeDiscoveryPreferences: normalize,
} = require(path.join(run, "discovery.cjs"));
const base = {
  name: "公开合成方法",
  category: "文献与阅读",
  author: "Synthetic",
  summary: "文献阅读方法",
  input: "论文摘要",
  deliverables: "比较表",
  installable: true,
  status: "offline_reviewed",
  revision: "a".repeat(40),
};
const reviewed = (id, stars = null, pushedAt = null, extra = {}) => ({
  ...base,
  id,
  repository: `https://github.com/synthetic/${id}`,
  github: { stars, pushedAt },
  ...extra,
});
const candidate = (id, stars, pushedAt = null, extra = {}) => ({
  name: `synthetic/${id}`,
  repository: `https://github.com/synthetic/${id}`,
  stars,
  pushedAt,
  description: "Data analysis workflow",
  foundAt: "2026-10-17T00:00:00Z",
  ...extra,
});
const options = {
  category: "全部",
  search: "",
  order: "recommended",
  preferences: { categories: [], keywords: [] },
  expertise: [],
};
const ids = (list) =>
  list.map((i) =>
    i.kind === "reviewed" ? i.entry.id : i.candidate.name.split("/")[1],
  );

test("recommendation ranks declared research interests before unrelated popularity and explains the match", () => {
  const catalog = {
    entries: [
      reviewed("popular", 50000),
      reviewed("data", 20, null, { category: "数据与代码", summary: "单细胞数据分析" }),
    ],
    candidates: [candidate("cell", 900, null, { description: "单细胞 data analysis" })],
  };
  const list = rank(catalog, {
    ...options,
    preferences: { categories: ["数据与代码"], keywords: ["单细胞"] },
  });
  assert.deepEqual(ids(list), ["data", "cell", "popular"]);
  assert.match(list[0].reason, /数据与代码/);
});
test("public expertise contributes without reading personal memory or conversation fields", () => {
  const list = rank(
    {
      entries: [
        reviewed("generic", 10000),
        reviewed("cell", 1, null, { summary: "单细胞研究" }),
      ],
    },
    { ...options, expertise: ["单细胞"] },
  );
  assert.deepEqual(ids(list), ["cell", "generic"]);
  assert.match(list[0].reason, /公开专长「单细胞」/);
});
test("with no preference it favors reviewed usable text workflows and never claims personalized matching", () => {
  const list = rank(
    {
      entries: [
        reviewed("tool", 9999, null, { installable: false }),
        reviewed("usable", 2),
        reviewed("archived", 99999, null, {
          github: { stars: 99999, pushedAt: null, archived: true },
        }),
      ],
      candidates: [candidate("unknown", 100000)],
    },
    options,
  );
  assert.deepEqual(ids(list), ["usable", "tool", "unknown", "archived"]);
  assert.match(list[0].reason, /已审阅/);
});
test("popular sorts reviewed entries and pending candidates together by real Star; unknown follows zero", () => {
  const list = rank(
    {
      entries: [reviewed("unknown"), reviewed("zero", 0), reviewed("middle", 100)],
      candidates: [candidate("top", 10000)],
    },
    { ...options, order: "popular" },
  );
  assert.deepEqual(ids(list), ["top", "middle", "zero", "unknown"]);
});
test("latest uses code push time rather than review, discovery or synchronization time", () => {
  const list = rank(
    {
      entries: [
        reviewed("old", 200, "2026-10-01T00:00:00Z", { reviewedAt: "2026-10-17" }),
        reviewed("unknown", 999999),
      ],
      candidates: [
        candidate("new", 1, "2026-10-16T00:00:00Z"),
        candidate("undated", 0, null),
      ],
    },
    { ...options, order: "latest" },
  );
  assert.deepEqual(ids(list), ["new", "old", "unknown", "undated"]);
});
test("direction filters work for both reviewed categories and keyword-classified GitHub discoveries", () => {
  const catalog = {
    entries: [
      reviewed("reading", 100),
      reviewed("data", 1, null, { category: "数据与代码" }),
    ],
    candidates: [
      candidate("python", 40),
      candidate("uncategorized", 50, null, { description: "unknown" }),
    ],
  };
  assert.deepEqual(
    ids(rank(catalog, { ...options, category: "数据与代码", order: "popular" })),
    ["python", "data"],
  );
});
test("search trims whitespace, ignores case and includes described deliverables", () => {
  const catalog = {
    entries: [reviewed("method", 2, null, { deliverables: "Protein FIGURE outputs" })],
    candidates: [
      candidate("drawing", 1, null, { description: "protein figure workflow" }),
    ],
  };
  assert.deepEqual(ids(rank(catalog, { ...options, search: "  FIGURE  " })), [
    "method",
    "drawing",
  ]);
  assert.equal(rank(catalog, { ...options, search: "absent" }).length, 0);
});
test("discovery excludes non-GitHub sources and duplicate candidate repositories without dropping reviewed subskills", () => {
  const catalog = {
    entries: [
      reviewed("one"),
      reviewed("two", 1, null, { repository: "https://github.com/synthetic/one" }),
      reviewed("outside", 999, null, { repository: "https://outside.invalid/x" }),
    ],
    candidates: [
      candidate("one", 100),
      candidate("fresh", 90),
      candidate("FRESH", 80),
      candidate("outside", 1000, null, { repository: "https://outside.invalid/y" }),
    ],
  };
  assert.deepEqual(
    new Set(ids(rank(catalog, options))),
    new Set(["one", "two", "fresh"]),
  );
});
test("ordering is deterministic for ties and does not mutate API arrays", () => {
  const entries = Object.freeze([reviewed("z", 1), reviewed("a", 1)]),
    catalog = { entries, candidates: Object.freeze([]) };
  assert.deepEqual(ids(rank(catalog, { ...options, order: "popular" })), ["a", "z"]);
  assert.deepEqual(
    entries.map((e) => e.id),
    ["z", "a"],
  );
});
test("preferences are bounded, deduplicated and limited to actual research categories", () => {
  const result = normalize({
    categories: ["全部", "数据与代码", "数据与代码", "fake"],
    keywords: [
      "a",
      "  单细胞  ",
      "单细胞",
      null,
      ...Array.from({ length: 20 }, (_, i) => `word${i}`),
    ],
    secret: "ignored",
  });
  assert.deepEqual(result.categories, ["数据与代码"]);
  assert.equal(result.keywords.length, 8);
  assert.equal(result.keywords[0], "单细胞");
  assert.deepEqual(Object.keys(result).sort(), ["categories", "keywords"]);
});
test("saved preferences are isolated by actor, survive a reload and can be reset", () => {
  const rows = new Map(),
    storage = {
      getItem: (k) => rows.get(k) ?? null,
      setItem: (k, v) => rows.set(k, v),
    };
  const preferences = { categories: ["数据与代码"], keywords: ["单细胞"] };
  save(storage, "member_A", preferences);
  assert.deepEqual(load(storage, "member_A"), preferences);
  assert.deepEqual(load(storage, "member_B"), { categories: [], keywords: [] });
  save(storage, "member_A", { categories: [], keywords: [] });
  assert.deepEqual(load(storage, "member_A"), { categories: [], keywords: [] });
});
test("corrupt, foreign-schema and blocked storage cannot break discovery or pretend to be saved", () => {
  for (const value of ["{", '{"schema":2,"categories":["数据与代码"]}', "null"])
    assert.deepEqual(load({ getItem: () => value }, "A"), {
      categories: [],
      keywords: [],
    });
  assert.deepEqual(
    load(
      {
        getItem: () => {
          throw Error("blocked");
        },
      },
      "A",
    ),
    { categories: [], keywords: [] },
  );
  assert.throws(
    () =>
      save(
        {
          setItem: () => {
            throw Error("blocked");
          },
        },
        "A",
        options.preferences,
      ),
    /blocked/,
  );
});
