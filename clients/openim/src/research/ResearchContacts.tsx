import { Alert, Button, Input, Modal, Select, Space, Tag } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import OIMAvatar from "@/components/OIMAvatar";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchUserCard } from "./ResearchUserCard";
import type { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";

export function ResearchContacts() {
  const [view, setView] = useState<"mine" | "directory" | "search">("mine");
  const [search, setSearch] = useState("");
  const [accountQuery, setAccountQuery] = useState("");
  const [selectedContact, setSelectedContact] = useState<string>();
  const profile = useRef<OverlayVisibleHandle>(null);
  const { data, error, refresh } = useResearchRead(
    () =>
      researchApi("chatContacts", {
        query:
          view === "search"
            ? { view: "directory", scope: "global", search: accountQuery, limit: 100 }
            : { view, scope: "local", limit: 100 },
      }),
    `${view}:${accountQuery}`,
    view !== "search" || !!accountQuery,
  );
  const generation = useResearchStore((s) => s.generation);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    displayName: "",
    introduction: "",
    capabilityDescription: "",
    personality: "",
  });
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const epoch = useRef(0);
  useLayoutEffect(() => {
    epoch.current++;
    setBusy(false);
    setFailure("");
    return () => {
      epoch.current++;
    };
  }, [generation, creating]);
  return (
    <div className="h-full space-y-4 overflow-auto bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold">联系人</h2>
        <Button onClick={() => setCreating(true)}>创建专属 Agent</Button>
      </div>
      <Space wrap>
        <Select
          value={view}
          onChange={setView}
          options={[
            { value: "mine", label: "我的联系人" },
            { value: "search", label: "添加朋友" },
            { value: "directory", label: "团队通讯录" },
          ]}
        />
        {view === "search" ? (
          <Input.Search
            aria-label="查找账号"
            placeholder="输入朋友的完整用户名"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onSearch={(value) => setAccountQuery(value.trim())}
            enterButton="查找"
          />
        ) : (
          <Input
            aria-label="搜索联系人"
            placeholder="搜索名称"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </Space>
      {error && <Alert type="error" message={error} />}
      {data?.data
        .filter(
          (c) =>
            view === "search" ||
            c.displayName.toLowerCase().includes(search.toLowerCase()) ||
            c.username?.includes(search),
        )
        .map((contact) => (
          <button
            type="button"
            className="flex w-full items-center gap-3 border-b p-3 text-left hover:bg-slate-50"
            key={contact.id}
            onClick={() => {
              setSelectedContact(contact.id);
              profile.current?.openOverlay();
            }}
          >
            <OIMAvatar text={contact.displayName} />
            <div>
              <strong>{contact.displayName}</strong>
              {contact.username && (
                <p className="text-xs text-slate-500">@{contact.username}</p>
              )}
              <p className="text-xs text-slate-600">
                {contact.profile.introduction || "尚未填写介绍"}
              </p>
            </div>
            <Tag className="ml-auto">
              {contact.identity.kind === "human"
                ? "真人"
                : contact.profile.role === "coordinator" &&
                  contact.relationship.status === "own"
                ? "我的 AI"
                : "AI"}
            </Tag>
          </button>
        ))}
      {data && !data.data.length && (
        <p>
          {view === "search"
            ? "没有找到这个账号，请检查完整用户名。"
            : "暂无可查看的联系人"}
        </p>
      )}
      {view === "search" && !accountQuery && (
        <p className="text-sm text-slate-500">
          通过唯一用户名查找朋友；添加后需对方同意。
        </p>
      )}
      <ResearchUserCard contactId={selectedContact} ref={profile} />
      <Modal
        title="创建专属 Agent"
        open={creating}
        onCancel={() => {
          epoch.current++;
          setCreating(false);
        }}
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
              const requestEpoch = epoch.current;
              const isCurrent = () =>
                requestEpoch === epoch.current &&
                generation === useResearchStore.getState().generation;
              setBusy(true);
              setFailure("");
              try {
                await researchApi("createPersonalAgent", { body: form });
                if (!isCurrent()) return;
                await useResearchStore.getState().refresh();
                if (!isCurrent()) return;
                await refresh();
                if (!isCurrent()) return;
                setCreating(false);
                setForm({
                  displayName: "",
                  introduction: "",
                  capabilityDescription: "",
                  personality: "",
                });
              } catch (err) {
                if (isCurrent())
                  setFailure(err instanceof Error ? err.message : "创建失败");
              } finally {
                if (isCurrent()) setBusy(false);
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
