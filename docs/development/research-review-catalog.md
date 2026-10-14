# 科研证据审查与文献问答来源收录（2026-10-14）

`acceptcat-3` 承接社区目录与版本解析批次，分支 `feature/research-review-catalog`，基于 PR39 / `20006078c47eda61d55c95507e72fc0c1d446e9e`。生产改动 **48b55aa34e42e70c69b14248d33a97d3f211f671**，[草稿 PR40](https://github.com/luoyan96/personal-agent/pull/40)，目标 base 为 `fix/skill-release-metadata`。只增加客户端目录元数据和现有回归断言，无 API、worker、共享契约、数据库、依赖或内置 Skill 改动。

## 收录结果与材料要求

| 来源 | 固定版本、许可、维护证据 | 范围、接入与费用 |
| --- | --- | --- |
| [研究主张与证据审查](https://github.com/K-Dense-AI/claude-scientific-writer/tree/529b9f73ab4b48925027145800d7b49e96ccfd3c/skills/peer-review) | K-Dense Inc.；`529b9f73ab4b48925027145800d7b49e96ccfd3c`，Skill metadata.version 2.2 / Writer 2.22.0。根许可及 Skill 为 MIT。仓库未归档、push 2026-10-09；本次沿用已核对的固定归档，不改成浮动 main。 | 课题组投稿前自查、公开/授权稿件与研究方案、审稿回复。需主张—证据 CSV、来源清单、图表位置、期刊要求；不自动读取整个资料库。8 脚本需 Python 3.11+ 标准库，无网络/模型调用；AcceptCat **文字流程可确认私人安装，脚本自动执行待接入**。文字聊天使用已配置模型、按其服务计费；保密材料要核对期刊工具政策与授权。 |
| [PaperQA2 文献证据问答](https://github.com/Future-House/paper-qa/tree/57e89f7223b0960d5ee5ea048c69e3c47e088572) | FutureHouse；`57e89f7223b0960d5ee5ea048c69e3c47e088572`，源码快照，发行版本由 setuptools_scm 动态生成，没有臆造安装版本号。Apache-2.0。未归档；固定 HEAD 提交 2026-08-12，仓库 push 2026-10-13，二者分别记录。 | 对明确授权的 PDF/文本集合做证据检索问答。需 Python 3.11+、fhlmi/fhaviary、嵌入、Tantivy、PDF 解析；本地嵌入需 sentence-transformers。云模型/嵌入按供应商计费，本地需算力；元数据 API 有网络/服务限制。**仅待适配来源，不是可直接导入的 SKILL.md，没有安装/调用入口**。 |

两项使用现有广场“社区科研工具”目录、分类与搜索。详情展示输入、交付、素材/知识库、依赖、费用、作者、许可、固定提交、实际验证与限制。不会生成虚构联系人、完成数或质量分数。已有 scientific-writing / Zotero 条目保留，社区目录共四项。

没有把上游 Skill 正文、参考文档、模板、脚本或依赖复制进 Git；`agents/skills` 仍是内置内容唯一来源。Skill 安装继续走既有预填 → 用户检查 → 选择固定子目录 → 预览 → 确认私人安装；默认未公开、未绑定、无他人调用/源码授权。将文字流程绑定 Agent 或用模型讨论是另一个操作，安装不会运行脚本或取得私人资料权限。团队/公共能力的既有授权规则保持。

## 实际源码审阅与候选选择

- 官方固定 raw 共 **31 文件**：Writer peer-review 24 文件与根 MIT LICENSE，PaperQA README / LICENSE / pyproject / settings / readers / search 六文件。下载每项匹配固定树的 Git blob SHA，保留 URL、字节数、SHA256 证据；没有执行外部内容中的引用要求或其他指令。
- peer-review 包为 **25 原件：SKILL.md、8 Python 文件、6 references、9 assets、1 根许可**。重用已核对的固定官方 Writer ZIP，**9,893,431 字节**，SHA256 `71ac931d618219cc1df8764483d3787925da9887f9f2edbdd6210d3661eb5859`。实际当前 importer/store 选择目录，新版本 2.2，25 文件与独立 raw 逐项匹配，完整 ZIP/原件私人存储往返一致；未运行安装包脚本。
- 也核对 K-Dense-AI/scientific-agent-skills 主仓库 `a1043ef544e3a100c28e70a736b6cf32554d0677`、MIT、未归档、push 2026-10-12。其完整树 2,780 blob 合计 **290,688,050 字节**，超出现有安装器完整归档 100 MiB 元数据限制；没有提高限制或整包下载/收录为可装来源。本轮选较小 Writer 的固定 peer-review，不能冒充较大仓库更新的 2.4 版本。
- PaperQA 官方文档的 RAG 用途/依赖与原问题讨论核对：[失败文件被跳过 #1355](https://github.com/Future-House/paper-qa/issues/1355)、[索引反序列化 #1325](https://github.com/Future-House/paper-qa/issues/1325)、[本地模型索引问题 #1321](https://github.com/Future-House/paper-qa/issues/1321)。固定 search.py 仍实际包含 `pickle.loads` 和默认 `PICKLE_COMPRESSED`，这项由源码确认；其他 issue 只是上游实用线索，本机未复现，不声称已修复。没有运行 issue 中的 PoC、下载预建索引、安装依赖或调用模型。

## 实际检查及边界

Git 外证据：`D:/deepseek-agent/.runtime/research-catalog-20261014`。Python 3.12.14；客户端 Node / pnpm 使用项目既有环境。

1. `node --test tests/community-research-catalog.test.mjs` **6 项通过**，包括固定源、归档/符号链接/目录边界、未知条目、搜索、待连接不安装和 IPC 窗口约束。`pnpm run typecheck`、`pnpm run build` **通过**，Vite renderer 与 Electron 编译成功；既有 use-client、wasm script、chunk/terser 提示保留。没有做新安装二进制。
2. 完整扫描所选 8 Python 文件的 AST、导入和调用后，只用公开上游模板/合成内容执行 **14 个离线案例**：记录证据缺口、正常结构/不回显正文、无证据主张、重复编号、RCT 报告规范、正常引用/缺失引用、可行动意见、英文语气/身份错误、中文词表缺口、默认 intake 阻断、合成 intake 通过、生成分离草稿和待填草稿阻断。查看 JSON/退出码；合法结构不代表证据真实。PaperQA 仅 TOML/AST 静态解析，无检索输出质量验收。
3. 首次合成引用写错为 ref-syn-001，被真实脚本正确拒绝；修正为模板中的 ref-synthetic-2026，失败报告保留 `first-citation-fixture-failure.json`。首次 Python 读取生成 UTF-8 文本因 Windows 默认 GBK 报错，改为显式 UTF-8 后通过；没有改上游脚本。
4. **中文语气反例没有被英文词表识别**，作为已确认限制记录，不能标成中文审查质量通过。草稿生成仍有占位符，被 lint 正确拒绝；没有把生成草稿当成完成审稿。
5. Browser plugin not available；已安装 Edge / 隔离 headless Playwright，真实 React CapabilitySquare / DesktopWorkbench / SkillLibrary + 本地真实 HTTP/SQLite + 实际原生 handler/importer/store，**7 组流程通过**：四目录项、PaperQA 无安装/调用、关键词筛选、预填零 I/O/零安装、预览后取消、确认私人安装保留原件与版本、第二账号不可见/不可读取。原生传输/窗口身份和固定网络缓存为夹具；不是已安装桌面、用户账号或供应商模型验收。没有使用私人稿件/文献库。
6. 1536×1024 / 1024×726，pageerror **0**、无框架 overlay/水平溢出。控制台有既有 Antd bodyStyle/findDOMNode 弃用警告和预期跨账号 source 404。首拍详情停在弹窗动画初态，不能作详情视觉证明；保存原图，等待 CSS 动画结束后重拍并查看 `peer-review-detail-1024-settled.png` / `paperqa-pending-settled.png`，确认弹窗在视口内、长正文可滚动，标题/关闭入口可达。目录图 `catalog-desktop.png`，首轮七组记录 `qa-passed-1791943062491.json`。

未改共享代码/内置 Skill，按 AGENTS 没有重复本地根 CI。续接 PR39 的远端检查：`38319126589` / HEAD `2000607`，首轮 Windows 有 5 个既有 5/30 秒超时（644/649）；请求重跑失败节点后 Windows24 job `115635935129` 成功，两 Ubuntu22.19/24 保留通过，矩阵最终全通过。失败日志 `pr39-windows-failed.log`；没有改共享时限或测试夹具。本 PR 的 CI 单独跟踪，前一批结果不替代本批结果。

## 发布状态与接续分工

目录已在代码和隔离界面实际收录；尚未进入用户现装桌面或线上静态资源。没有安装包、Release、部署、迁移或用户客户端重启。沿用记录中的 **2026-10-10 aee02447 / Windows0.10.0 / schema022，公开更新源此前核对0.6.0**，本轮没有重验线上。

本批只含两项来源；PR35/36 仍为未包含的兄弟分支。后续合并协调 catalog/SkillLibrary 和状态文档，防止覆盖版本解析、Zotero 或附件恢复改进。

- 技能库任务：先做显式输入/交付/资源边界的本地脚本执行适配和中文样例评估，独立于文字说明安装；在有真实科研反馈前不升级质量标签。
- 前后端任务：PaperQA 接入需从获准原件重建安全格式索引，保留文献页码/片段来源；处理集合撤权、账号隔离、失败重试与预算，再用公开/合成中文论文验证。社区预建 pickle 索引不作为资料输入。
- 广场任务：继续少量高价值固定来源和实际样例，不重复收录这四项，也不因来源活跃或下载成功把条目升级为自主工具。
