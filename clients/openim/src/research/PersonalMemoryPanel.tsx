import { Alert, App, Button, Dropdown, Input, Select, Skeleton } from "antd";
import {
  ReadOutlined,
  EllipsisOutlined,
  LockOutlined,
  PlusOutlined,
  SearchOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useLayoutEffect, useRef, useState } from "react";
import type {
  PersonalMemory,
  PersonalMemorySettings,
} from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import {
  PersonalMemoryEditor,
  PersonalMemorySettingsEditor,
} from "./PersonalMemoryEditors";
import "./personal-memory.scss";
import { MemoryText, memoryOrigins } from "./memory-presentation";

const origins = memoryOrigins;
const filters = { confirmed: "已记住", candidate: "待确认", revoked: "已移除" };
type Filter = keyof typeof filters;
type Category = "all" | PersonalMemory["scope"];
const shortDate = (date: string) =>
  new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(date));

function MemoryEntry({
  memory,
  busy,
  edit,
  decide,
  source,
}: {
  memory: PersonalMemory;
  busy: boolean;
  edit: (memory: PersonalMemory) => void;
  decide: (memory: PersonalMemory, decision: "confirm" | "revoke") => void;
  source: (memory: PersonalMemory) => void;
}) {
  return (
    <article className="memory-entry">
      <span
        className={`memory-icon ${memory.scope === "topic" ? "blue" : ""}`}
        aria-hidden
      >
        <ReadOutlined />
      </span>
      <div className="memory-entry-copy">
        <h3>{memory.topic}</h3>
        <MemoryText text={memory.content} />
        <div className="memory-entry-meta">
          {origins[memory.origin]} ·{" "}
          {memory.scope === "general" ? "通用偏好" : "主题记忆"} ·{" "}
          {shortDate(memory.updatedAt)}
        </div>
      </div>
      <div className="memory-entry-actions">
        {memory.allowedActions.includes("confirm") && (
          <Button
            disabled={busy}
            onClick={() => decide(memory, "confirm")}
            className="memory-confirm"
          >
            确认记住
          </Button>
        )}
        {memory.allowedActions.includes("edit") && (
          <Button
            type="text"
            disabled={busy}
            onClick={() => edit(memory)}
            aria-label={`修改${memory.topic}`}
          >
            修改
          </Button>
        )}
        <Dropdown
          trigger={["click"]}
          disabled={busy}
          menu={{
            items: [
              {
                key: "source",
                label: "来源详情",
                onClick: () => source(memory),
              },
              ...(memory.allowedActions.includes("revoke")
                ? [
                    {
                      key: "remove",
                      label: "移除记忆",
                      danger: true,
                      onClick: () => decide(memory, "revoke"),
                    },
                  ]
                : []),
            ],
          }}
        >
          <Button
            type="text"
            icon={<EllipsisOutlined />}
            aria-label={`${memory.topic}的更多操作`}
          />
        </Dropdown>
      </div>
    </article>
  );
}

