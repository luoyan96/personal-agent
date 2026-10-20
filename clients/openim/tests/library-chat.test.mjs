import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
import ts from "typescript";
async function load(file, imports = {}) {
  const module = { exports: {} },
    source = await fs.readFile(
      new URL(`../src/research/${file}`, import.meta.url),
      "utf8",
    );
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
      Number,
      JSON,
    },
  );
  return module.exports;
}
const profiles = await load("agentStarterProfiles.ts"),
  helpers = await load("library-agent.ts", { "./agentStarterProfiles": profiles });
const { sendLibraryMessage, readLibraryIntent } = await load("library-chat.ts", {
  "./library-agent": helpers,
});
const agent = {
  id: "agent_library",
  displayName: profiles.libraryAgentStarter.profile.displayName,
  identity: { kind: "personal_agent", ownerMemberId: "actor_A" },
  profile: { ...profiles.libraryAgentStarter.profile, role: "specialist" },
  relationship: { status: "own" },
};
const intent = {
  key: "synthetic_request_key_1234",
  text: "LX-713 的样本量是多少？",
  collectionIds: ["collection_A"],
};
function fixture() {
  const s = {
    contacts: [],
    ids: [],
    version: 1,
    calls: [],
    checkpoints: [],
    current: true,
    lost: false,
    writes: new Map(),
    group: {
      id: "direct_A",
      kind: "direct",
      ownerMemberId: "actor_A",
      members: [{ contactId: agent.id, status: "joined" }],
    },
  };
  const api = async (name, o) => {
    s.calls.push([name, o]);
    if (name === "chatContacts") return { data: s.contacts };
    if (name === "createPersonalAgent") {
      s.contacts = [agent];
      return { data: agent };
    }
    if (name === "agentResearchCollections")
      return {
        data: {
          agentId: agent.id,
          version: s.version,
          collectionIds: s.ids,
          collections: [],
        },
      };
    if (name === "bindAgentResearchCollections") {
      s.ids = o.body.collectionIds;
      s.version++;
      return {
        data: {
          agentId: agent.id,
          version: s.version,
          collectionIds: s.ids,
          collections: [],
        },
      };
    }
    if (name === "createDirectConversation" || name === "chatConversation")
      return { data: s.group };
    if (name === "agentChatMessage") {
      assert.equal(s.checkpoints.at(-1).conversationId, s.group.id);
      if (!s.writes.has(o.idempotencyKey))
        s.writes.set(o.idempotencyKey, {
          message: { id: "message_A", conversationId: s.group.id },
          turn: null,
        });
      if (s.lost) {
        s.lost = false;
        throw Error("lost response");
      }
      return { data: s.writes.get(o.idempotencyKey) };
    }
    throw Error(name);
  };
  const run = (overrides) =>
    sendLibraryMessage({
      api,
      actorId: "actor_A",
      intent,
      signal: new AbortController().signal,
      isCurrent: () => s.current,
      checkpoint: (v) => s.checkpoints.push(JSON.parse(JSON.stringify(v))),
      onPrepared() {},
      ...overrides,
    });
  return { s, run };
}
test("inline sending creates/reuses an owned Agent, saves explicit scope and checkpoints before the POST", async () => {
  const f = fixture(),
    result = await f.run();
  assert.equal(result.conversationId, "direct_A");
  assert.deepEqual(f.s.ids, intent.collectionIds);
  const create = f.s.calls.find((c) => c[0] === "createPersonalAgent");
  assert.equal(create[1].idempotencyKey, "library-agent-" + intent.key);
  const send = f.s.calls.find((c) => c[0] === "agentChatMessage");
  assert.equal(send[1].idempotencyKey, intent.key);
  assert.equal(send[1].body.text, intent.text);
  assert.equal(send[1].body.continuous, true);
});
test("lost POST response replays the exact original message/key without creating or rebinding again", async () => {
  const f = fixture();
  f.s.lost = true;
  await assert.rejects(f.run(), /lost response/);
  const recovered = readLibraryIntent(JSON.stringify(f.s.checkpoints.at(-1))),
    before = f.s.calls.length;
  await f.run({ intent: recovered });
  assert.deepEqual(
    f.s.calls.slice(before).map((c) => c[0]),
    ["chatContacts", "chatConversation", "agentChatMessage"],
  );
  assert.equal(f.s.writes.size, 1);
});
test("recovery cannot send to a group, wrong owner, missing/external/foreign Agent", async () => {
  for (const change of [
    (s) => {
      s.group.kind = "group";
    },
    (s) => {
      s.group.ownerMemberId = "actor_B";
    },
    (s) => {
      s.contacts = [];
    },
    (s) => {
      s.contacts = [{ ...agent, agentRuntime: {} }];
    },
    (s) => {
      s.contacts = [
        { ...agent, identity: { kind: "personal_agent", ownerMemberId: "actor_B" } },
      ];
    },
  ]) {
    const f = fixture();
    f.s.contacts = [agent];
    change(f.s);
    await assert.rejects(
      f.run({ intent: { ...intent, agentId: agent.id, conversationId: "direct_A" } }),
    );
    assert.equal(
      f.s.calls.some((c) => c[0] === "agentChatMessage"),
      false,
    );
  }
});
test("cancelled account/panel or an unsaved checkpoint cannot reach the message POST", async () => {
  const f = fixture();
  f.s.current = false;
  assert.equal(await f.run(), undefined);
  assert.equal(f.s.calls.length, 0);
  const g = fixture();
  await assert.rejects(
    g.run({
      checkpoint() {
        throw Error("storage unavailable");
      },
    }),
    /storage unavailable/,
  );
  assert.equal(
    g.s.calls.some((c) => c[0] === "agentChatMessage"),
    false,
  );
  const h = fixture();
  await h.run({ isCurrent: () => h.s.calls.length === 0 });
  assert.equal(h.s.calls.length, 1);
});
test("recovery snapshot validation preserves exact text and excludes malformed/oversized records", () => {
  assert.equal(readLibraryIntent(JSON.stringify(intent)).text, intent.text);
  for (const value of [
    null,
    "[]",
    "null",
    "bad",
    JSON.stringify({ ...intent, key: "short" }),
    JSON.stringify({ ...intent, text: "x".repeat(8001) }),
    JSON.stringify({ ...intent, collectionIds: ["a", "a"] }),
    JSON.stringify({ ...intent, bindingVersion: 0 }),
    JSON.stringify({ ...intent, conversationId: "direct_A" }),
  ])
    assert.equal(readLibraryIntent(value), undefined);
});
