import { CloudDownloadOutlined, LoadingOutlined, ReloadOutlined } from "@ant-design/icons";
import { Tooltip } from "antd";
import { useEffect, useRef, useState } from "react";
import type { DesktopUpdateSnapshot } from "@/types/desktopUpdates";

export default function DesktopUpdateButton() {
  const [state, setState] = useState<DesktopUpdateSnapshot>();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(false);
  const revision = useRef(0);
  const bridge = window.electronAPI;

  useEffect(() => {
    if (!bridge?.getDesktopUpdateState || !bridge.onDesktopUpdateState) return;
    let active = true;
    mounted.current = true;
    const unsubscribe = bridge.onDesktopUpdateState((next) => {
      revision.current++;
      setState(next);
      setActionError(false);
    });
    const current = revision.current;
    void bridge.getDesktopUpdateState().then((next) => {
      if (active && revision.current === current) setState(next);
    }).catch(() => {});
    return () => { active = false; mounted.current = false; unsubscribe(); };
  }, [bridge]);

  if (!state?.supported || ["idle", "current"].includes(state.phase)) return null;
  // Initial automatic checks are quiet. Once visible, keep progress/retry in place.
  if (state.phase === "checking" && !actionError && !busy) return null;
  const percent = Math.floor(state.percent || 0);
  const label = actionError || state.phase === "error" ? "重试更新"
    : state.phase === "available" ? "更新"
    : state.phase === "downloaded" ? "重启更新"
    : state.phase === "installing" ? "正在安装"
    : state.phase === "checking" ? "检查中"
    : `下载 ${percent}%`;
  const disabled = busy || ["checking", "downloading", "installing"].includes(state.phase);
  const detail = actionError ? "操作暂时失败，点击重新检查更新"
    : state.phase === "error" ? "更新暂时失败，点击重试；当前版本可以继续使用"
    : state.phase === "downloaded" ? `${state.version} 已下载并校验，点击安装并重启`
    : state.phase === "available" ? `发现新版本 ${state.version}，点击下载`
    : `${state.version || ""} · ${label}`;

  const act = async () => {
    if (pending.current || disabled || !bridge) return;
    pending.current = true;
    setBusy(true);
    setActionError(false);
    const current = revision.current;
    try {
      const action = state.phase === "downloaded" ? "install"
        : state.phase === "available" && !actionError ? "download" : "check";
      const next = await bridge.desktopUpdateAction(action, state.version);
      if (mounted.current && revision.current === current) setState(next);
    } catch {
      if (mounted.current) setActionError(true);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  return <Tooltip title={detail} placement="right">
    <button type="button" className="desktop-update-button" onClick={() => void act()}
      disabled={disabled} aria-label={label}>
      {disabled ? <LoadingOutlined /> : state.phase === "downloaded" ? <ReloadOutlined /> : <CloudDownloadOutlined />}
      <span>{label}</span>
      {state.phase === "downloading" && <span className="desktop-update-progress" role="progressbar"
        aria-label="更新下载进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
        <span style={{ width: `${percent}%` }} />
      </span>}
    </button>
  </Tooltip>;
}
