import { Alert, Badge, Button, Checkbox, Modal, Popover, Select } from "antd";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { prepareWeChatDraft } from "../../electron/wechat-import/composer.mjs";
import type { SharedWeChatBatch, WeChatPreview } from "../types/wechatImport";

export function WeChatImportAction({
  conversationID,
  memberId,
  onStage,
  children,
  chooseFiles,
}: {
  conversationID: string;
  memberId?: string;
  onStage: (text: string, files: File[]) => void;
  children: ReactNode;
  chooseFiles: () => void;
}) {
  const client = window.electronAPI?.wechatImport;
  const [scope, setScope] = useState<string>();
  const currentScope = useRef<string>();
  const request = useRef(0);
  const retained = useRef<{ scope: string; preview: WeChatPreview }>();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<WeChatPreview>();
  const [selection, setSelection] = useState<string[]>([]);
  const [includeOriginal, setIncludeOriginal] = useState(false);
  const [asFile, setAsFile] = useState(false);
  const [shares, setShares] = useState<SharedWeChatBatch[]>([]);
  const [registered, setRegistered] = useState<boolean>();
  const [batchId, setBatchId] = useState<string>();
  const refreshShares = async (lease: string) => {
    const next = await client!.pending(lease);
    if (currentScope.current === lease) setShares(next);
  };
  useEffect(() => {
    if (!client || !memberId || !conversationID) return;
    let alive = true;
    void client
      .context({ memberId, conversationID, visit: crypto.randomUUID() })
      .then((lease) => {
        if (!alive || !lease) return;
        currentScope.current = lease;
        setScope(lease);
        void refreshShares(lease).catch(() => {});
        void client
          .registration(lease)
          .then((value) => {
            if (currentScope.current === lease) setRegistered(value);
          })
          .catch(() => {
            if (currentScope.current === lease) setRegistered(false);
          });
      })
      .catch(() => {
        if (alive) setError("导入账号核对未完成，请重新打开会话后重试。");
      });
    const unsubscribe = client.onShared(() => {
      if (currentScope.current)
        void refreshShares(currentScope.current).catch(() => {});
    });
    return () => {
      alive = false;
      currentScope.current = undefined;
      request.current++;
      unsubscribe();
      void client.context(null).catch(() => {});
    };
  }, [client, memberId, conversationID]);

  const release = async () => {
    const item = retained.current;
    retained.current = undefined;
    if (item) await client!.release(item.scope, item.preview.token).catch(() => {});
  };
  const cancel = () => {
    request.current++;
    setOpen(false);
    setPreview(undefined);
    void release();
  };
  const choose = async (id?: string) => {
    if (!scope || !client) return;
    setMenuOpen(false);
    const version = ++request.current;
    setOpen(true);
    setBusy(true);
    setError("");
    setPreview(undefined);
    setSelection([]);
    setIncludeOriginal(false);
    setBatchId(id);
    await release();
    try {
      const next = await client.choose(scope, id);
      if (version !== request.current || currentScope.current !== scope) {
        if (next) await client.release(scope, next.token).catch(() => {});
        return;
      }
      if (!next) {
        setOpen(false);
        return;
      }
      retained.current = { scope, preview: next };
      setPreview(next);
      setAsFile((next.rawText?.length || 0) > 6000);
    } catch (cause) {
      if (version === request.current)
        setError(cause instanceof Error ? cause.message : "导入未完成，请重试。");
    } finally {
      if (version === request.current) setBusy(false);
    }
  };
  const selectTranscript = async (id: string) => {
    if (!scope || !preview || !client) return;
    const version = request.current;
    setBusy(true);
    setError("");
    try {
      const bytes = await client.read(scope, preview.token, id);
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (version !== request.current || currentScope.current !== scope) return;
      setPreview({
        ...preview,
        rawText: text,
        transcriptName: preview.attachments.find((item) => item.id === id)!.name,
      });
      setAsFile(text.length > 6000);
    } catch {
      if (version === request.current) setError("这份文件无法作为 UTF-8 正文读取。");
    } finally {
      if (version === request.current) setBusy(false);
    }
  };
  const confirm = async () => {
    if (!scope || !preview || !client) return;
    const version = request.current;
    setBusy(true);
    setError("");
    try {
      const draft = await prepareWeChatDraft({
        client,
        scope,
        preview,
        attachmentIds: selection,
        includeOriginal,
        isCurrentScope: (value) =>
          currentScope.current === value && version === request.current,
      });
      const label = `【外部来源材料 · 微信分享记录 · SHA256 ${draft.sourceHash}】`;
      const files = [...draft.files];
      if (asFile && draft.text)
        files.unshift(
          new File([draft.text], "微信聊天原文.txt", { type: "text/plain" }),
        );
      const text = draft.text
        ? `${label}\n${asFile ? "聊天原文见附件。" : draft.text}`
        : files.length
        ? label
        : "";
      if (!text && !files.length) throw Error("请选择聊天正文或需要导入的附件。");
      // All host capacity checks and scope checks happen before either draft is changed.
      onStage(text, files);
      setOpen(false);
      setPreview(undefined);
      await release();
      if (batchId) {
        await client.acknowledge(scope, batchId).catch(() => {});
        await refreshShares(scope).catch(() => {});
      }
    } catch (cause) {
      if (version === request.current)
        setError(
          cause instanceof Error ? cause.message : "暂存失败，请减少选择后重试。",
        );
    } finally {
      if (version === request.current) setBusy(false);
    }
  };
  if (!client) return <span onClick={chooseFiles}>{children}</span>;
  return (
    <>
      <Popover
        trigger="click"
        placement="topLeft"
        open={menuOpen}
        onOpenChange={setMenuOpen}
        content={
          <div className="flex flex-col items-start">
            <Button
              type="text"
              onClick={() => {
                setMenuOpen(false);
                chooseFiles();
              }}
            >
              添加图片或文件
            </Button>
            <Button
              type="text"
              disabled={!scope || busy}
              title={error || undefined}
              onClick={() => void choose()}
            >
              导入微信分享包
            </Button>
            {registered === false && (
              <span
                style={{
                  maxWidth: 250,
                  padding: "4px 12px",
                  color: "#657477",
                  fontSize: 12,
                }}
              >
                Windows 分享入口尚未注册，可先选择 ZIP 导入。
              </span>
            )}
            {shares.map((item) => (
              <Button
                key={item.id}
                type="text"
                disabled={!scope || busy}
                onClick={() => void choose(item.id)}
              >
                Windows 分享 · {item.name}
              </Button>
            ))}
          </div>
        }
      >
        <Badge count={shares.length} size="small">
          <span>{children}</span>
        </Badge>
      </Popover>
      <Modal
        title="导入微信分享记录"
        open={open}
        width={760}
        onCancel={cancel}
        destroyOnClose
        footer={
          <>
            <Button onClick={cancel}>取消</Button>
            <Button
              type="primary"
              loading={busy}
              disabled={!preview}
              onClick={() => void confirm()}
            >
              加入草稿
            </Button>
          </>
        }
      >
        <p>请核对这次导入的正文和附件。加入草稿后，由你确认发送。</p>
        {error && <Alert type="error" message={error} showIcon />}
        {preview && (
          <>
            <p>
              {preview.archiveName} · {(preview.originalSize / 1024).toFixed(1)} KiB
              {preview.messages ? ` · ${preview.messages.length} 条记录` : ""}
            </p>
            {preview.warnings.map((warning) => (
              <p key={warning} className="text-slate-500">
                {warning}
              </p>
            ))}
            {preview.rawText === null && (
              <Select
                disabled={busy}
                placeholder="选择聊天正文（可选）"
                style={{ width: "100%" }}
                onChange={(id) => void selectTranscript(id)}
                options={preview.attachments
                  .filter((item) => /\.txt$/i.test(item.name))
                  .map((item) => ({ value: item.id, label: item.name }))}
              />
            )}
            {preview.rawText !== null && (
              <>
                <pre
                  style={{
                    maxHeight: "35vh",
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    overflowWrap: "anywhere",
                    padding: 12,
                    background: "#f4f6f7",
                  }}
                >
                  {preview.rawText.slice(0, 60000)}
                </pre>
                {preview.rawText.length > 60000 && (
                  <p>预览显示前 60000 字，原文完整保留。</p>
                )}
                <Checkbox
                  checked={asFile}
                  disabled={busy}
                  onChange={(event) => setAsFile(event.target.checked)}
                >
                  将完整正文作为 TXT 附件加入
                </Checkbox>
              </>
            )}
            <div style={{ maxHeight: "20vh", overflow: "auto", marginTop: 12 }}>
              {preview.attachments.map((item) => (
                <div key={item.id}>
                  <Checkbox
                    disabled={busy}
                    checked={selection.includes(item.id)}
                    onChange={(event) =>
                      setSelection((values) =>
                        event.target.checked
                          ? [...values, item.id]
                          : values.filter((id) => id !== item.id),
                      )
                    }
                  >
                    {item.name} · {(item.size / 1024).toFixed(1)} KiB
                  </Checkbox>
                </div>
              ))}
            </div>
            <Checkbox
              style={{ marginTop: 12 }}
              disabled={busy}
              checked={includeOriginal}
              onChange={(event) => setIncludeOriginal(event.target.checked)}
            >
              附上原始 ZIP
            </Checkbox>
          </>
        )}
      </Modal>
    </>
  );
}
