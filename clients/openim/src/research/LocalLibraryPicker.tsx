import "./local-library.scss";

import { Alert, Button, Checkbox, Input, Modal, Spin } from "antd";
import { useEffect, useState } from "react";

import type { LocalLibraryManifest } from "@/types/localLibrary";

import { formatLocalFileSize } from "./local-file-size";

const personalSelectionLimit = 20;

/** Return paths relative to the source folder for the caller's explicit action. */
export function LocalLibraryPicker({
  open,
  selected = [],
  confirmLabel = "用这些文件",
  source = "shared",
  onClose,
  onPick,
}: {
  open: boolean;
  selected?: string[];
  confirmLabel?: string;
  source?: "personal" | "shared";
  onClose: () => void;
  onPick: (rels: string[]) => void;
}) {
  const bridge = window.electronAPI?.localLibrary;
  const personal = source === "personal";
  const scan = personal ? bridge?.personalScan : bridge?.scan;
  const [manifest, setManifest] = useState<LocalLibraryManifest>();
  const [failure, setFailure] = useState("");
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  useEffect(() => {
    if (!open || !scan) return;
    let cancelled = false;
    setQuery("");
    setFailure("");
    setChosen(selected);
    setManifest(undefined);
    void (async () => {
      try {
        const next = await scan();
        if (!cancelled) setManifest(next);
      } catch (e) {
        if (!cancelled)
          setFailure(e instanceof Error ? e.message : "读取本地资料文件夹失败。");
      }
    })();
    return () => { cancelled = true; };
    // The selection resets each time the dialog opens, not on every prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scan]);
  const files = manifest?.files;
  const search = query.trim().toLocaleLowerCase();
  const shown = (files || []).filter(
    (file) => !search || file.rel.toLocaleLowerCase().includes(search),
  );
  const toggle = (rel: string) =>
    setChosen((value) =>
      value.includes(rel)
        ? value.filter((item) => item !== rel)
        : personal && value.length >= personalSelectionLimit
        ? value
        : [...value, rel],
    );
  return (
    <Modal
      title={personal ? "从我的资料取用" : "从课题组本机目录选择"}
      open={open}
      onCancel={onClose}
      width={720}
      footer={null}
      destroyOnClose
    >
      <p className="workspace-muted">
        {personal
          ? "所选文件会复制到本机任务工作文件夹。"
          : "从已关联的课题组本机目录中选择文件。"}
      </p>
      {!scan && (
        <Alert type="info" message="需要在 Windows 客户端里使用本地资料文件夹。" />
      )}
      {failure && <Alert type="error" message={failure} />}
      {scan && !files && !failure && <Spin tip="正在读取文件列表" />}
      {files && (
        <>
          <Input.Search
            aria-label="查找文件"
            placeholder="按文件名或路径查找"
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="local-library-list">
            {shown.map((file) => (
              <label key={file.rel} className="local-library-row">
                <Checkbox
                  checked={chosen.includes(file.rel)}
                  disabled={personal && (
                    file.size === 0 ||
                    (chosen.length >= personalSelectionLimit && !chosen.includes(file.rel))
                  )}
                  onChange={() => toggle(file.rel)}
                />
                <span>
                  <strong>{file.name}</strong>
                  <small>{file.rel}{personal && file.size === 0 ? " · 空文件" : ""}</small>
                </span>
                <em>{formatLocalFileSize(file.size)}</em>
              </label>
            ))}
            {!shown.length && (
              <p className="workspace-muted">
                {personal && !files.length
                  ? "可以先在「资料 → 我的资料」中添加文件。"
                  : "没有匹配的文件。"}
              </p>
            )}
          </div>
          {manifest?.truncated && (
            <p className="workspace-muted">
              文件夹较大，此处仅显示部分文件。
            </p>
          )}
          <div className="workspace-standards-actions">
            <Button
              type="primary"
              disabled={!chosen.length}
              onClick={() => onPick(chosen)}
            >
              {confirmLabel}
            </Button>
            <Button onClick={onClose}>取消</Button>
            <span className="workspace-muted">
              已选 {chosen.length} 个{personal ? `（最多 ${personalSelectionLimit} 个）` : ""}
            </span>
          </div>
        </>
      )}
    </Modal>
  );
}
