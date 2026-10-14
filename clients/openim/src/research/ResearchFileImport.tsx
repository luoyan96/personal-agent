import { Alert, App, Button, Input, Modal } from "antd";
import { useEffect, useRef, useState } from "react";
import type { RequestFor, ResponseFor } from "@research-agent-platform/contracts";
import { researchApi, ResearchApiError } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import {
  fileAsBase64,
  researchFileMediaType,
  researchScopeLabels,
} from "./research-library-api";

type Collection = ResponseFor<"researchCollections">["data"][number];
type Source = ResponseFor<"researchFiles">["data"][number];
type ImportBody = RequestFor<"importResearchFile">["body"];
const message = (error: unknown) =>
  error instanceof Error ? error.message : "导入未完成，请重试。";
const split = (value: string) =>
  value
    .split(/[,，\n]/)
    .map((v) => v.trim())
    .filter(Boolean);
function definitelyRejected(error: unknown) {
  return (
    error instanceof ResearchApiError &&
    (error.code === "VERSION_CONFLICT" ||
      (error.code === "VALIDATION_ERROR" && error.status === 0) ||
      [400, 403, 404, 413, 422].includes(error.status))
  );
}
function sameScope(a: Collection, b: Collection) {
  return (
    a.scope === b.scope &&
    JSON.stringify([...a.taskIds].sort()) === JSON.stringify([...b.taskIds].sort())
  );
}

