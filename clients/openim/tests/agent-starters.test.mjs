import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { routes } from "@research-agent-platform/contracts";
import { agentStarters, libraryAgentStarter, findOwnedStarter } from "../src/research/agentStarterProfiles.ts";
const previous = JSON.parse(readFileSync(new URL("fixtures/agent-starters-0.10.38.json", import.meta.url), "utf8"));
const previousConversation = JSON.parse(readFileSync(new URL("fixtures/agent-starters-0.10.40.json", import.meta.url), "utf8"));
const contact = (profile, owner = "owner") => ({
  id: "agent_existing", displayName: profile.displayName,
  identity: { kind: "personal_agent", ownerMemberId: owner },
  profile: { ...profile, role: "specialist" }, relationship: { status: "own" },
});
test("all conversational templates fit the existing creation API without adding permissions or fields", () => {
  for (const starter of agentStarters)
    assert.equal(routes.createPersonalAgent.request.shape.body.safeParse(starter.profile).success, true, starter.id);
});
test("all seven previous templates reuse the same owned Agent without rewriting its profile", () => {
  assert.equal(agentStarters.length, previous.starters.length);
  for (const prior of previous.starters) {
    const starter = agentStarters.find((item) => item.id === prior.id);
    const existing = contact(prior.profile), before = structuredClone(existing);
    assert.equal(findOwnedStarter([existing], starter, "owner"), existing);
    assert.deepEqual(existing, before);
  }
  assert.equal(agentStarters.find((item) => item.id === "research-library"), libraryAgentStarter);
});
test("colleague profiles preserve every 0.10.40 Agent and its edits without generating a duplicate", () => {
  for (const prior of previousConversation.starters) {
    const starter = agentStarters.find((item) => item.id === prior.id);
    const existing = contact(prior.profile), before = structuredClone(existing);
    assert.equal(findOwnedStarter([existing], starter, "owner"), existing);
    assert.deepEqual(existing, before);
    assert.equal(findOwnedStarter([existing], starter, "different-owner"), undefined);
  }
});
test("new templates reuse; edited profiles require an owned remembered link and never match another account", () => {
  for (const starter of agentStarters) {
    const fresh = contact(starter.profile);
    assert.equal(findOwnedStarter([fresh], starter, "owner"), fresh);
    const edited = contact({ ...starter.profile, personality: "用户自己的交流偏好" });
    assert.equal(findOwnedStarter([edited], starter, "owner"), undefined);
    assert.equal(findOwnedStarter([edited], starter, "owner", edited.id), edited);
    assert.equal(findOwnedStarter([edited], starter, "other", edited.id), undefined);
    assert.equal(findOwnedStarter([contact(starter.profile, "other")], starter, "owner"), undefined);
  }
});
