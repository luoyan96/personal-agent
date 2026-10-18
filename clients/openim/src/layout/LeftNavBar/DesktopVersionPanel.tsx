import { CloudDownloadOutlined } from "@ant-design/icons";
import { Alert, Button, Progress } from "antd";
import { APP_NAME } from "@/config/brand";
import type { DesktopUpdateController } from "./useDesktopUpdates";
const releasePage = "https://github.com/luoyan96/personal-agent/releases/latest";
export function DesktopVersionPanel({ updates }: { updates: DesktopUpdateController }) {
  const { state, busy, loading, loadError, actionError } = updates;
  const hasUpdate =
    !!state?.supported &&
    ["available", "downloading", "downloaded"].includes(state.phase);
  const percent = Math.floor(Math.min(100, Math.max(0, state?.percent || 0)));
  const working =
    busy ||
    (!!state && ["checking", "downloading", "installing"].includes(state.phase));
  const action =
    state?.phase === "downloaded"
      ? "install"
      : state?.phase === "available" && !actionError
      ? "download"
      : "check";
  const label =
    state?.phase === "checking"
      ? "正在检查"
      : state?.phase === "downloading"
      ? `正在下载 ${percent}%`
      : state?.phase === "installing"
      ? "正在安装"
      : action === "install"
      ? "安装并重启"
      : action === "download"
      ? "下载更新"
      : "检查更新";
  const status = !state
    ? "正在读取版本信息…"
    : !state.supported
    ? "自动更新适用于 Windows 安装版，请从安装后的快捷方式启动。"
    : state.phase === "current"
    ? "当前已是最新版本"
    : state.phase === "available"
    ? `发现新版本 ${state.version}`
    : state.phase === "downloading"
    ? `正在下载新版本 ${state.version}`
    : state.phase === "downloaded"
    ? `版本 ${state.version} 已下载并校验，可以安装并重启`
    : state.phase === "checking"
    ? "正在检查新版本…"
    : state.phase === "installing"
    ? "正在安装更新…"
    : state.phase === "error"
    ? "更新未完成，当前版本可以继续使用"
    : "可以检查是否有新版本";

  return (
    <section className="desktop-version-panel" aria-label="版本信息">
      <div className="desktop-version-heading">
        <div>
          <h2>{APP_NAME}</h2>
          <p>当前版本：{state?.currentVersion || "读取中"}</p>
        </div>
        <CloudDownloadOutlined className="desktop-version-icon" />
      </div>
      <p role="status" className="desktop-version-status">
        {loadError ? "版本信息读取失败" : status}
      </p>
      {(loadError || actionError || state?.phase === "error") && (
        <Alert
          type="error"
          showIcon
          message={
            loadError ||
            (actionError
              ? "更新操作暂时失败，请重新检查。"
              : "更新暂时失败，请重新检查；当前版本可以继续使用。")
          }
        />
      )}
      {state?.phase === "downloading" && (
        <Progress percent={percent} aria-label="版本下载进度" />
      )}
      {hasUpdate && state?.notes && (
        <div className="desktop-version-notes">
          <h3>本次更新</h3>
          <p>{state.notes}</p>
        </div>
      )}
      <div className="desktop-version-actions">
        {loadError ? (
          <Button onClick={() => void updates.refresh()} loading={loading}>
            重试读取版本
          </Button>
        ) : state?.supported ? (
          <Button
            type="primary"
            disabled={working}
            onClick={() => void updates.act(action)}
          >
            {label}
          </Button>
        ) : (
          !loading && (
            <a href={releasePage} target="_blank" rel="noreferrer">
              下载安装版
            </a>
          )
        )}
      </div>
      {state?.supported && (
        <p className="desktop-version-help">
          启动后、每 6 小时及电脑唤醒时自动检查。发现新版会提示，下载和重启由你决定。
        </p>
      )}
    </section>
  );
}
