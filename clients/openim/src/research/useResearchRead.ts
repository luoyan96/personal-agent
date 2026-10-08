import { useCallback, useEffect, useRef, useState } from "react";
import { useResearchStore } from "./store";
import { RequestTimeoutError, withRequestDeadline } from "./request-deadline";

// Poll read-only facts without remounting editors. A failed authorization clears
// the previous facts immediately; drafts live in their owning forms.
export function useResearchRead<T>(
  read: (signal: AbortSignal) => Promise<T>,
  identity: string,
  enabled = true,
) {
  const actorGeneration = useResearchStore((s) => s.generation);
  const scope = `${actorGeneration}:${identity}`;
  const [result, setResult] = useState<{ identity: string; value: T }>();
  const [error, setError] = useState<{ identity: string; message: string }>();
  const [pending, setPending] = useState<string>();
  const reader = useRef(read);
  reader.current = read;
  const generation = useRef(0);
  const ticket = useRef(0);
  const key = useRef(scope);
  key.current = scope;
  const active = useRef(enabled);
  active.current = enabled;
  const nextPollAt = useRef(0);
  const inFlight = useRef<{
    identity: string;
    generation: number;
    controller: AbortController;
    promise: Promise<void>;
  }>();
  const refresh = useCallback(async () => {
    if (!active.current) return;
    const current = generation.current;
    // A slow read must get a chance to settle. Polling and manual refresh share
    // its promise instead of repeatedly invalidating the previous request.
    if (
      inFlight.current?.identity === key.current &&
      inFlight.current.generation === current
    )
      return inFlight.current.promise;
    const sessionGeneration = useResearchStore.getState().generation;
    const request = ++ticket.current,
      requestIdentity = key.current;
    const isCurrent = () =>
      active.current &&
      current === generation.current &&
      request === ticket.current &&
      requestIdentity === key.current &&
      sessionGeneration === useResearchStore.getState().generation;
    const flight = {
      identity: requestIdentity,
      generation: current,
      controller: new AbortController(),
      promise: Promise.resolve(),
    };
    inFlight.current = flight;
    nextPollAt.current = 0;
    setPending(requestIdentity);
    flight.promise = (async () => {
      try {
        const value = await withRequestDeadline(
          (signal) => reader.current(signal),
          30000,
          flight.controller.signal,
        );
        if (isCurrent()) {
          setResult({ identity: requestIdentity, value });
          setError(undefined);
        }
      } catch (failure) {
        if (isCurrent()) {
          setResult(undefined);
          nextPollAt.current = Date.now() + 15000;
          setError({
            identity: requestIdentity,
            message:
              failure instanceof RequestTimeoutError
                ? "读取超时，请检查连接后重试。"
                : failure instanceof Error
                ? failure.message
                : "读取失败",
          });
        }
      } finally {
        if (isCurrent()) setPending(undefined);
        if (inFlight.current === flight) inFlight.current = undefined;
      }
    })();
    return flight.promise;
  }, []);
  useEffect(() => {
    generation.current++;
    active.current = enabled;
    nextPollAt.current = 0;
    setResult(undefined);
    setError(undefined);
    setPending(undefined);
    if (!enabled) return;
    void refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible" && Date.now() >= nextPollAt.current)
        void refresh();
    }, 5000);
    return () => {
      generation.current++;
      if (key.current === scope) active.current = false;
      clearInterval(interval);
      if (inFlight.current?.identity === scope) {
        inFlight.current.controller.abort();
        inFlight.current = undefined;
      }
    };
  }, [scope, enabled, refresh]);
  return {
    data: enabled && result?.identity === scope ? result.value : undefined,
    error: enabled && error?.identity === scope ? error.message : "",
    loading: enabled && pending === scope,
    refresh,
  };
}
