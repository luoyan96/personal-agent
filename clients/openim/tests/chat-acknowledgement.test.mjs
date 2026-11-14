import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import * as contracts from "@research-agent-platform/contracts";

const require = createRequire(import.meta.url);
const { create } = require("zustand");
const stamp = "2026-11-14T00:00:00.000Z";
const message = { id: "synthetic_message", conversationId: "synthetic_chat", sequence: 1, senderContactId: "synthetic_self", origin: "human", text: "合成需求", mentions: [], resources: [], actionIds: [], turnId: "synthetic_turn", createdAt: stamp };
const turn = { id: "synthetic_turn", conversationId: message.conversationId, inputMessageId: message.id, agentContactId: "synthetic_agent", status: "failed", failure: "MODEL_FAILED", availability: { status: "available", reason: null }, outputMessageId: null, usage: null, budget: { maxTokens: 4000, maxSeconds: 90 }, remainingBudget: { maxTokens: 3000, maxSeconds: 60 }, allowedActions: ["retry"], version: 2, createdAt: stamp, updatedAt: stamp };
const entry = (id = "synthetic_request") => ({ id, generation: 1, conversationID: "synthetic_im", recvID: "synthetic_agent", groupID: "", html: "<p>合成需求</p>", text: "合成需求", state: "acknowledged", request: { route: "agentChatMessage", conversationId: message.conversationId, body: { text: "合成需求", continuous: true } }, receipt: { message, turns: [turn] } });
async function compiled(file, imports, globals = {}) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, TextEncoder, Date, Set, Map, ...globals, require: name => {
    if (!(name in imports)) throw Error(`Unexpected dependency ${name}`);
    return imports[name];
  } });
  return module.exports;
}
async function fixture() {
  const storage = new Map();
  const actor = create(() => ({ generation: 1, actor: { member: { id: "synthetic_A" } }, sessionActorId: "synthetic_A" }));
  const load = () => compiled("../src/research/chat-outbox.ts", { zustand: { create }, "./store": { useResearchStore: actor }, "@research-agent-platform/contracts": contracts }, { sessionStorage: { getItem: id => storage.get(id), setItem: (id, value) => storage.set(id, value), removeItem: id => storage.delete(id) } });
  return { actor, storage, load, outbox: await load() };
}

test("delayed pointer keeps exact acknowledgement and queue can send the next sentence", async () => {
  const { outbox } = await fixture();
  outbox.useChatOutbox.setState({ items: [entry(), { ...entry("next"), state: "queued", receipt: undefined }] });
  outbox.reconcileAcknowledgedMessages(1, "synthetic_im", new Set());
  assert.equal(outbox.useChatOutbox.getState().items[0].receipt.message.id, message.id);
  assert.equal(outbox.pendingSubmissions(outbox.useChatOutbox.getState().items, 1, "synthetic_im")[0].id, "next");
  outbox.reconcileAcknowledgedMessages(1, "synthetic_im", new Set(["same_text_different_message"]));
  assert.equal(outbox.useChatOutbox.getState().items.length, 2);
  outbox.reconcileAcknowledgedMessages(1, "synthetic_im", new Set([message.id]));
  assert.equal(outbox.useChatOutbox.getState().items.length, 1);
});

test("acknowledgement survives reload as acknowledged, while uncertain/cancelled wait stays paused", async () => {
  const f = await fixture();
  f.outbox.useChatOutbox.setState({ items: [entry(), { ...entry("uncertain"), state: "sending", receipt: undefined, error: "已停止等待" }] });
  const restarted = await f.load();
  const items = restarted.useChatOutbox.getState().items;
  assert.equal(items[0].state, "acknowledged");
  assert.equal(items[0].receipt.turns[0].failure, "MODEL_FAILED");
  assert.equal(items[1].state, "paused");
  assert.match(items[1].error, /尚未确认/);
  assert.equal(restarted.pendingSubmissions(items, 1, "synthetic_im").length, 1);
});

test("same actor reconnect rebinds receipt generation without dispatch; account change clears it", async () => {
  const f = await fixture();
  f.outbox.useChatOutbox.setState({ items: [entry()] });
  f.actor.setState({ generation: 2 });
  assert.equal(f.outbox.useChatOutbox.getState().items[0].generation, 2);
  assert.equal(f.outbox.useChatOutbox.getState().items[0].state, "acknowledged");
  f.outbox.reconcileAcknowledgedMessages(1, "synthetic_im", new Set([message.id]));
  assert.equal(f.outbox.useChatOutbox.getState().items.length, 1);
  f.actor.setState({ generation: 3, actor: { member: { id: "synthetic_B" } }, sessionActorId: "synthetic_B" });
  assert.equal(f.outbox.useChatOutbox.getState().items.length, 0);
  assert.equal((await f.load()).useChatOutbox.getState().items.length, 0);
});

