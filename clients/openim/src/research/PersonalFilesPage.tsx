import "./personal-files.scss";

import { FileTextOutlined, FolderOpenOutlined, PlusOutlined, ReloadOutlined } from "@ant-design/icons";
import { Alert, Button, Checkbox, Input } from "antd";
import { useState } from "react";

import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
import { formatLocalFileSize } from "./local-file-size";
import { canUseInWorkbench, workbenchReferenceMaxBytes } from "../../electron/utils/workbenchMaterialFormats";
import { MaterialUseIn, useMaterialSelection } from "./MaterialUseIn";

const errorMessage = (error: unknown) =>
  error instanceof Error
    ? error.message.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "")
    : "操作未完成，请重试。";

export function PersonalFilesPage() {
  const bridge = window.electronAPI?.localLibrary;
  const supported = Boolean(bridge?.personalScan);
  const operation = usePersonalOperation(supported, "personal-files");
  const ready = supported && Boolean(operation.actorId);
  const read = useResearchRead(
    async () => {
      try {
        return await bridge!.personalScan();
      } catch (error) {
        throw new Error(errorMessage(error));
      }
    },
    "personal-files",
    ready,
    { poll: false },
  );
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<{ scope: string; name: string }>();
  const [failure, setFailure] = useState<{ scope: string; message: string }>();
  const busy = action?.scope === operation.scope ? action.name : undefined;
  const actionError = failure?.scope === operation.scope ? failure.message : "";
  const files = read.data?.files ?? [];
  const selection = useMaterialSelection(operation.scope);
  const canStage = Boolean(window.electronAPI?.localDsh?.stageMaterialUseIn);
  const selected = files.filter((file) => selection.paths.has(file.rel));
  const search = query.trim().toLocaleLowerCase();
  const visible = search
    ? files.filter((file) => file.rel.toLocaleLowerCase().includes(search))
    : files;
  const act = async (name: string, work: (isCurrent: () => boolean) => Promise<unknown>) => {
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    setAction({ scope: operation.scope, name });
    setFailure(undefined);
    try {
      await work(isCurrent);
    } catch (error) {
      if (isCurrent()) setFailure({ scope: operation.scope, message: errorMessage(error) });
    } finally {
      if (isCurrent()) setAction(undefined);
    }
  };
  return (
    <section className="personal-files" aria-labelledby="personal-files-heading">
      <header className="personal-files-header">
        <div>
          <h2 id="personal-files-heading">我的资料</h2>
          <p>文件保存在这台电脑的 myfiles 文件夹中。</p>
        </div>
        {ready && (
          <div className="personal-files-actions">
            <MaterialUseIn source={{ source: "personal", files: selected }} busy={Boolean(busy) || read.loading} />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              loading={busy === "add"}
              disabled={Boolean(busy) || read.loading}
              onClick={() => void act("add", async (isCurrent) => {
                const added = await bridge!.addPersonalFiles();
                if (added && isCurrent()) await read.refresh();
              })}
            >
              添加文件
            </Button>
            <Button
              icon={<FolderOpenOutlined />}
              loading={busy === "folder"}
              disabled={Boolean(busy)}
              onClick={() => void act("folder", () => bridge!.openPersonalFolder())}
            >
              打开文件夹
            </Button>
            <Button
              icon={<ReloadOutlined />}
              loading={read.loading}
              disabled={Boolean(busy)}
              onClick={() => {
                setFailure(undefined);
                void read.refresh();
              }}
            >
              刷新
            </Button>
          </div>
        )}
      </header>
      {!supported && <p>请在 Windows 桌面客户端查看本机资料。</p>}
      {supported && !ready && <p>登录后可以查看当前账号的本机资料。</p>}
      {read.data && <p className="personal-files-path">{read.data.root}</p>}
      {read.error && (
        <Alert type="error" showIcon message="暂时无法读取我的资料" description={read.error} />
      )}
      {actionError && <Alert type="error" showIcon message={actionError} />}
      {ready && !read.data && !read.error && <p role="status">正在读取文件…</p>}
      {read.data && files.length === 0 && (
        <div className="personal-files-empty">
          <h3>还没有文件</h3>
          <p>可以添加文件，也可以打开文件夹后直接粘贴。</p>
        </div>
      )}
      {files.length > 0 && (
        <Input.Search
          aria-label="搜索我的资料"
          placeholder="按文件名或路径查找"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          allowClear
        />
      )}
      {files.length > 0 && visible.length === 0 && <p>没有匹配的文件。</p>}
      {visible.length > 0 && (
        <ul className="personal-files-list">
          {visible.map((file) => (
            <li key={file.rel}>
              {canStage && <Checkbox
                aria-label={`选择 ${file.rel}`}
                disabled={!canUseInWorkbench(file.name) || file.size < 1 || file.size > workbenchReferenceMaxBytes ||
                  (selection.paths.size >= 10 && !selection.paths.has(file.rel))}
                checked={selection.paths.has(file.rel)}
                onChange={(event) => selection.toggle(file.rel, event.target.checked)}
              />}
              <FileTextOutlined aria-hidden="true" />
              <div className="personal-files-name">
                <strong>{file.name}</strong>
                {file.rel !== file.name && <small>{file.rel}</small>}
              </div>
              <span className="personal-files-size">
                {formatLocalFileSize(file.size)}
              </span>
              <Button
                size="small"
                aria-label={`定位文件 ${file.rel}`}
                disabled={Boolean(busy)}
                onClick={() => void act("reveal", () => bridge!.revealPersonalFile(file.rel))}
              >
                定位文件
              </Button>
            </li>
          ))}
        </ul>
      )}
      {read.data?.truncated && (
        <p>文件较多，这里显示部分结果。打开文件夹可查看完整内容。</p>
      )}
    </section>
  );
}
