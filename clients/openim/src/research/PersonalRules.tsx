import { Alert, Button, Input } from "antd";
import { useLayoutEffect, useState } from "react";

import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useWorkspaceAvailability } from "./useWorkspaceAvailability";
import { WorkspaceUnavailable } from "./WorkspaceUnavailable";
import { usePersonalOperation } from "./usePersonalOperation";
import "./library-workspace.scss";

const statusLabels = {
  active: "生效中",
  candidate: "待确认",
  revoked: "已撤回",
} as const;

const statusClasses = {
  active: "bg-emerald-50 text-emerald-700",
  candidate: "bg-amber-50 text-amber-700",
  revoked: "bg-slate-100 text-slate-500",
} as const;

/**
 * 个人规则只属于本人：由本人确认，只进入自己的私聊与个人会话。
 * 群聊不加载个人规则，别人的会话也读不到。
 */
export function PersonalRules() {
  const availability = useWorkspaceAvailability(true);
  const supported = availability.supports(45);
  const operation = usePersonalOperation(supported, "personal-rules");
  const read = useResearchRead(
    () => researchApi("personalWorkRules"),
    "personal-work-rules",
    supported
  );
  const [editing, setEditing] = useState<{
    id?: string;
    version: number;
    title: string;
    content: string;
  }>();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  useLayoutEffect(() => {
    setEditing(undefined);
    setBusy(false);
    setFailure("");
    setNotice("");
  }, [operation.scope]);
  const data = read.data?.data;
  const records = data?.records || [];

  const submit = async (
    action: "save" | "confirm" | "revoke",
    record?: { id: string; version: number; title: string; content: string }
  ) => {
    const draft = record ?? editing;
    if (!draft) return;
    const captured = operation.capture();
    setBusy(true);
    setFailure("");
    setNotice("");
    try {
      await researchApi("savePersonalWorkRule", {
        body: {
          kind: "rule" as const,
          title: draft.title.trim(),
          content: draft.content.trim(),
          recordId: draft.id ?? null,
          expectedVersion: draft.version,
          action,
        },
      });
      if (!captured.isCurrent()) return;
      setEditing(undefined);
      setNotice(
        action === "revoke"
          ? "已撤回，这条不会再进入你的私聊。"
          : action === "confirm"
          ? "已确认生效。"
          : "已保存，之后的本人私聊与本机任务执行会使用这条规则。"
      );
      await read.refresh();
    } catch (e) {
      if (captured.isCurrent())
        setFailure(e instanceof Error ? e.message : "未保存，内容已保留。");
    } finally {
      if (captured.isCurrent()) setBusy(false);
    }
  };

  if (!supported)
    return (
      <section className="my-rules workspace-standards">
        <WorkspaceUnavailable
          feature="固定要求"
          pending={!availability.data && !availability.error}
          error={availability.error}
          onRetry={availability.refresh}
        />
      </section>
    );

  return (
    <section className="my-rules workspace-standards" aria-label="固定要求">
      <header className="my-section-heading">
        <h2>固定要求</h2>
        <p>
          由你明确设定，和聊天中形成的习惯分别保存。用于本人私聊、个人会话及本机任务工作区。
          群聊和共享个人任务不加载，不能覆盖平台或团队要求。
        </p>
      </header>
      {read.error && (
        <Alert
          type="error"
          message="固定要求暂不可用"
          description={read.error}
          action={<Button onClick={read.refresh}>重试读取</Button>}
        />
      )}
      {notice && <Alert type="success" message={notice} />}
      {failure && <Alert type="error" message={failure} />}
      <div className="workspace-standards-heading">
        <div>
          <h3>已保存的要求</h3>
          <p>确认后立即生效；撤回后保留历史，不再进入新对话。</p>
        </div>
        <Button
          type="primary"
          disabled={busy || Boolean(editing)}
          onClick={() => setEditing({ version: 0, title: "", content: "" })}
        >
          新增要求
        </Button>
      </div>
      {editing && (
        <div className="workspace-standards-editor" aria-label="编辑个人规则">
          <Input
            aria-label="规则标题"
            maxLength={80}
            placeholder="一句话说明这条规则，例如：回答先给结论"
            value={editing.title}
            disabled={busy}
            onChange={(e) =>
              setEditing((s) => s && { ...s, title: e.target.value })
            }
          />
          <Input.TextArea
            aria-label="规则正文"
            rows={3}
            maxLength={2000}
            placeholder="写清要求本身，例如：先给结论，再给证据；不确定的地方直接说不确定。"
            value={editing.content}
            disabled={busy}
            onChange={(e) =>
              setEditing((s) => s && { ...s, content: e.target.value })
            }
          />
          <div>
            <Button
              type="primary"
              loading={busy}
              disabled={!editing.title.trim() || !editing.content.trim()}
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
      {!read.data && !read.error && <p>正在读取固定要求…</p>}
      {read.data && !records.length && !editing && !read.error && (
        <p className="workspace-muted">
          还没有固定要求。可以保存一条需要持续遵守的明确要求。
        </p>
      )}
      {records.map((record) => (
        <article className="workspace-standards-record" key={record.id}>
          <header>
            <strong>{record.title}</strong>
            <span className={statusClasses[record.status]}>
              {statusLabels[record.status]}
            </span>
            <small>
              v{record.version} ·{" "}
              {new Date(record.updatedAt).toLocaleString("zh-CN")}
            </small>
          </header>
          <p>{record.content}</p>
          <div className="workspace-standards-actions">
            {record.allowedActions.includes("revise") && (
              <Button
                size="small"
                disabled={busy}
                onClick={() =>
                  setEditing({
                    id: record.id,
                    version: record.version,
                    title: record.title,
                    content: record.content,
                  })
                }
              >
                修改
              </Button>
            )}
            {record.allowedActions.includes("revoke") && (
              <Button
                size="small"
                danger
                disabled={busy}
                onClick={() => void submit("revoke", record)}
              >
                撤回
              </Button>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
