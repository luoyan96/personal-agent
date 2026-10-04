import { Alert, Button, Input, Modal, Space } from "antd";
import { useState } from "react";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import type { ResponseFor } from "@research-agent-platform/contracts";

export function ResearchTaskPanel({ taskId }: { taskId: string }) {
  const { data, error, refresh } = useResearchRead(
    () => researchApi("task", { params: { id: taskId } }),
    taskId,
  );
  const [failure, setFailure] = useState(""),
    [busy, setBusy] = useState(false),
    [summary, setSummary] = useState(""),
    [comment, setComment] = useState("");
  const command = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setFailure("");
    try {
      await run();
      await refresh();
    } catch (err) {
      setFailure(err instanceof Error ? err.message : "操作失败");
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <Alert type={error ? "error" : "info"} message={error || "读取当前获准任务…"} />
    );
  const value = data.data;
  if (!("task" in value))
    return (
      <div className="space-y-3">
        <h3>{value.title}</h3>
        <p>{value.summary}</p>
        <p>交付：{value.deliverable}</p>
        <p>验收：{value.acceptanceCriteria}</p>
        <pre className="whitespace-pre-wrap text-xs">
          {JSON.stringify(value.schedule, null, 2)}
        </pre>
        {failure && <Alert type="error" message={failure} />}
        <Space>
          {value.pendingInvitation &&
            value.allowedActions.includes("decide") &&
            (["accepted", "declined"] as const).map((decision) => (
              <Button
                key={decision}
                loading={busy}
                onClick={() =>
                  Modal.confirm({
                    title:
                      decision === "accepted"
                        ? "接受此任务范围与时间？"
                        : "拒绝任务邀请？",
                    content: value.pendingInvitation?.scope,
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
    <div className="space-y-3">
      <h3 className="text-base font-bold">{task.title}</h3>
      <p>
        状态：{task.status} · 版本 {task.version}
      </p>
      <p className="whitespace-pre-wrap">目标：{task.goal}</p>
      <p className="whitespace-pre-wrap">验收要求：{task.acceptanceCriteria}</p>
      <details>
        <summary>时间与依赖</summary>
        <pre className="whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(
            { schedule: task.schedule, dependencies: task.dependencies },
            null,
            2,
          )}
        </pre>
      </details>
      <p>
        真实承接：
        {assignments
          .filter((a) => a.status === "accepted")
          .map((a) => `${a.memberId || a.capability?.id} · ${a.commitment?.scope}`)
          .join("；") || "尚无已接受承接"}
      </p>
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
              Modal.confirm({
                title: "提交这一版交付？",
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
                    setSummary("");
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
            交付第 {delivery.revision} 版 · {delivery.review?.decision || "等待验收"}
          </p>
          <p className="whitespace-pre-wrap">{delivery.summary}</p>
          <p>材料：{delivery.artifactRefs.join("、") || "无"}</p>
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
                  Modal.confirm({
                    title:
                      decision === "accepted" ? "验收此交付？" : "要求修改此交付？",
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
  const { data, error, refresh } = useResearchRead(
    () => researchApi("getRun", { params: { id: runId } }),
    runId,
  );
  const [failure, setFailure] = useState("");
  if (!data) return <Alert type="warning" message={error || "读取真实执行状态…"} />;
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
          onClick={() =>
            Modal.confirm({
              title: "将已核对候选提交为交付？",
              content: "提交后仍由验收人决定是否通过；不会自动验收。",
              onOk: async () => {
                try {
                  await researchApi("submitCandidate", {
                    params: { id: run.id },
                    body: {
                      expectedVersion: run.version,
                      expectedTaskVersion: taskVersion,
                    },
                  });
                  await refresh();
                  await onChanged();
                } catch (err) {
                  setFailure(err instanceof Error ? err.message : "提交失败");
                  await refresh();
                }
              },
            })
          }
        >
          确认提交候选
        </Button>
      )}
    </article>
  );
}
