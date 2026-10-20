import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const require = createRequire(import.meta.url),
  esbuild = createRequire(require.resolve("vite/package.json"))("esbuild");
const dir = await mkdtemp(path.join(tmpdir(), "desktop-system-network-"));
await esbuild.build({
  entryPoints: [
    new URL("../electron/utils/desktopTransport.ts", import.meta.url).pathname.replace(
      /^\/(\w:)/,
      "$1",
    ),
  ],
  outfile: path.join(dir, "transport.cjs"),
  platform: "node",
  format: "cjs",
  bundle: true,
  plugins: [
    {
      name: "electron-test-double",
      setup(build) {
        build.onResolve({ filter: /^electron$/ }, () => ({
          path: "electron",
          namespace: "test",
        }));
        build.onLoad({ filter: /.*/, namespace: "test" }, () => ({
          contents:
            "exports.net={request:(options)=>globalThis.__desktopNet.request(options)};exports.session={fromPartition:(...args)=>globalThis.__desktopNet.partition(...args)};",
        }));
      },
    },
  ],
});
const { desktopTransport } = require(path.join(dir, "transport.cjs"));
await esbuild.build({
  entryPoints: [
    new URL("../electron/utils/desktopServer.ts", import.meta.url).pathname.replace(
      /^\/(\w:)/,
      "$1",
    ),
  ],
  outfile: path.join(dir, "server.cjs"),
  platform: "node",
  format: "cjs",
  bundle: true,
});
const { startDesktopServer } = require(path.join(dir, "server.cjs"));
await writeFile(path.join(dir, "index.html"), "<title>Synthetic</title>");
async function fixture(t, respond) {
  const requests = [],
    partitions = [];
  globalThis.__desktopNet = {
    partition(...args) {
      partitions.push(args);
      return "isolated_session";
    },
    request(options) {
      const req = new EventEmitter();
      Object.assign(req, {
        options,
        headers: {},
        body: [],
        aborted: false,
        setHeader(name, value) {
          this.headers[name.toLowerCase()] = value;
        },
        write(chunk, _encoding, callback) {
          this.body.push(Buffer.from(chunk));
          queueMicrotask(callback);
        },
        end(_chunk, _encoding, callback) {
          if (this.chunkedEncoding && !this.body.length)
            throw new TypeError("Synthetic Electron22 empty chunked stream");
          queueMicrotask(() => {
            callback();
            this.emit("finish");
            this.emit("close");
            respond(req);
          });
        },
        abort() {
          if (this.aborted) return;
          this.aborted = true;
          this.emit("close");
        },
      });
      let chunked;
      Object.defineProperty(req, "chunkedEncoding", {
        get: () => chunked ?? false,
        set: (value) => {
          if (chunked !== undefined)
            throw new Error("Electron22 upload mode can only be chosen once");
          chunked = value;
        },
      });
      requests.push(req);
      return req;
    },
  };
  const reports = [],
    server = await startDesktopServer(
      dir,
      "https://synthetic.example",
      (record) => reports.push(record),
      desktopTransport,
    );
  t.after(() => server.close());
  return { requests, partitions, reports, server };
}
function response(req, status, headers, body) {
  const res = new EventEmitter();
  res.statusCode = status;
  res.headers = headers;
  req.emit("response", res);
  res.emit("data", Buffer.from(body));
  res.emit("end");
  req.emit("close");
  return res;
}
test("Chromium transport uses isolated session, explicit cookie, service origin and complete upload/query without forbidden headers", async (t) => {
  const f = await fixture(t, (req) =>
    response(
      req,
      200,
      {
        "content-type": "application/json",
        "set-cookie": ["rap_session=synthetic; Path=/; HttpOnly; Secure"],
      },
      '{"data":true}',
    ),
  );
  const first = await fetch(f.server.origin + "/api/v1/auth/login", {
    method: "POST",
    headers: { Origin: f.server.origin, "Content-Type": "application/json" },
    body: '{"synthetic":true}',
  });
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { data: true });
  const cookie = first.headers.getSetCookie()[0].split(";")[0];
  assert.match(cookie, /^desktop_rap_/);
  await fetch(
    f.server.origin + "/api/v1/research-library/collections?scope=visible&limit=100",
    { headers: { Cookie: cookie + "; unrelated=never" } },
  );
  assert.equal(f.requests[0].options.session, "isolated_session");
  assert.equal(f.requests[0].options.useSessionCookies, false);
  assert.equal(f.requests[0].options.redirect, "error");
  assert.deepEqual(f.partitions[0], ["acceptcat-api-transport", { cache: false }]);
  assert.equal(f.requests[1].headers.cookie, "rap_session=synthetic");
  assert.equal(f.requests[1].headers.origin, "https://synthetic.example");
  assert.equal(new URL(f.requests[1].options.url).search, "?scope=visible&limit=100");
  assert.equal(Buffer.concat(f.requests[0].body).toString(), '{"synthetic":true}');
  assert.equal(f.requests[0].chunkedEncoding, true);
  assert.equal(f.requests[1].chunkedEncoding, false);
  for (const key of [
    "host",
    "content-length",
    "transfer-encoding",
    "connection",
    "accept-encoding",
  ])
    assert.equal(f.requests[0].headers[key], undefined);
  assert.equal(f.reports.length, 0);
});
test("a decoded compressed response drops encoding/length metadata and preserves exact binary bytes", async (t) => {
  const bytes = Buffer.from([0, 255, 128, 10, 0, 45]);
  const f = await fixture(t, (req) =>
    response(
      req,
      200,
      {
        "content-type": "application/octet-stream",
        "content-encoding": "gzip",
        "content-length": "99",
      },
      bytes,
    ),
  );
  const r = await fetch(f.server.origin + "/api/v1/artifacts/synthetic/content");
  assert.equal(r.headers.get("content-encoding"), null);
  assert.equal(r.headers.get("content-length"), null);
  assert.deepEqual(Buffer.from(await r.arrayBuffer()), bytes);
});

