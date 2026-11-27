import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file, substitutes = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, {
    module, exports: module.exports, DOMException, AbortController, setTimeout, clearTimeout,
    navigator: { onLine: true },
    window: { addEventListener() {}, removeEventListener() {} },
    require: name => {
      if (!Object.hasOwn(substitutes, name)) throw Error(`Unexpected import: ${name}`);
      return substitutes[name];
    },
  }, { filename: file });
  return module.exports;
}
const deadline = await load("../src/research/request-deadline.ts");
const tick = () => new Promise(resolve => setImmediate(resolve));
const page = (first, last) => Array.from({ length: last - first + 1 }, (_, i) => ({
  clientMsgID: `m${first + i}`, sendTime: first + i, seq: first + i, contentType: 101,
}));
const deferred = () => {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
};
async function fixture() {
  const state = { generation: 1, session: { user: { userID: "synthetic-A" } } };
  const user = { isLogining: false, connectState: "success", syncState: "success", selfInfo: { userID: "synthetic-A" } };
  const researchStore = selector => selector(state);
  researchStore.getState = () => state;
  const userStore = selector => selector(user);
  userStore.getState = () => user;
  const f = {
    state, user, sdkCalls: [], cacheCalls: [], saved: [],
    sdk: async () => ({ data: { messageList: page(21, 40), isEnd: false } }),
    cache: async () => ({ messages: page(1, 20), reachedStart: true }),
  };
  const effects = [], states = [], refs = [];
  let stateIndex = 0, refIndex = 0, mounted = false;
  const useRef = value => {
    const index = refIndex++;
    return refs[index] ??= { current: value };
  };
  const code = await load("../src/pages/chat/queryChat/useHistoryMessageList.tsx", {
    react: {
      useCallback: fn => fn, useRef,
      useEffect: effect => { if (!mounted) effects.push(effect); },
      useState: initial => {
        const index = stateIndex++;
        if (!(index in states)) states[index] = initial;
        return [states[index], update => {
          states[index] = typeof update === "function" ? update(states[index]) : update;
        }];
      },
    },
    ahooks: {
      useLatest: value => Object.assign(useRef(value), { current: value }),
      useRequest: fn => ({ loading: false, runAsync: fn }),
    },
    "react-router-dom": { useParams: () => ({ conversationID: "synthetic-group" }) },
    "@openim/wasm-client-sdk": { MessageViewType: { History: 0 } },
    "@/layout/MainContentWrap": { IMSDK: { getAdvancedHistoryMessageList: options => {
      f.sdkCalls.push(options); return f.sdk(options);
    } } },
    "@/research/chat-timeline": { matchesLocator: (message, locator) => message.clientMsgID === locator.clientMsgID },
    "@/research/request-deadline": deadline,
    "@/research/store": { useResearchStore: researchStore },
    "@/store": { useUserStore: userStore, useConversationStore: { getState: () => ({}) } },
    "@/utils/events": { default: { on() {}, off() {} }, emit() {} },
    "./chat-history-cache": {
      readCachedHistory: (...args) => { f.cacheCalls.push(args); return f.cache(...args); },
      saveCachedHistory: async (...args) => { f.saved.push(args); },
    },
  });
  f.render = () => {
    stateIndex = refIndex = 0;
    return code.useHistoryMessageList();
  };
  f.hook = f.render();
  f.mount = () => {
    mounted = true;
    for (const effect of effects) effect();
  };
  return f;
}

test("a fresh online transcript stays silent while the SDK history read is pending", async t => {
  const f = await fixture();
  const sdk = deferred();
  const history = { data: { messageList: [], isEnd: true } };
  t.after(() => sdk.resolve(history));
  f.cache = async () => null;
  f.sdk = () => sdk.promise;
  f.mount();
  await tick();
  assert.equal(f.sdkCalls.length, 1);
  assert.equal(f.render().historySource, "");
  sdk.resolve(history);
  await tick();
});

