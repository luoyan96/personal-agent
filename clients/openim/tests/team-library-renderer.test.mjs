import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const compile = async (file) => ts.transpileModule(await readFile(new URL(file, import.meta.url), "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const [workspaceCode, materialUseInCode, formatsCode] = await Promise.all([
  compile("../src/research/TeamLibraryWorkspace.tsx"),
  compile("../src/research/MaterialUseIn.tsx"),
  compile("../electron/utils/workbenchMaterialFormats.js"),
]);
const nodes = (node) =>
  !node || typeof node !== "object"
    ? []
    : Array.isArray(node)
    ? node.flatMap(nodes)
    : [node, ...nodes(node.props?.children)];
const textOf = (node) =>
  node == null || typeof node === "boolean"
    ? ""
    : typeof node !== "object"
    ? String(node)
    : Array.isArray(node)
    ? node.map(textOf).join("")
    : textOf(node.props?.children);
const entry = (id, path, kind = "git") => ({
  id,
  name: id + ".md",
  projectId: "project",
  purpose: "reference",
  summary: "",
  maintainer: "",
  source: { kind, path, sha256: "a".repeat(64) },
});
const binding = {
  labId: "lab",
  version: 1,
  url: "https://github.com/synthetic/files.git",
  branch: "main",
  workspaceId: "workspace",
};
const snapshot = (changes = {}) => ({
  binding,
  revision: "a".repeat(40),
  syncedAt: "2026-11-15T00:00:00Z",
  manifest: {
    title: "Synthetic library",
    projects: [{ id: "project", name: "Project" }],
    entries: [
      entry("registered", "docs/nested.md"),
      entry("shared", "shared.md", "shared"),
    ],
  },
  tree: [
    { path: "docs", kind: "folder" },
    { path: "docs/nested.md", kind: "file" },
    { path: "docs/raw.md", kind: "file" },
    { path: ".gitignore", kind: "file" },
    { path: "README.md", kind: "file" },
    { path: "acceptcat-library.json", kind: "file" },
    { path: "link", kind: "symlink" },
    { path: "module", kind: "submodule" },
  ],
  ...changes,
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};

function fixture(initial = snapshot()) {
  const state = [],
    refs = [],
    effects = [],
    queued = [];
  let cursor = 0,
    refCursor = 0,
    effectCursor = 0,
    dirty = false;
  const f = {
    generation: 1,
    actorId: "actor",
    binding: initial.binding,
    canConfigure: true,
    repositoryError: "",
    next: initial,
    previews: [],
    paths: [],
    drafts: [],
    navigation: [],
    workbench: [],
    cached: async () => null,
    sync: async () => f.next,
    preview: async (selected) => ({ kind: "text", text: "Registered content" }),
    previewPath: async (selected) => ({
      kind: "text",
      text: "Raw content: " + selected.path,
    }),
  };
  const jsx = (type, props) => ({ type, props });
  const imports = {
    "@research-agent-platform/contracts": {},
    antd: Object.fromEntries(
      [
        "Alert",
        "Button",
        "Checkbox",
        "Drawer",
        "Dropdown",
        "Empty",
        "Input",
        "Modal",
        "Select",
        "Spin",
      ].map((name) => [
        name,
        name === "Input" ? { Search: "Search", TextArea: "TextArea" } : name,
      ]),
    ),
    "@ant-design/icons": new Proxy({}, { get: (_, key) => String(key) }),
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in state)) state[i] = initial;
        return [
          state[i],
          (value) => {
            const next = typeof value === "function" ? value(state[i]) : value;
            if (!Object.is(state[i], next)) {
              state[i] = next;
              dirty = true;
            }
          },
        ];
      },
      useRef(initial) {
        return (refs[refCursor++] ||= { current: initial });
      },
      useEffect(action, deps) {
        const i = effectCursor++;
        if (!effects[i] || deps.some((d, n) => !Object.is(d, effects[i].deps[n]))) {
          const old = effects[i];
          effects[i] = { deps };
          queued.push(() => {
            old?.cleanup?.();
            effects[i].cleanup = action();
          });
        }
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-router-dom": { useNavigate: () => (path) => f.navigation.push(path) },
    "./api": { researchApi: async (route) => ({ data: route === "workbench" ? f.workbench : [], nextCursor: null }) },
    "./useResearchRead": {
      useResearchRead: () => ({
        data: f.repositoryError ? undefined : { data: { binding: f.binding, canConfigure: f.canConfigure } },
        error: f.repositoryError,
        refresh: async () => {},
      }),
    },
    "./usePersonalOperation": {
      usePersonalOperation: () => ({
        generation: f.generation,
        actorId: f.actorId,
        capture: () => {
          const g = f.generation,
            a = f.actorId;
          return { isCurrent: () => g === f.generation && a === f.actorId };
        },
      }),
    },
    "./store": {
      useResearchStore: (selector) =>
        selector({ actor: { member: { id: f.actorId, labId: "lab" } } }),
    },
    "./workbench-links": { nativeWorkbenchTaskPath: (id, kind) => `/dsh?task=${id}&taskKind=${kind}` },
    "./RepositoryEditor": { RepositoryEditor: "RepositoryEditor" },
    "./LibraryIndexPage": {},
    "./SafeMessageMarkdown": { default: "Markdown" },
    "./TeamLibraryFileImport": {},
    "./useOwnAssistantConversation": {
      useOwnAssistantConversation: () => async (draft) => {
        f.drafts.push(draft);
        return true;
      },
    },
    "./team-library.scss": {},
  };
  function load(code) {
    const module = { exports: {} };
    vm.runInNewContext(code, {
      module,
      exports: module.exports,
      require: (name) => {
        assert(Object.hasOwn(imports, name), name);
        return imports[name];
      },
      Error,
      URLSearchParams,
      window: {
        electronAPI: {
          teamLibrary: {
            cached: () => f.cached(),
            sync: () => f.sync(),
            preview: (s) => {
              f.previews.push({ ...s });
              return f.preview(s);
            },
            previewPath: (s) => {
              f.paths.push({ ...s });
              return f.previewPath(s);
            },
          },
        },
      },
    });
    return module.exports;
  }
  imports["../../electron/utils/workbenchMaterialFormats"] = load(formatsCode);
  imports["./MaterialUseIn"] = load(materialUseInCode);
  const { TeamLibraryWorkspace } = load(workspaceCode);
  f.render = () => {
    cursor = 0;
    refCursor = 0;
    effectCursor = 0;
    return TeamLibraryWorkspace({ supported: true });
  };
  f.settle = async () => {
    for (let i = 0; i < 12; i++) {
      dirty = false;
      f.tree = f.render();
      while (queued.length) queued.shift()();
      await new Promise((r) => setImmediate(r));
      if (!dirty && !queued.length) return f.tree;
    }
    throw Error("Render did not settle");
  };
  f.click = async (text) => {
    const button = nodes(f.tree).find(
      (n) => (n.type === "Button" || n.type === "button") && textOf(n) === text,
    );
    assert(button, `Missing button ${text}`);
    await button.props.onClick();
    return f.settle();
  };
  f.rows = () =>
    nodes(f.tree).filter((n) => n.type === "button" && n.props.role === "row");
  return f;
}

