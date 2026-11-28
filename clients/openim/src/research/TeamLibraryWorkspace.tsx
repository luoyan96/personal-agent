import {
  Alert,
  Button,
  Checkbox,
  Drawer,
  Dropdown,
  Empty,
  Input,
  Modal,
  Select,
  Spin,
} from "antd";
import {
  CloseOutlined,
  CommentOutlined,
  FileImageOutlined,
  FilePdfOutlined,
  FilePptOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  GithubOutlined,
  MoreOutlined,
  HistoryOutlined,
  PlusOutlined,
  ReloadOutlined,
  SettingOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  TeamLibraryEntry,
  type ResponseFor,
  type WorkbenchCard,
} from "@research-agent-platform/contracts";
import type {
  TeamLibraryPreview,
  TeamLibraryProposal,
  TeamLibrarySnapshot,
} from "@/types/teamLibrary";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchStore } from "./store";
import { nativeWorkbenchTaskPath } from "./workbench-links";
import { RepositoryEditor } from "./RepositoryEditor";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { TeamLibraryFileImport } from "./TeamLibraryFileImport";
import { useOwnAssistantConversation } from "./useOwnAssistantConversation";
import { canUseInWorkbench } from "../../electron/utils/workbenchMaterialFormats";
import { MaterialUseIn, useMaterialSelection } from "./MaterialUseIn";
import "./team-library.scss";

const canUseMaterials = (card: WorkbenchCard) =>
  !!card.taskId &&
  !card.summaryOnly &&
  card.source !== "followup" &&
  card.category !== "completed" &&
  card.allowedActions.some((a) => ["run", "submit"].includes(a));

const purposes = {
  background: "项目背景",
  rule: "规范与要求",
  template: "模板与案例",
  reference: "参考资料",
  figure: "图与素材",
  evidence: "佐证材料",
  output: "归档成果",
  other: "其他",
};
const message = (e: unknown) => {
  const value = e instanceof Error ? e.message : "操作未完成，请重试。";
  return value.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, "");
};
const fileType = (entry: TeamLibraryEntry) =>
  entry.name.split(".").pop()?.toUpperCase() || "文件";
function FileIcon({ entry }: { entry: TeamLibraryEntry }) {
  const kind = fileType(entry);
  return kind === "PDF" ? (
    <FilePdfOutlined className="is-pdf" />
  ) : ["PPT", "PPTX"].includes(kind) ? (
    <FilePptOutlined className="is-ppt" />
  ) : ["PNG", "JPG", "JPEG", "WEBP"].includes(kind) ? (
    <FileImageOutlined className="is-image" />
  ) : (
    <FileTextOutlined />
  );
}

