import { Id } from "@research-agent-platform/contracts";

/** Auth redirects accept just a share card, never arbitrary URLs or actions. */
export function contactDestination(pathname: unknown, search: unknown): string | undefined {
  if (pathname !== "/contact" || typeof search !== "string") return;
  const params = new URLSearchParams(search), id = params.get("contact");
  if (!id || params.size !== 1 || !Id.safeParse(id).success) return;
  return `/contact?contact=${encodeURIComponent(id)}`;
}
export function contactReturnState(value: unknown): string | undefined {
  if (!value || typeof value !== "object" || !("contactDestination" in value) || typeof value.contactDestination !== "string") return;
  try {
    const url = new URL(value.contactDestination, "https://local.invalid");
    if (url.origin !== "https://local.invalid" || url.hash) return;
    return contactDestination(url.pathname, url.search);
  } catch { return; }
}
