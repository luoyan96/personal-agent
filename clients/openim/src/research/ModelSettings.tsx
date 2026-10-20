import {
  ApiOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { Alert, Button, Checkbox, Input, Modal, Select, Spin, Switch } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RequestFor, ResponseFor } from "@research-agent-platform/contracts";
import { PersonalModelInput } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import "./model-settings.scss";

type Configuration = ResponseFor<"personalModels">["data"]["configurations"][number];
type Provider = Configuration["provider"];
type Draft = {
  id?: string;
  version?: number;
  name: string;
  provider: Provider;
  model: string;
  enabled: boolean;
  apiKey: string;
  hasApiKey: boolean;
  removeApiKey: boolean;
  defaultWanted: boolean;
};
const providers = {
  deepseek: {
    name: "DeepSeek",
    baseUrl: "https://api.deepseek.com/anthropic",
    model: "deepseek-flash",
  },
  qwen: {
    name: "通义千问",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus",
  },
  doubao: {
    name: "豆包",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    model: "",
  },
} as const;
const modelLabel = (model: string) =>
  ({ "deepseek-flash": "DeepSeek Flash", "deepseek-v4-pro": "DeepSeek V4 Pro" }[
    model
  ] || model);
const newDraft = (defaultWanted: boolean): Draft => ({
  name: "",
  provider: "deepseek",
  model: "deepseek-flash",
  enabled: true,
  apiKey: "",
  hasApiKey: false,
  removeApiKey: false,
  defaultWanted,
});
const editDraft = (config: Configuration, defaultWanted = config.isDefault): Draft => ({
  ...config,
  apiKey: "",
  removeApiKey: false,
  defaultWanted,
});

