import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const dir = await mkdtemp(path.join(tmpdir(), "workspace-health-"));
await esbuild.build({
  entryPoints: [new URL("../src/research/workspace-availability.ts", import.meta.url).pathname.replace(/^\/(\w:)/, "$1")],
  outfile: path.join(dir, "health.cjs"), bundle: true, platform: "node", format: "cjs",
});
const { readWorkspaceAvailability, readResearchTeamAvailability } = require(path.join(dir, "health.cjs"));

test("one health version supports independently checked workspace and team boundaries without authentication", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json({ data: { status: "ok", contractVersion: "0.22.0" } });
  };
  assert.deepEqual(await readWorkspaceAvailability(), { available: true, version: "0.22.0" });
  assert.deepEqual(await readResearchTeamAvailability(), { available: false, version: "0.22.0" });
  assert(calls.every(c => c.url === "/api/v1/health/ready" && c.options.credentials === "omit"));
});

test("caller cancellation aborts the health transport and cannot report a late success", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  let transportSignal, finish;
  globalThis.fetch = (_url, options) => {
    transportSignal = options.signal;
    return new Promise(resolve => { finish = resolve; });
  };
  const caller = new AbortController();
  const pending = readWorkspaceAvailability(caller.signal);
  const rejected = assert.rejects(pending, { name: "AbortError" });
  await Promise.resolve();
  caller.abort();
  await rejected;
  assert.equal(transportSignal.aborted, true);
  finish(Response.json({ data: { status: "ok", contractVersion: "0.25.0" } }));
});

test("unhealthy and malformed responses never establish compatibility", async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  for (const respond of [
    () => new Response("busy", { status: 503 }),
    () => Response.json({ data: { status: "failed", contractVersion: "0.25.0" } }),
    () => Response.json({ data: { status: "ok", contractVersion: "unknown" } }),
    () => new Response("<html>not health</html>"),
  ]) {
    globalThis.fetch = async () => respond();
    await assert.rejects(readWorkspaceAvailability());
  }
});
