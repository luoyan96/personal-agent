import { Button } from "antd";
import {
  ArrowRightOutlined,
  ExperimentOutlined,
  FileTextOutlined,
  FormOutlined,
  PlusOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";

export type PlanningPreset = "reading" | "experiment" | "writing";
export const planningPrompts: Record<PlanningPreset, string> = {
  reading: "梳理一篇论文的研究框架",
  experiment: "设计并完成一轮实验",
  writing: "完成论文初稿与修订",
};

export function WorkbenchStart({
  hasTasks,
  onPlan,
}: {
  hasTasks: boolean;
  onPlan: (preset?: PlanningPreset) => void;
}) {
  const navigate = useNavigate();
  return (
    <>
      <section
        className={`workbench-start ${hasTasks ? "is-compact" : ""}`}
        aria-label="开始科研任务"
      >
        <div className="workbench-start-copy">
          <h2>{hasTasks ? "让研究继续向前" : "从一件具体的事开始"}</h2>
          <p>
            {hasTasks
              ? "先处理需要你的事，再跟进团队进展。"
              : "写下你的研究目标，一起拆解步骤、分工和交付。"}
          </p>
          <div className="workbench-start-actions">
            <Button type="primary" icon={<PlusOutlined />} onClick={() => onPlan()}>
              新建科研计划
            </Button>
            <Button type="link" onClick={() => navigate("/workbench?view=tasks")}>
              查看我的任务 <ArrowRightOutlined />
            </Button>
          </div>
        </div>
        <img
          src="/assets/acceptcat/research-desk.jpg"
          alt=""
          className="workbench-start-image"
        />
      </section>
      <nav className="workbench-research-shortcuts" aria-label="常见研究起点">
        <span>也可以从常见研究开始</span>
        <Button
          type="link"
          icon={<FileTextOutlined />}
          onClick={() => onPlan("reading")}
        >
          论文阅读 <ArrowRightOutlined />
        </Button>
        <Button
          type="link"
          icon={<ExperimentOutlined />}
          onClick={() => onPlan("experiment")}
        >
          实验推进 <ArrowRightOutlined />
        </Button>
        <Button type="link" icon={<FormOutlined />} onClick={() => onPlan("writing")}>
          论文写作 <ArrowRightOutlined />
        </Button>
      </nav>
    </>
  );
}
