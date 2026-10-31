/** Keep saved links working when their content moves to another workspace. */
export function agentDirectoryLocation(params: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.delete("view");
  next.set("kind", "agents");
  if (params.get("view") === "skills") next.set("panel", "skills");
  if (next.get("agent") && next.get("panel") !== "skills") {
    next.set("contact", next.get("agent")!);
    next.delete("agent");
  }
  return `/contact?${next}`;
}

export function relocatedMyWorkspace(params: URLSearchParams): string | undefined {
  if (["agents", "skills"].includes(params.get("view") || ""))
    return agentDirectoryLocation(params);
}

export function relocatedWorkspace(params: URLSearchParams): string | undefined {
  const next = new URLSearchParams(params);
  const view = params.get("view");
  if (view === "library" || view === "reports") {
    next.delete("view");
    if (view === "reports") next.set("panel", "reports");
    const search = next.toString();
    return search ? `/library?${search}` : "/library";
  }
  if (view === "agents" || view === "skills") return agentDirectoryLocation(params);
  if (view === "capabilities") {
    next.set("view", "capabilities");
    return `/me?${next}`;
  }
  if (view === "scheduled" || params.get("tab") === "scheduled") {
    // Schedules are a group in the task list now, not a separate tab.
    next.delete("tab");
    next.delete("panel");
    next.set("view", "tasks");
    return `/workbench?${next}`;
  }
}
