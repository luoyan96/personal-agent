import { Alert, App, Button, Input, Select, Space } from "antd";
import { useLayoutEffect, useRef, useState } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchStore } from "./store";
import { taskStateLabels, planDate } from "./task-planning";
import { teamNextStep } from "./research-team";
import { ResearchTeamAccountHint } from "./ResearchTeamAccountHint";

export function ResearchTaskPanel({
  taskId,
  onChanged,
}: {
  taskId: string;
  onChanged?: () => Promise<void>;
}) {
  const { modal } = App.useApp();
  const { data, error, refresh } = useResearchRead(
    (signal) => researchApi("task", { params: { id: taskId }, signal }),
    taskId,
  );
  const [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [summary, setSummary] = useState(""),
    [comment, setComment] = useState("");
  const [inviteId, setInviteId] = useState(""),
    [inviteScope, setInviteScope] = useState("");
  const [blockReason, setBlockReason] = useState(""),
    [requestedAction, setRequestedAction] = useState("");
  const [requestedMemberId, setRequestedMemberId] = useState<string>();
  const actor = useResearchStore((s) => s.actor);
  const members = useResearchRead(
    (signal) =>
      researchApi("members", {
        params: { id: actor!.member.labId },
        query: { limit: 100 },
        signal,
      }),
    `task-members:${actor?.member.labId}`,
    !!actor,
  );
  const people = Object.fromEntries(
    (members.data?.data || []).map((m) => [m.id, m.displayName]),
  );
  const name = (id: string | null) => (id ? people[id] || id : "尚未承接");
  const operation = usePersonalOperation(true, `research-task:${taskId}`);
  const inFlight = useRef(false);
  const dialogs = useRef<ReturnType<typeof modal.confirm>[]>([]);
  useLayoutEffect(() => {
    inFlight.current = false;
    setBusy(false);
    setFailure("");
    setSummary("");
    setComment("");
    setInviteId("");
    setInviteScope("");
    setBlockReason("");
    setRequestedAction("");
    setRequestedMemberId(undefined);
    return () => {
      dialogs.current.forEach((dialog) => dialog.destroy());
      dialogs.current = [];
    };
  }, [operation.scope]);
  const confirm = (options: Parameters<typeof modal.confirm>[0]) => {
    const { isCurrent } = operation.capture();
    dialogs.current.push(
      modal.confirm({
        cancelText: "取消",
        ...options,
        onOk: (...args) => (isCurrent() ? options.onOk?.(...args) : undefined),
      }),
    );
  };
  const command = async (run: () => Promise<unknown>) => {
    if (inFlight.current) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      await run();
      if (!isCurrent()) return;
      await refresh();
      if (isCurrent()) await onChanged?.();
    } catch (err) {
      if (!isCurrent()) return;
      setFailure(err instanceof Error ? err.message : "操作失败");
      await refresh();
    } finally {
      if (isCurrent()) {
        setBusy(false);
        inFlight.current = false;
      }
    }
  };
  if (!data)
    return (
      <Alert
        type={error ? "error" : "info"}
        message={error || "读取当前获准任务…"}
        action={error ? <Button onClick={refresh}>重新读取</Button> : undefined}
      />
    );
  const value = data.data;
  if (!("task" in value))
    return (
      <div className="space-y-3">
        <h3>{value.title}</h3>
        <p>{value.summary}</p>
        <p>交付：{value.deliverable}</p>
        <p>验收：{value.acceptanceCriteria}</p>
        <p>
          截止：{planDate(value.schedule.hardDeadline) || "未设置"}
          {value.schedule.hardDeadline && !value.schedule.hardDeadline.confirmed
            ? "（待确认）"
            : ""}
        </p>
        <p>受邀待同意；接受后才形成承接记录并开放获准材料。</p>
        {failure && <Alert type="error" message={failure} />}
        <Space>
          {value.pendingInvitation &&
            value.allowedActions.includes("decide") &&
            (["accepted", "declined"] as const).map((decision) => (
              <Button
                key={decision}
                loading={busy}
                onClick={() =>
                  confirm({
                    title:
                      decision === "accepted"
                        ? "接受此任务范围与时间？"
                        : "拒绝任务邀请？",
                    content: value.pendingInvitation?.scope,
                    okText: decision === "accepted" ? "接受任务" : "拒绝邀请",
                    onOk: () =>
                      command(() =>
                        researchApi("invitationDecision", {
                          params: { id: value.pendingInvitation!.id },
                          body: {
                            expectedVersion: value.pendingInvitation!.version,
                            expectedTaskVersion: value.version,
                            decision,
                            comment: null,
                          },
                        }),
                      ),
                  })
                }
              >
                {decision === "accepted" ? "接受任务" : "拒绝"}
              </Button>
            ))}
          {value.allowedActions.includes("claim") && (
            <Button
              loading={busy}
              onClick={() =>
                void command(() =>
                  researchApi("claim", {
                    params: { id: taskId },
                    body: { expectedVersion: value.version },
                  }),
                )
              }
            >
              确认认领
            </Button>
          )}
        </Space>
      </div>
    );
  const { task, assignments, executions, deliverables, artifacts } = value;
  const allowed = (action: string) =>
    task.allowedActions.some((item) => item === action);
  const latest = deliverables.reduce<(typeof deliverables)[number] | undefined>(
    (a, b) => (!a || b.revision > a.revision ? b : a),
    undefined,
  );
  return (
    <div className="research-task-detail space-y-3">
      <h3 className="text-base font-bold">{task.title}</h3>
      <p>
        {task.status === "completed" && latest?.review?.decision !== "accepted"
          ? "已结束 · 验收记录待核对"
          : taskStateLabels[task.status]}{" "}
        · 任务版本 {task.version}
      </p>
      <p className="whitespace-pre-wrap">目标：{task.goal}</p>
      <p className="whitespace-pre-wrap">验收要求：{task.acceptanceCriteria}</p>
      <div className="research-task-next">
        <strong>下一步</strong>
        <p>{teamNextStep(task)}</p>
      </div>
      <p>
        负责人：{name(task.leadId)} · 审阅人：{name(task.reviewerId)}
      </p>
      <p>
        截止：{planDate(task.schedule.hardDeadline) || "未设置"}
        {task.schedule.hardDeadline && !task.schedule.hardDeadline.confirmed
          ? "（待确认）"
          : ""}
      </p>
      <details>
        <summary>时间与依赖</summary>
        <p>承诺时间：{planDate(task.schedule.committed) || "未提供"}</p>
        <p>
          前置成果：
          {task.dependencies
            .map(
              (d) =>
                `${d.taskId}${
                  d.requiredRevision ? ` · 第${d.requiredRevision}版` : ""
                }`,
            )
            .join("；") || "无"}
        </p>
      </details>
      <p>
        真实承接：
        {assignments
          .filter((a) => a.status === "accepted")
          .map(
            (a) =>
              `${
                a.memberId ? name(a.memberId) : `公共 Agent ${a.capability?.id || ""}`
              } · ${a.commitment?.scope}`,
          )
          .join("；") || "尚无已接受承接"}
      </p>
      {assignments
        .filter((a) => a.status === "pending")
        .map((a) => (
          <p key={a.id}>已邀请 {name(a.memberId)}，待本人确认承接</p>
        ))}
      {task.blocker && (
        <Alert
          type="warning"
          message={task.blocker.reason}
          description={`需要${
            task.blocker.requestedMemberId
              ? ` ${name(task.blocker.requestedMemberId)} `
              : ""
          }${task.blocker.requestedAction}`}
        />
      )}
      {allowed("invite") && (
        <details className="research-task-operation">
          <summary>邀请成员承接</summary>
          <ResearchTeamAccountHint />
          <Select
            aria-label="承接成员"
            placeholder="选择本实验室成员"
            value={inviteId || undefined}
            options={(members.data?.data || []).map((m) => ({
              value: m.id,
              label: m.displayName,
            }))}
            onChange={setInviteId}
            disabled={busy}
          />
          <Input.TextArea
            aria-label="承接范围"
            placeholder="交代需要承接的范围与交付"
            value={inviteScope}
            onChange={(e) => setInviteScope(e.target.value)}
            maxLength={8000}
            disabled={busy}
          />
          {members.error && (
            <Alert
              type="error"
              message={members.error}
              action={<Button onClick={members.refresh}>重试成员列表</Button>}
            />
          )}
          {members.data?.nextCursor && (
            <p>此处显示首批 100 位成员；可在任务规划中按成员标识安排。</p>
          )}
          <Button
            disabled={busy || !inviteId || !inviteScope.trim()}
            onClick={() =>
              confirm({
                title: "发送任务邀请？",
                okText: "发送承接邀请",
                content: "成员需要自行接受；发出邀请不会计为已承接。",
                onOk: () =>
                  command(() =>
                    researchApi("invite", {
                      params: { id: task.id },
                      body: {
                        expectedVersion: task.version,
                        memberId: inviteId,
                        scope: inviteScope.trim(),
                        schedule: task.schedule,
                      },
                    }),
                  ),
              })
            }
          >
            发送承接邀请
          </Button>
        </details>
      )}
      {allowed("block") && (
        <details className="research-task-operation">
          <summary>说明阻碍，请求支持</summary>
          <Input.TextArea
            aria-label="阻碍原因"
            placeholder="目前卡在哪里"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            maxLength={8000}
            disabled={busy}
          />
          <Input.TextArea
            aria-label="所需支持"
            placeholder="需要补充什么材料或做什么决定"
            value={requestedAction}
            onChange={(e) => setRequestedAction(e.target.value)}
            maxLength={8000}
            disabled={busy}
          />
          <Select
            aria-label="请求支持成员"
            allowClear
            placeholder="请求谁协助（可选）"
            value={requestedMemberId}
            onChange={setRequestedMemberId}
            options={(members.data?.data || []).map((m) => ({
              value: m.id,
              label: m.displayName,
            }))}
            disabled={busy}
          />
          <Button
            disabled={busy || !blockReason.trim() || !requestedAction.trim()}
            onClick={() =>
              void command(() =>
                researchApi("block", {
                  params: { id: task.id },
                  body: {
                    expectedVersion: task.version,
                    reason: blockReason.trim(),
                    requestedMemberId: requestedMemberId || null,
                    requestedAction: requestedAction.trim(),
                  },
                }),
              )
            }
          >
            保存阻碍与支持请求
          </Button>
        </details>
      )}
      {allowed("resume") && (
        <Button
          disabled={busy}
          onClick={() =>
            confirm({
              title: "阻碍已经解决？",
              okText: "继续任务",
              content: "恢复后继续此前的任务阶段。",
              onOk: () =>
                command(() =>
                  researchApi("resume", {
                    params: { id: task.id },
                    body: { expectedVersion: task.version },
                  }),
                ),
            })
          }
        >
          确认解决并继续
        </Button>
      )}
      {failure && <Alert type="error" message={failure} />}
      {allowed("start") && (
        <Button
          loading={busy}
          onClick={() =>
            void command(() =>
              researchApi("start", {
                params: { id: task.id },
                body: { expectedVersion: task.version },
              }),
            )
          }
        >
          确认开始任务
        </Button>
      )}
      {artifacts?.map((artifact) => (
        <div key={artifact.id} className="border p-2">
          <p>
            {artifact.filename} / 版本 {artifact.version}
          </p>
          <p className="text-xs">
            {artifact.id} · {artifact.size} 字节 ·{" "}
            {artifact.accessStatus || "available"}
          </p>
          <a
            href={`/api/v1/artifacts/${encodeURIComponent(artifact.id)}/content`}
            target="_blank"
            rel="noreferrer"
          >
            下载获准材料
          </a>
        </div>
      ))}
      {allowed("upload") && (
        <label className="block border p-3">
          上传为科研输入材料（TXT/PDF/PNG，最多 10 MiB）
          <input
            type="file"
            accept=".txt,.pdf,.png"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const { isCurrent } = operation.capture();
              void command(async () => {
                if (file.size < 1 || file.size > 10485760)
                  throw new Error("科研材料须为 1 字节至 10 MiB");
                const mediaType =
                  file.type === "application/pdf"
                    ? "application/pdf"
                    : file.type === "image/png"
                    ? "image/png"
                    : "text/plain";
                const contentBase64 = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(String(reader.result).split(",")[1]);
                  reader.onerror = () => reject(new Error("无法读取文件"));
                  reader.readAsDataURL(file);
                });
                if (!isCurrent()) return;
                await researchApi("upload", {
                  body: {
                    taskId: task.id,
                    expectedVersion: task.version,
                    filename: file.name,
                    mediaType,
                    contentBase64,
                  },
                });
              });
            }}
          />
          <p className="text-xs text-slate-500">
            普通 IM 附件支持任意类型；这里是显式授权进入任务与模型上下文的材料。
          </p>
        </label>
      )}
      {executions.map((run) => (
        <RunDetails
          key={run.id}
          runId={run.id}
          taskVersion={task.version}
          onChanged={refresh}
        />
      ))}
      {allowed("submit") && (
        <div>
          <Input.TextArea
            aria-label="交付摘要"
            rows={3}
            maxLength={8000}
            placeholder="填写实际交付摘要；附件引用在 AI 候选提交中保留"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
          <Button
            loading={busy}
            disabled={!summary.trim()}
            onClick={() =>
              confirm({
                title: "提交这一版交付？",
                okText: "提交交付",
                content: summary,
                onOk: () =>
                  command(async () => {
                    await researchApi("submit", {
                      params: { id: task.id },
                      body: {
                        expectedVersion: task.version,
                        summary,
                        artifactRefs: [],
                        sources: [],
                      },
                    });
                  }),
              })
            }
          >
            提交交付
          </Button>
        </div>
      )}
      {deliverables.map((delivery) => (
        <article key={delivery.id} className="rounded border p-3">
          <p>
            交付第 {delivery.revision} 版 ·{" "}
            {delivery.review?.decision === "accepted"
              ? "已验收"
              : delivery.review?.decision === "changes_requested"
              ? "要求修改"
              : "等待验收"}
          </p>
          <p className="whitespace-pre-wrap">{delivery.summary}</p>
          <p>材料：{delivery.artifactRefs.join("、") || "无"}</p>
          {delivery.review && (
            <p className="research-task-feedback">
              审阅意见：{delivery.review.comment}
            </p>
          )}
          {delivery.sources.map((source, i) => (
            <p className="text-xs" key={i}>
              {source.label}：{source.locator}
            </p>
          ))}
        </article>
      ))}
      {latest && allowed("review") && (
        <div>
          <Input.TextArea
            aria-label="验收意见"
            placeholder="填写验收意见"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
          />
          <Space>
            {(["accepted", "changes_requested"] as const).map((decision) => (
              <Button
                key={decision}
                loading={busy}
                disabled={!comment.trim()}
                onClick={() =>
                  confirm({
                    title:
                      decision === "accepted" ? "验收此交付？" : "要求修改此交付？",
                    okText: decision === "accepted" ? "确认验收" : "要求修改",
                    content: `第 ${latest.revision} 版：${comment}`,
                    onOk: () =>
                      command(() =>
                        researchApi("review", {
                          params: { id: latest.id },
                          body: {
                            expectedVersion: latest.version,
                            expectedTaskVersion: task.version,
                            revision: latest.revision,
                            decision,
                            comment,
                          },
                        }),
                      ),
                  })
                }
              >
                {decision === "accepted" ? "确认验收" : "要求修改"}
              </Button>
            ))}
          </Space>
        </div>
      )}
    </div>
  );
}
function RunDetails({
  runId,
  taskVersion,
  onChanged,
}: {
  runId: string;
  taskVersion: number;
  onChanged: () => Promise<void>;
}) {
  const { modal } = App.useApp();
  const { data, error, refresh } = useResearchRead(
    (signal) => researchApi("getRun", { params: { id: runId }, signal }),
    runId,
  );
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const operation = usePersonalOperation(true, `task-run:${runId}`);
  const inFlight = useRef(false);
  const dialog = useRef<ReturnType<typeof modal.confirm>>();
  useLayoutEffect(() => {
    setFailure("");
    setBusy(false);
    inFlight.current = false;
    return () => {
      dialog.current?.destroy();
      dialog.current = undefined;
    };
  }, [operation.scope]);
  if (!data)
    return (
      <Alert
        type="warning"
        message={error || "读取真实执行状态…"}
        action={error ? <Button onClick={refresh}>重新读取</Button> : undefined}
      />
    );
  const run = data.data;
  return (
    <article className="rounded border p-3">
      <p>
        AI 执行：{run.status} · {run.failure || "无失败记录"}
      </p>
      <p className="text-xs">
        输入：
        {run.inputs.map((input) => `${input.id}/版本${input.version}`).join("、") ||
          "无"}{" "}
        · 预算 {run.budget.maxTokens} tokens / {run.budget.maxSeconds} 秒
      </p>
      {run.candidate && (
        <>
          <strong>{run.candidate.title} · 待人工核对候选</strong>
          {run.candidate.items.map((item, i) => (
            <div key={i} className="my-2">
              <p>
                {item.requirement} ·{" "}
                {item.assessment === "gap" ? "证据缺口" : "输入支持"}
              </p>
              {item.citations.map((citation, j) => (
                <p key={j}>
                  {citation.artifactId}：“{citation.quote}”
                </p>
              ))}
              <p>{item.gap}</p>
            </div>
          ))}
          {run.candidate.limitations.map((line, i) => (
            <p key={i}>限制：{line}</p>
          ))}
        </>
      )}
      {failure && <Alert type="error" message={failure} />}
      {run.allowedActions.includes("submit_candidate") && (
        <Button
          type="primary"
          loading={busy}
          onClick={() => {
            const { isCurrent } = operation.capture();
            dialog.current = modal.confirm({
              title: "将已核对候选提交为交付？",
              okText: "提交候选交付",
              cancelText: "取消",
              content: "提交后仍由验收人决定是否通过；不会自动验收。",
              onOk: async () => {
                if (!isCurrent() || inFlight.current) return;
                inFlight.current = true;
                setBusy(true);
                setFailure("");
                try {
                  await researchApi("submitCandidate", {
                    params: { id: run.id },
                    body: {
                      expectedVersion: run.version,
                      expectedTaskVersion: taskVersion,
                    },
                  });
                  if (!isCurrent()) return;
                  await refresh();
                  if (isCurrent()) await onChanged();
                } catch (err) {
                  if (!isCurrent()) return;
                  setFailure(err instanceof Error ? err.message : "提交失败");
                  await refresh();
                } finally {
                  if (isCurrent()) {
                    setBusy(false);
                    inFlight.current = false;
                  }
                }
              },
            });
          }}
        >
          确认提交候选
        </Button>
      )}
    </article>
  );
}
