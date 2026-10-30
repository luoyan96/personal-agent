import { TaskExecutionStatus } from './TaskExecutionStatus';
import { TaskKnowledgePanel } from './TaskKnowledgePanel';
import { TaskArchivePanel } from './TaskArchivePanel';
import { researchScopeLabels } from './research-library-api';
import { Alert, Button, Checkbox, Input, Select } from "antd";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type {
  DshTaskState,
  TaskTarget,
} from "../../../../integrations/deepseek-harness/desktop/task-workspace";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { usePersonalOperation } from "./usePersonalOperation";
import SafeMessageMarkdown from "./SafeMessageMarkdown";
import { taskEventRows } from "./task-dsh-events";
import "./task-work-page.scss";
import { Link, useNavigate } from "react-router-dom";
import { nativeWorkbenchTaskPath } from './workbench-links';

const phases = {
  ready: "可以开始",
  running: "正在执行",
  finished: "本轮已结束 · 待核对成果",
  interrupted: "执行中断 · 结果待核对",
  failed: "本轮未完成",
};

/** Electron 的 IPC 报错会带 "Error invoking remote method 'x': error." 或 "Error:" 前缀，只留人话。 */
export function readableTaskError(error: unknown, fallback: string) {
  const text =
    typeof error === "string" ? error : error instanceof Error ? error.message : "";
  const stripped = text
    .replace(/^Error invoking remote method '[^']*':\s*/i, "")
    .replace(/^error[.:]\s*/i, "");
  return stripped.trim() || fallback;
}

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