test("cross-conversation receipt is rejected rather than restoring authority", async () => {
  const f = await fixture();
  f.outbox.useChatOutbox.setState({ items: [{ ...entry(), receipt: { message: { ...message, conversationId: "different_chat" }, turns: [turn] } }] });
  assert.equal((await f.load()).useChatOutbox.getState().items.length, 0);
});

test("an idempotent replay of an earlier continuous input restores its receipt and shared updated turn", async () => {
  const f = await fixture();
  const replay = { ...entry(), receipt: { message, turns: [{ ...turn, inputMessageId: "newer_batch_input", version: 4 }] } };
  f.outbox.useChatOutbox.setState({ items: [replay, { ...entry("next_sentence"), receipt: undefined, state: "queued" }] });
  const restored = await f.load();
  const items = restored.useChatOutbox.getState().items;
  assert.equal(items[0].state, "acknowledged");
  assert.equal(items[0].receipt.message.id, message.id);
  assert.equal(items[0].receipt.turns[0].inputMessageId, "newer_batch_input");
  assert.equal(items[1].state, "paused");
  assert.equal(restored.pendingSubmissions(items, 1)[0].id, "next_sentence");
  assert.equal(items.filter(item => item.state === "queued").length, 0);
});

test("acknowledged images do not consume the pending-image limit across conversations", async () => {
  const { outbox } = await fixture();
  const { imagePasteLimits } = await compiled("../src/types/imageClipboard.ts", {});
  const { assertImageQueueCapacity } = await compiled("../src/research/chat-image-submission.ts", { "@/types/imageClipboard": { imagePasteLimits } });
  const images = Array.from({ length: 20 }, (_, i) => ({ id: `image_${i}`, size: 100, sent: true }));
  const acknowledged = { ...entry(), images };
  assert.doesNotThrow(() => assertImageQueueCapacity([{ id: "new_image", size: 100 }], outbox.pendingSubmissions([acknowledged], 1)));
  assert.throws(() => assertImageQueueCapacity([{ id: "new_image", size: 100 }], outbox.pendingSubmissions([{ ...acknowledged, state: "paused" }], 1)), /待发图片较多/);
});

test("the full 50-receipt bound restores without converting any receipt into a send", async () => {
  const f = await fixture();
  const entries = Array.from({ length: 50 }, (_, i) => ({ ...entry(`request_${i}`), receipt: { message: { ...message, id: `message_${i}`, turnId: `turn_${i}` }, turns: [{ ...turn, id: `turn_${i}`, inputMessageId: `message_${i}` }] } }));
  f.outbox.useChatOutbox.setState({ items: entries });
  const restored = await f.load();
  assert.equal(restored.useChatOutbox.getState().items.length, 50);
  assert.equal(restored.pendingSubmissions(restored.useChatOutbox.getState().items, 1).length, 0);
  assert.equal(restored.useChatOutbox.getState().notice, "");
});

test("receipt acceptance still rejects altered request bodies and non-human message receipts", async () => {
  for (const change of [
    { request: { ...entry().request, body: { text: "altered original text", continuous: true } } },
    { receipt: { message: { ...message, origin: "model" }, turns: [turn] } },
  ]) {
    const f = await fixture();
    f.outbox.useChatOutbox.setState({ items: [{ ...entry(), ...change }] });
    assert.equal((await f.load()).useChatOutbox.getState().items.length, 0);
  }
});

test("stopped and superseded progress revalidate once after navigation; live updates still poll", async () => {
  const { progressNeedsRead } = await compiled("../src/research/agent-progress-state.ts", {});
  const stopped = { validation: "previous_mount", progress: { phase: "stopped" } };
  assert.equal(progressNeedsRead(stopped, "new_mount"), true);
  assert.equal(progressNeedsRead({ ...stopped, validation: "new_mount" }, "new_mount"), false);
  assert.equal(progressNeedsRead({ validation: "old", progress: { phase: "superseded" } }, "new"), true);
  assert.equal(progressNeedsRead({ validation: "new", progress: { phase: "streaming" } }, "new"), true);
  assert.equal(progressNeedsRead({ ...stopped, canonicalSeen: "canonical" }, "new_mount"), false);
  assert.equal(progressNeedsRead({ ...stopped, validation: "new", error: "offline", checkedAt: undefined }, "new", 16000), true);
  assert.equal(progressNeedsRead({ error: "temporary", validation: "new", checkedAt: 10000 }, "new", 11000), false);
  assert.equal(progressNeedsRead({ error: "temporary", validation: "new", checkedAt: 10000 }, "new", 16000), true);
});
