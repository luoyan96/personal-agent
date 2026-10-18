/** Keep saved links working when their content moves to another workspace. */
export function relocatedWorkspace(params: URLSearchParams): string | undefined {
  const next = new URLSearchParams(params);
  const view = params.get("view");
  if (view === "agents" || view === "capabilities" || view === "skills") {
    next.set("view", view === "capabilities" ? "capabilities" : "agents");
    if (view === "skills") next.set("panel", "skills");
    return `/me?${next}`;
  }
  if (view === "scheduled" || params.get("tab") === "scheduled") {
    next.delete("tab");
    next.set("view", "planning");
    next.set("panel", "scheduled");
    return `/workbench?${next}`;
  }
  if (view === "reports") {
    next.set("view", "library");
    next.set("panel", "reports");
    return `/workbench?${next}`;
  }
}