test("repository discussion hands its location to the personal assistant without including preview text", async () => {
  const f = fixture();
  await f.settle();
  assert(!nodes(f.tree).some((node) => node.props?.id === "team-library-question"));
  await f.click("和个人助理讨论");
  assert.match(f.drafts[0], /GitHub 仓库：synthetic\/files（main，aaaaaaaa）/);
  await f.rows().find((row) => textOf(row).includes("docs文件夹")).props.onClick();
  await f.settle();
  await f.rows().find((row) => textOf(row).includes("raw.md文件")).props.onClick();
  await f.settle();
  await f.click("和个人助理讨论");
  assert.match(f.drafts[1], /文件路径：docs\/raw\.md/);
  assert.doesNotMatch(f.drafts[1], /Raw content/);
});

test("catalog still lets users manually take multiple registered materials to an authorized task", async () => {
  const f = fixture();
  f.workbench = [{
    id: "card", taskId: "task-one", source: "research_task",
    category: "ongoing", allowedActions: ["run"], summaryOnly: false,
  }];
  await f.settle();
  await f.click("资料目录");
  await f.click("选择资料用于任务");
  for (const item of nodes(f.tree).filter((node) => node.props?.className === "team-library-candidate"))
    item.props.onChange({ target: { checked: true } });
  await f.settle();
  const chooser = nodes(f.tree).find((node) => node.props?.okText === "选择任务");
  await chooser.props.onOk();
  await f.settle();
  const params = new URLSearchParams(f.navigation[0].split("?")[1]);
  assert.deepEqual(params.getAll("teamEntry"), ["registered", "shared"]);
  assert.equal(params.get("teamRevision"), snapshot().revision);
  assert.deepEqual(f.drafts, []);
});

