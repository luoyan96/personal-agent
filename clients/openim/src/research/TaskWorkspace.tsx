import "./task-workspace.scss";
import type { ReactNode } from "react";
import { Alert, Button } from "antd";
import { PersonalWorkDetail } from "./PersonalWorkDetail";
import { ResearchTaskPanel } from "./ResearchTaskPanel";
import { TaskWorkPage } from "./TaskWorkPage";

export function TaskReadNotice({
  error,
  stale,
  loading,
  onRetry,
}: {
  error: string;
  stale: boolean;
  loading: boolean;
  onRetry: () => Promise<void>;
}) {
  if (!error) return null;
  if (stale)
    return (
      <div className="workspace-task-read-notice" role="status">
        <span>暂未更新，当前显示上次读取的任务。</span>
        <Button
          type="link"
          size="small"
          loading={loading}
          onClick={() => void onRetry()}
        >
          重试
        </Button>
        <details>
          <summary>查看原因</summary>
          <p>{error}</p>
        </details>
      </div>
    );
  return (
    <Alert
      type="error"
      message="暂时无法读取任务"
      description={error}
      action={
        <Button loading={loading} onClick={() => void onRetry()}>
          重试
        </Button>
      }
    />
  );
}

export function TaskWorkspace({
  list,
  children,
}: {
  list: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="workspace-task-body">
      <aside className="workspace-task-list" aria-label="任务列表">
        {list}
      </aside>
      <main className="workspace-detail-pane" aria-label="任务详情">
        {children}
      </main>
    </div>
  );
}

export function TaskListRow({
  title,
  status,
  meta,
  hint,
  selected,
  onSelect,
}: {
  title: string;
  status: string;
  meta: string;
  hint?: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button className="workspace-task-row" aria-pressed={selected} onClick={onSelect}>
      <span className="workspace-task-row-heading">
        <span className="workspace-task-row-title">{title}</span>
        <span className="workspace-status">{status}</span>
      </span>
      <footer>{meta}</footer>
      {hint && <small className="workspace-task-row-hint">{hint}</small>}
    </button>
  );
}

/** Both list views open the same task work page and the same authorized actions. */
export function WorkspaceTaskDetail({
  taskId,
  kind,
  onChanged,
}: {
  taskId: string;
  kind: "personal" | "research";
  onChanged: () => Promise<void>;
}) {
  return (
    <TaskWorkPage taskId={taskId} kind={kind} onChanged={onChanged}>
      {(refresh) =>
        kind === "research" ? (
          <div className="workspace-task-detail">
            <ResearchTaskPanel taskId={taskId} onChanged={refresh} embedded />
          </div>
        ) : (
          <PersonalWorkDetail taskId={taskId} onChanged={refresh} embedded />
        )
      }
    </TaskWorkPage>
  );
}
