import { ErrorResponse, routes } from "@research-agent-platform/contracts";
import type {
  RequestFor,
  ResponseFor,
  RouteName,
} from "@research-agent-platform/contracts";
import { clearIMProfile } from "@/utils/storage";

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
  const body = route.request.shape.body.parse(
    options.body ?? (route.method === "GET" ? null : {}),
  );
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
  const response = await fetch(path + (query.size ? `?${query}` : ""), {
    method: route.method,
    credentials: "same-origin",
    headers,
    signal: options.signal,
    ...(route.method !== "GET" ? { body: JSON.stringify(body) } : {}),
  });
  const value: unknown = await response.json();
  if (!response.ok) {
    const parsed = ErrorResponse.safeParse(value),
      code = parsed.success ? parsed.data.error.code : "HTTP_ERROR";
    if (
      response.status === 401 &&
      name !== "login" &&
      (name !== "session" || actorVerified)
    ) {
      clearResearchSession();
      void clearIMProfile();
      window.dispatchEvent(new Event("research-session-expired"));
    }
    throw new ResearchApiError(
      code,
      response.status,
      code === "VERSION_CONFLICT"
        ? "版本已变化，请重新读取并核对后再提交；填写已保留。"
        : `${code}（${response.status}）`,
    );
  }
  const result = route.response.parse(value) as ResponseFor<K>;
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
