import { withRequestDeadline } from "./request-deadline";

export function workspaceAvailability(value: unknown, minimumMinor = 21) {
  const data = (value as { data?: { status?: unknown; contractVersion?: unknown } })
    ?.data;
  const version = data?.contractVersion;
  if (data?.status !== "ok" || typeof version !== "string" || version.length > 40)
    throw new Error("无法确认服务状态，请检查连接后重试。");
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!match) throw new Error("无法确认服务版本，请联系管理员核对。");
  const [, major, minor] = match.map(Number);
  return { available: major === 0 && minor >= minimumMinor, version };
}

// Health is public and deliberately read outside the current strict contract:
// older healthy servers must be identifiable before newer routes are called.
function readAvailability(minimumMinor: number) {
  return withRequestDeadline(async (signal) => {
    const response = await fetch("/api/v1/health/ready", {
      credentials: "omit",
      signal,
    });
    if (!response.ok) throw new Error("暂时无法连接服务，请稍后重新检查。");
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new Error("服务返回的状态无法确认，请稍后重新检查。");
    }
    return workspaceAvailability(value, minimumMinor);
  }, 10000);
}
export function readWorkspaceAvailability() {
  return readAvailability(21);
}
export function readResearchTeamAvailability() {
  return readAvailability(23);
}
