import { Alert, Button, Modal } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { useState } from "react";
import type { ResearchReadReceipt } from "@research-agent-platform/contracts";
import { researchApi } from "./api";
import { useResearchRead } from "./useResearchRead";
import "./research-read.scss";

export function ResearchReadSummary({ read }: { read: ResearchReadReceipt }) {
  const [selected, setSelected] = useState<string>();
  const source = read.sources.find((item) => item.label === selected);
  const citation = source?.citation;
  const excerpt = useResearchRead(
    (signal) => researchApi("researchFileExcerpt", {
      params: { id: citation!.sourceId },
      query: { version: citation!.version, pageNumber: citation!.pageNumber, start: citation!.start, end: citation!.end }, signal,
    }),
    citation ? `research-citation:${citation.sourceId}:${citation.version}:${citation.pageNumber}:${citation.start}:${citation.end}` : "research-citation:none",
    !!citation,
  );
  return <div className="research-read-summary">
    <details>
      <summary><FileTextOutlined /> {read.sources.length ? `参考了 ${read.sources.length} 段资料` : read.status === "no_match" ? "资料库中未找到匹配文字" : "本次预算不足以加入资料片段"}</summary>
      <p>{read.retrieval === "overview" ? "本次读取了绑定资料的部分开头文字。" : "本次按问题检索了绑定资料。"} {read.sources.length ? "点击来源核对原文。" : "可以补充关键词或指定要阅读的资料。"}</p>
      {read.omittedSources > 0 && <p>另有 {read.omittedSources} 段未进入本次上下文。</p>}
      <div className="research-read-sources">
        {read.sources.map((item) => <Button key={item.label} size="small" onClick={() => setSelected(item.label)}>
          [{item.label}] {item.filename} · 第 {item.citation.pageNumber} 页
        </Button>)}
      </div>
    </details>
    <Modal open={!!source} title={source ? `[${source.label}] ${source.filename}` : "资料原文"} onCancel={() => setSelected(undefined)} footer={<Button onClick={() => setSelected(undefined)}>关闭</Button>} width={720} destroyOnClose>
      {citation && <p className="research-read-caption">第 {citation.pageNumber} 页 · 文件 v{citation.version} · 字符 {citation.start + 1}–{citation.end}</p>}
      {excerpt.error && <Alert type="warning" message={excerpt.error} action={<Button onClick={() => void excerpt.refresh()}>重新读取</Button>} />}
      {!excerpt.data && !excerpt.error && <p role="status">正在读取原文…</p>}
      {excerpt.data && <blockquote className="research-read-excerpt">{excerpt.data.data.text}</blockquote>}
      {excerpt.data && <p className="research-read-caption">这里显示的是本次提供给 Agent 的原文片段；回答中的结论仍需结合原文核对。</p>}
    </Modal>
  </div>;
}
