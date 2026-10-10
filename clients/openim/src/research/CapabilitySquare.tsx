import { Alert, App, Button, Input, Modal, Segmented, Select } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { CapabilityPublication, Contact } from "@research-agent-platform/contracts";
import OIMAvatar from "@/components/OIMAvatar";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { WorkspaceContactCard } from "./WorkspaceContactCard";
import { ResearchUserCard } from "./ResearchUserCard";
import type { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { workspaceApi } from "./workspace-api";
import "./workspace.scss";
import { readWorkspaceAvailability } from "./workspace-availability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";
import { CapabilityTemplates } from "./CapabilityTemplates";
import { AgentResearchCollections } from "./KnowledgeLibrary";
import { capabilityCategory, capabilityInput, capabilityStatus, researchCategories, type ResearchCategory } from "./capability-center";
import "./capability-center.scss";
import "./research-library.scss";

function PublicationDetail({
  id,
  onManage,
  onInvite,
  onWithdraw,
  onChanged,
}: {
  id: string;
  onManage: (contactId: string) => void;
  onInvite: (publication: CapabilityPublication) => void;
  onWithdraw: (publication: CapabilityPublication) => void;
  onChanged: () => Promise<void>;
}) {
  const read = useResearchRead(
    () => researchApi("capabilityPublication", { params: { id } }),
    `square-publication:${id}`,
  );
  const publication = read.data?.data;
  if (!publication)
    return (
      <div className="workspace-namecard">
        {read.error ? (
          <Alert type="warning" message={read.error} />
        ) : (
          <p role="status">正在读取公开能力资料…</p>
        )}
      </div>
    );
  const c = publication.contact,
    canInvite =
      c.allowedActions.includes("chat") &&
      (!c.agentRuntime || c.agentRuntime.callerAllowed);
  return (
    <WorkspaceContactCard
      key={c.id}
      contactId={c.id}
      onManage={onManage}
      onChanged={onChanged}
    >
      <div className="workspace-publication-details">
        <div className="workspace-tags">
          {publication.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
        <p className="workspace-muted">
          {publication.status === "published"
            ? "本人主动公开的能力资料，不包含私人记忆、聊天和 Key。"
            : "已撤回公开；已有好友关系由双方独立管理。"}
        </p>
        <div className="workspace-card-actions">
          {canInvite && (
            <Button onClick={() => onInvite(publication)}>邀请加入群</Button>
          )}
          {publication.allowedActions.includes("withdraw") && (
            <Button danger onClick={() => onWithdraw(publication)}>
              撤回公开
            </Button>
          )}
        </div>
      </div>
    </WorkspaceContactCard>
  );
}

export function CapabilitySquare() {
  const [view, setView] = useState<"public" | "lab" | "mine">("public");
  const [category, setCategory] = useState<ResearchCategory>("全部");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const availability = useResearchRead(
    readWorkspaceAvailability,
    "workspace-availability",
  );
  const supported = availability.data?.available === true;
  const read = useResearchRead(
    () => workspaceApi.square("public", "all", query, cursor),
    `square:public:${query}:${cursor || ""}`,
    supported && view === "public",
  );
  const local = useResearchRead((signal) => researchApi("chatContacts", { query: { view: view === "mine" ? "mine" : "directory", scope: "local", search: query, cursor, limit: 30 }, signal }), `square-contacts:${view}:${query}:${cursor || ""}`, supported && view !== "public");
  const actorId = useResearchStore((s) => s.actor?.member.id),
    generation = useResearchStore((s) => s.generation);
  const [selected, setSelected] = useState<string>(),
    [managedContact, setManagedContact] = useState<string>();
  const [selectedContact, setSelectedContact] = useState<string>();
  const selectedContactRead = useResearchRead((signal) => researchApi("chatContact", { params: { id: selectedContact! }, signal }), `square-selected-contact:${selectedContact}`, !!selectedContact && supported);
  const profile = useRef<OverlayVisibleHandle>(null);
  const [publishing, setPublishing] = useState(false),
    [contactId, setContactId] = useState(""),
    [tagText, setTagText] = useState("");
  const own = useResearchRead(
    () => researchApi("chatContacts", { query: { view: "mine", limit: 100 } }),
    "square-own-contacts",
    publishing && supported,
  );
  const mine = useResearchRead(
    () => workspaceApi.square("mine", "all", ""),
    "square-own-publications",
    publishing && supported,
  );
  const [invite, setInvite] = useState<CapabilityPublication>(),
    [groupId, setGroupId] = useState("");
  const groups = useResearchRead(
    () => researchApi("chatConversations", { query: { limit: 100 } }),
    `square-invite:${invite?.id || ""}`,
    !!invite && supported,
  );
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState("");
  const operation = usePersonalOperation(
      true,
      `square:${view}:${selected}:${publishing}:${invite?.id || ""}:${supported}`,
    ),
    inFlight = useRef(false);
  const { modal } = App.useApp();
  useLayoutEffect(() => {
    if (!supported) {
      setSelected(undefined);
      setSelectedContact(undefined);
      setPublishing(false);
      setInvite(undefined);
    }
  }, [supported]);
  useLayoutEffect(() => {
    setSelected(undefined);
    setSelectedContact(undefined);
    setPublishing(false);
    setInvite(undefined);
    setManagedContact(undefined);
    setFailure("");
    setNotice("");
    setPages([undefined]);
    setBusy(false);
    inFlight.current = false;
    setContactId("");
    setTagText("");
  }, [generation]);
  useLayoutEffect(() => {
    inFlight.current = false;
    setBusy(false);
    setFailure("");
  }, [operation.scope]);
  const ownContacts =
    own.data?.data.filter((c) =>
      c.identity.kind === "human"
        ? c.identity.memberId === actorId
        : c.identity.kind === "personal_agent" && c.identity.ownerMemberId === actorId,
    ) || [];
  const sourceContacts = (local.data?.data || []).filter(c => view !== "mine" || (c.identity.kind === "personal_agent" && c.identity.ownerMemberId === actorId));
  const publicResults = (read.data?.data || []).filter(p => category === "全部" || capabilityCategory(p.contact, p.tags) === category);
  const localResults = sourceContacts.filter(c => category === "全部" || capabilityCategory(c) === category);
  const librarySupported = !!availability.data?.version && Number(availability.data.version.split(".")[1]) >= 24;
  const refreshLists = async () => { await Promise.all([read.refresh(), local.refresh()]); };
  const ownerLabel = (c: Contact) => c.identity.kind === "human" ? c.displayName : c.identity.ownerMemberId === actorId ? "由你维护" : "由所属账号维护";
  const command = async (
    call: () => Promise<unknown>,
    success: string,
    done?: () => void,
  ) => {
    if (!supported || inFlight.current) return;
    const { isCurrent } = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      await call();
      if (!isCurrent()) return;
      await read.refresh();
      if (isCurrent()) {
        setNotice(success);
        done?.();
      }
    } catch (error) {
      if (isCurrent())
        setFailure(error instanceof Error ? error.message : "操作未完成，请稍后重试。");
    } finally {
      if (isCurrent()) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  const publish = () => {
    if (!own.data || !mine.data || !contactId) return;
    const tags = [
      ...new Set(
        tagText
          .split(/[,，\n]/)
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ];
    if (tags.length > 8 || tags.some((t) => t.length > 40)) {
      setFailure("最多填写 8 个标签，每个不超过 40 字。");
      return;
    }
    const existing = mine.data.data.find((p) => p.contactId === contactId);
    const current = operation.capture();
    modal.confirm({
      title: "公开这张能力名片？",
      content:
        "公开名称、介绍、能力、性格和标签，让其他注册用户发现你。私人记忆、聊天及 Key 不会公开。",
      onOk: () =>
        current.isCurrent()
          ? command(
              () =>
                researchApi("publishCapability", {
                  body: { contactId, expectedVersion: existing?.version || 0, tags },
                }),
              "能力名片已公开。",
              () => {
                setPublishing(false);
                setView("mine");
                setPages([undefined]);
              },
            )
          : undefined,
    });
  };
  const withdraw = (p: CapabilityPublication) => {
    const current = operation.capture();
    modal.confirm({
      title: "撤回公开能力？",
      content: "广场将不再展示这张名片；不会删除联系人，也不会取消已建立的好友关系。",
      onOk: () =>
        current.isCurrent()
          ? command(
              () =>
                researchApi("withdrawCapability", {
                  params: { id: p.id },
                  body: { expectedVersion: p.version },
                }),
              "已撤回公开。",
              () => setSelected(undefined),
            )
          : undefined,
    });
  };
  const startInvite = (p: CapabilityPublication) => {
    setInvite(p);
    setGroupId("");
    setFailure("");
  };
  const selectedGroup = groups.data?.data.find(
    (g) =>
      g.id === groupId && g.kind === "group" && g.allowedActions.includes("invite"),
  );
  const inviteToGroup = () => {
    if (!invite || !selectedGroup) return;
    const current = operation.capture();
    modal.confirm({
      title: `邀请 ${invite.contact.displayName} 加入“${selectedGroup.title}”？`,
      content:
        "真人或私人 Agent 的主人仍需接受群邀请；这不授予科研任务或资料的额外权限。",
      onOk: () =>
        current.isCurrent()
          ? command(
              () =>
                researchApi("imInviteContact", {
                  params: { id: selectedGroup.id },
                  body: {
                    contactId: invite.contactId,
                    expectedConversationVersion: selectedGroup.version,
                  },
                }),
              "群邀请已按当前权限提交，等待对方同意。",
              () => setInvite(undefined),
            )
          : undefined,
    });
  };
  return (
    <div className="social-workspace workspace-square">
      <header className="workspace-heading">
        <div>
          <h1>科研能力中心</h1>
          <p>为科研任务找到合适的助手，使用你获准的资料。</p>
        </div>
        <Button
          type="primary"
          disabled={!supported}
          onClick={() => {
            setPublishing(true);
            setContactId("");
            setTagText("");
            setFailure("");
          }}
        >
          公开我的能力
        </Button>
        <img className="capability-center-desk" src="/assets/acceptcat/research-desk.jpg" alt="猫咪科研书桌" />
      </header>
      <div className="workspace-toolbar">
        <Segmented
          value={view}
          onChange={(v) => {
            setView(v as typeof view);
            setPages([undefined]);
            setSelected(undefined);
            setSelectedContact(undefined);
          }}
          options={[
            { label: "发现能力", value: "public" },
            { label: "课题组能力", value: "lab" },
            { label: "我的 Agent", value: "mine" },
          ]}
        />
        <Segmented
          aria-label="科研能力分类"
          value={category}
          onChange={(v) => {
            setCategory(v as ResearchCategory);
            setSelected(undefined);
            setSelectedContact(undefined);
          }}
          options={[...researchCategories]}
        />
        <Input.Search
          aria-label="搜索公开能力"
          placeholder="名称、能力或标签"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => {
            setQuery(v.trim());
            setPages([undefined]);
            setSelected(undefined);
            setSelectedContact(undefined);
          }}
        />
      </div>
      {(read.error || local.error || failure || notice) && (
        <Alert
          className="mx-5 mt-3"
          type={read.error || local.error || failure ? "warning" : "info"}
          message={read.error || local.error || failure || notice}
          action={(read.error || local.error) ? <Button onClick={refreshLists}>重试读取</Button> : undefined}
        />
      )}
      {!supported ? (
        <WorkspaceUnavailable
          feature="能力广场"
          pending={!availability.data && !availability.error}
          error={availability.error}
          onRetry={availability.refresh}
        />
      ) : (
        <div className={`workspace-square-body ${selected || selectedContact ? "has-selection" : ""}`}>
          <section className="workspace-square-results" aria-label="公开能力列表">
            {!(view === "public" ? read.data : local.data) && !(read.error || local.error) && (
              <p role="status" className="p-5">
                正在读取科研能力…
              </p>
            )}
            <div className="workspace-capability-grid">
              {view === "public" && publicResults.map((p) => (
                <button
                  className="workspace-capability-card"
                  key={p.id}
                  aria-pressed={selected === p.id}
                  onClick={() => { setSelected(p.id); setSelectedContact(undefined); }}
                >
                  <header>
                    <OIMAvatar text={p.contact.displayName} size={44} />
                    <div>
                      <h2>{p.contact.displayName}</h2>
                      <span
                        className={`workspace-kind ${
                          p.contact.identity.kind === "human" ? "human" : "agent"
                        }`}
                      >
                        {p.contact.identity.kind === "human" ? "个人" : "Agent"}
                      </span>
                    </div>
                  </header>
                  <p className="workspace-capability-description">
                    {p.contact.profile.capabilityDescription ||
                      p.contact.profile.introduction ||
                      "本人尚未填写能力介绍"}
                  </p>
                  <dl className="capability-card-fields"><div><dt>适用输入</dt><dd>{capabilityInput(p.contact)}</dd></div><div><dt>维护者</dt><dd>{ownerLabel(p.contact)}</dd></div></dl>
                  <div className="workspace-tags">
                    {p.tags.map((t) => (
                      <span key={t}>{t}</span>
                    ))}
                  </div>
                  <footer>
                    <span>
                      {capabilityStatus(p.contact)}
                    </span>
                    <span>
                      {p.status === "withdrawn"
                        ? "已撤回"
                        : p.contact.allowedActions.includes("chat") && p.contact.availability.status === "available"
                        ? "查看与聊天"
                        : p.contact.relationship.status === "pending_outbound"
                        ? "申请中"
                        : "查看名片"}
                    </span>
                  </footer>
                </button>
              ))}
              {view !== "public" && localResults.map(c => <button className="workspace-capability-card" key={c.id} aria-pressed={selectedContact === c.id} onClick={() => { setSelectedContact(c.id); setSelected(undefined); }}><header><OIMAvatar text={c.displayName} size={44} /><div><h2>{c.displayName}</h2><span className="workspace-kind">{c.identity.kind === "human" ? "个人" : "Agent"}</span></div></header><p className="workspace-capability-description">{c.profile.introduction || c.profile.capabilityDescription || "尚未填写能力用途"}</p><dl className="capability-card-fields"><div><dt>适用输入</dt><dd>{capabilityInput(c)}</dd></div><div><dt>维护者</dt><dd>{ownerLabel(c)}</dd></div></dl><footer><span>{capabilityStatus(c)}</span><span>{c.allowedActions.includes("edit_profile") ? "打开配置" : "查看详情"}</span></footer></button>)}
            </div>
            {(view === "public" ? read.data && !publicResults.length : local.data && !localResults.length) && (
              <div className="workspace-empty">
                <h2>{view === "mine" ? "暂无匹配的私人 Agent" : view === "lab" ? "暂无匹配的课题组能力" : "暂无匹配的公开能力"}</h2>
                <p>
                  {view === "mine"
                    ? "从配置模板添加一个助手，之后打开配置并选择获准资料。"
                    : "调整筛选条件，或从下方配置模板创建自己的 Agent。"}
                </p>
              </div>
            )}
            {(pages.length > 1 || (view === "public" ? read.data?.nextCursor : local.data?.nextCursor)) && (
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
                  disabled={!(view === "public" ? read.data?.nextCursor : local.data?.nextCursor)}
                  onClick={() => {
                    const nextCursor = view === "public" ? read.data?.nextCursor : local.data?.nextCursor;
                    if (nextCursor) setPages((v) => [...v, nextCursor]);
                  }}
                >
                  更多能力
                </Button>
              </div>
            )}
            <CapabilityTemplates key={generation} category={category} search={query} onChanged={refreshLists} onConfigure={id => { setView("mine"); setSelected(undefined); setSelectedContact(id); setPages([undefined]); }} />
            <p className="capability-center-boundary">脚本执行与视觉工具尚未接通。分类依据当前能力介绍；真实用途和输入以维护者配置为准。</p>
          </section>
          {selectedContact && <aside className="workspace-square-detail"><Button type="text" className="workspace-close-detail" onClick={() => setSelectedContact(undefined)}>收起详情</Button><WorkspaceContactCard key={selectedContact} contactId={selectedContact} onManage={id => { setManagedContact(id); profile.current?.openOverlay(); }} onChanged={refreshLists}>{selectedContactRead.data?.data.identity.kind !== "human" && selectedContactRead.data?.data.allowedActions.includes("edit_profile") && librarySupported && <AgentResearchCollections key={selectedContact} agentId={selectedContact} />}</WorkspaceContactCard></aside>}
          {selected && (
            <aside className="workspace-square-detail">
              <Button
                type="text"
                className="workspace-close-detail"
                onClick={() => setSelected(undefined)}
              >
                收起名片
              </Button>
              <PublicationDetail
                key={selected}
                id={selected}
                onManage={(id) => {
                  setManagedContact(id);
                  profile.current?.openOverlay();
                }}
                onInvite={startInvite}
                onWithdraw={withdraw}
                onChanged={read.refresh}
              />
            </aside>
          )}
        </div>
      )}
      <ResearchUserCard contactId={managedContact} ref={profile} />
      <Modal
        title="公开我的能力"
        open={publishing}
        onCancel={() => setPublishing(false)}
        footer={null}
        destroyOnClose
        className="workspace-add-dialog"
      >
        <div className="workspace-task-form">
          <p className="workspace-muted">
            公开是可撤回的。只公开这张名片的公开资料，不包含记忆、模型 Key 或聊天内容。
          </p>
          {(own.error || mine.error) && (
            <Alert type="error" message={own.error || mine.error} />
          )}
          <label>
            选择名片
            <Select
              aria-label="公开的联系人"
              value={contactId || undefined}
              disabled={!own.data || !mine.data || busy}
              options={ownContacts.map((c) => ({ value: c.id, label: c.displayName }))}
              onChange={(id) => {
                setContactId(id);
                setTagText(
                  mine.data?.data.find((p) => p.contactId === id)?.tags.join("，") ||
                    "",
                );
              }}
            />
          </label>
          {contactId && (
            <p className="workspace-muted">
              {ownContacts.find((c) => c.id === contactId)?.profile
                .capabilityDescription ||
                "建议先在联系人资料里写明能力、适合的输入和边界。"}
            </p>
          )}
          <label>
            能力标签
            <Input
              aria-label="能力标签"
              placeholder="用逗号分隔，例如论文修改、数据分析"
              value={tagText}
              disabled={busy}
              maxLength={328}
              onChange={(e) => setTagText(e.target.value)}
            />
          </label>
          {failure && <Alert type="error" message={failure} />}
          <Button
            type="primary"
            disabled={!contactId || !own.data || !mine.data || busy}
            onClick={publish}
          >
            确认公开
          </Button>
        </div>
      </Modal>
      <Modal
        title="邀请加入群"
        open={!!invite}
        onCancel={() => setInvite(undefined)}
        footer={null}
        destroyOnClose
        className="workspace-add-dialog"
      >
        <div className="workspace-task-form">
          <p>邀请 {invite?.contact.displayName} 参与已有群聊。</p>
          {groups.error && <Alert type="error" message={groups.error} />}
          <Select
            aria-label="邀请目标群"
            placeholder="选择你可邀请成员的群"
            value={groupId || undefined}
            options={groups.data?.data
              .filter((g) => g.kind === "group" && g.allowedActions.includes("invite"))
              .map((g) => ({ value: g.id, label: g.title }))}
            onChange={setGroupId}
          />
          <p className="workspace-muted">
            好友关系和群邀请分别取得同意，不会自动分享私人记忆或任务资料。
          </p>
          {groups.data &&
            !groups.data.data.some(
              (g) => g.kind === "group" && g.allowedActions.includes("invite"),
            ) && (
              <p className="workspace-muted">
                当前没有可邀请成员的群。可以先在工作台确认一项协作安排。
              </p>
            )}
          {failure && <Alert type="error" message={failure} />}
          <Button
            type="primary"
            disabled={!selectedGroup || busy}
            onClick={inviteToGroup}
          >
            确认邀请
          </Button>
        </div>
      </Modal>
    </div>
  );
}