export function PersonalMemoryPanel({ active }: { active: boolean }) {
  const { modal } = App.useApp();
  const operation = usePersonalOperation(active, "personal-memory");
  const overlays = useRef<{ destroy: () => void }[]>([]);
  useLayoutEffect(
    () => () => {
      for (const overlay of overlays.current) overlay.destroy();
      overlays.current = [];
    },
    [operation.scope]
  );
  const ownModal = (overlay: { destroy: () => void }) => {
    overlays.current.push(overlay);
  };
  const [filter, setFilter] = useState<Filter>("confirmed");
  const [category, setCategory] = useState<Category>("all");
  const [search, setSearch] = useState("");
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const cursor = pages[pages.length - 1];
  // The API caps confirmed records at 50. One complete read grounds the list and
  // its scope filter; candidates never enter the confirmed list.
  const confirmed = useResearchRead(
    (signal) =>
      researchApi("personalMemories", {
        query: { status: "confirmed", limit: 100 },
        signal,
      }),
    `memory-overview:${operation.scope}`,
    active
  );
  const history = useResearchRead(
    (signal) =>
      researchApi("personalMemories", {
        query: { status: filter, limit: 30, cursor },
        signal,
      }),
    `memory-history:${operation.scope}:${filter}:${cursor || ""}`,
    active && filter !== "confirmed"
  );
  const settings = useResearchRead(
    (signal) => researchApi("personalMemorySettings", { signal }),
    `memory-settings:${operation.scope}`,
    active
  );
  const [policy, setPolicy] = useState<PersonalMemorySettings>();
  const [editorOpen, setEditorOpen] = useState(false),
    [settingsOpen, setSettingsOpen] = useState(false);
  const [topic, setTopic] = useState(""),
    [content, setContent] = useState("");
  const [memoryScope, setMemoryScope] =
    useState<PersonalMemory["scope"]>("general");
  const [editing, setEditing] = useState<PersonalMemory>();
  const [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [saved, setSaved] = useState("");
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    setTopic("");
    setContent("");
    setMemoryScope("general");
    setEditing(undefined);
    setFilter("confirmed");
    setCategory("all");
    setSearch("");
    setPages([undefined]);
    setPolicy(undefined);
    setEditorOpen(false);
    setSettingsOpen(false);
    setBusy(false);
    inFlight.current = false;
    setFailure("");
    setSaved("");
  }, [operation.scope]);
  useLayoutEffect(() => {
    if (active && settings.data && !policy) setPolicy(settings.data.data);
  }, [active, settings.data, policy]);
  const ready = !!confirmed.data && !!settings.data && active;
  const currentList = filter === "confirmed" ? confirmed : history;
  const memories = confirmed.data?.data || [];
  const visible = (currentList.data?.data || []).filter(
    (memory) =>
      (category === "all" || category === memory.scope) &&
      (!search.trim() ||
        `${memory.topic} ${memory.content}`
          .toLocaleLowerCase()
          .includes(search.trim().toLocaleLowerCase()))
  );
  const newest = memories.reduce<string | undefined>(
    (date, memory) =>
      !date || memory.updatedAt > date ? memory.updatedAt : date,
    undefined
  );
  const refresh = () =>
    Promise.all([confirmed.refresh(), history.refresh(), settings.refresh()]);
  const run = async (
    request: () => Promise<unknown>,
    after?: () => void,
    success = "记忆已更新。"
  ) => {
    if (inFlight.current || !ready) return;
    const current = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    setSaved("");
    try {
      await request();
      if (!current.isCurrent()) return;
      after?.();
      await refresh();
      if (current.isCurrent()) setSaved(success);
    } catch (error) {
      if (current.isCurrent()) {
        setFailure(
          error instanceof Error ? error.message : "操作未完成，请稍后重试。"
        );
        await refresh();
      }
    } finally {
      if (current.isCurrent()) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  const selectFilter = (value: Filter) => {
    setFilter(value);
    setCategory("all");
    setPages([undefined]);
    setSaved("");
  };
  const openEditor = (memory?: PersonalMemory) => {
    setEditing(memory);
    setTopic(memory?.topic || "");
    setContent(memory?.content || "");
    setMemoryScope(memory?.scope || "general");
    setFailure("");
    setSaved("");
    setEditorOpen(true);
  };
  const decision = (memory: PersonalMemory, value: "confirm" | "revoke") => {
    const current = operation.capture();
    const submit = () =>
      current.isCurrent()
        ? run(() =>
            researchApi("decidePersonalMemory", {
              params: { id: memory.id },
              body: { expectedVersion: memory.version, decision: value },
            })
          )
        : undefined;
    ownModal(
      modal.confirm(
        value === "revoke"
          ? {
              title: "不再记住这件事？",
              content:
                "移除后，之后的聊天不再使用这条记忆。你仍可以在“已移除”中查看历史。",
              okText: "移除记忆",
              cancelText: "取消",
              onOk: submit,
            }
          : {
              title: "记住这条偏好？",
              content: `确认“${memory.topic}”后才会用于回答；同主题的旧偏好会被替换。`,
              okText: "确认记住",
              cancelText: "取消",
              onOk: submit,
            }
      )
    );
  };
  const showSource = (memory: PersonalMemory) =>
    ownModal(
      modal.info({
        title: memory.topic,
        content: (
          <div className="memory-source">
            <p>
              {origins[memory.origin]} · {filters[memory.status]}
            </p>
            <p>
              更新于 {new Date(memory.updatedAt).toLocaleString("zh-CN")} · 版本{" "}
              {memory.version}
            </p>
            {memory.sourceMessageId && (
              <p>来源消息：{memory.sourceMessageId}</p>
            )}
          </div>
        ),
        okText: "知道了",
      })
    );
  const showScope = () =>
    ownModal(
      modal.info({
        title: "这些记忆怎么使用",
        content: (
          <div className="memory-source">
            <p>
              只用于你自己的本站 Agent 私聊。群聊、其他人的 Agent 和接入的外部
              Agent 不会使用。
            </p>
            <p>
              “待确认”中的候选不会用于回答，确认后才生效。你可以随时修改或移除。
            </p>
            <p>这里是你的个人记忆，与单个 Agent 的私有记忆分别管理。</p>
          </div>
        ),
        okText: "知道了",
      })
    );

  return (
    <section className="personal-memory" aria-label="我的习惯">
      <header className="memory-heading">
        <div>
          <h1>我的习惯</h1>
          <p>
            查看聊天中形成和你明确保存的偏好。
            {newest && ` · 最近更新 ${shortDate(newest)}`}
          </p>
        </div>
        <div className="memory-heading-actions">
          <Button
            type="primary"
            icon={<PlusOutlined />}
            aria-label="补充一条习惯"
            disabled={!ready || busy}
            onClick={() => openEditor()}
          >
            补充一条
          </Button>
          <Button
            icon={<SettingOutlined />}
            aria-label="设置"
            disabled={!settings.data || busy}
            onClick={() => {
              setFailure("");
              setSettingsOpen(true);
            }}
          >
            设置
          </Button>
        </div>
      </header>
      {(confirmed.error || currentList.error || settings.error || failure) && (
        <Alert
          type="error"
          message={
            failure || confirmed.error || currentList.error || settings.error
          }
          action={
            <Button size="small" disabled={busy} onClick={() => void refresh()}>
              重试读取
            </Button>
          }
        />
      )}
      {saved && (
        <p role="status" className="memory-success">
          {saved}
        </p>
      )}
      <div className="memory-list-region">
        <div className="memory-list-toolbar">
          <Select
            aria-label="习惯状态"
            value={filter}
            disabled={busy}
            onChange={selectFilter}
            options={(Object.keys(filters) as Filter[]).map((value) => ({
              value,
              label: filters[value],
            }))}
          />
          <Input
            aria-label={
              filter === "confirmed" ? "搜索我的习惯" : "搜索本页习惯"
            }
            placeholder={
              filter === "confirmed" ? "搜索我的习惯" : "搜索本页习惯"
            }
            prefix={<SearchOutlined />}
            value={search}
            allowClear
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            aria-label="适用范围"
            value={category}
            disabled={busy}
            onChange={setCategory}
            options={[
              { value: "all", label: "全部范围" },
              { value: "general", label: "通用习惯" },
              { value: "topic", label: "相关主题" },
            ]}
          />
        </div>
        {filter === "candidate" && (
          <p className="memory-state-note">
            这些是助理提出的候选，确认后才会用于回答。
          </p>
        )}
        {filter === "revoked" && (
          <p className="memory-state-note">
            这些记忆已停止使用，保留在这里供你查看。
          </p>
        )}
        <div role="tabpanel" aria-label={filters[filter]}>
          {!currentList.data && !currentList.error && (
            <Skeleton active title={false} paragraph={{ rows: 3 }} />
          )}
          {visible.map((memory) => (
            <MemoryEntry
              key={memory.id}
              memory={memory}
              busy={busy || !ready}
              edit={openEditor}
              decide={decision}
              source={showSource}
            />
          ))}
          {currentList.data && !visible.length && (
            <div className="memory-empty">
              <ReadOutlined aria-hidden />
              <h3>
                {search.trim() || category !== "all"
                  ? "没有找到匹配的记忆"
                  : filter === "confirmed"
                  ? "还没有记住的事"
                  : filter === "candidate"
                  ? "暂时没有待确认的记忆"
                  : "暂时没有移除的记忆"}
              </h3>
              <p>
                {search.trim() || category !== "all"
                  ? "换个关键词，或查看全部记忆。"
                  : filter === "confirmed"
                  ? "比如：回答先给结论，再列关键依据。"
                  : filter === "candidate"
                  ? "有新的候选时，会在这里等你确认。"
                  : "移除后的记忆会保留在这里，不再用于回答。"}
              </p>
              {filter === "confirmed" &&
                !search.trim() &&
                category === "all" && (
                  <Button
                    disabled={!ready || busy}
                    onClick={() => openEditor()}
                  >
                    记住第一件事
                  </Button>
                )}
            </div>
          )}
        </div>
        {filter !== "confirmed" &&
          (pages.length > 1 || history.data?.nextCursor) && (
            <nav className="memory-pagination" aria-label="记忆分页">
              <Button
                disabled={busy || !history.data || pages.length <= 1}
                onClick={() => setPages((value) => value.slice(0, -1))}
              >
                上一页
              </Button>
              <span>第 {pages.length} 页</span>
              <Button
                disabled={busy || !history.data?.nextCursor}
                onClick={() => {
                  if (history.data?.nextCursor)
                    setPages((value) => [...value, history.data!.nextCursor!]);
                }}
              >
                下一页
              </Button>
            </nav>
          )}
      </div>
      <footer className="memory-privacy">
        <LockOutlined aria-hidden />
        <span>仅用于你自己的 Agent 私聊</span>
        <button onClick={showScope}>了解使用范围</button>
      </footer>
      <PersonalMemoryEditor
        open={editorOpen && active}
        editing={!!editing}
        confirming={editing?.status === "candidate"}
        busy={busy}
        ready={ready}
        topic={topic}
        content={content}
        scope={memoryScope}
        failure={failure}
        onTopic={setTopic}
        onContent={setContent}
        onScope={setMemoryScope}
        onClose={() => setEditorOpen(false)}
        onSave={() =>
          void run(
            () =>
              editing
                ? researchApi("updatePersonalMemory", {
                    params: { id: editing.id },
                    body: {
                      expectedVersion: editing.version,
                      topic,
                      content,
                      scope: memoryScope,
                    },
                  })
                : researchApi("createPersonalMemory", {
                    body: { topic, content, scope: memoryScope },
                  }),
            () => {
              setEditorOpen(false);
              setEditing(undefined);
              setTopic("");
              setContent("");
            }
          )
        }
      />
      <PersonalMemorySettingsEditor
        open={settingsOpen && active}
        busy={busy}
        policy={policy}
        ready={ready}
        failure={failure}
        onChange={setPolicy}
        onClose={() => setSettingsOpen(false)}
        onReload={() => {
          const current = operation.capture();
          void run(
            async () => {
              const response = await researchApi("personalMemorySettings");
              if (current.isCurrent()) setPolicy(response.data);
            },
            undefined,
            "已重新读取当前设置。"
          );
        }}
        onSave={() => {
          if (!policy) return;
          const current = operation.capture();
          void run(
            async () => {
              try {
                new Intl.DateTimeFormat("zh-CN", {
                  timeZone: policy.timeZone,
                }).format();
              } catch {
                throw new Error("请填写有效时区，例如 Asia/Shanghai。");
              }
              if (
                policy.quietHours &&
                (!policy.quietHours.start ||
                  !policy.quietHours.end ||
                  policy.quietHours.start === policy.quietHours.end)
              )
                throw new Error("安静时段的开始和结束时间不能相同。");
              const response = await researchApi(
                "updatePersonalMemorySettings",
                {
                  body: {
                    expectedVersion: policy.version,
                    candidateLearning: policy.candidateLearning,
                    timeZone: policy.timeZone,
                    quietHours: policy.quietHours,
                  },
                }
              );
              if (current.isCurrent()) setPolicy(response.data);
            },
            () => setSettingsOpen(false),
            "设置已保存。"
          );
        }}
      />
    </section>
  );
}
