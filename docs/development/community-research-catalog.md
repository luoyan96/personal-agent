# 社区科研工具首批收录（2026-10-12）

`acceptcat-3` 定时任务，基于 `feature/research-capability-center` 的 `ffb406ed86e4907ea465ba5208404e91a360653e`，独立分支 `feature/community-research-catalog`。只改 React/Electron 客户端、客户端测试与说明，不改共享契约、API、worker、数据库、依赖、版本号或 `agents/skills`。

## 实际入口

广场“发现能力”新增“社区科研工具”，支持原来的分类与搜索。它展示公开来源与接入条件，不生成虚构联系人、完成数或质量评分。详情包括用途、输入、交付、知识库/素材要求、费用、依赖、维护者、分模块许可、固定修订、验证范围和限制。长详情在窗口内滚动，标题和关闭入口保持可见。

科研稿件条目可以进入工作台“我的技能”，预填审阅过的固定提交/子目录。页面打开不下载、不安装。用户主动检查版本、选择目录、查看预览，再确认私人安装；取消不提交。沿用原来的账号/页面世代守卫、服务器权限、版本流程和原件保存失败重试。

新安装按既有服务器规则默认 enabled=true、listed=false，绑定Agent、调用授权与源码授权均为空。启用不代表脚本接通；用户需绑定或选用获准的文字流程。原件不会因公开名称、技能授权或Agent公开而共享。未知catalog ID和待连接条目不触发安装预填。

目录 `clients/openim/src/research/community-research-catalog.ts` 只存中文审阅元数据，没有复制上游正文。外部Skill经原私人安装流程保存，`agents/skills`仍是项目内置内容的唯一来源。

## 原始来源与筛选

