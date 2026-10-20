import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
async function load(file, imports = {}) {
  const source = await fs.readFile(
    new URL(`../src/research/${file}`, import.meta.url),
    "utf8",
  );
  const module = { exports: {} };
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      module,
      exports: module.exports,
      require: (name) => imports[name],
      Set,
      Map,
      Error,
    },
  );
  return module.exports;
}
const profiles = await load("agentStarterProfiles.ts");
const { prepareLibraryAgent, sameCollectionIds } = await load("library-agent.ts", {
  "./agentStarterProfiles": profiles,
});
const contact = {
  id: "synthetic_library_agent",
  displayName: profiles.libraryAgentStarter.profile.displayName,
  identity: { kind: "personal_agent", ownerMemberId: "actor_A" },
  relationship: { status: "own" },
  profile: { ...profiles.libraryAgentStarter.profile, role: "specialist" },
};
function fixture({ contacts = [], version = 1, ids = [], failBind = false } = {}) {
  const calls = [],
    state = { contacts, version, ids, failBind, current: true },
    prepared = [];
  const api = async (name, options) => {
    calls.push([name, options]);
    if (name === "chatContacts") return { data: state.contacts };
    if (name === "createPersonalAgent") {
      state.contacts = [contact];
      return { data: contact };
    }
    if (name === "agentResearchCollections")
      return {
        data: {
          agentId: contact.id,
          version: state.version,
          collectionIds: state.ids,
          collections: [],
        },
      };
    if (name === "bindAgentResearchCollections") {
      if (state.failBind) {
        state.failBind = false;
        throw Error("connection lost");
      }
      state.ids = options.body.collectionIds;
      state.version++;
      return {
        data: {
          agentId: contact.id,
          version: state.version,
          collectionIds: state.ids,
          collections: [],
        },
      };
    }
    throw Error("unexpected API");
  };
  const run = (overrides) =>
    prepareLibraryAgent({
      api,
      actorId: "actor_A",
      collectionIds: ["collection_A"],
      signal: new AbortController().signal,
      isCurrent: () => state.current,
      onPrepared: (agent, bindings) => prepared.push({ agent, bindings }),
      ...overrides,
    });
  return { state, calls, prepared, run };
}
test("explicit preparation creates one owned Agent and binds only the selected collections", async () => {
  const f = fixture();
  const result = await f.run();
  assert.equal(result.agent.id, contact.id);
  assert.deepEqual(f.state.ids, ["collection_A"]);
  assert.deepEqual(
    f.calls.map((c) => c[0]),
    [
      "chatContacts",
      "createPersonalAgent",
      "agentResearchCollections",
      "bindAgentResearchCollections",
    ],
  );
});
test("failed binding preserves the created Agent and retry reuses it", async () => {
  const f = fixture({ failBind: true });
  await assert.rejects(f.run(), /connection lost/);
  const known = f.prepared.at(-1);
  await f.run(known);
  assert.equal(f.calls.filter((c) => c[0] === "createPersonalAgent").length, 1);
});
test("newer binding scope cannot be overwritten by a stale form or repeated retry", async () => {
  const f = fixture({ contacts: [contact], version: 3, ids: ["other_device"] });
  const old = { agentId: contact.id, version: 2, collectionIds: [], collections: [] };
  await assert.rejects(f.run({ agent: contact, bindings: old }), /其他地方更新/);
  await assert.rejects(f.run({ agent: contact, bindings: old }), /其他地方更新/);
  assert.equal(f.prepared.length, 0);
  assert.equal(
    f.calls.some((c) => c[0] === "bindAgentResearchCollections"),
    false,
  );
});
test("an acknowledged same scope is reusable after a lost response without another write", async () => {
  const f = fixture({ contacts: [contact], version: 3, ids: ["collection_A"] });
  await f.run({ agent: contact, bindings: { agentId: contact.id, version: 2 } });
  assert.equal(
    f.calls.some((c) => c[0] === "bindAgentResearchCollections"),
    false,
  );
});
test("missing ownership, external replacement and cancellation cannot create or bind", async () => {
  for (const changed of [
    undefined,
    { ...contact, agentRuntime: { verification: "passed" } },
    { ...contact, identity: { kind: "personal_agent", ownerMemberId: "actor_B" } },
  ]) {
    const f = fixture({ contacts: changed ? [changed] : [] });
    await assert.rejects(f.run({ agent: contact }), /状态已变化/);
    assert.equal(f.calls.length, 1);
  }
  const f = fixture();
  f.state.current = false;
  assert.equal(await f.run(), undefined);
  assert.equal(f.calls.length, 0);
  const g = fixture();
  const original = g.run;
  await original({ isCurrent: () => g.calls.length === 0 });
  assert.equal(g.calls.length, 1);
});
test("a newly discovered existing scope requires review; empty selection deliberately unbinds", async () => {
  const f = fixture({ contacts: [contact], ids: ["existing"] });
  await assert.rejects(f.run(), /其他地方更新/);
  await f.run({
    agent: contact,
    bindings: { agentId: contact.id, version: 1 },
    collectionIds: [],
  });
  assert.deepEqual(f.state.ids, []);
  assert.equal(sameCollectionIds(["a", "b"], ["b", "a"]), true);
  assert.equal(sameCollectionIds(["a", "a"], ["a", "b"]), false);
});
