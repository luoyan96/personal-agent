import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function fixture(pendingCount = 0) {
  const state = [];
  let cursor = 0, params = new URLSearchParams();
  const jsx = (type, props) => ({ type, props });
  const actor = { generation: 1, actor: { member: { id: "synthetic-member" } } };
  const imports = {
    "react/jsx-runtime": { jsx, jsxs: jsx },
    react: {
      lazy: () => "Skills", Suspense: "Suspense", useEffect() {}, useLayoutEffect() {},
      useRef: value => ({ current: value }),
      useState(initial) {
        const index = cursor++;
        if (!(index in state)) state[index] = initial;
        return [state[index], value => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
    },
    antd: Object.fromEntries(["Alert", "Button", "Input", "Modal", "Segmented", "Tabs"].map(name => [name, name])),
    "react-router-dom": { Link: "Link", useSearchParams: () => [params, next => { params = next; }] },
    "./store": { useResearchStore: Object.assign(selector => selector(actor), { getState: () => actor }) },
    "./useResearchRead": { useResearchRead: () => ({ data: { data: [], nextCursor: null }, refresh() {}, refreshChecked() {} }) },
    "./useContactStars": { useContactStars: () => ({ ids: [] }) },
    "./usePersonalOperation": { usePersonalOperation: () => ({ capture: () => ({ isCurrent: () => true }) }) },
    "./useResearchContactChat": { useResearchContactChat: () => () => {} },
    "./contact-directory": { sortDirectoryContacts: value => value },
    "./contact-requests": {
      pendingFriendRequestColor: "#b52732",
      pendingFriendRequestLabel: count => `${count} 条待处理的好友申请`,
      usePendingContactRequests: () => ({ data: Array.from({ length: pendingCount }) }),
    },
  };
  const source = await readFile(new URL("../src/research/ResearchContacts.tsx", import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { module, exports: module.exports, URLSearchParams,
    require: name => imports[name] || new Proxy({}, { get: (_, key) => String(key) }),
  });
  return { render() { cursor = 0; return module.exports.ResearchContacts(); } };
}

function nodes(node) {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
const text = node => !node ? "" : Array.isArray(node) ? node.map(text).join("") : typeof node === "object" ? text(node.props?.children) : String(node);
const find = (tree, predicate) => nodes(tree).find(predicate);
const button = (tree, label) => find(tree, node => ["button", "Button"].includes(node.type) && text(node) === label);

test("directory opens people search without specialist tabs or creation", async () => {
  const f = await fixture();
  const tree = f.render();
  const link = label => find(tree, node => node.type === "Link" && text(node) === label);
  assert.equal(link("好友申请").props.to, "/contact/newFriends");
  assert.equal(link("群邀请").props.to, "/contact/groupNotifications");
  assert.equal(link("我的群组").props.to, "/contact/myGroups");
  assert.equal(button(tree, "智能体"), undefined);
  assert.equal(button(tree, "添加智能体"), undefined);
  assert.match(text(tree), /选择一位联系人/);
  button(tree, "添加联系人").props.onClick();
  const modal = find(f.render(), node => node.type === "Modal");
  assert.equal(modal.props.open, true);
  assert.equal(modal.props.children.props.kind, "people");
});

test("the friend request shortcut exposes the count only while pending requests exist", async () => {
  const locate = tree => find(tree, node => node.type === "Link" && node.props.to === "/contact/newFriends");
  const empty = locate((await fixture()).render());
  assert.equal(empty.props["aria-label"], undefined);
  assert.equal(text(empty), "好友申请");
  const pending = locate((await fixture(105)).render());
  assert.equal(pending.props["aria-label"], "好友申请，105 条待处理的好友申请");
  assert.equal(text(pending), "好友申请99+");
});

async function pendingReader() {
  const source = await readFile(new URL("../src/research/contact-requests.ts", import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module, exports: module.exports, require: () => ({}) });
  return module.exports.readPendingRequests;
}

test("the pending count spans authenticated cursor pages, excluding sent and processed records", async () => {
  const read = await pendingReader();
  const request = (id, status, deciderMemberId) => ({ id, status, deciderMemberId });
  const first = request("one", "pending", "me");
  const second = request("two", "pending", "me");
  const cursors = [];
  const value = await read("me", async cursor => {
    cursors.push(cursor);
    return cursor ? { data: [first, second], nextCursor: null } : {
      data: [first, request("sent", "pending", "them"), request("done", "accepted", "me")],
      nextCursor: "page-two",
    };
  });
  assert.deepEqual(cursors, [undefined, "page-two"]);
  assert.deepEqual(Array.from(value), [first, second]);
});

test("a repeated continuation or later page failure cannot publish a partial badge", async () => {
  const read = await pendingReader();
  await assert.rejects(read("me", async () => ({ data: [], nextCursor: "duplicate" })), /分页暂不可用/);
  await assert.rejects(read("me", async cursor => {
    if (cursor) throw new Error("service unavailable");
    return { data: [{ id: "one", status: "pending", deciderMemberId: "me" }], nextCursor: "page-two" };
  }), /service unavailable/);
});
