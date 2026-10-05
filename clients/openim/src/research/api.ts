import { ErrorResponse, routes } from "@research-agent-platform/contracts";
import type {
  RequestFor,
  ResponseFor,
  RouteName,
} from "@research-agent-platform/contracts";
import { clearIMProfile } from "@/utils/storage";
import {
  normalizeAuthBody,
  serviceErrorMessage,
  validationMessage,
} from "./api-errors";

export const researchMode = import.meta.env.VITE_RESEARCH_MODE !== "false";
let csrfToken = "";
let actorVerified = false;
const slots = new Map<string, string>();
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
};
export async function researchApi<K extends RouteName>(
  name: K,
  options: Options<K> = {},
): Promise<ResponseFor<K>> {
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
  if (route.method !== "GET" && route.access === "session" && !csrfToken)
    csrfToken = (await researchApi("session")).data.csrfToken;
  const headers: Record<string, string> = {};
  if (route.method !== "GET") headers["Content-Type"] = "application/json";
  if (csrfToken && route.method !== "GET" && route.access === "session")
    headers["X-CSRF-Token"] = csrfToken;
  const intent = JSON.stringify([name, options.params, options.query, body]);
  if (route.idempotent && route.method !== "GET") {
    if (!slots.has(intent)) slots.set(intent, crypto.randomUUID());
    headers["Idempotency-Key"] = slots.get(intent)!;
  }
  let response: Response;
  try {
    response = await fetch(path + (query.size ? `?${query}` : ""), {
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
  if (
    response.status === 401 &&
    name !== "login" &&
    (name !== "session" || actorVerified)
  ) {
    clearResearchSession();
    void clearIMProfile();
    window.dispatchEvent(new Event("research-session-expired"));
  }
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    throw new ResearchApiError(
      response.ok ? "INVALID_RESPONSE" : "SERVICE_UNAVAILABLE",
      response.status,
      response.ok
        ? "服务响应无法读取，请刷新或重试原请求。"
        : serviceErrorMessage("SERVICE_UNAVAILABLE", response.status, name),
    );
  }
  if (options.signal?.aborted) throw new DOMException("Read cancelled", "AbortError");
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
export function clearResearchSession() {
  csrfToken = "";
  slots.clear();
  actorVerified = false;
}
