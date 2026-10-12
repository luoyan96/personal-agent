import type { ResearchCategory } from "./capability-center";

export type CommunityResearchEntry = {
  id: string;
  name: string;
  category: ResearchCategory;
  author: string;
  summary: string;
  input: string;
  deliverables: string;
  prerequisites: string;
  costs: string;
  materials: string;
  limitations: string;
  validation: string;
  status: "offline_reviewed" | "needs_connector";
  version: string;
  reviewedAt: string;
  license: string;
  repository: string;
  revision: string;
  sourcePath: string;
  installable: boolean;
  localMetadataAdapter?: boolean;
  discussions: readonly { label: string; url: string }[];
};

// Public source descriptions only. No credentials, personal materials or upstream
// skill bodies are bundled here; installation still requires the user's review.
export const communityResearchCatalog: readonly CommunityResearchEntry[] = [
  {
    id: "scientific-writing",
    name: "科研稿件与引用检查",
    category: "写作与表达",
    author: "K-Dense Inc. / K-Dense-AI",
    repository: "https://github.com/K-Dense-AI/claude-scientific-writer",
    revision: "529b9f73ab4b48925027145800d7b49e96ccfd3c",
    sourcePath: "skills/scientific-writing",
    version: "Skill 2.1 · Writer 2.22.0",
    reviewedAt: "2026-10-12",
    license: "MIT",
    status: "offline_reviewed",
    installable: true,
    summary: "把稿件、研究主张和证据来源对齐，检查引用标识、重复项与待补内容。",
    input: "Markdown 稿件、来源清单 JSON，或需要讨论的稿件片段。",
    deliverables: "问题清单与位置、来源记录和修改建议；离线脚本可输出 JSON 检查报告。",
    prerequisites:
      "文字讨论使用你的已配置模型；离线脚本需 Python 3.11+。AcceptCat 尚未接通脚本执行。",
    costs:
      "离线检查无需 API Key；聊天按你的模型服务计费。完整上游 Writer 另需 Anthropic、Parallel 等服务，不随安装接通。",
    materials:
      "提供本次获准使用的稿件、来源元数据与已核对证据；可选期刊要求。无需导入整个私人文献库。",
    validation:
      "固定修订的离线引用与稿件检查已用合成资料验证：重复 DOI、无效 DOI、占位符和正常输入。未验证真实模型写作质量。",
    limitations:
      "脚本只检查本地结构与标识，不联网解析 DOI，也不证明论文存在或主张有依据。中文题名去重和中文措辞检查覆盖不足，仍需人工核对。",
    discussions: [],
  },
  {
    id: "zotero-mcp",
    name: "Zotero 文献库连接器",
    category: "文献与阅读",
    author: "54yyyu",
    repository: "https://github.com/54yyyu/zotero-mcp",
    revision: "0faf1b25c4b9bb95e2571bc8af60b62e9ce10e24",
    sourcePath: "src/zotero_mcp/skills/zotero-cli",
    version: "0.14.1",
    reviewedAt: "2026-10-12",
    license: "服务 MIT；Zotero Agent 插件 AGPL-3.0-or-later",
    status: "needs_connector",
    installable: false,
    localMetadataAdapter: true,
    summary: "从已有 Zotero 库检索条目与阅读材料，保留文献管理工具中的来源关系。",
    input: "本机 Zotero 文献库及检索问题；本地 API 或按需配置的 Web API。",
    deliverables:
      "文献条目、元数据和实际读取文本；原工具也支持编辑与批注，需另行授权。",
    prerequisites:
      "AcceptCat 原生本机元数据选入需打开 Zotero 并启用本地 API，无需 Python 或 MCP。上游高级检索、全文与编辑仍需 Python 3.10+ 和 MCP/CLI，尚未接通。",
    costs:
      "本地检索不要求模型 API Key；语义检索可用本地或收费的嵌入服务，聊天模型另计。",
    materials:
      "本机选入仅访问个人库的集合、标题、作者与摘要。用户勾选、预览后确认导入本人私人集合；不读取 PDF、批注或团队库。",
    validation:
      "已静态核对固定修订、文档、依赖和分模块许可；本机元数据适配用隔离合成 API 验证。尚未连接用户真实 Zotero 库或验证上游 MCP。",
    limitations:
      "仅元数据与摘要，不是论文全文阅读、语义检索或自主工具调用。上游 Windows 插件和 CLI 问题尚未复验；AcceptCat 读取失败显示错误，不伪装空结果。关闭窗口结束本次许可，导入结果不确定时留在窗口重试原请求。",
    discussions: [
      {
        label: "Windows 插件兼容性报告 #700",
        url: "https://github.com/54yyyu/zotero-mcp/issues/700",
      },
      {
        label: "失败搜索与空结果报告 #701",
        url: "https://github.com/54yyyu/zotero-mcp/issues/701",
      },
    ],
  },
];

export function communitySourceUrl(entry: CommunityResearchEntry) {
  return `${entry.repository}/tree/${entry.revision}/${entry.sourcePath}`;
}
export function communityEntry(id: string | undefined | null) {
  return communityResearchCatalog.find((entry) => entry.id === id);
}
export function matchingCommunityEntries(category: ResearchCategory, search: string) {
  const query = search.trim().toLocaleLowerCase();
  return communityResearchCatalog.filter(
    (entry) =>
      (category === "全部" || category === entry.category) &&
      [entry.name, entry.author, entry.summary, entry.input, entry.category, entry.id]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
  );
}
