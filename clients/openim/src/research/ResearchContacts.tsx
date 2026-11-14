import { Alert, Button, Input, Modal, Segmented, Tabs } from "antd";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
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
import type { Contact } from "@research-agent-platform/contracts";
import { ContactDirectoryRow } from "./ContactDirectoryRow";
import { contactDirectoryKind, readCombinedDirectoryPage, sortDirectoryContacts, type DirectoryKind, type DirectoryCursor } from "./contact-directory";
import { useContactStars } from "./useContactStars";
import { usePersonalOperation } from "./usePersonalOperation";
import { WorkspaceContactCard } from "./WorkspaceContactCard";
import "./workspace.scss";
import "./directory-skills.scss";

const DirectorySkillLibrary = lazy(() => import("./DirectorySkillLibrary").then(module => ({ default: module.DirectorySkillLibrary })));

export function ResearchContacts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view");
  const kind: DirectoryKind = params.get("kind") === "agents" ? "agents" : "people";
  const label = kind === "agents" ? "智能体" : "联系人";
  const library = kind === "agents" && params.get("panel") === "skills";
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [addTab, setAddTab] = useState("friend");
  const [integration, setIntegration] = useState("profile");
  const [pageFailure, setPageFailure] = useState("");
  const [selected, setSelected] = useState<{ id: string; kind: DirectoryKind }>();
  const selectedContact = selected?.kind === kind ? selected.id : undefined;
  const generation = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const filterKey = `${generation}:${kind}:${search}`;
  const [paging, setPaging] = useState<{ key: string; cursors: (DirectoryCursor | undefined)[] }>();
  const pages = paging?.key === filterKey ? paging.cursors : [undefined];
  const setPages = (update: (old: (DirectoryCursor | undefined)[]) => (DirectoryCursor | undefined)[]) => setPaging({ key: filterKey, cursors: update(pages) });
  const cursor = pages[pages.length - 1];
  const stars = useContactStars();
  const directoryOperation = usePersonalOperation(true, `contact-directory:${kind}:${library}`);
  const profile = useRef<OverlayVisibleHandle>(null);
  const { data, error, refresh, refreshChecked } = useResearchRead(
    signal => readCombinedDirectoryPage((view, next) => researchApi("chatContacts", {
      query: { view, scope: "local", limit: 50, cursor: next, search: search.trim() }, signal,
    }), kind, signal, cursor),
    `${filterKey}:${JSON.stringify(cursor) || ""}`,
    !library,
  );
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
    setSelected(undefined);
    setPaging(undefined);
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
    const action = params.get("action"), sharedId = params.get("contact");
    if (!action && sharedId === null && requestedView !== "search") return;
    const controller = new AbortController();
    const sameActor = () => !controller.signal.aborted && generation === useResearchStore.getState().generation && actorId === useResearchStore.getState().actor?.member.id;
    const next = new URLSearchParams(params);
    next.delete("action"); next.delete("contact");
    if (requestedView === "search") next.delete("view");
    if (sharedId !== null) {
      if (!Id.safeParse(sharedId).success) {
        setPageFailure("联系人名片链接无效，请重新复制完整链接。"); setParams(next, { replace: true });
      } else void researchApi("chatContact", { params: { id: sharedId }, signal: controller.signal }).then(result => {
        if (!sameActor()) return;
        const targetKind = contactDirectoryKind(result.data);
        next.set("kind", targetKind); setSelected({ id: sharedId, kind: targetKind }); setParams(next, { replace: true });
      }).catch(error => { if (sameActor()) { setPageFailure(error instanceof Error ? error.message : "名片暂未打开。"); setParams(next, { replace: true }); } });
    } else {
      if (action === "create-agent") next.set("kind", "agents");
      setAdding(true); setAddTab(action === "create-agent" ? "agent" : "friend"); setParams(next, { replace: true });
    }
    return () => controller.abort();
  }, [params, requestedView, setParams, actorId, generation]);
  useLayoutEffect(() => {
    epoch.current++;
    setBusy(false);
    setFailure("");
    return () => {
      epoch.current++;
    };
  }, [generation, creating]);
  const selectContact = (contact: Contact) => {
    setAdding(false); setSelected({ id: contact.id, kind: contactDirectoryKind(contact) });
    if (library) {
      const next = new URLSearchParams(params);
      ["panel", "agent", "skill", "catalog", "returnContact"].forEach(key => next.delete(key));
      setParams(next);
    }
  };
  const openProfile = (id: string) => {
    const ticket = directoryOperation.capture();
    void researchApi("chatContact", { params: { id } }).then(result => {
      if (!ticket.isCurrent()) return;
      const targetKind = contactDirectoryKind(result.data);
      selectContact(result.data);
      const next = new URLSearchParams(params); next.set("kind", targetKind);
      ["panel", "agent", "skill", "catalog", "returnContact"].forEach(key => next.delete(key));
      setParams(next);
    }).catch(error => { if (ticket.isCurrent()) setPageFailure(error instanceof Error ? error.message : "资料暂未打开。"); });
  };
  const manageProfile = (id: string) => {
    setSelected({ id, kind }); profile.current?.openOverlay();
  };
  const filtered = sortDirectoryContacts(data?.data || [], stars.ids);
  const changeKind = (nextKind: DirectoryKind) => {
    setSearch(""); setAdding(false);
    const next = new URLSearchParams(params); next.set("kind", nextKind);
    ["contact", "action", "view", "panel", "agent", "skill", "catalog", "returnContact"].forEach(key => next.delete(key));
    setParams(next);
  };
  const openSkills = (skillId?: string, agentId?: string) => {
    setAdding(false);
    const next = new URLSearchParams({ kind: "agents", panel: "skills" });
    if (skillId) next.set("skill", skillId);
    if (agentId) next.set("agent", agentId);
    if (selectedContact) next.set("returnContact", selectedContact);
    setParams(next);
  };
  const closeSkills = () => {
    const next = new URLSearchParams({ kind: "agents" });
    const agent = params.get("returnContact") || params.get("agent");
    if (agent) next.set("contact", agent);
    setParams(next);
  };
  return (
    <div className={`social-workspace desktop-contacts-content${library ? " is-skill-library" : ""}`}>
      <div className="workspace-split">
        {!library && <aside className="workspace-list-pane">
          <div className="workspace-heading">
            <h1>通讯录</h1>
            <div className="flex gap-2">
            {kind === "agents" && <Button type="text" onClick={() => openSkills()}>技能库</Button>}
            <Button
              type="text"
              onClick={() => {
                setAddTab(kind === "agents" ? "agent" : "friend");
                setAdding(true);
              }}
            >
              添加
            </Button>
            </div>
          </div>
          <nav className="directory-page-tabs" aria-label="通讯录分类">
            <button type="button" aria-pressed={kind === "agents"} onClick={() => changeKind("agents")}>智能体</button>
            <button type="button" aria-pressed={kind === "people"} onClick={() => changeKind("people")}>联系人</button>
          </nav>
          <div className="workspace-toolbar">
            <Input
              className="max-w-[320px]"
              maxLength={200}
              aria-label={`搜索${label}`}
              placeholder={kind === "agents" ? "搜索智能体" : "搜索姓名或 AcceptCat 号"}
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
            {stars.error && <Alert type="warning" message={stars.error} />}
            {!data && !error && (
              <p role="status" className="p-4 text-sm text-slate-500">
                正在读取通讯录…
              </p>
            )}
            {filtered.map(contact => <ContactDirectoryRow key={`${filterKey}:${contact.id}`} contact={contact}
              selected={selectedContact === contact.id} starred={stars.ids.includes(contact.id)}
              onSelect={() => selectContact(contact)} onDetails={() => { selectContact(contact); manageProfile(contact.id); }}
              onStar={() => stars.toggle(contact.id)} onRemoved={async () => { setSelected(previous => previous?.id === contact.id ? undefined : previous); await refreshChecked(); }} />)}
            {data && !filtered.length && (
              <p className="py-10 text-center text-sm text-slate-500">
                {search ? `没有匹配的${label}` : `暂无${label}`}
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
                  更多{label}
                </Button>
              </div>
            )}
          </div>
        </aside>}
        <main className="workspace-detail-pane">
          {library ? (
            <Suspense fallback={<p role="status">正在打开技能库…</p>}>
              <DirectorySkillLibrary onBack={closeSkills} />
            </Suspense>
          ) : selectedContact ? (
            <WorkspaceContactCard
              key={selectedContact}
              contactId={selectedContact}
              onManage={manageProfile}
              onChanged={refresh}
              onOpenSkills={openSkills}
            />
          ) : (
            <div className="workspace-empty">
              <h2>{kind === "agents" ? "智能体" : "联系人"}</h2>
              <Button
                onClick={() => {
                  setAddTab(kind === "agents" ? "agent" : "friend");
                  setAdding(true);
                }}
              >
                {kind === "agents" ? "添加智能体" : "添加联系人"}
              </Button>
            </div>
          )}
        </main>
      </div>
      <ResearchUserCard contactId={selectedContact} ref={profile} />
      <Modal
        title={kind === "agents" ? "添加智能体" : "添加联系人"}
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
              label: kind === "agents" ? "查找智能体" : "查找联系人",
              children: <ContactFinder kind={kind} onOpen={openProfile} active={adding && addTab === "friend"} />,
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
          ].filter(item => kind === "agents" || item.key === "friend")}
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
