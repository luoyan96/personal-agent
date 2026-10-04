import { useCallback, useEffect, useRef, useState } from "react";

// Poll read-only facts without remounting editors. A failed authorization clears
// the previous facts immediately; drafts live in their owning forms.
export function useResearchRead<T>(read: () => Promise<T>, identity: string, enabled = true) {
  const [result, setResult] = useState<{identity:string;value:T}>();
  const [error, setError] = useState("");
  const reader = useRef(read); reader.current = read;
  const generation = useRef(0);
  const ticket = useRef(0);
  const key = useRef(identity); key.current = identity;
  const refresh = useCallback(async () => {
    const current = generation.current;
    const request = ++ticket.current, requestIdentity = key.current;
    try { const value = await reader.current(); if (current === generation.current && request === ticket.current) { setResult({identity:requestIdentity,value}); setError(""); } }
    catch (failure) { if (current === generation.current && request === ticket.current) { setResult(undefined); setError(failure instanceof Error ? failure.message : "读取失败"); } }
  }, []);
  useEffect(() => {
    generation.current++; setResult(undefined); setError("");
    if (!enabled) return;
    void refresh();
    const interval = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 5000);
    return () => { generation.current++; clearInterval(interval); };
  }, [identity, enabled, refresh]);
  return { data:enabled&&result?.identity===identity?result.value:undefined, error, refresh };
}
