import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const nodes = (node) => !node || typeof node !== "object" ? [] : Array.isArray(node)
  ? node.flatMap(nodes) : [node, ...nodes(node.props?.children)];
const jsx = (type, props) => ({ type, props });
const load = async (file, imports = {}, bridge) => {
  const source = await readFile(new URL(`../src/research/${file}`, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText, {
    module, exports: module.exports, Error, window: { electronAPI: { localLibrary: bridge } },
    require(name) { assert(Object.hasOwn(imports, name), name); return imports[name]; },
  });
  return module.exports;
};

async function fixture(bridge) {
  let cursor = 0;
  const state = [];
  const f = { actorId: "synthetic-account", data: undefined, loading: false, error: "" };
  const { PersonalFilesPage } = await load("PersonalFilesPage.tsx", {
    "./personal-files.scss": {},
    "./local-file-size": await load("local-file-size.ts"),
    "@ant-design/icons": new Proxy({}, { get: (_, key) => String(key) }),
    antd: { Button: "Button", Alert: "Alert", Input: { Search: "Search" } },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: { useState(initial) {
      const index = cursor++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (next) => { state[index] = next; }];
    } },
    "./usePersonalOperation": { usePersonalOperation: (active) => {
      const actorId = f.actorId;
      return { actorId, scope: actorId, capture: () => ({ isCurrent: () => active && actorId === f.actorId }) };
    } },
    "./useResearchRead": { useResearchRead: (read, identity, enabled, options) => {
      assert.equal(identity, "personal-files");
      assert.equal(options.poll, false);
      f.refresh = async () => {
        if (!enabled) return;
        try {
          f.data = await read();
          f.error = "";
        } catch (error) {
          f.data = undefined;
          f.error = error.message;
        }
      };
      return { data: enabled ? f.data : undefined, loading: f.loading, error: f.error, refresh: f.refresh };
    } },
  }, bridge);
  f.render = () => { cursor = 0; return nodes(PersonalFilesPage()); };
  f.button = (label, aria = false) => f.render().find(node =>
    node.type === "Button" && (aria ? node.props["aria-label"] : node.props.children) === label
  );
  return f;
}

const flush = () => new Promise(setImmediate);
const empty = { root: "C:\\Synthetic\\myfiles", name: "myfiles", files: [], truncated: false };
const zero = { rel: "nested\\empty.txt", name: "empty.txt", size: 0 };

test("personal files are usable without a shared folder or a service read", async () => {
  const calls = [];
  const f = await fixture({
    personalScan: async () => { calls.push("scan"); return current; },
    addPersonalFiles: async () => {
      calls.push("add");
      current = { ...empty, files: [zero] };
      return current;
    },
    openPersonalFolder: async () => { calls.push("open-folder"); },
    revealPersonalFile: async (rel) => { calls.push(rel); },
  });
  let current = empty;
  assert(f.render().some(node => node.props?.role === "status"));
  await f.refresh();
  assert(f.render().some(node => node.type === "h3" && node.props.children === "还没有文件"));
  assert.equal(f.button("选择资料文件夹"), undefined);
  f.button("打开文件夹").props.onClick();
  await flush();
  f.button("添加文件").props.onClick();
  await flush();
  assert(f.render().some(node => node.props?.children === "0 B"));
  f.button(`定位文件 ${zero.rel}`, true).props.onClick();
  await flush();
  assert.deepEqual(calls, ["scan", "open-folder", "add", "scan", zero.rel]);
  const search = f.render().find(node => node.type === "Search");
  search.props.onChange({ target: { value: "missing" } });
  assert.equal(f.button(`定位文件 ${zero.rel}`, true), undefined);
  assert(f.render().some(node => node.props?.children === "没有匹配的文件。"));
});

test("a failed scan can be retried and cancellation leaves the list unchanged", async () => {
  let scans = 0;
  const f = await fixture({
    personalScan: async () => {
      if (++scans === 1) throw new Error("Error invoking remote method 'personal-scan': Error: 文件夹暂不可用");
      return empty;
    },
    addPersonalFiles: async () => null,
  });
  f.render();
  await f.refresh();
  assert(f.render().some(node => node.type === "Alert" && node.props.description === "文件夹暂不可用"));
  f.button("刷新").props.onClick();
  await flush();
  assert.equal(f.render().some(node => node.type === "Alert"), false);
  f.button("添加文件").props.onClick();
  await flush();
  assert.equal(scans, 2);
});
