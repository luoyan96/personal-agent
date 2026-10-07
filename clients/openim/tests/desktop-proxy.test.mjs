import { test } from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import https from "node:https";
import { createRequire } from "node:module";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import ts from "typescript";

const run = await mkdtemp(path.join(tmpdir(), "desktop-proxy-review-"));
await writeFile(
  path.join(run, "proxy.cjs"),
  ts.transpileModule(
    await readFile(
      new URL("../electron/utils/desktopServer.ts", import.meta.url),
      "utf8",
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    },
  ).outputText,
);
const { startDesktopServer } = createRequire(import.meta.url)(
  path.join(run, "proxy.cjs"),
);
async function fixture(t, respond) {
  const original = https.request,
    reports = [],
    requests = [];
  t.after(() => {
    https.request = original;
  });
  https.request = (_url, options, callback) => {
    const socket = new PassThrough();
    requests.push({ socket, options });
    socket.resume();
    socket.once("finish", () => respond(socket, callback));
    return socket;
  };
  const server = await startDesktopServer(run, "https://synthetic.example", (record) =>
    reports.push(record),
  );
  t.after(async () => {
    await server.close();
  });
  return { server, reports, requests };
}
function reply(callback, status, body) {
  const response = new PassThrough();
  response.statusCode = status;
  response.headers = { "content-type": "application/json" };
  callback(response);
  response.end(JSON.stringify(body));
}

test("connection failure returns a valid error envelope without exposing credentials", async (t) => {
  const { server, reports } = await fixture(t, (socket) => {
    const error = Object.assign(new Error("synthetic secret must never be logged"), {
      code: "ECONNRESET",
    });
    socket.emit("error", error);
  });
  const response = await fetch(server.origin + "/api/v1/auth/session");
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error.code, "SERVICE_UNAVAILABLE");
  assert.ok(body.error.requestId);
  assert.equal(reports[0].reason, "connection");
  assert.equal(reports[0].code, "ECONNRESET");
  assert.ok(!JSON.stringify(reports).includes("secret"));
});

test("an upstream body that aborts closes the renderer response instead of hanging or appending JSON", async (t) => {
  const { server, reports } = await fixture(t, (_socket, callback) => {
    const response = new PassThrough();
    response.statusCode = 200;
    response.headers = { "content-type": "application/json", "content-length": "1000" };
    callback(response);
    response.write('{"data":');
    setTimeout(() => response.emit("aborted"), 30);
  });
  const response = await fetch(server.origin + "/api/v1/auth/session");
  await assert.rejects(response.text());
  assert.equal(reports[0].reason, "response");
});

test("remote service failures retain their status and body, with metadata-only diagnostics", async (t) => {
  const { server, reports } = await fixture(t, (_socket, callback) =>
    reply(callback, 503, {
      error: {
        code: "SERVICE_UNAVAILABLE",
        message: "Synthetic service busy",
        requestId: "synthetic_request",
      },
    }),
  );
  const response = await fetch(server.origin + "/api/v1/auth/session");
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.requestId, "synthetic_request");
  assert.equal(reports[0].reason, "remote_status");
  assert.equal(reports[0].status, 503);
  assert.deepEqual(Object.keys(reports[0]).sort(), [
    "elapsedMs",
    "method",
    "reason",
    "requestId",
    "status",
  ]);
});

test("caller cancellation destroys the pending upstream and foreign-origin writes remain rejected", async (t) => {
  const { server, requests } = await fixture(t, () => {});
  const rejected = await fetch(server.origin + "/api/v1/chat/test", {
    method: "POST",
    headers: { Origin: "https://foreign.example" },
    body: "{}",
  });
  assert.equal(rejected.status, 403);
  assert.equal(requests.length, 0);
  const controller = new AbortController();
  const pending = fetch(server.origin + "/api/v1/auth/session", {
    signal: controller.signal,
  });
  const aborted = assert.rejects(pending, { name: "AbortError" });
  while (!requests.length) await new Promise((resolve) => setTimeout(resolve, 5));
  controller.abort();
  await aborted;
  for (let attempt = 0; attempt < 100 && !requests[0].socket.destroyed; attempt++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(requests[0].socket.destroyed, true);
});
