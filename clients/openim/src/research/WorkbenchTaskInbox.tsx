import { Alert, Button, Segmented } from "antd";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import { workspaceStatusLabel } from "./PersonalWorkDetail";
import { workbenchTaskPath } from "./workbench-links";
import "./workspace.scss";

export function WorkbenchTaskInbox() {
  const navigate = useNavigate();
  const [category, setCategory] = useState<"awaiting_me" | "ongoing">("awaiting_me");
  const read = useResearchRead(
    (signal) => researchApi("workbench", { query: { category, limit: 3 }, signal }),
    `assistant-workbench-inbox:${category}`,
  );
  return (
    <section className="workbench-task-inbox" aria-label="我的待办与助手安排">
      <header>
        <div>
          <h2>我的待办与助手安排</h2>
          <p>个人助手安排与科研任务都保存在工作台，结果需要明确验收。</p>
        </div>
        <Button onClick={() => navigate(`/workbench?view=tasks&category=${category}`)}>
          查看全部任务
        </Button>
      </header>
      <Segmented
        aria-label="助手任务范围"
        value={category}
        onChange={(value) => setCategory(value as typeof category)}
        options={[
          { value: "awaiting_me", label: "待我处理" },
          { value: "ongoing", label: "进行中" },
        ]}
      />
      {read.error ? (
        <Alert
          type="warning"
          message={read.error}
          action={<Button onClick={read.refresh}>重试读取任务</Button>}
        />
      ) : !read.data ? (
        <p role="status">正在读取工作台任务…</p>
      ) : !read.data.data.length ? (
        <p>
          {category === "awaiting_me"
            ? "当前没有待你确认、接受或验收的任务。"
            : "当前没有进行中的任务。"}
        </p>
      ) : (
        <div className="workbench-inbox-list">
          {read.data.data.map((card) => (
            <button
              className="workbench-inbox-row"
              key={card.id}
              onClick={() => {
                if (card.taskId)
                  navigate(
                    workbenchTaskPath(
                      card.taskId,
                      card.source === "research_task" ? "research" : "personal",
                    ),
                  );
              }}
              disabled={!card.taskId}
            >
              <strong>{card.title}</strong>
              <span>
                {card.source === "research_task" ? "科研任务" : "助手与联系人协作"} ·{" "}
                {workspaceStatusLabel[card.status] || card.progress.label}
              </span>
            </button>
          ))}
        </div>
      )}
      {read.data?.nextCursor && (
        <p className="workspace-muted">这里只展示最近 3 项，完整列表请打开工作台。</p>
      )}
    </section>
  );
}