test("root lists every real direct child including dotfiles and manifest with no selected document", async () => {
  const f = fixture();
  await f.settle();
  assert.deepEqual(
    f.rows().map((n) => textOf(n.props.children[0])),
    ["docs", ".gitignore", "acceptcat-library.json", "link", "module", "README.md"],
  );
  assert(!textOf(f.tree).includes("nested.md"));
  assert(!nodes(f.tree).some((n) => n.props?.className === "team-library-detail"));
  assert.equal(f.previews.length, 0);
  assert.equal(f.paths.length, 0);
  assert(textOf(f.tree).includes("files"));
});

test("the repository offers one primary recovery for each actionable sync or configuration state", async () => {
  const primary = (tree) => nodes(tree).filter(n => n.type === "Button" && n.props.type === "primary").map(textOf);
  const f = fixture();
  f.repositoryError = "配置暂不可用";
  assert.deepEqual(primary(await f.settle()), ["重试读取配置"]);

  f.repositoryError = "";
  const binding = f.binding;
  f.binding = null;
  assert.deepEqual(primary(await f.settle()), []);
  assert(nodes(f.tree).some(n => n.type === "RepositoryEditor" && n.props.inline));
  f.canConfigure = false;
  assert.deepEqual(primary(await f.settle()), []);
  assert(!nodes(f.tree).some(n => n.type === "RepositoryEditor"));
  assert(textOf(f.tree).includes("请课题组管理员连接 GitHub 仓库"));

  f.binding = binding;
  f.sync = async () => { throw Error("网络暂不可用"); };
  assert.deepEqual(primary(await f.settle()), ["重新同步"]);
  const details = nodes(f.tree).find(n => n.type === "details");
  assert(textOf(details).includes("查看仓库配置"));
});

test("folder drill-in, parent and root breadcrumbs preserve actual paths", async () => {
  const f = fixture();
  await f.settle();
  await f.click("docs文件夹");
  assert.deepEqual(
    f.rows().map((n) => textOf(n.props.children[0])),
    [" ..", "nested.md", "raw.md"],
  );
  assert(
    nodes(f.tree).some(
      (n) => n.props?.["aria-current"] === "page" && textOf(n) === "docs",
    ),
  );
  await f.click(" ..返回上级");
  assert(f.rows().some((n) => textOf(n).startsWith(".gitignore")));
  await f.click("docs文件夹");
  await f.click("files");
  assert(f.rows().some((n) => textOf(n).startsWith("README.md")));
});

test("unregistered regular files preview their exact revision and path without task authority", async () => {
  const f = fixture();
  await f.settle();
  await f.click("README.md文件");
  assert.deepEqual(f.paths, [{ revision: "a".repeat(40), path: "README.md" }]);
  assert(!textOf(f.tree).includes("用于任务"));
  assert(
    nodes(f.tree).some(
      (n) => n.type === "Markdown" && n.props.text === "Raw content: README.md",
    ),
  );
  await f.click("docs文件夹");
  await f.click("raw.md文件");
  assert.equal(f.paths.at(-1).path, "docs/raw.md");
});

test("registered tree files keep task actions and secondary catalog keeps non-Git entries", async () => {
  const f = fixture();
  await f.settle();
  await f.click("docs文件夹");
  await f.click("nested.md文件");
  assert.deepEqual(f.previews, [{ revision: "a".repeat(40), entryId: "registered" }]);
  assert(textOf(f.tree).includes("用于任务"));
  await nodes(f.tree).find((n) => n.props?.["aria-label"] === "关闭资料详情").props.onClick();
  await f.settle();
  assert(!nodes(f.tree).some((n) => n.props?.className === "team-library-detail"));
  await f.click("资料目录");
  assert(f.rows().some((n) => textOf(n).includes("shared.md")));
  await f
    .rows()
    .find((n) => textOf(n).includes("shared.md"))
    .props.onClick();
  await f.settle();
  assert(textOf(f.tree).includes("用于任务"));
  assert.equal(f.paths.length, 0);
});

