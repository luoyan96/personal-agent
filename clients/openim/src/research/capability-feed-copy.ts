// Discovery headlines and sample formats only. Actual profiles and source
// requirements remain in agentStarterProfiles / community-research-catalog.
export const starterFeedCopy: Record<string, { title: string; outcomes: string }> = {
  "literature-reading": {
    title: "论文太多，先读懂这一篇",
    outcomes: "研究问题 · 方法梳理 · 局限清单",
  },
  "paper-revision": { title: "让论文表达更清楚", outcomes: "修改稿 · 改动理由" },
  "research-planning": {
    title: "有个想法，下一步怎么研究",
    outcomes: "研究路径 · 实施步骤 · 风险清单",
  },
  "figure-planning": { title: "画图之前，先理清逻辑", outcomes: "布局构思 · 图注草稿" },
  "data-reproduction": {
    title: "分析数据前，先过一遍清单",
    outcomes: "数据检查建议 · 复现步骤",
  },
  "lab-meeting": {
    title: "让组会更聚焦、更高效",
    outcomes: "汇报提纲 · 待讨论问题 · 下一步",
  },
};

export const communityFeedCopy: Record<string, { title: string; outcomes: string }> = {
  "scientific-writing": {
    title: "投稿前，先做这些检查",
    outcomes: "稿件问题清单 · 引用标识检查",
  },
  "peer-review": {
    title: "这条研究主张，证据够不够",
    outcomes: "证据缺口 · 方法问题 · 修改建议",
  },
  paperqa2: {
    title: "带着问题，寻找文献里的证据",
    outcomes: "文献索引与引用问答 · 待接入",
  },
  "zotero-mcp": {
    title: "把 Zotero 文献带进资料库",
    outcomes: "选择条目 · 预览摘要 · 确认导入",
  },
};
