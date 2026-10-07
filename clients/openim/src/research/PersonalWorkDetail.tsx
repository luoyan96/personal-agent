import { Alert, App, Button, Input, Select } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import type { PersonalWorkTask } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { usePersonalOperation } from "./usePersonalOperation";
import { useWorkspaceConversation, workspaceApi } from "./workspace-api";
import SafeMessageMarkdown from "./SafeMessageMarkdown";

export const workspaceStatusLabel: Record<string, string> = {
  proposed: "待确认安排",
  ready: "准备开始",
  running: "正在处理",
  blocked: "需要解决阻碍",
  awaiting_review: "等待验收",
  completed: "已完成",
  cancelled: "已取消",
  unassigned: "待安排成员",
  awaiting_acceptance: "等待成员接受",
  in_progress: "进行中",
  in_review: "等待验收",
  changes_requested: "需要修改",
  active: "进行中",
  paused: "已暂停",
  queued: "等待处理",
  succeeded: "已回复",
  failed: "未完成",
  unavailable: "模型不可用",
  waiting_input: "需要补充信息",
};
export const workspaceMemberLabel = {
  invited: "已邀请，待同意",
  accepted: "已接受",
  declined: "已拒绝",
  revoked: "已移除",
};

export function PersonalWorkDetail({
  taskId,
  onChanged,
}: {
  taskId: string;
  onChanged: () => Promise<void>;
}) {
  const read = useResearchRead(
    () => workspaceApi.task(taskId),
    `personal-work:${taskId}`,
  );
  const operation = usePersonalOperation(true, `personal-work:${taskId}`),
    openConversation = useWorkspaceConversation();
  const contacts = useResearchStore((s) => s.contacts),
    { modal } = App.useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [result, setResult] = useState(""),
    [agentId, setAgentId] = useState(""),
    [inviteId, setInviteId] = useState("");
  const inFlight = useRef(false);
  useLayoutEffect(() => {
    inFlight.current = false;
    setBusy(false);
    setError("");
    setNotice("");
    setResult("");
    setAgentId("");
    setInviteId("");
  }, [operation.scope]);
  const task = read.data?.data;
  const command = async (call: () => Promise<unknown>, success: string) => {
    if (inFlight.current || !task) return;
    const { isCurrent } = operation.capture();
    inFlight.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await call();
      if (!isCurrent()) return;
      await read.refresh();
      if (!isCurrent()) return;
      await onChanged();
      if (isCurrent()) setNotice(success);
    } catch (failure) {
      if (isCurrent())
        setError(
          failure instanceof Error ? failure.message : "操作未完成，请稍后重试。",
        );
    } finally {
      if (isCurrent()) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };
  const confirm = (
    title: string,
    content: string,
    action: () => Promise<unknown>,
    success: string,
  ) => {
    const { isCurrent } = operation.capture();
    modal.confirm({
      title,
      content,
      onOk: () => (isCurrent() ? command(action, success) : undefined),
    });
  };
  if (!task)
    return (
      <section className="workspace-task-detail">
        {read.error ? (
          <Alert
            type="error"
            message={read.error}
            action={<Button onClick={read.refresh}>重试</Button>}
          />
        ) : (
          <p role="status">正在读取任务…</p>
        )}
      </section>
    );
  const allowed = (name: PersonalWorkTask["allowedActions"][number]) =>
    task.allowedActions.includes(name);
  const eligible = contacts
    .map((c) => c.contact)
    .filter((c) => c.allowedActions.includes("chat"));
  const agents = eligible.filter(
    (c) =>
      c.identity.kind !== "human" &&
      !c.agentRuntime &&
      task.participants.some((p) => p.contactId === c.id && p.status === "accepted"),
  );
  return (
    <section className="workspace-task-detail" aria-label="任务详情">
      <header>
        <span className="workspace-eyebrow">个人协作任务</span>
        <h2>{task.title}</h2>
        <span className="workspace-status">
          {workspaceStatusLabel[task.status] || "查看当前状态"}
        </span>
      </header>
      {task.summaryOnly ? (
        <p className="workspace-task-goal">
          接受任务后可查看获准目标与结果；群聊邀请独立处理。
        </p>
      ) : (
        <div className="workspace-task-goal">
          <SafeMessageMarkdown text={task.goal || "尚未填写目标"} />
        </div>
      )}
      <h3>负责人和成员</h3>
      <div className="workspace-member-list">
        <p>
          <strong>{task.owner.displayName}</strong>
          <span className="workspace-kind">负责人</span>
        </p>
        {task.participants
          .filter((p) => p.contactId !== task.owner.contactId)
          .map((p) => (
            <p key={p.contactId}>
              <span>{p.displayName}</span>
              <span
                className={`workspace-kind ${p.kind === "agent" ? "agent" : "human"}`}
              >
                {p.kind === "agent" ? "Agent" : "个人"}
              </span>
              <small>{workspaceMemberLabel[p.status]}</small>
            </p>
          ))}
      </div>
      {task.result && (
        <section className="workspace-result">
          <h3>{task.result.accepted ? "已验收结果" : "待核对结果"}</h3>
          <SafeMessageMarkdown text={task.result.summary} />
        </section>
      )}
      {(error || notice) && (
        <Alert type={error ? "error" : "info"} message={error || notice} />
      )}
      <div className="workspace-card-actions">
        {allowed("activate") && (
          <Button
            type="primary"
            disabled={busy}
            onClick={() =>
              confirm(
                "确认这项协作安排？",
                "将创建任务群并邀请列出的成员；其他成员仍需自行接受。不会自动调用模型或完成任务。",
                () =>
                  researchApi("activatePersonalWorkTask", {
                    params: { id: task.id },
                    body: { expectedVersion: task.version },
                  }),
                "协作安排已确认，成员邀请已按实际权限发出。",
              )
            }
          >
            确认并建立任务群
          </Button>
        )}
        {(["accept", "decline"] as const).map(
          (decision) =>
            allowed(decision) && (
              <Button
                key={decision}
                type={decision === "accept" ? "primary" : "default"}
                loading={busy}
                onClick={() =>
                  void command(
                    () =>
                      researchApi("decidePersonalWorkTask", {
                        params: { id: task.id },
                        body: { expectedVersion: task.version, decision },
                      }),
                    decision === "accept"
                      ? "已接受任务；群邀请需单独处理。"
                      : "已拒绝任务。",
                  )
                }
              >
                {decision === "accept" ? "接受任务" : "拒绝"}
              </Button>
            ),
        )}
        {task.conversationId && !task.summaryOnly && (
          <Button
            disabled={busy}
            onClick={async () => {
              const { isCurrent } = operation.capture();
              try {
                await openConversation(task.conversationId!, isCurrent);
              } catch (e) {
                if (isCurrent())
                  setError(e instanceof Error ? e.message : "暂不能打开聊天。");
              }
            }}
          >
            返回任务聊天
          </Button>
        )}
      </div>
      {(allowed("run") ||
        allowed("submit") ||
        allowed("invite") ||
        allowed("review") ||
        allowed("cancel")) && (
        <details className="workspace-task-more">
          <summary>任务操作</summary>
          <div className="workspace-task-form">
            {allowed("run") && (
              <section>
                <h3>请 Agent 处理</h3>
                <p className="workspace-muted">
                  将当前完整目标交给已加入的站内 Agent，使用你的模型。结果仍需验收。
                </p>
                <Select
                  aria-label="执行任务的 Agent"
                  value={agentId || undefined}
                  placeholder="选择已加入的 Agent"
                  options={agents.map((c) => ({ value: c.id, label: c.displayName }))}
                  onChange={setAgentId}
                />
                <Button
                  disabled={busy || !agentId}
                  onClick={() =>
                    confirm(
                      "提交任务给这个 Agent？",
                      "模型将使用本次任务目标；不会自动转发到外部 Agent 或执行工具。",
                      () =>
                        researchApi("runPersonalWorkTask", {
                          params: { id: task.id },
                          body: {
                            expectedVersion: task.version,
                            agentContactId: agentId,
                          },
                        }),
                      "已提交，等待 Agent 的真实回复。",
                    )
                  }
                >
                  提交处理
                </Button>
              </section>
            )}
            {allowed("submit") && (
              <section>
                <h3>提交实际结果</h3>
                <Input.TextArea
                  aria-label="任务结果"
                  rows={3}
                  maxLength={8000}
                  value={result}
                  disabled={busy}
                  onChange={(e) => setResult(e.target.value)}
                />
                <Button
                  disabled={busy || !result.trim()}
                  onClick={() =>
                    void command(
                      () =>
                        researchApi("submitPersonalWorkResult", {
                          params: { id: task.id },
                          body: { expectedVersion: task.version, text: result },
                        }),
                      "结果已提交，等待验收。",
                    )
                  }
                >
                  提交结果
                </Button>
              </section>
            )}
            {allowed("review") && task.result?.messageId && (
              <section>
                <h3>核对当前结果</h3>
                <Button
                  disabled={busy}
                  type="primary"
                  onClick={() =>
                    confirm(
                      "接受当前结果？",
                      "确认后此任务才标为已完成，请先核对上方实际结果。",
                      () =>
                        researchApi("reviewPersonalWorkResult", {
                          params: { id: task.id },
                          body: {
                            expectedVersion: task.version,
                            messageId: task.result!.messageId!,
                            decision: "accept",
                          },
                        }),
                      "当前结果已验收，任务已完成。",
                    )
                  }
                >
                  确认验收
                </Button>
                <Button
                  disabled={busy}
                  onClick={() =>
                    void command(
                      () =>
                        researchApi("reviewPersonalWorkResult", {
                          params: { id: task.id },
                          body: {
                            expectedVersion: task.version,
                            messageId: task.result!.messageId!,
                            decision: "request_changes",
                          },
                        }),
                      "已要求修改，任务未完成。",
                    )
                  }
                >
                  要求修改
                </Button>
              </section>
            )}
            {allowed("invite") && (
              <section>
                <h3>邀请其他联系人</h3>
                <Select
                  aria-label="任务邀请联系人"
                  value={inviteId || undefined}
                  options={eligible
                    .filter(
                      (c) =>
                        !task.participants.some(
                          (p) =>
                            p.contactId === c.id &&
                            ["accepted", "invited"].includes(p.status),
                        ),
                    )
                    .map((c) => ({ value: c.id, label: c.displayName }))}
                  placeholder="选择已添加的联系人"
                  onChange={setInviteId}
                />
                <Button
                  disabled={busy || !inviteId}
                  onClick={() =>
                    void command(
                      () =>
                        researchApi("invitePersonalWorkContact", {
                          params: { id: task.id },
                          body: { expectedVersion: task.version, contactId: inviteId },
                        }),
                      "邀请已提交，对方仍需同意。",
                    )
                  }
                >
                  邀请
                </Button>
              </section>
            )}
            {allowed("cancel") && (
              <Button
                danger
                disabled={busy}
                onClick={() =>
                  confirm(
                    "取消这项任务？",
                    "停止后续处理；已经产生的聊天、用量及结果保留。",
                    () =>
                      researchApi("cancelPersonalWorkTask", {
                        params: { id: task.id },
                        body: { expectedVersion: task.version },
                      }),
                    "任务已取消。",
                  )
                }
              >
                取消任务
              </Button>
            )}
          </div>
        </details>
      )}
    </section>
  );
}
