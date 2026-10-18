import { Alert, App, Button, Input, Modal, Segmented, Select } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type {
  CapabilityPublication,
  Contact,
} from "@research-agent-platform/contracts";
import OIMAvatar from "@/components/OIMAvatar";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { WorkspaceContactCard } from "./WorkspaceContactCard";
import { ResearchUserCard } from "./ResearchUserCard";
import type { OverlayVisibleHandle } from "@/hooks/useOverlayVisible";
import { workspaceApi } from "./workspace-api";
import { readWorkspaceAvailability } from "./workspace-availability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";
import { CapabilityTemplates, matchingStarterTemplates } from "./CapabilityTemplates";
import { CommunityDiscovery } from "./CommunityDiscovery";
import { AgentCapabilityFeedCard } from "./AgentCapabilityFeedCard";
import { AgentResources, type OpenAgentSkills } from "./AgentResources";
import {
  capabilityCategory,
  capabilityStatus,
  researchCategories,
  type ResearchCategory,
} from "./capability-center";
import "./workspace.scss";
import "./capability-center.scss";
import "./research-library.scss";
import "./capability-feed.scss";

function ConfiguredCapabilityPreview({ contact }: { contact: Contact }) {
  const description =
    /输出[：:]([^\n]+)/.exec(contact.profile.capabilityDescription)?.[1] ||
    contact.profile.capabilityDescription ||
    contact.profile.introduction;
  return (
    <div className="capability-outcome-preview preview-blue capability-configured-preview">
      <span className="capability-preview-label">维护者的能力介绍</span>
      <h4>{capabilityCategory(contact)}</h4>
      <p>{description || "尚未填写能力介绍，先打开名片了解详情。"}</p>
    </div>
  );
}

export function CapabilitySquare() {
  return <CapabilityBrowser view="public" />;
}

export function WorkbenchCapabilities({
  view,
  onOpenSkills,
  initialContactId,
}: {
  view: "lab" | "mine";
  onOpenSkills?: OpenAgentSkills;
  initialContactId?: string;
}) {
  return (
    <CapabilityBrowser
      key={`${view}:${initialContactId}`}
      view={view}
      onOpenSkills={onOpenSkills}
      initialContactId={initialContactId}
    />
  );
}