export function ModelSettings({
  open,
  onClose,
  embedded = false,
}: {
  open: boolean;
  onClose: () => void;
  embedded?: boolean;
}) {
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const actorGeneration = useResearchStore((s) => s.generation);
  const scope = `${open}:${actorGeneration}:${actorId}`;
  const latestScope = useRef(scope);
  latestScope.current = scope;
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  // A close/reopen of the same actor must invalidate work from the old modal.
  // Comparing a boolean open flag alone would let that response clear a new Key.
  const epoch = useRef(0);
  const confirmation = useRef<ReturnType<typeof Modal.confirm>>();
  useLayoutEffect(() => {
    epoch.current++;
    confirmation.current?.destroy();
    return () => {
      epoch.current++;
      confirmation.current?.destroy();
    };
  }, [scope]);
  const captureCurrent = () => {
    const requestEpoch = epoch.current;
    return () =>
      mounted.current &&
      open &&
      epoch.current === requestEpoch &&
      latestScope.current === scope &&
      useResearchStore.getState().generation === actorGeneration &&
      useResearchStore.getState().actor?.member.id === actorId;
  };
  const close = () => {
    epoch.current++;
    confirmation.current?.destroy();
    setDraft(undefined);
    setFailure("");
    setNotice("");
    onClose();
  };
  const read = useResearchRead(
    () => researchApi("personalModels"),
    "personal-models",
    open && !!actorId,
  );
  const [draft, setDraft] = useState<Draft>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [replacingKey, setReplacingKey] = useState(false);
  useEffect(() => {
    setDraft(undefined);
    setBusy(false);
    setFailure("");
    setNotice("");
    setReplacingKey(false);
  }, [scope]);
  useEffect(() => {
    if (!open || !read.data || draft) return;
    const settings = read.data.data;
    const config =
      settings.configurations.find((c) => c.isDefault) || settings.configurations[0];
    setDraft(config ? editDraft(config) : newDraft(true));
  }, [open, read.data, draft]);
  const select = (next: Draft) => {
    setDraft(next);
    setFailure("");
    setNotice("");
    setReplacingKey(false);
  };
  const patch = (next: Partial<Draft>) => {
    setDraft((current) => (current ? { ...current, ...next } : current));
    setNotice("");
  };

  const save = async () => {
    const isCurrent = captureCurrent();
    if (!draft || busy || !isCurrent()) return;
    const submitted = draft;
    const body: RequestFor<"createPersonalModel">["body"] = {
      name: submitted.name.trim(),
      provider: submitted.provider,
      model: submitted.model.trim(),
      enabled: submitted.enabled,
      ...(submitted.apiKey ? { apiKey: submitted.apiKey } : {}),
      ...(submitted.removeApiKey ? { removeApiKey: true } : {}),
    };
    if (body.apiKey && !/^[\x21-\x7e]{8,512}$/.test(body.apiKey)) {
      setFailure("请输入完整的新 API Key（8–512 个字符），不能提交脱敏预览或空白。");
      return;
    }
    if (!PersonalModelInput.safeParse(body).success) {
      setFailure(
        !body.name
          ? "请填写配置名称。"
          : body.apiKey && (body.apiKey.length < 8 || body.apiKey.length > 512)
          ? "API Key 需为 8–512 个字符。"
          : "请填写有效模型名称；豆包请使用你的模型接入点 ID。DeepSeek 请选择列表中的模型。",
      );
      return;
    }
    if (
      submitted.defaultWanted &&
      (!submitted.enabled ||
        submitted.removeApiKey ||
        !(submitted.apiKey || submitted.hasApiKey))
    ) {
      setFailure("默认模型需要启用并保存 API Key。");
      return;
    }
    setBusy(true);
    setFailure("");
    setNotice("");
    let saved: Configuration | undefined;
    try {
      saved = submitted.id
        ? (
            await researchApi("updatePersonalModel", {
              params: { id: submitted.id },
              body: { ...body, expectedVersion: submitted.version! },
            })
          ).data
        : (await researchApi("createPersonalModel", { body })).data;
      if (!isCurrent()) return;
      setDraft(editDraft(saved, submitted.defaultWanted));
      setReplacingKey(false);
      const settings = (await researchApi("personalModels")).data;
      if (!isCurrent()) return;
      if (
        (submitted.defaultWanted && settings.defaultConfigurationId !== saved.id) ||
        (!submitted.defaultWanted && settings.defaultConfigurationId === saved.id)
      ) {
        await researchApi("defaultPersonalModel", {
          body: {
            expectedVersion: settings.version,
            configurationId: submitted.defaultWanted ? saved.id : null,
          },
        });
        if (!isCurrent()) return;
      }
      await read.refresh();
      if (isCurrent()) setNotice("配置已保存。");
    } catch (error) {
      if (isCurrent()) {
        setFailure(
          (saved ? "配置已保存，但默认模型状态未完成更新。" : "") +
            (error instanceof Error ? error.message : "保存失败，请重试。"),
        );
        await read.refresh();
      }
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  const remove = () => {
    if (!draft?.id || busy) return;
    const isCurrent = captureCurrent();
    const id = draft.id,
      version = draft.version!;
    confirmation.current = Modal.confirm({
      title: "删除这个模型配置？",
      content:
        "已保存的密钥也会移除。如果它是默认模型，需要明确选择另一配置后才能继续聊天。",
      okText: "删除配置",
      cancelText: "取消",
      okButtonProps: { danger: true },
      onOk: async () => {
        if (!isCurrent()) return;
        setBusy(true);
        setFailure("");
        try {
          const result = await researchApi("deletePersonalModel", {
            params: { id },
            body: { expectedVersion: version },
          });
          if (!isCurrent()) return;
          const first =
            result.data.configurations.find((c) => c.isDefault) ||
            result.data.configurations[0];
          setDraft(first ? editDraft(first) : newDraft(true));
          setNotice("配置已删除。");
          await read.refresh();
        } catch (error) {
          if (isCurrent())
            setFailure(error instanceof Error ? error.message : "删除失败。");
          throw error;
        } finally {
          if (isCurrent()) setBusy(false);
        }
      },
    });
  };
  const configs = read.data?.data.configurations || [];
  const selected = configs.find((c) => c.id === draft?.id);
  const defaultConfig = configs.find(
    (c) => c.id === read.data?.data.defaultConfigurationId,
  );
  const keyPreview = useResearchRead(
    (signal) =>
      researchApi("personalModelKeyPreview", { params: { id: selected!.id }, signal }),
    `model-key-preview:${selected?.id}:${selected?.version}`,
    open && !!actorId && !!selected?.hasApiKey,
  );
  const preview = keyPreview.data?.data;
  const checkingPreview = keyPreview.loading || selected?.version !== draft?.version;
  const maskedKey =
    preview &&
    selected &&
    preview.configurationId === selected.id &&
    preview.version === selected.version &&
    preview.version === draft?.version
      ? preview.apiKeyPreview
      : null;
  const content = (
    <>
      {read.data && (
        <section className="model-saved-summary" aria-label="当前默认模型">
          <span>当前默认模型</span>
          <div>
            <strong>
              {defaultConfig
                ? modelLabel(defaultConfig.model)
                : read.data.data.source === "legacy_lab"
                ? "沿用课题组模型"
                : "尚未选择默认模型"}
            </strong>
            {defaultConfig && (
              <small>
                {providers[defaultConfig.provider].name} · {defaultConfig.name}
              </small>
            )}
          </div>
          {defaultConfig && (
            <small>
              {!read.data.data.platformEnabled
                ? "平台模型服务未启用"
                : !defaultConfig.enabled
                ? "配置已停用"
                : !defaultConfig.hasApiKey
                ? "尚未保存 API Key"
                : "已启用"}
            </small>
          )}
        </section>
      )}
      <div className="model-settings-layout">
        <aside className="model-settings-list" aria-label="我的模型">
          <h3>我的模型</h3>
          <div className="model-config-rows">
            {configs.map((config) => (
              <button
                key={config.id}
                className="model-config-row"
                aria-pressed={draft?.id === config.id}
                disabled={busy}
                onClick={() => select(editDraft(config))}
              >
                <ApiOutlined style={{ fontSize: 22 }} rev={undefined} />
                <span>
                  {config.name}
                  <small>
                    {providers[config.provider].name}
                    {" · "}
                    {modelLabel(config.model)}
                    {config.isDefault ? " · 默认" : !config.enabled ? " · 已停用" : ""}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <Button
            className="model-add"
            icon={<PlusOutlined rev={undefined} />}
            disabled={busy || configs.length >= 20 || !read.data}
            onClick={() => select(newDraft(configs.length === 0))}
          >
            添加模型
          </Button>
        </aside>
        <section className="model-settings-form">
          {!draft ? (
            <Spin />
          ) : (
            <>
              <h2>{providers[draft.provider].name}</h2>
              <p className="model-form-description">
                {selected
                  ? `已保存：${modelLabel(selected.model)} · ${
                      providers[selected.provider].name
                    }`
                  : "为科研、学习与日常交流选择你的模型。"}
              </p>
              <div className="model-form-fields">
                <label>
                  模型服务
                  <Select
                    aria-label="模型服务"
                    value={draft.provider}
                    disabled={busy || !!draft.id}
                    onChange={(provider: Provider) =>
                      patch({ provider, model: providers[provider].model })
                    }
                    options={Object.entries(providers).map(([value, provider]) => ({
                      value,
                      label: provider.name,
                    }))}
                  />
                  {draft.id && (
                    <p className="model-key-help">
                      使用另一个服务商时，请添加配置并填写其 API Key。
                    </p>
                  )}
                </label>
                <div className="model-form-two">
                  <label>
                    配置名称
                    <Input
                      aria-label="配置名称"
                      value={draft.name}
                      placeholder="例如：科研日常"
                      maxLength={200}
                      disabled={busy}
                      onChange={(event) => patch({ name: event.target.value })}
                    />
                  </label>
                  <label>
                    模型
                    {draft.provider === "deepseek" ? (
                      <Select
                        aria-label="模型"
                        value={draft.model}
                        disabled={busy}
                        onChange={(model) => patch({ model })}
                        options={[
                          { value: "deepseek-flash", label: "DeepSeek Flash" },
                          { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
                        ]}
                      />
                    ) : (
                      <Input
                        aria-label="模型"
                        value={draft.model}
                        placeholder={
                          draft.provider === "qwen"
                            ? "例如：qwen-plus"
                            : "请输入 ep- 开头的模型接入点 ID"
                        }
                        disabled={busy}
                        maxLength={128}
                        onChange={(event) => patch({ model: event.target.value })}
                      />
                    )}
                  </label>
                </div>
                <details className="model-api-details">
                  <summary>接口信息</summary>
                  <Input
                    aria-label="接口地址"
                    value={
                      selected?.provider === draft.provider
                        ? selected.baseUrl
                        : providers[draft.provider].baseUrl
                    }
                    readOnly
                    title="官方服务的固定接口地址"
                  />
                </details>
                <div>
                  <label>
                    API Key
                    <div className="model-key-line">
                      {draft.hasApiKey && !replacingKey ? (
                        <>
                          <Input
                            aria-label="已保存的 API Key"
                            readOnly
                            value={
                              draft.removeApiKey
                                ? "待移除，尚未保存"
                                : maskedKey ||
                                  (checkingPreview
                                    ? "正在读取密钥预览…"
                                    : "已保存，首尾预览暂不可用")
                            }
                          />
                          <Button
                            disabled={busy || draft.removeApiKey}
                            onClick={() => setReplacingKey(true)}
                          >
                            更换
                          </Button>
                        </>
                      ) : (
                        <Input.Password
                          aria-label="模型 API Key"
                          value={draft.apiKey}
                          disabled={busy}
                          placeholder={
                            draft.hasApiKey
                              ? "输入完整的新 API Key"
                              : "输入你的 API Key"
                          }
                          autoComplete="off"
                          onChange={(event) =>
                            patch({ apiKey: event.target.value, removeApiKey: false })
                          }
                        />
                      )}
                      {replacingKey && (
                        <Button
                          disabled={busy}
                          onClick={() => {
                            patch({ apiKey: "" });
                            setReplacingKey(false);
                          }}
                        >
                          取消更换
                        </Button>
                      )}
                      {draft.hasApiKey && !draft.removeApiKey && (
                        <span className="model-key-status">
                          <CheckCircleOutlined rev={undefined} />{" "}
                          {draft.apiKey ? "新 Key 待保存" : "已保存"}
                        </span>
                      )}
                    </div>
                  </label>
                  <p className="model-key-help">
                    {draft.hasApiKey
                      ? replacingKey
                        ? "填写完整的新 Key 后保存；留空会保留原密钥。"
                        : checkingPreview
                        ? "正在核对已保存密钥的首尾预览，原密钥已保留。"
                        : maskedKey
                        ? "仅显示已保存密钥的首尾，中间已隐藏。"
                        : "原密钥已保留，当前服务暂未提供首尾预览。"
                      : "密钥仅用于你自己的模型请求，不向联系人展示。"}
                  </p>
                  {draft.hasApiKey && (
                    <Checkbox
                      checked={draft.removeApiKey}
                      disabled={busy}
                      onChange={(event) =>
                        patch({
                          removeApiKey: event.target.checked,
                          ...(event.target.checked
                            ? { enabled: false, defaultWanted: false, apiKey: "" }
                            : {}),
                        })
                      }
                    >
                      移除已保存的密钥并停用
                    </Checkbox>
                  )}
                </div>
              </div>
              <div className="model-default">
                <label className="model-toggle-label">
                  <Switch
                    aria-label="默认用于日常 Agent 聊天"
                    checked={draft.defaultWanted}
                    disabled={busy || !draft.enabled || draft.removeApiKey}
                    onChange={(defaultWanted) => patch({ defaultWanted })}
                  />
                  用于日常 Agent 聊天
                </label>
                <Checkbox
                  className="mt-3"
                  checked={draft.enabled}
                  disabled={busy || draft.removeApiKey}
                  onChange={(event) =>
                    patch({
                      enabled: event.target.checked,
                      ...(!event.target.checked ? { defaultWanted: false } : {}),
                    })
                  }
                >
                  启用此配置
                </Checkbox>
              </div>
              <p className="model-privacy">仅你可以管理这些配置。</p>
            </>
          )}
          {read.data?.data.source === "legacy_lab" && (
            <p className="model-privacy">当前沿用原团队模型；个人配置仅由你管理。</p>
          )}
          {read.data && !read.data.data.platformEnabled && (
            <Alert
              className="model-error"
              type="warning"
              message="平台模型服务当前未启用。配置可以保存，聊天暂不可用。"
            />
          )}
          {(read.error || failure) && (
            <Alert
              className="model-error"
              type="error"
              showIcon
              message={failure || read.error}
            />
          )}
          {notice && (
            <p role="status" className="model-privacy">
              {notice}
            </p>
          )}
        </section>
      </div>
      <div className="model-settings-footer">
        <Button
          type="text"
          danger
          icon={<DeleteOutlined rev={undefined} />}
          disabled={!draft?.id || busy}
          onClick={remove}
        >
          删除配置
        </Button>
        <div className="model-footer-actions">
          <Button onClick={close}>取消</Button>
          <Button
            type="primary"
            loading={busy}
            disabled={!draft || !read.data}
            onClick={() => void save()}
          >
            保存
          </Button>
        </div>
      </div>
    </>
  );
  if (embedded)
    return (
      <section
        className="model-settings-modal model-settings-page"
        aria-label="模型设置"
      >
        <header className="my-section-heading">
          <h2>模型设置</h2>
          <p>为你的 Agent 选择使用的模型。</p>
        </header>
        {content}
      </section>
    );
  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      width={800}
      centered
      className="model-settings-modal"
      title={
        <>
          <h1>模型设置</h1>
          <p>为你的 Agent 选择使用的模型。</p>
        </>
      }
      destroyOnClose
    >
      {content}
    </Modal>
  );
}
