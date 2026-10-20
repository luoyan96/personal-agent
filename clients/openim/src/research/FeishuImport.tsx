import { Alert, Button, Checkbox, Input, Modal, Select } from "antd";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { FeishuPreview, RequestFor } from "@research-agent-platform/contracts";
import { researchApi, ResearchApiError } from "./api";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { feishuPlanningDraft, stageFeishuPlanning } from "./feishu-planning";
import { openFeishuAuthorization } from "./feishu-authorization";

export function FeishuImport({
  collectionId,
  onClose,
  onSaved,
}: {
  collectionId?: string;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const navigate = useNavigate();
  const operation = usePersonalOperation(true, "feishu-import");
  const initialScope = useRef(operation.scope);
  const status = useResearchRead(
    (signal) => researchApi("feishuStatus", { signal }),
    "feishu-status",
  );
  const collections = useResearchRead(
    (signal) =>
      researchApi("researchCollections", {
        query: { scope: "mine", limit: 100 },
        signal,
      }),
    "feishu-private-collections",
  );
  const [target, setTarget] = useState(collectionId);
  const [url, setUrl] = useState(""),
    [authorizationUrl, setAuthorizationUrl] = useState("");
  const [authorizationExpires, setAuthorizationExpires] = useState("");
  const [authorizationExpired, setAuthorizationExpired] = useState(false);
  const [browserRequested, setBrowserRequested] = useState(false);
  const [copiedAuthorization, setCopiedAuthorization] = useState(false);
  const [showAuthorizationLink, setShowAuthorizationLink] = useState(false);
  const [authorizationHint, setAuthorizationHint] = useState("");
  const [preview, setPreview] = useState<FeishuPreview>();
  const [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [savedId, setSavedId] = useState(""),
    [excerpt, setExcerpt] = useState("");
  const attempt = useRef<{
    body: RequestFor<"importFeishuSnapshot">["body"];
    key: string;
  }>();
  const locked = useRef(false);
  const [uncertain, setUncertain] = useState(false);
  const privateCollections =
    collections.data?.data.filter((c) => c.owned && c.scope === "owner_private") || [];
  const currentTarget = privateCollections.find((c) => c.id === target);
  const connection = status.data?.data;
  useEffect(() => {
    if (!authorizationUrl || !authorizationExpires) return;
    const remaining = new Date(authorizationExpires).getTime() - Date.now();
    setAuthorizationExpired(remaining <= 0);
    const timer = setTimeout(
      () => setAuthorizationExpired(true),
      Math.max(0, remaining),
    );
    return () => clearTimeout(timer);
  }, [authorizationUrl, authorizationExpires]);
  useEffect(() => {
    if (connection?.state === "connected") {
      setAuthorizationUrl("");
      setAuthorizationHint("");
      setError("");
    }
  }, [connection?.state]);
  useEffect(() => {
    if (initialScope.current !== operation.scope) onClose();
  }, [operation.scope]);
  async function run(action: (current: () => boolean) => Promise<void>) {
    if (locked.current) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await action(isCurrent);
    } catch (e) {
      if (isCurrent())
        setError(e instanceof Error ? e.message : "操作未完成，请重试。");
    } finally {
      locked.current = false;
      if (isCurrent()) setBusy(false);
    }
  }
  async function connect(current: () => boolean) {
    const value = await researchApi("connectFeishu", { body: {} });
    if (!current()) return;
    setAuthorizationUrl(value.data.authorizationUrl);
    setAuthorizationExpires(value.data.expiresAt);
    setAuthorizationExpired(false);
    setBrowserRequested(false);
    setCopiedAuthorization(false);
    setShowAuthorizationLink(false);
    setAuthorizationHint("");
    // Desktop IPC does not depend on a browser popup gesture surviving fetch.
    if (window.electronAPI) {
      await openFeishuAuthorization(value.data.authorizationUrl);
      if (current()) setBrowserRequested(true);
    }
  }
  async function openAuthorization(current: () => boolean) {
    if (authorizationExpired || Date.now() >= new Date(authorizationExpires).getTime())
      throw new Error("本次链接已过期，请点击“重新连接”获取新链接。");
    await openFeishuAuthorization(authorizationUrl);
    if (current()) setBrowserRequested(true);
  }
  async function checkAuthorization(current: () => boolean) {
    const value = await researchApi("feishuStatus");
    if (!current()) return;
    if (value.data.state === "connected") {
      setAuthorizationUrl("");
      setAuthorizationHint("");
    } else {
      setAuthorizationHint(
        "还未检测到授权完成。请在浏览器中完成飞书授权，看到“飞书授权已完成”后，再返回这里检查。",
      );
    }
    await status.refresh();
  }
  async function read(current: () => boolean) {
    setPreview(undefined);
    setConfirmed(false);
    setExcerpt("");
    attempt.current = undefined;
    const value = await researchApi("previewFeishuDocument", {
      body: { url: url.trim() },
    });
    if (current()) {
      setPreview(value.data);
      setUrl(value.data.sourceUrl);
    }
  }
  async function save(current: () => boolean) {
    if (!preview || !confirmed || !currentTarget || savedId) return;
    if (!attempt.current)
      attempt.current = {
        key: crypto.randomUUID(),
        body: {
          previewId: preview.id,
          collectionId: currentTarget.id,
          expectedCollectionVersion: currentTarget.version,
          confirmPrivateSnapshot: true,
        },
      };
    setUncertain(true);
    try {
      const response = await researchApi("importFeishuSnapshot", {
        ...attempt.current,
        idempotencyKey: attempt.current.key,
      });
      if (!current()) return;
      setSavedId(response.data.id);
      setUncertain(false);
      try {
        await onSaved();
      } catch {
        if (current()) setError("副本已保存，资料列表刷新未完成，可稍后刷新。");
      }
    } catch (e) {
      if (
        current() &&
        e instanceof ResearchApiError &&
        [
          "VERSION_CONFLICT",
          "NOT_FOUND",
          "FORBIDDEN",
          "FEISHU_REAUTHORIZE",
          "FEISHU_ACCESS_DENIED",
        ].includes(e.code)
      ) {
        attempt.current = undefined;
        setUncertain(false);
        setPreview(undefined);
        setConfirmed(false);
        void collections.refresh();
        void status.refresh();
      }
      throw e;
    }
  }
  function plan() {
    const actor = useResearchStore.getState();
    if (!preview || !savedId || !excerpt.trim() || !actor.actor) return;
    let text: string;
    try {
      text = feishuPlanningDraft(preview, savedId, excerpt);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    const nonce = stageFeishuPlanning(actor.actor.member.id, actor.generation, text);
    navigate("/workbench?view=planning", { state: { feishuMaterialNonce: nonce } });
    onClose();
  }
  return (
    <Modal
      open
      title="连接飞书资料"
      width={820}
      centered
      footer={null}
      onCancel={() => {
        if (!busy) onClose();
      }}
      maskClosable={!busy}
      closable={!busy}
      styles={{ body: { maxHeight: "calc(100vh - 180px)", overflowY: "auto" } }}
    >
      <div className="feishu-import">
        <p className="research-library-muted">
          资料在飞书继续维护。选择一份文档，核对实际读取的文字，再保存本次副本。
        </p>
        {(error || status.error) && (
          <Alert
            type="warning"
            message={
              error ||
              (status.error
                ? "飞书接入服务尚不可用，请联系管理员完成服务更新，或重新检查。"
                : "")
            }
          />
        )}
        {!connection && !status.error && <p role="status">正在检查飞书连接…</p>}
        {connection?.state === "unconfigured" && (
          <Alert
            type="info"
            message="飞书应用尚未配置"
            description="请课题组管理员在飞书开放平台创建企业自建应用，配置文档只读权限与授权回调地址，再由服务管理员完成连接配置。应用密钥只保存在服务器。"
          />
        )}
        {connection && connection.state !== "unconfigured" && (
          <section className="feishu-connection">
            <div>
              <strong>
                {connection.state === "connected"
                  ? `已授权 · ${connection.displayName}`
                  : connection.state === "expired"
                  ? "飞书授权已过期"
                  : "尚未连接飞书"}
              </strong>
              <p className="research-library-muted">
                {connection.state === "connected"
                  ? `有效至 ${new Date(
                      connection.expiresAt!,
                    ).toLocaleString()}，到期后可重新授权。`
                  : "使用你的飞书账号授权，只读取你选定且有权阅读的文档。"}
              </p>
            </div>
            {!savedId && !authorizationUrl && (
              <Button
                type={connection.state === "connected" ? "default" : "primary"}
                disabled={busy || uncertain}
                onClick={() => void run(connect)}
              >
                {connection.state === "connected" ? "重新授权" : "连接飞书"}
              </Button>
            )}
          </section>
        )}
        {authorizationUrl && (
          <section className="feishu-authorization" aria-label="飞书授权步骤">
            <div className="feishu-authorization-step">
              <span className="feishu-step-number">1</span>
              <div>
                <h3>在浏览器中完成飞书授权</h3>
                <p>登录你自己的飞书账号，在授权页点击同意授权。</p>
                <div className="research-library-actions">
                  <Button
                    type="primary"
                    disabled={busy || authorizationExpired}
                    onClick={() => void run(openAuthorization)}
                  >
                    {browserRequested ? "再次打开飞书授权" : "打开飞书授权"}
                  </Button>
                  <Button
                    disabled={busy || authorizationExpired}
                    onClick={() =>
                      void run(async (current) => {
                        setShowAuthorizationLink(true);
                        try {
                          await navigator.clipboard.writeText(authorizationUrl);
                        } catch {
                          throw new Error(
                            "未能自动复制，请选中下面的授权链接，按 Ctrl+C 复制到浏览器地址栏。",
                          );
                        }
                        if (current()) setCopiedAuthorization(true);
                      })
                    }
                  >
                    {copiedAuthorization ? "已复制授权链接" : "复制授权链接"}
                  </Button>
                </div>
                <p role="status">
                  {browserRequested
                    ? "已请求系统浏览器打开。若没有看到授权页，可复制链接到 Edge 地址栏。"
                    : "点击上方按钮打开授权页；浏览器未打开时可复制链接。"}
                </p>
                {showAuthorizationLink && (
                  <Input.TextArea
                    aria-label="本次飞书授权链接"
                    value={authorizationUrl}
                    readOnly
                    autoSize={{ minRows: 2, maxRows: 4 }}
                    onFocus={(event) => event.target.select()}
                  />
                )}
                {authorizationExpired ? (
                  <p role="alert">本次链接已过期，点击“重新连接”获取新链接。</p>
                ) : (
                  <small>
                    本次链接 10 分钟内有效。授权未完成前，可再次打开同一个链接。
                  </small>
                )}
                <Button type="link" disabled={busy} onClick={() => void run(connect)}>
                  重新连接
                </Button>
              </div>
            </div>
            <div className="feishu-authorization-step">
              <span className="feishu-step-number">2</span>
              <div>
                <h3>返回 AcceptCat 检查结果</h3>
                <p>浏览器显示“飞书授权已完成”后，回到此处点击“检查授权结果”。</p>
                <Button
                  type="primary"
                  disabled={busy}
                  onClick={() => void run(checkAuthorization)}
                >
                  检查授权结果
                </Button>
              </div>
            </div>
          </section>
        )}
        {authorizationHint && <Alert type="info" message={authorizationHint} />}
        <div className="research-library-actions">
          {!authorizationUrl && (
            <Button disabled={busy} onClick={() => void run(checkAuthorization)}>
              检查授权结果
            </Button>
          )}
          {connection?.state === "connected" && !savedId && (
            <Button
              disabled={busy || uncertain}
              onClick={() =>
                void run(async (current) => {
                  await researchApi("disconnectFeishu", { body: {} });
                  if (current()) {
                    setPreview(undefined);
                    setAuthorizationUrl("");
                    setConfirmed(false);
                    await status.refresh();
                  }
                })
              }
            >
              断开飞书
            </Button>
          )}
        </div>
        {connection?.state === "connected" && !savedId && (
          <>
            <Alert
              type="success"
              message="飞书已连接，可以选择资料了"
              description="复制一份飞书文档或知识库文档的链接，粘贴到下面，再点击“读取并预览”。"
            />
            <label>
              飞书文档链接
              <Input
                aria-label="飞书文档链接"
                placeholder="https://你的团队.feishu.cn/docx/… 或 /wiki/…"
                value={url}
                maxLength={2048}
                disabled={busy || uncertain}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setPreview(undefined);
                  setConfirmed(false);
                }}
              />
            </label>
            <p className="research-library-muted">
              支持新版文档，以及知识库中的新版文档。仅纯文本，暂不读取图片、附件、评论或表格的视觉结构。
            </p>
            <Button
              type="primary"
              disabled={!url.trim() || uncertain}
              loading={busy}
              onClick={() => void run(read)}
            >
              读取并预览
            </Button>
          </>
        )}
        {preview && (
          <>
            <section className="feishu-preview-heading">
              <h3>{preview.title}</h3>
              <a href={preview.sourceUrl} target="_blank" rel="noreferrer">
                在飞书打开原文 ↗
              </a>
              <p className="research-library-muted">
                飞书修订 {preview.revision} · {preview.content.length} 字符 · 读取于{" "}
                {new Date(preview.readAt).toLocaleString()}
              </p>
            </section>
            <pre className="research-source-preview" aria-label="飞书纯文本预览">
              {preview.content}
            </pre>
            {!savedId ? (
              <>
                <label>
                  保存到私人集合
                  <Select
                    aria-label="飞书副本目标集合"
                    placeholder="选择仅自己可读的集合"
                    value={currentTarget?.id}
                    disabled={busy || uncertain}
                    onChange={setTarget}
                    options={privateCollections.map((c) => ({
                      value: c.id,
                      label: c.name,
                    }))}
                  />
                </label>
                {!privateCollections.length && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async (current) => {
                        const value = await researchApi("createResearchCollection", {
                          body: {
                            name: "飞书资料",
                            description: "我选择保存的飞书文档纯文本副本",
                            scope: "owner_private",
                            taskIds: [],
                          },
                          idempotencyKey: crypto.randomUUID(),
                        });
                        if (current()) {
                          setTarget(value.data.id);
                          await collections.refresh();
                        }
                      })
                    }
                  >
                    新建私人集合“飞书资料”
                  </Button>
                )}
                {collections.error && (
                  <Alert
                    type="warning"
                    message={collections.error}
                    action={<Button onClick={collections.refresh}>重新读取集合</Button>}
                  />
                )}
                <Checkbox
                  checked={confirmed}
                  disabled={busy || uncertain}
                  onChange={(e) => setConfirmed(e.target.checked)}
                >
                  确认将这份文字副本保存到 AcceptCat，仅自己可读
                </Checkbox>
                <p className="research-library-muted">
                  {preview.limitation}{" "}
                  断开飞书后已保存副本仍保留，可在资料库撤回。保存不会把你加入课题组或自动授权给
                  Agent。
                </p>
                {uncertain && (
                  <p role="status">
                    原保存请求已保留，重试使用同一编号；也可稍后在集合中核对。
                  </p>
                )}
                <Button
                  type="primary"
                  loading={busy}
                  disabled={!confirmed || !currentTarget}
                  onClick={() => void run(save)}
                >
                  {uncertain ? "重试原保存请求" : "确认保存副本"}
                </Button>
              </>
            ) : (
              <>
                <Alert
                  type="success"
                  message="已保存到私人资料集合"
                  description="在“我的 Agent → 资料绑定”中授权此集合后，Agent 才能检索引用。若要规划任务，可从上方预览复制需要的文字到下面。"
                />
                <label>
                  用于任务规划的片段
                  <Input.TextArea
                    aria-label="用于任务规划的飞书片段"
                    value={excerpt}
                    maxLength={2200}
                    showCount
                    autoSize={{ minRows: 3, maxRows: 7 }}
                    placeholder="从上方预览复制需要用于任务规划的内容，最多 2200 字符"
                    onChange={(e) => setExcerpt(e.target.value)}
                  />
                </label>
                <p className="research-library-muted">
                  带入新的规划对话后，你可以编辑需求；点击发送时才交给当前规划模型处理，并按现有规划对话规则保存记录。正式任务仍需你确认。
                </p>
                <div className="research-library-actions">
                  <Button type="primary" disabled={!excerpt.trim()} onClick={plan}>
                    带入任务规划
                  </Button>
                  <Button onClick={onClose}>完成</Button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
