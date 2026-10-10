import { createServer, request as requestHttp, type IncomingMessage, type Server } from "node:http";
import { request as requestHttps } from "node:https";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

export type DesktopProxyFailure = {
  requestId: string;
  method: string;
  reason: "timeout" | "connection" | "response" | "remote_status";
  elapsedMs: number;
  status?: number;
  code?: string;
};

export const desktopSessionCookie = (service: string) =>
  `desktop_rap_${createHash("sha256")
    .update(new URL(service).origin)
    .digest("hex")
    .slice(0, 16)}`;

const mime: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

/** Bundled UI, same-origin authenticated API. Never proxy an arbitrary URL. */
export async function startDesktopServer(
  dist: string,
  service: string,
  onFailure?: (failure: DesktopProxyFailure) => void,
): Promise<{
  origin: string;
  close: () => Promise<void>;
}> {
  const root = path.resolve(dist),
    remote = new URL(service);
  const cookieName = desktopSessionCookie(service);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(remote.hostname);
  if ((remote.protocol !== "https:" && !(remote.protocol === "http:" && local)) || remote.username || remote.password)
    throw new Error("桌面服务需要 HTTPS 地址；本机开发允许 localhost 或 127.0.0.1");
  let origin = "";
  const server: Server = createServer(async (req, res) => {
    const reject = (status: number) => {
      res.writeHead(status);
      res.end();
    };
    if (!origin || req.headers.host !== new URL(origin).host) return reject(403);
    const suppliedOrigin = req.headers.origin;
    if (
      (suppliedOrigin && suppliedOrigin !== origin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    )
      return reject(403);
    try {
      const url = new URL(req.url || "/", origin);
      if (url.pathname.startsWith("/api/")) {
        if (
          !["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(req.method || "")
        )
          return reject(405);
        if (!["GET", "HEAD"].includes(req.method || "") && suppliedOrigin !== origin)
          return reject(403);
        const headers = { ...req.headers, host: remote.host, origin: remote.origin };
        const sessionCookie = req.headers.cookie
          ?.split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(cookieName + "="));
        delete headers.cookie;
        if (sessionCookie)
          headers.cookie = "rap_session=" + sessionCookie.slice(cookieName.length + 1);
        delete headers["connection"];
        delete headers["referer"];
        delete headers["forwarded"];
        delete headers["x-forwarded-for"];
        const started = Date.now(),
          requestId = randomUUID();
        let finished = false,
          response: IncomingMessage | undefined;
        const report = (
          reason: DesktopProxyFailure["reason"],
          error?: Error,
          status?: number,
        ) => {
          // Only transport metadata: never headers, cookies, URLs or message text.
          try {
            onFailure?.({
              requestId,
              method: req.method || "",
              reason,
              elapsedMs: Date.now() - started,
              ...(status ? { status } : {}),
              ...(error && "code" in error && typeof error.code === "string"
                ? { code: error.code }
                : {}),
            });
          } catch {
            /* Diagnostics must not break delivery. */
          }
        };
        const fail = (reason: DesktopProxyFailure["reason"], error?: Error) => {
          if (finished) return;
          finished = true;
          clearTimeout(deadline);
          report(reason, error);
          upstream.destroy();
          response?.destroy();
          if (res.headersSent) res.destroy();
          else {
            res.writeHead(502, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                error: {
                  code: "SERVICE_UNAVAILABLE",
                  message: "服务暂时无法连接",
                  requestId,
                },
              }),
            );
          }
        };
        const upstream = (remote.protocol === "https:" ? requestHttps : requestHttp)(
          new URL(url.pathname + url.search, remote.origin),
          {
            method: req.method,
            headers,
            timeout: 120000,
          },
          (reply) => {
            response = reply;
            reply.on("aborted", () => fail("response"));
            reply.on("error", (error) => fail("response", error));
            if ((reply.statusCode || 0) >= 500)
              report("remote_status", undefined, reply.statusCode);
            const responseHeaders = { ...reply.headers };
            delete responseHeaders["connection"];
            if (reply.headers["set-cookie"])
              responseHeaders["set-cookie"] = reply.headers["set-cookie"]
                .filter((cookie) => cookie.startsWith("rap_session="))
                .map((cookie) =>
                  cookie
                    .replace(/^rap_session=/, cookieName + "=")
                    .replace(/;\s*Domain=[^;]+/gi, "")
                    .replace(/;\s*Secure\b/gi, ""),
                );
            // Remote CSP is intended for its own web build; bundled UI has local assets.
            delete responseHeaders["content-security-policy"];
            res.writeHead(reply.statusCode || 502, responseHeaders);
            reply.pipe(res);
          },
        );
        // Node's socket timeout alone does not bound DNS, upload or a trickling body.
        const deadline = setTimeout(() => fail("timeout"), 120000);
        upstream.on("timeout", () => fail("timeout"));
        upstream.on("error", (error) => fail("connection", error));
        const cleanup = () => {
          finished = true;
          clearTimeout(deadline);
          if (!res.writableFinished) {
            upstream.destroy();
            response?.destroy();
          }
        };
        req.on("aborted", cleanup);
        res.on("finish", cleanup);
        res.on("close", cleanup);
        req.pipe(upstream);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") return reject(405);
      const name = decodeURIComponent(
        url.pathname === "/" ? "/index.html" : url.pathname,
      );
      if (name.includes("\0") || name.includes("\\")) return reject(404);
      const target = path.resolve(root, "." + name),
        relative = path.relative(root, target);
      if (!relative || relative.startsWith("..") || path.isAbsolute(relative))
        return reject(404);
      const data = await fs.readFile(target);
      res.writeHead(200, {
        "Content-Type": mime[path.extname(target)] || "application/octet-stream",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch {
      if (!res.headersSent) reject(404);
      else res.end();
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.removeListener("error", reject);
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("无法启动桌面界面");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    origin,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      }),
  };
}
