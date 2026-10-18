import { useEffect, useRef } from "react";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { readWorkspaceAvailability, workspaceAvailability } from "./workspace-availability";

// Remember only the public contract version, never task data or authorization.
// A failed health recheck must not unmount editors or block authenticated reads.
export function useWorkspaceAvailability(enabled: boolean) {
  const generation = useResearchStore((s) => s.generation);
  const read = useResearchRead(
    readWorkspaceAvailability,
    "workspace-availability",
    enabled,
  );
  const confirmed = useRef<{ generation: number; version: string }>();
  if (!enabled || confirmed.current?.generation !== generation)
    confirmed.current = undefined;
  if (enabled && read.data)
    confirmed.current = { generation, version: read.data.version };
  const version = confirmed.current?.version;
  const supports = (minimumMinor: number) =>
    !!version && workspaceAvailability(
      { data: { status: "ok", contractVersion: version } },
      minimumMinor,
    ).available;
  useEffect(() => {
    if (!enabled) return;
    const resume = () => {
      if (document.visibilityState === "visible") void read.refresh();
    };
    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [enabled, read.refresh]);
  return { ...read, version, supports };
}
