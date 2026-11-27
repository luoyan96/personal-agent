import { Platform } from "@openim/wasm-client-sdk";
import { useKeyPress } from "ahooks";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { IpcMainToRender, IpcRenderToMain } from "../../../electron/constants";
import styles from "./index.module.scss";

const icons = {
  minimize: "M3 8.5h10",
  maximize: "M3.5 3.5h9v9h-9z",
  restore: "M5.5 5.5v-2h7v7h-2 M3.5 5.5h7v7h-7z",
  close: "M4 4l8 8m0-8-8 8",
};

const WindowControlBar = () => {
  const { t } = useTranslation();
  const electron = window.electronAPI;
  const showControls = electron && electron.getPlatform() !== Platform.MacOSX;
  const [maximized, setMaximized] = useState(false);

  useKeyPress("esc", () => {
    void electron?.ipcInvoke(IpcRenderToMain.minimizeWindow);
  });

  useEffect(() => {
    if (!showControls) return;

    // A native change can arrive while the initial state is being read.
    let needsSnapshot = true;
    const unsubscribe = electron.subscribe(
      IpcMainToRender.windowMaximizedChanged,
      (value) => {
        if (typeof value !== "boolean") return;
        needsSnapshot = false;
        setMaximized(value);
      },
    );
    void electron.ipcInvoke<boolean>(IpcRenderToMain.isWindowMaximized).then(
      (value) => {
        if (needsSnapshot) setMaximized(value);
      },
      () => {},
    );

    return () => {
      needsSnapshot = false;
      unsubscribe();
    };
  }, [electron, showControls]);

  if (!showControls) return null;

  const buttons = [
    { action: IpcRenderToMain.minimizeWindow, icon: "minimize" },
    { action: IpcRenderToMain.maxmizeWindow, icon: maximized ? "restore" : "maximize" },
    { action: IpcRenderToMain.closeWindow, icon: "close" },
  ] as const;

  return (
    <div
      className={`window-controls ${styles.controls}`}
      role="group"
      aria-label={t("windowControls.label")}
    >
      {buttons.map(({ action, icon }) => {
        const label = t(`windowControls.${icon}`);
        return (
          <button
            key={action}
            type="button"
            className={`app-no-drag ${styles.button}${
              icon === "close" ? ` ${styles.close}` : ""
            }`}
            aria-label={label}
            title={label}
            onClick={() => void electron.ipcInvoke(action)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              aria-hidden="true"
              focusable="false"
            >
              <path d={icons[icon]} />
            </svg>
          </button>
        );
      })}
    </div>
  );
};

export default WindowControlBar;
