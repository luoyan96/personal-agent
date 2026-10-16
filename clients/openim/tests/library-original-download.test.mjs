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
const run = await mkdtemp(path.join(tmpdir(), "library-original-download-"));
await esbuild.build({
  entryPoints: [
    fileURLToPath(new URL("../src/research/research-library-api.ts", import.meta.url)),
  ],
  outfile: path.join(run, "library.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  plugins: [
    {
      name: "api-error-only",
      setup(build) {
        build.onResolve({ filter: /^\.\/api$/ }, () => ({
          path: "api",
          namespace: "fixture",
        }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({
          contents:
            "export class ResearchApiError extends Error { constructor(code,status,message) { super(message); this.code=code; this.status=status; } }",
        }));
      },
    },
  ],
});
const { readResearchFileBytes } = require(path.join(run, "library.cjs"));
const payload = new TextEncoder().encode("公开合成资料\n历史版本一，保留原始换行。\n");
const version = {
  version: 2,
  filename: "合成笔记.md",
  mediaType: "text/markdown",
  byteLength: payload.byteLength,
  sha256: createHash("sha256").update(payload).digest("hex"),
};
function mock(t, fn) {
  const before = globalThis.fetch;
  globalThis.fetch = fn;
  t.after(() => {
    globalThis.fetch = before;
  });
}
const response = (bytes = payload, headers = {}) =>
  new Response(bytes, {
    headers: { "content-type": "text/markdown; charset=utf-8", ...headers },
  });
const download = (signal, selected = version) =>
  readResearchFileBytes("source_synthetic", selected, signal);

test("downloads the selected immutable version with the app cookie and original UTF8 bytes", async (t) => {
  let request;
  mock(t, async (url, options) => {
    request = { url, ...options };
    return response();
  });
  const blob = await download();
  assert.equal(blob.type, "text/markdown");
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), payload);
  assert.equal(
    request.url,
    "/api/v1/research-library/files/source_synthetic/content?version=2",
  );
  assert.equal(request.credentials, "same-origin");
});
test("rejects corrupt and incomplete originals even with a successful HTTP status", async (t) => {
  mock(t, async () => response(new Uint8Array(payload.byteLength)));
  await assert.rejects(download(), /校验值/);
  globalThis.fetch = async () => response(payload.slice(1));
  await assert.rejects(download(), /校验值/);
});
test("rejects proxy HTML, missing type and impossible declared size before saving", async (t) => {
  mock(t, async () => response(payload, { "content-type": "text/html" }));
  await assert.rejects(download(), /响应/);
  globalThis.fetch = async () => {
    const r = response();
    r.headers.delete("content-type");
    return r;
  };
  await assert.rejects(download(), /响应/);
  globalThis.fetch = async () => response(payload, { "content-length": "10485761" });
  await assert.rejects(download(), /响应/);
});
test("an unbounded streaming response is stopped as soon as it exceeds this version size", async (t) => {
  let cancelled = false;
  mock(
    t,
    async () =>
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(new Uint8Array(version.byteLength + 1));
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": version.mediaType } },
      ),
  );
  await assert.rejects(download(), /校验值/);
  assert.equal(cancelled, true);
});
test("stopping a stalled response cancels the reader and releases the request", async (t) => {
  let started,
    cancelled = false;
  const ready = new Promise((r) => {
    started = r;
  });
  mock(
    t,
    async () =>
      new Response(
        new ReadableStream({
          start() {
            started();
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "content-type": version.mediaType } },
      ),
  );
  const controller = new AbortController();
  const rejected = assert.rejects(download(controller.signal), { name: "AbortError" });
  await ready;
  await new Promise((r) => setImmediate(r));
  controller.abort();
  await rejected;
  assert.equal(cancelled, true);
});
test("an already cancelled request never reaches the server", async (t) => {
  let calls = 0;
  mock(t, async () => {
    calls++;
    return response();
  });
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(download(controller.signal), { name: "AbortError" });
  assert.equal(calls, 0);
});
test("permission loss and service failure remain retryable errors, never file bytes", async (t) => {
  mock(
    t,
    async () =>
      new Response(
        JSON.stringify({
          error: { code: "NOT_FOUND", requestId: "synthetic", message: "withdrawn" },
        }),
        { status: 404 },
      ),
  );
  await assert.rejects(download(), (e) => e.status === 404 && /未获准/.test(e.message));
  globalThis.fetch = async () => new Response("forbidden", { status: 403 });
  await assert.rejects(download(), (e) => e.status === 403 && /未获准/.test(e.message));
  globalThis.fetch = async () => new Response("expired", { status: 401 });
  await assert.rejects(
    download(),
    (e) => e.status === 401 && /登录已失效/.test(e.message),
  );
  globalThis.fetch = async () => new Response("upstream unavailable", { status: 503 });
  await assert.rejects(download(), (e) => e.status === 503 && /重试/.test(e.message));
  globalThis.fetch = async () => response();
  assert.deepEqual(new Uint8Array(await (await download()).arrayBuffer()), payload);
});
test("opaque and JSON originals are supported when they match stored metadata", async (t) => {
  let mediaType;
  mock(t, async () => response(payload, { "content-type": mediaType }));
  for (mediaType of [
    "application/octet-stream",
    "application/json",
    "image/png",
    "application/pdf",
  ]) {
    const blob = await download(undefined, { ...version, mediaType });
    assert.equal(blob.type, mediaType);
  }
});
