import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const run = await mkdtemp(path.join(tmpdir(), "task-artifact-download-"));
await esbuild.build({
  entryPoints: ["api", "task-artifact-download"].map((name) =>
    fileURLToPath(new URL(`../src/research/${name}.ts`, import.meta.url)),
  ),
  outdir: run,
  outExtension: { ".js": ".cjs" },
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
          contents: "export async function clearIMProfile() {}",
        }));
      },
    },
  ],
});
const api = require(path.join(run, "api.cjs"));
const { readTaskArtifact } = require(path.join(run, "task-artifact-download.cjs"));
const payload = new TextEncoder().encode("合成课题材料\n第一版原文。");
const artifact = {
  id: "artifact_synthetic",
  taskId: "task_synthetic",
  filename: "合成课题.txt",
  mediaType: "text/plain",
  size: payload.byteLength,
  sha256: createHash("sha256").update(payload).digest("hex"),
  version: 1,
  accessStatus: "available",
};
function isolated(t, fetch) {
  const previous = globalThis.fetch;
  api.clearResearchSession();
  globalThis.fetch = fetch;
  t.after(() => {
    globalThis.fetch = previous;
    api.clearResearchSession();
  });
}
const download = (signal) =>
  api.researchApi("content", { params: { id: "artifact_synthetic" }, signal });

test("authorized task content is returned as original bytes through the current app session", async (t) => {
  let request;
  isolated(t, async (url, options) => {
    request = { url, ...options };
    return new Response(payload, {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  });
  assert.deepEqual(await download(), payload);
  assert.equal(request.url, "/api/v1/artifacts/artifact_synthetic/content");
  assert.equal(request.credentials, "same-origin");
});

test("an OK HTML login/proxy page cannot become a downloaded research file", async (t) => {
  isolated(
    t,
    async () =>
      new Response("<html>Login</html>", { headers: { "content-type": "text/html" } }),
  );
  await assert.rejects(download(), (error) => error.code === "INVALID_RESPONSE");
});

test("a revoked task material remains a service error, never file bytes", async (t) => {
  isolated(
    t,
    async () =>
      new Response(
        JSON.stringify({
          error: { code: "NOT_FOUND", message: "synthetic", requestId: "synthetic" },
        }),
        { status: 404 },
      ),
  );
  await assert.rejects(
    download(),
    (error) => error.status === 404 && error.code === "NOT_FOUND",
  );
});

test("oversized binary responses are rejected with and without a declared length", async (t) => {
  let cancelled = false;
  isolated(
    t,
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(10485761));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": "text/plain" } },
      ),
  );
  await assert.rejects(download(), (error) => error.code === "INVALID_RESPONSE");
  assert.equal(cancelled, true);
  globalThis.fetch = async () =>
    new Response(payload, {
      headers: { "content-type": "text/plain", "content-length": "10485761" },
    });
  await assert.rejects(download(), (error) => error.code === "INVALID_RESPONSE");
});

test("cancelling a stalled binary body releases the request and cancels its reader", async (t) => {
  let started,
    cancelled = false;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  isolated(t, async () => {
    started();
    return new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
      { headers: { "content-type": "application/pdf" } },
    );
  });
  const controller = new AbortController();
  const rejected = assert.rejects(download(controller.signal), { name: "AbortError" });
  await ready;
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort();
  await rejected;
  assert.equal(cancelled, true);
});

test("the selected immutable material version must match its full byte length and SHA256", async (t) => {
  isolated(
    t,
    async () => new Response(payload, { headers: { "content-type": "text/plain" } }),
  );
  const blob = await readTaskArtifact(artifact, new AbortController().signal);
  assert.equal(await blob.text(), new TextDecoder().decode(payload));
  await assert.rejects(
    readTaskArtifact({ ...artifact, size: 1 }, new AbortController().signal),
    /校验值/,
  );
  await assert.rejects(
    readTaskArtifact(
      { ...artifact, sha256: "a".repeat(64) },
      new AbortController().signal,
    ),
    /校验值/,
  );
});

test("known withdrawn material never starts a download request", async (t) => {
  let calls = 0;
  isolated(t, async () => {
    calls++;
    throw Error("must not fetch");
  });
  await assert.rejects(
    readTaskArtifact(
      { ...artifact, accessStatus: "revoked" },
      new AbortController().signal,
    ),
    /已撤回/,
  );
  assert.equal(calls, 0);
});
