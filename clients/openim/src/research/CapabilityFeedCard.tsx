import {
  ArrowDownOutlined,
  ArrowRightOutlined,
  CheckOutlined,
} from "@ant-design/icons";
import type { ReactNode } from "react";

export function CapabilityFeedCard({
  title,
  outcomes,
  name,
  status,
  icon,
  preview,
  onOpen,
  selected = false,
  openLabel,
  metadata,
}: {
  title: string;
  outcomes: string;
  name: string;
  status: string;
  icon: ReactNode;
  preview: ReactNode;
  onOpen: () => void;
  selected?: boolean;
  openLabel?: string;
  metadata?: ReactNode;
}) {
  return (
    <article className="capability-feed-card">
      <button
        type="button"
        className="capability-feed-open"
        aria-label={openLabel || `查看${name}用法`}
        aria-pressed={selected}
        onClick={onOpen}
      >
        {preview}
        <div className="capability-feed-caption">
          <h3>{title}</h3>
          <p className="capability-feed-outcomes">{outcomes}</p>
          <div className="capability-feed-author">
            <span className="capability-feed-avatar">{icon}</span>
            <span>
              <strong>{name}</strong>
              <small>{status}</small>
            </span>
          </div>
          <span className="capability-feed-action">
            查看用法 <ArrowRightOutlined />
          </span>
          {metadata}
        </div>
      </button>
    </article>
  );
}

function ExampleList({
  items,
  numbered = false,
}: {
  items: readonly string[];
  numbered?: boolean;
}) {
  return (
    <ol className="capability-example-list">
      {items.map((item, index) => (
        <li key={item}>
          <span className="capability-example-mark">
            {numbered ? index + 1 : <CheckOutlined />}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ol>
  );
}

export function CapabilityOutcomePreview({ id }: { id: string }) {
  const pending = id === "paperqa2",
    adapter = id === "zotero-mcp";
  const tone =
    (
      {
        "literature-reading": "paper",
        "paper-revision": "lilac",
        "research-planning": "sage",
        "figure-planning": "blue",
        "data-reproduction": "mint",
        "lab-meeting": "paper",
        "scientific-writing": "blue",
        "peer-review": "lilac",
        paperqa2: "sage",
        "zotero-mcp": "paper",
      } as Record<string, string>
    )[id] || "blue";
  const heading = (
    {
      "literature-reading": "一篇论文，读出四个关键点",
      "paper-revision": "让论文表达更清楚",
      "research-planning": "把想法变成可讨论的方案",
      "figure-planning": "先理清图里要讲什么",
      "data-reproduction": "分析前，先检查数据与方法",
      "lab-meeting": "进展、问题和下一步",
      "scientific-writing": "投稿前，先做这些检查",
      "peer-review": "把研究主张与证据对齐",
      paperqa2: "从文献中找到回答的依据",
      "zotero-mcp": "你选哪篇，就导入哪篇",
    } as Record<string, string>
  )[id];
  return (
    <div
      className={`capability-outcome-preview preview-${tone}`}
      aria-label={`${
        pending ? "接入方案" : adapter ? "选入流程" : "示例输出"
      }：${heading}`}
    >
      <span className="capability-preview-label">
        {pending ? "接入方案 · 待接入" : adapter ? "选入流程示意" : "示例输出"}
      </span>
      <h4>
        {id === "literature-reading" ? (
          <>
            一篇论文，
            <br />
            读出四个关键点
          </>
        ) : (
          heading
        )}
      </h4>
      {id === "literature-reading" && (
        <div className="capability-paper-example">
          <div className="capability-paper-lines" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
          <ExampleList numbered items={["研究问题", "方法", "结果", "局限"]} />
        </div>
      )}
      {id === "paper-revision" && (
        <div className="capability-revision-example">
          <b>修改前</b>
          <p>为了评估方法性能，我们进行了对照实验。</p>
          <ArrowDownOutlined />
          <b>修改后</b>
          <p className="revision-after">我们通过对照实验评估方法性能。</p>
          <small>保留事实，解释每处关键改动。</small>
        </div>
      )}
      {(id === "research-planning" || pending) && (
        <div className="capability-plan-example">
          {(pending
            ? [
                ["文献集合", "明确检索范围"],
                ["证据片段", "保留原文与来源"],
                ["回答与引用", "标记无法支持的主张"],
              ]
            : [
                ["研究问题", "我们想解决什么？"],
                ["方法与步骤", "怎么做？"],
                ["检查标准", "如何判断成功？"],
              ]
          ).map(([title, subtitle], i) => (
            <div key={title}>
              {i > 0 && <ArrowDownOutlined />}
              <div>
                <b>{title}</b>
                <small>{subtitle}</small>
              </div>
            </div>
          ))}
        </div>
      )}
      {id === "figure-planning" && (
        <div className="capability-figure-example">
          <div className="capability-figure-flow">
            {["输入", "方法", "输出"].map((label, i) => (
              <span key={label}>
                {i > 0 && <ArrowRightOutlined />}
                <b>
                  {label}
                  <small>{["数据 / 对象", "处理 / 分析", "结果 / 结论"][i]}</small>
                </b>
              </span>
            ))}
          </div>
          <p>
            <b>图注草稿</b>
            <span>展示从输入到输出的整体流程，用于说明研究的方法思路。</span>
          </p>
        </div>
      )}
      {id === "data-reproduction" && (
        <ExampleList
          items={[
            "数据格式是否正确？",
            "是否存在缺失值？",
            "变量含义是否清晰？",
            "分析方法是否匹配研究问题？",
          ]}
        />
      )}
      {id === "lab-meeting" && (
        <ExampleList
          numbered
          items={[
            "本期进展与实际结果",
            "受阻情况和待讨论问题",
            "下一步计划",
            "需要支持的条件",
          ]}
        />
      )}
      {id === "scientific-writing" && (
        <ExampleList
          items={[
            "研究主张对应哪些来源？",
            "引用标识是否一致？",
            "是否存在重复条目？",
            "还有哪些内容需要补充？",
          ]}
        />
      )}
      {id === "peer-review" && (
        <div className="capability-evidence-example">
          <div>
            <b>研究主张</b>
            <span>作者希望读者相信什么？</span>
          </div>
          <ArrowDownOutlined />
          <div>
            <b>对应证据</b>
            <span>材料是否支持这个结论？</span>
          </div>
          <p>标出缺口，整理可执行的修改建议。</p>
        </div>
      )}
      {adapter && (
        <div className="capability-zotero-example">
          <span className="capability-zotero-wordmark">Zotero</span>
          <ExampleList
            numbered
            items={[
              "选择自己的文献条目",
              "预览标题、作者与摘要",
              "确认导入私人资料集合",
            ]}
          />
          <small>仅元数据与摘要</small>
        </div>
      )}
    </div>
  );
}
