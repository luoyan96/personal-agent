import "./task-work-page.scss";

import { Alert, Button, Checkbox, Input, Select } from "antd";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type {
  DshTaskState,
  TaskTarget,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import { researchApi } from "./api";
import { LocalLibraryPicker } from "./LocalLibraryPicker";
import { researchScopeLabels } from "./research-library-api";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { taskEventRows } from "./task-dsh-events";
import { TaskDeliveryPanel } from "./TaskDeliveryPanel";
import { TaskDeliveryDownload } from "./TaskDeliveryDownload";
import { taskStateLabels } from "./task-planning";
import { workspaceStatusLabel } from "./workspace-labels";
import { TaskArchivePanel } from "./TaskArchivePanel";
import { TaskExecutionStatus } from "./TaskExecutionStatus";
import { TaskKnowledgePanel } from "./TaskKnowledgePanel";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchRead } from "./useResearchRead";
import { nativeWorkbenchTaskPath } from "./workbench-links";

const phases = {
  ready: "可以开始",
  running: "正在执行",
  finished: "本轮已结束 · 待核对成果",
  interrupted: "执行中断 · 结果待核对",
  failed: "本轮未完成",
};

function Section({
  title,
  hint,
  open,
  onToggle,
  nodeRef,
  children,
}: {
  title: string;
  hint?: string;
  open: boolean;
  onToggle: () => void;
  nodeRef?: RefObject<HTMLElement>;
  children: ReactNode;
}) {
  return (
    <section className="task-work-section" aria-label={title} ref={nodeRef}>
      <button
        type="button"
        className="task-work-section-head"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="task-work-section-title">{title}</span>
        {hint && <span className="task-work-section-hint">{hint}</span>}
        <span className="task-work-section-toggle" aria-hidden="true">
          {open ? "收起" : "展开"}
        </span>
      </button>
      {open && <div className="task-work-section-body">{children}</div>}
    </section>
  );
}

/** Long prose hides the actual asks; split them into the few points people scan for. */
function keyPoints(text: string) {
  const points: string[] = [];
  for (const raw of text.replace(/\r/g, "").split(/\n+|(?<=[。；;])/)) {
    const line = raw
      .replace(/^[\s\-*+·]+/, "")
      .replace(/^\d+[.、)]\s*/, "")
      .replace(/[。；;]$/, "")
      .trim();
    if (!line) continue;
    // "做什么：先 A，再 B" reads better as two points than one long line.
    const at = line.indexOf("：");
    if (at >= 6 && line.length - at >= 8)
      points.push(line.slice(0, at).trim(), line.slice(at + 1).trim());
    else points.push(line);
  }
  return points;
}