test("an empty POST does not start Electron22's empty chunked upload stream", async (t) => {
  const f = await fixture(t, (req) =>
    response(req, 200, { "content-type": "application/json" }, '{"data":true}'),
  );
  const r = await fetch(f.server.origin + "/api/v1/synthetic-empty", {
    method: "POST",
    headers: { Origin: f.server.origin },
  });
  assert.equal(r.status, 200);
  assert.equal(f.requests[0].chunkedEncoding, false);
  assert.equal(f.requests[0].body.length, 0);
});
test("network failure is bounded, redacted and never automatically repeats a mutation", async (t) => {
  const f = await fixture(t, (req) =>
    req.emit(
      "error",
      new Error("net::ERR_PROXY_CONNECTION_FAILED secret_cookie_do_not_emit"),
    ),
  );
  const r = await fetch(f.server.origin + "/api/v1/chat/synthetic", {
    method: "POST",
    headers: { Origin: f.server.origin },
    body: "synthetic private text",
  });
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error.code, "SERVICE_UNAVAILABLE");
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].aborted, true);
  assert.equal(f.reports[0].code, "ERR_PROXY_CONNECTION_FAILED");
  assert.ok(!JSON.stringify(f.reports).includes("secret_cookie"));
  assert.ok(!JSON.stringify(f.reports).includes("private text"));
});
test("cancelled renderer aborts Chromium and a truncated response never becomes successful JSON", async (t) => {
  const f = await fixture(t, () => {}),
    controller = new AbortController();
  const pending = fetch(f.server.origin + "/api/v1/research-library/collections", {
    signal: controller.signal,
  });
  const rejected = assert.rejects(pending, { name: "AbortError" });
  while (!f.requests.length) await new Promise((r) => setTimeout(r, 5));
  controller.abort();
  await rejected;
  for (let i = 0; i < 100 && !f.requests[0].aborted; i++)
    await new Promise((r) => setTimeout(r, 5));
  assert.equal(f.requests[0].aborted, true);
  const g = await fixture(t, (req) => {
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = { "content-type": "application/json" };
    req.emit("response", res);
    res.emit("data", Buffer.from('{"data":'));
    setTimeout(() => res.emit("aborted"), 10);
  });
  const r = await fetch(g.server.origin + "/api/v1/auth/session");
  await assert.rejects(r.text());
  assert.equal(g.reports[0].reason, "response");
});
test("a stalled consumer is bounded and synchronous transport setup failure returns a service envelope", async (t) => {
  const f = await fixture(t, () => {});
  let reply;
  const upload = desktopTransport(
    new URL("https://synthetic.example"),
    { method: "GET", headers: {}, timeout: 1000 },
    (r) => {
      reply = r;
      r.on("error", () => {});
    },
  );
  upload.on("error", () => {});
  const req = f.requests[0],
    res = new EventEmitter();
  Object.assign(res, { statusCode: 200, headers: {} });
  req.emit("response", res);
  res.emit("data", Buffer.alloc(5 * 1024 * 1024));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(reply.destroyed, true);
  assert.equal(req.aborted, true);
  const g = await startDesktopServer(
    dir,
    "https://synthetic.example",
    undefined,
    () => {
      throw Error("synthetic setup failure");
    },
  );
  t.after(() => g.close());
  const r = await fetch(g.origin + "/api/v1/health/ready");
  assert.equal(r.status, 502);
  assert.equal((await r.json()).error.code, "SERVICE_UNAVAILABLE");
});
