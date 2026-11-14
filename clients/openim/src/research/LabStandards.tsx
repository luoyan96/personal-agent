import { Alert, Button, Dropdown, Input, Modal, Segmented, Select } from "antd";
import { useEffect, useLayoutEffect, useState } from "react";
import type { WorkRule } from "@research-agent-platform/contracts";
import {
  ArrowLeftOutlined,
  EditOutlined,
  InfoCircleOutlined,
  MoreOutlined,
  PlusOutlined,
  ReloadOutlined,
} from "@ant-design/icons";
import { RecordWorkspace } from "./RecordWorkspace";
import { useNavigate, useSearchParams } from "react-router-dom";

import type { LocalLibraryStatus } from "@/types/localLibrary";

import { researchApi } from "./api";
import { LocalLibraryPicker } from "./LocalLibraryPicker";
import {
  composePptTemplate,
  isPptTemplate,
  parsePptTemplate,
  pptStartPrompt,
  pptTemplateTitle,
} from "./ppt-template";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";
import { workbenchTaskPath } from "./workbench-links";

const statusLabels = {
  active: "生效中",
  candidate: "待负责人确认",
  revoked: "已撤回",
} as const;

/**
 * Lab rules used to be reachable only from inside a task, so nobody could tell
 * what the group actually works by. This page is the one place to read them,
 * change them, and see which materials are the group's own templates.
 */