test("a late cache miss cannot replace a successful friend-notice history page", async t => {
  const f = await fixture();
  const cache = deferred();
  t.after(() => cache.resolve(null));
  const friendNotice = { ...page(1, 1)[0], contentType: 1201 };
  f.cache = () => cache.promise;
  f.sdk = async () => ({ data: { messageList: [friendNotice], isEnd: true } });
  f.mount();
  await tick();
  assert.equal(f.render().loadState.messageList[0]?.clientMsgID, friendNotice.clientMsgID);
  assert.equal(f.render().historySource, "");
  cache.resolve(null);
  await tick();
  assert.equal(f.render().historySource, "");
  assert.equal(f.render().loadState.messageList[0]?.contentType, friendNotice.contentType);
});

test("explicit location waits for a pending latest page, then finds the older cached target", async t => {
  const f = await fixture(), pending = deferred();
  t.after(() => pending.resolve({ data: { messageList: page(21, 40), isEnd: false } }));
  f.sdk = () => pending.promise;
  const loading = f.hook.getMoreOldMessages(false);
  let settled = false;
  const locating = f.hook.seekMessage({ clientMsgID: "m5" }).then(value => { settled = true; return value; });
  await tick();
  assert.equal(settled, false, "a busy reader is not a missing message");
  pending.resolve({ data: { messageList: page(21, 40), isEnd: false } });
  await loading;
  assert.equal((await locating)?.clientMsgID, "m5");
  assert.equal(f.sdkCalls.length, 1);
  assert.equal(f.cacheCalls.at(-1)[2], "m21");
});

test("automatic restoration reads older local pages without waiting for slow server verification", async t => {
  const f = await fixture();
  await f.hook.getMoreOldMessages(false);
  const pending = deferred(); f.sdk = () => pending.promise;
  t.after(() => pending.resolve({ data: { messageList: page(21, 40), isEnd: false } }));
  const loading = f.hook.getMoreOldMessages(false);
  let restored;
  const locating = f.hook.seekMessage({ clientMsgID: "m5" }, { localOnly: true }).then(value => { restored = value; });
  await tick();
  assert.equal(restored?.clientMsgID, "m5");
  assert.equal(f.sdkCalls.length, 2, "restoration made no older-page server request");
  pending.resolve({ data: { messageList: page(21, 40), isEnd: false } });
  await Promise.all([loading, locating]);
});

test("an expired saved position stops at a local gap and never fetches uncached history", async () => {
  const f = await fixture();
  await f.hook.getMoreOldMessages(false);
  f.cache = async () => null;
  assert.equal(await f.hook.seekMessage({ clientMsgID: "missing-anchor" }, { localOnly: true }), undefined);
  assert.equal(f.sdkCalls.length, 1);
});

test("a late history response after an account change neither locates nor writes into the next account", async () => {
  const f = await fixture(), pending = deferred();
  f.sdk = () => pending.promise;
  const loading = f.hook.getMoreOldMessages(false);
  const locating = f.hook.seekMessage({ clientMsgID: "m5" });
  f.state.generation++;
  pending.resolve({ data: { messageList: page(21, 40), isEnd: false } });
  await loading;
  assert.equal(await locating, undefined);
  assert.equal(f.hook.latestLoadState.current.messageList.length, 0);
  assert.equal(f.saved.length, 0);
  assert.equal(f.cacheCalls.length, 0);
});

test("an explicit retry can locate the same target after the older page becomes available", async () => {
  const f = await fixture();
  await f.hook.getMoreOldMessages(false);
  f.cache = async () => null;
  f.sdk = async () => { throw Error("synthetic temporary read failure"); };
  const target = { clientMsgID: "m5" };
  assert.equal(await f.hook.seekMessage(target), undefined);
  f.sdk = async () => ({ data: { messageList: page(1, 20), isEnd: true } });
  assert.equal((await f.hook.seekMessage(target))?.clientMsgID, "m5");
  assert.equal(f.sdkCalls.length, 3);
});
