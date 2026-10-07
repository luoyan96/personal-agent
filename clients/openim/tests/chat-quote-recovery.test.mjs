import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const run = await mkdtemp(path.join(tmpdir(), "chat-quote-recovery-"));
const output = path.join(run, "outbox.cjs");
await esbuild.build({
  entryPoints: [
    fileURLToPath(new URL("../src/research/chat-outbox.ts", import.meta.url)),
  ],
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "isolated-actor",
      setup(build) {
        // Read the production chat schemas directly; concurrent workspace builds
        // must not leave this focused quote test dependent on a partial dist tree.
        build.onResolve({ filter: /^@research-agent-platform\/contracts$/ }, () => ({
          path: "chat-contracts",
          namespace: "fixture",
        }));
        build.onLoad({ filter: /^chat-contracts$/, namespace: "fixture" }, () => ({
          contents: 'export { chatRoutes as routes } from "production-chat-contract";',
        }));
        build.onResolve({ filter: /^production-chat-contract$/ }, () => ({
          path: fileURLToPath(
            new URL("../../../packages/contracts/src/chat.ts", import.meta.url),
          ),
        }));
        build.onResolve({ filter: /^\.\/store$/ }, () => ({
          path: "actor",
          namespace: "fixture",
        }));
        build.onLoad({ filter: /^actor$/, namespace: "fixture" }, () => ({
          contents: `
      const state = { generation: 7, actor: { member: { id: 'synthetic_actor' } }, sessionActorId: 'synthetic_actor' };
      export const useResearchStore = { getState: () => state, subscribe: () => () => {} };
    `,
        }));
      },
    },
  ],
});
const source = {
  clientMsgID: "synthetic_source",
  contentType: 101,
  senderNickname: "Synthetic",
  textElem: { content: "original message" },
};
const quote = {
  clientMsgID: "synthetic_quote",
  contentType: 114,
  quoteElem: { text: "reply", quoteMessage: source },
};
const submission = {
  id: "synthetic_original_key",
  conversationID: "synthetic_conversation",
  recvID: "synthetic_peer",
  groupID: "",
  html: "reply",
  text: "reply",
  quoteMessage: source,
  nativeMessage: quote,
  state: "sending",
};
function restore(items, memberId = "synthetic_actor") {
  const storage = new Map([
    [
      "research-chat-pending-v1",
      JSON.stringify({ version: 1, memberId, storedAt: Date.now(), items, drafts: [] }),
    ],
  ]);
  globalThis.sessionStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  };
  delete require.cache[output];
  return require(output).useChatOutbox.getState();
}
test("an acknowledged-or-uncertain quoted send restores paused with its original SDK ID and quote source", () => {
  const state = restore([submission]);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].state, "paused");
  assert.equal(state.items[0].generation, 7);
  assert.equal(state.items[0].id, submission.id);
  assert.deepEqual(state.items[0].nativeMessage, quote);
  assert.deepEqual(state.items[0].quoteMessage, source);
});
test("a stored quoted send cannot restore with a substituted source or different reply", () => {
  assert.equal(
    restore([
      {
        ...submission,
        nativeMessage: {
          ...quote,
          quoteElem: {
            ...quote.quoteElem,
            quoteMessage: { ...source, clientMsgID: "other_source" },
          },
        },
      },
    ]).items.length,
    0,
  );
  const state = restore([
    {
      ...submission,
      nativeMessage: {
        ...quote,
        quoteElem: { ...quote.quoteElem, text: "changed reply" },
      },
    },
  ]);
  assert.equal(state.items.length, 0);
  assert.ok(state.notice);
});
test("another actor's pending quote cannot be loaded or automatically sent", () => {
  assert.equal(restore([submission], "another_actor").items.length, 0);
});
