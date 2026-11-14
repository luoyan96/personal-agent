import { Alert, Input, Modal } from "antd";
import { useRef, useState } from "react";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";

type RepositoryStatus = ResponseFor<"teamRepository">["data"];
const message = (error: unknown) =>
  error instanceof Error ? error.message : "连接未完成，请重试。";

export function RepositoryEditor({
  current,
  onClose,
  onSaved,
}: {
  current?: RepositoryStatus;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [url, setUrl] = useState(current?.binding?.url || ""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const operation = usePersonalOperation(true, "team-repository-editor"),
    key = useRef(crypto.randomUUID()),
    submitting = useRef(false);
  const save = async () => {
    if (submitting.current || !url.trim()) return;
    submitting.current = true;
    const ticket = operation.capture();
    setBusy(true);
    setError("");
    try {
      const bridge = window.electronAPI?.teamLibrary;
      if (!bridge?.discover) throw Error("请使用更新后的 Windows 客户端连接仓库。");
      const value = await bridge.discover(url);
      if (!ticket.isCurrent()) return;
      await researchApi("saveTeamRepository", {
        body: { ...value, expectedVersion: current?.binding?.version || 0 },
        idempotencyKey: key.current,
      });
      if (ticket.isCurrent()) await onSaved();
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    } finally {
      submitting.current = false;
      if (ticket.isCurrent()) setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={current?.binding ? "团队仓库设置" : "连接团队仓库"}
      className="team-library-editor"
      closable={!busy}
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
      onCancel={onClose}
      onOk={save}
      cancelText="取消"
      confirmLoading={busy}
      okText={busy ? "正在连接" : "连接仓库"}
      okButtonProps={{ disabled: !url.trim() }}
    >
      <p>粘贴仓库地址即可。软件会自动识别分支和资料清单，连接后全组共用。</p>
      {error && <Alert type="error" message={error} />}
      <label>
        GitHub 仓库地址
        <Input
          autoFocus
          disabled={busy}
          placeholder="https://github.com/团队/资料仓库"
          autoComplete="off"
          spellCheck={false}
          value={url}
          onPressEnter={() => {
            if (url.trim() && !busy) void save();
          }}
          onChange={(e) => {
            setUrl(e.target.value);
            key.current = crypto.randomUUID();
          }}
        />
      </label>
      <p>
        地址末尾有无 .git 均可。私有仓库需要本机 Git
        已有访问权限；公开仓库中的资料对所有人可见。
      </p>
    </Modal>
  );
}
