import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const run = await mkdtemp(path.join(tmpdir(), "desktop-send-recovery-"));
await esbuild.build({
  entryPoints: [
    new URL("../src/research/api.ts", import.meta.url).pathname.replace(
      /^\/(\w:)/,
      "$1",
    ),
  ],
  outfile: path.join(run, "api.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  define: { "import.meta.env.VITE_RESEARCH_MODE": '"true"' },
  plugins: [
    {
      name: "isolated-profile",
      setup(build) {
        build.onResolve({ filter: /^@\/utils\/storage$/ }, () => ({
          path: "profile",
          namespace: "synthetic",
        }));
        build.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({
          contents: "export async function clearIMProfile() { globalThis.__profileClears = (globalThis.__profileClears || 0) + 1; }",
        }));
      },
    },
  ],
});
const api = require(path.join(run, "api.cjs"));
const session = {
  data: {
    member: {
      id: "synthetic_actor",
      labId: "synthetic_lab",
      displayName: "Synthetic",
      publicExpertise: [],
      availability: null,
      visibleCommitments: [],
      version: 1,
    },
    csrfToken: "synthetic_csrf",
    expiresAt: "2027-10-07T00:00:00.000Z",
    isLabManager: false,
    spaceKind: "personal",
  },
};
const acknowledged = {
  data: {
    turn: null,
    message: {
      id: "synthetic_message",
      conversationId: "synthetic_chat",
      sequence: 1,
      senderContactId: "synthetic_contact",
      origin: "human",
      text: "合成需求",
      mentions: [],
      resources: [],
      actionIds: [],
      turnId: null,
      createdAt: "2026-10-07T00:00:00.000Z",
    },
  },
};
const send = (signal) =>
  api.researchApi("agentChatMessage", {
    params: { id: "synthetic_chat" },
    body: { text: "合成需求", continuous: true },
    idempotencyKey: "synthetic-original-key",
    signal,
  });
