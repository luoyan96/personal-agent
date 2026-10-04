import { Alert, Button, Input, InputNumber, Modal, Select, Space, Switch } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";

export function LabSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actor = useResearchStore((s) => s.actor);
  return (
    <Modal
      title="实验室设置"
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnClose
    >
      {actor?.isLabManager ? (
        <ManagerSettings labId={actor.member.labId} />
      ) : (
        <Alert message="实验室负责人可管理模型配置与注册邀请码。" />
      )}
    </Modal>
  );
}
function ManagerSettings({ labId }: { labId: string }) {
  const { data, error, refresh } = useResearchRead(
    () => researchApi("labAiSettings", { params: { id: labId } }),
    labId,
  );
  const invites = useResearchRead(
    () => researchApi("managerInvites", { params: { id: labId } }),
    labId,
  );
  const [editing, setEditing] = useState(false),
    [enabled, setEnabled] = useState(false),
    [model, setModel] = useState<"deepseek-flash" | "deepseek-v4-pro">(
      "deepseek-flash",
    ),
    [apiKey, setApiKey] = useState(""),
    [version, setVersion] = useState(0),
    [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [code, setCode] = useState(""),
    [maxUses, setMaxUses] = useState(1);
  return (
    <div className="space-y-4">
      {(error || failure) && <Alert type="error" message={error || failure} />}
      <h3>大模型</h3>
      {data && (
        <>
          <p>
            {data.data.labName} · {data.data.enabled ? "已启用" : "已停用"} ·{" "}
            {data.data.model} · {data.data.hasApiKey ? "已保存密钥" : "未保存密钥"}
          </p>
          <p className="text-xs text-slate-500">
            {data.data.platformEnabled ? "平台允许模型服务" : "平台模型服务当前未启用"}
          </p>
        </>
      )}
      {!editing ? (
        <Button
          disabled={!data}
          onClick={() => {
            if (!data) return;
            setEnabled(data.data.enabled);
            setModel(data.data.model);
            setVersion(data.data.version);
            setEditing(true);
          }}
        >
          编辑模型配置
        </Button>
      ) : (
        <div className="space-y-3">
          <Space>
            启用模型
            <Switch checked={enabled} onChange={setEnabled} />
          </Space>
          <Select
            className="w-full"
            value={model}
            onChange={setModel}
            options={[
              { value: "deepseek-flash", label: "DeepSeek Flash" },
              { value: "deepseek-v4-pro", label: "DeepSeek V4 Pro" },
            ]}
          />
          <Input.Password
            aria-label="模型 API Key"
            placeholder="新 API Key（留空保留原密钥）"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
          <Space>
            <Button
              type="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                setFailure("");
                try {
                  await researchApi("updateLabAiSettings", {
                    params: { id: labId },
                    body: {
                      expectedVersion: version,
                      enabled,
                      model,
                      ...(apiKey ? { apiKey } : {}),
                    },
                  });
                  setApiKey("");
                  setEditing(false);
                  await refresh();
                } catch (err) {
                  setFailure(err instanceof Error ? err.message : "保存失败");
                  await refresh();
                } finally {
                  setBusy(false);
                }
              }}
            >
              保存配置
            </Button>
            <Button
              onClick={() => {
                setApiKey("");
                setEditing(false);
              }}
            >
              取消
            </Button>
          </Space>
        </div>
      )}
      <h3>注册邀请码</h3>
      <Space>
        最多使用人数
        <InputNumber
          min={1}
          max={50}
          value={maxUses}
          onChange={(v) => setMaxUses(v || 1)}
        />
        <Button
          loading={busy}
          onClick={async () => {
            setBusy(true);
            setFailure("");
            try {
              const result = await researchApi("createManagerInvite", {
                params: { id: labId },
                body: {
                  expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
                  maxUses,
                },
              });
              setCode(result.data.code);
              await invites.refresh();
            } catch (err) {
              setFailure(err instanceof Error ? err.message : "创建失败");
            } finally {
              setBusy(false);
            }
          }}
        >
          创建七天邀请码
        </Button>
      </Space>
      {code && (
        <Alert
          type="success"
          message="本次邀请码"
          description={
            <>
              <p className="select-all break-all">{code}</p>
              <p>仅本次创建时展示，请自行保存并发给实验室成员。</p>
            </>
          }
        />
      )}
      {invites.error && <Alert type="error" message={invites.error} />}
      {invites.data?.data.invites.map((invite) => (
        <div key={invite.id} className="border p-2 text-xs">
          <p>
            使用 {invite.usedCount}/{invite.maxUses} · 截止 {invite.expiresAt}
          </p>
          {!invite.revokedAt && (
            <Button
              size="small"
              danger
              onClick={() =>
                Modal.confirm({
                  title: "撤销这个邀请码？",
                  onOk: async () => {
                    await researchApi("revokeManagerInvite", {
                      params: { id: labId, inviteId: invite.id },
                      body: {},
                    });
                    await invites.refresh();
                  },
                })
              }
            >
              撤销
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}
