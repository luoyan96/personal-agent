import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";

async function load(file, imports = {}) {
  const source = await fs.readFile(new URL(`../src/research/${file}`, import.meta.url), "utf8");
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module, exports: module.exports, require: name => imports[name] });
  return module.exports;
}
const { isAddedAgent } = await load("agent-card-actions.ts");
const profiles = await load("agentStarterProfiles.ts");
const links = await load("agent-starter-links.ts", { "./agentStarterProfiles": profiles });
const { communityAgentBindings } = await load("community-agent-bindings.ts");
const starter = profiles.agentStarters[0];
const contact = { id: "synthetic_agent", displayName: starter.profile.displayName,
  identity: { kind: "personal_agent", ownerMemberId: "actor_A" },
  relationship: { status: "own" }, profile: { ...starter.profile, role: "specialist" }, allowedActions: ["chat", "edit_profile"] };

test("only actual own/accepted Agents get added-card actions; humans and pending/revoked relations do not", () => {
  assert.equal(isAddedAgent(), false);
  assert.equal(isAddedAgent(contact), true);
  for (const kind of ["personal_agent", "public_agent"]) {
    for (const status of ["own", "accepted", "none", "pending_outbound", "pending_inbound", "declined", "revoked"]) {
      assert.equal(isAddedAgent({ ...contact, identity: { kind }, relationship: { status } }), ["own", "accepted"].includes(status));
    }
  }
  assert.equal(isAddedAgent({ ...contact, identity: { kind: "human" } }), false);
});

test("added state does not manufacture chat permission or successful external connection", () => {
  const denied = { ...contact, allowedActions: [], agentRuntime: { callerAllowed: false, verification: "failed" } };
  assert.equal(isAddedAgent(denied), true);
  assert.equal(denied.allowedActions.includes("chat"), false);
});

test("known template keeps exact owned ID after renaming and editing; no profile overwrite", () => {
  const edited = { ...contact, displayName: "自定义文献助理", profile: { ...contact.profile, introduction: "合成修改介绍" } };
  assert.equal(profiles.findOwnedStarter([edited], starter, "actor_A"), undefined);
  assert.equal(profiles.findOwnedStarter([edited], starter, "actor_A", contact.id), edited);
  assert.equal(edited.profile.introduction, "合成修改介绍");
});

test("local ID hint cannot revive deleted, different-owner, non-own, human or coordinator contacts", () => {
  assert.equal(profiles.findOwnedStarter([], starter, "actor_A", contact.id), undefined);
  for (const changed of [
    { ...contact, identity: { kind: "personal_agent", ownerMemberId: "actor_B" } },
    { ...contact, identity: { kind: "human", memberId: "actor_A" } },
    { ...contact, relationship: { status: "revoked" } },
    { ...contact, profile: { ...contact.profile, role: "coordinator" } },
  ]) assert.equal(profiles.findOwnedStarter([changed], starter, "actor_A", contact.id), undefined);
});

test("fresh exact profile is reused without a hint; same name with changed body is not guessed", () => {
  assert.equal(profiles.findOwnedStarter([contact], starter, "actor_A"), contact);
  const changed = { ...contact, profile: { ...contact.profile, introduction: "另一个 Agent" } };
  assert.equal(profiles.findOwnedStarter([changed], starter, "actor_A"), undefined);
});

test("template hints persist per account and reject unknown keys, invalid types and broken storage", () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value) };
  links.writeStarterLinks("actor_A", { [starter.id]: contact.id, unknown: "secret", "paper-revision": 42 }, storage);
  assert.equal(links.readStarterLinks("actor_A", storage)[starter.id], contact.id);
  assert.deepEqual(Object.keys(links.readStarterLinks("actor_A", storage)), [starter.id]);
  assert.equal(Object.keys(links.readStarterLinks("actor_B", storage)).length, 0);
  assert.equal(Object.keys(links.readStarterLinks("", storage)).length, 0);
  for (const value of ["invalid", "null", "[]", "12"]) assert.equal(Object.keys(links.readStarterLinks("actor_A", { ...storage, getItem: () => value })).length, 0);
  assert.equal(Object.keys(links.readStarterLinks("actor_A", { getItem() { throw Error("blocked"); } })).length, 0);
  assert.doesNotThrow(() => links.writeStarterLinks("actor_A", {}, { setItem() { throw Error("blocked"); } }));
});

const entry = { installable: true, repository: "https://github.com/synthetic-lab/research", sourcePath: "skills/literature" };
const skill = { id: "skill_A", ownerId: "actor_A", owned: true, enabled: true, canCall: true,
  source: { kind: "github", label: entry.repository + " · " + entry.sourcePath, revision: "a".repeat(40) },
  settings: { enabled: true, boundAgentIds: [contact.id] } };
test("GitHub card becomes an Agent card only for an actual enabled private installation bound to a current owned Agent", () => {
  assert.equal(communityAgentBindings(entry, [skill], [contact], "actor_A")[0], contact);
  assert.equal(communityAgentBindings(entry, [skill], [contact], "actor_B").length, 0);
  assert.equal(communityAgentBindings({ ...entry, installable: false }, [skill], [contact], "actor_A").length, 0);
});
test("same name, another subskill, a local copy or unpinned source cannot imply the community Agent was added", () => {
  for (const source of [
    { ...skill.source, label: entry.repository + " · skills/another" },
    { ...skill.source, label: "https://github.com/other/research · skills/literature" },
    { ...skill.source, kind: "folder" }, { ...skill.source, revision: null },
  ]) assert.equal(communityAgentBindings(entry, [{ ...skill, source }], [contact], "actor_A").length, 0);
});
test("disabled/unbound/not-owned/not-callable Skill never grants a card chat action", () => {
  for (const value of [
    { ...skill, enabled: false }, { ...skill, owned: false }, { ...skill, ownerId: "actor_B" },
    { ...skill, canCall: false }, { ...skill, settings: null },
    { ...skill, settings: { ...skill.settings, enabled: false } },
    { ...skill, settings: { ...skill.settings, boundAgentIds: [] } },
  ]) assert.equal(communityAgentBindings(entry, [value], [contact], "actor_A").length, 0);
});
test("deleted, foreign, external or role/relationship-changed bound targets cannot become a community chat Agent", () => {
  assert.equal(communityAgentBindings(entry, [skill], [], "actor_A").length, 0);
  for (const target of [
    { ...contact, identity: { kind: "personal_agent", ownerMemberId: "actor_B" } },
    { ...contact, identity: { kind: "human" } }, { ...contact, agentRuntime: {} },
    { ...contact, profile: { ...contact.profile, role: "coordinator" } },
    { ...contact, relationship: { status: "revoked" } },
  ]) assert.equal(communityAgentBindings(entry, [skill], [target], "actor_A").length, 0);
});
test("multiple actual bindings remain distinct while repeated installation rows cannot duplicate a target", () => {
  const second = { ...contact, id: "synthetic_second", displayName: "第二个助手" };
  const two = { ...skill, settings: { ...skill.settings, boundAgentIds: [contact.id, second.id] } };
  assert.equal(communityAgentBindings(entry, [two, two], [contact, second], "actor_A").length, 2);
});
