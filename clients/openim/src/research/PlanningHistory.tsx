import { Alert, Button, Input, Segmented } from "antd";
import { useLayoutEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { useResearchStore } from "./store";
import { requestStateLabels } from "./task-planning";

export function PlanningHistory() {
  const [params, setParams] = useSearchParams();
  const actor = useResearchStore((s) => s.actor),
    generation = useResearchStore((s) => s.generation);
  const [status, setStatus] = useState<"draft" | "confirmed">("draft");
  const [pages, setPages] = useState<(string | undefined)[]>([undefined]);
  const [search, setSearch] = useState("");
  const read = useResearchRead(
    (signal) =>
      researchApi("plans", {
        query: { status, limit: 30, cursor: pages[pages.length - 1] },
        signal,
      }),
    `chat-plan-history:${status}:${pages.join()}`,
    !!actor,
  );
  const requests = useResearchRead(
    (signal) => researchApi("planningRequests", { query: { limit: 10 }, signal }),
    "chat-planning-request-history",
    !!actor,
  );
  useLayoutEffect(() => {
    setStatus("draft");
    setPages([undefined]);
    setSearch("");
  }, [generation]);
  return (
    <section className="planning-saved-history" aria-label="研究计划记录">
      <header>
        <div>
          <h2>研究计划</h2>
          <p>在下方和任务规划 Agent 沟通；已有方案可直接接着聊。</p>
        </div>
        <Segmented
          value={status}
          aria-label="计划分类"
          options={[
            { label: "草案", value: "draft" },
            { label: "已建立任务", value: "confirmed" },
          ]}
          onChange={(v) => {
            setStatus(v as typeof status);
            setPages([undefined]);
          }}
        />
      </header>
      {read.error && (
        <Alert
          type="warning"
          message={read.error}
          action={<Button onClick={read.refresh}>重读计划</Button>}
        />
      )}
      <details className="planning-history-details">
        <summary>
          已保存的{status === "draft" ? "草案" : "计划"}
          {read.data ? ` · 本页 ${read.data.data.length} 个` : ""}
        </summary>
        <Input
          placeholder="查找本页计划"
          aria-label="查找本页计划"
          allowClear
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="planning-saved-list">
          {read.data?.data
            .filter((p) => p.goal.includes(search))
            .map((p) => (
              <button
                key={p.id}
                aria-pressed={params.get("plan") === p.id}
                onClick={() => setParams({ view: "planning", plan: p.id })}
              >
                <strong>{p.goal}</strong>
                <span>{p.status === "draft" ? "继续对话调整" : "查看任务安排"}</span>
              </button>
            ))}
          {read.data && !read.data.data.length && (
            <p>
              还没有{status === "draft" ? "草案" : "已确认的计划"}
              。直接在下方说说想完成什么。
            </p>
          )}
        </div>
        {(pages.length > 1 || read.data?.nextCursor) && (
          <div>
            <Button
              disabled={pages.length === 1}
              onClick={() => setPages((p) => p.slice(0, -1))}
            >
              上一页
            </Button>
            <Button
              disabled={!read.data?.nextCursor}
              onClick={() => {
                if (read.data?.nextCursor)
                  setPages((p) => [...p, read.data!.nextCursor!]);
              }}
            >
              下一页
            </Button>
          </div>
        )}
      </details>
      <details className="planning-history-details">
        <summary>服务端 AI 生成记录</summary>
        {requests.error && (
          <p>
            {requests.error}
            <Button onClick={requests.refresh}>重试</Button>
          </p>
        )}
        {requests.data?.data.map((r) => (
          <button
            key={r.id}
            className="planning-request-link"
            onClick={() => setParams({ view: "planning", planning: r.id })}
          >
            {requestStateLabels[r.status]} ·{" "}
            {new Date(r.createdAt).toLocaleString("zh-CN")}
          </button>
        ))}
      </details>
    </section>
  );
}
