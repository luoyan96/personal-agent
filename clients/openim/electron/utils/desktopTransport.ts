import { net, session } from "electron";
import { PassThrough, Writable } from "node:stream";
import type { DesktopResponse, DesktopTransport } from "./desktopServer";

// Node https.request bypasses Chromium/system proxy resolution. Use the same
// network stack as the browser, with an isolated, non-persistent cookie store.
// Only desktopServer's explicitly selected service cookie is forwarded.
export const desktopTransport: DesktopTransport = (url, options, respond) => {
  const request = net.request({
    url: url.href,
    method: options.method,
    session: session.fromPartition("acceptcat-api-transport", { cache: false }),
    useSessionCookies: false,
    redirect: "error",
  });
  const forbidden = new Set([
    "host",
    "content-length",
    "transfer-encoding",
    "connection",
    "trailer",
    "te",
    "upgrade",
    "cookie2",
    "keep-alive",
    "accept-encoding",
    "proxy-authorization",
    "proxy-connection",
  ]);
  for (const [name, value] of Object.entries(options.headers)) {
    if (value !== undefined && !forbidden.has(name.toLowerCase()))
      request.setHeader(name, Array.isArray(value) ? value.join("; ") : value);
  }
  // Let Chromium negotiate and decode its own supported content encodings.
  // The local hop below carries decoded bytes, with representation headers fixed.
  // Electron22's chunked stream crashes when end() has no preceding write.
  // Enable streaming lazily on the first non-empty body chunk.
  let uploadStarted = false;
  let reply: DesktopResponse | undefined,
    ended = false;
  const safeError = (error: unknown) => {
    const code = String(
      (error as { code?: unknown })?.code ??
        (error instanceof Error
          ? error.message.match(/\bERR_[A-Z_]+\b/)?.[0]
          : undefined) ??
        "ERR_NETWORK",
    );
    return Object.assign(new Error("Desktop network request failed"), {
      code: /^[A-Z0-9_]{1,80}$/.test(code) ? code : "ERR_NETWORK",
    });
  };
  const upload = new Writable({
    autoDestroy: false,
    write(chunk, encoding, callback) {
      try {
        if (!chunk.length) {
          callback();
          return;
        }
        if (!uploadStarted) {
          request.chunkedEncoding = true;
          uploadStarted = true;
        }
        request.write(chunk, encoding, callback);
      } catch (error) {
        callback(safeError(error));
      }
    },
    final(callback) {
      try {
        request.end(undefined, undefined, callback);
      } catch (error) {
        callback(safeError(error));
      }
    },
    destroy(error, callback) {
      request.abort();
      reply?.destroy();
      callback(error);
    },
  });
  request.on("error", (error) => upload.destroy(safeError(error)));
  request.on("login", (_info, callback) => callback());
  request.on("response", (incoming) => {
    if (upload.destroyed) {
      request.abort();
      return;
    }
    const stream = Object.assign(new PassThrough(), {
      statusCode: incoming.statusCode,
      headers: { ...incoming.headers },
    });
    reply = stream;
    if (
      stream.headers["content-encoding"] &&
      stream.headers["content-encoding"] !== "identity"
    ) {
      delete stream.headers["content-encoding"];
      delete stream.headers["content-length"];
    }
    incoming.on("end", () => {
      ended = true;
      stream.end();
    });
    incoming.on("aborted", () => stream.emit("aborted"));
    incoming.on("error", (error: unknown) => stream.destroy(safeError(error)));
    stream.once("close", () => {
      if (!ended) upload.destroy();
    });
    respond(stream);
    incoming.on("data", (chunk) => {
      if (stream.destroyed) return;
      stream.write(chunk);
      // Electron22 IncomingMessage cannot pause. Bound a stalled local reader
      // instead of buffering an unbounded download in the main process.
      if (stream.readableLength + stream.writableLength > 4 * 1024 * 1024)
        stream.destroy(
          Object.assign(new Error("Desktop response reader stalled"), {
            code: "ERR_RESPONSE_BACKPRESSURE",
          }),
        );
    });
  });
  // In Electron22 upload close can precede response delivery. Completion is
  // determined by response end/aborted/error and the proxy's overall deadline.
  return upload;
};