export function ResearchFileImport({
  collection,
  source,
  onClose,
  onSaved,
}: {
  collection: Collection;
  source?: Source;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [file, setFile] = useState<File>(),
    [title, setTitle] = useState(source?.metadata.title || "");
  const [authors, setAuthors] = useState(source?.metadata.authors.join("，") || ""),
    [tags, setTags] = useState(source?.metadata.tags.join("，") || ""),
    [note, setNote] = useState(source?.metadata.note || "");
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [error, setError] = useState(""),
    [locked, setLocked] = useState(false),
    [blocked, setBlocked] = useState(false),
    [saved, setSaved] = useState<Source>();
  const attempt = useRef<{ key: string; body: ImportBody }>();
  const collectionVersion = useRef(collection.version),
    sourceVersion = useRef(source?.version);
  const operation = usePersonalOperation(
      true,
      `file-import:${collection.id}:${source?.id || "new"}`,
    ),
    scopeRef = useRef(operation.scope);
  const { modal } = App.useApp();
  useEffect(() => {
    if (scopeRef.current !== operation.scope) {
      attempt.current = undefined;
      setFile(undefined);
      onClose();
    }
    scopeRef.current = operation.scope;
  }, [operation.scope]);

  async function synchronize(isCurrent: () => boolean) {
    try {
      await onSaved();
      if (isCurrent()) onClose();
    } catch (failure) {
      if (isCurrent())
        setError(`服务器已确认来源，列表刷新未完成：${message(failure)}`);
    }
  }
  async function run(action: (isCurrent: () => boolean) => Promise<void>) {
    if (busyRef.current) return;
    const { isCurrent } = operation.capture();
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action(isCurrent);
    } catch (failure) {
      if (isCurrent()) setError(message(failure));
    } finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  async function submit(isCurrent: () => boolean) {
    if (!file || saved || blocked) return;
    if (!attempt.current) {
      const contentBase64 = await fileAsBase64(file);
      if (!isCurrent()) return;
      attempt.current = {
        key: crypto.randomUUID(),
        body: {
          expectedCollectionVersion: collectionVersion.current,
          filename: file.name,
          mediaType: researchFileMediaType(file),
          contentBase64,
          metadata: {
            title,
            authors: split(authors),
            tags: split(tags),
            note,
            year: source?.metadata.year ?? null,
            doi: source?.metadata.doi ?? null,
          },
          ...(source
            ? { fileId: source.id, expectedVersion: sourceVersion.current! }
            : {}),
        },
      };
    }
    setLocked(true);
    try {
      const result = await researchApi("importResearchFile", {
        params: { id: collection.id },
        body: attempt.current.body,
        idempotencyKey: attempt.current.key,
      });
      if (!isCurrent()) return;
      setSaved(result.data);
      attempt.current = undefined;
      await synchronize(isCurrent);
    } catch (failure) {
      if (!isCurrent()) return;
      // Known validation/version/permission rejections did not write. Network,
      // timeout, server and unreadable responses keep the exact snapshot/key.
      if (definitelyRejected(failure)) {
        attempt.current = undefined;
        setLocked(false);
        if (
          failure instanceof ResearchApiError &&
          failure.code === "VERSION_CONFLICT"
        ) {
          const [collections, details] = await Promise.all([
            researchApi("researchCollections", {
              query: { scope: "mine", limit: 100 },
            }),
            source
              ? researchApi("researchFile", { params: { id: source.id } })
              : Promise.resolve(undefined),
          ]);
          if (!isCurrent()) return;
          const target = collections.data.find((c) => c.id === collection.id);
          if (
            !target?.owned ||
            target.status !== "available" ||
            !sameScope(target, collection)
          ) {
            setBlocked(true);
            throw Error(
              "集合的可用状态或资料范围已变化，本次没有写入。草稿已保留，请重新打开导入窗口并核对范围。",
            );
          }
          collectionVersion.current = target.version;
          sourceVersion.current = details?.data.file.version ?? sourceVersion.current;
        }
      }
      throw failure;
    }
  }
  function close() {
    if (busyRef.current) return;
    if (attempt.current) {
      modal.confirm({
        title: "导入结果尚未确认",
        content:
          "文件可能已保存。建议先重试确认结果；关闭后重新发起导入可能产生重复来源。",
        okText: "仍然关闭",
        cancelText: "继续确认结果",
        onOk: onClose,
      });
    } else onClose();
  }
  const disabled = busy || locked || !!saved;
  return (
    <Modal
      title={source ? "导入新版本" : "导入资料与素材"}
      open
      footer={null}
      onCancel={close}
      maskClosable={!busy}
      closable={!busy}
      width={620}
      centered
      styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
    >
      <div className="research-library-form">
        <p>
          保存到“{collection.name}” · {researchScopeLabels[collection.scope]}
          。每份文件不超过 10 MiB。
        </p>
        <label>
          原始文件
          <input
            type="file"
            aria-label="导入原始文件"
            disabled={disabled}
            onChange={(e) => setFile(e.target.files?.[0])}
          />
        </label>
        <p className="research-library-muted">
          含文字 PDF、TXT、Markdown、CSV
          可提取文字；图片、代码与其他素材保存原件，不执行脚本或声称理解图像。
        </p>
        <label>
          标题
          <Input
            aria-label="资料标题"
            maxLength={500}
            value={title}
            disabled={disabled}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label>
          作者
          <Input
            aria-label="资料作者"
            value={authors}
            disabled={disabled}
            onChange={(e) => setAuthors(e.target.value)}
            placeholder="用逗号分隔"
          />
        </label>
        <label>
          标签
          <Input
            aria-label="资料标签"
            value={tags}
            disabled={disabled}
            onChange={(e) => setTags(e.target.value)}
            placeholder="用逗号分隔"
          />
        </label>
        <label>
          备注
          <Input.TextArea
            aria-label="资料备注"
            rows={3}
            maxLength={4000}
            value={note}
            disabled={disabled}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        {locked && !saved && !busy && (
          <Alert
            type="info"
            showIcon
            message="导入结果尚未确认"
            description="已保留首次提交的文件和资料信息。重试只确认原请求；确认前暂时不能更换文件或编辑内容。"
          />
        )}
        {saved && (
          <Alert
            type="success"
            showIcon
            message={`服务器已确认来源：${saved.filename} · 当前 v${saved.version}`}
            description="文件已保存；刷新列表不会再次导入。"
          />
        )}
        {error && <Alert type="error" message={error} />}
        {saved ? (
          <div>
            <Button type="primary" loading={busy} onClick={() => void run(synchronize)}>
              刷新列表
            </Button>
            <Button disabled={busy} onClick={onClose}>
              完成
            </Button>
          </div>
        ) : (
          <Button
            type="primary"
            disabled={!file || blocked}
            loading={busy}
            onClick={() => void run(submit)}
          >
            {locked ? "重试确认原导入" : error ? "重试导入" : "确认导入"}
          </Button>
        )}
      </div>
    </Modal>
  );
}