| 条目 | 来源、维护与许可证 | 输入、费用与实际状态 |
| --- | --- | --- |
| 科研稿件与引用检查 | [K-Dense-AI/claude-scientific-writer](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/scientific-writing)，`529b9f73ab4b48925027145800d7b49e96ccfd3c`。作者K-Dense Inc.；Skill metadata.version=2.1、Writer2.22.0；根许可及选定Skill为MIT。主提交2026-09-29、仓库push2026-10-09，未归档。 | Markdown稿件、来源清单JSON和核对过的证据，可选期刊要求；无需整个私人文献库。离线脚本Python3.11+/标准库，无模型Key；聊天按本人配置模型计费。完整Writer另需Anthropic/Parallel等服务，不随单Skill安装接通。**离线样例已验证，文字说明可安装，自动执行待接入。** |
| Zotero文献库连接器 | [54yyyu/zotero-mcp](https://github.com/54yyyu/zotero-mcp/tree/0faf1b25c4b9bb95e2571bc8af60b62e9ce10e24)，`0faf1b25c4b9bb95e2571bc8af60b62e9ce10e24`，0.14.1于2026-10-08提交，未归档。作者54yyyu。服务根许可MIT，Zotero Agent插件AGPL-3.0-or-later，pyproject声明整包MIT AND AGPL-3.0-or-later；不能把整项目标为MIT。 | Python3.10+、Zotero7+及本地API/MCP/CLI；依赖含pyzotero、pdf-inspector、FastMCP等。本地检索无模型Key；语义检索可用本地或收费嵌入服务。需用户明确选定库、集合和论文原件，未来先接只读。**待连接，不可调用，不开放安装。** |

阅读原仓库、固定README、LICENSE/pyproject/SKILL.md/references及相关脚本；把上游内容当作审阅数据，不作为本轮任务指令。Zotero社区实际线索：[Windows插件检测报告#700](https://github.com/54yyyu/zotero-mcp/issues/700)、[CLI失败搜索变成空结果/全文截断报告#701](https://github.com/54yyyu/zotero-mcp/issues/701)。前者针对插件检测，不表示整个Windows Python/MCP方案失败。**本机未复现报告，未连接真实文献库**，不声称这些问题已确认或已修复。

用户已有paper-framework-figure-studio-pro未重复收录；177项scientific-agent-skills未整包导入，避免混合许可证和未经验证依赖进入可用目录。

## 原生安装修复

1. 接受`tree/<完整40位SHA>/<技能目录>`，拒绝tree/main、部分SHA与路径逃逸；原根仓库/根ZIP流程保留。
2. 固定目录使用有上限的官方raw SKILL.md探针，再由官方codeload下载固定原包，无需发现HEAD。首次真实GitHub API探针403保留，改用固定raw成功；未固定根地址仍需GitHub API，不声称解决所有网络/限流。
3. 完整ZIP先检查路径、重复、符号链接和8,000文件/100MB元数据限制，再选择目录。祖先LICENSE/NOTICE/COPYING保留在`_upstream-notices/`，不进入模型references；完整ZIP仍仅存本机。
4. 修正AdmZip属性：`header.fileAttr`仅为权限低位，原符号链接判断读取错误；改读完整`header.attr`，新增真实ZIP外部属性回归，未选目录里的链接也拒绝。
5. 不执行包内脚本、不安装依赖、不调用外部模型，不因目录收录获得私有材料权限。上游metadata.version在既有安装器显示“未标注”，目录另显示审阅的Skill2.1和固定SHA，没有静默改写原文/共享解析器。

## 实际验证

Git外证据：`D:/deepseek-agent/.runtime/community-research-catalog-20261012`。

- 官方固定Writer34份/Zotero8份资料，URL、字节数、SHA256见`source-downloads.json`。没有并入Git。
- Writer真实固定ZIP **9,893,431字节**，SHA256 `71ac931d618219cc1df8764483d3787925da9887f9f2edbdd6210d3661eb5859`。选中32原件：SKILL.md、12参考、9脚本、9素材和1根许可。32项与独立raw下载匹配，真实importer/store逐字节往返及完整ZIP一致，见`source-import-proof.json`。只证明导入/保存，不证明脚本运行或模型质量。
- 静态审阅离线脚本及`_common.py`/`validate_manifest.py`后，Python3.12.14执行 **8项合成检查**：正常未核验来源、重复DOI、无效DOI、人工核验门槛、中文纯题名去重缺口、正常稿件、占位符、空稿件；JSON/退出码核对。没有联网解析DOI，正常结构不代表论文存在。确认中文题名被正则忽略，英文措辞检查不能冒充中文稿件质量评估。见`offline-results.json`。
- 新客户端6项固定来源/目录/归档边界/过滤/IPC检查最终通过；原编译导入3项通过。既有4项素材/桥接回归曾通过；首次联合报告因新增夹具错误失败，不称该报告全通过，不重复已经通过的网络大包检查。
- 最终客户端`tsc --noEmit`、`node scripts/build-web.mjs`、四固定SDK资源核验通过。未改共享代码/内置Skill，按AGENTS不重跑根共享CI。
- Browser plugin not available；使用已安装Edge的隔离headless Playwright，真实广场/工作台/SkillLibrary、真实本地HTTP/SQLite，1536×1024和1024×726。**7组界面流程通过**：真实目录、Zotero待连接详情、搜索、预填不写入、预览后取消、确认私人安装并保存32原件、第二合成账号不可见/不可读取。IPC传输/Electron窗口为夹具，实际主进程handler/importer/store执行，下载用独立核对的官方固定ZIP缓存；没有运行已安装桌面二进制或真实模型。
- 页面异常0；最终有既有Antd bodyStyle/findDOMNode弃用提示与预期拒绝跨账号source的404。新重复React key警告已修复。早期radio选择器、缺合成Electron userData导致原件提交失败、GitHub403、LibreOffice子进程路径失败、ZIP夹具字段错误及过早截图全部保留。最终截图等待浏览器有限动画和绘制帧，检查模态窗口几何；长详情的窗口内滚动另验通过。

复现客户端检查（独立客户端目录）：

```powershell
node --test tests/community-research-catalog.test.mjs
node node_modules/typescript/bin/tsc --noEmit
node scripts/build-web.mjs
node --test tests/skill-import.test.mjs
```

## 发布和后续

只交付独立草稿PR，**没有打新安装包、发布Release、安装或重启用户客户端、部署静态站/API/worker、执行迁移**。线上仍aee02447、Windows0.10.0/schema022，公开更新源仍0.6.0。PR35技能授权和PR36附件恢复为兄弟分支，本分支未包含其实现，合并时协调SkillLibrary等共享文件。

技能库任务接手执行依赖与实际输入/交付评估；Zotero先适配明确库范围的只读本机工具，验证失败/空结果、全文截断和Windows条件后再提升可用状态。外部更新需重新核对哈希、模块许可和验证证据，不自动把新HEAD替换为已验证内容。
