import { Button } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useLayoutEffect, useRef, useState } from "react";
import {
  readResearchFileBytes,
  type ResearchFileVersion,
} from "./research-library-api";
import { saveTaskArtifact as requestFileSave } from "./task-artifact-download";
import { usePersonalOperation } from "./usePersonalOperation";

export function ResearchFileDownload({
  id,
  version,
  disabled,
}: {
  id: string;
  version: ResearchFileVersion;
  disabled: boolean;
}) {
  const operation = usePersonalOperation(
    !disabled,
    `library-download:${id}:${version.version}:${version.sha256}:${version.filename}:${version.mediaType}:${version.byteLength}`,
  );
  const current = useRef<AbortController>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requested, setRequested] = useState(false);
  useLayoutEffect(() => {
    setBusy(false);
    setError("");
    setRequested(false);
    return () => {
      current.current?.abort();
      current.current = undefined;
    };
  }, [operation.scope]);
  const download = async () => {
    if (current.current || disabled) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setError("");
    setRequested(false);
    try {
      const blob = await readResearchFileBytes(id, version, controller.signal);
      if (!isCurrent() || controller.signal.aborted) return;
      requestFileSave(blob, version.filename);
      setRequested(true);
    } catch (failure) {
      if (isCurrent() && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "原件下载失败，请重试。");
    } finally {
      if (current.current === controller) {
        current.current = undefined;
        if (isCurrent()) setBusy(false);
      }
    }
  };
  return (
    <div
      className="research-original-download"
      aria-label={`原件下载 v${version.version}`}
    >
      <div className="research-library-actions">
        <Button
          icon={<DownloadOutlined aria-hidden />}
          type="primary"
          disabled={disabled}
          loading={busy}
          onClick={() => void download()}
        >
          下载原始文件
        </Button>
        {busy && (
          <Button
            type="text"
            onClick={() => {
              current.current?.abort();
              current.current = undefined;
              setBusy(false);
            }}
          >
            停止下载
          </Button>
        )}
      </div>
      {busy && (
        <p role="status" className="research-library-muted">
          正在读取并校验 v{version.version} 原件…
        </p>
      )}
      {error && (
        <p role="alert" className="research-download-error">
          {error}
        </p>
      )}
      {requested && (
        <p role="status" className="research-library-muted">
          已请求保存 v{version.version}{" "}
          原件，请在下载列表或保存窗口核对；取消保存后可再次下载。
        </p>
      )}
    </div>
  );
}
