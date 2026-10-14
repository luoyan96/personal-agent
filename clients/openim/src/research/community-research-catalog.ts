import type { ResearchCategory } from "./capability-center";
import { communityFeedCopy } from "./capability-feed-copy";

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
    id: "peer-review",
    name: "研究主张与证据审查",
    category: "写作与表达",
    author: "K-Dense Inc. / K-Dense-AI",
    repository: "https://github.com/K-Dense-AI/claude-scientific-writer",
    revision: "529b9f73ab4b48925027145800d7b49e96ccfd3c",
    sourcePath: "skills/peer-review",
    version: "Skill 2.2 · Writer 2.22.0",
    reviewedAt: "2026-10-14",
    license: "MIT",
    status: "offline_reviewed",
    installable: true,
    summary:
      "为课题组预审稿件、研究方案和审稿回复整理证据缺口、方法问题与可执行修改建议。",
    input: "获准使用的稿件或研究方案、主张—证据 CSV、参考文献清单和目标期刊要求。",
    deliverables:
      "结构化审查草稿、证据缺口与修改清单；离线工具可输出报告规范、引用一致性及审稿意见结构检查。",
    prerequisites:
      "文字流程可经确认安装为私人 Skill；聊天使用你的已配置模型。8 个离线 Python 脚本需 Python 3.11+ 标准库，AcceptCat 尚未接通自动执行。",
    costs:
      "离线脚本无需模型、网络服务或 API Key；文字讨论按配置的模型服务计费，不要求安装完整 Writer。",
    materials:
      "只提供本次获准使用的稿件、补充材料、图表位置、已核对证据与期刊政策；安装保留 6 份参考说明、9 份模板及根 MIT 许可，不自动导入资料库。",
    validation:
      "固定版本 25 个原件与独立下载逐一核对，私人原件存储往返通过。14 个合成离线样例验证无证据主张、重复编号、报告规范、引用缺失、意见结构和待填草稿；未验证真实模型审稿质量。",
    limitations:
      "工具验证结构与用户声明，不判断证据真伪或论文价值。中文语气词检查不覆盖，不能承诺自动发现中文不当措辞。现有聊天可能使用云模型，保密审稿材料须先核对期刊工具政策与授权；安装不等于本机保密审稿、自动执行或编辑决定。",
    discussions: [],
  },
  {
    id: "paperqa2",
    name: "PaperQA2 文献证据问答",
    category: "文献与阅读",
    author: "FutureHouse / Future-House",
    repository: "https://github.com/Future-House/paper-qa",
    revision: "57e89f7223b0960d5ee5ea048c69e3c47e088572",
    sourcePath: "src/paperqa",
    version: "源码快照 57e89f7（发行版本动态生成）",
    reviewedAt: "2026-10-14",
    license: "Apache-2.0",
    status: "needs_connector",
    installable: false,
    summary:
      "面向指定文献集合建立索引，检索证据片段并生成带引用的回答；收录为资料库问答适配候选。",
    input: "明确授权的 PDF 或文本集合、研究问题及可追溯的文献元数据。",
    deliverables:
      "来源片段、引用关系和回答；应保存实际检索范围、无法支持的主张与复核记录。",
    prerequisites:
      "Python 3.11+、fhlmi / fhaviary 模型适配、嵌入服务、Tantivy 索引及 PDF 解析依赖；本地嵌入另需 sentence-transformers。不是直接可装的 SKILL.md，AcceptCat 尚无运行时连接。",
    costs:
      "云端生成与嵌入按所选供应商计费；本地模型需要计算资源。启用 Crossref / Semantic Scholar / Unpaywall 元数据访问时还需核对服务限制及网络可达性。",
    materials:
      "拟绑定的个人或团队获准文献集合、原文、页码/片段映射和来源元数据；后续适配须从明确授权的原件重建索引并隔离账号与集合权限，不接受社区预建索引。",
    validation:
      "核对固定提交的许可证、Python 依赖、设置和索引源码，并静态解析 Python / TOML。未安装依赖、建立真实索引、调用模型或验证中文文献问答；不标为可直接使用。",
    limitations:
      "固定源码仍含 pickle 索引反序列化，不能导入不可信预建索引；上游也有文件失败后跳过、本地模型索引失败的实际报告。接入前需完成索引格式、权限、失败恢复、费用控制与中文引用质量验证；生成引用本身不证明主张有依据。",
    discussions: [
      {
        label: "持久索引反序列化问题 #1325",
        url: "https://github.com/Future-House/paper-qa/issues/1325",
      },
      {
        label: "失败文件再次索引被跳过 #1355",
        url: "https://github.com/Future-House/paper-qa/issues/1355",
      },
      {
        label: "本地模型索引兼容性 #1321",
        url: "https://github.com/Future-House/paper-qa/issues/1321",
      },
    ],
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
      [
        entry.name,
        entry.author,
        entry.summary,
        entry.input,
        entry.category,
        entry.id,
        communityFeedCopy[entry.id]?.title,
        communityFeedCopy[entry.id]?.outcomes,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query),
  );
}
