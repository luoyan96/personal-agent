import { useCallback, useEffect, useRef, useState } from "react";
import type {
  DesktopUpdateAction,
  DesktopUpdateSnapshot,
} from "@/types/desktopUpdates";

// One native subscription drives both the permanent settings entry and the update hint.
export function useDesktopUpdates() {
  const [state, setState] = useState<DesktopUpdateSnapshot>();
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState(false);
  const pending = useRef(false),
    mounted = useRef(false),
    revision = useRef(0);
  const latest = useRef<DesktopUpdateSnapshot>();
  const bridge = window.electronAPI;

  const refresh = useCallback(async () => {
    if (!bridge?.getDesktopUpdateState) {
      setLoading(false);
      setLoadError("此桌面版本无法读取更新信息，请下载安装新版。");
      return undefined;
    }
    const ticket = revision.current;
    setLoading(true);
    try {
      const next = await bridge.getDesktopUpdateState();
      if (mounted.current && revision.current === ticket) {
        latest.current = next;
        setState(next);
        setLoadError("");
      }
      return latest.current;
    } catch {
      if (mounted.current && revision.current === ticket)
        setLoadError("无法读取版本信息，请重试。");
      return undefined;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [bridge]);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = bridge?.onDesktopUpdateState?.((next) => {
      revision.current++;
      latest.current = next;
      setState(next);
      setLoadError("");
      setActionError(false);
    });
    void refresh();
    return () => {
      mounted.current = false;
      revision.current++;
      unsubscribe?.();
    };
  }, [bridge, refresh]);

  const act = useCallback(
    async (action: DesktopUpdateAction) => {
      if (pending.current || !bridge?.desktopUpdateAction || !latest.current?.supported)
        return;
      if (["checking", "downloading", "installing"].includes(latest.current.phase))
        return;
      pending.current = true;
      setBusy(true);
      setActionError(false);
      const ticket = revision.current;
      try {
        const next = await bridge.desktopUpdateAction(action, latest.current.version);
        if (mounted.current && revision.current === ticket) {
          latest.current = next;
          setState(next);
        }
      } catch {
        if (mounted.current) setActionError(true);
      } finally {
        pending.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [bridge],
  );

  const openCheck = useCallback(async () => {
    const next = latest.current || (await refresh());
    if (next?.supported && ["idle", "current", "error"].includes(next.phase))
      await act("check");
  }, [refresh, act]);
  return { state, busy, loading, loadError, actionError, refresh, act, openCheck };
}
export type DesktopUpdateController = ReturnType<typeof useDesktopUpdates>;
