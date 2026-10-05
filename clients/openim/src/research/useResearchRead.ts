import { useCallback, useEffect, useRef, useState } from "react";
import { useResearchStore } from "./store";

// Poll read-only facts without remounting editors. A failed authorization clears
// the previous facts immediately; drafts live in their owning forms.
export function useResearchRead<T>(
  read: () => Promise<T>,
  identity: string,
  enabled = true,
) {
  const actorGeneration = useResearchStore((s) => s.generation);
  const scope = `${actorGeneration}:${identity}`;
  const [result, setResult] = useState<{ identity: string; value: T }>();
  const [error, setError] = useState<{ identity: string; message: string }>();
  const reader = useRef(read);
  reader.current = read;
  const generation = useRef(0);
  const ticket = useRef(0);
  const key = useRef(scope);
  key.current = scope;
  const active = useRef(enabled);
  active.current = enabled;
  const refresh = useCallback(async () => {
    if (!active.current) return;
    const current = generation.current;
    const sessionGeneration = useResearchStore.getState().generation;
    const request = ++ticket.current,
      requestIdentity = key.current;
    const isCurrent = () =>
      active.current &&
      current === generation.current &&
      request === ticket.current &&
      requestIdentity === key.current &&
      sessionGeneration === useResearchStore.getState().generation;
    try {
      const value = await reader.current();
      if (isCurrent()) {
        setResult({ identity: requestIdentity, value });
        setError(undefined);
      }
    } catch (failure) {
      if (isCurrent()) {
        setResult(undefined);
        setError({
          identity: requestIdentity,
          message: failure instanceof Error ? failure.message : "读取失败",
        });
      }
    }
  }, []);
  useEffect(() => {
    generation.current++;
    setResult(undefined);
    setError(undefined);
    if (!enabled) return;
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => {
      generation.current++;
      clearInterval(interval);
    };
  }, [scope, enabled, refresh]);
  return {
    data: enabled && result?.identity === scope ? result.value : undefined,
    error: enabled && error?.identity === scope ? error.message : "",
    refresh,
  };
}
