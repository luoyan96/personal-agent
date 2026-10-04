import { Alert, Button, Input, Modal, Select, Space, Tag } from "antd";
import { useState } from "react";
import { emit } from "@/utils/events";
import OIMAvatar from "@/components/OIMAvatar";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";

export function ResearchContacts() {
  const [view, setView] = useState<"mine" | "directory">("mine");
  const [search, setSearch] = useState("");
  const { data, error, refresh } = useResearchRead(
    () => researchApi("chatContacts", { query: { view, limit: 100 } }),
    view,
  );
  const mapped = useResearchStore((s) => s.contacts);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    introduction: "",
    capabilityDescription: "",
    personality: "",
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  return (
    <div className="h-full space-y-4 overflow-auto bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">联系人</h2>
        <Button onClick={() => setCreating(true)}>创建专属 Agent</Button>
      </div>
      <Space>
        <Select
          value={view}
          onChange={setView}
          options={[
            { value: "mine", label: "我的联系人" },
            { value: "directory", label: "发现 · 实验室通讯录" },
          ]}
        />
        <Input
          aria-label="搜索联系人"
          placeholder="搜索名称"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </Space>
      {error && <Alert type="error" message={error} />}
      {data?.data
        .filter((c) => c.displayName.toLowerCase().includes(search.toLowerCase()))
        .map((contact) => (
          <button
            type="button"
            className="flex w-full items-center gap-3 border-b p-3 text-left hover:bg-slate-50"
            key={contact.id}
            onClick={async () => {
              await useResearchStore.getState().refresh();
              const current =
                useResearchStore
                  .getState()
                  .contacts.find((item) => item.contact.id === contact.id) ||
                mapped.find((item) => item.contact.id === contact.id);
              if (current) emit("OPEN_USER_CARD", { userID: current.userID });
            }}
          >
            <OIMAvatar text={contact.displayName} />
            <div>
              <strong>{contact.displayName}</strong>
              <p className="text-xs text-slate-600">
                {contact.profile.introduction || "尚未填写介绍"}
              </p>
            </div>
            <Tag className="ml-auto">
              {contact.identity.kind === "human"
                ? "真人"
                : contact.profile.role === "coordinator"
                ? "AI · 需求协调"
                : "AI"}
            </Tag>
          </button>
        ))}
      {data && !data.data.length && <p>暂无可查看的联系人</p>}
      <Modal
        title="创建专属 Agent"
        open={creating}
        onCancel={() => setCreating(false)}
        footer={null}
      >
        <p className="mb-3 text-xs text-slate-600">
          创建后归你所有；别人添加时需你同意。能力描述用于交流，不授予工具执行权限。
        </p>
        {failure && <Alert type="error" message={failure} />}
        <div className="space-y-3">
          {(
            [
              ["displayName", "名称"],
              ["introduction", "介绍"],
              ["capabilityDescription", "能力描述"],
              ["personality", "性格与偏好"],
            ] as const
          ).map(([key, label]) => (
            <label className="block" key={key}>
              {label}
              <Input.TextArea
                value={form[key]}
                rows={key === "displayName" ? 1 : 3}
                maxLength={
                  key === "displayName"
                    ? 200
                    : key === "capabilityDescription"
                    ? 4000
                    : 2000
                }
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              />
            </label>
          ))}
          <Button
            type="primary"
            loading={busy}
            disabled={!form.displayName.trim()}
            onClick={async () => {
              setBusy(true);
              setFailure("");
              try {
                await researchApi("createPersonalAgent", { body: form });
                await useResearchStore.getState().refresh();
                await refresh();
                setCreating(false);
                setForm({
                  displayName: "",
                  introduction: "",
                  capabilityDescription: "",
                  personality: "",
                });
              } catch (err) {
                setFailure(err instanceof Error ? err.message : "创建失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            创建 Agent
          </Button>
        </div>
      </Modal>
    </div>
  );
}