const richText = /```|(^|\n)#{1,6}\s|(^|\n)\|/;

function Points({ text, checklist }: { text: string; checklist?: boolean }) {
  const points = keyPoints(text),
    shown = points.slice(0, 5);
  if (richText.test(text)) return <SafeMessageMarkdown text={text} />;
  return (
    <>
      <ul className={checklist ? "is-checklist" : undefined}>
        {shown.map((point, index) => (
          <li key={index}>
            {checklist && <span className="task-work-check" aria-hidden />}
            {point}
          </li>
        ))}
      </ul>
      {points.length > shown.length && (
        <details>
          <summary>还有 {points.length - shown.length} 条</summary>
          <ul>
            {points.slice(5).map((point, index) => (
              <li key={index}>{point}</li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

/** A blank note box is one more thing to type; state the phase in one line. */
function progressNote(state: DshTaskState) {
  const files = state.files.length;
  if (state.phase === "running") return "助手正在工作台执行，工具确认在工作台完成。";
  if (state.phase === "finished")
    return `本轮已结束，工作文件夹里有 ${files} 个文件；核对后提交验收。`;
  if (state.phase === "interrupted")
    return "本轮执行中断，结果待核对；确认没有执行完再继续。";
  if (state.phase === "failed") return "本轮未完成，先核对文件与工具记录再继续。";
  return "";
}

/** The first thing anyone needs: what this task is for and what counts as done. */
function TaskBrief({
  goal,
  acceptance,
  accepted,
}: {
  goal: string;
  acceptance: string;
  accepted: boolean;
}) {
  return (
    <section className="task-work-brief" aria-label="目标与验收">
      {goal.trim() && (
        <div className="task-work-goal">
          <h3>目标</h3>
          <Points text={goal} />
        </div>
      )}
      {acceptance.trim() && (
        <div className="task-work-acceptance">
          <h3>
            验收标准<span>逐条对照，全部满足才算完成</span>
          </h3>
          <Points text={acceptance} checklist={!accepted} />
        </div>
      )}
    </section>
  );
}

export function TaskWorkPage({
  taskId,
  kind,
  children,
  onChanged,
}: TaskTarget & {
  children: (refresh: () => Promise<void>) => ReactNode;
  onChanged: () => Promise<void>;
}) {
  const bridge = window.electronAPI?.localDsh;
  const navigate = useNavigate();
  const target = { taskId, kind },
    operation = usePersonalOperation(true, `task-work:${kind}:${taskId}`);
  const [section, setSection] = useState<Record<string, boolean>>({}),
    [state, setState] = useState<DshTaskState>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [connectionError, setConnectionError] = useState("");
  const [note, setNote] = useState(""),
    [noteText, setNoteText] = useState(""),
    [preview, setPreview] = useState("");
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [collection, setCollection] = useState(""),
    [notice, setNotice] = useState("");
  const flight = useRef(false),
    noteLoaded = useRef(false);
  const transcript = useRef<HTMLDivElement>(null),
    materialsRef = useRef<HTMLElement>(null),
    planRef = useRef<HTMLElement>(null),
    follow = useRef(true);
  useEffect(() => {
    flight.current = false;
    setBusy(false);
    setSection({});
    setState(undefined);
    setNote("");
    setNoteText("");
    setPreview("");
    setCollection("");
    setNotice("");
    setError("");
    setConnectionError("");
    noteLoaded.current = false;
  }, [operation.scope]);
  const detail = useResearchRead(async (signal) => {
    if (kind === "personal") {
      const r = await researchApi("personalWorkTask", {
        params: { id: taskId },
        signal,
      });
      return { task: r.data, artifacts: [], deliverables: [] };
    }
    const r = await researchApi("task", { params: { id: taskId }, signal });
    return "task" in r.data
      ? {
          task: r.data.task,
          artifacts: r.data.artifacts || [],
          deliverables: r.data.deliverables || [],
        }
      : { task: r.data, artifacts: [], deliverables: [] };
  }, `work-page:${kind}:${taskId}`);
  const collections = useResearchRead(
    () => researchApi("researchCollections", { query: { limit: 100 } }),
    `task-collections:${taskId}`,
    section.materials === true,
  );
  const library = useResearchRead(
    () =>
      researchApi("researchFiles", {
        params: { id: collection },
        query: { limit: 100 },
      }),
    `task-library:${collection}`,
    section.materials === true && Boolean(collection),
  );
  const task = detail.data?.task,
    actions: string[] = task?.allowedActions || [];
  const serviceStatus = task && "status" in task ? task.status : "";
  const personalResult =
    kind === "personal" && task && "result" in task ? task.result : undefined;
  const deliveries = detail.data?.deliverables || [];
  const hasServerDelivery = deliveries.length > 0 || Boolean(personalResult);
  const latestDelivery = deliveries.reduce<(typeof deliveries)[number] | undefined>(
    (latest, item) => (!latest || item.revision > latest.revision ? item : latest),
    undefined,
  );
  const latestAccepted = deliveries
    .filter((item) => item.review?.decision === "accepted")
    .reduce<(typeof deliveries)[number] | undefined>(
      (latest, item) => (!latest || item.revision > latest.revision ? item : latest),
      undefined,
    );
  const completed = serviceStatus === "completed" || serviceStatus === "cancelled";
  const statusLabel =
    serviceStatus === "completed" &&
    kind === "research" &&
    latestDelivery?.review?.decision !== "accepted"
      ? "已结束 · 验收记录待核对"
      : kind === "personal"
      ? personalResult?.accepted
        ? "已验收"
        : workspaceStatusLabel[serviceStatus] || serviceStatus
      : taskStateLabels[serviceStatus] || serviceStatus;
  const canWork =
    kind === "research"
      ? actions.includes("submit")
      : actions.some((a) => ["run", "submit"].includes(a));
  const version = task && "version" in task ? task.version : undefined;
  const canStart = kind === "research" && actions.includes("start") && Boolean(version);
  const canClaim = kind === "research" && actions.includes("claim") && Boolean(version);
  const canActivate =
    kind === "personal" && actions.includes("activate") && Boolean(version);
  const isOpen = (id: string) => {
    if (section[id] !== undefined) return section[id];
    if (id === "plan") return !canWork && !completed;
    return id === "work" && state?.phase === "running" && !completed;
  };
  const toggle = (id: string) =>
    setSection((value) => ({ ...value, [id]: !isOpen(id) }));
  // Opening a section from the next-step button should also bring it into view.
  const reveal = (id: "materials" | "plan") => {
    setSection((value) => ({ ...value, [id]: true }));
    window.requestAnimationFrame(() =>
      (id === "materials" ? materialsRef : planRef).current?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      }),
    );
  };
  const refresh = async () => {
    if (!bridge?.taskStatus) return;
    const { isCurrent } = operation.capture();
    const next = await bridge.taskStatus(target);
    if (isCurrent()) {
      setConnectionError("");
      setState(next);
      if (next && !noteLoaded.current) {
        // A saved note wins; otherwise start from the phase so the box is never blank.
        setNote(next.binding.note || progressNote(next));
        noteLoaded.current = true;
      }
    }
  };
  useEffect(() => {
    let cancelled = false,
      reading = false;
    const poll = async () => {
      if (reading || cancelled || !bridge?.taskStatus) return;
      reading = true;
      try {
        await refresh();
      } catch (e) {
        if (!cancelled) {
          setState(undefined);
          setConnectionError(e instanceof Error ? e.message : "本地进度暂不可用。");
        }
      } finally {
        reading = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, 3500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [operation.scope, bridge]);
  const rows = taskEventRows(state?.events || []);
  useEffect(() => {
    if (follow.current && transcript.current)
      transcript.current.scrollTop = transcript.current.scrollHeight;
  }, [state?.events.at(-1)?.seq]);
  const command = async (action: () => Promise<unknown>, propagate = false) => {
    if (flight.current) return;
    const { isCurrent } = operation.capture();
    flight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (isCurrent()) {
        await refresh();
        await detail.refresh();
        await onChanged();
      }
    } catch (e) {
      if (isCurrent()) {
        setError(e instanceof Error ? e.message : "操作未完成，请重试。");
        await refresh().catch(() => {});
      }
      if (propagate) throw e;
    } finally {
      if (isCurrent()) {
        flight.current = false;
        setBusy(false);
      }
    }
  };
  const currentVersion = () => {
    if (version === undefined) throw new Error("任务版本尚未读取，请刷新后重试。");
    return version;
  };
  const start = () =>
    command(() =>
      researchApi(kind === "personal" ? "activatePersonalWorkTask" : "start", {
        params: { id: taskId },
        body: { expectedVersion: currentVersion() },
      }),
    );
  const claim = () =>
    command(() =>
      researchApi("claim", {
        params: { id: taskId },
        body: { expectedVersion: currentVersion() },
      }),
    );
  const openWorkspace = (pick = false) =>
    command(async () => {
      const { isCurrent } = operation.capture();
      await bridge!.taskOpen(target, pick);
      // Choosing a folder means starting work: continue in the workbench with this task's context.
      if (isCurrent()) navigate(nativeWorkbenchTaskPath(taskId, kind));
    });
  // New prompts start in the workbench; here only an unconfirmed request can be retried.
  const send = () =>
    command(async () => {
      const pending = state?.binding.pending;
      if (!pending) return;
      await bridge!.taskPrompt(
        target,
        pending.userText || pending.text,
        pending.requestId,
      );
    });
  const importFile = (source: {
    kind: "artifact" | "library";
    id: string;
    version: number;
  }) =>
    command(async () => {
      const { isCurrent } = operation.capture();
      await bridge!.taskImport(target, source);
      if (isCurrent())
        setNotice("已将选定版本保存到本任务目录，相同内容的已选素材会复用本地副本。");
    });
  // What this task produced is what gets submitted; the material it read is not.
  const inputNames = new Set([
    ...(state?.binding.sources || []).map((source) => source.localName),
    ...(state?.binding.localMaterials || []).map((source) => source.localName),
  ]);
  const outputs = (state?.files || []).filter((file) => !inputNames.has(file.name));
  const submitted =
    state?.binding.delivery?.status === "submitted"
      ? state.binding.delivery
      : undefined;
  const submit = (selectedNames?: string[], summaryText?: string) =>
    command(async () => {
      const { isCurrent } = operation.capture();
      const names =
        kind === "personal"
          ? []
          : selectedNames ||
            (state?.binding.delivery?.status === "pending"
              ? state.binding.delivery.names
              : outputs.map((file) => file.name));
      // The reviewer needs the file list, not a second essay.
      const summary =
        summaryText ||
        [
          names.length
            ? `提交 ${names.length} 个文件：${names.join("、")}`
            : "提交本任务成果",
          noteText.trim(),
        ]
          .filter(Boolean)
          .join("\n\n");
      await bridge!.taskSubmit(target, summary, names);
      if (isCurrent()) {
        setNotice("提交回执已确认。");
        setSection((value) => ({ ...value, plan: true, materials: false }));
      }
    }, true);
  return (
    <section className="task-work-page" aria-label="任务工作页">
      <header className="task-work-heading">
        <div>
          <div className="task-work-title-row">
            <h2>{task?.title || "正在读取任务…"}</h2>
            {statusLabel && <span className="workspace-status">{statusLabel}</span>}
          </div>
          {latestAccepted && (
            <p className="task-work-accepted-note">
              已验收第 {latestAccepted.revision} 版
              {latestAccepted.sources.length
                ? ` · ${latestAccepted.sources
                    .map((source) => source.label)
                    .join("、")}`
                : " · 文字成果"}
            </p>
          )}
        </div>
        {Boolean(connectionError || state) && (
          <span>
            {connectionError ? "连接中断 · 进度待核对" : phases[state!.phase]}
          </span>
        )}
      </header>
      <TaskExecutionStatus target={target} />
      {!state && (canStart || canClaim || canActivate) && (
        <div className="task-work-start" role="status">
          <Button
            type="primary"
            loading={busy}
            disabled={!task}
            onClick={() => void (canClaim ? claim() : start())}
          >
            {canStart ? "开始这一步" : canClaim ? "确认认领" : "确认任务并开始"}
          </Button>
          <span>
            {canActivate
              ? "确认安排后开始工作；有真人协作成员时才创建群。"
              : "开始后就能在本机文件夹里动手，不需要先上传材料。"}
          </span>
        </div>
      )}
      {(error || detail.error || connectionError) && (
        <Alert
          type="error"
          message={error || detail.error || connectionError}
          action={
            <Button onClick={() => void command(async () => {})}>刷新核对</Button>
          }
        />
      )}
      {notice && <Alert type="success" message={notice} />}
      <section className="task-work-delivery" aria-label="交付成果">
        {actions.includes("submit") && noteText && (
          <Input.TextArea
            aria-label="补充说明"
            value={noteText}
            rows={2}
            maxLength={500}
            disabled={busy}
            onChange={(event) => setNoteText(event.target.value)}
          />
        )}
        {(actions.includes("submit") ||
          state?.binding.delivery?.status === "pending" ||
          (submitted && !hasServerDelivery)) &&
          bridge?.taskStageDelivery && (
            <TaskDeliveryPanel
              key={operation.scope}
              target={target}
              title={task?.title || "当前任务"}
              outputs={outputs}
              currentStatus={serviceStatus}
              canSubmit={actions.includes("submit")}
              disabled={
                busy ||
                !actions.includes("submit") ||
                state?.binding.delivery?.status === "pending"
              }
              submitted={hasServerDelivery ? undefined : submitted}
              submit={submit}
              pending={state?.binding.delivery?.status === "pending"}
              retry={() =>
                command(async () => {
                  const delivery = state?.binding.delivery;
                  if (delivery)
                    await bridge.taskSubmit(target, delivery.summary, delivery.names);
                }, true)
              }
              stage={(paths) => bridge.taskStageDelivery(target, paths)}
            />
          )}
        {personalResult && (
          <div className="task-work-submitted">
            <strong>{personalResult.accepted ? "已验收结果" : "待核对结果"}</strong>
            <SafeMessageMarkdown text={personalResult.summary} />
          </div>
        )}
        {deliveries.length > 0 && (
          <div className="task-work-delivery-history">
            {[
              latestDelivery,
              ...deliveries.filter((item) => item.id !== latestDelivery?.id),
            ]
              .filter((item): item is NonNullable<typeof item> => Boolean(item))
              .map((delivery, index) => (
                <details key={delivery.id} open={index === 0}>
                  <summary>
                    第 {delivery.revision} 版 ·{" "}
                    {delivery.review?.decision === "accepted"
                      ? "已验收"
                      : delivery.review?.decision === "changes_requested"
                      ? "要求修改"
                      : "等待验收"}
                  </summary>
                  <p>{delivery.summary}</p>
                  {delivery.review && (
                    <p className="research-task-feedback">
                      审阅意见：{delivery.review.comment}
                    </p>
                  )}
                  {delivery.artifactRefs.length > 0 && (
                    <p>关联材料：{delivery.artifactRefs.join("、")}</p>
                  )}
                  {delivery.sources.map((source, index) => (
                    <TaskDeliveryDownload
                      key={index}
                      target={target}
                      locator={source.locator}
                      label={source.label}
                    />
                  ))}
                </details>
              ))}
          </div>
        )}
        {actions.includes("submit") &&
          outputs.map((file) => (
            <div className="task-work-file" key={file.name}>
              <span title={file.name}>
                {file.name} · {file.size} 字节
              </span>
              <div className="task-material-actions">
                <Button
                  disabled={busy}
                  onClick={() =>
                    void command(() => bridge!.taskReveal(target, file.name))
                  }
                >
                  在文件夹中显示
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void command(async () => {
                      const { isCurrent } = operation.capture();
                      const output = await bridge!.taskOutput(target, file.name);
                      if (isCurrent())
                        setPreview(output.preview || "此格式请在文件夹中打开查看。");
                    })
                  }
                >
                  查看文字
                </Button>
              </div>
            </div>
          ))}
        {preview && <pre className="task-work-preview">{preview}</pre>}
        {state?.binding.delivery?.versionConflict && (
          <Alert
            type="warning"
            message="提交时任务已被更新"
            description="先展开「安排」核对变更；确认仍按这一版成果提交后，使用最新任务版本重试。已上传文件会继续复用。"
            action={
              <Button
                disabled={busy || !actions.includes("submit")}
                onClick={() =>
                  void command(async () => {
                    await bridge!.taskRebase(target);
                    const delivery = state.binding.delivery!;
                    await bridge!.taskSubmit(target, delivery.summary, delivery.names);
                    setSection((value) => ({
                      ...value,
                      plan: true,
                      materials: false,
                    }));
                    setNotice("提交回执已确认。");
                  })
                }
              >
                已核对，重新提交此版
              </Button>
            }
          />
        )}
        {!deliveries.length &&
          !personalResult &&
          !state?.binding.delivery &&
          !actions.includes("submit") && (
            <p className="task-work-muted">暂无可查看的交付记录。</p>
          )}
      </section>
      {task && "goal" in task && task.goal && (
        <TaskBrief
          goal={task.goal}
          accepted={
            serviceStatus === "completed" &&
            latestDelivery?.review?.decision === "accepted"
          }
          acceptance={"acceptanceCriteria" in task ? task.acceptanceCriteria : ""}
        />
      )}
      <Section
        title="工作"
        hint={state ? state.binding.directory : "本机文件夹与 DSH 会话"}
        open={isOpen("work")}
        onToggle={() => toggle("work")}
      >
        {!state ? (
          <div className="task-work-empty">
            <p>
              {canWork
                ? "选一个已有素材所在的工作文件夹即可开始，无需先上传到资料库。DSH 在此目录读取、修改和生成文件，使用当前 AcceptCat 模型。"
                : "开始任务后，这里会出现本机工作区。"}
            </p>
            {canWork && bridge?.taskOpen && (
              <div className="task-material-actions">
                <Button
                  type="primary"
                  disabled={busy}
                  onClick={() => void openWorkspace(true)}
                >
                  选择本地工作文件夹
                </Button>
                <Button disabled={busy} onClick={() => void openWorkspace()}>
                  新建空白工作区
                </Button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="task-material-actions">
              <Button
                disabled={busy || !canWork || state.phase === "running"}
                onClick={() =>
                  void command(async () => {
                    const { isCurrent } = operation.capture();
                    const added = await bridge!.taskAddLocal(target);
                    if (added && isCurrent())
                      setNotice("素材已加入本机工作文件夹，未上传到资料服务。");
                  })
                }
              >
                添加本地素材
              </Button>
              {bridge?.taskImportLibrary && (
                <Button
                  disabled={busy || !canWork || state.phase === "running"}
                  onClick={() => setLibraryOpen(true)}
                >
                  从本地资料夹取用
                </Button>
              )}
              <Button
                disabled={busy}
                onClick={() => void command(() => bridge!.taskReveal(target))}
              >
                打开工作文件夹
              </Button>
              <Button onClick={() => reveal("materials")}>资料与归档</Button>
            </div>
            <p className="task-work-muted">
              本地文件是主要工作材料，补充素材只复制到本机；使用模型时，读取的相关内容可能作为上下文发送。
            </p>
            <div
              className="task-work-transcript"
              ref={transcript}
              onScroll={() => {
                const e = transcript.current!;
                follow.current = e.scrollHeight - e.scrollTop - e.clientHeight < 70;
              }}
            >
              {state.hasMore && (
                <p className="task-work-muted">
                  此处展示最近 100 条消息，完整历史保存在 DSH 会话中。
                </p>
              )}
              {rows.map((row) => (
                <article key={row.seq} className={`task-work-message ${row.role}`}>
                  <strong>
                    {row.role === "user"
                      ? "你"
                      : row.role === "assistant"
                      ? "本机 DSH"
                      : "工具记录"}
                  </strong>
                  <SafeMessageMarkdown text={row.text} />
                  {"detail" in row && row.detail && (
                    <details>
                      <summary>查看工具记录</summary>
                      <pre className="task-work-preview">{row.detail}</pre>
                    </details>
                  )}
                  {row.role === "assistant" && (
                    <Button
                      size="small"
                      onClick={() => {
                        setNoteText(row.text.trim().slice(0, 500));
                        setNotice("已将这条回复放入交付说明，可在交付区核对。");
                      }}
                    >
                      用作提交说明
                    </Button>
                  )}
                </article>
              ))}
              {state.needsApproval && (
                <Alert
                  type="warning"
                  message="工具正在等待你确认"
                  description={
                    <>
                      请到{" "}
                      <Link to={nativeWorkbenchTaskPath(taskId, kind)}>工作台</Link>
                      选择“
                      {state.binding.sessionTitle || task?.title}
                      ”会话，核对操作并允许一次或拒绝，然后回到此任务继续查看。
                    </>
                  }
                />
              )}
              {state.phase === "running" && (
                <p role="status">正在执行，工具与回复记录会持续更新…</p>
              )}
              {["failed", "interrupted"].includes(state.phase) && (
                <Alert
                  type="warning"
                  message="请先核对文件与工具记录，再继续；不会自动重复执行。"
                />
              )}
            </div>
            {state.binding.pending && (
              <Alert
                type="warning"
                message="上一条请求结果待核对"
                description="回执可能丢失。先在工作台核对实际结果，确认没有执行完再按原内容重试，不会重复已完成的部分。"
                action={
                  <Button size="small" loading={busy} onClick={() => void send()}>
                    核对并重试原请求
                  </Button>
                }
              />
            )}
            <div className="task-work-handoff">
              <Button
                type="primary"
                onClick={() => navigate(nativeWorkbenchTaskPath(taskId, kind))}
              >
                在工作台继续
              </Button>
              {state.phase === "running" && (
                <Button
                  disabled={busy}
                  onClick={() => void command(() => bridge!.taskCancel(target))}
                >
                  停止本轮
                </Button>
              )}
              <span className="task-work-muted">
                {state.phase === "running"
                  ? "助手正在工作台执行。工具确认、追问和完整轨迹都在工作台完成。"
                  : "任务背景、目标、资料版本和工作目录会一起带过去，不需要再复述一遍。"}
              </span>
            </div>
            <details>
              <summary>进度与下一步</summary>
              <p className="task-work-muted">
                本机备注，不代表任务已验收。工作目录：{state.binding.directory}
              </p>
              <Input.TextArea
                aria-label="任务进度备注"
                value={note}
                maxLength={4000}
                onChange={(e) => setNote(e.target.value)}
                placeholder="已经完成什么、下一步、当前阻碍"
              />
              <Button
                disabled={busy || !canWork}
                onClick={() => void command(() => bridge!.taskNote(target, note))}
              >
                保存进度
              </Button>
            </details>
          </>
        )}
      </Section>
      <Section
        title="资料与归档"
        hint="取用共享资料，或归档本机产出"
        open={isOpen("materials")}
        onToggle={() => toggle("materials")}
        nodeRef={materialsRef}
      >
        <details className="task-work-more">
          <summary>取用共享资料（可选）</summary>
          <p>只把你选定的版本取到本机，不必先上传本地素材。</p>
          {detail.data?.artifacts.map((a) => (
            <div className="task-work-file" key={a.id}>
              <span>
                {a.filename} · v{a.version}
              </span>
              <Button
                disabled={!state || busy || !canWork || a.accessStatus === "revoked"}
                onClick={() =>
                  void importFile({
                    kind: "artifact",
                    id: a.id,
                    version: a.version,
                  })
                }
              >
                用于本任务
              </Button>
            </div>
          ))}
          <Select
            aria-label="资料集"
            placeholder="选择资料板块中的资料集"
            value={collection || undefined}
            onChange={setCollection}
            options={collections.data?.data
              .filter((c) => !c.externalSource)
              .map((c) => ({
                value: c.id,
                label: `${c.name} · ${researchScopeLabels[c.scope]}`,
              }))}
          />
          {(collections.error || library.error) && (
            <Alert type="error" message={collections.error || library.error} />
          )}
          {library.data?.data.map((f) => (
            <div className="task-work-file" key={f.id}>
              <span>
                {f.filename} · v{f.version}
              </span>
              <Button
                disabled={!state || busy || !canWork || f.status !== "available"}
                onClick={() =>
                  void importFile({
                    kind: "library",
                    id: f.id,
                    version: f.version,
                  })
                }
              >
                用于本任务
              </Button>
            </div>
          ))}
          {state !== undefined && state.binding.sources.length > 0 && (
            <details>
              <summary>已选入的资料版本</summary>
              {state.binding.sources.map((source) => (
                <p key={`${source.kind}:${source.id}:${source.version}`}>
                  {source.filename} · v{source.version} · {source.localName}
                </p>
              ))}
            </details>
          )}
        </details>
        <details className="task-work-more">
          <summary>归档到资料（可选）</summary>
          <p className="task-work-muted">
            PPT、Word、Excel 原件请先归档，再在提交说明里写明集合与文件名。
          </p>
          <TaskArchivePanel
            target={target}
            state={state}
            selected={outputs.map((file) => file.name)}
            collections={collections.data?.data || []}
            busy={busy}
            command={command}
            refreshCollections={collections.refresh}
          />
        </details>
      </Section>
      <Section
        title="安排"
        hint="负责人、时间与承接"
        open={isOpen("plan")}
        onToggle={() => toggle("plan")}
        nodeRef={planRef}
      >
        {children(async () => {
          setNotice("");
          await detail.refresh();
          await onChanged();
        })}
      </Section>
      <Section
        title="规则与记忆"
        hint="本轮使用哪些规则、记忆和方法"
        open={isOpen("knowledge")}
        onToggle={() => toggle("knowledge")}
      >
        <TaskKnowledgePanel
          key={`${kind}:${taskId}`}
          target={target}
          state={state}
          canWork={canWork}
          busy={busy}
          command={command}
        />
      </Section>
      <LocalLibraryPicker
        open={libraryOpen}
        confirmLabel="复制到工作文件夹"
        onClose={() => setLibraryOpen(false)}
        onPick={(rels) => {
          setLibraryOpen(false);
          void command(async () => {
            const { isCurrent } = operation.capture();
            await bridge!.taskImportLibrary(target, rels);
            if (isCurrent())
              setNotice(
                `已从本地资料夹复制 ${rels.length} 个文件到工作文件夹，未上传。`,
              );
          });
        }}
      />
    </section>
  );
}
