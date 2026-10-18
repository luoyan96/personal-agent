import { ErrorResponse, routes } from "@research-agent-platform/contracts";
import type {
  RequestFor,
  ResponseFor,
  RouteName,
} from "@research-agent-platform/contracts";
import { clearIMProfile } from "@/utils/storage";
import {
  assertRequestActive,
  RequestTimeoutError,
  withRequestDeadline,
} from "./request-deadline";
import {
  normalizeAuthBody,
  serviceErrorMessage,
  validationMessage,
} from "./api-errors";

export const researchMode = import.meta.env.VITE_RESEARCH_MODE !== "false";
let csrfToken = "";
let actorVerified = false;
const slots = new Map<string, string>();
// Requests belong to the login that started them, including session/CSRF
// preparation. A transport may still finish after abort, so the signal checks
// below also fence late headers and bodies before touching shared state.
const pendingRequests = new Set<AbortController>();
export class ResearchApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
type Options<K extends RouteName> = {
  body?: RequestFor<K>["body"];
  params?: RequestFor<K>["params"];
  query?: RequestFor<K>["query"];
  signal?: AbortSignal;
  idempotencyKey?: string;
};
export async function researchApi<K extends RouteName>(
  name: K,
  options: Options<K> = {},
): Promise<ResponseFor<K>> {
  assertRequestActive(options.signal);
  if (name === "login") clearResearchSession();
  const controller = new AbortController();
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });
  pendingRequests.add(controller);
  try {
    return await withRequestDeadline(
      (signal) => requestResearchApi(name, { ...options, signal }, controller),
      name === "agentFileMessage" ? 120000 : 30000,
      controller.signal,
    );
  } catch (error) {
    if (error instanceof RequestTimeoutError)
      throw new ResearchApiError("REQUEST_TIMEOUT", 0, error.message);
    throw error;
  } finally {
    pendingRequests.delete(controller);
    options.signal?.removeEventListener("abort", cancel);
  }
}

async function requestResearchApi<K extends RouteName>(
  name: K,
  options: Options<K>,
  controller: AbortController,
): Promise<ResponseFor<K>> {
  assertRequestActive(options.signal);
  const route = routes[name];
  let path: string = route.path;
  for (const [key, value] of Object.entries(options.params ?? {}))
    path = path.replace(`{${key}}`, encodeURIComponent(String(value)));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(options.query ?? {}))
    if (value != null) query.set(key, String(value));
  const suppliedBody = options.body ?? (route.method === "GET" ? null : {});
  const parsedBody = route.request.shape.body.safeParse(
    name === "login" || name === "register"
      ? normalizeAuthBody(suppliedBody)
      : suppliedBody,
  );
  if (!parsedBody.success)
    throw new ResearchApiError(
      "VALIDATION_ERROR",
      0,
      validationMessage(parsedBody.error.issues),
    );
  const body = parsedBody.data;
  if (route.method !== "GET" && route.access === "session" && !csrfToken) {
    const session = await requestResearchApi("session", { signal: options.signal }, controller);
    assertRequestActive(options.signal);
    csrfToken = session.data.csrfToken;
  }
  assertRequestActive(options.signal);
  const headers: Record<string, string> = {};
  if (route.method !== "GET") headers["Content-Type"] = "application/json";
  if (csrfToken && route.method !== "GET" && route.access === "session")
    headers["X-CSRF-Token"] = csrfToken;
  const intent = JSON.stringify([name, options.params, options.query, body]);
  if (route.idempotent && route.method !== "GET") {
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;
    else {
      if (!slots.has(intent)) slots.set(intent, crypto.randomUUID());
      headers["Idempotency-Key"] = slots.get(intent)!;
    }
  }
  let response: Response;
  try {
    // Electron 22 / Chromium 108 has no URLSearchParams.size. Check the
    // serialized query so desktop requests retain pagination and filters.
    const queryString = query.toString();
    response = await fetch(path + (queryString ? `?${queryString}` : ""), {
      method: route.method,
      credentials: "same-origin",
      headers,
      signal: options.signal,
      ...(route.method !== "GET" ? { body: JSON.stringify(body) } : {}),
    });
  } catch (error) {
    if (options.signal?.aborted) throw error;
    throw new ResearchApiError(
      "NETWORK_ERROR",
      0,
      "服务连接失败，填写内容已保留，请检查连接后重试。",
    );
  }
  assertRequestActive(options.signal);
  if (
    response.status === 401 &&
    name !== "login" &&
    (name !== "session" || actorVerified)
  ) {
    // Preserve this request's real 401 error while cancelling other requests
    // from the expired login. An old request cannot reach here after reset.
    resetResearchSession(controller);
    void clearIMProfile();
    window.dispatchEvent(new Event("research-session-expired"));
  }
  let value: unknown;
  try {
    value =
      name === "content" && response.ok
        ? await readArtifactContent(response, options.signal)
        : await response.json();
  } catch (error) {
    if (options.signal?.aborted) throw error;
    if (error instanceof ResearchApiError) throw error;
    throw new ResearchApiError(
      response.ok ? "INVALID_RESPONSE" : "SERVICE_UNAVAILABLE",
      response.status,
      response.ok
        ? "服务响应无法读取，请刷新或重试原请求。"
        : serviceErrorMessage("SERVICE_UNAVAILABLE", response.status, name),
    );
  }
  assertRequestActive(options.signal);
  if (!response.ok) {
    const parsed = ErrorResponse.safeParse(value),
      code = parsed.success ? parsed.data.error.code : "HTTP_ERROR";
    throw new ResearchApiError(
      code,
      response.status,
      serviceErrorMessage(code, response.status, name),
    );
  }
  const parsedResult = route.response.safeParse(value);
  if (!parsedResult.success)
    throw new ResearchApiError(
      "INVALID_RESPONSE",
      response.status,
      "服务响应不符合要求，请刷新或重试原请求。",
    );
  const result = parsedResult.data as ResponseFor<K>;
  if (name === "session") {
    csrfToken = (result as ResponseFor<"session">).data.csrfToken;
    actorVerified = true;
  }
  if (route.method !== "GET") slots.delete(intent);
  return result;
}

// Task material is binary. Keep it in the authenticated app transport instead
// of opening a URL in an external browser with a different cookie store.
async function readArtifactContent(response: Response, signal?: AbortSignal) {
  const invalid = () =>
    new ResearchApiError(
      "INVALID_RESPONSE",
      response.status,
      "材料响应与预期不符，未保存文件。请重新读取任务后重试。",
    );
  const limit = 10 * 1024 * 1024;
  const type = response.headers.get("content-type")?.split(";")[0].trim();
  const length = response.headers.get("content-length");
  if (
    !type ||
    !["text/plain", "application/pdf", "image/png"].includes(type) ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > limit)) ||
    !response.body
  ) {
    await response.body?.cancel();
    throw invalid();
  }
  const reader = response.body.getReader();
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal?.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      assertRequestActive(signal);
      const part = await reader.read();
      assertRequestActive(signal);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > limit) throw invalid();
      chunks.push(part.value);
    }
    if (!size) throw invalid();
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  } catch (error) {
    cancel();
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    reader.releaseLock();
  }
}
export function clearResearchSession() {
  resetResearchSession();
}

function resetResearchSession(except?: AbortController) {
  csrfToken = "";
  slots.clear();
  actorVerified = false;
  for (const controller of pendingRequests)
    if (controller !== except) controller.abort();
}
