import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

const source = await fs.readFile(new URL("../src/hooks/useConversationToggle.ts", import.meta.url), "utf8");
function fixture() {
  const old = { conversationID: "im_old" }, next = { conversationID: "im_agent", userID: "peer_agent", conversationType: 1 };
  const actor = { generation: 1, actor: { member: { id: "actor_A" } }, contacts: [{ userID: "peer_agent", contact: { id: "agent_A", allowedActions: ["chat"] } }], refresh: async () => {} };
  const conversations = { currentConversation: old, conversationList: [], updateCurrentConversation: async (value, _, canCommit) => { if (canCommit()) conversations.currentConversation = value; } };
  const navigations = [], requests = [], route = { pathname: "/square" };
  const store = selector => selector(conversations); store.getState = () => conversations;
  const ref = { current: route.pathname };
  let beforeApi = async () => {};
  const imports = {
    react: { useCallback: callback => callback, useRef: () => ref },
    "react-router-dom": { useNavigate: () => value => navigations.push(value), useLocation: () => route },
    "@/store": { useConversationStore: store },
    "@/research/store": { useResearchStore: { getState: () => actor } },
    "@/research/api": { researchMode: true, researchApi: async (name) => { requests.push(name); await beforeApi(name); return { data: name === "createDirectConversation" ? { id: "rap_agent" } : { researchConversationId: "rap_agent", transportStatus: "ready" } }; } },
    "@/research/bridge": { ensureResearchConversation: async () => next },
    "@/layout/MainContentWrap": { IMSDK: {} }, "@/utils/common": { feedbackToast() {} },
  };
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => imports[name] });
  return { actor, conversations, navigations, requests, old, next, ref, open: module.exports.useConversationToggle().toSpecifiedConversation, setBeforeApi: callback => { beforeApi = callback; } };
}

test("card opens a new single conversation and route together even when committing selection invalidates old-panel guard", async () => {
  const f = fixture();
  const result = await f.open({ sourceID: "peer_agent", sessionType: 1, isCurrent: () => f.conversations.currentConversation === f.old });
  assert.equal(f.conversations.currentConversation.conversationID, "im_agent");
  assert.deepEqual(f.navigations, ["/chat/im_agent"]);
  assert.equal(result, true);
});

test("opening already-selected Agent still navigates to its canonical chat", async () => {
  const f = fixture(); f.conversations.currentConversation = f.next;
  assert.equal(await f.open({ sourceID: "peer_agent", sessionType: 1, isCurrent: () => true }), true);
  assert.deepEqual(f.navigations, ["/chat/im_agent"]);
});

test("changing account, current conversation, panel permission or route during API await never commits the stale Agent", async () => {
  for (const change of [
    f => { f.actor.generation++; }, f => { f.actor.actor.member.id = "actor_B"; },
    f => { f.conversations.currentConversation = { conversationID: "im_other" }; },
    f => { f.ref.current = "/workbench"; },
  ]) {
    const f = fixture(); let changed = false;
    f.setBeforeApi(async () => { if (!changed) { changed = true; change(f); } });
    await f.open({ sourceID: "peer_agent", sessionType: 1, isCurrent: () => f.conversations.currentConversation === f.old });
    assert.notEqual(f.conversations.currentConversation.conversationID, "im_agent");
    assert.deepEqual(f.navigations, []);
  }
  const f = fixture(); let permitted = true;
  f.setBeforeApi(async () => { permitted = false; });
  await f.open({ sourceID: "peer_agent", sessionType: 1, isCurrent: () => permitted });
  assert.equal(f.conversations.currentConversation, f.old); assert.deepEqual(f.navigations, []);
});

test("permission revoked during refresh prevents direct-conversation API and navigation", async () => {
  const f = fixture(); f.actor.refresh = async () => { f.actor.contacts[0].contact.allowedActions = []; };
  await assert.rejects(f.open({ sourceID: "peer_agent", sessionType: 1, isCurrent: () => true }), /请先添加联系人/);
  assert.deepEqual(f.requests, []); assert.deepEqual(f.navigations, []);
});
