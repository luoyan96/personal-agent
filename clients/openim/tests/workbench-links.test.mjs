import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { Id } from "@research-agent-platform/contracts";

const source = await fs.readFile(new URL("../src/research/workbench-links.ts", import.meta.url), "utf8");
const module = { exports: {} };
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { module, exports: module.exports, URLSearchParams, Set, Error, require: () => ({ Id }) });
const { workbenchTaskPath, workbenchTaskTarget, findAssistantWorkTask } = module.exports;
const receipt = { conversationId: "same_agent_chat", turnId: "turn_exact" };
const card = id => ({ id, taskId: id, source: "personal_task", summaryOnly: false, conversationId: receipt.conversationId });
const signal = () => new AbortController().signal;

test("task links retain personal compatibility and distinguish research details after reload", () => {
  for (const kind of ["personal", "research"]) {
    const target = workbenchTaskTarget(new URLSearchParams(workbenchTaskPath("task_1", kind).split("?")[1]));
    assert.equal(target.id, "task_1"); assert.equal(target.kind, kind); assert.equal(target.valid, true);
  }
  assert.equal(workbenchTaskTarget(new URLSearchParams("task=old_task")).kind, "personal");
  assert.equal(workbenchTaskTarget(new URLSearchParams("task=old_task&taskKind=untrusted")).valid, false);
  assert.throws(() => workbenchTaskPath("/not/an/id"));
});
test("same Agent conversation cannot select a different delegated turn or a summary-only task", async () => {
  const calls = [];
  const result = await findAssistantWorkTask(receipt, async (name, options) => {
    calls.push([name, options.params?.id]);
    if (name === "workbench") return { data: [card("old"), { ...card("hidden"), summaryOnly: true }, card("exact")], nextCursor: null };
    return { data: { id: options.params.id, summaryOnly: false, conversationId: receipt.conversationId, turnId: options.params.id === "exact" ? receipt.turnId : "another_turn" } };
  }, signal());
  assert.equal(result, "exact"); assert.equal(calls.some(([, id]) => id === "hidden"), false);
});
test("an older exact task is found through actual cursor pages without matching by title", async () => {
  const cursors = [];
  const result = await findAssistantWorkTask(receipt, async (name, options) => {
    if (name === "personalWorkTask") return { data: { id: "old_exact", summaryOnly: false, ...receipt } };
    cursors.push(options.query.cursor);
    return options.query.cursor ? { data: [card("old_exact")], nextCursor: null } : { data: [{ ...card("other"), conversationId: "different_chat" }], nextCursor: "next_page" };
  }, signal());
  assert.equal(result, "old_exact"); assert.deepEqual(cursors, [undefined, "next_page"]);
});
test("revoked/deleted facts cannot become links, and read failures remain failures", async () => {
  const reader = async name => { if (name === "workbench") return { data: [card("deleted")], nextCursor: null }; throw { status: 404 }; };
  assert.equal(await findAssistantWorkTask(receipt, reader, signal()), undefined);
  await assert.rejects(findAssistantWorkTask(receipt, async () => { throw new Error("offline"); }, signal()), /offline/);
});
test("account/panel cancellation fences an already-returned task response", async () => {
  const controller = new AbortController();
  await assert.rejects(findAssistantWorkTask(receipt, async name => {
    if (name === "workbench") return { data: [card("exact")], nextCursor: null };
    controller.abort(); return { data: { id: "exact", summaryOnly: false, ...receipt } };
  }, controller.signal), error => error.name === "AbortError");
});
test("repeating cursors are bounded and never select unrelated work", async () => {
  let reads = 0;
  await assert.rejects(findAssistantWorkTask(receipt, async () => { reads++; return { data: [], nextCursor: "repeated" }; }, signal()), /尚未定位/);
  assert.equal(reads, 2);
});
