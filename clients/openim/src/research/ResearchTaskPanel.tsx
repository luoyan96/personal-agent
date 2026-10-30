import { Alert, App, Button, Input, Select, Space } from "antd";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { researchApi, supportsTaskHandoffs } from "./api";
import { useResearchRead } from "./useResearchRead";
import type { ResponseFor } from "@research-agent-platform/contracts";
import { usePersonalOperation } from "./usePersonalOperation";
import { useResearchStore } from "./store";
import { taskStateLabels, planDate } from "./task-planning";
import { teamNextStep } from "./research-team";
import { ResearchTeamAccountHint } from "./ResearchTeamAccountHint";
import { TaskArtifactDownload } from "./TaskArtifactDownload";
import { workbenchTaskPath } from "./workbench-links";

export function ResearchTaskPanel({
  taskId,
  onChanged,
  embedded,
}: {
  taskId: string;
  onChanged?: () => Promise<void>;
  /** Inside the task work page the goal and the next step already sit above. */
  embedded?: boolean;
}) {
  const { modal } = App.useApp();
  const navigate = useNavigate(),
    [params] = useSearchParams();
  const actor = useResearchStore((s) => s.actor);
  const { data, error, refresh } = useResearchRead(
    (signal) => researchApi("task", { params: { id: taskId }, signal }),
    taskId,
    !!actor,
  );
  const [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [summary, setSummary] = useState(""),
    [comment, setComment] = useState("");
  const [inviteId, setInviteId] = useState(""),
    [inviteScope, setInviteScope] = useState("");
  const [transferToMemberId, setTransferToMemberId] = useState(""),
    [transferScope, setTransferScope] = useState("");
  const [depState, setDepState] = useState<Record<string, { title: string; status?: string }>>({});
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
  const dependencyIds = JSON.stringify(data?.data && 'task' in data.data ? data.data.task.dependencies.map(dep => dep.taskId) : []);
  useEffect(() => {
    setDepState({});
    const controller = new AbortController(), { isCurrent } = operation.capture();
    void Promise.all((JSON.parse(dependencyIds) as string[]).map(async id => {
      try {
        const response = await researchApi('task', { params: { id }, signal: controller.signal });
        return [id, 'task' in response.data
          ? { title: response.data.task.title, status: response.data.task.status }
          : { title: response.data.title }] as const;
      } catch { return [id, { title: id }] as const; }
    })).then(pairs => {
      if (!controller.signal.aborted && isCurrent()) setDepState(Object.fromEntries(pairs));
    });
    return () => controller.abort();
  }, [operation.scope, dependencyIds]);
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
    setTransferToMemberId("");
    setTransferScope("");
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
  const command = async (run: () => Promise<unknown>, after?: () => void) => {
    if (inFlight.current) return;
    const { isCurrent } = operation.capture();
    if (!isCurrent()) return;
    inFlight.current = true;
    setBusy(true);
    setFailure("");
    try {
      await run();
      if (!isCurrent()) return;
      // 权限已被收回的动作（例如拒绝邀请）不能再刷新本任务，直接交给调用方跳走。
      if (after) { after(); return; }
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
        message={error || "正在打开任务…"}
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
        <p>先看看这项任务是否适合你。接受后即可查看本次获准的材料。</p>
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
                        ? "愿意按这个范围和时间接下任务吗？"
                        : "这次先不接这项任务？",
                    content: value.pendingInvitation?.scope,
                    okText: decision === "accepted" ? "接受任务" : "拒绝邀请",
                    onOk: () =>
                      command(
                        () =>
                          researchApi("invitationDecision", {
                            params: { id: value.pendingInvitation!.id },
                            body: {
                              expectedVersion: value.pendingInvitation!.version,
                              expectedTaskVersion: value.version,
                              decision,
                              comment: null,
                            },
                          }),
                        decision === "declined"
                          ? () => navigate("/workbench?view=tasks&taskKind=research")
                          : undefined,
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
  // 依赖不再是硬阻塞：只提示还有前置没完成，不阻挡先开始自己的人。
  const pendingPrerequisites = Object.values(depState).filter(
    (dep) => dep.status && !["completed", "cancelled"].includes(dep.status),
  ).length;
  return (
    <div className="research-task-detail space-y-3">
      <h3 className="text-base font-bold">{task.title}</h3>
      <div className="workspace-card-actions">
        {(params.get("task") !== task.id || params.get("taskKind") !== "research") && (
          <Button onClick={() => navigate(workbenchTaskPath(task.id, "research"))}>
            打开任务工作页
          </Button>
        )}
        {task.initiatorId === actor?.member.id &&
          params.get("plan") !== task.planId && (
            <Button
              onClick={() =>
                navigate(
                  `/workbench?${new URLSearchParams({
                    view: "planning",
                    plan: task.planId,
                  })}`,
                )
              }
            >
              查看所属计划
            </Button>
          )}
      </div>
      <p>
        {task.status === "completed" && latest?.review?.decision !== "accepted"
          ? "已结束 · 验收记录待核对"
          : taskStateLabels[task.status]}{" "}
        · 任务版本 {task.version}
      </p>
      {!embedded && (
        <>
          <p className="whitespace-pre-wrap">目标：{task.goal}</p>
          <p className="whitespace-pre-wrap">验收要求：{task.acceptanceCriteria}</p>
          <div className="research-task-next">
            <strong>下一步</strong>
            <p>{teamNextStep(task, actor?.member.id)}</p>
          </div>
        </>
      )}
      <p>
        负责人：{name(task.leadId)} · 审阅人：{name(task.reviewerId)}
      </p>
      <p>
        截止：{planDate(task.schedule.hardDeadline) || "未设置"}
        {task.schedule.hardDeadline && !task.schedule.hardDeadline.confirmed
          ? "（待确认）"
          : ""}
      </p>
      {pendingPrerequisites > 0 && (
        <p className="research-task-prerequisite-hint">
          有前置任务尚未完成，你可以先开始自己这部分。
        </p>
      )}
      <details>
        <summary>时间与依赖</summary>
        <p>承诺时间：{planDate(task.schedule.committed) || "未提供"}</p>
        <p>
          前置成果：
          {task.dependencies
            .map(
              (d) =>
                `${depState[d.taskId]?.title ?? d.taskId}${
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
          <p key={a.id}>
            已邀请 {name(a.memberId)}，待本人确认承接
            {allowed("cancel_invitation") && (
              <Button
                size="small"
                disabled={busy}
                onClick={() =>
                  confirm({
                    title: "撤销这次承接邀请？",
                    okText: "撤销邀请",
                    content: "对方将不能接受这次邀请。已有成果会保留，任务归属会随之更新。",
                    onOk: () =>
                      command(() =>
                        researchApi("cancelInvitation", {
                          params: { id: task.id },
                          body: { expectedVersion: task.version },
                        }),
                      ),
                  })
                }
              >
                撤销邀请
              </Button>
            )}
          </p>
        ))}
      {assignments
        .filter((a) => a.status === "declined")
        .map((a) => (
          <p key={a.id}>已拒绝：{name(a.memberId)}</p>
        ))}
      {allowed("invite") && (
        <details className="research-task-operation">
          <summary>邀请成员承接</summary>
          <ResearchTeamAccountHint />
          <Select
            aria-label="承接成员"
            placeholder="选择本实验室成员"
            value={inviteId || undefined}
            options={(members.data?.data || []).filter(m => m.id !== actor?.member.id).map((m) => ({
              value: m.id,
              label: m.displayName,
            }))}
            onChange={setInviteId}
            disabled={busy}
          />
          <Input.TextArea
            aria-label="承接范围"
            placeholder="想请对方帮哪一步？可以在任务说明的基础上补充。"
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
                content: "邀请会发给这位成员，由对方决定是否接下任务。",
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
      {allowed("withdraw") && !supportsTaskHandoffs() && <Alert type="info" message="当前后台还未支持任务转交，请联系课题组维护者更新服务。" />}
      {allowed("withdraw") && supportsTaskHandoffs() && (
        <details className="research-task-operation">
          <summary>转交任务</summary>
          <ResearchTeamAccountHint />
          <Select
            aria-label="承接成员"
            placeholder="选择转交的成员"
            value={transferToMemberId || undefined}
            options={(members.data?.data || []).filter(m => m.id !== actor?.member.id).map((m) => ({
              value: m.id,
              label: m.displayName,
            }))}
            onChange={setTransferToMemberId}
            disabled={busy}
          />
          <Input.TextArea
            aria-label="剩余范围"
            placeholder="转交后由对方完成的范围"
            value={transferScope}
            onChange={(e) => setTransferScope(e.target.value)}
            maxLength={8000}
            disabled={busy}
          />
          <Button
            disabled={busy || !transferToMemberId || !transferScope.trim()}
            onClick={() =>
              confirm({
                title: "转交任务？",
                okText: "转交任务",
                content: "任务将转给这位成员，由对方决定是否承接。对方接受前可以撤销。",
                onOk: () =>
                  command(() =>
                    researchApi("withdraw", {
                      params: { id: task.id },
                      body: {
                        expectedVersion: task.version,
                        transferToMemberId: transferToMemberId,
                        remainingScope: transferScope.trim(),
                        reason: "转交任务",
                      },
                    }),
                  ),
              })
            }
          >
            转交任务
          </Button>
        </details>
      )}
      {failure && <Alert type="error" message={failure} />}
      {allowed("start") && !embedded && (
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
          开始这一步
        </Button>
      )}
      {artifacts?.map((artifact) => (
        <TaskArtifactDownload key={artifact.id} artifact={artifact} />
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
            placeholder="说说这一版做了什么、主要结果和还没解决的问题。"
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
            placeholder="哪些已达到要求？若需修改，指出最关键的问题和建议。"
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
