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
}: {
  open: boolean;
  onClose: () => void;
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
  useEffect(() => {
    setDraft(undefined);
    setBusy(false);
    setFailure("");
    setNotice("");
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
  return (
    <Modal
      open={open}
      onCancel={close}
      footer={null}
      width={900}
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
                为科研、学习与日常交流选择你的模型。
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
                <label>
                  接口地址
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
                </label>
                <div>
                  <label>
                    API Key
                    <div className="model-key-line">
                      <Input.Password
                        aria-label="模型 API Key"
                        value={draft.apiKey}
                        disabled={busy}
                        placeholder={
                          draft.hasApiKey ? "未显示密钥" : "输入你的 API Key"
                        }
                        autoComplete="off"
                        onChange={(event) =>
                          patch({ apiKey: event.target.value, removeApiKey: false })
                        }
                      />
                      {draft.hasApiKey && !draft.removeApiKey && (
                        <span className="model-key-status">
                          <CheckCircleOutlined rev={undefined} /> 已保存
                        </span>
                      )}
                    </div>
                  </label>
                  <p className="model-key-help">
                    {draft.hasApiKey
                      ? "留空保留已保存的密钥。"
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
    </Modal>
  );
}