test("symlinks and submodules show explicit unavailable states and never preview their targets", async () => {
  const f = fixture();
  await f.settle();
  await f.click("link符号链接");
  assert(textOf(f.tree).includes("不读取链接目标"));
  await f.click("module子模块");
  assert(textOf(f.tree).includes("对应仓库"));
  assert.equal(f.paths.length, 0);
});

test("a revision change resets browsing and selection; an old cache offers sync plus catalog", async () => {
  const f = fixture();
  await f.settle();
  await f.click("docs文件夹");
  await f.click("raw.md文件");
  f.next = snapshot({ revision: "b".repeat(40) });
  await f.click("同步");
  assert(!nodes(f.tree).some((n) => n.props?.className === "team-library-detail"));
  assert(f.rows().some((n) => textOf(n).startsWith(".gitignore")));
  f.next = snapshot({ tree: undefined, revision: "c".repeat(40) });
  await f.click("同步");
  assert(
    nodes(f.tree).some(
      (n) => n.type === "Alert" && n.props.message.includes("没有仓库文件树"),
    ),
  );
  await f.click("资料目录");
  assert.equal(f.rows().length, 2);
});

test("failed and late previews never replace the currently selected file", async () => {
  const f = fixture();
  await f.settle();
  const pending = deferred();
  const newer = deferred();
  f.previewPath = (selected) =>
    selected.path === "README.md" ? pending.promise : newer.promise;
  await f.click("README.md文件");
  await f.click(".gitignore文件");
  pending.resolve({ kind: "text", text: "old response" });
  await f.settle();
  assert(
    !nodes(f.tree).some(
      (n) => n.type === "Markdown" && n.props.text === "old response",
    ),
  );
  newer.resolve({ kind: "text", text: "current response" });
  await f.settle();
  assert(textOf(f.tree).includes("current response"));
  assert.equal(
    nodes(f.tree).find((n) => n.props?.className === "team-library-detail-title").props
      .children[1].props.children,
    ".gitignore",
  );
  f.previewPath = async () => {
    throw Error("Read failed");
  };
  await f.click("README.md文件");
  assert(textOf(f.tree).includes("Read failed"));
  assert(
    !nodes(f.tree).some(
      (n) => n.type === "Markdown" && n.props.text === "old response",
    ),
  );
});

test("actor and repository changes hide old content immediately and reject pending reads", async () => {
  const f = fixture();
  await f.settle();
  const old = deferred();
  f.previewPath = () => old.promise;
  await f.click("README.md文件");
  const sync = deferred();
  f.sync = () => sync.promise;
  f.generation++;
  f.actorId = "other";
  assert(!nodes(f.render()).some((n) => n.props?.className === "team-library-detail"));
  await f.settle();
  old.resolve({ kind: "text", text: "private old response" });
  await f.settle();
  assert(!textOf(f.tree).includes("private old response"));
  f.binding = { ...binding, url: "https://github.com/synthetic/other.git", version: 2 };
  assert(!nodes(f.render()).some((n) => n.props?.["aria-label"] === "仓库文件"));
  await f.settle();
  sync.resolve(snapshot());
  await f.settle();
  assert(!textOf(f.tree).includes("private old response"));
  assert(!nodes(f.tree).some((n) => n.props?.["aria-label"] === "仓库文件"));
});

test("registered IDs and raw paths with the same spelling do not share preview requests", async () => {
  const initial = snapshot();
  initial.manifest.entries[0].id = "README.md";
  const f = fixture(initial);
  await f.settle();
  await f.click("docs文件夹");
  await f.click("nested.md文件");
  await f.click("files");
  await f.click("README.md文件");
  assert.equal(f.previews.length, 1);
  assert.equal(f.paths.length, 1);
  assert(
    nodes(f.tree).some(
      (n) => n.type === "Markdown" && n.props.text === "Raw content: README.md",
    ),
  );
});