/** Git publishes curated metadata and small text; originals retain their existing ACL. */
export function TeamLibraryWorkspace({ supported }: { supported: boolean }) {
  const navigate = useNavigate(),
    actor = useResearchStore((s) => s.actor);
  const openAssistant = useOwnAssistantConversation();
  const operation = usePersonalOperation(true, "team-library");
  const bridge = window.electronAPI?.teamLibrary;
  const repository = useResearchRead(
    (signal) => researchApi("teamRepository", { signal }),
    "team-library-binding",
    supported && !!actor,
  );
  const [snapshotRecord, setSnapshotRecord] = useState<{
      scope: string;
      value: TeamLibrarySnapshot;
    }>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [syncError, setSyncError] = useState("");
  const [project, setProject] = useState(""),
    [purpose, setPurpose] = useState(""),
    [query, setQuery] = useState("");
  const [navigation, setNavigation] = useState<{
    scope: string;
    revision: string;
    mode: "tree" | "catalog";
    directory: string;
    path: string;
    entryId: string;
  }>();
  const [previewResult, setPreviewResult] = useState<{
      entryId: string;
      scope: string;
      revision: string;
      value: TeamLibraryPreview;
    }>(),
    [previewFailure, setPreviewError] = useState(""),
    [previewPending, setPreviewBusy] = useState(false);
  const [previewRequest, setPreviewRequest] = useState("");
  const [panel, setPanel] = useState(""),
    [configure, setConfigure] = useState(false),
    [history, setHistory] =
      useState<{ revision: string; title: string; date: string }[]>();
  const [historyError, setHistoryError] = useState("");
  const [editing, setEditing] = useState<TeamLibraryEntry | true>(),
    [proposal, setProposal] = useState<TeamLibraryProposal>();
  const [newProject, setNewProject] = useState(false);
  const [importFile, setImportFile] = useState<File>(),
    [importTarget, setImportTarget] = useState(""),
    [taskSearch, setTaskSearch] = useState("");
  const [materialPickerOpen, setMaterialPickerOpen] = useState(false);
  const [taskEntries, setTaskEntries] = useState<TeamLibraryEntry[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const beginImport = (files: FileList | File[], target = "") => {
    if (!files.length) return;
    if (files.length > 1) {
      setError("请一次导入一份资料，便于确认更新目标。");
      return;
    }
    if (files[0].size > 20 * 1024 * 1024) {
      setError("单份仓库文件最多20 MiB，更大文件请从共享原件导入。");
      return;
    }
    setImportTarget(target);
    setImportFile(files[0]);
  };
  const [tasks, setTasks] = useState<WorkbenchCard[]>(),
    [taskCursor, setTaskCursor] = useState<string | null>(),
    [taskBusy, setTaskBusy] = useState(false),
    [includeRules, setIncludeRules] = useState(true);
  const current = repository.data?.data,
    binding = current?.binding;
  const snapshotScope = JSON.stringify([
    operation.generation,
    operation.actorId,
    binding?.labId,
    binding?.version,
    binding?.url,
    binding?.branch,
    binding?.workspaceId,
  ]);
  const activeScope = useRef(snapshotScope);
  activeScope.current = snapshotScope;
  const snapshot =
    snapshotRecord?.scope === snapshotScope ? snapshotRecord.value : undefined;
  const materialSelection = useMaterialSelection(`${snapshotScope}:${snapshot?.revision ?? ""}`);
  const canStage = Boolean(window.electronAPI?.localDsh?.stageMaterialUseIn);
  const materialCheckbox = (filePath?: string) => canStage && (
    <span className="team-library-material-checkbox">
      {filePath && canUseInWorkbench(filePath) && <Checkbox
        aria-label={`选择 ${filePath}`}
        checked={materialSelection.paths.has(filePath)}
        disabled={materialSelection.paths.size >= 10 && !materialSelection.paths.has(filePath)}
        onChange={(event) => materialSelection.toggle(filePath, event.target.checked)}
      />}
    </span>
  );
  const setSnapshot = (value: TeamLibrarySnapshot | undefined) =>
    setSnapshotRecord(value ? { scope: snapshotScope, value } : undefined);
  const matchesBinding = (value: TeamLibrarySnapshot) =>
    !!binding &&
    (["labId", "version", "url", "branch", "workspaceId"] as const).every(
      (key) => value.binding[key] === binding[key],
    );
  const nav =
    navigation?.scope === snapshotScope && navigation.revision === snapshot?.revision
      ? navigation
      : {
          scope: snapshotScope,
          revision: snapshot?.revision || "",
          mode: "tree" as const,
          directory: "",
          path: "",
          entryId: "",
        };
  const setSelected = (entryId: string) =>
    setNavigation({ ...nav, entryId, path: entryId ? nav.path : "" });
  const tree = snapshot?.tree;
  const treeRows = tree
    ?.filter((item) => {
      const prefix = nav.directory ? nav.directory + "/" : "";
      return (
        item.path.startsWith(prefix) &&
        !item.path.slice(prefix.length).includes("/") &&
        item.path !== nav.directory
      );
    })
    .slice()
    .sort(
      (a, b) =>
        Number(b.kind === "folder") - Number(a.kind === "folder") ||
        a.path.localeCompare(b.path, "zh-CN"),
    );
  const selectedFile =
    nav.mode === "tree" ? tree?.find((item) => item.path === nav.path) : undefined;
  const entries = snapshot?.manifest.entries || [];
  const visible = entries.filter(
    (e) =>
      (!project || e.projectId === project) &&
      (!purpose || e.purpose === purpose) &&
      (!query ||
        [e.name, e.summary, e.maintainer].some((s) =>
          s.toLowerCase().includes(query.toLowerCase()),
        )),
  );
  const entry =
    nav.mode === "catalog"
      ? visible.find((e) => e.id === nav.entryId)
      : selectedFile?.kind === "file"
      ? entries.find(
          (e) => e.source.kind === "git" && e.source.path === selectedFile.path,
        )
      : undefined;
  const selectedName = entry?.name || selectedFile?.path.split("/").pop() || "";
  const discussMaterials = () => {
    if (!snapshot) return;
    const repository = snapshot.binding.url
      .replace(/\/$/, "")
      .replace(/\.git$/, "")
      .split("/")
      .slice(-2)
      .join("/");
    const filePath = selectedFile?.path || (entry?.source.kind === "git" ? entry.source.path : "");
    const projectName = snapshot.manifest.projects.find(
      (item) => item.id === (entry ? entry.projectId : project),
    )?.name;
    return openAssistant(
      [
        selectedName ? `我想和你讨论团队资料「${selectedName}」。` : "我想请你帮我查找团队资料。",
        `GitHub 仓库：${repository}（${snapshot.binding.branch}，${snapshot.revision.slice(0, 8)}）`,
        projectName && `项目：${projectName}`,
        filePath ? `文件路径：${filePath}` : nav.mode === "tree" && nav.directory && `目录：${nav.directory}`,
      ].filter(Boolean).join("\n"),
    );
  };
  const previewKey = entry
    ? `entry:${entry.id}`
    : selectedFile
    ? `path:${selectedFile.path}`
    : "";
  const requestKey = JSON.stringify([snapshotScope, snapshot?.revision, previewKey]);
  const previewError = previewRequest === requestKey ? previewFailure : "";
  const previewBusy = !!previewKey && (previewRequest !== requestKey || previewPending);
  const preview =
    previewResult?.scope === snapshotScope &&
    previewResult?.entryId === previewKey &&
    previewResult?.revision === snapshot?.revision
      ? previewResult?.value
      : undefined;
  const sequence = useRef(0);
  useEffect(() => {
    setSnapshot(undefined);
    setSelected("");
    setPreviewResult(undefined);
    setEditing(undefined);
    setProposal(undefined);
    setTasks(undefined);
    setError("");
    setSyncError("");
    setProject("");
    setPurpose("");
    setQuery("");
    setNewProject(false);
    setImportFile(undefined);
    setMaterialPickerOpen(false);
    setTaskEntries([]);
    setConfigure(false);
    setPanel("");
    setHistory(undefined);
    setHistoryError("");
    setImportTarget("");
    setTaskSearch("");
    setTaskBusy(false);
    setNavigation(undefined);
    setBusy(false);
  }, [snapshotScope]);
  const syncSequence = useRef(0);
  const sync = async () => {
    if (!bridge) return;
    const ticket = operation.capture();
    const index = ++syncSequence.current;
    const isCurrent = () =>
      ticket.isCurrent() &&
      activeScope.current === snapshotScope &&
      index === syncSequence.current;
    setBusy(true);
    setSyncError("");
    try {
      const next = await bridge.sync();
      if (isCurrent()) {
        if (!matchesBinding(next))
          throw new Error("仓库配置已变化，请重新同步当前仓库。");
        setSnapshot(next);
      }
    } catch (e) {
      if (isCurrent()) setSyncError(message(e));
    } finally {
      if (isCurrent()) setBusy(false);
    }
  };
  useEffect(() => {
    if (!binding || !bridge) return;
    const ticket = operation.capture();
    let cancelled = false;
    void (async () => {
      try {
        const cached = await bridge.cached();
        if (
          !cancelled &&
          ticket.isCurrent() &&
          activeScope.current === snapshotScope &&
          cached &&
          matchesBinding(cached)
        ) {
          setSnapshot(cached);
        }
        if (!cancelled && ticket.isCurrent() && activeScope.current === snapshotScope)
          await sync();
      } catch (e) {
        if (!cancelled && ticket.isCurrent() && activeScope.current === snapshotScope)
          setSyncError(message(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [snapshotScope, bridge]);
  useEffect(() => {
    const index = ++sequence.current,
      ticket = operation.capture();
    setPreviewRequest(requestKey);
    setPreviewResult(undefined);
    setPreviewError("");
    setPreviewBusy(false);
    if ((!entry && !selectedFile) || !snapshot || !bridge) return;
    if (entry && entry.source.kind !== "git") {
      setPreviewError(
        entry.source.kind === "shared"
          ? "原件通过课题组共享服务取用，进入任务时再次核对权限。"
          : "原件保存在你的资料文件夹，进入任务时校验本地版本。",
      );
      return;
    }
    if (selectedFile && selectedFile.kind !== "file") {
      setPreviewError(
        selectedFile.kind === "symlink"
          ? "符号链接仅显示路径，不读取链接目标。"
          : "子模块需在对应仓库中查看。",
      );
      return;
    }
    if (!entry && !bridge.previewPath) {
      setPreviewError("当前客户端暂不支持仓库文件预览，请更新客户端后重试。");
      return;
    }
    setPreviewBusy(true);
    const request = entry
      ? bridge.preview({ revision: snapshot.revision, entryId: entry.id })
      : bridge.previewPath({ revision: snapshot.revision, path: selectedFile!.path });
    void request
      .then(
        (value) => {
          if (
            index === sequence.current &&
            ticket.isCurrent() &&
            activeScope.current === snapshotScope
          )
            setPreviewResult({
              entryId: previewKey,
              scope: snapshotScope,
              revision: snapshot.revision,
              value,
            });
        },
        (e) => {
          if (index === sequence.current && ticket.isCurrent())
            setPreviewError(message(e));
        },
      )
      .finally(() => {
        if (index === sequence.current && ticket.isCurrent()) setPreviewBusy(false);
      });
    return () => {
      ++sequence.current;
    };
  }, [previewKey, snapshot?.revision, snapshotScope, bridge]);
  const openHistory = async () => {
    const ticket = operation.capture();
    setPanel("history");
    setError("");
    setHistoryError("");
    setHistory(undefined);
    try {
      const values = await bridge?.changes();
      if (ticket.isCurrent()) setHistory(values);
    } catch (e) {
      if (ticket.isCurrent()) {
        setHistoryError(message(e));
        setHistory([]);
      }
    }
  };
  const chooseTask = async (cursor?: string, selected = taskEntries) => {
    const ticket = operation.capture();
    setTaskBusy(true);
    setError("");
    if (!cursor) setTaskSearch("");
    try {
      const response = await researchApi("workbench", {
        query: { category: "all", limit: 100, cursor },
      });
      if (ticket.isCurrent()) {
        const available = response.data.filter(canUseMaterials);
        if (
          !cursor &&
          !response.nextCursor &&
          available.length === 1 &&
          selected.length
        ) {
          useEntry(available[0], selected);
          return;
        }
        setTasks((old) =>
          cursor ? [...(old || []), ...response.data] : response.data,
        );
        setTaskCursor(response.nextCursor);
      }
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    } finally {
      if (ticket.isCurrent()) setTaskBusy(false);
    }
  };
  const useEntry = (card: WorkbenchCard, selected = taskEntries) => {
    if (!snapshot || !card.taskId || card.summaryOnly || !actor || !selected.length) return;
    const target = nativeWorkbenchTaskPath(
      card.taskId,
      card.source === "research_task" ? "research" : "personal",
    );
    const params = new URLSearchParams(target.split("?")[1]);
    for (const material of selected) params.append("teamEntry", material.id);
    params.set("teamRevision", snapshot.revision);
    params.set("teamRules", String(includeRules));
    navigate("/dsh?" + params.toString());
  };
  const run = async (action: () => Promise<unknown>) => {
    const ticket = operation.capture();
    setError("");
    try {
      await action();
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    }
  };
  const syncIssue = syncError || (snapshot?.stale ? snapshot.warning || "未能读取最新资料。" : "");
  const showSyncRecovery = Boolean(binding && (syncIssue || !snapshot));
  const syncDetails = binding && syncIssue && (
    <details className="team-library-sync-details">
      <summary>查看同步详情</summary>
      <p>{syncIssue}</p>
      <p>仓库地址：{binding.url}</p>
      <Button type="link" size="small" onClick={() => setConfigure(true)}>
        {current?.canConfigure ? "仓库设置" : "查看仓库配置"}
      </Button>
    </details>
  );
  const refreshBinding = async () => {
    setConfigure(false);
    repository.invalidate();
    await repository.refresh();
  };
  return (
    <section className="team-library" aria-label="团队资料工作区">
      <div className="team-library-bar">
        <h2 className="team-library-page-title">团队资料</h2>
        <div className="team-library-tools">
          {current?.canConfigure && snapshot && !showSyncRecovery && (
            <Button
              icon={<SettingOutlined />}
              aria-label="仓库设置"
              onClick={() => setConfigure(true)}
            />
          )}
          {snapshot && !showSyncRecovery && (
            <Button
              icon={<ReloadOutlined />}
              disabled={!binding || !bridge}
              loading={busy}
              onClick={sync}
            >
              同步
            </Button>
          )}
          {snapshot && (
            <Button
              type="primary"
              icon={<UploadOutlined />}
              disabled={!snapshot || !bridge}
              onClick={() => {
                setImportTarget("");
                fileInput.current?.click();
              }}
            >
              导入文件
            </Button>
          )}
          {snapshot && (
            <Dropdown
              trigger={["click"]}
              menu={{
                items: [
                  { key: "history", label: "更新记录", icon: <HistoryOutlined /> },
                  {
                    key: "sources",
                    label: "添加更多来源",
                    icon: <PlusOutlined />,
                    disabled: !bridge,
                  },
                ],
                onClick: ({ key }) => {
                  if (key === "history") void openHistory();
                  else setEditing(true);
                },
              }}
            >
              <Button icon={<MoreOutlined />} aria-label="更多资料操作" />
            </Dropdown>
          )}
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        hidden
        onChange={(event) => {
          if (event.target.files) beginImport(event.target.files, importTarget);
          event.target.value = "";
        }}
      />
      {snapshot && (
        <div className="team-library-status">
          {snapshot?.manifest.title || "课题组资料"}
          {snapshot && (
            <small>
              {" "}
              ·{" "}
              {snapshot.stale || syncError || error
                ? "上次成功同步 " +
                  new Date(snapshot.syncedAt).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : new Date(snapshot.syncedAt).toLocaleString("zh-CN", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }) + " 已同步"}
            </small>
          )}
        </div>
      )}
      {(error || (snapshot && repository.error)) && (
        <Alert type="error" showIcon message={error || repository.error} />
      )}
      {snapshot && syncIssue && (
        <Alert
          type="warning"
          showIcon
          message="团队资料同步未完成，正在显示上次成功同步的资料"
          description={syncDetails}
          action={
            <Button size="small" type="primary" loading={busy} onClick={() => void sync()}>
              重新同步
            </Button>
          }
        />
      )}
      <>
          {!supported ? (
            <Alert
              type="info"
              message="团队仓库需要配套 0.44 后台；现有资料入口仍可使用。"
            />
          ) : !bridge ? (
            <Alert
              type="info"
              message="请在新版 Windows 客户端中同步和取用团队仓库。"
            />
          ) : !current && !repository.error ? (
            <div className="team-library-empty">
              <Spin tip="正在读取团队资料" />
            </div>
          ) : !binding && repository.error ? (
            <div className="team-library-empty">
              <h2>团队资料暂时无法读取</h2>
              <p role="alert">{repository.error}</p>
              <Button type="primary" onClick={repository.refresh}>重试读取配置</Button>
            </div>
          ) : !binding ? (
            <section className="team-library-connect">
              <header className="team-library-connect-header">
                <span className="team-library-connect-icon" aria-hidden="true">
                  <GithubOutlined />
                </span>
                <div>
                  <h3>{current?.canConfigure ? "连接 GitHub 仓库" : "尚未连接 GitHub 仓库"}</h3>
                  <p>
                    {current?.canConfigure
                      ? "粘贴课题组的 GitHub 仓库地址，连接后可按文件夹浏览团队资料。"
                      : "请课题组管理员连接 GitHub 仓库。连接后，成员可在这里浏览团队资料。"}
                  </p>
                </div>
              </header>
              {current?.canConfigure ? (
                <RepositoryEditor inline current={current} onSaved={refreshBinding} />
              ) : null}
            </section>
          ) : !snapshot ? (
            <div className="team-library-empty">
              {busy ? (
                <Spin tip="正在同步团队资料" />
              ) : (
                <>
                  <FolderOpenOutlined />
                  <h2>{syncIssue ? "团队资料同步未完成" : "团队仓库已连接"}</h2>
                  <p>同步后即可查看仓库文件和资料目录。</p>
                  <Button type="primary" onClick={sync}>
                    {syncIssue ? "重新同步" : "同步团队资料"}
                  </Button>
                  {syncDetails}
                </>
              )}
            </div>
          ) : (
            <div
              className={`team-library-grid ${
                entry || selectedFile ? "has-selection" : ""
              }`}
            >
              <div className="team-library-center">
                <div className="team-library-view-switch" aria-label="团队资料视图">
                  <Button
                    type={nav.mode === "tree" ? "primary" : "text"}
                    onClick={() =>
                      setNavigation({ ...nav, mode: "tree", path: "", entryId: "" })
                    }
                  >
                    仓库文件
                  </Button>
                  <Button
                    type={nav.mode === "catalog" ? "primary" : "text"}
                    onClick={() =>
                      setNavigation({ ...nav, mode: "catalog", path: "", entryId: "" })
                    }
                  >
                    资料目录
                  </Button>
                  <MaterialUseIn source={{ source: "team-git", revision: snapshot.revision, paths: [...materialSelection.paths] }} busy={busy} />
                </div>
                {nav.mode === "catalog" && (
                  <>
                    <header>
                      <Select
                        aria-label="按项目查看资料"
                        value={project}
                        onChange={(value) => {
                          setProject(value);
                          setPurpose("");
                        }}
                        options={[
                          { value: "", label: "全部项目" },
                          ...snapshot.manifest.projects.map((p) => ({
                            value: p.id,
                            label: p.name,
                          })),
                        ]}
                      />
                      <Button
                        type="text"
                        icon={<PlusOutlined />}
                        onClick={() => setNewProject(true)}
                      >
                        新建项目
                      </Button>
                      <Input.Search
                        aria-label="查找团队资料"
                        placeholder="搜索文件名、说明或维护者"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        allowClear
                      />
                      <Button
                        disabled={!visible.length}
                        onClick={() => {
                          setTaskEntries(entry ? [entry] : []);
                          setMaterialPickerOpen(true);
                        }}
                      >
                        选择资料用于任务
                      </Button>
                    </header>
                    <div className="team-library-quick-filters" aria-label="资料用途">
                      {[
                        { value: "", label: "全部" },
                        { value: "template", label: "模板与案例" },
                        { value: "figure", label: "图与素材" },
                        { value: "reference", label: "参考资料" },
                      ]
                        .filter(
                          (filter) =>
                            !filter.value ||
                            entries.some((e) => e.purpose === filter.value),
                        )
                        .map((filter) => (
                          <Button
                            key={filter.value}
                            type={purpose === filter.value ? "primary" : "default"}
                            onClick={() => setPurpose(filter.value)}
                          >
                            {filter.label}
                          </Button>
                        ))}
                    </div>
                  </>
                )}
                <div
                  className="team-library-file-drop"
                  onDragOver={(event) => {
                    if (event.dataTransfer.types.includes("Files"))
                      event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    beginImport(event.dataTransfer.files);
                  }}
                >
                  <UploadOutlined /> 拖入文件，提议新增或更新
                  <Button
                    type="link"
                    size="small"
                    onClick={() => {
                      setImportTarget("");
                      fileInput.current?.click();
                    }}
                  >
                    选择文件
                  </Button>
                </div>
                {nav.mode === "tree" ? (
                  <div className="team-library-repository">
                    <div className="team-library-repository-heading">
                      <nav aria-label="仓库路径" className="team-library-breadcrumb">
                        <GithubOutlined aria-hidden="true" />
                        <Button
                          type="link"
                          onClick={() =>
                            setNavigation({
                              ...nav,
                              directory: "",
                              path: "",
                              entryId: "",
                            })
                          }
                          aria-current={!nav.directory ? "page" : undefined}
                        >
                          {snapshot.binding.url
                            .replace(/\/$/, "")
                            .replace(/\.git$/, "")
                            .split("/")
                            .pop() || "仓库根目录"}
                        </Button>
                        {nav.directory
                          .split("/")
                          .filter(Boolean)
                          .map((part, index, parts) => (
                            <span key={parts.slice(0, index + 1).join("/")}>
                              <span aria-hidden="true">/</span>
                              <Button
                                type="link"
                                aria-current={
                                  index === parts.length - 1 ? "page" : undefined
                                }
                                onClick={() =>
                                  setNavigation({
                                    ...nav,
                                    directory: parts.slice(0, index + 1).join("/"),
                                    path: "",
                                    entryId: "",
                                  })
                                }
                              >
                                {part}
                              </Button>
                            </span>
                          ))}
                      </nav>
                      <small title={snapshot.revision}>
                        {snapshot.binding.branch} · {snapshot.revision.slice(0, 8)}
                      </small>
                    </div>
                    {!tree ? (
                      <Alert
                        type="info"
                        showIcon
                        message="当前缓存没有仓库文件树，请同步后重试。"
                        action={
                          <Button size="small" loading={busy} onClick={sync}>
                            同步文件树
                          </Button>
                        }
                      />
                    ) : (
                      <div
                        role="table"
                        aria-label="仓库文件"
                        className="team-library-tree-table"
                      >
                        {nav.directory && (
                          <button
                            className="team-library-tree-row"
                            role="row"
                            onClick={() =>
                              setNavigation({
                                ...nav,
                                directory: nav.directory
                                  .split("/")
                                  .slice(0, -1)
                                  .join("/"),
                                path: "",
                                entryId: "",
                              })
                            }
                          >
                            <span role="cell">
                              <FolderOpenOutlined /> ..
                            </span>
                            <span role="cell">返回上级</span>
                          </button>
                        )}
                        {treeRows?.map((item) => (
                          <div className="team-library-material-row" key={item.path} role="presentation">
                          {materialCheckbox(item.kind === "file" ? item.path : undefined)}
                          <button
                            role="row"
                            aria-selected={nav.path === item.path}
                            className={`team-library-tree-row ${
                              nav.path === item.path ? "selected" : ""
                            }`}
                            onClick={() =>
                              setNavigation({
                                ...nav,
                                directory:
                                  item.kind === "folder" ? item.path : nav.directory,
                                path: item.kind === "folder" ? "" : item.path,
                                entryId: "",
                              })
                            }
                          >
                            <span role="cell">
                              {item.kind === "folder" ? (
                                <FolderOpenOutlined />
                              ) : (
                                <FileTextOutlined />
                              )}
                              <span>{item.path.split("/").pop()}</span>
                            </span>
                            <span role="cell">
                              {
                                {
                                  folder: "文件夹",
                                  file: "文件",
                                  symlink: "符号链接",
                                  submodule: "子模块",
                                }[item.kind]
                              }
                            </span>
                          </button>
                          </div>
                        ))}
                        {!treeRows?.length && (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="此文件夹没有文件"
                          />
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className="team-library-table"
                    role="table"
                    aria-label="项目资料"
                  >
                    <div className="team-library-row table-heading" role="row">
                      <span role="columnheader">文件</span>
                      <span role="columnheader">用途</span>
                      <span role="columnheader">维护者</span>
                      <span role="columnheader">位置</span>
                    </div>
                    {visible.map((e) => (
                      <div className="team-library-material-row" key={e.id} role="presentation">
                      {materialCheckbox(e.source.kind === "git" ? e.source.path : undefined)}
                      <button
                        role="row"
                        aria-selected={entry?.id === e.id}
                        className={
                          "team-library-row " + (entry?.id === e.id ? "selected" : "")
                        }
                        onClick={() => setSelected(e.id)}
                      >
                        <span role="cell" className="team-library-filename">
                          <FileIcon entry={e} />
                          <span>
                            <strong>{e.name}</strong>
                            <small>
                              {fileType(e)}
                              {e.recommended ? " · 推荐使用" : ""}
                              {e.source.kind === "shared"
                                ? ` · v${e.source.version}`
                                : e.source.sha256
                                ? ` · ${e.source.sha256.slice(0, 8)}`
                                : ""}
                            </small>
                          </span>
                        </span>
                        <span role="cell">{purposes[e.purpose]}</span>
                        <span role="cell">{e.maintainer || "未登记"}</span>
                        <span role="cell" className="team-library-location">
                          {e.source.kind === "git"
                            ? "仓库原件"
                            : e.source.kind === "shared"
                            ? "共享原件"
                            : "本地文件"}
                        </span>
                      </button>
                      </div>
                    ))}
                    {!visible.length && (
                      <Empty
                        description="没有符合条件的资料"
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                      />
                    )}
                  </div>
                )}
                <div className="team-library-discussion">
                  <Button
                    icon={<CommentOutlined aria-hidden="true" />}
                    onClick={() => void discussMaterials()}
                  >
                    和个人助理讨论
                  </Button>
                </div>
              </div>
              {(entry || selectedFile) && (
                <aside className="team-library-detail">
                  {entry ? (
                    <>
                      <div className="team-library-detail-title">
                        <FileIcon entry={entry} />
                        <h2>{entry.name}</h2>
                        <Button
                          type="text"
                          icon={<CloseOutlined />}
                          aria-label="关闭资料详情"
                          onClick={() => setSelected("")}
                        />
                      </div>
                      <p className="team-library-summary">
                        {entry.summary || "尚未补充使用说明。"}
                      </p>
                      <div className="team-library-preview" aria-label="资料预览">
                        {previewBusy ? (
                          <Spin />
                        ) : preview?.kind === "text" ? (
                          <>
                            {entry.name.toLowerCase().endsWith(".md") ? (
                              <SafeMessageMarkdown text={preview.text} />
                            ) : (
                              <pre>{preview.text}</pre>
                            )}
                            {preview.truncated && (
                              <small>预览已截断；正文请在原件中阅读。</small>
                            )}
                          </>
                        ) : preview?.kind === "image" ? (
                          <img src={preview.dataUrl} alt={entry.name} />
                        ) : (
                          <div>
                            <FileIcon entry={entry} />
                            <p>
                              {preview?.kind === "file"
                                ? `${fileType(entry)} · ${(
                                    preview.size /
                                    1024 /
                                    1024
                                  ).toFixed(1)} MB`
                                : previewError}
                            </p>
                            {preview?.kind === "file" && (
                              <small>此格式在工作台原生文件区或本机阅读器打开。</small>
                            )}
                          </div>
                        )}
                      </div>
                      <dl>
                        <div>
                          <dt>用途</dt>
                          <dd>{purposes[entry.purpose]}</dd>
                        </div>
                        <div>
                          <dt>维护者</dt>
                          <dd>{entry.maintainer || "未登记"}</dd>
                        </div>
                        <div>
                          <dt>发布版本</dt>
                          <dd title={snapshot.revision}>
                            {snapshot.revision.slice(0, 8)}
                          </dd>
                        </div>
                        <div>
                          <dt>原件位置</dt>
                          <dd>
                            {entry.source.kind === "git" ||
                            entry.source.kind === "local"
                              ? entry.source.path
                              : "共享服务 · v" + entry.source.version}
                          </dd>
                        </div>
                      </dl>
                      <Checkbox
                        checked={includeRules}
                        onChange={(e) => setIncludeRules(e.target.checked)}
                      >
                        同时带入本项目规范与要求
                      </Checkbox>
                      <Button
                        type="primary"
                        block
                        loading={taskBusy}
                        onClick={() => {
                          setTaskEntries([entry]);
                          void chooseTask(undefined, [entry]);
                        }}
                      >
                        用于任务
                      </Button>
                      <div className="team-library-detail-actions">
                        <Button
                          disabled={
                            entry.source.kind !== "git" || previewBusy || !!previewError
                          }
                          onClick={() =>
                            run(() =>
                              bridge!.open({
                                revision: snapshot.revision,
                                entryId: entry.id,
                              }),
                            )
                          }
                        >
                          打开原件副本
                        </Button>
                        <Button
                          onClick={() => {
                            if (entry.source.kind === "git") {
                              setImportTarget(entry.id);
                              fileInput.current?.click();
                            } else setEditing(entry);
                          }}
                        >
                          更新文件
                        </Button>
                        <Button onClick={() => setEditing(entry)}>编辑说明</Button>
                      </div>
                    </>
                  ) : selectedFile ? (
                    <>
                      <div className="team-library-detail-title">
                        <FileTextOutlined />
                        <h2>{selectedName}</h2>
                        <Button
                          type="text"
                          icon={<CloseOutlined />}
                          aria-label="关闭资料详情"
                          onClick={() => setNavigation({ ...nav, path: "" })}
                        />
                      </div>
                      <p className="team-library-path">{selectedFile.path}</p>
                      <div className="team-library-preview" aria-label="资料预览">
                        {previewBusy ? (
                          <Spin />
                        ) : preview?.kind === "text" ? (
                          <>
                            {selectedName.toLowerCase().endsWith(".md") ? (
                              <SafeMessageMarkdown text={preview.text} />
                            ) : (
                              <pre>{preview.text}</pre>
                            )}
                            {preview.truncated && (
                              <small>预览已截断；正文请在原件中阅读。</small>
                            )}
                          </>
                        ) : preview?.kind === "image" ? (
                          <img src={preview.dataUrl} alt={selectedName} />
                        ) : (
                          <p>
                            {preview?.kind === "file"
                              ? `${preview.name} · ${(preview.size / 1024).toFixed(
                                  1,
                                )} KB，暂不支持此格式的内容预览。`
                              : previewError}
                          </p>
                        )}
                      </div>
                      <small title={snapshot.revision}>
                        版本 {snapshot.revision.slice(0, 8)}
                      </small>
                    </>
                  ) : null}
                </aside>
              )}
            </div>
          )}
      </>
      <Drawer
        open={panel === "history"}
        width="85vw"
        title="更新记录"
        onClose={() => setPanel("")}
      >
        {panel === "history" ? (
          <div className="team-library-history">
            {historyError && (
              <Alert
                type="error"
                message={historyError}
                action={<Button onClick={openHistory}>重试</Button>}
              />
            )}
            {history?.length === 0 && !historyError && (
              <Empty description="还没有更新记录" />
            )}
            {history?.map((h) => (
              <article key={h.revision}>
                <h3>{h.title}</h3>
                <p>
                  {new Date(h.date).toLocaleString()} · {h.revision.slice(0, 8)}
                </p>
              </article>
            )) || <Spin />}
          </div>
        ) : null}
      </Drawer>
      {configure && (
        <RepositoryEditor
          readOnly={!current?.canConfigure}
          current={current}
          onClose={() => setConfigure(false)}
          onSaved={refreshBinding}
        />
      )}
      {editing && snapshot && (
        <EntryEditor
          snapshot={snapshot}
          entry={editing === true ? undefined : editing}
          projectId={project}
          preview={preview}
          onClose={() => setEditing(undefined)}
          onSaved={(value) => {
            setEditing(undefined);
            setProposal(value);
          }}
        />
      )}
      {importFile && snapshot && (
        <TeamLibraryFileImport
          file={importFile}
          snapshot={snapshot}
          projectId={project}
          targetId={importTarget}
          onClose={() => setImportFile(undefined)}
          onSaved={(value) => {
            setImportFile(undefined);
            setProposal(value);
          }}
        />
      )}
      {newProject && snapshot && (
        <ProjectEditor
          revision={snapshot.revision}
          onClose={() => setNewProject(false)}
          onSaved={(value) => {
            setNewProject(false);
            setProposal(value);
          }}
        />
      )}
      <Modal
        open={!!proposal}
        title="更新已提交到待审分支"
        onCancel={() => setProposal(undefined)}
        footer={
          <Button type="primary" onClick={() => setProposal(undefined)}>
            知道了
          </Button>
        }
      >
        <p>当前已发布资料保持原版本。请到仓库确认差异并创建 PR，审核合并后再同步。</p>
        {proposal && (
          <a href={proposal.reviewUrl} target="_blank" rel="noreferrer">
            查看差异并发起审核
          </a>
        )}
      </Modal>
      <Modal
        open={materialPickerOpen}
        title="选择要带入任务的资料"
        onCancel={() => setMaterialPickerOpen(false)}
        okText="选择任务"
        okButtonProps={{ disabled: !taskEntries.length }}
        onOk={() => {
          setMaterialPickerOpen(false);
          void chooseTask();
        }}
        styles={{ body: { maxHeight: "min(50vh, 480px)", overflowY: "auto" } }}
      >
        {materialPickerOpen && visible.map((item) => {
          const selected = taskEntries.some((material) => material.id === item.id);
          return (
            <Checkbox
              className="team-library-candidate"
              key={item.id}
              checked={selected}
              disabled={!selected && taskEntries.length >= 19}
              onChange={(event) =>
                setTaskEntries((old) =>
                  event.target.checked
                    ? [...old, item]
                    : old.filter((material) => material.id !== item.id),
                )
              }
            >
              <FileIcon entry={item} />
              <span>{item.name} · {purposes[item.purpose]}</span>
            </Checkbox>
          );
        })}
      </Modal>
      <Modal
        open={!!tasks}
        title={taskEntries.length === 1 ? `将「${taskEntries[0].name}」用于任务` : "选择任务"}
        onCancel={() => setTasks(undefined)}
        footer={null}
      >
        <Input.Search
          value={taskSearch}
          onChange={(event) => setTaskSearch(event.target.value)}
          placeholder="搜索任务"
          allowClear
          aria-label="搜索要取用资料的任务"
          style={{ marginBottom: 16 }}
        />
        {tasks
          ?.filter(canUseMaterials)
          .filter(
            (c) =>
              !taskSearch || c.title.toLowerCase().includes(taskSearch.toLowerCase()),
          )
          .map((c) => (
            <Button
              block
              key={c.id}
              style={{
                marginBottom: 10,
                height: "auto",
                whiteSpace: "normal",
                padding: 12,
              }}
              onClick={() => useEntry(c)}
            >
              {c.title}
            </Button>
          ))}
        {tasks && !tasks.some(canUseMaterials) && (
          <p>暂无可取用资料的任务。请先在任务页确认或开始一项任务。</p>
        )}
        {taskCursor && (
          <Button loading={taskBusy} onClick={() => chooseTask(taskCursor)}>
            继续加载任务
          </Button>
        )}
      </Modal>
    </section>
  );
}

function ProjectEditor({
  revision,
  onClose,
  onSaved,
}: {
  revision: string;
  onClose: () => void;
  onSaved: (value: TeamLibraryProposal) => void;
}) {
  const operation = usePersonalOperation(true, "team-project-editor"),
    id = useRef("project_" + crypto.randomUUID().replaceAll("-", ""));
  const [name, setName] = useState(""),
    [description, setDescription] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal
      open
      title="新增资料项目"
      className="team-library-editor"
      closable={!busy}
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
      onCancel={onClose}
      confirmLoading={busy}
      okText="提交待审项目"
      onOk={async () => {
        const ticket = operation.capture();
        setBusy(true);
        setError("");
        try {
          const value = await window.electronAPI!.teamLibrary.proposeProject(revision, {
            id: id.current,
            name,
            description,
          });
          if (ticket.isCurrent()) onSaved(value);
        } catch (e) {
          if (ticket.isCurrent()) setError(message(e));
        } finally {
          if (ticket.isCurrent()) setBusy(false);
        }
      }}
    >
      {error && <Alert type="error" message={error} />}
      <label>
        项目名称
        <Input value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        项目说明
        <Input.TextArea
          value={description}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
        />
      </label>
      <p>审核并合并到发布分支后，团队同步时可见。</p>
    </Modal>
  );
}

function EntryEditor({
  snapshot,
  entry,
  projectId,
  preview,
  onClose,
  onSaved,
}: {
  snapshot: TeamLibrarySnapshot;
  entry?: TeamLibraryEntry;
  projectId: string;
  preview?: TeamLibraryPreview;
  onClose: () => void;
  onSaved: (value: TeamLibraryProposal) => void;
}) {
  const operation = usePersonalOperation(true, "team-entry-editor");
  const [draft, setDraft] = useState<TeamLibraryEntry>(
    entry || {
      id: "material_" + crypto.randomUUID().replaceAll("-", ""),
      projectId: projectId || snapshot.manifest.projects[0]?.id || "",
      name: "",
      purpose: "reference",
      summary: "",
      maintainer: "",
      recommended: false,
      source: { kind: "git", path: "", sha256: "0".repeat(64) },
    },
  );
  const [text, setText] = useState(
      entry && preview?.kind === "text" ? preview.text : "",
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [kind, setKind] = useState(entry?.source.kind || "git");
  const [collections, setCollections] = useState<
      ResponseFor<"researchCollections">["data"]
    >([]),
    [files, setFiles] = useState<ResponseFor<"researchFiles">["data"]>([]),
    [locals, setLocals] = useState<{ rel: string; name: string }[]>([]);
  const [editBody, setEditBody] = useState(!entry);
  const readShared = async () => {
    const ticket = operation.capture();
    try {
      const response = await researchApi("researchCollections", {
        query: { scope: "visible", limit: 100 },
      });
      if (ticket.isCurrent())
        setCollections(
          response.data.filter(
            (c) =>
              ["lab_shared", "public"].includes(c.scope) && c.status === "available",
          ),
        );
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    }
  };
  const save = async () => {
    const ticket = operation.capture();
    setBusy(true);
    setError("");
    try {
      const value = TeamLibraryEntry.parse(draft);
      const result = await window.electronAPI!.teamLibrary.propose(
        snapshot.revision,
        value,
        kind === "git" && editBody ? text : undefined,
      );
      if (ticket.isCurrent()) onSaved(result);
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    } finally {
      if (ticket.isCurrent()) setBusy(false);
    }
  };
  const changeKind = (value: "git" | "shared" | "local") => {
    setKind(value);
    setEditBody(value === "git" && !entry);
    setDraft((d) => ({
      ...d,
      source:
        value === "git"
          ? { kind: "git", path: "", sha256: "0".repeat(64) }
          : value === "shared"
          ? { kind: "shared", fileId: "unselected", version: 1, sha256: "0".repeat(64) }
          : { kind: "local", path: "", sha256: null },
    }));
    if (value === "shared") void readShared();
  };
  return (
    <Modal
      open
      width={700}
      title={entry ? "提交资料更新" : "导入团队资料"}
      className="team-library-editor"
      closable={!busy}
      maskClosable={!busy}
      cancelButtonProps={{ disabled: busy }}
      onCancel={onClose}
      onOk={save}
      okText="提交待审更新"
      confirmLoading={busy}
    >
      {error && <Alert type="error" message={error} />}
      <p>
        更新会进入仓库待审分支；这里不直接覆盖发布版本。公开仓库的目录、说明和正文均对所有人可见。
      </p>
      <label>
        项目
        <Select
          style={{ width: "100%" }}
          value={draft.projectId}
          options={snapshot.manifest.projects.map((p) => ({
            value: p.id,
            label: p.name,
          }))}
          onChange={(projectId) => setDraft((d) => ({ ...d, projectId }))}
        />
      </label>
      <label>
        资料名称
        <Input
          value={draft.name}
          maxLength={200}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
        />
      </label>
      <label>
        用途
        <Select
          style={{ width: "100%" }}
          value={draft.purpose}
          options={Object.entries(purposes).map(([value, label]) => ({ value, label }))}
          onChange={(purpose) => setDraft((d) => ({ ...d, purpose }))}
        />
      </label>
      <label>
        使用说明
        <Input.TextArea
          value={draft.summary}
          maxLength={4000}
          onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
        />
      </label>
      <label>
        维护者
        <Input
          value={draft.maintainer}
          maxLength={100}
          onChange={(e) => setDraft((d) => ({ ...d, maintainer: e.target.value }))}
        />
      </label>
      {!entry && (
        <label>
          原件方式
          <Select
            style={{ width: "100%" }}
            value={kind}
            onChange={changeKind}
            options={[
              { value: "git", label: "新建 Markdown 说明 / 要求" },
              { value: "shared", label: "登记已上传的团队共享原件" },
              { value: "local", label: "登记本地资料文件（仅共享指针）" },
            ]}
          />
        </label>
      )}
      {kind === "git" && draft.source.kind === "git" && (
        <>
          <label>
            仓库相对路径
            <Input
              disabled={!!entry}
              placeholder="项目/项目要求.md"
              value={draft.source.path}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  source: { kind: "git", path: e.target.value, sha256: "0".repeat(64) },
                }))
              }
            />
          </label>
          {entry &&
            draft.source.path.endsWith(".md") &&
            preview?.kind === "text" &&
            !preview.truncated && (
              <Checkbox
                checked={editBody}
                onChange={(e) => {
                  setEditBody(e.target.checked);
                  if (e.target.checked && preview?.kind === "text")
                    setText(preview.text);
                }}
              >
                修改正文
              </Checkbox>
            )}
          {editBody && (
            <label>
              Markdown 正文
              <Input.TextArea
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
          )}
        </>
      )}
      {!entry && kind === "shared" && (
        <>
          <label>
            共享集合
            <Select
              style={{ width: "100%" }}
              placeholder="选择团队共享集合"
              options={collections.map((c) => ({ value: c.id, label: c.name }))}
              onChange={async (id) => {
                const ticket = operation.capture();
                try {
                  const value = await researchApi("researchFiles", {
                    params: { id },
                    query: { limit: 100 },
                  });
                  if (ticket.isCurrent())
                    setFiles(value.data.filter((f) => f.status === "available"));
                } catch (e) {
                  if (ticket.isCurrent()) setError(message(e));
                }
              }}
            />
          </label>
          <label>
            原件
            <Select
              style={{ width: "100%" }}
              placeholder="选择已上传文件"
              options={files.map((f) => ({
                value: f.id,
                label: f.filename + " · v" + f.version,
              }))}
              onChange={(id) => {
                const file = files.find((f) => f.id === id)!;
                setDraft((d) => ({
                  ...d,
                  name: d.name || file.filename,
                  source: {
                    kind: "shared",
                    fileId: id,
                    version: file.version,
                    sha256: file.sha256,
                  },
                }));
              }}
            />
          </label>
          <p>
            尚未上传？先在“共享原件与飞书资料”导入，再回来登记；支持现有大文件上传流程。
          </p>
        </>
      )}
      {!entry && kind === "local" && (
        <>
          <Button
            onClick={async () => {
              const ticket = operation.capture();
              try {
                const result = await window.electronAPI!.localLibrary.pick();
                if (result && ticket.isCurrent()) setLocals(result.files);
              } catch (e) {
                if (ticket.isCurrent()) setError(message(e));
              }
            }}
          >
            选择课题组文件的本机目录
          </Button>
          <Select
            style={{ width: "100%" }}
            placeholder="选择文件，仅发布相对位置和校验值"
            options={locals.map((f) => ({ value: f.rel, label: f.rel }))}
            onChange={async (rel) => {
              const ticket = operation.capture();
              try {
                const value = await window.electronAPI!.localLibrary.hash(rel);
                if (ticket.isCurrent())
                  setDraft((d) => ({
                    ...d,
                    name: d.name || locals.find((f) => f.rel === rel)!.name,
                    source: { kind: "local", path: rel, sha256: value.sha256 },
                  }));
              } catch (e) {
                if (ticket.isCurrent()) setError(message(e));
              }
            }}
          />
          <p>其他成员需要有同一份本地原件。要跨电脑直接取用，请选择团队共享原件。</p>
        </>
      )}
      <Checkbox
        checked={draft.recommended}
        onChange={(e) => setDraft((d) => ({ ...d, recommended: e.target.checked }))}
      >
        推荐用于此项目
      </Checkbox>
    </Modal>
  );
}
