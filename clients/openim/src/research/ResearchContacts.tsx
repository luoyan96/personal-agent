import { Alert, Button, Input, Modal, Segmented, Tabs } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Id } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchUserCard } from "./ResearchUserCard";
import type { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { AgentStarters } from "./AgentStarters";
import { ContactFinder } from "./ContactFinder";
import { useResearchContactChat } from "./useResearchContactChat";
import { AgentImport } from "./AgentImport";
import { ExternalAgentSetup } from "./ExternalAgentSetup";
import OIMAvatar from "@/components/OIMAvatar";
import { WorkspaceContactCard } from "./WorkspaceContactCard";
import "./workspace.scss";

export function ResearchContacts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view");
  const view = requestedView === "directory" ? "directory" : "mine";
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [addTab, setAddTab] = useState("friend");
  const [integration, setIntegration] = useState("profile");
  const [pageFailure, setPageFailure] = useState("");
  const [selectedContact, setSelectedContact] = useState<string>();
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const profile = useRef<OverlayVisibleHandle>(null);
  const { data, error, refresh } = useResearchRead(
    () =>
      researchApi("chatContacts", {
        query: { view, scope: "local", limit: 50, cursor },
      }),
    `${view}:${cursor || ""}`,
  );
  const generation = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const openChat = useResearchContactChat();
  const [savedId, setSavedId] = useState<string>();
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
    setAdding(false);
    setCreating(false);
    setSelectedContact(undefined);
    setPages([undefined]);
    setSavedId(undefined);
    setPageFailure("");
    setForm({
      displayName: "",
      introduction: "",
      capabilityDescription: "",
      personality: "",
    });
  }, [generation]);
  useEffect(() => {
    if (!actorId) return;
    const action = params.get("action"),
      sharedId = params.get("contact");
    if (!action && sharedId === null && requestedView !== "search") return;
    const next = new URLSearchParams(params);
    next.delete("action");
    next.delete("contact");
    if (requestedView === "search") next.delete("view");
    setParams(next, { replace: true });
    if (sharedId !== null) {
      if (!Id.safeParse(sharedId).success)
        setPageFailure("联系人名片链接无效，请重新复制完整链接。");
      else {
        setSelectedContact(sharedId);
      }
    } else {
      setAdding(true);
      setAddTab(action === "create-agent" ? "agent" : "friend");
    }
  }, [params, requestedView, setParams, actorId]);
  useLayoutEffect(() => {
    epoch.current++;
    setBusy(false);
    setFailure("");
    return () => {
      epoch.current++;
    };
  }, [generation, creating]);
  const openProfile = (id: string) => {
    setAdding(false);
    setSelectedContact(id);
  };
  const manageProfile = (id: string) => {
    setSelectedContact(id);
    profile.current?.openOverlay();
  };
  const filtered =
    data?.data.filter(
      (c) =>
        c.displayName.toLowerCase().includes(search.toLowerCase()) ||
        c.username?.includes(search),
    ) || [];
  return (
    <div className="social-workspace desktop-contacts-content">
      <div className="workspace-split">
        <aside className="workspace-list-pane">
          <div className="workspace-heading">
            <h1>通讯录</h1>
            <Button
              type="text"
              onClick={() => {
                setAddTab("friend");
                setAdding(true);
              }}
            >
              添加
            </Button>
          </div>
          <div className="workspace-toolbar">
            <Segmented
              value={view}
              onChange={(nextView) => {
                setSearch("");
                setPages([undefined]);
                const next = new URLSearchParams(params);
                if (nextView === "mine") next.delete("view");
                else next.set("view", String(nextView));
                setParams(next);
              }}
              options={[
                { value: "mine", label: "我的联系人" },
                { value: "directory", label: "团队通讯录" },
              ]}
            />
            <Input
              className="max-w-[320px]"
              aria-label="搜索联系人"
              placeholder="搜索名称"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="workspace-list-scroll">
            <div className="workspace-contact-shortcuts">
              <button onClick={() => navigate("/contact/newFriends")}>好友申请</button>
              <button onClick={() => navigate("/contact/groupNotifications")}>
                群邀请
              </button>
              <button onClick={() => navigate("/contact/myGroups")}>我的群组</button>
            </div>
            {pageFailure && (
              <Alert
                type="warning"
                message={pageFailure}
                closable
                onClose={() => setPageFailure("")}
              />
            )}
            {error && <Alert type="error" message={error} />}
            {!data && !error && (
              <p role="status" className="p-4 text-sm text-slate-500">
                正在读取通讯录…
              </p>
            )}
            {filtered.map((contact) => (
              <button
                type="button"
                className="workspace-person-row"
                key={contact.id}
                aria-pressed={selectedContact === contact.id}
                onClick={() => openProfile(contact.id)}
              >
                <OIMAvatar text={contact.displayName} />
                <div>
                  <strong>{contact.displayName}</strong>
                  <span
                    className={`workspace-kind ${
                      contact.identity.kind === "human" ? "human" : "agent"
                    }`}
                  >
                    {contact.identity.kind === "human" ? "个人" : "Agent"}
                  </span>
                  <p>
                    {contact.profile.introduction ||
                      contact.profile.capabilityDescription ||
                      (contact.username ? `@${contact.username}` : "尚未填写介绍")}
                  </p>
                </div>
              </button>
            ))}
            {data && !filtered.length && (
              <p className="py-10 text-center text-sm text-slate-500">
                {search ? "没有匹配的联系人" : "暂无联系人，从添加联系人开始。"}
              </p>
            )}
            {(pages.length > 1 || data?.nextCursor) && (
              <div className="workspace-pages">
                <Button
                  size="small"
                  disabled={pages.length === 1}
                  onClick={() => setPages((v) => v.slice(0, -1))}
                >
                  上一页
                </Button>
                <Button
                  size="small"
                  disabled={!data?.nextCursor}
                  onClick={() => {
                    if (data?.nextCursor) setPages((v) => [...v, data.nextCursor!]);
                  }}
                >
                  更多联系人
                </Button>
              </div>
            )}
          </div>
        </aside>
        <main className="workspace-detail-pane">
          {selectedContact ? (
            <WorkspaceContactCard
              key={selectedContact}
              contactId={selectedContact}
              onManage={manageProfile}
              onChanged={refresh}
            />
          ) : (
            <div className="workspace-empty">
              <h2>人与 Agent，都在通讯录里</h2>
              <p>选择一张名片查看能力、性格与所属账号，直接开始聊天。</p>
              <Button
                onClick={() => {
                  setAddTab("agent");
                  setAdding(true);
                }}
              >
                创建或接入 Agent
              </Button>
            </div>
          )}
        </main>
      </div>
      <ResearchUserCard contactId={selectedContact} ref={profile} />
      <Modal
        title="添加联系人"
        className="workspace-add-dialog"
        open={adding}
        onCancel={() => setAdding(false)}
        footer={null}
        width={800}
        destroyOnClose
      >
        <Tabs
          activeKey={addTab}
          onChange={setAddTab}
          items={[
            {
              key: "friend",
              label: "朋友与已有 Agent",
              children: <ContactFinder onOpen={openProfile} />,
            },
            {
              key: "agent",
              label: "创建 Agent",
              children: (
                <div className="space-y-4">
                  <AgentStarters
                    active={adding && addTab === "agent"}
                    onChanged={refresh}
                  />
                  <Button
                    onClick={() => {
                      setAdding(false);
                      setSavedId(undefined);
                      setCreating(true);
                    }}
                  >
                    创建自定义 Agent
                  </Button>
                </div>
              ),
            },
            {
              key: "import",
              label: "导入与接入",
              children: (
                <div className="space-y-4">
                  <Segmented
                    value={integration}
                    onChange={(value) => setIntegration(String(value))}
                    options={[
                      { value: "profile", label: "导入人设" },
                      { value: "external", label: "接入外部 Agent" },
                    ]}
                  />
                  {integration === "profile" ? (
                    <AgentImport
                      active={adding && addTab === "import"}
                      onProfile={openProfile}
                    />
                  ) : (
                    <ExternalAgentSetup
                      active={adding && addTab === "import"}
                      onProfile={openProfile}
                    />
                  )}
                </div>
              ),
            },
          ]}
        />
      </Modal>
      <Modal
        title="创建专属 Agent"
        className="workspace-add-dialog"
        open={creating}
        onCancel={() => {
          epoch.current++;
          setCreating(false);
        }}
        footer={null}
        destroyOnClose
      >
        <p className="mb-3 text-xs text-slate-600">
          创建后归你所有；别人添加时需你同意。能力描述用于交流，不授予工具执行权限。
        </p>
        {failure && <Alert type="error" message={failure} />}
        {savedId && (
          <Alert
            className="mb-3"
            type="info"
            message="Agent 已添加，资料已保存。再次打开只连接已有聊天，不会重复创建。"
          />
        )}
        <div className="space-y-3">
          <label className="block">
            名称
            <Input
              aria-label="Agent 名称"
              value={form.displayName}
              disabled={busy || !!savedId}
              maxLength={200}
              onChange={(e) => setForm((s) => ({ ...s, displayName: e.target.value }))}
            />
          </label>
          <details>
            <summary className="cursor-pointer text-sm text-slate-600">
              介绍、能力和性格（可选）
            </summary>
            <div className="mt-3 space-y-3">
              {(
                [
                  ["introduction", "介绍"],
                  ["capabilityDescription", "能力描述"],
                  ["personality", "性格与偏好"],
                ] as const
              ).map(([key, label]) => (
                <label className="block" key={key}>
                  {label}
                  <Input.TextArea
                    value={form[key]}
                    disabled={busy || !!savedId}
                    rows={3}
                    maxLength={key === "capabilityDescription" ? 4000 : 2000}
                    onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          </details>
          <Button
            type="primary"
            loading={busy}
            disabled={!savedId && !form.displayName.trim()}
            onClick={async () => {
              const requestEpoch = epoch.current;
              const isCurrent = () =>
                requestEpoch === epoch.current &&
                generation === useResearchStore.getState().generation &&
                actorId === useResearchStore.getState().actor?.member.id;
              setBusy(true);
              setFailure("");
              try {
                let target = savedId;
                if (!target) {
                  const created = await researchApi("createPersonalAgent", {
                    body: form,
                  });
                  if (!isCurrent()) return;
                  target = created.data.id;
                  setSavedId(target);
                }
                if (!isCurrent()) return;
                await useResearchStore.getState().refresh();
                if (!isCurrent()) return;
                await refresh();
                if (!isCurrent()) return;
                if (!(await openChat(target, isCurrent))) return;
                if (!isCurrent()) return;
                setCreating(false);
                setSavedId(undefined);
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
            {savedId ? "打开 Agent 聊天" : "创建并开始聊天"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
