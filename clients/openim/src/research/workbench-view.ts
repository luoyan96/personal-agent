/**
 * The workbench keeps two front doors: the task list and the team overview.
 * Everything else (planning history, schedules, a saved plan) is a place you
 * arrive at from the list or from the task assistant, not a third tab.
 */
export type WorkbenchTab = "tasks" | "team";
export type WorkbenchFilter = "all" | "completed";

export type WorkbenchView = {
  tab: WorkbenchTab;
  /** A saved planning link should open the assistant, not a separate page. */
  planning: boolean;
  planId?: string;
  requestId?: string;
  filter: WorkbenchFilter;
};

const id = (value: string | null) =>
  value && /^[A-Za-z0-9_-]{1,96}$/.test(value) ? value : undefined;

export function workbenchView(params: URLSearchParams): WorkbenchView {
  const requested = params.get("view");
  const tab: WorkbenchTab = requested === "team" ? "team" : "tasks";
  const planId = id(params.get("plan")),
    requestId = id(params.get("planning"));
  return {
    tab,
    // Older links pointed at a planning tab; keep them landing on the assistant.
    planning:
      tab === "tasks" &&
      (requested === "planning" || Boolean(planId) || Boolean(requestId)),
    planId,
    requestId,
    filter: params.get("category") === "completed" ? "completed" : "all",
  };
}