export function LabStandards() {
  const availability = useWorkspaceAvailability(true);
  const supported = availability.supports(40);
  const linksSupported = availability.supports(45);
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const section = ["platform", "templates", "methods"].includes(
    params.get("section") || "",
  )
    ? params.get("section")!
    : "rules";
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [revokeRecord, setRevokeRecord] = useState<WorkRule>();
  const [versionRecord, setVersionRecord] = useState<WorkRule>();
  const changeSection = (nextSection: string) => {
    const next = new URLSearchParams(params);
    next.set("panel", "standards");
    next.set("section", nextSection);
    setParams(next);
    setSelectedId("");
    setSearch("");
    setStatus("all");
  };
  const actor = useResearchStore((s) => s.actor);
  const operation = usePersonalOperation(supported, `lab-standards:${section}`);
  const read = useResearchRead(
    (signal) => researchApi("labWorkRules", { signal }),
    "lab-work-rules",
    supported && Boolean(actor),
    { timeoutMs: 10000 },
  );
  const collections = useResearchRead(
    (signal) => researchApi("researchCollections", { signal, query: { limit: 100 } }),
    "lab-standards-collections",
    supported && Boolean(actor) && section === "templates",
    { timeoutMs: 10000 },
  );
  const [editing, setEditing] = useState<{
    id?: string;
    version: number;
    mode: "rule" | "ppt" | "link";
    /** A rule keeps its title; a PPT template keeps only the name after the prefix. */
    title: string;
    content: string;
    /** One file per line, only for PPT templates. */
    files: string;
    /** Links may cite the task they came from; that task's dispatcher confirms them. */
    sourceTask?: string;
  }>();
  const sourceTasks = useResearchRead(
    async (signal) => {
      const tasks: { value: string; label: string }[] = [];
      const seen = new Set<string>();
      let cursor: string | undefined;
      do {
        const response = await researchApi("tasks", {
          signal,
          query: {
            labId: actor!.member.labId,
            scope: "mine",
            status: "completed",
            limit: 100,
            cursor,
          },
        });
        for (const task of response.data)
          if ("leadId" in task && task.leadId === actor?.member.id)
            tasks.push({ value: task.id, label: task.title });
        cursor = response.nextCursor ?? undefined;
        if (cursor && seen.has(cursor)) throw Error("任务分页未完成，请重新读取。");
        if (cursor) seen.add(cursor);
      } while (cursor);
      return tasks;
    },
    "link-source-tasks",
    linksSupported && Boolean(actor) && editing?.mode === "link" && !editing.id,
    { poll: false },
  );
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);
  const [library, setLibrary] = useState<LocalLibraryStatus>();
  const [picking, setPicking] = useState(false);
  useLayoutEffect(() => {
    setEditing(undefined);
    setBusy(false);
    setFailure("");
    setNotice("");
    setLibrary(undefined);
    setSelectedId("");
    setSearch("");
    setStatus("all");
    setVersionRecord(undefined);
    setRevokeRecord(undefined);
    setPicking(false);
  }, [operation.scope]);
  const data = read.data?.data;
  const records = data?.records || [];
  const templates = records.filter((r) => r.kind === "rule" && isPptTemplate(r.title));
  const links = records.filter((r) => r.kind === "link");
  const rules = records.filter((r) => r.kind !== "link" && !isPptTemplate(r.title));
  const labCollections = (collections.data?.data || []).filter(
    (c) => c.scope === "lab_shared",
  );
  const submit = async (
    action: "save" | "confirm" | "revoke",
    record?: {
      id: string;
      version: number;
      title: string;
      content: string;
      kind: "rule" | "link" | "memory";
      sourceTaskId: string | null;
    },
  ) => {
    const draft = record
      ? {
          id: record.id,
          version: record.version,
          mode: record.kind === "link" ? ("link" as const) : ("rule" as const),
          title: record.title,
          content: record.content,
          files: "",
          sourceTask: record.sourceTaskId ?? "",
        }
      : editing;
    if (!draft) return;
    const template = !record && draft.mode === "ppt";
    const link = draft.mode === "link";
    const captured = operation.capture();
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      const saved = await researchApi("saveLabWorkRule", {
        body: {
          scope: "lab",
          kind: link ? "link" : "rule",
          title: template ? pptTemplateTitle(draft.title) : draft.title.trim(),
          content: template
            ? composePptTemplate({
                name: draft.title,
                requirements: draft.content,
                files: draft.files.split("\n"),
              })
            : draft.content.trim(),
          ...(link && draft.sourceTask?.trim()
            ? { sourceTaskId: draft.sourceTask.trim() }
            : {}),
          recordId: draft.id ?? null,
          expectedVersion: draft.version,
          action,
        },
      });
      if (!captured.isCurrent()) return;
      setEditing(undefined);
      setSelectedId(saved.data.id);
      setStatus("all");
      setSearch("");
      setNotice(
        link
          ? action === "revoke"
            ? "已撤回这条方法。"
            : action === "confirm" || data?.canPublish
            ? "方法已生效，可按需查阅；不会自动加入规划或聊天。"
            : "方法已提交，等待派发人或负责人确认。"
          : action === "revoke"
          ? "已撤回，这条不会再进入新任务。"
          : action === "confirm"
          ? "已确认生效，之后的任务会带上它。"
          : data?.canPublish
          ? "已保存并生效，之后的任务会带上它。"
          : "已提交，负责人确认后生效。",
      );
      await read.refresh();
    } catch (e) {
      if (captured.isCurrent())
        setFailure(e instanceof Error ? e.message : "未保存，内容已保留。");
    } finally {
      if (captured.isCurrent()) setBusy(false);
    }
  };
  // Starting a deck reuses the template's requirements instead of retyping them.
  const startWithTemplate = (record: { title: string; content: string }) => {
    const template = parsePptTemplate(record.title, record.content);
    navigate(
      `/workbench?${new URLSearchParams({
        view: "tasks",
        draft: pptStartPrompt(template),
      })}`,
    );
  };
  const readLibrary = async () => {
    const captured = operation.capture();
    const bridge = window.electronAPI?.localLibrary;
    if (!bridge) {
      setLibrary({ registered: false });
      return;
    }
    try {
      const status = await bridge.status();
      if (captured.isCurrent()) setLibrary(status);
    } catch {
      if (captured.isCurrent()) setLibrary({ registered: false });
    }
  };
  useEffect(() => {
    void readLibrary();
  }, [operation.scope]);
  const visible = (
    section === "templates" ? templates : section === "methods" ? links : rules
  ).filter(
    (record) =>
      (status === "all" || record.status === status) &&
      [record.title, record.content]
        .join(" ")
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const selected = visible.find((r) => r.id === selectedId) || visible[0];
  const edit = (record?: WorkRule) => {
    const ppt = section === "templates";
    const template =
      record && ppt ? parsePptTemplate(record.title, record.content) : undefined;
    setFailure("");
    setNotice("");
    setEditing({
      id: record?.id,
      version: record?.version ?? 0,
      mode: ppt ? "ppt" : section === "methods" ? "link" : "rule",
      title: template?.name ?? record?.title ?? "",
      content: template?.requirements ?? record?.content ?? "",
      files: template?.files.join("\n") ?? "",
      sourceTask: record?.sourceTaskId ?? "",
    });
  };
  const displayTitle = (record: WorkRule) =>
    isPptTemplate(record.title)
      ? parsePptTemplate(record.title, record.content).name
      : record.title;
  const displayContent = (record: WorkRule) =>
    isPptTemplate(record.title)
      ? parsePptTemplate(record.title, record.content).requirements
      : record.content;
  const tabName =
    section === "templates"
      ? "PPT 工作模板"
      : section === "methods"
      ? "可复用方法"
      : section === "platform"
      ? "平台基本规则"
      : "课题组规则";
  const groupedNavigation = availability.supports(44);
  const tabs = groupedNavigation
    ? section === "templates" || section === "methods"
      ? [
          ["templates", "PPT 模板"],
          ["methods", "可复用方法"],
        ]
      : [
          ["rules", "课题组规则"],
          ["platform", "平台基本规则"],
        ]
    : [
        ["rules", "课题组规则"],
        ["platform", "平台基本规则"],
        ["templates", "PPT 模板"],
        ["methods", "可复用方法"],
      ];
  if (!supported)
    return (
      <WorkspaceUnavailable
        feature="课题组规范"
        pending={!availability.data && !availability.error}
        error={availability.error}
        onRetry={availability.refresh}
      />
    );
  return (
    <section className="record-page library-standards-page" aria-label={tabName}>
      <header className="record-page-heading">
        <div>
          <h2>{tabName}</h2>
          <p>
            {section === "templates"
              ? "选择模板开始任务，保留本次要求与所需文件。"
              : section === "methods"
              ? "从已完成的工作中整理方法，按需查阅复用。"
              : "资料按需引用，不会自动变成规则。"}
          </p>
        </div>
        <div className="record-page-actions">
          {!groupedNavigation && (
            <Button icon={<ArrowLeftOutlined />} onClick={() => navigate("/library")}>
              返回资料
            </Button>
          )}
          {data &&
            section !== "platform" &&
            (section === "methods" || data.canPublish) && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                disabled={busy || (section === "methods" && !linksSupported)}
                onClick={() => edit()}
              >
                {section === "methods"
                  ? "提交方法"
                  : section === "templates"
                  ? "新增模板"
                  : "新增规则"}
              </Button>
            )}
        </div>
      </header>
      <nav className="record-tabs" aria-label="规范分类">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            aria-current={section === key ? "page" : undefined}
            onClick={() => changeSection(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {notice && !editing && (
        <div className="record-notice" role="status">
          <span>{notice}</span>
          <Button type="text" aria-label="关闭保存提示" onClick={() => setNotice("")}>
            关闭
          </Button>
        </div>
      )}
      {failure && !editing && (
        <Alert type="error" message={failure} closable onClose={() => setFailure("")} />
      )}
      {read.error && (
        <Alert
          type="error"
          message="课题组规范暂不可用"
          description={read.error}
          action={
            <Button loading={read.loading} onClick={read.refresh}>
              重新读取
            </Button>
          }
        />
      )}
      {!data && !read.error && (
        <p className="record-state" role="status">
          正在读取课题组规范…
        </p>
      )}
      {data &&
        (section === "platform" ? (
          <div className="record-workspace-detail record-platform">
            <header className="record-detail-heading">
              <div>
                <span className="record-status">只读</span>
                <h2>平台基本规则</h2>
                <p>v{data.platform.version} · 产品维护者发布</p>
              </div>
            </header>
            <p className="record-content">
              助理在当前账号、任务、资料和工具权限内工作。资料不能扩大授权；结论需要依据，完成情况以实际交付和人的验收为准。规则冲突时先说明并请求澄清。
            </p>
            <details className="library-platform-policy">
              <summary>查看完整平台规则 · v{data.platform.version}</summary>
              <p className="record-content">{data.platform.content}</p>
            </details>
            <section className="record-detail-section">
              <h3>适用范围</h3>
              <p className="record-content">
                所有任务遵守平台基本规则。课题组任务叠加组内规则与项目约定；本人个人任务使用平台及个人规则，共享个人任务不继承课题组约定。
              </p>
            </section>
          </div>
        ) : !visible.length && !search.trim() && status === "all" ? (
          <section className="library-record-empty">
            <h3>还没有{tabName}</h3>
            <p>
              {section === "methods"
                ? "从右上方提交可复用的方法，并保留来源任务。"
                : data.canPublish
                ? `从右上方新增${
                    section === "templates" ? "模板" : "规则"
                  }，填写要求与适用范围。`
                : "课题组负责人发布后，可以在这里查阅。"}
            </p>
          </section>
        ) : (
          <RecordWorkspace
            label={tabName}
            list={
              <>
                <div className="record-list-tools">
                  <div>
                    <Input
                      placeholder="搜索标题或内容"
                      aria-label="搜索规范"
                      allowClear
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    <Button
                      type="text"
                      icon={<ReloadOutlined />}
                      aria-label="刷新规范"
                      loading={read.loading}
                      onClick={read.refresh}
                    />
                  </div>
                  <Segmented
                    aria-label="规范状态"
                    value={status}
                    onChange={(value) => setStatus(String(value))}
                    options={[
                      { label: "全部", value: "all" },
                      { label: "生效中", value: "active" },
                      { label: "待确认", value: "candidate" },
                      { label: "已撤回", value: "revoked" },
                    ]}
                  />
                </div>
                {visible.map((record) => (
                  <button
                    key={record.id}
                    className="record-row"
                    aria-pressed={selected?.id === record.id}
                    onClick={() => setSelectedId(record.id)}
                  >
                    <div>
                      <strong>{displayTitle(record)}</strong>
                      <span className={`record-status is-${record.status}`}>
                        {record.status === "candidate"
                          ? "待确认"
                          : statusLabels[record.status]}
                      </span>
                    </div>
                    <p>{displayContent(record)}</p>
                    <small>
                      v{record.version} ·{" "}
                      {new Date(record.updatedAt).toLocaleDateString("zh-CN")}
                    </small>
                  </button>
                ))}
                {!visible.length && (
                  <p className="record-empty">
                    {search || status !== "all"
                      ? "没有符合条件的记录。"
                      : `还没有${tabName}。`}
                  </p>
                )}
              </>
            }
          >
            {selected ? (
              <>
                <header className="record-detail-heading">
                  <div>
                    <span className={`record-status is-${selected.status}`}>
                      {statusLabels[selected.status]}
                    </span>
                    <h2>{displayTitle(selected)}</h2>
                    <p>
                      {selected.authorName} · v{selected.version} ·{" "}
                      {new Date(selected.updatedAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                  <div className="record-detail-actions">
                    {selected.allowedActions.includes("revise") && (
                      <Button
                        icon={<EditOutlined />}
                        disabled={busy}
                        onClick={() => edit(selected)}
                      >
                        {section === "rules" ? "编辑规则" : "编辑"}
                      </Button>
                    )}
                    {selected.status === "candidate" &&
                      selected.allowedActions.includes("confirm") && (
                        <Button
                          type="primary"
                          loading={busy}
                          onClick={() => void submit("confirm", selected)}
                        >
                          确认生效
                        </Button>
                      )}
                    <Dropdown
                      trigger={["click"]}
                      menu={{
                        items: [
                          {
                            key: "version",
                            label: "版本信息",
                            icon: <InfoCircleOutlined />,
                            onClick: () => setVersionRecord(selected),
                          },
                          ...(selected.status !== "revoked" &&
                          selected.allowedActions.includes("revoke")
                            ? [
                                {
                                  key: "revoke",
                                  label: "撤回",
                                  danger: true,
                                  disabled: busy,
                                  onClick: () => setRevokeRecord(selected),
                                },
                              ]
                            : []),
                        ],
                      }}
                    >
                      <Button icon={<MoreOutlined />} aria-label="更多规范操作" />
                    </Dropdown>
                  </div>
                </header>
                <section className="record-detail-section">
                  <h3>{section === "rules" ? "适用范围" : "使用方式"}</h3>
                  <p className="record-content">
                    {section === "rules"
                      ? "生效的课题组规则由既有规则链带入课题组任务。本人个人任务与共享个人任务保持各自规则范围。"
                      : section === "methods"
                      ? "方法按需查阅，不自动加入规划或聊天；来源任务的派发人或负责人确认后可供全组复用。"
                      : "开始任务时带入模板要求，你只需补充本次变化。"}
                  </p>
                </section>
                <section className="record-detail-section">
                  <h3>
                    {section === "rules"
                      ? "规则内容"
                      : section === "methods"
                      ? "方法内容"
                      : "模板要求"}
                  </h3>
                  <p className="record-content">{displayContent(selected)}</p>
                </section>
                {section === "templates" && (
                  <>
                    <section className="record-detail-section">
                      <h3>要准备的文件</h3>
                      <p className="record-content">
                        {parsePptTemplate(selected.title, selected.content).files.join(
                          "\n",
                        ) || "未指定文件。"}
                      </p>
                    </section>
                    {selected.status === "active" && (
                      <Button
                        type="primary"
                        disabled={busy}
                        onClick={() => startWithTemplate(selected)}
                      >
                        用它开始
                      </Button>
                    )}
                  </>
                )}
                {selected.sourceTaskId && (
                  <Button
                    onClick={() =>
                      navigate(workbenchTaskPath(selected.sourceTaskId!, "research"))
                    }
                  >
                    查看来源任务
                  </Button>
                )}
              </>
            ) : (
              <div className="record-empty">
                <h3>选择一条记录，查看内容</h3>
                <p>
                  {data.canPublish
                    ? "可以从上方新增，或调整筛选条件。"
                    : "生效规则由课题组负责人发布。"}
                </p>
              </div>
            )}
          </RecordWorkspace>
        ))}
      {section === "templates" && data && (
        <div className="record-page-actions">
          <Button onClick={() => navigate("/library?panel=index")}>
            设置本地资料文件夹
          </Button>
          <Button onClick={() => navigate("/library?panel=collections")}>
            查看共享模板与范文
          </Button>
          {collections.error && <span role="alert">{collections.error}</span>}
          {labCollections.length > 0 && (
            <span className="workspace-muted">
              {labCollections.length} 个课题组资料集合
            </span>
          )}
        </div>
      )}
      <Modal
        open={!!editing}
        title={
          editing?.mode === "ppt"
            ? "编辑 PPT 模板"
            : editing?.mode === "link"
            ? "编辑可复用方法"
            : editing?.id
            ? "编辑课题组规则"
            : "新增课题组规则"
        }
        width={640}
        className="record-editor"
        footer={null}
        maskClosable={false}
        closable={!busy}
        onCancel={() => {
          if (!busy) {
            setEditing(undefined);
            setFailure("");
          }
        }}
        destroyOnClose
      >
        <p className="workspace-muted">
          {data?.canPublish
            ? "保存后按现有权限生效。"
            : "提交后等待有权限的负责人确认。"}
        </p>
        {failure && <Alert type="error" message={failure} />}
        {editing && (
          <div className="workspace-standards-editor" aria-label="编辑课题组规则">
            <Input
              aria-label={
                editing.mode === "ppt"
                  ? "模板名称"
                  : editing.mode === "link"
                  ? "链路名称"
                  : "规则标题"
              }
              maxLength={80}
              placeholder={
                editing.mode === "ppt"
                  ? "模板名称，例如：组会汇报 / 项目申报答辩"
                  : editing.mode === "link"
                  ? "一句话说明这个链路解决什么问题，例如：审稿意见逐条回复"
                  : "一句话说明这条约定，例如：项目书按 7 个小节写"
              }
              value={editing.title}
              disabled={busy}
              onChange={(e) => setEditing((s) => s && { ...s, title: e.target.value })}
            />
            <Input.TextArea
              aria-label={
                editing.mode === "ppt"
                  ? "模板要求"
                  : editing.mode === "link"
                  ? "链路正文"
                  : "规则正文"
              }
              rows={4}
              maxLength={2000}
              placeholder={
                editing.mode === "ppt"
                  ? "每次都要重复说的要求：受众、页数、每页信息量、配色、字体、结构（背景-方法-结果-结论）、图表风格。"
                  : editing.mode === "link"
                  ? "做法本身：几步、每步判断依据、容易出错的地方。写结论不写过程。"
                  : "写清楚要求本身，例如：摘要 300 字以内；引用统一 GB/T 7714；结果先给结论再给证据。"
              }
              value={editing.content}
              disabled={busy}
              onChange={(e) =>
                setEditing((s) => s && { ...s, content: e.target.value })
              }
            />
            {editing.mode === "ppt" && (
              <>
                <Input.TextArea
                  aria-label="要准备的文件"
                  rows={3}
                  maxLength={1000}
                  placeholder={
                    "这次要放进工作文件夹的文件，每行一个：\n组会母版.pptx\n实验室介绍.pptx\n成果统计.xlsx"
                  }
                  value={editing.files}
                  disabled={busy}
                  onChange={(e) =>
                    setEditing((s) => s && { ...s, files: e.target.value })
                  }
                />
                <div className="workspace-standards-actions">
                  <Button
                    size="small"
                    disabled={busy || !library?.registered}
                    onClick={() => setPicking(true)}
                  >
                    从本地资料文件夹选择
                  </Button>
                  <span className="workspace-muted">
                    选完写成相对路径，换机器只要目录结构相同就能用。
                  </span>
                </div>
              </>
            )}
            {editing.mode === "link" && (
              <>
                <Select
                  aria-label="来源任务"
                  showSearch
                  optionFilterProp="label"
                  style={{ width: "100%" }}
                  placeholder="选择你承接并已完成的来源任务"
                  value={editing.sourceTask || undefined}
                  loading={sourceTasks.loading}
                  options={
                    editing.id
                      ? [{ value: editing.sourceTask, label: "已关联的来源任务" }]
                      : sourceTasks.data || []
                  }
                  disabled={busy || Boolean(editing.id)}
                  onChange={(value) =>
                    setEditing((s) => s && { ...s, sourceTask: value })
                  }
                />
                {sourceTasks.error && (
                  <Alert
                    type="error"
                    message={sourceTasks.error}
                    action={<Button onClick={sourceTasks.refresh}>重新读取</Button>}
                  />
                )}
              </>
            )}
            <div>
              <Button
                type="primary"
                loading={busy}
                disabled={
                  !editing.title.trim() ||
                  !editing.content.trim() ||
                  (editing.mode === "link" && !editing.sourceTask)
                }
                onClick={() => void submit("save")}
              >
                保存
              </Button>
              <Button disabled={busy} onClick={() => setEditing(undefined)}>
                取消
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!revokeRecord}
        title="撤回这条记录？"
        okText="撤回"
        cancelText="取消"
        confirmLoading={busy}
        cancelButtonProps={{ disabled: busy }}
        closable={!busy}
        maskClosable={false}
        onCancel={() => {
          if (!busy) setRevokeRecord(undefined);
        }}
        onOk={async () => {
          if (revokeRecord) {
            await submit("revoke", revokeRecord);
            setRevokeRecord(undefined);
          }
        }}
      >
        <p>
          「{revokeRecord ? displayTitle(revokeRecord) : ""}
          」撤回后不再用于新的任务；已有记录保留。
        </p>
      </Modal>
      <Modal
        open={!!versionRecord}
        title="版本信息"
        footer={<Button onClick={() => setVersionRecord(undefined)}>关闭</Button>}
        onCancel={() => setVersionRecord(undefined)}
      >
        {versionRecord && (
          <>
            <dl className="record-version-meta">
              <dt>名称</dt>
              <dd>{displayTitle(versionRecord)}</dd>
              <dt>当前版本</dt>
              <dd>v{versionRecord.version}</dd>
              <dt>状态</dt>
              <dd>{statusLabels[versionRecord.status]}</dd>
              <dt>提交人</dt>
              <dd>{versionRecord.authorName}</dd>
              <dt>更新时间</dt>
              <dd>{new Date(versionRecord.updatedAt).toLocaleString("zh-CN")}</dd>
            </dl>
            <p className="workspace-muted">
              此处显示服务端返回的当前版本；完整历史版本浏览尚未接入。
            </p>
          </>
        )}
      </Modal>
      <LocalLibraryPicker
        open={picking}
        selected={(editing?.files || "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)}
        confirmLabel="填进模板"
        onClose={() => setPicking(false)}
        onPick={(rels) => {
          setEditing((s) => s && { ...s, files: rels.join("\n") });
          setPicking(false);
        }}
      />
    </section>
  );
}
