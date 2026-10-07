export class RequestTimeoutError extends Error {
  constructor() {
    super("等待服务响应超时，结果尚未确认。内容已保留，请重试原请求核对结果。");
    this.name = "RequestTimeoutError";
  }
}

export function assertRequestActive(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
}

/** Bounds connection, response body and session preparation with one deadline.
 * The race also releases the queue if a transport fails to honour cancellation.
 * A late result never authorizes state changes: callers check the scoped signal.
 */
export async function withRequestDeadline<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  assertRequestActive(signal);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: () => void = () => {};
  const cancelled = new Promise<never>((_, reject) => {
    onAbort = () => {
      controller.abort();
      reject(new DOMException("Request cancelled", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new RequestTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        assertRequestActive(controller.signal);
        return run(controller.signal);
      }),
      cancelled,
    ]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
