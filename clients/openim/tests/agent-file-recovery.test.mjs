import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const run = await mkdtemp(path.join(tmpdir(), "agent-file-recovery-"));
const client = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(run, "recovery.cjs");
await esbuild.build({
  stdin: {
    contents: `export * from './src/research/api';
      export * from './src/research/agent-file-errors';
      export { FileFetchError } from './src/research/firstPartyFile';`,
    resolveDir: client,
  },
  outfile: output,
  bundle: true,
  platform: "node",
  format: "cjs",
  define: {
    "import.meta.env.VITE_RESEARCH_MODE": '"true"',
    "import.meta.env.VITE_RESEARCH_FILE_ORIGIN": "undefined",
  },
  plugins: [{
    name: "isolated-profile",
    setup(build) {
      build.onResolve({ filter: /^@\/utils\/storage$/ }, () => ({
        path: "profile", namespace: "synthetic",
      }));
      build.onLoad({ filter: /.*/, namespace: "synthetic" }, () => ({
        contents: "export async function clearIMProfile() {}",
      }));
    },
  }],
});
const api = require(output);
const session = { data: {
  member: { id: "synthetic_actor", labId: "synthetic_lab", displayName: "Synthetic",
    publicExpertise: [], availability: null, visibleCommitments: [], version: 1 },
  csrfToken: "synthetic_csrf", expiresAt: "2027-10-12T00:00:00.000Z",
  isLabManager: false, spaceKind: "personal",
} };
const accepted = { data: { turn: null, message: {
  id: "synthetic_file_message", conversationId: "synthetic_chat", sequence: 1,
  senderContactId: "synthetic_contact", origin: "human", text: "合成资料",
  mentions: [], resources: [], actionIds: [], turnId: null,
  createdAt: "2026-10-12T00:00:00.000Z",
} } };
const send = () => api.researchApi("agentFileMessage", {
  params: { id: "synthetic_chat" },
  body: { filename: "synthetic.txt", mediaType: "text/plain",
    contentBase64: Buffer.from("Synthetic research notes.").toString("base64") },
  idempotencyKey: "synthetic-original-file-key",
});
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { "Content-Type": "application/json" },
});
const flush = async () => { for (let n = 0; n < 20; n++) await Promise.resolve(); };
function isolated(t, fetch) {
  api.clearResearchSession();
  const original = globalThis.fetch;
  globalThis.fetch = fetch;
  t.after(() => { globalThis.fetch = original; api.clearResearchSession(); });
}

test("a timed-out file acknowledgement remains retryable with the exact bytes and original key", async (t) => {
  const requests = [];
  let signal, lateReply;
  isolated(t, async (url, options) => {
    if (url.endsWith("/auth/session")) return json(session);
    requests.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    signal = options.signal;
    if (requests.length === 1) return new Promise(resolve => { lateReply = resolve; });
    return json(accepted, 201);
  });
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const rejected = assert.rejects(send(), error =>
    error.code === "REQUEST_TIMEOUT" && api.retryableAgentFileError(error));
  await flush();
  t.mock.timers.tick(120001);
  await rejected;
  assert.equal(signal.aborted, true);
  lateReply(json(accepted, 201));
  await flush();
  assert.equal((await send()).data.message.id, "synthetic_file_message");
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1], requests[0]);
});

test("an unreadable successful file response permits an acknowledged retry without changing the request", async (t) => {
  const requests = [];
  isolated(t, async (url, options) => {
    if (url.endsWith("/auth/session")) return json(session);
    requests.push({ body: options.body, key: options.headers["Idempotency-Key"] });
    return requests.length === 1
      ? new Response("not JSON", { status: 201 }) : json(accepted, 201);
  });
  await assert.rejects(send(), error =>
    error.code === "INVALID_RESPONSE" && api.retryableAgentFileError(error));
  assert.equal((await send()).data.message.id, "synthetic_file_message");
  assert.deepEqual(requests[1], requests[0]);
});

test("permanent file and authority failures stay non-retryable; retryable downloads retain their recovery", () => {
  for (const code of ["FILE_UNSUPPORTED", "FILE_ENCRYPTED", "FILE_NO_TEXT", "NOT_FOUND", "FORBIDDEN"])
    assert.equal(api.retryableAgentFileError(new api.ResearchApiError(code, 400, code)), false);
  assert.equal(api.retryableAgentFileError(new DOMException("cancelled", "AbortError")), false);
  assert.equal(api.retryableAgentFileError(new api.FileFetchError("temporary", true)), true);
  assert.equal(api.retryableAgentFileError(new api.FileFetchError("unsupported", false)), false);
});
