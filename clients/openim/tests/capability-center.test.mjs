import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
import { ContactProfileInput } from "@research-agent-platform/contracts";
async function load(file, substitutes = {}, globals = {}) {
  const source = await fs.readFile(new URL(`../src/research/${file}`, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module, exports: module.exports, require: name => substitutes[name], URL, Promise, Error, ...globals });
  return module.exports;
}
const helpers = await load("capability-center.ts");
const profiles = await load("agentStarterProfiles.ts");
const agent = { identity: { kind: "personal_agent" }, availability: { status: "available", reason: null }, allowedActions: ["chat"], relationship: { status: "own" } };
test("a contact action cannot claim model availability when credentials or owner authorization are missing", () => {
  assert.equal(helpers.capabilityStatus({ ...agent, availability: { status: "unavailable", reason: "missing_credentials" } }), "模型未配置");
  assert.equal(helpers.capabilityStatus({ ...agent, availability: { status: "unavailable", reason: "owner_authorization_required" } }), "需要主人授权");
  assert.equal(helpers.capabilityStatus(agent), "站内文字对话可用");
});
test("external testing does not grant calling permission and descriptions cannot grant tools", () => {
  assert.equal(helpers.capabilityStatus({ ...agent, agentRuntime: { verification: "passed", callerAllowed: false } }), "外部服务 · 未获准调用");
  assert.equal(helpers.capabilityStatus({ ...agent, agentRuntime: { verification: "unverified", callerAllowed: true } }), "外部文字服务 · 每次授权");
  const contact = { displayName: "代码助手", profile: { introduction: "分析统计数据", capabilityDescription: "运行脚本" } };
  assert.equal(helpers.capabilityCategory(contact), "数据与代码");
  assert.match(helpers.capabilityInput(contact), /尚未说明/);
});
test("input extraction uses a configured input and does not invent one from output", () => {
  assert.equal(helpers.capabilityInput({ profile: { capabilityDescription: "输入：论文摘要。输出：讨论提纲。" } }), "论文摘要。");
  assert.match(helpers.capabilityInput({ profile: { capabilityDescription: "输出：详细报告" } }), /尚未说明/);
});
test("six research starter configurations stay valid editable text profiles with explicit execution limits", () => {
  assert.equal(profiles.agentStarters.length, 6);
  for (const starter of profiles.agentStarters) assert.equal(ContactProfileInput.safeParse(starter.profile).success, true);
  for (const id of ["figure-planning", "data-reproduction", "lab-meeting"]) {
    const starter = profiles.agentStarters.find(item => item.id === id);
    assert.match(starter.boundary, /仅|不执行|不生成/);
    assert.match(starter.profile.capabilityDescription, /不生成|不执行|没有脚本执行/);
  }
  assert.equal(helpers.capabilityCategory({ displayName: "图表构思助手", profile: profiles.agentStarters.find(item => item.id === "figure-planning").profile }), "图表与可视化");
});
// Original-download transport is covered by library-original-download.test.mjs.
const library = await load("research-library-api.ts");

test("empty and oversized uploads fail before reading local bytes; unknown assets remain opaque originals", async () => {
  await assert.rejects(library.fileAsBase64({ size: 0 }), /非空/);
  await assert.rejects(library.fileAsBase64({ size: 10485761 }), /10 MiB/);
  assert.equal(library.researchFileMediaType({ name: "research.py", type: "" }), "application/octet-stream");
  assert.equal(library.researchFileMediaType({ name: "NOTES.MD", type: "" }), "text/markdown");
});