const flush = async () => {
  for (let n = 0; n < 12; n++) await Promise.resolve();
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
function isolated(t, fetch) {
  api.clearResearchSession();
  const previous = globalThis.fetch;
  globalThis.fetch = fetch;
  t.after(() => {
    globalThis.fetch = previous;
    api.clearResearchSession();
  });
}

test("a missing session response is bounded and never dispatches the mutation", async (t) => {
  let signal,
    requests = 0;
  isolated(t, async (_, options) => {
    signal = options.signal;
    requests++;
    return new Promise(() => {});
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const promise = send();
  const rejected = assert.rejects(promise, (error) => error.code === "REQUEST_TIMEOUT");
  await flush();
  t.mock.timers.tick(30001);
  await rejected;
  assert.equal(requests, 1);
  assert.equal(signal.aborted, true);
});

test("cancelling session preparation releases immediately and a late session cannot send", async (t) => {
  let resolve,
    signal,
    requests = 0;
  isolated(t, async (_, options) => {
    requests++;
    signal = options.signal;
    return new Promise((r) => {
      resolve = r;
    });
  });
  const controller = new AbortController();
  const rejected = assert.rejects(send(controller.signal), { name: "AbortError" });
  await flush();
  controller.abort();
  await rejected;
  assert.equal(signal.aborted, true);
  resolve(json(session));
  await flush();
  assert.equal(requests, 1);
});

test("response headers without a complete body do not leave sending forever", async (t) => {
  let signal;
  isolated(t, async (url, options) => {
    if (url.endsWith("/auth/session")) return json(session);
    signal = options.signal;
    return { ok: true, status: 201, json: () => new Promise(() => {}) };
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const rejected = assert.rejects(send(), (error) => error.code === "REQUEST_TIMEOUT");
  await flush();
  t.mock.timers.tick(30001);
  await rejected;
  assert.equal(signal.aborted, true);
});

test("an ambiguous timeout preserves the original body and key for an acknowledged retry", async (t) => {
  const calls = [];
  let lateReply;
  isolated(t, async (url, options) => {
    if (url.endsWith("/auth/session")) return json(session);
    calls.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    if (calls.length === 1)
      return new Promise((resolve) => {
        lateReply = resolve;
      });
    return json(acknowledged, 201);
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const rejected = assert.rejects(send(), (error) => error.code === "REQUEST_TIMEOUT");
  await flush();
  t.mock.timers.tick(30001);
  await rejected;
  lateReply(json(acknowledged, 201));
  await flush();
  const reply = await send();
  assert.equal(reply.data.message.id, "synthetic_message");
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].key, "synthetic-original-key");
});

test("a real service error is retained and a normal acknowledged message succeeds", async (t) => {
  let count = 0;
  isolated(t, async (url) => {
    if (url.endsWith("/auth/session")) return json(session);
    if (++count === 1)
      return json(
        {
          error: {
            code: "SERVICE_UNAVAILABLE",
            message: "Synthetic failure",
            requestId: "synthetic_request",
          },
        },
        503,
      );
    return json(acknowledged, 201);
  });
  await assert.rejects(send(), (error) => error.code === "SERVICE_UNAVAILABLE");
  assert.equal((await send()).data.message.text, "合成需求");
});

test("an already cancelled operation cannot start even session lookup", async (t) => {
  let calls = 0;
  isolated(t, async () => {
    calls++;
    return json(session);
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(send(controller.signal), { name: "AbortError" });
  assert.equal(calls, 0);
});

test("switching accounts cancels old session preparation before it can send under the new cookie", async (t) => {
  let release, calls = 0;
  isolated(t, async () => {
    calls++;
    return new Promise(resolve => { release = resolve; });
  });
  const old = send();
  const rejected = assert.rejects(old, { name: "AbortError" });
  await flush();
  api.clearResearchSession();
  release(json(session));
  await rejected;
  await flush();
  assert.equal(calls, 1, "old mutation must never be dispatched");
});

test("a late session body cannot replace the new actor's CSRF token", async (t) => {
  let release, first = true;
  const tokens = [];
  isolated(t, async (_url, options) => {
    if (first) {
      first = false;
      return { ok: true, status: 200, json: () => new Promise(resolve => { release = resolve; }) };
    }
    if (options.method === "GET") return json({ data: { ...session.data, csrfToken: "new_actor_csrf" } });
    tokens.push(options.headers["X-CSRF-Token"]);
    return json(acknowledged, 201);
  });
  const rejected = assert.rejects(api.researchApi("session"), { name: "AbortError" });
  await flush();
  api.clearResearchSession();
  await api.researchApi("session");
  release(session);
  await rejected;
  await flush();
  await send();
  assert.deepEqual(tokens, ["new_actor_csrf"]);
});

test("an old 401 cannot expire a newly verified session or remove its IM profile", async (t) => {
  let release, oldRead = false, expirations = 0;
  const previousWindow = globalThis.window;
  globalThis.window = { dispatchEvent: () => { expirations++; } };
  globalThis.__profileClears = 0;
  t.after(() => { globalThis.window = previousWindow; delete globalThis.__profileClears; });
  isolated(t, async () => {
    if (oldRead) { oldRead = false; return new Promise(resolve => { release = resolve; }); }
    return json(session);
  });
  await api.researchApi("session");
  oldRead = true;
  const rejected = assert.rejects(api.researchApi("session"), { name: "AbortError" });
  await flush();
  api.clearResearchSession();
  await api.researchApi("session");
  release(json({ error: { code: "UNAUTHENTICATED", message: "synthetic", requestId: "synthetic" } }, 401));
  await rejected;
  await flush();
  assert.equal(expirations, 0);
  assert.equal(globalThis.__profileClears, 0);
});

test("a real current 401 expires once, cancels sibling reads, and retains its service error", async (t) => {
  let sibling = false, release, expirations = 0;
  const previousWindow = globalThis.window;
  globalThis.window = { dispatchEvent: () => { expirations++; } };
  globalThis.__profileClears = 0;
  t.after(() => { globalThis.window = previousWindow; delete globalThis.__profileClears; });
  isolated(t, async () => {
    if (sibling) return new Promise(resolve => { release = resolve; });
    return json(session);
  });
  await api.researchApi("session");
  sibling = true;
  const cancelled = assert.rejects(api.researchApi("session"), { name: "AbortError" });
  await flush();
  globalThis.fetch = async () => json({ error: { code: "UNAUTHENTICATED", message: "synthetic", requestId: "synthetic" } }, 401);
  await assert.rejects(api.researchApi("session"), error => error.code === "UNAUTHENTICATED" && error.status === 401);
  await cancelled;
  release(json(session));
  await flush();
  assert.equal(expirations, 1);
  assert.equal(globalThis.__profileClears, 1);
});

test("an explicit login invalidates old reads even without a preceding logout", async (t) => {
  let release, signal;
  isolated(t, async (url, options) => {
    if (url.endsWith("/auth/login")) return json({ data: session.data.member });
    signal = options.signal;
    return new Promise(resolve => { release = resolve; });
  });
  const rejected = assert.rejects(api.researchApi("session"), { name: "AbortError" });
  await flush();
  const login = await api.researchApi("login", { body: { username: "synthetic_new", password: "12345678" } });
  await rejected;
  assert.equal(login.data.id, session.data.member.id);
  assert.equal(signal.aborted, true);
  release(json(session));
  await flush();
});

test("reset before the dispatch microtask cancels without any network request", async (t) => {
  let calls = 0;
  isolated(t, async () => { calls++; return json(session); });
  const rejected = assert.rejects(api.researchApi("session"), { name: "AbortError" });
  api.clearResearchSession();
  await rejected;
  assert.equal(calls, 0);
});

test("a late mutation acknowledgement is discarded and never treated as a new account's send", async (t) => {
  let release, sent = 0;
  isolated(t, async (url) => {
    if (url.endsWith("/auth/session")) return json(session);
    sent++;
    return new Promise(resolve => { release = resolve; });
  });
  const rejected = assert.rejects(send(), { name: "AbortError" });
  await flush();
  api.clearResearchSession();
  release(json(acknowledged, 201));
  await rejected;
  await flush();
  assert.equal(sent, 1, "cancellation must not automatically retry an uncertain mutation");
});
