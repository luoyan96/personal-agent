import {
  ArrowLeftOutlined,
  ContactsOutlined,
  MailOutlined,
  RightOutlined,
  SearchOutlined,
  TeamOutlined,
  UserAddOutlined,
} from "@ant-design/icons";
import { Alert, Button, Input, Modal, type InputRef } from "antd";
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Id } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchStore } from "./store";
import { useResearchRead } from "./useResearchRead";
import { ResearchUserCard } from "./ResearchUserCard";
import type { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { ContactFinder } from "./ContactFinder";
import type { Contact } from "@research-agent-platform/contracts";
import { ContactDirectoryRow } from "./ContactDirectoryRow";
import { readCombinedDirectoryPage, sortDirectoryContacts, type DirectoryCursor } from "./contact-directory";
import { useContactStars } from "./useContactStars";
import { usePersonalOperation } from "./usePersonalOperation";
import { WorkspaceContactCard } from "./WorkspaceContactCard";
import { pendingFriendRequestColor, pendingFriendRequestLabel, usePendingContactRequests } from "./contact-requests";
import "./workspace.scss";
import "./contact-directory.scss";
import "./directory-skills.scss";

const DirectorySkillLibrary = lazy(() => import("./DirectorySkillLibrary").then(module => ({ default: module.DirectorySkillLibrary })));

export function ResearchContacts() {
  const [params, setParams] = useSearchParams();
  const requestedView = params.get("view");
  const library = params.get("panel") === "skills";
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [pageFailure, setPageFailure] = useState("");
  const [selectedContact, setSelected] = useState<string>();
  const generation = useResearchStore((s) => s.generation);
  const actorId = useResearchStore((s) => s.actor?.member.id);
  const pendingFriends = usePendingContactRequests().data?.length ?? 0;
  const filterKey = `${generation}:${search}`;
  const [paging, setPaging] = useState<{ key: string; cursors: (DirectoryCursor | undefined)[] }>();
  const pages = paging?.key === filterKey ? paging.cursors : [undefined];
  const setPages = (update: (old: (DirectoryCursor | undefined)[]) => (DirectoryCursor | undefined)[]) => setPaging({ key: filterKey, cursors: update(pages) });
  const cursor = pages[pages.length - 1];
  const stars = useContactStars();
  const directoryOperation = usePersonalOperation(true, `contact-directory:${library}`);
  const profile = useRef<OverlayVisibleHandle>(null);
  const searchField = useRef<InputRef>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const { data, error, refresh, refreshChecked } = useResearchRead(
    signal => readCombinedDirectoryPage((view, next) => researchApi("chatContacts", {
      query: { view, scope: "local", limit: 50, cursor: next, search: search.trim() }, signal,
    }), "people", signal, cursor),
    `${filterKey}:${JSON.stringify(cursor) || ""}`,
    !library,
  );
  useLayoutEffect(() => {
    setAdding(false);
    setSelected(undefined);
    setPaging(undefined);
    setSearch("");
    setPageFailure("");
  }, [generation]);
  useLayoutEffect(() => {
    if (selectedContact && backButton.current?.getClientRects().length) {
      backButton.current.focus();
    }
  }, [selectedContact]);
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
        next.delete("kind"); setSelected(result.data.id); setParams(next, { replace: true });
      }).catch(error => { if (sameActor()) { setPageFailure(error instanceof Error ? error.message : "名片暂未打开。"); setParams(next, { replace: true }); } });
    } else {
      next.delete("kind");
      setAdding(action === "add-contact" || requestedView === "search");
      setParams(next, { replace: true });
    }
    return () => controller.abort();
  }, [params, requestedView, setParams, actorId, generation]);
  const selectContact = (contact: Contact) => {
    setAdding(false);
    setSelected(contact.id);
  };
  const openProfile = (id: string) => {
    const ticket = directoryOperation.capture();
    void researchApi("chatContact", { params: { id } }).then(result => {
      if (!ticket.isCurrent()) return;
      selectContact(result.data);
      const next = new URLSearchParams(params); next.delete("kind");
      ["panel", "agent", "skill", "catalog", "returnContact"].forEach(key => next.delete(key));
      setParams(next);
    }).catch(error => { if (ticket.isCurrent()) setPageFailure(error instanceof Error ? error.message : "资料暂未打开。"); });
  };
  const manageProfile = (id: string) => {
    setSelected(id); profile.current?.openOverlay();
  };
  const filtered = sortDirectoryContacts(data?.data || [], stars.ids);
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
      <div className={`workspace-split${selectedContact ? " has-selected-contact" : ""}`}>
        {!library && <aside className="workspace-list-pane" aria-labelledby="directory-title">
          <div className="workspace-heading">
            <h1 id="directory-title">通讯录</h1>
            <Button
              className="directory-add-button"
              icon={<UserAddOutlined aria-hidden="true" />}
              onClick={() => setAdding(true)}
            >
              添加联系人
            </Button>
          </div>
          <div className="workspace-toolbar workspace-contact-toolbar">
            <Input
              ref={searchField}
              allowClear
              prefix={<SearchOutlined aria-hidden="true" />}
              maxLength={200}
              aria-label="搜索联系人"
              placeholder="搜索姓名或 DeepChat 号"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <nav className="workspace-contact-shortcuts" aria-label="通讯录入口">
            <Link
              to="/contact/newFriends"
              aria-label={pendingFriends ? `好友申请，${pendingFriendRequestLabel(pendingFriends)}` : undefined}
            >
              <UserAddOutlined aria-hidden="true" />
              <span>好友申请</span>
              <span className="directory-shortcut-end" aria-hidden="true">
                {pendingFriends > 0 && (
                  <span className="directory-request-count" style={{ backgroundColor: pendingFriendRequestColor }}>
                    {pendingFriends > 99 ? "99+" : pendingFriends}
                  </span>
                )}
                <RightOutlined />
              </span>
            </Link>
            <Link to="/contact/groupNotifications">
              <MailOutlined aria-hidden="true" /><span>群邀请</span><RightOutlined aria-hidden="true" />
            </Link>
            <Link to="/contact/myGroups">
              <TeamOutlined aria-hidden="true" /><span>我的群组</span><RightOutlined aria-hidden="true" />
            </Link>
          </nav>
          <h2 className="directory-list-heading">{search.trim() ? "搜索结果" : "联系人"}</h2>
          <div className="workspace-list-scroll">
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
              <p role="status" className="directory-list-status">
                正在读取通讯录…
              </p>
            )}
            {filtered.map(contact => <ContactDirectoryRow key={`${filterKey}:${contact.id}`} contact={contact}
              selected={selectedContact === contact.id} starred={stars.ids.includes(contact.id)}
              onSelect={() => selectContact(contact)} onDetails={() => { selectContact(contact); manageProfile(contact.id); }}
              onStar={() => stars.toggle(contact.id)} onRemoved={async () => { setSelected(previous => previous === contact.id ? undefined : previous); await refreshChecked(); }} />)}
            {data && !filtered.length && (
              <p role="status" className="directory-list-status">
                {search.trim() ? "没有匹配的联系人" : "暂无联系人"}
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
        </aside>}
        <main className="workspace-detail-pane">
          {library ? (
            <Suspense fallback={<p role="status">正在打开技能库…</p>}>
              <DirectorySkillLibrary onBack={closeSkills} />
            </Suspense>
          ) : selectedContact ? (
            <>
              <div className="directory-back-bar">
                <button
                  type="button"
                  ref={backButton}
                  onClick={() => {
                    setSelected(undefined);
                    requestAnimationFrame(() => searchField.current?.focus());
                  }}
                >
                  <ArrowLeftOutlined aria-hidden="true" /> 返回通讯录
                </button>
              </div>
              <WorkspaceContactCard
                key={selectedContact}
                contactId={selectedContact}
                onManage={manageProfile}
                onOpenContact={setSelected}
                onChanged={refresh}
                onOpenSkills={openSkills}
                directory
              />
            </>
          ) : (
            <div className="workspace-empty">
              <span className="directory-empty-icon" aria-hidden="true"><ContactsOutlined /></span>
              <h2>选择一位联系人</h2>
              <p>查看对方资料，或联系本人和个人助理。</p>
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
        <ContactFinder kind="people" onOpen={openProfile} active={adding} />
      </Modal>
    </div>
  );
}
