import { Alert, App, Button, Input, Modal, Segmented, Select } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { CapabilityPublication } from "@research-agent-platform/contracts";
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
  const [view, setView] = useState<"public" | "mine">("public"),
    [kind, setKind] = useState<"all" | "human" | "agent">("all");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  const read = useResearchRead(
    () => workspaceApi.square(view, kind, query, cursor),
    `square:${view}:${kind}:${query}:${cursor || ""}`,
  );
  const actorId = useResearchStore((s) => s.actor?.member.id),
    generation = useResearchStore((s) => s.generation);
  const [selected, setSelected] = useState<string>(),
    [managedContact, setManagedContact] = useState<string>();
  const profile = useRef<OverlayVisibleHandle>(null);
  const [publishing, setPublishing] = useState(false),
    [contactId, setContactId] = useState(""),
    [tagText, setTagText] = useState("");
  const own = useResearchRead(
    () => researchApi("chatContacts", { query: { view: "mine", limit: 100 } }),
    "square-own-contacts",
    publishing,
  );
  const mine = useResearchRead(
    () => workspaceApi.square("mine", "all", ""),
    "square-own-publications",
    publishing,
  );
  const [invite, setInvite] = useState<CapabilityPublication>(),
    [groupId, setGroupId] = useState("");
  const groups = useResearchRead(
    () => researchApi("chatConversations", { query: { limit: 100 } }),
    `square-invite:${invite?.id || ""}`,
    !!invite,
  );
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState("");
  const operation = usePersonalOperation(
      true,
      `square:${view}:${selected}:${publishing}:${invite?.id || ""}`,
    ),
    inFlight = useRef(false);
  const { modal } = App.useApp();
  useLayoutEffect(() => {
    setSelected(undefined);
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
  const command = async (
    call: () => Promise<unknown>,
    success: string,
    done?: () => void,
  ) => {
    if (inFlight.current) return;
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
          <h1>能力广场</h1>
          <p>发现真人和 Agent 的能力，先认识，再决定是否合作。</p>
        </div>
        <Button
          type="primary"
          onClick={() => {
            setPublishing(true);
            setContactId("");
            setTagText("");
            setFailure("");
          }}
        >
          公开我的能力
        </Button>
      </header>
      <div className="workspace-toolbar">
        <Segmented
          value={view}
          onChange={(v) => {
            setView(v as typeof view);
            setPages([undefined]);
            setSelected(undefined);
          }}
          options={[
            { label: "发现能力", value: "public" },
            { label: "我的公开资料", value: "mine" },
          ]}
        />
        <Segmented
          value={kind}
          onChange={(v) => {
            setKind(v as typeof kind);
            setPages([undefined]);
            setSelected(undefined);
          }}
          options={[
            { label: "全部", value: "all" },
            { label: "个人", value: "human" },
            { label: "Agent", value: "agent" },
          ]}
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
          }}
        />
      </div>
      {(read.error || failure || notice) && (
        <Alert
          className="mx-5 mt-3"
          type={read.error || failure ? "warning" : "info"}
          message={read.error || failure || notice}
        />
      )}
      <div className={`workspace-square-body ${selected ? "has-selection" : ""}`}>
        <section className="workspace-square-results" aria-label="公开能力列表">
          {!read.data && !read.error && (
            <p role="status" className="p-5">
              正在读取公开能力…
            </p>
          )}
          <div className="workspace-capability-grid">
            {read.data?.data.map((p) => (
              <button
                className="workspace-capability-card"
                key={p.id}
                aria-pressed={selected === p.id}
                onClick={() => setSelected(p.id)}
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
                <div className="workspace-tags">
                  {p.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                <footer>
                  <span>
                    {p.contact.agentRuntime
                      ? "外部文字服务"
                      : p.contact.identity.kind === "human"
                      ? "本人能力名片"
                      : "站内 Agent"}
                  </span>
                  <span>
                    {p.status === "withdrawn"
                      ? "已撤回"
                      : p.contact.allowedActions.includes("chat")
                      ? "可聊天"
                      : p.contact.relationship.status === "pending_outbound"
                      ? "申请中"
                      : "查看名片"}
                  </span>
                </footer>
              </button>
            ))}
          </div>
          {read.data && !read.data.data.length && (
            <div className="workspace-empty">
              <h2>{view === "mine" ? "能力资料默认不公开" : "没有匹配的公开能力"}</h2>
              <p>
                {view === "mine"
                  ? "可以选择自己或自己的 Agent，明确公开一张能力名片。"
                  : "换个搜索词，或主动公开你的能力，让朋友发现你。"}
              </p>
            </div>
          )}
          {(pages.length > 1 || read.data?.nextCursor) && (
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
                disabled={!read.data?.nextCursor}
                onClick={() => {
                  const nextCursor = read.data?.nextCursor;
                  if (nextCursor) setPages((v) => [...v, nextCursor]);
                }}
              >
                更多能力
              </Button>
            </div>
          )}
        </section>
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
