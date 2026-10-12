import { Alert, Button, Checkbox, Input, Modal, Select } from "antd";
import { useEffect, useRef, useState } from "react";
import type { RequestFor, ResponseFor } from "@research-agent-platform/contracts";
import type {
  ZoteroCollection,
  ZoteroGrant,
  ZoteroItem,
  ZoteroPage,
} from "../types/zotero";
import { researchApi, ResearchApiError } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { fileAsBase64 } from "./research-library-api";
import { zoteroDocument } from "./zotero-document";

type Collection = ResponseFor<"researchCollections">["data"][number];
type ImportRequest = RequestFor<"importResearchFile">["body"];
const message = (e: unknown) => (e instanceof Error ? e.message : "操作失败，请重试。");

export function ZoteroImport({
  collection,
  onClose,
  onSaved,
}: {
  collection: Collection;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [grant, setGrant] = useState<ZoteroGrant>();
  const grantRef = useRef<ZoteroGrant>();
  const [collections, setCollections] = useState<ZoteroCollection[]>([]);
  const [collectionMore, setCollectionMore] = useState(false),
    collectionOffset = useRef(0);
  const [collectionKey, setCollectionKey] = useState("");
  const [query, setQuery] = useState(""),
    [page, setPage] = useState<ZoteroPage<ZoteroItem>>();
  const searchRef = useRef({ collectionKey: "", query: "" });
  const [selected, setSelected] = useState<ZoteroItem[]>([]);
  const [busy, setBusy] = useState(false),
    busyRef = useRef(false);
  const [error, setError] = useState(""),
    [preview, setPreview] = useState<string>();
  const attempt = useRef<{ body: ImportRequest; key: string }>();
  const [locked, setLocked] = useState(false),
    [savedId, setSavedId] = useState<string>();
  const operation = usePersonalOperation(true, `zotero-import:${collection.id}`);
  const scopeRef = useRef(operation.scope);
  const release = () => {
    const id = grantRef.current?.id;
    grantRef.current = undefined;
    if (id) void window.electronAPI?.releaseLocalZotero(id).catch(() => {});
  };
  useEffect(() => () => release(), []);
  useEffect(() => {
    if (scopeRef.current !== operation.scope) {
      release();
      onClose();
    }
    scopeRef.current = operation.scope;
  }, [operation.scope]);

  async function run(action: (isCurrent: () => boolean) => Promise<void>) {
    if (busyRef.current) return;
    const { isCurrent } = operation.capture();
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await action(isCurrent);
    } catch (e) {
      if (isCurrent()) setError(message(e));
    } finally {
      busyRef.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  async function readCollections(id: string, start: number, isCurrent: () => boolean) {
    const result = await window.electronAPI!.readLocalZotero(id, {
      kind: "collections",
      start,
    });
    if (!isCurrent()) return;
    const values = result.items as ZoteroCollection[];
    setCollections((previous) =>
      start
        ? [...previous, ...values.filter((v) => !previous.some((p) => p.key === v.key))]
        : values,
    );
    collectionOffset.current = start;
    setCollectionMore(result.hasMore);
  }
  async function connect(isCurrent: () => boolean) {
    release();
    setGrant(undefined);
    setCollections([]);
    setPage(undefined);
    setSelected([]);
    setCollectionKey("");
    const value = await window.electronAPI!.connectLocalZotero();
    if (!value) return;
    if (!isCurrent()) {
      void window.electronAPI!.releaseLocalZotero(value.id).catch(() => {});
      return;
    }
    grantRef.current = value;
    setGrant(value);
    await readCollections(value.id, 0, isCurrent);
  }
  async function search(start: number, isCurrent: () => boolean) {
    if (!grant) throw Error("请先连接本机 Zotero。");
    if (!start) searchRef.current = { collectionKey, query: query.trim() };
    setPage(undefined);
    setSelected([]);
    const result = await window.electronAPI!.readLocalZotero(grant.id, {
      kind: "items",
      start,
      ...searchRef.current,
    });
    if (isCurrent()) setPage(result as ZoteroPage<ZoteroItem>);
  }
  async function submit(isCurrent: () => boolean) {
    if (!preview || savedId) return;
    if (!attempt.current) {
      const current = await researchApi("researchCollections", {
        query: { scope: "mine", limit: 100 },
      });
      if (!isCurrent()) return;
      const target = current.data.find((c) => c.id === collection.id);
      if (
        !target?.owned ||
        target.scope !== "owner_private" ||
        target.status !== "available"
      )
        throw Error(
          "目标集合已变化。Zotero 导入仅支持当前属于你的私人集合，请重新选择。",
        );
      const contentBase64 = await fileAsBase64(
        new File([preview], "zotero-selected.txt", { type: "text/plain" }),
      );
      if (!isCurrent()) return;
      attempt.current = {
        key: crypto.randomUUID(),
        body: {
          expectedCollectionVersion: target.version,
          filename: `Zotero文献选择-${selected.length}条.txt`,
          mediaType: "text/plain",
          contentBase64,
          metadata: {
            title: "Zotero 文献元数据与摘要",
            authors: [],
            year: null,
            doi: null,
            tags: ["Zotero", "元数据与摘要"],
            note: "用户选择后导入的个人库记录；未读取 PDF 或正文。",
          },
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
      setSavedId(result.data.id);
      release();
      setGrant(undefined);
      try {
        await onSaved();
      } catch (e) {
        if (isCurrent()) setError(`资料已导入，列表刷新失败：${message(e)}`);
      }
    } catch (e) {
      // Definite version rejection made no write; uncertain outcomes retry the same body/key.
      if (
        isCurrent() &&
        e instanceof ResearchApiError &&
        e.code === "VERSION_CONFLICT"
      ) {
        attempt.current = undefined;
        setLocked(false);
      }
      throw e;
    }
  }
  const available = !!window.electronAPI?.connectLocalZotero;
  return (
    <Modal
      open
      title="从 Zotero 选择文献"
      width={820}
      centered
      footer={null}
      destroyOnClose
      styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
      onCancel={() => {
        if (!busyRef.current) onClose();
      }}
      maskClosable={!busy}
      closable={!busy}
    >
      <div className="zotero-import">
        <p className="zotero-scope">
          导入到 <strong>{collection.name}</strong> · 仅自己
        </p>
        <p className="research-library-muted">
          只读本机个人文献库的元数据与摘要。选中、预览并确认后才上传到
          AcceptCat；不会读取 PDF、正文或批注。
        </p>
        {!available && (
          <Alert
            type="info"
            message="此功能需要支持 Zotero 连接的 Windows 桌面版本。"
          />
        )}
        {error && <Alert type="error" message={error} />}
        {savedId ? (
          <>
            <Alert
              type="success"
              message={`已保存 ${selected.length} 条文献的元数据与摘要，未读取全文。`}
            />
            <div className="research-library-actions">
              <Button onClick={() => void run(async () => onSaved())}>
                刷新资料列表
              </Button>
              <Button type="primary" onClick={onClose}>
                完成
              </Button>
            </div>
          </>
        ) : preview !== undefined ? (
          <>
            <h3>核对将要上传的文字</h3>
            <pre className="research-source-preview" aria-label="Zotero 导入预览">
              {preview}
            </pre>
            {locked && (
              <p role="status">
                原请求已保留，重试使用同一编号，避免响应不确定时重复导入。
              </p>
            )}
            <div className="research-library-actions">
              <Button
                disabled={busy || locked}
                onClick={() => {
                  setPreview(undefined);
                  attempt.current = undefined;
                }}
              >
                返回选择
              </Button>
              <Button type="primary" loading={busy} onClick={() => void run(submit)}>
                {locked ? "重试原导入" : "确认导入到私人集合"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="research-library-actions">
              <Button
                disabled={!available}
                loading={busy && !grant}
                onClick={() => void run(connect)}
              >
                {grant ? "重新连接" : "连接本机 Zotero"}
              </Button>
              {grant && (
                <Button
                  disabled={busy}
                  onClick={() => {
                    release();
                    setGrant(undefined);
                    setCollections([]);
                    setPage(undefined);
                    setSelected([]);
                  }}
                >
                  断开
                </Button>
              )}
            </div>
            {!grant && (
              <p>
                打开 Zotero，在“设置 → 高级”启用“允许其他应用与 Zotero
                通信”，然后连接。无需模型 Key 或 Zotero 插件。
              </p>
            )}
            {grant && (
              <>
                <label>
                  本机个人库集合
                  <Select
                    aria-label="Zotero 集合"
                    value={collectionKey}
                    disabled={busy}
                    onChange={(value) => {
                      setCollectionKey(value);
                      setPage(undefined);
                      setSelected([]);
                    }}
                    options={[
                      { value: "", label: "个人库全部条目" },
                      ...collections.map((c) => ({ value: c.key, label: c.name })),
                    ]}
                  />
                </label>
                {collectionMore && (
                  <Button
                    disabled={busy || collectionOffset.current >= 5000}
                    onClick={() =>
                      void run((current) =>
                        readCollections(
                          grant.id,
                          collectionOffset.current + 25,
                          current,
                        ),
                      )
                    }
                  >
                    读取下一页集合
                  </Button>
                )}
                <Input.Search
                  aria-label="Zotero 检索词"
                  placeholder="检索标题、作者或年份"
                  maxLength={200}
                  value={query}
                  disabled={busy}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(undefined);
                    setSelected([]);
                  }}
                  onSearch={() => void run((current) => search(0, current))}
                  enterButton="检索文献"
                />
                {page && (
                  <>
                    <p className="research-library-muted">
                      第 {page.start / 25 + 1} 页 · 当前 {page.items.length}{" "}
                      条文献。每页最多读取 25 条，未展开附件和笔记。
                    </p>
                    {!page.items.length && (
                      <p role="status">本页未找到文献，尝试其他集合或关键词。</p>
                    )}
                    <div className="zotero-results">
                      {page.items.map((item) => (
                        <div className="zotero-result" key={item.key}>
                          <Checkbox
                            checked={selected.some((s) => s.key === item.key)}
                            disabled={busy}
                            onChange={(e) =>
                              setSelected((previous) =>
                                e.target.checked
                                  ? [...previous, item]
                                  : previous.filter((s) => s.key !== item.key),
                              )
                            }
                          >
                            {item.title}
                          </Checkbox>
                          <p>
                            {item.authors.join("、") || "未提供作者"} ·{" "}
                            {item.date || "未提供日期"}
                          </p>
                          <small>
                            {item.abstract
                              ? "有摘要 · 未读取全文"
                              : "仅元数据 · 未提供摘要"}{" "}
                            · {item.key}
                          </small>
                        </div>
                      ))}
                    </div>
                    <div className="research-library-actions">
                      <Button
                        disabled={busy || !page.start}
                        onClick={() =>
                          void run((current) => search(page.start - 25, current))
                        }
                      >
                        上一页
                      </Button>
                      <Button
                        disabled={busy || !page.hasMore || page.start >= 5000}
                        onClick={() =>
                          void run((current) => search(page.start + 25, current))
                        }
                      >
                        下一页
                      </Button>
                      <Button
                        type="primary"
                        disabled={busy || !selected.length}
                        onClick={() =>
                          setPreview(zoteroDocument(selected, grant.serverId))
                        }
                      >
                        预览选中的 {selected.length} 条
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