function Points({ text }: { text: string }) {
  const points = keyPoints(text),
    shown = points.slice(0, 5);
  if (richText.test(text)) return <SafeMessageMarkdown text={text} />;
  return (
    <>
      <ul>
        {shown.map((point, index) => (
          <li key={index}>{point}</li>
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

/** Goal and acceptance stay open, but only as short points. */
function TaskBrief({ goal, acceptance }: { goal: string; acceptance: string }) {
  const groups = [
    { label: "目标", text: goal },
    { label: "验收", text: acceptance },
  ].filter((group) => group.text.trim());
  return (
    <section className="task-work-brief" aria-label="目标与交付要求">
      {groups.map((group) => (
        <div key={group.label}>
          <h3>{group.label}</h3>
          <Points text={group.text} />
        </div>
      ))}
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
    [summary, setSummary] = useState(""),
    [preview, setPreview] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [collection, setCollection] = useState(""),
    [notice, setNotice] = useState("");
  const flight = useRef(false),
    noteLoaded = useRef(false),
    summaryTouched = useRef(false),
    autoSummary = useRef("");
  const transcript = useRef<HTMLDivElement>(null),
    materialsRef = useRef<HTMLElement>(null),
    planRef = useRef<HTMLElement>(null),
    follow = useRef(true);
  useEffect(() => {
    flight.current = false;
    setBusy(false);
    setSection({});
    setState(undefined); setNote(''); setSummary(''); setPreview('');
    setSelected([]); setCollection(''); setNotice(''); setError(''); setConnectionError('');
    noteLoaded.current = false;
    summaryTouched.current = false;
    autoSummary.current = "";
  }, [operation.scope]);
  const detail = useResearchRead(async (signal) => {
    if (kind === "personal") {
      const r = await researchApi("personalWorkTask", {
        params: { id: taskId },
        signal,
      });
      return { task: r.data, artifacts: [] };
    }
    const r = await researchApi("task", { params: { id: taskId }, signal });
    return "task" in r.data
      ? { task: r.data.task, artifacts: r.data.artifacts || [] }
      : { task: r.data, artifacts: [] };
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
    section.materials === true && !!collection,
  );
  const task = detail.data?.task,
    actions: string[] = task?.allowedActions || [];
  const canWork =
    kind === "research"
      ? actions.includes("submit")
      : actions.some((a) => ["run", "submit"].includes(a));
  const version = task && "version" in task ? task.version : undefined;
  const canStart = kind === "research" && actions.includes("start") && !!version;
  const canClaim = kind === "research" && actions.includes("claim") && !!version;
  const canActivate =
    kind === "personal" && actions.includes("activate") && !!version;
  const isOpen = (id: string) => {
    if (section[id] !== undefined) return section[id];
    if (id === "plan") return !canWork;
    return id === "work";
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
        if (next.binding.delivery?.status === "pending") {
          setSummary(next.binding.delivery.summary);
          setSelected(next.binding.delivery.names);
        }
        noteLoaded.current = true;
      }
      // The assistant already wrote the result; retyping it into the summary is
      // busywork. Fill it once and keep refreshing only while it stays untouched.
      const reply = taskEventRows(next?.events || [])
        .filter((row) => row.role === "assistant" && row.text.trim())
        .at(-1);
      if (reply) {
        const text = reply.text.trim().slice(0, 8000);
        setSummary((current) => {
          if (summaryTouched.current) return current;
          if (current && current !== autoSummary.current) return current;
          autoSummary.current = text;
          return text;
        });
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
          setConnectionError(readableTaskError(e, "本地进度暂不可用。"));
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
  const command = async (action: () => Promise<unknown>) => {
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
        setError(readableTaskError(e, "操作未完成，请重试。"));
        await refresh().catch(() => {});
      }
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
      if (isCurrent()) setNotice("已将选定版本保存到本任务目录，相同内容的已选素材会复用本地副本。");
    });
  const submit = () =>
    command(async () => {
      const { isCurrent } = operation.capture();
      await bridge!.taskSubmit(target, summary, kind === 'personal' ? [] : selected);
      if (isCurrent()) {
        setNotice("成果已提交，等待验收。");
        setSection((value) => ({ ...value, plan: true, materials: false }));
      }
    });
  // An existing workspace always decides the next step: the work already started.
  const next = state
    ? state.phase === "running"
      ? {
          hint: "助手正在工作台执行。工具确认和完整轨迹都在工作台完成。",
          label: "去工作台看进度",
          run: async () => navigate(nativeWorkbenchTaskPath(taskId, kind)),
        }
      : {
          hint: "本轮已结束。核对文件与工具记录，选定成果后提交验收。",
          label: "核对成果并提交",
          run: async () => reveal("materials"),
        }
    : !canWork
    ? canStart
      ? {
          hint: "这项任务还没开始。开始后就能在本机文件夹里动手，不需要先上传材料。",
          label: "开始这一步",
          run: start,
        }
      : canClaim
      ? {
          hint: "还没有承接人。确认认领后就可以开始。",
          label: "确认认领",
          run: claim,
        }
      : canActivate
      ? {
          hint: "任务还是草案。确认后才会建群并邀请参与人。",
          label: "确认任务并开始",
          run: start,
        }
      : {
          hint: "先看下面的安排，确认承接范围后再开始。",
          label: "看安排与验收",
          run: async () => reveal("plan"),
        }
    : bridge?.taskOpen
    ? {
        hint: "选择一个已有的工作文件夹就能开始，文件留在本机。",
        label: "选择本地工作文件夹",
        run: () => openWorkspace(true),
      }
    : {
        hint: "本机执行需要新版 Windows 客户端，安排与验收仍可使用。",
        label: "看安排与验收",
        run: async () => reveal("plan"),
      };
  // Only the text we filled ourselves is worth labelling as prefilled.
  const prefilled = !!summary && summary === autoSummary.current;
  return (
    <section className="task-work-page" aria-label="任务工作页">
      <header className="task-work-heading">
        <div>
          <h2>{task?.title || "正在读取任务…"}</h2>
        </div>
        {!!(connectionError || state) && (
          <span>
            {connectionError
              ? "连接中断 · 进度待核对"
              : phases[state!.phase]}
          </span>
        )}
      </header>
      <TaskExecutionStatus target={target} />
      <div className="task-work-next" role="status">
        <strong>下一步</strong>
        <p>{next.hint}</p>
        <div className="task-work-next-actions">
          <Button type="primary" loading={busy} disabled={!task} onClick={() => void next.run()}>
            {next.label}
          </Button>
        </div>
      </div>
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
      {task && "goal" in task && task.goal && (
        <TaskBrief
          goal={task.goal}
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
                <Button type="primary" disabled={busy} onClick={() => void openWorkspace(true)}>
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
              <Button disabled={busy || !canWork || state.phase === 'running'} onClick={() => void command(async () => {
                const { isCurrent } = operation.capture();
                const added = await bridge!.taskAddLocal(target);
                if (added && isCurrent()) setNotice('素材已加入本机工作文件夹，未上传到资料服务。');
              })}>添加本地素材</Button>
              <Button disabled={busy} onClick={() => void command(() => bridge!.taskReveal(target))}>打开工作文件夹</Button>
              <Button onClick={() => reveal("materials")}>取用共享资料 / 归档成果</Button>
            </div>
            <p className="task-work-muted">
              本地文件是主要工作材料，补充素材只复制到本机；使用模型时，读取的相关内容可能作为上下文发送。
            </p>
            <div
              className="task-work-transcript"
              ref={transcript}
              onScroll={() => {
                const e = transcript.current!;
                follow.current =
                  e.scrollHeight - e.scrollTop - e.clientHeight < 70;
              }}
            >
              {state.hasMore && (
                <p className="task-work-muted">
                  此处展示最近 100 条消息，完整历史保存在 DSH 会话中。
                </p>
              )}
              {rows.map((row) => (
                <article
                  key={row.seq}
                  className={`task-work-message ${row.role}`}
                >
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
                        summaryTouched.current = true;
                        setSummary(row.text.slice(0, 8000));
                        setSection((value) => ({ ...value, materials: true }));
                      }}
                    >
                      用作成果摘要
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
                      请到 <Link to={nativeWorkbenchTaskPath(taskId, kind)}>工作台</Link>选择“
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
        title="成果与提交"
        hint={state ? `${state.files.length} 个文件 · 归档与提交是两件事` : "先建立工作区"}
        open={isOpen("materials")}
        onToggle={() => toggle("materials")}
        nodeRef={materialsRef}
      >
        <div className="task-work-materials">
          {!state && (
            <p className="task-work-muted">
              先在「工作」里选择工作文件夹，这里才会列出可归档的成果。
            </p>
          )}
          {!!state?.binding.localMaterials?.length && <details><summary>补充的本地素材（仅本机）</summary>
            {state.binding.localMaterials.map(s => <p key={`${s.localName}:${s.sha256}`}>{s.filename} → {s.localName}</p>)}
          </details>}
          <h3>按需取用共享资料</h3>
          <p>只把你选定的版本取到本机，不必先上传本地素材。</p>
          {detail.data?.artifacts.map((a) => (
            <div className="task-work-file" key={a.id}>
              <span>
                {a.filename} · v{a.version}
              </span>
              <Button
                disabled={
                  !state || busy || !canWork || a.accessStatus === "revoked"
                }
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
            options={collections.data?.data.filter(c => !c.externalSource).map((c) => ({
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
                  void importFile({ kind: "library", id: f.id, version: f.version })
                }
              >
                用于本任务
              </Button>
            </div>
          ))}
          {!!state?.binding.sources.length && (
            <details>
              <summary>已选入的资料版本</summary>
              {state.binding.sources.map((s) => (
                <p key={`${s.kind}:${s.id}:${s.version}`}>
                  {s.filename} · v{s.version} · {s.localName}
                </p>
              ))}
            </details>
          )}
          <h3>工作文件与成果</h3>
          <p>勾选要归档或提交的成果，勾选本身不会上传。</p>
          {state?.files.map((f) => (
            <div className="task-work-file" key={f.name}>
              <Checkbox
                disabled={busy}
                checked={selected.includes(f.name)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked
                      ? [...v, f.name]
                      : v.filter((n) => n !== f.name),
                  )
                }
              >
                <span title={f.name}>{state.binding.localMaterials?.find(s => s.localName === f.name)?.filename || state.binding.sources.find(s => s.localName === f.name)?.filename || f.name} · {f.size} 字节</span>
              </Checkbox>
              <div className="task-material-actions"><Button disabled={busy} onClick={() => void command(() => bridge!.taskReveal(target, f.name))}>在文件夹中显示</Button><Button
                disabled={busy}
                onClick={() =>
                  void command(async () => {
                    const { isCurrent } = operation.capture();
                    const output = await bridge!.taskOutput(target, f.name);
                    if (isCurrent()) setPreview(
                      output.preview ||
                        "此格式可在文件夹中打开查看，并归档原件到资料集合。",
                    );
                  })
                }
              >
                查看文字
              </Button></div>
            </div>
          ))}
          {preview && <pre className="task-work-preview">{preview}</pre>}
          <TaskArchivePanel target={target} state={state} selected={selected} collections={collections.data?.data || []}
            busy={busy} command={command} refreshCollections={collections.refresh} />
          <h3>提交任务验收</h3>
          {kind === 'research' && <p>任务附件支持 TXT/Markdown/CSV/TSV/JSON/PDF/PNG，每份最多 10 MiB。PPT、Word、Excel 原件请先归档，再在成果摘要中注明集合与文件名。</p>}
          {kind === "personal" && (
            <p>提交文字摘要；PPT、Word、Excel 原件请先归档，在摘要里写明集合与文件名。</p>
          )}
          {prefilled && (
            <p className="task-work-muted">
              已按助手最后一轮回复预填，可直接在上面改。
            </p>
          )}
          <Input.TextArea
            aria-label="成果摘要"
            rows={5}
            maxLength={8000}
            placeholder="说明结果、引用来源与仍需核对的内容。"
            value={summary}
            onChange={(e) => {
              summaryTouched.current = true;
              setSummary(e.target.value);
            }}
          />
          {state?.binding.delivery?.versionConflict && (
            <Alert
              type="warning"
              message="提交时任务已被更新"
              description="先到「安排与验收」核对变更；确认仍按这一版成果提交后，使用最新任务版本重试。已上传文件会继续复用。"
              action={
                <Button
                  disabled={busy || !actions.includes("submit")}
                  onClick={() =>
                    void command(async () => {
                      await bridge!.taskRebase(target);
                      const d = state.binding.delivery!;
                      await bridge!.taskSubmit(target, d.summary, d.names);
                      setSection((value) => ({ ...value, plan: true, materials: false }));
                      setNotice("成果已提交，等待验收。");
                    })
                  }
                >
                  已核对，重新提交此版
                </Button>
              }
            />
          )}
          <Button
            type="primary"
            loading={busy}
            disabled={
              !bridge?.taskSubmit ||
              !state ||
              !summary.trim() ||
              (kind === 'research' && selected.some(n => !/\.(txt|md|csv|tsv|json|pdf|png)$/i.test(n))) ||
              (!actions.includes("submit") &&
                state?.binding.delivery?.status !== "pending")
            }
            onClick={() => void submit()}
          >
            提交成果，等待验收
          </Button>
        </div>
      </Section>
      <Section
        title="安排与验收"
        hint="承接、依赖、交付记录与审阅"
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
        <TaskKnowledgePanel key={kind + ':' + taskId} target={target} state={state} canWork={canWork} busy={busy} command={command} />
      </Section>
    </section>
  );
}