function CapabilityBrowser({
  view,
  onOpenSkills,
  initialContactId,
}: {
  view: "public" | "lab" | "mine";
  onOpenSkills?: OpenAgentSkills;
  initialContactId?: string;
}) {
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
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const actorId = actor?.member.id;
  const local = useResearchRead(
    (signal) =>
      researchApi("chatContacts", {
        query: {
          view: view === "mine" ? "mine" : "directory",
          scope: "local",
          search: query,
          cursor,
          limit: 30,
        },
        signal,
      }),
    `square-contacts:${view}:${query}:${cursor || ""}`,
    supported && view !== "public",
  );
  const community = useResearchRead(
    (signal) => researchApi("communityCatalog", { signal }),
    "square-community-catalog",
    supported && view === "public",
  );
  const [selectedContact, setSelectedContact] = useState<string | undefined>(
      initialContactId,
    ),
    [managedContact, setManagedContact] = useState<string>();
  const selectedContactRead = useResearchRead(
    (signal) =>
      researchApi("chatContact", { params: { id: selectedContact! }, signal }),
    `square-selected-contact:${selectedContact}`,
    !!selectedContact && supported,
  );
  const profile = useRef<OverlayVisibleHandle>(null);
  const [publishing, setPublishing] = useState(false),
    [contactId, setContactId] = useState(""),
    [tagText, setTagText] = useState("");
  const own = useResearchRead(
    (signal) =>
      researchApi("chatContacts", { query: { view: "mine", limit: 100 }, signal }),
    "square-own-contacts",
    publishing && supported,
  );
  const mine = useResearchRead(
    () => workspaceApi.square("mine", "all", ""),
    "square-own-publications",
    publishing && supported,
  );
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [notice, setNotice] = useState("");
  const operation = usePersonalOperation(
      true,
      `square:${view}:${selectedContact}:${publishing}:${supported}`,
    ),
    inFlight = useRef(false);
  const { modal } = App.useApp();
  useLayoutEffect(() => {
    if (!supported) {
      setSelectedContact(undefined);
      setPublishing(false);
    }
  }, [supported]);
  useLayoutEffect(() => {
    setSelectedContact(initialContactId);
    setPublishing(false);
    setManagedContact(undefined);
    setFailure("");
    setNotice("");
    setPages([undefined]);
    setBusy(false);
    inFlight.current = false;
    setContactId("");
    setTagText("");
    setSearch("");
    setQuery("");
  }, [generation, initialContactId]);
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
  const localResults = (local.data?.data || []).filter(
    (c) =>
      (view !== "mine" ||
        (c.identity.kind === "personal_agent" &&
          c.identity.ownerMemberId === actorId)) &&
      (category === "全部" || capabilityCategory(c) === category),
  );
  const hasTemplates =
    view === "mine" && matchingStarterTemplates(category, query).length > 0;
  const librarySupported =
    !!availability.data?.version &&
    Number(availability.data.version.split(".")[1]) >= 24;
  const refreshLists = async () => {
    await Promise.all([local.refresh(), own.refresh(), mine.refresh()]);
  };
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
      await refreshLists();
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
      setFailure("最多填写8个标签，每个不超过40字。");
      return;
    }
    const existing = mine.data.data.find((p) => p.contactId === contactId),
      current = operation.capture();
    modal.confirm({
      title: "公开这张能力名片？",
      content: "公开名称、介绍、能力、性格和标签。私人记忆、聊天及Key不会公开。",
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
                setPages([undefined]);
              },
            )
          : undefined,
    });
  };
  const withdraw = (publication: CapabilityPublication) => {
    const current = operation.capture();
    modal.confirm({
      title: "撤回公开能力？",
      content: "不会删除联系人或取消已建立的好友关系。",
      onOk: () =>
        current.isCurrent()
          ? command(
              () =>
                researchApi("withdrawCapability", {
                  params: { id: publication.id },
                  body: { expectedVersion: publication.version },
                }),
              "已撤回公开。",
            )
          : undefined,
    });
  };
  const resetFilters = () => {
    setCategory("全部");
    setSearch("");
    setQuery("");
    setPages([undefined]);
    setSelectedContact(undefined);
  };
  return (
    <div className="social-workspace workspace-square capability-feed">
      <header className="workspace-heading">
        <div>
          {view === "public" ? (
            <h1>科研广场</h1>
          ) : (
            <h2>{view === "mine" ? "我的 Agent" : "课题组能力"}</h2>
          )}
          <p>
            {view === "public"
              ? "在 GitHub 社区里，发现适合你研究的能力。"
              : view === "mine"
              ? "选择助手，统一管理它的技能、模型与资料。"
              : "了解课题组成员和 Agent 的能力。"}
          </p>
        </div>
        <Input.Search
          className="capability-feed-search"
          aria-label={view === "public" ? "搜索公开能力" : "搜索科研助手"}
          placeholder={view === "public" ? "搜索 GitHub 科研能力" : "搜索科研助手"}
          value={search}
          allowClear
          maxLength={100}
          onChange={(e) => {
            setSearch(e.target.value);
            if (!e.target.value) {
              setQuery("");
              setPages([undefined]);
            }
          }}
          onSearch={(v) => {
            setQuery(v.trim());
            setPages([undefined]);
            setSelectedContact(undefined);
          }}
        />
        {view === "mine" && onOpenSkills && (
          <Button onClick={() => onOpenSkills()}>技能库</Button>
        )}
        {view !== "public" && (
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
        )}
      </header>
      {view !== "public" && (
        <div className="workspace-toolbar">
          <Segmented
            className="capability-feed-categories"
            aria-label="科研能力分类"
            value={category}
            onChange={(v) => {
              setCategory(v as ResearchCategory);
              setSelectedContact(undefined);
            }}
            options={[...researchCategories]}
          />
        </div>
      )}
      {((view !== "public" && local.error) || failure || notice) && (
        <Alert
          className="mx-5 mt-3"
          type={(view !== "public" && local.error) || failure ? "warning" : "info"}
          message={(view !== "public" && local.error) || failure || notice}
          action={
            local.error && view !== "public" ? (
              <Button onClick={refreshLists}>重试读取</Button>
            ) : undefined
          }
        />
      )}
      {!supported ? (
        <WorkspaceUnavailable
          feature={
            view === "public"
              ? "科研广场"
              : view === "mine"
              ? "我的 Agent"
              : "课题组能力"
          }
          pending={!availability.data && !availability.error}
          error={availability.error}
          onRetry={availability.refresh}
        />
      ) : (
        <div
          className={`workspace-square-body ${selectedContact ? "has-selection" : ""}`}
        >
          <section
            className="workspace-square-results"
            aria-label={view === "public" ? "科研发现内容" : "科研助手内容"}
          >
            {view === "public" ? (
              <CommunityDiscovery
                key={`${generation}:${actorId}`}
                actorId={actorId || ""}
                expertise={actor?.member.publicExpertise || []}
                catalog={community.data?.data}
                loading={community.loading}
                error={community.error}
                onRefresh={community.refresh}
                search={query}
                onClearSearch={resetFilters}
                onConfigure={setSelectedContact}
                operationScope={`${selectedContact}:${publishing}`}
              />
            ) : (
              <>
                {!local.data && !local.error && (
                  <p role="status" className="p-5">
                    正在读取科研能力…
                  </p>
                )}
                {!!localResults.length && (
                  <div className="capability-feed-section-heading">
                    <h2>{view === "mine" ? "我的科研助手" : "来自课题组的能力"}</h2>
                    <p>
                      {view === "mine"
                        ? "打开配置，管理技能、模型与资料。"
                        : "由维护者填写，点开了解与联系。"}
                    </p>
                  </div>
                )}
                <div className="capability-discovery-grid capability-live-grid">
                  {localResults.map((c) => (
                    <AgentCapabilityFeedCard
                      key={c.id}
                      contact={c}
                      actionName={c.displayName}
                      operationScope={`${view}:${selectedContact}:${publishing}:${category}:${query}`}
                      onConfigure={(id) => setSelectedContact(id)}
                      title={c.displayName}
                      openLabel={`查看${c.displayName}配置`}
                      name={
                        c.identity.kind === "human"
                          ? c.displayName
                          : c.identity.ownerMemberId === actorId
                          ? "由你维护"
                          : "由所属账号维护"
                      }
                      outcomes={
                        c.profile.introduction || "打开配置了解实际用途与输入。"
                      }
                      status={capabilityStatus(c)}
                      icon={<OIMAvatar text={c.displayName} size={32} />}
                      preview={<ConfiguredCapabilityPreview contact={c} />}
                      selected={selectedContact === c.id}
                      onOpen={() => setSelectedContact(c.id)}
                    />
                  ))}
                </div>
                {local.data && !localResults.length && (
                  <div className="capability-feed-empty">
                    <p>
                      {view === "mine"
                        ? "还没有匹配的私人 Agent，从下面的内置助手挑一个开始。"
                        : "还没有匹配的课题组能力。"}
                    </p>
                    {(query || category !== "全部") && (
                      <Button size="small" onClick={resetFilters}>
                        清除筛选
                      </Button>
                    )}
                  </div>
                )}
                {(pages.length > 1 || local.data?.nextCursor) && (
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
                      disabled={!local.data?.nextCursor}
                      onClick={() => {
                        const next = local.data?.nextCursor;
                        if (next) setPages((v) => [...v, next]);
                      }}
                    >
                      更多能力
                    </Button>
                  </div>
                )}
                {view === "mine" && hasTemplates && (
                  <>
                    <div className="capability-feed-section-heading">
                      <h2>添加内置科研助手</h2>
                      <p>选择一个文字助手，添加到你的 Agent，再配置模型与资料。</p>
                    </div>
                    <div className="capability-discovery-grid">
                      <CapabilityTemplates
                        key={generation}
                        category={category}
                        search={query}
                        onChanged={refreshLists}
                        operationScope={`${selectedContact}:${publishing}`}
                        onConfigure={(id) => {
                          setSelectedContact(id);
                          setPages([undefined]);
                        }}
                      />
                    </div>
                    <p className="capability-center-boundary">
                      示例展示交付形式，并非实际生成结果。具体输入、资料权限与接入状态见各项用法。
                    </p>
                  </>
                )}
              </>
            )}
          </section>
          {selectedContact && (
            <aside className="workspace-square-detail">
              <Button
                type="text"
                className="workspace-close-detail"
                onClick={() => setSelectedContact(undefined)}
              >
                收起详情
              </Button>
              <WorkspaceContactCard
                key={selectedContact}
                contactId={selectedContact}
                onManage={(id) => {
                  setManagedContact(id);
                  profile.current?.openOverlay();
                }}
                onChanged={refreshLists}
              >
                {selectedContactRead.data?.data.identity.kind === "personal_agent" &&
                  selectedContactRead.data.data.identity.ownerMemberId === actorId &&
                  !selectedContactRead.data.data.agentRuntime &&
                  selectedContactRead.data?.data.allowedActions.includes(
                    "edit_profile",
                  ) &&
                  librarySupported && (
                    <AgentResources
                      key={selectedContact}
                      agentId={selectedContact}
                      onOpenSkills={onOpenSkills}
                    />
                  )}
              </WorkspaceContactCard>
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
            只公开能力名片，不包含记忆、模型Key或聊天内容。可在此管理已公开的名片。
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
          {mine.data?.data
            .filter((p) => p.status === "published")
            .map((p) => (
              <div className="workspace-card-actions" key={p.id}>
                <span>{p.contact.displayName} · 已公开</span>
                <Button danger disabled={busy} onClick={() => withdraw(p)}>
                  撤回公开
                </Button>
              </div>
            ))}
        </div>
      </Modal>
    </div>
  );
}
