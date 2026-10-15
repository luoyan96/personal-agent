import { Button } from "antd";
import { DownloadOutlined } from "@ant-design/icons";
import { useLayoutEffect, useRef, useState } from "react";
import { usePersonalOperation } from "./usePersonalOperation";
import {
  readTaskArtifact,
  saveTaskArtifact,
  type TaskArtifact,
} from "./task-artifact-download";

export function TaskArtifactDownload({ artifact }: { artifact: TaskArtifact }) {
  const operation = usePersonalOperation(
    true,
    `task-artifact:${artifact.id}:${artifact.version}:${artifact.accessStatus}`,
  );
  const current = useRef<AbortController>();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [requested, setRequested] = useState(false);
  const revoked = artifact.accessStatus === "revoked";
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
    if (current.current || revoked) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    const controller = new AbortController();
    current.current = controller;
    setBusy(true);
    setError("");
    setRequested(false);
    try {
      const blob = await readTaskArtifact(artifact, controller.signal);
      if (!isCurrent() || controller.signal.aborted) return;
      saveTaskArtifact(blob, artifact.filename);
      setRequested(true);
    } catch (failure) {
      if (isCurrent() && !controller.signal.aborted)
        setError(failure instanceof Error ? failure.message : "材料下载失败，请重试。");
    } finally {
      if (current.current === controller) {
        current.current = undefined;
        if (isCurrent()) setBusy(false);
      }
    }
  };
  return (
    <article
      className="rounded border p-3"
      aria-label={`任务材料 ${artifact.filename}`}
    >
      <p className="break-all">
        {artifact.filename} · 版本 {artifact.version}
      </p>
      <p className="text-xs">
        {artifact.size} 字节 · {revoked ? "已撤回" : "按当前任务授权下载"}
      </p>
      <Button
        icon={<DownloadOutlined aria-hidden />}
        loading={busy}
        disabled={revoked}
        onClick={() => void download()}
      >
        下载获准材料
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
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {requested && (
        <p role="status" className="text-xs">
          已请求保存，请在下载列表或保存窗口核对；取消保存后可再次下载。
        </p>
      )}
    </article>
  );
}
